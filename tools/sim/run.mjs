// Campagne de mesure : on fait jouer plusieurs profils de joueur pendant plusieurs semaines
// et on relève ce qui se passe. Usage :
//   node tools/sim/run.mjs [jours] [sortie.json]
//
// Ce qu'on cherche n'est pas « le bot gagne-t-il », c'est où un joueur ordinaire attend,
// bute, s'enrichit sans rien pouvoir acheter, ou ne voit jamais la moitié du catalogue.
import { clock } from './clock.mjs';
import { newGame, play, away } from './world.mjs';
import { Player } from './player.mjs';
import { BUILDINGS } from '../../src/data/buildings.js';
import { RESOURCES } from '../../src/data/resources.js';

const DAYS = Number(process.argv[2] || 21);
const OUT = process.argv[3] || null;

// Trois façons de jouer. `sessions` par jour, `minutes` chacune.
const PROFILES = [
  { name: 'pressé', sessions: 6, minutes: 4 },
  { name: 'régulier', sessions: 3, minutes: 18 },
  { name: 'acharné', sessions: 10, minutes: 12 },
];
const SEEDS = (process.env.SEEDS || '7,4242,90125').split(',').map(Number);

/** Une partie complète pour un profil et une graine. */
function run(profile, seed) {
  const g = newGame({ seed });
  const p = new Player(g, { name: profile.name });
  const days = [];
  const levelDay = {};              // niveau → jour réel où il a été atteint
  const questDay = {};              // quête → premier jour où elle était en cours
  let decisions = 0, idle = 0;

  for (let day = 0; day < DAYS; day++) {
    const gapHours = 24 / profile.sessions;
    for (let s = 0; s < profile.sessions; s++) {
      const steps = Math.round(profile.minutes * 4);   // une décision toutes les 15 s
      for (let i = 0; i < steps; i++) {
        const before = p.idleActions;
        p.decide();
        decisions++;
        if (p.idleActions > before) idle++;
        play(g, 15, 1);
      }
      away(g, gapHours * 3600 - profile.minutes * 60);
    }
    const q = g.prog.currentQuest();
    if (q && questDay[q.id] === undefined) questDay[q.id] = day + 1;
    if (levelDay[g.state.level] === undefined) levelDay[g.state.level] = day + 1;
    days.push({
      day: day + 1,
      level: g.state.level,
      pop: Math.round(g.sim.d.population),
      happiness: +(g.sim.d.happiness || 0).toFixed(2),
      coins: Math.round(g.state.res.coins),
      buildings: g.world.buildings.size,
      zones: g.state.zones.filter(Boolean).length,
      quest: q ? q.id : 'terminé',
      res: Object.fromEntries(Object.keys(g.state.res).map((k) => [k, Math.round(g.state.res[k])])),
    });
  }

  const built = {};
  for (const b of g.world.buildings.values()) built[b.type] = (built[b.type] || 0) + 1;
  return {
    profile: profile.name,
    seed,
    days,
    levelDay,
    questDay,
    built,
    decisions,
    idle,
    idleShare: +(idle / decisions).toFixed(3),
    blocked: Object.fromEntries([...p.blocked.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
    end: days[days.length - 1],
  };
}

/* ───────── Campagne ───────── */
const runs = [];
for (const prof of PROFILES) {
  for (const seed of SEEDS) {
    const t0 = Date.now();
    runs.push(run(prof, seed));
    process.stderr.write(`· ${prof.name} / graine ${seed} — ${runs[runs.length - 1].end.level} niveaux, ${runs[runs.length - 1].end.pop} habitants\n`);
  }
}

/* ───────── Dépouillement ───────── */
const line = (s) => console.log(s);
line(`\n═══ ${DAYS} jours de jeu, ${PROFILES.length} profils × ${SEEDS.length} cartes ═══\n`);

line('PROGRESSION — niveau et village atteints au bout de la période');
for (const r of runs) {
  line(`  ${r.profile.padEnd(9)} graine ${String(r.seed).padEnd(6)} niveau ${String(r.end.level).padStart(3)} · ${String(r.end.pop).padStart(4)} habitants · ${String(r.end.buildings).padStart(4)} bâtiments · ${String(r.end.zones).padStart(3)} zones · ${r.end.coins.toLocaleString('fr-FR')} pièces`);
}

line('\nTEMPS MORT — part des moments où le joueur n\'a rien à faire');
for (const r of runs) {
  const pct = Math.round(r.idleShare * 100);
  line(`  ${r.profile.padEnd(9)} graine ${String(r.seed).padEnd(6)} ${String(pct).padStart(3)} %  ${'█'.repeat(Math.round(pct / 3))}`);
}

line('\nCE QUI BLOQUE — nombre de décisions concernées (toutes parties confondues)');
const allBlocked = {};
for (const r of runs) for (const [k, v] of Object.entries(r.blocked)) allBlocked[k] = (allBlocked[k] || 0) + v;
for (const [k, v] of Object.entries(allBlocked).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  line(`  ${String(v).padStart(6)}  ${k}`);
}

line('\nQUÊTES — celles sur lesquelles on reste bloqué (jours passés dessus, moyenne)');
const questStay = {};
for (const r of runs) {
  const ids = Object.keys(r.questDay);
  // la dernière quête est encore en cours à la fin : la compter fausserait la moyenne
  for (let i = 0; i + 1 < ids.length; i++) {
    (questStay[ids[i]] ||= []).push(r.questDay[ids[i + 1]] - r.questDay[ids[i]]);
  }
}
const stuck = Object.entries(questStay)
  .map(([id, a]) => [id, a.reduce((s, x) => s + x, 0) / a.length])
  .filter(([, d]) => d >= 2)
  .sort((a, b) => b[1] - a[1]);
if (!stuck.length) line('  (aucune quête ne retient le joueur plus de deux jours)');
for (const [id, d] of stuck.slice(0, 12)) line(`  ${d.toFixed(1).padStart(5)} j  ${id}`);

line('\nCATALOGUE — bâtiments jamais construits par aucun profil');
const everBuilt = new Set();
for (const r of runs) for (const t of Object.keys(r.built)) everBuilt.add(t);
const buildable = Object.entries(BUILDINGS).filter(([, d]) => !d.notBuildable);
const never = buildable.filter(([t]) => !everBuilt.has(t));
line(`  ${never.length} sur ${buildable.length} (${Math.round(100 * never.length / buildable.length)} %)`);
const byUnlock = never.map(([t, d]) => ({ t, u: d.unlock || 1 })).sort((a, b) => a.u - b.u);
line('  les plus précoces : ' + byUnlock.slice(0, 14).map((x) => `${x.t}(niv ${x.u})`).join(', '));

line('\nRESSOURCES — stock moyen en fin de période (surplus inutile ou pénurie)');
const resSum = {};
for (const r of runs) for (const [k, v] of Object.entries(r.end.res)) (resSum[k] ||= []).push(v);
const rows = Object.entries(resSum).map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length]).sort((a, b) => b[1] - a[1]);
for (const [k, v] of rows.slice(0, 10)) line(`  ${String(Math.round(v)).padStart(8)}  ${RESOURCES[k]?.name || k}`);
const zero = rows.filter(([, v]) => v < 1).map(([k]) => RESOURCES[k]?.name || k);
if (zero.length) line(`  jamais en stock : ${zero.join(', ')}`);

if (OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT, JSON.stringify({ days: DAYS, runs }, null, 1));
  line(`\n(relevé détaillé écrit dans ${OUT})`);
}
