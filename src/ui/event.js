// Événement de la semaine : écran (paliers, défis, calendrier), pastille du HUD, carte de l'accueil,
// annonce du jour J et objets de fête à ramasser dans le village.
import { h } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { showRewards, describeReward, rewardIcon } from './rewards.js';
import { scaledResources } from '../data/pass.js';
import { EV_THRESHOLDS, DROP_PTS, DROP_EVERY, DROP_MAX, DAY_NAMES, MONTH_NAMES, upcomingEvents, eventDateLabel, modsText, eventRewards } from '../data/events.js';
import { BUILDINGS } from '../data/buildings.js';
import { buildingCenter } from '../render/BuildingView.js';
import { fmt } from '../core/util.js';
import { icon, iconHTML } from './icons.js';
import { chestArt } from './art.js';
import { Vector3 } from 'three';

const MAX = EV_THRESHOLDS[EV_THRESHOLDS.length - 1];
const DAY = 864e5;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const themeStyle = (th) => ({ '--c1': th.colors[0], '--c2': th.colors[1] });
const dowOf = (d) => DAY_NAMES[(d.getDay() + 6) % 7];

/** Nombre de jours (calendrier) entre maintenant et une date. */
function daysUntil(now, date) {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  return Math.round((date - t) / DAY);
}

function whenText(now, ev) {
  const n = daysUntil(now, ev.start);
  if (n <= 0) return now < ev.end.getTime() ? 'Aujourd\'hui !' : 'Terminé';
  if (n === 1) return 'Demain';
  if (n < 14) return `Dans ${n} jours`;
  const w = Math.round(n / 7);
  return `Dans ${w} semaine${w > 1 ? 's' : ''}`;
}

/** Étiquette et compte à rebours de l'événement. */
export function eventTiming(ev, now) {
  if (ev.status === 'soon') {
    const n = daysUntil(now, ev.start);
    return { tag: n === 1 ? `Demain · ${eventDateLabel(ev)}` : cap(eventDateLabel(ev)), timer: `Commence dans ${countdown(ev.start - now)}` };
  }
  if (ev.status === 'live') return { tag: 'Aujourd\'hui · fête du jour', timer: `Fin dans ${countdown(ev.end - now)}` };
  return { tag: 'Fête terminée', timer: `Récompenses à récupérer encore ${countdown(ev.weekEnd - now)}` };
}

/** Prochain événement qui offre cette décoration. */
export function nextEventWith(id, now = Date.now()) {
  return upcomingEvents(54, now).find((ev) => ev.theme.decor.includes(id)) || null;
}

/** Récompense principale d'une liste (pour l'affichage). */
function mainPart(parts) {
  return parts.find((p) => p.decor) || parts.find((p) => p.theme) || parts.find((p) => p.chest) || parts.find((p) => p.cash) || parts[0] || { icon: '🎁', text: '' };
}

function rewardPic(ui, p, cls) {
  const img = p.decor ? ui.game.renderer.thumbs.get(p.decor, 1) : '';
  if (img) return h('img.' + cls + '-img', { src: img, alt: '' });
  return h('span.' + cls + '-icon', p.chest ? chestArt(p.chest) : rewardIcon(p));
}

/* ───────── Écran de l'événement ───────── */
export function openEvent(ui, tab = 'event') {
  const meta = ui.game.meta;
  ui.closeSheet?.(true);
  const tabs = [
    { id: 'event', label: '🎉 Fête de la semaine', badge: () => meta.eventClaimables() },
    { id: 'cal', label: '📅 Calendrier' },
  ];
  return openScreen(ui, {
    id: 'event', title: '🎉 Événements', cls: 'event-screen', tabs, tab,
    render: (body, screen) => (screen.tab === 'cal' ? renderCalendar(ui, body) : renderEvent(ui, body, screen)),
  });
}

function banner(ui, ev, t) {
  const th = ev.theme;
  const thumb = th.decor[0] ? ui.game.renderer.thumbs.get(th.decor[0], 1) : '';
  return h('div.ev-banner.' + ev.status, { style: themeStyle(th) },
    h('div.evb-art', icon(th.icon, 'evb-icon')),
    h('div.evb-text', h('small', t.tag), h('b', th.name), h('span', th.tagline)),
    thumb ? h('div.evb-prize', h('img', { src: thumb, alt: '' }), h('em', 'Grand prix')) : null,
    h('div.evb-timer', '⏳ ', t.timer),
  );
}

function modsBox(th, status) {
  const title = status === 'live' ? '⚡ Bonus actifs' : status === 'soon' ? '⚡ Bonus du jour J' : '⚡ Bonus terminés';
  return h('div.ev-mods.' + status, h('span.evm-title', title), modsText(th).map((m) => h('span.ev-mod', m)));
}

function renderEvent(ui, body, screen) {
  const game = ui.game, meta = game.meta;
  const ev = meta.event();
  const th = ev.theme;
  const now = meta.now();
  const e = meta.p.event;
  const open = meta.eventOpen();
  body.appendChild(banner(ui, ev, eventTiming(ev, now)));
  body.appendChild(modsBox(th, ev.status));
  if (ev.status === 'live' && !meta.village) body.appendChild(h('div.ev-note', `🏘️ Ouvre un village en mode carrière pour profiter des bonus et ramasser les ${th.drop.name} !`));

  // jetons de fête
  const claim = meta.eventClaimables();
  const next = EV_THRESHOLDS.find((x) => x > e.pts);
  body.appendChild(h('div.ev-progress',
    h('div.evp-pts', icon('token', 'evp-tk'), h('b', fmt(e.pts)), h('small', 'jetons')),
    h('div.evp-main',
      h('div.evp-bar', h('div.evp-fill', { style: { width: `${(Math.min(1, e.pts / MAX) * 100).toFixed(1)}%` } }),
        EV_THRESHOLDS.map((x) => h('i.evp-mark' + (e.pts >= x ? '.on' : ''), { style: { left: `${((x / MAX) * 100).toFixed(1)}%` } }))),
      h('small.evp-next', next ? `Prochain palier : ${fmt(next)} jetons` : 'Tous les paliers atteints, bravo !'),
    ),
    claim ? h('button.btn.small.primary.pulse', {
      onclick: () => {
        const out = meta.claimAllEvent();
        if (out.length) {
          game.sound.play('tier');
          showRewards(ui, out, { title: `${th.name} !` });
        }
        screen.keepTop = true;
        screen.refresh(true);
      },
    }, 'Tout récupérer') : null,
  ));

  // paliers
  const grid = h('div.ev-grid');
  for (const m of meta.eventMilestones()) grid.appendChild(milestoneTile(ui, m, open, screen));
  body.appendChild(grid);

  // défis
  const hint = ev.status === 'live' ? 'Ils avancent aujourd\'hui seulement' : ev.status === 'soon' ? `Ils commencent ${eventDateLabel(ev)}` : 'La fête est finie';
  body.appendChild(h('div.shop-sec', h('b', '🎯 Défis de la fête'), h('small', hint)));
  for (const t of meta.eventTaskList()) {
    const pct = t.n ? t.cur / t.n : 0;
    body.appendChild(h('div.weekly-row.ev-task' + (t.claimed ? '.claimed' : t.done ? '.done' : ''),
      h('div.wr-main', h('b', t.label), h('div.wr-bar', h('div', { style: { width: `${Math.round(pct * 100)}%` } })), h('small', `${fmt(t.cur)} / ${fmt(t.n)}`)),
      h('div.wr-reward', h('span', icon('token'), ` +${t.pts}`)),
      t.claimed ? h('span.owned-tag', '✓') : t.done && open ? h('button.btn.small.primary', {
        onclick: () => {
          const out = meta.claimEventTask(t.i);
          if (out) {
            game.sound.play('quest');
            ui.toast(`🎟️ +${t.pts} jetons de fête`, 'good');
          }
          screen.keepTop = true;
          screen.refresh(true);
        },
      }, 'Récupérer') : null,
    ));
  }

  // objets à ramasser
  const left = meta.dropsLeft();
  let dropText;
  if (ev.status === 'soon') dropText = `${cap(eventDateLabel(ev))}, des ${th.drop.name} apparaîtront au-dessus des maisons de ton village : touche-les pour gagner des jetons !`;
  else if (ev.status === 'over') dropText = `C'est fini pour cette fois. Rendez-vous à la prochaine fête !`;
  else if (!meta.village) dropText = `Ils apparaissent dans tes villages en mode carrière : +${DROP_PTS} jetons chacun.`;
  else dropText = `Touche les ${th.drop.name} qui apparaissent au-dessus des bâtiments : +${DROP_PTS} jetons chacun${th.drop.coins ? ' et des pièces en plus' : ''}. ${left > 0 ? `Encore ${left} à trouver aujourd'hui.` : 'Tu les as tous trouvés !'}`;
  body.appendChild(h('div.ev-drops', { style: themeStyle(th) },
    h('span.evd-icon', icon(th.drop.icon)),
    h('div', h('b', `Chasse aux ${th.drop.name}`), h('small', dropText)),
  ));
  body.appendChild(h('div.xp-help', h('b', 'Gagner des jetons de fête'),
    h('small', `${cap(th.drop.name)} +${DROP_PTS} · Défis +50 à +130 · Construire +2 · Améliorer +5 · Quête +25 · Mission du jour +20 · Commande +20 · Niveau +40 · Nouvelle zone +40 · Coffre +10. Les jetons se gagnent le jour de la fête, en mode carrière ; les récompenses se récupèrent jusqu'à la fin de la semaine.`)));
}

function milestoneTile(ui, m, open, screen) {
  const game = ui.game, meta = game.meta;
  const parts = describeReward(m.reward, meta.level(), scaledResources);
  const main = mainPart(parts);
  const others = parts.filter((p) => p !== main);
  const grand = m.i === EV_THRESHOLDS.length - 1;
  const ready = open && m.reached && !m.claimed;
  const cls = ['ev-tile', grand && 'grand', m.claimed && 'claimed', ready && 'ready', !m.reached && 'future', parts.some((p) => p.rare) && 'rare'].filter(Boolean).join('.');
  const onclick = ready
    ? () => {
      const out = meta.claimEventMilestone(m.i);
      if (out) {
        game.sound.play(grand ? 'levelup' : 'tier');
        showRewards(ui, out, { title: grand ? '🏆 GRAND PRIX !' : `Palier ${m.i + 1} !` });
      }
      screen.keepTop = true;
      screen.refresh(true);
    }
    : () => ui.toast(`${parts.map((p) => `${p.icon} ${p.text}`).join(' + ')}${m.reached ? '' : ` — à ${fmt(m.need)} jetons`}`, 'mini');
  if (grand) {
    return h('button.' + cls, { onclick },
      h('div.etg-pic', rewardPic(ui, main, 'etg')),
      h('div.etg-text',
        h('small', h('span', '🏆 Grand prix · '), icon('token', 'et-tk'), ` ${fmt(m.need)}`),
        h('b', main.text),
        h('div.etg-more', others.map((p) => h('span.etg-chip', `${p.icon} ${p.text}`))),
      ),
      m.claimed ? h('i.rt-check', '✓') : ready ? h('i.et-go', 'Récupérer') : null,
    );
  }
  // l'avant-dernier palier (gros coffre + gemmes) prend deux cases : la grille reste pleine
  if (m.i === EV_THRESHOLDS.length - 2) {
    return h('button.' + cls + '.wide', { onclick },
      h('span.et-need', icon('token', 'et-tk'), fmt(m.need)),
      rewardPic(ui, main, 'et'),
      h('span.etw-text', h('span.et-text', main.chest ? `Coffre ${main.text}` : main.text), others.map((p) => h('span.etg-chip', `${p.icon} ${p.text}`))),
      m.claimed ? h('i.rt-check', '✓') : null,
    );
  }
  return h('button.' + cls, { onclick },
    h('span.et-need', icon('token', 'et-tk'), fmt(m.need)),
    rewardPic(ui, main, 'et'),
    h('span.et-text', main.text),
    others.length ? h('span.et-more', `+${others.length}`) : null,
    m.claimed ? h('i.rt-check', '✓') : null,
  );
}

/* ───────── Calendrier ───────── */
function renderCalendar(ui, body) {
  const meta = ui.game.meta;
  const now = meta.now();
  const cur = meta.event();
  body.appendChild(h('div.cal-intro',
    h('b', 'Une fête chaque semaine, toute l\'année !'),
    h('small', 'Le jour change chaque semaine, et chaque fête a ses propres bonus, défis et récompenses. Les grandes dates reviennent chaque année : Nouvel An, Saint-Valentin, Pâques, 14 juillet, Halloween, Noël…'),
  ));
  for (const ev of upcomingEvents(10, now)) {
    const th = ev.theme;
    const isCur = ev.key === cur.key;
    const live = isCur && cur.status === 'live';
    const thumb = th.decor[0] ? ui.game.renderer.thumbs.get(th.decor[0], 1) : '';
    const d = ev.start;
    body.appendChild(h('button.cal-row' + (isCur ? '.current' : '') + (live ? '.live' : '') + (th.holiday ? '.holiday' : ''), {
      style: themeStyle(th),
      onclick: () => (isCur ? ui.screen?.setTab('event') : previewEvent(ui, ev)),
    },
      h('div.cr-date', h('small', dowOf(d).slice(0, 3)), h('b', String(d.getDate())), h('small', MONTH_NAMES[d.getMonth()])),
      h('div.cr-icon', icon(th.icon)),
      h('div.cr-text', h('b', th.name), h('small', modsText(th)[0] || th.tagline), h('em', whenText(now, ev))),
      thumb ? h('div.cr-prize', h('img', { src: thumb, alt: '' })) : null,
    ));
  }
  body.appendChild(h('p.shop-foot', 'Touche une fête pour voir ses récompenses.'));
}

/** Aperçu d'un événement à venir : bonus et récompenses. */
export function previewEvent(ui, ev) {
  const meta = ui.game.meta;
  const th = ev.theme;
  const list = eventRewards(ev);
  const items = list.map((r, i) => {
    const parts = describeReward(r, meta.level(), scaledResources);
    const main = mainPart(parts);
    return h('div.evpv-item' + (i === list.length - 1 ? '.grand' : '') + (parts.some((p) => p.rare) ? '.rare' : ''),
      h('span.evpv-need', icon('token', 'et-tk'), fmt(EV_THRESHOLDS[i])),
      rewardPic(ui, main, 'evpv'),
      h('small', main.text + (parts.length > 1 ? ` +${parts.length - 1}` : '')),
    );
  });
  const body = h('div.ev-preview',
    h('div.evpv-head', { style: themeStyle(th) }, icon(th.icon, 'evpv-ico'), h('div', h('small', cap(eventDateLabel(ev))), h('b', th.name), h('span', th.tagline))),
    modsBox(th, 'soon'),
    h('div.evpv-grid', items),
  );
  ui.modal({ title: '🎉 Bientôt', body, cls: 'ev-preview-modal', actions: [{ label: 'J\'ai hâte !', cls: 'primary' }] });
}

/* ───────── Annonce du jour J ───────── */
/** Récompenses oubliées de la semaine passée, puis annonce de la fête du jour (une fois par événement). */
export function eventIntro(ui) {
  const game = ui.game, meta = game.meta;
  if (meta.lateEvent) {
    const late = meta.lateEvent;
    meta.lateEvent = null;
    showRewards(ui, late.items, { title: `${late.name} : tes récompenses`, subtitle: 'Tu avais oublié de les récupérer la semaine dernière : les voilà !', onClose: () => ui.eventIntro?.() });
    return true;
  }
  const ev = meta.event();
  if (ev.status !== 'live' || meta.p.event.seen) return false;
  meta.p.event.seen = true;
  meta.save();
  const th = ev.theme;
  const grand = th.decor[0];
  const thumb = grand ? game.renderer.thumbs.get(grand, 1) : '';
  const body = h('div.ev-intro',
    h('div.evi-hero', { style: themeStyle(th) },
      h('div.evi-rays'),
      icon(th.icon, 'evi-icon'),
      h('small', 'Aujourd\'hui seulement'),
      h('b', th.name),
    ),
    h('p.evi-tag', th.tagline),
    modsBox(th, 'live'),
    h('div.evi-hunt', icon(th.drop.icon, 'evi-drop'), h('span', `Ramasse les ${th.drop.name} dans ton village et gagne des jetons de fête !`)),
    thumb ? h('div.evi-prize', h('img', { src: thumb, alt: '' }), h('div', h('small', 'Grand prix'), h('b', BUILDINGS[grand]?.name || ''), h('span', 'décoration exclusive + gemmes + pièces'))) : null,
  );
  game.sound.play('fete');
  ui.modal({
    title: '🎉 C\'est jour de fête !', body, cls: 'ev-intro-modal',
    actions: [{ label: 'Plus tard' }, { label: 'Voir la fête', cls: 'primary', onclick: () => setTimeout(() => openEvent(ui), 220) }],
  });
  return true;
}

/* ───────── Pastille du HUD et carte de l'accueil ───────── */
/** État affiché : fête du jour, fête à venir, récompenses à récupérer ou prochaine fête. */
export function eventChipState(meta) {
  const ev = meta.event();
  const now = meta.now();
  const claim = meta.eventClaimables();
  const e = meta.p.event;
  if (ev.status === 'live') return { cls: 'live', th: ev.theme, icon: ev.theme.icon, tag: 'Fête du jour', name: ev.theme.name, timer: countdown(ev.end - now), pct: Math.min(1, e.pts / MAX), badge: claim, ev };
  if (ev.status === 'soon') {
    const n = daysUntil(now, ev.start);
    return { cls: 'soon', th: ev.theme, icon: ev.theme.icon, tag: n === 1 ? 'Demain' : cap(dowOf(ev.start)), name: ev.theme.name, timer: countdown(ev.start - now), badge: claim, ev };
  }
  if (claim) return { cls: 'over', th: ev.theme, icon: 'gift', tag: 'Fête terminée', name: 'Récompenses !', timer: '', badge: claim, ev };
  const next = upcomingEvents(3, now).find((x) => x.start.getTime() > now) || ev;
  return { cls: 'next', th: next.theme, icon: next.theme.icon, tag: cap(eventDateLabel(next, { short: true })), name: next.theme.name, timer: '', badge: 0, ev: next };
}

/** Met à jour la pastille de l'événement dans le HUD. */
export function refreshEventChip(ui, el) {
  const meta = ui.game.meta;
  const s = eventChipState(meta);
  const key = [s.cls, s.icon, s.tag, s.name, s.timer, s.badge, Math.round((s.pct || 0) * 100)].join('|');
  if (key === el.dataset.key) return;
  el.dataset.key = key;
  el.className = 'event-chip ' + s.cls;
  el.style.setProperty('--c1', s.th.colors[0]);
  el.style.setProperty('--c2', s.th.colors[1]);
  el.innerHTML = (s.cls === 'live' ? '<i class="ec-shine"></i>' : '') + `${iconHTML(s.icon, 'ec-ico')}<span class="ec-text"><small>${s.tag}</small><b>${s.name}</b></span>`
    + (s.timer ? `<em class="ec-timer">${s.timer}</em>` : '')
    + (s.cls === 'live' ? `<i class="ec-bar"><i style="width:${Math.round((s.pct || 0) * 100)}%"></i></i>` : '')
    + (s.badge ? `<i class="badge">${s.badge > 9 ? '9+' : s.badge}</i>` : '');
}

export function eventCardKey(meta) {
  const s = eventChipState(meta);
  return [s.cls, s.name, s.timer, s.badge, meta.p.event.pts].join('|');
}

/** Carte de l'événement sur l'écran d'accueil. */
export function eventCard(ui) {
  const meta = ui.game.meta;
  const s = eventChipState(meta);
  const now = meta.now();
  const th = s.th;
  const thumb = th.decor[0] ? ui.game.renderer.thumbs.get(th.decor[0], 1) : '';
  const sub = s.cls === 'live' ? `Fin dans ${s.timer} · ${fmt(meta.p.event.pts)} jetons`
    : s.cls === 'soon' ? `${cap(eventDateLabel(s.ev))} · dans ${s.timer}`
      : s.cls === 'over' ? `${s.ev.theme.name} : récupère tes récompenses !`
        : `${whenText(now, s.ev)} · une fête chaque semaine`;
  const tag = s.cls === 'live' ? '🎉 Fête du jour' : s.cls === 'soon' ? 'Fête de la semaine' : s.cls === 'over' ? 'Fête terminée' : 'Prochaine fête';
  return h('button.event-card.' + s.cls, { style: themeStyle(th), onclick: () => openEvent(ui), dataset: { key: eventCardKey(meta) } },
    s.cls === 'live' ? h('i.ecd-shine') : null,
    h('span.ecd-icon', icon(s.icon)),
    h('span.ecd-text', h('small', tag), h('b', s.cls === 'over' ? s.ev.theme.name : th.name), h('span', sub)),
    thumb ? h('img.ecd-prize', { src: thumb, alt: '' }) : null,
    s.badge ? h('i.badge', String(s.badge)) : null,
  );
}

/* ───────── Objets de fête à ramasser dans le village ───────── */
export class EventDrops {
  constructor(ui) {
    this.ui = ui;
    this.list = [];
    this.seq = 0;
    this.acc = DROP_EVERY - 5; // le premier arrive vite
    this.world = null;
  }

  get game() {
    return this.ui.game;
  }

  clear() {
    const labels = this.game.renderer?.labels;
    for (const d of this.list) labels?.remove(d.key);
    this.list = [];
  }

  update(dt) {
    const game = this.game, meta = game.meta, labels = game.renderer?.labels;
    if (!labels || !meta || !game.world) return;
    // les étiquettes disparaissent quand on change de village
    if (this.list.length) this.list = this.list.filter((d) => labels.items.has(d.key));
    const ev = meta.event();
    if (!game.playing || !meta.village || ev.status !== 'live') {
      if (this.list.length) this.clear();
      this.acc = DROP_EVERY - 5;
      return;
    }
    if (this.world !== game.world) {
      this.clear();
      this.world = game.world;
      this.acc = DROP_EVERY - 5;
    }
    const mult = ev.theme.mods?.drops || 1;
    for (const d of this.list) d.age += dt;
    for (const d of this.list.filter((x) => x.age > 180)) this.remove(d);
    this.acc += dt * mult;
    if (this.acc < DROP_EVERY) return;
    const max = DROP_MAX + (mult > 1 ? 2 : 0);
    if (this.list.length >= max || meta.dropsLeft() - this.list.length <= 0) return;
    this.acc = 0;
    this.spawn(ev);
  }

  spawn(ev) {
    const game = this.game, r = game.renderer, labels = r.labels;
    const used = new Set(this.list.map((d) => d.bid));
    const t = r.cam.target;
    const w = r.canvas?.clientWidth || innerWidth, hgt = r.canvas?.clientHeight || innerHeight;
    const v = new Vector3();
    // de préférence un bâtiment bien visible à l'écran (loin des barres et des boutons)
    const onScreen = (x, y, z) => {
      v.set(x, y, z).project(r.camera);
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * hgt;
      return v.z < 1 && sx > 46 && sx < w - 96 && sy > labels.marginTop + 160 && sy < hgt - labels.marginBottom - 30;
    };
    const all = [...game.world.buildings.values()]
      .filter((b) => !used.has(b.id) && !b.fire && !labels.items.has('st' + b.id) && !labels.items.has('up' + b.id))
      .map((b) => {
        const c = buildingCenter(b);
        const box = r.buildings.boxes.get(b.id);
        const y = (box ? box.max.y : 0.8) + 0.5;
        return { b, c, y, dist: Math.hypot(c.cx - t.x, c.cz - t.z), vis: onScreen(c.cx, y, c.cz) };
      })
      .sort((a, b) => a.dist - b.dist);
    const vis = all.filter((x) => x.vis);
    const cands = (vis.length ? vis : all).slice(0, 14);
    if (!cands.length) return;
    const { b, c, y } = cands[Math.floor(Math.random() * cands.length)];
    const th = ev.theme;
    const d = { key: 'evd' + ++this.seq, bid: b.id, x: c.cx, y, z: c.cz, age: 0 };
    labels.set(d.key, {
      x: d.x, y: d.y, z: d.z, cls: 'evdrop', maxDist: 90,
      html: `<div class="ev-drop" style="--c1:${th.colors[0]};--c2:${th.colors[1]}"><i class="evd-glow"></i>${iconHTML(th.drop.icon)}</div>`,
      onTap: () => this.collect(d),
    });
    this.list.push(d);
  }

  collect(d) {
    const game = this.game, meta = game.meta, r = game.renderer;
    this.remove(d);
    const res = meta.collectEventDrop();
    if (!res) return;
    game.sound.play('pop');
    if (res.coins) setTimeout(() => game.sound.play('coin'), 140);
    const key = 'evf' + ++this.seq;
    r.labels.set(key, {
      x: d.x, y: d.y + 0.3, z: d.z, cls: 'float',
      html: `<div class="float-text ev-float">+${res.pts} ${iconHTML('token')}${res.coins ? ` <span>+${fmt(res.coins)}</span> ${iconHTML('coins')}` : ''}</div>`,
    });
    setTimeout(() => r.labels.remove(key), 1400);
    for (let k = 0; k < 12; k++) r.particles.emit('sparkle', d.x + (Math.random() - 0.5) * 0.7, d.y - 0.2 + Math.random() * 0.5, d.z + (Math.random() - 0.5) * 0.7, 1);
    if (!meta.p.event.found) {
      meta.p.event.found = true;
      const th = meta.event().theme;
      this.ui.toast(`🎟️ Bien joué ! Chaque ${th.drop.one} rapporte ${DROP_PTS} jetons de fête.`, 'good', { label: 'Voir', onclick: () => openEvent(this.ui) });
    }
    this.ui.refreshMeta?.();
  }

  remove(d) {
    this.game.renderer?.labels.remove(d.key);
    this.list = this.list.filter((x) => x !== d);
  }
}
