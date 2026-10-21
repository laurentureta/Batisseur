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

/* ───────── Décorations exclusives ───────── */
const GOLD = [1.6, 1.25, 0.45];
function hw(g, ctx, name, s, o = {}) {
  return kit(g, 'hw_' + name, { s, snow: ctx.snow, ...o });
}
function glowBox(g, x, y, z, w, h, d, color) {
  g.layer('glass');
  g.box(x, y, z, w, h, d, color);
  g.layer('body');
}
function giftBox(g, x, z, w, h, color, ribbon = 0xf2c14e, y = 0) {
  g.box(x, y, z, w, h, w, { top: shade(color, 1.1), side: color });
  g.box(x, y + h, z, w + 0.004, 0.012, w * 0.22, ribbon);
  g.box(x, y + h, z, w * 0.22, 0.012, w + 0.004, ribbon);
  g.box(x, y, z, w * 0.22, h, w + 0.004, ribbon);
}

KM.x_pumpkins = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, SOIL, { h: 0.015 });
  hw(g, ctx, 'pumpkin_orange_jackolantern', 0.2, { x: 0.05, z: 0.05 });
  for (const [x, z, n, s2] of [[-0.25, -0.22, 'pumpkin_orange', 0.17], [0.27, -0.2, 'pumpkin_yellow', 0.15], [-0.28, 0.25, 'pumpkin_orange_small', 0.2], [0.3, 0.28, 'pumpkin_yellow_small', 0.2], [0.02, -0.33, 'pumpkin_orange_small', 0.16]]) hw(g, ctx, n, s2, { x, z, rot: x * 9 });
  glowBox(g, 0.05, 0.08, 0.17, 0.08, 0.05, 0.01, 0xffa23a);
};
KM.x_lantern = (g, L, ctx) => {
  hw(g, ctx, 'post_lantern', 0.24, { x: -0.05 });
  hw(g, ctx, 'pumpkin_orange_small', 0.18, { x: 0.2, z: 0.18 });
  hw(g, ctx, 'candle_triple', 0.3, { x: -0.22, z: 0.22 });
};
KM.x_haunted_tree = (g, L, ctx) => {
  pad(g, ctx, 0.8, 0.8, 0x6e7a4a, { h: 0.008 });
  hw(g, ctx, 'tree_dead_large_decorated', 0.25, {});
  hw(g, ctx, 'gravemarker_A', 0.25, { x: 0.27, z: 0.27, rot: -0.3 });
  hw(g, ctx, 'pumpkin_orange_jackolantern', 0.14, { x: -0.26, z: 0.22, rot: 0.4 });
  hw(g, ctx, 'pumpkin_yellow_small', 0.16, { x: -0.05, z: 0.32 });
  glowBox(g, -0.26, 0.06, 0.3, 0.05, 0.035, 0.01, 0xffa23a);
};
KM.x_gate = (g, L, ctx) => {
  pad(g, ctx, 1.9, 0.6, 0xa9a392, { h: 0.01 });
  hw(g, ctx, 'arch_gate', 0.4, {});
  for (const sx of [-1, 1]) {
    hw(g, ctx, 'fence_pillar', 0.25, { x: sx * 0.88 });
    hw(g, ctx, 'lantern_standing', 0.18, { x: sx * 0.62, z: 0.25 });
  }
};
KM.x_crypt = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0x8f9a6a, { h: 0.01 });
  hw(g, ctx, 'crypt', 0.17, { z: -0.25 });
  for (const [x, z, n] of [[-0.65, 0.45, 'gravestone'], [-0.3, 0.6, 'grave_A'], [0.35, 0.55, 'gravestone'], [0.7, 0.35, 'gravemarker_A']]) hw(g, ctx, n, 0.17, { x, z, rot: x * 0.5 });
  for (const sx of [-1, 1]) hw(g, ctx, 'post_lantern', 0.18, { x: sx * 0.85, z: -0.7 });
  hw(g, ctx, 'fence', 0.2, { x: -0.55, z: 0.9 });
  hw(g, ctx, 'fence', 0.2, { x: 0.55, z: 0.9 });
  hw(g, ctx, 'candle_triple', 0.3, { x: 0, z: 0.4 });
};
KM.x_candles = (g, L, ctx) => {
  hw(g, ctx, 'shrine_candles', 0.32, {});
  hw(g, ctx, 'candle_triple', 0.28, { x: 0.28, z: 0.25 });
  hw(g, ctx, 'candle_triple', 0.24, { x: -0.3, z: 0.22, rot: 1 });
  hw(g, ctx, 'skull_candle', 0.12, { x: 0.3, z: -0.25 });
};
KM.x_snowman = (g, L, ctx) => {
  pad(g, ctx, 0.6, 0.6, 0xeef3f6, { h: 0.012 });
  const w = 0xf4f7fa;
  g.ico(0, 0.13, 0, 0.14, w, 0.95, 0.12, 1);
  g.ico(0, 0.33, 0, 0.1, w, 0.95, 0.1, 2);
  g.ico(0, 0.49, 0, 0.075, w, 1, 0.08, 3);
  g.cyl(0, 0.55, 0, 0.06, 0.012, 8, 0x2b2b30);
  g.cyl(0, 0.56, 0, 0.042, 0.08, 8, 0x2b2b30);
  g.cone(0, 0.49, 0.06, 0.016, 0.07, 5, 0xf08a2a);
  g.push(Math.PI / 2, 0, 0, 0);
  g.pop();
  for (const sx of [-1, 1]) g.box(sx * 0.03, 0.51, 0.068, 0.014, 0.014, 0.01, 0x222222);
  g.box(0, 0.4, 0.07, 0.17, 0.035, 0.05, 0xd2232a);
  for (const sx of [-1, 1]) g.cylX(sx * 0.16, 0.34, 0, 0.008, 0.14, 4, 0x6b4129);
};
KM.x_gifts = (g, L, ctx) => {
  const cols = [0xd2232a, 0x2f7fc4, 0x00a651, 0x9b59d6, 0xf7a93b];
  giftBox(g, -0.12, -0.08, 0.2, 0.16, cols[0]);
  giftBox(g, 0.14, -0.1, 0.17, 0.13, cols[1], 0xffffff);
  giftBox(g, 0.02, 0.16, 0.18, 0.12, cols[2]);
  giftBox(g, -0.1, -0.08, 0.12, 0.1, cols[3], 0xffffff, 0.17);
  giftBox(g, 0.24, 0.2, 0.1, 0.08, cols[4]);
};
KM.x_xmas_tree = (g, L, ctx) => {
  kit(g, 'tree_single_B', { s: 0.75, snow: ctx.snow });
  const lights = [0xff4d4d, 0xffd34d, 0x4dd2ff, 0x7dff6b];
  for (let k = 0; k < 18; k++) {
    const a = k * 2.4, y = 0.12 + (k / 18) * 0.62, r = 0.25 * (1 - (k / 18) * 0.8);
    glowBox(g, Math.cos(a) * r, y, Math.sin(a) * r, 0.03, 0.03, 0.03, lights[k % 4]);
  }
  glowBox(g, 0, 0.86, 0, 0.07, 0.07, 0.03, 0xffe066);
  giftBox(g, 0.22, 0.24, 0.1, 0.08, 0xd2232a);
  giftBox(g, -0.2, 0.25, 0.09, 0.07, 0x2f7fc4, 0xffffff);
};
KM.x_sleigh = (g, L, ctx) => {
  const red = 0xc0292b;
  g.box(0, 0.06, 0, 0.26, 0.1, 0.46, { top: shade(red, 0.8), side: red });
  g.box(0, 0.16, -0.17, 0.26, 0.12, 0.08, red);
  for (const sx of [-1, 1]) {
    g.box(sx * 0.11, 0.0, 0, 0.02, 0.02, 0.52, 0xf2c14e);
    g.box(sx * 0.11, 0.02, 0.24, 0.02, 0.06, 0.02, 0xf2c14e);
  }
  giftBox(g, -0.04, -0.02, 0.1, 0.08, 0x00a651, 0xffffff, 0.16);
  giftBox(g, 0.06, 0.08, 0.08, 0.07, 0x2f7fc4, 0xf2c14e, 0.16);
};
KM.x_ice_rink = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xe9eef2, { h: 0.012 });
  g.cyl(0, 0.012, 0, 0.78, 0.015, 20, 0xbfe6f5);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.box(Math.cos(a) * 0.82, 0.01, Math.sin(a) * 0.82, 0.05, 0.12, 0.05, 0x8a5a3a);
  }
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) hw(g, ctx, 'lantern_standing', 0.2, { x, z });
  kit(g, 'tree_single_B', { s: 0.45, x: 0.0, z: 0.0, snow: 0.8 });
};
KM.x_star_lamp = (g, L, ctx) => {
  const s2 = 0.8;
  K(g, ctx, 'c_streetlight', { s: s2, x: 0.08 });
  glowBox(g, 0.08 - 0.21 * s2, 0.885 * s2, 0, 0.06, 0.03, 0.05, 0xfff1c2);
  g.layer('glass');
  const sy = 0.96 * s2 + 0.07;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    g.box(0.08 + Math.cos(a) * 0.035, sy + Math.sin(a) * 0.035, 0, 0.03, 0.03, 0.02, 0xffd34d);
  }
  g.box(0.08, sy, 0, 0.04, 0.04, 0.025, 0xffe680);
  g.layer('body');
  giftBox(g, -0.2, 0.2, 0.09, 0.07, 0xd2232a);
};
KM.x_tulips = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, SOIL, { h: 0.02 });
  const cols = [0xff4d6d, 0xffd34d, 0xff8fc2, 0xffffff, 0xb36bff, 0xff7a2a];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 6; k++) {
      const x = -0.32 + k * 0.13, z = -0.3 + r * 0.2;
      g.cyl(x, 0.02, z, 0.006, 0.07, 4, 0x3f9e3a);
      g.ico(x, 0.1, z, 0.028, cols[(r + k) % cols.length], 1.2, 0.2, r * 7 + k);
    }
  }
};
KM.x_beehive = (g, L, ctx) => {
  pad(g, ctx, 0.8, 0.8, 0xb9cf6a, { h: 0.008 });
  for (const [x, z] of [[-0.2, -0.1], [0.18, -0.12], [0, 0.2]]) {
    g.box(x, 0.0, z, 0.16, 0.05, 0.16, 0x8a5a3a);
    for (let k = 0; k < 3; k++) g.box(x, 0.05 + k * 0.06, z, 0.15 - k * 0.012, 0.055, 0.15 - k * 0.012, { top: 0xf2c14e, side: k % 2 ? 0xe0a83a : 0xf0b84a });
    g.roof(x, 0.23, z, 0.19, 0.19, 0.06, 0.19, 0xb06a3a);
  }
  for (let k = 0; k < 8; k++) g.ico(-0.3 + k * 0.09, 0.05, 0.35, 0.025, [0xff4d6d, 0xffd34d, 0xffffff][k % 3], 1, 0, k);
};
KM.x_cherry_tree = (g, L, ctx) => {
  g.cyl(0, 0, 0, 0.05, 0.3, 6, 0x6b4129, 0.035);
  const pinks = [0xff9ec7, 0xffb3d4, 0xff86b8];
  g.ico(0, 0.42, 0, 0.24, pinks[0], 0.85, 0.3, 4);
  g.ico(0.12, 0.52, -0.05, 0.15, pinks[1], 0.9, 0.25, 5);
  g.ico(-0.12, 0.5, 0.06, 0.14, pinks[2], 0.9, 0.25, 6);
  for (let k = 0; k < 6; k++) g.box(-0.3 + k * 0.12, 0.002, 0.25 - (k % 2) * 0.4, 0.03, 0.004, 0.03, pinks[k % 3]);
};
KM.x_flower_arch = (g, L, ctx) => {
  pad(g, ctx, 1.9, 0.6, 0xb9cf6a, { h: 0.008 });
  hw(g, ctx, 'arch', 0.4, { tint: [1.05, 1.02, 0.95] });
  const cols = [0xff4d6d, 0xffd34d, 0xff8fc2, 0xffffff];
  for (let k = 0; k < 22; k++) {
    const a = Math.PI * (k / 21);
    g.ico(Math.cos(a) * 0.62, 0.98 + Math.sin(a) * 0.62 * 0.9 - 0.4, 0.17, 0.045, cols[k % 4], 1, 0.2, k);
  }
  for (const sx of [-1, 1]) bush(g, ctx, sx * 0.8, 0.12, 0.9);
};
KM.x_hedge_maze = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xd9c79e, { h: 0.008 });
  const hedge = ctx.winter ? 0xdfe8e4 : 0x3f8f3a;
  const walls = [[0, -0.9, 1.8, 0.1], [0, 0.9, 1.8, 0.1], [-0.9, 0, 0.1, 1.8], [0.9, 0, 0.1, 1.8], [-0.35, -0.5, 0.9, 0.1], [0.4, -0.1, 0.9, 0.1], [-0.4, 0.35, 0.8, 0.1], [0.3, 0.55, 0.1, 0.6], [-0.1, -0.25, 0.1, 0.5]];
  for (const [x, z, w, d] of walls) g.box(x, 0.008, z, w, 0.16, d, { top: shade(hedge, 1.12), side: hedge });
  KF(g, ctx, 'k_pavement_fountain', 0.36, 0.36, { x: 0.45, z: 0.25 });
};
KM.x_birdbath = (g, L, ctx) => {
  KF(g, ctx, 'k_pavement_fountain', 0.62, 0.62, {});
  for (const [x, z, c] of [[0.12, 0.05, 0x5aa0e6], [-0.1, -0.08, 0xe65a5a], [0.02, 0.14, 0xf2c14e]]) {
    g.ico(x, 0.3, z, 0.03, c, 0.9, 0, 1);
    g.ico(x + 0.02, 0.33, z, 0.018, c, 1, 0, 2);
  }
  ctx.out.emitters.push({ pos: [0, 0.32, 0], kind: 'water' });
};
KM.x_gold_coins = (g, L, ctx) => {
  K(g, ctx, 'crate_open', { s: 1.1, tint: [1.1, 0.95, 0.8] });
  for (let k = 0; k < 14; k++) g.cyl(-0.12 + (k % 5) * 0.06, 0.12 + Math.floor(k / 5) * 0.015, -0.03 + (k % 3) * 0.03, 0.025, 0.01, 8, 0xf2c14e);
  for (let k = 0; k < 6; k++) g.cyl(0.2 + (k % 2) * 0.05, 0, 0.18 + Math.floor(k / 2) * 0.05, 0.025, 0.01 + (k % 3) * 0.01, 8, 0xf2c14e);
  g.ico(-0.25, 0.04, 0.2, 0.04, 0xe53935, 0.7, 0, 3);
  g.ico(-0.18, 0.035, 0.25, 0.035, 0x2f7fc4, 0.7, 0, 4);
};
KM.x_banners = (g, L, ctx) => {
  for (let k = 0; k < 4; k++) flag(g, ctx, -0.36 + k * 0.24, 0.1 * (k % 2 ? 1 : -1), 1.8, k % 4);
  pad(g, ctx, 0.9, 0.3, COBBLE, { h: 0.01 });
};
KM.x_gold_statue = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, COBBLE, { h: 0.01 });
  g.box(0, 0.01, 0, 0.42, 0.1, 0.42, { top: 0xd8d2c4, side: 0xbab3a3 });
  g.box(0, 0.11, 0, 0.3, 0.24, 0.3, { top: 0xe2dccd, side: 0xcbc4b4 });
  const gold = 0xf2c14e;
  g.box(0, 0.35, 0, 0.12, 0.24, 0.09, gold);
  g.box(0.08, 0.5, 0, 0.18, 0.045, 0.045, gold);
  g.ico(0, 0.66, 0, 0.065, gold, 1, 0, 1);
  g.cone(0, 0.71, 0, 0.07, 0.08, 6, shade(gold, 1.1));
  g.cyl(0.16, 0.5, 0, 0.014, 0.26, 4, gold);
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) bush(g, ctx, x, z, 0.7);
};
KM.x_obelisk = (g, L, ctx) => {
  pad(g, ctx, 0.8, 0.8, COBBLE, { h: 0.01 });
  g.box(0, 0.01, 0, 0.4, 0.08, 0.4, 0xc9c1ae);
  g.cyl(0, 0.09, 0, 0.14, 1.1, 4, 0xe2d9c3, 0.07, false);
  g.cone(0, 1.19, 0, 0.1, 0.14, 4, 0xf2c14e);
  for (let k = 0; k < 4; k++) g.box(0, 0.4 + k * 0.18, 0.1 - k * 0.006, 0.08, 0.03, 0.01, 0xb8ad94);
};
KM.x_royal_fountain = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, COBBLE, { h: 0.01 });
  KF(g, ctx, 'k_pavement_fountain', 1.6, 1.6, { tint: [1.12, 1.02, 0.82] });
  g.cyl(0, 0.5, 0, 0.05, 0.25, 8, 0xf2c14e);
  g.ico(0, 0.8, 0, 0.08, 0xf2c14e, 1, 0, 2);
  ctx.out.emitters.push({ pos: [0, 0.86, 0], kind: 'water' });
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) lantern(g, ctx, x, z, 0.2);
};
KM.x_throne = (g, L, ctx) => {
  pad(g, ctx, 0.8, 0.8, 0xb03a3a, { h: 0.012 });
  const gold = 0xf2c14e, red = 0xc0292b;
  g.box(0, 0.012, -0.05, 0.36, 0.08, 0.3, gold);
  g.box(0, 0.09, -0.05, 0.28, 0.12, 0.24, { top: red, side: gold });
  g.box(0, 0.21, -0.17, 0.3, 0.42, 0.06, { top: gold, side: gold, front: red });
  g.cone(0, 0.63, -0.17, 0.08, 0.1, 4, gold);
  for (const sx of [-1, 1]) g.box(sx * 0.16, 0.21, -0.05, 0.04, 0.1, 0.24, gold);
  for (const sx of [-1, 1]) g.cyl(sx * 0.32, 0.012, -0.3, 0.02, 0.6, 5, gold);
  g.box(0, 0.62, -0.3, 0.7, 0.02, 0.2, red);
};
KM.x_camp = (g, L, ctx) => {
  K(g, ctx, 'tent', { s: 0.85, x: -0.12, z: -0.14 });
  barrels(g, ctx, 0.28, -0.25, 2, 0.5);
  K(g, ctx, 'crate_A_small', { s: 0.8, x: 0.3, z: 0.05 });
  // feu de camp
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.box(0.12 + Math.cos(a) * 0.08, 0, 0.25 + Math.sin(a) * 0.08, 0.04, 0.03, 0.04, 0x8a8a84);
  }
  g.layer('glass');
  g.cone(0.12, 0.01, 0.25, 0.05, 0.1, 5, 0xff8a2a);
  g.layer('body');
  smokeAt(ctx, 0.12, 0.12, 0.25);
};
KM.x_grove = (g, L, ctx) => {
  for (const [x, z, s2, k, i] of [[-0.2, -0.2, 0.8, 'pine', 1], [0.2, -0.15, 0.95, 'pine', 2], [-0.05, 0.2, 1.0, 'round', 3], [0.28, 0.28, 0.6, 'pine', 4], [-0.3, 0.25, 0.55, 'round', 5]]) treeKit(g, ctx, x, z, s2, k, i);
};
KM.x_fruit_cart = (g, L, ctx) => {
  K(g, ctx, 'wheelbarrow', { s: 0.95, rot: 0.5 });
  K(g, ctx, 'crate_long_A', { s: 0.5, x: 0.22, z: 0.25, rot: 1 });
  K(g, ctx, 'crate_long_B', { s: 0.5, x: -0.22, z: -0.25, rot: -0.4 });
};
KM.x_archery = (g, L, ctx) => {
  pad(g, ctx, 0.9, 0.9, 0xb9cf6a, { h: 0.006 });
  K(g, ctx, 'target', { s: 1.1, x: -0.2, z: -0.25 });
  K(g, ctx, 'target', { s: 1.1, x: 0.22, z: -0.25 });
  K(g, ctx, 'bucket_arrows', { s: 1, x: 0.3, z: 0.25 });
  K(g, ctx, 'weaponrack', { s: 1, x: -0.25, z: 0.28 });
};
KM.x_mini_mill = (g, L, ctx) => {
  KF(g, ctx, 'windmill', 0.6, 0.45, { spin: 1.2 });
  bush(g, ctx, 0.3, 0.3, 0.6);
  K(g, ctx, 'sack', { s: 0.9, x: -0.3, z: 0.3 });
};
KM.x_watchtower = (g, L, ctx) => {
  KF(g, ctx, 'tower_A', 0.62, 0.7, {});
  flag(g, ctx, 0.3, 0.3, 1.5, ctx.roofVar ?? 0);
};
KM.x_catapult = (g, L, ctx) => {
  KF(g, ctx, 'tower_catapult', 0.66, 0.8, {});
  K(g, ctx, 'resource_stone', { s: 0.4, x: 0.32, z: 0.3 });
};

/* ───────── Repli : les modèles faits main restent disponibles ───────── */
export function hasKitModel(type) {
  return !!KM[type] && kitHas('home_A');
}
