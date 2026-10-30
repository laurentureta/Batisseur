// Urbanisme du joueur automatique : une trame de rues autour de la mairie, et des parcelles
// qui bordent ces rues. Le but n'est pas de faire un beau village, c'est de bâtir comme un
// joueur ordinaire — tout relié à la mairie — pour que les mesures veuillent dire quelque chose.
import { BUILDINGS, sizeOf } from '../../src/data/buildings.js';
import { SIZE, T } from '../../src/world/constants.js';

const ROW = 4;    // une rue horizontale tous les quatre rangs
const ROWS = 30;  // jusqu'où le village peut s'étendre du nord au sud
const SPAN = 44;  // et d'est en ouest

export class Town {
  constructor(game) {
    this.g = game;
    const th = game.world.townhall();
    this.cx = th.x;
    this.cz = th.z + 2;   // la première rue passe devant la mairie
    this.rows = new Set();
    this.width = new Map();
    this.spineMin = this.cz;
    this.spineMax = this.cz;
  }

  get world() { return this.g.world; }

  /** Rue horizontale numéro k (k = 0 devant la mairie, puis alternativement au sud et au nord). */
  rowZ(k) {
    const s = k % 2 ? -1 : 1;
    return this.cz + s * ROW * Math.ceil(k / 2);
  }

  /** Trace la rue k si elle n'existe pas encore, et la relie à la dorsale. */
  openRow(k, width = 6) {
    if (this.rows.has(k)) return true;
    const z = this.rowZ(k);
    const roadType = this.bestRoad();
    const tiles = [];
    for (let x = this.cx - width; x <= this.cx + width; x++) {
      if (this.world.inside(x, z)) tiles.push(this.world.idx(x, z));
    }
    // la dorsale verticale relie la nouvelle rue à celles déjà tracées
    const z0 = Math.min(this.spineMin, z), z1 = Math.max(this.spineMax, z);
    for (let zz = z0; zz <= z1; zz++) {
      if (this.world.inside(this.cx, zz)) tiles.push(this.world.idx(this.cx, zz));
    }
    const res = this.g.actions.placeRoads(tiles, roadType);
    if (res?.ok === false) return false;
    this.rows.add(k);
    this.width.set(k, width);
    this.spineMin = z0;
    this.spineMax = z1;
    return true;
  }

  /** Allonge une rue existante de quelques cases : moins cher que d'en ouvrir une. */
  extendRow(k, by = 3) {
    const w = this.width.get(k) || 6;
    if (w > SPAN) return false;
    const z = this.rowZ(k);
    const tiles = [];
    for (let x = this.cx - w - by; x <= this.cx + w + by; x++) {
      if (!this.world.inside(x, z)) continue;
      if (Math.abs(x - this.cx) <= w) continue;        // déjà pavé
      tiles.push(this.world.idx(x, z));
    }
    if (!tiles.length) return false;
    const res = this.g.actions.placeRoads(tiles, this.bestRoad());
    if (res?.ok === false) return false;
    this.width.set(k, w + by);
    return true;
  }

  /** Le meilleur revêtement débloqué et abordable (le pavé compte pour une quête). */
  bestRoad() {
    const prog = this.g.prog;
    for (const t of [2, 1]) if (prog.roadUnlocked?.(t)) return t;
    return 1;
  }

  /** Les positions candidates pour une emprise w x d, le long des rues ouvertes. */
  slots(w, d) {
    const key = `${w}x${d}:${this.rows.size}`;
    let list = this._slots?.get(key);
    if (list) return list;
    list = [];
    for (let k = 0; k < ROWS; k++) {
      if (!this.rows.has(k)) continue;
      const z = this.rowZ(k);
      for (const zz of [z - d, z + 1]) {
        for (let off = 1; off <= SPAN; off++) {
          for (const s of [1, -1]) {
            const x = this.cx + s * off;
            if (x === this.cx) continue;             // la dorsale reste libre
            list.push([x, zz]);
          }
        }
      }
    }
    (this._slots ||= new Map()).set(key, list);
    return list;
  }

  /** L'emprise est-elle libre ? Test bon marché, avant d'appeler la validation complète. */
  clear(x, z, w, d) {
    const W = this.world;
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx, tz = z + dz;
        if (!W.inside(tx, tz)) return false;
        const i = W.idx(tx, tz);
        if (W.occ[i] >= 0 || W.road[i]) return false;
      }
    }
    return true;
  }

  /** Les cases buildables qui touchent une des terres demandées (eau, sable, montagne…).
      Sans ça le joueur automatique ne posait jamais d'argilière ni de mine : il ne bâtit que
      le long de ses rues, et ses rues sont toutes à l'intérieur des terres. Un vrai joueur,
      lui, va jusqu'à la rive. */
  shore(types, radius) {
    const key = types.join(',') + ':' + radius;
    let list = this._shore?.get(key);
    if (list) return list;
    const W = this.world;
    const want = new Set(types.map((t) => T[t.toUpperCase()]).filter((v) => v !== undefined));
    list = [];
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const i = W.idx(x, z);
        const t = W.terrain[i];
        if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN) continue;
        if (W.occ[i] >= 0 || W.road[i]) continue;
        let near = false;
        for (let dz = -radius; dz <= radius && !near; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (!W.inside(x + dx, z + dz)) continue;
            if (want.has(W.terrain[W.idx(x + dx, z + dz)])) { near = true; break; }
          }
        }
        if (near) list.push([x, z, (x - this.cx) ** 2 + (z - this.cz) ** 2]);
      }
    }
    list.sort((a, b) => a[2] - b[2]);   // le plus près du village d'abord
    list = list.slice(0, 400);          // au-delà, ce n'est plus un village mais une colonie
    (this._shore ||= new Map()).set(key, list);
    return list;
  }

  /** Cherche où poser `type` : une parcelle libre qui borde une rue. */
  spot(type) {
    const def = BUILDINGS[type];
    if (!def) return null;
    for (let rot = 0; rot < 2; rot++) {
      const [w, d] = sizeOf(def, rot);
      for (const [x, z] of this.slots(w, d)) {
        if (!this.clear(x, z, w, d)) continue;
        if (this.g.actions.checkPlacement(type, x, z, rot).ok) return { x, z, rot };
      }
      if (w === d) break;   // emprise carrée : la rotation ne change rien
    }
    // rien le long des rues : si le bâtiment réclame une ressource de terrain, on va la chercher
    if (def.near) {
      const [w, d] = sizeOf(def, 0);
      for (const [x, z] of this.shore(def.near.types, def.near.radius)) {
        if (!this.clear(x, z, w, d)) continue;
        if (this.g.actions.checkPlacement(type, x, z, 0).ok) return { x, z, rot: 0, away: true };
      }
    }
    return null;
  }

  /** Relie une parcelle isolée (argilière au bord de l'eau, mine au pied d'un mont) au
      réseau : sans route, un bâtiment ne tourne pas du tout. Chemin en L vers la dorsale. */
  connect(x, z, w, d) {
    const W = this.world;
    const tiles = [];
    const zr = z + d;                          // on longe le bâtiment par le sud
    const [x0, x1] = x < this.cx ? [x, this.cx] : [this.cx, x + w - 1];
    for (let xx = x0; xx <= x1; xx++) if (W.inside(xx, zr)) tiles.push(W.idx(xx, zr));
    const za = Math.min(zr, this.spineMin), zb = Math.max(zr, this.spineMax);
    for (let zz = za; zz <= zb; zz++) if (W.inside(this.cx, zz)) tiles.push(W.idx(this.cx, zz));
    const res = this.g.actions.placeRoads(tiles, this.bestRoad());
    if (res?.ok !== false) {
      this.spineMin = Math.min(this.spineMin, za);
      this.spineMax = Math.max(this.spineMax, zb);
    }
    return res?.ok !== false;
  }

  /** Fait de la place : on allonge d'abord ce qui existe, on n'ouvre une rue qu'ensuite. */
  grow() {
    for (const k of [...this.rows].sort((a, b) => a - b)) if (this.extendRow(k)) return true;
    for (let k = 0; k < ROWS; k++) if (!this.rows.has(k) && this.openRow(k)) return true;
    return false;
  }

  /** Une case de prairie libre, pour planter un arbre ou poser une décoration isolée. */
  freeGrass() {
    for (let r = 3; r < 22; r++) {
      for (let a = 0; a < 16; a++) {
        const x = this.cx + Math.round(Math.cos(a) * r), z = this.cz + Math.round(Math.sin(a) * r);
        if (!this.world.inside(x, z)) continue;
        const i = this.world.idx(x, z);
        if (this.world.occ[i] < 0 && !this.world.road[i] && this.world.terrain[i] === T.GRASS
            && this.world.zoneUnlocked(x, z)) return { x, z };
      }
    }
    return null;
  }
}
