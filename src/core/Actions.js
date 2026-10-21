// Actions du joueur : construire, tracer des routes, améliorer, détruire, déplacer, annuler.
import {
  BUILDINGS, ROAD_TYPES, sizeOf, costToLevel, totalInvested, buildXP, upgradeXP, levelName,
} from '../data/buildings.js';
import { MAIRIE_FOR_LEVEL, RANKS } from '../data/progression.js';
import { RESOURCES } from '../data/resources.js';
import { T } from '../world/constants.js';
import { addCosts, scaleCost } from './util.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

const NEAR_LABELS = {
  'forêt': 'de la forêt',
  'rochers ou montagne': 'des rochers ou une montagne',
  'eau': 'de l\'eau',
  'eau ou sable': 'de l\'eau ou du sable',
  'montagne': 'une montagne',
};
export function nearLabel(label) {
  return NEAR_LABELS[label] || label;
}

export class Actions {
  constructor(game) {
    this.game = game;
    this.undoStack = [];
  }

  reset() {
    this.undoStack = [];
  }

  get st() {
    return this.game.state;
  }
  get world() {
    return this.game.world;
  }
  get libre() {
    return this.st.mode === 'libre';
  }

  /* ───────── Ressources ───────── */
  canAfford(cost) {
    if (this.libre) return true;
    const res = this.st.res;
    for (const k in cost) if ((res[k] || 0) < cost[k] - 1e-6) return false;
    return true;
  }

  missing(cost) {
    const out = [];
    if (this.libre) return out;
    for (const k in cost) {
      const have = this.st.res[k] || 0;
      if (have < cost[k] - 1e-6) out.push({ res: k, need: cost[k], have });
    }
    return out;
  }

  missingText(cost) {
    const m = this.missing(cost);
    if (!m.length) return '';
    return 'Il manque ' + m.map((x) => `${Math.ceil(x.need - x.have)} ${RESOURCES[x.res].icon}`).join(' ');
  }

  pay(cost) {
    if (this.libre) return;
    const res = this.st.res;
    for (const k in cost) res[k] = Math.max(0, (res[k] || 0) - cost[k]);
  }

  grant(cost) {
    if (this.libre) return;
    const res = this.st.res;
    for (const k in cost) {
      if (!(k in RESOURCES)) continue;
      res[k] = (res[k] || 0) + cost[k];
    }
  }

  pushUndo(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 25) this.undoStack.shift();
    this.game.bus.emit('undo:changed', this.undoStack.length);
  }

  /* ───────── Placement des bâtiments ───────── */
  autoRotation(type, x, z) {
    const def = BUILDINGS[type];
    const world = this.world;
    const scores = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      const [w, d] = sizeOf(def, r);
      const tiles = [];
      if (r === 0) for (let dx = 0; dx < w; dx++) tiles.push([x + dx, z + d]);
      if (r === 1) for (let dz = 0; dz < d; dz++) tiles.push([x + w, z + dz]);
      if (r === 2) for (let dx = 0; dx < w; dx++) tiles.push([x + dx, z - 1]);
      if (r === 3) for (let dz = 0; dz < d; dz++) tiles.push([x - 1, z + dz]);
      for (const [tx, tz] of tiles) if (world.inside(tx, tz) && world.road[world.idx(tx, tz)]) scores[r]++;
    }
    let best = 0;
    for (let r = 1; r < 4; r++) if (scores[r] > scores[best]) best = r;
    return best;
  }

  checkPlacement(type, x, z, rot, ignoreId = -1) {
    const def = BUILDINGS[type];
    const world = this.world;
    const prog = this.game.prog;
    if (!def || def.notBuildable) return fail('Impossible à construire');
    if (!prog.isUnlocked(type)) return fail(`Se débloque au niveau ${def.unlock}`);
    if (def.unique && ignoreId < 0 && prog.countType(type) > 0) return fail('Un seul exemplaire possible');
    if (def.plantsTerrain) {
      if (!world.inside(x, z)) return fail('Hors de la carte');
      if (!world.zoneUnlocked(x, z)) return fail('Zone verrouillée 🔒');
      const i = world.idx(x, z);
      if (world.occ[i] >= 0 || world.road[i]) return fail('Emplacement déjà occupé');
      const t = world.terrain[i];
      if (t === T.FOREST) return fail('C\'est déjà une forêt');
      if (t !== T.GRASS && t !== T.SAND) return fail('Il faut une case de prairie');
      const cost = def.costs[0];
      if (!this.canAfford(cost)) return fail(this.missingText(cost), { cost });
      return { ok: true, cost, clear: [], gain: {}, w: 1, d: 1, plant: true };
    }
    const [w, d] = sizeOf(def, rot);
    const clear = [];
    const extra = {};
    const gain = {};
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx, tz = z + dz;
        if (!world.inside(tx, tz)) return fail('Hors de la carte');
        if (!world.zoneUnlocked(tx, tz)) return fail('Zone verrouillée 🔒');
        const i = world.idx(tx, tz);
        const t = world.terrain[i];
        if (t === T.WATER || t === T.DEEP) return fail('Impossible de construire sur l\'eau');
        if (t === T.MOUNTAIN) return fail('Impossible de construire sur la montagne');
        const occ = world.occ[i];
        if (occ >= 0 && occ !== ignoreId) return fail('Emplacement déjà occupé');
        if (world.road[i]) return fail('Il y a une route ici');
        if (t === T.FOREST) {
          clear.push({ i, t });
          extra.coins = (extra.coins || 0) + 5;
          gain.wood = (gain.wood || 0) + 4;
        } else if (t === T.ROCK) {
          clear.push({ i, t });
          extra.coins = (extra.coins || 0) + 10;
          gain.stone = (gain.stone || 0) + 3;
        }
      }
    }
    if (def.near) {
      // les cases de l'emprise (défrichées) ne comptent pas
      const count = world.countTerrainAround(x, z, w, d, def.near.types, def.near.radius);
      if (count === 0) return fail(`Il faut ${nearLabel(def.near.label)} à proximité`);
    }
    const cost = ignoreId >= 0 ? extra : addCosts(def.costs[0], extra);
    if (!this.canAfford(cost)) return fail(this.missingText(cost) || 'Pas assez de ressources', { cost });
    return { ok: true, cost, clear, gain, w, d };
  }

  placeBuilding(type, x, z, rot) {
    const chk = this.checkPlacement(type, x, z, rot);
    if (!chk.ok) return chk;
    const def = BUILDINGS[type];
    const st = this.st;
    const world = this.world;
    if (chk.plant) {
      const i = world.idx(x, z);
      const prev = world.terrain[i];
      this.pay(chk.cost);
      world.setTerrain(i, T.FOREST);
      if (st.stats.daily) st.stats.daily.decor++;
      this.pushUndo({ kind: 'plant', i, prev, cost: chk.cost });
      this.game.sim.markDirty();
      this.game.bus.emit('terrain:changed', [i]);
      this.game.bus.emit('forest:planted', i);
      return { ok: true, planted: true };
    }
    this.pay(chk.cost);
    for (const c of chk.clear) world.setTerrain(c.i, T.GRASS);
    this.grant(chk.gain);
    const b = { id: st.nextId++, type, x, z, rot, level: 1, born: st.time.day };
    if (def.residents) b.residents = 0;
    world.addBuilding(b);
    const stats = st.stats;
    stats.totalBuilt++;
    stats.built[type] = (stats.built[type] || 0) + 1;
    if (stats.daily) {
      stats.daily.built++;
      if (def.cat === 'decor') stats.daily.decor++;
    }
    if (def.cat === 'monuments') stats.monuments++;
    const xp = buildXP(def);
    this.game.prog.addXP(xp, 'build');
    this.pushUndo({ kind: 'place', id: b.id, cost: chk.cost, gain: chk.gain, clear: chk.clear, xp });
    this.game.prog.recount();
    this.game.sim.markDirty();
    if (chk.clear.length) this.game.bus.emit('terrain:changed', chk.clear.map((c) => c.i));
    this.game.bus.emit('building:placed', b);
    return { ok: true, building: b };
  }

  /* ───────── Routes ───────── */
  checkRoadTile(i, roadType) {
    const world = this.world;
    const x = world.xOf(i), z = world.zOf(i);
    if (!world.inside(x, z)) return fail('Hors de la carte');
    if (!world.zoneUnlocked(x, z)) return fail('Zone verrouillée 🔒');
    if (world.occ[i] >= 0) return fail('Un bâtiment est sur le passage');
    const cur = world.road[i];
    if (cur === roadType || (cur === 2 && roadType === 1)) return { ok: true, skip: true, cost: {} };
    const t = world.terrain[i];
    const def = ROAD_TYPES[roadType];
    if (t === T.MOUNTAIN) return fail('Impossible sur la montagne');
    if (t === T.DEEP) return fail('Trop profond pour un pont');
    if (t === T.WATER) {
      if (!this.game.prog.bridgeUnlocked()) return fail('Les ponts se débloquent au niveau 8');
      return { ok: true, cost: { ...def.bridgeCost }, bridge: true };
    }
    if (cur === 1 && roadType === 2) return { ok: true, cost: { ...def.upgradeCost }, upgrade: true };
    const cost = { ...def.cost };
    let clearT = null;
    const gain = {};
    if (t === T.FOREST) {
      cost.coins = (cost.coins || 0) + 5;
      gain.wood = 4;
      clearT = t;
    } else if (t === T.ROCK) {
      cost.coins = (cost.coins || 0) + 10;
      gain.stone = 3;
      clearT = t;
    }
    return { ok: true, cost, clearT, gain };
  }

  /** Analyse un tracé : coût total et validité de chaque case. */
  previewRoads(tiles, roadType) {
    let total = {};
    const out = [];
    let firstError = '';
    for (const i of tiles) {
      const c = this.checkRoadTile(i, roadType);
      if (!c.ok && !firstError) firstError = c.reason;
      if (c.ok && !c.skip) total = addCosts(total, c.cost);
      out.push({ i, ok: c.ok, skip: !!c.skip });
    }
    return { tiles: out, cost: total, affordable: this.canAfford(total), error: firstError };
  }

  placeRoads(tiles, roadType) {
    if (!this.game.prog.roadUnlocked(roadType)) return fail(`Se débloque au niveau ${ROAD_TYPES[roadType].unlock}`);
    const world = this.world;
    const placed = [];
    let total = {};
    let gainTotal = {};
    let firstError = '';
    let poor = false;
    for (const i of tiles) {
      const c = this.checkRoadTile(i, roadType);
      if (!c.ok) {
        if (!firstError) firstError = c.reason;
        continue;
      }
      if (c.skip) continue;
      if (!this.canAfford(addCosts(total, c.cost))) {
        poor = true;
        break;
      }
      total = addCosts(total, c.cost);
      if (c.gain) gainTotal = addCosts(gainTotal, c.gain);
      placed.push({ i, prev: world.road[i], prevT: world.terrain[i], clear: c.clearT != null });
    }
    if (!placed.length) return fail(poor ? this.missingText(this.checkRoadTile(tiles[0], roadType).cost || {}) || 'Pas assez de ressources' : firstError || 'Rien à construire ici');
    this.pay(total);
    this.grant(gainTotal);
    const changedTerrain = [];
    for (const p of placed) {
      if (p.clear) {
        world.setTerrain(p.i, T.GRASS);
        changedTerrain.push(p.i);
      }
      world.setRoad(p.i, roadType);
    }
    const st = this.st;
    st.stats.roadsBuilt += placed.length;
    if (st.stats.daily) st.stats.daily.roads += placed.length;
    this.pushUndo({ kind: 'roads', tiles: placed, cost: total, gain: gainTotal, type: roadType });
    this.game.sim.markDirty();
    if (changedTerrain.length) this.game.bus.emit('terrain:changed', changedTerrain);
    this.game.bus.emit('roads:changed', placed.map((p) => p.i));
    return { ok: true, count: placed.length, cost: total, partial: poor || !!firstError, reason: poor ? 'Pas assez de ressources pour tout le tracé' : firstError };
  }

  demolishRoads(tiles) {
    const world = this.world;
    const removed = [];
    let refund = {};
    for (const i of tiles) {
      const type = world.road[i];
      if (!type) continue;
      const def = ROAD_TYPES[type];
      const isBridge = world.terrain[i] === T.WATER;
      const c = scaleCost(isBridge ? def.bridgeCost : def.cost, 0.5);
      refund = addCosts(refund, c);
      removed.push({ i, prev: type });
      world.setRoad(i, 0);
    }
    if (!removed.length) return fail('Aucune route ici');
    this.grant(refund);
    this.pushUndo({ kind: 'unroads', tiles: removed, refund });
    this.game.sim.markDirty();
    this.game.bus.emit('roads:changed', removed.map((r) => r.i));
    return { ok: true, count: removed.length };
  }

  /* ───────── Démolition ───────── */
  refundFor(b) {
    return scaleCost(totalInvested(BUILDINGS[b.type], b.level), 0.5);
  }

  demolish(id) {
    const world = this.world;
    const b = world.buildings.get(id);
    if (!b) return fail('Introuvable');
    if (b.type === 'townhall') return fail('On ne peut pas détruire la mairie');
    const refund = b.fire ? {} : this.refundFor(b);
    const snapshot = { ...b };
    world.removeBuilding(id);
    this.grant(refund);
    this.pushUndo({ kind: 'demolish', b: snapshot, refund });
    this.game.prog.recount();
    this.game.sim.markDirty();
    if (this.game.selection === id) this.game.select(null);
    this.game.bus.emit('building:removed', b, { demolished: true });
    return { ok: true, refund };
  }

  /* ───────── Amélioration ───────── */
  checkUpgrade(b) {
    const def = BUILDINGS[b.type];
    const prog = this.game.prog;
    const sim = this.game.sim;
    const out = { ok: false, reasons: [], reqs: [], cost: null, toLevel: b.level + 1, max: false };
    if (b.level >= def.maxLevel) {
      out.max = true;
      out.reasons.push('Niveau maximum atteint');
      return out;
    }
    const to = b.level + 1;
    out.cost = costToLevel(def, to);
    out.name = levelName(def, to);
    if (b.fire) out.reasons.push('Le bâtiment est en feu');
    if (b.type === 'townhall') {
      const rank = RANKS[to - 1];
      const okL = this.libre || this.st.level >= rank.level;
      const okP = this.libre || sim.d.population >= rank.pop;
      out.reqs.push({ label: `Niveau du village ${rank.level}`, ok: okL });
      out.reqs.push({ label: `${rank.pop} habitants`, ok: okP });
      if (!okL) out.reasons.push(`Niveau ${rank.level} requis`);
      if (!okP) out.reasons.push(`${rank.pop} habitants requis`);
    } else {
      const thLevel = this.game.townhallLevel();
      const need = MAIRIE_FOR_LEVEL[Math.min(to, 5)];
      const okM = this.libre || thLevel >= need;
      out.reqs.push({ label: `Mairie : ${RANKS[need - 1].name}`, ok: okM });
      if (!okM) out.reasons.push(`Mairie au rang ${RANKS[need - 1].name} requise`);
      const needs = def.upgradeNeeds?.[to - 1] || [];
      if (needs.length) {
        const inf = sim.info.get(b.id);
        for (const n of needs) {
          const ok = this.libre || !!inf?.needs?.[n];
          out.reqs.push({ need: n, ok });
          if (!ok) out.reasons.push('Besoins non couverts');
        }
      }
    }
    if (!this.canAfford(out.cost)) out.reasons.push(this.missingText(out.cost));
    out.affordable = this.canAfford(out.cost);
    out.ok = out.reasons.length === 0;
    out.reasons = [...new Set(out.reasons)];
    return out;
  }

  upgrade(id) {
    const b = this.world.buildings.get(id);
    if (!b) return fail('Introuvable');
    const chk = this.checkUpgrade(b);
    if (!chk.ok) return fail(chk.reasons[0] || 'Amélioration impossible');
    const def = BUILDINGS[b.type];
    this.pay(chk.cost);
    b.level++;
    const st = this.st;
    st.stats.upgrades++;
    if (st.stats.daily) st.stats.daily.upgrades++;
    const xp = upgradeXP(def, b.level);
    this.game.prog.addXP(xp, 'upgrade');
    this.pushUndo({ kind: 'upgrade', id, cost: chk.cost, xp, level: b.level });
    this.world.version++;
    this.game.prog.recount();
    this.game.sim.markDirty();
    this.game.bus.emit('building:upgraded', b);
    return { ok: true, building: b };
  }

  /* ───────── Déplacement ───────── */
  move(id, x, z, rot) {
    const world = this.world;
    const b = world.buildings.get(id);
    if (!b) return fail('Introuvable');
    if (b.x === x && b.z === z && b.rot === rot) return fail('Même emplacement');
    const chk = this.checkPlacement(b.type, x, z, rot, id);
    if (!chk.ok) return chk;
    this.pay(chk.cost);
    for (const c of chk.clear) world.setTerrain(c.i, T.GRASS);
    this.grant(chk.gain);
    const from = { x: b.x, z: b.z, rot: b.rot };
    world.moveBuilding(id, x, z, rot);
    this.pushUndo({ kind: 'move', id, from, to: { x, z, rot }, cost: chk.cost, gain: chk.gain, clear: chk.clear });
    this.game.sim.markDirty();
    if (chk.clear.length) this.game.bus.emit('terrain:changed', chk.clear.map((c) => c.i));
    this.game.bus.emit('building:moved', b, from);
    return { ok: true, building: b };
  }

  /* ───────── Incendie ───────── */
  extinguishCost(b) {
    return { coins: 40 + 20 * b.level };
  }

  extinguish(id) {
    const b = this.world.buildings.get(id);
    if (!b || !b.fire) return fail('Pas d\'incendie ici');
    const cost = this.extinguishCost(b);
    if (!this.canAfford(cost)) return fail(this.missingText(cost));
    this.pay(cost);
    this.game.events.extinguish(b, true);
    return { ok: true };
  }

  /* ───────── Négoce ───────── */
  tradePrice(res, buy) {
    const v = RESOURCES[res].value;
    return buy ? Math.ceil(v * 5) : Math.max(1, Math.floor(v * 0.8));
  }

  tradeLimit() {
    return 100 + this.st.level * 20;
  }

  tradeToday() {
    const st = this.st;
    const day = Math.floor(st.time.day);
    if (!st.trade || st.trade.day !== day) st.trade = { day, bought: {} };
    return st.trade;
  }

  buy(res, qty) {
    if (!this.game.prog.featureUnlocked('trade')) return fail('Le négoce se débloque au niveau 5');
    const t = this.tradeToday();
    const left = this.tradeLimit() - (t.bought[res] || 0);
    if (left <= 0) return fail('Limite d\'achat atteinte pour aujourd\'hui');
    const room = Math.floor(this.game.sim.d.storage - (this.st.res[res] || 0));
    qty = Math.min(qty, left, room);
    if (qty <= 0) return fail('Stock plein');
    const cost = { coins: this.tradePrice(res, true) * qty };
    if (!this.canAfford(cost)) return fail(this.missingText(cost));
    this.pay(cost);
    this.st.res[res] = (this.st.res[res] || 0) + qty;
    t.bought[res] = (t.bought[res] || 0) + qty;
    this.game.bus.emit('trade', res, qty, true);
    return { ok: true, qty, cost };
  }

  sell(res, qty) {
    if (!this.game.prog.featureUnlocked('trade')) return fail('Le négoce se débloque au niveau 5');
    qty = Math.min(qty, Math.floor(this.st.res[res] || 0));
    if (qty <= 0) return fail('Rien à vendre');
    this.st.res[res] -= qty;
    const gain = this.tradePrice(res, false) * qty;
    this.st.res.coins += gain;
    this.game.bus.emit('trade', res, qty, false);
    return { ok: true, qty, gain };
  }

  /* ───────── Zones ───────── */
  unlockZone(zi) {
    const info = this.game.prog.zoneInfo(zi);
    if (!info.ok) return fail(info.reason);
    const st = this.st;
    this.pay(info.cost);
    st.zones[zi] = true;
    st.zonesBought++;
    st.stats.zonesUnlocked = st.zones.filter(Boolean).length;
    this.game.prog.addXP(30 + 25 * st.zonesBought, 'zone');
    this.game.sim.markDirty();
    this.game.bus.emit('zone:unlocked', zi);
    return { ok: true };
  }

  /* ───────── Annuler ───────── */
  undo() {
    const e = this.undoStack.pop();
    this.game.bus.emit('undo:changed', this.undoStack.length);
    if (!e) return fail('Rien à annuler');
    const world = this.world;
    const prog = this.game.prog;
    let res = { ok: true, kind: e.kind };
    switch (e.kind) {
      case 'place': {
        const b = world.buildings.get(e.id);
        if (!b || b.level !== 1) return fail('Impossible d\'annuler');
        world.removeBuilding(e.id);
        this.grant(e.cost);
        this.pay(e.gain);
        for (const c of e.clear) world.setTerrain(c.i, c.t);
        prog.removeXP(e.xp);
        this.st.stats.totalBuilt = Math.max(0, this.st.stats.totalBuilt - 1);
        if (this.selectionIs(e.id)) this.game.select(null);
        if (e.clear.length) this.game.bus.emit('terrain:changed', e.clear.map((c) => c.i));
        this.game.bus.emit('building:removed', b, { undo: true });
        res.building = b;
        break;
      }
      case 'roads': {
        for (const p of e.tiles) {
          world.setRoad(p.i, p.prev);
          if (p.clear) world.setTerrain(p.i, p.prevT);
        }
        this.grant(e.cost);
        this.pay(e.gain);
        this.st.stats.roadsBuilt = Math.max(0, this.st.stats.roadsBuilt - e.tiles.length);
        if (e.tiles.some((p) => p.clear)) this.game.bus.emit('terrain:changed', e.tiles.filter((p) => p.clear).map((p) => p.i));
        this.game.bus.emit('roads:changed', e.tiles.map((p) => p.i));
        break;
      }
      case 'unroads': {
        if (!this.canAfford(e.refund)) return fail(this.missingText(e.refund));
        for (const r of e.tiles) {
          if (world.occ[r.i] >= 0) continue;
          world.setRoad(r.i, r.prev);
        }
        this.pay(e.refund);
        this.game.bus.emit('roads:changed', e.tiles.map((r) => r.i));
        break;
      }
      case 'demolish': {
        const b = e.b;
        const tiles = world.tilesOf(b);
        if (tiles.some((i) => world.occ[i] >= 0 || world.road[i])) return fail('L\'emplacement n\'est plus libre');
        if (!this.canAfford(e.refund)) return fail(this.missingText(e.refund));
        this.pay(e.refund);
        world.addBuilding(b);
        this.game.bus.emit('building:placed', b, { undo: true });
        break;
      }
      case 'upgrade': {
        const b = world.buildings.get(e.id);
        if (!b || b.level !== e.level) return fail('Impossible d\'annuler');
        b.level--;
        this.grant(e.cost);
        prog.removeXP(e.xp);
        this.st.stats.upgrades = Math.max(0, this.st.stats.upgrades - 1);
        world.version++;
        this.game.bus.emit('building:upgraded', b, { undo: true });
        break;
      }
      case 'plant': {
        if (world.terrain[e.i] !== T.FOREST || world.occ[e.i] >= 0 || world.road[e.i]) return fail('Impossible d\'annuler');
        world.setTerrain(e.i, e.prev);
        this.grant(e.cost);
        this.game.bus.emit('terrain:changed', [e.i]);
        break;
      }
      case 'move': {
        const b = world.buildings.get(e.id);
        if (!b) return fail('Impossible d\'annuler');
        const chk = this.checkPlacement(b.type, e.from.x, e.from.z, e.from.rot, e.id);
        if (!chk.ok && chk.reason !== 'Pas assez de ressources') return fail('L\'ancien emplacement n\'est plus libre');
        const from = { x: b.x, z: b.z, rot: b.rot };
        world.moveBuilding(e.id, e.from.x, e.from.z, e.from.rot);
        this.grant(e.cost);
        this.pay(e.gain);
        for (const c of e.clear) world.setTerrain(c.i, c.t);
        if (e.clear.length) this.game.bus.emit('terrain:changed', e.clear.map((c) => c.i));
        this.game.bus.emit('building:moved', b, from);
        break;
      }
      default:
        return fail('Rien à annuler');
    }
    prog.recount();
    this.game.sim.markDirty();
    return res;
  }

  selectionIs(id) {
    return this.game.selection === id;
  }
}
