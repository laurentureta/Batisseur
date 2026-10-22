// Les chantiers en 3D. Le terrain est piqueté puis préparé (terre retournée), les matériaux
// s'empilent (planches, pierres, briques), la dalle de fondation est coulée, la charpente monte,
// puis les murs et le toit apparaissent rang par rang derrière les échafaudages (le vrai modèle,
// découpé à la hauteur atteinte). À la fin, les échafaudages tombent et le bâtiment est inauguré.
// Tout suit l'avancement réel du chantier (le travail des bâtisseurs).
import * as THREE from 'three';
import { GeoBuilder, shade } from './geom.js';
import { mergeLayers, buildingCenter } from './BuildingView.js';
import { kit, kitReady, kitHas } from './kit.js';
import { BUILDINGS } from '../data/buildings.js';
import { siteMaterials, phaseOf, lowSite } from '../sim/Construction.js';

const WOOD = 0xb98a5a, WOOD_D = 0x8a5f3a, WOOD_L = 0xd4ad7a, ROPE = 0xf2efe6;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Géométrie (repère local) à partir d'un GeoBuilder. */
function geoOf(fn) {
  const g = new GeoBuilder();
  fn(g);
  return mergeLayers([{ layer: g.body, cx: 0, cz: 0, rot: 0 }]);
}

export class SiteView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.sites = new Map(); // id -> visuels
    this.cache = new Map();
    this.labelAcc = 0;
  }

  get world() {
    return this.r.world;
  }

  /** Hauteurs des planchers de l'échafaudage. */
  levels(H) {
    const h1 = Math.min(0.45, Math.max(0.16, H * 0.38));
    const h2 = Math.min(0.95, Math.max(h1 + 0.14, H * 0.72));
    return [0, h1, h2];
  }

  /** Hauteur où se tient un bâtisseur (sol ou plancher de l'échafaudage). */
  platformY(id, lvl) {
    if (!lvl) return 0;
    const s = this.sites.get(id);
    if (!s) return 0;
    return s.lv[Math.min(2, lvl)] + 0.012;
  }

  site(id) {
    return this.sites.get(id);
  }

  /** Demi-largeurs du bâtiment (actuel et visé) : l'échafaudage l'entoure au plus près. */
  extentOf(b) {
    const BV = this.r.buildings;
    const def = BUILDINGS[b.type];
    const key = `${b.type}|${b.level}|${b.cons?.to}|${b.id}|${this.r.season}|${BV.theme}`;
    this.extCache = this.extCache || new Map();
    let e = this.extCache.get(key);
    if (e) return e;
    let ex = 0.2, ez = 0.2;
    const levels = [b.level];
    if (b.cons && b.cons.to !== b.level) levels.push(b.cons.to);
    for (const L of levels) {
      const m = BV.model(L === b.level ? b : { ...b, level: L });
      const [x0, , z0, x1, , z1] = m.bbox;
      ex = Math.max(ex, Math.abs(x0), Math.abs(x1));
      ez = Math.max(ez, Math.abs(z0), Math.abs(z1));
    }
    const [w0, d0] = def.size;
    e = [Math.min(ex + 0.025, w0 / 2 + 0.02), Math.min(ez + 0.025, d0 / 2 + 0.02)];
    if (this.extCache.size > 400) this.extCache.clear();
    this.extCache.set(key, e);
    return e;
  }

  clear() {
    for (const id of [...this.sites.keys()]) this.removeSite(id, true);
  }

  /** On garde les visuels en phase avec les chantiers du monde. */
  sync() {
    const world = this.world;
    if (!world) return;
    for (const b of world.buildings.values()) {
      if (!b.cons) continue;
      const s = this.sites.get(b.id);
      if (!s || s.key !== this.keyOf(b)) this.addSite(b);
    }
    for (const id of [...this.sites.keys()]) {
      const b = world.buildings.get(id);
      if (!b || !b.cons) this.removeSite(id, !b);
    }
  }

  keyOf(b) {
    return `${b.type}|${b.x}|${b.z}|${b.rot}|${b.cons.k}|${b.cons.to}|${this.r.season}|${this.r.buildings.theme}`;
  }

  addSite(b) {
    this.removeSite(b.id, true);
    const BV = this.r.buildings;
    const def = BUILDINGS[b.type];
    const kind = b.cons.k;
    const { cx, cz } = buildingCenter(b);
    const root = new THREE.Group();
    root.position.set(cx, 0, cz);
    root.rotation.y = (b.rot & 3) * (Math.PI / 2);
    this.group.add(root);
    // modèle visé (nouveau bâtiment) ou modèle actuel (amélioration)
    const m = BV.model(kind === 'up' ? b : { ...b, level: b.cons.to });
    const [x0, y0, z0, x1, y1, z1] = m.bbox;
    const H = Math.max(0.25, y1);
    const sp = this.r.game.construction.spots(b);
    const [w0, d0] = def.size;
    const low = lowSite(def);
    const s = { id: b.id, key: this.keyOf(b), root, kind, H, lv: this.levels(H), sp, shown: 0, bbox: m.bbox, w0, d0, finished: false, low };

    // ── terrain piqueté et préparé
    if (kind === 'new') {
      s.dirt = this.mesh(root, this.cached(`dirt|${w0}|${d0}`, () => geoOf((g) => {
        g.box(0, 0, 0, w0 - 0.04, 0.014, d0 - 0.04, { top: 0x8f6a47, side: 0x6e4f33 });
        // mottes de terre
        for (let k = 0; k < 9 * w0 * d0; k++) {
          const u = Math.sin(k * 12.9898) * 43758.5453, v = Math.sin(k * 78.233) * 12345.678;
          const px = ((u - Math.floor(u)) - 0.5) * (w0 - 0.15), pz = ((v - Math.floor(v)) - 0.5) * (d0 - 0.15);
          g.box(px, 0.014, pz, 0.05, 0.012, 0.04, { top: 0x7a5534, side: 0x63452b });
        }
      })), { receive: true });
      s.stakes = this.mesh(root, this.cached(`stakes|${w0}|${d0}`, () => geoOf((g) => {
        const ax = w0 / 2 - 0.05, az = d0 / 2 - 0.05;
        for (const [px, pz] of [[-ax, -az], [ax, -az], [ax, az], [-ax, az]]) {
          g.box(px, 0, pz, 0.016, 0.1, 0.016, WOOD_L);
          g.box(px, 0.085, pz, 0.02, 0.015, 0.02, 0xe94b3a);
        }
        // cordeau
        g.box(0, 0.07, -az, ax * 2, 0.004, 0.004, ROPE);
        g.box(0, 0.07, az, ax * 2, 0.004, 0.004, ROPE);
        g.box(-ax, 0.07, 0, 0.004, 0.004, az * 2, ROPE);
        g.box(ax, 0.07, 0, 0.004, 0.004, az * 2, ROPE);
      })));
      // dalle de fondation (sous le modèle)
      const fx = (x1 - x0) * 0.96, fz = (z1 - z0) * 0.96;
      if (!low) s.slab = this.mesh(root, geoOf((g) => {
        g.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.min(fx, w0 - 0.06), 0.045, Math.min(fz, d0 - 0.06), { top: 0xc4bdb0, side: 0x9a948a });
      }), { cast: true, receive: true, own: true });
      // charpente : poteaux, sablières, contreventements
      const Hf = Math.min(H * 0.62, 0.55);
      const fx0 = Math.max(x0 + 0.03, -w0 / 2 + 0.06), fx1 = Math.min(x1 - 0.03, w0 / 2 - 0.06);
      const fz0 = Math.max(z0 + 0.03, -d0 / 2 + 0.06), fz1 = Math.min(z1 - 0.03, d0 / 2 - 0.06);
      s.frameMat = this.clipMat();
      if (!low) s.frame = this.mesh(root, geoOf((g) => {
        const nx = Math.max(1, Math.round((fx1 - fx0) / 0.32)), nz = Math.max(1, Math.round((fz1 - fz0) / 0.32));
        const posts = [];
        for (let i = 0; i <= nx; i++) for (const zz of [fz0, fz1]) posts.push([fx0 + ((fx1 - fx0) * i) / nx, zz]);
        for (let j = 1; j < nz; j++) for (const xx of [fx0, fx1]) posts.push([xx, fz0 + ((fz1 - fz0) * j) / nz]);
        for (const [px, pz] of posts) g.box(px, 0.04, pz, 0.026, Hf, 0.026, WOOD);
        // sablières (en haut) et lisses (à mi-hauteur)
        for (const yy of [0.04 + Hf * 0.5, 0.04 + Hf - 0.015]) {
          g.box((fx0 + fx1) / 2, yy, fz0, fx1 - fx0 + 0.03, 0.022, 0.024, WOOD_D);
          g.box((fx0 + fx1) / 2, yy, fz1, fx1 - fx0 + 0.03, 0.022, 0.024, WOOD_D);
          g.box(fx0, yy, (fz0 + fz1) / 2, 0.024, 0.022, fz1 - fz0 + 0.03, WOOD_D);
          g.box(fx1, yy, (fz0 + fz1) / 2, 0.024, 0.022, fz1 - fz0 + 0.03, WOOD_D);
        }
        // fermes du toit (triangles de poutres)
        const ridgeH = Math.min(0.3, (fz1 - fz0) * 0.45);
        for (let i = 0; i <= nx; i++) {
          const px = fx0 + ((fx1 - fx0) * i) / nx, yb = 0.04 + Hf;
          beam(g, [px, yb, fz0], [px, yb + ridgeH, (fz0 + fz1) / 2], 0.02, WOOD_D);
          beam(g, [px, yb, fz1], [px, yb + ridgeH, (fz0 + fz1) / 2], 0.02, WOOD_D);
        }
        g.box((fx0 + fx1) / 2, 0.04 + Hf + ridgeH - 0.01, (fz0 + fz1) / 2, fx1 - fx0 + 0.04, 0.022, 0.022, WOOD_D);
      }), { cast: true, mat: s.frameMat });
      s.frameTop = 0.04 + Hf + Math.min(0.3, (fz1 - fz0) * 0.45) + 0.02;
      // le vrai bâtiment, découpé à la hauteur atteinte
      s.bodyMat = this.clipMat();
      s.glassMat = this.clipMat(true);
      const gb = mergeLayers([{ layer: m.body, cx: 0, cz: 0, rot: 0 }]);
      const gg = m.glass.count ? mergeLayers([{ layer: m.glass, cx: 0, cz: 0, rot: 0 }]) : null;
      if (gb) s.model = this.mesh(root, gb, { cast: true, receive: true, own: true, mat: s.bodyMat });
      if (gg) s.glass = this.mesh(root, gg, { own: true, mat: s.glassMat });
    }

    // ── échafaudages (et échelle)
    if (!low) s.scaffold = this.mesh(root, this.cached(`scaf|${sp.hx.toFixed(3)}|${sp.hz.toFixed(3)}|${s.lv[1].toFixed(2)}|${s.lv[2].toFixed(2)}|${sp.ladderSide}|${sp.ladder[1].toFixed(2)}`, () => geoOf((g) => scaffold(g, sp.hx, sp.hz, s.lv, sp))), { cast: true });
    if (s.scaffold) s.scaffold.scale.y = 0.001;

    // ── matériaux : un tas par matériau payé, ils diminuent avec l'avancement
    const mats = siteMaterials(def, b.cons.to);
    s.piles = mats.map((mat, k) => {
      const at = k === 0 ? sp.pile : sp.pile2;
      const mesh = this.mesh(root, this.pileGeo(mat), { cast: true });
      mesh.position.set(at[0], 0, at[1]);
      mesh.rotation.y = k ? -0.3 : 0.25;
      mesh.scale.setScalar(0.001);
      return mesh;
    });
    // tréteau de scieur
    s.horse = this.mesh(root, this.cached('horse', () => geoOf((g) => sawhorse(g))), { cast: true });
    s.horse.position.set(sp.saw[0], 0, sp.saw[1]);
    s.horse.visible = false;
    if (kind === 'up') s.horse.visible = true;

    // l'ancien modèle (amélioration) reste dans la ville ; un bâtiment neuf n'y est pas encore
    if (kind === 'new') BV.hideForSite(b);
    this.sites.set(b.id, s);
    this.update(0, true);
  }

  removeSite(id, silent = false) {
    const s = this.sites.get(id);
    if (!s) return;
    this.group.remove(s.root);
    s.root.traverse((o) => {
      if (o.isMesh && o.userData.own) o.geometry.dispose();
    });
    for (const mt of [s.bodyMat, s.glassMat, s.frameMat]) mt?.dispose();
    this.sites.delete(id);
    this.r.labels.remove('cs' + id);
    void silent;
  }

  /** Le chantier est fini : on retire tout, avec un nuage de poussière et des étincelles. */
  complete(b, { skipped = false } = {}) {
    const s = this.sites.get(b.id);
    if (s) {
      const c = buildingCenter(b);
      for (let k = 0; k < (skipped ? 14 : 22); k++) this.r.particles.emit('dust', c.cx + (Math.random() - 0.5) * c.w, 0.1 + Math.random() * s.H * 0.6, c.cz + (Math.random() - 0.5) * c.d, 1);
      for (let k = 0; k < 26; k++) this.r.particles.emit('sparkle', c.cx + (Math.random() - 0.5) * c.w * 0.8, 0.2 + Math.random() * s.H, c.cz + (Math.random() - 0.5) * c.d * 0.8, 1);
    }
    this.removeSite(b.id);
  }

  mesh(root, geo, { cast = false, receive = false, own = false, mat = null } = {}) {
    const m = new THREE.Mesh(geo || new THREE.BufferGeometry(), mat || this.mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.userData.own = own;
    root.add(m);
    return m;
  }

  cached(key, fn) {
    let g = this.cache.get(key);
    if (!g) this.cache.set(key, (g = fn()));
    return g;
  }

  clipMat(glass = false) {
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const mt = glass
      ? new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc35a, emissiveIntensity: 0, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mt.clippingPlanes = [plane];
    mt.clipShadows = true;
    mt.userData.plane = plane;
    return mt;
  }

  pileGeo(mat) {
    return this.cached('pile|' + mat, () => geoOf((g) => {
      if (kitReady() && mat === 'wood' && kitHas('resource_lumber')) kit(g, 'resource_lumber', { s: 0.42 });
      else if (kitReady() && kitHas('resource_stone') && mat !== 'wood') kit(g, 'resource_stone', { s: 0.45, tint: mat === 'bricks' ? [1.45, 0.62, 0.5] : null });
      else if (mat === 'wood') for (let k = 0; k < 6; k++) g.box(0, 0.012 + Math.floor(k / 3) * 0.025, (k % 3 - 1) * 0.03, 0.2, 0.022, 0.026, k % 2 ? WOOD : WOOD_L);
      else for (let k = 0; k < 6; k++) g.box((k % 3 - 1) * 0.05, Math.floor(k / 3) * 0.04, 0, 0.045, 0.038, 0.08, mat === 'bricks' ? 0xb5523b : 0xb7b2a8);
    }));
  }

  /* ───────── Animation ───────── */
  update(dt, force = false) {
    if (!this.world) return;
    const game = this.r.game;
    const C = game.construction;
    this.labelAcc += dt;
    this.syncAcc = (this.syncAcc || 0) + dt;
    if (this.syncAcc > 1) {
      this.syncAcc = 0;
      this.sync();
    }
    const doLabels = force || this.labelAcc > 0.2;
    if (doLabels) this.labelAcc = 0;
    for (const s of this.sites.values()) {
      const b = this.world.buildings.get(s.id);
      if (!b?.cons) continue;
      const target = C.progress(b);
      // l'affichage rattrape l'avancement en douceur
      s.shown = force ? target : s.shown + (target - s.shown) * Math.min(1, dt * 4);
      const p = s.shown;
      const [x0, y0, , , y1] = s.bbox;
      if (s.kind === 'new') {
        s.dirt.scale.set(0.4 + 0.6 * smooth(0, 0.05, p), 1, 0.4 + 0.6 * smooth(0, 0.05, p));
        s.stakes.visible = p < 0.3;
        if (s.slab) {
          s.slab.scale.y = Math.max(0.001, smooth(0.08, 0.16, p));
          s.slab.visible = p > 0.08;
        }
        // charpente : elle monte, puis disparaît derrière les murs
        if (s.frame) {
          s.frame.visible = p > 0.16 && p < 0.93;
          s.frameMat.userData.plane.constant = 0.04 + (s.frameTop - 0.04) * smooth(0.16, 0.3, p);
        }
        // murs et toit (un chantier bas se dévoile plus tôt)
        const a0 = s.low ? 0.1 : 0.29;
        const k = smooth(a0, 0.92, p);
        const clip = y0 + (y1 - y0 + 0.06) * (k * 0.85 + 0.15 * Math.pow(k, 3));
        const vis = p > a0;
        if (s.model) {
          s.model.visible = vis;
          s.bodyMat.userData.plane.constant = clip;
        }
        if (s.glass) {
          s.glass.visible = vis;
          s.glassMat.userData.plane.constant = clip;
          s.glassMat.emissiveIntensity = this.r.night * 1.1;
        }
      }
      // échafaudage : il monte, puis on le démonte pour les finitions
      if (s.scaffold) {
        const up = s.kind === 'up' ? smooth(0, 0.06, p) : smooth(0.22, 0.3, p);
        const down = 1 - smooth(0.93, 0.985, p);
        s.scaffold.scale.y = Math.max(0.001, Math.min(up, down));
        s.scaffold.visible = s.scaffold.scale.y > 0.01;
      }
      // matériaux : livrés au début, consommés au fil du chantier
      const del = Math.min(1, (b.cons.del || 0) / 2 + (s.kind === 'up' ? 0.4 : 0));
      const left = 1 - smooth(0.1, 0.97, p) * 0.88;
      for (const pm of s.piles) pm.scale.setScalar(Math.max(0.001, del * left));
      s.horse.visible = s.kind === 'up' || (p > 0.15 && p < 0.95);
      if (doLabels) this.label(b, s, p);
    }
  }

  label(b, s, p) {
    const c = buildingCenter(b);
    const key = 'cs' + b.id;
    const game = this.r.game;
    if (!game.playing || game.isDemo) {
      this.r.labels.remove(key);
      return;
    }
    const pct = Math.floor(p * 100);
    const crew = game.construction.crewOf(b.id).length;
    const phase = !crew && p < 0.01 ? 'En attente des bâtisseurs' : b.cons.k === 'up' ? 'Amélioration' : phaseOf(p).name;
    const html = `<div class="site-tag${crew ? '' : ' wait'}"><span class="st-ico">🔨</span><span class="st-txt"><b>${phase}</b><span class="st-bar"><i style="width:${pct}%"></i></span></span><span class="st-pct">${pct}%</span></div>`;
    const y = Math.max(s.lv[2] + 0.35, s.H + 0.12);
    this.r.labels.set(key, { x: c.cx, y, z: c.cz, html, cls: 'site', maxDist: 46, onTap: () => game.select(b.id) });
  }
}

/** Poutre de section carrée entre deux points (repère local), orientée comme il faut. */
export function beam(g, a, b, t, color) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  d[0] /= len;
  d[1] /= len;
  d[2] /= len;
  // u horizontal et perpendiculaire, v = u × d
  let u = [d[2], 0, -d[0]];
  let lu = Math.hypot(u[0], u[2]);
  if (lu < 1e-4) {
    u = [1, 0, 0];
    lu = 1;
  }
  u = [u[0] / lu, 0, u[2] / lu];
  const v = [u[1] * d[2] - u[2] * d[1], u[2] * d[0] - u[0] * d[2], u[0] * d[1] - u[1] * d[0]];
  const h = t / 2;
  const P = (o, su, sv) => [o[0] + (u[0] * su + v[0] * sv) * h, o[1] + (u[1] * su + v[1] * sv) * h, o[2] + (u[2] * su + v[2] * sv) * h];
  const A = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)];
  const B = [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const face = (p, q, r, s) => {
    // on tourne la face vers l'extérieur
    const n = cross(sub(q, p), sub(r, p));
    const c = [(p[0] + r[0]) / 2 - mid[0], (p[1] + r[1]) / 2 - mid[1], (p[2] + r[2]) / 2 - mid[2]];
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) g.quad(s, r, q, p, color);
    else g.quad(p, q, r, s, color);
  };
  for (let k = 0; k < 4; k++) face(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]);
  face(A[0], A[1], A[2], A[3]);
  face(B[0], B[1], B[2], B[3]);
}
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

/** Échafaudage autour d'une emprise de demi-côtés (hx, hz) : poteaux, planchers, garde-corps, échelle. */
function scaffold(g, hx, hz, lv, sp) {
  const o = hx + 0.085, oz = hz + 0.085; // rangée extérieure
  const i0 = hx - 0.012, iz = hz - 0.012; // rangée intérieure
  const POLE = 0x8a6a48;
  const top = lv[2] + 0.22;
  const poles = (ax, az) => {
    const pts = [];
    const nx = Math.max(1, Math.round((2 * ax) / 0.42)), nz = Math.max(1, Math.round((2 * az) / 0.42));
    for (let i = 0; i <= nx; i++) for (const zz of [-az, az]) pts.push([-ax + (2 * ax * i) / nx, zz]);
    for (let j = 1; j < nz; j++) for (const xx of [-ax, ax]) pts.push([xx, -az + (2 * az * j) / nz]);
    return pts;
  };
  for (const [px, pz] of poles(o, oz)) g.box(px, 0, pz, 0.016, top, 0.016, POLE);
  for (const [px, pz] of [[-i0, -iz], [i0, -iz], [i0, iz], [-i0, iz]]) g.box(px, 0, pz, 0.014, lv[2] + 0.02, 0.014, POLE);
  // croix de contreventement sur les grands côtés
  for (const zz of [-oz, oz]) beam(g, [-o, 0.02, zz], [o, lv[1] - 0.02, zz], 0.01, POLE);
  for (const xx of [-o, o]) beam(g, [xx, 0.02, oz], [xx, lv[1] - 0.02, -oz], 0.01, POLE);
  for (const y of [lv[1], lv[2]]) {
    // planchers
    const w = o - i0;
    g.box(0, y - 0.012, (oz + iz) / 2, 2 * o, 0.012, w, { top: WOOD_L, side: WOOD });
    g.box(0, y - 0.012, -(oz + iz) / 2, 2 * o, 0.012, w, { top: WOOD_L, side: WOOD });
    g.box((o + i0) / 2, y - 0.012, 0, w, 0.012, 2 * iz, { top: WOOD_L, side: WOOD });
    g.box(-(o + i0) / 2, y - 0.012, 0, w, 0.012, 2 * iz, { top: WOOD_L, side: WOOD });
    // garde-corps
    g.box(0, y + 0.1, oz, 2 * o, 0.01, 0.01, POLE);
    g.box(0, y + 0.1, -oz, 2 * o, 0.01, 0.01, POLE);
    g.box(o, y + 0.1, 0, 0.01, 0.01, 2 * oz, POLE);
    g.box(-o, y + 0.1, 0, 0.01, 0.01, 2 * oz, POLE);
  }
  // échelle (contre l'échafaudage, côté choisi)
  const sx = sp.ladderSide;
  const zL = sp.ladder[1];
  const xb = sx * (hx + 0.17), xt = sx * (hx + 0.1);
  const yTop = lv[2] + 0.16;
  const n = Math.round(yTop / 0.055);
  for (const dz of [-0.035, 0.035]) {
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      g.box(xb + (xt - xb) * f, f * yTop - yTop / n / 2, zL + dz, 0.012, yTop / n + 0.002, 0.012, WOOD_D);
    }
  }
  for (let k = 1; k < n; k++) {
    const f = k / n;
    g.box(xb + (xt - xb) * f, f * yTop, zL, 0.01, 0.008, 0.07, WOOD);
  }
}

/** Tréteau avec une planche (on y scie). */
function sawhorse(g) {
  for (const sx of [-0.07, 0.07]) {
    for (const sz of [-0.035, 0.035]) g.box(sx, 0, sz, 0.01, 0.075, 0.01, WOOD_D);
    g.box(sx, 0.07, 0, 0.016, 0.012, 0.09, WOOD);
  }
  g.box(0, 0.082, 0, 0.26, 0.012, 0.05, { top: WOOD_L, side: WOOD });
  g.box(0.1, 0.0, 0.08, 0.05, 0.005, 0.04, shade(WOOD_L, 1.05)); // sciure
}
