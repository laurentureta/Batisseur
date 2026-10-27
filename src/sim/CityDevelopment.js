import { SPECIALTIES, FACADES, GARDENS, PROJECTS, HOUSEHOLDS, TERRITORIES, TRANSPORT, TRADE_INTERVALS, EXPEDITIONS } from '../data/city.js';
import { BUILDINGS, sizeOf, isPavedRoad } from '../data/buildings.js';
import { GOODS } from '../data/resources.js';
import { ZONE, ZONES, SIZE, CENTER_ZONE } from '../world/constants.js';
import { ensureCity } from '../core/cityState.js';
import { createNewState } from '../core/state.js';
import { serialize } from '../core/save.js';
import { roadPath } from './paths.js';
import { advanceRegionalState, regionalTransportModes } from './RegionalEconomy.js';

const fail = (reason) => ({ ok: false, reason });
export class CityDevelopment {
  constructor(game) { this.game = game; this.districts = new Map(); game.bus.on('building:placed',(b) => { if(PROJECTS[b.type]) b.level=this.project(b.type).phase+1; }); }
  get st() { return this.game.state; }
  get data() { return ensureCity(this.st); }
  get book() {
    if (!this.st.regionBook) this.st.regionBook = { level: this.st.level, settlements: { home: { name: this.st.name, preset: this.st.preset, snapshot: null } }, shipments: [], nextShipment: 1, coopLedger: {} };
    const book = this.st.regionBook;
    book.tradeRoutes ||= []; book.nextTradeRoute ||= 1; book.expeditions ||= []; book.nextExpedition ||= 1;
    return book;
  }
  reset() { ensureCity(this.st); this.elapsed = 0; this.lastRegionalAt = 0; for(const j of this.data.deliveries) delete j.networkVersion; this.districts.clear(); this.recount(); this.syncFamilies(); }
  changed(visual = false) {
    this.recount(); this.game.sim.markDirty();
    if (visual) this.game.bus.emit('city:appearance');
    this.game.bus.emit('city:changed');
    this.game.save?.();
  }
  pay(cost) {
    if (!this.game.actions.canAfford(cost)) return false;
    this.game.actions.pay(cost); return true;
  }
  recount() {
    this.districts.clear();
    this.festival = this.game.meta?.event()?.status === 'live';
    for (const d of this.data.districts) {
      const rule = SPECIALTIES[d.specialty]; if (!rule) continue;
      const list = [...this.game.world.buildings.values()].filter((b) => d.zones.includes(this.game.world.zoneIndex(b.x, b.z)) && b.cons?.k !== 'new' && !b.fire && (!BUILDINGS[b.type].civic || b.level >= 4) && (!PROJECTS[b.type] || this.project(b.type).phase === 3));
      const count = list.filter((b) => rule.types ? rule.types.includes(b.type) : rule.categories.includes(BUILDINGS[b.type].cat)).length;
      const decor = list.filter((b) => BUILDINGS[b.type].cat === 'decor').length;
      const info = { ...d, count, decor, active: count >= rule.count && (!rule.decor || decor >= rule.decor), rule };
      for (const z of d.zones) this.districts.set(z, info);
    }
  }
  districtFor(b) { return this.districts.get(this.game.world.zoneIndex(b.x, b.z)); }
  effects(b) {
    const d = this.districtFor(b), def = BUILDINGS[b.type], r = d?.active ? d.rule : {};
    const qualifies = d?.active && (r.types ? r.types.includes(b.type) : r.categories?.includes(def.cat));
    const terrain = TERRITORIES[this.st.regionId];
    return {
      production: (qualifies ? r.production || 1 : 1) * (terrain?.cargo && terrain.rate && def.produces?.[terrain.cargo] ? terrain.rate : 1),
      commerce: (qualifies ? r.commerce || 1 : 1) * (this.completed('civic_square') && this.festival ? 1.25 : 1) * (this.st.regionId === 'coast' ? 1.15 : 1),
      happy: (r.happy || 0) + (this.completed('civic_square') ? 0.03 : 0),
    };
  }
  districtTourism() { return [...new Set(this.districts.values())].reduce((n,d) => n + (d.active ? d.rule.tourism || 0 : 0), 0); }
  setDistrict(id, name, specialty, zones) {
    name = String(name || '').trim().slice(0,28);
    if (!name || !SPECIALTIES[specialty]) return fail('Choisissez un nom et une spécialité.');
    if (!Array.isArray(zones) || !zones.length || zones.length > 25 || zones.some((z) => !Number.isInteger(z) || !this.st.zones[z])) return fail('Sélectionnez de 1 à 25 zones débloquées.');
    zones = [...new Set(zones)];
    const seen = new Set([zones[0]]), pending = [zones[0]];
    for (const z of pending) for (const n of [z % ZONES ? z-1 : -1, z % ZONES < ZONES-1 ? z+1 : -1, z-ZONES, z+ZONES]) if (zones.includes(n) && !seen.has(n)) { seen.add(n); pending.push(n); }
    if (seen.size !== zones.length) return fail('Les zones d’un quartier doivent se toucher.');
    if (this.data.districts.some((d) => d.id !== id && d.zones.some((z) => zones.includes(z)))) return fail('Une zone appartient déjà à un autre quartier.');
    let d = this.data.districts.find((v) => v.id === id);
    if (!d) { d = { id: this.data.nextDistrict++ }; this.data.districts.push(d); }
    Object.assign(d, { name, specialty, zones }); this.changed(true); return { ok: true, district: d };
  }
  removeDistrict(id) { this.data.districts = this.data.districts.filter((d) => d.id !== id); this.changed(true); return { ok: true }; }
  styleBuilding(id, appearance) {
    const b = this.game.world.buildings.get(id);
    if (!b || this.game.isDemo || this.game.visit) return fail('Ouvrez votre propre village.');
    if (!FACADES[appearance.facade] || !GARDENS[appearance.garden] || !['mix','blue','red','green','yellow'].includes(appearance.roof)) return fail('Apparence inconnue.');
    b.appearance = { facade: appearance.facade, garden: appearance.garden, roof: appearance.roof };
    this.changed(); this.game.bus.emit('building:appearance',b); return { ok: true };
  }
  project(type) { return this.data.projects[type] || { phase: 0, readyAt: 0 }; }
  projectBuilding(type) {
    const w=this.game.world;
    if(this.projectVersion!==w.version || this.projectWorld!==w){this.projectWorld=w;this.projectVersion=w.version;this.projectBuildings=new Map([...w.buildings.values()].filter((b)=>PROJECTS[b.type]).map((b)=>[b.type,b]));}
    return this.projectBuildings.get(type);
  }
  completed(type) { return this.project(type).phase === 3 && !!this.projectBuilding(type) && !this.projectBuilding(type).cons; }
  startProject(type) {
    const rule = PROJECTS[type], p = this.project(type);
    if (!rule || !this.projectBuilding(type) || this.projectBuilding(type).cons) return fail('Posez d’abord le chantier du grand projet.');
    if (this.st.mode !== 'libre' && this.st.level < rule.level) return fail(`Niveau ${rule.level} requis.`);
    if (p.phase >= rule.phases.length || p.readyAt) return fail('Ce projet est déjà en chantier ou terminé.');
    const phase = rule.phases[p.phase];
    if (!this.pay(phase.cost)) return fail(this.game.actions.missingText(phase.cost));
    this.data.projects[type] = { ...p, readyAt: Date.now() + (this.st.mode === 'libre' ? 1000 : phase.seconds * 1000) };
    this.changed(); return { ok: true };
  }
  finishProject(type) {
    const p = this.project(type);
    if (!PROJECTS[type] || !p.readyAt || Date.now() < p.readyAt) return fail('Les travaux ne sont pas encore terminés.');
    const b = this.projectBuilding(type); if (!b) return fail('Replacez le chantier pour poursuivre le projet.');
    p.phase = Math.min(3, p.phase + 1); p.readyAt = 0; b.level = p.phase + 1;
    this.data.projects[type] = p;
    this.game.bus.emit('building:upgraded', b);
    this.game.prog.recount();
    this.game.prog.addXP(p.phase * 100, 'project'); this.changed(true); return { ok: true };
  }
  syncFamilies() {
    const houses = [...this.game.world.buildings.values()].filter((b) => BUILDINGS[b.type].residents && b.cons?.k !== 'new').sort((a,b) => a.id-b.id);
    while(this.data.families.length<Math.min(3,houses.length))this.data.families.push({family:this.data.families.length,house:null,chapter:0});
    const used=new Set();
    for(const f of this.data.families){if(!houses.some((b)=>b.id===f.house)||used.has(f.house))f.house=null;else used.add(f.house);}
    for(const f of this.data.families)if(!f.house){const home=houses.find((b)=>!used.has(b.id));f.house=home?.id||null;if(home)used.add(home.id);}
  }
  familyProgress(f) {
    const chapter = HOUSEHOLDS[f.family]?.chapters[f.chapter]; if (!chapter) return { cur: 1, target: 1, done: true, finished: true };
    let cur = 0;
    switch (chapter.kind) {
      case 'home': cur = this.game.world.buildings.get(f.house)?.level || 0; break;
      case 'building': cur = [...this.game.world.buildings.values()].filter((b) => b.type === chapter.type && !b.cons).length; break;
      case 'population': cur = Math.floor(this.game.sim.d.population); break;
      case 'deliveries': cur = this.data.delivered; break;
      case 'project': cur = this.completed(chapter.type) ? 1 : 0; break;
      case 'territory': cur = this.book.settlements[chapter.type] ? 1 : 0; break;
      case 'regionalDeliveries': cur = this.data.regionalDelivered; break;
    }
    return { cur, target: chapter.target, done: !!f.house && cur >= chapter.target, chapter };
  }
  claimStory(family) {
    const f = this.data.families.find((v) => v.family === family), result = f && this.familyProgress(f);
    if (!result?.done || result.finished) return fail('Cette histoire attend encore votre aide.');
    f.chapter++; this.game.actions.grant({ coins: result.chapter.reward.coins }); this.game.prog.addXP(result.chapter.reward.xp, 'family');
    const home = this.game.world.buildings.get(f.house); if (home) home.joy = this.st.time.day + 3;
    this.changed(); return { ok: true };
  }
  buffer(id, res) { return this.data.buffers[id]?.[res] || 0; }
  hasRoute(id) { return this.data.routes.some((r) => r.from === id); }
  productionRoom(b, res) { return this.hasRoute(b.id) ? Math.max(0, 120 - this.buffer(b.id,res)) : Infinity; }
  bufferProduction(b, res, amount) {
    if (!this.hasRoute(b.id)) return false;
    const store = this.data.buffers[b.id] ||= {};
    store[res] = (store[res] || 0) + Math.min(amount, this.productionRoom(b,res)); return true;
  }
  routePath(from, to, mode) {
    const w = this.game.world, a = w.buildings.get(from), b = w.buildings.get(to);
    if (!a || !b || a.cons?.k==='new' || b.cons?.k==='new') return null;
    const starts = w.perimeter(a).filter((i) => w.road[i]);
    const targets = w.perimeter(b).filter((i) => w.road[i]);
    for (const s of starts) for (const t of targets) {
      const p = roadPath(w,s,t);
      if (p && (mode !== 'truck' || p.every((i) => isPavedRoad(w.road[i])))) return p;
    }
    return null;
  }
  createRoute(from, to, mode) {
    const a = this.game.world.buildings.get(from), b = this.game.world.buildings.get(to);
    if (!a || !BUILDINGS[a.type]?.produces || a.type === 'townhall' || !b || b.type !== 'depot' || !['cart','truck'].includes(mode)) return fail('Choisissez un producteur, un Grand Entrepôt et un véhicule.');
    if (this.hasRoute(from) || this.data.routes.length >= 6) return fail('Une seule tournée par producteur, six tournées au maximum.');
    if (!this.routePath(from,to,mode)) return fail(mode === 'truck' ? 'Le camion exige une route entièrement carrossable.' : 'Reliez le producteur et l’entrepôt par une route.');
    this.data.routes.push({ from, to, mode }); this.changed(); return { ok: true };
  }
  removeRoute(from) {
    this.data.routes = this.data.routes.filter((r) => r.from !== from);
    const store = this.data.buffers[from] || {};
    for (const r of GOODS) this.st.res[r] += store[r] || 0;
    delete this.data.buffers[from]; // le stock en attente est rapatrié, jamais effacé
    for (const job of this.data.deliveries.filter((j) => j.from === from)) this.st.res[job.res] += job.qty;
    this.data.deliveries = this.data.deliveries.filter((j) => j.from !== from); this.changed(); return { ok: true };
  }
  localTick(dt) {
    const w = this.game.world;
    for (const r of [...this.data.routes]) {
      if (!w.buildings.has(r.from) || !w.buildings.has(r.to)) { this.removeRoute(r.from); continue; }
      if (this.data.deliveries.some((j) => j.from === r.from)) continue;
      const store = this.data.buffers[r.from] || {}, res = GOODS.find((v) => store[v] >= 1);
      if (!res) continue;
      const path = this.routePath(r.from,r.to,r.mode); if (!path) continue;
      const qty = Math.min(store[res],r.mode === 'truck' ? 60 : 20); store[res] -= qty;
      this.data.deliveries.push({ id: this.data.nextDelivery++, ...r, res, qty, path, progress: 0 });
    }
    for (const j of [...this.data.deliveries]) {
      // Une coupure de route suspend réellement la livraison.
      if (j.networkVersion !== w.version) { j.currentPath = this.routePath(j.from,j.to,j.mode); j.networkVersion = w.version; }
      const route = j.currentPath;
      if (!route) { j.blocked = true; continue; }
      j.blocked = false; j.path = route;
      j.progress = Math.min(1, j.progress + dt / Math.max(3, route.length * (j.mode === 'truck' ? .25 : .65)));
      if (j.progress < 1) continue;
      const room = this.st.mode === 'libre' ? Infinity : Math.max(0,this.game.sim.d.storage-this.st.res[j.res]);
      const n = Math.min(room,j.qty); if (!n) continue;
      this.st.res[j.res] += n; j.qty -= n;
      this.st.stats.produced[j.res] = (this.st.stats.produced[j.res] || 0) + n;
      if (this.st.stats.daily) this.st.stats.daily.produced[j.res] = (this.st.stats.daily.produced[j.res] || 0) + n;
      if (j.qty < 1e-6) { this.data.deliveries = this.data.deliveries.filter((v) => v !== j); this.data.delivered++; this.game.bus.emit('cargo:arrived',j); }
    }
  }
  unlockTerritory(id) {
    const rule = TERRITORIES[id]; if (!rule || id === 'home' || this.book.settlements[id]) return fail('Territoire déjà ouvert ou inconnu.');
    if (this.st.mode !== 'libre' && this.book.level < rule.level) return fail(`Un village de niveau ${rule.level} est requis.`);
    if (!this.pay(rule.cost)) return fail(this.game.actions.missingText(rule.cost));
    const state = createNewState({ name: rule.name, preset: rule.preset, mode: this.st.mode, seed: (this.st.seed+rule.seed)>>>0, slot: this.st.slot });
    state.city.districts[0].specialty=rule.specialty;
    state.city.districts[0].name=id==='island'?'Les Vergers':id==='mountain'?'Les Ateliers':'Le Rivage';
    delete state.regionBook; delete state.regionId;
    state.regionalClockAt = Date.now();
    this.book.settlements[id] = { name: rule.name, preset: rule.preset, snapshot: state };
    this.changed(); return { ok: true };
  }
  switchTerritory(id) {
    if (!this.game.playing || this.game.visit || this.game.isDemo) return fail('Ouvrez votre propre village.');
    const book = this.book, entry = book.settlements[id];
    if (!entry) return fail('Ce territoire n’est pas encore ouvert.');
    if (id === this.st.regionId) return { ok: true };
    this.regionalTick();
    this.st.regionalClockAt = Date.now();
    this.st.regionalReport = { ...this.st.regionalReport, transport: regionalTransportModes(this.game) };
    const snapshot = JSON.parse(serialize(this.game)); delete snapshot.regionBook; delete snapshot.regionId;
    book.settlements[this.st.regionId] = { name: this.st.name, preset: this.st.preset, snapshot };
    const target = entry.snapshot; if (!target) return fail('Ce territoire n’a pas encore de sauvegarde.');
    target.regionId = id; target.regionBook = book; target.slot = this.st.slot;
    entry.snapshot = null;
    this.game.ui?.closeScreen(); this.game.ui?.closeSheet(true);
    this.game.startState(target); return { ok: true };
  }
  shipmentCheck(from, to, res, amount, mode) {
    const rule = TRANSPORT[mode], book = this.book;
    if (!rule || !GOODS.includes(res) || !Number.isInteger(amount) || amount < 1 || amount > rule.capacity || to === from || !book.settlements[to] || !book.settlements[from]) return fail('Choisissez une destination ouverte et une quantité adaptée au véhicule.');
    if (book.shipments.filter((j) => !j.delivered).length >= 10) return fail('Dix expéditions peuvent voyager en même temps.');
    const source = from === this.st.regionId ? this.st : book.settlements[from].snapshot;
    if (!source) return fail('Le village de départ est indisponible.');
    const modes = from === this.st.regionId ? regionalTransportModes(this.game) : source.regionalReport?.transport || ['cart'];
    if (!modes.includes(mode)) return fail(mode === 'train' ? 'Une gare reliée aux routes est nécessaire au départ.' : 'Le Port des Explorateurs doit être terminé au départ.');
    const cost = { [res]: amount, coins: rule.fee };
    if (source.mode !== 'libre' && Object.entries(cost).some(([r,n]) => (source.res[r] || 0) < n)) return fail('Le village de départ manque de marchandises ou de pièces.');
    return { ok: true, source, cost, rule };
  }
  dispatchShipment(from, to, res, amount, mode, extra = {}) {
    const check = this.shipmentCheck(from,to,res,amount,mode); if (!check.ok) return check;
    if (check.source.mode !== 'libre') for (const [r,n] of Object.entries(check.cost)) check.source.res[r] -= n;
    const now = Date.now();
    const shipment = { id: this.book.nextShipment++, from, to, res, qty: amount, mode, sentAt: now, readyAt: now+check.rule.seconds*1000, ...extra };
    this.book.shipments.push(shipment); this.game.bus.emit('regional:departed',shipment); return { ok: true, shipment };
  }
  sendShipment(to, res, amount, mode) {
    const result = this.dispatchShipment(this.st.regionId,to,res,Number(amount),mode);
    if (result.ok) this.changed(); return result;
  }
  createTradeRoute(to, res, amount, mode, interval) {
    amount = Number(amount); interval = Number(interval);
    if (!TRADE_INTERVALS.includes(interval)) return fail('Choisissez une fréquence de 15, 30, 60 ou 120 minutes réelles.');
    if (this.book.tradeRoutes.length >= 8) return fail('Huit liaisons régulières sont possibles.');
    const check = this.shipmentCheck(this.st.regionId,to,res,amount,mode); if (!check.ok) return check;
    if (this.book.tradeRoutes.some(r => r.from === this.st.regionId && r.to === to && r.res === res)) return fail('Cette liaison existe déjà pour cette marchandise.');
    const route = { id: this.book.nextTradeRoute++, from: this.st.regionId, to, res, qty: amount, mode, interval, nextAt: Date.now(), sent: 0, enabled: true, status: 'Premier départ imminent' };
    this.book.tradeRoutes.push(route); this.changed(); return { ok: true, route };
  }
  toggleTradeRoute(id) {
    const r = this.book.tradeRoutes.find(r => r.id === id); if (!r) return fail('Liaison inconnue.');
    r.enabled = !r.enabled; r.nextAt = Date.now(); r.status = r.enabled ? 'Prochain départ imminent' : 'En pause';
    this.changed(); return { ok: true };
  }
  removeTradeRoute(id) {
    this.book.tradeRoutes = this.book.tradeRoutes.filter(r => r.id !== id); this.changed(); return { ok: true };
  }
  catchUpActive(state, now = Date.now()) {
    return advanceRegionalState(state,state.regionId || 'home',now,g => new CityDevelopment(g));
  }
  advanceAway(now = Date.now()) {
    for (const [id,entry] of Object.entries(this.book.settlements)) {
      if (id !== this.st.regionId && entry.snapshot) advanceRegionalState(entry.snapshot,id,now,g => new CityDevelopment(g));
    }
  }
  startExpedition(kind) {
    const rule = EXPEDITIONS[kind]; if (!rule) return fail('Contrat inconnu.');
    if (this.book.expeditions.some(e => e.kind === kind && !e.claimed)) return fail('Ce voyage est déjà en cours ou attend sa récompense.');
    if (!regionalTransportModes(this.game).includes(rule.mode)) return fail(rule.mode === 'train' ? 'Reliez une gare pour accepter ce contrat.' : 'Terminez le Port des Explorateurs pour ce contrat.');
    if (!this.pay(rule.cost)) return fail(this.game.actions.missingText(rule.cost));
    const e = { id: this.book.nextExpedition++, kind, from: this.st.regionId, sentAt: Date.now(), readyAt: Date.now()+rule.seconds*1000, claimed: false };
    this.book.expeditions.push(e); this.changed(); return { ok: true, expedition: e };
  }
  claimExpedition(id) {
    const e = this.book.expeditions.find(e => e.id === id), rule = e && EXPEDITIONS[e.kind];
    if (!rule || e.claimed || Date.now() < e.readyAt) return fail('Ce voyage n’est pas encore revenu ou sa récompense a déjà été reçue.');
    const target = e.from === this.st.regionId ? this.st : this.book.settlements[e.from]?.snapshot;
    if (!target) return fail('Retrouvez d’abord le village de départ.');
    for (const [r,n] of Object.entries(rule.reward)) if (r !== 'xp') target.res[r] = (target.res[r] || 0) + n;
    // L’XP est attribuée au village qui a financé le voyage.
    if (e.from === this.st.regionId) this.game.prog.addXP(rule.reward.xp || 0, 'expedition');
    else ensureCity(target).pendingExpeditionXP = (ensureCity(target).pendingExpeditionXP || 0) + (rule.reward.xp || 0);
    e.claimed = true; this.book.expeditions = this.book.expeditions.filter(j => !j.claimed || Date.now()-j.readyAt < 86400000).slice(-40);
    this.changed(); return { ok: true };
  }
  regionalTick() {
    const book = this.book, now = Date.now(); book.level = Math.max(book.level || 1,this.st.level);
    if(book.settlements[this.st.regionId])book.settlements[this.st.regionId].name=this.st.name;
    if (!this.lastRegionalAt || now-this.lastRegionalAt >= 60000) { this.advanceAway(now); this.lastRegionalAt = now; }
    for (const route of book.tradeRoutes) {
      if (!route.enabled || now < route.nextAt) continue;
      const result = this.dispatchShipment(route.from,route.to,route.res,route.qty,route.mode,{tradeRoute:route.id});
      route.nextAt = now + (result.ok ? route.interval*60000 : 60000);
      route.status = result.ok ? 'Convoi parti' : result.reason;
      if (result.ok) route.sent++;
    }
    for (const s of book.shipments) {
      if (s.delivered || Date.now() < s.readyAt) continue;
      const target = s.to === this.st.regionId ? this.st : book.settlements[s.to]?.snapshot;
      if (!target) continue;
      target.res[s.res] = (target.res[s.res] || 0) + s.qty;
      ensureCity(target).regionalDelivered++; s.delivered = true;
      this.game.bus.emit('regional:arrived',s); this.game.save?.();
    }
    book.shipments = book.shipments.filter((s) => !s.delivered || Date.now()-s.readyAt < 86400000).slice(-40);
  }
  tick(dt) {
    if (this.game.isDemo || this.game.visit) return;
    this.elapsed += dt;
    this.st.regionalClockAt = Date.now();
    if (this.data.pendingExpeditionXP) { const xp=this.data.pendingExpeditionXP;this.data.pendingExpeditionXP=0;this.game.prog.addXP(xp,'expedition'); }
    if (this.elapsed >= 1) { this.elapsed=0; this.syncFamilies(); this.regionalTick(); }
  }
}
