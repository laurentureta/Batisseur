// Vignettes 3D des bâtiments pour le menu de construction (rendues une fois, puis gardées en mémoire).
import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { buildModel } from './models.js';
import { mergeLayers } from './BuildingView.js';

const SIZE = 160;
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  LUT[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
}

export class Thumbnails {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.target = null;
    this.pixels = new Uint8Array(SIZE * SIZE * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
  }

  get(type, level = 1) {
    const key = `${type}|${level}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let url = '';
    try {
      url = this.render(type, level);
    } catch (err) {
      console.warn('Vignette impossible', type, err);
    }
    this.cache.set(key, url);
    return url;
  }

  render(type, level) {
    const def = BUILDINGS[type];
    const m = buildModel(type, level, 5, 1);
    const geo = mergeLayers([{ layer: m.body, cx: 0, cz: 0, rot: 0 }, { layer: m.glass, cx: 0, cz: 0, rot: 0 }]);
    for (const p of m.parts) {
      const pg = mergeLayers([{ layer: p.body, cx: p.pivot[0], cz: p.pivot[2], y: p.pivot[1], rot: 0 }]);
      if (pg) {
        const pm = new THREE.Mesh(pg, this.bodyMat);
        pm.userData.tmp = true;
        this.scene.add(pm);
      }
    }
    const mesh = new THREE.Mesh(geo, this.bodyMat);
    mesh.userData.tmp = true;
    this.scene.add(mesh);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.62 + size.y * 0.32 + 0.05;
    const cam = this.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.position.set(center.x + 6, center.y + 5, center.z + 6);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    if (!this.target) this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, cam);
    r.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    for (const o of [...this.scene.children]) {
      if (o.userData.tmp) {
        this.scene.remove(o);
        o.geometry.dispose();
      }
    }
    // retournement vertical + conversion en sRGB
    const img = this.ctx.createImageData(SIZE, SIZE);
    const src = this.pixels, dst = img.data;
    for (let y = 0; y < SIZE; y++) {
      const sy = SIZE - 1 - y;
      for (let x = 0; x < SIZE; x++) {
        const s = (sy * SIZE + x) * 4, d = (y * SIZE + x) * 4;
        const a = src[s + 3];
        if (a === 0) {
          dst[d + 3] = 0;
          continue;
        }
        // les couleurs sont prémultipliées par l'alpha en bordure
        const k = 255 / a;
        dst[d] = LUT[Math.min(255, Math.round(src[s] * k))];
        dst[d + 1] = LUT[Math.min(255, Math.round(src[s + 1] * k))];
        dst[d + 2] = LUT[Math.min(255, Math.round(src[s + 2] * k))];
        dst[d + 3] = a;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    void def;
    return this.canvas.toDataURL('image/png');
  }
}
