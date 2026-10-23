// La vie sur l'eau : barques avec leur rameur, bateaux de pêche qui partent du ponton du pêcheur
// et y reviennent, voiliers sur les grands plans d'eau, péniches chargées qui remontent la rivière.
// Les bateaux suivent l'eau case par case (jamais sur la terre, jamais sous un pont), tanguent
// doucement et laissent un sillage d'écume.
import * as THREE from 'three';
import { SIZE, T } from '../world/constants.js';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { hash2 } from '../core/rng.js';
import { HumanPoser } from './humanPose.js';
import { pose } from './People.js';

const HALF = SIZE / 2;
const WATER_Y = -0.07;
const SKINS = [0xf2c9a6, 0xe8b48a, 0xc98b62, 0x8d5a3b, 0xf6d7c0];

/** Péniche : coque longue et plate, cabine à l'arrière, cargaison (caisses, tonneaux, bûches). */
function bargeGeo() {
  const g = new GeoBuilder();
  const hull = 0x4f6a8a, deck = 0xb98a5a, trim = 0xf2efe6;
  g.box(0, -0.02, 0, 0.3, 0.07, 1.1, { top: deck, side: hull });
  g.box(0, -0.02, 0.58, 0.24, 0.07, 0.08, { top: deck, side: hull });
  g.box(0, -0.02, -0.58, 0.26, 0.07, 0.08, { top: deck, side: hull });
  g.box(0, 0.045, 0, 0.31, 0.012, 1.12, trim);
  // cabine
  g.box(0, 0.05, -0.42, 0.22, 0.1, 0.2, { top: 0x7a8a9a, side: 0xead9bd });
  g.box(0, 0.15, -0.42, 0.25, 0.015, 0.23, 0x8a3b22);
  g.box(0.111, 0.08, -0.42, 0.002, 0.04, 0.12, 0x9fd0ea);
  g.box(-0.111, 0.08, -0.42, 0.002, 0.04, 0.12, 0x9fd0ea);
  g.cyl(0.06, 0.16, -0.46, 0.012, 0.06, 6, 0x3a3a40);
  // cargaison
  for (let k = 0; k < 3; k++) g.box(-0.06 + (k % 2) * 0.12, 0.05, -0.15 + k * 0.17, 0.1, 0.08, 0.12, k % 2 ? 0xc49a6c : 0xb38652);
  for (let k = 0; k < 2; k++) g.cyl(0.07 - k * 0.14, 0.05, 0.36, 0.04, 0.09, 8, 0x8a5a3a);
  g.cylZ(0, 0.12, 0.05, 0.025, 0.3, 7, 0x7a5232, 0xd9b47a);
  return toGeometry(g.body);
}

export class Boats {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.boats = [];
    this.meshes = {};
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.matSmooth = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.acc = 9;
    this.version = -1;
    this.time = 0;
    this.M = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.poser = null;
  }

  get world() {
    return this.r.world;
  }

  mesh(kind) {
    let m = this.meshes[kind];
    if (m) return m;
    const lib = this.r.crowd?.lib;
    let geo = null, mat = this.mat;
    if (kind === 'barge') (geo = bargeGeo()), (mat = this.matSmooth);
    else if (lib?.statics[kind]) geo = lib.statics[kind];
    if (!geo) return null;
    m = new THREE.InstancedMesh(geo, mat, 8);
    m.count = 0;
    m.castShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(m);
    this.meshes[kind] = m;
    return m;
  }

  clear() {
    this.boats = [];
    this.version = -1;
  }

  /* ───────── L'eau navigable ───────── */
  isWater(i) {
    const w = this.world, t = w.terrain[i];
    return (t === T.WATER || t === T.DEEP) && !w.road[i] && w.occ[i] < 0;
  }

  analyse() {
    const w = this.world, N = SIZE * SIZE;
    const body = new Int32Array(N).fill(-1);
    const bodies = [];
    for (let i = 0; i < N; i++) {
      if (body[i] >= 0 || !this.isWater(i)) continue;
      const id = bodies.length, tiles = [];
      const q = [i];
      body[i] = id;
      while (q.length) {
        const k = q.pop();
        tiles.push(k);
        const x = k % SIZE, z = (k / SIZE) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
          const j = nz * SIZE + nx;
          if (body[j] < 0 && this.isWater(j)) {
            body[j] = id;
            q.push(j);
          }
        }
      }
      // étendue : longue et fine (rivière) ou ramassée (lac, mer)
      let x0 = SIZE, x1 = 0, z0 = SIZE, z1 = 0, deep = 0;
      for (const k of tiles) {
        const x = k % SIZE, z = (k / SIZE) | 0;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
        if (w.terrain[k] === T.DEEP) deep++;
      }
      const span = Math.max(x1 - x0, z1 - z0) + 1;
      bodies.push({ id, tiles, size: tiles.length, river: tiles.length < span * 3.2, deep });
    }
    this.body = body;
    this.bodies = bodies;
  }

  /** Chemin sur l'eau (cases) de a vers b, ou null. */
  path(a, b) {
    if (a === b) return [a];
    const prev = new Map([[a, -1]]);
    const q = [a];
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      if (k === b) break;
      const x = k % SIZE, z = (k / SIZE) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
        const j = nz * SIZE + nx;
        if (prev.has(j) || !this.isWater(j)) continue;
        // en diagonale, il faut de l'eau des deux côtés (pas de raccourci par la rive)
        if (dx && dz && (!this.isWater(z * SIZE + nx) || !this.isWater(nz * SIZE + x))) continue;
        prev.set(j, k);
        q.push(j);
        if (q.length > 4000) return null;
      }
    }
    if (!prev.has(b)) return null;
    const out = [];
    for (let k = b; k !== -1; k = prev.get(k)) out.push(k);
    return out.reverse();
  }

  /** Points lissés au centre des cases. */
  smooth(tiles) {
    let pts = tiles.map((k) => [(k % SIZE) + 0.5 - HALF, ((k / SIZE) | 0) + 0.5 - HALF]);
    for (let it = 0; it < 2 && pts.length > 2; it++) {
      const out = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  /** Une case d'eau au hasard dans un plan d'eau (loin des rives pour un voilier). */
  randomTile(bd, rnd, inland = false) {
    for (let k = 0; k < 30; k++) {
      const t = bd.tiles[Math.floor(rnd() * bd.tiles.length)];
      if (!inland) return t;
      const x = t % SIZE, z = (t / SIZE) | 0;
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE || !this.isWater(nz * SIZE + nx)) ok = false;
      }
      if (ok) return t;
    }
    return bd.tiles[Math.floor(rnd() * bd.tiles.length)];
  }

  /* ───────── Qui navigue ───────── */
  sync() {
    const w = this.world;
    this.analyse();
    const want = [];
    let seed = (w.state.seed | 0) ^ 0x2a7b;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const bigs = this.bodies.filter((b) => b.size >= 12).sort((a, b) => b.size - a.size);
    const has = (type) => [...w.buildings.values()].some((b) => b.type === type && b.cons?.k !== 'new');
    // barques : une par plan d'eau, jusqu'à trois
    bigs.slice(0, 3).forEach((bd, k) => want.push({ key: `row${bd.id}`, kind: 'boat_row', body: bd.id, speed: 0.22, rower: true, rnd: k }));
    // voiliers sur les grandes étendues
    bigs.filter((b) => !b.river && b.size >= 90).slice(0, 2).forEach((bd) => {
      want.push({ key: `sail${bd.id}`, kind: 'boat_sail', body: bd.id, speed: 0.3, inland: true });
      if (bd.size > 400) want.push({ key: `sail${bd.id}b`, kind: 'boat_sail', body: bd.id, speed: 0.26, inland: true });
    });
    // péniches sur la rivière quand le village fait du commerce
    if (has('market') || has('warehouse') || has('storehouse')) bigs.filter((b) => b.river && b.size >= 30).slice(0, 1).forEach((bd) => want.push({ key: `barge${bd.id}`, kind: 'barge', body: bd.id, speed: 0.16, ends: true }));
    // bateaux de pêche : un par cabane de pêcheur au bord d'un plan d'eau
    for (const b of w.buildings.values()) {
      if (b.type !== 'fisher' || b.cons?.k === 'new') continue;
      const dock = this.dockOf(b);
      if (dock >= 0) want.push({ key: `fish${b.id}`, kind: 'boat_fish', body: this.body[dock], speed: 0.2, dock, home: b.id });
    }
    const keep = [];
    for (const d of want) {
      const old = this.boats.find((o) => o.key === d.key && o.body === d.body);
      if (old) {
        keep.push(old);
        continue;
      }
      const bd = this.bodies[d.body];
      if (!bd) continue;
      const start = d.dock ?? this.randomTile(bd, rnd, d.inland);
      const p = [(start % SIZE) + 0.5 - HALF, ((start / SIZE) | 0) + 0.5 - HALF];
      keep.push({ ...d, tile: start, x: p[0], z: p[1], dir: rnd() * 6.28, pts: null, k: 0, wait: rnd() * 4, state: 'idle', seed: (rnd() * 1e6) | 0 });
    }
    this.boats = keep;
  }

  /** Case d'eau près de la cabane d'un pêcheur (son ponton). */
  dockOf(b) {
    const w = this.world;
    const c = w.centerOf(b);
    let best = -1, bd = 9;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.floor(c.cx) + dx, z = Math.floor(c.cz) + dz;
      if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) continue;
      const i = z * SIZE + x;
      if (!this.isWater(i)) continue;
      const d = Math.hypot(x + 0.5 - c.cx, z + 0.5 - c.cz);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Prochain trajet d'un bateau. */
  plan(bt) {
    const bd = this.bodies[bt.body];
    if (!bd) return;
    const rnd = () => hash2(bt.seed, Math.floor(this.time * 7) + bt.k * 13, 61);
    let target;
    if (bt.kind === 'boat_fish') {
      // au large pour pêcher, puis retour au ponton
      if (bt.state === 'fishing' || bt.state === 'idle' && bt.tile !== bt.dock) target = bt.dock;
      else {
        let best = bt.dock;
        for (let k = 0; k < 12; k++) {
          const t = bd.tiles[Math.floor(rnd() * bd.tiles.length * 0.999)];
          const d = Math.abs((t % SIZE) - (bt.dock % SIZE)) + Math.abs(((t / SIZE) | 0) - ((bt.dock / SIZE) | 0));
          if (d >= 3 && d <= 9) {
            best = t;
            break;
          }
        }
        target = best;
      }
    } else if (bt.ends) {
      // la péniche va d'un bout à l'autre de la rivière
      bt.leg = (bt.leg || 0) + 1;
      const tiles = bd.tiles;
      const a = tiles[0], b = tiles[tiles.length - 1];
      let far = a, fd = -1;
      for (let k = 0; k < tiles.length; k += 3) {
        const t = tiles[k];
        const d = Math.abs((t % SIZE) - (bt.tile % SIZE)) + Math.abs(((t / SIZE) | 0) - ((bt.tile / SIZE) | 0));
        if (d > fd) {
          fd = d;
          far = t;
        }
      }
      target = far;
      void b;
    } else target = this.randomTile(bd, rnd, bt.inland);
    const p = this.path(bt.tile, target);
    if (!p || p.length < 2) {
      bt.wait = 3;
      return;
    }
    bt.pts = this.smooth(p);
    bt.pts[0] = [bt.x, bt.z];
    bt.seg = 0;
    bt.f = 0;
    bt.target = target;
    bt.k++;
  }

  /* ───────── Chaque image ───────── */
  update(dt, speed) {
    const w = this.world;
    if (!w || !this.r.crowd) return;
    this.time += dt;
    this.acc += dt;
    if (this.acc > 3 || this.version !== w.version) {
      if (this.version !== w.version || this.acc > 20) {
        this.sync();
        this.version = w.version;
      }
      this.acc = 0;
    }
    const sp = Math.max(0.3, Math.min(2.5, speed || 0.5));
    const night = this.r.night || 0;
    for (const k in this.meshes) this.meshes[k].count = 0;
    const cam = this.r.cam;
    for (const bt of this.boats) {
      // la nuit, les bateaux restent amarrés (sauf les péniches)
      const rest = night > 0.65 && bt.kind !== 'barge';
      if (!bt.pts) {
        bt.wait -= dt * sp;
        if (bt.wait <= 0 && !rest) this.plan(bt);
        if (bt.kind === 'boat_fish' && bt.state === 'fishing' && bt.wait <= 0) bt.state = 'back';
      } else {
        // avance le long du trajet
        let move = bt.speed * dt * sp;
        while (move > 0 && bt.pts) {
          const a = bt.pts[bt.seg], b = bt.pts[bt.seg + 1];
          if (!b) {
            bt.tile = bt.target;
            bt.pts = null;
            if (bt.kind === 'boat_fish') {
              bt.state = bt.tile === bt.dock ? 'idle' : 'fishing';
              bt.wait = bt.state === 'fishing' ? 10 + hash2(bt.seed, bt.k, 3) * 12 : 8 + hash2(bt.seed, bt.k, 4) * 10;
            } else bt.wait = bt.ends ? 6 : 3 + hash2(bt.seed, bt.k, 5) * 8;
            break;
          }
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4;
          const left = len * (1 - bt.f);
          if (move < left) {
            bt.f += move / len;
            move = 0;
          } else {
            move -= left;
            bt.seg++;
            bt.f = 0;
          }
          const c = bt.pts[bt.seg], d = bt.pts[bt.seg + 1] || c;
          bt.x = c[0] + (d[0] - c[0]) * bt.f;
          bt.z = c[1] + (d[1] - c[1]) * bt.f;
          if (d !== c) {
            const want = Math.atan2(d[0] - c[0], d[1] - c[1]);
            let dd = want - bt.dir;
            while (dd > Math.PI) dd -= Math.PI * 2;
            while (dd < -Math.PI) dd += Math.PI * 2;
            bt.dir += dd * Math.min(1, dt * 2.5);
          }
        }
        // sillage
        if (bt.pts && Math.random() < dt * 6 && (bt.x - cam.target.x) ** 2 + (bt.z - cam.target.z) ** 2 < 900) {
          const bx = bt.x - Math.sin(bt.dir) * 0.3, bz = bt.z - Math.cos(bt.dir) * 0.3;
          this.r.particles.emit('splash', bx + (Math.random() - 0.5) * 0.08, WATER_Y + 0.02, bz + (Math.random() - 0.5) * 0.08, 1);
        }
      }
      this.draw(bt);
    }
    for (const k in this.meshes) {
      const m = this.meshes[k];
      if (m.count) m.instanceMatrix.needsUpdate = true;
      m.visible = m.count > 0;
    }
  }

  draw(bt) {
    const m = this.mesh(bt.kind);
    if (!m) return;
    if (m.count >= m.instanceMatrix.count) return;
    const t = this.time + (bt.seed % 100) * 0.1;
    const moving = !!bt.pts;
    const heel = bt.kind === 'boat_sail' ? 0.08 + Math.sin(t * 0.4) * 0.03 : 0;
    this.e.set(Math.sin(t * 1.3) * 0.025 + (moving ? -0.02 : 0), bt.dir, Math.sin(t * 1.1 + 1) * 0.03 + heel, 'YXZ');
    this.q.setFromEuler(this.e);
    const sink = bt.kind === 'boat_sail' ? 0.035 : bt.kind === 'boat_fish' ? 0.03 : bt.kind === 'barge' ? 0 : 0.02;
    this.v.set(bt.x, WATER_Y - sink + Math.sin(t * 1.7) * 0.006, bt.z);
    this.M.compose(this.v, this.q, this.s.setScalar(1));
    m.setMatrixAt(m.count++, this.M);
    if (bt.rower) this.drawRower(bt, t);
  }

  /** Le rameur : assis, il tire sur les rames. */
  drawRower(bt, t) {
    const crowd = this.r.crowd;
    if (!this.poser) this.poser = new HumanPoser(crowd.lib);
    if (!this.poser.ok) return;
    const cam = this.r.camera.position;
    if ((cam.x - bt.x) ** 2 + (cam.z - bt.z) ** 2 > 40 * 40) return;
    const f = this.fig || (this.fig = { anim: 'row', t: 0, phase: 0, seed: 1 });
    f.anim = bt.pts ? 'row' : 'rowRest';
    f.t = t;
    f.seed = bt.seed % 97;
    const P = pose(f, this.time);
    const rig = crowd.rig('human');
    this.poser.pose(rig, f, P, this.time);
    const model = ['bald_m', 'casual_m', 'casual_f', 'old_m'][bt.seed % 4];
    const lod = (cam.x - bt.x) ** 2 + (cam.y + 0.0) ** 2 + (cam.z - bt.z) ** 2 < 100 ? 0 : 1;
    const slot = crowd.add(model, lod);
    if (!slot) return;
    const [e, i] = slot;
    // assis sur le banc, face à l'arrière (on rame en tirant)
    rig.writeSkin(e.stage, i * e.nb * 12, bt.x - Math.sin(bt.dir) * 0.05, WATER_Y + 0.01 + Math.sin(t * 1.7) * 0.006, bt.z - Math.cos(bt.dir) * 0.05, bt.dir + Math.PI, 0.92);
    crowd.tint(e, i, 1, SKINS[bt.seed % SKINS.length]);
    crowd.tint(e, i, 3, [0x3f7fd1, 0xe94b5a, 0x2a9d8f, 0xf2c94c][bt.seed % 4]);
  }
}
