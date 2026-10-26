import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, migrateState, ORDER_DAY_MS } from '../src/core/state.js';
import { Progression } from '../src/sim/Progression.js';

function fixture() {
  const state = createNewState();
  state.level = 3;
  const game = { state, bus: { emit() {} }, actions: { grant() {} } };
  const prog = new Progression(game);
  prog.addXP = () => {};
  prog.makeOrder = () => ({ id: 42, items: [], coins: 10, xp: 5 });
  state.orders.readyAt.fill(Infinity);
  return { state, prog };
}

test('livraison : six heures réelles, indépendantes du calendrier et de la vitesse', (t) => {
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const { state, prog } = fixture();
  state.orders.slots[0] = { items: [], coins: 10, xp: 5 };
  assert.equal(prog.deliverOrder(0), true);
  assert.equal(state.orders.readyAt[0], now + ORDER_DAY_MS / 4);
  state.time.day += 100;
  state.time.speed = 4;
  prog.refreshOrders();
  assert.equal(state.orders.slots[0], null);
  state.time.speed = 0;
  now += ORDER_DAY_MS / 4 - 1;
  prog.refreshOrders();
  assert.equal(state.orders.slots[0], null);
  now++;
  prog.refreshOrders();
  assert.equal(state.orders.slots[0].id, 42);
});

test('refus : douze heures réelles, y compris après sauvegarde et retour au jeu', (t) => {
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const { state, prog } = fixture();
  state.orders.slots[1] = { items: [] };
  assert.equal(prog.discardOrder(1), true);
  assert.equal(state.orders.readyAt[1], now + ORDER_DAY_MS / 2);
  const saved = JSON.stringify(state);
  now += ORDER_DAY_MS / 2;
  prog.game.state = migrateState(JSON.parse(saved));
  prog.refreshOrders();
  assert.equal(prog.st.orders.slots[1].id, 42);
});

test('migration : préserve les commandes et convertit une seule fois le temps restant', (t) => {
  const now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const state = createNewState();
  state.savedAt = now - ORDER_DAY_MS / 8;
  state.time.day = 5;
  const order = { id: 7, items: [] };
  state.orders = { slots: [order, null, null], cooldown: [0, 5.25, 4], nextId: 8 };
  migrateState(state);
  assert.equal(state.orders.slots[0], order);
  assert.deepEqual(state.orders.readyAt, [0, now + ORDER_DAY_MS / 8, 0]);
  assert.equal('cooldown' in state.orders, false);
  const readyAt = [...state.orders.readyAt];
  migrateState(state);
  assert.deepEqual(state.orders.readyAt, readyAt);
});
