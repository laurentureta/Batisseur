// Panneaux : quêtes, commandes, succès, stock, calques, menu, réglages, zones, marchand, niveaux.
import { h, costChips, rewardChips, progressBar, clear } from './dom.js';
import { BUILDINGS, COVER_NAMES } from '../data/buildings.js';
import { RESOURCES, GOODS } from '../data/resources.js';
import { MAIN_QUESTS } from '../data/quests.js';
import { mayorTitle, xpToNext, FEATURES } from '../data/progression.js';
import { fmt, fmtDec, calendar, SEASONS } from '../core/util.js';
import { TERRAIN_ICONS } from '../world/constants.js';
import { serialize, parseImport, saveSettings } from '../core/save.js';
import { VERSION } from '../version.js';
import { moodIcon, rewardText } from './UI.js';
import { TIER_NAMES } from '../sim/Simulation.js';

/* ───────── Quêtes ───────── */
export function renderQuests(ui, body) {
  const game = ui.game, st = game.state, prog = game.prog;
  const lp = prog.levelProgress();
  body.appendChild(h('div.level-card',
    h('div.level-big', `⭐ ${lp.level}`),
    h('div.level-info',
      h('b', mayorTitle(lp.level)),
      h('small', lp.level >= 50 ? 'Niveau maximum !' : `${fmt(lp.xp)} / ${fmt(lp.need)} XP vers le niveau ${lp.level + 1}`),
      progressBar(lp.pct, 'xp'),
    ),
  ));
  const q = prog.currentQuest();
  body.appendChild(h('div.section-title', `Quête principale · ${st.quests.main + (q ? 1 : 0)}/${MAIN_QUESTS.length}`));
  if (q) {
    const p = prog.questProgress(q);
    const unit = p.unit || '';
    body.appendChild(h('div.quest-card' + (st.quests.mainReady ? '.ready' : ''),
      h('div.qc-title', q.title),
      h('p.qc-desc', q.desc),
      progressBar(p.cur / p.target),
      h('div.qc-row', h('small', `${fmt(Math.min(p.cur, p.target))}${unit} / ${fmt(p.target)}${unit}`), rewardChips(q.reward)),
      st.quests.mainReady ? h('button.btn.primary.wide', { onclick: () => (prog.claimMain(), ui.sheet?.refresh(true)) }, '🎁 Récupérer la récompense') : null,
    ));
  } else body.appendChild(h('div.quest-card.ready', h('div.qc-title', '🏆 Toutes les quêtes sont terminées !'), h('p.qc-desc', 'Tu es un bâtisseur de légende. Continue d\'embellir ta ville !')));

  const missions = prog.dailyMissions();
  body.appendChild(h('div.section-title', '📅 Missions du jour'));
  if (!prog.featureUnlocked('missions')) body.appendChild(h('p.hint', `Débloquées au niveau ${FEATURES.missions.level}.`));
  else {
    for (const m of missions) {
      body.appendChild(h('div.mission' + (m.done ? '.done' : '') + (m.claimed ? '.claimed' : ''),
        h('span.mi', m.def.icon),
        h('div.mm', h('b', m.label), progressBar(m.cur / m.target), h('small', `${fmt(m.cur)} / ${fmt(m.target)}`)),
        m.claimed ? h('span.claimed-tag', '✓') : m.done ? h('button.btn.primary.small', { onclick: () => (prog.claimDaily(m.index), ui.sheet?.refresh(true)) }, 'Récupérer') : rewardChips(m.reward),
      ));
    }
    body.appendChild(h('p.hint', 'Nouvelles missions chaque jour à minuit.'));
  }
}

/* ───────── Commandes ───────── */
export function renderOrders(ui, body) {
  const game = ui.game, st = game.state, prog = game.prog;
  if (!prog.featureUnlocked('orders')) {
    body.appendChild(h('p.hint', `Le tableau des commandes se débloque au niveau ${FEATURES.orders.level}.`));
    return;
  }
  body.appendChild(h('p.hint', 'Des clients des villages voisins veulent tes marchandises. Livre-les pour gagner des pièces et de l\'XP.'));
  st.orders.slots.forEach((o, s) => {
    if (!o) {
      const wait = Math.max(0, (st.orders.cooldown[s] || 0) - st.time.day);
      const avail = prog.orderResources().length;
      body.appendChild(h('div.order.empty', avail ? `⏳ Nouvelle commande dans ${Math.ceil(wait * 24)} h (temps du jeu)` : '🏭 Construis des bâtiments de production pour recevoir des commandes.'));
      return;
    }
    const can = prog.canDeliver(o);
    const items = h('div.order-items');
    for (const it of o.items) {
      const have = Math.floor(st.res[it.res] || 0);
      items.appendChild(h('div.order-item' + (have >= it.qty ? '.ok' : ''), h('span.oi', RESOURCES[it.res].icon), h('b', fmt(it.qty)), h('small', `${RESOURCES[it.res].name} (${fmt(have)})`)));
    }
    body.appendChild(h('div.order',
      items,
      h('div.order-foot',
        rewardChips({ coins: o.coins, xp: o.xp }),
        h('div.order-btns',
          h('button.btn.small', { onclick: () => (prog.discardOrder(s), ui.sheet?.refresh(true)) }, 'Refuser'),
          h('button.btn.primary.small', {
            disabled: !can,
            onclick: () => {
              if (!prog.deliverOrder(s)) ui.toast('Il manque des marchandises', 'error');
              ui.sheet?.refresh(true);
            },
          }, 'Livrer'),
        ),
      ),
    ));
  });
}

/* ───────── Succès ───────── */
export function renderAchievements(ui, body) {
  const list = ui.game.prog.achievements();
  for (const a of list) {
    const stars = '★'.repeat(a.tier) + '☆'.repeat(Math.max(0, a.tiers.length - a.tier));
    const next = a.next;
    body.appendChild(h('div.ach' + (a.ready ? '.ready' : '') + (a.maxed ? '.maxed' : ''),
      h('span.ai', a.icon),
      h('div.am',
        h('b', a.name, h('span.stars', stars)),
        h('small', a.maxed ? `${a.desc} : tous les paliers atteints !` : `${a.desc} : ${fmt(a.value)}${a.unit || ''} / ${fmt(next)}${a.unit || ''}`),
        a.maxed ? null : progressBar(a.value / next),
      ),
      a.ready ? h('button.btn.primary.small', { onclick: () => (ui.game.prog.claimAchievement(a.id), ui.sheet?.refresh(true)) }, 'Récupérer') : a.reward && !a.maxed ? rewardChips(a.reward) : null,
    ));
  }
}

/* ───────── Stock et statistiques ───────── */
export function renderStock(ui, body) {
  const game = ui.game, st = game.state, d = game.sim.d;
  const libre = st.mode === 'libre';
  // économie
  const net = d.income.total - (d.broke ? 0 : d.upkeep);
  body.appendChild(h('div.section-title', '🪙 Finances (par jour)'));
  const fin = h('div.info-rows');
  const row = (box, l, v, cls = '') => box.appendChild(h('div.info-row' + (cls ? '.' + cls : ''), h('span', l), h('b', v)));
  row(fin, 'Pièces', libre ? '∞' : fmt(st.res.coins));
  row(fin, 'Impôts', `+${fmt(d.income.taxes)}`);
  row(fin, 'Commerces', `+${fmt(d.income.commerce)}`);
  if (d.income.tourism) row(fin, 'Tourisme', `+${fmt(d.income.tourism)}`);
  row(fin, 'Entretien des services', `−${fmt(d.upkeep)}`);
  row(fin, 'Solde', `${net >= 0 ? '+' : ''}${fmt(net)}`, net >= 0 ? 'pos' : 'neg');
  body.appendChild(fin);
  // population
  body.appendChild(h('div.section-title', '👥 Population'));
  const pop = h('div.info-rows');
  row(pop, 'Habitants', `${fmt(d.population)} / ${fmt(d.capacity)}`);
  row(pop, `${moodIcon(d.happiness)} Bonheur moyen`, `${Math.round(d.happiness * 100)} %`);
  row(pop, '👷 Travailleurs', `${fmt(d.workforce)}`);
  row(pop, '🏭 Emplois', `${fmt(d.jobs)}`);
  row(pop, 'Main-d\'œuvre disponible', `${Math.round(d.staffing * 100)} %`, d.staffing < 0.7 ? 'neg' : '');
  TIER_NAMES.forEach((name, t) => {
    if (d.jobsTier[t] > 0) row(pop, `   ↳ ${name}`, `${Math.round(d.staffTier[t] * 100)} % (${fmt(d.jobsTier[t])} postes)`, d.staffTier[t] < 0.5 ? 'neg' : '');
  });
  row(pop, 'Chômage', `${Math.round(d.unemployment * 100)} %`, d.unemployment > 0.3 ? 'neg' : '');
  body.appendChild(pop);
  if (d.unemployment > 0.3) body.appendChild(h('p.hint', 'Beaucoup de chômeurs : construis des bâtiments de production ou des commerces.'));
  if (d.jobs > 0 && d.staffing < 0.7) body.appendChild(h('p.hint', 'Pas assez de travailleurs : construis ou améliore des maisons. Les postes sont pourvus dans l\'ordre : nourriture, production, commerces, puis services.'));
  // marchandises
  body.appendChild(h('div.section-title', `📦 Marchandises (capacité ${libre ? '∞' : fmt(d.storage)})`));
  const grid = h('div.stock-grid');
  for (const r of GOODS) {
    const v = st.res[r] || 0;
    const rate = d.rates[r] || { prod: 0, cons: 0 };
    const netR = rate.prod - rate.cons;
    if (!v && !rate.prod && !rate.cons && !['wood', 'stone', 'food'].includes(r)) continue;
    grid.appendChild(h('div.stock-item' + (!libre && v >= d.storage - 0.5 ? '.full' : ''),
      h('span.si', RESOURCES[r].icon),
      h('div.sm',
        h('b', libre ? fmt(v) : `${fmt(v)}`),
        h('small', RESOURCES[r].name),
        libre ? null : progressBar(v / d.storage),
      ),
      h('span.sr' + (netR < -0.05 ? '.neg' : netR > 0.05 ? '.pos' : ''), `${netR >= 0 ? '+' : ''}${fmtDec(netR, 0)}/j`),
    ));
  }
  body.appendChild(grid);
  // négoce
  if (!libre) {
    body.appendChild(h('div.section-title', '⚖️ Comptoir de négoce'));
    if (!game.prog.featureUnlocked('trade')) body.appendChild(h('p.hint', `Débloqué au niveau ${FEATURES.trade.level} : achète ou vends des marchandises contre des pièces.`));
    else {
      const t = game.actions.tradeToday();
      const limit = game.actions.tradeLimit();
      body.appendChild(h('p.hint', `Achat limité à ${fmt(limit)} unités par marchandise et par jour. Les prix d'achat sont élevés : produire reste plus rentable !`));
      const list = h('div.trade-list');
      for (const r of GOODS) {
        const buyP = game.actions.tradePrice(r, true), sellP = game.actions.tradePrice(r, false);
        const left = limit - (t.bought[r] || 0);
        const act = (fn, label, qty, disabled) => h('button.btn.small', {
          disabled,
          onclick: () => {
            const res = fn(r, qty);
            if (res.ok) game.sound.play('coin');
            else ui.toast(res.reason, 'error');
            ui.sheet?.refresh(true);
          },
        }, label);
        list.appendChild(h('div.trade-row',
          h('span.ti', RESOURCES[r].icon),
          h('div.tm', h('b', RESOURCES[r].name), h('small', `achat ${buyP} 🪙 · vente ${sellP} 🪙`)),
          act((x, q) => game.actions.sell(x, q), 'Vendre 10', 10, (st.res[r] || 0) < 1),
          act((x, q) => game.actions.buy(x, q), 'Acheter 10', 10, left <= 0 || st.res.coins < buyP),
        ));
      }
      body.appendChild(list);
    }
  }
  const cal = calendar(st.time.day);
  body.appendChild(h('p.hint', `${SEASONS[cal.season].icon} ${SEASONS[cal.season].name} · jour ${cal.dayInSeason}/7 · année ${cal.year}. Une journée dure 1 min 30 en vitesse normale.`));
}

/* ───────── Calques ───────── */
export function renderLayers(ui, body) {
  const opts = [
    [null, '🚫', 'Aucun'],
    ['happiness', '😊', 'Bonheur'],
    ['water', '💧', 'Eau'],
    ['commerce', '🛒', 'Commerces'],
    ['leisure', '🎡', 'Loisirs'],
    ['education', '🎓', 'Éducation'],
    ['health', '⚕️', 'Santé'],
    ['security', '🛡️', 'Sécurité'],
    ['fire', '🚒', 'Pompiers'],
    ['beauty', '🌷', 'Beauté'],
    ['pollution', '🏭', 'Pollution'],
  ];
  body.appendChild(h('p.hint', 'Affiche sur la carte qui est couvert par chaque service. Les maisons en rouge n\'ont pas ce besoin couvert.'));
  const grid = h('div.layer-grid');
  for (const [k, icon, label] of opts) {
    grid.appendChild(h('button.layer-btn' + (ui.layer === k ? '.on' : ''), {
      onclick: () => {
        ui.setLayer(k);
        ui.closeSheet();
        if (k) ui.toast(`Calque : ${label}`, 'mini');
      },
    }, h('span', icon), h('small', label)));
  }
  body.appendChild(grid);
}

/* ───────── Menu ───────── */
export function renderMenu(ui, body) {
  const game = ui.game, st = game.state;
  body.appendChild(h('div.menu-head', h('b', st.name), h('small', `${st.mode === 'libre' ? 'Mode libre' : `Niveau ${st.level} · ${mayorTitle(st.level)}`} · emplacement ${st.slot + 1}`)));
  const item = (icon, label, fn, cls = '') => body.appendChild(h('button.menu-item' + (cls ? '.' + cls : ''), { onclick: fn }, h('span', icon), label));
  item('▶️', 'Reprendre', () => ui.closeSheet());
  item('💾', 'Sauvegarder', () => {
    game.save();
    ui.toast('💾 Partie sauvegardée', 'good');
  });
  item('🛒', 'Boutique', () => ui.openShop());
  item('🎖️', 'Passe de combat', () => ui.openPass());
  item('🎉', 'Événements de la semaine', () => ui.openEvent());
  item('👤', 'Mon profil', () => {
    ui.closeSheet(true);
    ui.openProfile();
  });
  item('📦', 'Stock et statistiques', () => ui.openStock());
  item('🗺️', 'Calques', () => ui.openLayers());
  item('❓', 'Aide et commandes', () => showHelp(ui));
  if (ui.desk) item('⌨️', 'Raccourcis clavier', () => ui.showShortcuts());
  item('⚙️', 'Réglages', () => ui.openSettings());
  item('🏠', 'Menu principal', () => {
    ui.closeSheet(true);
    game.save();
    game.toMainMenu();
  });
}

/* ───────── Réglages ───────── */
export function renderSettings(ui, body) {
  const game = ui.game;
  const s = game.settings;
  const save = () => saveSettings(s);
  const toggle = (label, key, after) => {
    const b = h('button.toggle' + (s[key] ? '.on' : ''), {
      onclick: () => {
        s[key] = !s[key];
        save();
        b.classList.toggle('on', s[key]);
        after?.();
      },
    }, h('span.knob'));
    body.appendChild(h('div.setting', h('span', label), b));
  };
  body.appendChild(h('div.section-title', 'Graphismes'));
  const qual = h('div.segs');
  for (const [k, l] of [['auto', 'Auto'], ['high', 'Haute'], ['medium', 'Moyenne'], ['low', 'Économie']]) {
    qual.appendChild(h('button.seg' + (s.quality === k ? '.on' : ''), {
      onclick: () => {
        s.quality = k;
        save();
        game.renderer.setQuality(k);
        ui.closeSheet(true);
        ui.openSettings();
      },
    }, l));
  }
  body.appendChild(h('div.setting.col', h('span', 'Qualité (ombres, finesse)'), qual));
  toggle('Indicateurs ⬆️ d\'amélioration', 'upgradeHints', () => game.renderer.refreshStatusLabels());
  body.appendChild(h('div.section-title', 'Son'));
  toggle('Effets sonores', 'sound');
  toggle('Ambiance (oiseaux, grillons)', 'ambience');
  body.appendChild(h('div.section-title', 'Jeu'));
  toggle('Incendies', 'fires');
  if (!game.isDemo) {
    body.appendChild(h('div.section-title', 'Sauvegarde'));
    body.appendChild(h('p.hint', 'Ta partie est enregistrée automatiquement sur ce téléphone. Exporte-la de temps en temps pour la garder en lieu sûr.'));
    const row = h('div.info-actions');
    row.appendChild(h('button.btn', { onclick: () => exportSave(ui) }, '📤 Exporter'));
    row.appendChild(h('button.btn', { onclick: () => importSave(ui) }, '📥 Importer'));
    body.appendChild(row);
  }
  body.appendChild(h('p.version', `Bâtisseur v${VERSION} · fait avec ❤️ et Three.js`));
}

function exportSave(ui) {
  const game = ui.game;
  const json = serialize(game);
  const name = `batisseur-${game.state.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Sauvegarde Bâtisseur' }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  ui.toast('📤 Sauvegarde exportée', 'good');
}

function importSave(ui) {
  const input = h('input', { type: 'file', accept: 'application/json,.json,text/plain' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const st = parseImport(await f.text());
      const ok = await ui.confirm('Importer cette sauvegarde ?', h('p', `« ${st.name} » (niveau ${st.level}) remplacera la partie de l'emplacement ${ui.game.state.slot + 1}.`), 'Importer');
      if (!ok) return;
      st.slot = ui.game.state.slot;
      ui.closeSheet(true);
      ui.game.startState(st);
      ui.toast('📥 Sauvegarde importée', 'good');
    } catch (err) {
      ui.toast('Fichier invalide : ' + err.message, 'error');
    }
  });
  input.click();
}

/* ───────── Zones ───────── */
export function openZoneDialog(ui, zi) {
  const game = ui.game;
  const info = game.prog.zoneInfo(zi);
  const comp = h('div.zone-comp');
  for (const c of info.comp.slice(0, 5)) comp.appendChild(h('div.zc', h('span', TERRAIN_ICONS[c.t]), h('small', c.name), h('b', `${c.pct} %`)));
  const body = h('div',
    h('p', 'Agrandis ton territoire pour construire plus loin et profiter de nouvelles ressources.'),
    comp,
    h('div.zone-cost', costChips(info.cost, game.state.res), h('span.req' + (game.state.level >= info.levelReq ? '.ok' : ''), `Niveau ${info.levelReq} requis`)),
    info.ok || info.reason.startsWith('Niveau') ? null : h('p.hint.err', info.reason),
  );
  game.renderer.cam.flyToTile(game.world.zoneRect(zi).x + 5, game.world.zoneRect(zi).z + 5, Math.max(game.renderer.cam.distance, 24));
  ui.modal({
    title: `🔒 ${info.name}`,
    body,
    actions: [
      { label: 'Plus tard' },
      {
        label: 'Débloquer',
        cls: 'primary',
        disabled: !info.ok,
        onclick: () => {
          const res = game.actions.unlockZone(zi);
          if (!res.ok) ui.toast(res.reason, 'error');
        },
      },
    ],
  });
}

/* ───────── Marchand ───────── */
export function openMerchant(ui) {
  const game = ui.game;
  const m = game.state.events.merchant;
  if (!m) return ui.toast('Le marchand est reparti', 'mini');
  const have = game.state.res[m.give] || 0;
  ui.modal({
    title: '🛒 Marchand ambulant',
    body: h('div',
      h('p', 'Un marchand propose un échange, valable jusqu\'à demain :'),
      h('div.trade', h('div.tr', h('small', 'Tu donnes'), h('b', `${RESOURCES[m.give].icon} ${fmt(m.giveQty)}`)), h('span.arrow', '➜'), h('div.tr', h('small', 'Tu reçois'), h('b', `${RESOURCES[m.get].icon} ${fmt(m.getQty)}`))),
      have < m.giveQty ? h('p.hint.err', `Tu n'as que ${fmt(have)} ${RESOURCES[m.give].name.toLowerCase()}.`) : null,
    ),
    actions: [
      { label: 'Non merci' },
      {
        label: 'Échanger',
        cls: 'primary',
        disabled: have < m.giveQty,
        onclick: () => {
          if (game.events.acceptMerchant()) {
            game.sound.play('coin');
            ui.toast('🤝 Marché conclu !', 'good');
          }
        },
      },
    ],
  });
}

/* ───────── Passage de niveau ───────── */
export function showLevelUp(ui, data) {
  const game = ui.game;
  // plusieurs niveaux d'un coup : on regroupe dans une seule fenêtre
  let acc = ui._levelUp;
  if (acc && acc.modal && document.body.contains(acc.modal.card)) {
    acc.merging = true;
    acc.modal.close();
    acc.merging = false;
    acc.level = data.level;
    acc.unlocks.push(...data.unlocks);
    for (const k in data.reward) acc.reward[k] = (acc.reward[k] || 0) + data.reward[k];
    acc.features.push(...data.features);
  } else {
    acc = ui._levelUp = { from: data.level, level: data.level, unlocks: [...data.unlocks], reward: { ...data.reward }, features: [...data.features] };
  }
  const { level, unlocks, reward, features } = acc;
  const list = h('div.unlocks');
  for (const id of unlocks) {
    const def = BUILDINGS[id];
    list.appendChild(h('div.unlock', h('img', { src: game.renderer.thumbs.get(id, 1), alt: '' }), h('small', def.name)));
  }
  const body = h('div.levelup',
    h('div.lu-num', String(level)),
    h('div.lu-title', mayorTitle(level)),
    acc.from < level ? h('small.lu-multi', `+${level - acc.from + 1} niveaux d'un coup !`) : null,
    h('div.lu-reward', rewardChips(reward)),
    unlocks.length ? h('div.section-title', 'Nouveaux bâtiments') : null,
    unlocks.length ? list : null,
    features.length ? h('div.lu-features', features.map((f) => h('div', `🔓 ${f}`))) : null,
  );
  const confetti = h('div.confetti');
  for (let k = 0; k < 40; k++) {
    confetti.appendChild(h('i', { style: { left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 0.6}s`, background: ['#f2c94c', '#e94b5a', '#4caf50', '#3f7fd1', '#9b6bd1'][k % 5] } }));
  }
  acc.modal = ui.modal({ title: 'Niveau supérieur !', body, cls: 'levelup-card', actions: [{ label: 'Super !', cls: 'primary' }], onClose: () => {
    if (!acc.merging && ui._levelUp === acc) ui._levelUp = null;
  } });
  acc.modal.card.appendChild(confetti);
}

/* ───────── Aide ───────── */
export function showHelp(ui) {
  const item = (icon, title, text) => h('div.help-item', h('span.hi', icon), h('div', h('b', title), h('small', text)));
  ui.modal({
    title: '❓ Comment jouer',
    cls: 'help-card',
    body: h('div',
      ...(ui.desk
        ? [
          item('🖱️', 'Clic gauche et glisser', 'Déplace la carte (ou Z Q S D, les flèches).'),
          item('🔍', 'Molette', 'Zoome et dézoome (ou + et −).'),
          item('🔄', 'Clic droit et glisser', 'Fait pivoter la vue (ou A et E).'),
          item('👆', 'Cliquer sur un bâtiment', 'Ouvre sa fiche : améliorer, déplacer, détruire.'),
          item('🛣️', 'Route (C)', 'Clique et glisse pour tracer. Tout doit être relié à la mairie.'),
          item('🔨', 'Construire (B)', 'Choisis un bâtiment puis clique sur la carte. R pour le tourner.'),
          item('⌨️', 'Raccourcis clavier', 'Espace pour la pause, 1 2 3 pour la vitesse, ? pour la liste complète.'),
        ]
        : [
          item('☝️', 'Glisser un doigt', 'Déplace la carte.'),
          item('🤏', 'Pincer à deux doigts', 'Zoome et dézoome.'),
          item('🔄', 'Tourner à deux doigts', 'Fait pivoter la vue.'),
          item('👆', 'Toucher un bâtiment', 'Ouvre sa fiche : améliorer, déplacer, détruire.'),
          item('🛣️', 'Route', 'Glisse le doigt pour tracer. Tout doit être relié à la mairie.'),
          item('🔨', 'Construire', 'Choisis un bâtiment puis touche la carte. ↻ pour le tourner.'),
        ]),
      item('🏛️', 'La mairie', 'Améliore-la pour monter de rang et débloquer les niveaux des autres bâtiments.'),
      item('😊', 'Le bonheur', 'Eau, commerces, loisirs, école, santé, sécurité et décorations rendent les habitants heureux.'),
      item('🔒', 'Les zones', 'Touche un cadenas au bord de la carte pour agrandir ton territoire.'),
      item('🎉', 'Les fêtes de la semaine', 'Chaque semaine, une journée de fête : bonus, objets à ramasser dans le village, pièces, gemmes et décorations exclusives.'),
      item('↩️', 'Annuler', 'Annule ta dernière action (remboursée).'),
    ),
    actions: [{ label: 'Compris !', cls: 'primary' }],
  });
}

export function showWelcome(ui) {
  const st = ui.game.state;
  ui.modal({
    title: `Bienvenue, Maire de ${st.name} !`,
    cls: 'welcome-card',
    body: h('div',
      h('p', 'Ton village n\'est qu\'une mairie au milieu des prés. À toi de le faire grandir jusqu\'à devenir une métropole !'),
      h('div.help-item', h('span.hi', '🎯'), h('div', h('b', 'Suis les quêtes'), h('small', 'En haut à gauche : elles te guident pas à pas.'))),
      ui.desk
        ? h('div.help-item', h('span.hi', '🖱️'), h('div', h('b', 'Clic gauche pour bouger'), h('small', 'Molette pour zoomer, clic droit pour tourner. Appuie sur ? pour les raccourcis.')))
        : h('div.help-item', h('span.hi', '☝️'), h('div', h('b', 'Un doigt pour bouger'), h('small', 'Deux doigts pour zoomer et tourner.'))),
      h('div.help-item', h('span.hi', '🛣️'), h('div', h('b', 'Commence par une route'), h('small', ui.desk ? 'Clique sur « Route » (ou C) puis glisse depuis la mairie.' : 'Touche « Route » puis glisse depuis la mairie.'))),
    ),
    actions: [{ label: 'C\'est parti !', cls: 'primary' }],
    dismissable: false,
  });
}

void clear;
void COVER_NAMES;
void xpToNext;
void rewardText;
