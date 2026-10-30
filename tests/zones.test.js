// La boîte d'achat d'une zone doit dire ce qu'on pourra y bâtir : le banc d'essai a montré
// que la zone de départ n'a presque jamais d'eau, et que la chaîne de l'argile restait donc
// introuvable — le joueur voyait « Eau 18 % » sans savoir à quoi ça servait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/data/buildings.js';
import { MAIN_QUESTS } from '../src/data/quests.js';

test('l\'argilière est demandée avant la briqueterie qu\'elle alimente', () => {
  const ids = MAIN_QUESTS.map((q) => q.id);
  const clay = ids.indexOf('claypit');
  const brick = ids.indexOf('bricks');
  assert.ok(clay >= 0, 'la quête de l\'argilière existe');
  assert.ok(clay < brick, 'elle vient avant la briqueterie');
  // et plus généralement : tout producteur demandé par une quête doit voir ses intrants
  // demandés plus tôt, sinon le joueur bâtit une usine qui ne tournera jamais
  const askedAt = new Map();
  MAIN_QUESTS.forEach((q, i) => {
    if (q.goal.kind === 'count' && BUILDINGS[q.goal.type]) askedAt.set(q.goal.type, i);
  });
  for (const [type, at] of askedAt) {
    const needs = BUILDINGS[type].consumes;
    if (!needs) continue;
    for (const res of Object.keys(needs)) {
      const makers = Object.entries(BUILDINGS).filter(([, d]) => d.produces?.[res]).map(([t]) => t);
      if (!makers.length) continue;
      const earliest = Math.min(...makers.map((m) => askedAt.has(m) ? askedAt.get(m) : Infinity));
      assert.ok(earliest < at,
        `la quête « ${BUILDINGS[type].name} » arrive sans qu'aucune quête n'ait demandé de producteur de ${res}`);
    }
  }
});
