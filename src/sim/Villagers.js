import { hasWorkshopQueue } from '../data/recipes.js';
// Les habitants qui travaillent. Chacun a un nom, une maison, un emploi et un emploi du temps :
// MAISON → TRAJET → TRAVAIL (récolte, transport, dépôt) → LOISIR → RETOUR.
//
// Les métiers « de terrain » (bûcheron, jardinier, fermier) sont simulés geste par geste :
// le bûcheron choisit un arbre debout, marche jusqu'à lui, l'abat, débite le tronc, rapporte
// les bûches et c'est le DÉPÔT qui fait monter le stock. Les potagers et les champs poussent
// avec le travail accumulé : labour, semis, arrosage, croissance, récolte, transport.
//
// Le travail accumulé (site.acc) vient de l'économie (Simulation) : on ne transporte jamais
// rien qui n'a pas été produit, on n'abat jamais un arbre déjà coupé.
// Les autres travailleurs suivent leur journée de façon abrégée (calculée à partir de l'heure).
import { BUILDINGS, workersAt, prodMult, sizeOf } from '../data/buildings.js';
import { DAY_SECONDS, SIZE, WORK_RATIO } from '../world/constants.js';
import { hash2 } from '../core/rng.js';
import { walkPath, roadPath, roadNextTo, makeMove, moveAt, tileCenter, roadPoints, tileAt, walkable } from './paths.js';
import { GATHER, WORKSHOPS, SHOPS, FARMS, pickSpot, roadTrip } from './jobs.js';

const HALF = SIZE / 2;
const ROT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const WALK = 0.52; // vitesse de marche (cases par seconde de jeu)

/**
 * Métiers « de terrain » : la production s'accumule sur le site et ce sont les travailleurs
 * qui la rapportent au stock (geste par geste).
 */
export const WORKSITES = {
  lumber: { role: 'lumberjack', res: 'wood', label: 'Bûcheron' },
  garden: { role: 'gardener', res: 'food', label: 'Jardinier', beds: () => 4, crops: ['carrot', 'tomato', 'potato'] },
  farm: { role: 'farmer', res: 'wheat', label: 'Fermier', beds: (lvl) => (lvl >= 3 ? 3 : 2), crops: ['wheat', 'corn'] },
  quarry: { role: 'miner', res: 'stone', label: 'Carrier', gather: true },
  mine: { role: 'miner', res: 'iron', label: 'Mineur', gather: true },
  claypit: { role: 'digger', res: 'clay', label: 'Glaiseur', gather: true },
  fisher: { role: 'fisher', res: 'food', label: 'Pêcheur', gather: true },
  coop: { role: 'breeder', res: 'food', label: 'Éleveuse', farm: true },
  pasture: { role: 'breeder', res: 'food', label: 'Éleveur', farm: true },
};

/**
 * Autres métiers suivis geste par geste (la production reste celle de l'économie) :
 * ateliers, commerces, charretier. detail : nombre de travailleurs animés au plus.
 */
export const ACTIVITIES = {
  sawmill: { role: 'craftsman', kind: 'workshop', detail: 2 },
  forge: { role: 'smith', kind: 'workshop', detail: 2 },
  brickworks: { role: 'craftsman', kind: 'workshop', detail: 2 },
  bakery: { role: 'cook', kind: 'workshop', detail: 2 },
  mill: { role: 'miller', kind: 'workshop', detail: 1 },
  market: { role: 'merchant', kind: 'shop', detail: 2 },
  shop: { role: 'merchant', kind: 'shop', detail: 1 },
  mall: { role: 'merchant', kind: 'shop', detail: 2 },
  tavern: { role: 'innkeeper', kind: 'shop', detail: 2 },
  depot: { role: 'carter', kind: 'carter', detail: 1 },
};

/** Métier affiché selon le bâtiment (les autres travaillent à l'intérieur). */
export function roleOf(type) {
  if (WORKSITES[type]) return WORKSITES[type].role;
  if (ACTIVITIES[type]) return ACTIVITIES[type].role;
  const def = BUILDINGS[type];
  if (!def) return 'worker';
  if (type === 'quarry' || type === 'mine' || type === 'claypit') return 'miner';
  if (type === 'fisher') return 'fisher';
  if (type === 'sawmill' || type === 'forge' || type === 'brickworks') return 'craftsman';
  if (type === 'bakery' || type === 'tavern') return 'cook';
  if (def.cat === 'commerce') return 'merchant';
  if (type === 'firestation') return 'firefighter';
  if (type === 'police') return 'guard';
  if (type === 'school' || type === 'library') return 'teacher';
  if (type === 'clinic' || type === 'hospital') return 'doctor';
  return 'worker';
}

export const ROLE_NAMES = {
  lumberjack: 'Bûcheron', gardener: 'Jardinier', farmer: 'Fermier', miner: 'Mineur', fisher: 'Pêcheur',
  craftsman: 'Artisan', cook: 'Cuisinier', merchant: 'Marchand', firefighter: 'Pompier', guard: 'Garde',
  teacher: 'Enseignant', doctor: 'Soignant', worker: 'Employé',
  digger: 'Glaiseur', breeder: 'Éleveur', carter: 'Charretier', miller: 'Meunier', innkeeper: 'Aubergiste', smith: 'Forgeron',
  builder: 'Bâtisseur',
};

const FIRST = ['Léa', 'Hugo', 'Emma', 'Louis', 'Jade', 'Gabriel', 'Louise', 'Arthur', 'Alice', 'Jules', 'Chloé', 'Lucas', 'Inès', 'Adam', 'Lina', 'Léo',
  'Rose', 'Paul', 'Anna', 'Nathan', 'Mia', 'Tom', 'Zoé', 'Victor', 'Manon', 'Raphaël', 'Camille', 'Sacha', 'Margaux', 'Noé', 'Clara', 'Martin',
  'Lou', 'Ethan', 'Juliette', 'Maël', 'Agathe', 'Basile', 'Céleste', 'Félix', 'Romane', 'Gaspard', 'Elsa', 'Simon', 'Iris', 'Marius', 'Nina', 'Oscar'];

export function villagerName(seed) {
  return FIRST[Math.floor(hash2(seed, 7, 99) * FIRST.length)];
}

/** Activités (pour la fiche du bâtiment). */
export const ACT_TEXT = {
  off: 'à la maison', toWork: 'en route vers le travail', toHome: 'rentre à la maison', leisure: 'se détend',
  idle: 'fait une pause', wait: 'attend', goTree: 'va vers un arbre', chop: 'abat un arbre', watch: 'regarde l\'arbre tomber',
  trim: 'débite le tronc', carry: 'rapporte la récolte', drop: 'dépose au stock', waitStore: 'attend de la place au stock',
  goBed: 'va au potager', till: 'bêche la terre', sow: 'sème', water: 'arrose', harvest: 'récolte', weed: 'désherbe', inside: 'travaille',
  goSpot: 'va au front de taille', pick: 'frappe la roche', dig: 'creuse l\'argile', goShore: 'va au bord de l\'eau',
  cast: 'lance sa ligne', fishWait: 'attend que ça morde', reel: 'remonte un poisson', feed: 'nourrit les bêtes', hay: 'apporte du foin',
  pour: 'remplit l\'abreuvoir', collect: 'ramasse les œufs', milk: 'trait une vache', goTask: 'va voir les bêtes',
  fetchIn: 'va chercher des matières premières', work: 'travaille à l\'établi', saw: 'scie des planches', smith: 'forge des outils',
  mold: 'moule des briques', knead: 'pétrit la pâte', carrySacks: 'porte des sacs', stack: 'range sa production', waitIn: 'attend des matières premières',
  serve: 'sert un client', arrange: 'range l\'étal', call: 'appelle les passants', tray: 'apporte une commande',
  toPile: 'part chercher une récolte', loadCart: 'charge la charrette', back: 'rentre au Grand Entrepôt', unloadCart: 'décharge au Grand Entrepôt', rest: 'se repose',
};

/** Point local d'un bâtiment (emprise centrée, façade vers +z) → scène. */
export function localToWorld(b, px, pz) {
  const def = BUILDINGS[b.type];
  const [w, d] = sizeOf(def, b.rot);
  const cx = b.x + w / 2 - HALF, cz = b.z + d / 2 - HALF;
  const [c, s] = ROT[b.rot & 3];
  return [px * c + pz * s + cx, -px * s + pz * c + cz];
}

/** Disposition des sites : tas de bûches, caisse de récolte, planches et champs (repère local). */
export function siteLayout(b) {
  const type = b.type;
  if (type === 'lumber') return { pile: [0.2, 0.18], drop: [0.04, 0.34], rest: [-0.08, 0.12] };
  if (type === 'garden') {
    const beds = [];
    for (let k = 0; k < 4; k++) beds.push({ x: -0.3 + k * 0.17, z0: -0.27, z1: 0.17, w: 0.11 });
    return { drop: [0.3, 0.32], pile: [0.36, 0.32], beds, rest: [0.3, -0.05] };
  }
  if (type === 'farm') {
    const beds = [{ x: -0.45, z: 0.4, w: 0.8, d: 0.9 }, { x: 0.5, z: 0.4, w: 0.8, d: 0.9 }];
    if (b.level >= 3) beds.push({ x: 0.5, z: -0.45, w: 0.78, d: 0.7 });
    return { drop: [0.12, -0.2], pile: [0.15, -0.32], beds, rest: [0.0, -0.08] };
  }
  if (type === 'quarry') return { drop: [0.16, 0.3], pile: [0.24, 0.2], rest: [0.05, 0.3] };
  if (type === 'mine') return { drop: [0.2, 0.42], pile: [0.3, 0.36], rest: [-0.2, 0.42] };
  if (type === 'claypit') return { drop: [0.28, 0.28], pile: [0.3, 0.36], rest: [-0.05, 0.3] };
  if (type === 'fisher') return { drop: [-0.08, 0.3], pile: [-0.25, 0.32], rest: [0.06, 0.34] };
  if (type === 'coop') return { drop: FARMS.coop.drop, pile: [0.36, 0.4], rest: [0.22, 0.3] };
  if (type === 'pasture') return { drop: FARMS.pasture.drop, pile: [-0.3, -0.12], rest: [-0.1, -0.05] };
  const W = WORKSHOPS[type];
  if (W) return { drop: W.outAt, pile: W.outAt, rest: W.stand };
  const S = SHOPS[type];
  if (S) return { drop: S.stand, rest: S.stand };
  if (type === 'depot') return { drop: [0.15, 0.82], pile: [-0.55, 0.8], rest: [0.62, 0.86] };
  return { drop: [0, 0.3], rest: [0, 0.2] };
}

export class Villagers {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.list = [];
    this.byJob = new Map(); // id du bâtiment -> travailleurs
    this.nextId = 1;
    this.version = 0; // change quand la liste change
    this.syncKey = '';
    this.unreachable = new Map(); // id d'arbre -> jour jusqu'auquel on l'évite
  }

  get world() {
    return this.game.world;
  }
  get st() {
    return this.game.state;
  }
  /** Secondes de jeu. */
  now() {
    return this.st.time.day * DAY_SECONDS;
  }
  hour() {
    const d = this.st.time.day;
    return (d - Math.floor(d)) * 24;
  }

  /* ───────── Sites de travail (stock local, planches, champs) ───────── */
  site(b) {
    const ws = WORKSITES[b.type];
    if (!ws) return null;
    if (!b.work || typeof b.work !== 'object') b.work = {};
    const s = b.work;
    if (s._lvl === b.level) return s;
    // (ré)initialisation : nouveau bâtiment, partie chargée ou amélioration
    s._lvl = b.level;
    if (!(s.acc >= 0)) s.acc = 0;
    if (!(s.pile >= 0)) s.pile = 0;
    s.reserved = 0;
    const def = BUILDINGS[b.type];
    const R = (def.produces[ws.res] || 0) * prodMult(b.level);
    const W = Math.max(1, workersAt(def, b.level));
    if (b.type === 'lumber') {
      // bois par arbre : de quoi suivre la production même avec les trajets
      s.unit = Math.max(8, Math.ceil(R / W / 1.5));
    } else if (ws.gather || ws.farm) {
      // une tournée rapporte de quoi suivre la production (trajets compris)
      s.unit = Math.max(2, Math.ceil(R / W / 2));
    } else {
      const B = ws.beds(b.level);
      if (!Array.isArray(s.beds)) s.beds = [];
      s.beds = s.beds.filter((bd) => bd && typeof bd === 'object');
      while (s.beds.length < B) s.beds.push({ ph: 0, a: 0, crop: s.beds.length % ws.crops.length });
      if (s.beds.length > B) s.beds.length = B;
      for (const bed of s.beds) {
        bed.res = -1;
        bed.ph = bed.ph | 0;
        bed.a = bed.a > 0 ? bed.a : 0;
        bed.crop = bed.crop | 0;
      }
      s.unit = Math.max(1, Math.round((R / B / 1.4) * 10) / 10);
      for (const bed of s.beds) if (bed.a > s.unit) bed.a = s.unit;
    }
    s.cap = Math.max(s.unit * 2, R * 1.2);
    return s;
  }

  /** Production de l'économie → travail accumulé sur le site (appelé par la simulation). */
  accumulate(b, add) {
    if (hasWorkshopQueue(this.st,b.id)) return true;
    const s = this.site(b);
    if (!s) return false;
    s.acc = Math.min(s.cap, s.acc + add);
    return s.acc >= s.cap - 1e-6;
  }

  /** Ressource produite mais pas encore rapportée (pour la fiche et les tests). */
  buffered(res) {
    let n = 0;
    for (const b of this.world.buildings.values()) {
      const ws = WORKSITES[b.type];
      if (!ws || ws.res !== res || !b.work) continue;
      n += b.work.acc || 0;
      if (b.work.beds) for (const bed of b.work.beds) n += bed.a || 0;
    }
    return n;
  }

  /**
   * Stock vide : on puise dans ce qui a été produit sur place (on mange au potager, le moulin prend
   * le blé à la ferme). Renvoie la quantité prise.
   */
  takeBuffered(res, amount) {
    let taken = 0;
    for (const b of this.world.buildings.values()) {
      if (taken >= amount) break;
      if (this.game.city?.hasRoute(b.id)) continue;
      const ws = WORKSITES[b.type];
      if (!ws || ws.res !== res || !b.work) continue;
      const s = b.work;
      const free = Math.max(0, s.acc - (s.reserved || 0));
      const t = Math.min(free, amount - taken);
      s.acc -= t;
      taken += t;
      if (s.beds) {
        for (const bed of s.beds) {
          if (taken >= amount) break;
          if (bed.res >= 0 || !(bed.a > 0)) continue;
          const t2 = Math.min(bed.a, amount - taken);
          bed.a -= t2;
          taken += t2;
          if (bed.ph === 3 && bed.a < s.unit) bed.ph = 2;
        }
      }
    }
    return taken;
  }

  /* ───────── Qui travaille où ───────── */
  /** Après chaque recalcul de l'économie : on embauche ou on libère des travailleurs. */
  sync() {
    const world = this.world, sim = this.game.sim;
    if (!world) return;
    const d = sim.d;
    const want = new Map();
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.workers) continue;
      const inf = sim.info.get(b.id);
      if (!inf || !inf.connected || b.fire || inf.status === 'unpaid' || inf.status === 'building') continue;
      const W = workersAt(def, b.level);
      const staff = inf.staff ?? 1;
      let n = Math.round(W * staff);
      if (WORKSITES[b.type] && inf.eff > 0) n = Math.max(1, n); // il faut quelqu'un pour rapporter la récolte
      if (n > 0) want.set(b.id, Math.min(n, W));
    }
    let changed = false;
    // départs
    for (const [jobId, list] of this.byJob) {
      const n = want.get(jobId) || 0;
      while (list.length > n) {
        this.removeWorker(list[list.length - 1]);
        changed = true;
      }
    }
    // arrivées
    for (const [jobId, n] of want) {
      let have = this.byJob.get(jobId)?.length || 0;
      while (have < n) {
        this.addWorker(world.buildings.get(jobId), have++);
        changed = true;
      }
    }
    // maisons : chacun habite au plus près
    const key = `${world.version}|${Math.round(d.population)}`;
    if (changed || key !== this.syncKey) {
      this.syncKey = key;
      this.assignHomes();
      this.version++;
    }
    void WORK_RATIO;
  }

  addWorker(b, k) {
    const seed = (b.id * 7919 + k * 104729 + this.nextId * 13) >>> 0;
    const w = {
      id: this.nextId++, seed, name: villagerName(seed), job: b.id, slot: k, role: roleOf(b.type), home: -1,
      detail: !!WORKSITES[b.type] || (!!ACTIVITIES[b.type] && k < ACTIVITIES[b.type].detail),
      start: 6.1 + hash2(seed, 1, 3) * 1.5, end: 17.6 + hash2(seed, 2, 3) * 1.8,
      leisure: hash2(seed, 3, 3) < 0.38,
      state: 'off', act: 'off', t0: 0, until: 0, mv: null, x: 0, z: 0, dir: 0, load: null, target: null,
      skin: Math.floor(hash2(seed, 4, 3) * 5), hair: Math.floor(hash2(seed, 5, 3) * 6), shirt: Math.floor(hash2(seed, 6, 3) * 10),
      girl: hash2(seed, 8, 3) < 0.5,
    };
    // l'auberge ouvre tard et ferme tard, les commerces ouvrent après l'aube
    if (b.type === 'tavern') {
      w.start = 10.5 + hash2(seed, 1, 3);
      w.end = 22 + hash2(seed, 2, 3) * 0.8;
    } else if (ACTIVITIES[b.type]?.kind === 'shop') w.start = 7.6 + hash2(seed, 1, 3);
    let list = this.byJob.get(b.id);
    if (!list) this.byJob.set(b.id, (list = []));
    list.push(w);
    this.list.push(w);
    // au chargement en pleine journée : directement au travail
    if (w.detail) this.placeAtWork(w, b);
    return w;
  }

  removeWorker(w) {
    this.release(w);
    const list = this.byJob.get(w.job);
    if (list) {
      const k = list.indexOf(w);
      if (k >= 0) list.splice(k, 1);
      if (!list.length) this.byJob.delete(w.job);
    }
    const k = this.list.indexOf(w);
    if (k >= 0) this.list.splice(k, 1);
  }

  /** Libère ce qu'il avait réservé (arbre, planche, part de récolte). */
  release(w) {
    const world = this.world;
    if (w.target?.tree != null) world.trees?.release(w.target.tree, w.id);
    const b = world.buildings.get(w.job);
    if (b?.work) {
      if (w.target?.bed != null && b.work.beds?.[w.target.bed]?.res === w.id) b.work.beds[w.target.bed].res = -1;
      if (w.reserved) b.work.reserved = Math.max(0, (b.work.reserved || 0) - w.reserved);
      // ce qu'il portait retourne sur le site (rien ne se perd)
      if (w.load?.n > 0 && w.load.fromBed) b.work.acc = Math.min(b.work.cap ?? Infinity, b.work.acc + w.load.n);
    }
    w.reserved = 0;
    w.target = null;
    w.load = null;
    w.prop = null;
    w.cart = false;
    w.cartLoad = null;
    w.trayBack = false;
  }

  assignHomes() {
    const world = this.world;
    const houses = [];
    for (const b of world.buildings.values()) {
      if (!BUILDINGS[b.type].residents || !(b.residents >= 1)) continue;
      const c = world.centerOf(b);
      houses.push({ b, x: c.cx, z: c.cz, cap: Math.max(1, Math.round(b.residents * WORK_RATIO)), used: 0 });
    }
    if (!houses.length) {
      for (const w of this.list) w.home = -1;
      return;
    }
    const byId = new Map(houses.map((h) => [h.b.id, h]));
    // on garde les maisons déjà attribuées quand c'est possible
    const todo = [];
    for (const w of this.list) {
      const h = byId.get(w.home);
      if (h && h.used < h.cap) h.used++;
      else todo.push(w);
    }
    for (const w of todo) {
      const job = world.buildings.get(w.job);
      if (!job) continue;
      const c = world.centerOf(job);
      let best = null, bestD = Infinity;
      for (const h of houses) {
        const dd = Math.abs(h.x - c.cx) + Math.abs(h.z - c.cz) + (h.used >= h.cap ? 1000 : 0);
        if (dd < bestD) {
          bestD = dd;
          best = h;
        }
      }
      w.home = best ? best.b.id : -1;
      if (best) best.used++;
    }
  }

  /* ───────── Journée ───────── */
  onShift(w, hour) {
    return hour >= w.start && hour < w.end;
  }

  /** Placé directement au travail (chargement d'une partie, embauche en pleine journée). */
  placeAtWork(w, b) {
    const hour = this.hour();
    if (!this.onShift(w, hour)) {
      w.state = 'off';
      w.act = 'off';
      return;
    }
    const lay = siteLayout(b);
    const [x, z] = localToWorld(b, lay.rest[0] + (hash2(w.seed, 9, 1) - 0.5) * 0.3, lay.rest[1] + (hash2(w.seed, 10, 1) - 0.5) * 0.2);
    w.x = x;
    w.z = z;
    w.state = 'work';
    this.setAct(w, 'idle', 0.5 + hash2(w.seed, 11, 1) * 2);
  }

  setAct(w, act, dur = 0, t = this.now()) {
    w.act = act;
    w.t0 = t;
    w.until = t + dur;
    w.mv = null;
  }

  /** Marche vers un point (à pied, en contournant les obstacles). */
  walkTo(w, x, z, act, { speed = WALK, own = -1, then = null } = {}) {
    const pts = walkPath(this.world, w.x, w.z, x, z, { own, margin: 6 }) || [[w.x, w.z], [x, z]];
    const t = this.now();
    w.act = act;
    w.t0 = t;
    w.mv = makeMove(pts, speed, t);
    w.until = t + w.mv.len / speed;
    w.then = then;
  }

  /** Trajet par les routes (maison ↔ travail). */
  commute(w, fromB, toB, state) {
    const world = this.world;
    const t = this.now();
    const a = fromB ? world.centerOf(fromB) : null, c = toB ? world.centerOf(toB) : null;
    const ra = fromB ? roadNextTo(world, fromB, c ? [c.cx - HALF, c.cz - HALF] : null) : -1;
    const rc = toB ? roadNextTo(world, toB, a ? [a.cx - HALF, a.cz - HALF] : null) : -1;
    let pts = null;
    if (ra >= 0 && rc >= 0) {
      const tiles = roadPath(world, ra, rc);
      if (tiles) pts = roadPoints(tiles);
    }
    if (!pts) {
      // pas de route : il arrive directement (rare)
      w.state = state === 'toWork' ? 'work' : 'off';
      return false;
    }
    if (fromB) pts.unshift(doorOf(fromB));
    if (toB) pts.push(doorOf(toB));
    w.state = state;
    w.act = state;
    const len = pathLen(pts);
    const speed = Math.max(WALK, len / 14); // un long trajet se fait d'un bon pas
    w.mv = makeMove(pts, speed, t);
    w.t0 = t;
    w.until = t + w.mv.len / speed;
    return true;
  }

  /* ───────── Pas de simulation ───────── */
  step(dt) {
    const world = this.world;
    if (!world || !this.list.length) return;
    const hour = this.hour();
    const now = this.now();
    // à l'aube, le charretier emporte les tas de bûches et les récoltes au dépôt du village
    const dawn = Math.floor(this.st.time.day - 5 / 24);
    if (this.pileDay !== dawn) {
      // sans charretier, les tas partent tout seuls au dépôt à l'aube
      if (this.pileDay != null && !this.hasCarter()) {
        for (const b of world.buildings.values()) {
          if (!b.work) continue;
          b.work.pile = 0;
          b.work.out = 0;
        }
      }
      this.pileDay = dawn;
    }
    // les planches et les champs poussent avec le travail accumulé
    for (const jobId of this.byJob.keys()) {
      const b = world.buildings.get(jobId);
      if (b?.work?.beds) this.grow(b);
    }
    for (const w of this.list) {
      if (!w.detail) continue;
      const b = world.buildings.get(w.job);
      if (!b) continue;
      if (now < w.until) continue;
      this.next(w, b, hour, now);
    }
  }

  /** Le travail accumulé fait pousser les cultures (toutes ensemble). */
  grow(b) {
    const s = b.work;
    const growing = s.beds.filter((bed) => bed.ph === 2);
    if (!growing.length || s.acc <= 0) return;
    const share = s.acc / growing.length;
    let used = 0;
    for (const bed of growing) {
      const add = Math.min(share, s.unit - bed.a);
      if (add <= 0) continue;
      bed.a += add;
      used += add;
      if (bed.a >= s.unit - 1e-6) {
        bed.a = s.unit;
        bed.ph = 3; // mûr
      }
    }
    s.acc = Math.max(0, s.acc - used);
  }

  /** Fin d'une action : on décide de la suivante. */
  next(w, b, hour, now) {
    // position à la fin d'un déplacement
    if (w.mv) {
      const p = moveAt(w.mv, w.until);
      w.x = p.x;
      w.z = p.z;
      w.dir = p.dir;
      w.mv = null;
    }
    // trajets du matin et du soir
    if (w.state === 'off') {
      if (!this.onShift(w, hour)) {
        w.until = now + 2;
        return;
      }
      const home = this.world.buildings.get(w.home);
      if (!home || !this.commute(w, home, b, 'toWork')) this.placeAtWork(w, b);
      return;
    }
    if (w.state === 'toWork') {
      // arrivé à la porte : il rejoint son poste
      const lay = siteLayout(b);
      const [rx, rz] = localToWorld(b, lay.rest[0] + (hash2(w.seed, 9, 1) - 0.5) * 0.3, lay.rest[1] + (hash2(w.seed, 10, 1) - 0.5) * 0.2);
      w.state = 'work';
      this.walkTo(w, rx, rz, 'idle', { own: b.id });
      return;
    }
    if (w.state === 'toHome' || w.state === 'leisure') {
      if (w.state === 'leisure' && w.act === 'leisure' && w.leisureStop) {
        w.leisureStop = null;
        w.until = now + 8 + hash2(w.seed, 21, 4) * 10;
        w.act = 'rest';
        return;
      }
      if (w.state === 'leisure') {
        const home = this.world.buildings.get(w.home);
        const from = this.world.buildings.get(w.leisureAt);
        if (home && from && this.commute(w, from, home, 'toHome')) return;
      }
      w.state = 'off';
      w.act = 'off';
      w.until = now + 4;
      return;
    }
    // fin de journée : on finit proprement (on dépose ce qu'on porte) puis on rentre
    if (!this.onShift(w, hour) && !w.load && !w.target) {
      this.release(w);
      if (w.leisure && this.goLeisure(w, b)) return;
      const home = this.world.buildings.get(w.home);
      if (!home || !this.commute(w, b, home, 'toHome')) {
        w.state = 'off';
        w.act = 'off';
        w.until = now + 4;
      }
      return;
    }
    const ws = WORKSITES[b.type];
    const role = ws?.role;
    if (role === 'lumberjack') this.lumberjack(w, b, now);
    else if (role === 'gardener' || role === 'farmer') this.grower(w, b, now);
    else if (b.type === 'fisher') this.fisherJob(w, b, now);
    else if (ws?.gather) this.gatherJob(w, b, now);
    else if (ws?.farm) this.breederJob(w, b, now);
    else {
      const kind = ACTIVITIES[b.type]?.kind;
      if (kind === 'workshop') this.workshopJob(w, b, now);
      else if (kind === 'shop') this.shopJob(w, b, now);
      else if (kind === 'carter') this.carterJob(w, b, now);
      else this.setAct(w, 'inside', 10);
    }
  }

  /** Après le travail, un détour par un lieu de loisir (parc, taverne, marché, fontaine…). */
  goLeisure(w, b) {
    const world = this.world;
    const c = world.centerOf(b);
    let best = null, bestD = 18 * 18;
    for (const o of world.buildings.values()) {
      const def = BUILDINGS[o.type];
      if (!(def.coverage?.need === 'leisure' || def.cat === 'commerce' || def.cat === 'decor' && def.beauty)) continue;
      const oc = world.centerOf(o);
      const dd = (oc.cx - c.cx) ** 2 + (oc.cz - c.cz) ** 2;
      if (dd < bestD && hash2(w.seed, o.id, 5) < 0.6) {
        bestD = dd;
        best = o;
      }
    }
    if (!best || !this.commute(w, b, best, 'leisure')) return false;
    w.leisureAt = best.id;
    w.leisureStop = true;
    w.act = 'leisure';
    return true;
  }

  /* ───────── Bûcheron ───────── */
  lumberjack(w, b, now) {
    const world = this.world, s = this.site(b), lay = siteLayout(b);
    switch (w.act) {
      case 'goTree': {
        // arrivé à l'arbre : il est toujours debout ?
        const tr = world.trees?.get(w.target?.tree);
        if (!tr || world.trees.stateOf(tr.id)) {
          this.release(w);
          this.setAct(w, 'idle', 0.5, w.until);
          return;
        }
        w.dir = Math.atan2(tr.x - w.x, tr.z - w.z);
        this.setAct(w, 'chop', 4.2, w.until);
        return;
      }
      case 'chop': {
        const tr = world.trees?.get(w.target?.tree);
        if (!tr || world.trees.stateOf(tr.id)) {
          this.release(w);
          this.setAct(w, 'idle', 0.5, w.until);
          return;
        }
        const dir = Math.atan2(tr.x - w.x, tr.z - w.z); // il tombe à l'opposé du bûcheron
        world.trees.fell(tr.id, this.st.time.day, dir);
        w.target.fell = { x: tr.x, z: tr.z, dir, s: tr.s, t: w.until };
        this.setAct(w, 'watch', 1.3, w.until);
        return;
      }
      case 'watch': {
        // il s'approche du tronc couché pour le débiter
        const f = w.target?.fell;
        if (f) {
          const mx = f.x + Math.sin(f.dir) * 0.2 * f.s + Math.cos(f.dir) * 0.1, mz = f.z + Math.cos(f.dir) * 0.2 * f.s - Math.sin(f.dir) * 0.1;
          w.x = (w.x + mx) / 2;
          w.z = (w.z + mz) / 2;
          w.dir = Math.atan2(mx - w.x, mz - w.z);
        }
        this.setAct(w, 'trim', 1.9, w.until);
        return;
      }
      case 'trim': {
        // les bûches sont prêtes : il les charge sur l'épaule
        w.load = { res: 'wood', n: s.unit, kind: 'logs' };
        world.trees?.release(w.target?.tree, w.id);
        w.target = null;
        const [px, pz] = localToWorld(b, lay.drop[0], lay.drop[1]);
        this.walkTo(w, px, pz, 'carry', { speed: WALK * 0.85, own: b.id });
        return;
      }
      case 'carry':
        this.setAct(w, 'drop', 0.8, w.until);
        w.dir = facing(w, localToWorld(b, lay.pile[0], lay.pile[1]));
        return;
      case 'drop':
      case 'waitStore':
        this.deposit(w, b, s);
        return;
      default:
    }
    // nouvel arbre ?
    const free = s.acc - (s.reserved || 0);
    if (free >= s.unit && this.storeRoom('wood')) {
      const tr = this.pickTree(w, b);
      if (tr) {
        world.trees.reserve(tr.id, w.id);
        s.reserved = (s.reserved || 0) + s.unit;
        w.reserved = s.unit;
        const c = world.centerOf(b);
        const hx = c.cx - HALF, hz = c.cz - HALF;
        const dx = tr.x - hx, dz = tr.z - hz, l = Math.hypot(dx, dz) || 1;
        w.target = { tree: tr.id };
        this.walkTo(w, tr.x - (dx / l) * 0.17 * tr.s, tr.z - (dz / l) * 0.17 * tr.s, 'goTree', { own: b.id });
        s.noTrees = false;
        return;
      }
      s.noTrees = true;
    }
    // rien à faire : pause près de la cabane
    this.setAct(w, w.act === 'idle' ? 'wait' : 'idle', 2 + hash2(w.seed, now | 0, 6) * 2.5, now);
  }

  pickTree(w, b) {
    const world = this.world;
    if (!world.trees) return null;
    const def = BUILDINGS[b.type];
    const c = world.centerOf(b);
    const r = (def.near?.radius || 3) + 0.5;
    const day = this.st.time.day;
    const list = world.trees.findNear(c.cx - HALF, c.cz - HALF, r, 12);
    for (const tr of list) {
      const until = this.unreachable.get(tr.id);
      if (until && until > day) continue;
      // on vérifie qu'on peut l'atteindre
      const dx = tr.x - w.x, dz = tr.z - w.z, l = Math.hypot(dx, dz) || 1;
      const p = walkPath(world, w.x, w.z, tr.x - (dx / l) * 0.17, tr.z - (dz / l) * 0.17, { own: b.id, margin: 5 });
      if (p) return tr;
      this.unreachable.set(tr.id, day + 1);
    }
    return null;
  }

  storeRoom(res) {
    const st = this.st;
    return st.mode === 'libre' || st.res[res] < this.game.sim.d.storage - 0.5;
  }

  /** Dépôt : c'est ici que le stock du village augmente vraiment. */
  deposit(w, b, s) {
    const st = this.st;
    const load = w.load;
    if (!load) {
      this.setAct(w, 'idle', 1);
      return;
    }
    const cap = this.game.sim.d.storage;
    const room = this.game.city?.hasRoute(b.id) ? this.game.city.productionRoom(b,load.res) : st.mode === 'libre' ? Infinity : Math.max(0, cap - st.res[load.res]);
    const n = Math.min(load.n, room);
    if (n > 0) {
      const routed = this.game.city?.bufferProduction(b,load.res,n);
      if (!routed) st.res[load.res] += n;
      const stats = st.stats;
      if (!routed) stats.produced[load.res] = (stats.produced[load.res] || 0) + n;
      if (!routed && stats.daily) stats.daily.produced[load.res] = (stats.daily.produced[load.res] || 0) + n;
      if (!load.fromBed) {
        s.acc = Math.max(0, s.acc - n);
        const r = Math.min(w.reserved || 0, n);
        s.reserved = Math.max(0, (s.reserved || 0) - r);
        w.reserved = Math.max(0, (w.reserved || 0) - r);
      }
      s.pile = Math.min(99, (s.pile || 0) + n);
      s.lastDrop = this.now();
      load.n -= n;
      this.game.bus.emit('villager:deposit', { b, res: load.res, n, x: w.x, z: w.z });
    }
    if (load.n > 0.001) {
      // stock plein : il attend avec sa charge
      this.setAct(w, 'waitStore', 2.5);
      return;
    }
    w.load = null;
    this.setAct(w, 'idle', 0.8 + hash2(w.seed, this.now() | 0, 7) * 1.6);
  }

  /* ───────── Jardinier, fermier ───────── */
  bedPoint(b, lay, k, f = 0) {
    const bd = lay.beds[k];
    if (b.type === 'garden') return localToWorld(b, bd.x + 0.07, bd.z0 + (bd.z1 - bd.z0) * f);
    // champ : on traverse les rangs
    return localToWorld(b, bd.x - bd.w / 2 + 0.06 + (bd.w - 0.12) * f, bd.z + (hash2(k, f * 10 | 0, 3) - 0.5) * bd.d * 0.6);
  }

  grower(w, b, now) {
    const s = this.site(b), lay = siteLayout(b);
    const beds = s.beds;
    const k = w.target?.bed;
    const bed = k != null ? beds[k] : null;
    switch (w.act) {
      case 'goBed': {
        if (!bed) break;
        // on commence le geste prévu
        const job = w.target.job;
        const dur = { till: 3.4, sow: 2.6, water: 2.2, harvest: 3.2, weed: 2.4 }[job] * (b.type === 'farm' ? 1.6 : 1);
        const end = this.bedPoint(b, lay, k, 1);
        w.dir = Math.atan2(end[0] - w.x, end[1] - w.z);
        w.target.from = [w.x, w.z];
        w.target.to = end;
        this.setAct(w, job, dur, w.until);
        return;
      }
      case 'till':
        if (bed) bed.ph = 1;
        this.freeBed(w, b);
        break;
      case 'sow':
        if (bed) {
          bed.ph = 2;
          bed.a = 0;
          bed.water = now;
          bed.crop = (bed.crop + (b.type === 'farm' ? 0 : 1)) % WORKSITES[b.type].crops.length;
          // la ferme sème du maïs l'été dans son deuxième champ
          if (b.type === 'farm') bed.crop = Math.floor(this.st.time.day / 7) % 4 === 1 && k === 1 ? 1 : 0;
        }
        this.freeBed(w, b);
        break;
      case 'water':
        if (bed) bed.water = now;
        this.freeBed(w, b);
        break;
      case 'weed':
        this.freeBed(w, b);
        break;
      case 'harvest':
        if (bed && bed.ph === 3) {
          w.load = { res: WORKSITES[b.type].res, n: bed.a, kind: b.type === 'farm' ? 'sheaf' : 'basket', crop: bed.crop, fromBed: true };
          bed.a = 0;
          bed.ph = 0;
        }
        this.freeBed(w, b);
        if (w.load) {
          const [px, pz] = localToWorld(b, lay.drop[0], lay.drop[1]);
          this.walkTo(w, px, pz, 'carry', { speed: WALK * 0.9, own: b.id });
          return;
        }
        break;
      case 'carry':
        this.setAct(w, 'drop', 0.8, w.until);
        w.dir = facing(w, localToWorld(b, lay.pile[0], lay.pile[1]));
        return;
      case 'drop':
      case 'waitStore':
        this.deposit(w, b, s);
        return;
      default:
    }
    if (w.load) {
      this.deposit(w, b, s);
      return;
    }
    // la tâche la plus utile : récolter, bêcher, semer, arroser
    const free = (ph) => beds.findIndex((bd) => bd.ph === ph && bd.res < 0);
    let job = null, idx = -1;
    if ((idx = free(3)) >= 0 && this.storeRoom(WORKSITES[b.type].res)) job = 'harvest';
    else if ((idx = free(0)) >= 0) job = 'till';
    else if ((idx = free(1)) >= 0) job = 'sow';
    else {
      idx = beds.findIndex((bd) => bd.ph === 2 && bd.res < 0 && now - (bd.water || 0) > 26);
      if (idx >= 0) job = b.type === 'farm' ? 'weed' : 'water';
    }
    if (job) {
      beds[idx].res = w.id;
      w.target = { bed: idx, job };
      const p = this.bedPoint(b, lay, idx, 0);
      this.walkTo(w, p[0], p[1], 'goBed', { own: b.id });
      return;
    }
    this.setAct(w, w.act === 'idle' ? 'wait' : 'idle', 2 + hash2(w.seed, now | 0, 8) * 3, now);
  }

  freeBed(w, b) {
    const k = w.target?.bed;
    if (k != null && b.work?.beds?.[k]?.res === w.id) b.work.beds[k].res = -1;
    if (w.target?.to) [w.x, w.z] = w.target.to;
    w.target = null;
  }

  /** Marche le long de points déjà calculés (trajets par les routes). */
  moveAlong(w, pts, act, speed = WALK) {
    const t = this.now();
    w.act = act;
    w.t0 = t;
    w.mv = makeMove(pts, speed, t);
    w.until = t + w.mv.len / speed;
  }

  /** Un petit tirage stable pour ce travailleur à cet instant. */
  rnd(w, now, k) {
    return hash2(w.seed, Math.floor(now * 3) + k * 101, 53);
  }

  /** Commencer une tournée de récolte si quelque chose a été produit (et qu'il y a de la place). */
  startTrip(w, b, s, res) {
    const free = s.acc - (s.reserved || 0);
    if (free < s.unit || !this.storeRoom(res)) return false;
    s.reserved = (s.reserved || 0) + s.unit;
    w.reserved = s.unit;
    w.trip = (w.trip || 0) + 1;
    return true;
  }

  /** Retour au tas du site avec la récolte. */
  carryHome(w, b, kind, res, n) {
    const lay = siteLayout(b);
    w.load = { res, n, kind };
    w.target = null;
    const [px, pz] = localToWorld(b, lay.drop[0], lay.drop[1]);
    this.walkTo(w, px, pz, 'carry', { speed: WALK * 0.85, own: b.id });
  }

  /** Fin d'un transport : on pose la charge, puis le dépôt fait monter le stock. */
  dropAndDeposit(w, b, s) {
    const lay = siteLayout(b);
    if (w.act === 'carry') {
      this.setAct(w, 'drop', 0.8, w.until);
      w.dir = facing(w, localToWorld(b, lay.pile[0], lay.pile[1]));
      return true;
    }
    if (w.act === 'drop' || w.act === 'waitStore') {
      this.deposit(w, b, s);
      return true;
    }
    return false;
  }

  /* ───────── Carrier, mineur, glaiseur ───────── */
  gatherJob(w, b, now) {
    const s = this.site(b), G = GATHER[b.type], ws = WORKSITES[b.type];
    switch (w.act) {
      case 'goSpot': {
        const tg = w.target;
        if (tg) w.dir = Math.atan2(tg.fx - w.x, tg.fz - w.z);
        this.setAct(w, G.act, G.dur[0] + this.rnd(w, now, 1) * (G.dur[1] - G.dur[0]), w.until);
        return;
      }
      case 'pick':
      case 'dig':
        this.carryHome(w, b, G.load, ws.res, s.unit);
        return;
      default:
        if (this.dropAndDeposit(w, b, s)) return;
    }
    if (w.load) {
      this.deposit(w, b, s);
      return;
    }
    if (this.startTrip(w, b, s, ws.res)) {
      const sp = pickSpot(this.world, b, b.type, w, w.trip);
      w.target = { fx: sp.fx, fz: sp.fz };
      this.walkTo(w, sp.x, sp.z, 'goSpot', { own: b.id });
      return;
    }
    this.setAct(w, w.act === 'idle' ? 'wait' : 'idle', 2 + this.rnd(w, now, 2) * 2.5, now);
  }

  /* ───────── Pêcheur ───────── */
  fisherJob(w, b, now) {
    const s = this.site(b);
    const tg = w.target;
    switch (w.act) {
      case 'goShore':
        if (tg) {
          w.dir = Math.atan2(tg.fx - w.x, tg.fz - w.z);
          tg.catch = 0;
        }
        this.setAct(w, 'cast', 1.1, w.until);
        return;
      case 'cast':
        // le bouchon flotte à quelques pas
        if (tg) tg.bob = [w.x + Math.sin(w.dir) * 0.42, w.z + Math.cos(w.dir) * 0.42];
        this.setAct(w, 'fishWait', 2.4 + this.rnd(w, now, 1) * 4.5, w.until);
        return;
      case 'fishWait':
        this.setAct(w, 'reel', 1.3, w.until);
        return;
      case 'reel':
        if (tg) tg.catch = (tg.catch || 0) + 1;
        if (tg && tg.catch < 2 + (w.seed % 2)) {
          this.setAct(w, 'cast', 1.1, w.until);
          return;
        }
        this.carryHome(w, b, 'fish', 'food', s.unit);
        return;
      default:
        if (this.dropAndDeposit(w, b, s)) return;
    }
    if (w.load) {
      this.deposit(w, b, s);
      return;
    }
    if (this.startTrip(w, b, s, 'food')) {
      const sp = pickSpot(this.world, b, 'fisher', w, w.trip);
      w.target = { fx: sp.fx, fz: sp.fz };
      this.walkTo(w, sp.x, sp.z, 'goShore', { own: b.id });
      return;
    }
    this.setAct(w, w.act === 'idle' ? 'wait' : 'idle', 2 + this.rnd(w, now, 2) * 2.5, now);
  }

  /* ───────── Éleveurs (poulailler, étable) ───────── */
  breederJob(w, b, now) {
    const s = this.site(b), F = FARMS[b.type], ws = WORKSITES[b.type];
    const L = (p) => localToWorld(b, p[0], p[1]);
    const tg = w.target;
    // on se tient un peu en retrait de ce qu'on regarde (côté entrée de l'enclos)
    const standBy = (p, k = 0) => [p[0] + 0.1 + (k % 2) * 0.05, p[1] + 0.12];
    switch (w.act) {
      case 'goTask': {
        w.dir = facing(w, L(tg.look));
        const task = tg.task;
        const dur = { feed: 3.4, hay: 2.4, water: 2.4, collect: 2.8, milk: 4.6 }[task] || 2;
        this.setAct(w, task === 'water' ? 'pour' : task, dur, w.until);
        return;
      }
      case 'goHay':
        w.dir = facing(w, L(F.hay));
        this.setAct(w, 'pickHay', 0.9, w.until);
        return;
      case 'pickHay':
        w.prop = 'hay';
        w.target = { task: 'hay', look: F.feed };
        this.walkTo(w, ...L(standBy(F.feed, w.slot)), 'goTask', { own: b.id, speed: WALK * 0.85 });
        return;
      case 'hay':
        w.prop = null;
        w.target = null;
        break;
      case 'collect':
      case 'milk':
        if (tg?.yield) {
          this.carryHome(w, b, F.load, ws.res, s.unit);
          return;
        }
        w.target = null;
        break;
      case 'feed':
      case 'pour':
        w.target = null;
        break;
      default:
        if (this.dropAndDeposit(w, b, s)) return;
    }
    if (w.load) {
      this.deposit(w, b, s);
      return;
    }
    // les œufs ou le lait sont prêts : on va les chercher
    if (this.startTrip(w, b, s, ws.res)) {
      w.target = { task: F.collect, look: F.nest, yield: true };
      this.walkTo(w, ...L(standBy(F.nest, w.slot)), 'goTask', { own: b.id });
      return;
    }
    // sinon on s'occupe des bêtes
    w.task = ((w.task | 0) + 1) % (F.tasks.length + 1);
    if (w.task === F.tasks.length) {
      this.setAct(w, w.act === 'idle' ? 'wait' : 'idle', 2 + this.rnd(w, now, 3) * 3, now);
      return;
    }
    const task = F.tasks[w.task];
    if (task === 'hay' && F.hay) {
      this.walkTo(w, ...L([F.hay[0] + 0.14, F.hay[1] + 0.08]), 'goHay', { own: b.id });
      return;
    }
    w.target = { task, look: task === 'water' ? F.water : F.feed };
    this.walkTo(w, ...L(standBy(w.target.look, w.slot)), 'goTask', { own: b.id });
  }

  /* ───────── Ateliers ───────── */
  workshopJob(w, b, now) {
    const W = WORKSHOPS[b.type];
    const L = (p) => localToWorld(b, p[0], p[1]);
    if (!b.work || typeof b.work !== 'object') b.work = {};
    const inf = this.game.sim.info.get(b.id);
    const running = !!inf && inf.eff > 0 && inf.status === 'ok';
    const stand = [W.stand[0] + (w.slot % 2) * 0.16, W.stand[1]];
    switch (w.act) {
      case 'fetchIn':
        w.dir = facing(w, L(W.inAt));
        this.setAct(w, 'pickIn', 0.8, w.until);
        return;
      case 'pickIn':
        w.prop = W.input;
        this.walkTo(w, ...L(stand), 'toStation', { own: b.id, speed: WALK * 0.85 });
        return;
      case 'toStation':
        w.dir = facing(w, L(W.station));
        w.prop = null;
        this.setAct(w, W.act, 4 + this.rnd(w, now, 1) * 2.2, w.until);
        return;
      case W.act:
        if (w.slot % 2 === 1) break; // l'aide reste à l'établi
        w.prop = W.output;
        this.walkTo(w, ...L([W.outAt[0], W.outAt[1] + 0.12]), 'toOut', { own: b.id, speed: WALK * 0.85 });
        return;
      case 'toOut':
        w.dir = facing(w, L(W.outAt));
        this.setAct(w, 'stack', 0.8, w.until);
        return;
      case 'stack':
        w.prop = null;
        // ce qui sort de l'atelier s'empile devant la porte (le charretier l'emporte)
        b.work.out = Math.min(12, (b.work.out || 0) + 1);
        break;
      default:
    }
    w.prop = null;
    if (!running) {
      // pas de matières premières, pas de place, pas assez de monde : on attend
      const at = L(stand);
      if (Math.hypot(at[0] - w.x, at[1] - w.z) > 0.08) {
        this.walkTo(w, at[0], at[1], 'walk', { own: b.id });
        return;
      }
      this.setAct(w, inf?.status === 'noInput' ? 'waitIn' : 'idle', 2.5 + this.rnd(w, now, 2) * 2, now);
      return;
    }
    if (w.slot % 2 === 1) {
      const at = L(stand);
      if (Math.hypot(at[0] - w.x, at[1] - w.z) > 0.08) {
        this.walkTo(w, at[0], at[1], 'toStation', { own: b.id });
        return;
      }
      w.dir = facing(w, L(W.station));
      this.setAct(w, this.rnd(w, now, 4) < 0.8 ? W.act : 'idle', 3 + this.rnd(w, now, 5) * 2, now);
      return;
    }
    this.walkTo(w, ...L([W.inAt[0], W.inAt[1] + 0.13]), 'fetchIn', { own: b.id });
  }

  /* ───────── Commerces ───────── */
  shopJob(w, b, now) {
    const S = SHOPS[b.type];
    const L = (p) => localToWorld(b, p[0], p[1]);
    const stand = [S.stand[0] + (w.slot % 2) * 0.24 - (w.slot % 2 ? 0.12 : 0), S.stand[1]];
    switch (w.act) {
      case 'trayGo':
        this.setAct(w, 'serve', 1.6, w.until);
        w.trayBack = true;
        return;
      case 'serve':
        if (w.trayBack) {
          w.trayBack = false;
          w.prop = null;
          this.walkTo(w, ...L(stand), 'walk', { own: b.id });
          return;
        }
        break;
      default:
    }
    const at = L(stand);
    if (Math.hypot(at[0] - w.x, at[1] - w.z) > 0.08) {
      this.walkTo(w, at[0], at[1], 'walk', { own: b.id });
      return;
    }
    w.dir = facing(w, L(S.look));
    // des clients ? (habitants venus se détendre ici)
    let customers = 0;
    for (const v of this.list) if (v.state === 'leisure' && v.leisureAt === b.id && v.act === 'rest') customers++;
    const u = this.rnd(w, now, 1);
    // l'aubergiste apporte les commandes en terrasse
    if (S.tray && (customers || u < 0.3)) {
      w.prop = 'tray';
      const g = S.goods[Math.floor(this.rnd(w, now, 2) * S.goods.length)];
      this.walkTo(w, ...L([g[0], g[1] + 0.16]), 'trayGo', { own: b.id });
      return;
    }
    const act = customers || u < 0.35 ? 'serve' : u < 0.62 ? 'arrange' : u < 0.78 ? 'call' : 'idle';
    this.setAct(w, act, 2 + this.rnd(w, now, 3) * 2.5, now);
  }

  /* ───────── Charretier (entrepôt) ───────── */
  hasCarter() {
    for (const w of this.list) if (w.role === 'carter' && w.detail) return true;
    return false;
  }

  carterJob(w, b, now) {
    const world = this.world;
    const lay = siteLayout(b);
    const home = localToWorld(b, lay.drop[0], lay.drop[1]);
    w.cart = true;
    switch (w.act) {
      case 'toPile':
        this.setAct(w, 'loadCart', 2.4, w.until);
        return;
      case 'loadCart': {
        const src = world.buildings.get(w.target?.src);
        if (src?.work) {
          w.cartLoad = cartLoadOf(src);
          src.work.pile = 0;
          src.work.out = 0;
          this.game.bus.emit('villager:pickup', { b: src, w });
        }
        const pts = src ? roadTrip(world, src, b, [w.x, w.z], home) : null;
        if (pts) this.moveAlong(w, pts, 'back', WALK * 1.1);
        else this.walkTo(w, home[0], home[1], 'back', { speed: WALK * 1.1 });
        return;
      }
      case 'back':
        this.setAct(w, 'unloadCart', 2.2, w.until);
        return;
      case 'unloadCart':
        w.cartLoad = null;
        w.target = null;
        break;
      default:
    }
    // la tournée : le plus gros tas du village (pas trop loin)
    const c = world.centerOf(b);
    let best = null, bestS = 0;
    for (const o of world.buildings.values()) {
      if (o === b || !o.work || o.cons?.k === 'new') continue;
      const amount = WORKSITES[o.type] ? (o.work.pile || 0) / Math.max(1, (o.work.unit || 4) * 2) : (o.work.out || 0) / 4;
      if (amount < 1) continue;
      const oc = world.centerOf(o);
      const d = Math.abs(oc.cx - c.cx) + Math.abs(oc.cz - c.cz);
      if (d > 40 || (this.unreachable.get(-o.id) || 0) > this.st.time.day) continue;
      const score = amount / (1 + d * 0.08);
      if (score > bestS) {
        bestS = score;
        best = o;
      }
    }
    if (best) {
      const ol = siteLayout(best);
      const to = localToWorld(best, ol.drop[0], ol.drop[1] + 0.1);
      const pts = roadTrip(world, b, best, [w.x, w.z], to);
      if (pts) {
        w.target = { src: best.id };
        this.moveAlong(w, pts, 'toPile', WALK * 1.1);
        return;
      }
      this.unreachable.set(-best.id, this.st.time.day + 0.5);
    }
    if (Math.hypot(home[0] - w.x, home[1] - w.z) > 0.1) {
      this.walkTo(w, home[0], home[1], 'walk', { own: b.id });
      return;
    }
    this.setAct(w, 'idle', 3 + this.rnd(w, now, 1) * 3, now);
  }

  /* ───────── Bâtiments modifiés ───────── */
  onBuildingRemoved(b) {
    const list = this.byJob.get(b.id);
    if (list) for (const w of [...list]) this.removeWorker(w);
    for (const w of this.list) if (w.home === b.id) w.home = -1;
    this.version++;
  }

  onBuildingMoved(b) {
    const list = this.byJob.get(b.id);
    if (!list) return;
    for (const w of list) {
      this.release(w);
      if (w.detail) this.placeAtWork(w, b);
    }
    this.version++;
  }

  onBuildingUpgraded(b) {
    if (WORKSITES[b.type]) this.site(b);
  }

  /**
   * Village de l'écran d'accueil : pas d'économie, mais les habitants travaillent quand même
   * (le travail s'accumule tout seul).
   */
  demoTick(dt) {
    const world = this.world;
    if (!world) return;
    const days = dt / DAY_SECONDS;
    for (const jobId of this.byJob.keys()) {
      const b = world.buildings.get(jobId);
      const ws = b && WORKSITES[b.type];
      if (!ws) continue;
      const s = this.site(b);
      const def = BUILDINGS[b.type];
      s.acc = Math.min(s.cap, s.acc + (def.produces[ws.res] || 0) * prodMult(b.level) * days * 0.9);
    }
    this.step(dt);
  }

  /** Pour la fiche d'un bâtiment. */
  workersOf(id) {
    return this.byJob.get(id) || [];
  }
}

/** Ce qu'on garde dans la sauvegarde (le reste se recalcule). */
export function saveWork(work) {
  if (!work) return undefined;
  const o = { acc: Math.round((work.acc || 0) * 100) / 100, pile: Math.round(work.pile || 0) };
  if (work.beds) o.beds = work.beds.map((bd) => ({ ph: bd.ph | 0, a: Math.round((bd.a || 0) * 100) / 100, crop: bd.crop | 0 }));
  return o;
}

/** Porte d'un bâtiment : milieu de la façade, côté route. */
export function doorOf(b) {
  const def = BUILDINGS[b.type];
  const d0 = def.size[1];
  return localToWorld(b, 0, d0 / 2 - 0.08);
}

/** Ce que le charretier charge sur sa charrette selon le site. */
function cartLoadOf(b) {
  const k = { lumber: 'logs', garden: 'crates', farm: 'sacks', quarry: 'stones', mine: 'ore', claypit: 'clay', fisher: 'fish', coop: 'eggs', pasture: 'milk' }[b.type];
  if (k) return k;
  return WORKSHOPS[b.type]?.output || 'crates';
}

function facing(w, p) {
  return Math.atan2(p[0] - w.x, p[1] - w.z);
}

function pathLen(pts) {
  let l = 0;
  for (let k = 1; k < pts.length; k++) l += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return l;
}

/** Position d'un travailleur à l'instant t (pour l'affichage). */
export function workerPos(w, t, out) {
  if (w.mv) return moveAt(w.mv, t, out);
  out.x = w.x;
  out.z = w.z;
  out.dir = w.dir;
  out.done = true;
  return out;
}

void tileCenter;
void tileAt;
void walkable;
