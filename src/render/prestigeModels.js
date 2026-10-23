// Décorations et monuments de prestige (niveaux 45 à 100) : grande roue, statue équestre, jardin à
// la française, opéra, kiosque doré, fontaine monumentale, planétarium, porte de la ville, tour
// dorée, colisée, statue géante du maire et palais du Bâtisseur.
// Repère local : emprise centrée sur (0, 0), façade avant vers +z, sol à y = 0.
import { GeoBuilder, shade } from './geom.js';

const COBBLE = 0xc3bcae, MARBLE = 0xece7dd, MARBLE_D = 0xd2cbbd, STONE = 0xbfb5a2, STONE_D = 0x9e9482;
const GOLD = 0xe8b84a, GOLD_D = 0xc4912a, BRONZE = 0xa07a45, BRONZE_D = 0x7d5c33;
const WATER = 0x5cc3e8, HEDGE = 0x3f7f3a, HEDGE_L = 0x58a046, GRAVEL = 0xe2d6b8, CREAM = 0xf1e6cf;
const SLATE = 0x4a5262, WIN = 0xcfe0ea;

function pad(g, ctx, w, d, color, h = 0.012) {
  g.box(0, 0, 0, w, h, d, { top: ctx.ground(color), side: shade(color, 0.8) });
}

/** Barre de section carrée entre deux points (repère local du bâtisseur). */
function rod(g, a, b, t, color) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  d[0] /= len;
  d[1] /= len;
  d[2] /= len;
  let u = [d[2], 0, -d[0]];
  let lu = Math.hypot(u[0], u[2]);
  if (lu < 1e-4) {
    u = [1, 0, 0];
    lu = 1;
  }
  u = [u[0] / lu, 0, u[2] / lu];
  const v = [u[1] * d[2] - u[2] * d[1], u[2] * d[0] - u[0] * d[2], u[0] * d[1] - u[1] * d[0]];
  const h = t / 2;
  const P = (o, su, sv) => [o[0] + (u[0] * su + v[0] * sv) * h, o[1] + (u[1] * su + v[1] * sv) * h, o[2] + (u[2] * su + v[2] * sv) * h];
  const A = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)];
  const B = [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const face = (p, q, r, s) => {
    const n = cross(sub(q, p), sub(r, p));
    const c = [(p[0] + r[0]) / 2 - mid[0], (p[1] + r[1]) / 2 - mid[1], (p[2] + r[2]) / 2 - mid[2]];
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) g.quad(s, r, q, p, color);
    else g.quad(p, q, r, s, color);
  };
  for (let k = 0; k < 4; k++) face(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]);
  face(A[0], A[1], A[2], A[3]);
  face(B[0], B[1], B[2], B[3]);
}
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

function lamp(g, x, z, h = 0.34) {
  g.cyl(x, 0, z, 0.012, h, 6, 0x2f2f33);
  g.box(x, h - 0.01, z, 0.05, 0.012, 0.05, 0x2f2f33);
  g.layer('glass');
  g.box(x, h, z, 0.04, 0.05, 0.04, 0xfff1c2);
  g.layer('body');
  g.cone(x, h + 0.05, z, 0.035, 0.03, 4, 0x2f2f33);
}

function flowers(g, ctx, x, z, w, d, seed = 1) {
  g.box(x, 0, z, w, 0.03, d, { top: 0x6e4a2f, side: 0x5a3c26 });
  if (ctx.winter) return;
  const cols = [0xe94b5a, 0xf2c94c, 0xf6f2e8, 0xe57bb0, 0x9b6bd1];
  const n = Math.max(2, Math.round((w * d) / 0.006));
  for (let k = 0; k < n; k++) {
    const fx = x - w / 2 + 0.02 + ((k * 0.618 + seed * 0.37) % 1) * (w - 0.04);
    const fz = z - d / 2 + 0.02 + ((k * 0.381 + seed * 0.73) % 1) * (d - 0.04);
    g.box(fx, 0.03, fz, 0.022, 0.022, 0.022, cols[(k + seed) % cols.length]);
  }
}

function topiary(g, ctx, x, z, h = 0.3) {
  g.cyl(x, 0, z, 0.05, 0.05, 8, 0xb5523b, 0.06);
  g.cone(x, 0.05, z, 0.07, h, 8, ctx.leaf ? ctx.leaf(HEDGE) : HEDGE);
}

/** Personnage en métal (statues) : jambes, redingote, épaules, tête, bras levé (avec un marteau). */
function figure(g, x, y, z, s, color, { arm = 'up', tool = false } = {}) {
  const c2 = shade(color, 0.85), c3 = shade(color, 1.08);
  // jambes et chaussures
  for (const sx of [-1, 1]) {
    rod(g, [x + sx * 0.032 * s, y + 0.01 * s, z], [x + sx * 0.03 * s, y + 0.2 * s, z], 0.042 * s, c2);
    g.box(x + sx * 0.032 * s, y, z + 0.015 * s, 0.045 * s, 0.025 * s, 0.075 * s, c2);
  }
  // redingote (évasée), buste et épaules
  g.cyl(x, y + 0.14 * s, z, 0.085 * s, 0.2 * s, 10, color, 0.065 * s);
  g.box(x, y + 0.32 * s, z, 0.15 * s, 0.07 * s, 0.09 * s, c3);
  g.ico(x, y + 0.36 * s, z, 0.05 * s, color, 0.6, 0, 7);
  // tête
  g.cyl(x, y + 0.38 * s, z, 0.025 * s, 0.04 * s, 8, c2);
  g.ico(x, y + 0.46 * s, z, 0.052 * s, c3, 1.05, 0, 3);
  // bras
  rod(g, [x - 0.075 * s, y + 0.34 * s, z], [x - 0.09 * s, y + 0.2 * s, z + 0.02 * s], 0.036 * s, color);
  if (arm === 'up') {
    rod(g, [x + 0.075 * s, y + 0.35 * s, z], [x + 0.11 * s, y + 0.48 * s, z + 0.03 * s], 0.036 * s, color);
    rod(g, [x + 0.11 * s, y + 0.48 * s, z + 0.03 * s], [x + 0.12 * s, y + 0.6 * s, z + 0.04 * s], 0.032 * s, color);
    g.ico(x + 0.12 * s, y + 0.61 * s, z + 0.04 * s, 0.022 * s, c3, 1, 0, 2);
    if (tool) {
      // le marteau du bâtisseur, brandi
      rod(g, [x + 0.12 * s, y + 0.57 * s, z + 0.04 * s], [x + 0.12 * s, y + 0.78 * s, z + 0.04 * s], 0.02 * s, c2);
      g.box(x + 0.12 * s, y + 0.76 * s, z + 0.04 * s, 0.12 * s, 0.05 * s, 0.05 * s, c3);
    }
  } else rod(g, [x + 0.075 * s, y + 0.34 * s, z], [x + 0.09 * s, y + 0.2 * s, z + 0.02 * s], 0.036 * s, color);
}

export function addPrestigeModels(KM) {
  /* ───────── Grande roue (2 × 2) : la roue tourne vraiment ───────── */
  KM.ferris = (g, L, ctx) => {
    pad(g, ctx, 1.96, 1.96, COBBLE);
    const R = 0.72, cy = 0.96, steel = 0xe8edf2, steelD = 0xa9b4c0;
    g.box(0, 0, 0, 1.1, 0.08, 0.52, { top: 0xd8d0c0, side: 0xb8ae9c });
    g.box(0, 0, 0.36, 0.5, 0.04, 0.2, { top: 0xd8d0c0, side: 0xb8ae9c });
    for (const z of [-0.17, 0.17]) {
      rod(g, [-0.52, 0.08, z], [0, cy, z * 0.55], 0.05, steel);
      rod(g, [0.52, 0.08, z], [0, cy, z * 0.55], 0.05, steel);
      rod(g, [-0.3, 0.46, z * 0.8], [0.3, 0.46, z * 0.8], 0.03, steelD);
    }
    g.cylZ(0, cy, 0, 0.055, 0.34, 10, steelD);
    // la roue (pièce mobile)
    const w = new GeoBuilder();
    const N = 28;
    const pt = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      for (const z of [-0.09, 0.09]) {
        rod(w, pt(a0, R, z), pt(a1, R, z), 0.03, steel);
        rod(w, pt(a0, R * 0.62, z), pt(a1, R * 0.62, z), 0.018, steelD);
      }
      rod(w, pt(a0, R, -0.09), pt(a0, R, 0.09), 0.016, steelD);
      if (k % 2 === 0) for (const z of [-0.09, 0.09]) rod(w, [0, 0, z * 0.5], pt(a0, R, z), 0.014, steel);
      // guirlande lumineuse
      w.layer('glass');
      const p = pt(a0, R + 0.02, 0.1);
      w.box(p[0], p[1], p[2], 0.018, 0.018, 0.01, [0xfff1c2, 0xffb3c1, 0xb3e5ff][k % 3]);
      w.layer('body');
    }
    w.cylZ(0, 0, 0, 0.09, 0.24, 12, GOLD, GOLD_D);
    const cols = [0xe94b5a, 0x3f7fd1, 0xf2c94c, 0x2a9d8f, 0x9b6bd1, 0xff8a3d];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const [x, y] = pt(a, R, 0);
      rod(w, [x, y, 0], [x, y - 0.06, 0], 0.012, 0x555a60);
      w.box(x, y - 0.17, 0, 0.11, 0.1, 0.12, { top: shade(cols[k % 6], 1.1), side: cols[k % 6] });
      w.roof(x, y - 0.07, 0, 0.13, 0.14, 0.04, 0, shade(cols[k % 6], 0.8));
      w.layer('glass');
      w.box(x, y - 0.14, 0.061, 0.08, 0.04, 0.004, WIN);
      w.layer('body');
    }
    ctx.out.parts.push({ body: w.body, glass: w.glass, pivot: [0, cy, 0], axis: 'z', kind: 'spin', speed: 0.16 });
    // guichet, barrières, lampadaires, fleurs
    g.box(-0.72, 0, 0.6, 0.26, 0.22, 0.22, { top: 0xf6efdf, side: 0xe94b5a });
    g.roof(-0.72, 0.22, 0.6, 0.32, 0.28, 0.1, 0.32, ctx.roof(0xf6efdf));
    g.layer('glass');
    g.box(-0.72, 0.1, 0.712, 0.14, 0.07, 0.004, WIN);
    g.layer('body');
    for (let k = 0; k < 5; k++) g.box(-0.2 + k * 0.1, 0, 0.62, 0.012, 0.07, 0.012, 0x6e4a2f);
    g.box(0.0, 0.06, 0.62, 0.42, 0.012, 0.012, 0xe94b5a);
    lamp(g, 0.8, 0.8);
    lamp(g, -0.85, -0.8);
    flowers(g, ctx, 0.72, 0.55, 0.36, 0.2, 2);
  };

  /* ───────── Statue équestre (1 × 1) ───────── */
  KM.equestrian = (g, L, ctx) => {
    pad(g, ctx, 0.94, 0.94, COBBLE);
    g.box(0, 0, 0, 0.66, 0.05, 0.66, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.05, 0, 0.52, 0.05, 0.4, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.1, 0, 0.42, 0.3, 0.26, { top: MARBLE, side: MARBLE_D, front: shade(MARBLE, 0.97) });
    g.box(0, 0.36, 0, 0.46, 0.04, 0.3, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.2, 0.131, 0.22, 0.06, 0.004, GOLD); // plaque
    const y = 0.4;
    // le cheval (cabré)
    g.box(0, y + 0.13, 0, 0.26, 0.09, 0.09, BRONZE);
    rod(g, [-0.09, y, -0.03], [-0.09, y + 0.14, -0.03], 0.03, BRONZE_D);
    rod(g, [-0.09, y, 0.03], [-0.09, y + 0.14, 0.03], 0.03, BRONZE_D);
    rod(g, [0.1, y + 0.14, -0.03], [0.17, y + 0.08, -0.03], 0.028, BRONZE_D);
    rod(g, [0.17, y + 0.08, -0.03], [0.2, y + 0.13, -0.03], 0.024, BRONZE_D);
    rod(g, [0.1, y + 0.14, 0.03], [0.16, y + 0.06, 0.03], 0.028, BRONZE_D);
    rod(g, [0.16, y + 0.06, 0.03], [0.21, y + 0.1, 0.03], 0.024, BRONZE_D);
    rod(g, [0.1, y + 0.17, 0], [0.17, y + 0.3, 0], 0.06, BRONZE);
    g.box(0.21, y + 0.28, 0, 0.1, 0.05, 0.05, BRONZE);
    rod(g, [-0.13, y + 0.16, 0], [-0.2, y + 0.06, 0], 0.03, BRONZE_D);
    // le cavalier, épée levée
    g.box(-0.01, y + 0.19, 0, 0.07, 0.13, 0.07, BRONZE);
    g.ico(-0.01, y + 0.29, 0, 0.035, BRONZE, 1, 0, 2);
    g.cyl(-0.01, y + 0.31, 0, 0.03, 0.02, 8, BRONZE_D);
    rod(g, [0.02, y + 0.27, 0.03], [0.08, y + 0.36, 0.04], 0.022, BRONZE);
    rod(g, [0.08, y + 0.35, 0.04], [0.12, y + 0.5, 0.04], 0.01, 0xd8dde3);
    for (const s of [-1, 1]) rod(g, [-0.01, y + 0.17, s * 0.04], [0.02, y + 0.08, s * 0.06], 0.022, BRONZE_D);
    flowers(g, ctx, 0, 0.4, 0.7, 0.06, 1);
    flowers(g, ctx, 0, -0.4, 0.7, 0.06, 3);
  };

  /* ───────── Jardin à la française (2 × 2) ───────── */
  KM.frgarden = (g, L, ctx) => {
    pad(g, ctx, 1.96, 1.96, 0x8cbf4f);
    g.box(0, 0, 0, 1.96, 0.016, 0.16, { top: ctx.ground(GRAVEL), side: shade(GRAVEL, 0.85) });
    g.box(0, 0, 0, 0.16, 0.016, 1.96, { top: ctx.ground(GRAVEL), side: shade(GRAVEL, 0.85) });
    for (const s of [-1, 1]) {
      g.box(0, 0, s * 0.9, 1.96, 0.016, 0.12, { top: ctx.ground(GRAVEL), side: shade(GRAVEL, 0.85) });
      g.box(s * 0.9, 0, 0, 0.12, 0.016, 1.96, { top: ctx.ground(GRAVEL), side: shade(GRAVEL, 0.85) });
    }
    const hedge = ctx.leaf ? ctx.leaf(HEDGE) : HEDGE, hedgeL = ctx.leaf ? ctx.leaf(HEDGE_L) : HEDGE_L;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 0.46, cz = sz * 0.46;
      // bordure de buis et motif en losange
      for (const [w, d, ox, oz] of [[0.6, 0.05, 0, 0.3], [0.6, 0.05, 0, -0.3], [0.05, 0.6, 0.3, 0], [0.05, 0.6, -0.3, 0]]) g.box(cx + ox, 0.01, cz + oz, w, 0.07, d, { top: hedgeL, side: hedge });
      g.push(Math.PI / 4, cx, 0, cz);
      for (const [w, d, ox, oz] of [[0.34, 0.04, 0, 0.17], [0.34, 0.04, 0, -0.17], [0.04, 0.34, 0.17, 0], [0.04, 0.34, -0.17, 0]]) g.box(ox, 0.01, oz, w, 0.06, d, { top: hedgeL, side: hedge });
      g.pop();
      flowers(g, ctx, cx, cz, 0.2, 0.2, (sx + 2) * 3 + sz);
      topiary(g, ctx, cx + sx * 0.3, cz + sz * 0.3, 0.26);
    }
    // bassin central
    g.cyl(0, 0, 0, 0.26, 0.07, 18, MARBLE, 0.26, true, ctx.winter ? 0xcfe3ec : WATER);
    g.cyl(0, 0.07, 0, 0.04, 0.12, 8, MARBLE);
    ctx.out.emitters.push({ pos: [0, 0.22, 0], kind: 'water' });
    lamp(g, 0.12, 0.6);
    lamp(g, -0.12, -0.6);
  };

  /* ───────── Opéra (3 × 2) ───────── */
  KM.opera = (g, L, ctx) => {
    pad(g, ctx, 2.96, 1.96, COBBLE);
    // marches
    for (let k = 0; k < 3; k++) g.box(0, k * 0.03, 0.82 - k * 0.06, 1.7 - k * 0.1, 0.03, 0.2, { top: MARBLE, side: MARBLE_D });
    // corps principal
    g.box(0, 0, -0.18, 2.2, 0.08, 1.12, { top: MARBLE_D, side: STONE_D });
    g.box(0, 0.08, -0.2, 2.1, 0.56, 1.0, { top: CREAM, side: CREAM, front: shade(CREAM, 1.02), back: shade(CREAM, 0.86) });
    g.box(0, 0.64, -0.2, 2.16, 0.05, 1.06, { top: MARBLE, side: MARBLE_D });
    g.roof(0, 0.69, -0.2, 2.1, 1.0, 0.16, 1.4, ctx.roof(0x7fae9a), shade(CREAM, 0.9));
    // ailes
    for (const s of [-1, 1]) {
      g.box(s * 1.2, 0, -0.1, 0.46, 0.5, 0.8, { top: CREAM, side: shade(CREAM, 0.96) });
      g.roof(s * 1.2, 0.5, -0.1, 0.52, 0.86, 0.14, 0, ctx.roof(0x7fae9a));
      g.layer('glass');
      for (let k = 0; k < 2; k++) g.box(s * 1.2 - 0.1 + k * 0.2, 0.22, 0.302, 0.08, 0.14, 0.004, WIN);
      g.layer('body');
    }
    // portique : colonnes et fronton
    g.box(0, 0.08, 0.42, 1.5, 0.03, 0.26, { top: MARBLE, side: MARBLE_D });
    for (let k = 0; k < 8; k++) g.cyl(-0.63 + k * 0.18, 0.11, 0.46, 0.032, 0.48, 8, MARBLE);
    g.box(0, 0.59, 0.42, 1.5, 0.08, 0.28, { top: MARBLE, side: MARBLE_D });
    g.roofZ(0, 0.67, 0.42, 1.5, 0.28, 0.2, 0.28, ctx.roof(MARBLE), MARBLE_D);
    g.box(0, 0.7, 0.565, 0.4, 0.08, 0.004, GOLD);
    // dôme
    g.cyl(0, 0.85, -0.3, 0.3, 0.16, 18, CREAM);
    g.layer('glass');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.box(Math.sin(a) * 0.301, 0.92, -0.3 + Math.cos(a) * 0.301, 0.05, 0.07, 0.05, WIN);
    }
    g.layer('body');
    g.dome(0, 1.01, -0.3, 0.31, ctx.roof(0x7fae9a), 18, 5, 1.05);
    g.cyl(0, 1.33, -0.3, 0.05, 0.08, 8, CREAM);
    g.ico(0, 1.45, -0.3, 0.05, GOLD, 1, 0, 2);
    // fenêtres en arcades
    g.layer('glass');
    for (let k = 0; k < 9; k++) {
      g.box(-0.96 + k * 0.24, 0.42, 0.302, 0.1, 0.16, 0.004, WIN);
      g.box(-0.96 + k * 0.24, 0.42, -0.702, 0.1, 0.16, 0.004, WIN);
    }
    g.layer('body');
    // statues dorées sur le toit
    for (const x of [-0.95, 0.95]) figure(g, x, 0.69, 0.26, 0.45, GOLD, { arm: 'up' });
    for (const x of [-0.8, 0.8]) lamp(g, x, 0.86, 0.4);
  };

  /* ───────── Kiosque doré (1 × 1) ───────── */
  KM.goldkiosk = (g, L, ctx) => {
    pad(g, ctx, 0.94, 0.94, COBBLE);
    g.cyl(0, 0, 0, 0.38, 0.06, 8, MARBLE_D, 0.38, true, MARBLE);
    g.cyl(0, 0.06, 0, 0.34, 0.03, 8, MARBLE, 0.34, true, 0xd9cbb0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3;
      g.cyl(x, 0.09, z, 0.018, 0.34, 6, 0xf6efdf);
      g.cyl(x, 0.09, z, 0.03, 0.03, 6, GOLD);
      if (k !== 1) {
        const b = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
        rod(g, [x, 0.17, z], [Math.cos(b) * 0.3, 0.17, Math.sin(b) * 0.3], 0.012, GOLD_D);
      }
    }
    g.cyl(0, 0.43, 0, 0.36, 0.05, 8, 0xf6efdf);
    g.cone(0, 0.48, 0, 0.4, 0.24, 8, ctx.roof(GOLD));
    g.cyl(0, 0.7, 0, 0.05, 0.06, 8, GOLD_D);
    g.ico(0, 0.79, 0, 0.04, GOLD, 1, 0, 1);
    g.layer('glass');
    g.cyl(0, 0.36, 0, 0.05, 0.05, 8, 0xfff1c2);
    g.layer('body');
    g.box(0, 0.09, 0, 0.14, 0.12, 0.08, 0x6e4a2f); // pupitre du chef d'orchestre
  };

  /* ───────── Fontaine monumentale (2 × 2) ───────── */
  KM.grandfountain = (g, L, ctx) => {
    pad(g, ctx, 1.96, 1.96, COBBLE);
    const water = ctx.winter ? 0xcfe3ec : WATER;
    g.cyl(0, 0, 0, 0.84, 0.13, 16, MARBLE_D, 0.84, true, MARBLE);
    g.cyl(0, 0.01, 0, 0.76, 0.115, 16, MARBLE, 0.76, true, water);
    g.cyl(0, 0.12, 0, 0.13, 0.26, 10, MARBLE);
    g.cyl(0, 0.36, 0, 0.42, 0.07, 14, MARBLE_D, 0.42, true, water);
    g.cyl(0, 0.43, 0, 0.07, 0.2, 8, MARBLE);
    g.cyl(0, 0.62, 0, 0.22, 0.05, 12, MARBLE_D, 0.22, true, water);
    g.cyl(0, 0.67, 0, 0.06, 0.06, 8, GOLD_D);
    figure(g, 0, 0.73, 0, 0.55, GOLD, { arm: 'up' });
    ctx.out.emitters.push({ pos: [0, 0.68, 0], kind: 'water' });
    ctx.out.emitters.push({ pos: [0.3, 0.44, 0], kind: 'water' });
    ctx.out.emitters.push({ pos: [-0.3, 0.44, 0], kind: 'water' });
    // têtes de lions qui crachent l'eau dans le bassin
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      g.ico(Math.cos(a) * 0.86, 0.15, Math.sin(a) * 0.86, 0.05, GOLD, 1, 0.2, k);
    }
    for (const [x, z] of [[0.86, 0.86], [-0.86, 0.86], [0.86, -0.86], [-0.86, -0.86]]) lamp(g, x, z, 0.38);
    flowers(g, ctx, 0.62, 0.86, 0.3, 0.12, 1);
    flowers(g, ctx, -0.62, -0.86, 0.3, 0.12, 4);
  };

  /* ───────── Planétarium (2 × 2) ───────── */
  KM.planetarium = (g, L, ctx) => {
    pad(g, ctx, 1.96, 1.96, COBBLE);
    g.box(0, 0, -0.05, 1.7, 0.08, 1.6, { top: MARBLE, side: MARBLE_D });
    const white = 0xf2f0ea;
    g.cyl(0, 0.08, -0.1, 0.62, 0.34, 22, white);
    g.cyl(0, 0.42, -0.1, 0.65, 0.04, 22, MARBLE_D);
    g.layer('glass');
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      g.box(Math.sin(a) * 0.622, 0.2, -0.1 + Math.cos(a) * 0.622, 0.07, 0.12, 0.07, WIN);
    }
    g.layer('body');
    g.dome(0, 0.46, -0.1, 0.63, ctx.roof(0xdfe5ea), 22, 6, 0.88);
    // fente du télescope, le long du dôme
    for (let k = 0; k < 7; k++) {
      const ph = 0.15 + k * 0.17;
      g.box(0, 0.46 + 0.63 * 0.88 * Math.cos(ph) - 0.02, -0.1 + 0.63 * Math.sin(ph) * 0.99, 0.09, 0.05, 0.1, 0x2c3440);
    }
    // portique d'entrée
    g.box(0, 0.08, 0.62, 0.6, 0.3, 0.2, { top: white, side: shade(white, 0.95) });
    for (let k = 0; k < 4; k++) g.cyl(-0.24 + k * 0.16, 0.08, 0.74, 0.022, 0.3, 6, MARBLE);
    g.roofZ(0, 0.38, 0.66, 0.66, 0.26, 0.1, 0.26, ctx.roof(MARBLE), MARBLE_D);
    g.box(0, 0.08, 0.725, 0.18, 0.2, 0.01, 0x3a4a5a);
    // petite coupole d'observation et télescope
    g.cyl(0.66, 0.08, -0.66, 0.18, 0.2, 12, white);
    g.dome(0.66, 0.28, -0.66, 0.19, ctx.roof(0xc9d2da), 12, 4, 1);
    rod(g, [-0.62, 0.08, 0.6], [-0.62, 0.2, 0.6], 0.02, 0x3a3f46);
    rod(g, [-0.66, 0.2, 0.62], [-0.52, 0.3, 0.56], 0.04, 0x8a96a3);
    lamp(g, 0.6, 0.86);
    lamp(g, -0.86, 0.3);
  };

  /* ───────── Porte de la ville (2 × 1) ───────── */
  KM.citygate = (g, L, ctx) => {
    pad(g, ctx, 1.96, 0.96, COBBLE);
    const st = STONE, std = STONE_D;
    // le mur et la grande arche
    g.box(0, 0, 0, 1.0, 0.68, 0.34, { top: shade(st, 1.05), side: st, back: std });
    g.box(0, 0, 0.172, 0.4, 0.42, 0.005, 0x2a2420);
    g.box(0, 0, -0.172, 0.4, 0.42, 0.005, 0x2a2420);
    g.cylZ(0, 0.42, 0.172, 0.2, 0.006, 12, 0x2a2420, 0x2a2420);
    g.cylZ(0, 0.42, -0.172, 0.2, 0.006, 12, 0x2a2420, 0x2a2420);
    for (let k = 0; k < 5; k++) g.box(-0.16 + k * 0.08, 0.2, 0.18, 0.012, 0.42, 0.012, 0x6e4a2f); // herse levée
    g.box(0, 0.6, 0.18, 0.44, 0.012, 0.012, 0x6e4a2f);
    for (let k = 0; k < 6; k++) g.box(-0.42 + k * 0.168, 0.68, 0, 0.09, 0.08, 0.34, shade(st, 1.05)); // créneaux
    g.box(0, 0.5, 0.176, 0.14, 0.1, 0.004, GOLD); // blason
    // les tours
    for (const s of [-1, 1]) {
      g.cyl(s * 0.68, 0, 0, 0.25, 0.96, 12, st);
      g.cyl(s * 0.68, 0.96, 0, 0.29, 0.06, 12, shade(st, 1.05));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.box(s * 0.68 + Math.cos(a) * 0.25, 1.02, Math.sin(a) * 0.25, 0.08, 0.07, 0.08, shade(st, 1.05));
      }
      g.cone(s * 0.68, 1.02, 0, 0.24, 0.36, 12, ctx.roof(SLATE));
      rod(g, [s * 0.68, 1.36, 0], [s * 0.68, 1.56, 0], 0.012, 0x3a2a20);
      g.box(s * 0.68 + 0.06, 1.5, 0, 0.12, 0.06, 0.006, s > 0 ? 0x3f7fd1 : 0xe94b5a);
      g.layer('glass');
      g.box(s * 0.68, 0.62, 0.251, 0.05, 0.1, 0.004, 0xffd27a);
      g.layer('body');
    }
    // bannières
    for (const s of [-1, 1]) g.box(s * 0.32, 0.3, 0.175, 0.08, 0.26, 0.004, s > 0 ? 0x3f7fd1 : 0xe94b5a);
  };

  /* ───────── Tour dorée (1 × 1) ───────── */
  KM.goldtower = (g, L, ctx) => {
    pad(g, ctx, 0.94, 0.94, COBBLE);
    g.box(0, 0, 0, 0.56, 0.08, 0.56, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.08, 0, 0.42, 0.62, 0.42, { top: CREAM, side: CREAM, back: shade(CREAM, 0.88) });
    g.box(0, 0.7, 0, 0.46, 0.04, 0.46, GOLD_D);
    g.box(0, 0.74, 0, 0.34, 0.42, 0.34, { top: CREAM, side: shade(CREAM, 0.97) });
    for (let k = 0; k < 4; k++) {
      g.push((k * Math.PI) / 2, 0, 0, 0);
      g.discZ(0, 0.94, 0.172, 0.11, 16, 0xffffff);
      g.box(0, 0.94, 0.175, 0.01, 0.08, 0.004, 0x222222);
      g.box(0.03, 0.94, 0.176, 0.06, 0.01, 0.004, 0x222222);
      g.layer('glass');
      g.box(0, 0.4, 0.212, 0.08, 0.16, 0.004, WIN);
      g.layer('body');
      g.pop();
    }
    g.box(0, 1.16, 0, 0.38, 0.04, 0.38, GOLD_D);
    g.box(0, 1.2, 0, 0.24, 0.18, 0.24, GOLD);
    g.cone(0, 1.38, 0, 0.17, 0.6, 8, ctx.roof(GOLD));
    g.ico(0, 2.0, 0, 0.04, GOLD, 1, 0, 1);
    lamp(g, 0.36, 0.36, 0.3);
  };

  /* ───────── Colisée (3 × 3) ───────── */
  KM.colosseum = (g, L, ctx) => {
    pad(g, ctx, 2.96, 2.96, 0xd9c9a8);
    const tr = 0xdccba6, trD = 0xbfae88, dark = 0x5c4a36;
    const rx = 1.28, rz = 1.12, N = 32;
    const ept = (t, k = 1) => [Math.cos(t) * rx * k, Math.sin(t) * rz * k];
    // arène et gradins
    const fan = (k, y, color) => {
      for (let i = 0; i < N; i++) {
        const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
        const [x0, z0] = ept(t0, k), [x1, z1] = ept(t1, k);
        g.tri([0, y, 0], [x1, y, z1], [x0, y, z0], color);
      }
    };
    fan(0.9, 0.02, 0xcdb79a);
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < N; i++) {
        const t = ((i + 0.5) / N) * Math.PI * 2;
        const k = 0.6 + s * 0.08;
        const [x, z] = ept(t, k);
        const seg = (2 * Math.PI * rx * k) / N + 0.02;
        g.push(Math.atan2(Math.cos(t) * rz, Math.sin(t) * rx), x, 0, z);
        g.box(0, 0, 0, seg, 0.06 + s * 0.08, 0.1, { top: s % 2 ? 0xe8dcc0 : 0xd5c5a2, side: trD });
        g.pop();
      }
    }
    fan(0.58, 0.025, ctx.winter ? 0xeef3f6 : 0xe3cf9e); // le sable de l'arène
    // le mur extérieur : trois étages d'arches (un côté en ruine)
    for (let i = 0; i < N; i++) {
      const t = ((i + 0.5) / N) * Math.PI * 2;
      const [x, z] = ept(t);
      const seg = (2 * Math.PI * Math.sqrt((rx * rx + rz * rz) / 2)) / N + 0.03;
      const ruined = i >= 20 && i <= 25;
      const tiers = ruined ? (i === 22 || i === 23 ? 1 : 2) : 3;
      g.push(Math.atan2(Math.cos(t) * rz, Math.sin(t) * rx), x, 0, z);
      const H = [0.34, 0.3, 0.26];
      let y = 0;
      for (let k = 0; k < tiers; k++) {
        g.box(0, y, 0, seg, H[k], 0.16, { top: tr, side: k % 2 ? shade(tr, 0.96) : tr, back: trD });
        g.box(0, y + 0.03, 0.081, seg * 0.52, H[k] * 0.62, 0.004, dark);
        g.box(0, y + 0.03, -0.081, seg * 0.52, H[k] * 0.62, 0.004, dark);
        g.box(0, y + H[k] - 0.025, 0.083, seg, 0.025, 0.006, trD);
        y += H[k];
      }
      if (!ruined) g.box(0, y, 0, seg, 0.08, 0.16, { top: shade(tr, 1.04), side: tr });
      g.pop();
    }
    // entrée et drapeaux
    for (const s of [-1, 1]) {
      rod(g, [s * 0.35, 0, 1.3], [s * 0.35, 0.5, 1.3], 0.016, 0x3a2a20);
      g.box(s * 0.35 + 0.07, 0.44, 1.3, 0.14, 0.08, 0.006, 0xc0392b);
    }
    for (const [x, z] of [[1.35, 1.35], [-1.35, 1.35]]) lamp(g, x, z, 0.4);
  };

  /* ───────── Statue géante du maire (2 × 2) ───────── */
  KM.mayorstatue = (g, L, ctx) => {
    pad(g, ctx, 1.96, 1.96, MARBLE);
    for (let k = 0; k < 3; k++) g.box(0, k * 0.05, 0, 1.5 - k * 0.24, 0.05, 1.5 - k * 0.24, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.15, 0, 0.62, 0.46, 0.62, { top: MARBLE, side: MARBLE_D, front: shade(MARBLE, 0.98) });
    g.box(0, 0.5, 0, 0.66, 0.04, 0.66, GOLD_D);
    g.box(0, 0.3, 0.312, 0.34, 0.08, 0.004, GOLD); // plaque « Au maire »
    figure(g, 0, 0.54, 0, 1.75, GOLD, { arm: 'up', tool: true });
    g.cyl(0, 0.54 + 0.48 * 1.75, 0, 0.06, 0.12, 8, GOLD_D); // chapeau haut-de-forme
    g.cyl(0, 0.54 + 0.48 * 1.75, 0, 0.1, 0.012, 10, GOLD_D);
    for (const [x, z] of [[0.82, 0.82], [-0.82, 0.82], [0.82, -0.82], [-0.82, -0.82]]) {
      topiary(g, ctx, x, z, 0.3);
    }
    flowers(g, ctx, 0, 0.82, 0.9, 0.12, 2);
    lamp(g, 0.5, 0.86, 0.4);
    lamp(g, -0.5, 0.86, 0.4);
  };

  /* ───────── Palais du Bâtisseur (3 × 3) ───────── */
  KM.palace = (g, L, ctx) => {
    pad(g, ctx, 2.96, 2.96, COBBLE);
    const wall = CREAM, roof = ctx.roof(GOLD), roofD = ctx.roof(GOLD_D);
    // jardins de la cour
    for (const s of [-1, 1]) {
      g.box(s * 0.85, 0, 0.85, 0.9, 0.02, 0.9, { top: ctx.ground(0x8cbf4f), side: 0x6f9a3e });
      topiary(g, ctx, s * 0.55, 0.55, 0.26);
      topiary(g, ctx, s * 1.15, 1.15, 0.26);
      flowers(g, ctx, s * 0.85, 0.85, 0.4, 0.4, s + 3);
    }
    g.box(0, 0, 0.8, 0.5, 0.016, 1.3, { top: ctx.ground(GRAVEL), side: shade(GRAVEL, 0.85) });
    g.cyl(0, 0, 0.8, 0.22, 0.07, 14, MARBLE, 0.22, true, ctx.winter ? 0xcfe3ec : WATER);
    g.cyl(0, 0.07, 0.8, 0.035, 0.14, 8, GOLD_D);
    ctx.out.emitters.push({ pos: [0, 0.24, 0.8], kind: 'water' });
    // corps central
    g.box(0, 0, -0.55, 1.7, 0.08, 1.0, { top: MARBLE, side: MARBLE_D });
    g.box(0, 0.08, -0.55, 1.6, 0.62, 0.9, { top: wall, side: wall, front: shade(wall, 1.02), back: shade(wall, 0.86) });
    g.roof(0, 0.7, -0.55, 1.7, 1.0, 0.3, 1.2, roof, shade(wall, 0.9));
    // pavillon central et dôme d'or
    g.box(0, 0.08, -0.1, 0.62, 0.86, 0.3, { top: wall, side: shade(wall, 1.02) });
    for (let k = 0; k < 4; k++) g.cyl(-0.23 + k * 0.153, 0.08, 0.06, 0.03, 0.62, 8, MARBLE);
    g.roofZ(0, 0.94, -0.1, 0.66, 0.34, 0.16, 0.34, roof, MARBLE_D);
    g.cyl(0, 1.0, -0.5, 0.26, 0.16, 16, wall);
    g.dome(0, 1.16, -0.5, 0.27, roof, 16, 5, 1.1);
    g.cyl(0, 1.45, -0.5, 0.05, 0.08, 8, wall);
    g.ico(0, 1.57, -0.5, 0.05, GOLD, 1, 0, 2);
    g.box(0, 0.08, 0.052, 0.2, 0.32, 0.01, 0x6e4a2f);
    // ailes
    for (const s of [-1, 1]) {
      g.box(s * 1.05, 0, -0.05, 0.56, 0.56, 1.3, { top: wall, side: wall, front: shade(wall, 1.02) });
      g.roof(s * 1.05, 0.56, -0.05, 0.62, 1.36, 0.24, 0, roofD);
      g.layer('glass');
      for (let k = 0; k < 4; k++) g.box(s * 1.334, 0.3, -0.55 + k * 0.33, 0.004, 0.14, 0.08, WIN);
      for (let k = 0; k < 2; k++) g.box(s * 1.05 - 0.12 + k * 0.24, 0.3, 0.602, 0.08, 0.14, 0.004, WIN);
      g.layer('body');
      // tours d'angle
      g.cyl(s * 1.26, 0, -1.2, 0.17, 1.0, 12, wall);
      g.cone(s * 1.26, 1.0, -1.2, 0.2, 0.42, 12, roof);
      rod(g, [s * 1.26, 1.42, -1.2], [s * 1.26, 1.62, -1.2], 0.012, 0x3a2a20);
      g.box(s * 1.26 + 0.07, 1.56, -1.2, 0.14, 0.07, 0.006, 0x3f7fd1);
    }
    g.layer('glass');
    for (let f = 0; f < 2; f++) for (let k = 0; k < 6; k++) if (k !== 2 && k !== 3) g.box(-0.64 + k * 0.256, 0.24 + f * 0.24, -0.098, 0.08, 0.13, 0.004, WIN);
    g.layer('body');
    // grille dorée et portail
    for (let k = 0; k <= 12; k++) {
      const x = -1.4 + k * (2.8 / 12);
      if (Math.abs(x) < 0.3) continue;
      g.box(x, 0, 1.38, 0.025, 0.24, 0.025, GOLD_D);
    }
    for (const s of [-1, 1]) g.box(s * 0.86, 0.2, 1.38, 1.1, 0.02, 0.02, GOLD_D);
    for (const s of [-1, 1]) {
      g.box(s * 0.3, 0, 1.38, 0.08, 0.34, 0.08, MARBLE);
      g.ico(s * 0.3, 0.38, 1.38, 0.05, GOLD, 1, 0, 1);
    }
    for (const s of [-1, 1]) lamp(g, s * 0.36, 1.1, 0.42);
  };
}
