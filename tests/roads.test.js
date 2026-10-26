import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TYPES, isPavedRoad } from '../src/data/buildings.js';
import { Actions } from '../src/core/Actions.js';

function fixture() {
  const size = 5;
  const world = {
    occ: new Int32Array(size * size).fill(-1),
    road: new Uint8Array(size * size),
    terrain: new Uint8Array(size * size),
    idx: (x, z) => z * size + x,
    xOf: (i) => i % size,
    zOf: (i) => Math.floor(i / size),
    inside: (x, z) => x >= 0 && z >= 0 && x < size && z < size,
    zoneUnlocked: () => true,
    setRoad(i, type) { this.road[i] = type; },
  };
  const events = [];
  const state = { mode: 'libre', res: {}, stats: { roadsBuilt: 0, daily: { roads: 0 } } };
  const game = {
    world, state, bus: { emit: (...args) => events.push(args) },
    prog: { roadUnlocked: () => true, bridgeUnlocked: () => true, recount() {} },
    sim: { markDirty() {} },
  };
  return { world, events, actions: new Actions(game) };
}

test('les six voies ont un coût et les variantes carrossables sont reconnues', () => {
  assert.equal(Object.keys(ROAD_TYPES).length, 6);
  for (const [id, def] of Object.entries(ROAD_TYPES)) {
    assert.equal(def.type, Number(id));
    assert.ok(def.cost.coins > 0);
    assert.ok(def.bridgeCost.coins > 0);
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6].filter(isPavedRoad), [2, 4, 6]);
});

test('un chemin peut devenir une rue en pavés et garde son type lors de l’annulation', () => {
  const { world, actions, events } = fixture();
  const i = world.idx(2, 2);
  assert.equal(actions.placeRoads([i], 3).ok, true);
  assert.equal(world.road[i], 3);
  assert.equal(actions.checkRoadTile(i, 4).upgrade, true);
  assert.equal(actions.placeRoads([i], 4).ok, true);
  assert.equal(world.road[i], 4);
  assert.deepEqual(events.filter(([name]) => name === 'roads:changed').map(([, tiles]) => tiles), [[i], [i]]);
  assert.equal(actions.undo().ok, true);
  assert.equal(world.road[i], 3);
});

test('la même surface n’est pas facturée deux fois et un bâtiment bloque la route', () => {
  const { world, actions } = fixture();
  const i = world.idx(1, 1);
  assert.equal(actions.placeRoads([i], 6).ok, true);
  assert.equal(actions.checkRoadTile(i, 6).skip, true);
  assert.equal(actions.checkRoadTile(i, 1).skip, true);
  world.occ[world.idx(3, 3)] = 123;
  assert.equal(actions.checkRoadTile(world.idx(3, 3), 6).ok, false);
});
