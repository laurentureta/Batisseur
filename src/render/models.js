// Modèles 3D low-poly de tous les bâtiments, générés en code (aucune image à charger).
// Repère local : emprise centrée sur (0, 0), façade avant tournée vers +z, sol à y = 0.
import { GeoBuilder, shade, mix } from './geom.js';
import { BUILDINGS } from '../data/buildings.js';
import { ROOF_THEMES } from '../data/cosmetics.js';
import { KM, hasKitModel, treeKit } from './kitModels.js';
import './eventModels.js'; // décorations des événements de la semaine

export const P = {
  wood: 0x9b6b43, woodDark: 0x6e4a2f, woodLight: 0xc49a6c, plank: 0xb98a5a,
  straw: 0xd9b45a, thatch: 0xb98f3e,
  plaster: 0xf3ead8, cream: 0xf6efdf, warm: 0xf1d9b5,
  stone: 0xb7b2a8, stoneDark: 0x8f8a80, stoneLight: 0xd3cfc6, cobble: 0xc9c2b4,
  brick: 0xb5523b, brickDark: 0x8e3e2c,
  roofRed: 0xc4553a, roofTerra: 0xd06b45, roofSlate: 0x5b6475, roofBlue: 0x4f78a8, roofGreen: 0x5e8c5a,
  door: 0x6b4429, lawn: 0xa8c84c, grassDark: 0x5f9e3c, hedge: 0x4f8f3a, leaf: 0x5aa83c, leafDark: 0x3f8a2e,
  pine: 0x3d7d4a, trunk: 0x7a5232, water: 0x58b7e0, metal: 0x8d99a6, dark: 0x3a3a40, black: 0x26262b,
  white: 0xf8f8f8, red: 0xd9443a, yellow: 0xf2c94c, blue: 0x3f7fd1, orange: 0xe8873a, purple: 0x9b6bd1, pink: 0xf08bb4,
  field: 0xd8c25a, fieldGreen: 0x8fbf4a, soil: 0x8a6440, soilDark: 0x6e4f33, clay: 0xc77a4a, gold: 0xe8b84a,
  sand: 0xe6d39a, gravel: 0xa9a39a, asphalt: 0x5d6066, pitch: 0x5fae4a,
};

const WALLS = [0xf3ead8, 0xf1d9b5, 0xf6efdf, 0xf2d4c9, 0xf4e3a1, 0xd9e6ef, 0xe8d5c4, 0xe9e2f0];
const STONE_WALLS = [0xc8c1b3, 0xb7b2a8, 0xd2c6ad, 0xbfb6a6, 0xcdbfa4];
const ROOFS = [0xc4553a, 0xd06b45, 0x5b6475, 0x9a5b3a, 0xb8483a, 0x6b7c8f, 0xc77a4a];
const AWNINGS = [0xd9443a, 0x3f7fd1, 0x4caf50, 0xf2a93b, 0x9b6bd1];
const FLOWERS = [0xe94b5a, 0xf2c94c, 0xf08bb4, 0x9b6bd1, 0xffffff, 0xf2843a];

function fract(x) {
  return x - Math.floor(x);
}

function makeCtx(variant, season, theme = 'mix') {
  const winter = season === 3, autumn = season === 2, spring = season === 0;
  const th = ROOF_THEMES[theme] || ROOF_THEMES.mix;
  return {
    v: variant,
    season,
    winter,
    autumn,
    spring,
    roofVar: th.variant ?? (variant & 3),
    team: th.team ?? null,
    snow: winter ? 0.78 : 0,
    dim: false,
    out: null,
    roof: (c) => (winter ? mix(c, 0xf2f6f9, 0.62) : c),
    ground: (c) => (winter ? mix(c, 0xeef3f6, 0.78) : autumn ? mix(c, 0xb5a24a, 0.28) : c),
    leaf: (c) => (winter ? mix(c, 0xe3eaee, 0.55) : autumn ? mix(c, 0xd9822b, 0.62) : spring ? mix(c, 0x9ad66d, 0.2) : c),
    pick: (arr, salt = 0) => arr[(variant + salt * 7) % arr.length],
    bit: (k) => (variant >> k) & 1,
    rand: (salt = 0) => fract(Math.sin(variant * 12.9898 + salt * 78.233) * 43758.5453),
  };
}

/* ───────── Petits éléments réutilisables ───────── */
function plot(g, w, d, color, h = 0.03) {
  g.box(0, 0, 0, w - 0.06, h, d - 0.06, { top: color, side: shade(color, 0.82) });
}

function fence(g, w, d, color, y = 0.03, frontGap = 0.3) {
  const hw = w / 2 - 0.05, hd = d / 2 - 0.05;
  const post = (x, z) => g.box(x, y, z, 0.03, 0.09, 0.03, color);
  for (let k = 0; k <= 4; k++) {
    const t = -hw + (2 * hw * k) / 4;
    post(t, -hd);
    if (k > 0 && k < 4) {
      post(-hw, -hd + (2 * hd * k) / 4);
      post(hw, -hd + (2 * hd * k) / 4);
    }
    if (Math.abs(t) > frontGap / 2) post(t, hd);
  }
  g.box(0, y + 0.055, -hd, 2 * hw, 0.015, 0.015, color);
  g.box(-hw, y + 0.055, 0, 0.015, 0.015, 2 * hd, color);
  g.box(hw, y + 0.055, 0, 0.015, 0.015, 2 * hd, color);
  const seg = hw - frontGap / 2;
  g.box(-hw + seg / 2, y + 0.055, hd, seg, 0.015, 0.015, color);
  g.box(hw - seg / 2, y + 0.055, hd, seg, 0.015, 0.015, color);
}

function bush(g, ctx, x, z, r, color = P.hedge, y = 0.03) {
  g.ico(x, y + r * 0.7, z, r, ctx.leaf(color), 0.75, 0.25, x * 13 + z * 7);
}

function tree(g, ctx, x, z, s = 1, kind = 'round', y = 0.03, salt = 0) {
  if (kind === 'pine') {
    g.cyl(x, y, z, 0.035 * s, 0.12 * s, 5, P.trunk);
    const c = ctx.leaf(P.pine);
    g.cone(x, y + 0.08 * s, z, 0.17 * s, 0.3 * s, 7, c);
    g.cone(x, y + 0.22 * s, z, 0.12 * s, 0.24 * s, 7, shade(c, 1.08));
  } else {
    g.cyl(x, y, z, 0.03 * s, 0.18 * s, 5, P.trunk);
    const c = ctx.leaf(salt % 2 ? P.leaf : P.leafDark);
    g.ico(x, y + 0.28 * s, z, 0.15 * s, c, 0.95, 0.3, x * 31 + z * 17 + salt);
  }
}

function chimney(g, out, x, y, z, color = P.stoneDark, h = 0.16, kind = 'smoke') {
  g.box(x, y, z, 0.07, h, 0.07, { top: P.black, side: color });
  out.emitters.push({ pos: g._v(x, y + h + 0.02, z), kind });
}

function flagPole(g, out, x, z, h = 0.6, colors = [P.blue, P.white, P.red], y = 0.03) {
  g.cyl(x, y, z, 0.012, h, 5, P.metal);
  g.ico(x, y + h + 0.01, z, 0.018, P.gold);
  const flag = new GeoBuilder();
  const w = 0.075;
  colors.forEach((c, k) => flag.box(0.015 + w * k + w / 2, -0.11, 0, w, 0.11, 0.008, c));
  out.parts.push({ body: flag.body, glass: flag.glass, pivot: g._v(x, y + h - 0.01, z), axis: 'y', kind: 'sway', speed: 2.2, amp: 0.35 });
}

function crate(g, x, y, z, s = 0.09, color = P.plank) {
  g.box(x, y, z, s, s, s, { top: shade(color, 1.1), side: color });
}

function barrel(g, x, y, z, r = 0.04, h = 0.09) {
  g.cyl(x, y, z, r, h, 7, P.wood, r * 0.92, true, P.woodDark);
}

function logs(g, x, y, z, n = 3, len = 0.22) {
  for (let k = 0; k < n; k++) {
    const row = k < 2 ? 0 : 1;
    const off = row ? 0 : (k - 0.5) * 0.075;
    g.cylX(x, y + 0.035 + row * 0.065, z + off, 0.035, len, 6, P.wood, P.woodLight);
  }
}

function lamp(g, x, z, y = 0.03) {
  g.cyl(x, y, z, 0.01, 0.26, 5, P.black);
  g.layer('glass');
  g.box(x, y + 0.24, z, 0.04, 0.05, 0.04, 0xf2e2a0);
  g.layer('body');
  g.box(x, y + 0.29, z, 0.05, 0.012, 0.05, P.black);
}

/** Maison simple paramétrable (utilisée par plusieurs modèles). */
function cottage(g, out, ctx, { x = 0, y = 0, z = 0, w, d, h, wall, roof, roofH, chimneyAt = null, windows = 2, door = true, sideWin = true, ridgeZ = false }) {
  g.push(0, x, y, z);
  g.box(0, 0.03, 0, w, h, d, { top: wall, side: wall, front: shade(wall, 1.03), left: shade(wall, 0.93), back: shade(wall, 0.9) });
  const rw = w + 0.1, rd = d + 0.1;
  if (ridgeZ) g.roofZ(0, 0.03 + h, 0, rw, rd, roofH, rd, ctx.roof(roof), shade(wall, 0.95));
  else g.roof(0, 0.03 + h, 0, rw, rd, roofH, rw, ctx.roof(roof), shade(wall, 0.95));
  if (door) g.door(0, d / 2, 0.11, Math.min(0.2, h * 0.7));
  if (windows) {
    const span = w * 0.62;
    for (let k = 0; k < windows; k++) {
      const u = windows === 1 ? -w * 0.28 : -span / 2 + (span * k) / (windows - 1);
      if (door && Math.abs(u) < 0.1) continue;
      g.win('front', u, 0.03 + h * 0.42, d / 2, 0.09, 0.09, P.white);
    }
  }
  if (sideWin) g.win('right', 0, 0.03 + h * 0.42, w / 2, 0.1, 0.09);
  if (chimneyAt) chimney(g, out, chimneyAt[0], 0.03 + h + roofH * 0.35, chimneyAt[1]);
  g.pop();
}

/* ───────── Modèles ───────── */
const MODELS = {}; // modèles faits main (repli si les modèles 3D ne sont pas chargés)

MODELS.house = (g, L, ctx, out) => {
  const wall = ctx.pick(WALLS);
  const roof = ctx.pick(ROOFS, 1);
  const flip = ctx.bit(2) ? -1 : 1;
  if (L === 1) {
    plot(g, 0.96, 0.96, ctx.ground(P.lawn));
    const wood = ctx.pick([P.wood, 0xa8754a, 0x8f6440], 2);
    g.box(0, 0.03, -0.05, 0.48, 0.28, 0.4, { top: wood, side: wood, front: shade(wood, 1.06), back: shade(wood, 0.88) });
    for (let k = 0; k < 4; k++) g.box(0, 0.08 + k * 0.065, 0.152, 0.5, 0.012, 0.012, shade(wood, 0.78));
    g.roof(0, 0.31, -0.05, 0.6, 0.52, 0.26, 0.6, ctx.roof(ctx.pick([P.straw, P.thatch], 3)), shade(wood, 0.92));
    g.door(0.1 * flip, 0.15, 0.1, 0.17);
    g.win('front', -0.11 * flip, 0.14, 0.15, 0.08, 0.08);
    logs(g, 0.3 * flip, 0.03, 0.28, 3, 0.18);
    if (ctx.bit(3)) bush(g, ctx, -0.32 * flip, 0.3, 0.07, P.hedge);
    return;
  }
  if (L === 2) {
    plot(g, 0.96, 0.96, ctx.ground(P.lawn));
    fence(g, 0.96, 0.96, P.woodLight);
    cottage(g, out, ctx, { z: -0.06, w: 0.56, d: 0.44, h: 0.32, wall, roof: ctx.pick([P.thatch, P.straw, 0xa77b3c]), roofH: 0.3, chimneyAt: [0.17 * flip, -0.06] });
    g.box(-0.13, 0.12, 0.17, 0.14, 0.03, 0.05, P.woodDark);
    for (let k = 0; k < 3; k++) g.box(-0.18 + k * 0.05, 0.15, 0.175, 0.03, 0.03, 0.03, ctx.pick(FLOWERS, k));
    bush(g, ctx, 0.3 * flip, 0.3, 0.08);
    return;
  }
  if (L === 3) {
    const sw = ctx.pick(STONE_WALLS);
    plot(g, 0.96, 0.96, ctx.ground(P.lawn));
    cottage(g, out, ctx, { z: -0.05, w: 0.64, d: 0.5, h: 0.4, wall: sw, roof: ctx.pick([P.roofRed, P.roofTerra, P.roofSlate, 0x9a5b3a]), roofH: 0.3, chimneyAt: [-0.2 * flip, -0.05] });
    g.box(0, 0.03, 0.24, 0.18, 0.025, 0.06, P.stoneLight);
    for (const s of [-1, 1]) g.box(s * 0.24, 0.03 + 0.27, 0.205, 0.035, 0.11, 0.012, ctx.pick([P.blue, P.roofGreen, P.red, P.woodDark], 2));
    bush(g, ctx, 0.36 * flip, 0.34, 0.08);
    bush(g, ctx, -0.36 * flip, 0.34, 0.07);
    tree(g, ctx, -0.36 * flip, -0.36, 0.7, 'round', 0.03, ctx.v);
    return;
  }
  if (L === 4) {
    plot(g, 0.98, 0.98, ctx.ground(P.lawn));
    const w = 0.66, d = 0.5;
    g.box(0, 0.03, -0.06, w, 0.32, d, { top: wall, side: wall, back: shade(wall, 0.9), left: shade(wall, 0.93) });
    g.box(0, 0.35, -0.06, w, 0.012, d + 0.02, shade(wall, 0.85));
    g.box(0, 0.36, -0.08, w - 0.04, 0.28, d - 0.04, { top: wall, side: shade(wall, 0.98), back: shade(wall, 0.88), left: shade(wall, 0.92) });
    g.roof(0, 0.64, -0.08, w + 0.1, d + 0.08, 0.24, 0.3, ctx.roof(ctx.pick([P.roofTerra, P.roofRed, 0xb05a3c])));
    g.door(0, 0.19, 0.12, 0.2);
    g.windows('front', 2, 0.38, 0.12, 0.19, 0.1, 0.12, P.white);
    g.windows('front', 3, 0.42, 0.42, 0.17, 0.09, 0.12, P.white);
    g.win('right', -0.06, 0.12, w / 2, 0.12, 0.12);
    g.win('right', -0.08, 0.42, w / 2 - 0.02, 0.12, 0.12);
    // balcon
    g.box(0, 0.35, 0.21, 0.3, 0.02, 0.1, P.stoneLight);
    g.box(0, 0.37, 0.255, 0.3, 0.07, 0.01, P.black);
    chimney(g, out, 0.22 * flip, 0.66, -0.15);
    g.box(0, 0.03, 0.4, 0.86, 0.06, 0.06, ctx.leaf(P.hedge));
    tree(g, ctx, 0.38 * flip, -0.36, 0.75, 'round', 0.03, ctx.v + 1);
    return;
  }
  // L5 : immeuble
  plot(g, 0.98, 0.98, ctx.ground(P.stoneLight));
  const col = ctx.pick([0xe9dcc3, 0xd9c7a8, 0xc9d3dc, 0xe3c6b0, 0xd7dccb, 0xe8e2d8]);
  const w = 0.78, d = 0.68, floors = 4, fh = 0.32;
  g.box(0, 0.03, -0.02, w, floors * fh, d, { top: shade(col, 0.95), side: col, back: shade(col, 0.88), left: shade(col, 0.92) });
  for (let f = 0; f < floors; f++) {
    const y = 0.03 + f * fh;
    if (f > 0) g.box(0, y - 0.01, -0.02, w + 0.02, 0.02, d + 0.02, shade(col, 0.8));
    const n = 3;
    for (let k = 0; k < n; k++) {
      const u = -0.25 + 0.25 * k;
      if (!(f === 0 && k === 1)) g.win('front', u, y + 0.1, d / 2 - 0.02, 0.12, 0.14);
      g.win('back', u, y + 0.1, d / 2 - 0.02, 0.12, 0.14);
    }
    for (let k = 0; k < 2; k++) {
      g.win('right', -0.17 + 0.3 * k, y + 0.1, w / 2, 0.12, 0.14);
      g.win('left', -0.17 + 0.3 * k, y + 0.1, w / 2, 0.12, 0.14);
    }
  }
  const top = 0.03 + floors * fh;
  g.box(0, top, -0.02, w + 0.03, 0.05, d + 0.03, { top: ctx.roof(0x9a9a9a), side: shade(col, 0.82) });
  g.box(0.12, top + 0.05, -0.1, 0.16, 0.12, 0.14, { top: ctx.roof(P.metal), side: P.metal });
  g.box(-0.2, top + 0.05, 0.05, 0.1, 0.06, 0.1, { top: ctx.roof(P.stoneDark), side: P.stoneDark });
  g.door(0, d / 2 - 0.02, 0.16, 0.2, 0x4a3a2e);
  g.box(0, 0.24, d / 2 + 0.04, 0.26, 0.02, 0.12, ctx.pick(AWNINGS));
  bush(g, ctx, 0.34, 0.4, 0.07);
  bush(g, ctx, -0.34, 0.4, 0.07);
};

MODELS.manor = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(P.lawn));
  const wall = ctx.pick([0xf3ead8, 0xf1e1c4, 0xe9dccb]);
  const roof = ctx.roof(ctx.pick([P.roofSlate, 0x4d5a6e, P.roofTerra]));
  g.box(0, 0.03, 1.2 - 1.2, 0.3, 0.02, 1.9, P.cobble);
  const w = 1.2, d = 0.7, h = L >= 2 ? 0.75 : 0.5;
  g.box(0, 0.03, -0.35, w, h, d, { top: wall, side: wall, back: shade(wall, 0.88), left: shade(wall, 0.93) });
  g.roof(0, 0.03 + h, -0.35, w + 0.1, d + 0.1, 0.35, 0.6, roof);
  const floors = L >= 2 ? 2 : 1;
  for (let f = 0; f < floors; f++) g.windows('front', 5, 0.95, 0.12 + f * 0.36, 0.0 + d / 2 - 0.35, 0.09, 0.15, P.white);
  g.door(0, d / 2 - 0.35, 0.16, 0.24);
  for (const s of [-1, 1]) {
    g.cyl(s * 0.66, 0.03, -0.35, 0.16, h + 0.15, 8, shade(wall, 0.97));
    g.cone(s * 0.66, 0.03 + h + 0.15, -0.35, 0.2, 0.32, 8, roof);
  }
  if (L >= 3) {
    g.box(0, 0.03 + h, -0.35, 0.36, 0.3, 0.36, wall);
    g.dome(0, 0.33 + h, -0.35, 0.2, ctx.roof(P.gold), 8, 3);
  }
  // jardin : bassin, haies, arbres
  g.cyl(0, 0.03, 0.55, 0.28, 0.05, 12, P.stoneLight, 0.28, true, P.water);
  g.box(-0.7, 0.03, 0.55, 0.4, 0.08, 0.08, ctx.leaf(P.hedge));
  g.box(0.7, 0.03, 0.55, 0.4, 0.08, 0.08, ctx.leaf(P.hedge));
  tree(g, ctx, -0.75, 0.82, 0.9, 'round', 0.03, 3);
  tree(g, ctx, 0.75, 0.82, 0.9, 'round', 0.03, 4);
  chimney(g, out, 0.35, 0.03 + h + 0.12, -0.45);
};

MODELS.townhall = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(L >= 2 ? P.cobble : 0xc9b48a));
  const wall = L >= 3 ? P.stoneLight : L === 2 ? P.plaster : P.wood;
  const roofC = ctx.roof(L >= 5 ? P.roofSlate : L >= 3 ? P.roofSlate : L === 2 ? P.roofRed : P.straw);
  if (L === 1) {
    g.box(0, 0.03, -0.25, 1.15, 0.45, 0.75, { top: wall, side: wall, front: shade(wall, 1.05), back: shade(wall, 0.88) });
    for (let k = 0; k < 5; k++) g.box(0, 0.1 + k * 0.08, 0.128, 1.17, 0.012, 0.012, shade(wall, 0.78));
    g.roof(0, 0.48, -0.25, 1.28, 0.88, 0.38, 1.28, roofC, shade(wall, 0.9));
    g.door(0, 0.125, 0.16, 0.26);
    g.windows('front', 2, 0.7, 0.2, 0.125, 0.11, 0.11, P.white);
    flagPole(g, out, 0.7, 0.55, 0.7);
    g.box(-0.55, 0.03, 0.6, 0.3, 0.04, 0.09, P.woodDark);
    tree(g, ctx, -0.75, -0.75, 0.9, 'round', 0.03, 1);
    return;
  }
  const w = L >= 4 ? 1.0 : L === 3 ? 1.3 : 1.2;
  const h = L >= 6 ? 0.85 : L >= 4 ? 0.7 : L === 3 ? 0.58 : 0.5;
  // bâtiment principal
  g.box(0, 0.03, -0.3, w, h, 0.8, { top: wall, side: wall, front: shade(wall, 1.03), back: shade(wall, 0.88), left: shade(wall, 0.93) });
  g.roof(0, 0.03 + h, -0.3, w + 0.1, 0.9, 0.3, L >= 5 ? 0.2 : w, roofC, shade(wall, 0.92));
  const rows = L >= 6 ? 2 : 1;
  for (let r = 0; r < rows; r++) g.windows('front', L >= 4 ? 3 : 4, w * 0.75, 0.14 + r * 0.36, 0.1, 0.1, 0.15, P.white);
  g.door(0, 0.1, 0.18, 0.28);
  // ailes
  if (L >= 4) {
    const ww = L >= 6 ? 0.42 : 0.38, wh = L >= 6 ? 0.62 : 0.45;
    for (const s of [-1, 1]) {
      g.box(s * 0.74, 0.03, -0.35, ww, wh, 0.65, { top: wall, side: shade(wall, 0.97), back: shade(wall, 0.86) });
      g.roof(s * 0.74, 0.03 + wh, -0.35, ww + 0.08, 0.73, 0.2, 0.2, roofC);
      g.win('front', s * 0.74, 0.16, -0.025, 0.12, 0.15);
      if (L >= 6) g.win('front', s * 0.74, 0.42, -0.025, 0.12, 0.15);
    }
  }
  // porche à colonnes
  if (L >= 3) {
    const cols = L >= 5 ? 6 : 4;
    const span = L >= 5 ? 0.9 : 0.7;
    g.box(0, 0.03, 0.22, span + 0.2, 0.04, 0.24, P.stoneLight);
    for (let k = 0; k < cols; k++) g.cyl(-span / 2 + (span * k) / (cols - 1), 0.07, 0.25, 0.035, 0.42, 7, P.white);
    g.box(0, 0.49, 0.2, span + 0.2, 0.05, 0.3, P.white);
    g.roof(0, 0.54, 0.2, span + 0.2, 0.3, 0.12, span + 0.2, ctx.roof(P.white), P.stoneLight);
  }
  // tour / clocher / dôme
  if (L === 2 || L === 3 || L === 4) {
    const th = L === 2 ? 0.35 : L === 3 ? 0.5 : 0.75;
    const tw = L === 2 ? 0.26 : 0.32;
    const ty = 0.03 + h;
    g.box(0, ty, -0.3, tw, th, tw, { top: wall, side: shade(wall, 1.02), back: shade(wall, 0.88) });
    g.layer('body');
    g.discZ(0, ty + th * 0.62, -0.3 + tw / 2 + 0.006, tw * 0.33, 12, P.white);
    g.box(0, ty + th * 0.62, -0.3 + tw / 2 + 0.012, 0.012, tw * 0.28, 0.006, P.black);
    g.box(tw * 0.08, ty + th * 0.62, -0.3 + tw / 2 + 0.014, tw * 0.22, 0.012, 0.006, P.black);
    g.roof(0, ty + th, -0.3, tw + 0.06, tw + 0.06, L === 4 ? 0.45 : 0.28, 0, roofC);
  }
  if (L >= 5) {
    const ty = 0.03 + h + 0.12;
    const dr = L >= 6 ? 0.36 : 0.3;
    g.cyl(0, ty - 0.12, -0.3, dr * 0.95, 0.3, 12, wall);
    g.windows('front', 1, 0, ty, -0.3 + dr * 0.95, 0.08, 0.12);
    const domeC = ctx.roof(L >= 8 ? P.gold : L >= 7 ? 0x6fa3a0 : P.roofSlate);
    g.dome(0, ty + 0.18, -0.3, dr, domeC, 12, 4);
    g.cyl(0, ty + 0.18 + dr, -0.3, 0.05, 0.14, 6, P.white);
    g.cone(0, ty + 0.32 + dr, -0.3, 0.07, 0.18, 6, L >= 8 ? P.gold : domeC);
  }
  if (L >= 7) {
    for (const s of [-1, 1]) {
      g.cyl(s * 0.92, 0.03, -0.75, 0.13, 0.95, 8, shade(wall, 0.98));
      g.cone(s * 0.92, 0.98, -0.75, 0.17, 0.35, 8, roofC);
    }
  }
  if (L >= 8) {
    g.box(0, 0.03 + h, -0.72, 0.22, 1.2, 0.22, shade(wall, 1.02));
    g.cone(0, 1.26 + h, -0.72, 0.18, 0.6, 4, P.gold);
  }
  // place : drapeaux, fontaine, bancs
  flagPole(g, out, -0.82, 0.78, 0.75);
  if (L >= 3) flagPole(g, out, 0.82, 0.78, 0.75, [0x2a5bd7, 0xffd200, 0x2a5bd7]);
  if (L >= 4) {
    g.cyl(0, 0.03, 0.72, 0.22, 0.06, 12, P.stoneLight, 0.22, true, P.water);
    g.cyl(0, 0.09, 0.72, 0.04, 0.16, 6, P.stoneLight);
    out.emitters.push({ pos: [0, 0.27, 0.72], kind: 'water' });
  }
  for (const s of [-1, 1]) lamp(g, s * 0.45, 0.78);
  if (L >= 2) {
    tree(g, ctx, -0.82, -0.82, 0.8, 'round', 0.03, 2);
    tree(g, ctx, 0.82, -0.82, 0.8, 'round', 0.03, 3);
  }
};

/* Production */
MODELS.garden = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.soil));
  const rows = 4;
  const crop = ctx.season === 3 ? 0xd9dfe2 : ctx.season === 2 ? 0xd08a3a : P.fieldGreen;
  for (let k = 0; k < rows; k++) {
    const x = -0.3 + k * 0.17;
    g.box(x, 0.03, 0.05, 0.08, 0.025, 0.7, P.soilDark);
    for (let j = 0; j < 5; j++) g.ico(x, 0.09, -0.22 + j * 0.13, 0.045, ctx.leaf(crop), 0.7, 0.3, k * 5 + j);
    if (L >= 2 && k % 2 === 0) for (let j = 0; j < 5; j++) g.ico(x, 0.12, -0.22 + j * 0.13, 0.02, ctx.season === 3 ? 0xdddddd : P.orange, 1, 0, k + j);
  }
  g.box(0.34, 0.03, -0.38, 0.2, 0.18, 0.16, { top: P.wood, side: P.woodLight });
  g.roof(0.34, 0.21, -0.38, 0.26, 0.22, 0.08, 0.26, ctx.roof(P.roofRed));
  fence(g, 0.96, 0.96, P.woodLight);
  if (L >= 3) {
    g.layer('glass');
    g.box(-0.3, 0.03, -0.36, 0.3, 0.16, 0.18, 0xbfe3ea);
    g.layer('body');
  }
};

MODELS.lumber = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(0xa88a5a));
  cottage(g, out, ctx, { x: -0.15, z: -0.18, w: 0.42, d: 0.34, h: 0.26, wall: P.wood, roof: P.woodDark, roofH: 0.18, windows: 1, chimneyAt: [0.1, 0] });
  logs(g, 0.25, 0.03, 0.15, 3, 0.3);
  if (L >= 2) logs(g, 0.25, 0.03, -0.25, 3, 0.3);
  g.cyl(-0.25, 0.03, 0.3, 0.06, 0.08, 7, P.woodLight, 0.06, true, P.plank);
  g.box(-0.25, 0.11, 0.3, 0.012, 0.1, 0.012, P.metal);
  if (L >= 3) {
    g.box(0.25, 0.03, -0.02, 0.36, 0.22, 0.2, { top: P.woodDark, side: P.wood });
    for (let k = 0; k < 3; k++) g.cylX(0.25, 0.07 + k * 0.05, -0.14, 0.022, 0.32, 5, P.plank);
  }
  if (L >= 4) for (let k = 0; k < 3; k++) tree(g, ctx, -0.38 + k * 0.12, 0.4, 0.45, 'pine', 0.03, k);
  if (L >= 5) g.box(0.0, 0.03, 0.35, 0.18, 0.08, 0.1, P.red);
};

MODELS.quarry = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.gravel));
  const s = P.stone;
  g.box(-0.12, 0.03, -0.1, 0.55, 0.12, 0.5, { top: shade(s, 0.95), side: P.stoneDark });
  g.box(-0.2, 0.15, -0.18, 0.35, 0.1, 0.32, { top: s, side: P.stoneDark });
  g.box(-0.24, 0.25, -0.24, 0.18, 0.08, 0.16, { top: P.stoneLight, side: s });
  for (let k = 0; k < 3; k++) g.box(0.28, 0.03 + k * 0.07, 0.2, 0.14, 0.07, 0.12, { top: P.stoneLight, side: shade(P.stoneLight, 0.85) });
  // grue en bois
  g.box(0.32, 0.03, -0.3, 0.04, 0.5, 0.04, P.wood);
  g.box(0.12, 0.5, -0.3, 0.44, 0.04, 0.04, P.wood);
  g.box(-0.06, 0.38, -0.3, 0.008, 0.12, 0.008, P.black);
  g.box(-0.06, 0.34, -0.3, 0.08, 0.05, 0.08, P.stoneLight);
  g.box(0.05, 0.03, 0.32, 0.16, 0.06, 0.1, P.woodDark);
  for (const sx of [-0.06, 0.06]) g.cylZ(0.05 + sx, 0.03, 0.32, 0.025, 0.12, 6, P.black);
  if (L >= 3) {
    g.box(0.3, 0.03, -0.05, 0.22, 0.2, 0.2, { top: ctx.roof(P.roofRed), side: P.wood });
  }
  if (L >= 4) g.box(-0.35, 0.03, 0.3, 0.16, 0.16, 0.16, { top: P.stoneLight, side: s });
};

MODELS.fisher = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.sand));
  for (const [x, z] of [[-0.3, -0.3], [0.1, -0.3], [-0.3, 0.05], [0.1, 0.05]]) g.box(x, 0.03, z, 0.04, 0.12, 0.04, P.woodDark);
  g.box(-0.1, 0.15, -0.12, 0.48, 0.03, 0.44, P.plank);
  cottage(g, out, ctx, { x: -0.1, y: 0.15, z: -0.14, w: 0.36, d: 0.3, h: 0.22, wall: ctx.pick([0x6fa3c9, 0xc9e2ef, 0xe6d6b8]), roof: P.roofBlue, roofH: 0.16, windows: 1, sideWin: false });
  // barque
  g.push(0.4, 0.28, 0, 0.3);
  g.box(0, 0.03, 0, 0.1, 0.05, 0.3, ctx.pick([P.red, P.blue, P.white]));
  g.box(0, 0.08, 0, 0.12, 0.012, 0.32, P.woodLight);
  g.pop();
  // séchoir à filets
  g.box(0.3, 0.03, -0.25, 0.02, 0.24, 0.02, P.wood);
  g.box(0.3, 0.03, -0.05, 0.02, 0.24, 0.02, P.wood);
  g.box(0.3, 0.26, -0.15, 0.02, 0.02, 0.22, P.wood);
  g.box(0.3, 0.12, -0.15, 0.008, 0.14, 0.2, 0x7f8f7a);
  if (L >= 2) barrel(g, -0.35, 0.03, 0.32);
  if (L >= 3) crate(g, -0.22, 0.03, 0.34);
};

MODELS.farm = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(P.lawn));
  // champs
  const ripe = ctx.season === 1 ? P.field : ctx.season === 0 ? P.fieldGreen : ctx.season === 2 ? 0xc9a14a : 0xe6ecef;
  for (let k = 0; k < 6; k++) {
    const z = -0.05 + k * 0.17;
    g.box(-0.35, 0.03, z, 1.1, 0.02, 0.1, P.soil);
    g.box(-0.35, 0.05, z, 1.06, 0.06, 0.08, ctx.season === 3 ? 0xeef2f4 : shade(ripe, 0.95 + (k % 2) * 0.08));
  }
  // grange rouge
  g.box(0.6, 0.03, -0.45, 0.6, 0.5, 0.75, { top: P.red, side: 0xb33a2f, back: 0x9a3229 });
  g.roof(0.6, 0.53, -0.45, 0.7, 0.85, 0.32, 0.7, ctx.roof(P.roofSlate), 0xb33a2f);
  g.box(0.6, 0.03, -0.07, 0.24, 0.32, 0.012, P.white);
  g.box(0.6, 0.03, -0.065, 0.2, 0.28, 0.012, P.woodDark);
  // ferme
  cottage(g, out, ctx, { x: -0.35, z: -0.6, w: 0.62, d: 0.44, h: 0.32, wall: P.plaster, roof: P.roofTerra, roofH: 0.26, chimneyAt: [0.2, 0] });
  // silo
  if (L >= 2) {
    g.cyl(0.8, 0.03, 0.2, 0.15, 0.7, 10, P.metal);
    g.dome(0.8, 0.73, 0.2, 0.15, ctx.roof(P.roofRed), 10, 2);
  }
  if (L >= 3) for (let k = 0; k < 3; k++) g.cylX(0.4, 0.07, 0.55 + k * 0.14, 0.05, 0.12, 8, P.straw, P.field);
  if (L >= 4) {
    g.box(-0.85, 0.03, 0.85, 0.16, 0.1, 0.24, P.red);
    g.cylX(-0.85, 0.06, 0.75, 0.05, 0.2, 8, P.black);
  }
  if (L >= 5) tree(g, ctx, -0.85, -0.85, 1, 'round', 0.03, 9);
  fence(g, 2, 2, P.woodLight, 0.03, 0.4);
};

MODELS.mill = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.lawn));
  const wall = L >= 3 ? P.stoneLight : P.plaster;
  g.cyl(0, 0.03, -0.05, 0.25, 0.75, 8, wall, 0.18, false);
  g.cone(0, 0.78, -0.05, 0.23, 0.28, 8, ctx.roof(P.roofRed));
  g.door(0, 0.17, 0.1, 0.18);
  g.win('front', 0, 0.42, 0.155, 0.07, 0.08);
  g.box(0, 0.93, 0.13, 0.04, 0.04, 0.2, P.woodDark);
  out.parts.push(windmillBlades(0.95));
  if (L >= 2) {
    for (let k = 0; k < 3; k++) g.box(0.3, 0.03, 0.2 - k * 0.12, 0.12, 0.1, 0.1, { top: 0xe9dfc9, side: 0xd8cbb0 });
  }
  if (L >= 4) g.box(-0.32, 0.03, 0.2, 0.22, 0.16, 0.2, { top: ctx.roof(P.roofRed), side: P.wood });
};

function windmillBlades(y) {
  const b = new GeoBuilder();
  b.box(0, -0.04, 0, 0.08, 0.08, 0.06, P.woodDark);
  const sail = 0xf2ecdc;
  b.box(0, 0.03, 0.02, 0.08, 0.42, 0.012, sail);
  b.box(0, -0.45, 0.02, 0.08, 0.42, 0.012, sail);
  b.box(0.25, -0.04, 0.02, 0.42, 0.08, 0.012, sail);
  b.box(-0.25, -0.04, 0.02, 0.42, 0.08, 0.012, sail);
  b.box(0, -0.45, 0.01, 0.015, 0.9, 0.01, P.woodDark);
  b.box(0, -0.045, 0.01, 0.9, 0.015, 0.01, P.woodDark);
  return { body: b.body, glass: b.glass, pivot: [0, y, 0.22], axis: 'z', kind: 'spin', speed: 1.2 };
}

MODELS.bakery = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  const wall = ctx.pick([0xf4e3c1, 0xf1d9b5, 0xf6efdf]);
  cottage(g, out, ctx, { z: -0.08, w: 0.7, d: 0.5, h: L >= 3 ? 0.5 : 0.38, wall, roof: P.roofTerra, roofH: 0.26, windows: 0, chimneyAt: [0.22, -0.1] });
  g.layer('glass');
  g.box(-0.18, 0.08, 0.175, 0.24, 0.16, 0.012, 0x3c4f63);
  g.layer('body');
  for (let k = 0; k < 5; k++) g.box(-0.24 + k * 0.12, 0.27, 0.22, 0.12, 0.025, 0.12, k % 2 ? P.white : ctx.pick(AWNINGS));
  g.push(0, 0.2, 0.36, 0.19);
  g.ico(0, 0, 0, 0.06, P.gold, 0.5, 0, 1);
  g.pop();
  if (L >= 2) {
    g.box(0.36, 0.03, 0.34, 0.08, 0.07, 0.08, P.woodDark);
    for (let k = 0; k < 2; k++) g.cylX(0.36, 0.12, 0.31 + k * 0.05, 0.02, 0.1, 6, P.gold);
  }
  if (L >= 4) chimney(g, out, -0.22, 0.6, -0.15);
};

MODELS.sawmill = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(0xa88a5a));
  for (const [x, z] of [[-0.35, -0.3], [0.2, -0.3], [-0.35, 0.15], [0.2, 0.15]]) g.box(x, 0.03, z, 0.04, 0.34, 0.04, P.wood);
  g.roof(-0.08, 0.37, -0.08, 0.7, 0.6, 0.18, 0.7, ctx.roof(P.roofSlate), P.wood);
  g.box(-0.08, 0.03, -0.08, 0.4, 0.12, 0.12, P.woodDark);
  g.discZ(-0.08, 0.2, -0.015, 0.09, 12, P.metal);
  logs(g, -0.08, 0.15, -0.08, 1, 0.42);
  for (let k = 0; k < 4; k++) g.box(0.35, 0.03 + k * 0.025, 0.3, 0.24, 0.022, 0.12, shade(P.plank, 1 + (k % 2) * 0.08));
  logs(g, -0.3, 0.03, 0.34, 3, 0.26);
  if (L >= 3) g.box(0.36, 0.03, -0.3, 0.18, 0.24, 0.24, { top: ctx.roof(P.roofRed), side: P.woodLight });
  if (L >= 4) for (let k = 0; k < 3; k++) g.box(0.12, 0.03 + k * 0.025, 0.36, 0.2, 0.022, 0.1, P.plank);
};

MODELS.claypit = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(0xb59a74));
  g.box(-0.08, 0.03, -0.05, 0.6, 0.02, 0.55, 0xa65d36);
  for (const [x, z, s] of [[-0.25, -0.2, 1], [0.05, 0.12, 0.8], [0.25, -0.25, 0.7]]) g.cone(x, 0.05, z, 0.12 * s, 0.12 * s, 7, P.clay);
  g.box(0.32, 0.03, 0.28, 0.18, 0.14, 0.16, { top: ctx.roof(P.roofRed), side: P.wood });
  g.cyl(-0.3, 0.03, 0.3, 0.05, 0.08, 7, P.metal, 0.06, true, P.clay);
  g.box(-0.05, 0.03, 0.34, 0.03, 0.2, 0.03, P.wood);
  if (L >= 3) g.cone(0.3, 0.03, -0.0, 0.1, 0.1, 7, P.clay);
};

MODELS.brickworks = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.gravel));
  g.box(-0.1, 0.03, -0.12, 0.5, 0.3, 0.42, { top: P.brickDark, side: P.brick });
  g.dome(-0.1, 0.33, -0.12, 0.2, P.brickDark, 8, 2);
  g.cyl(0.22, 0.03, -0.28, 0.07, 0.85, 8, P.brick, 0.055, true, P.black);
  out.emitters.push({ pos: [0.22, 0.9, -0.28], kind: 'smoke' });
  g.box(-0.1, 0.03, 0.095, 0.16, 0.16, 0.012, P.black);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) g.box(0.0 + k * 0.1, 0.03 + r * 0.05, 0.3, 0.08, 0.045, 0.14, shade(P.brick, 1 + r * 0.05));
  if (L >= 3) g.box(0.35, 0.03, 0.05, 0.12, 0.12, 0.3, { top: ctx.roof(P.roofSlate), side: P.wood });
  if (L >= 4) g.cyl(-0.36, 0.03, 0.3, 0.05, 0.6, 8, P.brick, 0.04, true, P.black);
};

MODELS.mine = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.gravel));
  // colline rocheuse avec entrée
  g.box(0, 0.03, -0.22, 0.8, 0.32, 0.4, { top: ctx.roof(P.stoneDark), side: P.stone });
  g.box(0, 0.35, -0.28, 0.5, 0.15, 0.25, { top: ctx.roof(P.stone), side: P.stoneDark });
  g.box(0, 0.03, -0.015, 0.22, 0.24, 0.012, P.black);
  g.box(-0.12, 0.03, 0.0, 0.03, 0.26, 0.03, P.wood);
  g.box(0.12, 0.03, 0.0, 0.03, 0.26, 0.03, P.wood);
  g.box(0, 0.26, 0.0, 0.28, 0.035, 0.035, P.wood);
  // rails et wagonnet
  g.box(-0.05, 0.03, 0.25, 0.012, 0.012, 0.5, P.metal);
  g.box(0.05, 0.03, 0.25, 0.012, 0.012, 0.5, P.metal);
  g.box(0, 0.05, 0.3, 0.14, 0.08, 0.14, P.stoneDark);
  g.ico(0, 0.13, 0.3, 0.045, 0x8a6a5a, 0.7, 0.3, 2);
  // chevalement
  if (L >= 2) {
    g.box(0.33, 0.03, 0.15, 0.03, 0.7, 0.03, P.woodDark);
    g.box(0.43, 0.03, 0.15, 0.03, 0.7, 0.03, P.woodDark);
    g.box(0.38, 0.6, 0.15, 0.14, 0.03, 0.03, P.woodDark);
    g.push(Math.PI / 2, 0.38, 0, 0.15);
    g.discZ(0, 0.68, 0.02, 0.07, 10, P.metal);
    g.pop();
  }
  if (L >= 3) g.box(-0.33, 0.03, 0.25, 0.22, 0.2, 0.22, { top: ctx.roof(P.roofRed), side: P.wood });
};

MODELS.forge = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.gravel));
  g.box(0, 0.03, -0.12, 0.66, 0.36, 0.48, { top: P.stoneDark, side: P.stone, back: P.stoneDark });
  g.roof(0, 0.39, -0.12, 0.74, 0.56, 0.2, 0.74, ctx.roof(P.roofSlate), P.stone);
  g.layer('glass');
  g.box(-0.12, 0.05, 0.125, 0.22, 0.16, 0.012, 0xf08a2a);
  g.layer('body');
  chimney(g, out, 0.2, 0.42, -0.2, P.brick, 0.32);
  g.box(0.2, 0.03, 0.3, 0.14, 0.06, 0.06, P.black);
  g.box(0.2, 0.09, 0.3, 0.18, 0.04, 0.07, P.dark);
  barrel(g, -0.32, 0.03, 0.32);
  if (L >= 3) for (let k = 0; k < 3; k++) g.box(-0.08 + k * 0.06, 0.03, 0.33, 0.02, 0.16, 0.02, P.metal);
};

/* Commerces */
MODELS.market = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  const stalls = L >= 2 ? 3 : 2;
  const pos = stalls === 3 ? [[-0.25, -0.2], [0.25, -0.2], [0, 0.22]] : [[-0.2, -0.05], [0.22, 0.05]];
  pos.forEach(([x, z], k) => {
    for (const [dx, dz] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]]) g.box(x + dx, 0.03, z + dz, 0.02, 0.24, 0.02, P.wood);
    g.box(x, 0.03, z + 0.05, 0.32, 0.1, 0.12, P.woodLight);
    const c = ctx.pick(AWNINGS, k);
    g.roof(x, 0.27, z, 0.38, 0.28, 0.08, 0.38, ctx.roof(c), P.white);
    for (let j = 0; j < 4; j++) g.ico(x - 0.11 + j * 0.075, 0.15, z + 0.05, 0.028, [P.red, P.yellow, P.fieldGreen, P.orange][(j + k) % 4], 1, 0, j);
  });
  crate(g, 0.38, 0.03, 0.36, 0.08);
  crate(g, -0.38, 0.03, 0.36, 0.08, P.woodLight);
};

MODELS.tavern = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  const wall = ctx.pick([0xf3ead8, 0xf1d9b5]);
  const h = L >= 3 ? 0.62 : 0.42;
  g.box(0, 0.03, -0.1, 0.68, h, 0.5, { top: wall, side: wall, back: shade(wall, 0.88), left: shade(wall, 0.93) });
  // colombages
  for (let k = 0; k < 5; k++) g.box(-0.3 + k * 0.15, 0.03, 0.152, 0.025, h, 0.012, P.woodDark);
  g.box(0, 0.03 + h * 0.5, 0.152, 0.7, 0.025, 0.012, P.woodDark);
  g.roof(0, 0.03 + h, -0.1, 0.78, 0.6, 0.28, 0.78, ctx.roof(P.roofRed), wall);
  g.door(0, 0.15, 0.12, 0.2);
  g.windows('front', 2, 0.44, 0.1, 0.15, 0.1, 0.1);
  if (L >= 3) g.windows('front', 3, 0.44, 0.36, 0.15, 0.09, 0.1);
  chimney(g, out, -0.24, 0.03 + h + 0.12, -0.15);
  g.box(0.3, 0.3, 0.22, 0.02, 0.02, 0.12, P.black);
  g.box(0.3, 0.2, 0.27, 0.012, 0.1, 0.1, P.gold);
  barrel(g, 0.38, 0.03, 0.34);
  barrel(g, -0.38, 0.03, 0.34);
  g.box(0, 0.03, 0.36, 0.2, 0.08, 0.08, P.woodLight);
};

MODELS.shop = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  const wall = ctx.pick([0xe3c6b0, 0xd9e6ef, 0xf4e3a1, 0xe9e2f0, 0xf3ead8]);
  const floors = L >= 3 ? 3 : 2;
  const fh = 0.3;
  g.box(0, 0.03, -0.06, 0.74, floors * fh, 0.6, { top: shade(wall, 0.95), side: wall, back: shade(wall, 0.88), left: shade(wall, 0.92) });
  g.layer('glass');
  g.box(-0.16, 0.06, 0.245, 0.3, 0.2, 0.012, 0x3c4f63);
  g.box(0.22, 0.06, 0.245, 0.16, 0.2, 0.012, 0x3c4f63);
  g.layer('body');
  g.door(0.06, 0.24, 0.1, 0.22, 0x3a3a40);
  const aw = ctx.pick(AWNINGS);
  for (let k = 0; k < 6; k++) g.box(-0.3 + k * 0.12, 0.27, 0.3, 0.12, 0.02, 0.12, k % 2 ? P.white : aw);
  g.box(0, 0.31, 0.248, 0.5, 0.06, 0.012, P.woodDark);
  for (let f = 1; f < floors; f++) g.windows('front', 3, 0.5, 0.03 + f * fh + 0.08, 0.24, 0.1, 0.13, P.white);
  g.roof(0, 0.03 + floors * fh, -0.06, 0.8, 0.66, 0.22, 0.4, ctx.roof(P.roofSlate));
  if (L >= 4) g.box(0.25, 0.03 + floors * fh + 0.05, -0.2, 0.12, 0.12, 0.12, P.metal);
};

MODELS.mall = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(P.asphalt));
  for (let k = 0; k < 6; k++) g.box(-0.75 + k * 0.3, 0.031, 0.75, 0.02, 0.002, 0.3, P.white);
  const h = L >= 2 ? 0.75 : 0.55;
  const col = ctx.pick([0xe6e1d6, 0xd8dde3]);
  g.box(0, 0.03, -0.25, 1.8, h, 1.1, { top: shade(col, 0.95), side: col, back: shade(col, 0.88) });
  g.layer('glass');
  g.box(0, 0.06, 0.305, 1.5, h - 0.16, 0.012, 0x41617f);
  g.layer('body');
  g.box(0, h - 0.05, 0.32, 1.7, 0.1, 0.04, ctx.pick(AWNINGS));
  g.box(0, 0.03 + h, -0.25, 1.82, 0.04, 1.12, ctx.roof(0x9a9a9a));
  g.box(0.5, 0.07 + h, -0.4, 0.3, 0.15, 0.3, P.metal);
  if (L >= 3) g.box(-0.5, 0.07 + h, -0.4, 0.4, 0.25, 0.4, col);
  for (const s of [-1, 1]) tree(g, ctx, s * 0.9, 0.9, 0.8, 'round', 0.03, s + 5);
};

/* Services */
MODELS.well = (g, L, ctx, out) => {
  plot(g, 0.7 + L * 0.08, 0.7 + L * 0.08, ctx.ground(P.cobble));
  const r = 0.14 + L * 0.02;
  g.cyl(0, 0.03, 0, r, 0.14, 10, P.stone, r, true, 0x2f6f8f);
  g.box(-r, 0.03, 0, 0.03, 0.36, 0.03, P.wood);
  g.box(r, 0.03, 0, 0.03, 0.36, 0.03, P.wood);
  g.roof(0, 0.39, 0, 2 * r + 0.12, 0.24, 0.12, 2 * r + 0.12, ctx.roof(L >= 2 ? P.roofRed : P.woodDark), P.wood);
  g.cylX(0, 0.3, 0, 0.02, 2 * r, 6, P.woodDark);
  g.box(0.03, 0.18, 0, 0.005, 0.12, 0.005, P.black);
  g.cyl(0.03, 0.14, 0, 0.03, 0.05, 6, P.wood);
  if (L >= 3) for (const s of [-1, 1]) bush(g, ctx, s * 0.3, 0.3, 0.06, P.hedge);
};

MODELS.warehouse = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.gravel));
  const wall = L >= 3 ? P.brick : P.wood;
  const h = 0.3 + L * 0.05;
  g.box(0, 0.03, -0.08, 0.76, h, 0.62, { top: wall, side: wall, back: shade(wall, 0.85), left: shade(wall, 0.92) });
  g.roof(0, 0.03 + h, -0.08, 0.84, 0.7, 0.22, 0.84, ctx.roof(L >= 3 ? P.roofSlate : P.roofRed), shade(wall, 0.9));
  g.box(0, 0.03, 0.235, 0.32, h * 0.75, 0.012, P.woodDark);
  g.box(0, 0.03 + h * 0.37, 0.24, 0.32, 0.015, 0.012, P.wood);
  crate(g, 0.33, 0.03, 0.36);
  crate(g, 0.23, 0.03, 0.38, 0.08, P.woodLight);
  if (L >= 2) barrel(g, -0.34, 0.03, 0.35);
  if (L >= 4) crate(g, 0.33, 0.12, 0.36, 0.07);
};

MODELS.school = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.lawn));
  const wall = ctx.pick([0xf3ead8, 0xf4e3a1, 0xf1d9b5]);
  const floors = L >= 3 ? 2 : 1;
  const h = floors * 0.32;
  g.box(0, 0.03, -0.12, 0.76, h, 0.48, { top: wall, side: wall, back: shade(wall, 0.88), left: shade(wall, 0.92) });
  g.roof(0, 0.03 + h, -0.12, 0.84, 0.56, 0.22, 0.6, ctx.roof(P.roofRed));
  for (let f = 0; f < floors; f++) g.windows('front', 4, 0.56, 0.12 + f * 0.32, 0.12, 0.09, 0.14, P.white);
  g.door(0, 0.12, 0.12, 0.22);
  // clocheton
  g.box(0, 0.12 + h, -0.12, 0.12, 0.14, 0.12, P.white);
  g.roof(0, 0.26 + h, -0.12, 0.16, 0.16, 0.12, 0, ctx.roof(P.roofSlate));
  g.ico(0, 0.18 + h, -0.05, 0.03, P.gold, 1, 0, 1);
  // cour
  g.box(0.25, 0.03, 0.32, 0.4, 0.005, 0.25, 0xd0c2a5);
  fence(g, 0.96, 0.96, P.white, 0.03, 0.25);
  tree(g, ctx, -0.33, 0.3, 0.7, 'round', 0.03, 1);
  flagPole(g, out, 0.38, 0.12, 0.5);
};

MODELS.clinic = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.lawn));
  const h = L >= 3 ? 0.62 : 0.4;
  g.box(0, 0.03, -0.1, 0.7, h, 0.52, { top: P.white, side: P.white, back: 0xe2e2e2, left: 0xececec });
  g.box(0, 0.03 + h, -0.1, 0.74, 0.04, 0.56, ctx.roof(0x5aa3a0));
  g.windows('front', 2, 0.4, 0.12, 0.16, 0.12, 0.12);
  if (L >= 3) g.windows('front', 3, 0.44, 0.4, 0.16, 0.1, 0.12);
  g.door(0, 0.16, 0.14, 0.22, 0x5aa3a0);
  g.box(0, 0.03 + h - 0.13, 0.17, 0.1, 0.03, 0.012, P.red);
  g.box(0, 0.03 + h - 0.165, 0.17, 0.03, 0.1, 0.012, P.red);
  g.box(0, 0.07 + h, -0.1, 0.16, 0.012, 0.05, P.red);
  g.box(0, 0.07 + h, -0.1, 0.05, 0.012, 0.16, P.red);
  bush(g, ctx, 0.32, 0.32, 0.07);
  bush(g, ctx, -0.32, 0.32, 0.07);
};

MODELS.firestation = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.asphalt));
  const h = L >= 3 ? 0.55 : 0.4;
  g.box(-0.08, 0.03, -0.1, 0.62, h, 0.56, { top: P.brickDark, side: P.brick, back: P.brickDark });
  g.box(-0.08, 0.03 + h, -0.1, 0.66, 0.04, 0.6, ctx.roof(P.stoneDark));
  for (const s of [-1, 1]) g.box(-0.08 + s * 0.14, 0.03, 0.182, 0.22, 0.26, 0.012, 0xc23b2f);
  g.box(-0.08, 0.03 + h - 0.1, 0.182, 0.5, 0.06, 0.012, P.white);
  // tour de séchage
  g.box(0.33, 0.03, -0.25, 0.18, 0.95, 0.18, { top: P.brickDark, side: P.brick });
  g.roof(0.33, 0.98, -0.25, 0.22, 0.22, 0.1, 0, ctx.roof(P.roofSlate));
  g.win('front', 0.33, 0.6, -0.16, 0.06, 0.12);
  // camion
  g.box(-0.08, 0.03, 0.38, 0.38, 0.13, 0.15, P.red);
  g.box(0.06, 0.16, 0.38, 0.1, 0.06, 0.13, P.red);
  g.box(-0.12, 0.17, 0.38, 0.22, 0.015, 0.05, P.metal);
};

MODELS.police = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  const h = L >= 3 ? 0.6 : 0.42;
  g.box(0, 0.03, -0.12, 0.7, h, 0.5, { top: P.white, side: 0xf2f2f2, back: 0xdedede, left: 0xe8e8e8 });
  g.roof(0, 0.03 + h, -0.12, 0.78, 0.58, 0.22, 0.4, ctx.roof(0x3f5f9a));
  g.windows('front', 2, 0.44, 0.12, 0.13, 0.1, 0.13);
  if (L >= 3) g.windows('front', 3, 0.44, 0.38, 0.13, 0.09, 0.12);
  g.door(0, 0.13, 0.12, 0.22, 0x2b4a7a);
  g.box(0, 0.03 + h - 0.12, 0.135, 0.4, 0.06, 0.012, 0x2b4a7a);
  flagPole(g, out, 0.36, 0.3, 0.55);
  g.box(-0.22, 0.03, 0.34, 0.26, 0.09, 0.13, P.white);
  g.box(-0.22, 0.12, 0.34, 0.14, 0.05, 0.12, P.blue);
};

MODELS.watertower = (g, L, ctx, out) => {
  plot(g, 0.9, 0.9, ctx.ground(P.lawn));
  const h = 0.9 + L * 0.15;
  g.cyl(0, 0.03, 0, 0.1, h, 8, P.stoneLight);
  g.cyl(0, 0.03 + h, 0, 0.3, 0.32, 12, ctx.pick([0x8fb3c9, 0xd9d4c7, 0xa8c5a0]), 0.3, false);
  g.cone(0, 0.35 + h, 0, 0.32, 0.12, 12, ctx.roof(P.roofSlate));
  g.cyl(0, 0.03 + h - 0.06, 0, 0.12, 0.06, 8, P.stone, 0.3, false);
  g.door(0, 0.1, 0.07, 0.14, P.metal);
};

MODELS.hospital = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(P.lawn));
  const floors = 2 + L;
  const fh = 0.3;
  g.push(0, 0, 0, -0.25);
  g.box(0, 0.03, 0, 1.5, floors * fh, 0.9, { top: P.white, side: 0xf4f4f4, back: 0xe0e0e0, left: 0xeaeaea });
  for (let f = 0; f < floors; f++) {
    g.windows('front', 6, 1.2, 0.1 + f * fh, 0.45, 0.11, 0.15);
    g.windows('right', 3, 0.6, 0.1 + f * fh, 0.75, 0.11, 0.15);
    g.windows('left', 3, 0.6, 0.1 + f * fh, 0.75, 0.11, 0.15);
  }
  const top = 0.03 + floors * fh;
  g.box(0, top, 0, 1.52, 0.04, 0.92, ctx.roof(0xb5b5b5));
  g.cyl(0.3, top + 0.04, -0.05, 0.25, 0.01, 12, 0x4a4f57);
  g.box(0.22, top + 0.055, -0.05, 0.03, 0.005, 0.18, P.white);
  g.box(0.38, top + 0.055, -0.05, 0.03, 0.005, 0.18, P.white);
  g.box(0.3, top + 0.055, -0.05, 0.16, 0.005, 0.03, P.white);
  g.box(-0.45, top - 0.2, 0.455, 0.22, 0.06, 0.012, P.red);
  g.box(-0.45, top - 0.28, 0.455, 0.06, 0.22, 0.012, P.red);
  g.pop();
  g.box(0, 0.03, 0.35, 0.5, 0.25, 0.25, { top: P.white, side: 0xf0f0f0 });
  g.door(0, 0.475, 0.22, 0.2, 0x5aa3a0);
  g.box(0.7, 0.03, 0.65, 0.3, 0.12, 0.14, P.white);
  g.box(0.7, 0.15, 0.65, 0.16, 0.012, 0.04, P.red);
  for (const s of [-1, 1]) tree(g, ctx, s * 0.85, 0.85, 0.8, 'round', 0.03, s + 2);
};

/* Décors */
MODELS.tree = (g, L, ctx, out) => {
  plot(g, 0.5, 0.5, ctx.ground(P.lawn), 0.02);
  const kind = ctx.bit(1) ? 'pine' : 'round';
  tree(g, ctx, 0, 0, 1.25 + ctx.rand(1) * 0.3, kind, 0.02, ctx.v);
};

MODELS.forest = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(0x67a443), 0.015);
  tree(g, ctx, -0.2, -0.18, 1.1, 'pine', 0.015, 1);
  tree(g, ctx, 0.18, -0.05, 1.25, 'pine', 0.015, 2);
  tree(g, ctx, -0.05, 0.22, 1.0, 'round', 0.015, 3);
};

MODELS.flowers = (g, L, ctx, out) => {
  g.box(0, 0, 0, 0.66, 0.06, 0.66, { top: ctx.ground(P.soil), side: P.stoneLight });
  for (let k = 0; k < 16; k++) {
    const x = -0.24 + (k % 4) * 0.16 + (ctx.rand(k) - 0.5) * 0.05;
    const z = -0.24 + Math.floor(k / 4) * 0.16 + (ctx.rand(k + 30) - 0.5) * 0.05;
    g.cyl(x, 0.06, z, 0.008, 0.05, 4, P.leafDark);
    g.ico(x, 0.12, z, 0.035, ctx.season === 3 ? 0xeeeeee : FLOWERS[(k + ctx.v) % FLOWERS.length], 0.8, 0.3, k);
  }
};

MODELS.bench = (g, L, ctx, out) => {
  plot(g, 0.6, 0.5, ctx.ground(P.cobble), 0.02);
  g.box(0, 0.08, 0, 0.36, 0.025, 0.12, P.wood);
  g.box(0, 0.11, -0.055, 0.36, 0.1, 0.02, P.wood);
  for (const s of [-1, 1]) g.box(s * 0.15, 0.02, 0, 0.025, 0.06, 0.1, P.black);
  lamp(g, 0.24, -0.1, 0.02);
};

MODELS.fountain = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  g.cyl(0, 0.03, 0, 0.38, 0.08, 14, P.stoneLight, 0.38, true, ctx.winter ? 0xcfe3ec : P.water);
  g.cyl(0, 0.11, 0, 0.06, 0.2, 8, P.stoneLight);
  g.cyl(0, 0.31, 0, 0.14, 0.04, 10, P.stoneLight, 0.14, true, P.water);
  g.cyl(0, 0.35, 0, 0.03, 0.1, 6, P.stoneLight);
  out.emitters.push({ pos: [0, 0.46, 0], kind: 'water' });
};

MODELS.park = (g, L, ctx, out) => {
  plot(g, 2, 2, ctx.ground(P.lawn));
  g.box(0, 0.03, 0, 1.9, 0.006, 0.18, 0xd8c79e);
  g.box(0, 0.03, 0, 0.18, 0.006, 1.9, 0xd8c79e);
  g.cyl(0.5, 0.03, 0.5, 0.32, 0.03, 12, P.stoneLight, 0.32, true, ctx.winter ? 0xcfe3ec : P.water);
  const trees = [[-0.55, -0.55], [-0.75, -0.2], [-0.25, -0.8], [0.55, -0.6], [-0.6, 0.6]];
  trees.slice(0, 3 + L).forEach(([x, z], k) => tree(g, ctx, x, z, 1, k % 2 ? 'pine' : 'round', 0.03, k));
  g.box(0.25, 0.08, -0.25, 0.3, 0.025, 0.1, P.wood);
  g.box(-0.25, 0.08, 0.25, 0.1, 0.025, 0.3, P.wood);
  for (let k = 0; k < 6; k++) g.ico(0.75 - (k % 3) * 0.1, 0.07, -0.85 + Math.floor(k / 3) * 0.1, 0.035, ctx.season === 3 ? 0xeeeeee : FLOWERS[k], 0.8, 0, k);
  lamp(g, 0.15, 0.15);
  lamp(g, -0.15, -0.15);
  if (L >= 3) {
    g.cyl(-0.5, 0.03, 0.5, 0.2, 0.04, 8, P.wood);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.box(-0.5 + Math.cos(a) * 0.17, 0.07, 0.5 + Math.sin(a) * 0.17, 0.02, 0.25, 0.02, P.white);
    }
    g.cone(-0.5, 0.32, 0.5, 0.25, 0.14, 6, ctx.roof(P.roofGreen));
  }
};

MODELS.statue = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  g.box(0, 0.03, 0, 0.4, 0.08, 0.4, P.stoneLight);
  g.box(0, 0.11, 0, 0.28, 0.22, 0.28, P.stone);
  g.box(0, 0.33, 0, 0.32, 0.04, 0.32, P.stoneLight);
  const bronze = 0x6f9a7a;
  g.box(0, 0.37, 0, 0.1, 0.22, 0.08, bronze);
  g.box(0.06, 0.48, 0.0, 0.16, 0.04, 0.04, bronze);
  g.ico(0, 0.64, 0, 0.055, bronze, 1, 0, 1);
  g.cyl(0.13, 0.48, 0, 0.012, 0.22, 4, bronze);
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) bush(g, ctx, x, z, 0.07);
};

MODELS.bandstand = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.lawn));
  g.cyl(0, 0.03, 0, 0.4, 0.08, 8, P.stoneLight);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.box(Math.cos(a) * 0.34, 0.11, Math.sin(a) * 0.34, 0.025, 0.36, 0.025, P.white);
  }
  g.cyl(0, 0.47, 0, 0.42, 0.04, 8, P.white);
  g.cone(0, 0.51, 0, 0.44, 0.24, 8, ctx.roof(ctx.pick([P.red, P.roofGreen, P.blue])));
  g.ico(0, 0.77, 0, 0.03, P.gold);
};

/* Monuments */
MODELS.clocktower = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.cobble));
  g.box(0, 0.03, 0, 0.5, 0.12, 0.5, P.stoneLight);
  g.box(0, 0.15, 0, 0.38, 1.6, 0.38, { top: P.stone, side: P.stoneLight, back: P.stone, left: shade(P.stoneLight, 0.94) });
  for (let k = 0; k < 4; k++) g.box(0, 0.4 + k * 0.35, 0, 0.4, 0.03, 0.4, P.stone);
  g.door(0, 0.19, 0.12, 0.2);
  for (const f of [0, 1, 2, 3]) {
    g.push((f * Math.PI) / 2, 0, 0, 0);
    g.discZ(0, 1.5, 0.196, 0.13, 16, P.white);
    g.box(0, 1.5, 0.2, 0.012, 0.11, 0.006, P.black);
    g.box(0.04, 1.5, 0.202, 0.08, 0.012, 0.006, P.black);
    g.pop();
  }
  g.box(0, 1.75, 0, 0.44, 0.06, 0.44, P.stone);
  g.roof(0, 1.81, 0, 0.44, 0.44, 0.65, 0, ctx.roof(P.roofSlate));
  g.cyl(0, 2.46, 0, 0.01, 0.15, 4, P.gold);
  g.ico(0, 2.6, 0, 0.03, P.gold);
};

MODELS.stadium = (g, L, ctx, out) => {
  plot(g, 3, 3, ctx.ground(P.asphalt));
  // pelouse et lignes
  g.box(0, 0.03, 0, 1.7, 0.02, 2.0, ctx.winter ? 0xdfe8ea : P.pitch);
  for (let k = 0; k < 5; k++) g.box(0, 0.05, -0.8 + k * 0.4, 1.7, 0.002, 0.2, ctx.winter ? 0xd3dfe2 : 0x6bbd55);
  g.box(0, 0.052, 0, 1.6, 0.003, 0.015, P.white);
  g.box(-0.8, 0.052, 0, 0.015, 0.003, 1.9, P.white);
  g.box(0.8, 0.052, 0, 0.015, 0.003, 1.9, P.white);
  g.box(0, 0.052, -0.95, 1.6, 0.003, 0.015, P.white);
  g.box(0, 0.052, 0.95, 1.6, 0.003, 0.015, P.white);
  g.cyl(0, 0.05, 0, 0.18, 0.003, 16, P.white, 0.18, true, ctx.winter ? 0xdfe8ea : P.pitch);
  for (const s of [-1, 1]) {
    g.box(0, 0.053, s * 0.95, 0.24, 0.12, 0.012, P.white);
  }
  // tribunes
  const stand = 0xd8d4cc;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) g.box(s * (1.0 + k * 0.13), 0.03, 0, 0.13, 0.12 + k * 0.12, 2.1, { top: k % 2 ? P.blue : P.white, side: stand });
    for (let k = 0; k < 3; k++) g.box(0, 0.03, s * (1.15 + k * 0.1), 1.9, 0.1 + k * 0.1, 0.1, { top: k % 2 ? P.red : P.white, side: stand });
    g.box(s * 1.36, 0.45, 0, 0.3, 0.03, 2.1, ctx.roof(P.white));
  }
  for (const [x, z] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
    g.cyl(x, 0.03, z, 0.03, 0.95, 6, P.metal);
    g.layer('glass');
    g.box(x, 0.95, z, 0.18, 0.1, 0.06, 0xf5f0c8);
    g.layer('body');
  }
};

MODELS.station = (g, L, ctx, out) => {
  plot(g, 3, 2, ctx.ground(P.cobble));
  // voies à l'arrière
  g.box(0, 0.03, -0.75, 3, 0.02, 0.35, P.gravel);
  for (const z of [-0.85, -0.65]) g.box(0, 0.05, z, 3, 0.02, 0.025, P.metal);
  for (let k = 0; k < 14; k++) g.box(-1.4 + k * 0.215, 0.045, -0.75, 0.05, 0.01, 0.3, P.woodDark);
  // train
  const tc = [P.blue, 0x2a9d8f, P.red][ctx.v % 3];
  g.box(-0.6, 0.06, -0.75, 0.9, 0.22, 0.24, { top: P.white, side: tc });
  g.box(0.42, 0.06, -0.75, 0.9, 0.22, 0.24, { top: P.white, side: tc });
  g.layer('glass');
  g.box(-0.6, 0.16, -0.62, 0.8, 0.06, 0.01, 0xbfd4e6);
  g.box(0.42, 0.16, -0.62, 0.8, 0.06, 0.01, 0xbfd4e6);
  g.layer('body');
  // quai et marquise
  g.box(0, 0.03, -0.38, 2.8, 0.06, 0.3, P.stoneLight);
  for (let k = 0; k < 6; k++) g.box(-1.2 + k * 0.48, 0.09, -0.38, 0.03, 0.3, 0.03, P.black);
  g.box(0, 0.39, -0.42, 2.8, 0.03, 0.42, ctx.roof(0x7a8a9a));
  // bâtiment
  const wall = 0xead9bd;
  g.box(0, 0.03, 0.2, 2.2, 0.55, 0.6, { top: wall, side: wall, back: shade(wall, 0.88) });
  g.roof(0, 0.58, 0.2, 2.3, 0.7, 0.25, 1.6, ctx.roof(P.roofSlate));
  g.windows('front', 6, 1.9, 0.18, 0.5, 0.14, 0.24, P.white);
  g.door(0, 0.5, 0.24, 0.3, P.woodDark);
  g.box(0, 0.03, 0.2, 0.44, 1.05, 0.44, { top: wall, side: shade(wall, 1.02), back: shade(wall, 0.88) });
  g.discZ(0, 0.88, 0.425, 0.12, 14, P.white);
  g.box(0, 0.88, 0.43, 0.012, 0.1, 0.006, P.black);
  g.roof(0, 1.08, 0.2, 0.5, 0.5, 0.3, 0, ctx.roof(P.roofSlate));
  for (const s of [-1, 1]) lamp(g, s * 0.6, 0.85);
};

MODELS.lighthouse = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.stone));
  g.box(0, 0.03, 0, 0.6, 0.1, 0.6, { top: P.stoneLight, side: P.stoneDark });
  for (let k = 0; k < 5; k++) {
    const r0 = 0.2 - k * 0.018, r1 = 0.2 - (k + 1) * 0.018;
    g.cyl(0, 0.13 + k * 0.3, 0, r0, 0.3, 10, k % 2 ? P.red : P.white, r1, false);
  }
  const top = 0.13 + 5 * 0.3;
  g.cyl(0, top, 0, 0.2, 0.04, 10, P.black);
  g.layer('glass');
  g.cyl(0, top + 0.04, 0, 0.11, 0.18, 8, 0xf8eebb);
  g.layer('body');
  g.cone(0, top + 0.22, 0, 0.15, 0.18, 8, ctx.roof(P.red));
  g.door(0, 0.19, 0.09, 0.16, P.woodDark);
};

MODELS.castle = (g, L, ctx, out) => {
  plot(g, 3, 3, ctx.ground(P.lawn));
  const s = 0xc9c1ae, sd = 0xa79f8c;
  const roof = ctx.roof(0x3f5f9a);
  // remparts
  for (const side of [-1, 1]) {
    g.box(0, 0.03, side * 1.2, 2.2, 0.45, 0.16, { top: sd, side: s });
    g.box(side * 1.2, 0.03, 0, 0.16, 0.45, 2.2, { top: sd, side: s });
    for (let k = 0; k < 9; k++) {
      g.box(-1.0 + k * 0.25, 0.48, side * 1.2, 0.1, 0.08, 0.16, s);
      g.box(side * 1.2, 0.48, -1.0 + k * 0.25, 0.16, 0.08, 0.1, s);
    }
  }
  g.box(0, 0.03, 1.29, 0.36, 0.34, 0.03, P.woodDark);
  // tours d'angle
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    g.cyl(x, 0.03, z, 0.22, 0.8, 10, s);
    g.cone(x, 0.83, z, 0.28, 0.45, 10, roof);
  }
  // donjon
  g.box(0, 0.03, -0.15, 1.0, 1.0, 0.9, { top: sd, side: s, back: sd });
  g.windows('front', 3, 0.6, 0.5, 0.3, 0.08, 0.16);
  for (const [x, z] of [[-0.45, -0.55], [0.45, -0.55], [-0.45, 0.25], [0.45, 0.25]]) {
    g.cyl(x, 0.03, z, 0.14, 1.3, 8, s);
    g.cone(x, 1.33, z, 0.18, 0.4, 8, roof);
  }
  g.box(0, 1.03, -0.15, 0.5, 0.45, 0.45, { top: sd, side: s });
  g.cone(0, 1.48, -0.15, 0.36, 0.55, 4, roof);
  flagPole(g, out, 0, -0.15, 0.4, [P.blue, P.white, P.red], 2.02);
  tree(g, ctx, -0.7, 0.8, 0.9, 'round', 0.03, 1);
  tree(g, ctx, 0.7, 0.8, 0.9, 'round', 0.03, 2);
};

MODELS.arch = (g, L, ctx, out) => {
  plot(g, 2, 1, ctx.ground(P.cobble));
  const c = 0xe2dbc8;
  for (const s of [-1, 1]) g.box(s * 0.6, 0.03, 0, 0.5, 1.2, 0.6, { top: c, side: c, back: shade(c, 0.9) });
  g.box(0, 1.23, 0, 1.7, 0.45, 0.6, { top: shade(c, 0.95), side: c });
  g.box(0, 1.68, 0, 1.8, 0.06, 0.66, shade(c, 0.9));
  g.box(0, 0.9, 0, 0.7, 0.33, 0.6, c);
  for (const s of [-1, 1]) g.box(s * 0.6, 0.4, 0.31, 0.3, 0.45, 0.01, shade(c, 0.85));
  g.box(0, 1.35, 0.305, 1.2, 0.08, 0.01, P.gold);
};

MODELS.fallback = (g, L, ctx, out) => {
  plot(g, 0.96, 0.96, ctx.ground(P.lawn));
  g.box(0, 0.03, 0, 0.5, 0.4, 0.5, P.plaster);
  g.roof(0, 0.43, 0, 0.6, 0.6, 0.2, 0.3, ctx.roof(P.roofRed));
};

/**
 * Construit le modèle d'un bâtiment.
 * @returns {{body, glass, parts, emitters}}
 */
export function buildModel(type, level = 1, variant = 0, season = 1, theme = 'mix') {
  const g = new GeoBuilder();
  const ctx = makeCtx(variant, season, theme);
  const out = { parts: [], emitters: [] };
  ctx.out = out;
  const L = Math.max(1, Math.min(level, BUILDINGS[type]?.maxLevel || 1));
  if (hasKitModel(type)) KM[type](g, L, ctx);
  else (MODELS[type] || MODELS.fallback)(g, L, ctx, out);
  g.body.freeze();
  g.glass.freeze();
  for (const p of out.parts) {
    p.body.freeze();
    p.glass?.freeze?.();
  }
  return { body: g.body, glass: g.glass, parts: out.parts, emitters: out.emitters };
}

/** Variante visuelle stable d'un bâtiment (couleurs, petits détails). */
export function variantOf(id) {
  let h = Math.imul(id ^ 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 15;
  return h & 255;
}

/** Arbres de forêt (pour le terrain) : même style que les arbres décoratifs. */
export function forestTree(g, ctx, x, z, s, kind, salt) {
  if (hasKitModel('tree')) treeKit(g, ctx, x, z, s, kind, salt);
  else tree(g, ctx, x, z, s, kind, 0, salt);
}

export { makeCtx };
