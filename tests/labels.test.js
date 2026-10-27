import test from 'node:test';
import assert from 'node:assert/strict';
import { labelRect, fitsLabel, overlapsLabel } from '../src/render/labelLayout.js';

test('Les étiquettes doivent tenir entièrement entre les HUD et les bords', () => {
  assert.equal(fitsLabel(labelRect(200,150,80,40),568,320,84,86),true);
  for (const r of [labelRect(20,150,80,40),labelRect(550,150,80,40),labelRect(200,110,80,40),labelRect(200,250,80,40)]) {
    assert.equal(fitsLabel(r,568,320,84,86),false);
  }
});
test('Deux étiquettes se chevauchant ou trop proches ne doivent pas masquer leur action', () => {
  const a=labelRect(200,150,80,40);
  assert.equal(overlapsLabel(a,labelRect(220,160,80,40)),true);
  assert.equal(overlapsLabel(a,labelRect(282,150,80,40)),true);
  assert.equal(overlapsLabel(a,labelRect(290,150,80,40)),false);
});
