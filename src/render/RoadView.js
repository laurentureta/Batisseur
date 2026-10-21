// Routes : chemins de terre, routes pavées et ponts, avec raccords automatiques.
import * as THREE from 'three';
import { SIZE, T, ZONE, ZONES } from '../world/constants.js';
import { GeoBuilder, mix } from './geom.js';
import { toGeometry } from './TerrainView.js';

const HALF = SIZE / 2;

export class RoadView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = new Array(ZONES * ZONES).fill(null);
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
        this.tile(g, x, z, type, w.roadMask(x, z), w.terrain[i] === T.WATER || w.terrain[i] === T.DEEP);
      }
    }
    const old = this.meshes[zi];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes[zi] = null;
    }
    if (!g.body.count) return;
    const mesh = new THREE.Mesh(toGeometry(g.body), this.mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes[zi] = mesh;
  }

  tile(g, x, z, type, mask, bridge) {
    const cx = x + 0.5 - HALF, cz = z + 0.5 - HALF;
    const winter = this.season === 3;
    g.push(0, cx, 0, cz);
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    if (bridge) {
      const deck = type === 2 ? 0xb9b4aa : 0xa77b4f;
      const y = 0.06;
      const any = N || S || E || W;
      if (N || S || !any) g.box(0, y, 0, 0.62, 0.05, N || S ? 1.0 : 0.62, deck);
      if (E || W) g.box(0, y, 0, 1.0, 0.05, 0.62, deck);
      const rail = type === 2 ? 0xd6d1c6 : 0x7a5535;
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
      for (const [px, pz] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]]) g.box(px, -0.25, pz, 0.06, 0.31, 0.06, type === 2 ? 0x9e9a90 : 0x6e4a2f);
      g.pop();
      return;
    }
    if (type === 1) {
      const c = winter ? 0xe9e4da : 0xc9a46c;
      const edge = winter ? 0xd9d2c5 : 0xb08c58;
      const wd = 0.5, y = 0.004, h = 0.018;
      g.box(0, y, 0, wd, h, wd, { top: c, side: edge });
      if (N) g.box(0, y, -0.375, wd, h, 0.25, { top: c, side: edge });
      if (S) g.box(0, y, 0.375, wd, h, 0.25, { top: c, side: edge });
      if (W) g.box(-0.375, y, 0, 0.25, h, wd, { top: c, side: edge });
      if (E) g.box(0.375, y, 0, 0.25, h, wd, { top: c, side: edge });
      // petits cailloux
      g.box(0.13, y + h, 0.09, 0.04, 0.008, 0.03, edge);
      g.box(-0.1, y + h, -0.12, 0.03, 0.008, 0.04, edge);
    } else {
      const asphalt = winter ? mix(0x5d6066, 0xffffff, 0.25) : 0x5d6066;
      const walk = winter ? 0xe6e8ea : 0xcac6bc;
      const y = 0.004, h = 0.022;
      g.box(0, y, 0, 0.8, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      if (N) g.box(0, y, -0.45, 0.8, h, 0.1, { top: asphalt, side: 0x4a4d52 });
      if (S) g.box(0, y, 0.45, 0.8, h, 0.1, { top: asphalt, side: 0x4a4d52 });
      if (W) g.box(-0.45, y, 0, 0.1, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      if (E) g.box(0.45, y, 0, 0.1, h, 0.8, { top: asphalt, side: 0x4a4d52 });
      // trottoirs aux coins et sur les côtés sans raccord
      const sw = 0.1, sh = 0.035;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(sx * 0.45, y, sz * 0.45, sw, sh, sw, walk);
      if (!N) g.box(0, y, -0.45, 0.8, sh, sw, walk);
      if (!S) g.box(0, y, 0.45, 0.8, sh, sw, walk);
      if (!W) g.box(-0.45, y, 0, sw, sh, 0.8, walk);
      if (!E) g.box(0.45, y, 0, sw, sh, 0.8, walk);
      // marquage central pour les lignes droites
      const line = 0xf2f0e6;
      if (N && S && !E && !W) for (const o of [-0.3, 0.05, 0.4]) g.box(0, y + h, o - 0.05, 0.03, 0.003, 0.18, line);
      else if (E && W && !N && !S) for (const o of [-0.3, 0.05, 0.4]) g.box(o - 0.05, y + h, 0, 0.18, 0.003, 0.03, line);
    }
    g.pop();
  }
}
