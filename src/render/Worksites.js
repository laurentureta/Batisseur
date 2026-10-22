// Ce qui change sur les lieux de travail : les cultures qui poussent planche par planche (carottes,
// tomates, pommes de terre, blé, maïs), la terre bêchée, le tas de bûches du bûcheron qui grandit
// à chaque dépôt, les sacs de grain et les cagettes de légumes, le tronc couché qu'on débite.
import * as THREE from 'three';
import { GeoBuilder, hexToLin } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { siteLayout, localToWorld, WORKSITES } from '../sim/Villagers.js';
import { hash2 } from '../core/rng.js';

const MAXI = { carrot: 600, tomato: 600, potato: 600, wheat: 2600, corn: 1400, furrow: 900, sprout: 1600, log: 700, trunk: 60, sack: 300, crate: 200, tomatoFruit: 600, carrotTop: 600, cob: 1400, flower: 600 };

function kinds() {
  const K = {};
  const add = (name, fn, opts = {}) => {
    const g = new GeoBuilder();
    fn(g);
    K[name] = { geo: toGeometry(g.body), ...opts };
  };
  const leaf = (g, x, z, h, c, a) => g.tri([x - 0.006, 0, z], [x + 0.006, 0, z], [x + Math.cos(a) * 0.012, h, z + Math.sin(a) * 0.012], c);
  add('carrot', (g) => {
    for (let k = 0; k < 5; k++) leaf(g, Math.cos(k * 1.26) * 0.006, Math.sin(k * 1.26) * 0.006, 0.05 + (k % 2) * 0.012, k % 2 ? 0x5fb447 : 0x4f9e38, k * 1.26);
  }, { tint: true, double: true });
  add('carrotTop', (g) => g.cone(0, -0.004, 0, 0.011, 0.012, 6, 0xf08a2a));
  add('tomato', (g) => {
    g.box(0, 0, 0, 0.004, 0.075, 0.004, 0x9a7a4a); // tuteur
    sphere6(g, 0, 0.04, 0, 0.022, 0x4f9e38);
    sphere6(g, 0.008, 0.062, 0.004, 0.016, 0x5fb447);
  }, { tint: true });
  add('tomatoFruit', (g) => {
    for (const [x, y, z] of [[0.016, 0.03, 0.008], [-0.012, 0.045, 0.014], [0.004, 0.055, -0.016]]) sphere6(g, x, y, z, 0.0075, 0xffffff);
  }, { tint: true });
  add('potato', (g) => {
    sphere6(g, 0, 0.022, 0, 0.022, 0x4c9a3a, 0.8);
    sphere6(g, 0.012, 0.03, 0.006, 0.015, 0x5aa844, 0.8);
  }, { tint: true });
  add('flower', (g) => {
    for (const [x, z] of [[0.01, 0.006], [-0.008, 0.01], [0.002, -0.012]]) g.box(x, 0.042, z, 0.006, 0.004, 0.006, 0xf6f2e8);
  });
  add('wheat', (g) => {
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05, r = 0.01 + (k % 2) * 0.008;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.07 + (k % 3) * 0.012;
      g.tri([x - 0.003, 0, z], [x + 0.003, 0, z], [x + Math.cos(a) * 0.006, h, z + Math.sin(a) * 0.006], 0xffffff);
      g.box(x + Math.cos(a) * 0.006, h - 0.004, z + Math.sin(a) * 0.006, 0.006, 0.02, 0.006, 0xffffff);
    }
  }, { tint: true, double: true });
  add('corn', (g) => {
    g.box(0, 0, 0, 0.008, 0.13, 0.008, 0xffffff);
    for (const [a, y] of [[0.3, 0.05], [2.4, 0.075], [4.3, 0.1]]) {
      g.tri([0, y, 0], [0, y + 0.012, 0], [Math.cos(a) * 0.04, y - 0.01, Math.sin(a) * 0.04], 0xffffff);
    }
  }, { tint: true, double: true });
  add('cob', (g) => g.box(0.008, 0.07, 0.004, 0.01, 0.026, 0.01, 0xf2c94c));
  add('sprout', (g) => {
    for (let k = 0; k < 3; k++) leaf(g, 0, 0, 0.018, 0x7fcf48, k * 2.1);
  }, { double: true });
  add('furrow', (g) => g.box(0, 0, 0, 1, 0.012, 1, 0x5e3f28));
  add('log', (g) => g.cylX(0, 0.022, 0, 0.022, 0.17, 8, 0x7a5232, 0xd9b47a), { shadow: true });
  add('trunk', (g) => {
    g.cylX(0, 0.03, 0, 0.03, 0.42, 8, 0x6e4a2f, 0xd9b47a);
    g.cylX(0.24, 0.03, 0, 0.012, 0.06, 6, 0x6e4a2f);
  }, { shadow: true });
  add('sack', (g) => sphere6(g, 0, 0.03, 0, 0.032, 0xd8c39a, 1.15), { shadow: true });
  add('crate', (g) => {
    g.box(0, 0, 0, 0.09, 0.045, 0.06, 0xb38652);
    g.box(0, 0.044, 0, 0.092, 0.004, 0.062, 0x8a6236);
    const veg = [0xf08a2a, 0xe53935, 0xd8b880, 0xf08a2a, 0x5fb447, 0xe53935];
    for (let k = 0; k < 6; k++) sphere6(g, -0.03 + (k % 3) * 0.03, 0.05, -0.014 + Math.floor(k / 3) * 0.028, 0.012, veg[k]);
  }, { shadow: true });
  return K;
}

function sphere6(g, x, y, z, r, c, sy = 1) {
  g.ico(x, y, z, r, c, sy, 0.12, Math.round((x + z) * 1000));
}

const CROP_COLORS = {
  carrot: [0x4f9e38, 0x5fb447],
  tomato: [0x4f9e38, 0x4f9e38],
  potato: [0x4c9a3a, 0x6ab04c],
};

export class Worksites {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.kinds = kinds();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matD = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.meshes = {};
    for (const [name, k] of Object.entries(this.kinds)) {
      const n = MAXI[name] || 400;
      const m = new THREE.InstancedMesh(k.geo, k.double ? this.matD : this.mat, n);
      m.count = 0;
      m.castShadow = !!k.shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      if (k.tint || name === 'tomatoFruit') m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      this.group.add(m);
      this.meshes[name] = { m, n: 0 };
    }
    this.M = new THREE.Matrix4();
    this.Q = new THREE.Quaternion();
    this.P = new THREE.Vector3();
    this.S = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.acc = 1;
    this.key = '';
  }

  update(dt) {
    const world = this.r.world;
    if (!world) return;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    // on ne refait les instances que si quelque chose a changé
    const game = this.r.game;
    let key = this.r.season + '|';
    for (const b of world.buildings.values()) {
      if (!WORKSITES[b.type] || !b.work) continue;
      key += b.id + ':' + b.level + ':' + b.rot + ':' + b.x + ':' + b.z + ':' + Math.round(b.work.pile || 0);
      if (b.work.beds) for (const bd of b.work.beds) key += bd.ph + '' + Math.round((bd.a / (b.work.unit || 1)) * 16) + bd.crop;
      key += ';';
    }
    for (const w of game.villagers.list) if (w.act === 'trim') key += 'T' + w.id + w.t0;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(world, game);
  }

  put(name, x, y, z, rot, sx, sy, sz, color) {
    const e = this.meshes[name];
    if (!e || e.n >= e.m.instanceMatrix.count) return;
    this.Q.setFromAxisAngle(this.up, rot);
    this.P.set(x, y, z);
    this.S.set(sx, sy ?? sx, sz ?? sx);
    this.M.compose(this.P, this.Q, this.S);
    e.m.setMatrixAt(e.n, this.M);
    if (e.m.instanceColor) e.m.setColorAt(e.n, this.col.setHex(color ?? 0xffffff));
    e.n++;
  }

  rebuild(world, game) {
    for (const k in this.meshes) this.meshes[k].n = 0;
    const winter = this.r.season === 3, autumn = this.r.season === 2;
    for (const b of world.buildings.values()) {
      const ws = WORKSITES[b.type];
      if (!ws || !b.work) continue;
      if (this.r.buildings.pops.has(b.id)) continue; // encore en chantier
      const s = b.work;
      const lay = siteLayout(b);
      const rot = (b.rot & 3) * (Math.PI / 2);
      if (b.type === 'lumber') {
        // tas de bûches : il grandit à chaque dépôt (le charretier passe à l'aube)
        const logs = Math.min(12, Math.ceil((s.pile || 0) / Math.max(1, s.unit / 3)));
        for (let k = 0; k < logs; k++) {
          const layer = k < 5 ? 0 : k < 9 ? 1 : 2;
          const idx = layer === 0 ? k : layer === 1 ? k - 5 : k - 9;
          const n = layer === 0 ? 5 : layer === 1 ? 4 : 3;
          const off = (idx - (n - 1) / 2) * 0.045;
          const [x, z] = localToWorld(b, lay.pile[0] + 0.02, lay.pile[1] + off);
          this.put('log', x, 0.012 + layer * 0.038, z, rot + 0.02 * (k % 3), 1);
        }
        continue;
      }
      // potager et champs
      const crops = ws.crops;
      s.beds.forEach((bed, k) => {
        const bd = lay.beds[k];
        if (!bd) return;
        const g = bed.ph === 3 ? 1 : bed.ph === 2 ? Math.min(1, bed.a / (s.unit || 1)) : 0;
        const crop = crops[bed.crop % crops.length];
        const pts = this.bedPoints(b, bd, crop);
        // terre bêchée (sillons)
        if (bed.ph >= 1) {
          if (b.type === 'garden') {
            const [x, z] = localToWorld(b, bd.x, (bd.z0 + bd.z1) / 2);
            this.put('furrow', x, 0.022, z, rot, bd.w * 0.8, 1, bd.z1 - bd.z0);
          } else {
            for (let r = 0; r < 5; r++) {
              const [x, z] = localToWorld(b, bd.x - bd.w / 2 + 0.08 + r * ((bd.w - 0.16) / 4), bd.z);
              this.put('furrow', x, 0.007, z, rot, 0.035, 1, bd.d * 0.92);
            }
          }
        }
        if (bed.ph < 2) return;
        // jeunes pousses, puis la plante qui grandit
        for (let j = 0; j < pts.length; j++) {
          const [x, z, jit] = pts[j];
          const yaw = jit * 6.28;
          const y = b.type === 'garden' ? 0.03 : 0.006;
          if (g < 0.12) {
            this.put('sprout', x, y, z, yaw, 0.6 + g * 4);
            continue;
          }
          const sc = 0.25 + 0.75 * g;
          if (crop === 'wheat') {
            const c = lerpHex(autumn ? 0x9fb04a : 0x79bf48, 0xe6c14a, Math.pow(Math.max(0, g - 0.45) / 0.55, 1.2));
            this.put('wheat', x, y, z, yaw, sc, sc * (0.9 + jit * 0.2), sc, winter ? lerpHex(c, 0xdfe6e4, 0.4) : c);
          } else if (crop === 'corn') {
            const c = lerpHex(0x5fae3e, 0xc8b45a, Math.max(0, g - 0.75) * 2.5);
            this.put('corn', x, y, z, yaw, sc, sc, sc, c);
            if (g > 0.72) this.put('cob', x, y, z, yaw, sc);
          } else {
            const [c0, c1] = CROP_COLORS[crop];
            const c = lerpHex(c0, c1, jit);
            this.put(crop, x, y, z, yaw, sc, sc, sc, winter ? lerpHex(c, 0xcfd9cf, 0.35) : c);
            if (crop === 'tomato' && g > 0.55) this.put('tomatoFruit', x, y, z, yaw, sc, sc, sc, lerpHex(0x7fbf48, 0xe53935, Math.min(1, (g - 0.55) * 2.6)));
            if (crop === 'carrot' && g > 0.7) this.put('carrotTop', x, y, z, yaw, 1);
            if (crop === 'potato' && g > 0.8) this.put('flower', x, y, z, yaw, sc);
          }
        }
      });
      // récolte déposée : cagettes ou sacs
      const n = Math.min(b.type === 'farm' ? 6 : 4, Math.ceil((s.pile || 0) / Math.max(0.5, s.unit)));
      for (let k = 0; k < n; k++) {
        const [x, z] = localToWorld(b, lay.pile[0] + (k % 3) * 0.07 - 0.07, lay.pile[1] + Math.floor(k / 3) * 0.07);
        if (b.type === 'farm') this.put('sack', x, 0.01, z, rot + k, 1);
        else this.put('crate', x, 0.02, z, rot + k * 0.3, 1);
      }
    }
    // troncs couchés que les bûcherons débitent
    for (const w of game.villagers.list) {
      if (w.act !== 'trim' || !w.target?.fell) continue;
      const f = w.target.fell;
      const len = 0.9 + (f.s - 1) * 0.5;
      const x = f.x + Math.sin(f.dir) * 0.2 * len, z = f.z + Math.cos(f.dir) * 0.2 * len;
      this.put('trunk', x, 0, z, f.dir - Math.PI / 2, len, 1, 1);
    }
    for (const k in this.meshes) {
      const e = this.meshes[k];
      e.m.count = e.n;
      e.m.instanceMatrix.needsUpdate = true;
      if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true;
    }
  }

  /** Emplacements des plantes d'une planche ou d'un champ (stables). */
  bedPoints(b, bd, crop) {
    const pts = [];
    if (b.type === 'garden') {
      const n = 5;
      for (let j = 0; j < n; j++) {
        const f = (j + 0.5) / n;
        const jit = hash2(b.id * 7 + j, Math.round(bd.x * 100), 3);
        const [x, z] = localToWorld(b, bd.x + (jit - 0.5) * 0.02, bd.z0 + (bd.z1 - bd.z0) * f);
        pts.push([x, z, jit]);
      }
      return pts;
    }
    const rows = crop === 'corn' ? 4 : 5, cols = crop === 'corn' ? 5 : 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jit = hash2(b.id * 13 + r * 31 + c, Math.round(bd.x * 100), 5);
        const lx = bd.x - bd.w / 2 + 0.08 + (r / (rows - 1)) * (bd.w - 0.16);
        const lz = bd.z - bd.d / 2 + 0.07 + (c / (cols - 1)) * (bd.d - 0.14) + (jit - 0.5) * 0.03;
        const [x, z] = localToWorld(b, lx, lz);
        pts.push([x, z, jit]);
      }
    }
    return pts;
  }
}

function lerpHex(a, b, t) {
  t = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

void hexToLin;
