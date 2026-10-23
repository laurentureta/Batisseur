// Le multijoueur : un code ami par joueur, la liste d'amis, les visites de villages et un cadeau
// par ami et par jour. Le serveur est une base Supabase (offre gratuite). La clé ci-dessous est
// la clé « publishable » : elle est faite pour être dans l'appli. Les tables ne sont pas lisibles
// avec elle ; tout passe par des fonctions qui vérifient le secret du joueur (gardé sur ce
// téléphone, jamais affiché) et qui fixent elles-mêmes le contenu des cadeaux.
import { makeSnapshot } from './snapshot.js';
import { BOT } from './bot.js';
import { todayKey } from '../core/util.js';

const API = 'https://kuiyozeeqzjaqzifnfok.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_jNAE7KWQgEkhVheifZ1BPA_DnpZq8P2';
// ancienne clé publique « anon » du même projet (même rôle, mêmes droits) : utilisée seulement si
// la nouvelle clé était refusée par un vieux relais
const LEGACY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXlvemVlcXpqYXF6aWZuZm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MjQ5MTYsImV4cCI6MjEwODMwMDkxNn0.ygfrPNlkd459bQOSNqOqpRaDGTBNIJAQY_6RvM3CQGk';
const STORE = 'batisseur.online';

export const GIFTS = {
  coins: { icon: '🪙', name: 'Pièces', amount: 250 },
  wood: { icon: '🪵', name: 'Bois', amount: 60 },
  stone: { icon: '🪨', name: 'Pierre', amount: 40 },
  food: { icon: '🍞', name: 'Nourriture', amount: 60 },
};

const ERRORS = {
  'code inconnu': 'Aucun joueur avec ce code.',
  "c'est ton propre code": "C'est ton propre code !",
  "déjà envoyé aujourd'hui": "Tu lui as déjà envoyé un cadeau aujourd'hui.",
  'pas ami': "Ce joueur n'est pas (ou plus) dans tes amis.",
  "trop d'amis": "Tu as déjà 100 amis : c'est le maximum.",
  'joueur inconnu': 'Ton compte en ligne est introuvable.',
};

function randomSecret() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class Online {
  constructor(game) {
    this.game = game;
    this.me = null;
    try {
      this.me = JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch {
      this.me = null;
    }
    this.friends = [];
    this.inbox = [];
    this.loaded = false;
    this.error = '';
    this.busy = false;
    this.lastPublish = 0;
    this.lastRefresh = 0;
  }

  get bus() {
    return this.game.bus;
  }

  /* ───────── Capucine, l'amie automatique (toujours là, même sans connexion) ───────── */
  botData() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(STORE + '.bot') || 'null');
    } catch {
      d = null;
    }
    return d || { sent: '', claimed: '' };
  }

  saveBot(d) {
    try {
      localStorage.setItem(STORE + '.bot', JSON.stringify(d));
    } catch {
      /* ignoré */
    }
  }

  botEntry() {
    const d = this.botData();
    return { ...BOT, gift_sent: d.sent === todayKey(), last_seen: new Date().toISOString() };
  }

  /** Le cadeau du jour de Capucine (un par jour). */
  botGift() {
    const d = this.botData();
    if (d.claimed === todayKey()) return null;
    const day = new Date().getDate();
    const kinds = ['coins', 'wood', 'stone', 'food'];
    const kind = kinds[day % kinds.length];
    return { id: 'bot-' + todayKey(), kind, amount: GIFTS[kind].amount, from: BOT.name, from_village: BOT.village, bot: true };
  }

  /** Amis à afficher : Capucine d'abord, puis les vrais amis. */
  allFriends() {
    return [this.botEntry(), ...this.friends];
  }

  allInbox() {
    const g = this.botGift();
    return g ? [g, ...this.inbox] : this.inbox;
  }

  saveMe() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.me));
    } catch {
      /* stockage plein ou interdit */
    }
  }

  /** Appel d'une fonction du serveur. */
  async rpc(fn, args = {}, { keepalive = false } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    const headers = this.legacy
      ? { apikey: LEGACY, Authorization: `Bearer ${LEGACY}`, 'Content-Type': 'application/json' }
      : { apikey: KEY, 'Content-Type': 'application/json' };
    try {
      res = await fetch(API + fn, { method: 'POST', headers, body: JSON.stringify(args), signal: ctrl.signal, keepalive });
    } catch {
      throw new Error('Pas de connexion : vérifie ton accès à Internet.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 && !this.legacy) {
      this.legacy = true;
      return this.rpc(fn, args, { keepalive });
    }
    const txt = await res.text();
    let data = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `Erreur du serveur (${res.status})`;
      throw new Error(ERRORS[msg] || msg);
    }
    return data;
  }

  auth() {
    return { p_id: this.me.id, p_secret: this.me.secret };
  }

  /** Crée le compte en ligne au premier besoin (aucune donnée personnelle : un pseudo). */
  async ensure() {
    if (this.me?.id) return this.me;
    const secret = randomSecret();
    const name = this.game.meta?.p?.name || 'Maire';
    const village = this.game.state && !this.game.isDemo ? this.game.state.name : 'Mon village';
    const r = await this.rpc('bat_register', { p_secret: secret, p_name: name, p_village: village });
    this.me = { id: r.id, code: r.code, secret };
    this.saveMe();
    this.bus.emit('online:changed');
    return this.me;
  }

  /** Liste d'amis et cadeaux reçus. */
  async refresh() {
    await this.ensure();
    const [friends, inbox] = await Promise.all([this.rpc('bat_friends', this.auth()), this.rpc('bat_inbox', this.auth())]);
    this.friends = friends || [];
    const before = new Set(this.inbox.map((g) => g.id));
    this.inbox = inbox || [];
    const fresh = this.inbox.filter((g) => !before.has(g.id));
    if (fresh.length && (this.loaded || this.inbox.length)) this.bus.emit('online:gift', fresh.length, fresh[0].from);
    this.loaded = true;
    this.error = '';
    this.lastRefresh = Date.now();
    this.bus.emit('online:changed');
    return this;
  }

  async addFriend(code) {
    await this.ensure();
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4) throw new Error('Entre le code de ton ami (6 caractères).');
    const f = await this.rpc('bat_add_friend', { ...this.auth(), p_code: clean });
    await this.refresh();
    return f;
  }

  async removeFriend(id) {
    await this.rpc('bat_remove_friend', { ...this.auth(), p_friend: id });
    await this.refresh();
  }

  async sendGift(id, kind) {
    if (id === BOT.id) {
      const d = this.botData();
      if (d.sent === todayKey()) throw new Error("Tu lui as déjà envoyé un cadeau aujourd'hui.");
      d.sent = todayKey();
      this.saveBot(d);
      this.bus.emit('online:changed');
      return { ok: true, kind, amount: GIFTS[kind]?.amount || 0 };
    }
    const r = await this.rpc('bat_send_gift', { ...this.auth(), p_friend: id, p_kind: kind });
    const f = this.friends.find((x) => x.id === id);
    if (f) f.gift_sent = true;
    this.bus.emit('online:changed');
    return r;
  }

  /** Récupère les cadeaux reçus : ils vont au village en cours (ou à la réserve du menu). */
  async claim() {
    const all = [];
    const bot = this.botGift();
    if (bot) {
      const d = this.botData();
      d.claimed = todayKey();
      this.saveBot(d);
      all.push(bot);
    }
    let err = null;
    if (this.me?.id && this.inbox.length) {
      try {
        all.push(...((await this.rpc('bat_claim', this.auth())) || []));
      } catch (e) {
        err = e;
      }
    }
    const total = {};
    for (const g of all) if (GIFTS[g.kind]) total[g.kind] = (total[g.kind] || 0) + g.amount;
    const shown = Object.keys(total).length ? this.game.meta.grant(total, 'gift') : [];
    if (this.me?.id) await this.refresh().catch(() => {});
    if (err && !all.length) throw err;
    this.bus.emit('online:changed');
    return { list: all, shown };
  }

  async village(id) {
    if (id === BOT.id) return { ...this.botEntry(), bot: true };
    return this.rpc('bat_village', { ...this.auth(), p_friend: id });
  }

  /**
   * Met à jour sa fiche et la photo de son village (pour les visites de ses amis), au plus toutes
   * les 3 minutes, seulement si un compte existe (on ne crée rien sans que le joueur l'ait voulu).
   */
  async publish(force = false) {
    const game = this.game;
    if (!this.me?.id || !game.playing || game.isDemo || !game.state) return false;
    const now = Date.now();
    if (!force && now - this.lastPublish < 180000) return false;
    this.lastPublish = now;
    const st = game.state;
    const p = game.meta?.p;
    try {
      await this.rpc('bat_update', {
        ...this.auth(),
        p_name: p?.name || 'Maire',
        p_avatar: p?.avatar || '',
        p_village: st.name,
        p_level: st.mode === 'libre' ? 1 : st.level,
        p_pop: Math.floor(game.sim.d.population),
        p_snapshot: makeSnapshot(game),
      });
      return true;
    } catch (err) {
      this.error = err.message;
      return false;
    }
  }

  /** Petit passage régulier (appelé chaque seconde) : publication et cadeaux reçus. */
  tick() {
    if (!this.me?.id || document.hidden) return;
    const now = Date.now();
    if (this.game.playing && now - this.lastPublish > 180000) this.publish();
    if (now - this.lastRefresh > 300000 && !this.busy) {
      this.busy = true;
      this.refresh().catch(() => {}).finally(() => (this.busy = false));
    }
  }
}
