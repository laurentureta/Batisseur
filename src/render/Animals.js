// Les animaux du village. Chacun a plusieurs comportements (marcher, s'arrêter, picorer, brouter,
// se coucher la nuit…) et réagit à ce qui se passe autour de lui :
//  - les poules picorent dans leur enclos, accourent quand l'éleveuse lance le grain, s'écartent
//    quand quelqu'un passe tout près et rentrent au poulailler à la nuit ;
//  - les vaches broutent, vont au râtelier quand on apporte le foin, viennent se faire traire ;
//    les moutons restent groupés ;
//  - les chiens se promènent, suivent un passant un moment, s'assoient ; les chats font la sieste
//    devant les portes et filent quand un chien approche ;
//  - les canards nagent près des rives, les pigeons picorent sur les places et s'envolent quand on
//    s'approche, des volées d'oiseaux traversent le ciel, des papillons butinent les fleurs.
// Tout est dessiné en instances (quelques appels de dessin), et seuls les animaux proches de la
// caméra sont animés.
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { BUILDINGS } from '../data/buildings.js';
import { SIZE, T } from '../world/constants.js';
import { FARMS } from '../sim/jobs.js';
import { localToWorld } from '../sim/Villagers.js';
import { hash2 } from '../core/rng.js';
import { Q } from './creatures.js';

const HALF = SIZE / 2;

/** Tourne un os autour d'un axe du modèle (rotation locale modifiée, ses enfants suivent). */
function rotBone(r, i, ax, ay, az, ang) {
  const p = r.skel.parent[i];
  const pq = p >= 0 ? [r.wq[p * 4], r.wq[p * 4 + 1], r.wq[p * 4 + 2], r.wq[p * 4 + 3]] : [r.skel.rootQ[i * 4], r.skel.rootQ[i * 4 + 1], r.skel.rootQ[i * 4 + 2], r.skel.rootQ[i * 4 + 3]];
  const s = Math.sin(ang / 2), c = Math.cos(ang / 2);
  const t = [0, 0, 0, 1], u = [0, 0, 0, 1];
  Q.mul(t, 0, ax * s, ay * s, az * s, c, pq[0], pq[1], pq[2], pq[3]);
  Q.mul(u, 0, -pq[0], -pq[1], -pq[2], pq[3], t[0], t[1], t[2], t[3]);
  const l = r.lq, o = i * 4;
  Q.mul(t, 0, u[0], u[1], u[2], u[3], l[o], l[o + 1], l[o + 2], l[o + 3]);
  l[o] = t[0];
  l[o + 1] = t[1];
  l[o + 2] = t[2];
  l[o + 3] = t[3];
}
const W = 0xffffff;

function sphere(g, x, y, z, r, color, sy = 1, sx = 1, lon = 8, lat = 5) {
  const p = (i, j) => {
    const th = (j / lat) * Math.PI, ph = (i / lon) * Math.PI * 2;
    return [x + r * sx * Math.sin(th) * Math.sin(ph), y + r * Math.cos(th) * sy, z + r * Math.sin(th) * Math.cos(ph)];
  };
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (j === 0) g.tri(a, d, c, color);
      else if (j === lat - 1) g.tri(a, d, b, color);
      else g.quad(a, d, c, b, color);
    }
  }
}

/* ───────── Pièces des animaux (repère : avant vers +z) ───────── */
function buildParts() {
  const P = {};
  const add = (name, fn, opts = {}) => {
    const g = new GeoBuilder();
    fn(g);
    P[name] = { geo: toGeometry(g.body), ...opts };
  };
  // poule
  add('henBody', (g) => {
    sphere(g, 0, 0.04, -0.002, 0.026, W, 0.82, 0.78);
    sphere(g, 0, 0.044, -0.024, 0.02, W, 0.8, 0.72, 6, 4);
    // queue relevée
    g.tri([-0.009, 0.05, -0.03], [0.009, 0.05, -0.03], [0, 0.085, -0.05], W);
    g.tri([0.009, 0.05, -0.03], [-0.009, 0.05, -0.03], [0, 0.085, -0.05], W);
    g.tri([-0.009, 0.05, -0.03], [0, 0.085, -0.05], [0, 0.055, -0.052], W);
    g.tri([0.009, 0.05, -0.03], [0, 0.055, -0.052], [0, 0.085, -0.05], W);
    for (const s of [-1, 1]) sphere(g, s * 0.019, 0.042, -0.006, 0.015, W, 0.7, 0.55, 6, 4); // ailes
    g.box(0, 0.052, 0.016, 0.014, 0.026, 0.014, W); // cou
  }, { tint: true, n: 260 });
  add('henHead', (g) => {
    sphere(g, 0, 0.014, 0.008, 0.017, W, 1.0, 0.9, 7, 5);
    g.box(0, 0.032, 0.004, 0.006, 0.014, 0.022, 0xe53935); // crête
    g.box(0, 0.003, 0.02, 0.005, 0.012, 0.006, 0xe53935); // barbillon
    g.box(0, 0.013, 0.028, 0.009, 0.007, 0.014, 0xf2a521); // bec
    for (const s of [-1, 1]) g.box(s * 0.0135, 0.019, 0.016, 0.003, 0.005, 0.005, 0x26201c);
  }, { tint: true, n: 260 });
  add('henLeg', (g) => {
    g.box(0, -0.022, 0, 0.004, 0.022, 0.004, 0xf2a521);
    g.box(0, -0.024, 0.006, 0.012, 0.003, 0.014, 0xf2a521);
  }, { n: 520 });
  // vache
  add('cowBody', (g) => {
    g.box(0, -0.045, 0, 0.11, 0.09, 0.22, W);
    g.box(0, -0.05, -0.002, 0.112, 0.07, 0.2, W);
    // taches
    g.box(0.0301 + 0.026, -0.03, -0.04, 0.002, 0.05, 0.07, 0x2b2b30);
    g.box(-0.0571, -0.045, 0.05, 0.002, 0.04, 0.06, 0x2b2b30);
    g.box(0.02, 0.0001, 0.02, 0.05, 0.002, 0.07, 0x2b2b30);
    g.box(0, -0.087, -0.03, 0.04, 0.018, 0.04, 0xf2a0b0); // pis
  }, { tint: true, n: 80 });
  add('cowHead', (g) => {
    g.box(0, -0.03, 0.035, 0.07, 0.065, 0.075, W);
    g.box(0, -0.052, 0.075, 0.066, 0.036, 0.02, 0xf2a0b0); // museau
    for (const s of [-1, 1]) {
      g.box(s * 0.042, -0.006, 0.02, 0.025, 0.012, 0.012, W); // oreilles
      g.box(s * 0.024, 0.008, 0.028, 0.008, 0.016, 0.008, 0xe8dcc0); // cornes
      g.box(s * 0.036, -0.022, 0.072, 0.004, 0.007, 0.004, 0x26201c);
    }
  }, { tint: true, n: 80 });
  add('cowLeg', (g) => {
    g.box(0, -0.07, 0, 0.022, 0.07, 0.022, W);
    g.box(0, -0.075, 0, 0.024, 0.012, 0.024, 0x3a3a40);
  }, { tint: true, n: 320 });
  add('tail', (g) => {
    g.box(0, -0.035, 0, 0.006, 0.07, 0.006, W);
    g.box(0, -0.075, 0, 0.012, 0.016, 0.012, 0x3a3a40);
  }, { tint: true, n: 120 });
  // mouton
  add('sheepBody', (g) => {
    for (const [x, y, z, r] of [[0, 0.0, 0, 0.055], [0.03, 0.005, 0.03, 0.04], [-0.03, 0.005, 0.03, 0.04], [0.03, 0.005, -0.035, 0.04], [-0.03, 0.005, -0.035, 0.04], [0, 0.03, 0, 0.042]]) sphere(g, x, y, z, r, W, 0.85, 1, 7, 4);
  }, { tint: true, n: 120 });
  add('sheepHead', (g) => {
    g.box(0, -0.02, 0.025, 0.036, 0.04, 0.05, 0x3a3a40);
    sphere(g, 0, 0.004, 0.018, 0.022, 0xf4f1ea, 0.7, 1, 6, 4);
    for (const s of [-1, 1]) {
      g.box(s * 0.024, -0.012, 0.018, 0.02, 0.008, 0.012, 0x3a3a40);
      g.box(s * 0.011, -0.012, 0.05, 0.004, 0.005, 0.003, 0xffffff);
    }
  }, { n: 120 });
  add('sheepLeg', (g) => g.box(0, -0.05, 0, 0.012, 0.05, 0.012, 0x3a3a40), { n: 480 });
  // chien
  add('dogBody', (g) => {
    g.box(0, -0.025, 0, 0.05, 0.045, 0.11, W);
    g.box(0, -0.02, 0.05, 0.048, 0.05, 0.03, W);
  }, { tint: true, n: 24 });
  add('dogHead', (g) => {
    g.box(0, -0.008, 0.02, 0.044, 0.042, 0.042, W);
    g.box(0, -0.018, 0.05, 0.024, 0.022, 0.03, W);
    g.box(0, -0.012, 0.066, 0.012, 0.01, 0.006, 0x26201c);
    for (const s of [-1, 1]) {
      g.box(s * 0.022, -0.002, 0.012, 0.01, 0.03, 0.02, 0x5a3a22); // oreilles tombantes
      g.box(s * 0.011, 0.004, 0.042, 0.005, 0.006, 0.003, 0x26201c);
    }
  }, { tint: true, n: 24 });
  add('dogLeg', (g) => g.box(0, -0.025, 0, 0.012, 0.03, 0.012, W), { tint: true, n: 96 });
  add('dogTail', (g) => g.box(0, 0.02, 0, 0.01, 0.045, 0.01, W), { tint: true, n: 24 });
  // chat
  add('catBody', (g) => {
    g.box(0, -0.018, 0, 0.034, 0.032, 0.08, W);
  }, { tint: true, n: 24 });
  add('catHead', (g) => {
    g.box(0, 0.0, 0.012, 0.036, 0.03, 0.03, W);
    for (const s of [-1, 1]) {
      g.tri([s * 0.006, 0.014, 0.012], [s * 0.018, 0.014, 0.004], [s * 0.014, 0.03, 0.01], W);
      g.tri([s * 0.018, 0.014, 0.004], [s * 0.006, 0.014, 0.012], [s * 0.014, 0.03, 0.01], W);
      g.box(s * 0.009, 0.004, 0.028, 0.006, 0.004, 0.002, 0x5ab03c);
    }
    g.box(0, -0.004, 0.029, 0.005, 0.004, 0.002, 0xe88a9a);
  }, { tint: true, n: 24 });
  add('catLeg', (g) => g.box(0, -0.018, 0, 0.009, 0.022, 0.009, W), { tint: true, n: 96 });
  add('catTail', (g) => g.box(0, 0.035, 0, 0.007, 0.07, 0.007, W), { tint: true, n: 24 });
  // canard
  add('duck', (g) => {
    sphere(g, 0, 0.012, 0, 0.026, W, 0.65, 0.75);
    g.box(0, 0.02, -0.026, 0.016, 0.012, 0.016, W);
    sphere(g, 0, 0.042, 0.018, 0.014, W, 1, 1, 6, 4);
    g.box(0, 0.038, 0.034, 0.01, 0.005, 0.014, 0xf2a521);
  }, { tint: true, n: 60 });
  // oiseau (corps + ailes)
  add('birdBody', (g) => {
    sphere(g, 0, 0, 0, 0.012, W, 0.8, 0.8, 6, 4);
    g.box(0, 0.002, 0.014, 0.004, 0.003, 0.008, 0xf2a521);
    g.box(0, 0.0, -0.016, 0.01, 0.003, 0.012, W);
  }, { tint: true, n: 120 });
  add('wing', (g) => {
    g.tri([0, 0, 0.008], [0.03, 0, 0.0], [0, 0, -0.01], W);
    g.tri([0, 0, -0.01], [0.03, 0, 0.0], [0, 0, 0.008], W);
  }, { tint: true, n: 240, double: true });
  add('flyWing', (g) => {
    g.tri([0, 0, 0], [0.016, 0, 0.012], [0.018, 0, -0.008], W);
    g.tri([0.018, 0, -0.008], [0.016, 0, 0.012], [0, 0, 0], W);
  }, { tint: true, n: 160, double: true });
  return P;
}

/**
 * Vrais modèles animés : modèle, animations (marche, course, repos, manger), cadence de la marche
 * (secondes d'animation par unité de « phase »), os du cou pour brouter, couleurs (haut, bas).
 */
const SKIN = {
  hen: { model: 'chicken', skel: 'chicken', walk: 'walk', run: 'walk', idle: 'idle', idle2: 'idle2', eat: 'eat', step: 0.012 },
  cow: { model: 'cow', skel: 'cow', walk: 'walkSlow', run: 'run', idle: 'idle', step: 0.042, neck: ['Neck', 'Head'], graze: 0.75 },
  sheep: { model: 'sheep', skel: 'sheep', walk: 'walkSlow', run: 'run', idle: 'idle', step: 0.028, neck: ['Neck', 'Head'], graze: 0.8 },
  dog: { model: 'dog', skel: 'dog', walk: 'walk', run: 'run', idle: 'idle', step: 0.03, neck: ['Neck', 'Head'], graze: 0.55 },
  cat: { model: 'cat', skel: 'cat', walk: 'walk', run: 'walk', idle: 'idle', step: 0.022 },
};
/** Couleurs des modèles animés par variété (haut, bas). */
const COW_TINTS = [[0xf4f1ea, 0x2b2b30], [0xf4f1ea, 0x6b4426], [0xb07a52, 0xf4f1ea], [0x8a5a3a, 0x3a2e28]];
const SHEEP_TINTS = [[0xf4f1ea, -1], [0xece4d2, -1], [0xd8d2c6, -1], [0x5a524c, -1]];
const DOG_TINTS = [[0xe7cc9d, 0x381f18], [0xb0773f, 0x3a2e28], [0x3a2e28, 0x1e1a18], [0xf2ece0, 0x8a6a4a], [0x8a8a90, 0x3a3a40]];
const CAT_TINTS = [[0x4b494a, 0xe7e7e7], [0xe8964a, 0xf6efe4], [0x2e2a2a, 0xf2ece0], [0xc9a070, 0xf2ece0], [0x8a8a90, 0xe7e7e7]];

const HEN_COLORS = [0xf7f1e3, 0xf7f1e3, 0xb8743a, 0x8a4a22, 0xe8d8b8];
const COW_COLORS = [0xf7f4ee, 0xf7f4ee, 0xb07a52, 0x8a5a3a];
const DOG_COLORS = [0xb0773f, 0x3a2e28, 0xe8d6b0, 0xd9a35a, 0x8a8a90];
const CAT_COLORS = [0xe8964a, 0x8a8a90, 0x2e2a2a, 0xf2ece0, 0xc9a070];
const DUCK_COLORS = [0xf7f4ee, 0x9a7a52, 0xf7f4ee];
const BIRD_COLORS = [0x4a4a52, 0x6b5a4a, 0x3a3f4a];
const PIGEON_COLORS = [0x8a8f9a, 0x9a9aa6, 0x6f7480];
const FLY_COLORS = [0xffe14d, 0xffffff, 0x6fb4ff, 0xff9a3a, 0xf08bb4];

export class Animals {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.parts = buildParts();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matD = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.meshes = {};
    for (const [name, p] of Object.entries(this.parts)) {
      const m = new THREE.InstancedMesh(p.geo, p.double ? this.matD : this.mat, p.n || 100);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = !p.double;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (p.tint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((p.n || 100) * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      this.meshes[name] = { m, n: 0, tint: p.tint };
    }
    this.list = [];
    this.byHome = new Map();
    this.syncAcc = 9;
    this.time = 0;
    this.M = new THREE.Matrix4();
    this.R = new THREE.Matrix4();
    this.B = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.flocks = [];
    this.soundAcc = 0;
  }

  get world() {
    return this.r.world;
  }

  clear() {
    this.list = [];
    this.byHome.clear();
    this.flocks = [];
    this.syncAcc = 9;
  }

  /* ───────── Qui vit où ───────── */
  sync() {
    const world = this.world;
    if (!world) return;
    const want = new Map(); // clé -> description
    let houses = 0;
    const houseList = [];
    for (const b of world.buildings.values()) {
      if (b.cons?.k === 'new') continue;
      const def = BUILDINGS[b.type];
      if (def.residents && (b.residents || 0) >= 1) {
        houses++;
        houseList.push(b);
      }
      if (b.type === 'coop') {
        const n = 4 + b.level * 2;
        for (let k = 0; k < n; k++) want.set(`hen|${b.id}|${k}`, { kind: 'hen', home: b, k });
      } else if (b.type === 'pasture') {
        for (let k = 0; k < 1 + b.level; k++) want.set(`cow|${b.id}|${k}`, { kind: 'cow', home: b, k });
        for (let k = 0; k < 2 + b.level; k++) want.set(`sheep|${b.id}|${k}`, { kind: 'sheep', home: b, k });
      } else if (b.type === 'farm') {
        for (let k = 0; k < 3; k++) want.set(`hen|${b.id}|${k}`, { kind: 'hen', home: b, k, farm: true });
        if (b.level >= 2) want.set(`dog|${b.id}|0`, { kind: 'dog', home: b, k: 0 });
      }
    }
    // chiens et chats des maisons
    const dogs = Math.min(8, Math.floor(houses / 9));
    const cats = Math.min(9, Math.floor(houses / 7));
    for (let k = 0; k < dogs; k++) {
      const h = houseList[Math.floor(hash2(k, 11, 3) * houseList.length)];
      if (h) want.set(`dog|h${h.id}|${k}`, { kind: 'dog', home: h, k });
    }
    for (let k = 0; k < cats; k++) {
      const h = houseList[Math.floor(hash2(k, 13, 5) * houseList.length)];
      if (h) want.set(`cat|h${h.id}|${k}`, { kind: 'cat', home: h, k });
    }
    // on garde ceux qui existent, on ajoute les nouveaux, on retire les autres
    const keep = [];
    for (const a of this.list) {
      if (a.free) {
        keep.push(a);
        continue;
      }
      const d = want.get(a.key);
      if (d && world.buildings.get(a.home) === d.home) {
        keep.push(a);
        want.delete(a.key);
      }
    }
    this.list = keep;
    for (const [key, d] of want) this.list.push(this.spawn(key, d));
  }

  spawn(key, d) {
    const b = d.home;
    const seed = (hash2(b.id, d.k * 31 + d.kind.length, 7) * 1e9) | 0;
    const a = {
      key, kind: d.kind, home: b.id, k: d.k, seed, farm: !!d.farm,
      x: 0, z: 0, y: 0, dir: hash2(seed, 1, 1) * 6.28, state: 'idle', t: 0, until: 0, tx: 0, tz: 0, speed: 0,
      phase: hash2(seed, 2, 1) * 10, head: 0, lie: 0, wag: 0, flee: 0,
    };
    const c = (arr) => arr[Math.floor(hash2(seed, 3, 9) * arr.length)];
    a.color = d.kind === 'hen' ? c(HEN_COLORS) : d.kind === 'cow' ? c(COW_COLORS) : d.kind === 'dog' ? c(DOG_COLORS) : d.kind === 'cat' ? c(CAT_COLORS) : 0xf4f1ea;
    const p = this.randomIn(a);
    a.x = p[0];
    a.z = p[1];
    a.tx = a.x;
    a.tz = a.z;
    return a;
  }

  /** Un point au hasard dans le domaine de l'animal (enclos, cour de ferme, rue…). */
  randomIn(a, salt = 0) {
    const world = this.world;
    const b = world.buildings.get(a.home);
    const u = hash2(a.seed, (this.time * 7 | 0) + salt * 13, 21), v = hash2(a.seed, (this.time * 5 | 0) + salt * 17, 22);
    if (!b) return [a.x, a.z];
    if (a.kind === 'hen' && !a.farm) {
      const [x0, z0, x1, z1] = FARMS.coop.pen;
      return localToWorld(b, x0 + 0.05 + u * (x1 - x0 - 0.1), z0 + 0.03 + v * (z1 - z0 - 0.08));
    }
    if (a.kind === 'hen') return localToWorld(b, -0.2 + u * 0.55, -0.15 - v * 0.2);
    if (a.kind === 'cow' || a.kind === 'sheep') {
      const F = FARMS.pasture;
      const r = hash2(a.seed, (this.time | 0) + salt, 23) < 0.8 ? F.pen : F.pen2;
      return localToWorld(b, r[0] + 0.1 + u * (r[2] - r[0] - 0.2), r[1] + 0.1 + v * (r[3] - r[1] - 0.2));
    }
    // chien, chat : autour de la maison (devant, sur la rue)
    const c = world.centerOf(b);
    const rad = a.kind === 'dog' ? 2.2 : 0.9;
    const ang = u * Math.PI * 2;
    return [c.cx - HALF + Math.cos(ang) * rad * (0.4 + v * 0.6), c.cz - HALF + Math.sin(ang) * rad * (0.4 + v * 0.6)];
  }

  /** Peut-on aller là ? (chiens et chats : pas dans l'eau, pas dans les bâtiments des autres) */
  okGround(x, z, a) {
    const world = this.world;
    const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
    if (!world.inside(tx, tz)) return false;
    const i = world.idx(tx, tz);
    const t = world.terrain[i];
    if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN) return !!world.road[i];
    const o = world.occ[i];
    return o < 0 || o === a.home;
  }

  /* ───────── Pas de vie ───────── */
  update(dt, speed) {
    const world = this.world;
    if (!world) return;
    this.time += dt;
    const sp = speed > 0 ? Math.min(2.5, speed) : 0.25;
    const step = dt * sp;
    this.syncAcc += dt;
    if (this.syncAcc > 1.5) {
      this.syncAcc = 0;
      this.sync();
    }
    const cam = this.r.cam;
    const tx = cam.target.x, tz = cam.target.z;
    const radius = Math.min(50, cam.distance * 1.3 + 8);
    const r2 = radius * radius;
    const night = this.r.night || 0;
    const people = this.r.people?.figs || [];
    for (const k in this.meshes) this.meshes[k].n = 0;
    // ce que font les éleveurs (une fois par image pour tous les enclos)
    this.calls = new Map();
    const V = this.r.game.villagers;
    for (const w of V.list) {
      if (!w.detail || w.role !== 'breeder') continue;
      const b = world.buildings.get(w.job);
      if (!b) continue;
      let list = this.calls.get(b.id);
      if (!list) this.calls.set(b.id, (list = []));
      list.push(w);
    }
    const crowd = this.r.crowd;
    for (const a of this.list) {
      const dx = a.x - tx, dz = a.z - tz;
      if (dx * dx + dz * dz > r2) continue;
      this.think(a, step, night, people);
      if (crowd && SKIN[a.kind] && crowd.lib.meshes[SKIN[a.kind].model]) this.drawSkinned(crowd, a);
      else this.draw(a);
    }
    this.ambientLife(step, dt, tx, tz, radius, night, people);
    for (const k in this.meshes) {
      const e = this.meshes[k];
      e.m.count = e.n;
      if (e.n) {
        e.m.instanceMatrix.needsUpdate = true;
        if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Le comportement d'un animal (une petite machine à états). */
  think(a, dt, night, people) {
    a.t += dt;
    const game = this.r.game;
    const world = this.world;
    const b = world.buildings.get(a.home);
    // ce que font les éleveurs de son enclos
    let call = null;
    if (b && (b.type === 'coop' || b.type === 'pasture')) {
      for (const w of this.calls?.get(b.id) || []) {
        if (b.type === 'coop' && w.act === 'feed') call = { kind: 'feed', p: localToWorld(b, FARMS.coop.feed[0], FARMS.coop.feed[1]), w };
        else if (b.type === 'pasture' && (w.act === 'hay' || w.act === 'goTask' && w.prop === 'hay')) call = { kind: 'feed', p: localToWorld(b, FARMS.pasture.feed[0], FARMS.pasture.feed[1] + 0.12), w };
        else if (b.type === 'pasture' && (w.act === 'milk' || w.act === 'goTask' && w.target?.task === 'milk') && a.kind === 'cow' && a.k === w.slot) call = { kind: 'milk', p: localToWorld(b, FARMS.pasture.nest[0] - 0.12, FARMS.pasture.nest[1] - 0.02), w };
      }
    }
    // quelqu'un passe tout près : on s'écarte (poules, moutons, chats, pigeons) ; on regarde 4 fois par seconde
    if (a.flee > 0) a.flee -= dt;
    a.look = (a.look || (a.seed % 10) / 40) - dt;
    if (!call && a.kind !== 'cow' && a.kind !== 'dog' && a.flee <= 0 && a.look <= 0) {
      a.look = 0.25;
      for (const f of people) {
        const ddx = a.x - f.x, ddz = a.z - f.z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < 0.045 && d2 > 1e-6) {
          const l = Math.sqrt(d2);
          const run = a.kind === 'hen' ? 0.22 : 0.3;
          const nx = a.x + (ddx / l) * run, nz = a.z + (ddz / l) * run;
          if (this.inDomain(a, nx, nz)) {
            a.tx = nx;
            a.tz = nz;
            a.state = 'flee';
            a.speed = a.kind === 'hen' ? 0.55 : 0.45;
            a.flee = 0.9;
            a.until = a.t + 0.6;
            if (a.kind === 'hen' && Math.random() < 0.3) this.sound('cluck', a);
          }
          break;
        }
      }
    }
    // la nuit : on dort (poules au poulailler, bêtes couchées)
    const sleepy = night > 0.62;
    if (call) {
      a.state = call.kind === 'milk' ? 'toMilk' : 'toFeed';
      a.tx = call.p[0] + (a.kind === 'hen' ? (hash2(a.seed, 3, 4) - 0.5) * 0.18 : (hash2(a.seed, 3, 4) - 0.5) * (call.kind === 'milk' ? 0 : 0.35));
      a.tz = call.p[1] + (a.kind === 'hen' ? (hash2(a.seed, 4, 4) - 0.5) * 0.12 : call.kind === 'milk' ? 0 : (hash2(a.seed, 4, 4) - 0.5) * 0.1);
      a.speed = a.kind === 'hen' ? 0.4 : a.kind === 'sheep' ? 0.12 : 0.09;
    } else if (a.t >= a.until && a.state !== 'flee') this.decide(a, sleepy);
    else if (a.state === 'flee' && a.t >= a.until) this.decide(a, sleepy);
    // déplacement
    const ddx = a.tx - a.x, ddz = a.tz - a.z;
    const dist = Math.hypot(ddx, ddz);
    const moving = (a.state === 'walk' || a.state === 'flee' || a.state === 'toFeed' || a.state === 'toMilk' || a.state === 'run' || a.state === 'follow' || a.state === 'home') && dist > 0.01;
    if (moving) {
      const v = Math.min(dist, a.speed * dt);
      const nx = a.x + (ddx / dist) * v, nz = a.z + (ddz / dist) * v;
      if ((a.kind !== 'dog' && a.kind !== 'cat') || this.okGround(nx, nz, a)) {
        a.x = nx;
        a.z = nz;
      } else {
        a.tx = a.x;
        a.tz = a.z;
      }
      const want = Math.atan2(ddx, ddz);
      let dd = want - a.dir;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      a.dir += dd * Math.min(1, dt * 8);
      a.phase += v * (a.kind === 'hen' ? 90 : a.kind === 'cow' ? 30 : a.kind === 'sheep' ? 48 : 55);
      a.moving = true;
    } else {
      a.moving = false;
      if ((a.state === 'toFeed' || a.state === 'toMilk') && call) {
        // arrivé : on mange / on se laisse traire, face à l'éleveur ou au râtelier
        const w = call.w;
        if (call.kind === 'milk' && w) a.dir = Math.atan2(w.x - a.x, w.z - a.z) + Math.PI / 2;
      }
    }
    // tête et posture
    const eating = a.state === 'peck' || a.state === 'graze' || ((a.state === 'toFeed') && !a.moving);
    const headTarget = eating ? 1 : 0;
    a.head += (headTarget - a.head) * Math.min(1, dt * 6);
    const lieTarget = a.state === 'sleep' || a.state === 'lie' ? 1 : 0;
    a.lie += (lieTarget - a.lie) * Math.min(1, dt * 2.5);
    if (a.kind === 'dog') a.wag += dt * (a.state === 'follow' || a.state === 'run' ? 16 : 6);
    // quelques cris quand on est tout près
    if (Math.random() < dt * 0.04) this.sound(a.kind === 'hen' ? 'cluck' : a.kind === 'cow' ? 'moo' : a.kind === 'sheep' ? 'baa' : a.kind === 'dog' ? 'bark' : 'meow', a);
  }

  inDomain(a, x, z) {
    if (a.kind === 'dog' || a.kind === 'cat') return this.okGround(x, z, a);
    const b = this.world.buildings.get(a.home);
    if (!b) return false;
    // repère local de l'enclos
    const def = BUILDINGS[b.type];
    const rw = b.rot & 1 ? def.size[1] : def.size[0], rd = b.rot & 1 ? def.size[0] : def.size[1];
    const cx = b.x + rw / 2 - HALF, cz = b.z + rd / 2 - HALF;
    const ROT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const [c, s] = ROT[b.rot & 3];
    const dx = x - cx, dz = z - cz;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const inR = (r) => lx > r[0] + 0.03 && lx < r[2] - 0.03 && lz > r[1] + 0.03 && lz < r[3] - 0.03;
    if (a.kind === 'hen' && !a.farm) return inR(FARMS.coop.pen) || inR([-0.42, -0.42, 0.42, 0.0]);
    if (a.kind === 'hen') return Math.abs(lx) < 0.9 && Math.abs(lz) < 0.9;
    return inR(FARMS.pasture.pen) || inR(FARMS.pasture.pen2);
  }

  /** Choix du prochain comportement. */
  decide(a, sleepy) {
    const u = hash2(a.seed, Math.floor(this.time * 10) + 7, 31);
    const dur = (min, max) => min + hash2(a.seed, Math.floor(this.time * 10) + 9, 33) * (max - min);
    a.t = 0;
    if (sleepy && a.kind !== 'dog') {
      if (a.kind === 'hen' && !a.farm && a.state !== 'sleep') {
        // les poules rentrent au poulailler
        const b = this.world.buildings.get(a.home);
        if (b && a.state !== 'home') {
          const p = localToWorld(b, -0.12 + (hash2(a.seed, 5, 5) - 0.5) * 0.25, -0.18 + (hash2(a.seed, 6, 5) - 0.5) * 0.12);
          a.tx = p[0];
          a.tz = p[1];
          a.state = 'home';
          a.speed = 0.25;
          a.until = 3;
          return;
        }
      }
      a.state = 'sleep';
      a.until = dur(6, 12);
      return;
    }
    switch (a.kind) {
      case 'hen':
        if (u < 0.45) {
          a.state = 'peck';
          a.until = dur(1.2, 3);
        } else if (u < 0.85) {
          const p = this.randomIn(a, 1);
          a.tx = p[0];
          a.tz = p[1];
          a.state = 'walk';
          a.speed = 0.14 + hash2(a.seed, 8, 2) * 0.06;
          a.until = dur(1.5, 3.5);
        } else {
          a.state = 'idle';
          a.until = dur(0.8, 2);
        }
        return;
      case 'cow':
        if (u < 0.55) {
          a.state = 'graze';
          a.until = dur(4, 9);
        } else if (u < 0.8) {
          const p = this.randomIn(a, 2);
          a.tx = p[0];
          a.tz = p[1];
          a.state = 'walk';
          a.speed = 0.05;
          a.until = dur(5, 10);
        } else if (u < 0.9) {
          a.state = 'lie';
          a.until = dur(6, 12);
        } else {
          a.state = 'idle';
          a.until = dur(2, 5);
        }
        return;
      case 'sheep': {
        // le troupeau reste groupé : on vise le centre des autres moutons
        let sx = 0, sz = 0, n = 0;
        for (const o of this.list) if (o.home === a.home && o.kind === 'sheep' && o !== a) {
          sx += o.x;
          sz += o.z;
          n++;
        }
        if (u < 0.5) {
          a.state = 'graze';
          a.until = dur(2.5, 6);
        } else {
          let p = this.randomIn(a, 3);
          if (n) p = [(sx / n) * 0.65 + p[0] * 0.35, (sz / n) * 0.65 + p[1] * 0.35];
          a.tx = p[0];
          a.tz = p[1];
          a.state = 'walk';
          a.speed = 0.09;
          a.until = dur(3, 6);
        }
        return;
      }
      case 'dog': {
        // suivre un passant un moment, renifler, s'asseoir, courir
        const people = this.r.people?.figs || [];
        let best = null, bd = 1.2;
        for (const f of people) {
          const d = Math.hypot(f.x - a.x, f.z - a.z);
          if (d < bd && f.anim === 'walk') {
            bd = d;
            best = f;
          }
        }
        if (best && u < 0.55 && !sleepy) {
          a.state = 'follow';
          a.tx = best.x - Math.sin(best.dir) * 0.15;
          a.tz = best.z - Math.cos(best.dir) * 0.15;
          a.speed = 0.62;
          a.until = dur(0.6, 1.2);
          if (u < 0.1) this.sound('bark', a);
          return;
        }
        if (sleepy) {
          a.state = 'sleep';
          a.until = dur(8, 14);
          return;
        }
        if (u < 0.3) {
          a.state = 'sit';
          a.until = dur(2, 5);
        } else if (u < 0.5) {
          a.state = 'sniff';
          a.until = dur(1.2, 2.5);
        } else {
          const p = this.randomIn(a, 4);
          if (this.okGround(p[0], p[1], a)) {
            a.tx = p[0];
            a.tz = p[1];
          }
          a.state = u < 0.62 ? 'run' : 'walk';
          a.speed = a.state === 'run' ? 0.7 : 0.25;
          a.until = dur(1.5, 4);
        }
        return;
      }
      case 'cat': {
        // un chien approche : on file
        for (const o of this.list) {
          if (o.kind !== 'dog') continue;
          const d = Math.hypot(o.x - a.x, o.z - a.z);
          if (d < 0.5 && d > 0.01) {
            const nx = a.x + ((a.x - o.x) / d) * 0.6, nz = a.z + ((a.z - o.z) / d) * 0.6;
            if (this.okGround(nx, nz, a)) {
              a.tx = nx;
              a.tz = nz;
              a.state = 'run';
              a.speed = 0.75;
              a.until = 1.2;
              return;
            }
          }
        }
        if (u < 0.45) {
          a.state = 'sit';
          a.until = dur(3, 8);
        } else if (u < 0.65) {
          a.state = 'lie';
          a.until = dur(5, 10);
        } else {
          const p = this.randomIn(a, 5);
          if (this.okGround(p[0], p[1], a)) {
            a.tx = p[0];
            a.tz = p[1];
          }
          a.state = 'walk';
          a.speed = 0.13;
          a.until = dur(2, 5);
        }
        return;
      }
      default:
        a.state = 'idle';
        a.until = 2;
    }
  }

  sound(name, a) {
    const cam = this.r.cam;
    if (cam.distance > 16) return;
    const d = Math.hypot(a.x - cam.target.x, a.z - cam.target.z);
    if (d > 5) return;
    if (this.time - (this.lastSound || 0) < 0.6) return;
    this.lastSound = this.time;
    this.r.game.sound?.play(name);
  }

  /* ───────── Vrais modèles animés ───────── */
  drawSkinned(crowd, a) {
    const def = SKIN[a.kind];
    const lib = crowd.lib;
    const rig = crowd.rig(def.skel);
    const t = this.time + (a.seed % 100) * 0.13;
    let clip, ct = t;
    if (a.moving) {
      const fast = a.state === 'run' || a.state === 'flee' || a.state === 'follow' || a.speed > 0.35;
      clip = lib.clip(def.skel, fast ? def.run : def.walk);
      ct = a.phase * def.step * (fast && def.run !== def.walk ? 0.55 : 1);
    } else if ((a.state === 'peck' || a.state === 'toFeed' || a.state === 'eat') && def.eat) clip = lib.clip(def.skel, def.eat);
    else if ((a.state === 'sleep' || a.state === 'lie') && def.idle2) clip = lib.clip(def.skel, def.idle2);
    else clip = lib.clip(def.skel, def.idle);
    if (!clip) return this.draw(a);
    rig.fromClip(clip, ct);
    // brouter, renifler : le cou s'abaisse
    const down = def.neck ? a.head * (def.graze || 0.6) + (a.state === 'sniff' ? 0.4 : 0) : 0;
    if (down > 0.01) {
      const n0 = rig.skel.bone(def.neck[0]), n1 = rig.skel.bone(def.neck[1]);
      rig.hook = (r, i) => {
        if (i === n0) rotBone(r, i, 1, 0, 0, down * 0.6);
        else if (i === n1) rotBone(r, i, 1, 0, 0, down * 0.4);
      };
    }
    rig.forward();
    rig.hook = null;
    const lie = a.lie || 0;
    const cp = this.r.camera.position;
    const lod = (cp.x - a.x) ** 2 + (cp.y - a.y) ** 2 + (cp.z - a.z) ** 2 < 64 ? 0 : 1;
    const slot = crowd.add(def.model, lod);
    if (!slot) return;
    const [e, i] = slot;
    rig.writeSkin(e.stage, i * e.nb * 12, a.x, a.y - lie * 0.25 * rig.skel.height, a.z, a.dir, 1);
    const pal = a.kind === 'cow' ? COW_TINTS : a.kind === 'sheep' ? SHEEP_TINTS : a.kind === 'dog' ? DOG_TINTS : a.kind === 'cat' ? CAT_TINTS : null;
    if (pal) {
      const c = pal[a.seed % pal.length];
      if (c[0] >= 0) crowd.tint(e, i, 3, c[0]);
      if (c[1] >= 0) crowd.tint(e, i, 4, c[1]);
    }
  }

  /** Oiseau, pigeon ou papillon animé. */
  skinFlyer(crowd, model, skel, clipName, x, y, z, dir, t) {
    const clip = crowd.lib.clip(skel, clipName);
    if (!clip || !crowd.lib.meshes[model]) return false;
    const rig = crowd.rig(skel);
    rig.fromClip(clip, t);
    rig.forward();
    const slot = crowd.add(model, 1);
    if (!slot) return true;
    const [e, i] = slot;
    rig.writeSkin(e.stage, i * e.nb * 12, x, y, z, dir, 1);
    return true;
  }

  /* ───────── Dessin ───────── */
  put(name, matrix, color) {
    const e = this.meshes[name];
    if (!e || e.n >= e.m.instanceMatrix.count) return;
    e.m.setMatrixAt(e.n, matrix);
    if (e.tint) e.m.setColorAt(e.n, this.col.setHex(color ?? 0xffffff));
    e.n++;
  }

  /** Repère de l'animal (position, cap, échelle) → this.R ; puis les pièces. */
  root(x, y, z, dir, scale = 1) {
    this.q.setFromAxisAngle(this.up, dir);
    this.v.set(x, y, z);
    this.s.setScalar(scale);
    this.R.compose(this.v, this.q, this.s);
    return this.R;
  }

  part(name, px, py, pz, rx, rz, color, ry = 0) {
    const M = this.M;
    M.makeRotationX(rx || 0);
    if (rz) M.premultiply(this.B.makeRotationZ(rz));
    if (ry) M.premultiply(this.B.makeRotationY(ry));
    M.setPosition(px, py, pz);
    this.put(name, this.B.multiplyMatrices(this.R, M), color);
  }

  draw(a) {
    const t = this.time;
    const ph = a.phase;
    const mv = a.moving;
    switch (a.kind) {
      case 'hen': {
        const sit = a.lie;
        const bob = mv ? Math.abs(Math.sin(ph)) * 0.006 : 0;
        this.root(a.x, a.y - sit * 0.018 + bob, a.z, a.dir + (a.state === 'idle' ? Math.sin(t * 2 + a.seed) * 0.3 : 0), 1.15);
        this.part('henBody', 0, 0, 0, sit * 0.1, 0, a.color);
        // picorer : la tête plonge par petits coups
        const peck = a.head * (0.5 + 0.5 * Math.max(0, Math.sin(t * 13 + a.seed)));
        this.part('henHead', 0, 0.062 - peck * 0.022, 0.022 + peck * 0.012, peck * 1.1, 0, a.color, a.state === 'idle' ? Math.sin(t * 3 + a.seed) * 0.5 : 0);
        if (sit < 0.6) for (const s of [-1, 1]) this.part('henLeg', s * 0.011, 0.024, 0, mv ? Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.7 : 0, 0);
        break;
      }
      case 'cow': {
        const lie = a.lie;
        this.root(a.x, a.y - lie * 0.065, a.z, a.dir, 1.05);
        this.part('cowBody', 0, 0.165, 0, 0, Math.sin(ph * 0.5) * 0.01, a.color);
        const graze = a.head;
        const chew = graze > 0.5 ? Math.sin(t * 5 + a.seed) * 0.03 : 0;
        this.part('cowHead', 0, 0.17 - graze * 0.06, 0.12, graze * 0.95 + chew, 0, a.color, (1 - graze) * Math.sin(t * 0.5 + a.seed) * 0.25);
        for (const [lx, lz, o] of [[-0.035, 0.08, 0], [0.035, 0.08, Math.PI], [-0.035, -0.08, Math.PI], [0.035, -0.08, 0]]) {
          const swing = mv ? Math.sin(ph + o) * 0.45 : 0;
          this.part('cowLeg', lx, 0.12, lz, lie > 0.3 ? -1.45 * lie : swing, 0, a.color === 0xf7f4ee ? 0xf2efe6 : a.color);
        }
        this.part('tail', 0, 0.155, -0.11, 0.15, Math.sin(t * 2.2 + a.seed) * 0.35, a.color);
        break;
      }
      case 'sheep': {
        const lie = a.lie;
        const bob = mv ? Math.abs(Math.sin(ph)) * 0.004 : 0;
        this.root(a.x, a.y - lie * 0.04 + bob, a.z, a.dir, 1.0);
        this.part('sheepBody', 0, 0.095, 0, 0, 0, a.color);
        const graze = a.head;
        this.part('sheepHead', 0, 0.105 - graze * 0.04, 0.055, graze * 1.0, 0, 0, (1 - graze) * Math.sin(t * 0.7 + a.seed) * 0.3);
        if (lie < 0.5) for (const [lx, lz, o] of [[-0.025, 0.035, 0], [0.025, 0.035, Math.PI], [-0.025, -0.035, Math.PI], [0.025, -0.035, 0]]) this.part('sheepLeg', lx, 0.06, lz, mv ? Math.sin(ph + o) * 0.5 : 0, 0);
        break;
      }
      case 'dog': {
        const sit = a.state === 'sit' ? 1 : 0;
        const sleep = a.lie;
        this.root(a.x, a.y - sleep * 0.03, a.z, a.dir, 1.1);
        this.part('dogBody', 0, 0.07 + sit * 0.005, 0, -sit * 0.45, 0, a.color);
        const sniff = a.state === 'sniff' ? 0.6 + Math.sin(t * 9) * 0.1 : 0;
        this.part('dogHead', 0, 0.08 + sit * 0.03 - sniff * 0.03, 0.065 - sit * 0.01, sniff - sit * 0.1, 0, a.color, a.state === 'sit' ? Math.sin(t * 0.8 + a.seed) * 0.4 : 0);
        for (const [lx, lz, o, back] of [[-0.016, 0.042, 0, 0], [0.016, 0.042, Math.PI, 0], [-0.016, -0.042, Math.PI, 1], [0.016, -0.042, 0, 1]]) {
          const swing = mv ? Math.sin(ph + o) * (a.state === 'run' ? 0.9 : 0.5) : 0;
          const fold = sleep > 0.4 ? -1.4 : back && sit ? -1.3 : 0;
          this.part('dogLeg', lx, 0.05 - (back && sit ? 0.012 : 0), lz, fold || swing, 0, a.color);
        }
        this.part('dogTail', 0, 0.075, -0.055, -0.9 + sit * 0.5, Math.sin(a.wag) * 0.6, a.color);
        break;
      }
      case 'cat': {
        const sit = a.state === 'sit' ? 1 : 0;
        const lie = a.lie;
        this.root(a.x, a.y - lie * 0.018, a.z, a.dir, 1.0);
        this.part('catBody', 0, 0.042, 0, -sit * 0.6, 0, a.color);
        this.part('catHead', 0, 0.05 + sit * 0.022 - lie * 0.012, 0.045 - sit * 0.015, 0, 0, a.color, Math.sin(t * 0.6 + a.seed) * 0.35);
        if (lie < 0.5) for (const [lx, lz, o, back] of [[-0.011, 0.03, 0, 0], [0.011, 0.03, Math.PI, 0], [-0.011, -0.03, Math.PI, 1], [0.011, -0.03, 0, 1]]) {
          this.part('catLeg', lx, 0.03, lz, mv ? Math.sin(ph + o) * 0.5 : back && sit ? -1.4 : 0, 0, a.color);
        }
        this.part('catTail', 0, 0.035, -0.04, sit ? -1.2 : -0.5, Math.sin(t * 1.3 + a.seed) * 0.3, a.color);
        break;
      }
      default:
    }
  }

  /* ───────── Faune sauvage autour de la caméra ───────── */
  ambientLife(dt, rdt, tx, tz, radius, night, people) {
    const world = this.world;
    const crowd = this.r.crowd;
    const season = this.r.season;
    const weather = this.r.sky?.weather || 'clear';
    const t = this.time;
    // volées d'oiseaux dans le ciel (le jour)
    if (!this.flocks.length) {
      for (let k = 0; k < 3; k++) this.flocks.push(this.newFlock(tx, tz, k));
    }
    for (const f of this.flocks) {
      f.age += rdt;
      f.x += Math.sin(f.dir) * f.speed * rdt;
      f.z += Math.cos(f.dir) * f.speed * rdt;
      f.dir += Math.sin(t * 0.2 + f.seed) * 0.05 * rdt;
      const fx = f.x - tx, fz = f.z - tz;
      if (fx * fx + fz * fz > (radius + 25) ** 2 || f.age > 60) Object.assign(f, this.newFlock(tx, tz, f.seed + 1));
      if (night > 0.6) continue;
      for (let k = 0; k < f.n; k++) {
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
        const bx = f.x - Math.sin(f.dir) * row * 0.22 + Math.cos(f.dir) * side * row * 0.2;
        const bz = f.z - Math.cos(f.dir) * row * 0.22 - Math.sin(f.dir) * side * row * 0.2;
        const by = f.y + Math.sin(t * 1.3 + k) * 0.08;
        if (!(crowd && this.skinFlyer(crowd, 'bird', 'bird', 'fly', bx, by, bz, f.dir, t * 0.9 + k * 0.17))) this.bird(bx, by, bz, f.dir, t * 9 + k * 0.7, f.color, 1.6);
      }
    }
    // pigeons sur les routes, papillons dans les jardins, canards sur l'eau (autour de la caméra)
    if (!this.wild) this.wild = [];
    const want = this.r.quality === 'low' ? 0 : 1;
    if (want && this.wild.length < 34 && Math.random() < rdt * 6) {
      const ang = Math.random() * Math.PI * 2, d = Math.random() * Math.min(radius, 16);
      const x = tx + Math.cos(ang) * d, z = tz + Math.sin(ang) * d;
      const ix = Math.floor(x + HALF), iz = Math.floor(z + HALF);
      if (world.inside(ix, iz)) {
        const i = world.idx(ix, iz);
        const ter = world.terrain[i];
        const flowers = season !== 3 && weather !== 'rain' && weather !== 'snow' && night < 0.4;
        if ((ter === T.WATER) && !world.road[i] && this.wild.filter((w) => w.kind === 'duck').length < 10) {
          this.wild.push({ kind: 'duck', x, z, dir: Math.random() * 6.28, t: 0, life: 40 + Math.random() * 40, color: DUCK_COLORS[Math.floor(Math.random() * 3)], seed: Math.random() * 100 });
        } else if (world.road[i] && ter !== T.WATER && this.wild.filter((w) => w.kind === 'pigeon').length < 12 && night < 0.5) {
          for (let k = 0; k < 3; k++) this.wild.push({ kind: 'pigeon', x: x + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3, y: 0, dir: Math.random() * 6.28, t: 0, life: 30 + Math.random() * 30, color: PIGEON_COLORS[k % 3], seed: Math.random() * 100, state: 'peck' });
        } else if (flowers && (ter === T.GRASS || ter === T.FOREST) && this.wild.filter((w) => w.kind === 'fly').length < 14) {
          this.wild.push({ kind: 'fly', x, z, y: 0.1, dir: 0, t: 0, life: 20 + Math.random() * 20, color: FLY_COLORS[Math.floor(Math.random() * FLY_COLORS.length)], seed: Math.random() * 100 });
        }
      }
    }
    const keep = [];
    for (const w of this.wild) {
      w.t += rdt;
      const fx = w.x - tx, fz = w.z - tz;
      if (w.t > w.life || fx * fx + fz * fz > (radius + 4) ** 2) continue;
      keep.push(w);
      if (w.kind === 'duck') {
        // nage tranquille, demi-tour avant la rive
        const nx = w.x + Math.sin(w.dir) * 0.05 * dt, nz = w.z + Math.cos(w.dir) * 0.05 * dt;
        const ix = Math.floor(nx + HALF + Math.sin(w.dir) * 0.15), iz = Math.floor(nz + HALF + Math.cos(w.dir) * 0.15);
        const ok = world.inside(ix, iz) && (world.terrain[world.idx(ix, iz)] === T.WATER || world.terrain[world.idx(ix, iz)] === T.DEEP);
        if (ok) {
          w.x = nx;
          w.z = nz;
        } else w.dir += 2.4 + Math.random();
        w.dir += Math.sin(t * 0.5 + w.seed) * 0.4 * dt;
        const dab = Math.sin(t * 0.7 + w.seed) > 0.93 ? 1 : 0; // la tête sous l'eau
        this.root(w.x, -0.075 + Math.sin(t * 2 + w.seed) * 0.003, w.z, w.dir, 1.2);
        this.M.makeRotationX(dab * 1.1).setPosition(0, 0, 0);
        this.put('duck', this.B.multiplyMatrices(this.R, this.M), w.color);
        if (Math.random() < rdt * 0.03) this.sound('quack', w);
      } else if (w.kind === 'pigeon') {
        // ils picorent ; si quelqu'un approche, ils s'envolent
        if (w.state === 'peck') {
          for (const f of people) {
            if (Math.abs(f.x - w.x) < 0.35 && Math.abs(f.z - w.z) < 0.35) {
              w.state = 'fly';
              w.dir = Math.atan2(w.x - f.x, w.z - f.z) + (Math.random() - 0.5);
              break;
            }
          }
          if (Math.random() < rdt * 0.8) w.dir += (Math.random() - 0.5) * 2;
          if (Math.random() < rdt * 0.6) {
            w.x += Math.sin(w.dir) * 0.04;
            w.z += Math.cos(w.dir) * 0.04;
          }
          const peck = Math.max(0, Math.sin(t * 10 + w.seed)) * 0.5;
          if (!(crowd && this.skinFlyer(crowd, 'pigeon', 'pigeon', 'idle', w.x, 0.012, w.z, w.dir, t + w.seed))) this.bird(w.x, 0.016, w.z, w.dir, 0, w.color, 1.05, peck);
        } else {
          w.y += rdt * 1.4;
          w.x += Math.sin(w.dir) * rdt * 1.2;
          w.z += Math.cos(w.dir) * rdt * 1.2;
          if (w.y > 4) w.life = 0;
          if (!(crowd && this.skinFlyer(crowd, 'pigeon', 'pigeon', 'fly', w.x, 0.016 + w.y, w.z, w.dir, t * 1.4 + w.seed))) this.bird(w.x, 0.016 + w.y, w.z, w.dir, t * 22 + w.seed, w.color, 1.05);
        }
      } else if (w.kind === 'fly') {
        // papillon : des boucles au-dessus des fleurs
        const a = t * 0.9 + w.seed;
        w.x += Math.sin(a * 1.7) * 0.12 * rdt;
        w.z += Math.cos(a * 1.3) * 0.12 * rdt;
        const y = 0.09 + Math.abs(Math.sin(a * 2.1)) * 0.12;
        const dir = Math.atan2(Math.cos(a * 1.7) * 1.7, -Math.sin(a * 1.3) * 1.3);
        if (crowd && this.skinFlyer(crowd, 'butterfly', 'butterfly', 'fly', w.x, y, w.z, dir, t + w.seed)) continue;
        this.root(w.x, y, w.z, dir, 1.3);
        const flap = Math.sin(t * 24 + w.seed) * 1.1;
        for (const s of [-1, 1]) {
          this.M.makeRotationZ(s * (0.35 + flap * 0.5));
          if (s < 0) this.M.premultiply(this.B.makeRotationY(Math.PI));
          this.M.setPosition(0, 0, 0);
          this.put('flyWing', this.B.multiplyMatrices(this.R, this.M), w.color);
        }
      }
    }
    this.wild = keep;
  }

  newFlock(tx, tz, seed) {
    const ang = hash2(seed | 0, Math.floor(this.time), 41) * Math.PI * 2;
    const d = 30;
    return {
      x: tx - Math.cos(ang) * d, z: tz - Math.sin(ang) * d, y: 3.2 + hash2(seed | 0, 3, 41) * 2.5, dir: Math.atan2(Math.cos(ang), Math.sin(ang)) + (hash2(seed | 0, 5, 41) - 0.5) * 0.5,
      speed: 1.6 + hash2(seed | 0, 7, 41), n: 3 + Math.floor(hash2(seed | 0, 9, 41) * 6), color: BIRD_COLORS[(seed | 0) % 3], seed: seed | 0, age: 0,
    };
  }

  /** Un oiseau (corps et deux ailes qui battent). */
  bird(x, y, z, dir, flapT, color, scale, peck = 0) {
    this.root(x, y, z, dir, scale);
    this.M.makeRotationX(peck).setPosition(0, 0, 0);
    this.put('birdBody', this.B.multiplyMatrices(this.R, this.M), color);
    const flap = flapT ? Math.sin(flapT) * 0.9 : -0.1;
    for (const s of [-1, 1]) {
      this.M.makeRotationZ(s * flap);
      if (s < 0) this.M.premultiply(this.B.makeRotationY(Math.PI));
      this.M.setPosition(s * 0.006, 0.004, 0);
      this.put('wing', this.B.multiplyMatrices(this.R, this.M), color);
    }
  }
}
