// Le lit d'ambiance : de vrais enregistrements fondus selon l'heure, la saison et la caméra.
// Ce qui se teste sans carte son, c'est le mélange : quelle couche doit s'entendre, et quand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS } from '../src/core/ambience.js';

const mix = (info) => Object.fromEntries(LAYERS.map((l) => [l.id,
  +Math.max(0, Math.min(1, l.want({ night: 0, winter: 0, close: 0, water: 0, population: 0, ...info }))).toFixed(2)]));

test('chaque couche a un identifiant, un fichier et un volume', () => {
  assert.equal(new Set(LAYERS.map((l) => l.id)).size, LAYERS.length);
  for (const l of LAYERS) {
    assert.match(l.file, /^audio\/[a-z_]+\.(ogg|mp3|m4a)$/);
    assert.ok(l.gain > 0 && l.gain <= 1, `${l.id} : volume hors bornes`);
    assert.equal(typeof l.want, 'function');
  }
});

test('le jour et la nuit se relaient sans trou ni superposition', () => {
  const jour = mix({ night: 0 });
  const nuit = mix({ night: 1 });
  assert.equal(jour.jour, 1);
  assert.equal(jour.nuit, 0);
  assert.equal(nuit.nuit, 1);
  assert.equal(nuit.jour, 0);
  // au crépuscule, les deux sont là, et leur somme reste proche de un
  const soir = mix({ night: 0.5 });
  assert.ok(Math.abs(soir.jour + soir.nuit - 1) < 0.05, `somme ${soir.jour + soir.nuit}`);
});

test('l\'hiver s\'entend le jour et s\'efface la nuit', () => {
  assert.ok(mix({ winter: 1 }).hiver > 0.9);
  assert.ok(mix({ winter: 1, night: 1 }).hiver < mix({ winter: 1 }).hiver);
  assert.equal(mix({ winter: 0 }).hiver, 0);
  // et il calme la couche de jour, sans la couper
  assert.ok(mix({ winter: 1 }).jour > 0 && mix({ winter: 1 }).jour < mix({ winter: 0 }).jour);
});

test('la rumeur du village et l\'eau ne s\'entendent qu\'en s\'approchant', () => {
  assert.equal(mix({ close: 0, population: 400, water: 1 }).village, 0);
  assert.equal(mix({ close: 0, population: 400, water: 1 }).eau, 0);
  assert.ok(mix({ close: 1, population: 400 }).village > 0.9);
  assert.ok(mix({ close: 1, water: 1 }).eau > 0.9);
});

test('un hameau de dix habitants ne fait pas le bruit d\'une ville', () => {
  const hameau = mix({ close: 1, population: 10 });
  const ville = mix({ close: 1, population: 400 });
  assert.ok(hameau.village > 0 && hameau.village < ville.village / 3);
});

test('la nuit, le village se tait', () => {
  assert.equal(mix({ close: 1, population: 400, night: 1 }).village, 0);
});
