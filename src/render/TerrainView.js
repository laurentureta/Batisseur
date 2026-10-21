// Terrain de la maquette : sol, montagnes, eau animée, forêts et rochers.
import * as THREE from 'three';
import { SIZE, N, T, ZONE } from '../world/constants.js';
import { GeoBuilder, shade, mix, hexToLin } from './geom.js';
import { makeCtx } from './models.js';
import { hash2 } from '../core/rng.js';

const HALF = SIZE / 2;
const BASE_Y = -1.1;

const C = {
  grass: [0x86c25a, 0x80bc54, 0x8ac85f, 0x7cb850],
  forest: 0x67a443,
  rock: 0x9fa592,
  sand: 0xe8d59c,
  bed: 0xcdb98a,
  deepBed: 0x8aa3ad,
  mountainLow: 0x8a9a62,
  mountain: 0x9a9486,
  mountainHigh: 0xa9a397,
  snow: 0xf2f5f8,
  soil: 0x8a6a48,
  soilDark: 0x6a4e35,
  waterSide: 0x3f8fc0,
};

export function topY(world, i) {
  const t = world.terrain[i];
  if (t === T.WATER) return -0.24;
  if (t === T.DEEP) return -0.42;
  if (t === T.MOUNTAIN) return world.height[i];
  return 0;
}

function seasonTint(c, kind, season) {
  if (season === 3) {
    if (kind === 'grass' || kind === 'forest') return mix(c, C.snow, 0.82);
    if (kind === 'rock') return mix(c, C.snow, 0.55);
    if (kind === 'sand') return mix(c, C.snow, 0.35);
    if (kind === 'mountain') return mix(c, C.snow, 0.7);
  } else if (season === 2) {
    if (kind === 'grass') return mix(c, 0xb9a54a, 0.35);
    if (kind === 'forest') return mix(c, 0xa07a36, 0.35);
  } else if (season === 0) {
    if (kind === 'grass') return mix(c, 0x96d66a, 0.18);
  }
  return c;
}

function dim(c) {
  // zone verrouillée : désaturée et plus sombre
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const f = 0.6;
  const nr = Math.round((r * 0.45 + l * 0.55) * f), ng = Math.round((g * 0.45 + l * 0.55) * f), nb = Math.round((b * 0.45 + l * 0.55) * f);
  return (nr << 16) | (ng << 8) | nb;
}

export class TerrainView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.84, flatShading: true,
      emissive: 0x0b3550, emissiveIntensity: 0.35, depthWrite: false,
    });
    this.treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.land = null;
    this.water = null;
    this.trees = [];
    this.time = 0;
  }

  build(world, season) {
    this.world = world;
    this.season = season;
    this.buildLand();
    this.buildWater();
    this.buildTrees();
  }

  dispose() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.geometry?.dispose();
    }
    this.trees = [];
  }

  tileColor(i, unlocked) {
    const w = this.world;
    const t = w.terrain[i];
    const v = w.variant[i];
    const s = this.season;
    let c;
    let kind = 'grass';
    if (t === T.GRASS) c = C.grass[v & 3];
    else if (t === T.FOREST) (c = C.forest), (kind = 'forest');
    else if (t === T.ROCK) (c = C.rock), (kind = 'rock');
    else if (t === T.SAND) (c = C.sand), (kind = 'sand');
    else if (t === T.WATER) (c = C.bed), (kind = 'bed');
    else if (t === T.DEEP) (c = C.deepBed), (kind = 'bed');
    else {
      const h = w.height[i];
      kind = 'mountain';
      c = h > 2.5 ? C.snow : h > 1.5 ? C.mountainHigh : h > 0.9 ? C.mountain : C.mountainLow;
    }
    c = seasonTint(c, kind, s);
    c = shade(c, 0.96 + ((v >> 2) & 7) * 0.012);
    if (!unlocked) c = dim(c);
    return c;
  }

  buildLand() {
    const w = this.world;
    const g = new GeoBuilder();
    const zones = w.state.zones;
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const i = z * SIZE + x;
        const unlocked = zones[Math.floor(z / ZONE) * 5 + Math.floor(x / ZONE)];
        const y = topY(w, i);
        const c = this.tileColor(i, unlocked);
        const x0 = x - HALF, x1 = x0 + 1, z0 = z - HALF, z1 = z0 + 1;
        g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c);
        // côtés
        const isM = w.terrain[i] === T.MOUNTAIN;
        const side = isM ? shade(c, 0.78) : unlocked ? C.soil : dim(C.soil);
        this._side(g, w, x, z - 1, y, side, unlocked, isM, [x1, z0], [x0, z0]); // nord
        this._side(g, w, x, z + 1, y, side, unlocked, isM, [x0, z1], [x1, z1]); // sud
        this._side(g, w, x - 1, z, y, side, unlocked, isM, [x0, z0], [x0, z1]); // ouest
        this._side(g, w, x + 1, z, y, side, unlocked, isM, [x1, z1], [x1, z0]); // est
      }
    }
    const geo = toGeometry(g.body);
    if (this.land) {
      this.group.remove(this.land);
      this.land.geometry.dispose();
    }
    this.land = new THREE.Mesh(geo, this.landMat);
    this.land.receiveShadow = true;
    this.land.castShadow = true;
    this.group.add(this.land);
  }

  /** Face verticale entre une case et sa voisine plus basse (ou le bord de la maquette). */
  _side(g, w, nx, nz, y, sideColor, unlocked, isM, a, b) {
    const q = (y0, y1, c) => g.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], c);
    if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) {
      // tranche de la maquette
      const c1 = unlocked ? C.soil : dim(C.soil);
      const c2 = unlocked ? C.soilDark : dim(C.soilDark);
      if (y < -0.1) {
        q(-0.55, y, c1);
        q(y, -0.07, unlocked ? C.waterSide : dim(C.waterSide));
      } else if (isM) {
        q(0, y, sideColor);
        q(-0.55, 0, c1);
      } else {
        q(y - 0.1, y, unlocked ? 0x6c9944 : dim(0x6c9944));
        q(-0.55, y - 0.1, c1);
      }
      q(BASE_Y, -0.55, c2);
      return;
    }
    const ny = topY(w, nz * SIZE + nx);
    if (ny >= y - 0.001) return;
    q(ny, y, sideColor);
  }

  buildWater() {
    const w = this.world;
    if (this.water) {
      this.group.remove(this.water);
      this.water.geometry.dispose();
    }
    // une grille couvrant les cases d'eau seulement (plus quelques bords)
    const pos = [];
    const col = [];
    const deep = hexToLin(0x2f86c2), shallow = hexToLin(0x5cc0e6), frozen = hexToLin(0xcfe6f1);
    this.waterVerts = [];
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const i = z * SIZE + x;
        const t = w.terrain[i];
        if (t !== T.WATER && t !== T.DEEP) continue;
        const c = this.season === 3 && t === T.WATER ? frozen : t === T.DEEP ? deep : shallow;
        const x0 = x - HALF, x1 = x0 + 1, z0 = z - HALF, z1 = z0 + 1;
        const quad = [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]];
        for (const [vx, vz] of quad) {
          pos.push(vx, -0.07, vz);
          col.push(c[0], c[1], c[2]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.group.add(this.water);
    this.frozen = this.season === 3;
  }

  buildTrees() {
    const w = this.world;
    for (const t of this.trees) {
      this.group.remove(t);
      t.geometry.dispose();
    }
    this.trees = [];
    const zones = w.state.zones;
    const ctx = makeCtx(0, this.season);
    // On regroupe les arbres de forêt et les rochers dans deux maillages fusionnés
    const g = new GeoBuilder();
    const preset = w.state.preset;
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const i = z * SIZE + x;
        const t = w.terrain[i];
        const unlocked = zones[Math.floor(z / ZONE) * 5 + Math.floor(x / ZONE)];
        g.tint = unlocked ? null : dim;
        if (t === T.FOREST) {
          const n = 2 + (w.variant[i] % 2);
          for (let k = 0; k < n; k++) {
            const hx = hash2(x * 3 + k, z * 5 - k, 77), hz = hash2(x * 7 - k, z * 3 + k, 91);
            const px = x - HALF + 0.18 + hx * 0.64, pz = z - HALF + 0.18 + hz * 0.64;
            const s = 0.85 + hash2(x + k, z, 13) * 0.55;
            const pineBias = preset === 'montagne' ? 0.35 : preset === 'cote' ? 0.6 : 0.55;
            const kind = hash2(x, z + k, 5) > pineBias ? 'pine' : 'round';
            treeAt(g, ctx, px, pz, s, kind, x * 13 + z * 7 + k);
          }
        } else if (t === T.ROCK) {
          const n = 1 + (w.variant[i] % 3);
          for (let k = 0; k < n; k++) {
            const hx = hash2(x * 5 + k, z * 3, 21), hz = hash2(x, z * 7 + k, 33);
            const px = x - HALF + 0.2 + hx * 0.6, pz = z - HALF + 0.2 + hz * 0.6;
            const r = 0.1 + hash2(x + k, z + k, 9) * 0.12;
            const c = this.season === 3 ? 0xe4e8ea : [0x9a9a92, 0x8c8b84, 0xa6a49a][k % 3];
            g.ico(px, r * 0.35, pz, r, c, 0.65, 0.35, x * 11 + z * 17 + k);
          }
        } else if (t === T.MOUNTAIN && w.height[i] < 1.3 && hash2(x, z, 404) < 0.35) {
          // quelques sapins sur les contreforts
          const px = x - HALF + 0.3 + hash2(x, z, 1) * 0.4, pz = z - HALF + 0.3 + hash2(z, x, 2) * 0.4;
          g.push(0, 0, w.height[i], 0);
          treeAt(g, ctx, px, pz, 0.8, 'pine', x + z);
          g.pop();
        }
      }
    }
    g.tint = null;
    const geo = toGeometry(g.body);
    const mesh = new THREE.Mesh(geo, this.treeMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.trees.push(mesh);
  }

  rebuildAll(season) {
    this.season = season;
    this.buildLand();
    this.buildWater();
    this.buildTrees();
  }

  update(dt) {
    this.time += dt;
    if (!this.water || this.frozen) return;
    const pos = this.water.geometry.attributes.position;
    const arr = pos.array;
    const t = this.time;
    for (let k = 0; k < arr.length; k += 3) {
      const x = arr[k], z = arr[k + 2];
      arr[k + 1] = -0.075 + Math.sin(x * 1.7 + t * 1.3) * 0.012 + Math.cos(z * 1.3 + t * 1.1) * 0.012;
    }
    pos.needsUpdate = true;
  }
}

function treeAt(g, ctx, x, z, s, kind, salt) {
  if (kind === 'pine') {
    g.cyl(x, 0, z, 0.035 * s, 0.12 * s, 5, 0x7a5232);
    const c = ctx.leaf(0x3d7d4a);
    g.cone(x, 0.08 * s, z, 0.17 * s, 0.3 * s, 6, c);
    g.cone(x, 0.22 * s, z, 0.12 * s, 0.24 * s, 6, shade(c, 1.1));
  } else {
    g.cyl(x, 0, z, 0.03 * s, 0.18 * s, 5, 0x7a5232);
    const c = ctx.leaf(salt % 2 ? 0x5aa83c : 0x4c9a35);
    g.ico(x, 0.28 * s, z, 0.15 * s, c, 0.95, 0.3, salt);
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
