// Compare deux relevés du banc d'essai : avant / après un changement d'équilibrage.
//   node tools/sim/compare.mjs avant.json [apres.json]
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Les quelques nombres qui résument une campagne. */
function digest(data) {
  const r = data.runs;
  const stuck = {};
  for (const run of r) {
    const ids = Object.keys(run.questDay);
    for (let i = 0; i < ids.length; i++) {
      const stay = (i + 1 < ids.length ? run.questDay[ids[i + 1]] : data.days + 1) - run.questDay[ids[i]];
      (stuck[ids[i]] ||= []).push(stay);
    }
  }
  const worst = Object.entries(stuck).map(([id, a]) => [id, avg(a)]).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const goods = ['clay', 'bricks', 'iron', 'tools', 'wool', 'fabric', 'clothing', 'pastries', 'furniture', 'cheese', 'jam', 'ceramics', 'machinery'];
  const touched = goods.filter((g) => r.some((run) => (run.end.res[g] || 0) > 0)).length;
  const lvl = r.map((x) => x.end.level);
  return {
    'niveau moyen': avg(lvl),
    'niveau le plus bas': Math.min(...lvl),
    'niveau le plus haut': Math.max(...lvl),
    'écart entre cartes': Math.max(...lvl) - Math.min(...lvl),
    'habitants': avg(r.map((x) => x.end.pop)),
    'temps mort %': avg(r.map((x) => x.idleShare)) * 100,
    'pièces en caisse': avg(r.map((x) => x.end.coins)),
    'quête la plus longue (j)': worst[1],
    'marchandises avancées touchées': touched,
    '_worstQuest': worst[0],
  };
}

const a = digest(load(process.argv[2]));
const b = process.argv[3] ? digest(load(process.argv[3])) : null;

const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('fr-FR') : (+v).toFixed(1));
const keys = Object.keys(a).filter((k) => k[0] !== '_');
const w = Math.max(...keys.map((k) => k.length));
if (!b) {
  for (const k of keys) console.log(`  ${k.padEnd(w)}  ${fmt(a[k]).padStart(10)}`);
} else {
  console.log(`  ${''.padEnd(w)}  ${'avant'.padStart(10)}  ${'après'.padStart(10)}  écart`);
  for (const k of keys) {
    const d = b[k] - a[k];
    const sign = d > 0 ? '+' : '';
    console.log(`  ${k.padEnd(w)}  ${fmt(a[k]).padStart(10)}  ${fmt(b[k]).padStart(10)}  ${sign}${fmt(d)}`);
  }
}
console.log(`  quête la plus longue : ${a._worstQuest}${b ? ` → ${b._worstQuest}` : ''}`);
