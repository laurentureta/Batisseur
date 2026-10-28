// Le jeu complet (navigateur) : cœur + rendu 3D + interface + gestes + sons + sauvegarde.
import { GameCore } from './GameCore.js';
import { Renderer } from '../render/Renderer.js';
import { UI } from '../ui/UI.js';
import { Input } from '../input/Input.js';
import { Sound } from './audio.js';
import { Music, pickMood } from './music.js';
import { Cooperative } from '../net/Cooperative.js';
import { Notifications } from '../net/Notifications.js';
import { CloudSave } from '../net/CloudSave.js';
import { Online } from '../net/online.js';
import { stateFromSnapshot } from '../net/snapshot.js';
import { BOT, botState, populateBot, tickBotVisit, saveBotCity } from '../net/bot.js';
import { loadSettings, readSlot, writeSlot, serialize } from './save.js';
import { createNewState } from './state.js';
import { populateDemo } from './demo.js';
import { showWelcome } from '../ui/Panels.js';
import { DAY_SECONDS } from '../world/constants.js';
import { BUILDING_LIST } from '../data/buildings.js';
import { Meta } from './meta.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from './util.js';
import { VERSION } from '../version.js';
import { introWanted, playIntro } from '../ui/intro.js';

export class Game extends GameCore {
  constructor() {
    super(loadSettings());
    this.meta = new Meta(this);
    this.sound = new Sound(this.settings);
    this.music = new Music(this.sound, this.settings); // musique d'ambiance (jour, nuit, fêtes)
    this.online = new Online(this); // amis, visites, cadeaux
    this.cooperative = new Cooperative(this);
    this.notifications = new Notifications(this);
    this.cloud = new CloudSave(this);
    this.visit = null;
    this.onlineAcc = 0;
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
    const flush = () => {
      if (this.state?.botCity) saveBotCity(this);
      this.save({ flush: true });
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.hiddenAt = Date.now(); flush(); }
      else if (this.playing && this.hiddenAt && Date.now() - this.hiddenAt > 60000) {
        const st = readSlot(this.state.slot), cam = this.renderer.cam;
        if (st) {
          const view = { target: cam.target.clone(), distance: cam.distance, azimuth: cam.azimuth };
          this.startState(st);
          cam.target.copy(view.target); cam.distance = view.distance; cam.azimuth = view.azimuth;
        }
        this.hiddenAt = 0;
      }
      this.lastT = 0;
    });
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'notification:open') this.openNotification(event.data.url);
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
    this.openNotification(window.location.href);
    if (this.cloud.session) void this.cloud.check();
    if (new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery') setTimeout(() => this.ui.openCloud(), 600);
    // Après une mise à jour, le récapitulatif précède la cinématique et les cadeaux.
    if (this.settings.newsVersion !== VERSION) {
      setTimeout(() => this.greet(), 250);
      return;
    }
    // la première fois : la cinématique d'introduction, puis l'accueil
    if (introWanted(this)) {
      playIntro(this, { onDone: () => setTimeout(() => this.greet(), 700) });
      return;
    }
    // cadeau de bienvenue puis cadeau du jour
    setTimeout(() => this.greet(), 900);
  }

  /** Revoir la cinématique (depuis les réglages). */
  replayIntro() {
    if (this.playing) this.save();
    this.ui.closeSheet(true);
    this.toMainMenu();
    playIntro(this);
  }

  greet() {
    if (this.visit) { this.pendingGreeting = true; return; }
    if (this.settings.newsVersion !== VERSION) {
      this.ui.openNews({ automatic: true, onClose: () => setTimeout(() => this.greet(), 250) });
      return;
    }
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
    if (this.restoringCloud) return;
    if (document.documentElement.classList.contains('needs-landscape')) return;
    if (!this.world) return;
    this.input?.update(dt);
    if (this.playing) {
      if (!this.ui.photoActive) this.sim.update(dt);
      this.autosaveAcc += dt;
      if (this.autosaveAcc > 20) {
        this.autosaveAcc = 0;
        this.save();
      }
    } else if (this.state.botCity && this.visit) {
      tickBotVisit(this, dt);
    } else {
      const rate = this.demoRate ?? 0.6;
      this.state.time.day += (dt / DAY_SECONDS) * rate;
      this.villagers.demoTick(dt * rate); // le village du menu vit aussi
      this.construction.demoTick(dt * rate);
    }
    if (this.playing) {
      this.city.tick(dt); this.tourism.tick(dt); this.market.tick(dt);
      this.workshopAcc = (this.workshopAcc || 0) + dt;
      if (this.workshopAcc >= 1) { this.workshopAcc = 0; this.workshop.tick(); }
    }
    this.meta.tick(dt);
    this.renderer.frame(dt);
    this.ui.update(dt);
    this.sound.ambience(dt, this.renderer.night, this.renderer.cam.distance < 24);
    try {
      this.music.update(dt, pickMood(this));
    } catch (err) {
      console.warn('musique', err);
    }
    this.onlineAcc += dt;
    if (this.onlineAcc > 1) {
      this.onlineAcc = 0;
      this.online.tick();
    }
  }

  /**
   * Visite du village d'un ami : on enregistre sa partie, puis on affiche son village tel qu'il l'a
   * partagé (rien n'y est modifiable, rien n'est enregistré). « Rentrer » ramène chez soi.
   */
  async visitFriend(f) {
    if (this.state?.botCity) saveBotCity(this);
    let data;
    try {
      data = await this.online.village(f.id);
    } catch (err) {
      this.ui.toast(err.message, 'error');
      return;
    }
    if (!data?.snapshot && !data?.bot) {
      this.ui.toast(`${f.name} n'a pas encore partagé son village`, 'error');
      return;
    }
    let st;
    try {
      st = data.bot ? botState() : stateFromSnapshot(data.snapshot);
    } catch (err) {
      console.warn(err);
      this.ui.toast('Ce village ne peut pas être affiché', 'error');
      return;
    }
    const home = this.visit ? this.visit.home : this.playing && !this.isDemo ? this.state.slot : null;
    if (this.playing) this.save();
    this.playing = false;
    this.ui.closeScreen();
    this.ui.closeSheet(true);
    for (const m of [...this.ui.modalStack]) m._close();
    this.setTool({ kind: 'select' });
    this.ui.setLayer(null);
    this.loadState(st, { demo: true });
    if (data.bot) {
      // L’île achevée de Capucine reste disponible sans connexion.
      BOT.pop = populateBot(this.world);
      this.sim.recalc();
      data.pop = BOT.pop;
      data.level = st.level;
    }
    this.visit = { friend: { ...f, name: data.name || f.name, village: data.village || f.village, level: data.level, pop: data.pop, avatar: data.avatar }, home, at: data.snapshot_at };
    this.renderer.buildings.setTheme(st.cosmetics?.roof || 'mix');
    this.renderer.setWorld(this.world);
    this.renderer.cam.autoOrbit = 0;
    if (st.botCity?.camera) this.focusBotView(st.botCity.camera);
    this.ui.setPlayingUI(false);
    this.ui.start.hide();
    this.ui.showVisit(this.visit);
    this.sound.play('whoosh');
  }

  endVisit() {
    const v = this.visit;
    if (!v) return;
    if (this.state?.botCity) saveBotCity(this);
    this.visit = null;
    this.ui.hideVisit();
    if (v.home != null) this.continueGame(v.home);
    else this.toMainMenu();
    if (this.pendingGreeting) { this.pendingGreeting = false; setTimeout(() => this.greet(), 250); }
  }

  toMainMenu() {
    if (this.state?.botCity) saveBotCity(this);
    this.ui?.exitPhoto?.();
    if (this.visit) {
      this.visit = null;
      this.ui.hideVisit();
    }
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
    this.renderer.cam.distance = 26;
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
    if (this.state?.botCity) saveBotCity(this);
    this.ui?.exitPhoto?.();
    if (this.visit) {
      this.visit = null;
      this.ui.hideVisit();
    }
    this.city.catchUpActive(st);
    this.loadState(st);
    this.renderer.buildings.setTheme(st.cosmetics?.roof || 'mix');
    this.renderer.setWorld(this.world);
    this.renderer.cam.autoOrbit = 0;
    this.playing = true;
    this.workshop.tick();
    this.cooperative.restoreAdventureDecor?.();
    this.tourism.advance();
    this.autosaveAcc = 0;
    this.ui.start.hide();
    this.ui.setPlayingUI(true);
    this.setTool({ kind: 'select' });
    this.ui.refreshHud();
    this.renderer.refreshZoneLabels();
    this.renderer.refreshStatusLabels();
    this.save();
    if (this.online.me?.id) setTimeout(() => this.online.publish(true), 4000); // la photo du village pour les amis
    if (this.online.botGift()) setTimeout(() => this.playing && this.bus.emit('online:gift', 1, BOT.name), 6000); // le cadeau du jour de Capucine
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
    // les anciens entrepôts ont été regroupés dans le Grand Entrepôt
    if (st.flags.depotNotice) {
      delete st.flags.depotNotice;
      setTimeout(() => this.playing && this.ui.depotNotice(), 1600);
    }
    // jour de fête : petite annonce (une fois par événement)
    if (st.mode !== 'libre') setTimeout(() => this.playing && this.ui.eventIntro(), 1500);
  }

  save({ flush = false } = {}) {
    if (this.restoringCloud || !this.state || this.isDemo || !this.playing) return false;
    const saved = writeSlot(this.state.slot, serialize(this));
    if (saved) {
      this.saveWarned = false;
      if (flush) this.notifications.flush();
      else this.notifications.sync();
      this.cloud.sync();
    } else if (!this.saveWarned) {
      // Le stockage du téléphone est plein ou refusé : le joueur doit le savoir tout de suite.
      this.saveWarned = true;
      this.ui?.toast('⚠️ Sauvegarde impossible : le stockage du téléphone est plein. Libère de la place, ta partie n\'est plus enregistrée.', 'error');
    }
    return saved;
  }

  openNotification(value) {
    let url;
    try { url = new URL(value, window.location.href); } catch { return; }
    const base = new URL('./', window.location.href);
    if (url.origin !== base.origin || ![base.pathname, base.pathname + 'index.html'].includes(url.pathname)) return;
    const slot = url.searchParams.get('notificationSlot');
    if (!/^[0-2]$/.test(slot || '')) return;
    const state = readSlot(Number(slot));
    if (!state) return;
    if (this.playing) this.save();
    this.startState(state);
    url.searchParams.delete('notificationSlot');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  focusBotView(view) {
    if (!view?.target) return;
    const cam = this.renderer.cam;
    cam.target.set(view.target.x, 0, view.target.z);
    cam.distance = view.distance || 38;
    cam.azimuth = view.azimuth ?? 0.68;
    cam.autoOrbit = 0; cam.fly = null; cam.update(0);
  }
}
