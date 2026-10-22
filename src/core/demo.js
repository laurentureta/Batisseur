// Village de démonstration affiché derrière l'écran d'accueil.
import { T, SIZE } from '../world/constants.js';
import { BUILDINGS, sizeOf, residentsAt } from '../data/buildings.js';
import { mulberry32 } from './rng.js';
import { seasonAt } from '../data/pass.js';

export function populateDemo(world) {
  const rng = mulberry32(4242);
  // le plan du village de démonstration a été dessiné pour l'ancienne carte (50 x 50) : on le recentre
  const O = (SIZE - 50) / 2;
  const land = (x, z) => {
    if (!world.inside(x, z)) return false;
    const t = world.terrain[world.idx(x, z)];
    return t !== T.WATER && t !== T.DEEP && t !== T.MOUNTAIN;
  };
  const road = (x, z, type) => {
    if (!land(x, z)) return;
    const i = world.idx(x, z);
    if (world.occ[i] >= 0) return;
    world.road[i] = type;
    if (world.terrain[i] === T.FOREST || world.terrain[i] === T.ROCK) world.terrain[i] = T.GRASS;
  };
  // rues
  for (let x = 15 + O; x <= 34 + O; x++) road(x, 26 + O, 2);
  for (let x = 17 + O; x <= 32 + O; x++) road(x, 21 + O, 2);
  for (let z = 16 + O; z <= 33 + O; z++) road(27 + O, z, 2);
  for (let z = 17 + O; z <= 32 + O; z++) road(21 + O, z, 1);
  for (let x = 21 + O; x <= 31 + O; x++) road(x, 30 + O, 1);
  for (let z = 21 + O; z <= 26 + O; z++) road(32 + O, z, 1);

  let id = 2;
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
  const place = (type, x, z, rot, level) => {
    if (!free(type, x, z, rot)) return false;
    const def = BUILDINGS[type];
    const [w, d] = sizeOf(def, rot);
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      const i = world.idx(x + dx, z + dz);
      if (world.terrain[i] === T.FOREST || world.terrain[i] === T.ROCK) world.terrain[i] = T.GRASS;
    }
    const b = { id: id++, type, x, z, rot, level: Math.min(level, def.maxLevel) };
    if (def.residents) b.residents = residentsAt(def, b.level);
    world.addBuilding(b);
    return true;
  };
  const facing = (x, z) => {
    if (world.inside(x, z + 1) && world.road[world.idx(x, z + 1)]) return 0;
    if (world.inside(x + 1, z) && world.road[world.idx(x + 1, z)]) return 1;
    if (world.inside(x, z - 1) && world.road[world.idx(x, z - 1)]) return 2;
    if (world.inside(x - 1, z) && world.road[world.idx(x - 1, z)]) return 3;
    return 0;
  };
  // grands bâtiments
  world.buildings.get(1).level = 7;
  place('farm', 14 + O, 28 + O, 0, 3);
  place('farm', 16 + O, 22 + O, 1, 2);
  place('mill', 18 + O, 31 + O, 0, 2);
  place('mill', 14 + O, 31 + O, 0, 1);
  place('park', 28 + O, 27 + O, 0, 3);
  place('school', 28 + O, 22 + O, 0, 3);
  place('clocktower', 26 + O, 27 + O, 0, 1);
  // le château, au bord de la rivière (premier emplacement libre)
  for (const [cx, cz] of [[28, 31], [22, 31], [29, 17], [17, 17]]) if (place('castle', cx + O, cz + O, 0, 1)) break;
  place('hospital', 22 + O, 27 + O, 0, 1);
  place('fountain', 23 + O, 25 + O, 0, 1);
  place('watertower', 33 + O, 20 + O, 0, 1);
  // décorations de la saison en cours, près de la mairie
  const sd = seasonAt().theme.decor;
  place(sd[0], 26 + O, 23 + O, 0, 1);
  place(sd[1], 23 + O, 23 + O, 0, 1);
  place(sd[2], 26 + O, 25 + O, 0, 1);
  // remplissage le long des rues
  const shops = ['market', 'bakery', 'tavern', 'forge', 'shop', 'market', 'tavern', 'well'];
  for (let z = 14 + O; z <= 35 + O; z++) {
    for (let x = 13 + O; x <= 36 + O; x++) {
      if (!land(x, z) || world.road[world.idx(x, z)] || world.occ[world.idx(x, z)] >= 0) continue;
      const adj = facing(x, z);
      const nearRoad = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dz]) => world.inside(x + dx, z + dz) && world.road[world.idx(x + dx, z + dz)]);
      if (!nearRoad) {
        if (rng() < 0.12) place('tree', x, z, 0, 1);
        continue;
      }
      const dist = Math.hypot(x - 24.5 - O, z - 24.5 - O);
      const r = rng();
      if (r < 0.1) place(shops[Math.floor(rng() * shops.length)], x, z, adj, 1 + Math.floor(rng() * 3));
      else if (r < 0.16) place(rng() < 0.5 ? 'flowers' : 'tree', x, z, adj, 1);
      else if (r < 0.19) place(rng() < 0.5 ? 'well' : 'clinic', x, z, adj, 2);
      else {
        const lvl = dist < 3.5 ? 5 : dist < 5 ? 4 + Math.floor(rng() * 2) : dist < 7 ? 3 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
        place('house', x, z, adj, lvl);
      }
    }
  }
  world.state.nextId = id;
  world.version++;
  world.terrainVersion++;
  world.trees?.rebuild(); // les cases défrichées n'ont plus d'arbres
}
