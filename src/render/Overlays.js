// Aides visuelles : fantôme de construction, tracé de route, sélection, rayons d'action, calques, grille.
import * as THREE from 'three';
import { SIZE, N } from '../world/constants.js';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { buildModel } from './models.js';
import { mergeLayers } from './BuildingView.js';
import { topY } from './TerrainView.js';

const HALF = SIZE / 2;

class TileQuads {
  constructor(max, opacity, y = 0.05) {
    const geo = new THREE.PlaneGeometry(0.94, 0.94);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.max = max;
    this.y = y;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  set(list, world) {
    const d = this.dummy;
    let n = 0;
    for (const it of list) {
      if (n >= this.max) break;
      const x = it.i % SIZE, z = (it.i / SIZE) | 0;
      const y = Math.max(0, world ? topY(world, it.i) : 0) + this.y;
      d.position.set(x + 0.5 - HALF, y, z + 0.5 - HALF);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.setColorAt(n, this.color.setHex(it.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
  }
}

export class Overlays {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.roadPreview = new TileQuads(400, 0.55, 0.06);
    this.coverage = new TileQuads(1300, 0.32, 0.045);
    this.layer = new TileQuads(N, 0.45, 0.05);
    this.group.add(this.roadPreview.mesh, this.coverage.mesh, this.layer.mesh);
    // fantôme
    this.ghost = new THREE.Group();
    this.ghostBody = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: true });
    this.ghostPlateMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostPlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.ghostPlateMat);
    this.ghostPlate.renderOrder = 4;
    this.ghost.add(this.ghostPlate);
    this.ghost.visible = false;
    this.ghostKey = '';
    this.ghostMesh = null;
    this.group.add(this.ghost);
    // sélection
    this.sel = new THREE.Group();
    this.selMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, depthWrite: false });
    this.selPlateMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.25, depthWrite: false });
    this.sel.visible = false;
    this.group.add(this.sel);
    // grille
    this.gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
    this.grid = null;
    this.time = 0;
  }

  /* ───────── Fantôme ───────── */
  setGhost(type, x, z, rot, valid, level = 1) {
    const def = BUILDINGS[type];
    const key = `${type}|${rot}|${level}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      if (this.ghostMesh) {
        this.ghost.remove(this.ghostMesh);
        this.ghostMesh.geometry.dispose();
      }
      const m = buildModel(type, level, 3, 1);
      const geo = mergeLayers([{ layer: m.body, cx: 0, cz: 0, rot }, { layer: m.glass, cx: 0, cz: 0, rot }]);
      this.ghostMesh = new THREE.Mesh(geo, this.ghostBody);
      this.ghostMesh.renderOrder = 4;
      this.ghost.add(this.ghostMesh);
    }
    const [w, d] = sizeOf(def, rot);
    this.ghost.position.set(x + w / 2 - HALF, 0.01, z + d / 2 - HALF);
    this.ghostPlate.scale.set(w, 1, d);
    this.ghostPlate.position.y = 0.05;
    this.ghostPlateMat.color.setHex(valid ? 0x4caf50 : 0xe53935);
    this.ghostBody.color.setHex(valid ? 0xffffff : 0xff8a80);
    this.ghost.visible = true;
  }

  hideGhost() {
    this.ghost.visible = false;
  }

  /* ───────── Sélection ───────── */
  setSelection(b) {
    for (const c of [...this.sel.children]) {
      this.sel.remove(c);
      c.geometry?.dispose();
    }
    if (!b) {
      this.sel.visible = false;
      return;
    }
    const [w, d] = sizeOf(BUILDINGS[b.type], b.rot);
    const cx = b.x + w / 2 - HALF, cz = b.z + d / 2 - HALF;
    const t = 0.06;
    const y = 0.06;
    const mk = (sx, sz, px, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.025, sz), this.selMat);
      m.position.set(px, y, pz);
      m.renderOrder = 4;
      this.sel.add(m);
    };
    mk(w, t, cx, cz - d / 2);
    mk(w, t, cx, cz + d / 2);
    mk(t, d, cx - w / 2, cz);
    mk(t, d, cx + w / 2, cz);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), this.selPlateMat);
    plate.position.set(cx, 0.045, cz);
    plate.renderOrder = 3;
    this.sel.add(plate);
    this.sel.visible = true;
  }

  /* ───────── Rayon d'action d'un service ───────── */
  showRadius(cx, cz, r, color) {
    const list = [];
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(SIZE - 1, Math.ceil(cx + r + 1));
    const z0 = Math.max(0, Math.floor(cz - r - 1)), z1 = Math.min(SIZE - 1, Math.ceil(cz + r + 1));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (dx * dx + dz * dz <= r * r + 0.01) list.push({ i: z * SIZE + x, color });
      }
    }
    this.coverage.set(list, this.r.world);
  }

  hideRadius() {
    this.coverage.clear();
  }

  /* ───────── Tracé de route ───────── */
  setRoadPreview(tiles) {
    this.roadPreview.set(tiles.map((t) => ({ i: t.i, color: t.skip ? 0xbdbdbd : t.ok ? (t.demolish ? 0xe53935 : 0x66bb6a) : 0xe53935 })), this.r.world);
  }

  clearRoadPreview() {
    this.roadPreview.clear();
  }

  /* ───────── Calques (besoins, bonheur...) ───────── */
  setLayer(list) {
    this.layer.set(list, this.r.world);
  }

  clearLayer() {
    this.layer.clear();
  }

  /* ───────── Grille ───────── */
  showGrid(bounds) {
    if (this.grid) {
      this.group.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid = null;
    }
    if (!bounds) return;
    const pts = [];
    const y = 0.035;
    for (let x = bounds.x0; x <= bounds.x1; x++) pts.push(x - HALF, y, bounds.z0 - HALF, x - HALF, y, bounds.z1 - HALF);
    for (let z = bounds.z0; z <= bounds.z1; z++) pts.push(bounds.x0 - HALF, y, z - HALF, bounds.x1 - HALF, y, z - HALF);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, this.gridMat);
    this.grid.renderOrder = 2;
    this.group.add(this.grid);
  }

  update(dt) {
    this.time += dt;
    if (this.sel.visible) this.selMat.opacity = 0.6 + Math.sin(this.time * 5) * 0.3;
  }
}
