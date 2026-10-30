// Le monde : cases de terrain, routes, bâtiments et zones.
import { SIZE, ZONE, ZONES, N, T, TERRAIN_BY_NAME, TERRAIN_NAMES, CENTER_ZONE, zoneRing } from './constants.js';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { TreeField } from './Trees.js';

export class World {
  /**
   * @param {object} state  état sauvegardable de la partie
   * @param {{terrain:Uint8Array,height:Float32Array,variant:Uint8Array,road:Uint8Array}} gen
   */
  constructor(state, gen) {
    this.state = state;
    this.size = SIZE;
    this.N = N;
    this.terrain = gen.terrain;
    this.height = gen.height;
    this.variant = gen.variant;
    this.road = gen.road || new Uint8Array(N);
    this.field = gen.field || null; // fonctions du monde (paysage autour de la carte)
    this.occ = new Int32Array(N).fill(-1);
    this.buildings = new Map();
    this.version = 1; // change à chaque modification (routes, bâtiments, terrain)
    this.terrainVersion = 1;
    for (const b of state.buildings) this._add(b);
    this.trees = new TreeField(this); // chaque arbre de la carte (abattu, souche, repousse)
  }

  idx(x, z) {
    return z * SIZE + x;
  }
  xOf(i) {
    return i % SIZE;
  }
  zOf(i) {
    return (i / SIZE) | 0;
  }
  inside(x, z) {
    return x >= 0 && z >= 0 && x < SIZE && z < SIZE;
  }

  zoneIndex(x, z) {
    return Math.floor(z / ZONE) * ZONES + Math.floor(x / ZONE);
  }
  zoneOfIndex(i) {
    return this.zoneIndex(i % SIZE, (i / SIZE) | 0);
  }
  zoneUnlocked(x, z) {
    return !!this.state.zones[this.zoneIndex(x, z)];
  }
  zoneRect(zi) {
    const zx = zi % ZONES, zz = Math.floor(zi / ZONES);
    return { x: zx * ZONE, z: zz * ZONE, w: ZONE, h: ZONE };
  }

  footprint(type, rot) {
    return sizeOf(BUILDINGS[type], rot);
  }

  tilesOf(b) {
    const [w, d] = this.footprint(b.type, b.rot);
    const out = [];
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) out.push(this.idx(b.x + dx, b.z + dz));
    return out;
  }

  /** Cases voisines (haut, bas, gauche, droite) autour de l'emprise. */
  perimeter(b) {
    return this.perimeterRect(b.x, b.z, ...this.footprint(b.type, b.rot));
  }

  perimeterRect(x, z, w, d) {
    const out = [];
    for (let dx = 0; dx < w; dx++) {
      if (this.inside(x + dx, z - 1)) out.push(this.idx(x + dx, z - 1));
      if (this.inside(x + dx, z + d)) out.push(this.idx(x + dx, z + d));
    }
    for (let dz = 0; dz < d; dz++) {
      if (this.inside(x - 1, z + dz)) out.push(this.idx(x - 1, z + dz));
      if (this.inside(x + w, z + dz)) out.push(this.idx(x + w, z + dz));
    }
    return out;
  }

  /** Centre d'un bâtiment, en coordonnées de cases (décimales). */
  centerOf(b) {
    const [w, d] = this.footprint(b.type, b.rot);
    return { cx: b.x + w / 2, cz: b.z + d / 2, w, d };
  }

  _add(b) {
    this.buildings.set(b.id, b);
    for (const i of this.tilesOf(b)) this.occ[i] = b.id;
  }

  addBuilding(b) {
    this._add(b);
    this.version++;
  }

  removeBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return null;
    for (const i of this.tilesOf(b)) if (this.occ[i] === id) this.occ[i] = -1;
    this.buildings.delete(id);
    this.version++;
    return b;
  }

  moveBuilding(id, x, z, rot) {
    const b = this.buildings.get(id);
    if (!b) return null;
    for (const i of this.tilesOf(b)) if (this.occ[i] === id) this.occ[i] = -1;
    b.x = x;
    b.z = z;
    b.rot = rot;
    for (const i of this.tilesOf(b)) this.occ[i] = id;
    this.version++;
    return b;
  }

  buildingAt(x, z) {
    if (!this.inside(x, z)) return null;
    const id = this.occ[this.idx(x, z)];
    return id >= 0 ? this.buildings.get(id) : null;
  }

  setRoad(i, type) {
    this.road[i] = type;
    this.version++;
  }

  setTerrain(i, t) {
    this.terrain[i] = t;
    this.terrainVersion++;
    this.version++;
    if (this.trees) this.trees.onTerrainChanged([i]);
  }

  townhall() {
    for (const b of this.buildings.values()) if (b.type === 'townhall') return b;
    return null;
  }

  /** Nombre de cases d'un type de terrain autour d'une emprise (distance de Tchebychev). */
  countTerrainAround(x, z, w, d, typeNames, radius) {
    const set = new Set(typeNames.map((n) => TERRAIN_BY_NAME[n]));
    let n = 0;
    for (let zz = z - radius; zz < z + d + radius; zz++) {
      for (let xx = x - radius; xx < x + w + radius; xx++) {
        if (!this.inside(xx, zz)) continue;
        if (xx >= x && xx < x + w && zz >= z && zz < z + d) continue;
        if (set.has(this.terrain[this.idx(xx, zz)])) n++;
      }
    }
    return n;
  }

  /** Masque des routes voisines : 1 = nord (z-1), 2 = est (x+1), 4 = sud (z+1), 8 = ouest (x-1). */
  roadMask(x, z) {
    let m = 0;
    if (z > 0 && this.road[this.idx(x, z - 1)]) m |= 1;
    if (x < SIZE - 1 && this.road[this.idx(x + 1, z)]) m |= 2;
    if (z < SIZE - 1 && this.road[this.idx(x, z + 1)]) m |= 4;
    if (x > 0 && this.road[this.idx(x - 1, z)]) m |= 8;
    return m;
  }

  /** Composition d'une zone (pour la fenêtre de déblocage). */
  zoneComposition(zi) {
    const r = this.zoneRect(zi);
    const counts = new Array(7).fill(0);
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) counts[this.terrain[this.idx(x, z)]]++;
    return counts;
  }

  zoneName(zi) {
    if (zi === CENTER_ZONE) return 'Cœur du village';
    const counts = this.zoneComposition(zi);
    const water = counts[T.WATER] + counts[T.DEEP];
    const rocky = counts[T.ROCK] + counts[T.MOUNTAIN];
    let word;
    if (counts[T.DEEP] > 30) word = 'Baie';
    else if (counts[T.MOUNTAIN] > 25) word = 'Mont';
    else if (water > 18) word = counts[T.SAND] > 12 ? 'Plage' : 'Lac';
    else if (counts[T.FOREST] > 35) word = 'Forêt';
    else if (rocky > 18) word = 'Rochers';
    else if (counts[T.FOREST] > 18) word = 'Bois';
    else if (counts[T.SAND] > 15) word = 'Dunes';
    else word = 'Prairie';
    const zx = zi % ZONES, zz = Math.floor(zi / ZONES);
    const c = (ZONES - 1) / 2;
    const ns = zz < c ? 'Nord' : zz > c ? 'Sud' : '';
    const ew = zx < c ? 'Ouest' : zx > c ? 'Est' : '';
    const dir = ns && ew ? `${ns}-${ew}` : ns || ew || 'Centre';
    const ring = zoneRing(zi);
    if (ring >= 5) return `${word} des Confins ${dir === 'Ouest' || dir === 'Est' ? 'de l\'' : 'du '}${dir}`;
    if (ring >= 3) return `${word} du Grand ${dir}`;
    const prep = dir === 'Ouest' || dir === 'Est' ? 'de l\'' : 'du ';
    return `${word} ${prep}${dir}`;
  }

  zoneDescription(zi) {
    const counts = this.zoneComposition(zi);
    const total = ZONE * ZONE;
    return counts
      .map((c, t) => ({ t, pct: Math.round((c / total) * 100), name: TERRAIN_NAMES[t] }))
      .filter((e) => e.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }

  /** Ce qu'une zone permet de bâtir qu'on ne peut pas bâtir n'importe où : l'argilière veut
      de l'eau ou du sable, la mine une montagne. Le détail de composition du terrain était
      déjà affiché, mais rien ne disait à quoi il servait — et comme la zone de départ n'a
      presque jamais d'eau, la chaîne de l'argile restait introuvable. */
  zoneOffers(zi) {
    const r = this.zoneRect(zi);
    const out = [];
    for (const def of Object.values(BUILDINGS)) {
      if (!def.near || def.notBuildable) continue;
      let found = false;
      for (let z = r.z; z < r.z + ZONE && !found; z++) {
        for (let x = r.x; x < r.x + ZONE; x++) {
          const t = this.terrain[this.idx(x, z)];
          if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN) continue;
          if (this.countTerrainAround(x, z, 1, 1, def.near.types, def.near.radius) === 0) continue;
          found = true;
          break;
        }
      }
      if (found) out.push(def);
    }
    return out.sort((a, b) => (a.unlock || 1) - (b.unlock || 1));
  }

  /** Une zone est achetable si elle touche une zone déjà débloquée. */
  zoneAdjacentUnlocked(zi) {
    const zx = zi % ZONES, zz = Math.floor(zi / ZONES);
    const nb = [[zx - 1, zz], [zx + 1, zz], [zx, zz - 1], [zx, zz + 1]];
    return nb.some(([x, z]) => x >= 0 && z >= 0 && x < ZONES && z < ZONES && this.state.zones[z * ZONES + x]);
  }

  /** Rectangle englobant des zones débloquées (pour limiter la caméra). */
  unlockedBounds() {
    let x0 = SIZE, z0 = SIZE, x1 = 0, z1 = 0;
    for (let zi = 0; zi < ZONES * ZONES; zi++) {
      if (!this.state.zones[zi]) continue;
      const r = this.zoneRect(zi);
      x0 = Math.min(x0, r.x);
      z0 = Math.min(z0, r.z);
      x1 = Math.max(x1, r.x + r.w);
      z1 = Math.max(z1, r.z + r.h);
    }
    return { x0, z0, x1, z1 };
  }

  countRoads(type = 0) {
    let n = 0;
    for (let i = 0; i < N; i++) if (type ? this.road[i] === type : this.road[i]) n++;
    return n;
  }
}
