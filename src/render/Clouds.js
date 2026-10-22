// Nuages qui flottent au-dessus du paysage, autour de la carte (modèles KayKit).
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { kit, kitReady } from './kit.js';
import { toGeometry } from './TerrainView.js';

export class Clouds {
  constructor() {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.94, emissive: 0x9aa6c2, emissiveIntensity: 0.12 });
    this.items = [];
    this.built = false;
  }

  build() {
    if (this.built || !kitReady()) return;
    this.built = true;
    const geos = ['cloud_big', 'cloud_small'].map((n) => {
      const g = new GeoBuilder();
      kit(g, n, { ao: 0 });
      return toGeometry(g.body);
    });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 26;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
      const r = 80 + rnd() * 42;
      const m = new THREE.Mesh(geos[k % 2], this.mat);
      m.scale.setScalar(2.2 + rnd() * 2.4);
      m.rotation.y = rnd() * 6.28;
      this.group.add(m);
      this.items.push({ m, a, r, y: 7 + rnd() * 9, speed: (0.003 + rnd() * 0.003) * (k % 3 ? 1 : -1), bob: rnd() * 6 });
    }
    this.place(0);
  }

  place(t) {
    for (const it of this.items) {
      it.m.position.set(Math.cos(it.a) * it.r, it.y + Math.sin(t * 0.3 + it.bob) * 0.25, Math.sin(it.a) * it.r);
    }
  }

  update(dt, night, weather) {
    if (!this.built) return;
    this.t = (this.t || 0) + dt;
    for (const it of this.items) it.a += it.speed * dt;
    this.place(this.t);
    const grey = weather === 'rain' || weather === 'storm' ? 0.55 : weather === 'cloudy' ? 0.78 : 1;
    const v = (1 - night * 0.55) * grey;
    this.mat.color.setRGB(v, v, Math.min(1, v * 1.04));
  }
}
