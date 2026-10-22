// Les arbres de la carte : chaque case de forêt porte 2 ou 3 arbres (positions tirées du terrain).
// Un bûcheron peut réserver un arbre, l'abattre : il devient une souche, puis repousse.
// États sauvegardés : seulement les arbres coupés ou en train de repousser.
import { SIZE, N, T } from './constants.js';
import { hash2 } from '../core/rng.js';

export const STUMP_DAYS = 1.1; // temps passé à l'état de souche (jours de jeu)
export const GROW_DAYS = 1.6; // temps de repousse jusqu'à l'arbre adulte

const HALF = SIZE / 2;

/** Liste des arbres d'une case (sans état) : { id, i, x, z, s, kind, rot, y, fixed } en coordonnées du monde. */
export function treesForTile(world, i, preset) {
  const t = world.terrain[i];
  const x = i % SIZE, z = (i / SIZE) | 0;
  const out = [];
  if (t === T.FOREST) {
    const n = 2 + (world.variant[i] % 2);
    const pineBias = preset === 'montagne' ? 0.2 : preset === 'cote' ? 0.55 : 0.42;
    for (let k = 0; k < n; k++) {
      const hx = hash2(x * 3 + k, z * 5 - k, 77), hz = hash2(x * 7 - k, z * 3 + k, 91);
      const salt = x * 13 + z * 7 + k;
      const pine = hash2(x, z + k, 5) > pineBias;
      out.push({
        id: i * 4 + k, i,
        x: x - HALF + 0.18 + hx * 0.64, z: z - HALF + 0.18 + hz * 0.64, y: 0,
        s: 0.85 + hash2(x + k, z, 13) * 0.55,
        kind: pine ? (salt % 8 === 0 ? 'pineB' : 'pineA') : 'round',
        rot: (salt * 2.399) % 6.283, salt,
      });
    }
  } else if (t === T.MOUNTAIN) {
    const h = world.height[i];
    const r = hash2(x, z, 404);
    if (h < 1.3 && r < 0.35) {
      out.push({
        id: i * 4, i, fixed: true,
        x: x - HALF + 0.3 + hash2(x, z, 1) * 0.4, z: z - HALF + 0.3 + hash2(z, x, 2) * 0.4, y: h,
        s: 0.75, kind: 'pineA', rot: ((x + z) * 2.399) % 6.283, salt: x + z,
      });
    }
  }
  return out;
}

export class TreeField {
  constructor(world) {
    this.world = world;
    this.preset = world.state.preset;
    this.tiles = new Map(); // case -> arbres
    this.byId = new Map();
    this.states = new Map(); // id -> { s: 'cut' | 'grow', t: jour }
    this.reserved = new Map(); // id -> qui l'a réservé
    this.version = 0;
    this.changed = new Set(); // ids modifiés depuis le dernier affichage
    this.rebuild();
    this.load(world.state.trees);
  }

  rebuild() {
    this.tiles.clear();
    this.byId.clear();
    for (let i = 0; i < N; i++) this.deriveTile(i);
    this.version++;
  }

  deriveTile(i) {
    const old = this.tiles.get(i);
    if (old) for (const tr of old) this.byId.delete(tr.id);
    const list = treesForTile(this.world, i, this.preset);
    if (list.length) {
      this.tiles.set(i, list);
      for (const tr of list) this.byId.set(tr.id, tr);
    } else this.tiles.delete(i);
    // un arbre disparu n'a plus d'état
    for (let k = 0; k < 4; k++) {
      const id = i * 4 + k;
      if (!this.byId.has(id)) {
        this.states.delete(id);
        this.reserved.delete(id);
      }
    }
  }

  /** Après une modification du terrain (défrichage, plantation). */
  onTerrainChanged(tiles) {
    for (const i of tiles) this.deriveTile(i);
    this.version++;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  stateOf(id) {
    return this.states.get(id) || null;
  }

  /** L'arbre est-il debout et libre ? */
  available(id) {
    const tr = this.byId.get(id);
    return !!tr && !tr.fixed && !this.states.has(id) && !this.reserved.has(id);
  }

  /** Arbres debout et libres autour d'un point (rayon en cases), du plus proche au plus loin. */
  findNear(cx, cz, radius, max = 8) {
    const out = [];
    const tx = Math.floor(cx + HALF), tz = Math.floor(cz + HALF);
    const r = Math.ceil(radius);
    for (let z = tz - r; z <= tz + r; z++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) continue;
        const list = this.tiles.get(z * SIZE + x);
        if (!list) continue;
        for (const tr of list) {
          if (!this.available(tr.id)) continue;
          const d = Math.hypot(tr.x - cx, tr.z - cz);
          if (d <= radius + 0.5) out.push({ tr, d });
        }
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, max).map((o) => o.tr);
  }

  reserve(id, who) {
    if (!this.available(id)) return false;
    this.reserved.set(id, who);
    return true;
  }

  release(id, who) {
    if (this.reserved.get(id) === who) this.reserved.delete(id);
  }

  /** L'arbre tombe : il devient une souche (le jour de jeu est donné). */
  fell(id, day, dir) {
    this.reserved.delete(id);
    if (!this.byId.has(id)) return;
    this.states.set(id, { s: 'cut', t: day, dir });
    this.changed.add(id);
    this.version++;
  }

  /** Souches qui repoussent, jeunes arbres qui grandissent. */
  update(day) {
    for (const [id, st] of this.states) {
      if (st.s === 'cut' && day - st.t >= STUMP_DAYS) {
        st.s = 'grow';
        st.t = day;
        this.changed.add(id);
      } else if (st.s === 'grow' && day - st.t >= GROW_DAYS) {
        this.states.delete(id);
        this.changed.add(id);
      }
    }
  }

  /** Croissance d'un jeune arbre (0..1) ; 1 pour un arbre adulte. */
  growth(id, day) {
    const st = this.states.get(id);
    if (!st) return 1;
    if (st.s === 'cut') return 0;
    return Math.min(1, Math.max(0, (day - st.t) / GROW_DAYS));
  }

  save() {
    const out = [];
    for (const [id, st] of this.states) out.push([id, st.s === 'cut' ? 0 : 1, Math.round(st.t * 1000) / 1000]);
    return out;
  }

  load(list) {
    this.states.clear();
    if (!Array.isArray(list)) return;
    for (const [id, s, t] of list) if (this.byId.has(id)) this.states.set(id, { s: s ? 'grow' : 'cut', t });
  }
}
