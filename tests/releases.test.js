import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { RELEASES, releasesSince } from '../src/data/releases.js';
import { VERSION } from '../src/version.js';

test('le carnet décrit la version courante et chaque version a un contenu', () => {
  assert.equal(RELEASES[0].version, VERSION);
  assert.equal(new Set(RELEASES.map((r) => r.version)).size, RELEASES.length);
  for (const release of RELEASES) {
    assert.ok(release.title && release.items.length);
    for (const item of release.items) assert.ok(item.icon && item.title && item.text);
  }
});

test('un joueur ne revoit automatiquement que les versions non lues', () => {
  // Dérivé du carnet lui-même : une nouvelle version n'oblige plus à retoucher ce test.
  assert.deepEqual(releasesSince(VERSION), []);
  const all = RELEASES.map((r) => r.version);
  for (let i = 0; i < all.length; i++) {
    assert.deepEqual(releasesSince(all[i]).map((r) => r.version), all.slice(0, i),
      `depuis ${all[i]}`);
  }
  // une version antérieure à tout le carnet ramène tout, une version inconnue aussi
  assert.deepEqual(releasesSince('0.0.1').map((r) => r.version), all);
  assert.deepEqual(releasesSince(null).map((r) => r.version), all);
});

test('le cache hors ligne comprend les nouveautés et tous ses fichiers existent', () => {
  const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(source.includes(`batisseur-v${VERSION}`));
  assert.ok(source.includes("'./src/ui/news.js'"));
  assert.ok(source.includes("'./src/ui/hudIcons.js'"));
  assert.ok(source.includes("'./src/data/releases.js'"));
  const files = [...source.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  for (const file of files) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  for (const file of readdirSync(new URL('../src/',import.meta.url), {recursive:true}).filter(f=>f.endsWith('.js'))) {
    assert.ok(files.includes('src/'+file), 'Module absent du cache : '+file);
  }
  assert.ok(files.includes('push-worker.js'));
  assert.ok(source.includes("importScripts('./push-worker.js')"));
});
