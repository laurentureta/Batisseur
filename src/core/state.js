// Création de l'état initial d'une partie.
import { emptyStock } from '../data/resources.js';
import { CENTER_ZONE, ZONES, CENTER, LEGACY_ZONES, LEGACY_OFFSET, ZONE } from '../world/constants.js';

export const SAVE_VERSION = 2;

export function createNewState({ name = 'Mon village', preset = 'vallee', mode = 'carriere', seed, slot = 0 } = {}) {
  const libre = mode === 'libre';
  const zones = new Array(ZONES * ZONES).fill(libre);
  zones[CENTER_ZONE] = true;
  const res = emptyStock();
  Object.assign(res, { coins: 600, wood: 120, stone: 60, food: 60 });
  return {
    version: SAVE_VERSION,
    slot,
    name: name.trim().slice(0, 28) || 'Mon village',
    preset,
    mode,
    seed: (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
    createdAt: Date.now(),
    savedAt: 0,
    playTime: 0,
    time: { day: 0.3, speed: 1 },
    res,
    xp: 0,
    level: 1,
    zones,
    zonesBought: 0,
    map: null,
    buildings: [{ id: 1, type: 'townhall', x: CENTER - 1, z: CENTER - 1, rot: 0, level: 1 }],
    nextId: 2,
    quests: { main: 0, mainReady: false, daily: null, achievements: {} },
    orders: { slots: [null, null, null], cooldown: [0, 0.15, 0.3], nextId: 1 },
    stats: {
      totalBuilt: 0,
      built: {},
      upgrades: 0,
      roadsBuilt: 0,
      popRecord: 0,
      ordersDone: 0,
      firesOut: 0,
      coinsEarned: 0,
      produced: {},
      questsDone: 0,
      zonesUnlocked: libre ? ZONES * ZONES : 1,
      monuments: 0,
      daily: null,
    },
    events: { active: [], merchant: null },
    weather: { kind: 'clear', day: 0 },
    flags: { welcome: false },
    summary: { pop: 0, mairie: 1 },
    boosts: [],
    cosmetics: { roof: 'mix' },
  };
}

/**
 * Anciennes parties (carte de 50 x 50) : le village est recentré dans la grande carte.
 * Les bâtiments et les zones sont décalés ici ; le terrain est recomposé au chargement (GameCore).
 */
function migrateLegacyMap(st) {
  const O = LEGACY_OFFSET, OZ = O / ZONE;
  for (const b of st.buildings || []) {
    b.x += O;
    b.z += O;
  }
  const old = Array.isArray(st.zones) ? st.zones : [];
  const zones = new Array(ZONES * ZONES).fill(st.mode === 'libre');
  for (let zi = 0; zi < old.length && zi < LEGACY_ZONES * LEGACY_ZONES; zi++) {
    const zx = zi % LEGACY_ZONES, zz = Math.floor(zi / LEGACY_ZONES);
    zones[(zz + OZ) * ZONES + (zx + OZ)] = !!old[zi] || zones[(zz + OZ) * ZONES + (zx + OZ)];
  }
  zones[CENTER_ZONE] = true;
  st.zones = zones;
  if (st.mode === 'libre' && st.stats) st.stats.zonesUnlocked = ZONES * ZONES;
  if (st.map) st.map.legacy = 50;
}

/**
 * v3.6 : les entrepôts sont remplacés par un bâtiment unique, le Grand Entrepôt. Les anciens
 * entrepôts disparaissent ; leur capacité est gardée telle quelle jusqu'à ce que le joueur pose
 * son Grand Entrepôt, offert, directement au niveau qui stocke au moins autant.
 */
const OLD_WAREHOUSE = [300, 600, 1000, 1500, 2200];
const DEPOT_STORAGE = [400, 800, 1300, 1900, 2700, 3700, 5000, 6600, 8600, 11000];
function migrateWarehouses(st) {
  const olds = (st.buildings || []).filter((b) => b.type === 'warehouse');
  if (!olds.length) return;
  let cap = 0;
  for (const b of olds) cap += OLD_WAREHOUSE[Math.max(0, Math.min(4, (b.level || 1) - 1))];
  st.buildings = st.buildings.filter((b) => b.type !== 'warehouse');
  let lvl = 1;
  while (lvl < 10 && DEPOT_STORAGE[lvl - 1] < cap) lvl++;
  st.legacyStorage = (st.legacyStorage || 0) + cap;
  st.flags.depotGift = Math.max(st.flags.depotGift || 0, lvl);
  st.flags.depotNotice = true;
}

/** Complète une sauvegarde ancienne avec les champs manquants. */
export function migrateState(st) {
  if (!(st.version >= 2)) migrateLegacyMap(st);
  const base = createNewState({ name: st.name, preset: st.preset, mode: st.mode, seed: st.seed, slot: st.slot });
  for (const k of Object.keys(base)) if (st[k] === undefined) st[k] = base[k];
  for (const k of Object.keys(base.stats)) if (st.stats[k] === undefined) st.stats[k] = base.stats[k];
  for (const k of Object.keys(base.res)) if (st.res[k] === undefined) st.res[k] = 0;
  if (!st.quests.achievements) st.quests.achievements = {};
  if (!st.orders.nextId) st.orders.nextId = 1;
  if (!Array.isArray(st.boosts)) st.boosts = [];
  if (!st.cosmetics) st.cosmetics = { roof: 'mix' };
  migrateWarehouses(st);
  st.version = SAVE_VERSION;
  return st;
}
