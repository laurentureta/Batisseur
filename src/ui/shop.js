// Boutique : coffres, boosts, ressources, décorations exclusives, toits — tout se paie en gemmes 💎 gagnées en jeu.
import { h } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { showRewards } from './rewards.js';
import { CHESTS, BOOSTS, PACKS, SHOP_DECOR, SHOP_THEMES } from '../data/shop.js';
import { PREMIUM_COST } from '../data/pass.js';
import { BUILDINGS } from '../data/buildings.js';
import { ROOF_THEMES } from '../data/cosmetics.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from '../core/util.js';
import { ALL_EXCLUSIVES } from '../core/meta.js';
import { chestArt } from './art.js';
import { nextEventWith, openEvent, previewEvent } from './event.js';
import { eventDateLabel } from '../data/events.js';

const TABS = [
  { id: 'featured', label: '⭐ À la une' },
  { id: 'chests', label: '🎁 Coffres' },
  { id: 'boosts', label: '⚡ Boosts' },
  { id: 'packs', label: '📦 Ressources' },
  { id: 'decor', label: '🎨 Décos' },
  { id: 'themes', label: '🏠 Toits' },
  { id: 'gems', label: '💎 Gemmes' },
];

export function openShop(ui, tab = 'featured') {
  const meta = ui.game.meta;
  const tabs = TABS.map((t) => (t.id === 'featured' ? { ...t, badge: () => (meta.freeChestIn() <= 0 ? 1 : 0) } : t));
  const s = openScreen(ui, { id: 'shop', title: '🛒 Boutique', cls: 'shop-screen', tabs, tab, render: (body, screen) => renderShop(ui, body, screen) });
  return s;
}

function basePriceBtn(price, onclick, { disabled = false, label = null, was = null } = {}) {
  return h('button.price-btn' + (disabled ? '.disabled' : ''), { onclick, disabled },
    was ? h('s', `${fmt(was)}`) : null,
    label ? h('span', label) : [h('span.pg', '💎'), h('b', fmt(price))],
  );
}

/** Achat avec confirmation ; fn() renvoie la liste des récompenses (ou null). */
async function purchase(ui, what, base, fn, { reveal = true, title } = {}) {
  const meta = ui.game.meta;
  const price = meta.price(base);
  if (!meta.canPay(price)) {
    ui.game.sound.play('error');
    ui.toast(`Il te manque ${fmt(price - meta.p.gems)} 💎 — gagne-les en jouant !`, 'error', { label: 'Comment ?', onclick: () => ui.screen?.setTab('gems') });
    return;
  }
  const ok = await ui.confirm(`Acheter ${what} ?`, h('p.confirm-price', 'Prix : ', h('b', `💎 ${fmt(price)}`), h('small', ` (il te restera ${fmt(meta.p.gems - price)} 💎)`)), 'Acheter', 'primary');
  if (!ok) return;
  const out = fn();
  if (!out) {
    ui.toast('Achat impossible', 'error');
    return;
  }
  ui.game.sound.play('buy');
  if (reveal) showRewards(ui, out, { title: title || 'Merci pour ton achat !' });
  ui.screen?.refresh(true);
}

function useBoostBtn(ui, id) {
  const meta = ui.game.meta;
  const n = meta.boostCount(id);
  if (!n) return null;
  return h('button.btn.small.primary', {
    onclick: () => {
      const res = meta.useBoost(id);
      if (!res.ok) return ui.toast(res.reason, 'error');
      ui.game.sound.play('upgrade');
      ui.toast(`${BOOSTS[id].icon} ${BOOSTS[id].name} activé !`, 'good');
      ui.screen?.refresh(true);
      ui.refreshHud?.();
    },
  }, `Utiliser (${n})`);
}

function renderShop(ui, body, screen) {
  const game = ui.game, meta = game.meta;
  const inVillage = !!meta.village;
  const L = meta.level();
  const tab = screen.tab;
  // braderie : les prix sont remisés toute la journée
  const priceBtn = (price, onclick, o = {}) => basePriceBtn(meta.price(price), onclick, { ...o, was: o.was ?? (meta.price(price) < price ? price : null) });
  const sale = meta.eventMods('any')?.shop;
  if (sale && tab !== 'gems') {
    const ev = meta.event();
    body.appendChild(h('button.sale-banner', { style: { '--c1': ev.theme.colors[0], '--c2': ev.theme.colors[1] }, onclick: () => openEvent(ui) },
      h('span', '🏷️'), h('div', h('b', `${ev.theme.name} : −${Math.round((1 - sale) * 100)} % sur tout !`), h('small', 'Coffres, boosts, ressources, décorations, toits et Passe Royal — aujourd\'hui seulement.'))));
  }

  if (tab === 'featured') {
    // coffre gratuit
    const wait = meta.freeChestIn();
    body.appendChild(h('div.offer-hero.free-chest',
      h('div.oh-icon', chestArt('bois')),
      h('div.oh-text', h('b', 'Coffre gratuit'), h('small', wait > 0 ? `Prochain coffre dans ${countdown(wait)}` : 'Un coffre en bois t\'attend, toutes les 4 heures !')),
      wait > 0 ? h('button.price-btn.disabled', { disabled: true }, h('span', '⏳')) : h('button.price-btn.go', {
        onclick: () => {
          const out = meta.claimFreeChest();
          if (out) showRewards(ui, out, { title: 'Coffre gratuit !' });
          screen.refresh(true);
        },
      }, h('span', 'Ouvrir')),
    ));
    // passe royal
    const season = meta.season();
    if (!meta.p.pass.premium) {
      body.appendChild(h('button.offer-hero.pass-promo', { style: { '--c1': season.theme.colors[0], '--c2': season.theme.colors[1] }, onclick: () => ui.openPass() },
        h('div.oh-icon', '👑'),
        h('div.oh-text', h('b', 'Passe Royal'), h('small', `${season.theme.icon} ${season.theme.name} : 40 récompenses royales, décorations et toits exclusifs`)),
        h('span.price-btn', meta.price(PREMIUM_COST) < PREMIUM_COST ? h('s', fmt(PREMIUM_COST)) : null, h('span.pg', '💎'), h('b', fmt(meta.price(PREMIUM_COST)))),
      ));
    }
    // offres du jour
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    body.appendChild(h('div.shop-sec', h('b', '🔥 Offres du jour'), h('small', `Nouvelles offres dans ${countdown(tomorrow - Date.now())}`)));
    const row = h('div.offer-grid');
    for (const d of meta.deals()) row.appendChild(dealCard(ui, d, priceBtn));
    body.appendChild(row);
    // boosts possédés
    const owned = Object.keys(BOOSTS).filter((id) => meta.boostCount(id) > 0);
    if (owned.length) {
      body.appendChild(h('div.shop-sec', h('b', '⚡ Mes boosts'), h('small', inVillage ? 'Active-les dans ce village' : 'Ouvre un village en carrière pour les utiliser')));
      const g = h('div.boost-list');
      for (const id of owned) g.appendChild(h('div.boost-row', h('span.bi', BOOSTS[id].icon), h('div', h('b', BOOSTS[id].name), h('small', BOOSTS[id].desc)), inVillage ? useBoostBtn(ui, id) : h('span.count', `× ${meta.boostCount(id)}`)));
      body.appendChild(g);
    }
    return;
  }

  if (tab === 'chests') {
    body.appendChild(h('p.shop-intro', 'Chaque coffre contient des pièces, des ressources et souvent des gemmes, des boosts ou une décoration exclusive.'));
    const g = h('div.chest-grid');
    for (const c of Object.values(CHESTS)) {
      const free = c.id === 'bois';
      const wait = meta.freeChestIn();
      g.appendChild(h('div.chest-card', { style: { '--chest': c.color } },
        h('div.cc-icon', chestArt(c.id)), h('b', c.name), h('small', c.desc),
        free
          ? (wait > 0 ? h('button.price-btn.disabled', { disabled: true }, h('span', `⏳ ${countdown(wait)}`)) : h('button.price-btn.go', {
            onclick: () => {
              const out = meta.claimFreeChest();
              if (out) showRewards(ui, out, { title: 'Coffre gratuit !' });
              screen.refresh(true);
            },
          }, h('span', 'Gratuit')))
          : priceBtn(c.price, () => purchase(ui, `un ${c.name.toLowerCase()}`, c.price, () => meta.buyChest(c.id), { title: `${c.icon} ${c.name}` })),
      ));
    }
    body.appendChild(g);
    return;
  }

  if (tab === 'boosts') {
    const active = meta.activeBoosts();
    if (active.length && game.state) {
      body.appendChild(h('div.shop-sec', h('b', '✅ Actifs dans ce village')));
      for (const b of active) body.appendChild(h('div.boost-row.active', h('span.bi', BOOSTS[b.id].icon), h('div', h('b', BOOSTS[b.id].name), h('small', `encore ${Math.max(0, b.until - game.state.time.day).toFixed(1)} jour(s)`))));
    }
    body.appendChild(h('div.shop-sec', h('b', '⚡ Boosts'), h('small', '1 jour de jeu = 90 secondes à vitesse normale')));
    for (const b of Object.values(BOOSTS)) {
      const n = meta.boostCount(b.id);
      body.appendChild(h('div.boost-row',
        h('span.bi', b.icon), h('div', h('b', b.name, n ? h('em', ` × ${n}`) : null), h('small', b.desc)),
        h('div.br-btns', inVillage ? useBoostBtn(ui, b.id) : null, priceBtn(b.price, () => purchase(ui, `le boost « ${b.name} »`, b.price, () => meta.buyBoost(b.id)))),
      ));
    }
    return;
  }

  if (tab === 'packs') {
    body.appendChild(h('p.shop-intro', inVillage ? `Livré tout de suite dans « ${game.state.name} ». Les quantités grandissent avec ton niveau.` : 'Pas de village ouvert : la livraison attendra ton prochain village en mode carrière.'));
    for (const p of PACKS) {
      const locked = L < p.minLevel;
      const give = p.give(L);
      body.appendChild(h('div.pack-row' + (locked ? '.locked' : ''),
        h('span.bi', p.icon),
        h('div', h('b', p.name), h('div.pack-items', Object.entries(give).map(([k, v]) => h('span.chip', `${RESOURCES[k].icon} ${fmt(v)}`)))),
        locked ? h('span.lock-note', `🔒 Niv. ${p.minLevel}`) : priceBtn(p.price, () => purchase(ui, `« ${p.name} »`, p.price, () => meta.buyPack(p.id))),
      ));
    }
    return;
  }

  if (tab === 'decor') {
    body.appendChild(h('p.shop-intro', 'Les décorations exclusives embellissent tous tes villages. Une fois à toi, tu les trouves dans Construire → ⭐ Exclusifs.'));
    const g = h('div.decor-grid');
    const season = meta.season();
    const sale = new Map(SHOP_DECOR.map((d) => [d.id, d.price]));
    for (const id of ALL_EXCLUSIVES.filter((x) => !BUILDINGS[x].event)) {
      const def = BUILDINGS[id];
      const owned = meta.ownsDecor(id);
      const inSeason = season.theme.decor.includes(id);
      const price = sale.get(id);
      const img = game.renderer.thumbs.get(id, 1);
      let action;
      if (owned) action = h('span.owned-tag', '✓ À toi');
      else if (price) action = priceBtn(price, () => purchase(ui, `« ${def.name} »`, price, () => meta.buyDecor(id)));
      else if (inSeason) action = h('button.src-tag.pass', { onclick: () => ui.openPass() }, '🎖️ Passe');
      else action = h('span.src-tag', '🎁 Coffres');
      g.appendChild(h('div.decor-card' + (owned ? '.owned' : ''),
        h('div.dc-pic', img ? h('img', { src: img, alt: '' }) : h('span', def.icon), def.size[0] * def.size[1] > 1 ? h('span.size-badge', `${def.size[0]}×${def.size[1]}`) : null),
        h('b', def.name), h('small', `✨ Beauté +${Math.round(def.beauty.v * 100)}`), action,
      ));
    }
    body.appendChild(g);
    // décorations des fêtes de la semaine : elles ne s'achètent pas, elles se gagnent
    const now = meta.now();
    const evDecor = ALL_EXCLUSIVES.filter((x) => BUILDINGS[x].event)
      .map((id) => ({ id, ev: nextEventWith(id, now) }))
      .sort((a, b) => (meta.ownsDecor(a.id) ? 1 : 0) - (meta.ownsDecor(b.id) ? 1 : 0) || (a.ev?.start ?? Infinity) - (b.ev?.start ?? Infinity));
    const mine = evDecor.filter((x) => meta.ownsDecor(x.id)).length;
    body.appendChild(h('div.shop-sec', h('b', '🎉 Décorations des fêtes'), h('small', `${mine}/${evDecor.length} · à gagner pendant les événements`)));
    const g2 = h('div.decor-grid');
    for (const { id, ev } of evDecor) {
      const def = BUILDINGS[id];
      const owned = meta.ownsDecor(id);
      const img = game.renderer.thumbs.get(id, 1);
      const cur = ev && ev.key === meta.event().key;
      const action = owned ? h('span.owned-tag', '✓ À toi')
        : ev ? h('button.src-tag.fete', { style: { '--c1': ev.theme.colors[0], '--c2': ev.theme.colors[1] }, onclick: () => (cur ? openEvent(ui) : previewEvent(ui, ev)) }, cur ? '🎉 Cette semaine !' : `🎉 ${eventDateLabel(ev, { short: true })}`)
          : h('span.src-tag', '🎉 Fêtes');
      g2.appendChild(h('div.decor-card.fete' + (owned ? '.owned' : ''),
        h('div.dc-pic', img ? h('img', { src: img, alt: '' }) : h('span', def.icon), def.size[0] * def.size[1] > 1 ? h('span.size-badge', `${def.size[0]}×${def.size[1]}`) : null),
        h('b', def.name), h('small', ev ? ev.theme.name : `✨ Beauté +${Math.round(def.beauty.v * 100)}`), action,
      ));
    }
    body.appendChild(g2);
    return;
  }

  if (tab === 'themes') {
    const cur = game.state && !game.isDemo ? game.state.cosmetics?.roof || 'mix' : null;
    body.appendChild(h('p.shop-intro', cur ? 'Choisis la couleur des toits de ce village (les maisons de ville ne changent pas).' : 'Ouvre un village pour y appliquer un thème de toits.'));
    const sale = new Map(SHOP_THEMES.map((t) => [t.id, t.price]));
    const season = meta.season();
    const g = h('div.theme-grid');
    for (const [id, th] of Object.entries(ROOF_THEMES)) {
      const owned = meta.ownsTheme(id);
      const price = sale.get(id);
      let action;
      if (owned) {
        action = cur === id ? h('span.owned-tag', '✓ Appliqué') : cur ? h('button.btn.small.primary', {
          onclick: () => {
            meta.applyTheme(id);
            game.sound.play('upgrade');
            ui.toast(`🏠 Toits « ${th.name} » appliqués`, 'good');
            screen.refresh(true);
          },
        }, 'Appliquer') : h('span.owned-tag', '✓ À toi');
      } else if (price) action = priceBtn(price, () => purchase(ui, `les toits « ${th.name} »`, price, () => meta.buyTheme(id)));
      else if (season.theme.themes.includes(id)) action = h('button.src-tag.pass', { onclick: () => ui.openPass() }, '🎖️ Passe');
      else action = h('span.src-tag', '🎁 Coffres');
      g.appendChild(h('div.theme-card' + (cur === id ? '.on' : ''),
        h('div.swatches', th.swatch.map((c) => h('i', { style: { background: c } }))),
        h('b', `${th.icon} ${th.name}`), action,
      ));
    }
    body.appendChild(g);
    return;
  }

  // gemmes : comment en gagner (aucun achat réel)
  body.appendChild(h('div.gems-hero', h('div.gh-big', '💎'), h('b', `${fmt(meta.p.gems)} gemmes`), h('small', 'Les gemmes se gagnent uniquement en jouant.')));
  const ways = [
    ['📅', 'Missions du jour', '3 💎 par mission, +5 💎 si tu fais les 3'],
    ['🎖️', 'Passe de combat', 'Jusqu\'à 145 💎 gratuits par saison, 830 💎 avec le Passe Royal'],
    ['⭐', 'Niveaux', '5 💎 par niveau, 20 💎 tous les 5 niveaux'],
    ['🏛️', 'Rang de la mairie', '25 💎 à chaque nouveau rang'],
    ['🎯', 'Quêtes et succès', '3 💎 par quête, 10 💎 par palier de succès'],
    ['📆', 'Défis de la semaine', '5 à 15 💎 par défi'],
    ['🎁', 'Cadeau du jour', 'Jusqu\'à 25 💎 et un coffre d\'or le 7e jour'],
    [chestArt('argent'), 'Coffres', 'Les coffres contiennent souvent des gemmes'],
  ];
  for (const [i, t, d] of ways) body.appendChild(h('div.way-row', h('span.bi', i), h('div', h('b', t), h('small', d))));
  body.appendChild(h('p.shop-foot', `Gemmes gagnées depuis le début : ${fmt(meta.p.stats.gemsEarned)} · dépensées : ${fmt(meta.p.stats.gemsSpent)}`));
}

function dealCard(ui, d, priceBtn) {
  const meta = ui.game.meta;
  let icon = '🎁', name = '', sub = '';
  if (d.kind === 'boost') ({ icon, name } = BOOSTS[d.id]), (sub = 'Boost');
  else if (d.kind === 'pack') {
    const p = PACKS.find((x) => x.id === d.id);
    icon = p.icon;
    name = p.name;
    sub = Object.entries(p.give(meta.level())).map(([k, v]) => `${RESOURCES[k].icon}${fmt(v)}`).join(' ');
  } else if (d.kind === 'decor') {
    const def = BUILDINGS[d.id];
    const src = ui.game.renderer.thumbs.get(d.id, 1);
    icon = src ? h('img.rw-thumb', { src, alt: '' }) : def.icon;
    name = def.name;
    sub = meta.ownsDecor(d.id) ? 'Déjà à toi' : 'Décoration exclusive';
  } else if (d.kind === 'chest') (icon = chestArt(d.id)), (name = CHESTS[d.id].name), (sub = 'Coffre');
  const pct = Math.round((1 - d.price / d.was) * 100);
  const owned = d.kind === 'decor' && meta.ownsDecor(d.id);
  return h('div.deal-card' + (d.sold ? '.sold' : ''),
    h('span.deal-badge', `-${pct}%`),
    h('div.dl-icon', icon), h('b', name), h('small', sub),
    d.sold || owned ? h('span.owned-tag', d.sold ? 'Acheté ✓' : '✓') : priceBtn(d.price, () => purchase(ui, `« ${name} »`, d.price, () => meta.buyDeal(d)), { was: d.was }),
  );
}
