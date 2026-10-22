// Écrans plein écran (boutique, passe de combat) avec en-tête, onglets et rafraîchissement.
import { h, clear } from './dom.js';
import { fmt } from '../core/util.js';
import { emojifyTree } from './icons.js';

export function gemPill(ui, { onclick } = {}) {
  const meta = ui.game.meta;
  const el = h('button.gem-pill', { onclick: onclick || (() => ui.openShop('gems')), 'aria-label': 'Gemmes' }, h('span.gi', '💎'), h('b', fmt(meta.p.gems)), h('span.plus', '+'));
  el.update = () => (el.querySelector('b').textContent = fmt(meta.p.gems));
  return el;
}

/**
 * openScreen(ui, { id, title, cls, tabs: [{ id, label }], tab, render(body, screen) })
 */
export function openScreen(ui, opts) {
  closeScreen(ui, true);
  const pill = gemPill(ui, { onclick: opts.id === 'shop' ? () => screen.setTab('gems') : null });
  const head = h('div.screen-head',
    h('button.screen-back', { onclick: () => closeScreen(ui), 'aria-label': 'Retour' }, '‹'),
    h('div.screen-title', opts.title),
    pill,
  );
  const tabsEl = h('div.screen-tabs');
  const body = h('div.screen-body');
  const el = h('div.screen' + (opts.cls ? '.' + opts.cls : ''), head, opts.tabs ? tabsEl : null, body);
  const screen = {
    id: opts.id, el, body, tab: opts.tab || opts.tabs?.[0]?.id, pill,
    setTab(t) {
      screen.tab = t;
      screen.refresh(true);
    },
    refresh(force = false) {
      if (screen.pressed && !force) return;
      pill.update();
      if (opts.tabs) {
        const key = screen.tab + '|' + opts.tabs.map((t) => (t.badge ? t.badge() : 0)).join(',');
        if (key !== screen.tabsKey) {
          screen.tabsKey = key;
          clear(tabsEl);
          for (const t of opts.tabs) {
            const badge = t.badge ? t.badge() : 0;
            tabsEl.appendChild(h('button.stab' + (t.id === screen.tab ? '.on' : ''), { onclick: () => screen.setTab(t.id) }, t.label, badge ? h('i.badge', String(badge)) : null));
          }
        }
      }
      const tmp = h('div');
      opts.render(tmp, screen);
      emojifyTree(tmp);
      if (!force && tmp.innerHTML === body.innerHTML) return;
      const top = body.scrollTop;
      const scrolls = [...body.querySelectorAll('[data-keep-scroll]')].map((n) => [n.dataset.keepScroll, n.scrollLeft]);
      clear(body);
      while (tmp.firstChild) body.appendChild(tmp.firstChild);
      body.scrollTop = force ? (screen.keepTop ? top : 0) : top;
      for (const [key, left] of scrolls) {
        const n = body.querySelector(`[data-keep-scroll="${key}"]`);
        if (n) n.scrollLeft = left;
      }
      screen.keepTop = false;
      opts.after?.(body, screen);
    },
  };
  el.addEventListener('pointerdown', () => (screen.pressed = true));
  const release = () => setTimeout(() => (screen.pressed = false), 80);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  ui.root.appendChild(el);
  ui.screen = screen;
  ui.root.classList.add('screen-open');
  screen.refresh(true);
  requestAnimationFrame(() => el.classList.add('open'));
  ui.game.sound.play('open');
  return screen;
}

export function closeScreen(ui, instant = false) {
  const s = ui.screen;
  if (!s) return;
  ui.screen = null;
  ui.root.classList.remove('screen-open');
  if (instant) s.el.remove();
  else {
    s.el.classList.remove('open');
    setTimeout(() => s.el.remove(), 280);
  }
  ui.refreshMeta?.();
  ui.start?.refreshMeta?.();
}

/** Compte à rebours lisible : « 3 j 4 h », « 2 h 05 », « 12 min ». */
export function countdown(ms) {
  if (ms <= 0) return 'maintenant';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} j ${hh} h`;
  if (hh > 0) return `${hh} h ${String(mm).padStart(2, '0')}`;
  if (mm > 0) return `${mm} min`;
  return `${s % 60} s`;
}
