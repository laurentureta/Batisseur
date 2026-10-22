// Les habitants en 3D : des personnages articulés (tête et visage, cheveux ou chapeau, torse, bras,
// mains, jambes, outils, charges) animés selon ce qu'ils font vraiment dans la simulation :
// marcher, porter des bûches, abattre un arbre, débiter le tronc, bêcher, semer, arroser,
// récolter, déposer, se reposer. Chaque pièce est un maillage en instances : quelques appels
// de dessin pour tout le village. Seuls les habitants proches de la caméra sont dessinés.
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { DAY_SECONDS, SIZE, T } from '../world/constants.js';
import { workerPos, WALK, doorOf } from '../sim/Villagers.js';
import { roadPath, roadNextTo, roadPoints, makeMove, moveAt } from '../sim/paths.js';
import { hash2 } from '../core/rng.js';

const MAX = 240;
const HALF = SIZE / 2;
const W = 0xffffff;

export const SKINS = [0xf2c9a6, 0xe8b48a, 0xc98b62, 0x8d5a3b, 0xf6d7c0];
const HAIRS = [0x3a2618, 0x6b4426, 0xb5793a, 0x1e1a18, 0xd9b26a, 0x8a3b22];
const SHIRTS = [0xe94b5a, 0x3f7fd1, 0x4caf50, 0xf2c94c, 0x9b6bd1, 0xf08b3a, 0x2a9d8f, 0xf4f1ea, 0x455a64, 0xd81b60];
const PANTS = [0x3a4a6a, 0x5a4636, 0x2f3b4a, 0x6a5a3a, 0x3a3a40];

/** Tenues des métiers : chemise, pantalon, chapeau (couleur ou null), outil habituel. */
const OUTFITS = {
  lumberjack: { shirt: [0xc0392b, 0xa93226, 0x7b241c], pants: [0x34495e, 0x3a4a6a], hat: 'beanie', hatColor: [0x2e5e3a, 0xc0392b, 0x34495e] },
  gardener: { shirt: [0x6aa84f, 0x8bc34a, 0x4e8a3a], pants: [0x5a4636, 0x6a5a3a], hat: 'straw' },
  farmer: { shirt: [0xf2ead8, 0xe8d8b0, 0xd9c08a], pants: [0x2f5fa0, 0x3b6fb6], hat: 'straw' },
  miner: { shirt: [0x7a7a7a, 0x6d6d70], pants: [0x4a4a4a], hat: 'helmet', hatColor: [0xf2c94c] },
  fisher: { shirt: [0x2a9d8f, 0x1f7a8c], pants: [0x3a4a6a], hat: 'cap', hatColor: [0xf08b3a, 0xf2c94c] },
  craftsman: { shirt: [0x8d6e63, 0x795548], pants: [0x3a3a40] },
  cook: { shirt: [0xf7f4ee], pants: [0x3a3a40], hat: 'cap', hatColor: [0xffffff] },
  firefighter: { shirt: [0xd32f2f], pants: [0x2b2b30], hat: 'helmet', hatColor: [0xd32f2f] },
  guard: { shirt: [0x283593], pants: [0x1f2a5a], hat: 'cap', hatColor: [0x1f2a5a] },
  teacher: { shirt: [0x5c6bc0, 0x8e7cc3], pants: [0x3a3a40] },
  doctor: { shirt: [0xf4f8fb], pants: [0x4a90c2] },
};

/* ───────── Pièces du personnage ───────── */
/** Sphère (latitudes, longitudes) : une tête bien ronde. */
function sphere(g, x, y, z, r, color, sy = 1, lon = 10, lat = 7) {
  const p = (i, j) => {
    const th = (j / lat) * Math.PI, ph = (i / lon) * Math.PI * 2;
    return [x + r * Math.sin(th) * Math.sin(ph), y + r * Math.cos(th) * sy, z + r * Math.sin(th) * Math.cos(ph)];
  };
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (j === 0) g.tri(a, d, c, color);
      else if (j === lat - 1) g.tri(a, d, b, color);
      else g.quad(a, d, c, b, color);
    }
  }
}

function buildParts() {
  const P = {};
  const add = (name, fn, opts = {}) => {
    const g = new GeoBuilder();
    fn(g);
    P[name] = { geo: toGeometry(g.body), ...opts };
  };
  add('leg', (g) => {
    g.box(0, -0.068, 0, 0.019, 0.068, 0.021, W);
    g.box(0, -0.076, 0.004, 0.021, 0.012, 0.03, 0x4a3a30);
  }, { tint: 'pants', shadow: true });
  add('torso', (g) => {
    g.box(0, -0.004, 0, 0.046, 0.042, 0.028, W);
    g.box(0, 0.036, 0, 0.053, 0.042, 0.031, W);
    g.box(0, 0.077, 0, 0.018, 0.008, 0.018, 0xe8b48a); // cou
  }, { tint: 'shirt', shadow: true });
  add('belt', (g) => g.box(0, -0.004, 0, 0.048, 0.008, 0.03, 0x5a3a22));
  add('head', (g) => {
    sphere(g, 0, 0.035, 0, 0.034, W, 1.04);
    g.box(0, 0.026, 0.031, 0.009, 0.011, 0.01, W); // nez
    for (const s of [-1, 1]) g.box(s * 0.034, 0.033, 0, 0.006, 0.012, 0.01, W); // oreilles
  }, { tint: 'skin', shadow: true });
  add('eyes', (g) => {
    for (const s of [-1, 1]) {
      g.box(s * 0.0125, 0.034, 0.0322, 0.007, 0.0095, 0.006, 0x26201c);
      g.box(s * 0.0125 + s * 0.0012, 0.0372, 0.0352, 0.0026, 0.003, 0.0016, 0xffffff);
    }
    g.box(0, 0.015, 0.0318, 0.012, 0.0035, 0.004, 0xa0524a); // bouche
  });
  add('hairShort', (g) => {
    g.dome(0, 0.043, -0.005, 0.0375, W, 12, 3, 0.86);
    g.box(0, 0.016, -0.024, 0.068, 0.04, 0.024, W);
  }, { tint: 'hair' });
  add('hairLong', (g) => {
    g.dome(0, 0.043, -0.005, 0.0385, W, 12, 3, 0.9);
    g.box(0, -0.016, -0.025, 0.072, 0.074, 0.026, W);
    for (const s of [-1, 1]) g.box(s * 0.033, 0.004, -0.008, 0.012, 0.052, 0.028, W);
  }, { tint: 'hair' });
  add('beanie', (g) => {
    g.dome(0, 0.047, -0.004, 0.039, W, 12, 3, 1.05);
    g.cyl(0, 0.04, -0.004, 0.0395, 0.013, 12, W);
    sphere(g, 0, 0.091, -0.004, 0.011, W, 1, 6, 4);
  }, { tint: 'hat' });
  add('straw', (g) => {
    g.cyl(0, 0.056, 0, 0.054, 0.005, 14, 0xe6c27a);
    g.cyl(0, 0.06, 0, 0.033, 0.03, 12, 0xe9c983);
    g.cyl(0, 0.061, 0, 0.0345, 0.008, 12, 0x8a5a3a);
  }, { shadow: true });
  add('cap', (g) => {
    g.dome(0, 0.048, -0.004, 0.038, W, 12, 3, 0.82);
    g.box(0, 0.047, 0.036, 0.044, 0.006, 0.032, W);
  }, { tint: 'hat' });
  add('helmet', (g) => {
    g.dome(0, 0.047, 0, 0.042, W, 12, 3, 0.95);
    g.cyl(0, 0.045, 0, 0.047, 0.005, 14, W);
  }, { tint: 'hat' });
  add('arm', (g) => g.box(0, -0.058, 0, 0.0155, 0.058, 0.017, W), { tint: 'shirt' });
  add('hand', (g) => g.box(0, -0.071, 0, 0.016, 0.015, 0.017, W), { tint: 'skin' });
  // outils (repère de la main droite : -y le long du bras)
  add('axe', (g) => {
    g.box(0, -0.17, 0, 0.008, 0.115, 0.008, 0x8a5a3a);
    g.box(0, -0.172, -0.014, 0.006, 0.028, 0.03, 0x9aa3ab);
    g.box(0, -0.172, -0.03, 0.0065, 0.03, 0.004, 0xd5dde3);
  }, { shadow: true });
  add('hoe', (g) => {
    g.box(0, -0.2, 0, 0.007, 0.16, 0.007, 0x9a6a3a);
    g.box(0, -0.205, -0.016, 0.032, 0.007, 0.03, 0x8a9096);
  }, { shadow: true });
  add('can', (g) => {
    g.cyl(0, -0.105, 0.012, 0.019, 0.032, 8, 0x5a9e6a);
    g.box(0, -0.085, 0.012, 0.004, 0.02, 0.03, 0x4a8a5a);
    g.box(0, -0.1, 0.045, 0.006, 0.006, 0.035, 0x5a9e6a);
  }, { shadow: true });
  add('scythe', (g) => {
    g.box(0, -0.21, 0, 0.007, 0.18, 0.007, 0x9a6a3a);
    g.box(0, -0.29, -0.03, 0.005, 0.01, 0.07, 0xc8d0d6);
  }, { shadow: true });
  add('seedbag', (g) => {
    g.ico(0, -0.09, 0.008, 0.02, 0xd8c39a, 1.15, 0.12, 4);
  });
  // charges (repère du torse)
  add('logs', (g) => {
    for (const [x, y] of [[0.028, 0.09], [0.047, 0.09], [0.0375, 0.108]]) g.cylZ(x, y, 0, 0.0115, 0.15, 7, 0x7a5232, 0xd9b47a);
  }, { shadow: true });
  const basket = (veg) => (g) => {
    g.box(0, 0.006, 0.052, 0.058, 0.03, 0.042, 0xb38652);
    g.box(0, 0.034, 0.052, 0.06, 0.004, 0.044, 0x8a6236);
    for (let k = 0; k < 5; k++) g.ico(-0.018 + (k % 3) * 0.018, 0.04 + (k > 2 ? 0.008 : 0), 0.044 + (k % 2) * 0.016, 0.0105, veg[k % veg.length], 1, 0.15, k);
  };
  add('basketCarrot', basket([0xf08a2a, 0xe57a1e, 0x4f9e38]), { shadow: true });
  add('basketTomato', basket([0xe53935, 0xd32f2f, 0x4f9e38]), { shadow: true });
  add('basketPotato', basket([0xc9a46a, 0xb89058, 0xd8b880]), { shadow: true });
  add('sheaf', (g) => {
    g.cyl(0, -0.03, 0.05, 0.02, 0.1, 7, 0xd9b84e);
    g.cyl(0, 0.0, 0.05, 0.022, 0.012, 7, 0x8a5a3a);
    g.ico(0, 0.08, 0.05, 0.03, 0xf0d27a, 1.1, 0.2, 5);
  }, { shadow: true });
  add('sack', (g) => g.ico(0, 0.03, 0.05, 0.032, 0xd8c39a, 1.1, 0.12, 6), { shadow: true });
  return P;
}

const HAND_TOOL = { chop: 'axe', trim: 'axe', till: 'hoe', water: 'can', sow: 'seedbag', harvestFarm: 'scythe' };

export class People {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.parts = buildParts();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {};
    for (const [name, p] of Object.entries(this.parts)) {
      const n = name === 'leg' || name === 'arm' || name === 'hand' ? MAX * 2 : MAX;
      const m = new THREE.InstancedMesh(p.geo, this.mat, n);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = !!p.shadow;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (p.tint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      this.meshes[name] = { m, n: 0, tint: p.tint };
    }
    this.figs = [];
    this.pool = [];
    this.root = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.tmp2 = new THREE.Matrix4();
    this.torsoM = new THREE.Matrix4();
    this.armM = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.pos = { x: 0, z: 0, dir: 0, s: 0, done: false };
    this.seen = new Map(); // id -> dernière action vue (effets : coups de hache, chutes)
    this.time = 0;
    this.scanAcc = 1;
    this.commuters = [];
  }

  /* ───────── Qui est visible ───────── */
  update(dt, gameSpeed) {
    const game = this.r.game, world = this.r.world;
    this.time += dt;
    if (!world || !game.villagers) return;
    const st = game.state;
    const tNow = st.time.day * DAY_SECONDS + (game.playing ? game.sim.acc || 0 : 0);
    const hour = (st.time.day - Math.floor(st.time.day)) * 24;
    const cam = this.r.cam;
    const tx = cam.target.x, tz = cam.target.z;
    const radius = Math.min(60, cam.distance * 1.35 + 10);
    const r2 = radius * radius;
    const figs = this.figs;
    figs.length = 0;
    let fi = 0;
    const fig = () => {
      let f = this.pool[fi];
      if (!f) this.pool[fi] = f = {};
      fi++;
      figs.push(f);
      return f;
    };
    // 1) travailleurs suivis geste par geste
    for (const w of game.villagers.list) {
      if (!w.detail || w.state === 'off') continue;
      const p = this.workerPose(w, tNow);
      if (!p) continue;
      const dx = p.x - tx, dz = p.z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dress(f, w);
      Object.assign(f, p);
      f.d2 = dx * dx + dz * dz;
      this.effects(w, f, tNow);
    }
    // 2) les autres travailleurs : trajets du matin et du soir (calculés à la demande)
    this.scanAcc += dt;
    if (this.scanAcc > 0.5) {
      this.scanAcc = 0;
      this.scanCommuters(hour, tx, tz, radius + 25);
    }
    for (const c of this.commuters) {
      const w = c.w;
      const ph = commutePhase(w, hour, c.dur);
      if (!ph) continue;
      const f0 = ph.dir > 0 ? ph.f : 1 - ph.f;
      const p = moveAt(c.mv, c.mv.t0 + f0 * c.mv.len / c.mv.speed, this.pos);
      const dx = p.x - tx, dz = p.z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dress(f, w);
      f.x = p.x;
      f.z = p.z;
      f.dir = ph.dir > 0 ? p.dir : p.dir + Math.PI;
      f.anim = 'walk';
      f.phase = p.s * 9;
      f.t = 0;
      f.load = null;
      f.tool = null;
      f.d2 = dx * dx + dz * dz;
    }
    // 3) promeneurs (enfants, retraités, flâneurs)
    for (const a of this.r.agents.people) {
      const p0 = a.pts[a.seg], p1 = a.pts[a.seg + 1];
      if (!p1) continue;
      const x = p0[0] + (p1[0] - p0[0]) * a.t, z = p0[2] + (p1[2] - p0[2]) * a.t;
      const dx = x - tx, dz = z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dressWalker(f, a);
      f.x = x;
      f.z = z;
      f.y = p0[1] - 0.03;
      f.dir = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
      f.anim = 'walk';
      f.phase = (a.seg + a.t) * 9;
      f.t = 0;
      f.load = null;
      f.tool = null;
      f.d2 = dx * dx + dz * dz;
    }
    // galerie de poses (outil de mise au point)
    if (this.debugFigs) {
      figs.length = 0;
      for (const f of this.debugFigs) figs.push(f);
    }
    // les plus proches d'abord
    if (figs.length > MAX) {
      figs.sort((a, b) => a.d2 - b.d2);
      figs.length = MAX;
    }
    this.draw(figs, world);
    void gameSpeed;
  }

  /** Tenue stable d'un travailleur (graine). */
  dress(f, w) {
    const o = OUTFITS[w.role];
    const pick = (arr, k) => arr[Math.floor(hash2(w.seed, k, 17) * arr.length)];
    f.skin = SKINS[w.skin % SKINS.length];
    f.hairC = HAIRS[w.hair % HAIRS.length];
    f.shirt = o?.shirt ? pick(o.shirt, 1) : SHIRTS[w.shirt % SHIRTS.length];
    f.pants = o?.pants ? pick(o.pants, 2) : PANTS[Math.floor(hash2(w.seed, 3, 17) * PANTS.length)];
    f.hat = o?.hat || null;
    f.hatC = o?.hatColor ? pick(o.hatColor, 4) : 0xffffff;
    f.longHair = w.girl;
    f.scale = 1.18;
    f.y = 0;
    f.id = w.id;
    f.role = w.role;
  }

  dressWalker(f, a) {
    if (a.look == null) {
      const s = (Math.random() * 1e9) | 0;
      a.look = { skin: SKINS[s % SKINS.length], hair: HAIRS[(s >> 3) % HAIRS.length], pants: PANTS[(s >> 6) % PANTS.length], long: (s >> 9) % 2 === 0, kid: (s >> 10) % 4 === 0 };
    }
    f.skin = a.look.skin;
    f.hairC = a.look.hair;
    f.shirt = a.shirt;
    f.pants = a.look.pants;
    f.hat = null;
    f.longHair = a.look.long;
    f.scale = a.look.kid ? 0.85 : 1.15;
    f.id = -1;
    f.role = 'walker';
  }

  /** Position et geste d'un travailleur suivi, d'après son action en cours. */
  workerPose(w, t) {
    const p = workerPos(w, Math.min(t, w.until), this.pos);
    const out = { x: p.x, z: p.z, dir: p.dir, y: 0, anim: 'idle', phase: 0, t: t - w.t0, dur: Math.max(0.01, w.until - w.t0), load: null, tool: null };
    const act = w.act;
    const moving = !!w.mv;
    if (moving) {
      out.phase = p.s * 9;
      out.anim = w.load ? (w.load.kind === 'logs' ? 'carryLogs' : 'carryFront') : 'walk';
    } else {
      switch (act) {
        case 'chop':
        case 'trim':
          out.anim = act;
          out.tool = 'axe';
          break;
        case 'till':
        case 'sow':
        case 'water':
        case 'harvest':
        case 'weed': {
          out.anim = act;
          const tg = w.target;
          if (tg?.from && tg?.to) {
            const k = Math.min(1, Math.max(0, (t - w.t0) / (w.until - w.t0)));
            out.x = tg.from[0] + (tg.to[0] - tg.from[0]) * k;
            out.z = tg.from[1] + (tg.to[1] - tg.from[1]) * k;
          }
          const farm = w.role === 'farmer';
          out.tool = act === 'harvest' ? (farm ? 'scythe' : null) : act === 'weed' ? null : HAND_TOOL[act];
          break;
        }
        case 'watch':
          out.anim = 'idle';
          out.tool = 'axe';
          break;
        case 'drop':
          out.anim = 'drop';
          break;
        case 'rest':
          out.anim = 'chat';
          break;
        default:
          out.anim = 'idle';
      }
    }
    if (w.load) out.load = w.load.kind === 'logs' ? 'logs' : w.load.kind === 'sheaf' ? 'sheaf' : w.load.kind === 'basket' ? ['basketCarrot', 'basketTomato', 'basketPotato'][w.load.crop % 3] : 'sack';
    if (w.role === 'lumberjack' && !out.tool && !w.load && (act === 'goTree' || act === 'idle' || act === 'wait')) out.tool = 'axeRest';
    // sur un pont, on marche sur le tablier
    out.y = this.groundY(out.x, out.z);
    return out;
  }

  groundY(x, z) {
    const w = this.r.world;
    const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
    if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) return 0;
    const i = tz * SIZE + tx;
    const t = w.terrain[i];
    if ((t === T.WATER || t === T.DEEP) && w.road[i]) return 0.08;
    return 0;
  }

  /** Effets du travail : coups de hache (l'arbre tremble, copeaux), chute, terre, gouttes, épis. */
  effects(w, f, t) {
    const r = this.r;
    let s = this.seen.get(w.id);
    if (!s) this.seen.set(w.id, (s = { act: '', t0: -1, k: -1 }));
    if (s.act !== w.act || s.t0 !== w.t0) {
      // nouvelle action
      if (w.act === 'watch' && s.act === 'chop') {
        this.sound('timber', f);
        const fl = w.target?.fell;
        if (fl) r.particles.emit('leaves', fl.x + Math.sin(fl.dir) * 0.3, 0.25, fl.z + Math.cos(fl.dir) * 0.3, 14);
      }
      if (w.act === 'drop' || (s.act === 'drop' && w.act !== 'drop')) {
        /* rien */
      }
      s.act = w.act;
      s.t0 = w.t0;
      s.k = -1;
    }
    const el = t - w.t0;
    const strikes = { chop: [0.7, 0.42], trim: [0.62, 0.36], till: [1.0, 0.62], harvest: [0.8, 0.4] }[w.act];
    if (strikes && el >= 0) {
      const k = Math.floor((el - strikes[1]) / strikes[0]);
      if (k > s.k && el >= strikes[1]) {
        s.k = k;
        const fx = f.x + Math.sin(f.dir) * 0.12, fz = f.z + Math.cos(f.dir) * 0.12;
        if (w.act === 'chop') {
          const id = w.target?.tree;
          if (id != null) r.vegetation.shake(id);
          r.particles.emit('chips', fx, 0.08, fz, 5);
          if (k % 2 === 0) r.particles.emit('leaves', fx, 0.32, fz, 2);
          this.sound('chop', f);
        } else if (w.act === 'trim') {
          r.particles.emit('chips', fx, 0.03, fz, 4);
          this.sound('chop', f);
        } else if (w.act === 'till') {
          r.particles.emit('soil', fx, 0.03, fz, 5);
        } else if (w.act === 'harvest') {
          r.particles.emit(w.role === 'farmer' ? 'grain' : 'leaves', fx, 0.05, fz, 3);
          if (k % 2 === 0) this.sound('harvest', f);
        }
      }
    }
    if (w.act === 'water' && Math.random() < 0.5) {
      r.particles.emit('drops', f.x + Math.sin(f.dir) * 0.11, 0.07, f.z + Math.cos(f.dir) * 0.11, 1);
    }
    if (w.act === 'sow' && Math.random() < 0.12) r.particles.emit('grain', f.x + Math.sin(f.dir + 0.6) * 0.06, 0.08, f.z + Math.cos(f.dir + 0.6) * 0.06, 1, { scale: 0.6 });
  }

  /** Les sons du travail, seulement de près. */
  sound(name, f) {
    const cam = this.r.cam;
    if (cam.distance > 22 || f.d2 > 140) return;
    const now = this.time;
    if (now - (this.lastSound?.[name] || 0) < 0.12) return;
    this.lastSound = this.lastSound || {};
    this.lastSound[name] = now;
    this.r.game.sound?.play(name);
  }

  /** Travailleurs « abrégés » en route : on calcule leur chemin seulement s'ils sont près de la caméra. */
  scanCommuters(hour, tx, tz, radius) {
    const game = this.r.game, world = this.r.world;
    const out = [];
    const r2 = radius * radius;
    let budget = 30; // chemins calculés au plus par passage
    for (const w of game.villagers.list) {
      if (w.detail || w.home < 0) continue;
      // fenêtre de trajet large (avant de connaître la durée exacte)
      const inMorning = hour >= w.start && hour < w.start + 4;
      const inEvening = hour >= w.end && hour < w.end + 4;
      if (!inMorning && !inEvening) continue;
      const home = world.buildings.get(w.home), job = world.buildings.get(w.job);
      if (!home || !job) continue;
      const hc = world.centerOf(home), jc = world.centerOf(job);
      const near = (c) => (c.cx - HALF - tx) ** 2 + (c.cz - HALF - tz) ** 2 < r2;
      if (!near(hc) && !near(jc)) continue;
      let c = w.cpath;
      if (!c || c.v !== world.version) {
        if (budget-- <= 0) continue;
        c = w.cpath = this.commutePath(world, home, job);
        if (!c) {
          w.cpath = { v: world.version, mv: null };
          continue;
        }
      }
      if (!c.mv) continue;
      out.push({ w, mv: c.mv, dur: c.dur });
    }
    this.commuters = out;
  }

  commutePath(world, home, job) {
    const a = world.centerOf(home), c = world.centerOf(job);
    const ra = roadNextTo(world, home, [c.cx - HALF, c.cz - HALF]);
    const rc = roadNextTo(world, job, [a.cx - HALF, a.cz - HALF]);
    if (ra < 0 || rc < 0) return null;
    const tiles = roadPath(world, ra, rc);
    if (!tiles) return null;
    const pts = roadPoints(tiles);
    pts.unshift(doorOf(home));
    pts.push(doorOf(job));
    const mv = makeMove(pts, 1, 0);
    const speed = Math.max(WALK, mv.len / 14);
    mv.speed = speed;
    // durée du trajet en heures de jeu
    const dur = (mv.len / speed) / (DAY_SECONDS / 24);
    return { v: world.version, mv, dur };
  }

  /* ───────── Dessin ───────── */
  draw(figs, world) {
    for (const k in this.meshes) this.meshes[k].n = 0;
    for (const f of figs) this.drawFigure(f);
    for (const k in this.meshes) {
      const e = this.meshes[k];
      e.m.count = e.n;
      if (e.n) {
        e.m.instanceMatrix.needsUpdate = true;
        if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true;
      }
    }
    void world;
  }

  put(name, matrix, color) {
    const e = this.meshes[name];
    if (!e || e.n >= e.m.instanceMatrix.count) return;
    e.m.setMatrixAt(e.n, matrix);
    if (e.tint) e.m.setColorAt(e.n, this.col.setHex(color ?? 0xffffff));
    e.n++;
  }

  drawFigure(f) {
    const P = pose(f, this.time);
    const R = this.root, M = this.tmp, T2 = this.torsoM;
    this.q.setFromAxisAngle(this.up, f.dir || 0);
    this.v.set(f.x, (f.y || 0) + P.bob - P.crouch, f.z);
    this.s.setScalar(f.scale || 1);
    R.compose(this.v, this.q, this.s);
    // jambes
    for (const side of [-1, 1]) {
      const a = side < 0 ? P.legL : P.legR;
      M.makeRotationX(a).setPosition(side * 0.012, 0.077, 0);
      this.put('leg', this.tmp2.multiplyMatrices(R, M), f.pants);
    }
    // torse (penché vers l'avant autour des hanches)
    M.makeRotationX(P.tilt).setPosition(0, 0.077, 0);
    T2.multiplyMatrices(R, M);
    this.put('torso', T2, f.shirt);
    if (f.role === 'lumberjack' || f.role === 'farmer' || f.role === 'gardener' || f.role === 'craftsman') this.put('belt', T2);
    // tête
    M.makeRotationY(P.look).setPosition(0, 0.082, 0);
    const H = this.tmp2.multiplyMatrices(T2, M);
    this.put('head', H, f.skin);
    this.put('eyes', H);
    if (f.hat === 'straw') this.put('straw', H);
    else if (f.hat) this.put(f.hat, H, f.hatC);
    if (!f.hat || f.hat === 'straw') this.put(f.longHair ? 'hairLong' : 'hairShort', H, f.hairC);
    else if (f.longHair) this.put('hairLong', H, f.hairC);
    // bras, mains, outil
    for (const side of [-1, 1]) {
      const ax = side < 0 ? P.armL : P.armR;
      const az = side < 0 ? -P.armSpread : P.armSpread;
      M.makeRotationX(ax);
      if (az) M.premultiply(this.tmp2.makeRotationZ(az));
      M.setPosition(side * 0.033, 0.068, 0);
      const A = this.armM.multiplyMatrices(T2, M);
      this.put('arm', A, f.shirt);
      this.put('hand', A, f.skin);
      if (side > 0 && P.tool) this.put(P.tool, A);
      if (side < 0 && P.toolL) this.put(P.toolL, A);
    }
    // charge
    if (f.load) {
      if (P.loadDrop) {
        M.makeTranslation(0, -P.loadDrop, 0.01 * P.loadDrop);
        this.put(f.load, this.tmp2.multiplyMatrices(T2, M));
      } else this.put(f.load, T2);
    }
  }
}

/** Fenêtre de trajet d'un travailleur abrégé (aller le matin, retour le soir). */
function commutePhase(w, hour, durH) {
  const d = Math.max(0.15, durH || 1);
  if (hour >= w.start && hour < w.start + d) return { dir: 1, f: (hour - w.start) / d };
  if (hour >= w.end && hour < w.end + d) return { dir: -1, f: (hour - w.end) / d };
  return null;
}

/* ───────── Gestes ───────── */
const ease = (k) => k * k * (3 - 2 * k);

/** Angles des membres selon l'animation (radians ; bras vers l'avant = négatif). */
export function pose(f, time) {
  const P = { legL: 0, legR: 0, armL: 0.05, armR: -0.05, armSpread: 0, tilt: 0.02, look: 0, bob: 0, crouch: 0, tool: null, toolL: null, loadDrop: 0 };
  const t = f.t || 0;
  switch (f.anim) {
    case 'walk':
    case 'carryLogs':
    case 'carryFront': {
      const ph = f.phase || 0;
      const sw = Math.sin(ph);
      const stride = f.anim === 'walk' ? 0.55 : 0.42;
      P.legL = sw * stride;
      P.legR = -sw * stride;
      P.bob = Math.abs(Math.cos(ph)) * 0.006;
      P.tilt = 0.05;
      if (f.anim === 'walk') {
        P.armL = -sw * 0.45;
        P.armR = sw * 0.45;
      } else if (f.anim === 'carryLogs') {
        P.armR = -2.75;
        P.armL = -sw * 0.3;
        P.tilt = 0.08;
      } else {
        P.armL = -1.0 + Math.sin(ph * 2) * 0.04;
        P.armR = -1.0 + Math.sin(ph * 2) * 0.04;
        P.tilt = -0.03;
      }
      break;
    }
    case 'chop':
    case 'trim': {
      const per = f.anim === 'chop' ? 0.7 : 0.62;
      const u = ((t % per) + per) % per / per;
      const hi = f.anim === 'chop' ? -2.95 : -2.4, lo = f.anim === 'chop' ? -0.55 : -0.18;
      let a;
      if (u < 0.58) a = -0.6 + (hi + 0.6) * ease(u / 0.58); // on lève la hache
      else if (u < 0.72) a = hi + (lo - hi) * Math.pow((u - 0.58) / 0.14, 1.6); // on frappe
      else a = lo + (-0.6 - lo) * ease((u - 0.72) / 0.28);
      P.armL = a;
      P.armR = a;
      P.armSpread = 0.12;
      P.tilt = (f.anim === 'trim' ? 0.32 : 0.06) + (u > 0.58 && u < 0.8 ? 0.16 : 0);
      if (f.anim === 'trim') {
        P.legL = -0.35;
        P.legR = 0.25;
        P.crouch = 0.008;
      }
      P.tool = 'axe';
      break;
    }
    case 'till': {
      const u = (t % 1.0) / 1.0;
      const a = u < 0.62 ? -0.5 + (-2.1 + 0.5) * ease(u / 0.62) : -2.1 + (2.1 - 0.45) * Math.pow((u - 0.62) / 0.38, 1.4);
      P.armL = a;
      P.armR = a;
      P.tilt = 0.18 + (u > 0.62 ? 0.12 : 0);
      P.legL = 0.25;
      P.legR = -0.15;
      P.tool = 'hoe';
      break;
    }
    case 'sow': {
      const ph = t * 5.5;
      P.legL = Math.sin(ph) * 0.3;
      P.legR = -Math.sin(ph) * 0.3;
      P.armL = -0.75;
      P.armR = -0.9 + Math.sin(t * 7) * 0.5;
      P.armSpread = 0.25 + Math.max(0, Math.sin(t * 7)) * 0.35;
      P.tilt = 0.12;
      P.toolL = 'seedbag';
      P.bob = Math.abs(Math.cos(ph)) * 0.004;
      break;
    }
    case 'water': {
      P.armR = -1.05 + Math.sin(t * 1.6) * 0.06;
      P.armL = 0.1;
      P.tilt = 0.1;
      P.look = Math.sin(t * 0.7) * 0.15;
      P.tool = 'can';
      break;
    }
    case 'harvest': {
      const farm = f.role === 'farmer';
      if (farm) {
        // fauchage : grands mouvements de côté
        const u = Math.sin(t * 4.2);
        P.armL = -0.9;
        P.armR = -0.9;
        P.armSpread = u * 0.5;
        P.look = u * 0.25;
        P.tilt = 0.25;
        P.tool = 'scythe';
      } else {
        P.armL = -0.45 + Math.sin(t * 7) * 0.25;
        P.armR = -0.45 - Math.sin(t * 7) * 0.25;
        P.tilt = 0.7;
        P.crouch = 0.012;
        P.legL = -0.5;
        P.legR = 0.3;
      }
      break;
    }
    case 'weed': {
      P.armL = -0.5 + Math.sin(t * 5) * 0.2;
      P.armR = -0.5 - Math.sin(t * 5) * 0.2;
      P.tilt = 0.72;
      P.crouch = 0.014;
      P.legL = -0.55;
      P.legR = 0.35;
      break;
    }
    case 'drop': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 0.8));
      P.tilt = Math.sin(k * Math.PI) * 0.55;
      P.armL = -0.95;
      P.armR = -0.95;
      P.loadDrop = k * 0.05;
      P.crouch = Math.sin(k * Math.PI) * 0.01;
      break;
    }
    case 'chat': {
      P.look = Math.sin(time * 0.8 + (f.x || 0)) * 0.4;
      P.armR = -0.3 + Math.sin(time * 2.1 + (f.z || 0)) * 0.25;
      P.armL = 0.08;
      P.bob = Math.sin(time * 2) * 0.002;
      break;
    }
    default: {
      // repos : respiration, regard qui se promène
      const s = (f.x || 0) * 3.1 + (f.z || 0) * 1.7;
      P.armL = 0.06 + Math.sin(time * 1.3 + s) * 0.03;
      P.armR = -0.06 - Math.sin(time * 1.3 + s) * 0.03;
      P.look = Math.sin(time * 0.35 + s) * 0.5;
      P.bob = Math.sin(time * 1.8 + s) * 0.0015;
    }
  }
  if (f.tool === 'axeRest') P.tool = 'axe';
  else if (f.tool && !P.tool) P.tool = f.tool;
  if (f.load) {
    if (f.load === 'logs') P.armR = Math.min(P.armR, -2.6);
    else if (f.anim !== 'drop' && !f.anim.startsWith('carry')) {
      P.armL = -1;
      P.armR = -1;
    }
    P.tool = null;
  }
  return P;
}
