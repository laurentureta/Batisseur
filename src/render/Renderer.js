// Moteur de rendu : scène Three.js, lumière, vues du monde, effets et étiquettes.
import * as THREE from 'three';
import { CameraController } from './CameraController.js';
import { Sky } from './Sky.js';
import { TerrainView } from './TerrainView.js';
import { RoadView } from './RoadView.js';
import { BuildingView, buildingCenter } from './BuildingView.js';
import { Agents } from './Agents.js';
import { Particles } from './Particles.js';
import { Overlays } from './Overlays.js';
import { Labels } from './Labels.js';
import { Thumbnails } from './Thumbnails.js';
import { Clouds } from './Clouds.js';
import { SIZE } from '../world/constants.js';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { calendar } from '../core/util.js';

const HALF = SIZE / 2;

export class Renderer {
  constructor(game, canvas, labelRoot) {
    this.game = game;
    this.canvas = canvas;
    this.quality = this.pickQuality(game.settings.quality);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality !== 'low',
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 260);
    this.cam = new CameraController(this.camera, canvas);
    this.sky = new Sky(this);
    this.terrain = new TerrainView(this);
    this.roads = new RoadView(this);
    this.buildings = new BuildingView(this);
    this.agents = new Agents(this);
    this.particles = new Particles();
    this.overlays = new Overlays(this);
    this.labels = new Labels(labelRoot, this.camera, canvas);
    this.thumbs = new Thumbnails(this.renderer);
    this.clouds = new Clouds();
    this.clouds.build();
    this.scene.add(this.terrain.group, this.roads.group, this.buildings.group, this.agents.group, this.particles.group, this.overlays.group, this.clouds.group);
    this.world = null;
    this.season = 1;
    this.emitAcc = 0;
    this.night = 0;
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.bindEvents();
    this.frameSkip = 0;
    this.perf = { acc: 0, n: 0, slow: 0 };
  }

  /** Qualité automatique : si l'appareil peine, on baisse d'un cran (ombres, définition). */
  watchPerf(dt) {
    if (this.game.settings.quality !== 'auto' || this.quality === 'low' || document.hidden) return;
    if (dt >= 0.099) return; // reprise après une pause
    const p = this.perf;
    p.acc += dt;
    p.n++;
    if (p.acc < 3) return;
    const avg = p.acc / p.n;
    p.acc = 0;
    p.n = 0;
    p.slow = avg > 0.032 ? p.slow + 1 : 0;
    if (p.slow >= 2) {
      p.slow = 0;
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      this.applyQuality();
      this.resize();
      console.info('Qualité graphique ajustée :', this.quality);
    }
  }

  pickQuality(q) {
    if (q && q !== 'auto') return q;
    const dpr = window.devicePixelRatio || 1;
    const mem = navigator.deviceMemory || 4;
    if (mem <= 2) return 'low';
    return dpr >= 2 ? 'high' : 'medium';
  }

  setQuality(q) {
    this.quality = this.pickQuality(q);
    this.applyQuality();
    this.resize();
  }

  applyQuality() {
    const q = this.quality;
    const shadows = q === 'high' ? 2048 : q === 'medium' ? 1024 : 0;
    this.renderer.shadowMap.enabled = shadows > 0;
    this.sky.setShadowQuality(shadows);
    this.particles.enabled = q !== 'low';
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const maxDpr = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // en portrait on recule un peu pour voir plus large
    this.camera.fov = w < h ? 44 : 36;
    this.camera.updateProjectionMatrix();
    const scale = (h * dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.particles.setScale(scale);
  }

  bindEvents() {
    const bus = this.game.bus;
    bus.on('building:placed', (b, opts = {}) => {
      this.buildings.onPlaced(b, opts);
      if (!opts.undo) this.puff(b, 'dust', 18);
    });
    bus.on('building:removed', (b, opts = {}) => {
      this.buildings.onRemoved(b);
      this.puff(b, opts.burnt ? 'smoke' : 'dust', opts.burnt ? 30 : 22);
      if (this.game.selection == null) this.overlays.setSelection(null);
      this.labels.remove('st' + b.id);
      this.labels.remove('up' + b.id);
    });
    bus.on('building:upgraded', (b, opts = {}) => {
      this.buildings.onUpgraded(b, opts);
      if (!opts.undo) this.puff(b, 'sparkle', 30);
      if (this.game.selection === b.id) this.overlays.setSelection(b);
    });
    bus.on('building:moved', (b) => {
      this.buildings.onMoved(b);
      this.puff(b, 'dust', 14);
      if (this.game.selection === b.id) this.overlays.setSelection(b);
    });
    bus.on('roads:changed', (tiles) => {
      this.roads.markTiles(tiles);
      this.roads.flush();
      this.agents.validate();
    });
    bus.on('terrain:changed', () => {
      this.terrain.buildLand();
      this.terrain.buildTrees();
    });
    bus.on('zone:unlocked', (zi) => {
      this.terrain.rebuildAll(this.season);
      this.updateBounds();
      const r = this.world.zoneRect(zi);
      for (let k = 0; k < 40; k++) this.particles.emit('sparkle', r.x + Math.random() * r.w - HALF, 0.3, r.z + Math.random() * r.h - HALF, 1);
      this.cam.flyTo(r.x + r.w / 2 - HALF, r.z + r.h / 2 - HALF, Math.max(this.cam.distance, 26), 0.9);
      this.refreshZoneLabels();
    });
    bus.on('selection', (id) => {
      const b = id != null ? this.world?.buildings.get(id) : null;
      this.overlays.setSelection(b);
      this.showCoverageFor(b);
    });
    bus.on('season:changed', (s) => this.setSeason(s));
    bus.on('weather:changed', (k) => (this.sky.weather = k));
    bus.on('sim:recalc', () => {
      const now = performance.now();
      if (now - (this.lastStatusRefresh || 0) > 500) {
        this.lastStatusRefresh = now;
        this.refreshStatusLabels();
      }
    });
    bus.on('level:up', () => this.refreshZoneLabels());
    bus.on('fire:start', (b) => this.refreshStatusLabels());
    bus.on('xp', () => {});
  }

  setWorld(world) {
    this.world = world;
    this.season = calendar(this.game.state.time.day).season;
    this.sky.weather = this.game.state.weather?.kind || 'clear';
    this.terrain.dispose();
    this.terrain.build(world, this.season);
    this.roads.build(world, this.season);
    this.buildings.setWorld(world, this.season);
    this.agents.setWorld(world, this.game.sim);
    this.particles.clear();
    this.overlays.setSelection(null);
    this.overlays.hideGhost();
    this.overlays.clearRoadPreview();
    this.overlays.hideRadius();
    this.overlays.clearLayer();
    this.labels.clear();
    this.updateBounds();
    const th = world.townhall();
    if (th) {
      const c = buildingCenter(th);
      this.cam.target.set(c.cx, 0, c.cz + 1);
    }
    this.cam.distance = 20;
    this.cam.azimuth = Math.PI / 4;
    this.cam.vel.set(0, 0);
    this.cam.fly = null;
    this.cam.update(0);
    this.refreshZoneLabels();
    this.refreshStatusLabels();
  }

  setSeason(s) {
    if (s === this.season) return;
    this.season = s;
    this.terrain.rebuildAll(s);
    this.roads.season = s;
    this.roads.markAll();
    this.roads.flush();
    this.buildings.setSeason(s);
  }

  updateBounds() {
    const b = this.world.unlockedBounds();
    this.cam.setBounds({ x0: b.x0 - HALF, z0: b.z0 - HALF, x1: b.x1 - HALF, z1: b.z1 - HALF });
    if (this.gridVisible) this.overlays.showGrid(b);
  }

  setGrid(visible) {
    this.gridVisible = visible;
    this.overlays.showGrid(visible ? this.world.unlockedBounds() : null);
  }

  /* ───────── Étiquettes ───────── */
  refreshZoneLabels() {
    if (!this.world) return;
    const game = this.game;
    const keep = new Set();
    if (!game.isDemo && game.state.mode !== 'libre' && game.playing) {
      for (const zi of game.prog.purchasableZones()) {
        const info = game.prog.zoneInfo(zi);
        const r = this.world.zoneRect(zi);
        const key = 'zone' + zi;
        keep.add(key);
        const locked = game.state.level < info.levelReq;
        const html = `<div class="zone-tag ${locked ? 'locked' : info.ok ? 'ok' : ''}"><span class="lock">🔒</span><span class="zname">${info.name}</span><span class="zprice">${locked ? 'Niv. ' + info.levelReq : '🪙 ' + info.cost.coins.toLocaleString('fr-FR')}</span></div>`;
        this.labels.set(key, {
          x: r.x + r.w / 2 - HALF, y: 0.6, z: r.z + r.h / 2 - HALF, html, cls: 'zone',
          onTap: () => game.ui.openZone(zi),
        });
      }
    }
    this.labels.removePrefix('zone', keep);
  }

  refreshStatusLabels() {
    if (!this.world) return;
    const game = this.game;
    const keep = new Set();
    if (game.playing && !game.isDemo) {
      const icons = { noRoad: '🚧', noResource: '❓', noWorkers: '👷', noInput: '⏳', full: '📦', fire: '🔥', unpaid: '💸' };
      const showUp = game.settings.upgradeHints && game.state.mode !== 'libre';
      let upCount = 0;
      for (const b of this.world.buildings.values()) {
        const inf = game.sim.info.get(b.id);
        if (!inf) continue;
        const icon = icons[inf.status];
        const def = BUILDINGS[b.type];
        const box = this.buildings.boxes.get(b.id);
        const y = box ? box.max.y + 0.15 : 0.8;
        const c = buildingCenter(b);
        if (icon) {
          const key = 'st' + b.id;
          keep.add(key);
          this.labels.set(key, {
            x: c.cx, y, z: c.cz, html: `<div class="bubble ${inf.status}">${icon}</div>`, cls: 'status', maxDist: 70,
            onTap: () => game.select(b.id),
          });
        } else if (showUp && upCount < 40 && def.residents && b.level < def.maxLevel) {
          const chk = game.actions.checkUpgrade(b);
          if (chk.ok) {
            upCount++;
            const key = 'up' + b.id;
            keep.add(key);
            this.labels.set(key, {
              x: c.cx, y, z: c.cz, html: '<div class="bubble up">⬆️</div>', cls: 'status', maxDist: 40,
              onTap: () => game.select(b.id),
            });
          }
        }
      }
    }
    this.labels.removePrefix('st', keep);
    this.labels.removePrefix('up', keep);
  }

  /* ───────── Effets ───────── */
  puff(b, kind, n) {
    const c = buildingCenter(b);
    for (let k = 0; k < n; k++) this.particles.emit(kind, c.cx + (Math.random() - 0.5) * c.w * 0.8, 0.12 + Math.random() * 0.3, c.cz + (Math.random() - 0.5) * c.d * 0.8, 1);
  }

  floatText(b, text) {
    const c = buildingCenter(b);
    const box = this.buildings.boxes.get(b.id);
    const key = 'ft' + Math.random().toString(36).slice(2);
    this.labels.set(key, { x: c.cx, y: (box ? box.max.y : 0.5) + 0.2, z: c.cz, html: `<div class="float-text">${text}</div>`, cls: 'float' });
    setTimeout(() => this.labels.remove(key), 1400);
  }

  showCoverageFor(b) {
    if (!b) {
      this.overlays.hideRadius();
      return;
    }
    const def = BUILDINGS[b.type];
    if (!def.coverage) {
      this.overlays.hideRadius();
      return;
    }
    const [w, d] = sizeOf(def, b.rot);
    const r = def.coverage.radius[Math.min(b.level, def.coverage.radius.length) - 1];
    this.overlays.showRadius(b.x + w / 2, b.z + d / 2, r, COVER_COLORS[def.coverage.need] || 0x64b5f6);
  }

  emitAmbient(dt) {
    const game = this.game;
    const sim = game.sim;
    this.emitAcc += dt;
    if (this.emitAcc < 0.12) return;
    const step = this.emitAcc;
    this.emitAcc = 0;
    const speed = game.state?.time.speed ?? 1;
    // fumées et fontaines
    for (const [id, list] of this.buildings.emitters) {
      const b = this.world.buildings.get(id);
      if (!b) continue;
      const inf = sim.info.get(id);
      for (const e of list) {
        if (e.kind === 'water') {
          if (this.season !== 3) this.particles.emit('water', e.x, e.y, e.z, 2);
        } else {
          const def = BUILDINGS[b.type];
          const active = def.residents ? (b.residents || 0) >= 1 && (this.season === 3 || this.night > 0.3 || Math.random() < 0.35) : inf && inf.eff > 0;
          if (active && speed > 0 && Math.random() < 0.55) this.particles.emit('smoke', e.x, e.y, e.z, 1, { scale: def.residents ? 0.7 : 1.1 });
        }
      }
    }
    // incendies
    for (const b of this.world.buildings.values()) {
      if (!b.fire) continue;
      const c = buildingCenter(b);
      const box = this.buildings.boxes.get(b.id);
      const h = box ? box.max.y : 0.5;
      this.particles.emit('fire', c.cx + (Math.random() - 0.5) * c.w * 0.6, h * (0.4 + Math.random() * 0.6), c.cz + (Math.random() - 0.5) * c.d * 0.6, 3);
      this.particles.emit('smoke', c.cx, h + 0.1, c.cz, 1, { scale: 1.6, color: [0.35, 0.35, 0.38] });
    }
    // météo
    const kind = this.sky.weather;
    if ((kind === 'rain' || kind === 'snow') && this.quality !== 'low') {
      const t = this.cam.target;
      const r = Math.min(26, this.cam.distance * 0.9);
      const n = Math.round((kind === 'rain' ? 26 : 12) * (step / 0.12));
      for (let k = 0; k < n; k++) this.particles.emit(kind, t.x + (Math.random() - 0.5) * r * 2, kind === 'rain' ? 7 : 6, t.z + (Math.random() - 0.5) * r * 2, 1);
    }
  }

  /* ───────── Sélection à l'écran ───────── */
  pickTile(cx, cy) {
    const p = this.cam.screenToGround(cx, cy);
    if (!p) return null;
    const fx = p.x + HALF, fz = p.z + HALF;
    return { x: Math.floor(fx), z: Math.floor(fz), fx, fz };
  }

  pickBuilding(cx, cy) {
    const ray = this.cam.rayFrom(cx, cy);
    return this.buildings.pick(ray);
  }

  focusBuilding(b, distance) {
    const c = buildingCenter(b);
    this.cam.flyTo(c.cx, c.cz, distance ?? Math.min(this.cam.distance, 18), 0.6);
  }

  /* ───────── Boucle ───────── */
  frame(dt) {
    if (!this.world) return;
    this.watchPerf(dt);
    const game = this.game;
    const st = game.state;
    const hour = calendar(st.time.day).hour;
    this.cam.update(dt);
    const span = Math.min(40, this.cam.distance * 1.1 + 6);
    const sky = this.sky.update(hour, this.cam.target, span, dt);
    this.night = sky.night;
    this.terrain.update(dt);
    this.clouds.update(dt, sky.night, this.sky.weather);
    this.roads.update(sky.night);
    this.buildings.update(dt, sky.night, st.time.speed);
    this.agents.update(dt, st.time.speed, sky.night, game.sim.d.population);
    this.emitAmbient(dt);
    this.particles.update(dt);
    this.overlays.update(dt);
    if (this.quality === 'low') {
      this.frameSkip ^= 1;
      if (this.frameSkip) {
        this.labels.update();
        return;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.update();
  }
}

export const COVER_COLORS = {
  water: 0x4fc3f7,
  commerce: 0xffb74d,
  leisure: 0x81c784,
  education: 0x9575cd,
  health: 0xe57373,
  security: 0x5c6bc0,
  fire: 0xff7043,
};
