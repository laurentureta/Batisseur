// Sauvegarde locale (localStorage) : 3 emplacements, export / import, réglages.
import { migrateState } from './state.js';

const PREFIX = 'batisseur.';
export const SLOT_COUNT = 3;

export function encodeBytes(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeBytes(b64, len) {
  const s = atob(b64);
  const u8 = new Uint8Array(len ?? s.length);
  for (let i = 0; i < s.length && i < u8.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/** Transforme la partie en texte JSON. */
export function serialize(game) {
  const st = game.state;
  st.map = { terrain: encodeBytes(game.world.terrain), road: encodeBytes(game.world.road) };
  st.buildings = [...game.world.buildings.values()].map((b) => {
    const o = { id: b.id, type: b.type, x: b.x, z: b.z, rot: b.rot, level: b.level };
    if (b.residents != null) o.residents = Math.round(b.residents * 100) / 100;
    if (b.fire) o.fire = b.fire;
    if (b.born != null) o.born = Math.round(b.born * 100) / 100;
    return o;
  });
  st.savedAt = Date.now();
  st.summary = { pop: Math.floor(game.sim.d.population), mairie: game.townhallLevel() };
  return JSON.stringify(st);
}

export function writeSlot(slot, json) {
  try {
    localStorage.setItem(PREFIX + 'save.' + slot, json);
    localStorage.setItem(PREFIX + 'last', String(slot));
    return true;
  } catch (err) {
    console.warn('Sauvegarde impossible', err);
    return false;
  }
}

export function readSlot(slot) {
  try {
    const s = localStorage.getItem(PREFIX + 'save.' + slot);
    if (!s) return null;
    return migrateState(JSON.parse(s));
  } catch (err) {
    console.warn('Lecture de sauvegarde impossible', err);
    return null;
  }
}

export function deleteSlot(slot) {
  try {
    localStorage.removeItem(PREFIX + 'save.' + slot);
  } catch (err) {
    /* ignoré */
  }
}

export function lastSlot() {
  try {
    const v = localStorage.getItem(PREFIX + 'last');
    if (v == null) return null;
    const n = Number(v);
    return readSlot(n) ? n : null;
  } catch {
    return null;
  }
}

export function slotSummaries() {
  const out = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    const st = readSlot(s);
    out.push(
      st
        ? { slot: s, exists: true, name: st.name, level: st.level, mode: st.mode, preset: st.preset, savedAt: st.savedAt, pop: st.summary?.pop ?? 0, mairie: st.summary?.mairie ?? 1, day: Math.floor(st.time.day) + 1 }
        : { slot: s, exists: false },
    );
  }
  return out;
}

export function firstFreeSlot() {
  const list = slotSummaries();
  const free = list.find((s) => !s.exists);
  return free ? free.slot : null;
}

/** Vérifie et lit une sauvegarde importée (texte JSON). */
export function parseImport(text) {
  const st = JSON.parse(text);
  if (!st || typeof st !== 'object' || !Array.isArray(st.buildings) || !st.res || !st.seed) throw new Error('Fichier de sauvegarde invalide');
  return migrateState(st);
}

const DEFAULT_SETTINGS = {
  quality: 'auto', // auto | high | medium | low
  sound: true,
  ambience: true,
  upgradeHints: true,
  fires: true,
  autoRotate: true,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(PREFIX + 'settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(PREFIX + 'settings', JSON.stringify(settings));
  } catch {
    /* ignoré */
  }
}
