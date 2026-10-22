// Les métiers du village. Chaque activité définit ses lieux (où l'on travaille, où l'on dépose),
// ses gestes (avec leur durée), ses charges et son résultat dans la simulation :
//
//  - récolte sur le terrain (mineur, carrier, glaiseur, pêcheur, éleveur) : la production de
//    l'économie s'accumule sur le site, le travailleur va la chercher et c'est son DÉPÔT qui fait
//    monter le stock du village (on ne rapporte jamais rien qui n'a pas été produit) ;
//  - ateliers (scieur, forgeron, briquetier, boulanger, meunier) : ils ne travaillent que si
//    l'atelier tourne vraiment (matières premières, main-d'œuvre, place au stock) et empilent
//    devant la porte ce qu'ils fabriquent ;
//  - commerces (marchand, aubergiste) : ils servent les clients qui passent ;
//  - charretier (entrepôt) : il fait la tournée des tas de récolte avec sa charrette.
//
// Pour ajouter un métier : une entrée dans JOBS (lieux, gestes, résultat) et, côté affichage,
// la pose de ses gestes dans People.js (ACT_POSES).
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { SIZE, T } from '../world/constants.js';
import { hash2 } from '../core/rng.js';
import { tileAt, walkable, roadNextTo, roadPath, roadPoints, makeMove } from './paths.js';

const HALF = SIZE / 2;
const ROT = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/* ───────── Repère local d'un bâtiment (façade vers +z) ───────── */
export function L2W(b, px, pz) {
  const def = BUILDINGS[b.type];
  const [w, d] = sizeOf(def, b.rot);
  const cx = b.x + w / 2 - HALF, cz = b.z + d / 2 - HALF;
  const [c, s] = ROT[b.rot & 3];
  return [px * c + pz * s + cx, -px * s + pz * c + cz];
}

/**
 * Récolte sur le terrain : sur quoi on travaille, le geste, la charge rapportée.
 * fallback : [où se tenir, vers où regarder] dans le bâtiment si rien n'est accessible autour.
 */
export const GATHER = {
  quarry: { targets: [T.ROCK, T.MOUNTAIN], act: 'pick', load: 'stoneBlock', dur: [4.2, 5.8], fallback: [[0.0, 0.02], [-0.22, -0.2]] },
  mine: { targets: [T.MOUNTAIN, T.ROCK], act: 'pick', load: 'ore', dur: [4.6, 6.2], fallback: [[0.0, 0.46], [0, 0.1]] },
  claypit: { targets: [T.WATER, T.SAND], act: 'dig', load: 'clay', dur: [4.0, 5.4], fallback: [[-0.06, 0.06], [0.15, 0.05]] },
  fisher: { targets: [T.WATER, T.DEEP], act: 'cast', load: 'fish', dur: [0, 0], fallback: [[0.3, 0.3], [0.3, 0.9]] },
};

/** Ateliers : où sont la réserve, l'établi et le tas de produits finis (repère local). */
export const WORKSHOPS = {
  sawmill: { act: 'saw', input: 'logs', output: 'plankStack', inAt: [-0.22, 0.4], station: [0.18, 0.44], stand: [0.18, 0.6], outAt: [0.36, 0.4] },
  forge: { act: 'smith', input: 'ore', output: 'toolsCrate', inAt: [-0.34, 0.42], station: [0.12, 0.46], stand: [0.12, 0.62], outAt: [0.36, 0.46] },
  brickworks: { act: 'mold', input: 'clay', output: 'bricks', inAt: [-0.2, 0.32], station: [0.06, 0.12], stand: [0.06, 0.28], outAt: [0.26, 0.3] },
  bakery: { act: 'knead', input: 'sack', output: 'bread', inAt: [-0.33, 0.38], station: [0.12, 0.42], stand: [0.12, 0.58], outAt: [0.33, 0.38] },
  mill: { act: 'carrySacks', input: 'sheaf', output: 'sack', inAt: [-0.3, 0.32], station: [0.0, 0.3], stand: [0.0, 0.42], outAt: [0.3, 0.36] },
};

/** Commerces : derrière l'étal, face à la rue. */
export const SHOPS = {
  market: { stand: [0.0, 0.2], look: [0, 0.8], goods: [[-0.25, 0.34], [0.22, 0.36]] },
  shop: { stand: [0.0, 0.47], look: [0, 1], goods: [[-0.3, 0.44], [0.3, 0.44]] },
  mall: { stand: [0.3, 0.86], look: [0.3, 1.6], goods: [[-0.4, 0.82], [0.75, 0.82]] },
  tavern: { stand: [0.12, 0.44], look: [0, 1], goods: [[0.36, 0.38], [-0.28, 0.42]], tray: true },
};

/** Élevage : enclos, mangeoire, abreuvoir, nids, coin de traite (repère local). */
export const FARMS = {
  coop: {
    pen: [-0.42, 0.0, 0.42, 0.44], feed: [0.0, 0.2], water: [0.3, -0.3], nest: [-0.04, -0.14], drop: [0.32, 0.36],
    tasks: ['feed', 'water', 'feed'], collect: 'collect', load: 'eggs',
  },
  pasture: {
    pen: [-0.9, -0.05, 0.9, 0.9], pen2: [0.05, -0.9, 0.9, -0.05], feed: [0.18, -0.55], water: [0.6, -0.42], nest: [0.25, 0.25],
    drop: [-0.2, -0.18], hay: [-0.62, -0.12], tasks: ['hay', 'water', 'hay'], collect: 'milk', load: 'milk',
  },
};

/** Points de travail autour d'un bâtiment (sur le bord d'une case de roche, de montagne, d'eau…). */
const spotCache = new Map();
export function gatherSpots(world, b, targets, radius) {
  const key = `${b.id}|${b.x}|${b.z}|${b.rot}|${world.terrainVersion}|${world.version}`;
  const hit = spotCache.get(key);
  if (hit) return hit;
  const def = BUILDINGS[b.type];
  const [w, d] = sizeOf(def, b.rot);
  const out = [];
  const tset = new Set(targets);
  const cx = b.x + w / 2, cz = b.z + d / 2;
  for (let zz = b.z - radius; zz < b.z + d + radius; zz++) {
    for (let xx = b.x - radius; xx < b.x + w + radius; xx++) {
      if (!world.inside(xx, zz)) continue;
      const i = world.idx(xx, zz);
      if (!tset.has(world.terrain[i]) || world.road[i]) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = xx + dx, nz = zz + dz;
        if (!world.inside(nx, nz)) continue;
        const j = world.idx(nx, nz);
        if (tset.has(world.terrain[j]) || !walkable(world, j, b.id)) continue;
        // debout sur la case voisine, près du bord, face à la cible
        const ex = xx + 0.5 + dx * 0.5, ez = zz + 0.5 + dz * 0.5; // milieu du bord commun
        const along = (hash2(i, j, 5) - 0.5) * 0.6;
        const sx = ex + dx * 0.16 + (dz ? along : 0), sz = ez + dz * 0.16 + (dx ? along : 0);
        out.push({ x: sx - HALF, z: sz - HALF, fx: sx - dx * 0.5 - HALF, fz: sz - dz * 0.5 - HALF, d: Math.hypot(sx - cx, sz - cz), water: world.terrain[i] === T.WATER || world.terrain[i] === T.DEEP });
      }
    }
  }
  out.sort((p, q) => p.d - q.d);
  const list = out.slice(0, 14);
  if (spotCache.size > 300) spotCache.clear();
  spotCache.set(key, list);
  return list;
}

/** Choisit un point de travail (un peu de variété d'une tournée à l'autre). */
export function pickSpot(world, b, kind, w, trip) {
  const G = GATHER[kind];
  const def = BUILDINGS[b.type];
  const r = (def.near?.radius || 2) + (kind === 'fisher' ? 0 : 0);
  const list = gatherSpots(world, b, G.targets, r);
  const n = Math.min(list.length, kind === 'fisher' ? 5 : 6);
  if (n) {
    const k = Math.floor(hash2(w.seed, trip, 31) * n);
    const s = list[k];
    return { x: s.x, z: s.z, fx: s.fx, fz: s.fz };
  }
  const [st, lk] = G.fallback;
  const [x, z] = L2W(b, st[0], st[1]);
  const [fx, fz] = L2W(b, lk[0], lk[1]);
  return { x, z, fx, fz, home: true };
}

/** Trajet par les routes entre deux bâtiments (points de la scène), ou null. */
export function roadTrip(world, fromB, toB, fromPt, toPt) {
  const a = world.centerOf(fromB), c = world.centerOf(toB);
  const ra = roadNextTo(world, fromB, [c.cx - HALF, c.cz - HALF]);
  const rc = roadNextTo(world, toB, [a.cx - HALF, a.cz - HALF]);
  if (ra < 0 || rc < 0) return null;
  const tiles = roadPath(world, ra, rc);
  if (!tiles) return null;
  const pts = roadPoints(tiles);
  if (fromPt) pts.unshift(fromPt);
  if (toPt) pts.push(toPt);
  return pts;
}

export function moveFor(pts, speed, t) {
  return makeMove(pts, speed, t);
}

void tileAt;
