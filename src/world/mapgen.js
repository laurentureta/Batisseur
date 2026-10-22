// Génération procédurale du monde (110 x 110 cases) selon le terrain choisi (vallée, côte, montagnes).
// Les rivières, la côte, les lacs et le relief sont des fonctions continues : on peut les évaluer
// partout, dans la carte comme dans le paysage qui l'entoure (les rivières sortent de la carte).
import { SIZE, N, T, LEGACY_SIZE, LEGACY_OFFSET } from './constants.js';
import { mulberry32, valueNoise, fbm, hash2 } from '../core/rng.js';

const C = (SIZE - 1) / 2; // centre de la carte (54,5)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Le monde « analytique » : rivières, côte, lacs, élévation, humidité. */
export class WorldField {
  constructor(seed, preset = 'vallee', { legacy = false } = {}) {
    this.seed = seed >>> 0;
    this.preset = preset;
    this.legacy = legacy;
    const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.nE = valueNoise((seed ^ 0x9e3779b9) | 0);
    this.nM = valueNoise((seed ^ 0x85ebca6b) | 0);
    this.nD = valueNoise((seed ^ 0xc2b2ae35) | 0);
    this.nH = valueNoise((seed ^ 0x27d4eb2f) | 0);
    this.side = rng() < 0.5 ? -1 : 1;
    this.ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28];
    // côté de la chaîne de montagnes (vallée) : les montagnes ne ferment pas toute la carte
    this.mAngle = rng() * Math.PI * 2;
    this.rivers = [];
    this.lakes = [];
    this.islands = [];
    if (preset === 'cote') {
      this.coastBase = SIZE * 0.74;
      this.mountainThr = 0.95;
      this.forestThr = 0.555;
      if (!legacy) {
        const z0 = C + this.side * (15 + rng() * 6);
        this.rivers.push({ dir: 'ew', base: z0, a: 3.5, f: 0.07, p: this.ph[1], n: 6, hw: 1.0, from: -Infinity, to: () => this.coastX(z0) + 1 });
      }
      for (let k = 0; k < 3; k++) this.islands.push({ z: C + (rng() - 0.5) * 80, dx: 7 + rng() * 9, r: 1.6 + rng() * 1.8 });
    } else if (preset === 'montagne') {
      this.mountainThr = 0.9;
      this.forestThr = 0.5;
      if (!legacy) {
        // torrent qui descend des montagnes (nord) vers le sud
        const x0 = C + this.side * (17 + rng() * 5);
        this.rivers.push({ dir: 'ns', base: x0, a: 4.5, f: 0.05, p: this.ph[0], n: 7, hw: 0.95, from: SIZE * 0.24, to: Infinity });
      }
    } else {
      this.mountainThr = 0.9;
      this.forestThr = 0.55;
      if (!legacy) {
        // grande rivière nord-sud et son affluent
        const x0 = C + this.side * (14 + rng() * 5);
        const main = { dir: 'ns', base: x0, a: 6, f: 0.042, p: this.ph[0], n: 9, hw: 1.15, from: -Infinity, to: Infinity };
        this.rivers.push(main);
        const zj = C + (rng() < 0.5 ? -1 : 1) * (18 + rng() * 14);
        const xj = this.riverCenter(main, zj);
        const trib = { dir: 'ew', base: zj, a: 4, f: 0.06, p: this.ph[2], n: 6, hw: 0.85 };
        if (this.side > 0) Object.assign(trib, { from: xj, to: Infinity });
        else Object.assign(trib, { from: -Infinity, to: xj });
        this.rivers.push(trib);
      }
    }
    // massifs isolés (mines et carrières dans les zones lointaines)
    this.massifs = [];
    const nMassif = preset === 'montagne' ? 1 : preset === 'cote' ? 1 : 2;
    for (let k = 0, guard = 0; k < nMassif && guard < 40; guard++) {
      const a = rng() * Math.PI * 2, d = 31 + rng() * 12;
      const x = C + Math.cos(a) * d, z = C + Math.sin(a) * d;
      if (this.riverDist(x, z) < 8) continue;
      if (preset === 'cote' && x > this.coastX(z) - 10) continue;
      this.massifs.push({ x, z, r: 5 + rng() * 3.5 });
      k++;
    }
    // lacs, loin du centre et des rivières
    const nLakes = preset === 'montagne' ? 2 : preset === 'cote' ? 2 : 3;
    for (let k = 0, guard = 0; k < nLakes && guard < 60; guard++) {
      const a = rng() * Math.PI * 2, d = 24 + rng() * 26;
      const x = C + Math.cos(a) * d, z = C + Math.sin(a) * d;
      if (this.riverDist(x, z) < 9) continue;
      if (preset === 'cote' && x > this.coastX(z) - 8) continue;
      if (this.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < 16)) continue;
      this.lakes.push({ x, z, r: 2.8 + rng() * 2.8 });
      k++;
    }
  }

  riverCenter(r, t) {
    return r.base + r.a * Math.sin(t * r.f + r.p) + 2.2 * Math.sin(t * r.f * 2.7 + r.p * 1.7) + (this.nD(t * 0.045, r.base * 0.1) - 0.5) * r.n;
  }

  riverHalfWidth(r, t) {
    return r.hw + 0.45 * this.nD(t * 0.08, 7.7 + r.base * 0.01);
  }

  /** Distance (en cases) au bord de la rivière la plus proche (négative = dans l'eau). */
  riverDist(x, z) {
    let best = Infinity;
    for (const r of this.rivers) {
      const along = r.dir === 'ns' ? z : x;
      const across = r.dir === 'ns' ? x : z;
      const lo = typeof r.from === 'function' ? r.from() : r.from;
      const hi = typeof r.to === 'function' ? r.to() : r.to;
      if (along < lo || along > hi) continue;
      const c = this.riverCenter(r, along);
      const d = Math.abs(across - c) - this.riverHalfWidth(r, along);
      if (d < best) best = d;
    }
    return best;
  }

  coastX(z) {
    return this.coastBase + 5 * Math.sin(z * 0.05 + this.ph[0]) + 2.5 * Math.sin(z * 0.16 + this.ph[3]) + (this.nD(z * 0.06, 5.1) - 0.5) * 9;
  }

  /** Distance au bord d'un lac (négative = dans le lac). */
  lakeDist(x, z) {
    let best = Infinity;
    for (const l of this.lakes) {
      const d = Math.hypot(x - l.x, z - l.z) + (this.nD(x * 0.3, z * 0.3) - 0.5) * 1.6 - l.r;
      if (d < best) best = d;
    }
    return best;
  }

  elev(x, z) {
    return fbm(this.nE, x * 0.036 + 3.1, z * 0.036 + 7.9, 4);
  }

  moist(x, z) {
    return 0.62 * fbm(this.nM, x * 0.048 + 31.7, z * 0.048 + 11.3, 3) + 0.38 * fbm(this.nM, x * 0.13 + 5.2, z * 0.13 + 71.4, 2);
  }

  /** Poids de la chaîne de montagnes selon la direction (1 du côté des montagnes, 0,2 à l'opposé). */
  dirW(x, z) {
    const k = 0.5 + 0.5 * Math.cos(Math.atan2(z - C, x - C) - this.mAngle);
    return 0.2 + 0.8 * k * k;
  }

  /**
   * Tendance à la montagne (dépend du terrain choisi et de l'éloignement du centre).
   * Hors de la carte, l'effet du bord reste celui du bord : le paysage prolonge la carte.
   */
  mountainScore(x, z) {
    const e = this.elev(x, z);
    const ex = clamp(x, 0, SIZE - 1), ez = clamp(z, 0, SIZE - 1);
    const edge = Math.max(Math.abs(ex - C), Math.abs(ez - C)) / C;
    const vary = 0.7 + 0.6 * this.nH(x * 0.03 + 1.7, z * 0.03 + 8.2);
    let m = 0;
    for (const s of this.massifs) m = Math.max(m, 1 - Math.hypot(x - s.x, z - s.z) / s.r);
    m = Math.max(0, m) * 0.55;
    if (this.preset === 'montagne') return e * 0.9 + Math.max(0, 0.4 - ez / SIZE) * 1.5 + Math.max(0, 0.34 - ex / SIZE) * 1.1 + Math.max(0, edge - 0.7) * 0.8 * vary + m;
    if (this.preset === 'cote') return e + Math.max(0, (1 - ex / SIZE) * 1.2 - 0.85) * 1.6 + Math.max(0, edge - 0.7) * 0.9 * vary + m;
    return e + Math.max(0, edge - 0.62) * 1.3 * vary * this.dirW(x, z) + m;
  }

  /** Côté où les montagnes lointaines se dressent (0..1). */
  rangeSide(x, z) {
    if (this.preset === 'cote') return clamp((C - x) / C + 0.2, 0, 1);
    if (this.preset === 'montagne') return clamp(1.15 - (x + z) / SIZE, 0.25, 1);
    return this.dirW(x, z);
  }

  /** Crêtes des massifs : limite la hauteur des montagnes (des sommets et des cols, pas un plateau). */
  ridgeH(x, z) {
    const r1 = 1 - Math.abs(this.nH(x * 0.032 + 4.4, z * 0.032 + 1.9) * 2 - 1);
    const r2 = 1 - Math.abs(this.nE(x * 0.09 + 7.7, z * 0.09 + 2.3) * 2 - 1);
    return 1.0 + r1 * r1 * 2.8 + r2 * 0.9;
  }

  /** Amas de rochers (bruit à part pour faire de vrais groupes). */
  rocky(x, z) {
    return fbm(this.nH, x * 0.11 + 17.3, z * 0.11 + 5.1, 2);
  }

  /** Eau à cet endroit ? 0 = non, T.WATER ou T.DEEP. */
  waterAt(x, z) {
    if (this.preset === 'cote') {
      const cx = this.coastX(z);
      for (const isl of this.islands) {
        const d = Math.hypot(x - (cx + isl.dx), z - isl.z) + (this.nD(x * 0.5, z * 0.5) - 0.5) * 1.2;
        if (d < isl.r) return 0;
      }
      if (x > cx + 3 + this.nD(z * 0.2, 2.2) * 2) return T.DEEP;
      if (x > cx) return T.WATER;
    }
    const ld = this.lakeDist(x, z);
    if (ld < -2.2) return T.DEEP;
    if (ld < 0) return T.WATER;
    if (this.riverDist(x, z) < 0) return T.WATER;
    if (this.preset === 'montagne' && this.elev(x, z) < 0.3 && Math.hypot(x - C, z - C) > 16) return this.elev(x, z) < 0.25 ? T.DEEP : T.WATER;
    return 0;
  }

  /** Plage (sable) au bord de l'eau ? */
  sandAt(x, z) {
    if (this.preset === 'cote') {
      const cx = this.coastX(z);
      if (x > cx - 1.6 - hash2(x | 0, z | 0, this.seed + 3) * 1.4) return true;
      for (const isl of this.islands) if (Math.hypot(x - (cx + isl.dx), z - isl.z) < isl.r + 0.2 && Math.hypot(x - (cx + isl.dx), z - isl.z) > isl.r - 0.9) return true;
    }
    if (this.riverDist(x, z) < 1.1 && hash2(x | 0, z | 0, this.seed + 5) < 0.42) return true;
    if (this.lakeDist(x, z) < 1 && hash2(x | 0, z | 0, this.seed + 6) < 0.6) return true;
    return false;
  }

  /**
   * Paysage autour de la carte : type de sol et hauteur (en unités du monde) à n'importe quel endroit.
   * dOut = distance (en cases) au bord de la carte.
   */
  outer(x, z) {
    const dOut = Math.max(0, -x, -z, x - (SIZE - 1), z - (SIZE - 1));
    const w = this.waterAt(x, z);
    // au-delà de la couronne, des collines et une chaîne de montagnes à l'horizon
    const far = clamp((dOut - 16) / 40, 0, 1);
    const side = this.rangeSide(x, z);
    const sc = this.mountainScore(x, z) + far * (0.08 + 0.55 * side) + (this.nH(x * 0.02, z * 0.02) - 0.5) * 0.3 * far;
    const hill = (this.nH(x * 0.06 + 9.1, z * 0.06 + 3.3) - 0.35) * 1.4 * clamp(dOut / 10, 0, 1);
    if (w && sc < this.mountainThr + 0.1) return { t: w, h: w === T.DEEP ? -0.42 : -0.24, dOut };
    if (sc > this.mountainThr) {
      // crêtes et vallons : des sommets enneigés, pas un plateau
      const m = sc - this.mountainThr;
      const r1 = 1 - Math.abs(this.nH(x * 0.032 + 4.4, z * 0.032 + 1.9) * 2 - 1);
      const r2 = 1 - Math.abs(this.nE(x * 0.09 + 7.7, z * 0.09 + 2.3) * 2 - 1);
      const k = clamp(m * 2.5, 0, 1);
      const h = 0.6 + m * 2.6 + (r1 * r1 * 5 + r2 * 1.4) * k * (0.35 + far) + Math.max(0, hill) * 0.3;
      return { t: T.MOUNTAIN, h: Math.min(12, h), dOut };
    }
    const m = this.moist(x, z);
    const h = Math.max(0, hill) * (0.6 + far * 1.6);
    if (this.sandAt(x, z)) return { t: T.SAND, h: Math.min(h, 0.05), dOut };
    if (m > this.forestThr - far * 0.04) return { t: T.FOREST, h, dOut };
    if (this.rocky(x, z) > 0.68 && hash2(x | 0, z | 0, this.seed + 7) < 0.6) return { t: T.ROCK, h, dOut };
    return { t: T.GRASS, h, dOut };
  }
}

/** Carte jouable : types de terrain, hauteur des montagnes, variante de chaque case. */
export function generateMap(seed, preset = 'vallee', { legacy = false } = {}) {
  const W = SIZE;
  const F = new WorldField(seed, preset, { legacy });
  const rng = mulberry32((seed ^ 0x1b873593) >>> 0);
  const terrain = new Uint8Array(N);
  const height = new Float32Array(N);
  const variant = new Uint8Array(N);
  const score = new Float32Array(N);
  const dist = (x, z) => Math.hypot(x - C, z - C);

  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      variant[i] = Math.floor(hash2(x, z, seed) * 256);
      score[i] = F.mountainScore(x, z);
      const w = F.waterAt(x, z);
      if (w) terrain[i] = w;
      else if (F.sandAt(x, z)) terrain[i] = T.SAND;
    }
  }

  // Montagnes (jamais au cœur de la carte)
  for (let i = 0; i < N; i++) {
    const x = i % W, z = (i / W) | 0;
    if (terrain[i] === T.DEEP) continue;
    if (score[i] > F.mountainThr && dist(x, z) > 27) terrain[i] = T.MOUNTAIN;
  }

  // Forêts et rochers
  const rockThr = preset === 'montagne' ? 0.66 : preset === 'cote' ? 0.72 : 0.7;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (terrain[i] !== T.GRASS) continue;
      const rk = F.rocky(x, z);
      if (rk > rockThr && hash2(x, z, seed + 7) < 0.5 + (rk - rockThr) * 6) terrain[i] = T.ROCK;
      else if (F.moist(x, z) > F.forestThr) terrain[i] = T.FOREST;
      else if (hash2(x, z, seed + 12) < 0.012) terrain[i] = T.FOREST; // arbres isolés dans les prés
    }
  }
  // Rochers au pied des montagnes
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (terrain[i] !== T.GRASS && terrain[i] !== T.FOREST) continue;
      if (neighborCount(terrain, x, z, T.MOUNTAIN) > 0 && hash2(x, z, seed + 8) < (preset === 'montagne' ? 0.55 : 0.4)) terrain[i] = T.ROCK;
    }
  }
  // Sable autour des lacs de montagne
  if (preset === 'montagne') {
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (terrain[i] === T.GRASS && neighborCount(terrain, x, z, T.WATER) > 0 && hash2(x, z, seed + 9) < 0.55) terrain[i] = T.SAND;
      }
    }
  }

  // Cœur de la carte : toujours constructible
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const d = dist(x, z);
      if (d < 5.2) terrain[i] = T.GRASS;
      else if (x >= 50 && x < 60 && z >= 50 && z < 60 && (terrain[i] === T.WATER || terrain[i] === T.DEEP || terrain[i] === T.MOUNTAIN)) terrain[i] = T.GRASS;
    }
  }

  // Un peu de forêt et de rochers près du départ
  const countIn = (types) => {
    let n = 0;
    for (let z = 49; z < 61; z++) for (let x = 49; x < 61; x++) if (types.includes(terrain[z * W + x])) n++;
    return n;
  };
  const corners = [[51, 51], [58, 51], [51, 58], [58, 58]];
  const riverSide = F.rivers[0]?.dir === 'ns' ? Math.sign(F.rivers[0].base - C) : preset === 'cote' ? 1 : 0;
  const goodCorners = riverSide ? corners.filter(([x]) => (riverSide > 0 ? x < 55 : x >= 55)) : corners;
  const forestCorner = goodCorners[Math.floor(rng() * goodCorners.length)];
  const rockCorner = corners.find((c) => c !== forestCorner && (c[0] === forestCorner[0] || c[1] === forestCorner[1])) || corners[3];
  if (countIn([T.FOREST]) < 14) stamp(terrain, forestCorner[0], forestCorner[1], 2.4, T.FOREST, (i, x, z) => dist(x, z) >= 4.2);
  if (countIn([T.ROCK, T.MOUNTAIN]) < 6) stamp(terrain, rockCorner[0], rockCorner[1], 1.6, T.ROCK, (i, x, z) => dist(x, z) >= 4.2);

  computeMountainHeights(terrain, height, seed, F);
  return { terrain, height, variant, field: F };
}

/** Hauteur des montagnes : elles montent vers l'intérieur du massif, avec des crêtes et des cols. */
export function computeMountainHeights(terrain, height, seed, field = null) {
  const W = SIZE;
  const steps = mountainSteps(terrain);
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== T.MOUNTAIN) {
      height[i] = 0;
      continue;
    }
    const x = i % W, z = (i / W) | 0;
    const jitter = (hash2(x, z, seed + 11) - 0.5) * 0.3;
    let h = 0.55 + steps[i] * 0.42 + jitter;
    if (field) h = Math.min(h, field.ridgeH(x, z) + jitter);
    height[i] = Math.round(Math.min(4.2, Math.max(0.45, h)) * 20) / 20;
  }
}

/**
 * Anciennes cartes 50 x 50 : on les replace au centre de la grande carte (décalage de 30 cases),
 * le nouveau monde pousse autour et les rivières qui sortaient de l'ancienne carte sont prolongées.
 */
export function embedLegacy(gen, oldTerrain, oldRoad, seed) {
  const W = SIZE, O = LEGACY_OFFSET, L = LEGACY_SIZE;
  const terrain = gen.terrain;
  const road = new Uint8Array(N);
  for (let z = 0; z < L; z++) {
    for (let x = 0; x < L; x++) {
      const j = z * L + x, i = (z + O) * W + (x + O);
      terrain[i] = oldTerrain[j];
      road[i] = oldRoad ? oldRoad[j] : 0;
    }
  }
  // prolongement de l'eau qui touchait le bord de l'ancienne carte
  const wet = (t) => t === T.WATER || t === T.DEEP;
  const extend = (sx, sz, dx, dz, t) => {
    let x = sx, z = sz, wob = 0;
    for (let k = 1; k <= O + 2; k++) {
      x += dx;
      z += dz;
      wob += (hash2(x, z, seed + 41) - 0.5) * 0.5;
      const ox = dz ? Math.round(wob) : 0, oz = dx ? Math.round(wob) : 0;
      const nx = x + ox, nz = z + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) break;
      const i = nz * W + nx;
      if (terrain[i] === T.MOUNTAIN) break;
      terrain[i] = t === T.DEEP ? T.DEEP : T.WATER;
    }
  };
  for (let k = 0; k < L; k++) {
    const sides = [[k, 0, 0, -1], [k, L - 1, 0, 1], [0, k, -1, 0], [L - 1, k, 1, 0]];
    for (const [x, z, dx, dz] of sides) {
      const t = oldTerrain[z * L + x];
      if (wet(t)) extend(x + O, z + O, dx, dz, t);
    }
  }
  computeMountainHeights(terrain, gen.height, seed, gen.field);
  gen.road = road;
  return gen;
}

function neighborCount(terrain, x, z, type) {
  let n = 0;
  if (x > 0 && terrain[z * SIZE + x - 1] === type) n++;
  if (x < SIZE - 1 && terrain[z * SIZE + x + 1] === type) n++;
  if (z > 0 && terrain[(z - 1) * SIZE + x] === type) n++;
  if (z < SIZE - 1 && terrain[(z + 1) * SIZE + x] === type) n++;
  return n;
}

function stamp(terrain, cx, cz, r, type, filter) {
  for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d > r) continue;
      const i = z * SIZE + x;
      if (terrain[i] !== T.GRASS) continue;
      if (filter && !filter(i, x, z)) continue;
      terrain[i] = type;
    }
  }
}

/** Distance (en cases) de chaque case de montagne au bord du massif. */
function mountainSteps(terrain) {
  const steps = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== T.MOUNTAIN) continue;
    const x = i % SIZE, z = (i / SIZE) | 0;
    let border = false;
    const nb = [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]];
    for (const [nx, nz] of nb) {
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      if (terrain[nz * SIZE + nx] !== T.MOUNTAIN) border = true;
    }
    if (border) {
      steps[i] = 1;
      queue[qt++] = i;
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % SIZE, z = (i / SIZE) | 0;
    const nb = [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]];
    for (const [nx, nz] of nb) {
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const j = nz * SIZE + nx;
      if (terrain[j] === T.MOUNTAIN && steps[j] === 0) {
        steps[j] = steps[i] + 1;
        queue[qt++] = j;
      }
    }
  }
  // Montagnes collées au bord de la carte sans bord intérieur
  for (let i = 0; i < N; i++) if (terrain[i] === T.MOUNTAIN && steps[i] === 0) steps[i] = 4;
  return steps;
}
