// Fiche d'un bâtiment : état, production, besoins, amélioration, déplacement, démolition.
import { h, costChips, progressBar } from './dom.js';
import {
  BUILDINGS, NEEDS, COVER_NAMES, levelName, workersAt, residentsAt, radiusAt, upkeepAt, PROD_MULT, INCOME_MULT, sizeOf, prodMult,
} from '../data/buildings.js';
import { RANKS, MAIRIE_FOR_LEVEL } from '../data/progression.js';
import { RESOURCES } from '../data/resources.js';
import { STATUS_TEXT, TIER_NAMES, workTier } from '../sim/Simulation.js';
import { fmt, fmtDec } from '../core/util.js';
import { moodIcon } from './UI.js';
import { nearLabel } from '../core/Actions.js';
import { WORKSITES, ACT_TEXT, ROLE_NAMES } from '../sim/Villagers.js';
import { PHASES, phaseOf, BUILDER_TEXT, durationText, skipGems } from '../sim/Construction.js';

export function renderInfo(ui, body, sheet, id) {
  const game = ui.game;
  const b = game.world.buildings.get(id);
  if (!b) {
    ui.closeSheet();
    return;
  }
  const def = BUILDINGS[b.type];
  const inf = game.sim.info.get(b.id) || {};
  const libre = game.state.mode === 'libre';
  const d = game.sim.d;

  // en-tête
  const title = levelName(def, b.level);
  sheet.titleEl.textContent = '';
  sheet.titleEl.append(
    h('img.info-thumb', { src: game.renderer.thumbs.get(b.type, b.level), alt: '' }),
    h('div.info-title', h('b', title), h('small', def.maxLevel > 1 ? `Niveau ${b.level} / ${def.maxLevel}` : def.cat === 'monuments' ? 'Monument' : '')),
  );

  // état
  const status = inf.status || 'ok';
  let statusText = STATUS_TEXT[status] || '';
  if (status === 'noResource' && def.near) statusText = `Il faut ${nearLabel(def.near.label)} à proximité`;
  if (status === 'noWorkers') statusText += ` (${Math.round((inf.staff ?? d.staffing) * 100)} %)`;
  if (status === 'noInput' && def.consumes) statusText = `En attente de ${Object.keys(def.consumes).map((r) => RESOURCES[r].name.toLowerCase()).join(' et ')}`;
  if (def.cat === 'decor' && status === 'noRoad') statusText = def.coverage ? 'Embellit déjà le quartier · relie-le à une route pour les loisirs' : 'Décor : pas besoin de route';
  const okish = status === 'ok' || (def.cat === 'decor');
  body.appendChild(h('div.status-pill.' + (okish ? 'ok' : status === 'fire' ? 'bad' : status === 'empty' || status === 'building' ? 'info' : 'warn'), statusText));

  // chantier en cours
  if (b.cons) {
    renderSite(ui, game, b, body, sheet);
    if (b.cons.k === 'new') {
      body.appendChild(h('p.desc', def.desc));
      const actions = h('div.info-actions');
      actions.appendChild(h('button.btn.danger-soft', { onclick: () => ui.confirmDemolish(b.id) }, '💥 Abandonner le chantier'));
      actions.appendChild(h('button.btn', { onclick: () => game.renderer.focusBuilding(b, 9) }, '🔍 Zoomer'));
      body.appendChild(actions);
      return;
    }
  }

  if (b.fire) {
    const cost = game.actions.extinguishCost(b);
    body.appendChild(h('div.fire-box',
      h('p', b.fire.covered ? '🚒 Les pompiers sont en route.' : '🔥 Le bâtiment va brûler ! Éteins le feu vite.'),
      b.fire.covered ? null : h('button.btn.danger', {
        onclick: () => {
          const r = game.actions.extinguish(b.id);
          if (r.ok) {
            game.sound.play('coin');
            ui.toast('🚒 Feu éteint !', 'good');
          } else ui.toast(r.reason, 'error');
          sheet.refresh(true);
        },
      }, 'Éteindre le feu ', costChips(cost, game.state.res, { libre })),
    ));
  }

  const rows = h('div.info-rows');
  const row = (label, value) => rows.appendChild(h('div.info-row', h('span', label), h('b', value)));

  // habitations
  if (def.residents) {
    const cap = residentsAt(def, b.level);
    row('👥 Habitants', `${fmt(b.residents || 0)} / ${cap}`);
    row(`${moodIcon(inf.happiness ?? 0.5)} Bonheur`, `${Math.round((inf.happiness ?? 0.5) * 100)} %`);
    const tax = (b.residents || 0) * def.tax[b.level - 1] * (0.5 + (inf.happiness ?? 0.5));
    row('🪙 Impôts', `${fmtDec(tax, 0)} / jour`);
    if (inf.beauty > 0.005) row('🌷 Beauté du quartier', `+${Math.round(inf.beauty * 100)} %`);
    if (inf.pollution > 0.005) row('🏭 Pollution', `−${Math.round(inf.pollution * 100)} %`);
    body.appendChild(rows);
    const needsBox = h('div.needs');
    for (const k of Object.keys(NEEDS)) {
      const ok = !!inf.needs?.[k];
      needsBox.appendChild(h('div.need' + (ok ? '.ok' : ''), h('span.ni', NEEDS[k].icon), h('span.nl', NEEDS[k].name), h('span.ns', ok ? '✓' : '✗')));
    }
    body.appendChild(h('div.section-title', 'Besoins du quartier'));
    body.appendChild(needsBox);
    if (def.needsToGrow && !inf.allNeeds) body.appendChild(h('p.hint', 'Les habitants ne viendront que si tous les besoins sont couverts.'));
  }

  // production
  if (def.produces) {
    const mult = prodMult(b.level);
    const eff = inf.eff ?? 0;
    const prod = Object.entries(def.produces).map(([r, v]) => `${RESOURCES[r].icon} ${fmtDec(v * mult * eff, 0)}`).join('  ');
    row('Production', `${prod} / jour`);
    if (def.consumes) row('Consommation', `${Object.entries(def.consumes).map(([r, v]) => `${RESOURCES[r].icon} ${fmtDec(v * mult * eff, 0)}`).join('  ')} / jour`);
    row('Efficacité', `${Math.round(eff * 100)} %`);
    if (def.near) row(`Ressource proche (${def.near.label})`, `${inf.nearCount ?? 0} cases`);
    if (def.seasonal) row('Saison', def.seasonal === 'farm' ? 'Top en été, faible en hiver' : 'Moins en hiver');
  }
  if (def.workers) row('👷 Ouvriers', `${Math.round(workersAt(def, b.level) * (inf.staff ?? 1))} / ${workersAt(def, b.level)} · priorité ${TIER_NAMES[workTier(def)].toLowerCase()}`);
  if (def.coverage) row(`${COVER_NAMES[def.coverage.need].icon} Rayon (${COVER_NAMES[def.coverage.need].name})`, `${fmtDec(radiusAt(def, b.level))} cases`);
  if (def.income) row('🪙 Revenus', `${fmtDec(inf.income || 0, 0)} / jour`);
  if (def.storage) row('📦 Stockage', `+${fmt(def.storage[b.level - 1])}`);
  if (b.type === 'townhall') row('📦 Stockage', `+${fmt(150 * b.level)}`);
  if (def.upkeep) row('💸 Entretien', `${upkeepAt(def, b.level)} 🪙 / jour`);
  if (def.beauty) row('🌷 Beauté', `+${Math.round(def.beauty.v * 100)} % (rayon ${def.beauty.r})`);
  if (def.bonus) {
    const parts = [];
    if (def.bonus.taxes) parts.push(`+${Math.round(def.bonus.taxes * 100)} % d'impôts`);
    if (def.bonus.happiness) parts.push(`+${Math.round(def.bonus.happiness * 100)} % de bonheur`);
    if (def.bonus.tourism) parts.push(`tourisme jusqu'à ${def.bonus.tourism} 🪙/j`);
    if (def.bonus.fishers) parts.push(`+${Math.round(def.bonus.fishers * 100)} % de pêche`);
    row('✨ Bonus', parts.join(', '));
  }
  if (!def.residents && rows.childNodes.length) body.appendChild(rows);
  // l'équipe : qui travaille ici et ce que chacun fait en ce moment
  renderTeam(game, b, def, body);
  body.appendChild(h('p.desc', def.desc));

  // amélioration
  if (def.maxLevel > 1) {
    const chk = game.actions.checkUpgrade(b);
    const box = h('div.upgrade-box');
    if (chk.max) {
      box.appendChild(h('div.section-title', '⭐ Niveau maximum atteint'));
    } else {
      box.appendChild(h('div.section-title', `⬆️ Améliorer : ${chk.name}`));
      const gains = h('div.gains');
      const to = b.level + 1;
      if (def.residents) gains.appendChild(h('span.gain', `👥 ${residentsAt(def, b.level)} → ${residentsAt(def, to)}`));
      if (def.produces && b.type !== 'townhall') gains.appendChild(h('span.gain', `⚙️ ×${fmtDec(prodMult(b.level))} → ×${fmtDec(prodMult(to))}`));
      if (def.coverage && radiusAt(def, to) !== radiusAt(def, b.level)) gains.appendChild(h('span.gain', `📡 ${fmtDec(radiusAt(def, b.level))} → ${fmtDec(radiusAt(def, to))}`));
      if (def.income) gains.appendChild(h('span.gain', `🪙 ×${fmtDec(INCOME_MULT[b.level - 1])} → ×${fmtDec(INCOME_MULT[to - 1])}`));
      if (def.storage) gains.appendChild(h('span.gain', `📦 ${fmt(def.storage[b.level - 1])} → ${fmt(def.storage[to - 1])}`));
      if (b.type === 'townhall') gains.appendChild(h('span.gain', `🏛️ ${RANKS[to - 1].name}`));
      if (gains.childNodes.length) box.appendChild(gains);
      const reqs = h('div.reqs');
      for (const r of chk.reqs) {
        const label = r.need ? `${NEEDS[r.need].icon} ${NEEDS[r.need].name}` : r.label;
        reqs.appendChild(h('span.req' + (r.ok ? '.ok' : ''), `${r.ok ? '✓' : '✗'} ${label}`));
      }
      if (chk.reqs.length) box.appendChild(reqs);
      box.appendChild(costChips(chk.cost, game.state.res, { libre }));
      const reason = chk.reasons.find((x) => x && !x.startsWith('Il manque')) || chk.reasons[0];
      const up = h('button.btn.primary.wide', {
        disabled: !chk.ok,
        onclick: () => {
          const res = game.actions.upgrade(b.id);
          if (!res.ok) {
            game.sound.play('error');
            ui.toast(res.reason, 'error');
          }
          sheet.refresh(true);
        },
      }, chk.ok ? `⬆️ Améliorer (niveau ${to})` : reason || 'Impossible');
      box.appendChild(up);
      if (!chk.ok && chk.reasons.some((x) => x === 'Besoins non couverts')) {
        box.appendChild(h('p.hint', 'Construis les services manquants à proximité (puits, marché, taverne, école…).'));
      }
      if (b.type !== 'townhall' && !libre) {
        const need = MAIRIE_FOR_LEVEL[Math.min(to, 5)];
        if (game.townhallLevel() < need) box.appendChild(h('p.hint', `Améliore d'abord la mairie au rang ${RANKS[need - 1].name}.`));
      }
    }
    body.appendChild(box);
  }

  // mairie : progression vers le rang suivant
  if (b.type === 'townhall') {
    const next = game.prog.mairieNext();
    if (next && !libre) {
      const pop = Math.floor(d.population);
      body.appendChild(h('div.section-title', `Vers le rang ${next.rank.name}`));
      body.appendChild(h('div.mini-stat', `⭐ Niveau ${game.state.level} / ${next.rank.level}`));
      body.appendChild(progressBar(game.state.level / next.rank.level));
      body.appendChild(h('div.mini-stat', `👥 ${fmt(pop)} / ${fmt(next.rank.pop)} habitants`));
      body.appendChild(progressBar(pop / Math.max(1, next.rank.pop)));
    }
  }

  // actions
  const actions = h('div.info-actions');
  if (b.type !== 'townhall') {
    actions.appendChild(h('button.btn', {
      onclick: () => {
        ui.closeSheet(true);
        game.setTool({ kind: 'move', id: b.id, rot: b.rot });
        game.select(null);
      },
    }, '✋ Déplacer'));
    actions.appendChild(h('button.btn.danger-soft', { onclick: () => ui.confirmDemolish(b.id) }, '💥 Détruire'));
  }
  actions.appendChild(h('button.btn', { onclick: () => game.renderer.focusBuilding(b, 12) }, '🔍 Zoomer'));
  body.appendChild(actions);
  void sizeOf;
}

/* ───────── Chantier ───────── */
function renderSite(ui, game, b, body, sheet) {
  const C = game.construction;
  const c = b.cons;
  const p = C.progress(b);
  const pct = Math.floor(p * 100);
  const box = h('div.site-box');
  const up = c.k === 'up';
  body.appendChild(h('div.section-title', up ? '🏗️ Amélioration en cours' : '🏗️ Chantier'));
  if (c.ready) {
    box.appendChild(h('div.site-phase-name', up ? `Les travaux sont finis : niveau ${c.to} prêt !` : 'Le bâtiment est terminé !'));
    box.appendChild(h('p.hint', 'Inaugure-le pour qu\'il entre en service (et fête ça avec les bâtisseurs).'));
    body.appendChild(box);
    body.appendChild(h('button.btn.primary.inaugurate.wide', { onclick: () => ui.inaugurate(b.id) }, '🎉 Inaugurer'));
    return;
  }
  box.appendChild(h('div.site-phase-name', `${up ? `Travaux vers le niveau ${c.to}` : phaseOf(p).name} · ${pct} %`));
  // les étapes du chantier
  const bar = h('div.site-phases');
  const list = up ? [{ at: 0 }, { at: 1 }] : [...PHASES, { at: 1 }];
  for (let k = 0; k < list.length - 1; k++) {
    const a = list[k].at, z = list[k + 1].at;
    const f = Math.min(1, Math.max(0, (p - a) / (z - a)));
    bar.appendChild(h('span', { title: list[k].name || '' }, h('i', { style: { width: `${Math.round(f * 100)}%` } })));
  }
  box.appendChild(bar);
  const left = C.secondsLeft(b);
  box.appendChild(h('div.site-timer', h('span', '⏱️ Temps restant (réel)'), h('b', durationText(left))));
  box.appendChild(h('p.hint', 'Le chantier avance en temps réel, même quand le jeu est fermé. Reviens l\'inaugurer quand il est fini !'));
  body.appendChild(box);
  const crew = C.crewOf(b.id);
  if (crew.length) {
    const team = h('div.team');
    for (const w of crew) team.appendChild(h('div.mate', h('span.mi', w.girl ? '👷‍♀️' : '👷'), h('div.mt', h('b', `${w.name} · Bâtisseur`), h('small', BUILDER_TEXT[w.act] || BUILDER_TEXT[w.state] || 'au travail'))));
    body.appendChild(team);
  }
  const libre = game.state.mode === 'libre';
  const gems = libre ? 0 : skipGems(left);
  body.appendChild(h('button.btn.primary.gem-skip.wide', {
    onclick: () => {
      const r = game.actions.finishSite(b.id);
      if (!r.ok) {
        ui.toast(r.reason, 'error');
        if (r.gems) ui.openShop?.('gems');
      }
      sheet.refresh(true);
    },
  }, gems ? `⏩ Terminer maintenant · ${gems} 💎` : '⏩ Terminer maintenant'));
}

/* ───────── Équipe au travail ───────── */
const CROP_NAMES = { carrot: 'carottes', tomato: 'tomates', potato: 'pommes de terre', wheat: 'blé', corn: 'maïs' };

function renderTeam(game, b, def, body) {
  const V = game.villagers;
  if (!V || !def.workers) return;
  const team = V.workersOf(b.id);
  const ws = WORKSITES[b.type];
  const s = b.work;
  // le site : récolte en cours, arbres autour
  if (ws && s) {
    const box = h('div.site-box');
    if (b.type === 'lumber') {
      const c = game.world.centerOf(b);
      const r = (def.near?.radius || 3) + 0.5;
      const standing = game.world.trees.findNear(c.cx - game.world.size / 2, c.cz - game.world.size / 2, r, 99).length;
      box.append(
        siteRow('🌲', 'Arbres debout autour', `${standing}`),
        siteRow('🪓', 'Bois par arbre', `${fmtDec(s.unit || 0, 0)}`),
        siteRow('⏳', 'Travail en cours', `${fmtDec(Math.min(s.acc, s.unit || 1) / Math.max(1, s.unit) * 100, 0)} %`),
        siteRow('🪵', 'Rapporté aujourd\'hui', `${fmtDec(s.pile || 0, 0)} bois`),
      );
    } else if (ws.gather || ws.farm) {
      const what = { quarry: 'La carrière', mine: 'La mine', claypit: 'L\'argilière', fisher: 'La pêche', coop: 'Le poulailler', pasture: 'L\'étable' }[b.type];
      box.append(
        siteRow('⏳', b.type === 'fisher' ? 'Poissons à attraper' : b.type === 'coop' ? 'Œufs à ramasser' : b.type === 'pasture' ? 'Lait à traire' : 'Travail en cours', `${fmtDec(Math.min(s.acc, s.unit || 1) / Math.max(1, s.unit) * 100, 0)} %`),
        siteRow(RESOURCES[ws.res].icon, 'Rapporté par tournée', `${fmtDec(s.unit || 0, 0)} ${RESOURCES[ws.res].name.toLowerCase()}`),
        siteRow('🧺', game.villagers.hasCarter() ? 'En attente du charretier' : 'Rapporté aujourd\'hui', `${fmtDec(s.pile || 0, 0)}`),
      );
      void what;
    } else if (s.beds) {
      const PH = ['à bêcher', 'bêché, à semer', 'pousse', 'prêt à récolter'];
      s.beds.forEach((bed, k) => {
        const crop = CROP_NAMES[ws.crops[bed.crop % ws.crops.length]];
        const pct = bed.ph === 3 ? 100 : bed.ph === 2 ? Math.round((bed.a / Math.max(0.01, s.unit)) * 100) : 0;
        const label = `${b.type === 'farm' ? 'Champ' : 'Planche'} ${k + 1} · ${crop}`;
        const row = h('div.bed-row', h('span.bl', label), h('span.bs', bed.ph === 2 ? `${pct} %` : PH[bed.ph]));
        if (bed.ph >= 2) row.appendChild(h('div.bed-bar', h('i', { style: { width: `${pct}%` } })));
        box.appendChild(row);
      });
      box.appendChild(siteRow('🧺', 'Rapporté aujourd\'hui', `${fmtDec(s.pile || 0, 0)} ${RESOURCES[ws.res].name.toLowerCase()}`));
    }
    const titles = { lumber: 'La coupe', farm: 'Les champs', garden: 'Le potager', quarry: 'La carrière', mine: 'La mine', claypit: 'L\'argilière', fisher: 'La pêche', coop: 'Le poulailler', pasture: 'L\'étable' };
    body.appendChild(h('div.section-title', titles[b.type] || 'Le travail'));
    body.appendChild(box);
  }
  if (!team.length) return;
  const list = h('div.team');
  const hour = V.hour();
  for (const w of team.slice(0, 8)) {
    let act;
    if (w.detail) act = ACT_TEXT[w.act] || ACT_TEXT[w.state] || '';
    else act = hour >= w.start && hour < w.end ? 'travaille' : hour >= w.end || hour < 5 ? 'à la maison' : 'en route vers le travail';
    if (w.load) act += ` (${fmtDec(w.load.n, 0)} ${RESOURCES[w.load.res]?.icon || ''})`;
    list.appendChild(h('div.mate', h('span.mi', w.girl ? '👩' : '👨'), h('div.mt', h('b', `${w.name} · ${ROLE_NAMES[w.role] || 'Employé'}`), h('small', act))));
  }
  if (team.length > 8) list.appendChild(h('small.more', `et ${team.length - 8} autres`));
  body.appendChild(h('div.section-title', `L'équipe (${team.length})`));
  body.appendChild(list);
}

function siteRow(icon, label, value) {
  return h('div.info-row', h('span', `${icon} ${label}`), h('b', value));
}
