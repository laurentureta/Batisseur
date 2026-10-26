// Écran « Amis » : ton code ami, ta liste d'amis (visiter, offrir un cadeau), les cadeaux reçus.
import { h } from './dom.js';
import { fmt } from '../core/util.js';
import { openScreen } from './screens.js';
import { GIFTS } from '../net/online.js';

const SITE = 'https://laurentureta.github.io/Batisseur/';

function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 600) return 'en ligne récemment';
  if (s < 3600) return `vu il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `vu il y a ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return `vu il y a ${d} jour${d > 1 ? 's' : ''}`;
}

export function openFriends(ui, tab = 'friends') {
  const game = ui.game, on = game.online;
  const state = { loading: !on.loaded, error: '' };
  const load = () => {
    state.loading = true;
    state.error = '';
    screen?.refresh(true);
    on.ensure()
      .then(() => on.publish(true))
      .then(() => on.refresh())
      .catch((err) => (state.error = err.message))
      .finally(() => {
        state.loading = false;
        screen?.refresh(true);
        ui.refreshMeta?.();
      });
  };
  const screen = openScreen(ui, {
    id: 'friends',
    title: '👥 Amis',
    cls: 'friends-screen',
    tab,
    tabs: [
      { id: 'friends', label: '👥 Mes amis' },
      { id: 'gifts', label: '🎁 Cadeaux reçus', badge: () => on.allInbox().length },
    ],
    render: (body, sc) => renderFriends(ui, body, sc, state, load),
  });
  load();
  return screen;
}

function renderFriends(ui, body, screen, state, load) {
  const game = ui.game, on = game.online;
  body.appendChild(h('button.btn.wide',{onclick:()=>ui.openCooperative()},'🤝 Rejoindre une coopérative'));
  // ton code
  const code = on.me?.code;
  body.appendChild(h('div.fr-code',
    h('div.frc-text', h('small', 'Ton code ami'), h('b.frc-value', code ? `${code.slice(0, 3)} ${code.slice(3)}` : '······')),
    h('div.frc-btns',
      h('button.btn.small', { disabled: !code, onclick: () => copyCode(ui, code) }, '📋 Copier'),
      h('button.btn.primary.small', { disabled: !code, onclick: () => shareCode(ui, code) }, '📤 Partager'),
    ),
  ));
  body.appendChild(h('button.btn.wide.fr-add', { onclick: () => addFriendDialog(ui, screen) }, '➕ Ajouter un ami avec son code'));
  if (state.loading && !on.loaded) body.appendChild(h('p.hint.fr-wait', '⏳ Connexion…'));
  if (state.error) body.appendChild(h('div.fr-error', h('p', `⚠️ ${state.error}`), h('button.btn.small', { onclick: load }, '🔄 Réessayer')));
  if (screen.tab === 'gifts') {
    const inbox = on.allInbox();
    if (!inbox.length) {
      body.appendChild(h('p.hint', 'Pas de cadeau pour l\'instant. Tes amis peuvent t\'en envoyer un par jour.'));
      return;
    }
    for (const g of inbox) {
      const G = GIFTS[g.kind] || { icon: '🎁', name: g.kind };
      body.appendChild(h('div.fr-gift', h('span.frg-ico', G.icon), h('div.frg-text', h('b', `${G.name} · +${fmt(g.amount)}`), h('small', `de ${g.from} (${g.from_village})`))));
    }
    body.appendChild(h('button.btn.primary.wide', {
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const r = await on.claim();
          game.sound.play('chest');
          if (r.shown.length) ui.showRewards(r.shown, { title: '🎁 Cadeaux de tes amis' });
        } catch (err) {
          ui.toast(err.message, 'error');
        }
        screen.refresh(true);
        ui.refreshMeta?.();
      },
    }, '🎁 Tout récupérer'));
    body.appendChild(h('p.hint', game.playing && !game.isDemo ? 'Les cadeaux vont dans le village en cours.' : 'Les cadeaux iront dans le prochain village que tu ouvriras.'));
    return;
  }
  // la liste d'amis : Capucine d'abord
  for (const f of on.allFriends()) {
    const card = h('div.fr-card' + (f.bot ? '.bot' : ''),
      h('span.fr-avatar', f.avatar || '🙂'),
      h('div.fr-info',
        h('b', f.name, f.bot ? h('span.fr-tag', 'Niv. max') : null),
        h('small', `${f.village} · niv. ${fmt(f.level)}${f.pop ? ` · ${fmt(f.pop)} hab.` : ''}`),
        h('small.fr-seen', f.bot ? 'Ta première amie : viens voir une ville au niveau maximum !' : ago(f.last_seen)),
      ),
      h('div.fr-btns',
        h('button.btn.small', { disabled: !f.has_village, title: f.has_village ? '' : 'Son village n\'est pas encore partagé', onclick: () => game.visitFriend(f) }, '🏘️ Visiter'),
        f.gift_sent
          ? h('button.btn.small.fr-sent', { disabled: true }, '✓ Envoyé')
          : h('button.btn.primary.small', { onclick: () => giftDialog(ui, f, () => screen.refresh(true)) }, '🎁 Cadeau'),
      ),
    );
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    body.appendChild(card);
  }
  if (!on.friends.length && on.loaded) {
    body.appendChild(h('div.fr-empty',
      h('p', 'Ajoute tes vrais amis avec leur code : vous pourrez visiter vos villages et vous envoyer un cadeau chaque jour.'),
    ));
  }
  body.appendChild(h('p.hint', 'Un cadeau par ami et par jour (nouveau jour à minuit). Tes amis voient ton village tel qu\'il était à ta dernière partie.'));
}

async function copyCode(ui, code) {
  try {
    await navigator.clipboard.writeText(code);
    ui.toast('📋 Code copié', 'good');
  } catch {
    ui.toast(`Ton code : ${code}`, 'info');
  }
}

async function shareCode(ui, code) {
  const text = `Viens visiter mon village dans Bâtisseur ! Mon code ami : ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bâtisseur', text, url: SITE });
      return;
    } catch {
      /* partage annulé */
    }
  }
  copyCode(ui, code);
}

function addFriendDialog(ui, screen) {
  const input = h('input.text.fr-input', { type: 'text', maxLength: 9, placeholder: 'ABC 123', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false });
  const msg = h('p.hint', 'Demande son code à ton ami (écran Amis de son jeu).');
  const go = async () => {
    msg.textContent = '⏳ Recherche…';
    try {
      const f = await ui.game.online.addFriend(input.value);
      ui.game.sound.play('quest');
      ui.toast(`👥 ${f.name} (${f.village}) est maintenant ton ami !`, 'good');
      m.close();
      screen.setTab('friends');
    } catch (err) {
      msg.textContent = `⚠️ ${err.message}`;
      ui.game.sound.play('error');
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  const m = ui.modal({
    title: '➕ Ajouter un ami',
    body: h('div', input, msg),
    actions: [{ label: 'Annuler' }, { label: 'Ajouter', cls: 'primary', onclick: () => (go(), true) }],
  });
  setTimeout(() => input.focus(), 250);
}

export function giftDialog(ui, f, after) {
  const on = ui.game.online;
  const grid = h('div.gift-grid');
  for (const [kind, G] of Object.entries(GIFTS)) {
    grid.appendChild(h('button.gift-opt', {
      onclick: async () => {
        grid.querySelectorAll('button').forEach((b) => (b.disabled = true));
        try {
          await on.sendGift(f.id, kind);
          ui.game.sound.play('coin');
          ui.toast(`🎁 Cadeau envoyé à ${f.name} : ${G.icon} ${G.amount}`, 'good');
          m.close();
          after?.();
        } catch (err) {
          ui.toast(err.message, 'error');
          m.close();
          after?.();
        }
      },
    }, h('span', G.icon), h('b', `+${G.amount}`), h('small', G.name)));
  }
  const m = ui.modal({
    title: `🎁 Un cadeau pour ${f.name}`,
    body: h('div', h('p.hint', 'Choisis ce que tu lui offres (un cadeau par jour) :'), grid),
    actions: [{ label: 'Annuler' }],
  });
}
