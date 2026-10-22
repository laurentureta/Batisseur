// Terrain : sol de la carte et du paysage qui l'entoure (couronne de cases, puis relief lointain),
// eau animée (rivières qui coulent, lacs, mer, glace l'hiver).
// Le sol est découpé en morceaux de 30 x 30 cases : on ne reconstruit que ce qui change.
import * as THREE from 'three';
import { SIZE, T, ZONE, ZONES } from '../world/constants.js';
import { RING, FAR, FAR_STEP } from '../world/landscape.js';
import { hexToLin } from './geom.js';
import { waterMaterial, WATER_UNIFORMS } from './shaders.js';
import { valueNoise, hash2 } from '../core/rng.js';

const HALF = SIZE / 2;
const W = SIZE + 2 * RING; // côté de la grille carte + couronne
const CH = 30; // côté d'un morceau (en cases)
const NCH = Math.ceil(W / CH);
const SKIRT_Y = -1.6;
const WATER_Y = -0.075;

export function topY(world, i) {
  const t = world.terrain[i];
  if (t === T.WATER) return -0.24;
  if (t === T.DEEP) return -0.42;
  if (t === T.MOUNTAIN) return world.height[i];
  return 0;
}

/* ───────── Couleurs (espace linéaire) ───────── */
const L = (hex) => hexToLin(hex);
const P = {
  grassA: L(0xa2c44c), grassB: L(0x87b343), grassC: L(0xb3cf5c), grassDry: L(0xbdb85a), grassDeep: L(0x79a83d),
  forest: L(0x6a963a), forestB: L(0x7ba23f),
  rock: L(0xafab98), rockB: L(0x9c998b),
  sand: L(0xead5a1), sandB: L(0xdcc38c),
  bed: L(0xd4c290), deepBed: L(0x86a0aa),
  mLow: L(0x8fae4a), mMid: L(0xa49b89), mHigh: L(0xbcb4a6), snow: L(0xf2f5f8), alp: L(0x86a845), rockFace: L(0x8f877a),
  soil: L(0x9a5f40), soilDark: L(0x6e432b), turf: L(0x7f9f3a),
  autumnGrass: L(0xbfa64a), autumnForest: L(0xa47a36), springGrass: L(0x9bdc6a),
  farForest: L(0x4d7d35), farForestB: L(0x5b8a3a),
  shallow: L(0x5cc3e8), deep: L(0x2f86c2), sea: L(0x2873b0),
  ice: L(0xd3e9f3), iceB: L(0xbcd9ea),
};

function mixInto(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function setC(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function mulC(out, f) {
  out[0] *= f;
  out[1] *= f;
  out[2] *= f;
  return out;
}
/** Hors de chez soi (zone verrouillée, paysage) : couleurs un peu éteintes. */
function dimC(out) {
  const l = 0.3 * out[0] + 0.59 * out[1] + 0.11 * out[2];
  out[0] = (out[0] * 0.74 + l * 0.26) * 0.64;
  out[1] = (out[1] * 0.74 + l * 0.26) * 0.64;
  out[2] = (out[2] * 0.74 + l * 0.26) * 0.68;
  return out;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ───────── Petit constructeur de géométrie (couleurs par sommet) ───────── */
class Buf {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.extra = null;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  }
  /** Quadrilatère a, b, c, d (sens anti-horaire vu de dehors), une couleur par coin. */
  quad(a, b, c, d, ca, cb, cc, cd) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, cb, cc);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cc, cd);
  }
  get count() {
    return this.pos.length / 3;
  }
  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.extra) geo.setAttribute(this.extra.name, new THREE.Float32BufferAttribute(this.extra.data, this.extra.size));
    geo.computeBoundingSphere();
    return geo;
  }
}

export class TerrainView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.farMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.waterMat = waterMaterial();
    this.iceMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.chunks = [];
    this.water = [];
    this.far = null;
    this.season = 1;
    this.tmp = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.sideA = [0, 0, 0];
    this.sideB = [0, 0, 0];
    this.rockTmp = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.facetTmp = [0, 0, 0];
    this.dimFacet = false;
  }

  build(world, ring, season) {
    this.dispose();
    this.world = world;
    this.ring = ring;
    this.season = season;
    const seed = world.state.seed | 0;
    this.nA = valueNoise(seed ^ 0x2545f491);
    this.nB = valueNoise(seed ^ 0x6c8e9cf5);
    for (let cz = 0; cz < NCH; cz++) {
      for (let cx = 0; cx < NCH; cx++) {
        const x0 = cx * CH - RING, z0 = cz * CH - RING;
        this.chunks.push({ x0, z0, x1: Math.min(x0 + CH, SIZE + RING), z1: Math.min(z0 + CH, SIZE + RING), mesh: null });
      }
    }
    for (const c of this.chunks) this.buildChunk(c);
    this.buildWater();
    this.buildFar();
  }

  dispose() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.geometry?.dispose();
    }
    this.chunks = [];
    this.water = [];
    this.far = null;
  }

  /* ───────── Lecture du terrain (carte + couronne) ───────── */
  inMap(x, z) {
    return x >= 0 && z >= 0 && x < SIZE && z < SIZE;
  }
  inDomain(x, z) {
    return x >= -RING && z >= -RING && x < SIZE + RING && z < SIZE + RING;
  }
  /** Type de terrain d'une case (carte ou couronne), -1 hors du domaine. */
  tAt(x, z) {
    if (this.inMap(x, z)) return this.world.terrain[z * SIZE + x];
    if (!this.inDomain(x, z) || !this.ring?.ok) return -1;
    return this.ring.terrain[(z + RING) * this.ring.W + (x + RING)];
  }
  /** Hauteur du dessus d'une case. */
  yAt(x, z) {
    if (this.inMap(x, z)) return topY(this.world, z * SIZE + x);
    if (!this.inDomain(x, z) || !this.ring?.ok) return SKIRT_Y;
    return this.ring.height[(z + RING) * this.ring.W + (x + RING)];
  }
  dimAt(x, z) {
    if (!this.inMap(x, z)) return true;
    return !this.world.state.zones[Math.floor(z / ZONE) * ZONES + Math.floor(x / ZONE)];
  }

  /** Couleur du sol à un point (wx, wz en cases), pour un type de terrain donné. */
  groundColor(out, t, h, wx, wz, far = false) {
    const n1 = this.nA(wx * 0.075 + 0.5, wz * 0.075 + 0.5);
    const n2 = this.nB(wx * 0.27 + 0.5, wz * 0.27 + 0.5);
    const s = this.season;
    switch (t) {
      case T.GRASS: {
        const n0 = this.nA(wx * 0.021 + 7.3, wz * 0.021 + 1.1); // grandes nappes de prairie
        mixInto(out, P.grassB, P.grassA, smooth(0.15, 0.85, n1 * 0.6 + n0 * 0.4));
        if (n2 > 0.6) mixInto(out, out, P.grassC, (n2 - 0.6) * 1.4);
        if (n1 < 0.3) mixInto(out, out, P.grassDeep, (0.3 - n1) * 1.6);
        if (n1 > 0.72 && n2 < 0.4) mixInto(out, out, P.grassDry, (n1 - 0.72) * 2);
        if (n0 > 0.66) mixInto(out, out, P.grassC, (n0 - 0.66) * 0.9);
        else if (n0 < 0.3) mixInto(out, out, P.grassDeep, (0.3 - n0) * 0.8);
        if (s === 2) mixInto(out, out, P.autumnGrass, 0.36);
        else if (s === 0) mixInto(out, out, P.springGrass, 0.18);
        else if (s === 3) mixInto(out, out, P.snow, 0.82);
        break;
      }
      case T.FOREST:
        if (far) mixInto(out, P.farForest, P.farForestB, n2);
        else mixInto(out, P.forest, P.forestB, n2 * 0.7 + n1 * 0.3);
        if (s === 2) mixInto(out, out, P.autumnForest, far ? 0.5 : 0.34);
        else if (s === 3) mixInto(out, out, P.snow, far ? 0.62 : 0.8);
        break;
      case T.ROCK:
        mixInto(out, P.rockB, P.rock, n2);
        if (s === 3) mixInto(out, out, P.snow, 0.55);
        break;
      case T.SAND:
        mixInto(out, P.sandB, P.sand, n1 * 0.5 + n2 * 0.5);
        if (s === 3) mixInto(out, out, P.snow, 0.35);
        break;
      case T.WATER:
        setC(out, P.bed);
        break;
      case T.DEEP:
        setC(out, P.deepBed);
        break;
      default: {
        // montagne : herbe au pied, roche, puis neige au sommet (même étagement partout)
        const hh = h + (n2 - 0.5) * (far ? 0.9 : 0.6) - (far ? 2.2 : 0);
        if (hh > 3.0) setC(out, P.snow);
        else if (hh > 2.0) mixInto(out, P.mHigh, P.snow, smooth(2.55, 3.0, hh) * 0.75);
        else if (hh > 1.25) mixInto(out, P.mMid, P.mHigh, smooth(1.6, 2.0, hh));
        else mixInto(out, P.mLow, P.mMid, smooth(0.8, 1.25, hh));
        if (s === 3) mixInto(out, out, P.snow, 0.7);
        mulC(out, 0.94 + n1 * 0.12);
      }
    }
    return out;
  }

  /* ───────── Sol d'un morceau ───────── */
  chunkOf(x, z) {
    const cx = Math.floor((x + RING) / CH), cz = Math.floor((z + RING) / CH);
    if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return null;
    return this.chunks[cz * NCH + cx];
  }

  buildChunk(c) {
    if (c.mesh) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    const g = new Buf();
    const [c0, c1, c2, c3] = this.tmp;
    for (let z = c.z0; z < c.z1; z++) {
      for (let x = c.x0; x < c.x1; x++) {
        const t = this.tAt(x, z);
        if (t < 0 || t === 255) continue;
        const y = this.yAt(x, z);
        const dim = this.dimAt(x, z);
        if (t === T.MOUNTAIN) {
          this.mountainTile(g, x, z, y, dim);
          continue;
        }
        // le sol suit un dégradé continu (taches d'herbe plus claires, plus sombres, sèches)
        this.groundColor(c0, t, y, x, z + 1);
        this.groundColor(c1, t, y, x + 1, z + 1);
        this.groundColor(c2, t, y, x + 1, z);
        this.groundColor(c3, t, y, x, z);
        // une très légère variation par case garde la grille lisible
        const j = 0.985 + hash2(x, z, 9091) * 0.03;
        for (const cc of this.tmp) {
          mulC(cc, j);
          if (dim) dimC(cc);
        }
        const x0 = x - HALF, x1 = x0 + 1, z0 = z - HALF, z1 = z0 + 1;
        g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c0, c1, c2, c3);
        // côtés vers les voisines plus basses
        this.side(g, x, z - 1, y, t, dim, c0, [x1, z0], [x0, z0]); // nord
        this.side(g, x, z + 1, y, t, dim, c0, [x0, z1], [x1, z1]); // sud
        this.side(g, x - 1, z, y, t, dim, c0, [x0, z0], [x0, z1]); // ouest
        this.side(g, x + 1, z, y, t, dim, c0, [x1, z1], [x1, z0]); // est
      }
    }
    if (!g.count) return;
    c.mesh = new THREE.Mesh(g.geometry(), this.landMat);
    c.mesh.receiveShadow = true;
    c.mesh.castShadow = true;
    this.group.add(c.mesh);
  }

  /**
   * Hauteur d'un coin de case (cx, cz entiers) : au niveau du sol dès qu'il touche une case plate,
   * sinon la moyenne des montagnes qui l'entourent. Les montagnes deviennent des pentes continues.
   */
  cornerH(cx, cz) {
    let sum = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      const tx = cx - 1 + (k & 1), tz = cz - 1 + (k >> 1);
      const t = this.tAt(tx, tz);
      if (t < 0 || t === 255) continue;
      if (t !== T.MOUNTAIN) return 0;
      sum += this.yAt(tx, tz);
      n++;
    }
    return n ? sum / n : 0;
  }

  /** Une case de montagne : quatre facettes autour d'un sommet central. */
  mountainTile(g, x, z, y, dim) {
    const x0 = x - HALF, x1 = x0 + 1, z0 = z - HALF, z1 = z0 + 1, xm = x0 + 0.5, zm = z0 + 0.5;
    const hA = this.cornerH(x, z + 1), hB = this.cornerH(x + 1, z + 1), hC = this.cornerH(x + 1, z), hD = this.cornerH(x, z);
    // sommet de la case : sa propre hauteur (une case isolée devient un petit pic)
    const yc = y;
    const A = [x0, hA, z1], B = [x1, hB, z1], Cc = [x1, hC, z0], D = [x0, hD, z0], M = [xm, yc, zm];
    const cA = this.tmp[0], cB = this.tmp[1], cC = this.tmp[2], cD = this.tmp[3], cM = this.sideB;
    this.mountainColor(cA, hA, x, z + 1, dim);
    this.mountainColor(cB, hB, x + 1, z + 1, dim);
    this.mountainColor(cC, hC, x + 1, z, dim);
    this.mountainColor(cD, hD, x, z, dim);
    this.mountainColor(cM, yc, xm + HALF, zm + HALF, dim);
    this.dimFacet = dim;
    this.facet(g, A, B, M, cA, cB, cM);
    this.facet(g, B, Cc, M, cB, cC, cM);
    this.facet(g, Cc, D, M, cC, cD, cM);
    this.facet(g, D, A, M, cD, cA, cM);
    // berges (eau) et bord du paysage : faces verticales sous les coins
    const sides = [[x, z - 1, Cc, D], [x, z + 1, A, B], [x - 1, z, D, A], [x + 1, z, B, Cc]];
    for (const [nx, nz, a, b] of sides) {
      const edge = !this.inDomain(nx, nz) || this.tAt(nx, nz) === 255;
      const ny = edge ? SKIRT_Y : this.yAt(nx, nz);
      if (ny >= Math.min(a[1], b[1]) - 0.001) continue;
      const col = this.sideA;
      setC(col, P.mMid);
      mulC(col, 0.7);
      if (dim) dimC(col);
      g.quad([a[0], ny, a[2]], [b[0], ny, b[2]], b, a, col, col, col, col);
    }
  }

  /** Couleur d'un point de montagne (étagement + bruit). */
  mountainColor(out, h, wx, wz, dim) {
    this.groundColor(out, T.MOUNTAIN, h, wx, wz);
    if (dim) dimC(out);
    return out;
  }

  /** Triangle de relief : les pentes raides prennent la couleur de la roche. */
  facet(g, a, b, c, ca, cb, cc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const up = ny / (Math.hypot(nx, ny, nz) || 1);
    const k = smooth(0.8, 0.45, up) * 0.65; // pente raide : roche nue
    const hm = (a[1] + b[1] + c[1]) / 3;
    const alp = this.season === 3 ? 0 : smooth(0.88, 0.97, up) * smooth(2.3, 1.6, hm) * 0.55; // replat : prairie
    if (k > 0.001 || alp > 0.001) {
      const r = this.rockTmp;
      const dimmed = this.dimFacet;
      const target = this.facetTmp;
      for (let j = 0; j < 3; j++) {
        const src = j === 0 ? ca : j === 1 ? cb : cc;
        setC(r[j], src);
        if (k > 0.001) {
          setC(target, P.rockFace);
          if (dimmed) dimC(target);
          mixInto(r[j], r[j], target, k);
        }
        if (alp > 0.001) {
          setC(target, P.alp);
          if (dimmed) dimC(target);
          mixInto(r[j], r[j], target, alp);
        }
      }
      g.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], r[0], r[1], r[2]);
    } else g.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, cb, cc);
  }

  /** Hauteur du sol à un point de la scène (pour poser arbres et rochers sur les pentes). */
  surfaceAt(px, pz) {
    const fx = px + HALF, fz = pz + HALF;
    const x = Math.floor(fx), z = Math.floor(fz);
    const t = this.tAt(x, z);
    if (t !== T.MOUNTAIN) return t < 0 || t === 255 ? 0 : this.yAt(x, z);
    const u = fx - x, v = fz - z; // position dans la case (0..1)
    const hA = this.cornerH(x, z + 1), hB = this.cornerH(x + 1, z + 1), hC = this.cornerH(x + 1, z), hD = this.cornerH(x, z);
    const yc = this.yAt(x, z);
    // facette qui contient le point : interpolation entre le sommet et deux coins
    const du = u - 0.5, dv = v - 0.5;
    let p, q, hp, hq;
    if (Math.abs(dv) >= Math.abs(du)) {
      if (dv > 0) [p, q, hp, hq] = [[0, 1], [1, 1], hA, hB];
      else [p, q, hp, hq] = [[1, 0], [0, 0], hC, hD];
    } else if (du > 0) [p, q, hp, hq] = [[1, 1], [1, 0], hB, hC];
    else [p, q, hp, hq] = [[0, 0], [0, 1], hD, hA];
    // barycentriques dans le triangle (p, q, centre)
    const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = 0.5, y3 = 0.5;
    const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / det;
    const l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / det;
    return l1 * hp + l2 * hq + (1 - l1 - l2) * yc;
  }

  /** Face verticale entre une case et sa voisine plus basse (ou le bord du paysage). */
  side(g, nx, nz, y, t, dim, topCol, a, b) {
    const edge = !this.inDomain(nx, nz) || this.tAt(nx, nz) === 255;
    const ny = edge ? SKIRT_Y : this.yAt(nx, nz);
    if (ny >= y - 0.001) return;
    const q = (y0, y1, col) => g.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col, col, col, col);
    const sa = this.sideA, sb = this.sideB;
    if (t === T.MOUNTAIN) {
      setC(sa, topCol);
      mulC(sa, 0.74);
      const mid = Math.max(ny, 0);
      if (y > mid) q(mid, y, sa);
      if (mid > ny) {
        setC(sb, P.soil);
        if (dim) dimC(sb);
        q(ny, mid, sb);
      }
      return;
    }
    if (t === T.WATER || t === T.DEEP) {
      setC(sa, t === T.WATER ? P.bed : P.deepBed);
      mulC(sa, 0.82);
      if (dim) dimC(sa);
      q(ny, y, sa);
      return;
    }
    // berge : un liseré d'herbe puis la terre
    setC(sa, t === T.SAND ? P.sandB : P.turf);
    if (t !== T.SAND && this.season === 3) mixInto(sa, sa, P.snow, 0.7);
    mulC(sa, 0.86);
    if (dim) dimC(sa);
    const band = Math.min(0.07, (y - ny) * 0.4);
    q(y - band, y, sa);
    setC(sb, t === T.SAND ? P.sandB : P.soil);
    if (t === T.SAND) mulC(sb, 0.8);
    if (dim) dimC(sb);
    if (y - band - ny > 0.45) {
      q(y - band - 0.4, y - band, sb);
      setC(sa, P.soilDark);
      if (dim) dimC(sa);
      q(ny, y - band - 0.4, sa);
    } else q(ny, y - band, sb);
  }

  /** Cases modifiées (défrichage, plantation) : on refait les morceaux concernés. */
  markTiles(tiles) {
    const set = new Set();
    for (const i of tiles) {
      const x = i % SIZE, z = (i / SIZE) | 0;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = this.chunkOf(x + dx, z + dz);
        if (c) set.add(c);
      }
    }
    for (const c of set) this.buildChunk(c);
  }

  /** Zone débloquée : ses couleurs s'allument. */
  markZone(zi) {
    const zx = (zi % ZONES) * ZONE, zz = Math.floor(zi / ZONES) * ZONE;
    for (const c of this.chunks) if (zx < c.x1 && zx + ZONE > c.x0 && zz < c.z1 && zz + ZONE > c.z0) this.buildChunk(c);
  }

  rebuildAll(season) {
    this.season = season;
    for (const c of this.chunks) this.buildChunk(c);
    this.buildWater();
    this.buildFar();
  }

  /* ───────── Eau de la carte et de la couronne ───────── */
  buildWater() {
    for (const m of this.water) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.water = [];
    const winter = this.season === 3;
    // distance à la terre (en cases), pour l'écume des rives et la couleur du fond
    const D = new Uint8Array(W * W).fill(255);
    const q = [];
    for (let z = -RING; z < SIZE + RING; z++) {
      for (let x = -RING; x < SIZE + RING; x++) {
        const t = this.tAt(x, z);
        if (t !== T.WATER && t !== T.DEEP) {
          D[(z + RING) * W + (x + RING)] = 0;
          q.push((z + RING) * W + (x + RING));
        }
      }
    }
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      const d = D[k];
      if (d >= 4) continue;
      const kx = k % W, kz = (k / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx, nz = kz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
          const nk = nz * W + nx;
          if (D[nk] > d + 1) {
            D[nk] = d + 1;
            q.push(nk);
          }
        }
      }
    }
    const dOf = (x, z, fallback) => {
      const gx = x + RING, gz = z + RING;
      if (gx < 0 || gz < 0 || gx >= W || gz >= W) return fallback;
      const v = D[gz * W + gx];
      return v === 255 ? 4 : v;
    };
    const liquid = new Buf();
    const ice = new Buf();
    const aw = [];
    const col = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const flow = [0, 0, 0];
    for (let z = -RING; z < SIZE + RING; z++) {
      for (let x = -RING; x < SIZE + RING; x++) {
        const t = this.tAt(x, z);
        if (t !== T.WATER && t !== T.DEEP) continue;
        const x0 = x - HALF, x1 = x0 + 1, z0 = z - HALF, z1 = z0 + 1;
        const self = dOf(x, z, 4);
        if (winter && t === T.WATER) {
          const n = this.nB(x * 0.4, z * 0.4);
          for (let k = 0; k < 4; k++) {
            mixInto(col[k], P.iceB, P.ice, clamp01(n + (k & 1) * 0.08));
            if (this.dimAt(x, z)) dimC(col[k]);
          }
          ice.quad([x0, -0.06, z1], [x1, -0.06, z1], [x1, -0.06, z0], [x0, -0.06, z0], col[0], col[1], col[2], col[3]);
          continue;
        }
        // profondeur aux 4 coins (moyenne des cases qui touchent le coin)
        const corner = (cx, cz) => (dOf(cx - 1, cz - 1, self) + dOf(cx, cz - 1, self) + dOf(cx - 1, cz, self) + dOf(cx, cz, self)) / 4;
        const dc = [corner(x, z + 1), corner(x + 1, z + 1), corner(x + 1, z), corner(x, z)];
        this.flowAt(x + 0.5, z + 0.5, t, flow);
        const deepCol = t === T.DEEP ? P.sea : P.deep;
        for (let k = 0; k < 4; k++) {
          const dn = clamp01(dc[k] / 3);
          mixInto(col[k], P.shallow, deepCol, smooth(0.1, 1, dn));
          aw.push(dn, flow[0], flow[1], flow[2]);
        }
        // les sommets d'un quad : a, b, c puis a, c, d → on recopie l'attribut dans cet ordre
        const n = aw.length;
        const A = aw.slice(n - 16, n - 12), B = aw.slice(n - 12, n - 8), Cc = aw.slice(n - 8, n - 4), Dd = aw.slice(n - 4, n);
        aw.length = n - 16;
        aw.push(...A, ...B, ...Cc, ...A, ...Cc, ...Dd);
        liquid.quad([x0, WATER_Y, z1], [x1, WATER_Y, z1], [x1, WATER_Y, z0], [x0, WATER_Y, z0], col[0], col[1], col[2], col[3]);
      }
    }
    if (liquid.count) {
      liquid.extra = { name: 'aWater', data: aw, size: 4 };
      const m = new THREE.Mesh(liquid.geometry(), this.waterMat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.group.add(m);
      this.water.push(m);
    }
    if (ice.count) {
      const m = new THREE.Mesh(ice.geometry(), this.iceMat);
      m.receiveShadow = true;
      this.group.add(m);
      this.water.push(m);
    }
  }

  /** Courant : [vitesse, dirX, dirZ] (rivières seulement ; la mer ondule doucement). */
  flowAt(x, z, t, out) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    const F = this.world.field;
    if (!F) return out;
    if (t === T.DEEP && F.preset === 'cote') {
      out[0] = 0.25;
      out[1] = 0.6;
      out[2] = 0.8;
      return out;
    }
    let best = 2.2, br = null;
    for (const r of F.rivers) {
      const along = r.dir === 'ns' ? z : x;
      const across = r.dir === 'ns' ? x : z;
      const lo = typeof r.from === 'function' ? r.from() : r.from;
      const hi = typeof r.to === 'function' ? r.to() : r.to;
      if (along < lo - 1 || along > hi + 1) continue;
      const d = Math.abs(across - F.riverCenter(r, along)) - F.riverHalfWidth(r, along);
      if (d < best) {
        best = d;
        br = r;
      }
    }
    if (!br) return out;
    const along = br.dir === 'ns' ? z : x;
    const slope = (F.riverCenter(br, along + 0.5) - F.riverCenter(br, along - 0.5));
    const sign = br.dir === 'ns' ? 1 : typeof br.from === 'number' && Number.isFinite(br.from) ? -1 : 1;
    let dx, dz;
    if (br.dir === 'ns') {
      dx = slope;
      dz = 1;
    } else {
      dx = 1;
      dz = slope;
    }
    const l = Math.hypot(dx, dz) || 1;
    out[0] = 1;
    out[1] = (dx / l) * sign;
    out[2] = (dz / l) * sign;
    return out;
  }

  /* ───────── Relief lointain (collines, montagnes à l'horizon, mer) ───────── */
  buildFar() {
    if (this.far) {
      for (const m of this.far) {
        this.group.remove(m);
        m.geometry.dispose();
      }
    }
    this.far = [];
    const F = this.world.field;
    if (!F || !this.ring?.ok) return;
    const S = FAR_STEP;
    const lo = -RING - FAR, hi = SIZE + RING + FAR;
    const n = Math.round((hi - lo) / S) + 1;
    const H = new Float32Array(n * n);
    const TT = new Int8Array(n * n);
    const ringLo = -RING, ringHi = SIZE + RING;
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const wx = lo + gx * S, wz = lo + gz * S;
        const d = Math.max(ringLo - wx, wx - ringHi, ringLo - wz, wz - ringHi, 0);
        const o = F.outer(wx, wz);
        let h = o.t === T.WATER || o.t === T.DEEP ? -0.5 : o.h;
        let t = o.t;
        // les rivières se prolongent jusqu'à l'horizon
        const rd = F.riverDist(wx, wz);
        if (rd < 4 && t !== T.MOUNTAIN) {
          h = Math.min(h, -0.5 + smooth(-1, 4, rd) * (h + 0.5));
          if (rd < 1.5) t = T.WATER;
        }
        if (t === T.FOREST) h += 0.45; // la masse des arbres, vue de loin
        // raccord avec le bord de la couronne (même hauteur que les coins des cases du bord)
        const cx = Math.min(Math.max(wx, ringLo), ringHi), cz = Math.min(Math.max(wz, ringLo), ringHi);
        const tb = this.tAt(Math.min(cx, ringHi - 1), Math.min(cz, ringHi - 1));
        const hb = tb === T.MOUNTAIN ? this.cornerH(cx, cz) : tb === T.WATER || tb === T.DEEP ? -0.3 : 0;
        const k = smooth(0, 14, d);
        H[gz * n + gx] = hb * (1 - k) + h * k;
        TT[gz * n + gx] = t;
      }
    }
    const g = new Buf();
    const wat = new Buf();
    const ice = new Buf();
    const aw = [];
    const winter = this.season === 3;
    const cols = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const wcol = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const vcol = (out, gx, gz) => {
      const k = gz * n + gx;
      const wx = lo + gx * S, wz = lo + gz * S;
      let t = TT[k];
      if (t === T.WATER || t === T.DEEP) t = H[k] > -0.1 ? T.SAND : t;
      this.groundColor(out, t, H[k], wx, wz, true);
      dimC(out);
      // plus loin, plus pâle (perspective aérienne légère)
      const d = Math.max(ringLo - wx, wx - ringHi, ringLo - wz, wz - ringHi, 0);
      mulC(out, 1 - smooth(10, FAR, d) * 0.12);
      return out;
    };
    for (let gz = 0; gz < n - 1; gz++) {
      for (let gx = 0; gx < n - 1; gx++) {
        const wx = lo + gx * S, wz = lo + gz * S;
        if (wx >= ringLo && wx + S <= ringHi && wz >= ringLo && wz + S <= ringHi) continue; // trou : carte + couronne
        const i00 = gz * n + gx, i10 = i00 + 1, i01 = i00 + n, i11 = i01 + 1;
        const px0 = wx - HALF, px1 = px0 + S, pz0 = wz - HALF, pz1 = pz0 + S;
        vcol(cols[0], gx, gz + 1);
        vcol(cols[1], gx + 1, gz + 1);
        vcol(cols[2], gx + 1, gz);
        vcol(cols[3], gx, gz);
        g.quad([px0, H[i01], pz1], [px1, H[i11], pz1], [px1, H[i10], pz0], [px0, H[i00], pz0], cols[0], cols[1], cols[2], cols[3]);
        // eau sous le relief (mer, lacs, rivières lointaines)
        const minH = Math.min(H[i00], H[i10], H[i01], H[i11]);
        if (minH < WATER_Y + 0.02) {
          const frozen = winter && TT[i00] !== T.DEEP && TT[i10] !== T.DEEP && TT[i01] !== T.DEEP && TT[i11] !== T.DEEP;
          const ids = [i01, i11, i10, i00];
          if (frozen) {
            for (let k = 0; k < 4; k++) {
              setC(wcol[k], P.ice);
              dimC(wcol[k]);
            }
            ice.quad([px0, -0.06, pz1], [px1, -0.06, pz1], [px1, -0.06, pz0], [px0, -0.06, pz0], wcol[0], wcol[1], wcol[2], wcol[3]);
          } else {
            const dn = ids.map((id) => 0.4 + 0.6 * clamp01((WATER_Y - H[id]) / 0.4));
            for (let k = 0; k < 4; k++) {
              mixInto(wcol[k], P.shallow, P.sea, smooth(0, 1, dn[k]));
              mulC(wcol[k], 0.86);
            }
            const v = (k) => [dn[k], 0.2, 0.6, 0.8];
            aw.push(...v(0), ...v(1), ...v(2), ...v(0), ...v(2), ...v(3));
            wat.quad([px0, WATER_Y, pz1], [px1, WATER_Y, pz1], [px1, WATER_Y, pz0], [px0, WATER_Y, pz0], wcol[0], wcol[1], wcol[2], wcol[3]);
          }
        }
      }
    }
    const add = (buf, mat, order = 0) => {
      if (!buf.count) return;
      const m = new THREE.Mesh(buf.geometry(), mat);
      m.renderOrder = order;
      this.group.add(m);
      this.far.push(m);
    };
    add(g, this.farMat);
    if (wat.count) wat.extra = { name: 'aWater', data: aw, size: 4 };
    add(wat, this.waterMat, 1);
    add(ice, this.iceMat);
  }

  update(dt) {
    WATER_UNIFORMS.uTime.value += dt;
  }
}

export function toGeometry(layer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(layer.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(layer.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(layer.col, 3));
  geo.computeBoundingSphere();
  return geo;
}
