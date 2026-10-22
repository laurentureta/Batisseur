// Décorations exclusives des événements de la semaine (manège, montgolfière, chapiteau, bateau pirate…).
// Repère local : emprise centrée sur (0, 0), façade vers +z, sol à y = 0 (1 = une case).
import { KM, KH, treeKit } from './kitModels.js';
import { GeoBuilder, shade } from './geom.js';
import { kitBox } from './kit.js';

const { K, KF, pad, glowBox, giftBox, flag, bush, lantern, barrels, smokeAt, hw, COBBLE, SAND } = KH;

const WOOD = 0xb87440, WOOD_D = 0x7a4a2a, WOOD_L = 0xd9a066, GOLD = 0xf2c14e, RED = 0xe8322d, WHITE = 0xf7f3ea;
const PINK = 0xff86b8, BLUE = 0x2f7fc4, GREEN = 0x3fa34a, YELLOW = 0xffd34d, PURPLE = 0x8e5bd6, DARK = 0x33363d;
const GRASS = 0x8fbf4a, SNOW = 0xeef4f7, STONE = 0xc9c1ae;
const BRIGHT = [0xff4d6d, 0xffd34d, 0x4dd2ff, 0x7dff6b, 0xb36bff, 0xff9a3a];

/* ───────── outils de modelage ───────── */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Cylindre (ou cône tronqué) entre deux points quelconques. */
function tube(g, a, b, r, seg, color, r1 = r, caps = true) {
  const n = norm(sub(b, a));
  const up = Math.abs(n[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(n, up)), v = cross(u, n);
  const p = (ang, rad, t) => {
    const c = Math.cos(ang) * rad, s = Math.sin(ang) * rad, o = t ? b : a;
    return [o[0] + u[0] * c + v[0] * s, o[1] + u[1] * c + v[1] * s, o[2] + u[2] * c + v[2] * s];
  };
  const step = (Math.PI * 2) / seg;
  for (let k = 0; k < seg; k++) {
    const a0 = k * step, a1 = (k + 1) * step;
    g.quad(p(a1, r, 0), p(a0, r, 0), p(a0, r1, 1), p(a1, r1, 1), color);
    if (caps && r1 > 0.0001) g.tri(b, p(a1, r1, 1), p(a0, r1, 1), color);
    if (caps && r > 0.0001) g.tri(a, p(a0, r, 0), p(a1, r, 0), color);
  }
}

/** Ligne brisée de tubes (tiges courbes, cordes). */
function polyTube(g, pts, r, seg, color) {
  for (let k = 0; k < pts.length - 1; k++) tube(g, pts[k], pts[k + 1], r, seg, color, r, k === pts.length - 2);
}

function stripedCone(g, x, y, z, r, h, seg, c1, c2) {
  const p = (a) => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
  const step = (Math.PI * 2) / seg;
  for (let k = 0; k < seg; k++) g.tri(p((k + 1) * step), p(k * step), [x, y + h, z], k % 2 ? c1 : c2);
}

function stripedCyl(g, x, y, z, r, h, seg, c1, c2, rTop = r) {
  const p = (a, rad, yy) => [x + rad * Math.cos(a), yy, z + rad * Math.sin(a)];
  const step = (Math.PI * 2) / seg;
  for (let k = 0; k < seg; k++) {
    const a0 = k * step, a1 = (k + 1) * step;
    g.quad(p(a1, r, y), p(a0, r, y), p(a0, rTop, y + h), p(a1, rTop, y + h), k % 2 ? c1 : c2);
  }
}

/** Volume de révolution par tranches : prof = [[y, r], …], une couleur (ou deux en rayures) par tranche. */
function bands(g, x, z, prof, colors, seg = 14, stripes = null) {
  for (let k = 0; k < prof.length - 1; k++) {
    const [y0, r0] = prof[k], [y1, r1] = prof[k + 1];
    if (stripes) stripedCyl(g, x, y0, z, r0, y1 - y0, seg, stripes[0], stripes[1], r1);
    else g.cyl(x, y0, z, r0, y1 - y0, seg, colors[k % colors.length], r1, k === prof.length - 2);
  }
}

/** Prisme : polygone convexe (x, y) dans le sens trigonométrique, extrudé de z0 à z1. */
function extrudeZ(g, pts, z0, z1, side, cap = side) {
  for (let i = 0; i < pts.length; i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[(i + 1) % pts.length];
    g.quad([xi, yi, z1], [xi, yi, z0], [xj, yj, z0], [xj, yj, z1], side);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    g.tri([pts[0][0], pts[0][1], z1], [pts[i][0], pts[i][1], z1], [pts[i + 1][0], pts[i + 1][1], z1], cap);
    g.tri([pts[0][0], pts[0][1], z0], [pts[i + 1][0], pts[i + 1][1], z0], [pts[i][0], pts[i][1], z0], cap);
  }
}

/** Guirlande d'ampoules entre deux points (avec un peu de mou). */
function bulbs(g, a, b, n, sag, colors, r = 0.022) {
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    tube(g, prev, p, 0.005, 3, 0x3a2b20, 0.005, false);
    g.layer('glass');
    g.ico(p[0], p[1] - r, p[2], r, colors[k % colors.length], 1.2, 0, k);
    g.layer('body');
    prev = p;
  }
  tube(g, prev, b, 0.005, 3, 0x3a2b20, 0.005, false);
}

/** Pose un modèle du kit dans w × d et renvoie la hauteur de son dessus. */
function fitTop(g, ctx, name, w, d, o = {}) {
  const s = KF(g, ctx, name, w, d, o);
  const bb = kitBox(name);
  return (bb[4] - bb[1]) * s + (o.y || 0);
}

/** Stand de marché : comptoir, poteaux et auvent à rayures. */
function stall(g, ctx, { w = 0.66, d = 0.5, c1 = RED, c2 = WHITE, h = 0.56, z = 0, counter = WOOD } = {}) {
  const zf = z + d / 2, zb = z - d / 2;
  g.box(0, 0, z + 0.06, w, 0.22, d * 0.42, { top: shade(counter, 1.15), side: counter, front: c1 });
  g.box(0, 0.22, z + 0.06, w + 0.02, 0.02, d * 0.46, shade(counter, 1.25));
  for (const sx of [-1, 1]) for (const zz of [zb + 0.03, zf - 0.03]) g.cyl(sx * (w / 2 - 0.02), 0, zz, 0.014, h, 5, WOOD_D);
  const n = 8, yb = h + 0.08, yf = h - 0.02;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 - 0.03 + (i * (w + 0.06)) / n, x1 = x0 + (w + 0.06) / n;
    g.quad([x0, yb, zb - 0.02], [x0, yf, zf + 0.06], [x1, yf, zf + 0.06], [x1, yb, zb - 0.02], i % 2 ? c1 : c2);
    g.box((x0 + x1) / 2, yf - 0.05, zf + 0.06, x1 - x0, 0.05, 0.012, i % 2 ? c2 : c1);
  }
}

/** Petit personnage stylisé (forains, chevaliers…). */
function figure(g, x, z, shirt, { s = 1, hat = null, rot = 0 } = {}) {
  g.push(rot, x, 0, z);
  g.box(0, 0, 0, 0.07 * s, 0.1 * s, 0.05 * s, 0x3a4a6a);
  g.box(0, 0.1 * s, 0, 0.09 * s, 0.11 * s, 0.06 * s, shirt);
  g.ico(0, 0.25 * s, 0, 0.045 * s, 0xf2c39a, 1, 0, 1);
  if (hat) g.cone(0, 0.28 * s, 0, 0.05 * s, 0.07 * s, 6, hat);
  g.pop();
}

/** Ballon gonflé au bout de sa ficelle. */
function balloon(g, x, z, h, color, base = 0) {
  tube(g, [x, base, z], [x, h - 0.06, z], 0.004, 3, 0xeeeeee, 0.004, false);
  g.ico(x, h, z, 0.06, color, 1.2, 0, Math.round(x * 100));
}

/* ───────── fêtes du calendrier ───────── */
KM.e_fireworks = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.012 });
  g.box(0, 0.012, 0.05, 0.46, 0.09, 0.3, { top: 0x6b4429, side: 0x5a3a22 });
  for (let k = 0; k < 5; k++) {
    const x = -0.17 + k * 0.085, z = 0.08 - (k % 2) * 0.07;
    g.cyl(x, 0.1, z, 0.022, 0.15, 6, BRIGHT[k], 0.022);
    g.cone(x, 0.25, z, 0.027, 0.06, 6, WHITE);
  }
  const bursts = [[-0.14, 0.92, 0.0, 0xff4d6d], [0.17, 1.08, -0.05, 0x4dd2ff], [0.0, 1.26, 0.05, 0xffd34d]];
  for (const [cx, cy, cz, c] of bursts) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      glowBox(g, cx + Math.cos(a) * 0.13, cy + Math.sin(a) * 0.13, cz, 0.032, 0.032, 0.032, c);
      glowBox(g, cx + Math.cos(a + 0.26) * 0.07, cy + Math.sin(a + 0.26) * 0.07, cz, 0.024, 0.024, 0.024, 0xffffff);
    }
  }
  g.layer('glass');
  tube(g, [-0.08, 0.3, 0.06], [-0.14, 0.8, 0.0], 0.008, 4, 0xfff1a8, 0.004);
  tube(g, [0.08, 0.3, 0.06], [0.17, 0.95, -0.05], 0.008, 4, 0xfff1a8, 0.004);
  g.layer('body');
};

KM.e_lanterns = (g, L, ctx) => {
  pad(g, ctx, 1.92, 0.7, COBBLE, { h: 0.01 });
  const posts = [-0.86, 0, 0.86];
  for (const x of posts) {
    g.cyl(x, 0.01, -0.05, 0.026, 0.74, 6, WOOD_D);
    g.ico(x, 0.76, -0.05, 0.03, GOLD, 1, 0, 1);
  }
  const cols = [0xff5a3a, 0xffb13a, 0xff7ab8, 0xffd34d, 0xff8a2a];
  for (let s = 0; s < 2; s++) {
    const x0 = posts[s], x1 = posts[s + 1];
    let prev = [x0, 0.72, -0.05];
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const p = [x0 + (x1 - x0) * t, 0.72 - 0.16 * 4 * t * (1 - t), -0.05];
      tube(g, prev, p, 0.005, 3, 0x3a2b20, 0.005, false);
      g.box(p[0], p[1] - 0.025, p[2], 0.008, 0.025, 0.008, 0x3a2b20);
      g.layer('glass');
      g.cyl(p[0], p[1] - 0.12, p[2], 0.042, 0.095, 8, cols[(k + s * 2) % cols.length], 0.042);
      g.layer('body');
      g.cyl(p[0], p[1] - 0.13, p[2], 0.03, 0.012, 6, 0x3a2b20);
      g.cyl(p[0], p[1] - 0.026, p[2], 0.03, 0.012, 6, 0x3a2b20);
      prev = p;
    }
    tube(g, prev, [x1, 0.72, -0.05], 0.005, 3, 0x3a2b20, 0.005, false);
  }
  KF(g, ctx, 'c_bench', 0.42, 0.2, { x: -0.43, z: 0.2 });
  KF(g, ctx, 'c_bench', 0.42, 0.2, { x: 0.43, z: 0.2 });
};

KM.e_galette = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0xd9bd8c, { h: 0.01 });
  const ty = fitTop(g, ctx, 'r_table_round_A', 0.5, 0.5, {});
  g.cyl(0, ty, 0, 0.17, 0.012, 16, WHITE);
  g.cyl(0, ty + 0.012, 0, 0.15, 0.04, 16, 0xe09a3a, 0.15, true, 0xf2c060);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.box(Math.cos(a) * 0.07, ty + 0.052, Math.sin(a) * 0.07, 0.11, 0.004, 0.006, 0xc9802a);
  }
  // couronne dorée
  g.cyl(0.02, ty + 0.052, 0.01, 0.06, 0.035, 10, GOLD, 0.06, false);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.cone(0.02 + Math.cos(a) * 0.055, ty + 0.087, 0.01 + Math.sin(a) * 0.055, 0.014, 0.04, 4, GOLD);
  }
  g.ico(0.02, ty + 0.07, 0.068, 0.012, 0xe53935, 1, 0, 2);
  for (const [x, z, r] of [[-0.3, 0.05, 1.4], [0.3, -0.05, -1.7], [0.02, 0.32, 3.1]]) KF(g, ctx, 'r_chair_A', 0.2, 0.2, { x, z, rot: r });
};

KM.e_crepes = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  stall(g, ctx, { c1: 0x2f6fd1, c2: WHITE, counter: 0xd9a066 });
  g.cyl(-0.13, 0.24, 0.07, 0.085, 0.02, 12, DARK);
  g.cyl(-0.13, 0.26, 0.07, 0.07, 0.004, 12, 0xf2c97a);
  for (let k = 0; k < 6; k++) g.cyl(0.12, 0.24 + k * 0.009, 0.07, 0.07, 0.008, 12, k % 2 ? 0xf0c070 : 0xe8b05a);
  g.ico(0.12, 0.3, 0.07, 0.018, 0x7a3a1a, 0.6, 0, 3);
  for (const [x, c] of [[0.26, 0xd2232a], [-0.27, 0xf2a03a]]) {
    g.cyl(x, 0.24, -0.02, 0.025, 0.05, 8, c, 0.025);
    g.cyl(x, 0.29, -0.02, 0.027, 0.012, 8, WHITE);
  }
  g.box(0.3, 0, 0.3, 0.14, 0.2, 0.02, DARK);
  g.box(0.3, 0.2, 0.3, 0.16, 0.02, 0.03, WOOD);
  for (let k = 0; k < 3; k++) g.box(0.3, 0.06 + k * 0.045, 0.312, 0.09, 0.012, 0.004, WHITE);
};

KM.e_heart = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, GRASS, { h: 0.008 });
  g.cyl(0, 0.008, 0, 0.13, 0.12, 10, 0xc9602f, 0.15);
  g.cyl(0, 0.128, 0, 0.13, 0.012, 10, 0x6b4129);
  g.cyl(0, 0.13, 0, 0.022, 0.12, 6, 0x6b4129);
  const hc = 0xff3f6e;
  g.cyl(0, 0.24, 0, 0.012, 0.24, 10, shade(hc, 0.85), 0.21);
  g.ico(-0.105, 0.5, 0, 0.13, hc, 0.95, 0.06, 1);
  g.ico(0.105, 0.5, 0, 0.13, hc, 0.95, 0.06, 2);
  g.ico(-0.13, 0.56, 0.08, 0.035, 0xffb3c8, 1, 0, 3);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.32, z = Math.sin(a) * 0.32;
    g.ico(x, 0.05, z, 0.05, 0x3f8f3a, 0.8, 0.2, k);
    g.ico(x, 0.1, z, 0.03, k % 2 ? 0xff4d7a : 0xffffff, 1, 0.1, k + 9);
  }
};

KM.e_carnival = (g, L, ctx) => {
  pad(g, ctx, 1.92, 0.8, COBBLE, { h: 0.01 });
  for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) g.cylZ(x, 0.075, z, 0.065, 0.06, 10, DARK, 0x9aa3ad);
  g.box(0, 0.07, 0, 1.55, 0.1, 0.62, { top: 0xffd34d, side: 0xff4fb0 });
  for (let k = 0; k < 14; k++) g.box(-0.72 + k * 0.111, 0.07, 0.315, 0.06, 0.1, 0.012, k % 2 ? 0x4dd2ff : 0xffffff);
  // le géant du carnaval
  stripedCone(g, 0, 0.17, -0.05, 0.24, 0.48, 12, 0xff4fb0, 0x4dd2ff);
  stripedCyl(g, 0, 0.6, -0.05, 0.14, 0.04, 12, 0xffffff, 0xffd34d, 0.12);
  g.ico(0, 0.74, -0.05, 0.12, 0xf6d2b0, 1.05, 0, 4);
  g.ico(0, 0.72, 0.07, 0.025, 0xe53935, 1, 0, 5);
  for (const sx of [-1, 1]) g.ico(sx * 0.045, 0.77, 0.055, 0.014, DARK, 1, 0, 6);
  for (const [dx, c] of [[-1, 0xff4fb0], [0, 0x7a5cff], [1, 0xffd34d]]) {
    const tip = [dx * 0.17, 1.02 - Math.abs(dx) * 0.08, -0.05];
    tube(g, [dx * 0.04, 0.82, -0.05], tip, 0.05, 6, c, 0.012);
    g.ico(tip[0], tip[1], tip[2], 0.025, GOLD, 1, 0, 7);
  }
  for (const [x, z, c] of [[-0.66, -0.22, 0xff4d6d], [-0.62, -0.18, 0x4dd2ff], [0.66, -0.2, 0xffd34d], [0.62, -0.24, 0x7dff6b], [-0.4, 0.2, 0xb36bff], [0.42, 0.18, 0xff9a3a]]) balloon(g, x, z, 0.5 + (Math.abs(x * 7) % 3) * 0.05, c, 0.17);
  for (let k = 0; k < 18; k++) g.box(-0.6 + (k * 0.37) % 1.2, 0.171, -0.25 + (k * 0.29) % 0.5, 0.02, 0.004, 0.02, BRIGHT[k % 6]);
};

KM.e_cotton_candy = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  stall(g, ctx, { c1: 0xff6fb0, c2: WHITE, counter: 0xffd2e6 });
  for (const [x, c] of [[-0.18, 0xffa6d2], [0, 0xa6dcff], [0.18, 0xffa6d2]]) {
    tube(g, [x, 0.24, 0.09], [x, 0.36, 0.09], 0.006, 4, WHITE);
    g.ico(x, 0.42, 0.09, 0.07, c, 1.05, 0.25, Math.round(x * 50) + 9);
  }
  tube(g, [0, 0.64, 0], [0, 0.74, 0], 0.01, 4, WHITE);
  g.ico(0, 0.82, 0, 0.11, 0xff86c4, 1, 0.25, 12);
  g.cylZ(-0.3, 0.05, 0.3, 0.05, 0.03, 8, DARK, 0xcccccc);
};

KM.e_rainbow = (g, L, ctx) => {
  pad(g, ctx, 1.92, 0.8, GRASS, { h: 0.008 });
  const cols = [0xff4d4d, 0xff9a3a, 0xffe14d, 0x5ad15a, 0x4da6ff, 0x9b6bff];
  cols.forEach((c, b) => {
    const R = 0.78 - b * 0.07, N = 20;
    for (let k = 0; k <= N; k++) {
      const a = (Math.PI * k) / N;
      g.box(Math.cos(a) * R, Math.sin(a) * R * 0.95, -0.08, 0.075, 0.07, 0.1, c);
    }
  });
  for (const sx of [-1, 1]) {
    g.ico(sx * 0.7, 0.06, -0.08, 0.13, WHITE, 0.7, 0.2, 2 + sx);
    g.ico(sx * 0.58, 0.05, 0.02, 0.1, WHITE, 0.7, 0.2, 5 + sx);
    g.ico(sx * 0.82, 0.05, 0.03, 0.09, WHITE, 0.7, 0.2, 8 + sx);
  }
  // chaudron d'or
  bands(g, 0.5, 0.25, [[0.01, 0.09], [0.06, 0.12], [0.14, 0.11], [0.16, 0.12]], [0x2b2b30]);
  g.ico(0.5, 0.17, 0.25, 0.1, GOLD, 0.45, 0.35, 4);
  for (let k = 0; k < 7; k++) g.cyl(0.32 + (k % 4) * 0.06, 0.008, 0.33 - Math.floor(k / 4) * 0.08, 0.025, 0.008, 8, GOLD);
  for (let k = 0; k < 5; k++) glowBox(g, 0.42 + k * 0.04, 0.3 + (k % 2) * 0.05, 0.25, 0.02, 0.02, 0.02, 0xfff1a8);
};

KM.e_fish = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  const top = fitTop(g, ctx, 'k_pavement_fountain', 0.78, 0.78, {});
  const y0 = Math.min(0.2, top * 0.6);
  const or = 0xff8a3a, light = 0xffc46a;
  bands(g, 0, 0, [[y0, 0.03], [y0 + 0.08, 0.08], [y0 + 0.2, 0.11], [y0 + 0.32, 0.1], [y0 + 0.42, 0.06], [y0 + 0.47, 0.035]], [or, light, or, light, or]);
  // queue en éventail (posée sur le socle)
  tube(g, [0, y0 + 0.02, 0], [-0.12, y0 - 0.02, 0.0], 0.03, 5, or, 0.06);
  tube(g, [0, y0 + 0.02, 0], [0.12, y0 - 0.02, 0.0], 0.03, 5, or, 0.06);
  for (const sx of [-1, 1]) {
    g.ico(sx * 0.075, y0 + 0.34, 0.06, 0.028, WHITE, 1, 0, 2);
    g.ico(sx * 0.08, y0 + 0.345, 0.082, 0.013, DARK, 1, 0, 3);
    tube(g, [sx * 0.1, y0 + 0.2, 0], [sx * 0.18, y0 + 0.14, 0.04], 0.025, 4, light, 0.005);
  }
  g.box(0, y0 + 0.24, -0.11, 0.015, 0.1, 0.06, light);
  ctx.out.emitters.push({ pos: [0, y0 + 0.5, 0], kind: 'water' });
};

KM.e_easter_egg = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, GRASS, { h: 0.008 });
  g.ico(0, 0.04, 0, 0.3, 0xc9a25a, 0.3, 0.35, 3);
  const prof = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    prof.push([0.05 + t * 0.62, 0.23 * Math.pow(Math.sin(Math.PI * (0.06 + t * 0.94)), 0.72) * (1 - t * 0.22) + 0.003]);
  }
  bands(g, 0, 0, prof, [0xff9ec7, 0xffe066, 0x8fd8ff, 0xa8f0a0, 0xc9a6ff, 0xffffff], 16);
  for (let k = 0; k < 8; k++) {
    const a = 1.1 + (k / 8) * Math.PI * 1.3;
    const x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.3 + 0.05;
    g.ico(x, 0.045, z, 0.04, BRIGHT[k % 6], 1.35, 0, k + 5);
  }
  for (let k = 0; k < 5; k++) g.ico(-0.32 + k * 0.16, 0.03, -0.3, 0.025, k % 2 ? 0xffe066 : 0xffffff, 1, 0.1, k);
};

KM.e_picnic = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, GRASS, { h: 0.008 });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) g.box(-0.25 + i * 0.1, 0.008, -0.2 + j * 0.1, 0.1, 0.008, 0.1, (i + j) % 2 ? RED : WHITE);
  g.cyl(-0.12, 0.016, -0.1, 0.075, 0.09, 10, 0xc98a4b, 0.085);
  g.cyl(-0.12, 0.106, -0.1, 0.085, 0.012, 10, 0xa8703a);
  polyTube(g, [[-0.2, 0.11, -0.1], [-0.17, 0.19, -0.1], [-0.07, 0.19, -0.1], [-0.04, 0.11, -0.1]], 0.008, 4, 0x8a5a2a);
  for (const [x, z] of [[0.1, 0.05], [0.12, -0.15], [-0.08, 0.15]]) {
    g.cyl(x, 0.016, z, 0.05, 0.006, 10, WHITE);
  }
  KF(g, ctx, 'r_food_ingredient_bun', 0.07, 0.07, { x: 0.1, y: 0.02, z: 0.05 });
  KF(g, ctx, 'r_food_ingredient_tomato', 0.05, 0.05, { x: 0.12, y: 0.02, z: -0.15 });
  KF(g, ctx, 'r_food_ingredient_cheese', 0.06, 0.06, { x: -0.08, y: 0.02, z: 0.15 });
  g.cyl(0.22, 0.016, 0.18, 0.022, 0.1, 8, 0x5ab84a, 0.012);
  treeKit(g, ctx, 0.3, -0.32, 0.8, 'round', 3);
};

KM.e_lily = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, GRASS, { h: 0.008 });
  for (const [x, z, a] of [[-0.12, 0.05, -0.3], [0.1, -0.02, 0.4], [0.02, 0.12, 0.1]]) g.ico(x, 0.25, z, 0.07, 0x3f9e3a, 3.4, 0.1, Math.round(a * 10) + 5);
  for (const [x0, z0, dx] of [[-0.06, 0, -1], [0.05, -0.05, 1], [0, 0.08, 0.2]]) {
    const pts = [[x0, 0.01, z0], [x0, 0.3, z0], [x0 + dx * 0.06, 0.48, z0], [x0 + dx * 0.16, 0.52, z0 + 0.02], [x0 + dx * 0.24, 0.47, z0 + 0.04]];
    polyTube(g, pts, 0.01, 4, 0x4caf3e);
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      const px = x0 + dx * (0.04 + t * 0.22), py = 0.5 - Math.abs(t - 0.45) * 0.12, pz = z0 + t * 0.04;
      tube(g, [px, py, pz], [px, py - 0.04, pz], 0.003, 3, 0x4caf3e);
      g.cyl(px, py - 0.09, pz, 0.032, 0.05, 8, WHITE, 0.012);
    }
  }
  for (let k = 0; k < 6; k++) g.ico(-0.3 + k * 0.12, 0.03, 0.3, 0.035, 0x5ab84a, 0.7, 0.2, k);
};

KM.e_stage = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, COBBLE, { h: 0.01 });
  g.box(0, 0.01, -0.3, 1.6, 0.16, 1.0, { top: 0x5a3a22, side: 0x2f2620 });
  for (let k = 0; k < 3; k++) g.box(0, 0.01, 0.25 + k * 0.08, 0.6, 0.12 - k * 0.04, 0.08, 0x6b4429);
  g.box(0, 0.17, -0.78, 1.6, 0.75, 0.05, { side: 0x3a1f5a, front: 0x4a2a7a });
  for (const sx of [-1, 1]) g.box(sx * 0.82, 0.01, -0.3, 0.05, 1.0, 0.05, 0x8a93a0);
  g.box(0, 1.0, -0.3, 1.7, 0.05, 0.05, 0x8a93a0);
  g.box(0, 1.0, 0.18, 1.7, 0.04, 0.04, 0x8a93a0);
  for (const sx of [-1, 1]) g.box(sx * 0.82, 1.0, -0.06, 0.04, 0.04, 0.5, 0x8a93a0);
  [0xff4d6d, 0x4dd2ff, 0xffd34d, 0xb36bff, 0x7dff6b].forEach((c, k) => {
    const x = -0.6 + k * 0.3;
    g.box(x, 0.93, 0.18, 0.07, 0.07, 0.07, DARK);
    glowBox(g, x, 0.92, 0.22, 0.05, 0.05, 0.02, c);
  });
  for (const sx of [-1, 1]) {
    g.box(sx * 0.68, 0.17, -0.45, 0.2, 0.34, 0.18, 0x202226);
    g.cyl(sx * 0.68, 0.38, -0.358, 0.06, 0.012, 10, 0x55595f);
    g.cyl(sx * 0.68, 0.24, -0.358, 0.035, 0.012, 10, 0x55595f);
  }
  g.cyl(-0.2, 0.17, -0.5, 0.09, 0.12, 12, 0xe8322d);
  g.cyl(-0.2, 0.29, -0.5, 0.09, 0.004, 12, WHITE);
  g.cyl(-0.05, 0.17, -0.52, 0.06, 0.09, 10, 0x2f6fd1);
  tube(g, [0.2, 0.17, -0.15], [0.2, 0.42, -0.15], 0.006, 4, 0x9aa3ad);
  g.ico(0.2, 0.44, -0.15, 0.018, DARK, 1, 0, 2);
  figure(g, 0.32, -0.35, 0xff4fb0, { s: 1.3 });
  for (const [x, z, c] of [[-0.6, 0.6, BLUE], [-0.3, 0.75, RED], [0.05, 0.62, GREEN], [0.4, 0.72, 0xffb13a], [0.65, 0.58, PURPLE]]) figure(g, x, z, c, { rot: Math.PI });
};

KM.e_bonfire = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0xa9a392, { h: 0.01 });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    g.ico(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2, 0.045, 0x8a8a84, 0.7, 0.3, k);
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    tube(g, [Math.cos(a) * 0.17, 0.02, Math.sin(a) * 0.17], [Math.cos(a) * 0.03, 0.36, Math.sin(a) * 0.03], 0.022, 5, k % 2 ? 0x7a4a2a : 0x6b3f22, 0.016);
  }
  g.layer('glass');
  g.cone(0, 0.04, 0, 0.15, 0.32, 7, 0xff6a1a);
  g.cone(0.03, 0.05, 0.02, 0.09, 0.45, 6, 0xffb13a);
  g.cone(-0.04, 0.05, -0.02, 0.06, 0.36, 5, 0xffe066);
  g.layer('body');
  smokeAt(ctx, 0, 0.5, 0);
  for (const [x, z, r] of [[-0.3, 0.25, 0.7], [0.3, 0.28, -0.6]]) {
    g.push(r, x, 0, z);
    g.cylX(0, 0.05, 0, 0.045, 0.3, 8, 0x8a5a32, 0xd9a066);
    g.pop();
  }
};

KM.e_guinguette = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xd9bd8c, { h: 0.01 });
  g.box(0, 0.01, 0, 0.9, 0.02, 0.9, { top: 0xc98a4b, side: 0x8a5a32 });
  const P = [[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]];
  for (const [x, z] of P) g.cyl(x, 0.01, z, 0.025, 0.85, 6, WOOD_D);
  const cols = [0xffd34d, 0xff4d6d, 0x4dd2ff, 0xffffff, 0x7dff6b];
  for (let k = 0; k < 4; k++) bulbs(g, [P[k][0], 0.84, P[k][1]], [P[(k + 1) % 4][0], 0.84, P[(k + 1) % 4][1]], 9, 0.14, cols);
  bulbs(g, [P[0][0], 0.84, P[0][1]], [P[2][0], 0.84, P[2][1]], 12, 0.2, cols);
  bulbs(g, [P[1][0], 0.84, P[1][1]], [P[3][0], 0.84, P[3][1]], 12, 0.2, cols);
  for (const [x, z] of [[-0.55, -0.45], [0.55, -0.5], [-0.5, 0.55], [0.55, 0.5]]) {
    KF(g, ctx, 'r_table_round_A_decorated', 0.32, 0.32, { x, z });
    KF(g, ctx, 'r_chair_A', 0.14, 0.14, { x: x + 0.2, z, rot: -Math.PI / 2 });
    KF(g, ctx, 'r_chair_A', 0.14, 0.14, { x: x - 0.2, z, rot: Math.PI / 2 });
  }
  figure(g, -0.1, 0.05, 0xe8322d, { s: 1.2 });
  figure(g, 0.12, -0.05, 0x2f6fd1, { s: 1.2, rot: 2.6 });
};

KM.e_telescope = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  const hub = [0, 0.36, 0];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    tube(g, [Math.cos(a) * 0.17, 0.01, Math.sin(a) * 0.17], hub, 0.012, 5, 0x6b4429, 0.01);
  }
  g.ico(hub[0], hub[1], hub[2], 0.03, GOLD, 1, 0, 1);
  const dir = norm([-0.45, 0.6, -0.25]);
  const A = [hub[0] - dir[0] * 0.2, hub[1] + 0.03 - dir[1] * 0.2, hub[2] - dir[2] * 0.2];
  const B = [hub[0] + dir[0] * 0.32, hub[1] + 0.03 + dir[1] * 0.32, hub[2] + dir[2] * 0.32];
  tube(g, A, B, 0.045, 10, 0x2f4f9a, 0.06);
  tube(g, [B[0] - dir[0] * 0.03, B[1] - dir[1] * 0.03, B[2] - dir[2] * 0.03], [B[0] + dir[0] * 0.02, B[1] + dir[1] * 0.02, B[2] + dir[2] * 0.02], 0.066, 10, GOLD, 0.066);
  tube(g, [A[0] - dir[0] * 0.06, A[1] - dir[1] * 0.06, A[2] - dir[2] * 0.06], A, 0.018, 6, GOLD, 0.03);
  g.box(0.25, 0.01, 0.22, 0.24, 0.16, 0.16, { top: 0x6b4429, side: 0x5a3a22 });
  g.box(0.25, 0.17, 0.22, 0.2, 0.004, 0.12, 0x1f2a5a);
  for (let k = 0; k < 6; k++) glowBox(g, 0.18 + (k % 3) * 0.06, 0.175, 0.18 + Math.floor(k / 3) * 0.07, 0.012, 0.004, 0.012, 0xffe680);
  for (const [x, y, z] of [[-0.3, 0.95, -0.25], [-0.15, 1.05, -0.32], [0.05, 0.9, -0.3]]) glowBox(g, x, y, z, 0.03, 0.03, 0.03, 0xfff1a8);
};

KM.e_grape_press = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0xd9bd8c, { h: 0.01 });
  g.cyl(0, 0.01, -0.05, 0.22, 0.05, 14, WOOD_D, 0.22, true, 0x6b2a5a);
  stripedCyl(g, 0, 0.06, -0.05, 0.15, 0.2, 14, WOOD, WOOD_L);
  g.cyl(0, 0.26, -0.05, 0.15, 0.03, 14, 0x8a5a32);
  g.cyl(0, 0.29, -0.05, 0.025, 0.3, 8, 0x8a93a0);
  g.box(0, 0.46, -0.05, 0.4, 0.035, 0.035, WOOD_D);
  g.box(0, 0.59, -0.05, 0.08, 0.04, 0.08, WOOD_D);
  const grape = (x, y, z, n = 7) => {
    for (let k = 0; k < n; k++) g.ico(x + ((k * 37) % 5 - 2) * 0.012, y - Math.floor(k / 3) * 0.022, z + ((k * 13) % 3 - 1) * 0.012, 0.018, k % 2 ? 0x6b2a8a : 0x8a3aa8, 1, 0, k);
    g.box(x, y + 0.02, z, 0.006, 0.02, 0.006, 0x4caf3e);
  };
  const ty = fitTop(g, ctx, 'crate_open', 0.26, 0.2, { x: 0.27, z: 0.27 });
  for (let k = 0; k < 4; k++) grape(0.22 + (k % 2) * 0.09, ty + 0.03, 0.24 + Math.floor(k / 2) * 0.07, 5);
  barrels(g, ctx, -0.32, 0.25, 2, 0.5);
  for (const x of [-0.3, 0.3]) {
    g.cyl(x, 0.01, -0.33, 0.015, 0.4, 5, WOOD_D);
    grape(x + 0.03, 0.34, -0.31);
    g.ico(x - 0.03, 0.38, -0.33, 0.04, 0x4caf3e, 0.7, 0.2, 3);
  }
};

KM.e_cauldron = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0x6e7a4a, { h: 0.008 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    g.box(Math.cos(a) * 0.12, 0.0, Math.sin(a) * 0.12, 0.03, 0.07, 0.03, DARK);
  }
  g.layer('glass');
  g.cone(0, 0.0, 0, 0.08, 0.1, 6, 0xff8a2a);
  g.layer('body');
  bands(g, 0, 0, [[0.05, 0.1], [0.1, 0.17], [0.2, 0.19], [0.29, 0.16], [0.32, 0.17]], [0x2b2b30, 0x34343a, 0x2b2b30, 0x45454c], 12);
  g.layer('glass');
  g.cyl(0, 0.3, 0, 0.15, 0.01, 12, 0x5aff5a);
  for (const [x, y, z, r] of [[0.03, 0.34, 0.02, 0.03], [-0.05, 0.37, -0.03, 0.022], [0.02, 0.42, -0.02, 0.016], [-0.02, 0.47, 0.03, 0.012]]) g.ico(x, y, z, r, 0x7dff6b, 1, 0, 1);
  g.layer('body');
  tube(g, [0.28, 0.0, -0.18], [0.12, 0.5, -0.1], 0.012, 5, WOOD_D);
  tube(g, [0.32, -0.02, -0.2], [0.26, 0.1, -0.17], 0.05, 6, 0xd9b45a, 0.015);
  hw(g, ctx, 'pumpkin_orange_jackolantern', 0.13, { x: -0.27, z: 0.22, rot: 0.5 });
  hw(g, ctx, 'pumpkin_yellow_small', 0.15, { x: 0.25, z: 0.27 });
  hw(g, ctx, 'candle_triple', 0.22, { x: -0.3, z: -0.25 });
};

KM.e_xmas_market = (g, L, ctx) => {
  pad(g, ctx, 1.92, 0.8, SNOW, { h: 0.012 });
  for (const sx of [-1, 1]) {
    const x = sx * 0.5;
    g.box(x, 0.012, -0.05, 0.66, 0.36, 0.42, { top: WOOD_D, side: 0x9a6a3a, front: 0x8a5a32 });
    g.layer('glass');
    g.box(x, 0.16, 0.162, 0.44, 0.14, 0.012, 0xffd98a);
    g.layer('body');
    g.box(x, 0.12, 0.2, 0.5, 0.03, 0.1, WOOD_L);
    g.roof(x, 0.37, -0.05, 0.76, 0.56, 0.22, 0.76, 0xb8231b, 0x8a5a32);
    g.roof(x, 0.375, -0.05, 0.72, 0.5, 0.215, 0.72, WHITE, 0x8a5a32);
    for (let k = 0; k < 8; k++) glowBox(g, x - 0.33 + k * 0.094, 0.36, 0.23, 0.02, 0.02, 0.02, BRIGHT[k % 6]);
    giftBox(g, x + sx * 0.18, 0.3, 0.08, 0.07, sx > 0 ? 0x2f7fc4 : 0x00a651, 0xffffff);
  }
  treeKit(g, ctx, 0, 0.22, 0.75, 'pine', 2);
  for (let k = 0; k < 6; k++) glowBox(g, Math.cos(k * 2.4) * 0.07, 0.12 + k * 0.06, 0.22 + Math.sin(k * 2.4) * 0.07, 0.024, 0.024, 0.024, BRIGHT[k % 6]);
};

/* ───────── thèmes qui tournent ───────── */
KM.e_gold_cart = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, 0x9a8a72, { h: 0.01 });
  for (let k = 0; k < 6; k++) g.box(-0.38 + k * 0.15, 0.01, 0, 0.05, 0.02, 0.34, WOOD_D);
  for (const sz of [-1, 1]) g.box(0, 0.03, sz * 0.12, 0.86, 0.025, 0.025, 0x8a93a0);
  extrudeZ(g, [[-0.2, 0.1], [0.2, 0.1], [0.25, 0.32], [-0.25, 0.32]], -0.15, 0.15, 0x5a5f6a, 0x4a4e57);
  g.box(0, 0.32, 0, 0.52, 0.025, 0.32, 0x7a808c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cylZ(sx * 0.13, 0.075, sz * 0.15, 0.05, 0.03, 10, DARK, 0x9aa3ad);
  for (let k = 0; k < 12; k++) g.ico(-0.17 + (k % 4) * 0.11, 0.34 + Math.floor(k / 4) * 0.035, -0.08 + (k % 3) * 0.08, 0.055 - Math.floor(k / 4) * 0.01, k % 3 ? GOLD : 0xffe066, 0.8, 0.3, k);
  for (let k = 0; k < 5; k++) glowBox(g, -0.15 + k * 0.08, 0.45 + (k % 2) * 0.05, 0.02, 0.018, 0.018, 0.018, 0xfff1a8);
  tube(g, [0.3, 0.01, 0.3], [0.22, 0.32, 0.18], 0.012, 5, WOOD);
  tube(g, [0.14, 0.31, 0.12], [0.3, 0.33, 0.24], 0.016, 5, 0x8a93a0, 0.006);
  lantern(g, ctx, -0.32, 0.3, 0.2);
};

KM.e_wishing_well = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  KF(g, ctx, 'well', 0.62, 0.62, { tint: [1.0, 0.95, 1.12] });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    glowBox(g, Math.cos(a) * 0.16, 0.42 + (k % 3) * 0.07, Math.sin(a) * 0.16, 0.022, 0.022, 0.022, k % 2 ? 0xc9a6ff : 0xfff1a8);
  }
  for (let k = 0; k < 8; k++) g.cyl(-0.32 + (k * 0.37) % 0.64, 0.01, 0.3 - (k % 3) * 0.04, 0.022, 0.006, 8, GOLD);
  for (const [x, z] of [[-0.33, -0.3], [0.33, -0.3], [0.33, 0.3]]) bush(g, ctx, x, z, 0.6);
};

KM.e_market_stall = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  stall(g, ctx, { c1: 0x2a7fd1, c2: 0xffffff, counter: WOOD });
  const crates = ['r_crate_tomatoes', 'r_crate_carrots', 'r_crate_lettuce'];
  crates.forEach((n, k) => KF(g, ctx, n, 0.18, 0.14, { x: -0.2 + k * 0.2, y: 0.24, z: 0.07 }));
  for (let k = 0; k < 3; k++) g.box(-0.2 + k * 0.2, 0.35, 0.15, 0.06, 0.035, 0.006, WHITE);
  K(g, ctx, 'sack', { s: 0.7, x: 0.33, z: 0.3 });
  K(g, ctx, 'sack', { s: 0.6, x: -0.33, z: 0.32, rot: 1 });
};

KM.e_haystacks = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0xc9b26a, { h: 0.008 });
  const hay = 0xe8c860, hayD = 0xc9a43a;
  for (const [x, z] of [[-0.18, -0.15], [0.12, -0.2]]) g.cylZ(x, 0.13, z, 0.13, 0.22, 12, hay, 0xf2dc8a);
  for (const [x, y, z] of [[0.12, 0.008, 0.18], [-0.12, 0.008, 0.2], [0.0, 0.12, 0.19]]) {
    g.box(x, y, z, 0.22, 0.11, 0.14, { top: 0xf2dc8a, side: hay });
    g.box(x - 0.05, y, z, 0.008, 0.112, 0.142, hayD);
    g.box(x + 0.05, y, z, 0.008, 0.112, 0.142, hayD);
  }
  tube(g, [0.32, 0.0, 0.05], [0.26, 0.5, -0.05], 0.01, 5, WOOD);
  for (const dx of [-0.025, 0, 0.025]) tube(g, [0.26 + dx, 0.48, -0.05], [0.25 + dx * 1.3, 0.58, -0.07], 0.005, 3, 0x8a93a0, 0.003);
};

KM.e_scarecrow = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, 0x7a5234, { h: 0.015 });
  for (let k = 0; k < 3; k++) {
    g.box(-0.28 + k * 0.28, 0.015, 0.28, 0.14, 0.03, 0.2, 0x5e3f28);
    for (let j = 0; j < 3; j++) g.ico(-0.28 + k * 0.28, 0.06, 0.2 + j * 0.08, 0.035, 0x6fbf4a, 0.8, 0.2, k * 3 + j);
  }
  g.cyl(0, 0.015, -0.05, 0.018, 0.62, 5, WOOD_D);
  g.cylX(0, 0.45, -0.05, 0.014, 0.44, 5, WOOD_D);
  g.box(0, 0.22, -0.05, 0.11, 0.1, 0.07, 0x7a5a32);
  g.box(0, 0.32, -0.05, 0.16, 0.16, 0.08, { top: 0x2f6fd1, side: 0x2f6fd1, front: 0x3a7fe0 });
  for (let k = 0; k < 4; k++) g.box(-0.06 + k * 0.04, 0.32, -0.009, 0.01, 0.16, 0.004, 0xe8322d);
  g.box(0, 0.43, -0.05, 0.42, 0.06, 0.07, 0x2f6fd1);
  for (const sx of [-1, 1]) g.cone(sx * 0.22, 0.42, -0.05, 0.03, 0.07, 5, 0xe8c860);
  g.ico(0, 0.56, -0.05, 0.07, 0xe8c860, 1.05, 0.15, 3);
  g.cyl(0, 0.6, -0.05, 0.11, 0.012, 10, 0x8a5a32);
  g.cone(0, 0.61, -0.05, 0.06, 0.11, 8, 0x8a5a32);
  for (const sx of [-1, 1]) g.box(sx * 0.025, 0.57, 0.012, 0.012, 0.012, 0.006, DARK);
  for (const [x, z] of [[0.16, -0.05], [-0.3, 0.05]]) {
    g.ico(x, x > 0 ? 0.47 : 0.06, z, 0.03, 0x22252b, 1.1, 0, 4);
    g.cone(x + 0.025, x > 0 ? 0.475 : 0.065, z, 0.01, 0.03, 4, 0xf2a03a);
  }
  hw(g, ctx, 'pumpkin_orange', 0.14, { x: 0.28, z: -0.25 });
};

KM.e_builder_statue = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, COBBLE, { h: 0.01 });
  g.box(0, 0.01, 0, 0.5, 0.08, 0.5, 0xb8b0a0);
  g.box(0, 0.09, 0, 0.36, 0.26, 0.36, { top: 0xd8d2c4, side: 0xc4bcab });
  g.box(0, 0.16, 0.182, 0.2, 0.08, 0.008, GOLD);
  const gold = GOLD;
  g.box(0, 0.35, 0, 0.36, 0.13, 0.15, { top: shade(gold, 1.12), side: gold, front: shade(gold, 1.05) });
  g.box(-0.2, 0.36, 0, 0.05, 0.11, 0.13, shade(gold, 0.85));
  g.cyl(0, 0.48, 0, 0.035, 0.52, 8, shade(gold, 0.92), 0.03);
  g.ico(0, 1.0, 0, 0.04, gold, 1, 0, 2);
  for (let k = 0; k < 6; k++) glowBox(g, Math.cos(k) * 0.22, 0.6 + (k % 3) * 0.12, Math.sin(k) * 0.12, 0.022, 0.022, 0.022, 0xfff1a8);
  for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) bush(g, ctx, x, z, 0.62);
};

KM.e_joust = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xb9cf6a, { h: 0.008 });
  stripedCyl(g, -0.25, 0.008, -0.3, 0.42, 0.3, 14, RED, WHITE);
  stripedCone(g, -0.25, 0.3, -0.3, 0.5, 0.42, 14, RED, WHITE);
  g.box(-0.25, 0.008, 0.1, 0.18, 0.22, 0.04, 0x3a1f10);
  g.cyl(-0.25, 0.72, -0.3, 0.012, 0.22, 5, WOOD_D);
  g.box(-0.18, 0.86, -0.3, 0.12, 0.07, 0.008, 0x2f6fd1);
  for (let k = 0; k < 9; k++) g.box(-0.85 + k * 0.21, 0.008, 0.62, 0.04, 0.22, 0.04, WOOD_D);
  g.box(0, 0.18, 0.62, 1.75, 0.05, 0.05, { top: 0xffffff, side: 0x2f6fd1 });
  for (const [x, c] of [[0.45, 0x2f6fd1], [0.7, RED]]) {
    g.cyl(x, 0.008, -0.45, 0.015, 0.5, 5, WOOD_D);
    extrudeZ(g, [[x - 0.08, 0.42], [x - 0.08, 0.28], [x, 0.22], [x + 0.08, 0.28], [x + 0.08, 0.42]], -0.43, -0.41, c, c);
    g.box(x, 0.32, -0.405, 0.03, 0.08, 0.004, GOLD);
  }
  flag(g, ctx, 0.85, 0.85, 1.6, 1);
  flag(g, ctx, -0.85, 0.85, 1.6, 0);
  flag(g, ctx, 0.85, -0.85, 1.6, 3);
  KF(g, ctx, 'weaponrack', 0.4, 0.2, { x: 0.55, z: 0.1 });
  KF(g, ctx, 'target', 0.25, 0.25, { x: 0.1, z: -0.7 });
};

KM.e_pirate_ship = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, SAND, { h: 0.01 });
  g.cyl(0, 0.012, -0.25, 0.9, 0.012, 20, 0x4fb0e0);
  g.cyl(0, 0.013, -0.25, 0.7, 0.012, 20, 0x5ec2ee);
  g.push(0.25, 0, 0, -0.25);
  const hull = [[-0.62, 0.06], [0.62, 0.06], [0.86, 0.46], [-0.8, 0.42]];
  extrudeZ(g, hull, -0.26, 0.26, 0x6b3f22, 0x5a3418);
  g.box(0, 0.4, 0, 1.5, 0.03, 0.52, 0x9a6a3a);
  g.box(0.05, 0.2, 0.262, 1.3, 0.03, 0.004, GOLD);
  for (let k = 0; k < 5; k++) g.box(-0.4 + k * 0.2, 0.26, 0.263, 0.06, 0.05, 0.004, 0x1a1a1a);
  g.box(-0.58, 0.43, 0, 0.36, 0.2, 0.5, { top: 0x7a4a2a, side: 0x6b3f22 });
  g.box(-0.58, 0.63, 0, 0.38, 0.03, 0.52, GOLD);
  g.cyl(0.1, 0.43, 0, 0.03, 0.95, 6, WOOD_D);
  g.box(0.1, 0.62, 0, 0.5, 0.3, 0.02, WHITE);
  g.box(0.1, 0.98, 0, 0.36, 0.22, 0.02, WHITE);
  g.cyl(0.1, 1.2, 0, 0.07, 0.06, 8, WOOD, 0.08);
  g.box(0.22, 1.32, 0, 0.18, 0.11, 0.01, 0x111111);
  g.box(0.21, 1.37, 0.006, 0.04, 0.04, 0.004, WHITE);
  tube(g, [0.86, 0.46, 0], [1.0, 0.62, 0], 0.012, 4, WOOD_D);
  g.pop();
  // le trésor sur la plage
  const ty = fitTop(g, ctx, 'crate_open', 0.26, 0.2, { x: 0.55, z: 0.62, rot: -0.4 });
  for (let k = 0; k < 8; k++) g.ico(0.48 + (k % 4) * 0.045, ty + 0.01, 0.6 + Math.floor(k / 4) * 0.05, 0.035, GOLD, 0.6, 0.3, k);
  for (let k = 0; k < 5; k++) g.cyl(0.25 + k * 0.07, 0.012, 0.8 - (k % 2) * 0.06, 0.025, 0.008, 8, GOLD);
  treeKit(g, ctx, -0.75, 0.65, 0.8, 'round', 4);
};

KM.e_carousel = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, COBBLE, { h: 0.01 });
  stripedCyl(g, 0, 0.01, 0, 0.82, 0.09, 20, RED, 0xffd34d);
  g.cyl(0, 0.1, 0, 0.82, 0.005, 20, 0xc98a4b);
  for (let k = 0; k < 3; k++) g.box(0, 0.01, 0.86 + k * 0.03, 0.3, 0.09 - k * 0.03, 0.04, 0x9a6a3a);
  // partie qui tourne : chevaux, barres, toit
  const t = new GeoBuilder();
  t.cyl(0, 0.0, 0, 0.11, 0.78, 10, GOLD);
  const coats = [WHITE, 0x8a5a32, 0x3a3a3a, WHITE, 0xd9a066, 0x8a5a32];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.56, z = Math.sin(a) * 0.56;
    t.cyl(x, 0.0, z, 0.012, 0.7, 5, GOLD);
    t.push(-a, x, 0.2 + (k % 2) * 0.06, z);
    const c = coats[k];
    t.box(0, 0.06, 0, 0.07, 0.07, 0.2, c);
    t.box(0, 0.11, 0.09, 0.05, 0.1, 0.05, c);
    t.box(0, 0.18, 0.12, 0.045, 0.045, 0.08, c);
    t.box(0, 0.13, 0.07, 0.012, 0.08, 0.05, k % 2 ? 0xd9a066 : 0x3a2b20);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) t.box(sx * 0.022, -0.04, sz * 0.07, 0.018, 0.1, 0.018, c);
    t.box(0, 0.1, -0.02, 0.075, 0.025, 0.08, RED);
    t.pop();
  }
  stripedCyl(t, 0, 0.62, 0, 0.88, 0.1, 20, RED, WHITE);
  stripedCone(t, 0, 0.72, 0, 0.9, 0.34, 20, RED, WHITE);
  t.ico(0, 1.07, 0, 0.06, GOLD, 1, 0, 1);
  t.cyl(0, 1.1, 0, 0.01, 0.16, 5, GOLD);
  t.box(0.06, 1.2, 0, 0.1, 0.06, 0.006, 0x2f6fd1);
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    t.box(Math.cos(a) * 0.885, 0.6, Math.sin(a) * 0.885, 0.025, 0.025, 0.025, 0xfff1a8);
  }
  ctx.out.parts.push({ body: t.body, glass: t.glass, pivot: g._v(0, 0.1, 0), axis: 'y', kind: 'spin', speed: 0.55 });
};

KM.e_balloon = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, GRASS, { h: 0.008 });
  g.box(0, 0.008, 0.05, 0.2, 0.14, 0.2, { top: 0x7a4a2a, side: 0xb87440 });
  g.box(0, 0.148, 0.05, 0.22, 0.02, 0.22, 0x7a4a2a);
  for (const [x, z] of [[-0.1, -0.05], [0.1, -0.05], [-0.1, 0.15], [0.1, 0.15]]) tube(g, [x, 0.16, z], [x * 1.5, 0.5, 0.05 + (z - 0.05) * 1.5], 0.005, 3, 0x3a2b20, 0.005, false);
  g.layer('glass');
  g.box(0, 0.32, 0.05, 0.06, 0.05, 0.06, 0xffb13a);
  g.layer('body');
  const prof = [[0.48, 0.1], [0.55, 0.2], [0.66, 0.29], [0.8, 0.34], [0.94, 0.35], [1.06, 0.32], [1.16, 0.25], [1.23, 0.15], [1.27, 0.0]];
  for (let k = 0; k < prof.length - 1; k++) {
    const [y0, r0] = prof[k], [y1, r1] = prof[k + 1];
    stripedCyl(g, 0, y0, 0.05, r0, y1 - y0, 14, k === 3 ? YELLOW : 0xff5a3a, k === 3 ? 0x2f9ad1 : 0xffd34d, r1);
  }
  for (const [x, z] of [[-0.11, -0.04], [0.11, 0.14]]) g.ico(x, 0.17, z, 0.025, 0xc9a25a, 1, 0, 2);
  for (const sx of [-1, 1]) tube(g, [sx * 0.08, 0.15, 0.05], [sx * 0.35, 0.0, 0.3], 0.004, 3, 0xeeeeee, 0.004, false);
};

KM.e_circus = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, 0xd9bd8c, { h: 0.01 });
  stripedCyl(g, 0, 0.01, -0.05, 0.8, 0.34, 20, RED, 0xffd34d);
  stripedCone(g, 0, 0.35, -0.05, 0.88, 0.6, 20, RED, WHITE);
  for (let k = 0; k < 20; k++) {
    const a = ((k + 0.5) / 20) * Math.PI * 2;
    g.ico(Math.cos(a) * 0.87, 0.34, -0.05 + Math.sin(a) * 0.87, 0.05, k % 2 ? 0x2f6fd1 : 0xffd34d, 0.7, 0, k);
  }
  g.cyl(0, 0.94, -0.05, 0.015, 0.28, 5, WOOD_D);
  g.box(0.08, 1.14, -0.05, 0.14, 0.08, 0.008, 0x2f6fd1);
  g.ico(0, 0.95, -0.05, 0.04, GOLD, 1, 0, 2);
  g.box(0, 0.01, 0.74, 0.3, 0.3, 0.04, 0x2a0f0a);
  for (const sx of [-1, 1]) g.box(sx * 0.19, 0.01, 0.75, 0.1, 0.32, 0.03, RED);
  g.box(0, 0.31, 0.76, 0.42, 0.05, 0.03, 0xffd34d);
  stripedCyl(g, 0.6, 0.01, 0.62, 0.1, 0.12, 10, 0x2f6fd1, WHITE);
  g.ico(0.6, 0.2, 0.62, 0.07, RED, 1, 0, 3);
  for (const [x, z] of [[-0.7, 0.65], [-0.55, 0.75]]) balloon(g, x, z, 0.55, BRIGHT[Math.round(x * 10) % 6 + 1] || RED);
};

KM.e_igloo = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, SNOW, { h: 0.012 });
  g.dome(0, 0.01, -0.05, 0.33, 0xe6f4fb, 14, 5, 0.95);
  for (const [y, r] of [[0.09, 0.322], [0.17, 0.29], [0.24, 0.235]]) g.cyl(0, y, -0.05, r + 0.004, 0.006, 14, 0xb8d8ea, r + 0.004, false);
  g.cylZ(0, 0.0, 0.25, 0.13, 0.2, 10, 0xe6f4fb, 0xd2ebf6);
  g.box(0, 0.0, 0.352, 0.13, 0.1, 0.004, 0x5a7a90);
  const peng = (x, z, s, rot) => {
    g.push(rot, x, 0, z);
    g.ico(0, 0.09 * s, 0, 0.06 * s, 0x22252b, 1.35, 0, 1);
    g.ico(0, 0.085 * s, 0.025 * s, 0.045 * s, WHITE, 1.3, 0, 2);
    g.ico(0, 0.19 * s, 0, 0.04 * s, 0x22252b, 1, 0, 3);
    g.cone(0, 0.18 * s, 0.035 * s, 0.012 * s, 0.03 * s, 4, 0xf2a03a);
    for (const sx of [-1, 1]) g.box(sx * 0.015 * s, 0.205 * s, 0.032 * s, 0.01 * s, 0.01 * s, 0.006 * s, WHITE);
    for (const sx of [-1, 1]) g.box(sx * 0.025 * s, 0, 0.02 * s, 0.025 * s, 0.01 * s, 0.035 * s, 0xf2a03a);
    g.pop();
  };
  peng(0.3, 0.25, 1, -0.4);
  peng(-0.3, 0.28, 0.8, 0.5);
  for (const [x, z] of [[0.33, -0.3], [-0.34, -0.28]]) g.box(x, 0.012, z, 0.12, 0.1, 0.1, { top: 0xd8f0ff, side: 0xb8dcf0 });
};

KM.e_sandcastle = (g, L, ctx) => {
  pad(g, ctx, 0.86, 0.86, SAND, { h: 0.012 });
  const sand = 0xe8c98a, sandD = 0xd4ad6a;
  g.ico(0, 0.0, -0.02, 0.32, sandD, 0.3, 0.2, 3);
  g.box(0, 0.05, -0.02, 0.36, 0.15, 0.3, { top: sand, side: sandD });
  for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.12], [0.18, 0.12]]) {
    g.cyl(x, 0.05, z, 0.065, 0.24, 8, sand, 0.058);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      g.box(x + Math.cos(a) * 0.045, 0.29, z + Math.sin(a) * 0.045, 0.03, 0.03, 0.03, sand);
    }
  }
  g.cyl(0, 0.2, -0.02, 0.09, 0.2, 8, sand, 0.08);
  g.cone(0, 0.4, -0.02, 0.09, 0.12, 8, sandD);
  g.cyl(0, 0.52, -0.02, 0.006, 0.12, 4, WOOD_D);
  g.box(0.035, 0.6, -0.02, 0.06, 0.04, 0.005, RED);
  g.box(0, 0.05, 0.135, 0.07, 0.09, 0.006, 0x8a6a3a);
  g.cyl(0.3, 0.012, 0.28, 0.06, 0.1, 10, RED, 0.075);
  tube(g, [0.2, 0.012, 0.33], [0.32, 0.2, 0.22], 0.008, 4, 0x2f6fd1);
  g.box(0.2, 0.012, 0.33, 0.06, 0.012, 0.08, 0x2f6fd1);
  for (const [x, z, c] of [[-0.3, 0.3, 0xffb3c8], [-0.2, 0.35, WHITE], [0.05, 0.36, 0xffd0a0]]) g.ico(x, 0.02, z, 0.022, c, 0.6, 0, 4);
};

KM.e_icecream = (g, L, ctx) => {
  pad(g, ctx, 0.84, 0.84, COBBLE, { h: 0.01 });
  g.box(0, 0.08, 0.02, 0.46, 0.26, 0.28, { top: WHITE, side: 0x8fe0c8, front: 0x8fe0c8 });
  g.box(0, 0.22, 0.163, 0.46, 0.04, 0.004, 0xff86b8);
  for (const sx of [-1, 1]) g.cylZ(sx * 0.15, 0.07, 0.02, 0.06, 0.3, 10, DARK, 0xcccccc);
  for (const [x, c] of [[-0.12, 0xff86b8], [0, 0xfff1d6], [0.12, 0x8fe0c8]]) g.ico(x, 0.36, 0.06, 0.04, c, 0.8, 0.15, Math.round(x * 100) + 3);
  tube(g, [0.16, 0.34, -0.08], [0.16, 0.66, -0.08], 0.008, 4, WHITE);
  stripedCone(g, 0.16, 0.62, -0.08, 0.3, 0.12, 12, 0xff86b8, WHITE);
  g.cyl(-0.3, 0.01, 0.25, 0.012, 0.28, 8, 0xd9a066, 0.07);
  g.ico(-0.3, 0.32, 0.25, 0.065, 0xff86b8, 0.9, 0.12, 5);
  g.ico(-0.3, 0.4, 0.25, 0.055, 0xfff1d6, 0.9, 0.12, 6);
  g.ico(-0.3, 0.46, 0.25, 0.02, 0xe53935, 1, 0, 7);
};

KM.e_foodtruck = (g, L, ctx) => {
  pad(g, ctx, 1.92, 0.84, COBBLE, { h: 0.01 });
  KF(g, ctx, 'mk_delivery_truck', 1.3, 0.62, { z: -0.08, rot: Math.PI / 2, tint: [1.2, 0.95, 0.75] });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x0 = -0.45 + (i * 0.9) / n, x1 = x0 + 0.9 / n;
    g.quad([x0, 0.62, 0.22], [x0, 0.52, 0.42], [x1, 0.52, 0.42], [x1, 0.62, 0.22], i % 2 ? RED : 0xffd34d);
    g.box((x0 + x1) / 2, 0.47, 0.42, x1 - x0, 0.05, 0.012, i % 2 ? 0xffd34d : RED);
  }
  for (const [x, z] of [[-0.6, 0.3], [0.65, 0.3]]) {
    KF(g, ctx, 'r_table_round_A', 0.22, 0.22, { x, z });
    KF(g, ctx, 'r_chair_stool', 0.08, 0.08, { x: x + 0.15, z: z + 0.05 });
  }
  KF(g, ctx, 'r_menu', 0.12, 0.08, { x: 0.25, z: 0.34 });
  bulbs(g, [-0.9, 0.55, 0.38], [0.9, 0.55, 0.38], 12, 0.08, BRIGHT);
  for (const x of [-0.9, 0.9]) g.cyl(x, 0.01, 0.38, 0.012, 0.55, 5, WOOD_D);
};

KM.e_giant_tree = (g, L, ctx) => {
  pad(g, ctx, 1.94, 1.94, GRASS, { h: 0.008 });
  const bark = 0x7a4a2a;
  bands(g, 0, 0, [[0.0, 0.27], [0.12, 0.2], [0.4, 0.15], [0.62, 0.13], [0.72, 0.15]], [bark, shade(bark, 0.92)], 10);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    tube(g, [Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12], [Math.cos(a) * 0.42, 0.0, Math.sin(a) * 0.42], 0.055, 5, bark, 0.015);
  }
  for (const [dx, dz] of [[-0.35, -0.1], [0.35, 0.05], [0.05, -0.4], [-0.1, 0.35]]) tube(g, [0, 0.6, 0], [dx, 0.82, dz], 0.06, 6, bark, 0.03);
  const leaf = [0x3f9e3a, 0x4caf3e, 0x5ab544, 0x3a8f36];
  for (const [x, y, z, r, k] of [[0, 1.12, 0, 0.42, 0], [-0.42, 0.95, -0.12, 0.33, 1], [0.42, 0.98, 0.06, 0.34, 2], [0.06, 0.96, -0.45, 0.3, 3], [-0.1, 0.94, 0.42, 0.3, 1], [0.3, 1.2, -0.25, 0.26, 2], [-0.3, 1.22, 0.22, 0.25, 0]]) g.ico(x, y, z, r, ctx.autumn ? [0xe58a2b, 0xd9682a, 0xf0b33a, 0xc9502a][k] : ctx.winter ? 0xe8eef0 : leaf[k], 0.85, 0.25, k * 7 + 3);
  // la petite porte des lutins
  g.box(0, 0.01, 0.2, 0.1, 0.13, 0.03, 0xb8231b);
  g.cylZ(0, 0.14, 0.2, 0.05, 0.03, 8, 0xb8231b);
  g.ico(0.03, 0.07, 0.218, 0.008, GOLD, 1, 0, 2);
  g.layer('glass');
  g.box(0.1, 0.28, 0.165, 0.05, 0.05, 0.01, 0xffd98a);
  g.layer('body');
  for (const [x, z] of [[0.55, 0.55], [-0.6, 0.45], [0.45, -0.6], [0.7, 0.2]]) {
    g.cyl(x, 0.008, z, 0.018, 0.06, 6, WHITE);
    g.dome(x, 0.06, z, 0.05, 0xe53935, 8, 2);
  }
  tube(g, [0.32, 0.8, 0.02], [0.32, 0.25, 0.02], 0.005, 3, 0xd9c49a, 0.005, false);
  tube(g, [0.45, 0.82, 0.02], [0.45, 0.25, 0.02], 0.005, 3, 0xd9c49a, 0.005, false);
  g.box(0.385, 0.23, 0.02, 0.16, 0.02, 0.07, WOOD);
};
