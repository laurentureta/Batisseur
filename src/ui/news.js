import { h } from './dom.js';
import { icon } from './icons.js';
import { RELEASES, releasesSince } from '../data/releases.js';
import { VERSION } from '../version.js';
import { saveSettings } from '../core/save.js';

export function showNews(ui, { automatic = false, onClose } = {}) {
  ui.closeSheet(true);
  const releases = automatic ? releasesSince(ui.game.settings.newsVersion) : RELEASES;
  const body = h('div.news-content',
    h('div.news-hero', h('span.news-seal', icon('hammer')), h('span.news-kicker', 'LE CARNET DU BÂTISSEUR'),
      h('h1', releases[0]?.title || 'Les nouveautés du village'), h('p', 'De nouvelles idées pour construire encore plus grand.')),
    releases.map((release, i) => h('section.news-release',
      h('div.news-release-head', h('span.news-version', `v${release.version}`), h('h2', release.title), i === 0 ? h('span.news-tag', 'NOUVEAU') : null),
      release.items.map((item) => h('article.news-item', h('span.news-item-icon', icon(item.icon)), h('div', h('h3', item.title), h('p', item.text)))),
    )),
    h('p.news-footnote', 'Votre village et vos sauvegardes restent avec vous.'),
  );
  const dialog = ui.modal({
    body, cls: 'news-modal', dismissable: !automatic,
    actions: [{ label: automatic ? 'C’est parti !' : 'Retour au village', cls: 'primary' }],
    onClose: () => {
      ui.game.settings.newsVersion = VERSION;
      saveSettings(ui.game.settings);
      onClose?.();
    },
  });
  dialog.card.setAttribute('role', 'dialog');
  dialog.card.setAttribute('aria-modal', 'true');
  dialog.card.setAttribute('aria-label', 'Nouveautés de Bâtisseur');
  const button = dialog.card.querySelector('.modal-actions button');
  dialog.card.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      button.focus();
    }
  });
  requestAnimationFrame(() => button.focus({ preventScroll: true }));
  return dialog;
}
