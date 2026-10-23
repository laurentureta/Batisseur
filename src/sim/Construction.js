// Les chantiers. Un bâtiment posé n'apparaît pas d'un coup : les bâtisseurs de la mairie arrivent
// avec les premiers matériaux, préparent le terrain, coulent les fondations, montent la charpente,
// les murs et le toit (par les échafaudages), puis font les finitions.
//
// C'est le travail des bâtisseurs présents sur place qui fait avancer le chantier : pas d'ouvrier,
// pas de progrès. Un nouveau bâtiment ne fonctionne qu'une fois terminé (une maison n'accueille
// ses habitants qu'à ce moment-là). Pendant une amélioration, le bâtiment continue de tourner à
// son ancien niveau. Les matériaux ont été payés à la commande.
//
// Les chantiers durent du vrai temps (des secondes au début, puis des minutes et des heures pour
// les gros bâtiments, comme dans Township) : ils avancent même quand le jeu est fermé. Une fois
// fini, le chantier attend qu'on vienne l'inaugurer (on touche le bâtiment). On peut aussi le
// terminer tout de suite contre des gemmes.
import { BUILDINGS } from '../data/buildings.js';
import { costValue } from '../data/resources.js';
import { DAY_SECONDS, SIZE } from '../world/constants.js';
import { hash2 } from '../core/rng.js';
import { walkPath, roadPath, roadNextTo, roadPoints, makeMove, moveAt, tileAt, walkable } from './paths.js';
import { localToWorld, doorOf, villagerName, WALK } from './Villagers.js';

const HALF = SIZE / 2;

/** Étapes d'un chantier (progression de 0 à 1). */
export const PHASES = [
  { at: 0, id: 'prep', name: 'Préparation du terrain' },
  { at: 0.08, id: 'found', name: 'Fondations' },
  { at: 0.18, id: 'frame', name: 'Charpente' },
  { at: 0.3, id: 'walls', name: 'Murs et toit' },
  { at: 0.92, id: 'finish', name: 'Finitions' },
];
export function phaseOf(p) {
  let ph = PHASES[0];
  for (const x of PHASES) if (p >= x.at) ph = x;
  return ph;
}

/** Les petites décorations se posent directement ; tout le reste passe par un chantier. */
export function needsSite(def) {
  if (!def || def.id === 'townhall' || def.plantsTerrain || def.exclusive) return false;
  if (def.id.startsWith('x_') || def.id.startsWith('e_')) return false;
  if (def.cat === 'decor') return costValue(def.costs[0]) >= 150; // fontaine, parc, statue, kiosque
  return true;
}

/** Travail nécessaire (en secondes de travail d'un bâtisseur). */
export function siteWork(def, level = 1, kind = 'new') {
  const cv = costValue(def.costs[Math.max(0, level - 1)] || def.costs[0]);
  const [w, d] = def.size || [1, 1];
  const W = (14 + 2.4 * Math.pow(Math.max(10, cv), 0.42)) * Math.sqrt(w * d) * (kind === 'up' ? 0.75 : 1);
  return Math.round(Math.min(300, W));
}

/**
 * Durée réelle d'un chantier, en secondes : ~30 s pour une cabane, quelques minutes pour les
 * petits bâtiments, des heures pour les grosses améliorations (au plus 12 h).
 */
export function realDuration(def, level = 1, kind = 'new') {
  const cv = costValue(def.costs[Math.max(0, level - 1)] || def.costs[0]);
  const s = 30 * Math.pow(Math.max(cv, 20) / 50, 1.1);
  void kind;
  return Math.round(Math.min(12 * 3600, Math.max(10, s)));
}

/** Gemmes pour finir tout de suite (1 gemme par tranche de 4 minutes restantes). */
export function skipGems(secondsLeft) {
  if (secondsLeft <= 0) return 0;
  return Math.max(1, Math.ceil(secondsLeft / 240));
}

/** « 2 h 05 », « 12 min », « 40 s ». */
export function durationText(s) {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60), r = s % 60;
    return m < 10 && r ? `${m} min ${String(r).padStart(2, '0')}` : `${Math.ceil(s / 60)} min`;
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Matériaux visibles sur le chantier (d'après ce qu'on a payé). */
export function siteMaterials(def, level = 1) {
  const c = def.costs[Math.max(0, level - 1)] || def.costs[0] || {};
  const out = [];
  if (c.wood || c.planks || !Object.keys(c).some((k) => k !== 'coins')) out.push('wood');
  if (c.stone) out.push('stone');
  if (c.bricks) out.push('bricks');
  return out.slice(0, 2);
}

/** Chantiers bas et étendus (champs, jardins, carrières) : ni charpente ni échafaudage. */
const LOW_SITES = new Set(['farm', 'park', 'garden', 'quarry', 'claypit', 'lumber', 'fisher', 'well', 'fountain', 'coop', 'pasture']);
export function lowSite(def) {
  return LOW_SITES.has(def?.id);
}

/** Bâtisseurs au plus sur un même chantier. */
export function maxBuilders(def) {
  const [w, d] = def.size || [1, 1];
  const a = w * d;
  return a >= 6 ? 4 : a >= 4 ? 3 : 2;
}

export const BUILDER_TEXT = {
  base: 'à la mairie', toSite: 'arrive sur le chantier', toBase: 'rentre à la mairie', drop: 'décharge les matériaux',
  dig: 'prépare le terrain', stake: 'plante les piquets', fetch: 'prend des matériaux', carry: 'apporte des matériaux',
  place: 'pose les matériaux', hammerLow: 'monte les fondations', hammer: 'cloue les planches', saw: 'scie des planches',
  climb: 'monte à l\'échelle', descend: 'descend de l\'échelle', walkUp: 'sur l\'échafaudage', paint: 'fait les finitions',
  cheer: 'fête la fin du chantier', idle: 'fait une pause',
};

/* ───────── Géométrie d'un chantier (repère local : façade vers +z) ───────── */
const RING_G = 0.13; // marche autour du chantier, au sol
const RING_P = 0.035; // planches de l'échafaudage

/**
 * Points utiles d'un chantier : tas de matériaux, échelle, tréteau, côtés praticables.
 * ext : demi-largeurs du bâtiment (l'échafaudage l'entoure au plus près).
 */
export function siteSpots(world, b, ext = null) {
  const def = BUILDINGS[b.type];
  const [w0, d0] = def.size;
  const fx = w0 / 2, fz = d0 / 2;
  const hx = ext ? ext[0] : fx - 0.08, hz = ext ? ext[1] : fz - 0.08;
  // côtés où l'on peut marcher (pas un autre bâtiment, pas l'eau)
  const sideOk = (lx, lz) => {
    const [x, z] = localToWorld(b, lx, lz);
    return walkable(world, tileAt(x, z), b.id);
  };
  const sides = {
    front: hz < fz - 0.2 || sideOk(0, fz + 0.3),
    back: hz < fz - 0.2 || sideOk(0, -fz - 0.3),
    left: hx < fx - 0.2 || sideOk(-fx - 0.3, 0),
    right: hx < fx - 0.2 || sideOk(fx + 0.3, 0),
  };
  const right = sides.right || !sides.left;
  const sx = right ? 1 : -1;
  // les tas de matériaux : devant, dans les coins (ou sur le bord de la case)
  const pz = Math.min(fz - 0.06, hz + 0.1);
  return {
    hx, hz, fx, fz, sides,
    pile: [-Math.min(hx, fx - 0.15), pz],
    pile2: [Math.min(hx, fx - 0.15) - 0.05, pz],
    ladder: [sx * (hx + 0.17), hz * 0.35], // pied de l'échelle
    ladderTop: [sx * (hx + RING_P), hz * 0.35],
    ladderSide: sx,
    saw: sides.left || !sides.right ? [-hx - 0.26, -hz * 0.25] : [hx + 0.26, -hz * 0.25],
    gate: [0, hz + RING_G + 0.05],
  };
}

/** Un point sur l'anneau (local) de demi-côtés (ax, az) → abscisse curviligne. */
function ringParam(ax, az, x, z) {
  // projection sur le rectangle
  const px = Math.max(-ax, Math.min(ax, x)), pz = Math.max(-az, Math.min(az, z));
  const dx = Math.min(Math.abs(px - ax), Math.abs(px + ax)), dz = Math.min(Math.abs(pz - az), Math.abs(pz + az));
  let qx = px, qz = pz;
  if (dx < dz) qx = px > 0 ? ax : -ax;
  else qz = pz > 0 ? az : -az;
  // abscisse : départ au coin (ax, az), sens trigonométrique vu du dessus (+z → +x → -z → -x)
  const P = 4 * (ax + az);
  let s;
  if (qz === az) s = ax - qx; // côté avant, de x = ax vers x = -ax
  else if (qx === -ax) s = 2 * ax + (az - qz); // côté gauche
  else if (qz === -az) s = 2 * ax + 2 * az + (qx + ax); // arrière
  else s = 4 * ax + 2 * az + (qz + az); // droite
  return { s: ((s % P) + P) % P, P, q: [qx, qz] };
}
function ringPoint(ax, az, s) {
  const P = 4 * (ax + az);
  s = ((s % P) + P) % P;
  if (s < 2 * ax) return [ax - s, az];
  s -= 2 * ax;
  if (s < 2 * az) return [-ax, az - s];
  s -= 2 * az;
  if (s < 2 * ax) return [-ax + s, -az];
  s -= 2 * ax;
  return [ax, -az + s];
}

/** Chemin (local) le long de l'anneau entre deux points, par le côté le plus court. */
export function ringPath(ax, az, from, to) {
  const a = ringParam(ax, az, from[0], from[1]), c = ringParam(ax, az, to[0], to[1]);
  const P = a.P;
  let ds = c.s - a.s;
  if (ds > P / 2) ds -= P;
  if (ds < -P / 2) ds += P;
  const pts = [from, a.q];
  // les coins traversés
  const corners = [0, 2 * ax, 2 * ax + 2 * az, 4 * ax + 2 * az];
  const n = Math.abs(ds);
  const dir = Math.sign(ds);
  const list = [];
  for (const cs of corners) {
    for (const base of [cs - P, cs, cs + P]) {
      const rel = (base - a.s) * dir;
      if (rel > 1e-4 && rel < n - 1e-4) list.push(rel);
    }
  }
  list.sort((x, y) => x - y);
  for (const rel of list) pts.push(ringPoint(ax, az, a.s + rel * dir));
  pts.push(c.q, to);
  // points doublés
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-3) out.push(p);
  return out;
}

export class Construction {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.crew = [];
    this.version = 0;
    this.assignAcc = 0;
    this.boot = true; // premier passage après le chargement : ce qui a fini pendant l'absence
  }

  get world() {
    return this.game.world;
  }
  get st() {
    return this.game.state;
  }
  now() {
    return this.st.time.day * DAY_SECONDS;
  }
  hour() {
    const d = this.st.time.day;
    return (d - Math.floor(d)) * 24;
  }
  /** Les chantiers existent toujours : ils durent du vrai temps. */
  enabled() {
    return true;
  }

  sites() {
    const out = [];
    if (!this.world) return out;
    for (const b of this.world.buildings.values()) if (b.cons) out.push(b);
    out.sort((a, c) => (a.cons.t0 - c.cons.t0) || (a.id - c.id));
    return out;
  }

  /** Chantiers où l'on travaille encore (pas ceux qui attendent l'inauguration). */
  workSites() {
    return this.sites().filter((b) => !b.cons.ready);
  }

  /** Chantiers finis qui attendent qu'on vienne les inaugurer. */
  readySites() {
    return this.sites().filter((b) => b.cons.ready);
  }

  /** Avancement réel (0 à 1) d'après l'heure. */
  realProgress(c, now = Date.now()) {
    if (c.rs == null) return Math.min(1, c.w / Math.max(1, c.W));
    if (c.ready) return 1;
    return Math.min(1, Math.max(0, (now - c.rs) / Math.max(1, c.rd)));
  }

  /** Secondes réelles avant la fin. */
  secondsLeft(b, now = Date.now()) {
    const c = b?.cons;
    if (!c || c.ready) return 0;
    if (c.rs == null) return Math.max(0, c.W - c.w);
    return Math.max(0, (c.rs + c.rd - now) / 1000);
  }

  /** Ancien chantier (progression au travail) → chantier en temps réel, au même avancement. */
  toReal(b) {
    const c = b.cons;
    const p = Math.min(1, c.w / Math.max(1, c.W));
    c.rd = (this.st.mode === 'libre' ? 6 : realDuration(BUILDINGS[b.type], c.to, c.k)) * 1000;
    c.rs = Date.now() - p * c.rd;
  }

  /**
   * Le temps réel passe (même jeu en pause ou fermé) : appelé à chaque image. Les chantiers dont
   * l'heure est venue sont prêts ; les bâtisseurs fêtent la fin et rentrent.
   */
  realTick() {
    if (!this.world || this.game.isDemo || !this.st) return;
    const t = performance.now();
    if (t - (this.lastReal || 0) < 250) return;
    this.lastReal = t;
    const now = Date.now();
    let fresh = 0;
    for (const b of this.world.buildings.values()) {
      const c = b.cons;
      if (!c || c.ready) continue;
      if (c.rs == null) this.toReal(b);
      const p = this.realProgress(c, now);
      c.w = Math.max(c.w, p * c.W);
      if (p >= 1) {
        this.ready(b, this.boot);
        fresh++;
      }
    }
    if (this.boot && fresh) this.game.bus.emit('site:readyOffline', fresh);
    this.boot = false;
  }

  /** Chantier fini : il attend l'inauguration (en mode libre, il s'inaugure tout seul). */
  ready(b, quiet = false) {
    const c = b.cons;
    c.ready = true;
    c.w = c.W;
    this.version++;
    for (const w of this.crew) {
      if (w.job !== b.id) continue;
      w.job = -1;
      w.load = null;
      w.target = null;
      w.lvl = 0;
      if (w.state === 'site') {
        this.setAct(w, 'cheer', 1.6);
        w.state = 'done';
      }
    }
    if (this.st.mode === 'libre') {
      this.finish(b);
      return;
    }
    this.game.bus.emit('site:ready', b, { quiet });
  }

  /** Demi-largeurs du bâtiment en chantier (fournies par l'affichage, sinon l'emprise). */
  extent(b) {
    return this.extentHook?.(b) || null;
  }

  spots(b) {
    return siteSpots(this.world, b, this.extent(b));
  }

  /** Nombre de bâtisseurs : il grandit avec la mairie. */
  crewSize() {
    if (this.st?.mode === 'libre') return 6;
    const L = this.game.townhallLevel?.() || 1;
    return Math.min(6, 2 + Math.floor((L - 1) / 2));
  }

  progress(b) {
    const c = b?.cons;
    if (!c) return 1;
    return this.realProgress(c);
  }

  /** Lance un chantier : nouveau bâtiment ('new') ou amélioration ('up'). */
  start(b, kind = 'new') {
    const def = BUILDINGS[b.type];
    const to = kind === 'up' ? b.level + 1 : b.level;
    const secs = this.st.mode === 'libre' ? 6 : realDuration(def, to, kind);
    b.cons = { k: kind, w: 0, W: siteWork(def, to, kind), to, del: 0, t0: this.st.time.day, rs: Date.now(), rd: secs * 1000 };
    this.version++;
    this.game.bus.emit('site:started', b);
  }

  /** Fin du chantier (normale ou « Terminer tout de suite »). */
  finish(b, { skipped = false } = {}) {
    const c = b.cons;
    if (!c) return;
    delete b.cons;
    this.version++;
    for (const w of this.crew) {
      if (w.job !== b.id) continue;
      w.job = -1;
      w.load = null;
      w.target = null;
      w.lvl = 0;
      if (w.state === 'site' && !skipped) {
        // tout le monde fête la fin du chantier
        this.setAct(w, 'cheer', 1.6);
        w.state = 'done';
      } else if (w.state === 'site') {
        w.state = 'done';
        this.setAct(w, 'idle', 0.3);
      }
    }
    if (c.k === 'up') this.game.actions.completeUpgrade(b, c.to, { skipped });
    else {
      this.world.version++;
      this.game.prog.recount();
      this.game.sim.markDirty();
      this.game.bus.emit('building:completed', b, { skipped });
    }
  }

  /** Annule un chantier sans le finir (annulation d'une amélioration). */
  cancel(b) {
    if (!b.cons) return;
    delete b.cons;
    this.version++;
    for (const w of this.crew) if (w.job === b.id) this.release(w);
    this.game.bus.emit('site:cancelled', b);
  }

  onRemoved(b) {
    for (const w of this.crew) if (w.job === b.id) this.release(w);
  }

  onMoved(b) {
    for (const w of this.crew) {
      if (w.job !== b.id) continue;
      w.lvl = 0;
      w.load = null;
      if (w.state === 'site') {
        // ils suivent le chantier
        const sp = this.spots(b);
        [w.x, w.z] = localToWorld(b, sp.gate[0], sp.gate[1]);
        this.setAct(w, 'idle', 0.6);
      }
    }
  }

  /** Le bâtisseur quitte son chantier (il reprendra un autre chantier ou rentrera). */
  release(w) {
    w.job = -1;
    w.load = null;
    w.target = null;
    if (w.lvl) w.lvl = 0;
    if (w.state === 'site' || w.state === 'toSite') {
      w.state = 'done';
      this.setAct(w, 'idle', 0.4);
    }
  }

  /* ───────── L'équipe ───────── */
  ensureCrew() {
    const n = this.crewSize();
    const seed = (this.st.seed | 0) ^ 0x51ed27;
    while (this.crew.length < n) {
      const k = this.crew.length;
      const s = (Math.imul(seed + k * 7919, 2654435761) >>> 0) ^ 0xb5;
      const th = this.world.townhall();
      const [x, z] = th ? doorOf(th) : [0, 0];
      this.crew.push({
        id: 800000 + k, seed: s, name: villagerName(s + 3), role: 'builder', detail: true, slot: k,
        state: 'base', act: 'off', t0: 0, until: 0, mv: null, x, z, dir: 0, lvl: 0, lvlFrom: 0,
        load: null, target: null, job: -1,
        skin: Math.floor(hash2(s, 4, 3) * 5), hair: Math.floor(hash2(s, 5, 3) * 6), shirt: k,
        girl: hash2(s, 8, 3) < 0.3,
      });
    }
  }

  setAct(w, act, dur = 0, t = this.now()) {
    w.act = act;
    w.t0 = t;
    w.until = t + dur;
    w.mv = null;
  }

  /** Marche le long d'une liste de points (scène). */
  moveAlong(w, pts, act, speed = WALK) {
    const t = this.now();
    w.act = act;
    w.t0 = t;
    w.mv = makeMove(pts, speed, t);
    w.until = t + w.mv.len / speed;
  }

  /** Marche (locale) le long de l'anneau du chantier. */
  ringWalk(w, b, ax, az, toLocal, act, speed = WALK) {
    const from = this.toLocal(b, w.x, w.z);
    const loc = ringPath(ax, az, from, toLocal);
    const pts = loc.map((p) => localToWorld(b, p[0], p[1]));
    this.moveAlong(w, pts, act, speed);
  }

  /** Scène → repère local du bâtiment. */
  toLocal(b, x, z) {
    const def = BUILDINGS[b.type];
    const rw = b.rot & 1 ? def.size[1] : def.size[0], rd = b.rot & 1 ? def.size[0] : def.size[1];
    const cx = b.x + rw / 2 - HALF, cz = b.z + rd / 2 - HALF;
    const dx = x - cx, dz = z - cz;
    // inverse de localToWorld (rotation de rot × 90°)
    const ROT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const [c, s] = ROT[b.rot & 3];
    return [dx * c - dz * s, dx * s + dz * c];
  }

  /** Trajet vers un chantier (ou la mairie) : par les routes si possible. */
  travel(w, fromB, toB, toPt, state) {
    const world = this.world;
    let pts = null;
    if (fromB && toB && fromB !== toB) {
      const a = world.centerOf(fromB), c = world.centerOf(toB);
      const ra = roadNextTo(world, fromB, [c.cx - HALF, c.cz - HALF]);
      const rc = roadNextTo(world, toB, [a.cx - HALF, a.cz - HALF]);
      if (ra >= 0 && rc >= 0) {
        const tiles = roadPath(world, ra, rc);
        if (tiles) {
          pts = roadPoints(tiles);
          pts.unshift([w.x, w.z]);
          pts.push(toPt);
        }
      }
    }
    if (!pts) pts = walkPath(world, w.x, w.z, toPt[0], toPt[1], { own: toB ? toB.id : -1, margin: 8 });
    if (!pts) {
      // aucun chemin : il arrive directement (rare)
      w.x = toPt[0];
      w.z = toPt[1];
      w.state = state === 'toSite' ? 'site' : 'base';
      this.setAct(w, 'idle', 0.3);
      return;
    }
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const speed = Math.max(WALK * 2.1, len / 9); // les bâtisseurs ne traînent pas : ils courent
    w.state = state;
    this.moveAlong(w, pts, state, speed);
  }

  /** Répartit les bâtisseurs libres sur les chantiers (le plus ancien d'abord). */
  assign(sites) {
    if (!sites.length) return;
    const free = this.crew.filter((w) => w.job < 0 && w.act !== 'cheer' && !w.retire);
    if (!free.length) return;
    const count = new Map();
    for (const w of this.crew) if (w.job >= 0) count.set(w.job, (count.get(w.job) || 0) + 1);
    const want = (b) => Math.min(maxBuilders(BUILDINGS[b.type]), Math.max(1, Math.ceil((b.cons.W - b.cons.w) / 12)));
    // d'abord un bâtisseur par chantier, puis on complète les équipes
    for (const pass of [0, 1]) {
      for (const b of sites) {
        let have = count.get(b.id) || 0;
        const goal = pass === 0 ? 1 : want(b);
        while (have < goal && free.length) {
          const c = this.world.centerOf(b);
          let bi = 0, bd = Infinity;
          free.forEach((w, k) => {
            const d = (w.x - (c.cx - HALF)) ** 2 + (w.z - (c.cz - HALF)) ** 2;
            if (d < bd) {
              bd = d;
              bi = k;
            }
          });
          const w = free.splice(bi, 1)[0];
          this.sendTo(w, b);
          have++;
          count.set(b.id, have);
        }
      }
    }
  }

  sendTo(w, b) {
    const world = this.world;
    const th = world.townhall();
    w.job = b.id;
    w.lvl = 0;
    const mats = siteMaterials(BUILDINGS[b.type], b.cons.to);
    // il apporte un premier chargement de matériaux
    w.load = b.cons.del < 3 ? { kind: matLoad(mats[w.slot % mats.length]) } : null;
    if (w.state === 'base' || w.state === 'off') {
      const [x, z] = th ? doorOf(th) : [w.x, w.z];
      w.x = x;
      w.z = z;
    }
    const sp = this.spots(b);
    const pile = localToWorld(b, sp.gate[0] + (w.slot % 3 - 1) * 0.12, sp.gate[1]);
    const from = w.state === 'base' || w.state === 'off' ? th : null;
    this.travel(w, from, b, pile, 'toSite');
  }

  /* ───────── Pas de simulation ───────── */
  step(dt) {
    if (!this.world) return;
    const sites = this.workSites();
    if (!sites.length && !this.crew.some((w) => w.state !== 'base')) return;
    this.ensureCrew();
    this.assignAcc += dt;
    if (this.assignAcc >= 0.5) {
      this.assignAcc = 0;
      this.assign(sites);
    }
    const now = this.now();
    // le village du menu : les chantiers avancent avec le travail des bâtisseurs (pas d'horloge)
    for (const w of this.crew) {
      if (w.state !== 'site' || w.job < 0) continue;
      const b = this.world.buildings.get(w.job);
      if (!b?.cons || b.cons.rs != null) continue;
      if (w.act === 'idle' || w.act === 'cheer') continue;
      b.cons.w += dt;
    }
    for (const b of sites) if (b.cons && b.cons.rs == null && b.cons.w >= b.cons.W) this.finish(b);
    for (const w of this.crew) {
      if (now < w.until) continue;
      this.next(w, now);
    }
  }

  next(w, now) {
    const world = this.world;
    // fin d'un déplacement : position finale
    if (w.mv) {
      const p = moveAt(w.mv, w.until);
      w.x = p.x;
      w.z = p.z;
      w.dir = p.dir;
      w.mv = null;
    }
    const b = w.job >= 0 ? world.buildings.get(w.job) : null;
    if (w.job >= 0 && (!b?.cons || b.cons.ready)) this.release(w);
    // arrivé là où il allait : le geste prévu commence
    if (w.target?.then) {
      const fn = w.target.then;
      w.target.then = null;
      if (b?.cons && w.state === 'site') {
        fn();
        return;
      }
    }
    switch (w.state) {
      case 'base':
      case 'off':
        w.until = now + 1;
        return;
      case 'toBase':
        w.state = 'base';
        w.act = 'off';
        w.until = now + 1;
        return;
      case 'done': {
        // plus de chantier pour lui : il rentre à la mairie (ou prendra le prochain)
        const sites = this.workSites();
        if (sites.length) {
          this.assign(sites);
          if (w.job >= 0) return;
        }
        const th = world.townhall();
        if (!th) {
          w.state = 'base';
          return;
        }
        const door = doorOf(th);
        const near = Math.hypot(door[0] - w.x, door[1] - w.z) < 0.4;
        if (near) {
          w.state = 'base';
          w.act = 'off';
          w.until = now + 1;
          return;
        }
        // trajet retour : depuis le chantier qu'il vient de quitter
        const fromB = world.buildings.get(w.lastJob);
        this.travel(w, fromB && fromB !== th ? fromB : null, th, door, 'toBase');
        return;
      }
      case 'toSite':
        if (!b) {
          w.state = 'done';
          return;
        }
        w.state = 'site';
        w.lastJob = b.id;
        if (w.load) {
          // il décharge son premier chargement sur le tas
          const sp = this.spots(b);
          const pile = sp.pile;
          const p = localToWorld(b, pile[0], pile[1] + 0.12);
          this.moveAlong(w, [[w.x, w.z], p], 'carry', WALK);
          w.target = { drop: true };
          return;
        }
        break;
      default:
    }
    if (w.state === 'site' && b) this.work(w, b, now);
  }

  /** Le geste suivant sur le chantier, selon l'avancement. */
  work(w, b, now) {
    const world = this.world;
    const c = b.cons;
    const p = Math.min(1, c.w / Math.max(1, c.W));
    const sp = this.spots(b);
    const L = (lx, lz) => localToWorld(b, lx, lz);
    const face = (lx, lz) => {
      const q = L(lx, lz);
      w.dir = Math.atan2(q[0] - w.x, q[1] - w.z);
    };
    const tg = w.target || (w.target = {});
    const mats = siteMaterials(BUILDINGS[b.type], c.to);
    const ax = sp.hx + RING_G, az = sp.hz + RING_G;
    const r = (k) => hash2(w.seed, Math.floor(now * 3) + k, 41);
    const upKind = c.k === 'up';

    // 1) fins de gestes
    switch (w.act) {
      case 'carry':
        if (tg.drop) {
          tg.drop = false;
          face(sp.pile[0], sp.pile[1]);
          this.setAct(w, 'drop', 0.6 + r(13) * 0.5, w.until);
          return;
        }
        if (tg.toLadder) {
          tg.toLadder = false;
          face(sp.ladderTop[0], sp.ladderTop[1]);
          w.cl = [w.x, w.z];
          [w.x, w.z] = L(sp.ladderTop[0], sp.ladderTop[1]);
          w.lvlFrom = 0;
          w.lvl = tg.lvl;
          this.setAct(w, 'climb', 0.85 * tg.lvl, w.until);
          return;
        }
        // arrivé à son poste au sol
        if (tg.spot) {
          face(tg.spot[2], tg.spot[3]);
          this.setAct(w, 'place', 0.5 + r(14) * 0.3, w.until);
          return;
        }
        break;
      case 'drop':
        w.load = null;
        c.del = (c.del || 0) + 1;
        this.game.bus.emit('site:delivered', b, w);
        break;
      case 'climb': {
        // en haut : il longe l'échafaudage jusqu'à son poste
        const spot = this.platformSpot(w, b, sp, now);
        tg.spot = spot;
        tg.up = (tg.up || 0) + 1;
        this.ringWalk(w, b, sp.hx + RING_P, sp.hz + RING_P, spot, 'walkUp', WALK * 0.7);
        return;
      }
      case 'walkUp': {
        if (tg.leave) {
          // au sommet de l'échelle : il redescend
          tg.leave = false;
          w.lvlFrom = w.lvl;
          w.lvl = 0;
          this.setAct(w, 'descend', 0.7 * w.lvlFrom, w.until);
          w.cl = [w.x, w.z];
          [w.x, w.z] = L(sp.ladder[0], sp.ladder[1]);
          return;
        }
        face(tg.spot[2], tg.spot[3]);
        if (w.load) {
          this.setAct(w, 'place', 0.6, w.until);
          return;
        }
        this.setAct(w, 'hammer', 2.6 + r(1) * 1.6, w.until);
        return;
      }
      case 'place':
        w.load = null;
        this.setAct(w, w.lvl > 0 ? 'hammer' : p < 0.3 ? 'hammerLow' : 'hammer', 2.4 + r(2) * 1.8, w.until);
        return;
      case 'hammer':
        if (w.lvl > 0) {
          // encore un poste sur l'échafaudage, ou on redescend chercher des matériaux
          if (p < 0.9 && (tg.up || 0) < 2 + Math.floor(r(3) * 2)) {
            const spot = this.platformSpot(w, b, sp, now);
            tg.spot = spot;
            tg.up++;
            this.ringWalk(w, b, sp.hx + RING_P, sp.hz + RING_P, spot, 'walkUp', WALK * 0.7);
            return;
          }
          tg.leave = true;
          tg.up = 0;
          this.ringWalk(w, b, sp.hx + RING_P, sp.hz + RING_P, sp.ladderTop, 'walkUp', WALK * 0.7);
          return;
        }
        break;
      case 'descend':
        w.lvl = 0;
        w.lvlFrom = 0;
        break;
      case 'fetch':
        w.load = { kind: tg.mat || 'plank' };
        break;
      default:
    }

    // une petite pause de temps en temps (on souffle, on regarde l'ouvrage)
    if (w.lvl === 0 && !w.load && ['hammerLow', 'stake', 'dig', 'saw', 'paint', 'drop'].includes(w.act) && r(20) < 0.3) {
      this.setAct(w, 'idle', 0.4 + r(21) * 0.9, now);
      return;
    }

    // 2) on redescend toujours avant les finitions
    if (w.lvl > 0 && (p >= 0.9 || upKind && p >= 0.95)) {
      tg.leave = true;
      this.ringWalk(w, b, sp.hx + RING_P, sp.hz + RING_P, sp.ladderTop, 'walkUp', WALK * 0.7);
      return;
    }

    // 3) le geste suivant
    // les premiers matériaux ne sont pas arrivés : le premier sur place prépare le terrain
    if (!upKind && p < 0.08) {
      const spot = this.groundSpot(w, b, sp, r(4));
      tg.spot = spot;
      const act = r(5) < 0.5 ? 'dig' : 'stake';
      this.walkOnSite(w, b, sp, [spot[0], spot[1]], ax, az, p, () => {
        face(spot[2], spot[3]);
        this.setAct(w, act, 2.6 + r(6) * 1.4);
      });
      return;
    }
    // il porte quelque chose : il l'emmène à son poste
    const low = lowSite(BUILDINGS[b.type]);
    if (w.load) {
      if (!low && (p >= 0.3 && p < 0.9 && !upKind || upKind && p < 0.95 && w.slot % 2 === 0)) {
        tg.toLadder = true;
        tg.lvl = upKind ? 1 : p < 0.6 ? 1 : 2;
        this.walkOnSite(w, b, sp, sp.ladder, ax, az, p, null, 'carry');
        return;
      }
      const spot = this.groundSpot(w, b, sp, r(7));
      tg.spot = spot;
      this.walkOnSite(w, b, sp, [spot[0], spot[1]], ax, az, p, null, 'carry');
      return;
    }
    // finitions : coups de pinceau et de marteau au pied des murs
    if (p >= 0.92) {
      const spot = this.groundSpot(w, b, sp, r(8));
      tg.spot = spot;
      this.walkOnSite(w, b, sp, [spot[0], spot[1]], ax, az, p, () => {
        face(spot[2], spot[3]);
        this.setAct(w, 'paint', 2 + r(9) * 1.5);
      });
      return;
    }
    // le troisième bâtisseur scie souvent des planches au tréteau
    if (w.slot % 3 === 2 && r(10) < 0.6 && p >= 0.18) {
      this.walkOnSite(w, b, sp, sp.saw, ax, az, p, () => {
        face(sp.saw[0] + 1, sp.saw[1]);
        this.setAct(w, 'saw', 3 + r(11) * 2);
      });
      return;
    }
    // aller chercher des matériaux au tas
    const mat = p < 0.18 && mats.includes('stone') ? 'stone' : matPick(mats, r(12));
    tg.mat = matLoad(mat);
    const pileSpot = mat === mats[0] || mats.length < 2 ? sp.pile : sp.pile2;
    this.walkOnSite(w, b, sp, [pileSpot[0], pileSpot[1] + 0.13], ax, az, p, () => {
      face(pileSpot[0], pileSpot[1]);
      this.setAct(w, 'fetch', 0.6 + r(15) * 0.5);
    });
  }

  /** Déplacement sur le chantier : en ligne droite au début, puis en faisant le tour des murs. */
  walkOnSite(w, b, sp, toLocal, ax, az, p, then, act = 'walk') {
    const from = this.toLocal(b, w.x, w.z);
    const d = Math.hypot(toLocal[0] - from[0], toLocal[1] - from[1]);
    if (d < 0.03) {
      if (then) then();
      else this.setAct(w, act, 0.01);
      return;
    }
    let loc;
    // tant que les murs ne sont pas montés (ou pour une amélioration), on contourne le bâtiment
    const inside = (q) => Math.abs(q[0]) < sp.hx - 0.02 && Math.abs(q[1]) < sp.hz - 0.02;
    const blocked = p >= 0.18 || b.cons.k === 'up';
    if (blocked && (inside(from) || inside(toLocal) || segCrosses(from, toLocal, sp.hx, sp.hz))) loc = ringPath(ax, az, from, toLocal);
    else loc = [from, toLocal];
    const pts = loc.map((q) => localToWorld(b, q[0], q[1]));
    this.moveAlong(w, pts, then ? 'walk' : act, WALK * (w.load ? 1.0 : 1.15));
    w.target.then = then;
  }

  /** Un poste au sol, au pied d'un mur praticable : [x, z, vers x, vers z] (local). */
  groundSpot(w, b, sp, u) {
    const sides = Object.entries(sp.sides).filter(([, ok]) => ok).map(([k]) => k);
    const list = sides.length ? sides : ['front'];
    const side = list[Math.floor(u * list.length) % list.length];
    const v = ((u * 7.31) % 1) * 1.4 - 0.7;
    const e = 0.07;
    switch (side) {
      case 'back':
        return [v * sp.hx, -sp.hz - e, v * sp.hx, -sp.hz + 0.2];
      case 'left':
        return [-sp.hx - e, v * sp.hz, -sp.hx + 0.2, v * sp.hz];
      case 'right':
        return [sp.hx + e, v * sp.hz, sp.hx - 0.2, v * sp.hz];
      default:
        return [v * sp.hx * 0.8, sp.hz + e, v * sp.hx * 0.8, sp.hz - 0.2];
    }
  }

  /** Un poste sur l'échafaudage. */
  platformSpot(w, b, sp, now) {
    const u = hash2(w.seed, Math.floor(now * 2) + 77, 43);
    const ax = sp.hx + RING_P, az = sp.hz + RING_P;
    const P = 4 * (ax + az);
    const q = ringPoint(ax, az, u * P);
    // il regarde vers le mur (le centre)
    const k = 0.25 / Math.max(0.01, Math.hypot(q[0], q[1]));
    return [q[0], q[1], q[0] * (1 - k), q[1] * (1 - k)];
  }

  /**
   * Village de l'écran d'accueil : les chantiers avancent tout seuls (sans fin de partie).
   */
  demoTick(dt) {
    this.step(dt);
  }

  /** Pour la fiche d'un chantier. */
  crewOf(id) {
    return this.crew.filter((w) => w.job === id);
  }
}

/** Le segment (local) traverse-t-il l'emprise du bâtiment ? */
function segCrosses(a, c, hx, hz) {
  for (let k = 1; k < 8; k++) {
    const f = k / 8;
    const x = a[0] + (c[0] - a[0]) * f, z = a[1] + (c[1] - a[1]) * f;
    if (Math.abs(x) < hx - 0.02 && Math.abs(z) < hz - 0.02) return true;
  }
  return false;
}

function matLoad(mat) {
  return mat === 'stone' ? 'stoneBlock' : mat === 'bricks' ? 'bricks' : 'plank';
}
function matPick(mats, u) {
  return mats[Math.floor(u * mats.length) % mats.length];
}

/** Position d'un bâtisseur à l'instant t (pour l'affichage). */
export function builderPos(w, t, out) {
  if (w.mv) return moveAt(w.mv, Math.min(t, w.until), out);
  out.x = w.x;
  out.z = w.z;
  out.dir = w.dir;
  out.done = true;
  out.s = 0;
  return out;
}
