// Progression : XP, niveaux, déblocages, quêtes, missions du jour, succès, commandes, zones.
import { BUILDINGS, BUILDING_LIST, ROAD_TYPES, BRIDGE_UNLOCK } from '../data/buildings.js';
import { MAX_LEVEL, xpToNext, RANKS, zoneCost, zoneLevelReq, FEATURES, levelReward } from '../data/progression.js';
import { MAIN_QUESTS, DAILY_POOL, dailyReward, ACHIEVEMENTS, achievementReward } from '../data/quests.js';
import { RESOURCES, GOODS } from '../data/resources.js';
import { mulberry32, hashStr } from '../core/rng.js';
import { todayKey, round5 } from '../core/util.js';
import { ZONES } from '../world/constants.js';

const PRODUCER_OF = {}; // ressource -> types de bâtiments qui la produisent
for (const def of BUILDING_LIST) if (def.produces) for (const r in def.produces) (PRODUCER_OF[r] ||= []).push(def.id);

export class Progression {
  constructor(game) {
    this.game = game;
    this.checkAcc = 0;
    this.counts = {};
  }

  get st() {
    return this.game.state;
  }
  get libre() {
    return this.game.state?.mode === 'libre';
  }

  reset() {
    this.checkAcc = 99;
    this.counts = {};
    this.ensureDaily();
    this.recount();
  }

  /* ───────── Déblocages ───────── */
  isUnlocked(type) {
    const def = BUILDINGS[type];
    if (def?.exclusive) return !!this.game.meta?.ownsDecor(type);
    if (this.libre) return true;
    return !!def && this.st.level >= def.unlock;
  }
  roadUnlocked(roadType) {
    return this.libre || this.st.level >= ROAD_TYPES[roadType].unlock;
  }
  bridgeUnlocked() {
    return this.libre || this.st.level >= BRIDGE_UNLOCK;
  }
  featureUnlocked(id) {
    return !this.libre && this.st.level >= FEATURES[id].level;
  }

  /* ───────── XP et niveaux ───────── */
  addXP(amount, source) {
    if (this.libre || !(amount > 0)) return;
    const st = this.st;
    st.xp += amount;
    this.game.bus.emit('xp', amount, source);
    while (st.level < MAX_LEVEL && st.xp >= xpToNext(st.level)) {
      st.xp -= xpToNext(st.level);
      st.level++;
      this.onLevelUp(st.level);
    }
    if (st.level >= MAX_LEVEL) st.xp = Math.min(st.xp, xpToNext(MAX_LEVEL));
  }

  removeXP(amount) {
    if (this.libre) return;
    this.st.xp = Math.max(0, this.st.xp - amount);
  }

  levelProgress() {
    const st = this.st;
    const need = xpToNext(st.level);
    return { level: st.level, xp: st.xp, need, pct: st.level >= MAX_LEVEL ? 1 : Math.min(1, st.xp / need) };
  }

  onLevelUp(level) {
    const reward = levelReward(level);
    this.game.actions.grant(reward);
    const unlocks = BUILDING_LIST.filter((d) => d.unlock === level && !d.notBuildable).map((d) => d.id);
    const roads = Object.values(ROAD_TYPES).filter((r) => r.unlock === level);
    const features = Object.values(FEATURES).filter((f) => f.level === level).map((f) => `${f.icon} ${f.name}`);
    if (BRIDGE_UNLOCK === level) features.push('🌉 Ponts : trace une route sur une rivière');
    for (const r of roads) features.push(`${r.icon} ${r.name}`);
    if (level === FEATURES.missions.level) this.ensureDaily(true);
    this.game.bus.emit('level:up', { level, unlocks, reward, features });
  }

  /* ───────── Comptages ───────── */
  recount() {
    const counts = {};
    const levels = {};
    for (const b of this.game.world?.buildings.values() || []) {
      if (b.cons?.k === 'new') continue; // un chantier ne compte qu'une fois terminé
      counts[b.type] = (counts[b.type] || 0) + 1;
      const l = (levels[b.type] ||= [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      for (let k = 1; k <= b.level; k++) l[k]++;
    }
    this.counts = counts;
    this.levelCounts = levels;
  }
  countType(type, minLevel = 1) {
    if (minLevel <= 1) return this.counts[type] || 0;
    return this.levelCounts?.[type]?.[minLevel] || 0;
  }

  tick(days) {
    this.checkAcc += days;
    if (this.checkAcc >= 0.008) {
      this.checkAcc = 0;
      this.recount();
      this.checkQuests();
      this.refreshOrders();
    }
  }

  /* ───────── Quête principale ───────── */
  currentQuest() {
    if (this.libre) return null;
    return MAIN_QUESTS[this.st.quests.main] || null;
  }

  evalGoal(g) {
    const st = this.st;
    const game = this.game;
    switch (g.kind) {
      case 'roadConnected': {
        const th = game.world.townhall();
        const ok = th && game.world.perimeter(th).some((i) => game.world.road[i]);
        return { cur: ok ? 1 : 0, target: 1 };
      }
      case 'count':
        return { cur: this.countType(g.type), target: g.n };
      case 'countLevel':
        return { cur: this.countType(g.type, g.level), target: g.n };
      case 'pop':
        return { cur: Math.floor(game.sim.d.population), target: g.n };
      case 'level':
        return { cur: st.level, target: g.n };
      case 'mairie':
        return { cur: game.townhallLevel(), target: g.n };
      case 'zones':
        return { cur: st.zones.filter(Boolean).length, target: g.n };
      case 'roads':
        return { cur: game.world.countRoads(), target: g.n };
      case 'paved':
        return { cur: game.world.countRoads(2), target: g.n };
      case 'orders':
        return { cur: st.stats.ordersDone, target: g.n };
      case 'happiness':
        return {
          cur: game.sim.d.population >= g.minPop ? Math.round(game.sim.d.happiness * 100) : 0,
          target: Math.round(g.n * 100),
          unit: '%',
        };
      case 'stock':
        return { cur: Math.floor(st.res[g.res] || 0), target: g.n };
      default:
        return { cur: 0, target: 1 };
    }
  }

  questProgress(q) {
    const p = this.evalGoal(q.goal);
    p.done = p.cur >= p.target;
    return p;
  }

  checkQuests() {
    if (this.libre) return;
    const q = this.currentQuest();
    if (!q) return;
    const p = this.questProgress(q);
    if (p.done && !this.st.quests.mainReady) {
      this.st.quests.mainReady = true;
      this.game.bus.emit('quest:ready', q);
    }
  }

  claimMain() {
    const q = this.currentQuest();
    if (!q || !this.st.quests.mainReady) return false;
    const reward = { ...q.reward };
    const xp = reward.xp || 0;
    delete reward.xp;
    this.game.actions.grant(reward);
    this.st.quests.main++;
    this.st.quests.mainReady = false;
    this.st.stats.questsDone++;
    this.game.bus.emit('quest:claimed', q, reward, xp);
    this.addXP(xp, 'quest');
    this.checkQuests();
    return true;
  }

  /* ───────── Missions du jour ───────── */
  ensureDaily(force = false) {
    const st = this.st;
    if (!st || this.libre) return;
    const key = todayKey();
    if (!force && st.quests.daily && st.quests.daily.date === key) return;
    if (!force && st.quests.daily && st.quests.daily.date === key && st.quests.daily.missions.length) return;
    const level = st.level;
    const pool = DAILY_POOL.filter((m) => level >= m.unlock);
    const rng = mulberry32(hashStr(key + ':' + st.seed));
    const chosen = [];
    const copy = [...pool];
    while (chosen.length < 3 && copy.length) chosen.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    st.quests.daily = {
      date: key,
      missions: chosen.map((m) => ({ id: m.id, target: m.target(level), claimed: false, reward: dailyReward(level) })),
    };
    st.stats.daily = { date: key, roads: 0, built: 0, upgrades: 0, decor: 0, coins: 0, orders: 0, produced: {} };
  }

  dailyMissions() {
    if (this.libre || !this.featureUnlocked('missions')) return [];
    this.ensureDaily();
    const dl = this.st.quests.daily;
    if (!dl) return [];
    const counters = this.st.stats.daily || {};
    return dl.missions.map((m, i) => {
      const def = DAILY_POOL.find((p) => p.id === m.id);
      let cur = 0;
      if (def.counter.startsWith('produced.')) cur = counters.produced?.[def.counter.slice(9)] || 0;
      else cur = counters[def.counter] || 0;
      cur = Math.floor(cur);
      return { index: i, def, ...m, cur: Math.min(cur, m.target), done: cur >= m.target, label: def.label(m.target) };
    });
  }

  claimDaily(i) {
    const list = this.dailyMissions();
    const m = list[i];
    if (!m || !m.done || m.claimed) return false;
    this.st.quests.daily.missions[i].claimed = true;
    const reward = { ...m.reward };
    const xp = reward.xp || 0;
    delete reward.xp;
    this.game.actions.grant(reward);
    this.addXP(xp, 'daily');
    this.game.bus.emit('daily:claimed', m);
    return true;
  }

  /* ───────── Succès ───────── */
  achievements() {
    if (this.libre) return [];
    const claimed = this.st.quests.achievements;
    return ACHIEVEMENTS.map((a) => {
      const tier = claimed[a.id] || 0; // nombre de paliers déjà récupérés
      const value = a.stat(this.game) || 0;
      const next = a.tiers[tier];
      return {
        ...a,
        tier,
        value,
        next,
        maxed: tier >= a.tiers.length,
        ready: next != null && value >= next,
        reward: next != null ? achievementReward(tier) : null,
      };
    });
  }

  claimAchievement(id) {
    const a = this.achievements().find((x) => x.id === id);
    if (!a || !a.ready) return false;
    this.st.quests.achievements[id] = a.tier + 1;
    const reward = { ...a.reward };
    const xp = reward.xp || 0;
    delete reward.xp;
    this.game.actions.grant(reward);
    this.addXP(xp, 'achievement');
    this.game.bus.emit('achievement:claimed', a);
    return true;
  }

  /* ───────── Commandes ───────── */
  orderResources() {
    const out = [];
    for (const r of GOODS) {
      const types = PRODUCER_OF[r] || [];
      if (types.some((t) => this.countType(t) > 0)) out.push(r);
    }
    return out;
  }

  refreshOrders() {
    if (this.libre || !this.featureUnlocked('orders')) return;
    const o = this.st.orders;
    const day = this.st.time.day;
    for (let s = 0; s < 3; s++) {
      if (!o.slots[s] && day >= (o.cooldown[s] || 0)) {
        const order = this.makeOrder();
        if (order) {
          o.slots[s] = order;
          this.game.bus.emit('orders:new', s);
        }
      }
    }
  }

  makeOrder() {
    const avail = this.orderResources();
    if (!avail.length) return null;
    const st = this.st;
    const rng = Math.random;
    const nItems = Math.min(avail.length, 1 + Math.floor(rng() * Math.min(3, 1 + st.level / 6)));
    const pool = [...avail];
    const items = [];
    let value = 0;
    for (let k = 0; k < nItems; k++) {
      const r = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const v = RESOURCES[r].value;
      const qty = round5((60 / v) * (1 + st.level * 0.18) * (0.7 + rng() * 0.6));
      items.push({ res: r, qty });
      value += qty * v;
    }
    const coins = round5(value * 1.7);
    const xp = Math.max(5, Math.round(value * 0.09));
    return { id: st.orders.nextId++, items, coins, xp };
  }

  canDeliver(order) {
    return order.items.every((it) => (this.st.res[it.res] || 0) >= it.qty);
  }

  deliverOrder(slot) {
    const o = this.st.orders;
    const order = o.slots[slot];
    if (!order || !this.canDeliver(order)) return false;
    for (const it of order.items) this.st.res[it.res] -= it.qty;
    this.game.actions.grant({ coins: order.coins });
    this.addXP(order.xp, 'order');
    o.slots[slot] = null;
    o.cooldown[slot] = this.st.time.day + 0.25;
    this.st.stats.ordersDone++;
    if (this.st.stats.daily) this.st.stats.daily.orders++;
    this.game.bus.emit('order:delivered', order);
    return true;
  }

  discardOrder(slot) {
    const o = this.st.orders;
    if (!o.slots[slot]) return false;
    o.slots[slot] = null;
    o.cooldown[slot] = this.st.time.day + 0.5;
    this.game.bus.emit('order:discarded', slot);
    return true;
  }

  /* ───────── Zones ───────── */
  zoneInfo(zi) {
    const world = this.game.world;
    const st = this.st;
    const n = st.zonesBought;
    const cost = { coins: zoneCost(n) };
    const levelReq = zoneLevelReq(n);
    const unlocked = !!st.zones[zi];
    const adjacent = world.zoneAdjacentUnlocked(zi);
    let reason = '';
    if (unlocked) reason = 'Déjà débloquée';
    else if (!adjacent) reason = 'Débloque d\'abord une zone voisine';
    else if (!this.libre && st.level < levelReq) reason = `Niveau ${levelReq} requis`;
    else if (!this.game.actions.canAfford(cost)) reason = 'Pas assez de pièces';
    return {
      zi, name: world.zoneName(zi), comp: world.zoneDescription(zi), cost, levelReq, unlocked, adjacent,
      ok: !reason, reason,
    };
  }

  purchasableZones() {
    if (this.libre) return [];
    const out = [];
    for (let zi = 0; zi < ZONES * ZONES; zi++) {
      if (!this.st.zones[zi] && this.game.world.zoneAdjacentUnlocked(zi)) out.push(zi);
    }
    return out;
  }

  /* ───────── Mairie ───────── */
  mairieNext() {
    const th = this.game.world.townhall();
    const level = th ? th.level : 1;
    if (level >= RANKS.length) return null;
    const rank = RANKS[level];
    return {
      rank,
      level: level + 1,
      cost: rank.cost,
      okLevel: this.libre || this.st.level >= rank.level,
      okPop: this.libre || this.game.sim.d.population >= rank.pop,
    };
  }

  /** Nombre d'éléments à récupérer (pastilles de notification). */
  claimables() {
    if (this.libre) return { quests: 0, achievements: 0, orders: 0 };
    let quests = this.st.quests.mainReady ? 1 : 0;
    quests += this.dailyMissions().filter((m) => m.done && !m.claimed).length;
    const achievements = this.achievements().filter((a) => a.ready).length;
    let orders = 0;
    if (this.featureUnlocked('orders')) for (const o of this.st.orders.slots) if (o && this.canDeliver(o)) orders++;
    return { quests, achievements, orders };
  }
}
