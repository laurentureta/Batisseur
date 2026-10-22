// Passe de combat : bannière de saison, piste de 40 paliers (gratuit + royal), défis de la semaine.
import { h } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { showRewards, describeReward, rewardIcon } from './rewards.js';
import { TIERS, TIER_XP, PREMIUM_COST, scaledResources, weekEnd } from '../data/pass.js';
import { fmt } from '../core/util.js';

export function openPass(ui, tab = 'track') {
  const meta = ui.game.meta;
  meta.refresh();
  const tabs = [
    { id: 'track', label: '🎖️ Récompenses', badge: () => meta.passClaimables() },
    { id: 'weekly', label: '📆 Défis de la semaine', badge: () => meta.weeklyClaimables() },
  ];
  return openScreen(ui, {
    id: 'pass', title: '🎖️ Passe de combat', cls: 'pass-screen', tabs, tab,
    render: (body, screen) => renderPass(ui, body, screen),
    after: (body, screen) => {
      if (screen.scrolledTo) return;
      screen.scrolledTo = true;
      const track = body.querySelector('.tier-track');
      const cur = body.querySelector('.tier-col.current');
      if (track && cur) track.scrollLeft = Math.max(0, cur.offsetLeft - track.clientWidth / 2 + cur.clientWidth / 2);
    },
  });
}

function rewardTile(ui, reward, state, onClaim, premium) {
  const meta = ui.game.meta;
  const parts = describeReward(reward, meta.level(), scaledResources);
  const main = parts[0] || { icon: '·', text: '' };
  const cls = ['reward-tile', state.claimed ? 'claimed' : '', state.ready ? 'ready' : '', state.locked ? 'locked' : '', !state.reached ? 'future' : '', premium ? 'prem' : 'free', parts.some((p) => p.rare) ? 'rare' : ''].filter(Boolean).join('.');
  const img = main.decor ? ui.game.renderer.thumbs.get(main.decor, 1) : null;
  return h('button.' + cls, { onclick: state.ready ? onClaim : () => ui.toast(parts.map((p) => `${p.icon} ${p.text}`).join(' + ') || 'Récompense', 'mini') },
    img ? h('img.rt-img', { src: img, alt: '' }) : h('span.rt-icon', rewardIcon(main)),
    h('span.rt-text', main.text),
    parts.length > 1 ? h('span.rt-more', `+${parts.length - 1}`) : null,
    state.claimed ? h('i.rt-check', '✓') : state.locked ? h('i.rt-lock', '🔒') : null,
  );
}

function renderPass(ui, body, screen) {
  const meta = ui.game.meta;
  const season = meta.season();
  const th = season.theme;
  const pr = meta.passProgress();
  const premium = meta.p.pass.premium;
  // bannière
  body.appendChild(h('div.season-banner', { style: { '--c1': th.colors[0], '--c2': th.colors[1] } },
    h('div.sb-icon', th.icon),
    h('div.sb-text', h('small', `Saison ${season.number}`), h('b', th.name), h('span', th.tagline)),
    h('div.sb-timer', '⏳ ', countdown(season.end - Date.now())),
  ));
  // progression
  const pct = pr.need ? pr.cur / pr.need : 1;
  body.appendChild(h('div.pass-progress',
    h('div.pp-tier', h('small', 'Palier'), h('b', String(pr.tier))),
    h('div.pp-bar', h('div.pp-fill', { style: { width: `${Math.round(pct * 100)}%` } }), h('span', pr.bonus ? `Bonus : ${fmt(pr.cur)} / ${fmt(pr.need)} XP` : `${fmt(pr.cur)} / ${fmt(pr.need)} XP`)),
    meta.passClaimables() ? h('button.btn.small.primary.pulse', {
      onclick: () => {
        const out = meta.claimAllTiers();
        const bonus = meta.claimBonus();
        if (bonus) out.push(...bonus);
        if (out.length) showRewards(ui, out, { title: 'Récompenses du passe !' });
        screen.keepTop = true;
        screen.refresh(true);
      },
    }, 'Tout récupérer') : null,
  ));
  if (screen.tab === 'weekly') return renderWeekly(ui, body, screen);
  // passe royal
  if (!premium) {
    const cost = meta.price(PREMIUM_COST);
    body.appendChild(h('div.premium-cta', { style: { '--c1': th.colors[0], '--c2': th.colors[1] } },
      h('div', h('b', '👑 Passe Royal'), h('small', `Débloque les 40 récompenses royales : ${fmt(830)} 💎, décorations et toits exclusifs, coffres d'or…`)),
      h('button.price-btn.go', {
        onclick: async () => {
          if (!meta.canPay(cost)) {
            ui.game.sound.play('error');
            return ui.toast(`Il te manque ${fmt(cost - meta.p.gems)} 💎 — continue de jouer, les gemmes arrivent vite !`, 'error');
          }
          const ok = await ui.confirm('Débloquer le Passe Royal ?', h('p.confirm-price', 'Prix : ', h('b', `💎 ${fmt(cost)}`), h('small', ' — les récompenses déjà atteintes sont à récupérer tout de suite.')), 'Débloquer', 'primary');
          if (!ok) return;
          if (meta.buyPremium()) {
            ui.game.sound.play('levelup');
            ui.toast('👑 Passe Royal débloqué !', 'good');
            screen.keepTop = true;
            screen.refresh(true);
          }
        },
      }, cost < PREMIUM_COST ? h('s', fmt(PREMIUM_COST)) : null, h('span.pg', '💎'), h('b', fmt(cost))),
    ));
  } else body.appendChild(h('div.premium-owned', '👑 Passe Royal actif'));
  // piste
  const track = h('div.tier-track', { dataset: { keepScroll: 'track' } });
  const labels = h('div.track-labels', h('span.free', 'Gratuit'), h('span.prem', '👑 Royal'));
  for (const t of meta.tiers()) {
    const col = h('div.tier-col' + (t.tier === Math.min(TIERS, pr.tier + 1) ? '.current' : '') + (t.tier <= pr.tier ? '.reached' : ''));
    col.appendChild(h('div.tc-num', String(t.tier)));
    const claim = (track2) => () => {
      const out = meta.claimTier(t.tier, track2);
      if (out) {
        ui.game.sound.play('tier');
        showRewards(ui, out, { title: `Palier ${t.tier} !` });
      }
      screen.keepTop = true;
      screen.refresh(true);
    };
    col.appendChild(t.free ? rewardTile(ui, t.free, meta.tierState(t.tier, 'free'), claim('free'), false) : h('div.reward-tile.empty'));
    col.appendChild(rewardTile(ui, t.prem, meta.tierState(t.tier, 'prem'), claim('prem'), true));
    track.appendChild(col);
  }
  body.appendChild(h('div.track-wrap', labels, track));
  // paliers bonus
  body.appendChild(h('div.bonus-row', h('span', '🎁'), h('div', h('b', 'Paliers bonus'), h('small', `Après le palier ${TIERS} : un coffre d'argent tous les ${fmt(1500)} XP.`)),
    pr.bonusReady > 0 ? h('button.btn.small.primary', {
      onclick: () => {
        const out = meta.claimBonus();
        if (out) showRewards(ui, out, { title: 'Palier bonus !' });
        screen.refresh(true);
      },
    }, `Ouvrir (${pr.bonusReady})`) : null,
  ));
  // gagner de l'XP
  body.appendChild(h('div.xp-help', h('b', 'Gagner de l\'XP de passe'), h('small', 'Construire +10 · Améliorer +25 · Mission du jour +250 · Quête +150 · Commande +100 · Niveau +200 · Nouvelle zone +300 · Rang de mairie +400 · Défis de la semaine +1 000 à 3 000 · Cadeau du jour +200 (mode carrière)')));
}

function renderWeekly(ui, body, screen) {
  const meta = ui.game.meta;
  body.appendChild(h('div.shop-sec', h('b', '📆 Défis de la semaine'), h('small', `Nouveaux défis dans ${countdown(weekEnd() - Date.now())}`)));
  for (const w of meta.weekly()) {
    const pct = w.n ? w.cur / w.n : 0;
    body.appendChild(h('div.weekly-row' + (w.claimed ? '.claimed' : w.done ? '.done' : ''),
      h('div.wr-main', h('b', w.label), h('div.wr-bar', h('div', { style: { width: `${Math.round(pct * 100)}%` } })), h('small', `${fmt(w.cur)} / ${fmt(w.n)}`)),
      h('div.wr-reward', h('span', `🎖️ ${fmt(w.pxp)}`), h('span', `💎 ${w.gems}`)),
      w.claimed ? h('span.owned-tag', '✓') : w.done ? h('button.btn.small.primary', {
        onclick: () => {
          const out = meta.claimWeekly(w.i);
          if (out) showRewards(ui, out, { title: 'Défi réussi !' });
          screen.keepTop = true;
          screen.refresh(true);
        },
      }, 'Récupérer') : null,
    ));
  }
  body.appendChild(h('p.shop-foot', 'Les défis avancent dans tous tes villages en mode carrière.'));
}
