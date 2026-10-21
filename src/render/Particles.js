// Particules : fumée, poussière, étincelles, feu, eau, neige, pluie.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float size;
attribute vec4 rgba;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = vColor.a * (1.0 - smoothstep(0.1, 0.25, d));
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const PRESETS = {
  smoke: { color: [0.78, 0.78, 0.8], alpha: [0.5, 0], size: [0.1, 0.38], life: 2.4, vel: [0.04, 0.28, 0.04], spread: 0.05, gravity: 0, drag: 0.6, wind: 0.1 },
  dust: { color: [0.86, 0.78, 0.62], alpha: [0.75, 0], size: [0.12, 0.34], life: 0.9, vel: [0.9, 0.35, 0.9], spread: 0.25, gravity: -0.6, drag: 2.2 },
  sparkle: { color: [1, 0.86, 0.35], alpha: [1, 0], size: [0.12, 0.02], life: 1.0, vel: [0.7, 1.4, 0.7], spread: 0.2, gravity: -1.4, drag: 0.8, additive: true },
  fire: { color: [1, 0.55, 0.15], alpha: [0.95, 0], size: [0.24, 0.05], life: 0.7, vel: [0.12, 0.7, 0.12], spread: 0.18, gravity: 0, drag: 0.4, additive: true },
  water: { color: [0.72, 0.88, 1.0], alpha: [0.85, 0.2], size: [0.05, 0.03], life: 0.55, vel: [0.25, 0.7, 0.25], spread: 0.01, gravity: -2.4, drag: 0.2 },
  snow: { color: [1, 1, 1], alpha: [0.95, 0.95], size: [0.07, 0.07], life: 7, vel: [0.12, -0.55, 0.12], spread: 0, gravity: 0, drag: 0, wind: 0.15 },
  rain: { color: [0.75, 0.85, 1.0], alpha: [0.55, 0.55], size: [0.045, 0.045], life: 1.3, vel: [0.02, -6, 0.02], spread: 0, gravity: 0, drag: 0 },
  coins: { color: [1, 0.82, 0.25], alpha: [1, 0], size: [0.14, 0.1], life: 1.1, vel: [0.25, 1.4, 0.25], spread: 0.1, gravity: -2.2, drag: 0.3, additive: true },
};

class ParticleSystem {
  constructor(max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.rgba = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.meta = new Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aRgba = new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('rgba', this.aRgba);
    geo.setAttribute('size', this.aSize);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p, x, y, z, opts = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const v = p.vel;
    this.pos[i * 3] = x + (Math.random() - 0.5) * p.spread * 2;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * p.spread * 2;
    this.vel[i * 3] = (Math.random() - 0.5) * 2 * v[0] + (opts.vx || 0);
    this.vel[i * 3 + 1] = v[1] * (0.7 + Math.random() * 0.6);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 2 * v[2] + (opts.vz || 0);
    this.age[i] = 0;
    this.life[i] = p.life * (0.75 + Math.random() * 0.5);
    this.meta[i] = { p, color: opts.color || p.color, scale: opts.scale || 1 };
  }

  update(dt, wind) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const m = this.meta[i];
      const p = m.p;
      const k = this.age[i] / this.life[i];
      const drag = Math.exp(-p.drag * dt);
      this.vel[i * 3] = this.vel[i * 3] * drag + (p.wind || 0) * wind.x * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (p.drag ? drag : 1) + p.gravity * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * drag + (p.wind || 0) * wind.y * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (p === PRESETS.snow || p === PRESETS.rain) {
        if (this.pos[i * 3 + 1] < 0) this.age[i] = this.life[i];
      }
      const c = m.color;
      this.rgba[i * 4] = c[0];
      this.rgba[i * 4 + 1] = c[1];
      this.rgba[i * 4 + 2] = c[2];
      this.rgba[i * 4 + 3] = p.alpha[0] + (p.alpha[1] - p.alpha[0]) * k;
      this.size[i] = (p.size[0] + (p.size[1] - p.size[0]) * k) * m.scale;
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = true;
    this.aRgba.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  copy(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.rgba[to * 4 + k] = this.rgba[from * 4 + k];
    this.size[to] = this.size[from];
    this.age[to] = this.age[from];
    this.life[to] = this.life[from];
    this.meta[to] = this.meta[from];
  }
}

export class Particles {
  constructor() {
    this.group = new THREE.Group();
    this.normal = new ParticleSystem(1600, false);
    this.add = new ParticleSystem(700, true);
    this.group.add(this.normal.points, this.add.points);
    this.wind = new THREE.Vector2(0.4, 0.15);
    this.enabled = true;
  }

  setScale(px) {
    this.normal.material.uniforms.uScale.value = px;
    this.add.material.uniforms.uScale.value = px;
  }

  emit(kind, x, y, z, n = 1, opts) {
    if (!this.enabled) return;
    const p = PRESETS[kind];
    if (!p) return;
    const sys = p.additive ? this.add : this.normal;
    for (let k = 0; k < n; k++) sys.emit(p, x, y, z, opts);
  }

  burst(kind, x, y, z, n, opts) {
    this.emit(kind, x, y, z, n, opts);
  }

  update(dt) {
    this.normal.update(dt, this.wind);
    this.add.update(dt, this.wind);
  }

  clear() {
    this.normal.count = 0;
    this.add.count = 0;
  }
}
