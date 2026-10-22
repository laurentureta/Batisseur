// Végétation vivante : arbres, rochers, plantes d'eau, herbes et fleurs, en instances groupées par
// morceaux de carte (30 x 30 cases). Les arbres ondulent au vent, tremblent sous la hache, tombent,
// laissent une souche puis repoussent. Les morceaux éloignés passent en version simplifiée.
import * as THREE from 'three';
import { SIZE, ZONE, ZONES, T, DAY_SECONDS } from '../world/constants.js';
import { RING } from '../world/landscape.js';
import { GROW_DAYS } from '../world/Trees.js';
import { GeoBuilder, shade, mix } from './geom.js';
import { kit, kitReady, kitBox } from './kit.js';
import { makeCtx } from './models.js';
import { hash2 } from '../core/rng.js';
import { vegetationMaterial, vegetationDepthMaterial, VEG_UNIFORMS } from './shaders.js';

const HALF = SIZE / 2;
const pm = (a, n) => ((a % n) + n) % n; // modulo positif (la couronne a des coordonnées négatives)
const CH = 20; // côté d'un morceau, en cases
const DOMAIN = SIZE + 2 * RING; // carte + couronne
const NCH = Math.ceil(DOMAIN / CH);
const DIM = [0.67, 0.69, 0.68];
const LOD0_DIST = 31; // distance caméra → morceau pour les modèles détaillés
const DETAIL_DIST = 23; // herbes et fleurs (seulement de près)
const DETAIL_ZOOM = 36; // au-delà de ce recul, plus de petits détails
const ROCKS = ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'];
const LEAVES = [0x4caf3e, 0x5ab544, 0x3f9e3a, 0x6bbf4a];
const LEAVES_AUTUMN = [0xe58a2b, 0xd9682a, 0xf0b33a, 0xc9502a];

/** Géométrie Three à partir d'un calque GeoBuilder (+ hauteur du modèle). */
function toGeo(layer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(layer.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(layer.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(layer.col, 3));
  geo.computeBoundingBox();
  geo.userData.h = Math.max(0.05, geo.boundingBox.max.y);
  return geo;
}

/** Petit volume à 8 faces (cailloux, rochers lointains, têtes de fleurs). */
function octa(g, x, y, z, rx, h, rz, c, cTop = c) {
  const e = y + h * 0.32;
  const top = [x, y + h, z], bot = [x, y - h * 0.08, z];
  const px = [x + rx, e, z], nx = [x - rx, e, z], pz = [x, e, z + rz], nz = [x, e, z - rz];
  g.tri(top, pz, px, cTop);
  g.tri(top, px, nz, cTop);
  g.tri(top, nz, nx, cTop);
  g.tri(top, nx, pz, cTop);
  g.tri(bot, px, pz, c);
  g.tri(bot, nz, px, c);
  g.tri(bot, nx, nz, c);
  g.tri(bot, pz, nx, c);
}

/** Pyramide à 4 faces (fleur, baie) : se voit de partout pour très peu de triangles. */
function tetra(g, x, y, z, r, c) {
  const a = [x + r, y, z + r * 0.2], b = [x - r * 0.6, y, z + r * 0.8], d = [x - r * 0.4, y, z - r], top = [x, y + r * 1.3, z];
  g.tri(a, b, top, c);
  g.tri(b, d, top, c);
  g.tri(d, a, top, c);
  g.tri(a, d, b, c);
}

/* ───────── Bibliothèque de modèles (une géométrie par sorte, par niveau de détail, par saison) ───────── */
function buildKinds(season) {
  const ctx = makeCtx(0, season);
  const kitOn = kitReady();
  const kinds = {};
  const add = (name, lod0, lod1, opts = {}) => (kinds[name] = { name, lod0: toGeo(lod0.body), lod1: lod1 ? toGeo(lod1.body) : null, ...opts });
  const G = () => new GeoBuilder();
  // sapins (KayKit) et version simplifiée
  const pineLow = (c, snow) => {
    const g = G();
    g.cyl(0, 0, 0, 0.035, 0.16, 4, 0x6e4a2f);
    const leaf = snow ? mix(c, 0xeef3f6, 0.55) : c;
    g.cone(0, 0.1, 0, 0.2, 0.36, 5, leaf);
    g.cone(0, 0.3, 0, 0.14, 0.32, 5, shade(leaf, 1.12));
    return g;
  };
  const pineGreen = ctx.winter ? 0x3e7a4c : 0x3d8a4a;
  for (const [name, model, s] of [['pineA', 'tree_single_A', 0.6], ['pineB', 'tree_single_B', 0.52]]) {
    let g = G();
    if (kitOn) kit(g, model, { s, snow: ctx.snow, ao: 0.45 });
    else g = pineLow(pineGreen, ctx.winter);
    add(name, g, pineLow(pineGreen, ctx.winter), { wind: 1, tree: true, shadow: true });
  }
  for (const [name, model, c] of [['pineOrange', 'hw_tree_pine_orange_small', 0xe0832e], ['pineYellow', 'hw_tree_pine_yellow_small', 0xe9b43a]]) {
    let g = G();
    if (kitOn) kit(g, model, { s: 0.15, ao: 0.4 });
    else g = pineLow(c, false);
    add(name, g, pineLow(c, false), { wind: 1, tree: true, shadow: true });
  }
  // feuillus : quatre teintes
  for (let k = 0; k < 4; k++) {
    const roundTree = (low) => {
      const g = G();
      let c = (ctx.autumn ? LEAVES_AUTUMN : LEAVES)[k];
      if (ctx.spring) c = mix(c, 0x9ddc5a, 0.25);
      if (ctx.winter) c = mix(c, 0xeef3f6, 0.6);
      g.cyl(0, 0, 0, 0.035, 0.22, low ? 4 : 6, 0x7a4a32, 0.028);
      g.ico(0, 0.32, 0, 0.17, shade(c, 0.9), 0.9, low ? 0 : 0.28, k * 3 + 1);
      if (!low) g.ico(0.05, 0.42, -0.03, 0.11, shade(c, 1.12), 0.9, 0.25, k * 5 + 2);
      return g;
    };
    add('round' + k, roundTree(false), roundTree(true), { wind: 1, tree: true, shadow: true });
  }
  // souches
  for (const [name, model] of [['stumpA', 'tree_single_A_cut'], ['stumpB', 'tree_single_B_cut']]) {
    const g = G();
    if (kitOn) kit(g, model, { s: 0.6, snow: ctx.snow, ao: 0.4 });
    else g.cyl(0, 0, 0, 0.05, 0.06, 6, 0x8a5a3a);
    add(name, g, null, { shadow: true });
  }
  // rochers (et leur version lointaine à 8 faces)
  ROCKS.forEach((model, k) => {
    let g = G();
    if (kitOn) kit(g, model, { s: 1, snow: ctx.snow, ao: 0.5 });
    else g.ico(0, 0.04, 0, 0.1, ctx.winter ? 0xe4e8ea : 0x9a9a92, 0.65, 0.35, k + 3);
    const low = G();
    const bb = kitOn ? kitBox(model) : [-0.1, 0, -0.1, 0.1, 0.12, 0.1];
    const grey = [0x9c9a90, 0x8f8d84, 0xa5a398, 0x96948a, 0x8a887f][k];
    octa(low, (bb[0] + bb[3]) / 2, 0, (bb[2] + bb[5]) / 2, (bb[3] - bb[0]) * 0.5, bb[4] * 0.95, (bb[5] - bb[2]) * 0.5, grey, ctx.winter ? 0xe8edf0 : shade(grey, 1.08));
    add('rock' + k, g, low, { shadow: true });
  });
  // plantes d'eau
  if (kitOn) {
    for (const [name, model] of [['lilyA', 'waterlily_A'], ['lilyB', 'waterlily_B'], ['reedA', 'waterplant_A'], ['reedB', 'waterplant_B'], ['reedC', 'waterplant_C']]) {
      const g = G();
      kit(g, model, { s: 1, ao: 0.3 });
      add(name, g, null, { wind: name.startsWith('reed') ? 0.6 : 0 });
    }
  }
  // herbes, fleurs, buissons, champignons, cailloux (faits main, très légers : vus des deux côtés)
  const grassCol = ctx.winter ? 0xdfe8e4 : ctx.autumn ? 0xb8a24a : ctx.spring ? 0x7fcf48 : 0x6fb83c;
  const blade = (g, x, z, h, c, lean = 0.02) => {
    const w = 0.014;
    const a = hash2(Math.round(x * 997), Math.round(z * 991), 3) * 6.283;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    g.tri([x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + Math.cos(a + 1.57) * lean, h, z + Math.sin(a + 1.57) * lean], c);
  };
  {
    const g = G();
    for (let k = 0; k < 8; k++) {
      const a = k * 2.4, r = 0.02 + (k % 3) * 0.03;
      blade(g, Math.cos(a) * r, Math.sin(a) * r, 0.05 + (k % 4) * 0.013, shade(grassCol, 0.82 + (k % 3) * 0.1));
    }
    add('grass', g, null, { wind: 1, detail: true });
  }
  const flowerPatch = (cols) => {
    const g = G();
    for (let k = 0; k < 5; k++) {
      const a = k * 2.1 + 0.3, r = 0.025 + (k % 3) * 0.03;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.05 + (k % 2) * 0.02;
      blade(g, x, z, h, shade(grassCol, 0.9), 0.004);
      tetra(g, x, h - 0.006, z, 0.011, cols[k % cols.length]);
    }
    blade(g, 0.01, -0.02, 0.04, shade(grassCol, 0.8));
    blade(g, -0.03, 0.01, 0.035, shade(grassCol, 0.95));
    return g;
  };
  if (!ctx.winter) {
    add('flowersA', flowerPatch(ctx.autumn ? [0xe9a23b, 0xd9682a] : [0xffe14d, 0xffffff, 0xffc93a]), null, { wind: 1, detail: true });
    add('flowersB', flowerPatch(ctx.autumn ? [0xc9502a, 0x9c3f8a] : [0xff6fa8, 0xb36bff, 0xff4f5a]), null, { wind: 1, detail: true });
  }
  {
    const g = G();
    const c = ctx.winter ? 0xdfe8e4 : ctx.autumn ? 0x9aa83e : 0x4f9e38;
    g.ico(0, 0.05, 0, 0.075, shade(c, 0.95), 0.75, 0.3, 7);
    g.ico(0.055, 0.035, 0.03, 0.05, shade(c, 1.1), 0.75, 0.3, 9);
    if (!ctx.winter && !ctx.autumn) for (const [x, z] of [[0.02, 0.065], [-0.055, 0.03], [0.07, -0.01]]) tetra(g, x, 0.06, z, 0.01, 0xff5a6a);
    add('bush', g, null, { wind: 0.5, detail: true });
  }
  {
    const g = G();
    for (const [x, z, s] of [[0, 0, 1], [0.05, 0.03, 0.72]]) {
      g.cyl(x, 0, z, 0.008 * s, 0.03 * s, 4, 0xf3ead8, 0.008 * s, false);
      g.cone(x, 0.028 * s, z, 0.03 * s, 0.024 * s, 6, 0xd9362b);
    }
    add('mushrooms', g, null, { detail: true });
  }
  {
    const g = G();
    const c = ctx.winter ? 0xe4e8ea : 0xa09f95;
    octa(g, 0, 0, 0, 0.032, 0.03, 0.026, c, shade(c, 1.1));
    octa(g, 0.05, 0, 0.025, 0.022, 0.022, 0.02, shade(c, 0.9), c);
    add('pebbles', g, null, { detail: true });
  }
  return kinds;
}

export class Vegetation {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.mat = vegetationMaterial();
    this.detailMat = vegetationMaterial({ side: THREE.DoubleSide });
    this.depthMat = vegetationDepthMaterial();
    this.plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.kinds = null;
    this.season = -1;
    this.chunks = [];
    this.dirty = new Set();
    this.treeSlot = new Map(); // id d'arbre -> { grp, idx }
    this.shakes = new Map(); // id -> début de la secousse (s de jeu)
    this.epochDay = 0;
    this.time = 0;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /** Secondes de jeu (depuis le chargement : petites valeurs, précises dans le shader). */
  gameSeconds(day) {
    return (day - this.epochDay) * DAY_SECONDS;
  }

  build(world, ring, season) {
    this.world = world;
    this.ring = ring;
    this.epochDay = Math.floor(world.state.time.day);
    this.clear();
    if (season !== this.season || !this.kinds) {
      this.disposeKinds();
      this.kinds = buildKinds(season);
      this.season = season;
    }
    VEG_UNIFORMS.uGrowDur.value = GROW_DAYS * DAY_SECONDS;
    for (let cz = 0; cz < NCH; cz++) {
      for (let cx = 0; cx < NCH; cx++) {
        const x0 = cx * CH - RING, z0 = cz * CH - RING;
        const c = {
          cx, cz, x0, z0, x1: Math.min(x0 + CH, SIZE + RING), z1: Math.min(z0 + CH, SIZE + RING), groups: new Map(),
          center: new THREE.Vector3(x0 + CH / 2 - HALF, 0, z0 + CH / 2 - HALF), lod: -1, detail: -1,
        };
        this.chunks.push(c);
        this.buildChunk(c);
      }
    }
    if (world.trees) world.trees.changed.clear();
  }

  disposeKinds() {
    if (!this.kinds) return;
    for (const k of Object.values(this.kinds)) {
      k.lod0.dispose();
      k.lod1?.dispose();
    }
    this.kinds = null;
  }

  clear() {
    for (const c of this.chunks) this.clearChunk(c);
    this.chunks = [];
    this.treeSlot.clear();
    this.dirty.clear();
  }

  clearChunk(c) {
    for (const grp of c.groups.values()) {
      for (const m of [grp.mesh0, grp.mesh1]) {
        if (!m) continue;
        this.group.remove(m);
        m.geometry.dispose();
        m.dispose();
      }
      if (grp.items) for (const it of grp.items) if (it.tree && this.treeSlot.get(it.tree.id)?.grp === grp) this.treeSlot.delete(it.tree.id);
    }
    c.groups.clear();
  }

  setSeason(season) {
    if (season === this.season) return;
    this.disposeKinds();
    this.kinds = buildKinds(season);
    this.season = season;
    for (const c of this.chunks) this.dirty.add(c);
  }

  chunkOfTile(x, z) {
    const cx = Math.floor((x + RING) / CH), cz = Math.floor((z + RING) / CH);
    if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return null;
    return this.chunks[cz * NCH + cx];
  }

  /** Cases modifiées (terrain, routes, bâtiments) : on reconstruit les morceaux concernés. */
  markTiles(tiles) {
    for (const i of tiles) {
      const c = this.chunkOfTile(i % SIZE, (i / SIZE) | 0);
      if (c) this.dirty.add(c);
    }
  }

  markAll() {
    for (const c of this.chunks) this.dirty.add(c);
  }

  /** Zone débloquée : les couleurs « grisées » changent. */
  markZone(zi) {
    const zx = (zi % ZONES) * ZONE, zz = Math.floor(zi / ZONES) * ZONE;
    for (const c of this.chunks) if (zx < c.x1 && zx + ZONE > c.x0 && zz < c.z1 && zz + ZONE > c.z0) this.dirty.add(c);
  }

  /* ───────── Construction d'un morceau ───────── */
  buildChunk(c) {
    this.clearChunk(c);
    const w = this.world, ring = this.ring;
    const lists = new Map(); // sorte -> [{ x, y, z, s, rot, dim, tree, bright }]
    const push = (kind, it) => {
      if (!this.kinds[kind]) return;
      let l = lists.get(kind);
      if (!l) lists.set(kind, (l = []));
      l.push(it);
    };
    const winter = this.season === 3, autumn = this.season === 2;
    const day = w.state.time.day;
    for (let z = c.z0; z < c.z1; z++) {
      for (let x = c.x0; x < c.x1; x++) {
        const inside = x >= 0 && z >= 0 && x < SIZE && z < SIZE;
        let t, h, v, dim = false, free = true, i = -1;
        if (inside) {
          i = z * SIZE + x;
          t = w.terrain[i];
          h = w.height[i];
          v = w.variant[i];
          dim = !w.state.zones[Math.floor(z / ZONE) * ZONES + Math.floor(x / ZONE)];
          free = w.occ[i] < 0 && !w.road[i];
        } else {
          if (!ring?.ok) continue;
          const ri = (z + RING) * ring.W + (x + RING);
          t = ring.terrain[ri];
          if (t === 255) continue;
          h = ring.height[ri];
          v = ring.variant[ri];
          dim = true;
        }
        const px = x - HALF, pz = z - HALF;
        // arbres
        if (inside && w.trees) {
          const list = w.trees.tiles.get(i);
          if (list) {
            for (const tr of list) {
              const st = w.trees.stateOf(tr.id);
              let kind = tr.kind;
              if (autumn && kind !== 'round' && tr.salt % 5 < 3) kind = tr.salt % 2 ? 'pineOrange' : 'pineYellow';
              if (kind === 'round') kind = 'round' + (tr.salt % 4);
              const ty = tr.fixed && this.r.terrain?.surfaceAt ? this.r.terrain.surfaceAt(tr.x, tr.z) - 0.02 : tr.y;
              push(kind, { x: tr.x, y: ty, z: tr.z, s: tr.s, rot: tr.rot, dim, tree: tr, st, bright: 0.92 + hash2(tr.salt, 3, 9) * 0.16 });
              if (st?.s === 'cut') push(tr.kind === 'pineB' ? 'stumpB' : 'stumpA', { x: tr.x, y: tr.y, z: tr.z, s: tr.s, rot: tr.rot, dim, bright: 1 });
            }
          }
        } else if (t === T.FOREST) {
          const n = 1 + (v % 2);
          for (let k = 0; k < n; k++) {
            const salt = x * 13 + z * 7 + k;
            const pine = hash2(x, z + k, 5) > 0.42;
            let kind = pine ? (pm(salt, 8) === 0 ? 'pineB' : 'pineA') : 'round' + pm(salt, 4);
            if (autumn && pine && pm(salt, 5) < 3) kind = pm(salt, 2) ? 'pineOrange' : 'pineYellow';
            push(kind, { x: px + 0.2 + hash2(x * 3 + k, z * 5, 77) * 0.6, y: 0, z: pz + 0.2 + hash2(x * 7, z * 3 + k, 91) * 0.6, s: 0.9 + hash2(x + k, z, 13) * 0.6, rot: (salt * 2.399) % 6.283, dim, bright: 0.95 });
          }
        }
        if (t === T.ROCK) {
          const n = 1 + (v % 2) + (v % 7 === 0 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const r = hash2(x + k, z + k, 9);
            push('rock' + pm(x * 7 + z * 3 + k, ROCKS.length), { x: px + 0.2 + hash2(x * 5 + k, z * 3, 21) * 0.6, y: 0, z: pz + 0.2 + hash2(x, z * 7 + k, 33) * 0.6, s: 1.3 + r * 1.1, rot: hash2(x, z, k) * 6.28, dim, bright: 1 });
          }
        } else if (t === T.MOUNTAIN) {
          const r = hash2(x, z, 404);
          const ground = (qx, qz) => this.r.terrain?.surfaceAt ? this.r.terrain.surfaceAt(qx, qz) : h;
          if (!inside && h < 1.7 && r < 0.42) {
            const qx = px + 0.3 + hash2(x, z, 1) * 0.4, qz = pz + 0.3 + hash2(z, x, 2) * 0.4;
            push('pineA', { x: qx, y: ground(qx, qz) - 0.02, z: qz, s: 0.75, rot: r * 20, dim, bright: 0.95 });
          } else if (r > 0.86) {
            const qx = px + 0.25 + hash2(x, z, 3) * 0.5, qz = pz + 0.25 + hash2(z, x, 4) * 0.5;
            push('rock' + pm(x + z, ROCKS.length), { x: qx, y: ground(qx, qz) - 0.03, z: qz, s: 1.2 + hash2(z, x, 5), rot: r * 20, dim, bright: 1 });
          }
        } else if (t === T.WATER && !winter && hash2(x, z, 515) < 0.16 && this.nearLand(x, z)) {
          const names = ['lilyA', 'lilyB', 'reedA', 'lilyA', 'reedB', 'reedC'];
          const n = names[pm(x * 3 + z, names.length)];
          const lily = n.startsWith('lily');
          push(n, { x: px + 0.25 + hash2(x, z, 6) * 0.5, y: lily ? -0.058 : -0.16, z: pz + 0.25 + hash2(z, x, 7) * 0.5, s: lily ? 1.6 : 1.4, rot: hash2(x, z, 8) * 6.28, dim, bright: 1 });
        }
        // détails (seulement sur les cases libres)
        if (!free) continue;
        const d1 = hash2(x, z, 1201), d2 = hash2(x, z, 1307), d3 = hash2(z, x, 1409);
        const dx = 0.15 + hash2(x, z, 1511) * 0.7, dz = 0.15 + hash2(z, x, 1613) * 0.7;
        const base = { x: px + dx, y: 0, z: pz + dz, s: 0.8 + d3 * 0.6, rot: d2 * 6.28, dim, bright: 0.9 + d1 * 0.2 };
        if (t === T.GRASS) {
          if (d1 < 0.5) push('grass', base);
          const fl = hash2(Math.floor(x / 4), Math.floor(z / 4), 1777);
          if (fl > 0.62 && d2 < 0.55) push(d3 < 0.5 ? 'flowersA' : 'flowersB', { ...base, x: px + 1 - dx, z: pz + 1 - dz });
          if (d3 < 0.035) push('bush', { ...base, x: px + 0.5, z: pz + 0.5, s: 0.9 + d1 * 0.5 });
          if (d2 > 0.96) push('pebbles', { ...base, x: px + 1 - dx, z: pz + dz });
        } else if (t === T.FOREST) {
          if (d1 < 0.18) push('mushrooms', base);
          if (d2 < 0.22) push('bush', { ...base, x: px + 1 - dx, z: pz + 1 - dz, s: 0.8 + d1 * 0.4 });
          if (d3 < 0.3) push('grass', { ...base, x: px + dz, z: pz + dx });
        } else if (t === T.ROCK) {
          if (d1 < 0.4) push('pebbles', base);
          if (d2 < 0.3) push('grass', { ...base, x: px + 1 - dx, z: pz + 1 - dz });
        }
      }
    }
    for (const [kind, items] of lists) this.makeGroup(c, this.kinds[kind], items, day);
  }

  nearLand(x, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      let t;
      if (nx >= 0 && nz >= 0 && nx < SIZE && nz < SIZE) t = this.world.terrain[nz * SIZE + nx];
      else {
        const ring = this.ring;
        const rx = nx + RING, rz = nz + RING;
        if (!ring?.ok || rx < 0 || rz < 0 || rx >= ring.W || rz >= ring.W) continue;
        t = ring.terrain[rz * ring.W + rx];
      }
      if (t !== T.WATER && t !== T.DEEP && t !== 255) return true;
    }
    return false;
  }

  makeGroup(c, kind, items, day) {
    const n = items.length;
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const info = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const state = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    state.setUsage(THREE.DynamicDrawUsage);
    const grp = { kind, items, matrix, color, info, state, mesh0: null, mesh1: null, chunk: c };
    const M = this.tmpM, Q = this.tmpQ, S = this.tmpS, P = this.tmpP;
    const h = kind.lod0.userData.h;
    for (let k = 0; k < n; k++) {
      const it = items[k];
      Q.setFromAxisAngle(this.up, it.rot);
      S.setScalar(it.s);
      P.set(it.x, it.y, it.z);
      M.compose(P, Q, S);
      M.toArray(matrix.array, k * 16);
      const b = it.bright ?? 1;
      if (it.dim) color.setXYZ(k, DIM[0] * b, DIM[1] * b, DIM[2] * b);
      else color.setXYZ(k, b, b, b);
      info.setXYZW(k, h, (it.x * 1.37 + it.z * 0.91) % 6.283, it.rot, it.s);
      this.writeState(state, k, it.tree, it.st, day);
      if (it.tree) this.treeSlot.set(it.tree.id, { grp, idx: k });
    }
    const mk = (geo, lod) => {
      if (!geo) return null;
      const g = geo.clone();
      g.setAttribute('aInfo', info);
      g.setAttribute('aState', state);
      const mat = kind.detail ? this.detailMat : kind.wind || kind.tree ? this.mat : this.plainMat;
      const mesh = new THREE.InstancedMesh(g, mat, n);
      mesh.instanceMatrix = matrix;
      mesh.instanceColor = color;
      mesh.count = n;
      if (kind.wind || kind.tree) mesh.customDepthMaterial = this.depthMat;
      mesh.castShadow = !!kind.shadow && lod === 0 && !kind.detail;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.visible = false;
      mesh.userData.lod = lod;
      this.group.add(mesh);
      return mesh;
    };
    grp.mesh0 = mk(kind.lod0, 0);
    grp.mesh1 = kind.lod1 ? mk(kind.lod1, 1) : null;
    c.groups.set(kind.name, grp);
    c.lod = -1;
    return grp;
  }

  /** État d'un arbre dans le shader (debout, coupé / en train de tomber, repousse). */
  writeState(attr, k, tree, st, day) {
    if (!tree) {
      attr.setXYZW(k, 0, -100, 0, 0);
      return;
    }
    if (!st) {
      const sh = this.shakes.get(tree.id);
      attr.setXYZW(k, 0, sh ?? -100, 0, 0);
    } else if (st.s === 'cut') {
      attr.setXYZW(k, 1, -100, this.gameSeconds(st.t), st.dir ?? tree.rot);
    } else {
      attr.setXYZW(k, 2, this.gameSeconds(st.t), 0, 0);
    }
  }

  /** Un coup de hache : l'arbre tremble. */
  shake(id) {
    const day = this.world.state.time.day;
    const now = this.gameSeconds(day);
    this.shakes.set(id, now);
    const slot = this.treeSlot.get(id);
    if (!slot) return;
    const st = this.world.trees.stateOf(id);
    if (st) return;
    slot.grp.state.setXYZW(slot.idx, 0, now, 0, 0);
    slot.grp.state.addUpdateRange(slot.idx * 4, 4);
    slot.grp.state.needsUpdate = true;
  }

  /** Arbres dont l'état a changé (abattu, repousse, adulte). */
  syncTrees() {
    const trees = this.world?.trees;
    if (!trees || !trees.changed.size) return;
    const day = this.world.state.time.day;
    for (const id of trees.changed) {
      const slot = this.treeSlot.get(id);
      const st = trees.stateOf(id);
      // une souche apparaît ou disparaît : on refait le morceau (rare)
      if (slot) {
        const tr = trees.get(id);
        this.writeState(slot.grp.state, slot.idx, tr, st, day);
        slot.grp.state.addUpdateRange(slot.idx * 4, 4);
        slot.grp.state.needsUpdate = true;
        if (!st || st.s === 'grow') this.dirty.add(slot.grp.chunk); // souche à retirer
        else this.stumpLater(slot.grp.chunk);
      }
    }
    trees.changed.clear();
  }

  /** La souche apparaît quand l'arbre a fini de tomber. */
  stumpLater(c) {
    setTimeout(() => this.dirty.add(c), 1600);
  }

  /* ───────── Chaque image ───────── */
  update(dt, cameraPos, weather, speed) {
    if (!this.world) return;
    const q = this.r.quality;
    const zoomOk = q !== 'low' && (this.r.cam?.distance ?? 0) < DETAIL_ZOOM;
    const lod0 = q === 'high' ? LOD0_DIST : q === 'medium' ? LOD0_DIST - 5 : LOD0_DIST - 11;
    const detailD = q === 'high' ? DETAIL_DIST : DETAIL_DIST - 4;
    this.time += dt;
    VEG_UNIFORMS.uTime.value = this.time;
    VEG_UNIFORMS.uGameTime.value = this.gameSeconds(this.world.state.time.day);
    const wTarget = weather === 'rain' ? 1.7 : weather === 'snow' ? 1.3 : weather === 'cloudy' ? 1.25 : 1;
    VEG_UNIFORMS.uWind.value += (wTarget - VEG_UNIFORMS.uWind.value) * Math.min(1, dt * 0.5);
    this.syncTrees();
    // reconstructions en attente (au plus deux morceaux par image)
    let n = 0;
    for (const c of this.dirty) {
      this.dirty.delete(c);
      this.buildChunk(c);
      if (++n >= 2) break;
    }
    // niveau de détail selon la distance à la caméra
    for (const c of this.chunks) {
      const dx = Math.max(0, Math.abs(cameraPos.x - c.center.x) - CH / 2);
      const dz = Math.max(0, Math.abs(cameraPos.z - c.center.z) - CH / 2);
      const d = Math.hypot(dx, dz, cameraPos.y * 0.85);
      const lod = d < lod0 ? 0 : 1;
      const detail = zoomOk && d < detailD ? 1 : 0;
      if (lod === c.lod && detail === c.detail) continue;
      c.lod = lod;
      c.detail = detail;
      for (const grp of c.groups.values()) {
        const isDetail = !!grp.kind.detail;
        if (grp.mesh1) {
          grp.mesh0.visible = lod === 0;
          grp.mesh1.visible = lod === 1;
        } else if (grp.mesh0) grp.mesh0.visible = isDetail ? detail === 1 : true;
      }
    }
  }
}
