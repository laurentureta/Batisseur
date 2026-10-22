// La cinématique d'introduction. La caméra part au-dessus d'une mer de nuages au lever du soleil,
// descend à travers les nuages, découvre la campagne (forêts, montagnes, la rivière), longe la
// rivière, survole les toits, passe au ras de la grand-rue devant la mairie, au milieu des
// habitants et des animaux, puis s'élève vers la vue d'accueil pendant que le titre apparaît.
// La dernière image est exactement la vue de l'écran d'accueil : on rend la main sans à-coup.
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { kit, kitReady } from './kit.js';
import { toGeometry } from './TerrainView.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Point sur une courbe de Catmull-Rom (uniforme) passant par les points p. */
function catmull(p, u, out) {
  const n = p.length - 1;
  const s = Math.min(n - 1e-6, Math.max(0, u)) ;
  const i = Math.floor(s), t = s - i;
  const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[Math.min(n, i + 1)], p3 = p[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

export class Cinematic {
  constructor(renderer) {
    this.r = renderer;
    this.active = false;
    this.pos = [0, 0, 0];
    this.look = [0, 0, 0];
    this.v = new THREE.Vector3();
  }

  /**
   * Le plan de vol (repère de la scène, centré sur la mairie du village d'accueil).
   * end : vue finale (celle de l'écran d'accueil).
   */
  plan(end) {
    const K = [
      // au-dessus des nuages, face au soleil levant
      { t: 0, p: [-46, 80, -126], l: [24, 80.5, -96] },
      { t: 5.5, p: [-28, 77, -104], l: [40, 68, -72] },
      // la descente à travers la mer de nuages
      { t: 9.5, p: [-8, 56, -80], l: [16, 22, -42] },
      { t: 12.5, p: [7, 32, -60], l: [16, 0, -30] },
      // la campagne : la rivière, les forêts, le lac
      { t: 15.5, p: [17, 15, -46], l: [15, 0, -22] },
      { t: 19, p: [17, 7.5, -28], l: [11, 0, -9] },
      // les premiers toits
      { t: 22, p: [13.5, 4.2, -12], l: [5, 0, -1] },
      { t: 24.5, p: [8.5, 2.1, -0.4], l: [1, 0.35, 1.2] },
      // la grand-rue, devant la mairie, au milieu des habitants
      { t: 27, p: [3.8, 1.65, 1.6], l: [-4, 0.5, 1.0] },
      // on s'élève vers la vue d'accueil
      { t: 30, p: [7.5, 7.5, 8.5], l: [end.l[0], end.l[1], end.l[2]] },
      { t: 34, p: end.p, l: end.l },
    ];
    return K;
  }

  /** Lance la cinématique. */
  start({ end, onTitle, onEnd, quality = 'high' }) {
    this.K = this.plan(end);
    this.dur = this.K[this.K.length - 1].t;
    this.t = 0;
    this.active = true;
    this.onTitle = onTitle;
    this.onEnd = onEnd;
    this.titled = false;
    this.paused = false;
    this.buildClouds(quality);
    // repères de temps → indice de la courbe (vitesse réglée par les temps des clés)
    this.ts = this.K.map((k) => k.t);
    this.P = this.K.map((k) => k.p);
    this.L = this.K.map((k) => k.l);
    this.r.cam.cinematic = true;
    this.update(0);
  }

  /** Mer de nuages : des centaines de nuages KayKit en couche épaisse sous la caméra. */
  buildClouds(quality) {
    this.clearClouds();
    if (!kitReady()) return;
    const geos = ['cloud_big', 'cloud_small'].map((n) => {
      const g = new GeoBuilder();
      kit(g, n, { ao: 0 });
      return toGeometry(g.body);
    });
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, emissive: 0xfff3e4, emissiveIntensity: 0.46, fog: true });
    const n = quality === 'low' ? 200 : quality === 'medium' ? 340 : 460;
    const group = new THREE.Group();
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const meshes = geos.map((geo) => {
      const m = new THREE.InstancedMesh(geo, this.cloudMat, n);
      m.count = 0;
      m.frustumCulled = false;
      group.add(m);
      return m;
    });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.cloudItems = [];
    for (let k = 0; k < n; k++) {
      // plus dense autour du chemin de descente, plus clairsemé vers l'horizon
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.75) * 170;
      const x = Math.cos(a) * rr - 5, z = Math.sin(a) * rr - 70;
      // quelques gros cumulus qui dépassent de la mer de nuages
      const tower = rnd() < 0.08;
      const y = 29 + rnd() * 8 + (rr > 110 ? (rr - 110) * 0.06 : 0) + (tower ? 4 + rnd() * 5 : 0);
      const s = (5.5 + rnd() * 7 + rr * 0.02) * (tower ? 1.5 : 1);
      const mesh = meshes[k % 2];
      Q.setFromAxisAngle(up, rnd() * 6.28);
      S.set(s * (0.9 + rnd() * 0.5), s * (0.55 + rnd() * 0.35), s * (0.9 + rnd() * 0.5));
      V.set(x, y, z);
      M.compose(V, Q, S);
      mesh.setMatrixAt(mesh.count++, M);
      this.cloudItems.push({ mesh, i: mesh.count - 1, x, y, z, q: Q.clone(), s: S.clone(), drift: 0.4 + rnd() * 0.6 });
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    this.cloudGroup = group;
    this.r.scene.add(group);
  }

  clearClouds() {
    if (!this.cloudGroup) return;
    this.r.scene.remove(this.cloudGroup);
    this.cloudGroup.traverse((o) => o.geometry?.dispose());
    this.cloudMat?.dispose();
    this.cloudGroup = null;
  }

  /** Fin (ou saut) de la cinématique : on remet la caméra normale. */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.clearClouds();
    this.r.cam.cinematic = false;
    this.r.hourOverride = null;
    this.r.fogOverride = null;
    this.r.cam.update(0);
  }

  /** Avance la cinématique et place la caméra. Renvoie l'état utile à l'interface. */
  update(dt) {
    if (!this.active) return null;
    if (this.paused) dt = 0;
    this.t = Math.min(this.dur, this.t + dt);
    const t = this.t;
    // indice de courbe : on cherche le segment de clés, avec une vitesse douce dans chaque segment
    const ts = this.ts;
    let i = 0;
    while (i < ts.length - 2 && t >= ts[i + 1]) i++;
    const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
    // départ et arrivée en douceur, vitesse continue entre les segments
    const ease = i === 0 ? f * f * (3 - 2 * f) * 0.5 + f * 0.5 : i === ts.length - 2 ? 1 - Math.pow(1 - f, 2.2) : f;
    const u = i + ease;
    catmull(this.P, u, this.pos);
    catmull(this.L, u, this.look);
    const cam = this.r.cam;
    const camera = this.r.camera;
    camera.position.set(this.pos[0], this.pos[1], this.pos[2]);
    camera.lookAt(this.look[0], this.look[1], this.look[2]);
    camera.updateMatrixWorld();
    // le reste du moteur (ombres, détails, habitants) suit le point regardé
    cam.target.set(this.look[0], 0, this.look[2]);
    cam.distance = Math.max(4, Math.min(72, Math.hypot(this.pos[0] - this.look[0], this.pos[1] - this.look[1], this.pos[2] - this.look[2])));
    const y = this.pos[1];
    // lumière : du lever du soleil au matin
    this.r.hourOverride = 5.5 + (8.55 - 5.5) * (0.65 * smooth(0, this.dur, t) + 0.35 * Math.min(1, t / this.dur));
    // brume : très loin au-dessus des nuages, comme d'habitude près du sol
    const hi = smooth(10, 40, y);
    this.r.fogOverride = { near: 40 + hi * 70, far: 120 + hi * 300 };
    // la mer de nuages s'efface une fois passée
    if (this.cloudMat) {
      const fade = smooth(22, 30, y);
      this.cloudMat.opacity = fade;
      this.cloudGroup.visible = fade > 0.01;
      // les nuages dérivent doucement
      if (this.cloudGroup.visible && dt > 0) {
        const M = new THREE.Matrix4(), V = new THREE.Vector3();
        for (const c of this.cloudItems) {
          c.x += c.drift * dt * 0.6;
          V.set(c.x, c.y + Math.sin(t * 0.4 + c.drift * 9) * 0.3, c.z);
          M.compose(V, c.q, c.s);
          c.mesh.setMatrixAt(c.i, M);
        }
        for (const m of this.cloudGroup.children) m.instanceMatrix.needsUpdate = true;
      }
    }
    // voile blanc en traversant les nuages
    const white = Math.max(0, 1 - Math.abs(y - 33) / 6.5) * 0.92;
    // soleil à l'écran (halo)
    this.v.copy(this.r.sky.sun.position).sub(this.r.sky.sun.target.position).normalize().multiplyScalar(300).add(camera.position);
    this.v.project(camera);
    const sun = { x: this.v.x, y: this.v.y, visible: this.v.z < 1 && Math.abs(this.v.x) < 1.6 && Math.abs(this.v.y) < 1.6, strength: smooth(18, 60, y) };
    if (!this.titled && t >= 28.2) {
      this.titled = true;
      this.onTitle?.();
    }
    const done = t >= this.dur;
    return { t, dur: this.dur, y, white, sun, done };
  }
}
