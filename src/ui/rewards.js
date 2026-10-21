// Fenêtres de récompenses : coffre qui s'ouvre, cartes qui apparaissent, cadeau de connexion.
import { h } from './dom.js';
import { LOGIN_REWARDS, CHESTS, BOOSTS } from '../data/shop.js';
import { RESOURCES } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { ROOF_THEMES } from '../data/cosmetics.js';
import { fmt } from '../core/util.js';
import { scaledResources } from '../data/pass.js';
import { chestArt } from './art.js';

/** Icône d'une récompense : illustration pour les coffres, emoji sinon. */
export function rewardIcon(p) {
  return p?.chest ? chestArt(p.chest) : p?.icon ?? '';
}

/** Aperçu court d'une récompense (sans la donner) : [{ icon, text }]. */
export function describeReward(r, level = 1, scaled = null) {
  const out = [];
  if (!r) return out;
  for (const [k, v] of Object.entries(r)) {
    if (RESOURCES[k]) out.push({ icon: RESOURCES[k].icon, text: fmt(v) });
    else if (k === 'res') {
      const res = scaled ? scaled(v, level) : {};
      for (const [rk, rv] of Object.entries(res)) out.push({ icon: RESOURCES[rk].icon, text: fmt(rv) });
    } else if (k === 'gems') out.push({ icon: '💎', text: fmt(v), gems: true });
    else if (k === 'pxp') out.push({ icon: '🎖️', text: fmt(v) });
    else if (k === 'chest') out.push({ icon: CHESTS[v].icon, text: CHESTS[v].name.replace('Coffre ', ''), chest: v });
    else if (k === 'boost') out.push({ icon: BOOSTS[v].icon, text: `${r.n > 1 ? r.n + '×' : ''}${BOOSTS[v].name}` });
    else if (k === 'decor') out.push({ icon: BUILDINGS[v]?.icon || '🎁', text: BUILDINGS[v]?.name || v, rare: true, decor: v });
    else if (k === 'theme') out.push({ icon: ROOF_THEMES[v]?.icon || '🎨', text: `Toits ${ROOF_THEMES[v]?.name || v}`, rare: true, theme: v });
    else if (k === 'avatar') out.push({ icon: v, text: 'Avatar', rare: true });
    else if (k === 'title') out.push({ icon: '🏷️', text: v, rare: true });
  }
  return out;
}

/**
 * Affiche des récompenses obtenues. items : [{ icon, text, header?, chest?, rare?, gems? }]
 */
export function showRewards(ui, items, { title = 'Récompenses !', subtitle = '' } = {}) {
  if (!items?.length) return;
  const game = ui.game;
  const chest = items.find((i) => i.header && i.chest);
  const list = h('div.reward-grid');
  const card = h('div.reward-reveal' + (chest ? '.with-chest' : ''));
  if (chest) {
    const c = CHESTS[chest.chest];
    const icon = h('div.chest-icon', chestArt(c.id));
    // le couvercle s'ouvre au sommet du rebond
    setTimeout(() => icon.replaceChildren(chestArt(c.id, { open: true })), 560);
    card.appendChild(h('div.chest-anim', { style: { '--chest': c.color } }, h('div.chest-glow'), icon, h('div.chest-name', c.name)));
  }
  if (subtitle) card.appendChild(h('p.reward-sub', subtitle));
  card.appendChild(list);
  let k = 0;
  for (const it of items) {
    if (it.header) {
      if (it !== chest && items.indexOf(it) > 0) list.appendChild(h('div.reward-header', rewardIcon(it), ' ', it.text));
      continue;
    }
    const el = h('div.reward-card' + (it.rare ? '.rare' : '') + (it.gems ? '.gems' : ''), { style: { animationDelay: `${(chest ? 0.75 : 0.1) + k * 0.12}s` } },
      h('span.ri', rewardIcon(it)), h('span.rt', it.text), it.bank ? h('small.rb', 'livré au prochain village') : null);
    list.appendChild(el);
    k++;
  }
  game.sound.play(chest ? 'chest' : items.some((i) => i.gems) ? 'gem' : 'quest');
  if (chest) setTimeout(() => game.sound.play('gem'), 900);
  ui.modal({ title, body: card, cls: 'rewards-modal', actions: [{ label: 'Super !', cls: 'primary' }] });
  ui.refreshMeta?.();
}

/** Cadeau de connexion : calendrier de 7 jours. */
export function showLogin(ui, { onDone } = {}) {
  const meta = ui.game.meta;
  if (!meta.loginPending()) return false;
  const idx = meta.loginIndex();
  const grid = h('div.login-grid');
  LOGIN_REWARDS.forEach((r, i) => {
    const parts = describeReward(r, meta.level(), scaledResources);
    const state = i < idx ? 'past' : i === idx ? 'today' : 'next';
    grid.appendChild(h('div.login-day.' + state + (i === 6 ? '.big' : ''),
      h('b', `Jour ${i + 1}`),
      h('div.ld-icons', parts.map((p) => h('span', rewardIcon(p)))),
      h('small', parts.map((p) => p.text).join(' + ')),
      state === 'past' ? h('i.ld-check', '✓') : null,
    ));
  });
  const body = h('div.login-body', h('p', 'Reviens chaque jour pour remplir le calendrier. Le jour 7 offre un coffre d\'or !'), grid);
  ui.modal({
    title: '🎁 Cadeau du jour', body, cls: 'login-modal', dismissable: false,
    actions: [{
      label: 'Récupérer', cls: 'primary',
      onclick: () => {
        const out = meta.claimLogin();
        if (out) showRewards(ui, out, { title: `Jour ${idx + 1} récupéré !` });
        onDone?.();
      },
    }],
  });
  return true;
}
