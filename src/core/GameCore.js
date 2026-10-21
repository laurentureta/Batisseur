// Cœur du jeu (sans affichage) : état, monde, simulation, progression, actions.
import { EventBus } from './EventBus.js';
import { Simulation } from '../sim/Simulation.js';
import { Progression } from '../sim/Progression.js';
import { RandomEvents } from '../sim/RandomEvents.js';
import { Actions } from './Actions.js';
import { World } from '../world/World.js';
import { generateMap } from '../world/mapgen.js';
import { N } from '../world/constants.js';
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
    this.tool = { kind: 'select' };
    this.selection = null;
    this.isDemo = false;
  }

  loadState(state, { demo = false } = {}) {
    this.state = state;
    this.isDemo = demo;
    const gen = generateMap(state.seed, state.preset);
    if (state.map?.terrain) gen.terrain = decodeBytes(state.map.terrain, N);
    gen.road = state.map?.road ? decodeBytes(state.map.road, N) : new Uint8Array(N);
    this.world = new World(state, gen);
    this.selection = null;
    this.tool = { kind: 'select' };
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
