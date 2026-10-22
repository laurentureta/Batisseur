// Le jeu complet (navigateur) : cœur + rendu 3D + interface + gestes + sons + sauvegarde.
import { GameCore } from './GameCore.js';
import { Renderer } from '../render/Renderer.js';
import { UI } from '../ui/UI.js';
import { Input } from '../input/Input.js';
import { Sound } from './audio.js';
import { loadSettings, readSlot, writeSlot, serialize } from './save.js';
import { createNewState } from './state.js';
import { populateDemo } from './demo.js';
import { showWelcome } from '../ui/Panels.js';
import { DAY_SECONDS } from '../world/constants.js';
import { BUILDING_LIST } from '../data/buildings.js';
import { Meta } from './meta.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from './util.js';

export class Game extends GameCore {
  constructor() {
    super(loadSettings());
    this.meta = new Meta(this);
    this.sound = new Sound(this.settings);
    this.playing = false;
    this.autosaveAcc = 0;
    this.lastT = 0;
  }

  init(root) {
    const canvas = root.querySelector('#scene');
    this.renderer = new Renderer(this, canvas, root.querySelector('#labels'));
    this.ui = new UI(this, root.querySelector('#ui'));
    this.input = new Input(this, canvas);
    document.addEventListener('pointerdown', () => this.sound.unlock(), true);
    const flush = () => this.save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
      this.lastT = 0;
    });
    // sauvegarde rapide après les gros changements
    for (const ev of ['building:upgraded', 'zone:unlocked', 'quest:claimed', 'level:up']) this.bus.on(ev, () => (this.autosaveAcc = Math.max(this.autosaveAcc, 17)));
    const loop = (t) => {
      const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0.016;
      this.lastT = t;
      try {
        this.update(dt);
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  boot() {
    this.toMainMenu();
    // cadeau de bienvenue puis cadeau du jour
    setTimeout(() => this.greet(), 900);
  }

  greet() {
    const meta = this.meta;
    const login = () => {
      if (!this.ui.showLogin({ onDone: () => this.ui.eventIntro() })) this.ui.eventIntro();
    };
    if (!meta.p.welcome) {
      meta.p.welcome = true;
      meta.save();
      this.ui.welcomeGift(login);
      return;
    }
    login();
  }

  update(dt) {
    if (!this.world) return;
    this.input?.update(dt);
    if (this.playing) {
      this.sim.update(dt);
      this.autosaveAcc += dt;
      if (this.autosaveAcc > 20) {
        this.autosaveAcc = 0;
        this.save();
      }
    } else {
      this.state.time.day += (dt / DAY_SECONDS) * 0.6;
    }
    this.meta.tick(dt);
    this.renderer.frame(dt);
    this.ui.update(dt);
    this.sound.ambience(dt, this.renderer.night, this.renderer.cam.distance < 24);
  }

  toMainMenu() {
    this.playing = false;
    this.ui.closeSheet(true);
    this.setTool({ kind: 'select' });
    this.ui.setLayer(null);
    const st = createNewState({ name: 'Démo', preset: 'vallee', mode: 'libre', seed: 20251021 });
    st.time.day = 0.42;
    st.time.speed = 1;
    this.loadState(st, { demo: true });
    populateDemo(this.world);
    this.sim.recalc();
    this.renderer.buildings.setTheme('mix');
    this.renderer.setWorld(this.world);
    this.renderer.cam.distance = 30;
    this.renderer.cam.autoOrbit = 0.04;
    this.ui.setPlayingUI(false);
    this.ui.start.show();
  }

  newGame(opts) {
    const st = createNewState(opts);
    this.startState(st);
  }

  continueGame(slot) {
    const st = readSlot(slot);
    if (!st) {
      this.ui.toast('Sauvegarde introuvable', 'error');
      return;
    }
    this.startState(st);
  }

  startState(st) {
    this.loadState(st);
    this.renderer.buildings.setTheme(st.cosmetics?.roof || 'mix');
    this.renderer.setWorld(this.world);
    this.renderer.cam.autoOrbit = 0;
    this.playing = true;
    this.autosaveAcc = 0;
    this.ui.start.hide();
    this.ui.setPlayingUI(true);
    this.setTool({ kind: 'select' });
    this.ui.refreshHud();
    this.renderer.refreshZoneLabels();
    this.renderer.refreshStatusLabels();
    this.save();
    this.renderer.thumbs.warmup(BUILDING_LIST.filter((d) => !d.notBuildable && this.prog.isUnlocked(d.id)).map((d) => d.id));
    // ressources gagnées depuis le menu (coffres, passe, boutique)
    const given = this.meta.deliverBank();
    if (given) {
      const txt = Object.entries(given).map(([k, v]) => `${RESOURCES[k]?.icon || ''} ${fmt(v)}`).join('  ');
      setTimeout(() => this.ui.toast(`📦 Livraison du maire : ${txt}`, 'good'), 1200);
    }
    this.ui.refreshMeta();
    if (!st.flags.welcome) {
      st.flags.welcome = true;
      showWelcome(this.ui);
    }
    // jour de fête : petite annonce (une fois par événement)
    if (st.mode !== 'libre') setTimeout(() => this.playing && this.ui.eventIntro(), 1500);
  }

  save() {
    if (!this.state || this.isDemo || !this.playing) return false;
    return writeSlot(this.state.slot, serialize(this));
  }
}
