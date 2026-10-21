// Création de l'état initial d'une partie.
import { emptyStock } from '../data/resources.js';
import { CENTER_ZONE } from '../world/constants.js';

export const SAVE_VERSION = 1;

export function createNewState({ name = 'Mon village', preset = 'vallee', mode = 'carriere', seed, slot = 0 } = {}) {
  const libre = mode === 'libre';
  const zones = new Array(25).fill(libre);
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
    buildings: [{ id: 1, type: 'townhall', x: 24, z: 24, rot: 0, level: 1 }],
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
      zonesUnlocked: libre ? 25 : 1,
      monuments: 0,
      daily: null,
    },
    events: { active: [], merchant: null },
    weather: { kind: 'clear', day: 0 },
    flags: { welcome: false },
    summary: { pop: 0, mairie: 1 },
  };
}

/** Complète une sauvegarde ancienne avec les champs manquants. */
export function migrateState(st) {
  const base = createNewState({ name: st.name, preset: st.preset, mode: st.mode, seed: st.seed, slot: st.slot });
  for (const k of Object.keys(base)) if (st[k] === undefined) st[k] = base[k];
  for (const k of Object.keys(base.stats)) if (st.stats[k] === undefined) st.stats[k] = base.stats[k];
  for (const k of Object.keys(base.res)) if (st.res[k] === undefined) st.res[k] = 0;
  if (!st.quests.achievements) st.quests.achievements = {};
  if (!st.orders.nextId) st.orders.nextId = 1;
  st.version = SAVE_VERSION;
  return st;
}
