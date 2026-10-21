// Événements : météo, fêtes, récoltes, marchand ambulant et incendies.
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { FEATURES } from '../data/progression.js';
import { RESOURCES } from '../data/resources.js';
import { calendar, round5 } from '../core/util.js';

export const WEATHER = {
  clear: { name: 'Beau temps', icon: '☀️' },
  cloudy: { name: 'Nuageux', icon: '⛅' },
  rain: { name: 'Pluie', icon: '🌧️' },
  snow: { name: 'Neige', icon: '🌨️' },
};

const WEATHER_TABLE = [
  [['clear', 55], ['cloudy', 25], ['rain', 20]],
  [['clear', 75], ['cloudy', 15], ['rain', 10]],
  [['clear', 45], ['cloudy', 30], ['rain', 25]],
  [['clear', 40], ['cloudy', 25], ['snow', 35]],
];

export const EVENT_INFO = {
  fete: { name: 'Fête du village', icon: '🎉', desc: 'Impôts +50 % et bonheur en hausse aujourd\'hui !' },
  harvest: { name: 'Récolte exceptionnelle', icon: '🌾', desc: 'Les fermes produisent deux fois plus aujourd\'hui.' },
  drought: { name: 'Sécheresse', icon: '🥵', desc: 'Les fermes produisent moitié moins aujourd\'hui.' },
};

export class RandomEvents {
  constructor(game) {
    this.game = game;
  }

  get st() {
    return this.game.state;
  }

  modifiers() {
    let farm = 1, taxes = 1, happiness = 0;
    const st = this.st;
    if (st) {
      for (const e of st.events.active) {
        if (e.kind === 'fete') {
          taxes *= 1.5;
          happiness += 0.08;
        } else if (e.kind === 'harvest') farm *= 2;
        else if (e.kind === 'drought') farm *= 0.5;
      }
      if (st.weather.kind === 'rain') farm *= 1.1;
    }
    return { farm, taxes, happiness };
  }

  onNewDay(day) {
    const st = this.st;
    const game = this.game;
    st.events.active = st.events.active.filter((e) => e.until > day);
    if (st.events.merchant && st.events.merchant.until <= day) st.events.merchant = null;

    // Météo
    const cal = calendar(day);
    const table = WEATHER_TABLE[cal.season];
    let roll = Math.random() * 100;
    let kind = 'clear';
    for (const [k, p] of table) {
      if (roll < p) {
        kind = k;
        break;
      }
      roll -= p;
    }
    st.weather = { kind, day };
    game.bus.emit('weather:changed', kind);

    if (st.mode === 'libre' || st.level < FEATURES.events.level) return;

    const hasFarms = game.prog.countType('farm') > 0;
    if (game.sim.d.happiness >= 0.68 && game.sim.d.population >= 20 && Math.random() < 0.07) this.start('fete', day);
    if (cal.season === 1 && hasFarms) {
      if (Math.random() < 0.15) this.start('harvest', day);
      else if (Math.random() < 0.07) this.start('drought', day);
    }
    if (st.level >= 5 && !st.events.merchant && Math.random() < 0.18) this.makeMerchant(day);

    // Incendies
    if (game.settings.fires && st.level >= FEATURES.fires.level) {
      for (const b of game.world.buildings.values()) {
        const def = BUILDINGS[b.type];
        if (b.fire || b.type === 'townhall' || def.cat === 'decor' || def.cat === 'monuments') continue;
        let p = def.pollution ? 0.003 : 0.0015;
        if (this.isCovered(b)) p *= 0.25;
        if (Math.random() < p) this.ignite(b);
      }
    }
  }

  start(kind, day) {
    const st = this.st;
    if (st.events.active.some((e) => e.kind === kind)) return;
    const e = { kind, until: Math.floor(day) + 1 };
    st.events.active.push(e);
    this.game.sim.markDirty();
    this.game.bus.emit('event:start', e, EVENT_INFO[kind]);
  }

  makeMerchant(day) {
    const st = this.st;
    const goods = Object.keys(st.res).filter((r) => r !== 'coins' && st.res[r] >= 40);
    if (!goods.length) return;
    const give = goods[Math.floor(Math.random() * goods.length)];
    const wanted = ['planks', 'bricks', 'tools', 'stone', 'food', 'wood'].filter((r) => r !== give);
    const get = Math.random() < 0.35 ? 'coins' : wanted[Math.floor(Math.random() * wanted.length)];
    const giveQty = round5(Math.min(st.res[give] * 0.5, 30 + st.level * 12));
    const value = giveQty * RESOURCES[give].value * (1.3 + Math.random() * 0.5);
    const getQty = Math.max(5, get === 'coins' ? round5(value) : round5(value / RESOURCES[get].value));
    st.events.merchant = { give, giveQty, get, getQty, until: Math.floor(day) + 1 };
    this.game.bus.emit('merchant:arrived', st.events.merchant);
  }

  acceptMerchant() {
    const st = this.st;
    const m = st.events.merchant;
    if (!m || (st.res[m.give] || 0) < m.giveQty) return false;
    st.res[m.give] -= m.giveQty;
    st.res[m.get] = (st.res[m.get] || 0) + m.getQty;
    st.events.merchant = null;
    this.game.bus.emit('merchant:done');
    return true;
  }

  isCovered(b) {
    const world = this.game.world;
    const [w, d] = sizeOf(BUILDINGS[b.type], b.rot);
    const i = world.idx(b.x + (w >> 1), b.z + (d >> 1));
    return this.game.sim.cov.fire[i] >= 0.5;
  }

  ignite(b) {
    const day = this.st.time.day;
    b.fire = { start: day, covered: this.isCovered(b) };
    this.game.sim.markDirty();
    this.game.bus.emit('fire:start', b);
  }

  tick() {
    const world = this.game.world;
    if (!world) return;
    const day = this.st.time.day;
    let burnt = null;
    for (const b of world.buildings.values()) {
      if (!b.fire) continue;
      const age = day - b.fire.start;
      if (b.fire.covered && age > 0.12) this.extinguish(b, false);
      else if (!b.fire.covered && age > 0.5) burnt = b;
    }
    if (burnt) this.burnDown(burnt);
  }

  extinguish(b, paid) {
    b.fire = null;
    this.st.stats.firesOut++;
    this.game.sim.markDirty();
    this.game.bus.emit('fire:out', b, paid);
  }

  burnDown(b) {
    const world = this.game.world;
    world.removeBuilding(b.id);
    this.game.sim.markDirty();
    if (this.game.selection === b.id) this.game.select(null);
    this.game.bus.emit('building:removed', b, { burnt: true });
    this.game.bus.emit('fire:burnt', b);
  }
}
