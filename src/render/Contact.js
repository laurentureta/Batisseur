// Ombres de contact : une tache sombre et douce sous chaque bâtiment. C'est ce qui pose les
// objets sur le sol au lieu de les laisser flotter, même quand le soleil est haut et que
// l'ombre portée est courte. Tout tient dans un seul maillage instancié : une passe de rendu.
import * as THREE from 'three';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { SIZE } from '../world/constants.js';

const HALF = SIZE / 2;
const MAX = 1400;

/** Tache radiale douce, un peu aplatie sur les bords pour épouser une emprise carrée. */
function blotTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // distance de Tchebychev adoucie : un carré aux angles arrondis
      const u = (x + 0.5) / s * 2 - 1, v = (y + 0.5) / s * 2 - 1;
      const box = Math.max(Math.abs(u), Math.abs(v));
      const round = Math.sqrt(u * u + v * v);
      const d = Math.min(1, box * 0.45 + round * 0.55);
      const a = Math.pow(Math.max(0, 1 - d), 1.55);
      const i = (y * s + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Contact {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      map: blotTexture(), transparent: true, depthWrite: false, opacity: 0.5,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.version = -1;
  }

  /** Reconstruit les taches quand la liste des bâtiments a changé. */
  sync(force = false) {
    const world = this.r.world;
    if (!world) {
      this.mesh.count = 0;
      return;
    }
    if (!force && world.version === this.version) return;
    this.version = world.version;
    const d = this.dummy;
    let n = 0;
    for (const b of world.buildings.values()) {
      if (n >= MAX) break;
      const def = BUILDINGS[b.type];
      if (!def || def.noContact) continue;
      const [w, h] = sizeOf(def, b.rot);
      // une tache un peu plus large que l'emprise, pour déborder comme une vraie pénombre
      d.position.set(b.x + w / 2 - HALF, 0.015, b.z + h / 2 - HALF);
      d.rotation.set(0, 0, 0);
      d.scale.set(w + 1.4, 1, h + 1.4);
      d.updateMatrix();
      this.mesh.setMatrixAt(n++, d.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** La tache s'estompe la nuit : sans soleil, pas d'ombre au sol. */
  update(night) {
    this.material.opacity = 0.5 * (1 - night * 0.72);
  }
}
