// Caméra de la maquette : déplacer, zoomer, pivoter (au doigt ou à la souris), avec inertie.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { SIZE } from '../world/constants.js';

const HALF = SIZE / 2;
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.distance = 22;
    this.minDist = 6;
    this.maxDist = 62;
    this.azimuth = Math.PI / 4; // vue depuis le sud-est
    this.vel = new THREE.Vector2();
    this.bounds = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.fly = null;
    this.autoOrbit = 0; // vitesse de rotation automatique (écran d'accueil)
    this.update(0);
  }

  get pitch() {
    const t = (this.distance - this.minDist) / (this.maxDist - this.minDist);
    return lerp(0.62, 1.08, Math.pow(clamp(t, 0, 1), 0.7));
  }

  setBounds(b) {
    this.bounds = b;
    this.clampTarget();
  }

  clampTarget() {
    const m = 3;
    this.target.x = clamp(this.target.x, this.bounds.x0 - m, this.bounds.x1 + m);
    this.target.z = clamp(this.target.z, this.bounds.z0 - m, this.bounds.z1 + m);
  }

  update(dt) {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      this.target.lerpVectors(f.from, f.to, e);
      this.distance = lerp(f.d0, f.d1, e);
      if (f.az1 != null) this.azimuth = lerp(f.az0, f.az1, e);
      if (f.t >= 1) this.fly = null;
    } else if (this.vel.lengthSq() > 1e-6) {
      this.target.x += this.vel.x * dt;
      this.target.z += this.vel.y * dt;
      this.vel.multiplyScalar(Math.pow(0.04, dt));
      this.clampTarget();
    }
    if (this.autoOrbit) this.azimuth += this.autoOrbit * dt;
    const p = this.pitch;
    const d = this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * Math.cos(p) * d,
      this.target.y + Math.sin(p) * d,
      this.target.z + Math.cos(this.azimuth) * Math.cos(p) * d,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Point du sol sous un point de l'écran (coordonnées client). */
  screenToGround(cx, cy, out = new THREE.Vector3()) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(ground, out);
  }

  rayFrom(cx, cy) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray;
  }

  /** Fait glisser la carte pour que le point `prevWorld` passe sous l'écran (cx, cy). */
  dragTo(prevWorld, cx, cy) {
    this.camera.updateMatrixWorld();
    const now = this.screenToGround(cx, cy);
    if (!now || !prevWorld) return;
    this.target.x += prevWorld.x - now.x;
    this.target.z += prevWorld.z - now.z;
    this.clampTarget();
    this.update(0);
  }

  zoomAt(factor, cx, cy) {
    this.fly = null;
    const before = cx != null ? this.screenToGround(cx, cy) : null;
    this.distance = clamp(this.distance / factor, this.minDist, this.maxDist);
    this.update(0);
    if (before) {
      this.camera.updateMatrixWorld();
      const after = this.screenToGround(cx, cy);
      if (after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this.clampTarget();
        this.update(0);
      }
    }
  }

  rotate(delta, cx, cy) {
    this.fly = null;
    const before = cx != null ? this.screenToGround(cx, cy) : null;
    this.azimuth += delta;
    this.update(0);
    if (before) {
      this.camera.updateMatrixWorld();
      const after = this.screenToGround(cx, cy);
      if (after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this.clampTarget();
        this.update(0);
      }
    }
  }

  flyTo(x, z, distance = this.distance, dur = 0.7, azimuth = null) {
    this.vel.set(0, 0);
    this.fly = {
      t: 0, dur,
      from: this.target.clone(), to: new THREE.Vector3(x, 0, z),
      d0: this.distance, d1: clamp(distance, this.minDist, this.maxDist),
      az0: this.azimuth, az1: azimuth,
    };
  }

  /** Vise le centre d'une case de la carte. */
  flyToTile(tx, tz, distance, dur) {
    this.flyTo(tx - HALF, tz - HALF, distance, dur);
  }
}
