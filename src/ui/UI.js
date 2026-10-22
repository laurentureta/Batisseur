// Interface : barre du haut, boutons, bandeau d'outil, feuilles, fenêtres et notifications.
import { h, clear, costChips, rewardChips } from './dom.js';
import { BUILDINGS, ROAD_TYPES, levelName } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { fmt, fmtCompact, calendar, SEASONS, hourLabel } from '../core/util.js';
import { EVENT_INFO } from '../sim/RandomEvents.js';
import { renderBuildMenu } from './BuildMenu.js';
import { renderInfo } from './InfoPanel.js';
import * as Panels from './Panels.js';
import { StartScreen } from './StartScreen.js';
import { openShop } from './shop.js';
import { openPass } from './pass.js';
import { openProfile } from './profile.js';
import { showRewards, showLogin } from './rewards.js';
import { closeScreen } from './screens.js';
import { BOOSTS } from '../data/shop.js';
import { COVER_COLORS } from '../render/Renderer.js';
import { SIZE } from '../world/constants.js';
import { icon, iconURL, iconHTML, emojifyTree } from './icons.js';

const SPEEDS = [1, 2, 4, 0];
const SPEED_ICONS = { 0: 'pause', 1: 'play', 2: 'ff', 4: 'fff' };
const SEASON_ICONS = ['blossom', 'sun', 'leaf', 'snowflake'];
const WEATHER_ICONS = { clear: 'sun', cloudy: 'partly', rain: 'rain', snow: 'snow' };

export function moodIcon(h) {
  if (h >= 0.8) return '😄';
  if (h >= 0.62) return '🙂';
  if (h >= 0.45) return '😐';
  if (h >= 0.3) return '🙁';
  return '😠';
}

export function moodName(h) {
  if (h >= 0.8) return 'happy';
  if (h >= 0.62) return 'smile';
  if (h >= 0.45) return 'neutral';
  if (h >= 0.3) return 'sad';
  return 'angry';
}

/** Change l'image d'une icône seulement si besoin. */
function setIcon(img, name) {
  if (img.dataset.i !== name) {
    img.dataset.i = name;
    img.src = iconURL(name);
  }
}

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.sheet = null;
    this.modalStack = [];
    this.layer = null;
    this.hudAcc = 0;
    this.lastRoadType = 1;
    this.buildCat = 'housing';
    this.buildHud();
    this.buildBottom();
    this.toastRoot = h('div.toasts');
    this.strokeInfo = h('div.stroke-info.hidden');
    this.root.append(this.toastRoot, this.strokeInfo);
    this.start = new StartScreen(this);
    this.bindBus();
  }

  get st() {
    return this.game.state;
  }
  get libre() {
    return this.game.state?.mode === 'libre';
  }

  /* ───────── Barre du haut ───────── */
  buildHud() {
    const ring = '<svg viewBox="0 0 52 52" class="ring"><defs><linearGradient id="lvRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff38a"/><stop offset="1" stop-color="#ffae1a"/></linearGradient></defs>'
      + '<circle cx="26" cy="26" r="22.5" class="bg"/><circle cx="26" cy="26" r="22.5" class="fg" stroke-dasharray="141.4" stroke-dashoffset="141.4"/></svg>';
    this.el = {};
    const e = this.el;
    e.level = h('button.lvl', { onclick: () => this.openQuests(), 'aria-label': 'Niveau et quêtes' },
      h('span.lv-ring', { html: ring }), h('span.lv-disc', h('b.num', '1')), h('i.badge.hidden'));
    const stat = (name, cls, fn) => h('button.chip-stat.' + cls, { onclick: fn }, icon(name, 'ic'), h('span.v', h('b', '0'), h('small', '')));
    e.coins = stat('coins', 'st-coins', () => this.openStock());
    e.pop = stat('people', 'st-pop', () => this.openStock());
    e.happy = stat('smile', 'st-happy', () => this.openLayers('happiness'));
    e.happyIco = e.happy.querySelector('.ic');
    e.happy.querySelector('small').textContent = 'bonheur';
    e.menu = h('button.icon-btn.menu-btn', { onclick: () => this.openMenu(), 'aria-label': 'Menu' }, icon('menu'));
    e.seasonIco = icon('blossom', 'tc-ico');
    e.weatherIco = icon('sun', 'tc-ico');
    e.timeText = h('span.tt', '');
    e.date = h('button.time-chip', { onclick: () => this.openStock() }, e.seasonIco, e.timeText, e.weatherIco);
    e.speedIco = icon('play');
    e.speed = h('button.speed-btn', { onclick: () => this.cycleSpeed(), 'aria-label': 'Vitesse' }, e.speedIco);
    e.quest = h('button.quest-tracker', { onclick: () => this.openQuests() });
    e.alerts = h('div.alerts');
    e.boosts = h('div.boost-chips');
    this.hud = h('div.hud',
      h('div.hud-top', e.level, h('div.stats', e.coins, e.pop, e.happy), e.menu),
      h('div.hud-sub', e.quest, h('div.time', e.date, e.speed)),
      e.boosts,
      e.alerts,
    );
    // boutons latéraux (icône + libellé)
    const side = (name, label, fn, key, cls = '') => {
      const b = h('button.side-btn' + cls, { onclick: fn, 'aria-label': label }, icon(name), h('span.sl', label), h('i.badge.hidden'));
      e[key] = b;
      return b;
    };
    side('stall', 'Boutique', () => this.openShop(), 'sShop', '.shop-btn');
    e.sShop.appendChild(h('em.gem-count', icon('gem'), h('span', '0')));
    this.side = h('div.side',
      e.sShop,
      side('medal', 'Passe', () => this.openPass(), 'sPass', '.pass-btn'),
      side('target', 'Quêtes', () => this.openQuests(), 'sQuests'),
      side('scroll', 'Commandes', () => this.openOrders(), 'sOrders'),
      side('trophy', 'Succès', () => this.openAchievements(), 'sAch'),
      side('crate', 'Stock', () => this.openStock(), 'sStock'),
      side('map', 'Calques', () => this.openLayers(), 'sLayers'),
    );
    this.root.append(this.hud, this.side);
  }

  buildBottom() {
    const e = this.el;
    const tb = (tool, name, label, cls) => h('button.tb.' + cls, { dataset: { tool }, onclick: () => this.toolButton(tool) }, h('span.tb-face', icon(name)), h('span.l', label));
    e.tbSelect = tb('select', 'hand', 'Explorer', 'tb-blue');
    e.tbRoad = tb('road', 'road', 'Route', 'tb-stone');
    e.tbBuild = h('button.tb.big.tb-green', { onclick: () => this.openBuildMenu() }, h('span.tb-face', icon('hammer')), h('span.l', 'Construire'));
    e.tbDemolish = tb('demolish', 'bulldozer', 'Détruire', 'tb-red');
    e.tbUndo = h('button.tb.tb-yellow', { onclick: () => this.undo() }, h('span.tb-face', icon('undo')), h('span.l', 'Annuler'));
    this.bottom = h('div.bottom-bar', e.tbSelect, e.tbRoad, e.tbBuild, e.tbDemolish, e.tbUndo);
    this.banner = h('div.tool-banner.hidden');
    this.root.append(this.banner, this.bottom);
  }

  setPlayingUI(on) {
    this.root.classList.toggle('playing', on);
    if (this.safeTop == null) {
      const probe = h('div', { style: { position: 'absolute', paddingTop: 'env(safe-area-inset-top)', visibility: 'hidden' } });
      document.body.appendChild(probe);
      this.safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
    }
    const safeTop = this.safeTop;
    this.game.renderer.labels.setMargins(on ? 130 + safeTop : 0, on ? 110 : 0);
  }

  /* ───────── Mise à jour régulière ───────── */
  update(dt) {
    this.hudAcc += dt;
    this.screenAcc = (this.screenAcc || 0) + dt;
    if (this.screen && this.screenAcc >= 1) {
      this.screenAcc = 0;
      this.screen.refresh();
    }
    if (this.hudAcc < 0.25) return;
    this.hudAcc = 0;
    if (!this.game.state || !this.game.playing) {
      this.start?.tick?.();
      return;
    }
    this.refreshHud();
  }

  /** Gemmes, pastilles du passe et de la boutique. */
  refreshMeta() {
    const meta = this.game.meta, e = this.el;
    if (!meta || !e?.sShop) return;
    e.sShop.querySelector('.gem-count span').textContent = fmtCompact(meta.p.gems);
    this.badge(e.sShop, meta.freeChestIn() <= 0 ? 1 : 0);
    this.badge(e.sPass, meta.passClaimables() + meta.weeklyClaimables());
  }

  openShop(tab) {
    this.closeSheet(true);
    return openShop(this, tab);
  }

  openPass(tab) {
    this.closeSheet(true);
    return openPass(this, tab);
  }

  openProfile() {
    openProfile(this);
  }

  closeScreen() {
    closeScreen(this);
  }

  showRewards(items, opts) {
    showRewards(this, items, opts);
  }

  showLogin(opts) {
    return showLogin(this, opts);
  }

  /** Premier lancement : cadeau de bienvenue. */
  welcomeGift(then) {
    const meta = this.game.meta;
    const body = h('div.welcome-gift',
      h('div.wg-gem', '💎'),
      h('p', h('b', `${meta.p.gems} gemmes offertes !`)),
      h('p', 'Les gemmes servent dans la boutique (coffres, boosts, décorations exclusives) et pour le Passe Royal. Tu en gagnes en jouant : missions, niveaux, défis, passe de combat…'),
      h('small', 'Aucun achat avec de l\'argent réel : tout se gagne dans le jeu.'),
    );
    this.game.sound.play('gem');
    this.modal({ title: '🎉 Bienvenue, Bâtisseur !', body, cls: 'welcome-modal', actions: [{ label: 'Merci !', cls: 'primary', onclick: () => setTimeout(() => then?.(), 300) }] });
  }

  refreshHud() {
    const game = this.game, st = this.st, d = game.sim.d, e = this.el;
    const libre = this.libre;
    // niveau
    const lp = game.prog.levelProgress();
    e.level.querySelector('.num').textContent = libre ? '∞' : lp.level;
    e.level.querySelector('.fg').setAttribute('stroke-dashoffset', String(141.4 * (1 - (libre ? 1 : lp.pct))));
    // pièces
    e.coins.querySelector('b').textContent = libre ? '∞' : fmtCompact(st.res.coins);
    const net = d.income.total - (d.broke ? 0 : d.upkeep);
    e.coins.querySelector('small').textContent = libre ? '' : `${net >= 0 ? '+' : ''}${fmtCompact(Math.round(net))}/j`;
    e.coins.classList.toggle('neg', !libre && net < 0);
    // population
    e.pop.querySelector('b').textContent = fmt(d.population);
    e.pop.querySelector('small').textContent = `sur ${fmt(d.capacity)}`;
    // bonheur
    setIcon(e.happyIco, moodName(d.happiness));
    e.happy.querySelector('b').textContent = `${Math.round(d.happiness * 100)}%`;
    // date
    const cal = calendar(st.time.day);
    const nightNow = cal.hour < 6 || cal.hour >= 20.5;
    const wk = st.weather?.kind || 'clear';
    setIcon(e.seasonIco, SEASON_ICONS[cal.season] || 'sun');
    setIcon(e.weatherIco, nightNow && wk === 'clear' ? 'moon' : WEATHER_ICONS[wk] || 'sun');
    const tt = `J${cal.day} · ${hourLabel(cal.hour)}`;
    if (e.timeText.textContent !== tt) e.timeText.textContent = tt;
    setIcon(e.speedIco, SPEED_ICONS[st.time.speed] ?? 'play');
    e.speed.classList.toggle('paused', st.time.speed === 0);
    e.speed.classList.toggle('fast', st.time.speed > 1);
    // quête
    const q = game.prog.currentQuest();
    if (q && !libre) {
      const p = game.prog.questProgress(q);
      e.quest.classList.remove('hidden');
      e.quest.classList.toggle('ready', st.quests.mainReady);
      const unit = p.unit || '';
      const html = st.quests.mainReady
        ? `${iconHTML('gift', 'qi')}<span class="qt">Récompense prête !</span>`
        : `${iconHTML('target', 'qi')}<span class="qt">${q.title}</span><em>${fmt(Math.min(p.cur, p.target))}${unit}/${fmt(p.target)}${unit}</em>`;
      if (html !== this.questHtml) {
        this.questHtml = html;
        e.quest.innerHTML = html;
      }
    } else e.quest.classList.add('hidden');
    // boosts actifs
    const active = (st.boosts || []).filter((b) => b.until > st.time.day);
    const bkey = active.map((b) => b.id + Math.ceil((b.until - st.time.day) * 10)).join(',');
    if (bkey !== this.boostKey) {
      this.boostKey = bkey;
      clear(e.boosts);
      for (const b of active) {
        const left = Math.max(0, b.until - st.time.day);
        e.boosts.appendChild(h('button.boost-chip', { onclick: () => this.openShop('boosts') }, `${BOOSTS[b.id].icon} ${BOOSTS[b.id].name} · ${left >= 1 ? left.toFixed(1) + ' j' : Math.ceil(left * 24) + ' h'}`));
      }
    }
    this.refreshMeta();
    // pastilles
    const c = game.prog.claimables();
    this.badge(e.sQuests, c.quests);
    this.badge(e.sOrders, c.orders);
    this.badge(e.sAch, c.achievements);
    this.badge(e.level, c.quests);
    e.sOrders.classList.toggle('hidden', libre || !game.prog.featureUnlocked('orders'));
    e.sQuests.classList.toggle('hidden', libre);
    e.sAch.classList.toggle('hidden', libre);
    // alertes
    const alerts = [];
    if (!libre) {
      if (d.starving) alerts.push(['🍞', 'Famine ! Produis de la nourriture', 'bad', () => this.openStock()]);
      if (d.broke) alerts.push(['💸', 'Caisses vides : services à l\'arrêt', 'bad', () => this.openStock()]);
      if (d.fullGoods.length) alerts.push(['📦', 'Stock plein : construis un entrepôt', 'warn', () => this.openStock()]);
      if (d.jobs > 0 && d.staffing < 0.6) alerts.push(['👷', 'Manque de main-d\'œuvre : construis des maisons', 'warn', () => this.openStock()]);
      if (st.events.merchant) alerts.push(['🛒', 'Un marchand ambulant est là !', 'info', () => this.openMerchant()]);
      for (const ev of st.events.active) {
        const info = EVENT_INFO[ev.kind];
        if (info) alerts.push([info.icon, info.name, 'info', () => this.toast(info.desc)]);
      }
      const fires = [...game.world.buildings.values()].filter((b) => b.fire);
      if (fires.length) alerts.push(['🔥', `Incendie : ${BUILDINGS[fires[0].type].name}`, 'bad', () => {
        game.select(fires[0].id);
        game.renderer.focusBuilding(fires[0]);
      }]);
    }
    const key = alerts.map((a) => a[1]).join('|');
    if (key !== this.alertsKey) {
      this.alertsKey = key;
      clear(e.alerts);
      for (const [icon, text, cls, fn] of alerts.slice(0, 3)) e.alerts.appendChild(h('button.alert.' + cls, { onclick: fn }, h('span', icon), h('span.t', text)));
    }
    e.tbUndo.classList.toggle('disabled', !game.actions.undoStack.length);
    // feuille ouverte (une fois par seconde)
    this.sheetAcc = (this.sheetAcc || 0) + 0.25;
    if (this.sheet?.live && this.sheetAcc >= 1) {
      this.sheetAcc = 0;
      this.sheet.refresh();
    }
    if (this.layer) this.refreshLayer();
  }

  badge(el, n) {
    const b = el.querySelector('.badge');
    if (!b) return;
    if (n > 0) {
      b.textContent = n > 9 ? '9+' : String(n);
      b.classList.remove('hidden');
    } else b.classList.add('hidden');
  }

  cycleSpeed() {
    const cur = this.st.time.speed;
    const k = SPEEDS.indexOf(cur);
    const next = SPEEDS[(k + 1) % SPEEDS.length];
    this.game.setSpeed(next);
    this.game.sound.play('tap');
    this.refreshHud();
    this.toast(next === 0 ? '⏸ Pause' : `Vitesse ×${next}`, 'mini');
  }

  /* ───────── Outils ───────── */
  toolButton(kind) {
    const cur = this.game.tool.kind;
    if (kind === 'select' || (cur === kind && kind !== 'road')) {
      this.exitTool();
      return;
    }
    if (kind === 'road') {
      if (cur === 'road') {
        this.exitTool();
        return;
      }
      const type = this.lastRoadType === 2 && this.game.prog.roadUnlocked(2) ? 2 : 1;
      this.setTool({ kind: 'road', roadType: type });
    } else if (kind === 'demolish') this.setTool({ kind: 'demolish' });
  }

  setTool(tool) {
    this.closeSheet();
    this.game.select(null);
    this.game.setTool(tool);
  }

  exitTool() {
    this.game.setTool({ kind: 'select' });
  }

  rotateTool() {
    const t = this.game.tool;
    if (t.kind !== 'build' && t.kind !== 'move') return;
    const cur = t.rot ?? 0;
    this.game.setTool({ ...t, rot: (cur + 1) % 4 });
    this.toast('Orientation : ' + ['face au sud', 'face à l\'est', 'face au nord', 'face à l\'ouest'][(cur + 1) % 4], 'mini');
  }

  onToolChanged(tool) {
    const e = this.el;
    for (const b of [e.tbSelect, e.tbRoad, e.tbDemolish]) b.classList.toggle('active', b.dataset.tool === tool.kind);
    e.tbBuild.classList.toggle('active', tool.kind === 'build');
    const r = this.game.renderer;
    r.overlays.hideGhost();
    r.overlays.hideRadius();
    r.overlays.clearRoadPreview();
    r.setGrid(tool.kind === 'build' || tool.kind === 'road' || tool.kind === 'move');
    this.renderBanner(tool);
  }

  renderBanner(tool) {
    const b = this.banner;
    clear(b);
    const active = tool.kind !== 'select' && this.game.playing;
    this.root.classList.toggle('tool-active', active);
    if (!active) {
      b.classList.add('hidden');
      return;
    }
    b.classList.remove('hidden');
    const close = h('button.banner-close', { onclick: () => this.exitTool(), 'aria-label': 'Fermer' }, '✕');
    if (tool.kind === 'build') {
      const def = BUILDINGS[tool.type];
      const img = this.game.renderer.thumbs.get(tool.type, 1);
      b.append(
        h('img.banner-thumb', { src: img, alt: '' }),
        h('div.banner-text', h('b', def.name), costChips(def.costs[0], this.st.res, { libre: this.libre }), h('small', 'Touche la carte pour construire')),
        h('button.banner-btn', { onclick: () => this.rotateTool(), 'aria-label': 'Pivoter' }, tool.rot == null ? '↻ Auto' : '↻'),
        close,
      );
    } else if (tool.kind === 'road') {
      const types = [1, 2].map((t) => {
        const rt = ROAD_TYPES[t];
        const unlocked = this.game.prog.roadUnlocked(t);
        return h('button.seg' + (tool.roadType === t ? '.on' : '') + (unlocked ? '' : '.locked'), {
          onclick: () => {
            if (!unlocked) {
              this.toast(`${rt.name} : débloquée au niveau ${rt.unlock}`, 'error');
              return;
            }
            this.lastRoadType = t;
            this.game.setTool({ kind: 'road', roadType: t });
          },
        }, `${rt.icon} ${t === 1 ? 'Chemin' : 'Pavée'}`, unlocked ? '' : ' 🔒');
      });
      const rt = ROAD_TYPES[tool.roadType];
      b.append(
        h('div.banner-text', h('div.segs', types), h('small', `${costLine(rt.cost)} par case · glisse pour tracer · 2 doigts pour bouger`)),
        close,
      );
    } else if (tool.kind === 'demolish') {
      b.append(h('div.banner-text', h('b', '💥 Détruire'), h('small', 'Touche un bâtiment (50 % remboursés) ou glisse sur des routes')), close);
    } else if (tool.kind === 'move') {
      const bld = this.game.world.buildings.get(tool.id);
      b.append(
        h('div.banner-text', h('b', `✋ Déplacer : ${bld ? levelName(BUILDINGS[bld.type], bld.level) : ''}`), h('small', 'Touche le nouvel emplacement (gratuit)')),
        h('button.banner-btn', { onclick: () => this.rotateTool() }, '↻'),
        close,
      );
    }
  }

  undo() {
    const res = this.game.actions.undo();
    if (res.ok) {
      this.game.sound.play('undo');
      this.toast('Action annulée', 'mini');
    } else {
      this.game.sound.play('error');
      this.toast(res.reason, 'error');
    }
    this.refreshHud();
  }

  commitRoad(tiles, roadType) {
    const res = this.game.actions.placeRoads(tiles, roadType);
    if (res.ok) {
      this.game.sound.play('road');
      if (res.partial && res.reason) this.toast(res.reason, 'error');
    } else {
      this.game.sound.play('error');
      this.toast(res.reason, 'error');
    }
  }

  afterBuild(b) {
    const def = BUILDINGS[b.type];
    if (this.game.tool.kind === 'build') this.renderBanner(this.game.tool);
    if (def.unique) this.exitTool();
    const inf = this.game.sim.info.get(b.id);
    if (inf && !inf.connected && b.type !== 'townhall' && def.cat !== 'decor') this.toast('🚧 Pense à le relier à la route', 'mini');
  }

  confirmDemolish(id) {
    const game = this.game;
    const b = game.world.buildings.get(id);
    if (!b) return;
    if (b.type === 'townhall') {
      game.sound.play('error');
      this.toast('On ne peut pas détruire la mairie', 'error');
      return;
    }
    const def = BUILDINGS[b.type];
    const doIt = () => {
      const res = game.actions.demolish(id);
      if (res.ok) game.sound.play('demolish');
      else this.toast(res.reason, 'error');
    };
    if (b.level >= 2 || def.cat === 'monuments' || def.size[0] * def.size[1] > 1) {
      const refund = game.actions.refundFor(b);
      this.confirm(`Détruire ${levelName(def, b.level)} ?`, h('div', h('p', 'Tu récupères la moitié de ce qu\'il a coûté :'), costChips(refund)), 'Détruire', 'danger').then((ok) => ok && doIt());
    } else doIt();
  }

  /* ───────── Infos de tracé ───────── */
  showStrokeInfo(pv, x, y) {
    const el = this.strokeInfo;
    clear(el);
    el.appendChild(costChips(pv.cost, this.st.res, { libre: this.libre }));
    if (pv.error) el.appendChild(h('small.err', pv.error));
    el.classList.remove('hidden');
    this.moveStrokeInfo(x, y);
  }

  moveStrokeInfo(x, y) {
    this.strokeInfo.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 70)}px) translate(-50%, -100%)`;
  }

  hideStrokeInfo() {
    this.strokeInfo?.classList.add('hidden');
  }

  /* ───────── Feuilles (panneaux du bas) ───────── */
  openSheet(kind, title, render, { live = false, cls = '', onClose = null } = {}) {
    if (this.sheet && this.sheet.kind === kind && kind !== 'info') {
      this.closeSheet();
      return null;
    }
    this.closeSheet(true);
    const body = h('div.sheet-body');
    const titleEl = h('div.sheet-title', title);
    const el = h('div.sheet' + (cls ? '.' + cls : ''),
      h('div.sheet-head', h('div.grip'), titleEl, h('button.sheet-close', { onclick: () => this.closeSheet(), 'aria-label': 'Fermer' }, '✕')),
      body,
    );
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const sheet = {
      kind, el, body, titleEl, live, onClose, pressed: false,
      refresh: (force = false) => {
        if (sheet.pressed && !force) return;
        const tmp = h('div');
        render(tmp, sheet);
        emojifyTree(tmp);
        if (!force && tmp.innerHTML === body.innerHTML) return;
        const top = body.scrollTop;
        clear(body);
        while (tmp.firstChild) body.appendChild(tmp.firstChild);
        body.scrollTop = top;
      },
    };
    el.addEventListener('pointerdown', () => (sheet.pressed = true));
    const release = () => setTimeout(() => (sheet.pressed = false), 60);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    this.sheet = sheet;
    render(body, sheet);
    this.game.sound.play('open');
    this.root.classList.add('sheet-open');
    return sheet;
  }

  closeSheet(instant = false) {
    const s = this.sheet;
    if (!s) return;
    this.sheet = null;
    s.onClose?.();
    this.root.classList.remove('sheet-open');
    if (instant) s.el.remove();
    else {
      s.el.classList.remove('open');
      setTimeout(() => s.el.remove(), 260);
    }
  }

  openBuildMenu(cat) {
    if (cat) this.buildCat = cat;
    if (this.game.tool.kind === 'move') this.exitTool();
    this.game.select(null);
    this.openSheet('build', 'Construire', (body, sheet) => renderBuildMenu(this, body, sheet), { cls: 'build-sheet' });
  }

  openInfo(id) {
    const b = this.game.world.buildings.get(id);
    if (!b) return;
    this.openSheet('info', '', (body, sheet) => renderInfo(this, body, sheet, id), {
      live: true,
      cls: 'info-sheet',
      onClose: () => {
        if (this.game.selection === id) this.game.select(null);
      },
    });
  }

  openQuests() {
    if (this.libre) return this.toast('Pas de quêtes en mode libre : construis à volonté !', 'mini');
    this.openSheet('quests', '🎯 Quêtes', (body) => Panels.renderQuests(this, body), { live: true });
  }

  openOrders() {
    this.openSheet('orders', '📜 Commandes', (body) => Panels.renderOrders(this, body), { live: true });
  }

  openAchievements() {
    this.openSheet('ach', '🏆 Succès', (body) => Panels.renderAchievements(this, body), { live: true });
  }

  openStock() {
    this.openSheet('stock', '📦 Stock et statistiques', (body) => Panels.renderStock(this, body), { live: true });
  }

  openLayers(preset) {
    if (preset) {
      this.setLayer(preset);
      this.toast('Calque : bonheur des maisons (vert = heureux)', 'mini');
      return;
    }
    this.openSheet('layers', '🗺️ Calques', (body) => Panels.renderLayers(this, body), { live: false });
  }

  openMenu() {
    this.openSheet('menu', '☰ Menu', (body) => Panels.renderMenu(this, body));
  }

  openSettings() {
    this.openSheet('settings', '⚙️ Réglages', (body) => Panels.renderSettings(this, body));
  }

  openZone(zi) {
    Panels.openZoneDialog(this, zi);
  }

  openMerchant() {
    Panels.openMerchant(this);
  }

  /* ───────── Calques ───────── */
  setLayer(kind) {
    this.layer = kind || null;
    this.refreshLayer();
  }

  refreshLayer() {
    const r = this.game.renderer;
    if (!this.layer) {
      r.overlays.clearLayer();
      return;
    }
    const sim = this.game.sim, world = this.game.world;
    const list = [];
    const kind = this.layer;
    if (kind === 'happiness') {
      for (const b of world.buildings.values()) {
        if (!BUILDINGS[b.type].residents) continue;
        const inf = sim.info.get(b.id);
        if (!inf) continue;
        const hp = inf.happiness;
        const color = hp >= 0.75 ? 0x43a047 : hp >= 0.55 ? 0x9ccc65 : hp >= 0.4 ? 0xfdd835 : 0xe53935;
        for (const i of world.tilesOf(b)) list.push({ i, color });
      }
    } else if (kind === 'beauty' || kind === 'pollution') {
      const arr = kind === 'beauty' ? sim.beauty : sim.pollution;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v < 0.015 || !world.zoneUnlocked(i % SIZE, (i / SIZE) | 0)) continue;
        const t = Math.min(1, v / (kind === 'beauty' ? 0.2 : 0.3));
        const color = kind === 'beauty' ? lerpColor(0xc5e1a5, 0xe91e63, t) : lerpColor(0xfff59d, 0x6d4c41, t);
        list.push({ i, color });
      }
    } else {
      const arr = sim.cov[kind];
      if (arr) {
        const color = COVER_COLORS[kind] || 0x64b5f6;
        for (let i = 0; i < arr.length; i++) if (arr[i] >= 0.5 && world.zoneUnlocked(i % SIZE, (i / SIZE) | 0)) list.push({ i, color });
        // maisons non couvertes en rouge
        for (const b of world.buildings.values()) {
          if (!BUILDINGS[b.type].residents) continue;
          const inf = sim.info.get(b.id);
          if (inf && !inf.needs?.[kind] && kind !== 'fire') for (const i of world.tilesOf(b)) list.push({ i, color: 0xe53935 });
        }
      }
    }
    r.overlays.setLayer(list);
  }

  /* ───────── Fenêtres ───────── */
  modal({ title, body, actions = [], cls = '', dismissable = true, onClose = null }) {
    const card = h('div.modal-card' + (cls ? '.' + cls : ''));
    if (title) card.appendChild(h('div.modal-title', title));
    if (body) card.appendChild(h('div.modal-body', body));
    const back = h('div.modal-back');
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      back.classList.remove('open');
      setTimeout(() => back.remove(), 200);
      this.modalStack = this.modalStack.filter((m) => m !== back);
      onClose?.();
    };
    if (actions.length) {
      const row = h('div.modal-actions');
      for (const a of actions) {
        row.appendChild(h('button.btn' + (a.cls ? '.' + a.cls : ''), {
          onclick: () => {
            const keep = a.onclick?.();
            if (keep !== true) close();
          },
          disabled: a.disabled,
        }, a.label));
      }
      card.appendChild(row);
    }
    back.appendChild(card);
    if (dismissable) back.addEventListener('click', (e) => e.target === back && close());
    this.root.appendChild(back);
    this.modalStack.push(back);
    requestAnimationFrame(() => back.classList.add('open'));
    return { close, card };
  }

  confirm(title, body, okLabel = 'Confirmer', okCls = 'primary') {
    return new Promise((resolve) => {
      let done = false;
      this.modal({
        title, body,
        actions: [
          { label: 'Annuler', onclick: () => ((done = true), resolve(false)) },
          { label: okLabel, cls: okCls, onclick: () => ((done = true), resolve(true)) },
        ],
        onClose: () => !done && resolve(false),
      });
    });
  }

  toast(text, kind = '', action = null) {
    if (!text) return;
    if (kind === 'mini') {
      // un seul petit message à la fois
      this.toastRoot.querySelectorAll('.toast.mini').forEach((t) => t.remove());
    }
    const el = h('div.toast' + (kind ? '.' + kind : ''), h('span', text));
    if (action) el.appendChild(h('button.toast-btn', { onclick: (e) => (e.stopPropagation(), action.onclick(), el.remove()) }, action.label));
    el.addEventListener('click', () => el.remove());
    this.toastRoot.appendChild(el);
    while (this.toastRoot.children.length > 3) this.toastRoot.firstChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, action ? 5000 : kind === 'mini' ? 1600 : 2800);
  }

  /* ───────── Événements du jeu ───────── */
  bindBus() {
    const bus = this.game.bus;
    const game = this.game;
    bus.on('tool:changed', (t) => this.onToolChanged(t));
    bus.on('selection', (id) => {
      if (id != null && game.tool.kind === 'select') this.openInfo(id);
      else if (id == null && this.sheet?.kind === 'info') this.closeSheet();
    });
    bus.on('level:up', (data) => {
      game.sound.play('levelup');
      Panels.showLevelUp(this, data);
    });
    bus.on('quest:ready', (q) => {
      game.sound.play('quest');
      this.toast(`🎁 Quête terminée : ${q.title}`, 'good', { label: 'Récupérer', onclick: () => this.openQuests() });
    });
    bus.on('quest:claimed', (q, reward, xp) => {
      game.sound.play('coin');
      this.toast(`Récompense : ${rewardText({ ...reward, xp })}`, 'good');
      this.refreshHud();
    });
    bus.on('daily:claimed', (m) => {
      game.sound.play('coin');
      this.toast(`Mission accomplie : ${rewardText(m.reward)}`, 'good');
    });
    bus.on('achievement:claimed', (a) => {
      game.sound.play('quest');
      this.toast(`🏆 ${a.name} : ${rewardText(a.reward)}`, 'good');
    });
    bus.on('order:delivered', (o) => {
      game.sound.play('coin');
      this.toast(`📜 Commande livrée : +${fmt(o.coins)} 🪙`, 'good');
    });
    bus.on('orders:new', () => {
      if (game.prog.featureUnlocked('orders') && !this.ordersHintShown) {
        this.ordersHintShown = true;
      }
    });
    bus.on('zone:unlocked', (zi) => {
      game.sound.play('unlock');
      this.toast(`🗺️ Nouvelle zone : ${game.world.zoneName(zi)}`, 'good');
    });
    bus.on('building:upgraded', (b, opts = {}) => {
      if (opts.undo) return;
      game.sound.play('upgrade');
      const def = BUILDINGS[b.type];
      if (b.type === 'townhall') this.toast(`🏛️ Ton village devient : ${levelName(def, b.level).replace('Mairie · ', '')} !`, 'good');
    });
    bus.on('fire:start', (b) => {
      game.sound.play('fire');
      const covered = b.fire?.covered;
      this.toast(`🔥 Incendie : ${BUILDINGS[b.type].name}${covered ? ' (les pompiers arrivent)' : ''}`, 'bad', covered ? null : {
        label: 'Voir',
        onclick: () => {
          game.renderer.focusBuilding(b);
          game.select(b.id);
        },
      });
    });
    bus.on('fire:out', (b, paid) => paid || this.toast(`🚒 Les pompiers ont éteint le feu (${BUILDINGS[b.type].name})`, 'good'));
    bus.on('fire:burnt', (b) => this.toast(`🔥 ${BUILDINGS[b.type].name} a brûlé… Construis une caserne de pompiers !`, 'bad'));
    bus.on('event:start', (e, info) => {
      if (!info) return;
      game.sound.play('quest');
      this.toast(`${info.icon} ${info.name} : ${info.desc}`, 'good');
    });
    bus.on('merchant:arrived', () => {
      this.toast('🛒 Un marchand ambulant est arrivé !', 'info', { label: 'Voir', onclick: () => this.openMerchant() });
    });
    bus.on('alert:famine', () => this.toast('🍞 Plus de nourriture ! Les habitants partent. Construis potagers, pêcheurs ou boulangeries.', 'bad'));
    bus.on('season:changed', (s) => this.toast(`${SEASONS[s].icon} ${SEASONS[s].name} arrive`, 'mini'));
    bus.on('undo:changed', () => this.el.tbUndo.classList.toggle('disabled', !game.actions.undoStack.length));
    bus.on('gems', (total, n, why) => {
      this.refreshMeta();
      this.start?.refreshMeta?.();
      if (n > 0 && why && !['chest', 'pass', 'shop', 'login', 'weekly', 'duplicate'].includes(why)) {
        game.sound.play('gem');
        this.toast(`+${n} 💎`, 'gem');
      }
    });
    bus.on('pass:tier', (tier) => {
      game.sound.play('tier');
      this.refreshMeta();
      this.toast(`🎖️ Palier ${tier} du passe atteint !`, 'good', { label: 'Voir', onclick: () => this.openPass() });
    });
    bus.on('decor:unlocked', (id) => this.toast(`⭐ Nouvelle décoration : ${BUILDINGS[id].name} (Construire → Exclusifs)`, 'good'));
    bus.on('boost:on', () => this.refreshHud());
    bus.on('boost:off', () => this.toast('⏱️ Un boost vient de se terminer', 'mini'));
  }
}

function costLine(cost) {
  return Object.entries(cost).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
}

export function rewardText(r) {
  return Object.entries(r)
    .filter(([, v]) => v)
    .map(([k, v]) => `+${fmt(v)} ${k === 'xp' ? '⭐' : RESOURCES[k]?.icon || ''}`)
    .join('  ');
}

function lerpColor(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

export { rewardChips };
