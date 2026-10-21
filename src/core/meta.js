// Profil du joueur et méta-jeu (commun à tous les villages) : gemmes 💎, passe de combat, défis de la
// semaine, boutique, coffres, boosts, connexion quotidienne, collection (décors, thèmes, avatars, titres).
// Tout se gagne en jouant, uniquement en mode carrière (le mode libre ne rapporte rien).
import { START_GEMS, CHESTS, BOOSTS, PACKS, SHOP_DECOR, SHOP_THEMES, LOGIN_REWARDS, dailyDeals, rollChest, FREE_CHEST_HOURS } from '../data/shop.js';
import { seasonAt, tierList, TIER_XP, TIERS, BONUS_TIER_XP, PREMIUM_COST, scaledResources, WEEKLY_POOL, WEEKLY_COUNT, weekKey, SEASON_THEMES } from '../data/pass.js';
import { ROOF_THEMES } from '../data/cosmetics.js';
import { BUILDINGS, BUILDING_LIST } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { mulberry32, hashStr } from './rng.js';
import { todayKey, fmt } from './util.js';

const KEY = 'batisseur-profile';
export const BASE_AVATARS = ['👷', '🧑‍🌾', '👩‍🔧', '🧔', '👸', '🤴', '🧙', '🧝', '🦊', '🐻'];
export const BASE_THEMES = ['mix', 'blue', 'red', 'green', 'yellow'];
export const BASE_TITLES = ['Apprenti bâtisseur'];
export const ALL_EXCLUSIVES = BUILDING_LIST.filter((d) => d.exclusive).map((d) => d.id);
const CHEST_DECOR = ALL_EXCLUSIVES; // un coffre peut contenir n'importe quelle décoration exclusive
const CHEST_THEMES = Object.keys(ROOF_THEMES).filter((t) => ROOF_THEMES[t].premium);

export function defaultProfile() {
  return {
    v: 1,
    name: 'Maire',
    avatar: '👷',
    title: BASE_TITLES[0],
    gems: START_GEMS,
    bestLevel: 1,
    stats: { gemsEarned: START_GEMS, gemsSpent: 0, chests: 0, purchases: 0, tiers: 0, seasons: 0, logins: 0 },
    owned: { themes: [...BASE_THEMES], decor: [], avatars: [...BASE_AVATARS], titles: [...BASE_TITLES] },
    items: { boosts: {} },
    bank: {},
    pass: { season: null, xp: 0, premium: false, free: [], prem: [], bonus: 0 },
    weekly: { week: '', counters: {}, list: [] },
    login: { last: '', count: 0 },
    chest: { next: 0 },
    shop: { day: '', bought: [] },
    welcome: false,
  };
}

function loadProfile() {
  const base = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw);
    for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
    for (const k of Object.keys(base.stats)) if (p.stats[k] === undefined) p.stats[k] = base.stats[k];
    for (const k of Object.keys(base.owned)) if (!Array.isArray(p.owned[k])) p.owned[k] = base.owned[k];
    for (const t of BASE_THEMES) if (!p.owned.themes.includes(t)) p.owned.themes.push(t);
    for (const a of BASE_AVATARS) if (!p.owned.avatars.includes(a)) p.owned.avatars.push(a);
    if (!p.items.boosts) p.items.boosts = {};
    return p;
  } catch {
    return base;
  }
}

export class Meta {
  constructor(game) {
    this.game = game;
    this.p = loadProfile();
    this.saveAcc = 0;
    this.tickAcc = 0;
    this.dirty = false;
    this.track = null;
    this.refresh();
    this.bind();
  }

  get bus() {
    return this.game.bus;
  }

  save() {
    this.dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.p));
    } catch {
      /* stockage plein ou privé : tant pis */
    }
  }

  touch() {
    this.dirty = true;
  }

  /** Village en cours, s'il rapporte des récompenses (carrière). */
  get village() {
    const g = this.game;
    return g.playing && !g.isDemo && g.state && g.state.mode !== 'libre' ? g.state : null;
  }

  level() {
    return this.village?.level ?? this.p.bestLevel ?? 1;
  }

  refresh() {
    this.ensureSeason();
    this.ensureWeek();
  }

  /* ───────── Gemmes ───────── */
  addGems(n, why = '') {
    n = Math.round(n);
    if (!(n > 0)) return;
    this.p.gems += n;
    this.p.stats.gemsEarned += n;
    this.touch();
    this.bus.emit('gems', this.p.gems, n, why);
  }

  canPay(n) {
    return this.p.gems >= n;
  }

  spendGems(n) {
    if (this.p.gems < n) return false;
    this.p.gems -= n;
    this.p.stats.gemsSpent += n;
    this.count('spent', n, true);
    this.touch();
    this.save();
    this.bus.emit('gems', this.p.gems, -n);
    return true;
  }

  /* ───────── Passe de combat ───────── */
  season() {
    return seasonAt(Date.now());
  }

  ensureSeason() {
    const s = this.season();
    if (this.p.pass.season !== s.index) {
      if (this.p.pass.season != null && this.p.pass.xp >= TIERS * TIER_XP) this.p.stats.seasons++;
      this.p.pass = { season: s.index, xp: 0, premium: false, free: [], prem: [], bonus: 0 };
      this.touch();
    }
  }

  tiers() {
    return tierList(this.season());
  }

  passTier(xp = this.p.pass.xp) {
    return Math.min(TIERS, Math.floor(xp / TIER_XP));
  }

  passProgress() {
    const xp = this.p.pass.xp;
    const tier = this.passTier();
    if (tier >= TIERS) {
      const extra = xp - TIERS * TIER_XP;
      return { tier, xp, cur: extra % BONUS_TIER_XP, need: BONUS_TIER_XP, bonus: true, bonusReady: Math.floor(extra / BONUS_TIER_XP) - this.p.pass.bonus };
    }
    return { tier, xp, cur: xp - tier * TIER_XP, need: TIER_XP, bonus: false, bonusReady: 0 };
  }

  addPassXP(n, why = '', force = false) {
    if (!n) return;
    if (!force && !this.village) return;
    this.ensureSeason();
    const before = this.passTier();
    this.p.pass.xp = Math.max(0, this.p.pass.xp + Math.round(n));
    const after = this.passTier();
    this.touch();
    this.bus.emit('pass:xp', n, why);
    if (after > before) this.bus.emit('pass:tier', after);
  }

  tierState(t, track) {
    const reached = this.passTier() >= t;
    const list = track === 'prem' ? this.p.pass.prem : this.p.pass.free;
    const claimed = list.includes(t);
    const locked = track === 'prem' && !this.p.pass.premium;
    return { reached, claimed, locked, ready: reached && !claimed && !locked };
  }

  claimTier(t, track) {
    const st = this.tierState(t, track);
    if (!st.ready) return null;
    const def = this.tiers()[t - 1];
    const reward = track === 'prem' ? def.prem : def.free;
    if (!reward) return null;
    (track === 'prem' ? this.p.pass.prem : this.p.pass.free).push(t);
    this.p.stats.tiers++;
    const out = this.grant(reward, 'pass');
    this.save();
    this.bus.emit('pass:claimed', t, track);
    return out;
  }

  claimAllTiers() {
    const out = [];
    for (let t = 1; t <= TIERS; t++) {
      for (const track of ['free', 'prem']) {
        if (this.tierState(t, track).ready) out.push(...(this.claimTier(t, track) || []));
      }
    }
    return out;
  }

  claimBonus() {
    const pr = this.passProgress();
    if (!(pr.bonusReady > 0)) return null;
    this.p.pass.bonus++;
    const out = this.grant({ chest: 'argent' }, 'pass');
    this.save();
    return out;
  }

  buyPremium() {
    if (this.p.pass.premium) return false;
    if (!this.spendGems(PREMIUM_COST)) return false;
    this.p.pass.premium = true;
    this.p.stats.purchases++;
    this.save();
    this.bus.emit('pass:premium');
    return true;
  }

  passClaimables() {
    let n = 0;
    for (let t = 1; t <= this.passTier(); t++) {
      if (!this.p.pass.free.includes(t) && this.tiers()[t - 1].free) n++;
      if (this.p.pass.premium && !this.p.pass.prem.includes(t)) n++;
    }
    return n + Math.max(0, this.passProgress().bonusReady);
  }

  /* ───────── Défis de la semaine ───────── */
  ensureWeek() {
    const key = weekKey();
    if (this.p.weekly.week === key && this.p.weekly.list.length) return;
    const rng = mulberry32(hashStr('week:' + key));
    const pool = WEEKLY_POOL.filter((w) => (w.minLevel || 0) <= (this.p.bestLevel || 1));
    const list = [];
    const copy = [...pool];
    while (list.length < WEEKLY_COUNT && copy.length) {
      const w = copy.splice(Math.floor(rng() * copy.length), 1)[0];
      const diff = list.length < 3 ? 0 : list.length < 6 ? 1 : 2;
      const n = w.n[Math.min(diff, w.n.length - 1)];
      list.push({ id: w.id, n, pxp: Math.round(w.pxp * (1 + diff * 0.4)), gems: 5 + diff * 5, claimed: false });
    }
    this.p.weekly = { week: key, counters: {}, list };
    this.touch();
  }

  count(stat, n = 1, global = false) {
    if (!global && !this.village) return;
    this.ensureWeek();
    const c = this.p.weekly.counters;
    c[stat] = Math.max(0, (c[stat] || 0) + n);
    this.touch();
  }

  weekly() {
    this.ensureWeek();
    const c = this.p.weekly.counters;
    return this.p.weekly.list.map((w, i) => {
      const def = WEEKLY_POOL.find((d) => d.id === w.id);
      const cur = Math.floor(c[def.stat] || 0);
      return { ...w, i, def, label: def.label(w.n), cur: Math.min(cur, w.n), done: cur >= w.n };
    });
  }

  claimWeekly(i) {
    const w = this.weekly()[i];
    if (!w || !w.done || w.claimed) return null;
    this.p.weekly.list[i].claimed = true;
    const out = this.grant({ pxp: w.pxp, gems: w.gems }, 'weekly');
    this.save();
    this.bus.emit('weekly:claimed', w);
    return out;
  }

  weeklyClaimables() {
    return this.weekly().filter((w) => w.done && !w.claimed).length;
  }

  /* ───────── Connexion quotidienne ───────── */
  loginPending() {
    return this.p.login.last !== todayKey();
  }

  loginIndex() {
    return this.p.login.count % LOGIN_REWARDS.length;
  }

  claimLogin() {
    if (!this.loginPending()) return null;
    const idx = this.loginIndex();
    this.p.login.last = todayKey();
    this.p.login.count++;
    this.p.stats.logins++;
    const out = this.grant(LOGIN_REWARDS[idx], 'login');
    this.addPassXP(200, 'login', true);
    out.push({ icon: '🎖️', text: '+200 XP de passe' });
    this.save();
    return out;
  }

  /* ───────── Coffres ───────── */
  freeChestIn() {
    return Math.max(0, (this.p.chest.next || 0) - Date.now());
  }

  claimFreeChest() {
    if (this.freeChestIn() > 0) return null;
    this.p.chest.next = Date.now() + FREE_CHEST_HOURS * 3600e3;
    return this.openChest('bois');
  }

  buyChest(type, price = CHESTS[type].price) {
    if (!this.spendGems(price)) return null;
    this.p.stats.purchases++;
    return this.openChest(type);
  }

  openChest(type) {
    const rng = Math.random;
    const items = rollChest(type, this.level(), rng, this.p.owned.decor, CHEST_DECOR, this.p.owned.themes, CHEST_THEMES);
    this.p.stats.chests++;
    this.count('chests', 1, true);
    const out = [{ header: true, icon: CHESTS[type].icon, text: CHESTS[type].name, chest: type }];
    for (const r of items) out.push(...this.grant(r, 'chest'));
    this.addPassXP(50, 'chest', true);
    this.save();
    this.bus.emit('chest:opened', type);
    return out;
  }

  /* ───────── Boosts ───────── */
  boostCount(id) {
    return this.p.items.boosts[id] || 0;
  }

  activeBoosts() {
    const st = this.game.state;
    if (!st?.boosts) return [];
    return st.boosts.filter((b) => b.until > st.time.day);
  }

  useBoost(id) {
    const st = this.village;
    if (!st) return { ok: false, reason: 'Ouvre un village en mode carrière pour utiliser un boost' };
    if (!this.boostCount(id)) return { ok: false, reason: 'Tu n\'as pas ce boost' };
    const def = BOOSTS[id];
    const cur = st.boosts.find((b) => b.id === id && b.until > st.time.day);
    if (cur) cur.until += def.days;
    else st.boosts.push({ id, until: st.time.day + def.days });
    this.p.items.boosts[id]--;
    this.save();
    this.game.sim.markDirty?.();
    this.bus.emit('boost:on', id);
    return { ok: true };
  }

  buyBoost(id, price = BOOSTS[id].price) {
    if (!this.spendGems(price)) return null;
    this.p.items.boosts[id] = (this.p.items.boosts[id] || 0) + 1;
    this.p.stats.purchases++;
    this.save();
    return [{ icon: BOOSTS[id].icon, text: `Boost « ${BOOSTS[id].name} »` }];
  }

  /* ───────── Boutique ───────── */
  deals() {
    const day = todayKey();
    if (this.p.shop.day !== day) {
      this.p.shop = { day, bought: [] };
      this.touch();
    }
    return dailyDeals(day, this.level()).map((d) => ({ ...d, sold: this.p.shop.bought.includes(d.key) }));
  }

  buyDeal(deal) {
    if (deal.sold || this.p.shop.bought.includes(deal.key)) return null;
    let out = null;
    if (deal.kind === 'boost') out = this.buyBoost(deal.id, deal.price);
    else if (deal.kind === 'pack') out = this.buyPack(deal.id, deal.price);
    else if (deal.kind === 'decor') out = this.buyDecor(deal.id, deal.price);
    else if (deal.kind === 'chest') out = this.buyChest(deal.id, deal.price);
    if (out) {
      this.p.shop.bought.push(deal.key);
      this.save();
    }
    return out;
  }

  buyPack(id, price) {
    const pack = PACKS.find((p) => p.id === id);
    if (!pack) return null;
    if (!this.spendGems(price ?? pack.price)) return null;
    this.p.stats.purchases++;
    const out = this.grant(pack.give(this.level()), 'shop');
    this.save();
    return out;
  }

  ownsDecor(id) {
    return this.p.owned.decor.includes(id);
  }

  ownsTheme(id) {
    return this.p.owned.themes.includes(id);
  }

  buyDecor(id, price) {
    if (this.ownsDecor(id)) return null;
    const offer = SHOP_DECOR.find((d) => d.id === id);
    if (!this.spendGems(price ?? offer?.price ?? 50)) return null;
    this.p.stats.purchases++;
    const out = this.grant({ decor: id }, 'shop');
    this.save();
    return out;
  }

  buyTheme(id, price) {
    if (this.ownsTheme(id)) return null;
    const offer = SHOP_THEMES.find((t) => t.id === id);
    if (!this.spendGems(price ?? offer?.price ?? 250)) return null;
    this.p.stats.purchases++;
    const out = this.grant({ theme: id }, 'shop');
    this.save();
    return out;
  }

  /** Applique un thème de toits au village en cours. */
  applyTheme(id) {
    const st = this.game.state;
    if (!st || !this.ownsTheme(id) || this.game.isDemo) return false;
    st.cosmetics = st.cosmetics || {};
    st.cosmetics.roof = id;
    this.game.renderer?.buildings.setTheme(id);
    this.game.renderer?.thumbs?.clear?.();
    this.bus.emit('theme:changed', id);
    return true;
  }

  /* ───────── Profil ───────── */
  setName(name) {
    this.p.name = (name || '').trim().slice(0, 18) || 'Maire';
    this.save();
  }

  setAvatar(a) {
    if (this.p.owned.avatars.includes(a)) {
      this.p.avatar = a;
      this.save();
    }
  }

  setTitle(t) {
    if (this.p.owned.titles.includes(t)) {
      this.p.title = t;
      this.save();
    }
  }

  /* ───────── Récompenses ───────── */
  /** Donne une récompense ; renvoie la liste à afficher [{ icon, text }]. */
  grant(r, source = '') {
    const out = [];
    if (!r) return out;
    const vil = this.village;
    const give = (k, v) => {
      if (!(v > 0)) return;
      if (vil) this.game.actions.grant({ [k]: v });
      else this.p.bank[k] = (this.p.bank[k] || 0) + v;
      out.push({ icon: RESOURCES[k]?.icon || '🎁', text: `+${fmt(v)} ${RESOURCES[k]?.name.toLowerCase() || k}`, bank: !vil });
    };
    for (const [k, v] of Object.entries(r)) {
      if (RESOURCES[k]) give(k, v);
      else if (k === 'res') for (const [rk, rv] of Object.entries(scaledResources(v, this.level()))) give(rk, rv);
      else if (k === 'gems') {
        this.addGems(v, source);
        out.push({ icon: '💎', text: `+${fmt(v)} gemmes`, gems: v });
      } else if (k === 'pxp') {
        this.addPassXP(v, source, true);
        out.push({ icon: '🎖️', text: `+${fmt(v)} XP de passe` });
      } else if (k === 'chest') {
        const items = rollChest(v, this.level(), Math.random, this.p.owned.decor, CHEST_DECOR, this.p.owned.themes, CHEST_THEMES);
        this.p.stats.chests++;
        this.count('chests', 1, true);
        out.push({ header: true, icon: CHESTS[v].icon, text: CHESTS[v].name, chest: v });
        for (const it of items) out.push(...this.grant(it, 'chest'));
      } else if (k === 'boost') {
        const n = r.n || 1;
        this.p.items.boosts[v] = (this.p.items.boosts[v] || 0) + n;
        out.push({ icon: BOOSTS[v].icon, text: `${n > 1 ? n + ' × ' : ''}Boost « ${BOOSTS[v].name} »` });
      } else if (k === 'decor') {
        const def = BUILDINGS[v];
        if (!def) continue;
        if (this.ownsDecor(v)) {
          this.addGems(25, 'duplicate');
          out.push({ icon: def.icon, text: `${def.name} (déjà à toi) → +25 💎`, gems: 25 });
        } else {
          this.p.owned.decor.push(v);
          out.push({ icon: def.icon, text: `Décoration : ${def.name}`, rare: true });
          this.bus.emit('decor:unlocked', v);
        }
      } else if (k === 'theme') {
        const th = ROOF_THEMES[v];
        if (!th) continue;
        if (this.ownsTheme(v)) {
          this.addGems(60, 'duplicate');
          out.push({ icon: th.icon, text: `Toits ${th.name} (déjà à toi) → +60 💎`, gems: 60 });
        } else {
          this.p.owned.themes.push(v);
          out.push({ icon: th.icon, text: `Toits « ${th.name} »`, rare: true });
        }
      } else if (k === 'avatar') {
        if (!this.p.owned.avatars.includes(v)) this.p.owned.avatars.push(v);
        out.push({ icon: v, text: 'Nouvel avatar', rare: true });
      } else if (k === 'title') {
        if (!this.p.owned.titles.includes(v)) this.p.owned.titles.push(v);
        out.push({ icon: '🏷️', text: `Titre « ${v} »`, rare: true });
      }
    }
    this.touch();
    return out;
  }

  /** Livre au village les ressources gagnées depuis le menu. */
  deliverBank() {
    const vil = this.village;
    if (!vil) return null;
    const bank = this.p.bank;
    const keys = Object.keys(bank).filter((k) => bank[k] > 0);
    if (!keys.length) return null;
    const given = {};
    for (const k of keys) given[k] = Math.round(bank[k]);
    this.game.actions.grant(given);
    this.p.bank = {};
    this.save();
    return given;
  }

  /* ───────── Événements du jeu → XP de passe, gemmes, défis ───────── */
  bind() {
    const bus = this.bus;
    const isDecor = (b) => BUILDINGS[b.type]?.cat === 'decor';
    bus.on('building:placed', (b, o = {}) => {
      if (o.undo || o.silent) return;
      this.addPassXP(isDecor(b) ? 3 : 10, 'build');
      this.count('built');
      if (isDecor(b)) this.count('decor');
    });
    bus.on('building:removed', (b, o = {}) => {
      if (!o.undo) return;
      this.addPassXP(isDecor(b) ? -3 : -10, 'undo');
      this.count('built', -1);
      if (isDecor(b)) this.count('decor', -1);
    });
    bus.on('building:upgraded', (b, o = {}) => {
      if (o.silent) return;
      const th = b.type === 'townhall';
      const sign = o.undo ? -1 : 1;
      this.addPassXP(sign * (th ? 400 : 25), 'upgrade');
      this.count('upgraded', sign);
      // 25 gemmes la première fois que la mairie atteint ce rang dans ce village (pas de triche par annulation)
      if (th && !o.undo && this.village) {
        const f = this.village.flags || (this.village.flags = {});
        if (b.level > (f.rankGems || 1)) {
          f.rankGems = b.level;
          this.addGems(25, 'rank');
        }
      }
    });
    bus.on('roads:built', (n) => this.count('roads', n));
    bus.on('quest:claimed', () => {
      this.addPassXP(150, 'quest');
      this.count('quests');
      if (this.village) this.addGems(3, 'quest');
    });
    bus.on('daily:claimed', () => {
      this.addPassXP(250, 'daily');
      this.count('daily');
      if (!this.village) return;
      this.addGems(3, 'daily');
      const all = this.game.prog.dailyMissions();
      if (all.length && all.every((m) => m.claimed)) this.addGems(5, 'daily-all');
    });
    bus.on('achievement:claimed', () => {
      this.addPassXP(300, 'achievement');
      if (this.village) this.addGems(10, 'achievement');
    });
    bus.on('order:delivered', () => {
      this.addPassXP(100, 'order');
      this.count('orders');
    });
    bus.on('level:up', ({ level }) => {
      this.addPassXP(200, 'level');
      this.count('levels');
      if (!this.village) return;
      this.addGems(level % 5 === 0 ? 20 : 5, 'level');
      if (level > (this.p.bestLevel || 1)) this.p.bestLevel = level;
    });
    bus.on('zone:unlocked', () => this.addPassXP(300, 'zone'));
    bus.on('forest:planted', () => {
      this.addPassXP(3, 'plant');
      this.count('planted');
    });
    bus.on('fire:out', () => {
      this.addPassXP(40, 'fire');
      this.count('fires');
    });
    bus.on('trade', () => {
      this.addPassXP(15, 'trade');
      this.count('trades');
    });
    bus.on('merchant:done', () => this.addPassXP(50, 'merchant'));
    bus.on('game:loaded', () => (this.track = null));
  }

  /** Appelé à chaque image : suivi des pièces et de la nourriture, fin des boosts, sauvegarde. */
  tick(dt) {
    this.tickAcc += dt;
    if (this.tickAcc < 1) return;
    this.tickAcc = 0;
    const vil = this.village;
    if (vil) {
      const coins = vil.stats.coinsEarned || 0, food = vil.stats.produced?.food || 0;
      if (this.track && this.track.slot === vil.slot && this.track.created === vil.createdAt) {
        const dc = coins - this.track.coins, df = food - this.track.food;
        if (dc > 0) this.count('coins', dc);
        if (df > 0) this.count('food', df);
      }
      this.track = { slot: vil.slot, created: vil.createdAt, coins, food };
      // boosts terminés
      const day = vil.time.day;
      const before = vil.boosts.length;
      vil.boosts = vil.boosts.filter((b) => b.until > day);
      if (vil.boosts.length !== before) {
        this.game.sim.markDirty?.();
        this.bus.emit('boost:off');
      }
      if ((vil.level || 1) > (this.p.bestLevel || 1)) {
        this.p.bestLevel = vil.level;
        this.touch();
      }
    }
    this.saveAcc += 1;
    if (this.dirty && this.saveAcc >= 5) {
      this.saveAcc = 0;
      this.save();
    }
  }
}

export { SEASON_THEMES };
