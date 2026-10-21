// Bâtiments construits avec les vrais modèles 3D (KayKit / Kenney) : assemblages, accessoires, saisons.
// Repère local : emprise centrée sur (0, 0), façade avant vers +z, sol à y = 0.
import { kit, kitBox, kitTop, kitHas, kitExtent } from './kit.js';
import { shade, mix } from './geom.js';

export const KM = {};

/* ───────── outils ───────── */
const SAND = 0xd9bd8c, COBBLE = 0xc3bcae, SOIL = 0x7a5234, SOIL_DARK = 0x5e3f28;

/** Pose un modèle avec les réglages du contexte (couleur de toit, neige, pièces mobiles). */
function K(g, ctx, name, o = {}) {
  return kit(g, name, { variant: ctx.roofVar, team: ctx.team, snow: ctx.snow, out: ctx.out, ...o });
}

/** Pose un modèle mis à l'échelle pour tenir dans w × d, centré en (x, z). */
function KF(g, ctx, name, w, d, o = {}) {
  const [x0, y0, z0, x1, , z1] = kitBox(name);
  const rot = o.rot || 0;
  let bw = x1 - x0, bd = z1 - z0;
  const turned = Math.abs(Math.sin(rot)) > 0.7;
  if (turned) [bw, bd] = [bd, bw];
  const s = (o.s ?? Math.min(w / bw, d / bd)) * (o.k ?? 1);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const c = Math.cos(rot), sn = Math.sin(rot);
  const ox = (o.x || 0) - (cx * c + cz * sn) * s * (o.sx ?? 1);
  const oz = (o.z || 0) - (-cx * sn + cz * c) * s;
  const oy = (o.y || 0) - (o.floor ? y0 * s : 0);
  K(g, ctx, name, { ...o, s, x: ox, y: oy, z: oz });
  return s;
}

/** Dalle de sol fine (terre, pavés, gravier). */
function pad(g, ctx, w, d, color, { x = 0, z = 0, h = 0.012 } = {}) {
  g.box(x, 0, z, w, h, d, { top: ctx.ground(color), side: shade(color, 0.8) });
}

/** Petit chemin de la porte au bord de la case. */
function path(g, ctx, x, z0, z1, w = 0.16) {
  g.box(x, 0, (z0 + z1) / 2, w, 0.01, Math.abs(z1 - z0), { top: ctx.ground(SAND), side: shade(SAND, 0.85) });
}

/** Arbre (sapin KayKit ou feuillu), selon la saison. */
export function treeKit(g, ctx, x, z, s = 1, kind = 'pine', salt = 0, y = 0) {
  const rot = ((salt * 2.399) % 6.283);
  if (ctx.autumn && kind !== 'round' && (salt % 5) < 3) {
    const n = (salt % 2) ? 'hw_tree_pine_orange_small' : 'hw_tree_pine_yellow_small';
    kit(g, n, { s: 0.15 * s, x, y, z, rot, ao: 0.4, dim: ctx.dim });
    return;
  }
  if (kind === 'round') {
    roundTree(g, ctx, x, z, s, salt, y);
    return;
  }
  const n = (salt % 3) === 0 ? 'tree_single_B' : 'tree_single_A';
  kit(g, n, { s: (n === 'tree_single_B' ? 0.52 : 0.6) * s, x, y, z, rot, snow: ctx.snow, ao: 0.45, dim: ctx.dim });
}

const LEAVES = [0x4caf3e, 0x5ab544, 0x3f9e3a, 0x6bbf4a];
const LEAVES_AUTUMN = [0xe58a2b, 0xd9682a, 0xf0b33a, 0xc9502a];
/** Feuillu low-poly dans le style KayKit (dégradé, tronc brun). */
function roundTree(g, ctx, x, z, s, salt, y = 0) {
  const trunk = 0x7a4a32;
  g.cyl(x, y, z, 0.035 * s, 0.22 * s, 6, trunk, 0.028 * s);
  let c = (ctx.autumn ? LEAVES_AUTUMN : LEAVES)[salt % 4];
  if (ctx.spring) c = mix(c, 0x9ddc5a, 0.25);
  if (ctx.winter) c = mix(c, 0xeef3f6, 0.6);
  g.ico(x, y + 0.32 * s, z, 0.17 * s, shade(c, 0.9), 0.9, 0.28, salt * 3 + 1);
  g.ico(x + 0.05 * s, y + 0.42 * s, z - 0.03 * s, 0.11 * s, shade(c, 1.12), 0.9, 0.25, salt * 5 + 2);
}

function barrels(g, ctx, x, z, n = 1, s = 0.6) {
  for (let k = 0; k < n; k++) K(g, ctx, 'barrel', { s, x: x + k * 0.13 * s / 0.6, z: z + (k % 2) * 0.04 });
}

function flag(g, ctx, x, z, s = 1.5, color = null, y = 0) {
  s *= 0.62;
  const names = ['flag_blue', 'flag_red', 'flag_green', 'flag_yellow'];
  const n = color != null ? names[color] : names[ctx.roofVar ?? 0];
  K(g, ctx, n, { s, x, y, z, rot: Math.PI / 2 });
}

function bush(g, ctx, x, z, s = 1) {
  K(g, ctx, 'c_bush', { s, x, z, ao: 0.35 });
}

function lampPost(g, ctx, x, z, s = 0.7, rot = 0) {
  K(g, ctx, 'c_streetlight', { s, x, z, rot });
  g.layer('glass');
  // ampoule (allumée la nuit)
  const c = Math.cos(rot), sn = Math.sin(rot);
  const lx = -0.2 * s, lz = 0;
  g.box(x + lx * c + lz * sn, 0.86 * s, z - lx * sn + lz * c, 0.06 * s, 0.03 * s, 0.05 * s, 0xfff1c2);
  g.layer('body');
}

function lantern(g, ctx, x, z, s = 0.22) {
  kit(g, 'hw_lantern_standing', { s, x, z, snow: ctx.snow });
}

function smokeAt(ctx, x, y, z) {
  ctx.out.emitters.push({ pos: [x, y, z], kind: 'smoke' });
}

function cropRow(g, ctx, x, z0, z1, kind, k) {
  g.box(x, 0, (z0 + z1) / 2, 0.11, 0.035, Math.abs(z1 - z0), { top: ctx.ground(SOIL_DARK), side: SOIL });
  if (ctx.winter) return;
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.12));
  for (let j = 0; j < n; j++) {
    const z = z0 + ((j + 0.5) * (z1 - z0)) / n;
    if (kind === 0) g.ico(x, 0.07, z, 0.04, ctx.autumn ? 0xb9a03a : 0x59b947, 0.75, 0.3, k * 7 + j);
    else if (kind === 1) {
      g.cone(x, 0.035, z, 0.03, 0.08, 4, ctx.autumn ? 0x9aa03a : 0x3f9e3a);
      g.ico(x, 0.045, z, 0.018, 0xf08a2a, 1, 0, j);
    } else {
      g.ico(x, 0.07, z, 0.038, 0x4c9e3a, 0.8, 0.3, k * 3 + j);
      g.ico(x + 0.015, 0.09, z, 0.016, ctx.autumn ? 0xd9682a : 0xe53935, 1, 0, j + 3);
    }
  }
}

/* ───────── Habitations ───────── */
KM.house = (g, L, ctx) => {
  const flip = ctx.bit(2) ? -1 : 1;
  if (L === 1) {
    KF(g, ctx, 'home_A', 0.62, 0.66, { z: -0.06 });
    path(g, ctx, 0, 0.22, 0.5);
    if (ctx.bit(3)) K(g, ctx, 'resource_lumber', { s: 0.42, x: 0.3 * flip, z: 0.3, rot: Math.PI / 2 });
    else barrels(g, ctx, 0.32 * flip, 0.3, 1, 0.55);
    if (ctx.bit(4)) K(g, ctx, 'sack', { s: 0.9, x: -0.32 * flip, z: 0.34 });
    return;
  }
  if (L === 2) {
    KF(g, ctx, 'home_A', 0.74, 0.78, { z: -0.05 });
    path(g, ctx, 0, 0.3, 0.5);
    bush(g, ctx, 0.36 * flip, 0.34, 0.7);
    K(g, ctx, 'crate_long_A', { s: 0.42, x: -0.32 * flip, z: 0.36 });
    if (ctx.bit(3)) treeKit(g, ctx, -0.38 * flip, -0.36, 0.45, 'round', ctx.v);
    return;
  }
  if (L === 3) {
    KF(g, ctx, 'home_B', 0.72, 0.86, { z: -0.05 });
    path(g, ctx, 0, 0.36, 0.5);
    bush(g, ctx, 0.38 * flip, 0.36, 0.75);
    bush(g, ctx, -0.38 * flip, 0.36, 0.65);
    treeKit(g, ctx, 0.38 * flip, -0.38, 0.42, 'round', ctx.v + 1);
    return;
  }
  if (L === 4) {
    const n = ['city_B', 'city_A', 'city_B', 'city_D'][ctx.v % 4];
    KF(g, ctx, n, 0.84, 0.74, { z: -0.08, floor: true, sx: ctx.bit(2) ? -1 : 1 });
    bush(g, ctx, 0.4 * flip, 0.4, 0.7);
    pad(g, ctx, 0.9, 0.18, COBBLE, { z: 0.38 });
    return;
  }
  // L5 : immeuble
  const n = ['city_C', 'city_H', 'city_G', 'city_D', 'city_F', 'city_C'][ctx.v % 6];
  const s5 = KF(g, ctx, n, 0.88, 0.8, { z: -0.06, floor: true, sx: ctx.bit(2) ? -1 : 1 });
  const top = (kitBox(n)[4] - kitBox(n)[1]) * s5 + 0.005;
  if (ctx.bit(4)) K(g, ctx, 'c_watertower', { s: 0.42, x: 0.16 * flip, y: top, z: -0.16 });
  else K(g, ctx, 'c_box_A', { s: 0.6, x: -0.18 * flip, y: top, z: -0.12, tint: [0.7, 0.72, 0.75] });
  pad(g, ctx, 0.96, 0.16, COBBLE, { z: 0.4 });
  if (ctx.bit(3)) K(g, ctx, 'c_firehydrant', { s: 0.8, x: 0.4 * flip, z: 0.42 });
  else bush(g, ctx, 0.4 * flip, 0.42, 0.6);
};

KM.manor = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xb9cf6a);
  path(g, ctx, 0, 0.2, 1.0, 0.3);
  if (L === 1) {
    KF(g, ctx, 'home_B', 1.1, 1.2, { x: -0.3, z: -0.32 });
    KF(g, ctx, 'home_A', 0.7, 0.75, { x: 0.55, z: -0.45 });
  } else if (L === 2) {
    KF(g, ctx, 'home_B', 1.25, 1.35, { x: 0.05, z: -0.3 });
    KF(g, ctx, 'tower_A', 0.6, 0.7, { x: -0.62, z: -0.5 });
    KF(g, ctx, 'home_A', 0.55, 0.6, { x: 0.7, z: -0.55 });
  } else {
    KF(g, ctx, 'castle', 1.3, 1.45, { x: 0, z: -0.3 });
  }
  KF(g, ctx, 'k_pavement_fountain', 0.6, 0.6, { x: 0, z: 0.55 });
  ctx.out.emitters.push({ pos: [0, 0.32, 0.55], kind: 'water' });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) bush(g, ctx, s * (0.45 + k * 0.17), 0.62, 0.9);
    treeKit(g, ctx, s * 0.8, 0.82, 0.7, k2(s), 3 + s);
  }
  if (L >= 2) for (const s of [-1, 1]) lantern(g, ctx, s * 0.3, 0.86);
};
function k2(s) {
  return s > 0 ? 'round' : 'pine';
}

/* ───────── Mairie ───────── */
KM.townhall = (g, L, ctx) => {
  pad(g, ctx, 1.96, 1.96, L >= 2 ? COBBLE : SAND);
  const gold = L >= 8 ? { team: 0xf2c14e } : {};
  if (L === 1) {
    KF(g, ctx, 'home_B', 1.0, 1.15, { x: -0.15, z: -0.3 });
    flag(g, ctx, 0.55, 0.15, 2.6, 0);
    barrels(g, ctx, 0.55, -0.55, 2, 0.6);
    K(g, ctx, 'crate_A_big', { s: 0.75, x: 0.75, z: -0.25 });
    K(g, ctx, 'crate_open', { s: 0.7, x: -0.7, z: 0.55 });
  } else if (L === 2) {
    KF(g, ctx, 'church', 1.0, 1.1, { z: -0.3, cutAbove: 1.5 });
    flag(g, ctx, -0.65, 0.35, 2.6, 0);
    flag(g, ctx, 0.65, 0.35, 2.6, 0);
    barrels(g, ctx, 0.62, -0.62, 2, 0.6);
  } else if (L === 3) {
    KF(g, ctx, 'church', 1.15, 1.25, { x: 0.15, z: -0.3, cutAbove: 1.5 });
    KF(g, ctx, 'tower_A', 0.5, 0.55, { x: -0.65, z: -0.5 });
    KF(g, ctx, 'well', 0.4, 0.45, { x: 0.65, z: 0.5 });
    flag(g, ctx, -0.62, 0.5, 2.6, 0);
  } else if (L === 4) {
    KF(g, ctx, 'tower_B', 0.85, 0.95, { z: -0.45 });
    KF(g, ctx, 'home_B', 0.62, 0.72, { x: -0.62, z: -0.35 });
    KF(g, ctx, 'home_B', 0.62, 0.72, { x: 0.62, z: -0.35 });
  } else if (L === 5) {
    KF(g, ctx, 'barracks', 1.5, 1.5, { z: -0.25 });
  } else if (L === 6) {
    KF(g, ctx, 'barracks', 1.45, 1.45, { z: -0.15 });
    KF(g, ctx, 'tower_B', 0.5, 0.55, { x: -0.72, z: -0.72 });
    KF(g, ctx, 'tower_B', 0.5, 0.55, { x: 0.72, z: -0.72 });
  } else {
    KF(g, ctx, 'castle', L >= 8 ? 1.5 : 1.4, L >= 8 ? 1.6 : 1.5, { z: -0.25, ...gold });
    if (L >= 8) {
      KF(g, ctx, 'tower_A', 0.42, 0.48, { x: -0.74, z: 0.1, ...gold });
      KF(g, ctx, 'tower_A', 0.42, 0.48, { x: 0.74, z: 0.1, ...gold });
    }
  }
  // place : fontaine, lampadaires, drapeaux
  if (L >= 4) {
    KF(g, ctx, 'k_pavement_fountain', 0.5, 0.5, { x: 0, z: 0.68 });
    ctx.out.emitters.push({ pos: [0, 0.28, 0.68], kind: 'water' });
    for (const s of [-1, 1]) lampPost(g, ctx, s * 0.42, 0.82, 0.62, s > 0 ? Math.PI : 0);
  }
  if (L >= 5) for (const s of [-1, 1]) flag(g, ctx, s * 0.85, 0.62, 2.8, L >= 8 ? 3 : 0);
  if (L >= 2 && L < 5) for (const s of [-1, 1]) treeKit(g, ctx, s * 0.82, 0.82, 0.5, 'round', 7 + s);
};

/* ───────── Production ───────── */
KM.garden = (g, L, ctx) => {
  pad(g, ctx, 0.92, 0.92, SOIL, { h: 0.02 });
  const rows = 4;
  for (let k = 0; k < rows; k++) cropRow(g, ctx, -0.32 + k * 0.17, -0.3, 0.26, k % 3, k);
  if (ctx.autumn) for (let k = 0; k < 3; k++) kit(g, 'hw_pumpkin_orange_small', { s: 0.13, x: -0.3 + k * 0.26, z: 0.36, rot: k });
  K(g, ctx, 'wheelbarrow', { s: 0.7, x: 0.36, z: 0.32, rot: 0.6 });
  if (L >= 2) K(g, ctx, 'crate_open', { s: 0.6, x: -0.34, z: -0.38 });
  if (L >= 3) K(g, ctx, 'tent', { s: 0.6, x: 0.3, z: -0.32 });
  else K(g, ctx, 'bucket_water', { s: 0.8, x: 0.36, z: -0.36 });
};

KM.lumber = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xb38f5f, { h: 0.01 });
  if (L >= 3) KF(g, ctx, 'home_A', 0.5, 0.52, { x: -0.22, z: -0.24, team: 0x8a5a3a });
  else K(g, ctx, 'tent', { s: 0.75, x: -0.22, z: -0.24 });
  K(g, ctx, 'resource_lumber', { s: 0.6, x: 0.2, z: 0.18 });
  if (L >= 2) K(g, ctx, 'resource_lumber', { s: 0.55, x: 0.22, z: -0.22, rot: 0.3 });
  for (const [x, z] of [[-0.3, 0.3], [-0.05, 0.38], [0.36, -0.42]]) K(g, ctx, 'tree_single_A_cut', { s: 0.75, x, z, snow: ctx.snow });
  K(g, ctx, 'wheelbarrow', { s: 0.6, x: 0.38, z: 0.36, rot: -0.5 });
  if (L >= 4) K(g, ctx, 'crate_A_big', { s: 0.6, x: -0.38, z: 0.05 });
};

KM.quarry = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xb8b2a6, { h: 0.01 });
  K(g, ctx, 'rock_single_C', { s: 1.5, x: -0.22, z: -0.2 });
  K(g, ctx, 'rock_single_E', { s: 1.2, x: 0.2, z: -0.28, rot: 1 });
  K(g, ctx, 'resource_stone', { s: 0.75, x: 0.22, z: 0.18 });
  if (L >= 2) K(g, ctx, 'resource_stone', { s: 0.6, x: -0.25, z: 0.25, rot: 1.2 });
  K(g, ctx, 'wheelbarrow', { s: 0.6, x: 0.02, z: 0.38, rot: 1.4 });
  if (L >= 3) K(g, ctx, 'tent', { s: 0.55, x: 0.33, z: -0.33 });
  if (L >= 4) K(g, ctx, 'bucket_empty', { s: 0.8, x: -0.4, z: 0.4 });
  if (L >= 5) K(g, ctx, 'ladder', { s: 0.5, x: -0.3, z: -0.45 });
};

KM.fisher = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, SAND, { h: 0.01 });
  KF(g, ctx, 'home_A', 0.52, 0.55, { x: -0.18, z: -0.22, team: 0x3f7fd1 });
  // ponton
  for (let k = 0; k < 3; k++) K(g, ctx, 'pallet', { s: 0.9, x: 0.28, z: -0.24 + k * 0.27 });
  barrels(g, ctx, 0.36, -0.3, 1, 0.55);
  K(g, ctx, 'bucket_water', { s: 0.8, x: 0.2, z: 0.05 });
  K(g, ctx, 'crate_long_C', { s: 0.5, x: -0.25, z: 0.3 });
  // barque
  if (kitHas('mk_boat_small')) KF(g, ctx, 'mk_boat_small', 0.2, 0.36, { x: 0.3, z: 0.36 });
  if (L >= 3) K(g, ctx, 'sack', { s: 0.9, x: -0.38, z: 0.05 });
};

KM.farm = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xa9c45a, { h: 0.006 });
  const grainTint = ctx.spring ? [0.62, 1.05, 0.5] : ctx.season === 1 ? null : ctx.autumn ? [1.05, 0.9, 0.7] : null;
  for (const [x, z] of [[-0.45, 0.4], [0.5, 0.4]]) {
    if (ctx.winter) pad(g, ctx, 0.84, 0.9, SOIL, { x, z, h: 0.03 });
    else KF(g, ctx, 'grain', 0.86, 0.96, { x, z, tint: grainTint });
  }
  if (L >= 3) {
    if (ctx.winter) pad(g, ctx, 0.84, 0.7, SOIL, { x: 0.5, z: -0.45, h: 0.03 });
    else KF(g, ctx, 'grain', 0.84, 0.75, { x: 0.5, z: -0.45, tint: grainTint });
  }
  KF(g, ctx, 'home_A', 0.78, 0.8, { x: -0.48, z: -0.48, team: 0xc0392b });
  if (L < 3) KF(g, ctx, 'tent', 0.5, 0.5, { x: 0.5, z: -0.5 });
  for (let k = 0; k < 3; k++) K(g, ctx, 'sack', { s: 1, x: 0.05 + k * 0.1, z: -0.32 });
  if (L >= 4 && kitHas('mk_tractor')) KF(g, ctx, 'mk_tractor', 0.36, 0.48, { x: 0.05, z: -0.6, rot: Math.PI / 2 });
  else K(g, ctx, 'wheelbarrow', { s: 0.75, x: 0.02, z: -0.62, rot: 1.2 });
  // clôtures
  K(g, ctx, 'fence_wood_straight', { s: 0.8, x: 0.82, z: 0.42 });
  K(g, ctx, 'fence_wood_straight', { s: 0.8, x: -0.02, z: 0.42 });
  if (L >= 4) barrels(g, ctx, -0.85, 0.0, 2, 0.6);
};

KM.mill = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, SAND, { h: 0.008 });
  KF(g, ctx, 'windmill', 0.9, 0.62, { z: -0.08, spin: 0.9 + L * 0.15 });
  K(g, ctx, 'sack', { s: 1, x: 0.33, z: 0.35 });
  if (L >= 2) K(g, ctx, 'sack', { s: 1, x: 0.22, z: 0.4, rot: 1 });
  if (L >= 3) K(g, ctx, 'crate_A_small', { s: 0.9, x: -0.34, z: 0.36 });
};

KM.bakery = (g, L, ctx) => {
  KF(g, ctx, 'home_B', 0.7, 0.82, { z: -0.07 });
  path(g, ctx, 0, 0.34, 0.5);
  K(g, ctx, 'crate_open', { s: 0.6, x: 0.33, z: 0.36 });
  K(g, ctx, 'sack', { s: 1, x: -0.33, z: 0.36 });
  barrels(g, ctx, -0.38, 0.12, 1, 0.5);
  // enseigne : une miche de pain
  g.box(0.24, 0.38, 0.38, 0.012, 0.012, 0.1, 0x5a3a22);
  g.ico(0.24, 0.33, 0.43, 0.04, 0xe0a85a, 0.55, 0.2, 3);
};

KM.sawmill = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xb38f5f, { h: 0.008 });
  KF(g, ctx, 'lumbermill', 0.82, 0.74, { z: -0.08, spin: 4 });
  K(g, ctx, 'resource_lumber', { s: 0.5, x: -0.22, z: 0.38 });
  if (L >= 2) K(g, ctx, 'pallet', { s: 0.8, x: 0.3, z: 0.38 });
};

KM.claypit = (g, L, ctx) => {
  KF(g, ctx, 'dirt', 0.9, 0.9, { tint: [1.25, 0.95, 0.75] });
  g.cyl(0.15, 0.02, 0.05, 0.16, 0.012, 10, 0x6aa8c8);
  K(g, ctx, 'bucket_water', { s: 0.8, x: -0.2, z: 0.25 });
  K(g, ctx, 'crate_open', { s: 0.6, x: 0.3, z: 0.34 });
  K(g, ctx, 'tent', { s: 0.55, x: -0.24, z: -0.25 });
  if (L >= 2) K(g, ctx, 'pallet', { s: 0.8, x: 0.3, z: -0.3 });
  if (L >= 3) K(g, ctx, 'wheelbarrow', { s: 0.6, x: -0.05, z: 0.38, rot: 1.4 });
};

KM.brickworks = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xb5a690, { h: 0.008 });
  const s = KF(g, ctx, 'tower_base', 0.42, 0.48, { x: 0.22, z: -0.22 });
  const top = kitTop('tower_base');
  smokeAt(ctx, 0.22, top[1] * s + 0.05, -0.22);
  KF(g, ctx, 'home_A', 0.5, 0.52, { x: -0.22, z: -0.2, team: 0xb5523b });
  const brick = [1.45, 0.62, 0.5];
  K(g, ctx, 'resource_stone', { s: 0.6, x: -0.2, z: 0.3, tint: brick });
  if (L >= 2) K(g, ctx, 'resource_stone', { s: 0.6, x: 0.25, z: 0.3, tint: brick, rot: 0.5 });
  if (L >= 3) K(g, ctx, 'pallet', { s: 0.8, x: 0.05, z: 0.08 });
};

KM.mine = (g, L, ctx) => {
  KF(g, ctx, 'mine', 0.86, 0.9, { z: -0.04 });
  K(g, ctx, 'wheelbarrow', { s: 0.6, x: 0.32, z: 0.38, rot: -0.4 });
  if (L >= 2) K(g, ctx, 'crate_A_big', { s: 0.6, x: -0.36, z: 0.38 });
};

KM.forge = (g, L, ctx) => {
  const s = KF(g, ctx, 'blacksmith', 0.9, 0.86, { z: -0.04 });
  const [tx, ty, tz] = kitTop('blacksmith');
  const [x0, , z0, x1, , z1] = kitBox('blacksmith');
  smokeAt(ctx, (tx - (x0 + x1) / 2) * s, ty * s + 0.03, (tz - (z0 + z1) / 2) * s - 0.04);
  barrels(g, ctx, -0.38, 0.38, 1, 0.5);
  if (L >= 2) K(g, ctx, 'weaponrack', { s: 0.9, x: 0.36, z: 0.4 });
};

/* ───────── Commerces ───────── */
KM.market = (g, L, ctx) => {
  pad(g, ctx, 0.94, 0.94, COBBLE, { h: 0.01 });
  KF(g, ctx, 'market', 0.92, 0.7, { z: -0.12 });
  K(g, ctx, 'crate_long_A', { s: 0.45, x: -0.25, z: 0.34 });
  if (L >= 2) K(g, ctx, 'crate_long_B', { s: 0.45, x: 0.22, z: 0.36 });
  if (L >= 3) barrels(g, ctx, 0.4, 0.15, 1, 0.5);
};

KM.tavern = (g, L, ctx) => {
  KF(g, ctx, 'tavern', 0.78, 0.86, { z: -0.08 });
  pad(g, ctx, 0.9, 0.16, COBBLE, { z: 0.4 });
  barrels(g, ctx, 0.36, 0.38, 1, 0.5);
  if (L >= 2) kit(g, 'hw_bench', { s: 0.16, x: -0.28, z: 0.4, snow: ctx.snow });
  if (L >= 3) lantern(g, ctx, -0.42, 0.18, 0.2);
};

KM.shop = (g, L, ctx) => {
  KF(g, ctx, 'city_A', 0.84, 0.86, { z: -0.04, floor: true, sx: ctx.bit(2) ? -1 : 1 });
  pad(g, ctx, 0.96, 0.14, COBBLE, { z: 0.42 });
  if (L >= 2) bush(g, ctx, 0.4, 0.42, 0.6);
  if (L >= 4) K(g, ctx, 'c_box_A', { s: 0.7, x: -0.4, z: 0.42 });
};

KM.mall = (g, L, ctx) => {
  pad(g, ctx, 1.96, 1.96, COBBLE, { h: 0.01 });
  const n = L >= 3 ? 'city_H' : L >= 2 ? 'city_G' : 'city_E';
  KF(g, ctx, n, 1.86, 1.4, { z: -0.24, floor: true });
  for (const s of [-1, 1]) {
    lampPost(g, ctx, s * 0.75, 0.82, 0.7, s > 0 ? Math.PI : 0);
    bush(g, ctx, s * 0.4, 0.82, 0.8);
  }
  K(g, ctx, 'c_bench', { s: 1.5, x: 0, z: 0.82 });
};

/* ───────── Services ───────── */
KM.well = (g, L, ctx) => {
  pad(g, ctx, 0.7, 0.7, COBBLE, { h: 0.01 });
  KF(g, ctx, 'well', 0.55, 0.6, {});
  K(g, ctx, 'bucket_water', { s: 0.8, x: 0.3, z: 0.28 });
  if (L >= 2) bush(g, ctx, -0.32, 0.3, 0.6);
};

KM.warehouse = (g, L, ctx) => {
  pad(g, ctx, 0.92, 0.92, 0xb8a888, { h: 0.008 });
  if (L >= 2) KF(g, ctx, 'home_A', 0.66, 0.66, { z: -0.14, team: 0x8a5a3a });
  else K(g, ctx, 'tent', { s: 0.95, z: -0.12 });
  K(g, ctx, 'crate_A_big', { s: 0.7, x: -0.36, z: 0.34 });
  K(g, ctx, 'crate_A_small', { s: 0.7, x: -0.36, z: 0.34, y: 0.15 });
  barrels(g, ctx, 0.3, 0.36, 2, 0.5);
  if (L >= 3) K(g, ctx, 'pallet', { s: 0.8, x: -0.05, z: 0.38 });
  if (L >= 4) K(g, ctx, 'crate_long_empty', { s: 0.5, x: 0.36, z: -0.38, rot: Math.PI / 2 });
};

KM.school = (g, L, ctx) => {
  KF(g, ctx, 'church', 0.72, 0.82, { z: -0.08, cutAbove: 1.5 });
  path(g, ctx, 0, 0.32, 0.5, 0.2);
  flag(g, ctx, 0.36, 0.3, 1.8, 3);
  if (L >= 2) K(g, ctx, 'c_bench', { s: 1.2, x: -0.3, z: 0.38 });
  if (L >= 3) treeKit(g, ctx, 0.38, -0.38, 0.4, 'round', ctx.v);
};

KM.clinic = (g, L, ctx) => {
  KF(g, ctx, 'home_B', 0.7, 0.82, { z: -0.07, team: 0xe8e8e8 });
  path(g, ctx, 0, 0.34, 0.5);
  // croix rouge
  const y = 0.2, z = 0.4;
  g.box(0.3, y - 0.07, z, 0.05, 0.14, 0.02, 0xe53935);
  g.box(0.3, y - 0.025, z, 0.14, 0.05, 0.02, 0xe53935);
  g.box(0.3, 0, z - 0.01, 0.02, y - 0.07, 0.02, 0x5a5a5a);
  bush(g, ctx, -0.34, 0.36, 0.6);
};

KM.firestation = (g, L, ctx) => {
  KF(g, ctx, 'tower_A', 0.56, 0.62, { x: -0.12, z: -0.16, variant: 1, team: null });
  for (let k = 0; k < 3; k++) K(g, ctx, 'bucket_water', { s: 0.75, x: 0.24 + k * 0.1, z: 0.36 });
  K(g, ctx, 'ladder', { s: 0.6, x: 0.32, z: -0.05, rot: -Math.PI / 2 });
  barrels(g, ctx, -0.36, 0.36, 1, 0.5);
  if (L >= 3) flag(g, ctx, 0.38, -0.35, 1.8, 1);
};

KM.police = (g, L, ctx) => {
  KF(g, ctx, 'barracks', 0.86, 0.86, { z: -0.04 });
  if (L >= 2) flag(g, ctx, 0.42, 0.42, 1.6, 0);
  if (L >= 3) K(g, ctx, 'weaponrack', { s: 0.8, x: -0.4, z: 0.42 });
};

KM.watertower = (g, L, ctx) => {
  pad(g, ctx, 0.8, 0.8, COBBLE, { h: 0.01 });
  K(g, ctx, 'c_watertower', { s: 1.5 + L * 0.12 });
  if (L >= 2) bush(g, ctx, 0.36, 0.36, 0.6);
};

KM.hospital = (g, L, ctx) => {
  pad(g, ctx, 1.96, 1.96, COBBLE, { h: 0.01 });
  const wall = 0xf4f1ea, trim = 0xd8d1c4, roof = ctx.snow ? 0xeef2f5 : 0x9ba3ab;
  const floors = 2 + L, fh = 0.3, h = floors * fh + 0.06;
  const z0 = -0.3, d = 1.0, w = 1.56;
  g.box(0, 0.01, z0, w, h, d, { top: roof, side: wall, back: shade(wall, 0.9), left: shade(wall, 0.94) });
  g.box(0, 0.01 + h, z0, w + 0.04, 0.05, d + 0.04, trim);
  for (let f = 1; f < floors; f++) g.box(0, 0.01 + f * fh, z0, w + 0.02, 0.025, d + 0.02, trim);
  for (let f = 0; f < floors; f++) {
    const y = 0.1 + f * fh;
    for (let k = 0; k < 6; k++) {
      const u = -0.62 + k * 0.248;
      if (f === 0 && Math.abs(u) < 0.2) continue;
      g.win('front', u, y, z0 + d / 2, 0.15, 0.15, 0xffffff);
    }
    for (let k = 0; k < 3; k++) g.win('right', z0 - 0.3 + k * 0.3, y, w / 2, 0.15, 0.15);
  }
  // entrée vitrée et marquise
  g.layer('glass');
  g.box(0, 0.01, z0 + d / 2 + 0.006, 0.34, 0.24, 0.012, 0x9fd3ea);
  g.layer('body');
  g.box(0, 0.3, z0 + d / 2 + 0.15, 0.62, 0.04, 0.32, { top: 0xe53935, side: 0xffffff });
  for (const s2 of [-1, 1]) g.box(s2 * 0.27, 0.01, z0 + d / 2 + 0.28, 0.03, 0.29, 0.03, 0xdadada);
  // croix rouges
  const cy = 0.01 + h - 0.2;
  g.box(0, cy - 0.09, z0 + d / 2 + 0.012, 0.07, 0.2, 0.02, 0xe53935);
  g.box(0, cy - 0.025, z0 + d / 2 + 0.012, 0.2, 0.07, 0.02, 0xe53935);
  // héliport sur le toit
  const ry = 0.06 + h;
  g.cyl(0.25, ry, z0 - 0.05, 0.3, 0.012, 16, 0x5b6068);
  g.box(0.18, ry + 0.013, z0 - 0.05, 0.03, 0.002, 0.22, 0xffffff);
  g.box(0.32, ry + 0.013, z0 - 0.05, 0.03, 0.002, 0.22, 0xffffff);
  g.box(0.25, ry + 0.013, z0 - 0.05, 0.14, 0.002, 0.03, 0xffffff);
  g.box(-0.45, ry, z0 - 0.15, 0.3, 0.14, 0.3, { top: 0xb9c0c7, side: 0xa7aeb5 });
  // ambulance et abords
  if (kitHas('mk_ambulance')) {
    const [x0, y0, zz0, x1, , z1] = kitBox('mk_ambulance');
    const s = 0.46 / Math.max(x1 - x0, z1 - zz0);
    K(g, ctx, 'mk_ambulance', { s, x: 0.62, y: -y0 * s, z: 0.62, rot: Math.PI / 2, noGlass: true });
  }
  for (const s2 of [-1, 1]) lampPost(g, ctx, s2 * 0.88, 0.86, 0.62, s2 > 0 ? Math.PI : 0);
  bush(g, ctx, -0.5, 0.42, 0.8);
  bush(g, ctx, -0.7, 0.42, 0.8);
  treeKit(g, ctx, -0.75, 0.78, 0.9, 'round', 11);
};

/* ───────── Décors ───────── */
KM.tree = (g, L, ctx) => {
  const kind = ctx.bit(1) ? 'pine' : 'round';
  treeKit(g, ctx, 0, 0, kind === 'round' ? 1.25 : 0.8 + ctx.rand(1) * 0.25, kind, ctx.v);
};

KM.forest = (g, L, ctx) => {
  treeKit(g, ctx, -0.2, -0.18, 0.75, 'pine', 1);
  treeKit(g, ctx, 0.2, -0.05, 0.85, 'pine', 2);
  treeKit(g, ctx, -0.05, 0.24, 0.7, 'pine', 3);
};

KM.bench = (g, L, ctx) => {
  K(g, ctx, 'c_bench', { s: 1.3 });
  lampPost(g, ctx, 0.26, -0.06, 0.55, Math.PI);
  bush(g, ctx, -0.27, -0.05, 0.6);
};

KM.fountain = (g, L, ctx) => {
  KF(g, ctx, 'k_pavement_fountain', 0.96, 0.96, {});
  ctx.out.emitters.push({ pos: [0, 0.5, 0], kind: 'water' });
};

KM.park = (g, L, ctx) => {
  pad(g, ctx, 1.96, 1.96, 0xa6cc55, { h: 0.008 });
  g.box(0, 0.008, 0, 1.9, 0.006, 0.2, { top: ctx.ground(SAND), side: SAND });
  g.box(0, 0.008, 0, 0.2, 0.006, 1.9, { top: ctx.ground(SAND), side: SAND });
  KF(g, ctx, 'k_pavement_fountain', 0.62, 0.62, {});
  ctx.out.emitters.push({ pos: [0, 0.32, 0], kind: 'water' });
  const trees = [[-0.6, -0.6, 'round'], [0.62, -0.58, 'pine'], [-0.62, 0.6, 'pine'], [0.6, 0.62, 'round'], [-0.85, -0.2, 'pine'], [0.25, -0.85, 'round']];
  trees.slice(0, 3 + L).forEach(([x, z, k], i) => treeKit(g, ctx, x, z, k === 'round' ? 1.1 : 0.7, k, i + ctx.v));
  K(g, ctx, 'c_bench', { s: 1.4, x: 0.42, z: -0.2 });
  K(g, ctx, 'c_bench', { s: 1.4, x: -0.42, z: 0.2, rot: Math.PI });
  for (const [x, z] of [[0.25, 0.25], [-0.25, -0.25]]) lantern(g, ctx, x, z, 0.2);
  for (const [x, z] of [[0.85, -0.25], [0.85, 0.2], [-0.25, 0.85]]) bush(g, ctx, x, z, 0.8);
  if (L >= 3) KF(g, ctx, 'tent', 0.5, 0.5, { x: 0.55, z: 0.25 });
};

KM.bandstand = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xa6cc55, { h: 0.008 });
  g.cyl(0, 0, 0, 0.36, 0.06, 8, 0xc9c1ae);
  K(g, ctx, 'tent', { s: 1.25, y: 0.06, team: ctx.team });
  for (const s of [-1, 1]) K(g, ctx, 'c_bench', { s: 1.1, x: s * 0.33, z: 0.4, rot: s > 0 ? 0.4 : -0.4 });
};

/* ───────── Monuments ───────── */
KM.clocktower = (g, L, ctx) => {
  pad(g, ctx, 0.96, 0.96, COBBLE, { h: 0.01 });
  const s = KF(g, ctx, 'tower_B', 0.8, 0.9, {});
  const [, , , , y1] = kitBox('tower_B');
  const yc = y1 * 0.5;
  const [ex, ez] = kitExtent('tower_B', yc - 0.08, yc + 0.08);
  const cy = yc * s, hw = ex * s, hd = ez * s;
  for (let f = 0; f < 4; f++) {
    g.push((f * Math.PI) / 2, 0, 0, 0);
    const r = (f % 2 ? hw : hd) * 0.98;
    g.discZ(0, cy, r + 0.01, 0.11, 16, 0xfaf6ea);
    g.box(0, cy + 0.03, r + 0.016, 0.012, 0.07, 0.006, 0x222222);
    g.box(0.025, cy, r + 0.018, 0.06, 0.012, 0.006, 0x222222);
    g.pop();
  }
};

KM.castle = (g, L, ctx) => {
  pad(g, ctx, 2.96, 2.96, 0xa6cc55, { h: 0.008 });
  path(g, ctx, 0, 0.6, 1.5, 0.36);
  KF(g, ctx, 'castle', 1.9, 2.1, { z: -0.3 });
  const towers = [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.1], [1.2, 1.1]];
  for (const [x, z] of towers) KF(g, ctx, 'tower_A', 0.5, 0.55, { x, z });
  // remparts
  const ws = 0.5;
  for (const s of [-1, 1]) {
    K(g, ctx, 'wall_straight', { s: ws, x: s * 1.22, z: -0.05, rot: Math.PI / 2 });
    K(g, ctx, 'wall_straight', { s: ws, x: 0, z: -1.24 });
    K(g, ctx, 'wall_straight', { s: ws * 0.85, x: s * 0.72, z: 1.14 });
  }
  K(g, ctx, 'wall_straight_gate', { s: ws * 0.5, x: 0, z: 1.12 });
  for (const s of [-1, 1]) flag(g, ctx, s * 0.32, 1.36, 2.6, 0);
};

/* ───────── Repli : les modèles faits main restent disponibles ───────── */
export function hasKitModel(type) {
  return !!KM[type] && kitHas('home_A');
}
