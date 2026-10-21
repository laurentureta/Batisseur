// Village de démonstration affiché derrière l'écran d'accueil.
import { T, SIZE } from '../world/constants.js';
import { BUILDINGS, sizeOf, residentsAt } from '../data/buildings.js';
import { mulberry32 } from './rng.js';

export function populateDemo(world) {
  const rng = mulberry32(4242);
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
  for (let x = 15; x <= 34; x++) road(x, 26, 2);
  for (let x = 17; x <= 32; x++) road(x, 21, 2);
  for (let z = 16; z <= 33; z++) road(27, z, 2);
  for (let z = 17; z <= 32; z++) road(21, z, 1);
  for (let x = 21; x <= 31; x++) road(x, 30, 1);
  for (let z = 21; z <= 26; z++) road(32, z, 1);

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
  world.buildings.get(1).level = 5;
  place('farm', 14, 28, 0, 3);
  place('farm', 16, 22, 1, 2);
  place('mill', 18, 31, 0, 2);
  place('park', 28, 27, 0, 3);
  place('school', 28, 22, 0, 3);
  place('clocktower', 26, 27, 0, 1);
  place('stadium', 33, 27, 0, 1);
  place('hospital', 22, 27, 0, 1);
  place('fountain', 23, 25, 0, 1);
  place('watertower', 33, 20, 0, 1);
  // remplissage le long des rues
  const shops = ['market', 'bakery', 'shop', 'tavern', 'shop', 'market'];
  for (let z = 14; z <= 35; z++) {
    for (let x = 13; x <= 36; x++) {
      if (!land(x, z) || world.road[world.idx(x, z)] || world.occ[world.idx(x, z)] >= 0) continue;
      const adj = facing(x, z);
      const nearRoad = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dz]) => world.inside(x + dx, z + dz) && world.road[world.idx(x + dx, z + dz)]);
      if (!nearRoad) {
        if (rng() < 0.12) place('tree', x, z, 0, 1);
        continue;
      }
      const dist = Math.hypot(x - 24.5, z - 24.5);
      const r = rng();
      if (r < 0.1) place(shops[Math.floor(rng() * shops.length)], x, z, adj, 1 + Math.floor(rng() * 3));
      else if (r < 0.16) place(rng() < 0.5 ? 'flowers' : 'tree', x, z, adj, 1);
      else if (r < 0.19) place(rng() < 0.5 ? 'well' : 'clinic', x, z, adj, 2);
      else {
        const lvl = dist < 4 ? 5 : dist < 6 ? 4 + Math.floor(rng() * 2) : dist < 8 ? 3 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
        place('house', x, z, adj, lvl);
      }
    }
  }
  world.state.nextId = id;
  world.version++;
  world.terrainVersion++;
  void SIZE;
}
