// Le train de la Gare. Quand la Gare est construite, une voie ferrée part de ses quais des deux
// côtés : elle traverse les prés (les arbres s'écartent), passe les routes par un passage à niveau
// et l'eau sur un petit pont, puis s'enfonce dans un tunnel (au pied d'une colline, d'une montagne
// ou d'un bâtiment qui la bloque). Régulièrement, un train à vapeur sort d'un tunnel en sifflant,
// ralentit, s'arrête à quai (des voyageurs descendent), puis repart vers l'autre tunnel.
import * as THREE from 'three';
import { SIZE, T } from '../world/constants.js';
import { GeoBuilder, shade } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { localToWorld } from '../sim/Villagers.js';

const HALF = SIZE / 2;
const MAX_TILES = 8; // longueur de voie de chaque côté de la gare (cases)
const RAIL_Y = 0.07; // dessus des rails (comme dans la gare)
const LOCO_LEN = 0.9, COACH_LEN = 0.74, GAP = 0.06, COACHES = 3;
const VMAX = 1.5, ACC = 0.5;

/** Voiture de voyageurs (repère : avant vers +z). */
function coachGeo(color) {
  const g = new GeoBuilder();
  const L = COACH_LEN, W = 0.34;
  // châssis et roues
  g.box(0, 0.035, 0, W * 0.8, 0.04, L * 0.92, 0x2b2b30);
  for (const z of [-L * 0.32, L * 0.32]) for (const x of [-0.11, 0.11]) g.cylX(x, 0.045, z, 0.04, 0.03, 8, 0x3a3a40, 0x8a8a90);
  // caisse
  g.box(0, 0.075, 0, W, 0.24, L * 0.9, { top: 0xe8e2d6, side: color, front: shade(color, 0.9), back: shade(color, 0.9) });
  g.box(0, 0.3, 0, W * 0.96, 0.03, L * 0.86, 0xf4efe4);
  // fenêtres (s'allument la nuit)
  g.layer('glass');
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) g.box(s * (W / 2 + 0.001), 0.19, -L * 0.33 + k * L * 0.22, 0.004, 0.07, 0.11, 0xbfd4e6);
  g.layer('body');
  // toit arrondi
  g.roofZ(0, 0.33, 0, W * 1.04, L * 0.92, 0.06, 0, 0x5b6475, 0x4a5262);
  // soufflets
  g.box(0, 0.12, L * 0.47, W * 0.7, 0.18, 0.04, 0x3a3a40);
  g.box(0, 0.12, -L * 0.47, W * 0.7, 0.18, 0.04, 0x3a3a40);
  return { body: toGeometry(g.body), glass: toGeometry(g.glass) };
}

export class Train {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.trackGroup = new THREE.Group();
    this.group.add(this.trackGroup);
    this.key = '';
    this.line = null;
    this.railMask = new Uint8Array(SIZE * SIZE);
    this.matFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.planeA = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    this.planeB = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.carMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, clippingPlanes: [this.planeA, this.planeB], clipShadows: true });
    this.carMatSmooth = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: [this.planeA, this.planeB], clipShadows: true });
    this.glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc35a, emissiveIntensity: 0, clippingPlanes: [this.planeA, this.planeB] });
    this.cars = null;
    this.state = 'away';
    this.timer = 6;
    this.dirSign = 1;
    this.s = -10;
    this.v = 0;
    this.time = 0;
    this.smokeAcc = 0;
    this.chuffAcc = 0;
  }

  get world() {
    return this.r.world;
  }

  station() {
    for (const b of this.world.buildings.values()) if (b.type === 'station' && b.cons?.k !== 'new') return b;
    return null;
  }

  /* ───────── La voie ───────── */
  /** Cases traversées par la voie, de chaque côté de la gare. */
  compute(b) {
    const w = this.world;
    const side = (sgn) => {
      const tiles = [];
      let end = 'limit';
      for (let k = 0; k < MAX_TILES; k++) {
        const [x, z] = localToWorld(b, sgn * (2 + k), -0.75);
        const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
        if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) {
          end = 'edge';
          break;
        }
        const i = tz * SIZE + tx;
        const t = w.terrain[i];
        if ((w.occ[i] >= 0 && w.occ[i] !== b.id) || t === T.MOUNTAIN) {
          end = 'blocked';
          break;
        }
        tiles.push({ i, x: tx, z: tz, kind: w.road[i] ? 'road' : t === T.WATER || t === T.DEEP ? 'water' : 'land' });
      }
      return { tiles, end };
    };
    const A = side(-1), B = side(1);
    // la voie s'arrête au tunnel : le portail est posé sur la dernière case de terre
    const trim = (s) => {
      while (s.tiles.length && s.tiles[s.tiles.length - 1].kind !== 'land') s.tiles.pop();
      return s;
    };
    trim(A);
    trim(B);
    const ext = (n) => 1.5 + n; // distance (locale) du centre de la gare au bout de voie
    const pa = localToWorld(b, -ext(A.tiles.length), -0.75), pb = localToWorld(b, ext(B.tiles.length), -0.75);
    const dir = [pb[0] - pa[0], pb[1] - pa[1]];
    const len = Math.hypot(dir[0], dir[1]);
    dir[0] /= len;
    dir[1] /= len;
    const mid = localToWorld(b, 0, -0.75);
    return { b, A, B, pa, pb, dir, len, stop: (mid[0] - pa[0]) * dir[0] + (mid[1] - pa[1]) * dir[1] };
  }

  /** Reconstruit la voie (rails, traverses, pont, passage à niveau, tunnels). */
  build(line) {
    for (const o of [...this.trackGroup.children]) {
      this.trackGroup.remove(o);
      o.geometry?.dispose();
    }
    const old = this.railMask.slice();
    this.railMask.fill(0);
    this.line = line;
    if (!line) {
      this.markVeg(old);
      return;
    }
    const g = new GeoBuilder();
    const { pa, dir, len } = line;
    const yaw = Math.atan2(dir[0], dir[1]);
    const winter = this.r.season === 3;
    const tileKind = new Map();
    for (const t of [...line.A.tiles, ...line.B.tiles]) {
      tileKind.set(t.i, t.kind);
      if (t.kind === 'land') this.railMask[t.i] = 1;
    }
    // les cases voisines de la voie : pas d'arbres ni de rochers qui débordent sur les rails
    const side = (n, sgn) => {
      for (let k = 0; k < n; k++) {
        for (const pz of [-1.25, 0.5]) {
          const [x, z] = localToWorld(line.b, sgn * (2 + k), pz);
          const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
          if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) continue;
          const i = tz * SIZE + tx;
          if (!this.railMask[i] && this.world.occ[i] < 0) this.railMask[i] = 2;
        }
      }
    };
    side(line.A.tiles.length, -1);
    side(line.B.tiles.length, 1);
    // la voie, par tronçons de 0,25
    const step = 0.25;
    for (let s = 0; s < len; s += step) {
      const cx = pa[0] + dir[0] * (s + step / 2), cz = pa[1] + dir[1] * (s + step / 2);
      const ti = Math.floor(cz + HALF) * SIZE + Math.floor(cx + HALF);
      const kind = tileKind.get(ti);
      const inStation = !kind;
      g.push(yaw, cx, 0, cz);
      if (kind === 'water') {
        // pont : tablier de bois, garde-corps et piles
        g.box(0, 0.01, 0, 0.44, 0.035, step + 0.002, 0x8a5f3a);
        if (Math.round(s / step) % 2 === 0) for (const x of [-0.17, 0.17]) g.box(x, -0.3, 0, 0.05, 0.31, 0.05, 0x6e4a2f);
        for (const x of [-0.21, 0.21]) {
          g.box(x, 0.045, 0, 0.02, 0.012, step + 0.002, 0x6e4a2f);
          g.box(x, 0.11, 0, 0.02, 0.014, step + 0.002, 0x6e4a2f);
          if (Math.round(s / step) % 2 === 0) g.box(x, 0.045, 0, 0.02, 0.07, 0.02, 0x6e4a2f);
        }
      } else if (kind === 'road') {
        g.box(0, 0.02, 0, 0.36, 0.028, step + 0.002, 0x8a6a48); // passage à niveau en planches
      } else if (!inStation) {
        g.box(0, 0, 0, 0.36, 0.042, step + 0.002, winter ? 0xd8d4cc : 0x9a948a); // ballast
      }
      if (!inStation) {
        if (kind !== 'road') g.box(0, 0.04, 0, 0.3, 0.01, 0.05, 0x6e4a2f); // traverse
        for (const x of [-0.1, 0.1]) g.box(x, 0.05, 0, 0.025, 0.02, step + 0.002, 0x8a8f96);
      }
      g.pop();
    }
    // tunnels : une petite colline et l'entrée en pierre, tournées vers la gare
    const portal = (p, facing) => {
      g.push(yaw + (facing < 0 ? Math.PI : 0), p[0], 0, p[1]);
      const grass = winter ? 0xe9eef0 : 0x6fa83b, rock = winter ? 0xd8dcdf : 0x8f8a80;
      g.dome(0, 0, -0.35, 0.62, grass, 12, 4, 0.75);
      g.ico(0.25, 0.25, -0.5, 0.18, rock, 0.8, 0.25, 3);
      g.ico(-0.3, 0.18, -0.55, 0.14, shade(rock, 0.9), 0.8, 0.25, 7);
      // arche
      g.box(0, 0, 0.02, 0.56, 0.42, 0.12, { top: 0xb7b2a8, side: 0xa8a296, front: 0xb7b2a8 });
      g.box(0, 0.42, 0.02, 0.62, 0.05, 0.14, 0x9a948a);
      g.box(0, 0.0, 0.085, 0.36, 0.34, 0.01, 0x1c1a1e); // le noir du tunnel
      g.cylZ(0, 0.34, 0.085, 0.18, 0.012, 10, 0x1c1a1e, 0x1c1a1e);
      g.pop();
    };
    portal(line.pa, 1);
    portal(line.pb, -1);
    const mesh = new THREE.Mesh(toGeometry(g.body), this.mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.trackGroup.add(mesh);
    // le train disparaît dans les tunnels
    const A = new THREE.Vector3(line.pa[0], 0, line.pa[1]), B = new THREE.Vector3(line.pb[0], 0, line.pb[1]);
    const d = new THREE.Vector3(dir[0], 0, dir[1]);
    this.planeA.setFromNormalAndCoplanarPoint(d, A.clone().addScaledVector(d, -0.05));
    this.planeB.setFromNormalAndCoplanarPoint(d.clone().negate(), B.clone().addScaledVector(d, 0.05));
    this.markVeg(old);
  }

  /** Les arbres s'écartent de la voie (et reviennent si elle disparaît). */
  markVeg(old) {
    const changed = [];
    for (let i = 0; i < old.length; i++) if (old[i] !== this.railMask[i]) changed.push(i);
    if (changed.length) this.r.vegetation?.markTiles(changed);
  }

  makeCars() {
    const lib = this.r.crowd?.lib;
    if (!lib?.statics.loco) return null;
    const cars = [];
    const loco = new THREE.Mesh(lib.statics.loco, this.carMat);
    loco.castShadow = true;
    cars.push({ mesh: loco, off: LOCO_LEN / 2, loco: true });
    const colors = [0x2e6b4a, 0x8a2b2b, 0x2e4f7a];
    for (let k = 0; k < COACHES; k++) {
      const geo = coachGeo(colors[k % colors.length]);
      const m = new THREE.Mesh(geo.body, this.carMatSmooth);
      m.castShadow = true;
      m.add(new THREE.Mesh(geo.glass, this.glassMat));
      cars.push({ mesh: m, off: LOCO_LEN + GAP + COACH_LEN * (k + 0.5) + GAP * k });
    }
    for (const c of cars) {
      c.mesh.visible = false;
      this.group.add(c.mesh);
    }
    this.trainLen = LOCO_LEN + COACHES * (COACH_LEN + GAP) + GAP;
    return cars;
  }

  /* ───────── Chaque image ───────── */
  update(dt, speed) {
    const w = this.world;
    if (!w || !this.r.crowd) return;
    this.time += dt;
    const b = this.station();
    const key = b ? `${b.id}|${b.x}|${b.z}|${b.rot}|${w.version}|${this.r.season}` : '';
    if (key !== this.key) {
      this.key = key;
      const line = b ? this.compute(b) : null;
      this.build(line);
      if (!line) this.hide();
    }
    if (!this.line) return;
    if (!this.cars) this.cars = this.makeCars();
    if (!this.cars) return;
    const sp = Math.max(0, Math.min(3, speed));
    const step = dt * sp;
    const L = this.line.len, stop = this.line.stop;
    // le train roule dans un sens ou dans l'autre ; s = position de la locomotive (avant)
    switch (this.state) {
      case 'away':
        this.timer -= step;
        if (this.timer <= 0) {
          this.state = 'arrive';
          this.dirSign = -this.dirSign;
          this.s = -0.3;
          this.v = VMAX;
          this.whistle();
        }
        break;
      case 'arrive': {
        // freinage pour s'arrêter avec la gare au milieu du train
        const target = stop + this.trainLen / 2;
        const d = target - this.s;
        this.v = Math.min(VMAX, Math.sqrt(Math.max(0, 2 * ACC * d)) + 0.02);
        this.s += this.v * step;
        if (d <= 0.01) {
          this.s = target;
          this.v = 0;
          this.state = 'stop';
          this.timer = 9;
          this.travellers();
        }
        break;
      }
      case 'stop':
        this.timer -= step;
        if (this.timer <= 0) {
          this.state = 'leave';
          this.whistle();
        }
        break;
      case 'leave':
        this.v = Math.min(VMAX, this.v + ACC * step);
        this.s += this.v * step;
        if (this.s - this.trainLen > L + 0.3) {
          this.state = 'away';
          this.timer = 30 + Math.random() * 30;
        }
        break;
      default:
    }
    this.place(dt);
  }

  /** Des voyageurs descendent, d'autres montent (seulement si on regarde la gare). */
  travellers() {
    const { b, dir } = this.line;
    const cam = this.r.cam;
    const mid = localToWorld(b, 0, -0.75);
    if ((mid[0] - cam.target.x) ** 2 + (mid[1] - cam.target.z) ** 2 > 30 * 30) return;
    const xs = [];
    for (const c of this.cars) {
      if (c.loco) continue;
      xs.push((c.mesh.position.x - mid[0]) * dir[0] + (c.mesh.position.z - mid[1]) * dir[1]);
    }
    this.r.people.trainTravellers?.(b, xs);
  }

  hide() {
    if (this.cars) for (const c of this.cars) c.mesh.visible = false;
  }

  /** Place les voitures le long de la voie (dans le sens de la marche). */
  place(dt) {
    const { pa, pb, dir, len } = this.line;
    const away = this.state === 'away';
    const sgn = this.dirSign;
    const yaw = Math.atan2(dir[0], dir[1]) + (sgn < 0 ? Math.PI : 0);
    const bob = this.v > 0.05 ? Math.sin(this.time * 18) * 0.002 : 0;
    for (const c of this.cars) {
      const s = this.s - c.off;
      c.mesh.visible = !away && s > -0.6 && s < len + 0.6;
      if (!c.mesh.visible) continue;
      const base = sgn > 0 ? pa : pb;
      const x = base[0] + dir[0] * s * sgn, z = base[1] + dir[1] * s * sgn;
      c.mesh.position.set(x, RAIL_Y + bob, z);
      c.mesh.rotation.set(0, yaw, 0);
    }
    this.glassMat.emissiveIntensity = (this.r.night || 0) * 1.1;
    if (away) return;
    // fumée et bruit de la locomotive
    const lc = this.cars[0].mesh;
    if (!lc.visible) return;
    const cam = this.r.cam.target;
    const near = (lc.position.x - cam.x) ** 2 + (lc.position.z - cam.z) ** 2 < 600;
    this.smokeAcc += dt * (this.v > 0.05 ? 10 : 2);
    while (this.smokeAcc > 1) {
      this.smokeAcc -= 1;
      const fx = lc.position.x + Math.sin(yaw) * 0.28, fz = lc.position.z + Math.cos(yaw) * 0.28;
      if (near && this.inside(fx, fz)) this.r.particles.emit('smoke', fx, 0.62, fz, 1);
    }
    if (near && this.v > 0.1) {
      this.chuffAcc += dt * this.v * 2.2;
      if (this.chuffAcc > 1) {
        this.chuffAcc = 0;
        if (this.r.cam.distance < 22) this.r.game.sound?.play('chuff');
      }
    }
    void pb;
  }

  /** Le point est-il entre les deux tunnels ? */
  inside(x, z) {
    const { pa, dir, len } = this.line;
    const s = (x - pa[0]) * dir[0] + (z - pa[1]) * dir[1];
    return s > 0 && s < len;
  }

  whistle() {
    const cam = this.r.cam;
    const b = this.line?.b;
    if (!b || cam.distance > 30) return;
    const c = this.world.centerOf(b);
    if ((c.cx - HALF - cam.target.x) ** 2 + (c.cz - HALF - cam.target.z) ** 2 > 900) return;
    this.r.game.sound?.play('whistle');
  }
}
