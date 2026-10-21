// Génération procédurale de la carte selon le terrain choisi (vallée, côte, montagnes).
import { SIZE, N, T } from './constants.js';
import { mulberry32, valueNoise, fbm, hash2 } from '../core/rng.js';

const C = (SIZE - 1) / 2; // centre de la carte (24,5)

export function generateMap(seed, preset = 'vallee') {
  const W = SIZE;
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const nE = valueNoise((seed ^ 0x9e3779b9) | 0);
  const nM = valueNoise((seed ^ 0x85ebca6b) | 0);
  const nD = valueNoise((seed ^ 0xc2b2ae35) | 0);

  const terrain = new Uint8Array(N);
  const height = new Float32Array(N);
  const variant = new Uint8Array(N);
  const elev = new Float32Array(N);
  const moist = new Float32Array(N);
  const score = new Float32Array(N);

  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      elev[i] = fbm(nE, x * 0.07, z * 0.07, 4);
      moist[i] = fbm(nM, x * 0.09 + 31.7, z * 0.09 + 11.3, 3);
      variant[i] = Math.floor(hash2(x, z, seed) * 256);
    }
  }

  const dist = (x, z) => Math.hypot(x - C, z - C);
  const edge = (x, z) => Math.max(Math.abs(x - C), Math.abs(z - C)) / C;
  const h01 = (x, z, s) => hash2(x, z, seed + s);

  let mountainThr = 0.95;
  let forestThr = 0.54;
  let riverSide = rng() < 0.5 ? -1 : 1;

  if (preset === 'cote') {
    // Mer à l'est
    const ph = rng() * 6.28;
    mountainThr = 1.0;
    forestThr = 0.56;
    for (let z = 0; z < W; z++) {
      const coast = W * 0.7 + 3 * Math.sin(z * 0.13 + ph) + (nD(z * 0.1, 5.1) - 0.5) * 7;
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        score[i] = elev[i] + Math.max(0, (1 - x / W) * (1 - z / W) - 0.35) * 1.5;
        if (x > coast + 2.5) terrain[i] = T.DEEP;
        else if (x > coast) terrain[i] = T.WATER;
        else if (x > coast - 1.8 - h01(x, z, 3) * 1.2) terrain[i] = T.SAND;
      }
    }
    // Petite rivière qui descend vers la mer
    const rz0 = C + riverSide * (11 + rng() * 3);
    const ph2 = rng() * 6.28;
    for (let x = 0; x < W; x++) {
      const rz = rz0 + 2.5 * Math.sin(x * 0.16 + ph2) + (nD(x * 0.12, 9.9) - 0.5) * 3;
      for (let z = 0; z < W; z++) {
        const i = z * W + x;
        if (terrain[i] === T.DEEP || terrain[i] === T.WATER) continue;
        const dd = Math.abs(z - rz);
        if (dd < 0.95) terrain[i] = T.WATER;
        else if (dd < 1.9 && h01(x, z, 4) < 0.4 && terrain[i] === T.GRASS) terrain[i] = T.SAND;
      }
    }
  } else if (preset === 'montagne') {
    mountainThr = 0.95;
    forestThr = 0.5;
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        score[i] = elev[i] * 0.9 + Math.max(0, 0.55 - z / W) * 1.2 + Math.max(0, 0.45 - x / W) * 0.8;
        if (elev[i] < 0.33 && dist(x, z) > 12 && score[i] < mountainThr) terrain[i] = T.WATER; // lacs
      }
    }
  } else {
    // Vallée : rivière nord-sud
    const base = C + riverSide * (12 + rng() * 3);
    const ph = rng() * 6.28;
    for (let z = 0; z < W; z++) {
      const rx = base + 3.5 * Math.sin(z * 0.17 + ph) + (nD(z * 0.12, 3.3) - 0.5) * 5;
      const w = 1.1 + 0.4 * nD(z * 0.2, 7.7);
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        score[i] = elev[i] + Math.max(0, edge(x, z) - 0.72) * 1.5;
        const dd = Math.abs(x - rx);
        if (dd < w) terrain[i] = T.WATER;
        else if (dd < w + 1.1 && h01(x, z, 5) < 0.45) terrain[i] = T.SAND;
      }
    }
    // Un lac dans un coin éloigné
    const corners = [[8, 8], [41, 8], [8, 41], [41, 41]];
    const [lx, lz] = corners[Math.floor(rng() * 4)];
    const lr = 2.4 + rng() * 1.2;
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - lx, z - lz) + (nD(x * 0.4, z * 0.4) - 0.5) * 1.4;
        const i = z * W + x;
        if (d < lr) terrain[i] = T.WATER;
        else if (d < lr + 1 && terrain[i] === T.GRASS) terrain[i] = T.SAND;
      }
    }
  }

  // Montagnes
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (terrain[i] === T.DEEP) continue;
      if (score[i] > mountainThr && dist(x, z) > 12) terrain[i] = T.MOUNTAIN;
    }
  }

  // Forêts et rochers
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (terrain[i] !== T.GRASS) continue;
      const rockChance = preset === 'montagne' ? 0.6 : preset === 'cote' ? 0.35 : 0.5;
      const rockThr = preset === 'montagne' ? 0.56 : 0.63;
      if (elev[i] > rockThr && score[i] < mountainThr && h01(x, z, 7) < rockChance) terrain[i] = T.ROCK;
      else if (moist[i] > forestThr) terrain[i] = T.FOREST;
    }
  }
  // Rochers au pied des montagnes
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (terrain[i] !== T.GRASS && terrain[i] !== T.FOREST) continue;
      if (neighborCount(terrain, x, z, T.MOUNTAIN) > 0 && h01(x, z, 8) < (preset === 'montagne' ? 0.55 : 0.4)) terrain[i] = T.ROCK;
    }
  }
  // Sable autour des lacs (montagne)
  if (preset === 'montagne') {
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (terrain[i] === T.GRASS && neighborCount(terrain, x, z, T.WATER) > 0 && h01(x, z, 9) < 0.55) terrain[i] = T.SAND;
      }
    }
  }

  // Zone de départ : le centre doit être constructible
  for (let z = 15; z < 35; z++) {
    for (let x = 15; x < 35; x++) {
      const i = z * W + x;
      const d = dist(x, z);
      if (d < 5.2) terrain[i] = T.GRASS;
      else if (x >= 20 && x < 30 && z >= 20 && z < 30) {
        if (terrain[i] === T.WATER || terrain[i] === T.DEEP || terrain[i] === T.MOUNTAIN) terrain[i] = T.GRASS;
      }
    }
  }

  // Garantir un peu de forêt et de rochers près du départ
  const countIn = (types) => {
    let n = 0;
    for (let z = 19; z < 31; z++) for (let x = 19; x < 31; x++) if (types.includes(terrain[z * W + x])) n++;
    return n;
  };
  const corners = [[21, 21], [28, 21], [21, 28], [28, 28]];
  // On évite le coin côté rivière/mer
  const sideX = preset === 'cote' ? -1 : -riverSide;
  const goodCorners = corners.filter(([x]) => (sideX < 0 ? x < 25 : x >= 25));
  const forestCorner = goodCorners[Math.floor(rng() * goodCorners.length)];
  const rockCorner = corners.find((c) => c !== forestCorner && (c[0] === forestCorner[0] || c[1] === forestCorner[1])) || corners[3];
  if (countIn([T.FOREST]) < 14) stamp(terrain, forestCorner[0], forestCorner[1], 2.4, T.FOREST, (i, x, z) => dist(x, z) >= 4.2);
  if (countIn([T.ROCK, T.MOUNTAIN]) < 6) stamp(terrain, rockCorner[0], rockCorner[1], 1.6, T.ROCK, (i, x, z) => dist(x, z) >= 4.2);

  // Hauteur des montagnes : elles montent vers l'intérieur du massif
  const steps = mountainSteps(terrain);
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== T.MOUNTAIN) continue;
    const x = i % W, z = (i / W) | 0;
    const jitter = (h01(x, z, 11) - 0.5) * 0.3;
    height[i] = Math.min(3.4, 0.55 + steps[i] * 0.42 + jitter);
    height[i] = Math.round(height[i] / 0.15) * 0.15;
  }

  return { terrain, height, variant };
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
