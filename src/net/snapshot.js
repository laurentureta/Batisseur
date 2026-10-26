// Photo d'un village pour les visites entre amis : terrain et routes compressés, bâtiments,
// arbres, saison et heure. Une vingtaine de Ko pour un grand village.
import { encodeBytes, decodeBytes } from '../core/save.js';
import { createNewState } from '../core/state.js';
import { N } from '../world/constants.js';
import { BUILDINGS } from '../data/buildings.js';

/** Compression simple (valeur, répétitions) : les cartes sont faites de grandes plages. */
export function rleEncode(u8) {
  const out = [];
  let i = 0;
  while (i < u8.length) {
    const v = u8[i];
    let n = 1;
    while (i + n < u8.length && u8[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return encodeBytes(Uint8Array.from(out));
}

export function rleDecode(b64, len) {
  const s = decodeBytes(b64);
  const out = new Uint8Array(len);
  let k = 0;
  for (let i = 0; i + 1 < s.length && k < len; i += 2) {
    out.fill(s[i], k, Math.min(len, k + s[i + 1]));
    k += s[i + 1];
  }
  return out;
}

export function makeSnapshot(game) {
  const st = game.state, w = game.world, C = game.construction;
  return {
    v: 1,
    name: st.name,
    seed: st.seed,
    preset: st.preset,
    mode: st.mode,
    level: st.level,
    day: Math.round(st.time.day * 1000) / 1000,
    weather: st.weather?.kind || 'clear',
    roof: st.cosmetics?.roof || 'mix',
    looks: Object.fromEntries([...w.buildings.values()].filter((b) => b.appearance).map((b) => [b.id,b.appearance])),
    zones: st.zones.map((z) => (z ? 1 : 0)).join(''),
    terrain: rleEncode(w.terrain),
    road: rleEncode(w.road),
    trees: w.trees ? w.trees.save() : [],
    b: [...w.buildings.values()].map((b) => {
      const o = [b.id, b.type, b.x, b.z, b.rot, b.level, Math.round((b.residents || 0) * 10) / 10];
      if (b.cons) o.push(b.cons.k, b.cons.to, Math.round(C.progress(b) * 100) / 100);
      return o;
    }),
    pop: Math.floor(game.sim.d.population),
    mairie: game.townhallLevel(),
  };
}

/** Recompose un état de partie (pour l'affichage seulement) à partir d'une photo. */
export function stateFromSnapshot(s) {
  const st = createNewState({ name: s.name, preset: s.preset, mode: s.mode === 'libre' ? 'libre' : 'carriere', seed: s.seed });
  st.level = s.level || 1;
  st.time = { day: s.day || 0.45, speed: 1 };
  st.weather = { kind: s.weather || 'clear', day: 0 };
  st.cosmetics = { roof: s.roof || 'mix' };
  if (typeof s.zones === 'string' && s.zones.length === st.zones.length) st.zones = [...s.zones].map((c) => c === '1');
  st.map = { terrain: encodeBytes(rleDecode(s.terrain, N)), road: encodeBytes(rleDecode(s.road, N)) };
  st.trees = Array.isArray(s.trees) ? s.trees : [];
  st.buildings = (s.b || []).filter((a) => Array.isArray(a) && BUILDINGS[a[1]]).map((a) => {
    const def = BUILDINGS[a[1]];
    const b = { id: a[0], type: a[1], x: a[2], z: a[3], rot: a[4] & 3, level: Math.max(1, Math.min(def.maxLevel || 1, a[5] || 1)) };
    if (s.looks?.[b.id]) b.appearance = s.looks[b.id];
    if (def.residents) b.residents = a[6] || 0;
    if (a[7]) b.cons = { k: a[7] === 'up' ? 'up' : 'new', to: a[8] || b.level, W: 420, w: 420 * Math.min(1, a[9] || 0), del: 2, t0: 0 };
    return b;
  });
  if (!st.buildings.some((b) => b.type === 'townhall')) st.buildings.unshift(createNewState({ seed: 1 }).buildings[0]);
  st.nextId = Math.max(1, ...st.buildings.map((b) => b.id)) + 1;
  return st;
}
