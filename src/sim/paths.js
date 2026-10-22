// Recherche de chemin pour les habitants : par les routes (trajets maison ↔ travail) ou à travers
// champs et forêts (bûcheron vers son arbre), en contournant l'eau, les montagnes et les bâtiments.
import { SIZE, N, T } from '../world/constants.js';

const HALF = SIZE / 2;

// tampons partagés (un seul calcul à la fois)
const stamp = new Uint32Array(N);
const parent = new Int32Array(N);
const gScore = new Float32Array(N);
const queue = new Int32Array(N);
let gen = 1;

/** Centre d'une case, en coordonnées de la scène. */
export function tileCenter(i) {
  return [(i % SIZE) + 0.5 - HALF, ((i / SIZE) | 0) + 0.5 - HALF];
}

export function tileAt(x, z) {
  const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
  if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) return -1;
  return tz * SIZE + tx;
}

/** Peut-on marcher sur cette case ? (own : bâtiment dans lequel on a le droit d'entrer) */
export function walkable(world, i, own = -1) {
  if (i < 0 || i >= N) return false;
  if (world.road[i]) return true; // routes et ponts
  const t = world.terrain[i];
  if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN) return false;
  const o = world.occ[i];
  return o < 0 || o === own;
}

/**
 * Chemin par les routes entre deux cases de route (largeur d'abord). Renvoie la liste des cases
 * ou null. maxLen limite la recherche.
 */
export function roadPath(world, from, to, maxLen = 400) {
  const road = world.road;
  if (from < 0 || to < 0 || !road[from] || !road[to]) return null;
  if (from === to) return [from];
  const g = ++gen;
  let qh = 0, qt = 0;
  queue[qt++] = from;
  stamp[from] = g;
  parent[from] = -1;
  gScore[from] = 0;
  while (qh < qt) {
    const i = queue[qh++];
    if (i === to) break;
    const d = gScore[i];
    if (d >= maxLen) continue;
    const x = i % SIZE;
    const nb0 = x > 0 ? i - 1 : -1, nb1 = x < SIZE - 1 ? i + 1 : -1, nb2 = i - SIZE, nb3 = i + SIZE;
    for (const j of [nb0, nb1, nb2, nb3]) {
      if (j < 0 || j >= N || stamp[j] === g || !road[j]) continue;
      stamp[j] = g;
      parent[j] = i;
      gScore[j] = d + 1;
      queue[qt++] = j;
    }
  }
  if (stamp[to] !== g) return null;
  const out = [];
  for (let i = to; i !== -1; i = parent[i]) out.push(i);
  out.reverse();
  return out;
}

/** Case de route qui touche un bâtiment (la plus proche d'un point, si donné). */
export function roadNextTo(world, b, near = null) {
  let best = -1, bestD = Infinity;
  for (const i of world.perimeter(b)) {
    if (!world.road[i]) continue;
    if (!near) return i;
    const [x, z] = tileCenter(i);
    const d = (x - near[0]) ** 2 + (z - near[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Chemin à pied (A*, 8 directions sans couper les coins) d'un point à un autre.
 * Renvoie une liste de points [x, z] (scène) qui finit exactement sur la cible, ou null.
 * own : bâtiment traversable (le sien), box : marge de recherche autour des deux points.
 */
export function walkPath(world, sx, sz, tx, tz, { own = -1, margin = 8, allowTargetBlocked = true } = {}) {
  const s = tileAt(sx, sz), t = tileAt(tx, tz);
  if (s < 0 || t < 0) return null;
  if (s === t) return [[sx, sz], [tx, tz]];
  const x0 = Math.max(0, Math.min(s % SIZE, t % SIZE) - margin), x1 = Math.min(SIZE - 1, Math.max(s % SIZE, t % SIZE) + margin);
  const z0 = Math.max(0, Math.min((s / SIZE) | 0, (t / SIZE) | 0) - margin), z1 = Math.min(SIZE - 1, Math.max((s / SIZE) | 0, (t / SIZE) | 0) + margin);
  const ok = (i) => i === t ? (allowTargetBlocked || walkable(world, i, own)) : i === s || walkable(world, i, own);
  const g = ++gen;
  const tX = t % SIZE, tZ = (t / SIZE) | 0;
  const h = (i) => {
    const dx = Math.abs((i % SIZE) - tX), dz = Math.abs(((i / SIZE) | 0) - tZ);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  // file de priorité (tas binaire : chaque entrée garde sa propre priorité)
  const hi = [], hf = [];
  const push = (i, f) => {
    let k = hi.length;
    hi.push(i);
    hf.push(f);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hi[k] = hi[p];
      hf[k] = hf[p];
      k = p;
    }
    hi[k] = i;
    hf[k] = f;
  };
  const pop = () => {
    const top = hi[0];
    const li = hi.pop(), lf = hf.pop();
    const n = hi.length;
    if (n) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = -1, mf = lf;
        if (l < n && hf[l] < mf) {
          m = l;
          mf = hf[l];
        }
        if (r < n && hf[r] < mf) m = r;
        if (m < 0) break;
        hi[k] = hi[m];
        hf[k] = hf[m];
        k = m;
      }
      hi[k] = li;
      hf[k] = lf;
    }
    return top;
  };
  stamp[s] = g;
  parent[s] = -1;
  gScore[s] = 0;
  push(s, h(s));
  const closed = new Set();
  let found = false, guard = 0;
  while (hi.length && guard++ < 6000) {
    const i = pop();
    if (closed.has(i)) continue;
    closed.add(i);
    if (i === t) {
      found = true;
      break;
    }
    const x = i % SIZE, z = (i / SIZE) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
        const j = nz * SIZE + nx;
        if (closed.has(j) || !ok(j)) continue;
        // pas de diagonale entre deux obstacles
        if (dx && dz && (!ok(z * SIZE + nx) || !ok(nz * SIZE + x))) continue;
        const cost = gScore[i] + (dx && dz ? 1.414 : 1) + (world.road[j] ? -0.15 : 0);
        if (stamp[j] === g && gScore[j] <= cost) continue;
        stamp[j] = g;
        gScore[j] = cost;
        parent[j] = i;
        push(j, cost + h(j));
      }
    }
  }
  if (!found) return null;
  const tiles = [];
  for (let i = t; i !== -1; i = parent[i]) tiles.push(i);
  tiles.reverse();
  const pts = [[sx, sz]];
  for (let k = 1; k < tiles.length - 1; k++) {
    const [cx, cz] = tileCenter(tiles[k]);
    // un peu de variété dans la case (pas tous sur la même ligne)
    const j = ((tiles[k] * 2654435761) >>> 0) / 4294967296;
    pts.push([cx + (j - 0.5) * 0.3, cz + (((j * 7.13) % 1) - 0.5) * 0.3]);
  }
  pts.push([tx, tz]);
  return smooth(world, pts, own);
}

/** Retire les points inutiles quand on peut aller tout droit (en restant sur des cases praticables). */
function smooth(world, pts, own) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !clearLine(world, pts[a], pts[b], own)) b--;
    out.push(pts[b]);
    a = b;
  }
  return out;
}

function clearLine(world, p, q, own) {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.ceil(d / 0.25);
  for (let k = 1; k < n; k++) {
    const f = k / n;
    const i = tileAt(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f);
    if (!walkable(world, i, own)) return false;
  }
  return true;
}

/** Chemin (liste de points) → mouvement : longueurs cumulées. */
export function makeMove(pts, speed, t0) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], speed, t0 };
}

/** Position (et direction) sur un mouvement à l'instant t. */
export function moveAt(mv, t, out = { x: 0, z: 0, dir: 0, s: 0, done: false }) {
  const s = Math.max(0, Math.min(mv.len, (t - mv.t0) * mv.speed));
  out.s = s;
  out.done = s >= mv.len - 1e-6;
  const { pts, cum } = mv;
  let k = 1;
  while (k < cum.length - 1 && cum[k] < s) k++;
  const a = pts[k - 1], b = pts[k] || a;
  const seg = cum[k] - cum[k - 1] || 1;
  const f = Math.min(1, Math.max(0, (s - cum[k - 1]) / seg));
  out.x = a[0] + (b[0] - a[0]) * f;
  out.z = a[1] + (b[1] - a[1]) * f;
  if (b !== a) out.dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return out;
}

/** Points d'un chemin de cases (route) → points de la scène, sur le côté droit de la chaussée. */
export function roadPoints(tiles, lane = 0.22) {
  const pts = [];
  for (let k = 0; k < tiles.length; k++) {
    const [x, z] = tileCenter(tiles[k]);
    const j = tiles[Math.min(k + 1, tiles.length - 1)], p = tiles[Math.max(k - 1, 0)];
    let dx = (j % SIZE) - (p % SIZE), dz = ((j / SIZE) | 0) - ((p / SIZE) | 0);
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    pts.push([x - dz * lane, z + dx * lane]);
  }
  return pts;
}
