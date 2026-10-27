// Étiquettes HTML posées sur la scène 3D (cadenas des zones, alertes au-dessus des bâtiments).
import * as THREE from 'three';
import { labelRect, fitsLabel, overlapsLabel } from './labelLayout.js';

const v = new THREE.Vector3();

export class Labels {
  constructor(container, camera, canvas) {
    this.root = container;
    this.camera = camera;
    this.canvas = canvas;
    this.items = new Map();
    this.marginTop = 0;
    this.marginBottom = 0;
  }

  setMargins(top, bottom) {
    this.marginTop = top;
    this.marginBottom = bottom;
  }

  set(key, { x, y, z, html, cls = '', onTap = null, minDist = 0, maxDist = Infinity }) {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'label3d ' + cls;
      this.root.appendChild(el);
      it = { el, html: null, x, y, z, onTap: null, cls };
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        it.onTap?.();
      });
      this.items.set(key, it);
    }
    if (it.html !== html) {
      it.el.innerHTML = html;
      it.html = html;
      it.width = it.height = 0;
    }
    if (it.cls !== cls) {
      it.el.className = 'label3d ' + cls;
      it.cls = cls;
    }
    it.el.classList.toggle('tappable', !!onTap);
    it.x = x;
    it.y = y;
    it.z = z;
    it.onTap = onTap;
    it.minDist = minDist;
    it.maxDist = maxDist;
  }

  remove(key) {
    const it = this.items.get(key);
    if (!it) return;
    it.el.remove();
    this.items.delete(key);
  }

  removePrefix(prefix, keep) {
    for (const key of [...this.items.keys()]) if (key.startsWith(prefix) && !keep?.has(key)) this.remove(key);
  }

  clear() {
    for (const key of [...this.items.keys()]) this.remove(key);
  }

  update() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const camPos = this.camera.position;
    const occupied = [];
    // Les demandes et l'état des bâtiments restent prioritaires sur les zones à acheter.
    const items = [...this.items.values()].sort((a,b) => (a.cls === 'zone' ? 1 : 0) - (b.cls === 'zone' ? 1 : 0));
    for (const it of items) {
      v.set(it.x, it.y, it.z);
      const dist = v.distanceTo(camPos);
      v.project(this.camera);
      const visible = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2 && dist >= it.minDist && dist <= it.maxDist;
      if (!visible) {
        if (!it.hidden) {
          it.el.style.display = 'none';
          it.hidden = true;
        }
        continue;
      }
      if (it.hidden) {
        it.el.style.display = '';
        it.hidden = false;
      }
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      // on évite de passer sous la barre du haut et la barre du bas
      if (!it.width || !it.height) {
        it.width = it.el.offsetWidth;
        it.height = it.el.offsetHeight;
      }
      const rect = labelRect(sx, sy, it.width, it.height);
      if (!fitsLabel(rect,w,h,this.marginTop,this.marginBottom) || occupied.some((other) => overlapsLabel(rect,other))) {
        it.el.style.display = 'none';
        it.hidden = true;
        continue;
      }
      occupied.push(rect);
      if (Math.abs(sx - (it.sx ?? -1e9)) > 0.4 || Math.abs(sy - (it.sy ?? -1e9)) > 0.4) {
        it.sx = sx;
        it.sy = sy;
        it.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }
  }
}
