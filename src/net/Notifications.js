// Web Push fonctionne même lorsque le jeu est fermé : les échéances sont confiées au serveur.
// Aucun minuteur navigateur ne prétend remplacer un envoi en arrière-plan.
const STORE = 'batisseur.notifications';
export const PUSH_KINDS = { orders: 'Nouvelles commandes', construction: 'Chantiers terminés', projects: 'Grands projets', shipments: 'Livraisons régionales', gifts: 'Cadeaux de vos amis' };
const DEFAULTS = Object.fromEntries(Object.keys(PUSH_KINDS).map((k) => [k, true]));

export function pushSupport(env = globalThis) {
  const nav = env.navigator || {}, ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const standalone = !!nav.standalone || !!env.matchMedia?.('(display-mode: standalone)').matches;
  if (ios && !standalone) return { available: false, install: true, message: 'Sur iPhone : ouvre ce jeu dans Safari, touche Partager puis « Sur l’écran d’accueil ». Lance ensuite Bâtisseur depuis son icône pour activer les notifications (iOS 16.4 ou ultérieur).' };
  if (!env.isSecureContext || !nav.serviceWorker || !env.PushManager || !env.Notification) return { available: false, message: 'Ce navigateur ne prend pas en charge les notifications Web Push. Utilise une version récente de Safari, Chrome ou Edge, avec une connexion HTTPS.' };
  return { available: true, message: '' };
}

export function notificationEvents(state, preferences = DEFAULTS, now = Date.now()) {
  const events = [], seen = new Set();
  const add = (kind, id, due, region = state.regionId || 'home') => {
    if (!preferences[kind] || !Number.isFinite(due) || due <= now || due > now + 7 * 86400000) return;
    const tag = `${kind}:${region}:${id}:${Math.round(due)}`;
    if (!seen.has(tag)) { seen.add(tag); events.push({ tag, kind, at: new Date(due).toISOString() }); }
  };
  const village = (st, region) => {
    for (const b of st.buildings || []) if (b.cons && !b.cons.ready) add('construction', b.id, b.cons.rs + b.cons.rd, region);
    for (const [type, p] of Object.entries(st.city?.projects || {})) add('projects', `${type}:${p.phase}`, p.readyAt, region);
    for (const [type, p] of Object.entries(st.city?.tourism?.attractions || {})) add('projects', `park:${type}:${p.phase}`, p.readyAt, region);
    for (let i = 0; i < (st.orders?.readyAt?.length || 0); i++) if (!st.orders.slots?.[i]) add('orders', i, st.orders.readyAt[i], region);
  };
  village(state, state.regionId || 'home');
  for (const [region, entry] of Object.entries(state.regionBook?.settlements || {})) if (entry.snapshot) village(entry.snapshot, region);
  for (const s of state.regionBook?.shipments || []) if (!s.delivered) add('shipments', s.id, s.readyAt, s.to);
  for (const e of state.regionBook?.expeditions || []) if (!e.claimed) add('shipments', `expedition:${e.id}`, e.readyAt, e.from);
  return events.sort((a,b) => Date.parse(a.at)-Date.parse(b.at)).slice(0,24);
}
function applicationKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (v) => v.charCodeAt(0));
}
export class Notifications {
  constructor(game, env = globalThis) {
    this.game = game; this.env = env; this.loading = false; this.error = ''; this.config = null; this.subscription = null;
    this.enabled = false; this.preferences = { ...DEFAULTS }; this.synced = ''; this.syncing = false; this.lastAttempt = 0;
    try { const saved = JSON.parse(env.localStorage?.getItem(STORE) || '{}'); this.enabled = !!saved.enabled; this.preferences = { ...DEFAULTS, ...saved.preferences }; } catch { /* préférences par défaut */ }
  }
  support() { return pushSupport(this.env); }
  persist() { try { this.env.localStorage?.setItem(STORE, JSON.stringify({ enabled: this.enabled, preferences: this.preferences })); } catch { /* stockage privé */ } }
  async status() {
    this.error = '';
    if (!this.support().available) return;
    try {
      this.config = await this.game.online.rpc('bat_push_config');
      const reg = await this.env.navigator.serviceWorker.getRegistration();
      this.subscription = await reg?.pushManager.getSubscription();
      if (!this.subscription || this.env.Notification.permission !== 'granted') { this.enabled = false; this.persist(); }
    } catch (e) { this.error = e.status === 404 || e.code === 'PGRST202' ? 'Le service de notifications n’est pas encore activé sur le serveur.' : e.message; }
  }
  async enable() {
    if (this.loading) return;
    const support = this.support(); if (!support.available) throw new Error(support.message);
    // L'autorisation reste directement liée au clic, avant tout appel réseau (nécessaire sur iOS).
    this.loading = true; this.error = '';
    let created = false;
    try {
      if (!this.config?.enabled || !this.config.publicKey) throw new Error('Le service de notifications doit être activé sur le serveur avant de connecter ce téléphone.');
      const permission = await this.env.Notification.requestPermission();
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Les notifications sont bloquées. Autorise-les dans les réglages de ton téléphone pour Bâtisseur.' : 'L’autorisation n’a pas été accordée.');
      await this.game.online.ensure();
      const reg = await this.env.navigator.serviceWorker.ready;
      this.subscription = await reg.pushManager.getSubscription();
      if (!this.subscription) { this.subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(this.config.publicKey) }); created = true; }
      await this.game.online.rpc('bat_push_subscribe', { ...this.game.online.auth(), p_subscription: this.subscription.toJSON(), p_preferences: this.preferences });
      this.enabled = true; this.persist(); this.synced = ''; await this.sync(true);
    } catch (e) { if (created) { await this.subscription?.unsubscribe().catch(() => {}); this.subscription = null; } this.enabled = false; this.persist(); this.error = e.message; throw e; }
    finally { this.loading = false; }
  }
  async disable() {
    this.loading = true;
    try {
      const reg = await this.env.navigator.serviceWorker?.getRegistration();
      const sub = this.subscription || await reg?.pushManager.getSubscription();
      if (sub) { await sub.unsubscribe(); if (this.game.online.me?.id) await this.game.online.rpc('bat_push_unsubscribe', { ...this.game.online.auth(), p_endpoint: sub.endpoint }).catch(() => {}); }
      this.subscription = null; this.enabled = false; this.persist(); this.synced = '';
    } finally { this.loading = false; }
  }
  async setPreference(kind, enabled) {
    if (!(kind in DEFAULTS) || this.loading) return;
    const before = this.preferences[kind];
    this.preferences[kind] = !!enabled; this.persist(); this.synced = '';
    if (!this.enabled) return;
    this.loading = true; this.error = '';
    try {
      if (!this.subscription) { const reg = await this.env.navigator.serviceWorker.getRegistration(); this.subscription = await reg?.pushManager.getSubscription(); }
      if (!this.subscription) { this.enabled = false; this.persist(); throw new Error('Ce téléphone doit être reconnecté aux notifications.'); }
      await this.game.online.rpc('bat_push_subscribe', { ...this.game.online.auth(), p_subscription: this.subscription.toJSON(), p_preferences: this.preferences });
      await this.sync(true);
    } catch (e) { this.preferences[kind] = before; this.persist(); this.error = e.message; throw e; }
    finally { this.loading = false; }
  }
  flush() { return this.sync(true,{keepalive:true}); }
  async sync(force = false, { keepalive = false } = {}) {
    if (!this.enabled || !this.game.online.me?.id || !this.game.playing || this.game.isDemo || this.game.visit || !this.game.state) return false;
    if (this.syncing) { this.resync = true; this.resyncKeepalive = this.resyncKeepalive || keepalive; return false; }
    if (!force && Date.now() - this.lastAttempt < 10000) return false;
    this.syncing = true; this.lastAttempt = Date.now();
    try {
      if (!this.subscription) { const reg = await this.env.navigator.serviceWorker.getRegistration(); this.subscription = await reg?.pushManager.getSubscription(); }
      if (!this.subscription) { this.enabled = false; this.persist(); return false; }
      const st = this.game.state;
      const payload = { ...this.game.online.auth(), p_endpoint: this.subscription.endpoint, p_scope: `slot${st.slot}`, p_events: notificationEvents(st,this.preferences) };
      const key = JSON.stringify([payload.p_scope,payload.p_events]);
      if (!force && key === this.synced) return true;
      await this.game.online.rpc('bat_push_schedule',payload,{keepalive});
      this.synced = key; this.error = ''; return true;
    } catch (e) { this.error = e.message; return false; }
    finally { this.syncing = false; if (this.resync) { this.resync = false; const nextKeepalive = this.resyncKeepalive || keepalive; this.resyncKeepalive = false; void this.sync(true,{keepalive:nextKeepalive}); } }
  }
}
