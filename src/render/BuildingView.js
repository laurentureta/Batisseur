// Affichage des bâtiments : maillages fusionnés par zone, animations de construction, pièces mobiles.
import * as THREE from 'three';
import { SIZE, ZONE, ZONES } from '../world/constants.js';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { buildModel, variantOf } from './models.js';
import { GeoBuilder } from './geom.js';
import { kit, kitBox, kitReady } from './kit.js';

const HALF = SIZE / 2;
const ROT = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // [cos, sin] pour rot * 90°

/** Fusionne des calques de modèles (avec leur position) en une géométrie. */
export function mergeLayers(items) {
  let count = 0;
  for (const it of items) count += it.layer.count;
  if (!count) return null;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const it of items) {
    const L = it.layer;
    const [c, s] = ROT[it.rot & 3];
    const P = L.pos, Nn = L.nor, Cc = L.col;
    const n = L.count * 3;
    for (let k = 0; k < n; k += 3) {
      const px = P[k], py = P[k + 1], pz = P[k + 2];
      pos[o] = px * c + pz * s + it.cx;
      pos[o + 1] = py + (it.y || 0);
      pos[o + 2] = -px * s + pz * c + it.cz;
      const nx = Nn[k], nz = Nn[k + 2];
      nor[o] = nx * c + nz * s;
      nor[o + 1] = Nn[k + 1];
      nor[o + 2] = -nx * s + nz * c;
      col[o] = Cc[k];
      col[o + 1] = Cc[k + 1];
      col[o + 2] = Cc[k + 2];
      o += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function buildingCenter(b) {
  const [w, d] = sizeOf(BUILDINGS[b.type], b.rot);
  return { cx: b.x + w / 2 - HALF, cz: b.z + d / 2 - HALF, w, d };
}

export class BuildingView {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc35a, emissiveIntensity: 0 });
    this.zones = Array.from({ length: ZONES * ZONES }, () => ({ body: null, glass: null }));
    this.dirty = new Set();
    this.models = new Map();
    this.boxes = new Map();
    this.parts = new Map(); // id -> [{ group, inner, kind, axis, speed, amp, phase }]
    this.emitters = new Map(); // id -> [{ x, y, z, kind }]
    this.pops = new Map(); // id -> { group, t, dur, kind }
    this.season = 1;
    this.theme = 'mix';
    this.time = 0;
  }

  /** Thème de couleur des toits (boutique). */
  setTheme(theme) {
    theme = theme || 'mix';
    if (theme === this.theme) return;
    this.theme = theme;
    this.models.clear();
    if (!this.world) return;
    for (const b of this.world.buildings.values()) this.registerBuilding(b);
    for (let zi = 0; zi < ZONES * ZONES; zi++) this.dirty.add(zi);
  }

  setWorld(world, season) {
    this.world = world;
    this.season = season;
    this.clear();
    for (const b of world.buildings.values()) this.registerBuilding(b);
    for (let zi = 0; zi < ZONES * ZONES; zi++) this.dirty.add(zi);
    this.flush(true);
  }

  clear() {
    for (const z of this.zones) {
      for (const k of ['body', 'glass']) {
        if (z[k]) {
          this.group.remove(z[k]);
          z[k].geometry.dispose();
          z[k] = null;
        }
      }
    }
    for (const list of this.parts.values()) for (const p of list) this.group.remove(p.group);
    for (const p of this.pops.values()) {
      this.group.remove(p.group);
      if (p.stage) this.group.remove(p.stage);
    }
    this.parts.clear();
    this.emitters.clear();
    this.boxes.clear();
    this.pops.clear();
  }

  setSeason(season) {
    if (season === this.season) return;
    this.season = season;
    this.models.clear();
    for (const b of this.world.buildings.values()) this.registerBuilding(b);
    for (let zi = 0; zi < ZONES * ZONES; zi++) this.dirty.add(zi);
  }

  model(b) {
    const v = variantOf(b.id) & 15;
    const theme=b.appearance?.roof || this.theme;
    const key = `${b.type}|${b.level}|${v}|${this.season}|${theme}|${b.appearance?.facade}|${b.appearance?.garden}`;
    let m = this.models.get(key);
    if (!m) {
      m = buildModel(b.type, b.level, v, this.season, theme, { live: true, appearance: b.appearance });
      // boîte englobante locale
      const p = m.body.pos;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < p.length; k += 3) {
        if (p[k] < x0) x0 = p[k];
        if (p[k] > x1) x1 = p[k];
        if (p[k + 1] < y0) y0 = p[k + 1];
        if (p[k + 1] > y1) y1 = p[k + 1];
        if (p[k + 2] < z0) z0 = p[k + 2];
        if (p[k + 2] > z1) z1 = p[k + 2];
      }
      m.bbox = [x0, y0, z0, x1, y1, z1];
      this.models.set(key, m);
    }
    return m;
  }

  zoneOf(b) {
    return Math.floor(b.z / ZONE) * ZONES + Math.floor(b.x / ZONE);
  }

  /** Enregistre les pièces mobiles, émetteurs et la boîte de sélection d'un bâtiment. */
  registerBuilding(b) {
    this.unregisterParts(b.id);
    const m = this.model(b);
    const site = b.cons?.k === 'new'; // pas encore construit : ni fumée ni pièces mobiles
    const { cx, cz } = buildingCenter(b);
    const [c, s] = ROT[b.rot & 3];
    const tr = (px, pz) => [px * c + pz * s + cx, -px * s + pz * c + cz];
    // boîte englobante monde
    const [x0, y0, z0, x1, y1, z1] = m.bbox;
    const a = tr(x0, z0), bb = tr(x1, z1);
    this.boxes.set(b.id, new THREE.Box3(new THREE.Vector3(Math.min(a[0], bb[0]), y0, Math.min(a[1], bb[1])), new THREE.Vector3(Math.max(a[0], bb[0]), Math.max(y1, 0.3), Math.max(a[1], bb[1]))));
    // émetteurs (fumée, eau)
    if (m.emitters.length && !site) {
      this.emitters.set(b.id, m.emitters.map((e) => {
        const [wx, wz] = tr(e.pos[0], e.pos[2]);
        return { x: wx, y: e.pos[1], z: wz, kind: e.kind };
      }));
    } else this.emitters.delete(b.id);
    // pièces mobiles
    if (m.parts.length && !site) {
      const list = [];
      for (const p of m.parts) {
        const group = new THREE.Group();
        const [wx, wz] = tr(p.pivot[0], p.pivot[2]);
        group.position.set(wx, p.pivot[1], wz);
        group.rotation.y = (b.rot & 3) * (Math.PI / 2);
        const inner = new THREE.Group();
        group.add(inner);
        const geoB = mergeLayers([{ layer: p.body, cx: 0, cz: 0, rot: 0 }]);
        if (geoB) {
          const mesh = new THREE.Mesh(geoB, this.bodyMat);
          mesh.castShadow = true;
          inner.add(mesh);
        }
        this.group.add(group);
        list.push({ group, inner, kind: p.kind, axis: p.axis, speed: p.speed, amp: p.amp || 0, phase: (b.id * 1.7) % 6.28 });
      }
      this.parts.set(b.id, list);
    }
  }

  unregisterParts(id) {
    const list = this.parts.get(id);
    if (list) {
      for (const p of list) {
        this.group.remove(p.group);
        p.group.traverse((o) => o.geometry?.dispose());
      }
      this.parts.delete(id);
    }
  }

  onPlaced(b, opts = {}) {
    this.registerBuilding(b);
    // un chantier : c'est la vue des chantiers qui le montre
    if (!opts.silent && !b.cons) this.startPop(b, 'build');
    this.dirty.add(this.zoneOf(b));
  }

  /** Un chantier neuf n'apparaît pas dans la ville tant qu'il n'est pas fini. */
  hideForSite(b) {
    this.dirty.add(this.zoneOf(b));
  }

  /** Fin d'un chantier : le bâtiment entre dans la ville avec un petit rebond. */
  onCompleted(b) {
    this.registerBuilding(b);
    this.startPop(b, 'done');
    this.dirty.add(this.zoneOf(b));
  }

  onRemoved(b) {
    this.unregisterParts(b.id);
    this.emitters.delete(b.id);
    this.boxes.delete(b.id);
    const pop = this.pops.get(b.id);
    if (pop) {
      this.group.remove(pop.group);
      if (pop.stage) this.group.remove(pop.stage);
      this.pops.delete(b.id);
    }
    this.dirty.add(this.zoneOf(b));
  }

  onUpgraded(b, opts = {}) {
    this.registerBuilding(b);
    if (!opts.silent) this.startPop(b, opts.fromSite ? 'done' : 'upgrade');
    this.dirty.add(this.zoneOf(b));
  }

  onMoved(b, from) {
    this.registerBuilding(b);
    this.dirty.add(this.zoneOf(b));
    if (from) this.dirty.add(Math.floor(from.z / ZONE) * ZONES + Math.floor(from.x / ZONE));
    if (b.cons?.k !== 'new') this.startPop(b, 'move');
  }

  /** Géométrie d'un échafaudage (chantier) adaptée à l'emprise w × d. */
  stageGeo(name, w, d, season) {
    const key = `${name}|${w}|${d}|${season}`;
    this.stageCache = this.stageCache || new Map();
    let geo = this.stageCache.get(key);
    if (geo === undefined) {
      geo = null;
      if (kitReady()) {
        const g = new GeoBuilder();
        const [x0, , z0, x1, , z1] = kitBox(name);
        const n = Math.max(1, Math.round(Math.min(w, d)));
        const cw = w / Math.ceil(w / n), cd = d / Math.ceil(d / n);
        for (let i = 0; i < Math.ceil(w / n); i++) {
          for (let j = 0; j < Math.ceil(d / n); j++) {
            const s = Math.min((cw * 0.92) / (x1 - x0), (cd * 0.92) / (z1 - z0));
            const cx = -w / 2 + cw * (i + 0.5), cz = -d / 2 + cd * (j + 0.5);
            kit(g, name, { s, x: cx - ((x0 + x1) / 2) * s, z: cz - ((z0 + z1) / 2) * s, snow: season === 3 ? 0.6 : 0 });
          }
        }
        geo = mergeLayers([{ layer: g.body, cx: 0, cz: 0, rot: 0 }]);
      }
      this.stageCache.set(key, geo);
    }
    return geo;
  }

  /** Animation : chantier (échafaudages) puis le bâtiment « pousse » du sol. */
  startPop(b, kind) {
    const old = this.pops.get(b.id);
    if (old) {
      this.group.remove(old.group);
      if (old.stage) this.group.remove(old.stage);
    }
    const m = this.model(b);
    const { cx, cz, w, d } = buildingCenter(b);
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    const gb = mergeLayers([{ layer: m.body, cx: 0, cz: 0, rot: b.rot }]);
    const gg = mergeLayers([{ layer: m.glass, cx: 0, cz: 0, rot: b.rot }]);
    if (gb) {
      const mesh = new THREE.Mesh(gb, this.bodyMat);
      mesh.castShadow = true;
      group.add(mesh);
    }
    if (gg) group.add(new THREE.Mesh(gg, this.glassMat));
    group.scale.set(1, kind === 'done' ? 0.86 : 0.01, 1);
    this.group.add(group);
    const pop = { group, t: 0, dur: kind === 'build' ? 0.55 : kind === 'done' ? 0.5 : 0.45, kind, delay: 0, cx, cz, w, d };
    // échafaudages : trois étapes pour une construction, un échafaudage pour une amélioration
    const big = w * d >= 4;
    if (kind === 'build' && kitReady()) {
      pop.stages = ['stage_A', 'stage_B', 'stage_C'].map((n) => this.stageGeo(n, w, d, this.season)).filter(Boolean);
      pop.delay = pop.stages.length ? (big ? 1.1 : 0.85) : 0;
    } else if (kind === 'upgrade' && kitReady()) {
      pop.stages = [this.stageGeo('scaffolding', w, d, this.season)].filter(Boolean);
      pop.delay = pop.stages.length ? 0.5 : 0;
    }
    if (pop.stages?.length) {
      pop.stage = new THREE.Mesh(pop.stages[0], this.bodyMat);
      pop.stage.castShadow = true;
      pop.stage.position.set(cx, 0, cz);
      pop.stage.scale.set(1, 0.01, 1);
      pop.stageIdx = 0;
      this.group.add(pop.stage);
      group.visible = kind !== 'build';
      if (kind === 'upgrade') group.scale.set(1, 1, 1);
    }
    this.pops.set(b.id, pop);
  }

  flush(all = false) {
    let n = 0;
    for (const zi of [...this.dirty]) {
      this.rebuildZone(zi);
      this.dirty.delete(zi);
      if (!all && ++n >= 4) break;
    }
  }

  rebuildZone(zi) {
    const items = [];
    const glass = [];
    for (const b of this.world.buildings.values()) {
      if (this.zoneOf(b) !== zi || this.pops.has(b.id) || b.cons?.k === 'new') continue;
      const m = this.model(b);
      const { cx, cz } = buildingCenter(b);
      items.push({ layer: m.body, cx, cz, rot: b.rot });
      if (m.glass.count) glass.push({ layer: m.glass, cx, cz, rot: b.rot });
    }
    const z = this.zones[zi];
    for (const k of ['body', 'glass']) {
      if (z[k]) {
        this.group.remove(z[k]);
        z[k].geometry.dispose();
        z[k] = null;
      }
    }
    const gb = mergeLayers(items);
    if (gb) {
      z.body = new THREE.Mesh(gb, this.bodyMat);
      z.body.castShadow = true;
      z.body.receiveShadow = true;
      this.group.add(z.body);
    }
    const gg = mergeLayers(glass);
    if (gg) {
      z.glass = new THREE.Mesh(gg, this.glassMat);
      z.glass.receiveShadow = true;
      this.group.add(z.glass);
    }
  }

  update(dt, night, speed) {
    this.time += dt;
    this.glassMat.emissiveIntensity = night * 1.1;
    // animations de construction
    for (const [id, p] of this.pops) {
      p.t += dt;
      if (p.stage) {
        const n = p.stages.length;
        if (p.t < p.delay) {
          // chantier : chaque étape apparaît à son tour
          const per = p.delay / n;
          const idx = Math.min(n - 1, Math.floor(p.t / per));
          if (idx !== p.stageIdx) {
            p.stageIdx = idx;
            p.stage.geometry = p.stages[idx];
            this.r.particles?.emit('dust', p.cx, 0.15, p.cz, 10);
            this.r.game?.sound?.play?.('hammer');
          }
          const k = Math.min(1, (p.t - idx * per) / Math.min(0.18, per));
          const sy = p.kind === 'upgrade' ? Math.min(1, p.t / 0.15) : 0.2 + 0.8 * (1 - Math.pow(1 - k, 3));
          p.stage.scale.set(1, Math.max(0.01, sy), 1);
          if (p.kind === 'upgrade') p.group.scale.set(1, 1 - 0.04 * Math.sin(p.t * 30), 1);
          continue;
        }
        // fin du chantier
        this.group.remove(p.stage);
        p.stage = null;
        p.group.visible = true;
        p.group.scale.set(1, 0.01, 1);
        p.t = 0;
        this.r.particles?.emit('sparkle', p.cx, 0.4, p.cz, 16);
      }
      const k = Math.min(1, p.t / p.dur);
      let sy;
      if (p.kind === 'build' || p.kind === 'upgrade') {
        const c1 = 1.70158, c3 = c1 + 1;
        sy = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); // easeOutBack
      } else if (p.kind === 'done') {
        // inauguration : un petit rebond vers le haut
        const c1 = 2.6, c3 = c1 + 1;
        sy = 0.86 + 0.14 * (1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
      } else sy = 1 + Math.sin(k * Math.PI) * 0.12;
      const grow = p.kind === 'build' || p.kind === 'upgrade' || p.kind === 'done';
      p.group.scale.set(grow ? 0.9 + 0.1 * k : 1 + Math.sin(k * Math.PI) * 0.05, Math.max(0.01, sy), grow ? 0.9 + 0.1 * k : 1 + Math.sin(k * Math.PI) * 0.05);
      if (k >= 1) {
        this.pops.delete(id);
        const b = this.world.buildings.get(id);
        if (b) this.rebuildZone(this.zoneOf(b));
        this.group.remove(p.group);
        p.group.traverse((o) => o.geometry?.dispose());
      }
    }
    // pièces mobiles
    for (const list of this.parts.values()) {
      for (const p of list) {
        if (p.kind === 'spin') {
          const v = p.speed * dt * (speed > 0 ? 1 : 0.15);
          if (p.axis === 'z') p.inner.rotation.z += v;
          else if (p.axis === 'y') p.inner.rotation.y += v;
          else p.inner.rotation.x += v;
        } else {
          p.inner.rotation.y = Math.sin(this.time * p.speed + p.phase) * p.amp - 0.2;
        }
      }
    }
    this.flush();
  }

  /** Bâtiment touché par un rayon (le plus proche). */
  pick(ray) {
    let best = null, bestD = Infinity;
    const hit = new THREE.Vector3();
    for (const [id, box] of this.boxes) {
      if (ray.intersectBox(box, hit)) {
        const d = hit.distanceToSquared(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best;
  }
}
