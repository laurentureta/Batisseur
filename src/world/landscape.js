// Paysage autour de la carte jouable : une couronne de cases (même style que la carte), puis un
// relief lointain (collines, montagnes à l'horizon). Tout est déduit des fonctions du monde (WorldField) :
// rivières, côte et forêts continuent naturellement au-delà du bord.
import { SIZE, T } from './constants.js';
import { hash2 } from '../core/rng.js';

export const RING = 20; // largeur de la couronne de cases (en cases)
export const FAR = 120; // étendue du relief lointain au-delà de la couronne
export const FAR_STEP = 5; // pas de la grille du relief lointain

/**
 * Couronne de cases : grille (SIZE + 2 RING)² dont le centre (la carte jouable) vaut 255.
 * Coordonnées : case (x, z) de la couronne = case (x - RING, z - RING) du monde.
 */
export function buildRing(world) {
  const W = SIZE + 2 * RING;
  const terrain = new Uint8Array(W * W).fill(255);
  const height = new Float32Array(W * W);
  const variant = new Uint8Array(W * W);
  const F = world.field;
  if (!F) return { W, terrain, height, variant, ok: false };
  const seed = world.state.seed | 0;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const wx = x - RING, wz = z - RING;
      if (wx >= 0 && wz >= 0 && wx < SIZE && wz < SIZE) continue;
      const i = z * W + x;
      const o = F.outer(wx, wz);
      let t = o.t;
      // près du bord, on reprend le terrain de la carte pour que le raccord soit propre
      const ex = Math.min(Math.max(wx, 0), SIZE - 1), ez = Math.min(Math.max(wz, 0), SIZE - 1);
      const edgeT = world.terrain[ez * SIZE + ex];
      const dEdge = Math.max(Math.abs(wx - ex), Math.abs(wz - ez));
      if (dEdge <= 1 && (edgeT === T.WATER || edgeT === T.DEEP || edgeT === T.MOUNTAIN) && hash2(wx, wz, 71) < 0.85) t = edgeT;
      terrain[i] = t;
      // montagnes : hauteur des crêtes du paysage (affinée plus bas selon le cœur du massif)
      height[i] = t === T.WATER ? -0.24 : t === T.DEEP ? -0.42 : t === T.MOUNTAIN ? Math.max(0.8, o.h) : 0;
      variant[i] = Math.floor(hash2(wx, wz, seed) * 256);
    }
  }
  // hauteur des montagnes : elles montent vers le cœur du massif (comme dans la carte)
  const isM = (x, z) => {
    const wx = x - RING, wz = z - RING;
    if (wx >= 0 && wz >= 0 && wx < SIZE && wz < SIZE) return world.terrain[wz * SIZE + wx] === T.MOUNTAIN;
    return terrain[z * W + x] === T.MOUNTAIN;
  };
  const steps = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let qh = 0, qt = 0;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      if (!isM(x, z)) continue;
      let border = false;
      for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
        if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        if (!isM(nx, nz)) border = true;
      }
      if (border) {
        steps[z * W + x] = 1;
        queue[qt++] = z * W + x;
      }
    }
  }
  while (qh < qt) {
    const k = queue[qh++];
    const x = k % W, z = (k / W) | 0;
    for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
      const j = nz * W + nx;
      if (steps[j] === 0 && isM(nx, nz)) {
        steps[j] = Math.min(250, steps[k] + 1);
        queue[qt++] = j;
      }
    }
  }
  for (let i = 0; i < W * W; i++) {
    if (terrain[i] !== T.MOUNTAIN) continue;
    const x = i % W, z = (i / W) | 0;
    const st = steps[i] || 6;
    const jitter = (hash2(x, z, seed + 11) - 0.5) * 0.3;
    const ridge = F.ridgeH(x - RING, z - RING) * (1 + Math.min(1, Math.max(0, height[i] - 1) / 6) * 0.5);
    height[i] = Math.min(7.5, 0.55 + st * 0.42 + jitter, Math.max(ridge, height[i] * 0.8));
  }
  return { W, terrain, height, variant, ok: true };
}

/** Case de la couronne (coordonnées du monde) : type ou -1 si hors couronne / dans la carte. */
export function ringAt(ring, wx, wz) {
  const x = wx + RING, z = wz + RING;
  if (x < 0 || z < 0 || x >= ring.W || z >= ring.W) return -1;
  const t = ring.terrain[z * ring.W + x];
  return t === 255 ? -1 : t;
}
