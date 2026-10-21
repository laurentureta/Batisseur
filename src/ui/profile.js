// Profil du maire : nom, avatar, titre, statistiques et collection.
import { h, clear } from './dom.js';
import { fmt } from '../core/util.js';
import { ALL_EXCLUSIVES } from '../core/meta.js';
import { ROOF_THEMES } from '../data/cosmetics.js';
import { slotSummaries } from '../core/save.js';
import { chestArt } from './art.js';

export function openProfile(ui) {
  const meta = ui.game.meta;
  const p = meta.p;
  const body = h('div.profile-body');
  const render = () => {
    clear(body);
    const name = h('input.text', { type: 'text', value: p.name, maxLength: 18, placeholder: 'Ton nom' });
    name.addEventListener('change', () => {
      meta.setName(name.value);
      ui.start?.refreshMeta?.();
    });
    body.append(
      h('div.profile-head', h('div.pf-avatar', p.avatar), h('div.pf-id', name, h('small', p.title))),
      h('div.field-label', 'Avatar'),
      h('div.avatar-grid', p.owned.avatars.map((a) => h('button.avatar' + (a === p.avatar ? '.on' : ''), {
        onclick: () => {
          meta.setAvatar(a);
          ui.game.sound.play('tap');
          render();
          ui.start?.refreshMeta?.();
        },
      }, a))),
      h('div.field-label', 'Titre'),
      h('div.title-list', p.owned.titles.map((t) => h('button.seg' + (t === p.title ? '.on' : ''), {
        onclick: () => {
          meta.setTitle(t);
          render();
          ui.start?.refreshMeta?.();
        },
      }, t))),
      h('div.field-label', 'Statistiques'),
      h('div.pf-stats',
        stat('💎', fmt(p.gems), 'gemmes'),
        stat('🏆', fmt(p.bestLevel || 1), 'meilleur niveau'),
        stat(chestArt('bois'), fmt(p.stats.chests), 'coffres ouverts'),
        stat('🎖️', fmt(p.stats.tiers), 'paliers du passe'),
        stat('🎨', `${p.owned.decor.length}/${ALL_EXCLUSIVES.length}`, 'décos exclusives'),
        stat('🏠', `${p.owned.themes.length}/${Object.keys(ROOF_THEMES).length}`, 'thèmes de toits'),
        stat('🏘️', fmt(slotSummaries().filter((s) => s.exists).length), 'villages'),
        stat('📅', fmt(p.stats.logins), 'jours de connexion'),
      ),
    );
  };
  render();
  ui.modal({ title: '👤 Mon profil', body, cls: 'profile-modal', actions: [{ label: 'Fermer', cls: 'primary' }] });
}

function stat(icon, value, label) {
  return h('div.pf-stat', h('span', icon), h('b', value), h('small', label));
}
