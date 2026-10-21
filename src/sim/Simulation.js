// Simulation économique : routes, main-d'œuvre, production, habitants, bonheur, impôts.
import {
  BUILDINGS, workersAt, residentsAt, radiusAt, upkeepAt, sizeOf, prodMult, INCOME_MULT,
} from '../data/buildings.js';
import {
  DAY_SECONDS, WORK_RATIO, FOOD_PER_RESIDENT, SIZE, N, BASE_STORAGE, TOWNHALL_STORAGE,
} from '../world/constants.js';
import { GOODS } from '../data/resources.js';
import { clamp, calendar } from '../core/util.js';

const STEP = 0.25; // pas de simulation (secondes de jeu)
const SEASON_FACTORS = {
  farm: [1, 1.3, 0.9, 0.25],
  garden: [1, 1.2, 0.9, 0.4],
  fish: [1, 1.1, 1, 0.7],
};
export const COVER_KEYS = ['water', 'commerce', 'leisure', 'education', 'health', 'security', 'fire'];
const HOUSE_NEEDS = ['water', 'commerce', 'leisure', 'education', 'health', 'security'];

// Priorité d'embauche : la nourriture d'abord, puis la production, les commerces, les services.
export const TIER_NAMES = ['Nourriture', 'Production', 'Commerces', 'Services'];
export function workTier(def) {
  if (def.produces && (def.produces.food || def.produces.wheat || def.produces.flour)) return 0;
  if (def.produces || def.storage) return 1;
  if (def.cat === 'commerce' || def.income || def.bonus) return 2;
  return 3;
}

export const STATUS_TEXT = {
  ok: 'En activité',
  noRoad: 'Pas relié à la mairie par une route',
  noResource: 'Ressource naturelle absente autour',
  noWorkers: 'Manque de main-d\'œuvre',
  noInput: 'En attente de matières premières',
  full: 'Stock plein : construis un entrepôt',
  fire: 'En feu !',
  unpaid: 'Caisses vides : service à l\'arrêt',
  empty: 'Personne n\'habite ici pour l\'instant',
};

export class Simulation {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.acc = 0;
    this.recalcAcc = 99;
    this.dirty = true;
    this.info = new Map();
    this.cov = {};
    for (const k of COVER_KEYS) this.cov[k] = new Float32Array(N);
    this.beauty = new Float32Array(N);
    this.pollution = new Float32Array(N);
    this.roadConn = new Uint8Array(N);
    this.netVersion = -1;
    this.foodShort = 0;
    this.lastDayInt = null;
    this.lastSeason = null;
    this.brokeFlag = false;
    this.d = {
      population: 0, capacity: 0, workforce: 0, jobs: 0, staffing: 1, unemployment: 0,
      happiness: 0.5, storage: BASE_STORAGE, starving: false, broke: false, staffTier: [1, 1, 1, 1], jobsTier: [0, 0, 0, 0],
      income: { taxes: 0, commerce: 0, tourism: 0, total: 0 }, upkeep: 0,
      rates: {}, bonus: { taxes: 0, happiness: 0, tourism: 0, fishers: 0 },
      fullGoods: [],
    };
  }

  markDirty() {
    this.dirty = true;
  }

  get state() {
    return this.game.state;
  }

  /** Avance la simulation selon le temps réel écoulé (et la vitesse choisie). */
  update(realDt) {
    const st = this.state;
    if (!st) return;
    const speed = st.time.speed;
    if (!speed) {
      if (this.dirty) {
        this.recalc();
        this.dirty = false;
      }
      return;
    }
    this.acc += realDt * speed;
    let steps = 0;
    while (this.acc >= STEP && steps < 48) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 48) this.acc = 0;
  }

  /** Avance d'un nombre de secondes de jeu (utile pour les tests). */
  advance(gameSeconds) {
    let t = gameSeconds;
    while (t > 0) {
      const dt = Math.min(STEP, t);
      this.step(dt);
      t -= dt;
    }
  }

  step(dt) {
    const st = this.state;
    const days = dt / DAY_SECONDS;
    st.time.day += days;
    st.playTime = (st.playTime || 0) + dt;
    const di = Math.floor(st.time.day);
    if (this.lastDayInt === null) this.lastDayInt = di;
    if (di !== this.lastDayInt) {
      this.lastDayInt = di;
      this.onNewDay(di);
    }
    this.recalcAcc += dt;
    if (this.dirty || this.recalcAcc >= 1) {
      this.recalc();
      this.recalcAcc = 0;
      this.dirty = false;
    }
    this.produce(days);
    this.consume(days);
    this.populate(days);
    this.money(days);
    this.game.events.tick(days);
    this.game.prog.tick(days);
  }

  onNewDay(day) {
    const cal = calendar(day);
    if (this.lastSeason !== null && cal.season !== this.lastSeason) this.game.bus.emit('season:changed', cal.season);
    this.lastSeason = cal.season;
    this.game.events.onNewDay(day);
    this.game.bus.emit('day:new', day);
  }

  infoFor(b) {
    let inf = this.info.get(b.id);
    if (!inf) {
      inf = {
        status: 'ok', eff: 0, connected: false, paved: false, nearCount: 0, nearFactor: 1, nearKey: '',
        happiness: 0.5, needs: {}, allNeeds: false, beauty: 0, pollution: 0, inFrac: 1, full: false,
        income: 0, residentsNear: 0,
      };
      this.info.set(b.id, inf);
    }
    return inf;
  }

  /* ───────── Réseau routier ───────── */
  computeConnectivity() {
    const world = this.game.world;
    const conn = this.roadConn;
    conn.fill(0);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    const th = world.townhall();
    if (th) {
      for (const i of world.perimeter(th)) {
        if (world.road[i] && !conn[i]) {
          conn[i] = 1;
          queue[qt++] = i;
        }
      }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % SIZE, z = (i / SIZE) | 0;
      if (x > 0) visit(i - 1);
      if (x < SIZE - 1) visit(i + 1);
      if (z > 0) visit(i - SIZE);
      if (z < SIZE - 1) visit(i + SIZE);
    }
    function visit(j) {
      if (world.road[j] && !conn[j]) {
        conn[j] = 1;
        queue[qt++] = j;
      }
    }
    // Bâtiments reliés ?
    for (const id of [...this.info.keys()]) if (!world.buildings.has(id)) this.info.delete(id);
    for (const b of world.buildings.values()) {
      const inf = this.infoFor(b);
      if (b.type === 'townhall') {
        inf.connected = true;
        inf.paved = true;
        continue;
      }
      let c = false, p = false;
      for (const i of world.perimeter(b)) {
        if (conn[i]) {
          c = true;
          if (world.road[i] === 2) p = true;
        }
      }
      inf.connected = c;
      inf.paved = p;
    }
  }

  isRoadConnected(i) {
    return !!this.roadConn[i];
  }

  /* ───────── Cartes de couverture ───────── */
  stamp(arr, cx, cz, r, v, falloff) {
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(SIZE - 1, Math.ceil(cx + r + 1));
    const z0 = Math.max(0, Math.floor(cz - r - 1)), z1 = Math.min(SIZE - 1, Math.ceil(cz + r + 1));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > r + 0.01) continue;
        const i = z * SIZE + x;
        if (falloff) arr[i] += v * (1 - dist / (r + 1));
        else if (v > arr[i]) arr[i] = v;
      }
    }
  }

  computeMaps() {
    const world = this.game.world;
    const d = this.d;
    for (const k of COVER_KEYS) this.cov[k].fill(0);
    this.beauty.fill(0);
    this.pollution.fill(0);
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.coverage && !def.beauty && !def.pollution) continue;
      const inf = this.infoFor(b);
      const [w, dd] = sizeOf(def, b.rot);
      const cx = b.x + w / 2, cz = b.z + dd / 2;
      const active = inf.connected && !b.fire;
      if (def.coverage && active && !(def.upkeep && d.broke) && (!def.workers || d.staffTier[workTier(def)] >= 0.25)) {
        this.stamp(this.cov[def.coverage.need], cx, cz, radiusAt(def, b.level), 1, false);
      }
      if (def.beauty) this.stamp(this.beauty, cx, cz, def.beauty.r, def.beauty.v, true);
      if (def.pollution && active) this.stamp(this.pollution, cx, cz, def.pollution.r, def.pollution.v, true);
    }
  }

  nearCount(b, def) {
    const world = this.game.world;
    const inf = this.infoFor(b);
    const key = `${world.terrainVersion}:${b.x},${b.z},${b.rot}`;
    if (inf.nearKey !== key) {
      const [w, d] = sizeOf(def, b.rot);
      inf.nearCount = world.countTerrainAround(b.x, b.z, w, d, def.near.types, def.near.radius);
      inf.nearKey = key;
    }
    return inf.nearCount;
  }

  residentsNear(b, radius) {
    const world = this.game.world;
    const c = world.centerOf(b);
    let sum = 0;
    for (const h of world.buildings.values()) {
      if (h.residents == null || !h.residents) continue;
      const hc = world.centerOf(h);
      const dx = hc.cx - c.cx, dz = hc.cz - c.cz;
      if (dx * dx + dz * dz <= radius * radius) sum += h.residents;
    }
    return sum;
  }

  /* ───────── Recalcul complet (toutes les secondes ou après un changement) ───────── */
  recalc() {
    const game = this.game, world = game.world, st = this.state, d = this.d;
    if (!world) return;
    const libre = st.mode === 'libre';
    if (this.netVersion !== world.version) {
      this.computeConnectivity();
      this.netVersion = world.version;
    }

    let pop = 0, cap = 0, jobs = 0, upkeep = 0, storage = BASE_STORAGE;
    const jobsTier = [0, 0, 0, 0];
    const bonus = { taxes: 0, happiness: 0, tourism: 0, fishers: 0 };
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      const inf = this.infoFor(b);
      if (def.residents) {
        pop += b.residents || 0;
        cap += residentsAt(def, b.level);
      }
      if (def.workers && inf.connected && !b.fire) {
        const wk = workersAt(def, b.level);
        jobs += wk;
        jobsTier[workTier(def)] += wk;
      }
      if (def.upkeep) upkeep += upkeepAt(def, b.level);
      if (b.type === 'townhall') storage += TOWNHALL_STORAGE * b.level;
      if (def.storage && inf.connected) storage += def.storage[b.level - 1];
      if (def.bonus && inf.connected && !b.fire) for (const k in def.bonus) bonus[k] += def.bonus[k];
    }
    d.population = pop;
    d.capacity = cap;
    d.jobs = jobs;
    d.upkeep = upkeep;
    d.storage = libre ? Infinity : storage;
    d.workforce = Math.floor(pop * WORK_RATIO);
    d.staffing = jobs > 0 ? Math.min(1, d.workforce / jobs) : 1;
    d.unemployment = d.workforce > 0 ? Math.max(0, (d.workforce - jobs) / d.workforce) : 0;
    // embauche par priorité
    let remaining = d.workforce;
    for (let t = 0; t < 4; t++) {
      d.staffTier[t] = jobsTier[t] > 0 ? Math.min(1, remaining / jobsTier[t]) : 1;
      remaining = Math.max(0, remaining - jobsTier[t]);
    }
    d.jobsTier = jobsTier;
    d.bonus = bonus;
    // caisses vides (avec une marge pour éviter le clignotement)
    if (libre) this.brokeFlag = false;
    else if (!this.brokeFlag && st.res.coins <= 0.5 && upkeep > (d.income.total || 0)) this.brokeFlag = true;
    else if (this.brokeFlag && st.res.coins >= upkeep * 0.5) this.brokeFlag = false;
    d.broke = this.brokeFlag;

    this.computeMaps();

    const cal = calendar(st.time.day);
    const ev = game.events.modifiers();
    let taxes = 0, commerce = 0, hSum = 0, hW = 0, hHouses = 0, hCount = 0;
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      const inf = this.infoFor(b);
      if (def.near) {
        this.nearCount(b, def);
        inf.nearFactor = Math.min(1, inf.nearCount / def.near.sat);
      } else inf.nearFactor = 1;

      let status = 'ok';
      let eff = 0;
      if (b.fire) status = 'fire';
      else if (!inf.connected) status = 'noRoad';
      else if (def.near && inf.nearCount === 0 && def.produces) status = 'noResource';
      const staff = def.workers ? d.staffTier[workTier(def)] : 1;
      inf.staff = staff;
      if (status === 'ok') {
        // même sans ouvriers, un bâtiment tourne au ralenti (20 %)
        eff = (def.workers ? 0.2 + 0.8 * staff : 1) * inf.nearFactor;
        if (def.seasonal) eff *= SEASON_FACTORS[def.seasonal][cal.season];
        if (def.seasonal === 'farm') eff *= ev.farm;
        if (b.type === 'fisher') eff *= 1 + bonus.fishers;
        if (def.upkeep && d.broke) {
          status = 'unpaid';
          eff = 0;
        } else if (def.workers && staff < 0.5) status = 'noWorkers';
        else if (def.consumes && inf.inFrac < 0.15) status = 'noInput';
        else if (def.produces && inf.full) status = 'full';
        else if (def.residents && !(b.residents >= 0.5)) status = 'empty';
      }
      inf.eff = eff;
      inf.status = status;

      if (def.residents) {
        this.houseNeeds(b, def, inf, bonus, ev);
        hHouses += inf.happiness;
        hCount++;
        if (inf.connected && !b.fire) {
          const r = b.residents || 0;
          taxes += r * def.tax[b.level - 1] * (0.5 + inf.happiness);
          hSum += inf.happiness * r;
          hW += r;
        }
      }

      if (def.income && inf.connected && !b.fire && !(def.upkeep && d.broke)) {
        const near = def.income.radius ? this.residentsNear(b, def.income.radius) : 0;
        inf.residentsNear = near;
        inf.income = (def.income.base + def.income.perRes * Math.min(near, 500)) * INCOME_MULT[Math.min(b.level, 5) - 1] * staff;
        commerce += inf.income;
      } else inf.income = 0;
    }
    taxes *= (1 + bonus.taxes) * ev.taxes;
    d.happiness = hW > 0 ? hSum / hW : hCount > 0 ? hHouses / hCount : 0.5;
    const tourism = bonus.tourism * d.happiness;
    d.income = { taxes, commerce, tourism, total: taxes + commerce + tourism };

    this.computeRates();
    game.bus.emit('sim:recalc');
  }

  houseNeeds(b, def, inf, bonus, ev) {
    const world = this.game.world;
    const d = this.d;
    const [w, dd] = sizeOf(def, b.rot);
    const ci = world.idx(b.x + (w >> 1), b.z + (dd >> 1));
    const needs = {};
    for (const k of HOUSE_NEEDS) needs[k] = this.cov[k][ci] >= 0.5;
    needs.paved = inf.paved;
    const beauty = Math.min(0.25, this.beauty[ci]);
    const poll = Math.min(0.4, this.pollution[ci]);
    let h = 0.45;
    h += d.starving ? -0.25 : 0.1;
    if (needs.water) h += 0.07;
    else if (b.level >= 2) h -= 0.04;
    if (needs.commerce) h += 0.07;
    if (needs.leisure) h += 0.07;
    if (needs.education) h += 0.06;
    if (needs.health) h += 0.06;
    if (needs.security) h += 0.05;
    h += beauty - poll - d.unemployment * 0.15 - (d.broke ? 0.08 : 0) + bonus.happiness + ev.happiness;
    inf.happiness = clamp(h, 0, 1);
    inf.needs = needs;
    inf.beauty = beauty;
    inf.pollution = poll;
    inf.allNeeds = Object.values(needs).every(Boolean);
  }

  computeRates() {
    const world = this.game.world;
    const d = this.d;
    const rates = {};
    for (const r of GOODS) rates[r] = { prod: 0, cons: 0 };
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.produces) continue;
      const inf = this.info.get(b.id);
      if (!inf || inf.eff <= 0) continue;
      const mult = prodMult(b.level) * inf.eff;
      const f = def.consumes ? clamp(inf.inFrac * 1.05, 0, 1) : 1;
      for (const r in def.produces) rates[r].prod += def.produces[r] * mult * f;
      if (def.consumes) for (const r in def.consumes) rates[r].cons += def.consumes[r] * mult * f;
    }
    rates.food.cons += d.population * FOOD_PER_RESIDENT;
    d.rates = rates;
    const st = this.state;
    d.fullGoods = st.mode === 'libre' ? [] : GOODS.filter((r) => st.res[r] >= d.storage - 0.5);
  }

  /* ───────── Pas de simulation ───────── */
  produce(days) {
    const { world, state: st } = this.game;
    const res = st.res;
    const cap = this.d.storage;
    const libre = st.mode === 'libre';
    const stats = st.stats;
    const daily = stats.daily;
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.produces) continue;
      const inf = this.info.get(b.id);
      if (!inf) continue;
      if (inf.eff <= 0) {
        if (def.consumes) inf.inFrac = inf.inFrac * 0.98 + 0.02;
        continue;
      }
      const mult = prodMult(b.level) * inf.eff;
      let frac = 1;
      if (def.consumes) {
        for (const r in def.consumes) {
          const need = def.consumes[r] * mult * days;
          if (need > 0) frac = Math.min(frac, res[r] / need);
        }
        frac = clamp(frac, 0, 1);
        inf.inFrac = inf.inFrac * 0.95 + frac * 0.05;
      }
      if (frac <= 0) continue;
      let room = false;
      for (const r in def.produces) if (libre || res[r] < cap) room = true;
      inf.full = !room;
      if (!room) continue;
      if (def.consumes) for (const r in def.consumes) res[r] = Math.max(0, res[r] - def.consumes[r] * mult * days * frac);
      for (const r in def.produces) {
        const add = def.produces[r] * mult * days * frac;
        const before = res[r];
        res[r] = libre ? res[r] + add : Math.min(cap, res[r] + add);
        const gained = Math.max(0, res[r] - before);
        stats.produced[r] = (stats.produced[r] || 0) + gained;
        if (daily) daily.produced[r] = (daily.produced[r] || 0) + gained;
      }
    }
  }

  consume(days) {
    const st = this.state;
    if (st.mode === 'libre') {
      this.foodShort = 0;
      this.d.starving = false;
      return;
    }
    const need = this.d.population * FOOD_PER_RESIDENT * days;
    if (this.d.population < 1) {
      this.foodShort = 0;
      this.d.starving = false;
      return;
    }
    if (st.res.food >= need) {
      st.res.food -= need;
      if (this.foodShort > 0) this.foodShort = Math.max(0, this.foodShort - days);
    } else {
      st.res.food = 0;
      this.foodShort = 0.2;
    }
    const was = this.d.starving;
    this.d.starving = this.foodShort > 0;
    if (this.d.starving && !was) this.game.bus.emit('alert:famine');
  }

  populate(days) {
    const world = this.game.world;
    const d = this.d;
    let pop = 0;
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.residents) continue;
      if (b.residents == null) b.residents = 0;
      const inf = this.info.get(b.id);
      const cap = residentsAt(def, b.level);
      const h = inf ? inf.happiness : 0.5;
      if (!inf || !inf.connected || b.fire) {
        b.residents = Math.max(0, b.residents - Math.max(1, cap * 0.5) * days);
      } else if (d.starving || h < 0.3) {
        b.residents = Math.max(0, b.residents - Math.max(0.6, cap * 0.6) * days);
      } else if (h >= 0.4 && b.residents < cap && (!def.needsToGrow || inf.allNeeds)) {
        const rate = (4 + cap * 3) * clamp((h - 0.35) * 2.5, 0.2, 1.5);
        b.residents = Math.min(cap, b.residents + rate * days);
      }
      if (b.residents > cap) b.residents = cap;
      pop += b.residents;
    }
    d.population = pop;
    const st = this.state;
    const popInt = Math.floor(pop);
    if (popInt > st.stats.popRecord) {
      const gain = popInt - st.stats.popRecord;
      st.stats.popRecord = popInt;
      this.game.prog.addXP(gain, 'pop');
    }
  }

  money(days) {
    const st = this.state;
    if (st.mode === 'libre') return;
    const d = this.d;
    const inc = d.income.total * days;
    const up = d.broke ? 0 : d.upkeep * days;
    st.res.coins = Math.max(0, st.res.coins + inc - up);
    if (inc > 0) {
      st.stats.coinsEarned += inc;
      if (st.stats.daily) st.stats.daily.coins = (st.stats.daily.coins || 0) + inc;
    }
  }
}
