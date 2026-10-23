// Cœur du jeu (sans affichage) : état, monde, simulation, progression, actions.
import { EventBus } from './EventBus.js';
import { Simulation } from '../sim/Simulation.js';
import { Progression } from '../sim/Progression.js';
import { RandomEvents } from '../sim/RandomEvents.js';
import { Actions } from './Actions.js';
import { Villagers } from '../sim/Villagers.js';
import { Construction } from '../sim/Construction.js';
import { Requests } from '../sim/Requests.js';
import { World } from '../world/World.js';
import { generateMap, embedLegacy } from '../world/mapgen.js';
import { N, LEGACY_SIZE } from '../world/constants.js';
import { decodeBytes } from './save.js';
import { calendar } from './util.js';

export class GameCore {
  constructor(settings = {}) {
    this.bus = new EventBus();
    this.settings = settings;
    this.state = null;
    this.world = null;
    this.sim = new Simulation(this);
    this.prog = new Progression(this);
    this.events = new RandomEvents(this);
    this.actions = new Actions(this);
    this.villagers = new Villagers(this); // habitants au travail
    this.bus.on('building:removed', (b) => this.villagers.onBuildingRemoved(b));
    this.bus.on('building:moved', (b) => this.villagers.onBuildingMoved(b));
    this.bus.on('building:upgraded', (b) => this.villagers.onBuildingUpgraded(b));
    this.construction = new Construction(this); // chantiers et bâtisseurs
    this.bus.on('building:removed', (b) => this.construction.onRemoved(b));
    this.bus.on('building:moved', (b) => this.construction.onMoved(b));
    this.requests = new Requests(this); // demandes des habitants
    this.tool = { kind: 'select' };
    this.selection = null;
    this.isDemo = false;
  }

  loadState(state, { demo = false } = {}) {
    this.state = state;
    this.isDemo = demo;
    let gen;
    if (state.map?.legacy === 50 && state.map.terrain) {
      // ancienne carte 50 x 50 : recentrée, le nouveau monde pousse autour
      gen = generateMap(state.seed, state.preset, { legacy: true });
      const L2 = LEGACY_SIZE * LEGACY_SIZE;
      embedLegacy(gen, decodeBytes(state.map.terrain, L2), state.map.road ? decodeBytes(state.map.road, L2) : null, state.seed);
      delete state.map.legacy;
    } else {
      gen = generateMap(state.seed, state.preset);
      if (state.map?.terrain) gen.terrain = decodeBytes(state.map.terrain, N);
      gen.road = state.map?.road ? decodeBytes(state.map.road, N) : new Uint8Array(N);
    }
    this.world = new World(state, gen);
    this.selection = null;
    this.tool = { kind: 'select' };
    this.villagers.reset();
    this.construction.reset();
    this.sim.reset();
    this.actions.reset();
    this.prog.reset();
    this.sim.lastSeason = calendar(state.time.day).season;
    this.sim.lastDayInt = Math.floor(state.time.day);
    this.sim.recalc();
    this.bus.emit('game:loaded', state);
  }

  townhallLevel() {
    return this.world?.townhall()?.level || 1;
  }

  select(id) {
    if (this.selection === id) return;
    this.selection = id;
    this.bus.emit('selection', id);
  }

  setTool(tool) {
    this.tool = tool || { kind: 'select' };
    this.bus.emit('tool:changed', this.tool);
  }

  setSpeed(speed) {
    if (!this.state) return;
    this.state.time.speed = speed;
    this.bus.emit('speed:changed', speed);
  }
}
