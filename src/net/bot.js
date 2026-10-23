// Le premier ami : Capucine, maire de Bellerive. Comme dans les jeux du genre, c'est un ami
// automatique, toujours là, dont le village est au niveau maximum : mairie Mégapole, tous les
// bâtiments au dernier niveau, tous les monuments (Opéra, Colisée, Palais…), des quartiers
// d'immeubles, des parcs, une ceinture de fermes et d'ateliers. Son village est construit sur
// le téléphone (aucune connexion nécessaire).
import { T, SIZE, CENTER } from '../world/constants.js';
import { BUILDINGS, sizeOf, residentsAt } from '../data/buildings.js';
import { createNewState } from '../core/state.js';
import { mulberry32 } from '../core/rng.js';

export const BOT = {
  id: 'bot-capucine',
  bot: true,
  code: 'BOT',
  name: 'Capucine',
  avatar: '👸',
  village: 'Bellerive',
  level: 100,
  pop: 7800,
  has_village: true,
};

const SEED = 20260101;

/** État de départ du village de Capucine (la ville est ajoutée après le chargement). */
export function botState() {
  const st = createNewState({ name: BOT.village, preset: 'vallee', mode: 'carriere', seed: SEED });
  st.level = 100;
  st.zones.fill(true);
  st.time = { day: 8.42, speed: 1 }; // un beau matin d'été
  st.weather = { kind: 'clear', day: 0 };
  st.cosmetics = { roof: 'mix' };
  return st;
}

/** Construit la ville de Capucine dans le monde chargé. Renvoie la population. */
export function populateBot(world) {
  const rng = mulberry32(SEED);
  const B = 5; // une rue toutes les 5 cases : îlots de 4 × 4
  const NB = 7; // 7 × 7 îlots
  const x0 = CENTER - 1 - Math.floor((NB * B) / 2) + 1, z0 = x0;
  const land = (x, z) => {
    if (!world.inside(x, z)) return false;
    const t = world.terrain[world.idx(x, z)];
    return t !== T.WATER && t !== T.DEEP && t !== T.MOUNTAIN;
  };
  // la ville sur une grande plaine : on défriche, les rivières restent (ponts)
  for (let z = z0 - 3; z <= z0 + NB * B + 3; z++) {
    for (let x = x0 - 3; x <= x0 + NB * B + 3; x++) {
      if (!world.inside(x, z)) continue;
      const i = world.idx(x, z);
      const t = world.terrain[i];
      if (t === T.FOREST || t === T.ROCK || t === T.SAND || t === T.MOUNTAIN) world.terrain[i] = T.GRASS;
    }
  }
  // l'ancienne mairie est retirée : la Mégapole trône au centre de la ville
  for (const b of [...world.buildings.values()]) world.removeBuilding(b.id);
  // le quadrillage des rues pavées (y compris les ponts)
  for (let k = 0; k <= NB; k++) {
    for (let t = 0; t <= NB * B; t++) {
      for (const [x, z] of [[x0 + k * B, z0 + t], [x0 + t, z0 + k * B]]) {
        if (!world.inside(x, z)) continue;
        const i = world.idx(x, z);
        if (world.terrain[i] !== T.MOUNTAIN) world.road[i] = 2;
      }
    }
  }
  // une avenue qui part vers la campagne (avec la porte de la ville)
  for (let t = 1; t <= 8; t++) {
    const x = x0 + Math.floor(NB / 2) * B, z = z0 + NB * B + t;
    if (land(x, z)) world.road[world.idx(x, z)] = 2;
  }
  let id = 1;
  const free = (type, x, z, rot) => {
    const [w, d] = sizeOf(BUILDINGS[type], rot);
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        if (!land(x + dx, z + dz)) return false;
        const i = world.idx(x + dx, z + dz);
        if (world.occ[i] >= 0 || world.road[i]) return false;
      }
    }
    return true;
  };
  const place = (type, x, z, rot = 0) => {
    const def = BUILDINGS[type];
    if (!def || !free(type, x, z, rot)) return null;
    const b = { id: id++, type, x, z, rot, level: def.maxLevel || 1, born: 0 };
    if (def.residents) b.residents = residentsAt(def, b.level);
    world.addBuilding(b);
    return b;
  };
  const facing = (x, z) => {
    const r = (xx, zz) => world.inside(xx, zz) && world.road[world.idx(xx, zz)];
    if (r(x, z + 1)) return 0;
    if (r(x + 1, z)) return 1;
    if (r(x, z - 1)) return 2;
    if (r(x - 1, z)) return 3;
    return 0;
  };
  // îlot (bx, bz) : coin intérieur (4 × 4 cases)
  const bx0 = (bx) => x0 + bx * B + 1, bz0 = (bz) => z0 + bz * B + 1;
  const used = new Set();
  const block = (bx, bz, fn) => {
    used.add(bx + ',' + bz);
    fn(bx0(bx), bz0(bz));
  };
  const c = Math.floor(NB / 2);
  // ── le cœur de la ville : mairie et monuments
  block(c, c, (x, z) => {
    place('townhall', x + 1, z + 2, 0); // contre la rue du bas : tout le réseau part d'ici
    place('fountain', x, z + 3);
    place('fountain', x + 3, z + 3);
    place('statue', x + 1, z);
    place('statue', x + 2, z);
    place('flowers', x, z);
    place('flowers', x + 3, z);
  });
  block(c - 1, c, (x, z) => place('opera', x, z + 1, 0) && place('goldkiosk', x + 3, z));
  block(c + 1, c, (x, z) => place('palace', x, z, 0) && place('goldtower', x + 3, z + 3));
  block(c, c - 1, (x, z) => place('colosseum', x, z, 0) && place('equestrian', x + 3, z + 3));
  block(c, c + 1, (x, z) => place('grandfountain', x + 1, z + 1) && place('statue', x, z + 3) && place('statue', x + 3, z + 3));
  block(c - 1, c - 1, (x, z) => place('castle', x, z, 0) && place('x_gold_statue', x + 3, z + 3));
  block(c + 1, c - 1, (x, z) => place('stadium', x, z, 0));
  block(c - 1, c + 1, (x, z) => place('planetarium', x, z) && place('mayorstatue', x + 2, z + 2));
  block(c + 1, c + 1, (x, z) => place('mall', x, z) && place('hospital', x + 2, z + 2) && place('clocktower', x + 3, z));
  // ── deuxième anneau : grands équipements, parcs et quartiers chics
  const ring2 = [];
  for (let bz = c - 2; bz <= c + 2; bz++) for (let bx = c - 2; bx <= c + 2; bx++) if (Math.max(Math.abs(bx - c), Math.abs(bz - c)) === 2) ring2.push([bx, bz]);
  const specials = [
    (x, z) => place('station', x, z, 0) && place('bandstand', x + 3, z + 3),
    (x, z) => place('ferris', x, z) && place('frgarden', x + 2, z + 2),
    (x, z) => place('park', x, z) && place('park', x + 2, z + 2) && place('e_carousel', x + 2, z) && place('x_cherry_tree', x, z + 2),
    (x, z) => place('depot', x, z) && place('watertower', x + 3, z) && place('school', x + 2, z + 3) && place('police', x + 3, z + 3),
    (x, z) => place('citygate', x + 1, z + 3, 0) && place('e_circus', x + 1, z),
    (x, z) => place('manor', x, z) && place('manor', x + 2, z + 2) && place('x_gold_statue', x + 2, z) && place('x_tulips', x, z + 2),
    (x, z) => place('firestation', x, z) && place('clinic', x + 3, z) && place('school', x, z + 3) && place('watertower', x + 3, z + 3),
    (x, z) => place('frgarden', x, z) && place('x_hedge_maze', x + 2, z + 2),
  ];
  ring2.forEach(([bx, bz], k) => {
    if (k % 2 === 0 && specials.length) block(bx, bz, specials.shift());
  });
  // ── quartiers d'habitation : immeubles le long des rues, un square au milieu
  const residential = (x, z, k) => {
    for (let dz = 0; dz < 4; dz++) {
      for (let dx = 0; dx < 4; dx++) {
        const edge = dx === 0 || dz === 0 || dx === 3 || dz === 3;
        if (!edge) continue;
        const corner = (dx === 0 || dx === 3) && (dz === 0 || dz === 3);
        const type = corner && (k + dx + dz) % 3 === 0 ? ['shop', 'market', 'tavern'][(k + dz) % 3] : 'house';
        place(type, x + dx, z + dz, facing(x + dx, z + dz));
      }
    }
    // le square du milieu
    const inner = [['park'], ['manor'], ['fountain', 'flowers', 'tree', 'bench'], ['manor'], ['x_cherry_tree', 'flowers', 'bench', 'tree'], ['manor']][k % 6];
    if (inner.length === 1) place(inner[0], x + 1, z + 1);
    else inner.forEach((t, j) => place(t, x + 1 + (j % 2), z + 1 + Math.floor(j / 2)));
  };
  let k = 0;
  for (let bz = 0; bz < NB; bz++) {
    for (let bx = 0; bx < NB; bx++) {
      if (used.has(bx + ',' + bz)) continue;
      const ring = Math.max(Math.abs(bx - c), Math.abs(bz - c));
      if (ring <= 2) block(bx, bz, (x, z) => residential(x, z, k++));
    }
  }
  // ── la ceinture : fermes, élevages et ateliers
  const outer = [
    (x, z) => place('farm', x, z) && place('farm', x + 2, z + 2) && place('mill', x + 3, z) && place('coop', x, z + 3),
    (x, z) => place('pasture', x, z) && place('pasture', x + 2, z + 2) && place('bakery', x + 3, z) && place('garden', x, z + 3),
    (x, z) => place('sawmill', x, z) && place('brickworks', x + 1, z) && place('forge', x + 2, z) && place('lumber', x + 3, z) && place('farm', x, z + 2) && place('mill', x + 3, z + 3),
    (x, z) => place('farm', x, z) && place('farm', x + 2, z) && place('garden', x, z + 3) && place('garden', x + 1, z + 3) && place('coop', x + 3, z + 3),
  ];
  for (let bz = 0; bz < NB; bz++) {
    for (let bx = 0; bx < NB; bx++) {
      if (used.has(bx + ',' + bz)) continue;
      block(bx, bz, (x, z) => {
        // un îlot sur trois pour les fermes et les ateliers, le reste en quartiers d'habitation
        const fn = (bx * 3 + bz * 5) % 3 === 0 ? outer[(bx + bz) % outer.length] : null;
        if (!fn || !fn(x, z)) residential(x, z, k++);
      });
    }
  }
  // ── les cases restées libres dans les îlots : arbres, fleurs, bancs, lampions
  const deco = ['tree', 'tree', 'flowers', 'tree', 'bench', 'flowers', 'x_cherry_tree', 'tree'];
  for (let bz = 0; bz < NB; bz++) {
    for (let bx = 0; bx < NB; bx++) {
      for (let dz = 0; dz < 4; dz++) {
        for (let dx = 0; dx < 4; dx++) {
          const x = bx0(bx) + dx, z = bz0(bz) + dz;
          if (rng() < 0.85) place(deco[Math.floor(rng() * deco.length)], x, z, Math.floor(rng() * 4));
        }
      }
    }
  }
  // ── autour : pêcheurs au bord de l'eau, phare, carrières, forêts plantées
  const nearWater = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!world.inside(x + dx, z + dz)) continue;
      const t = world.terrain[world.idx(x + dx, z + dz)];
      if (t === T.WATER || t === T.DEEP) return true;
    }
    return false;
  };
  let fishers = 0, lighthouse = false;
  for (let z = z0 - 6; z <= z0 + NB * B + 6 && fishers < 6; z++) {
    for (let x = x0 - 6; x <= x0 + NB * B + 6 && fishers < 6; x++) {
      if (!nearWater(x, z) || !free('fisher', x, z, 0) || rng() > 0.25) continue;
      if (!lighthouse && place('lighthouse', x, z)) {
        lighthouse = true;
        continue;
      }
      if (place('fisher', x, z, facing(x, z))) fishers++;
    }
  }
  world.state.nextId = id;
  world.version++;
  world.terrainVersion++;
  world.trees?.rebuild();
  let pop = 0;
  for (const b of world.buildings.values()) pop += b.residents || 0;
  return Math.round(pop);
}

void SIZE;
