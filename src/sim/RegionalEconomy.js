// Gestion en veille : une journée de jeu par heure réelle, au plus huit heures.
// Aucun import du jeu navigateur : les mêmes réseaux, services et rendements sont recalculés
// dans un monde sans rendu. Les habitants restent sur place ; les chantiers ne sont pas validés.
import { Simulation } from './Simulation.js';
import { World } from '../world/World.js';
import { generateMap } from '../world/mapgen.js';
import { decodeBytes } from '../core/save.js';
import { EventBus } from '../core/EventBus.js';
import { RandomEvents } from './RandomEvents.js';
import { BUILDINGS, prodMult, workersAt } from '../data/buildings.js';
import { N, SIZE, DAY_SECONDS } from '../world/constants.js';
import { GOODS } from '../data/resources.js';
import { hasWorkshopQueue } from '../data/recipes.js';

export const REGIONAL_MAX_MS = 8 * 60 * 60 * 1000;
export const REGIONAL_DAY_MS = 60 * 60 * 1000;
export function regionalTransportModes(game) {
  return ['cart', ...([...game.world.buildings.values()].some(b => b.type === 'station' && !b.cons && game.sim.info.get(b.id)?.connected) ? ['train'] : []), ...(game.city.completed('civic_harbor') ? ['boat'] : [])];
}
function runtime(state, makeCity) {
  const gen = generateMap(state.seed, state.preset);
  if (state.map?.terrain) gen.terrain = decodeBytes(state.map.terrain, N);
  if (state.map?.road) gen.road = decodeBytes(state.map.road, N);
  const g = { state, world: new World(state, gen), bus: new EventBus(), settings: {}, isDemo: false, prog: { addXP() {} } };
  g.events = new RandomEvents(g);
  g.sim = new Simulation(g);
  g.city = makeCity(g);
  g.city.reset();
  return g;
}
function credit(g, resource, qty) {
  const st = g.state;
  st.res[resource] = (st.res[resource] || 0) + qty;
  st.stats.produced[resource] = (st.stats.produced[resource] || 0) + qty;
}
// Les arbres sont réellement coupés et sauvegardés ; le reliquat d'un tronc est réservé.
function woodFromTrees(g, b, planned) {
  const pools = g.city.data.lumberReserve ||= {};
  let pool = pools[b.id] || 0;
  const p = g.world.centerOf(b), unit = Math.max(8, Math.ceil(BUILDINGS[b.type].produces.wood * prodMult(b.level) / Math.max(1, workersAt(BUILDINGS[b.type], b.level)) / 1.5));
  while (pool + 1e-8 < planned) {
    const tree = g.world.trees.findNear(p.cx - SIZE / 2, p.cz - SIZE / 2, 4, 1)[0];
    if (!tree) break;
    g.world.trees.fell(tree.id, g.state.time.day, 0);
    pool += unit;
  }
  const n = Math.min(pool, planned);
  pools[b.id] = Math.max(0, pool - n);
  return n;
}
function produce(g, days) {
  const { state: st, sim, city } = g;
  for (const b of g.world.buildings.values()) {
    const def = BUILDINGS[b.type], inf = sim.info.get(b.id);
    if (b.type === 'townhall' || !def.produces || !(inf?.eff > 0) || hasWorkshopQueue(st,b.id)) continue;
    const mult = prodMult(b.level) * inf.eff * days;
    let fraction = 1;
    for (const [r, amount] of Object.entries(def.consumes || {})) if (amount > 0) fraction = Math.min(fraction, Math.max(0, st.res[r] || 0) / (amount * mult));
    for (const [r, amount] of Object.entries(def.produces)) if (amount > 0) {
      const room = city.hasRoute(b.id) ? city.productionRoom(b, r) : st.mode === 'libre' ? Infinity : Math.max(0, sim.d.storage - (st.res[r] || 0));
      fraction = Math.min(fraction, room / (amount * mult));
    }
    fraction = Math.max(0, Math.min(1, fraction));
    if (!fraction) continue;
    if (b.type === 'lumber') {
      const planned = def.produces.wood * mult * fraction;
      fraction *= planned > 0 ? woodFromTrees(g, b, planned) / planned : 0;
    }
    for (const [r, amount] of Object.entries(def.consumes || {})) st.res[r] = Math.max(0, st.res[r] - amount * mult * fraction);
    for (const [r, amount] of Object.entries(def.produces)) {
      const add = amount * mult * fraction;
      if (!city.bufferProduction(b, r, add)) credit(g, r, add);
    }
  }
}

/** Une horloge persistée empêche un deuxième passage de créditer deux fois la même absence. */
export function advanceRegionalState(state, id, now, makeCity) {
  const previous = Number(state.regionalClockAt || state.savedAt || now);
  if (now <= previous) return null; // une horloge de téléphone reculée ne crée aucun gain
  const elapsed = Math.min(REGIONAL_MAX_MS, now - previous);
  const result = { elapsed, capped: now - previous > REGIONAL_MAX_MS, gains: {}, at: now, transport: ['cart'] };
  // La pause explicite arrête aussi l'économie en veille, jamais les délais de livraison.
  if (state.time.speed === 0) { result.transport = state.regionalReport?.transport || ['cart']; state.regionalClockAt = now; state.regionalReport = result; return result; }
  // Travail sur une copie : une exception ne laisse ni crédit partiel ni horloge rejouable.
  const target = state;
  state = JSON.parse(JSON.stringify({ ...state, regionBook: undefined }));
  const originalId = state.regionId;
  state.regionId = id;
  const before = { ...state.res };
  let game;
  try {
    game = runtime(state, makeCity);
    let seconds = elapsed / REGIONAL_DAY_MS * DAY_SECONDS;
    while (seconds > 1e-8) {
      const dt = Math.min(15, seconds), days = dt / DAY_SECONDS;
      state.time.day += days;
      state.events.active = state.events.active.filter(e => e.until > state.time.day);
      game.world.trees.update(state.time.day);
      game.sim.recalc();
      produce(game, days);
      game.sim.consume(days);
      game.sim.money(days);
      game.city.localTick(dt);
      seconds -= dt;
    }
    state.trees = game.world.trees.save();
    result.transport = regionalTransportModes(game);
    for (const r of ['coins', ...GOODS]) {
      const delta = state.res[r] - (before[r] || 0);
      if (Math.abs(delta) > .00001) result.gains[r] = delta;
    }
    state.regionalClockAt = now;
    state.regionalReport = result;
    for (const key of ['res','time','city','trees','stats','events','buildings','regionalClockAt','regionalReport']) target[key] = state[key];
    return result;
  } finally {
    if (originalId === undefined) delete state.regionId;
    else state.regionId = originalId;
  }
}
