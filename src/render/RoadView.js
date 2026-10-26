// Routes : chemins de terre, routes pavées et ponts, avec raccords automatiques.
import * as THREE from 'three';
import { SIZE, T, ZONE, ZONES } from '../world/constants.js';
import { GeoBuilder, mix } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { kit, kitReady } from './kit.js';
import { isPavedRoad } from '../data/buildings.js';

const HALF = SIZE / 2;

export class RoadView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffd27a, emissiveIntensity: 0 });
    this.meshes = new Array(ZONES * ZONES).fill(null);
    this.lamps = new Array(ZONES * ZONES).fill(null);
    this.dirty = new Set();
    this.season = 1;
  }

  build(world, season) {
    this.world = world;
    this.season = season;
    for (let zi = 0; zi < ZONES * ZONES; zi++) this.dirty.add(zi);
    this.flush();
  }

  markTiles(indices) {
    for (const i of indices) {
      const x = i % SIZE, z = (i / SIZE) | 0;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
        this.dirty.add(Math.floor(nz / ZONE) * ZONES + Math.floor(nx / ZONE));
      }
    }
  }

  markAll() {
    for (let zi = 0; zi < ZONES * ZONES; zi++) this.dirty.add(zi);
  }

  flush() {
    for (const zi of this.dirty) this.rebuildZone(zi);
    this.dirty.clear();
  }

  rebuildZone(zi) {
    const w = this.world;
    const g = new GeoBuilder();
    const zx = (zi % ZONES) * ZONE, zz = Math.floor(zi / ZONES) * ZONE;
    for (let z = zz; z < zz + ZONE; z++) {
      for (let x = zx; x < zx + ZONE; x++) {
        const i = z * SIZE + x;
        const type = w.road[i];
        if (!type) continue;
        // Les allées s'étendent jusqu'au seuil des bâtiments adjacents.
        const occupied = (dx, dz) => w.inside(x + dx, z + dz) && w.occ[w.idx(x + dx, z + dz)] >= 0;
        const entrances = (occupied(0, -1) ? 1 : 0) | (occupied(1, 0) ? 2 : 0)
          | (occupied(0, 1) ? 4 : 0) | (occupied(-1, 0) ? 8 : 0);
        this.tile(g, x, z, type, w.roadMask(x, z), w.terrain[i] === T.WATER || w.terrain[i] === T.DEEP, entrances);
      }
    }
    for (const list of [this.meshes, this.lamps]) {
      const old = list[zi];
      if (old) {
        this.group.remove(old);
        old.geometry.dispose();
        list[zi] = null;
      }
    }
    if (g.glass.count) {
      const lm = new THREE.Mesh(toGeometry(g.glass), this.glassMat);
      this.group.add(lm);
      this.lamps[zi] = lm;
    }
    if (!g.body.count) return;
    const mesh = new THREE.Mesh(toGeometry(g.body), this.mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
    this.meshes[zi] = mesh;
  }

  update(night) {
    this.glassMat.emissiveIntensity = night * 1.3;
  }

  /** Lampadaire sur le trottoir (s'allume la nuit). */
  lamp(g, x, z, rot) {
    const s = 0.62;
    kit(g, 'c_streetlight', { s, x, z, rot, ao: 0.3, snow: this.season === 3 ? 0.6 : 0, noGlass: true });
    const c = Math.cos(rot), sn = Math.sin(rot);
    const lx = -0.21 * s;
    g.layer('glass');
    g.box(x + lx * c, 0.885 * s, z - lx * sn, 0.07 * s, 0.03 * s, 0.06 * s, 0xfff1c2);
    g.layer('body');
  }

  tile(g, x, z, type, mask, bridge, entrances = 0) {
    const cx = x + 0.5 - HALF, cz = z + 0.5 - HALF;
    const winter = this.season === 3;
    g.push(0, cx, 0, cz);
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    if (bridge) {
      const deck = isPavedRoad(type) ? 0xb9b4aa : 0xa77b4f;
      const y = 0.06;
      const any = N || S || E || W;
      if (N || S || !any) g.box(0, y, 0, 0.62, 0.05, N || S ? 1.0 : 0.62, deck);
      if (E || W) g.box(0, y, 0, 1.0, 0.05, 0.62, deck);
      const rail = isPavedRoad(type) ? 0xd6d1c6 : 0x7a5535;
      const vertical = (N || S) && !(E || W);
      const horizontal = (E || W) && !(N || S);
      if (vertical || (!horizontal && !vertical)) {
        g.box(-0.32, y + 0.05, 0, 0.04, 0.08, 1.0, rail);
        g.box(0.32, y + 0.05, 0, 0.04, 0.08, 1.0, rail);
      }
      if (horizontal) {
        g.box(0, y + 0.05, -0.32, 1.0, 0.08, 0.04, rail);
        g.box(0, y + 0.05, 0.32, 1.0, 0.08, 0.04, rail);
      }
      for (const [px, pz] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]]) g.box(px, -0.25, pz, 0.06, 0.31, 0.06, isPavedRoad(type) ? 0x9e9a90 : 0x6e4a2f);
      g.pop();
      return;
    }
    if (!isPavedRoad(type)) {
      const c = winter ? 0xe9e4da : type === 3 ? 0xb9b1a0 : type === 5 ? 0xd6c6a1 : 0xc9a46c;
      const edge = winter ? 0xd9d2c5 : type === 3 ? 0x928b7b : type === 5 ? 0xa19b7d : 0xb08c58;
      const wd = type === 1 ? 0.5 : type === 3 ? 0.62 : 0.72, y = 0.004, h = 0.018;
      g.box(0, y, 0, wd, h, wd, { top: c, side: edge });
      const connected = mask | entrances;
      const end = 0.25 + wd / 4, reach = 0.5 - wd / 2;
      if (connected & 1) g.box(0, y, -end, wd, h, reach, { top: c, side: edge });
      if (connected & 4) g.box(0, y, end, wd, h, reach, { top: c, side: edge });
      if (connected & 8) g.box(-end, y, 0, reach, h, wd, { top: c, side: edge });
      if (connected & 2) g.box(end, y, 0, reach, h, wd, { top: c, side: edge });
      // Le seuil déborde légèrement sur la parcelle pour rejoindre le perron.
      if (entrances & 1) g.box(0, y, -0.54, wd, h, 0.2, c);
      if (entrances & 4) g.box(0, y, 0.54, wd, h, 0.2, c);
      if (entrances & 8) g.box(-0.54, y, 0, 0.2, h, wd, c);
      if (entrances & 2) g.box(0.54, y, 0, 0.2, h, wd, c);
      // petits cailloux
      g.box(0.13, y + h, 0.09, 0.04, 0.008, 0.03, edge);
      g.box(-0.1, y + h, -0.12, 0.03, 0.008, 0.04, edge);
      if (type === 3) for (const [px, pz] of [[-0.18, 0.14], [0.23, -0.12], [0.02, 0.24]]) g.box(px, y + h, pz, 0.035, 0.005, 0.04, 0xded7c7);
      if (type === 5) {
        // Dalles claires et liserés de jardin.
        for (const p of [-0.22, 0, 0.22]) g.box(p, y + h, 0, 0.018, 0.003, 0.55, edge);
        g.box(-wd / 2 + 0.03, y + h, 0, 0.04, 0.006, wd, 0x719c66);
        g.box(wd / 2 - 0.03, y + h, 0, 0.04, 0.006, wd, 0x719c66);
      }
    } else {
      const base = type === 4 ? 0x968d83 : type === 6 ? 0x414851 : 0x5d6066;
      const asphalt = winter ? mix(base, 0xffffff, 0.25) : base;
      const walk = winter ? 0xe6e8ea : type === 4 ? 0xcbbdac : 0xcac6bc;
      const y = 0.004, h = 0.022;
      g.box(0, y, 0, 0.8, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      const connected = mask | entrances;
      if (connected & 1) g.box(0, y, -0.45, 0.8, h, 0.1, { top: asphalt, side: 0x4a4d52 });
      if (connected & 4) g.box(0, y, 0.45, 0.8, h, 0.1, { top: asphalt, side: 0x4a4d52 });
      if (connected & 8) g.box(-0.45, y, 0, 0.1, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      if (connected & 2) g.box(0.45, y, 0, 0.1, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      // Trottoir d'accès au bâtiment : l'entrée touche réellement la chaussée.
      if (entrances & 1) g.box(0, y, -0.55, 0.68, h, 0.2, walk);
      if (entrances & 4) g.box(0, y, 0.55, 0.68, h, 0.2, walk);
      if (entrances & 8) g.box(-0.55, y, 0, 0.2, h, 0.68, walk);
      if (entrances & 2) g.box(0.55, y, 0, 0.2, h, 0.68, walk);
      // trottoirs aux coins et sur les côtés sans raccord
      const sw = 0.1, sh = 0.035;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(sx * 0.45, y, sz * 0.45, sw, sh, sw, walk);
      if (!(connected & 1)) g.box(0, y, -0.45, 0.8, sh, sw, walk);
      if (!(connected & 4)) g.box(0, y, 0.45, 0.8, sh, sw, walk);
      if (!(connected & 8)) g.box(-0.45, y, 0, sw, sh, 0.8, walk);
      if (!(connected & 2)) g.box(0.45, y, 0, sw, sh, 0.8, walk);
      if (type === 4) {
        for (let a = -0.28; a <= 0.3; a += 0.2) {
          g.box(a, y + h, 0, 0.012, 0.003, 0.75, 0xc3baae);
          g.box(0, y + h, a, 0.75, 0.003, 0.012, 0xc3baae);
        }
      }
      // marquage central pour les lignes droites
      const line = type === 6 ? 0xf9c94b : 0xf2f0e6;
      if (type !== 4 && N && S && !E && !W) for (const o of [-0.3, 0.05, 0.4]) g.box(0, y + h, o - 0.05, type === 6 ? 0.045 : 0.03, 0.003, 0.18, line);
      else if (type !== 4 && E && W && !N && !S) for (const o of [-0.3, 0.05, 0.4]) g.box(o - 0.05, y + h, 0, 0.18, 0.003, type === 6 ? 0.045 : 0.03, line);
      // lampadaires réguliers le long des lignes droites
      if (kitReady() && (x * 7 + z * 3) % 3 === 0) {
        const side = (x + z) % 2 ? 1 : -1;
        if (N && S && !E && !W) this.lamp(g, side * 0.45, 0, side > 0 ? 0 : Math.PI);
        else if (E && W && !N && !S) this.lamp(g, 0, side * 0.45, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    g.pop();
  }
}
