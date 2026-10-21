// Ciel, lumières et cycle jour/nuit (+ météo).
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';

// Couleurs du ciel par heure : [heure, haut, bas, soleil, intensité soleil, ambiance]
const KEYS = [
  [0, 0x0b1636, 0x1d2b56, 0x8fa6e9, 0.3, 0.56],
  [4.8, 0x101c42, 0x2a3566, 0x9aafee, 0.3, 0.58],
  [5.8, 0x3a4f8f, 0xf2a37a, 0xffb27a, 0.6, 0.55],
  [7.0, 0x6cb2ef, 0xfde4bd, 0xffe2b8, 1.25, 0.85],
  [12, 0x4aa3f0, 0xd2ecff, 0xfffaf0, 1.6, 1.0],
  [17, 0x58a5ec, 0xffe6b5, 0xffecc8, 1.35, 0.9],
  [18.9, 0x3b4f9a, 0xff9a6b, 0xffa36b, 0.75, 0.62],
  [20.2, 0x1d2a5c, 0x6a4a7a, 0x9a94d9, 0.36, 0.6],
  [21.5, 0x0e1838, 0x22305e, 0x8fa6e9, 0.3, 0.56],
  [24, 0x0b1636, 0x1d2b56, 0x8fa6e9, 0.3, 0.56],
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function lerpHex(a, b, t, out) {
  tmpA.setHex(a);
  tmpB.setHex(b);
  return out.copy(tmpA).lerp(tmpB, t);
}

export class Sky {
  constructor(renderer) {
    this.r = renderer;
    const scene = renderer.scene;
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6a7a4a, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.top = new THREE.Color();
    this.bottom = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    scene.fog = new THREE.Fog(0xcfe9ff, 60, 140);
    this.night = 0;
    this.lastCss = '';
    this.weather = 'clear';
    this.weatherFactor = 1;
  }

  setShadowQuality(size) {
    if (size <= 0) {
      this.sun.castShadow = false;
      return;
    }
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** hour : 0..24 ; target : point regardé par la caméra ; span : taille de la zone d'ombres */
  update(hour, target, span, dt) {
    let k = 0;
    while (k < KEYS.length - 2 && hour >= KEYS[k + 1][0]) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
    lerpHex(a[1], b[1], t, this.top);
    lerpHex(a[2], b[2], t, this.bottom);
    lerpHex(a[3], b[3], t, this.sunColor);
    let sunI = lerp(a[4], b[4], t);
    let amb = lerp(a[5], b[5], t);

    // Météo : on assombrit et désature
    const wTarget = this.weather === 'clear' ? 1 : this.weather === 'cloudy' ? 0.72 : 0.58;
    this.weatherFactor += (wTarget - this.weatherFactor) * Math.min(1, dt * 0.5);
    const wf = this.weatherFactor;
    if (wf < 0.999) {
      const grey = new THREE.Color(0x8a96a3);
      this.top.lerp(grey, (1 - wf) * 0.9);
      this.bottom.lerp(new THREE.Color(0xb7c0c8), (1 - wf) * 0.8);
      sunI *= wf;
      amb *= 0.85 + 0.15 * wf;
    }

    // Nuit : 0 le jour, 1 la nuit
    this.night = 1 - smoothstep(5.2, 7.2, hour) + smoothstep(18.6, 20.8, hour);
    this.night = clamp(this.night, 0, 1);

    // Position du soleil (ou de la lune la nuit)
    const day = hour >= 6 && hour <= 18.5;
    const dir = new THREE.Vector3();
    if (hour >= 5 && hour <= 20) {
      // le soleil se lève à l'est (+x), passe au sud (+z) et se couche à l'ouest (-x)
      const p = (hour - 5) / 15;
      const elev = Math.sin(p * Math.PI) * 1.0 + 0.2;
      const horiz = Math.cos(elev);
      dir.set(Math.cos(p * Math.PI) * horiz, Math.sin(elev), (0.35 + 0.65 * Math.sin(p * Math.PI)) * horiz).normalize();
    } else {
      dir.set(-0.3, 0.8, 0.5).normalize(); // lune
    }
    const dist = 40;
    this.sun.position.copy(target).addScaledVector(dir, dist);
    this.sun.target.position.copy(target);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = sunI * 2.1;
    this.hemi.intensity = amb * 1.15;
    this.hemi.color.copy(this.top).lerp(new THREE.Color(0xffffff), 0.55);
    this.hemi.groundColor.setHex(0x5f6b48).lerp(new THREE.Color(0x2a3550), this.night * 0.6);

    // Zone couverte par les ombres
    const cam = this.sun.shadow.camera;
    const s = Math.max(10, span);
    if (cam.right !== s) {
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 120;
      cam.updateProjectionMatrix();
    }

    // Brouillard et fond (dégradé CSS derrière le canvas transparent)
    this.fogColor.copy(this.bottom).lerp(this.top, 0.25);
    this.r.scene.fog.color.copy(this.fogColor);
    const css = `linear-gradient(180deg, #${this.top.getHexString()} 0%, #${this.bottom.getHexString()} 100%)`;
    if (css !== this.lastCss) {
      this.lastCss = css;
      this.r.canvas.parentElement.style.background = css;
      document.documentElement.style.setProperty('--sky-bottom', `#${this.bottom.getHexString()}`);
    }
    return { night: this.night, day };
  }
}
