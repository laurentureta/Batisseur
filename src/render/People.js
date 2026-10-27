// Les habitants en 3D : des personnages articulés (tête et visage, cheveux ou chapeau, torse, bras,
// mains, jambes, outils, charges) animés selon ce qu'ils font vraiment dans la simulation :
// marcher, porter des bûches, abattre un arbre, débiter le tronc, bêcher, semer, arroser,
// récolter, déposer, se reposer. Chaque pièce est un maillage en instances : quelques appels
// de dessin pour tout le village. Seuls les habitants proches de la caméra sont dessinés.
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { DAY_SECONDS, SIZE, T } from '../world/constants.js';
import { workerPos, WALK, doorOf, localToWorld } from '../sim/Villagers.js';
import { builderPos } from '../sim/Construction.js';
import { beam } from './Sites.js';
import { roadPath, roadNextTo, roadPoints, makeMove, moveAt } from '../sim/paths.js';
import { hash2 } from '../core/rng.js';
import { HumanPoser } from './humanPose.js';

/** Vrais modèles animés par métier (le premier modèle « _f » est préféré pour une femme). */
const ROLE_MODELS = {
  lumberjack: ['farmer_m', 'worker_m'], farmer: ['farmer_m', 'farmer_f'], gardener: ['farmer_f', 'farmer_m', 'casual_f'],
  builder: ['worker_m', 'worker_f'], miner: ['worker_m', 'worker_f'], digger: ['worker_m', 'worker_f'], craftsman: ['worker_m', 'worker_f'],
  smith: ['worker_m', 'bald_m'], carter: ['bald_m', 'worker_m'], cook: ['chef_m'], miller: ['chef_m', 'bald_m'],
  doctor: ['doctor_m', 'doctor_f'], teacher: ['old_m', 'old_f', 'suit_m'], merchant: ['casual_m', 'casual_f', 'suit_m'],
  innkeeper: ['bald_m', 'casual_f'], breeder: ['farmer_f', 'farmer_m'], fisher: ['bald_m', 'casual_m'],
  firefighter: ['worker_m', 'worker_f'], guard: ['suit_m', 'casual_m'], worker: ['casual_m', 'casual_f', 'worker_f'],
};
const WALKER_MODELS = ['casual_m', 'casual_f', 'bald_m', 'old_m', 'old_f', 'suit_m', 'casual_f', 'casual_m'];
const KID_MODELS = ['casual_m', 'casual_f'];
const GREY_HAIR = [0xc9c4bc, 0xe2ded6, 0x9d968c];
/** Charges portées sur l'épaule (les autres se tiennent devant soi, à deux mains). */
const SHOULDER_LOADS = new Set(['logs', 'plank', 'plankStack', 'hay']);

const MAX = 240;
const HALF = SIZE / 2;
const W = 0xffffff;

export const SKINS = [0xf2c9a6, 0xe8b48a, 0xc98b62, 0x8d5a3b, 0xf6d7c0];
const HAIRS = [0x3a2618, 0x6b4426, 0xb5793a, 0x1e1a18, 0xd9b26a, 0x8a3b22];
const SHIRTS = [0xe94b5a, 0x3f7fd1, 0x4caf50, 0xf2c94c, 0x9b6bd1, 0xf08b3a, 0x2a9d8f, 0xf4f1ea, 0x455a64, 0xd81b60];
const PANTS = [0x3a4a6a, 0x5a4636, 0x2f3b4a, 0x6a5a3a, 0x3a3a40];

/** Tenues des métiers : chemise, pantalon, chapeau (couleur ou null), outil habituel. */
const OUTFITS = {
  lumberjack: { shirt: [0xc0392b, 0xa93226, 0x7b241c], pants: [0x34495e, 0x3a4a6a], hat: 'beanie', hatColor: [0x2e5e3a, 0xc0392b, 0x34495e] },
  gardener: { shirt: [0x6aa84f, 0x8bc34a, 0x4e8a3a], pants: [0x5a4636, 0x6a5a3a], hat: 'straw' },
  farmer: { shirt: [0xf2ead8, 0xe8d8b0, 0xd9c08a], pants: [0x2f5fa0, 0x3b6fb6], hat: 'straw' },
  miner: { shirt: [0x7a7a7a, 0x6d6d70], pants: [0x4a4a4a], hat: 'helmet', hatColor: [0xf2c94c] },
  fisher: { shirt: [0x2a9d8f, 0x1f7a8c], pants: [0x3a4a6a], hat: 'cap', hatColor: [0xf08b3a, 0xf2c94c] },
  craftsman: { shirt: [0x8d6e63, 0x795548], pants: [0x3a3a40], apron: 0x7a5232 },
  cook: { shirt: [0xf7f4ee], pants: [0x3a3a40], hat: 'toque', apron: 0xf4f1ea },
  firefighter: { shirt: [0xd32f2f], pants: [0x2b2b30], hat: 'helmet', hatColor: [0xd32f2f] },
  guard: { shirt: [0x283593], pants: [0x1f2a5a], hat: 'cap', hatColor: [0x1f2a5a] },
  teacher: { shirt: [0x5c6bc0, 0x8e7cc3], pants: [0x3a3a40] },
  doctor: { shirt: [0xf4f8fb], pants: [0x4a90c2] },
  digger: { shirt: [0x8d6e63, 0x6d8a5a], pants: [0x5a4636, 0x3a4a6a], hat: 'cap', hatColor: [0x8a5a3a, 0x4a6a3a] },
  breeder: { shirt: [0x6aa84f, 0xd9c08a, 0x8bc34a], pants: [0x2f5fa0, 0x5a4636], hat: 'straw', apron: 0x7a5232 },
  carter: { shirt: [0x9a6b43, 0x6d7a8a, 0xa0522d], pants: [0x3a3a40, 0x4a3a2a], hat: 'cap', hatColor: [0x3a3a40, 0x6b4426] },
  miller: { shirt: [0xf2ead8], pants: [0x8a7a6a], hat: 'cap', hatColor: [0xf7f4ee], apron: 0xf4f1ea },
  smith: { shirt: [0x5a5a60, 0x6d5a4a], pants: [0x2b2b30], apron: 0x4a3524 },
  innkeeper: { shirt: [0xf7f4ee, 0xe8d8b0], pants: [0x3a3a40, 0x5a4636], apron: 0xf4f1ea },
  merchant: { shirt: [0xe94b5a, 0x3f7fd1, 0x9b6bd1, 0x2a9d8f, 0xf2c94c], pants: [0x3a4a6a, 0x5a4636], apron: 0xf0e2c0 },
  builder: { shirt: [0xf08b3a, 0xf2c94c, 0x3f7fd1, 0xe9673a], pants: [0x2f5fa0, 0x5a4636, 0x3a4a6a], hat: 'helmet', hatColor: [0xf2c94c, 0xf7f4ee, 0xf08b3a] },
};

/* ───────── Pièces du personnage ───────── */
/** Sphère (latitudes, longitudes) : une tête bien ronde. */
function sphere(g, x, y, z, r, color, sy = 1, lon = 10, lat = 7) {
  const p = (i, j) => {
    const th = (j / lat) * Math.PI, ph = (i / lon) * Math.PI * 2;
    return [x + r * Math.sin(th) * Math.sin(ph), y + r * Math.cos(th) * sy, z + r * Math.sin(th) * Math.cos(ph)];
  };
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (j === 0) g.tri(a, d, c, color);
      else if (j === lat - 1) g.tri(a, d, b, color);
      else g.quad(a, d, c, b, color);
    }
  }
}

function buildParts() {
  const P = {};
  const add = (name, fn, opts = {}) => {
    const g = new GeoBuilder();
    fn(g);
    P[name] = { geo: toGeometry(g.body), ...opts };
  };
  add('leg', (g) => {
    g.box(0, -0.068, 0, 0.019, 0.068, 0.021, W);
    g.box(0, -0.076, 0.004, 0.021, 0.012, 0.03, 0x4a3a30);
  }, { tint: 'pants', shadow: true });
  add('torso', (g) => {
    g.box(0, -0.004, 0, 0.046, 0.042, 0.028, W);
    g.box(0, 0.036, 0, 0.053, 0.042, 0.031, W);
    g.box(0, 0.077, 0, 0.018, 0.008, 0.018, 0xe8b48a); // cou
  }, { tint: 'shirt', shadow: true });
  add('belt', (g) => g.box(0, -0.004, 0, 0.048, 0.008, 0.03, 0x5a3a22));
  add('head', (g) => {
    sphere(g, 0, 0.035, 0, 0.034, W, 1.04);
    g.box(0, 0.026, 0.031, 0.009, 0.011, 0.01, W); // nez
    for (const s of [-1, 1]) g.box(s * 0.034, 0.033, 0, 0.006, 0.012, 0.01, W); // oreilles
  }, { tint: 'skin', shadow: true });
  add('eyes', (g) => {
    for (const s of [-1, 1]) {
      g.box(s * 0.0125, 0.034, 0.0322, 0.007, 0.0095, 0.006, 0x26201c);
      g.box(s * 0.0125 + s * 0.0012, 0.0372, 0.0352, 0.0026, 0.003, 0.0016, 0xffffff);
    }
    g.box(0, 0.015, 0.0318, 0.012, 0.0035, 0.004, 0xa0524a); // bouche
  });
  add('hairShort', (g) => {
    g.dome(0, 0.043, -0.005, 0.0375, W, 12, 3, 0.86);
    g.box(0, 0.016, -0.024, 0.068, 0.04, 0.024, W);
  }, { tint: 'hair' });
  add('hairLong', (g) => {
    g.dome(0, 0.043, -0.005, 0.0385, W, 12, 3, 0.9);
    g.box(0, -0.016, -0.025, 0.072, 0.074, 0.026, W);
    for (const s of [-1, 1]) g.box(s * 0.033, 0.004, -0.008, 0.012, 0.052, 0.028, W);
  }, { tint: 'hair' });
  add('beanie', (g) => {
    g.dome(0, 0.047, -0.004, 0.039, W, 12, 3, 1.05);
    g.cyl(0, 0.04, -0.004, 0.0395, 0.013, 12, W);
    sphere(g, 0, 0.091, -0.004, 0.011, W, 1, 6, 4);
  }, { tint: 'hat' });
  add('straw', (g) => {
    g.cyl(0, 0.056, 0, 0.054, 0.005, 14, 0xe6c27a);
    g.cyl(0, 0.06, 0, 0.033, 0.03, 12, 0xe9c983);
    g.cyl(0, 0.061, 0, 0.0345, 0.008, 12, 0x8a5a3a);
  }, { shadow: true });
  add('cap', (g) => {
    g.dome(0, 0.048, -0.004, 0.038, W, 12, 3, 0.82);
    g.box(0, 0.047, 0.036, 0.044, 0.006, 0.032, W);
  }, { tint: 'hat' });
  add('helmet', (g) => {
    g.dome(0, 0.047, 0, 0.042, W, 12, 3, 0.95);
    g.cyl(0, 0.045, 0, 0.047, 0.005, 14, W);
  }, { tint: 'hat' });
  add('arm', (g) => g.box(0, -0.058, 0, 0.0155, 0.058, 0.017, W), { tint: 'shirt' });
  add('hand', (g) => g.box(0, -0.071, 0, 0.016, 0.015, 0.017, W), { tint: 'skin' });
  // outils (repère de la main droite : -y le long du bras)
  add('axe', (g) => {
    g.box(0, -0.17, 0, 0.008, 0.115, 0.008, 0x8a5a3a);
    g.box(0, -0.172, -0.014, 0.006, 0.028, 0.03, 0x9aa3ab);
    g.box(0, -0.172, -0.03, 0.0065, 0.03, 0.004, 0xd5dde3);
  }, { shadow: true });
  add('hoe', (g) => {
    g.box(0, -0.2, 0, 0.007, 0.16, 0.007, 0x9a6a3a);
    g.box(0, -0.205, -0.016, 0.032, 0.007, 0.03, 0x8a9096);
  }, { shadow: true });
  add('can', (g) => {
    g.cyl(0, -0.105, 0.012, 0.019, 0.032, 8, 0x5a9e6a);
    g.box(0, -0.085, 0.012, 0.004, 0.02, 0.03, 0x4a8a5a);
    g.box(0, -0.1, 0.045, 0.006, 0.006, 0.035, 0x5a9e6a);
  }, { shadow: true });
  add('scythe', (g) => {
    g.box(0, -0.21, 0, 0.007, 0.18, 0.007, 0x9a6a3a);
    g.box(0, -0.29, -0.03, 0.005, 0.01, 0.07, 0xc8d0d6);
  }, { shadow: true });
  add('hammer', (g) => {
    g.box(0, -0.105, 0, 0.007, 0.065, 0.007, 0x8a5a3a);
    g.box(0, -0.143, -0.008, 0.012, 0.014, 0.032, 0x7a828a);
  }, { shadow: true });
  add('saw', (g) => {
    g.box(0, -0.082, 0, 0.012, 0.03, 0.018, 0x8a5a3a);
    g.box(0, -0.083, -0.065, 0.003, 0.026, 0.11, 0xc8d0d6);
  }, { shadow: true });
  add('shovel', (g) => {
    g.box(0, -0.17, 0, 0.007, 0.14, 0.007, 0x9a6a3a);
    g.box(0, -0.25, -0.004, 0.03, 0.04, 0.006, 0x8a9096);
  }, { shadow: true });
  add('brush', (g) => {
    g.box(0, -0.1, 0, 0.006, 0.05, 0.006, 0x8a5a3a);
    g.box(0, -0.132, 0, 0.022, 0.018, 0.01, 0xe8d8b0);
  });
  add('plank', (g) => {
    for (const [x, y] of [[0.03, 0.094], [0.03, 0.106]]) g.box(x, y, 0, 0.026, 0.01, 0.3, 0xd4ad7a);
  }, { shadow: true });
  add('stoneBlock', (g) => g.box(0, 0.0, 0.05, 0.06, 0.045, 0.045, { top: 0xc8c2b8, side: 0xa8a296 }), { shadow: true });
  add('bricks', (g) => {
    for (let k = 0; k < 3; k++) g.box(0, -0.004 + k * 0.018, 0.05, 0.06, 0.016, 0.034, k % 2 ? 0xb5523b : 0xa5472f);
  }, { shadow: true });
  add('apron', (g) => {
    g.box(0, -0.035, 0.0155, 0.05, 0.075, 0.004, W);
    g.box(0, 0.045, 0.0175, 0.034, 0.03, 0.004, W);
  }, { tint: 'apron' });
  add('toque', (g) => {
    g.cyl(0, 0.05, 0, 0.034, 0.03, 10, 0xffffff);
    sphere(g, 0, 0.09, 0, 0.04, 0xffffff, 0.6, 10, 5);
  });
  add('pickaxe', (g) => {
    g.box(0, -0.17, 0, 0.008, 0.13, 0.008, 0x8a5a3a);
    g.box(0, -0.235, -0.002, 0.008, 0.012, 0.09, 0x7a828a);
    g.box(0, -0.235, 0.046, 0.006, 0.008, 0.012, 0x9aa3ab);
    g.box(0, -0.235, -0.05, 0.006, 0.008, 0.012, 0x9aa3ab);
  }, { shadow: true });
  add('rod', (g) => {
    // canne à pêche : elle part de la main, vers l'avant et vers le haut quand le bras est tendu
    g.box(0, -0.09, 0, 0.012, 0.035, 0.012, 0x6b4429);
    beam(g, [0, -0.08, 0], [ROD_TIP[0], ROD_TIP[1], ROD_TIP[2]], 0.007, 0x9a6a3a);
  }, { shadow: true });
  add('bucket', (g) => {
    g.cyl(0, -0.125, 0.004, 0.024, 0.038, 9, 0x8a6a48, 0.028, true, 0x6aa8c8);
    g.box(0, -0.085, 0.004, 0.004, 0.012, 0.05, 0x5a5a60);
  }, { shadow: true });
  add('pitchfork', (g) => {
    g.box(0, -0.2, 0, 0.007, 0.17, 0.007, 0x9a6a3a);
    g.box(0, -0.29, 0, 0.034, 0.006, 0.006, 0x8a9096);
    for (const x of [-0.015, 0, 0.015]) g.box(x, -0.32, 0, 0.004, 0.035, 0.004, 0x8a9096);
  }, { shadow: true });
  add('tongs', (g) => {
    g.box(0, -0.1, -0.02, 0.006, 0.006, 0.07, 0x3a3a40);
    g.box(0, -0.1, -0.06, 0.016, 0.012, 0.016, 0xff8a3a);
  });
  add('seedbag', (g) => {
    g.ico(0, -0.09, 0.008, 0.02, 0xd8c39a, 1.15, 0.12, 4);
  });
  // charges (repère du torse)
  add('logs', (g) => {
    for (const [x, y] of [[0.028, 0.09], [0.047, 0.09], [0.0375, 0.108]]) g.cylZ(x, y, 0, 0.0115, 0.15, 7, 0x7a5232, 0xd9b47a);
  }, { shadow: true });
  const basket = (veg) => (g) => {
    g.box(0, 0.006, 0.052, 0.058, 0.03, 0.042, 0xb38652);
    g.box(0, 0.034, 0.052, 0.06, 0.004, 0.044, 0x8a6236);
    for (let k = 0; k < 5; k++) g.ico(-0.018 + (k % 3) * 0.018, 0.04 + (k > 2 ? 0.008 : 0), 0.044 + (k % 2) * 0.016, 0.0105, veg[k % veg.length], 1, 0.15, k);
  };
  add('basketCarrot', basket([0xf08a2a, 0xe57a1e, 0x4f9e38]), { shadow: true });
  add('basketTomato', basket([0xe53935, 0xd32f2f, 0x4f9e38]), { shadow: true });
  add('basketPotato', basket([0xc9a46a, 0xb89058, 0xd8b880]), { shadow: true });
  add('sheaf', (g) => {
    g.cyl(0, -0.03, 0.05, 0.02, 0.1, 7, 0xd9b84e);
    g.cyl(0, 0.0, 0.05, 0.022, 0.012, 7, 0x8a5a3a);
    g.ico(0, 0.08, 0.05, 0.03, 0xf0d27a, 1.1, 0.2, 5);
  }, { shadow: true });
  add('sack', (g) => g.ico(0, 0.03, 0.05, 0.032, 0xd8c39a, 1.1, 0.12, 6), { shadow: true });
  const lumps = (colors, base = 0x8a6236) => (g) => {
    g.box(0, 0.0, 0.052, 0.058, 0.03, 0.042, base);
    for (let k = 0; k < 5; k++) g.ico(-0.018 + (k % 3) * 0.018, 0.036 + (k > 2 ? 0.008 : 0), 0.044 + (k % 2) * 0.016, 0.012, colors[k % colors.length], 1, 0.25, k + 3);
  };
  add('ore', lumps([0x4a4a52, 0x5a5560, 0xc9733a]), { shadow: true });
  add('clay', lumps([0xc77a4a, 0xb86a3e, 0xd08a58], 0x9a7a5a), { shadow: true });
  add('fishBasket', (g) => {
    g.box(0, 0.006, 0.052, 0.062, 0.03, 0.044, 0xb38652);
    for (let k = 0; k < 3; k++) {
      g.box(-0.016 + k * 0.016, 0.04, 0.052, 0.012, 0.008, 0.05, k % 2 ? 0x8fb3c9 : 0x6f9ab3);
      g.box(-0.016 + k * 0.016, 0.04, 0.08, 0.016, 0.004, 0.01, 0x5a8aa3);
    }
  }, { shadow: true });
  add('eggBasket', (g) => {
    g.box(0, 0.006, 0.052, 0.058, 0.026, 0.042, 0xc9a36a);
    for (let k = 0; k < 5; k++) g.ico(-0.018 + (k % 3) * 0.018, 0.036, 0.044 + (k % 2) * 0.016, 0.0095, k % 2 ? 0xf7f1e3 : 0xe8c9a0, 1.25, 0, k);
  }, { shadow: true });
  add('milkCan', (g) => {
    g.cyl(0, -0.03, 0.05, 0.022, 0.07, 9, 0xc8d0d6, 0.022, true, 0xe8eef2);
    g.cyl(0, 0.04, 0.05, 0.012, 0.02, 8, 0xb8c0c6);
  }, { shadow: true });
  add('hay', (g) => {
    g.cylZ(0.035, 0.1, 0, 0.032, 0.11, 8, 0xe2c25a, 0xd2ae48);
    for (const z of [-0.03, 0.03]) g.cylZ(0.035, 0.1, z, 0.033, 0.006, 8, 0x9a7a3a);
  }, { shadow: true });
  add('plankStack', (g) => {
    for (let k = 0; k < 3; k++) g.box(0.03, 0.088 + k * 0.012, 0, 0.04, 0.01, 0.22, k % 2 ? 0xd4ad7a : 0xc49a6c);
  }, { shadow: true });
  add('toolsCrate', (g) => {
    g.box(0, 0.004, 0.052, 0.06, 0.034, 0.042, 0x8a6236);
    for (let k = 0; k < 3; k++) g.box(-0.018 + k * 0.018, 0.045, 0.052, 0.006, 0.04, 0.006, 0x8a9096);
  }, { shadow: true });
  add('breadBasket', (g) => {
    g.box(0, 0.006, 0.052, 0.06, 0.026, 0.044, 0xc9a36a);
    for (let k = 0; k < 3; k++) g.ico(-0.016 + k * 0.016, 0.038, 0.052, 0.014, 0xd99a4a, 0.55, 0.15, k);
  }, { shadow: true });
  add('tray', (g) => {
    g.box(0.05, 0.1, 0.05, 0.07, 0.006, 0.06, 0xb38652);
    for (const [x, z] of [[0.035, 0.04], [0.062, 0.06]]) {
      g.cyl(x, 0.106, z, 0.011, 0.024, 7, 0xe8d8b0, 0.012, true, 0xfff6dc);
    }
  }, { shadow: true });
  // charrette à bras (repère du personnage, devant lui)
  add('cart', (g) => {
    g.box(0, 0.05, 0.2, 0.15, 0.045, 0.18, { top: 0x9a6b43, side: 0x7a5232 });
    g.box(0, 0.095, 0.2, 0.15, 0.01, 0.18, 0x6e4a2f);
    for (const sx of [-0.083, 0.083]) {
      g.cylX(sx, 0.045, 0.22, 0.045, 0.012, 10, 0x5a3a22, 0x7a5232);
      g.box(sx * 0.62, 0.075, 0.07, 0.008, 0.008, 0.14, 0x7a5232);
    }
  }, { shadow: true });
  const cartLoad = (fn) => (g) => fn(g);
  add('cartLogs', cartLoad((g) => {
    for (let k = 0; k < 5; k++) g.cylZ(-0.05 + (k % 3) * 0.05, 0.12 + Math.floor(k / 3) * 0.035, 0.2, 0.02, 0.17, 7, 0x7a5232, 0xd9b47a);
  }), { shadow: true });
  add('cartCrates', cartLoad((g) => {
    for (let k = 0; k < 2; k++) g.box(-0.035 + k * 0.07, 0.1, 0.2, 0.06, 0.05, 0.13, k ? 0xb38652 : 0xc49a6c);
    for (let k = 0; k < 4; k++) g.ico(-0.05 + k * 0.033, 0.16, 0.2, 0.014, [0xf08a2a, 0xe53935, 0x5fb447, 0xd8b880][k], 1, 0.1, k);
  }), { shadow: true });
  add('cartSacks', cartLoad((g) => {
    for (let k = 0; k < 3; k++) g.ico(-0.045 + k * 0.045, 0.13, 0.2, 0.034, 0xd8c39a, 1.1, 0.12, k);
  }), { shadow: true });
  add('cartStones', cartLoad((g) => {
    for (let k = 0; k < 5; k++) g.ico(-0.045 + (k % 3) * 0.045, 0.12 + Math.floor(k / 3) * 0.03, 0.18 + (k % 2) * 0.03, 0.027, [0xb7b2a8, 0x9a948a, 0xc8c2b8][k % 3], 1, 0.25, k);
  }), { shadow: true });
  // ligne de pêche et bouchon
  add('line', (g) => g.box(0, -0.002, -0.5, 0.004, 0.004, 1, 0xf2efe6));
  add('bobber', (g) => {
    sphere(g, 0, 0.012, 0, 0.012, 0xe53935, 1, 8, 5);
    sphere(g, 0, 0.022, 0, 0.007, 0xffffff, 1, 6, 4);
  });
  add('box', (g) => {
    g.box(0, -0.004, 0.052, 0.07, 0.05, 0.05, 0xc9a06a);
    g.box(0, 0.042, 0.052, 0.072, 0.004, 0.012, 0xe8d8b0);
  }, { shadow: true });
  add('suitcase', (g) => {
    g.box(0, -0.13, 0.0, 0.016, 0.05, 0.06, 0x8a3b22);
    g.box(0, -0.1, 0.0, 0.006, 0.01, 0.02, 0x3a2618);
  }, { shadow: true });
  add('fishHang', (g) => {
    g.box(0, -0.03, 0, 0.012, 0.05, 0.022, 0x6f9ab3);
    g.box(0, -0.06, 0, 0.004, 0.016, 0.02, 0x5a8aa3);
  });
  return P;
}

const HAND_TOOL = { chop: 'axe', trim: 'axe', till: 'hoe', water: 'can', sow: 'seedbag', harvestFarm: 'scythe' };
const ROD_TIP = [0, -0.08 - 0.53 * 0.31, 0.85 * 0.31]; // bout de la canne (repère du bras)

/**
 * Gestes des métiers : animation, outil (main droite), outil (main gauche).
 * Ajouter un métier = ajouter ici les poses de ses gestes.
 */
const ACT_POSES = {
  pick: ['pick', 'pickaxe'], dig: ['dig', 'shovel'],
  cast: ['cast', 'rod'], fishWait: ['fishWait', 'rod'], reel: ['reel', 'rod'], goShore: ['walk', 'rod'],
  feed: ['feed', null, 'seedbag'], pour: ['pour', 'bucket'], hay: ['pitch', 'pitchfork'], pickHay: ['pickup', null],
  collect: ['collect', null], milk: ['milk', 'bucket'],
  saw: ['saw', 'saw'], smith: ['smith', 'hammer', 'tongs'], mold: ['knead', null], knead: ['knead', null], carrySacks: ['knead', null],
  pickIn: ['pickup', null], stack: ['drop', null], waitIn: ['idle', null],
  serve: ['serve', null], arrange: ['pickup', null], call: ['call', null],
  loadCart: ['loadCart', null], unloadCart: ['loadCart', null],
};
/** Ce que l'on porte (charge de la récolte ou objet de l'atelier) → pièce et façon de porter. */
const LOADS = {
  logs: ['logs', 'carryLogs'], sheaf: ['sheaf', 'carryFront'], stoneBlock: ['stoneBlock', 'carryFront'], ore: ['ore', 'carryFront'],
  clay: ['clay', 'carryFront'], fish: ['fishBasket', 'carryFront'], eggs: ['eggBasket', 'carryFront'], milk: ['milkCan', 'carryFront'],
  hay: ['hay', 'carryLogs'], sack: ['sack', 'carryFront'], plankStack: ['plankStack', 'carryLogs'], toolsCrate: ['toolsCrate', 'carryFront'],
  bricks: ['bricks', 'carryFront'], bread: ['breadBasket', 'carryFront'], tray: ['tray', 'carryTray'], plank: ['plank', 'carryLogs'],
};
const CART_LOADS = { logs: 'cartLogs', plankStack: 'cartLogs', crates: 'cartCrates', fish: 'cartCrates', eggs: 'cartCrates', milk: 'cartCrates', bread: 'cartCrates', toolsCrate: 'cartCrates', sacks: 'cartSacks', sack: 'cartSacks', stones: 'cartStones', ore: 'cartStones', clay: 'cartStones', bricks: 'cartStones' };

/** Gestes des bâtisseurs : animation et outil. */
const BUILDER_ACTS = {
  hammer: ['hammer', 'hammer'], hammerLow: ['hammerLow', 'hammer'], stake: ['hammerLow', 'hammer'],
  dig: ['dig', 'shovel'], saw: ['saw', 'saw'], paint: ['paint', 'brush'], place: ['place', null],
  drop: ['drop', null], fetch: ['pickup', null], climb: ['climb', null], descend: ['climb', null],
  cheer: ['cheer', null], idle: ['idle', null],
};

export class People {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.parts = buildParts();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {};
    for (const [name, p] of Object.entries(this.parts)) {
      const n = name === 'leg' || name === 'arm' || name === 'hand' ? MAX * 2 : MAX;
      const m = new THREE.InstancedMesh(p.geo, this.mat, n);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = !!p.shadow;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (p.tint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      this.meshes[name] = { m, n: 0, tint: p.tint };
    }
    this.figs = [];
    this.pool = [];
    this.root = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.tmp2 = new THREE.Matrix4();
    this.torsoM = new THREE.Matrix4();
    this.armM = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.pos = { x: 0, z: 0, dir: 0, s: 0, done: false };
    this.seen = new Map(); // id -> dernière action vue (effets : coups de hache, chutes)
    this.time = 0;
    this.scanAcc = 1;
    this.commuters = [];
    this.lodDist2 = 10 * 10; // modèle complet jusqu'à 10 unités de la caméra
  }

  /* ───────── Qui est visible ───────── */
  update(dt, gameSpeed) {
    const game = this.r.game, world = this.r.world;
    this.time += dt;
    if (!world || !game.villagers) return;
    const st = game.state;
    const tNow = st.time.day * DAY_SECONDS + (game.playing ? game.sim.acc || 0 : 0);
    const hour = (st.time.day - Math.floor(st.time.day)) * 24;
    const cam = this.r.cam;
    const tx = cam.target.x, tz = cam.target.z;
    const radius = Math.min(60, cam.distance * 1.35 + 10);
    const r2 = radius * radius;
    const figs = this.figs;
    figs.length = 0;
    let fi = 0;
    const fig = () => {
      let f = this.pool[fi];
      if (!f) this.pool[fi] = f = {};
      fi++;
      figs.push(f);
      return f;
    };
    // 1) travailleurs suivis geste par geste
    for (const w of game.villagers.list) {
      if (!w.detail || w.state === 'off') continue;
      const p = this.workerPose(w, tNow);
      if (!p) continue;
      const dx = p.x - tx, dz = p.z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dress(f, w);
      Object.assign(f, p);
      f.d2 = dx * dx + dz * dz;
      this.effects(w, f, tNow);
    }
    // 1 bis) les bâtisseurs sur les chantiers
    const crew = game.construction?.crew;
    if (crew) {
      for (const w of crew) {
        if (w.state === 'base' || w.state === 'off') continue;
        const p = this.builderPose(w, tNow);
        const dx = p.x - tx, dz = p.z - tz;
        if (dx * dx + dz * dz > r2) continue;
        const f = fig();
        this.dress(f, w);
        Object.assign(f, p);
        f.run = !!p.run;
        f.d2 = dx * dx + dz * dz;
        this.builderEffects(w, f, tNow);
      }
    }
    // 2) les autres travailleurs : trajets du matin et du soir (calculés à la demande)
    this.scanAcc += dt;
    if (this.scanAcc > 0.5) {
      this.scanAcc = 0;
      this.scanCommuters(hour, tx, tz, radius + 25);
    }
    for (const c of this.commuters) {
      const w = c.w;
      const ph = commutePhase(w, hour, c.dur);
      if (!ph) continue;
      const f0 = ph.dir > 0 ? ph.f : 1 - ph.f;
      const p = moveAt(c.mv, c.mv.t0 + f0 * c.mv.len / c.mv.speed, this.pos);
      const dx = p.x - tx, dz = p.z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dress(f, w);
      f.x = p.x;
      f.z = p.z;
      f.dir = ph.dir > 0 ? p.dir : p.dir + Math.PI;
      f.anim = 'walk';
      f.phase = p.s * 9;
      f.t = 0;
      f.load = null;
      f.tool = null;
      f.d2 = dx * dx + dz * dz;
    }
    // 2 bis) de nouveaux habitants arrivent avec leurs cartons, d'autres partent
    this.moverClock = (this.moverClock || 0) + dt * Math.max(0.35, Math.min(3, gameSpeed || 0));
    this.moverAcc = (this.moverAcc || 0) + dt;
    if (this.moverAcc > 0.5) {
      this.moverAcc = 0;
      this.scanHomes(tx, tz, radius + 8);
    }
    if (this.movers?.length) {
      const keep = [];
      for (const m of this.movers) {
        const tt = m.mv.t0 + (this.moverClock - m.start);
        if (tt < 0) {
          keep.push(m); // pas encore parti (voyageurs qui descendent l'un après l'autre)
          continue;
        }
        const p = moveAt(m.mv, tt, this.pos);
        if (p.done) {
          if (m.leaving === false) this.r.particles.emit('sparkle', p.x, 0.15, p.z, 3);
          continue;
        }
        keep.push(m);
        const dx = p.x - tx, dz = p.z - tz;
        if (dx * dx + dz * dz > r2) continue;
        const f = fig();
        this.dressWalker(f, m);
        f.x = p.x;
        f.z = p.z;
        f.y = this.groundY(p.x, p.z);
        f.dir = p.dir;
        f.anim = m.leaving ? 'walk' : 'carryFront';
        f.phase = p.s * 9;
        f.t = 0;
        f.load = m.leaving ? null : 'box';
        f.tool = m.leaving ? 'suitcase' : null;
        f.d2 = dx * dx + dz * dz;
      }
      this.movers = keep;
    }
    // 3) promeneurs (enfants, retraités, flâneurs)
    for (const a of this.r.agents.people) {
      const p0 = a.pts[a.seg], p1 = a.pts[a.seg + 1];
      if (!p1) continue;
      const x = p0[0] + (p1[0] - p0[0]) * a.t, z = p0[2] + (p1[2] - p0[2]) * a.t;
      const dx = x - tx, dz = z - tz;
      if (dx * dx + dz * dz > r2) continue;
      const f = fig();
      this.dressWalker(f, a);
      f.x = x;
      f.z = z;
      f.y = p0[1] - 0.03;
      f.dir = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
      f.anim = a.visiting ? a.activity === 'shopping' ? 'browse' : a.activity === 'play' ? 'play' : 'chat' : 'walk';
      f.phase = (a.seg + a.t) * 9;
      f.t = a.visitTime || 0;
      f.load = !a.visiting && a.returning && a.activity === 'shopping' ? 'basketTomato' : null;
      if (f.load) f.anim = 'carryFront';
      f.tool = null;
      f.d2 = dx * dx + dz * dz;
    }
    // galerie de poses (outil de mise au point)
    if (this.debugFigs) {
      figs.length = 0;
      for (const f of this.debugFigs) figs.push(f);
    }
    // les plus proches d'abord
    if (figs.length > MAX) {
      figs.sort((a, b) => a.d2 - b.d2);
      figs.length = MAX;
    }
    this.draw(figs, world);
    void gameSpeed;
  }

  /** Tenue stable d'un travailleur (graine). */
  dress(f, w) {
    const o = OUTFITS[w.role];
    const pick = (arr, k) => arr[Math.floor(hash2(w.seed, k, 17) * arr.length)];
    f.skin = SKINS[w.skin % SKINS.length];
    f.hairC = HAIRS[w.hair % HAIRS.length];
    f.shirt = o?.shirt ? pick(o.shirt, 1) : SHIRTS[w.shirt % SHIRTS.length];
    f.pants = o?.pants ? pick(o.pants, 2) : PANTS[Math.floor(hash2(w.seed, 3, 17) * PANTS.length)];
    f.hat = o?.hat || null;
    f.hatC = o?.hatColor ? pick(o.hatColor, 4) : 0xffffff;
    f.longHair = w.girl;
    f.scale = 1.18;
    f.y = 0;
    f.id = w.id;
    f.role = w.role;
    f.apron = o?.apron ?? null;
    f.cart = false;
    f.cartLoad = null;
    f.bob = null;
    f.toolL = null;
    f.run = false;
    f.seed = w.seed % 997;
    const list = ROLE_MODELS[w.role] || ROLE_MODELS.worker;
    const fem = list.filter((m) => m.endsWith('_f')), men = list.filter((m) => !m.endsWith('_f'));
    const pool = w.girl ? (fem.length ? fem : list) : men.length ? men : list;
    f.model = pool[w.seed % pool.length];
    f.hatTint = o?.hatColor ? f.hatC : o?.hat === 'straw' ? 0xe2c25a : null;
  }

  dressWalker(f, a) {
    if (a.look == null) {
      const s = (Math.random() * 1e9) | 0;
      a.look = { skin: SKINS[s % SKINS.length], hair: HAIRS[(s >> 3) % HAIRS.length], pants: PANTS[(s >> 6) % PANTS.length], long: (s >> 9) % 2 === 0, kid: (s >> 10) % 4 === 0 };
    }
    f.skin = a.look.skin;
    f.hairC = a.look.hair;
    f.shirt = a.shirt;
    f.pants = a.look.pants;
    f.hat = null;
    f.longHair = a.look.long;
    f.scale = a.look.kid ? 0.85 : 1.15;
    f.id = -1;
    f.role = 'walker';
    f.apron = null;
    f.cart = false;
    f.cartLoad = null;
    f.bob = null;
    f.toolL = null;
    f.run = false;
    if (a.look.model == null) {
      const s = (Math.random() * 1e9) | 0;
      a.look.seed = s % 997;
      a.look.model = a.look.kid ? KID_MODELS[s % 2] : WALKER_MODELS[s % WALKER_MODELS.length];
      if (a.look.model.startsWith('old')) a.look.hair = GREY_HAIR[s % GREY_HAIR.length];
    }
    f.model = a.look.model;
    f.seed = a.look.seed;
    f.hairC = a.look.hair;
    f.hatTint = null;
  }

  /** Position et geste d'un travailleur suivi, d'après son action en cours. */
  workerPose(w, t) {
    const p = workerPos(w, Math.min(t, w.until), this.pos);
    const out = { x: p.x, z: p.z, dir: p.dir, y: 0, anim: 'idle', phase: 0, t: t - w.t0, dur: Math.max(0.01, w.until - w.t0), load: null, tool: null };
    const act = w.act;
    const moving = !!w.mv;
    const held = w.load ? (w.load.kind === 'basket' ? null : w.load.kind) : w.prop;
    if (moving) {
      out.phase = p.s * 9;
      if (w.cart) out.anim = 'push';
      else if (held && LOADS[held]) out.anim = LOADS[held][1];
      else out.anim = w.load ? 'carryFront' : 'walk';
    } else {
      switch (act) {
        case 'chop':
        case 'trim':
          out.anim = act;
          out.tool = 'axe';
          break;
        case 'till':
        case 'sow':
        case 'water':
        case 'harvest':
        case 'weed': {
          out.anim = act;
          const tg = w.target;
          if (tg?.from && tg?.to) {
            const k = Math.min(1, Math.max(0, (t - w.t0) / (w.until - w.t0)));
            out.x = tg.from[0] + (tg.to[0] - tg.from[0]) * k;
            out.z = tg.from[1] + (tg.to[1] - tg.from[1]) * k;
          }
          const farm = w.role === 'farmer';
          out.tool = act === 'harvest' ? (farm ? 'scythe' : null) : act === 'weed' ? null : HAND_TOOL[act];
          break;
        }
        case 'watch':
          out.anim = 'idle';
          out.tool = 'axe';
          break;
        case 'drop':
          out.anim = 'drop';
          break;
        case 'rest':
          out.anim = 'chat';
          break;
        default: {
          const a = ACT_POSES[act];
          out.anim = a ? a[0] : 'idle';
          if (a?.[1]) out.tool = a[1];
          if (a?.[2]) out.toolL = a[2];
        }
      }
    }
    if (w.load) {
      const k = w.load.kind;
      out.load = k === 'basket' ? ['basketCarrot', 'basketTomato', 'basketPotato'][w.load.crop % 3] : LOADS[k]?.[0] || 'sack';
    } else if (w.prop && LOADS[w.prop]) out.load = LOADS[w.prop][0];
    // charrette du charretier, ligne du pêcheur
    if (w.cart) {
      out.cart = true;
      out.cartLoad = w.cartLoad ? CART_LOADS[w.cartLoad] || 'cartCrates' : null;
      if (act === 'loadCart') out.cartLoad = Math.min(1, (t - w.t0) / Math.max(0.1, w.until - w.t0)) > 0.5 ? CART_LOADS[w.target && this.r.world.buildings.get(w.target.src) ? cartKindOf(this.r.world.buildings.get(w.target.src)) : 'crates'] : null;
      if (act === 'unloadCart' && Math.min(1, (t - w.t0) / Math.max(0.1, w.until - w.t0)) > 0.6) out.cartLoad = null;
    }
    if (w.role === 'fisher' && w.target?.bob && (act === 'fishWait' || act === 'reel' || act === 'cast')) {
      out.bob = w.target.bob;
      out.bobT = t - w.t0;
    }
    if (w.role === 'lumberjack' && !out.tool && !w.load && (act === 'goTree' || act === 'idle' || act === 'wait')) out.tool = 'axeRest';
    // sur un pont, on marche sur le tablier
    out.y = this.groundY(out.x, out.z);
    return out;
  }

  /** Position et geste d'un bâtisseur (au sol, sur l'échelle ou sur l'échafaudage). */
  builderPose(w, t) {
    const p = builderPos(w, Math.min(t, w.until), this.pos);
    const out = { x: p.x, z: p.z, dir: p.dir, y: 0, anim: 'idle', phase: 0, t: t - w.t0, dur: Math.max(0.01, w.until - w.t0), load: null, tool: null };
    const sites = this.r.sites;
    const k = Math.min(1, Math.max(0, (t - w.t0) / Math.max(0.01, w.until - w.t0)));
    if (w.mv) {
      out.phase = p.s * 9;
      out.anim = w.load ? (w.load.kind === 'plank' ? 'carryLogs' : 'carryFront') : 'walk';
      out.run = w.mv.speed > WALK * 1.6; // ils courent entre la mairie et les chantiers
      out.y = sites.platformY(w.job, w.lvl);
    } else {
      const a = BUILDER_ACTS[w.act] || BUILDER_ACTS.idle;
      out.anim = a[0];
      out.tool = a[1];
      if ((w.act === 'climb' || w.act === 'descend') && w.cl) {
        out.x = w.cl[0] + (w.x - w.cl[0]) * k;
        out.z = w.cl[1] + (w.z - w.cl[1]) * k;
        const y0 = sites.platformY(w.job, w.lvlFrom), y1 = sites.platformY(w.job, w.lvl);
        out.y = y0 + (y1 - y0) * k;
        out.dir = w.dir;
      } else out.y = sites.platformY(w.job, w.lvl);
    }
    if (w.load) out.load = w.load.kind === 'plank' ? 'plank' : w.load.kind === 'stoneBlock' ? 'stoneBlock' : 'bricks';
    if (w.act === 'fetch' && !w.load && k > 0.55) out.load = null;
    if (!w.load && !w.mv && (w.act === 'idle') && w.state === 'site') out.tool = 'hammer';
    if (out.y === 0) out.y = this.groundY(out.x, out.z);
    return out;
  }

  /** Bruits et poussières du chantier, au rythme des gestes. */
  builderEffects(w, f, t) {
    const r = this.r;
    let s = this.seen.get(w.id);
    if (!s) this.seen.set(w.id, (s = { act: '', t0: -1, k: -1 }));
    if (s.act !== w.act || s.t0 !== w.t0) {
      if (w.act === 'drop' || w.act === 'place') this.sound('drop', f);
      if (w.act === 'cheer' && s.act !== 'cheer') r.particles.emit('sparkle', f.x, (f.y || 0) + 0.25, f.z, 3);
      s.act = w.act;
      s.t0 = w.t0;
      s.k = -1;
    }
    const el = t - w.t0;
    const beat = { hammer: [0.42, 0.3], hammerLow: [0.5, 0.36], stake: [0.5, 0.36], dig: [0.95, 0.6], saw: [0.36, 0.1] }[w.act];
    if (!beat || el < beat[1]) return;
    const k = Math.floor((el - beat[1]) / beat[0]);
    if (k <= s.k) return;
    s.k = k;
    const fx = f.x + Math.sin(f.dir) * 0.11, fz = f.z + Math.cos(f.dir) * 0.11, fy = (f.y || 0);
    if (w.act === 'hammer' || w.act === 'hammerLow' || w.act === 'stake') {
      if (k % 2 === 0) r.particles.emit('chips', fx, fy + (w.act === 'hammer' ? 0.17 : 0.05), fz, 2, { scale: 0.6 });
      this.sound('hammer', f);
    } else if (w.act === 'dig') {
      r.particles.emit('soil', fx, fy + 0.02, fz, 5);
      this.sound('dig', f);
    } else if (w.act === 'saw') {
      r.particles.emit('chips', fx, fy + 0.09, fz, 2, { scale: 0.45 });
      if (k % 2 === 0) this.sound('saw', f);
    }
  }

  groundY(x, z) {
    const w = this.r.world;
    const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
    if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) return 0;
    const i = tz * SIZE + tx;
    const t = w.terrain[i];
    if ((t === T.WATER || t === T.DEEP) && w.road[i]) return 0.08;
    return 0;
  }

  /** Effets du travail : coups de hache (l'arbre tremble, copeaux), chute, terre, gouttes, épis. */
  effects(w, f, t) {
    const r = this.r;
    let s = this.seen.get(w.id);
    if (!s) this.seen.set(w.id, (s = { act: '', t0: -1, k: -1 }));
    if (s.act !== w.act || s.t0 !== w.t0) {
      // nouvelle action
      if (w.act === 'watch' && s.act === 'chop') {
        this.sound('timber', f);
        const fl = w.target?.fell;
        if (fl) r.particles.emit('leaves', fl.x + Math.sin(fl.dir) * 0.3, 0.25, fl.z + Math.cos(fl.dir) * 0.3, 14);
      }
      if (w.act === 'drop' || (s.act === 'drop' && w.act !== 'drop')) {
        /* rien */
      }
      s.act = w.act;
      s.t0 = w.t0;
      s.k = -1;
      s.k2 = -1;
    }
    const el = t - w.t0;
    const strikes = { chop: [0.7, 0.42], trim: [0.62, 0.36], till: [1.0, 0.62], harvest: [0.8, 0.4] }[w.act];
    if (strikes && el >= 0) {
      const k = Math.floor((el - strikes[1]) / strikes[0]);
      if (k > s.k && el >= strikes[1]) {
        s.k = k;
        const fx = f.x + Math.sin(f.dir) * 0.12, fz = f.z + Math.cos(f.dir) * 0.12;
        if (w.act === 'chop') {
          const id = w.target?.tree;
          if (id != null) r.vegetation.shake(id);
          r.particles.emit('chips', fx, 0.08, fz, 5);
          if (k % 2 === 0) r.particles.emit('leaves', fx, 0.32, fz, 2);
          this.sound('chop', f);
        } else if (w.act === 'trim') {
          r.particles.emit('chips', fx, 0.03, fz, 4);
          this.sound('chop', f);
        } else if (w.act === 'till') {
          r.particles.emit('soil', fx, 0.03, fz, 5);
        } else if (w.act === 'harvest') {
          r.particles.emit(w.role === 'farmer' ? 'grain' : 'leaves', fx, 0.05, fz, 3);
          if (k % 2 === 0) this.sound('harvest', f);
        }
      }
    }
    // les autres métiers
    const beat = { pick: [0.62, 0.42], dig: [0.95, 0.6], smith: [0.5, 0.33], pitch: [1.1, 0.8], saw: [0.36, 0.1], knead: [1.05, 0.5], mold: [1.05, 0.5], loadCart: [0.9, 0.5], unloadCart: [0.9, 0.5] }[w.act];
    if (beat && el >= beat[1]) {
      const k = Math.floor((el - beat[1]) / beat[0]);
      if (k > (s.k2 ?? -1)) {
        s.k2 = k;
        const fx = f.x + Math.sin(f.dir) * 0.13, fz = f.z + Math.cos(f.dir) * 0.13;
        const job = this.r.world.buildings.get(w.job)?.type;
        if (w.act === 'pick') {
          r.particles.emit('stones', fx, 0.05, fz, 4);
          if (job === 'mine' && k % 2) r.particles.emit('sparks', fx, 0.06, fz, 3);
          this.sound('pick', f);
        } else if (w.act === 'dig') {
          r.particles.emit('soil', fx, 0.02, fz, 5, job === 'claypit' ? { color: [0.72, 0.45, 0.3] } : undefined);
          this.sound('dig', f);
        } else if (w.act === 'smith') {
          r.particles.emit('sparks', fx, 0.09, fz, 5);
          this.sound('anvil', f);
        } else if (w.act === 'pitch') {
          r.particles.emit('hay', fx, 0.12, fz, 5);
        } else if (w.act === 'saw') {
          r.particles.emit('chips', fx, 0.09, fz, 2, { scale: 0.45 });
          if (k % 2 === 0) this.sound('saw', f);
        } else if (w.act === 'knead' || w.act === 'mold') {
          if (job === 'brickworks') r.particles.emit('soil', fx, 0.08, fz, 2, { color: [0.72, 0.45, 0.3] });
          else r.particles.emit('flour', fx, 0.09, fz, 2);
        } else this.sound('drop', f);
      }
    }
    if (w.act === 'feed' && Math.random() < 0.6) r.particles.emit('grain', f.x + Math.sin(f.dir + 0.4) * 0.12, 0.1, f.z + Math.cos(f.dir + 0.4) * 0.12, 1, { vx: Math.sin(f.dir) * 0.6, vz: Math.cos(f.dir) * 0.6 });
    if (w.act === 'pour' && Math.random() < 0.7) r.particles.emit('drops', f.x + Math.sin(f.dir) * 0.14, 0.09, f.z + Math.cos(f.dir) * 0.14, 1);
    if (w.role === 'fisher' && w.target?.bob) {
      const bob = w.target.bob;
      if (w.act === 'cast' && el > (w.until - w.t0) * 0.55 && !s.cast) {
        s.cast = true;
        this.sound('cast', f);
      }
      if (w.act === 'fishWait') {
        s.cast = false;
        if (!s.splashed) {
          s.splashed = true;
          r.particles.emit('splash', bob[0], -0.05, bob[1], 3);
        }
        if (Math.random() < 0.015) r.particles.emit('drops', bob[0], -0.04, bob[1], 2);
      }
      if (w.act === 'reel' && !s.reeled) {
        s.reeled = true;
        r.particles.emit('splash', bob[0], -0.05, bob[1], 8);
        this.sound('splash', f);
      }
      if (w.act !== 'reel') s.reeled = false;
      if (w.act === 'cast') s.splashed = false;
    }
    if (w.act === 'water' && Math.random() < 0.5) {
      r.particles.emit('drops', f.x + Math.sin(f.dir) * 0.11, 0.07, f.z + Math.cos(f.dir) * 0.11, 1);
    }
    if (w.act === 'sow' && Math.random() < 0.12) r.particles.emit('grain', f.x + Math.sin(f.dir + 0.6) * 0.06, 0.08, f.z + Math.cos(f.dir + 0.6) * 0.06, 1, { scale: 0.6 });
  }

  /** Les sons du travail, seulement de près. */
  sound(name, f) {
    const cam = this.r.cam;
    if (cam.distance > 22 || f.d2 > 140) return;
    const now = this.time;
    if (now - (this.lastSound?.[name] || 0) < 0.12) return;
    this.lastSound = this.lastSound || {};
    this.lastSound[name] = now;
    this.r.game.sound?.play(name);
  }

  resetMovers() {
    this.movers = [];
    this.homeSeen = new Map();
    this.homeSeenInit = false;
    this.commuters = [];
  }

  /** Une maison gagne ou perd un habitant : quelqu'un arrive (ou part) par la route, depuis la mairie. */
  scanHomes(tx, tz, radius) {
    const world = this.r.world, game = this.r.game;
    if (!this.homeSeen) this.homeSeen = new Map();
    if (!this.movers) this.movers = [];
    const th = world.townhall();
    const first = !this.homeSeenInit;
    this.homeSeenInit = true;
    for (const b of world.buildings.values()) {
      if (b.residents == null) continue;
      const n = Math.floor(b.residents || 0);
      const was = this.homeSeen.get(b.id);
      this.homeSeen.set(b.id, n);
      if (first || was == null || n === was || !th || game.isDemo && !game.playing && Math.random() < 0.5) continue;
      if (this.movers.length >= 10) continue;
      const c = world.centerOf(b);
      if ((c.cx - HALF - tx) ** 2 + (c.cz - HALF - tz) ** 2 > radius * radius) continue;
      const leaving = n < was;
      const a = world.centerOf(th);
      const rb = roadNextTo(world, b, [a.cx - HALF, a.cz - HALF]);
      const rt = roadNextTo(world, th, [c.cx - HALF, c.cz - HALF]);
      if (rb < 0 || rt < 0) continue;
      const tiles = roadPath(world, rt, rb);
      if (!tiles) continue;
      let pts = roadPoints(tiles);
      // ils arrivent par la route depuis la mairie (la place du village) et entrent dans la maison
      pts.unshift(doorOf(th));
      pts.push(doorOf(b));
      if (leaving) pts = pts.reverse();
      const mv = makeMove(pts, WALK * 1.1, 0);
      this.movers.push({ mv, start: this.moverClock, leaving, shirt: SHIRTS[(b.id * 7 + n) % SHIRTS.length] });
    }
  }

  /**
   * Le train est à quai : des voyageurs en descendent (valise à la main) et partent vers la place
   * du village ; d'autres sortent de la gare et montent à bord. `coaches` : position locale (x) des
   * voitures le long du quai.
   */
  trainTravellers(b, coaches) {
    const world = this.r.world;
    if (!this.movers) this.movers = [];
    const th = world.townhall();
    const L = (x, z) => localToWorld(b, x, z);
    const door = doorOf(b);
    let toTown = null;
    if (th) {
      const a = world.centerOf(th), c = world.centerOf(b);
      const rb = roadNextTo(world, b, [a.cx - HALF, a.cz - HALF]);
      const rt = roadNextTo(world, th, [c.cx - HALF, c.cz - HALF]);
      const tiles = rb >= 0 && rt >= 0 ? roadPath(world, rb, rt) : null;
      if (tiles) toTown = [...roadPoints(tiles), doorOf(th)];
    }
    const seed = Math.floor(this.moverClock || 0);
    const n = 2 + (seed % 3), m = 1 + (seed % 2);
    for (let k = 0; k < n + m && this.movers.length < 16; k++) {
      const off = (k % 2 ? 0.16 : -0.16) + ((k * 0.37) % 0.1);
      const lx = coaches[k % coaches.length] + off;
      const end = lx < 0 ? -1.42 : 1.42;
      let pts = [L(lx, -0.6), L(lx, -0.42), L(end, -0.42 + (k % 3) * 0.03), L(end, 0.86), door];
      const arriving = k < n;
      if (arriving && toTown) pts = pts.concat(toTown);
      if (!arriving) pts = pts.reverse();
      const mv = makeMove(pts, WALK * (1 + (k % 3) * 0.08), 0);
      this.movers.push({ mv, start: (this.moverClock || 0) + k * 0.6, leaving: true, shirt: SHIRTS[(seed + k * 5) % SHIRTS.length] });
    }
  }

  /** Travailleurs « abrégés » en route : on calcule leur chemin seulement s'ils sont près de la caméra. */
  scanCommuters(hour, tx, tz, radius) {
    const game = this.r.game, world = this.r.world;
    const out = [];
    const r2 = radius * radius;
    let budget = 30; // chemins calculés au plus par passage
    for (const w of game.villagers.list) {
      if (w.detail || w.home < 0) continue;
      // fenêtre de trajet large (avant de connaître la durée exacte)
      const inMorning = hour >= w.start && hour < w.start + 4;
      const inEvening = hour >= w.end && hour < w.end + 4;
      if (!inMorning && !inEvening) continue;
      const home = world.buildings.get(w.home), job = world.buildings.get(w.job);
      if (!home || !job) continue;
      const hc = world.centerOf(home), jc = world.centerOf(job);
      const near = (c) => (c.cx - HALF - tx) ** 2 + (c.cz - HALF - tz) ** 2 < r2;
      if (!near(hc) && !near(jc)) continue;
      let c = w.cpath;
      if (!c || c.v !== world.version) {
        if (budget-- <= 0) continue;
        c = w.cpath = this.commutePath(world, home, job);
        if (!c) {
          w.cpath = { v: world.version, mv: null };
          continue;
        }
      }
      if (!c.mv) continue;
      out.push({ w, mv: c.mv, dur: c.dur });
    }
    this.commuters = out;
  }

  commutePath(world, home, job) {
    const a = world.centerOf(home), c = world.centerOf(job);
    const ra = roadNextTo(world, home, [c.cx - HALF, c.cz - HALF]);
    const rc = roadNextTo(world, job, [a.cx - HALF, a.cz - HALF]);
    if (ra < 0 || rc < 0) return null;
    const tiles = roadPath(world, ra, rc);
    if (!tiles) return null;
    const pts = roadPoints(tiles);
    pts.unshift(doorOf(home));
    pts.push(doorOf(job));
    const mv = makeMove(pts, 1, 0);
    const speed = Math.max(WALK, mv.len / 14);
    mv.speed = speed;
    // durée du trajet en heures de jeu
    const dur = (mv.len / speed) / (DAY_SECONDS / 24);
    return { v: world.version, mv, dur };
  }

  /* ───────── Dessin ───────── */
  draw(figs, world) {
    for (const k in this.meshes) this.meshes[k].n = 0;
    const crowd = this.r.crowd;
    if (crowd && !this.poser) this.poser = new HumanPoser(crowd.lib);
    const skinned = crowd && this.poser?.ok && !this.debugBlocks;
    for (const f of figs) {
      if (skinned && f.model) this.drawSkinned(crowd, f);
      else this.drawFigure(f);
    }
    for (const k in this.meshes) {
      const e = this.meshes[k];
      e.m.count = e.n;
      if (e.n) {
        e.m.instanceMatrix.needsUpdate = true;
        if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true;
      }
    }
    void world;
  }

  put(name, matrix, color) {
    const e = this.meshes[name];
    if (!e || e.n >= e.m.instanceMatrix.count) return;
    e.m.setMatrixAt(e.n, matrix);
    if (e.tint) e.m.setColorAt(e.n, this.col.setHex(color ?? 0xffffff));
    e.n++;
  }

  /* ───────── Vrais modèles animés ───────── */
  drawSkinned(crowd, f) {
    const P = pose(f, this.time);
    const rig = crowd.rig('human');
    this.poser.pose(rig, f, P, this.time);
    const scale = (f.scale || 1.18) / 1.18;
    const yaw = f.dir || 0, fx = f.x, fy = (f.y || 0) + (P.bob || 0), fz = f.z;
    // niveau de détail : modèle complet près de la caméra
    const cp = this.r.camera.position;
    const dc2 = (cp.x - fx) ** 2 + (cp.y - fy) ** 2 + (cp.z - fz) ** 2;
    const lod = dc2 < this.lodDist2 ? 0 : 1;
    const slot = crowd.add(f.model, lod);
    if (!slot) return;
    const [e, i] = slot;
    rig.writeSkin(e.stage, i * e.nb * 12, fx, fy, fz, yaw, scale);
    crowd.tint(e, i, 1, f.skin);
    crowd.tint(e, i, 2, f.hairC);
    crowd.tint(e, i, 3, f.shirt);
    crowd.tint(e, i, 4, f.pants);
    if (f.hatTint != null) crowd.tint(e, i, 5, f.hatTint);
    // outils dans les mains, charges, charrette
    const B = this.poser.B;
    const s = f.scale || 1.18;
    const A = this.handFrame(rig, B.uaP, B.fistP, fx, fy, fz, yaw, scale, s, this.armM);
    if (P.tool) {
      this.put(P.tool, A);
      if (P.tool === 'rod') this.fishing(f, A, P);
    }
    const tl = P.toolL || f.toolL;
    if (tl) this.put(tl, this.handFrame(rig, B.uaN, B.fistN, fx, fy, fz, yaw, scale, s, this.tmp2));
    const R = this.root;
    this.q.setFromAxisAngle(this.up, yaw);
    this.v.set(fx, fy, fz);
    this.s.setScalar(s);
    R.compose(this.v, this.q, this.s);
    if (f.cart) {
      this.put('cart', R);
      if (f.cartLoad) this.put(f.cartLoad, R);
    }
    if (f.load) {
      const M = this.tmp, T2 = this.torsoM;
      if (SHOULDER_LOADS.has(f.load)) {
        // sur l'épaule : même repère que les anciens personnages (hanches, buste penché)
        M.makeRotationX(P.tilt).setPosition(0, 0.077, 0);
        T2.multiplyMatrices(R, M);
        this.put(f.load, T2);
      } else if (f.load === 'tray') {
        rig.worldPos(B.fistP, fx, fy, fz, yaw, scale, this.v);
        T2.compose(this.v, this.q, this.s.setScalar(s));
        M.makeTranslation(-0.05, -0.1, -0.05);
        this.put('tray', this.tmp2.multiplyMatrices(T2, M));
      } else {
        // à deux mains, devant soi
        const a = rig.worldPos(B.fistP, fx, fy, fz, yaw, scale, this.va || (this.va = new THREE.Vector3()));
        const b = rig.worldPos(B.fistN, fx, fy, fz, yaw, scale, this.vb || (this.vb = new THREE.Vector3()));
        this.v.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.012 * s, (a.z + b.z) / 2);
        T2.compose(this.v, this.q, this.s.setScalar(s));
        M.makeTranslation(0, -0.012 - (P.loadDrop || 0), -0.05);
        this.put(f.load, this.tmp2.multiplyMatrices(T2, M));
      }
    }
  }

  /**
   * Repère « bras » d'une main (comme celui des anciens personnages : le bras descend selon −Y),
   * placé pour que la main de l'outil (y ≈ −0,088) tombe dans la vraie main du modèle.
   */
  handFrame(rig, ua, fist, fx, fy, fz, yaw, scale, s, out) {
    const sh = rig.worldPos(ua, fx, fy, fz, yaw, scale, this.vsh || (this.vsh = new THREE.Vector3()));
    const h = rig.worldPos(fist, fx, fy, fz, yaw, scale, this.vh || (this.vh = new THREE.Vector3()));
    let yx = sh.x - h.x, yy = sh.y - h.y, yz = sh.z - h.z;
    const yl = Math.hypot(yx, yy, yz) || 1;
    yx /= yl;
    yy /= yl;
    yz /= yl;
    // x : la droite de la figure, rendue perpendiculaire au bras
    let xx = Math.cos(yaw), xy = 0, xz = -Math.sin(yaw);
    const d = xx * yx + xy * yy + xz * yz;
    xx -= d * yx;
    xy -= d * yy;
    xz -= d * yz;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
    const k = 0.088 * s;
    out.set(xx * s, yx * s, zx * s, h.x + yx * k, xy * s, yy * s, zy * s, h.y + yy * k, xz * s, yz * s, zz * s, h.z + yz * k, 0, 0, 0, 1);
    return out;
  }

  /** Ligne de pêche du bout de la canne au bouchon (et le poisson qui sort de l'eau). */
  fishing(f, A, P) {
    if (!f.bob) return;
    const tip = this.v2 || (this.v2 = new THREE.Vector3());
    tip.set(ROD_TIP[0], ROD_TIP[1], ROD_TIP[2]).applyMatrix4(A);
    const t = f.bobT || 0;
    // le bouchon danse, plonge quand ça mord
    let by = -0.065 + Math.sin(this.time * 3 + f.x * 7) * 0.006;
    if (f.anim === 'fishWait' && (f.dur || 9) - t < 0.9) by -= 0.02 * Math.abs(Math.sin(t * 18));
    let bx = f.bob[0], bz = f.bob[1];
    if (f.anim === 'reel') {
      // on remonte : le poisson vient vers le pêcheur
      const k = Math.min(1, t / Math.max(0.2, f.dur || 1.3));
      bx = f.bob[0] + (tip.x - f.bob[0]) * k * 0.85;
      bz = f.bob[1] + (tip.z - f.bob[1]) * k * 0.85;
      by = by + (tip.y - 0.05 - by) * k * k;
      const M = this.tmp;
      M.makeTranslation(bx, by + 0.06, bz);
      this.put('fishHang', M);
    } else if (f.anim === 'cast') {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 1.1));
      if (k < 0.55) return;
      const u = (k - 0.55) / 0.45;
      bx = tip.x + (f.bob[0] - tip.x) * u;
      bz = tip.z + (f.bob[1] - tip.z) * u;
      by = tip.y + (by - tip.y) * u + Math.sin(u * Math.PI) * 0.08;
    }
    const end = this.v3 || (this.v3 = new THREE.Vector3());
    end.set(bx, by + 0.02, bz);
    const len = tip.distanceTo(end);
    if (len < 0.01) return;
    const M = this.tmp;
    M.lookAt(tip, end, this.up); // -z vers le bouchon : la ligne est modélisée le long de -z
    M.scale(this.s.set(1, 1, len));
    M.setPosition(tip);
    this.put('line', M);
    M.makeTranslation(bx, by, bz);
    this.put('bobber', M);
  }

  drawFigure(f) {
    const P = pose(f, this.time);
    const R = this.root, M = this.tmp, T2 = this.torsoM;
    this.q.setFromAxisAngle(this.up, f.dir || 0);
    this.v.set(f.x, (f.y || 0) + P.bob - P.crouch, f.z);
    this.s.setScalar(f.scale || 1);
    R.compose(this.v, this.q, this.s);
    // jambes
    for (const side of [-1, 1]) {
      const a = side < 0 ? P.legL : P.legR;
      M.makeRotationX(a).setPosition(side * 0.012, 0.077, 0);
      this.put('leg', this.tmp2.multiplyMatrices(R, M), f.pants);
    }
    // torse (penché vers l'avant autour des hanches)
    M.makeRotationX(P.tilt).setPosition(0, 0.077, 0);
    T2.multiplyMatrices(R, M);
    this.put('torso', T2, f.shirt);
    if (f.apron != null) this.put('apron', T2, f.apron);
    else if (f.role === 'lumberjack' || f.role === 'farmer' || f.role === 'gardener' || f.role === 'craftsman' || f.role === 'builder' || f.role === 'digger' || f.role === 'carter') this.put('belt', T2);
    // tête
    M.makeRotationY(P.look).setPosition(0, 0.082, 0);
    const H = this.tmp2.multiplyMatrices(T2, M);
    this.put('head', H, f.skin);
    this.put('eyes', H);
    if (f.hat === 'straw' || f.hat === 'toque') this.put(f.hat, H);
    else if (f.hat) this.put(f.hat, H, f.hatC);
    if (!f.hat || f.hat === 'straw' || f.hat === 'toque') this.put(f.longHair ? 'hairLong' : 'hairShort', H, f.hairC);
    else if (f.longHair) this.put('hairLong', H, f.hairC);
    // bras, mains, outil
    for (const side of [-1, 1]) {
      const ax = side < 0 ? P.armL : P.armR;
      const az = side < 0 ? -P.armSpread : P.armSpread;
      M.makeRotationX(ax);
      if (az) M.premultiply(this.tmp2.makeRotationZ(az));
      M.setPosition(side * 0.033, 0.068, 0);
      const A = this.armM.multiplyMatrices(T2, M);
      this.put('arm', A, f.shirt);
      this.put('hand', A, f.skin);
      if (side > 0 && P.tool) {
        this.put(P.tool, A);
        if (P.tool === 'rod') this.fishing(f, A, P);
      }
      if (side < 0 && (P.toolL || f.toolL)) this.put(P.toolL || f.toolL, A);
    }
    // charrette à bras
    if (f.cart) {
      this.put('cart', R);
      if (f.cartLoad) this.put(f.cartLoad, R);
    }
    // charge
    if (f.load) {
      if (P.loadDrop) {
        M.makeTranslation(0, -P.loadDrop, 0.01 * P.loadDrop);
        this.put(f.load, this.tmp2.multiplyMatrices(T2, M));
      } else this.put(f.load, T2);
    }
  }
}

/** Ce que contient un tas (pour la charrette). */
function cartKindOf(b) {
  return { lumber: 'logs', garden: 'crates', farm: 'sacks', quarry: 'stones', mine: 'ore', claypit: 'clay', fisher: 'fish', coop: 'eggs', pasture: 'milk', sawmill: 'plankStack', forge: 'toolsCrate', brickworks: 'bricks', bakery: 'bread', mill: 'sacks' }[b.type] || 'crates';
}

/** Fenêtre de trajet d'un travailleur abrégé (aller le matin, retour le soir). */
function commutePhase(w, hour, durH) {
  const d = Math.max(0.15, durH || 1);
  if (hour >= w.start && hour < w.start + d) return { dir: 1, f: (hour - w.start) / d };
  if (hour >= w.end && hour < w.end + d) return { dir: -1, f: (hour - w.end) / d };
  return null;
}

/* ───────── Gestes ───────── */
const ease = (k) => k * k * (3 - 2 * k);

/** Angles des membres selon l'animation (radians ; bras vers l'avant = négatif). */
export function pose(f, time) {
  const P = { legL: 0, legR: 0, armL: 0.05, armR: -0.05, armSpread: 0, tilt: 0.02, look: 0, bob: 0, crouch: 0, tool: null, toolL: null, loadDrop: 0 };
  const t = f.t || 0;
  switch (f.anim) {
    case 'browse':
      P.armR = -0.8 + Math.sin(t * 1.6) * 0.25;
      P.armL = -0.15;
      P.look = Math.sin(t * 0.8) * 0.35;
      P.tilt = 0.12;
      break;
    case 'chat':
      P.armR = -0.6 + Math.sin(t * 2) * 0.35;
      P.armSpread = 0.1 + Math.sin(t * 1.4) * 0.12;
      P.look = Math.sin(t * 0.8) * 0.18;
      break;
    case 'play':
      P.armL = -0.5 + Math.sin(t * 4) * 0.5;
      P.armR = -0.5 - Math.sin(t * 4) * 0.5;
      P.legL = Math.sin(t * 4) * 0.15;
      P.legR = -P.legL;
      P.bob = Math.max(0, Math.sin(t * 4)) * 0.025;
      P.look = Math.sin(t * 2) * 0.25;
      break;
    case 'walk':
    case 'carryLogs':
    case 'carryFront': {
      const ph = f.phase || 0;
      const sw = Math.sin(ph);
      const stride = f.anim === 'walk' ? 0.55 : 0.42;
      P.legL = sw * stride;
      P.legR = -sw * stride;
      P.bob = Math.abs(Math.cos(ph)) * 0.006;
      P.tilt = 0.05;
      if (f.anim === 'walk') {
        P.armL = -sw * 0.45;
        P.armR = sw * 0.45;
      } else if (f.anim === 'carryLogs') {
        P.armR = -2.75;
        P.armL = -sw * 0.3;
        P.tilt = 0.08;
      } else {
        P.armL = -1.0 + Math.sin(ph * 2) * 0.04;
        P.armR = -1.0 + Math.sin(ph * 2) * 0.04;
        P.tilt = -0.03;
      }
      break;
    }
    case 'chop':
    case 'trim': {
      const per = f.anim === 'chop' ? 0.7 : 0.62;
      const u = ((t % per) + per) % per / per;
      const hi = f.anim === 'chop' ? -2.95 : -2.4, lo = f.anim === 'chop' ? -0.55 : -0.18;
      let a;
      if (u < 0.58) a = -0.6 + (hi + 0.6) * ease(u / 0.58); // on lève la hache
      else if (u < 0.72) a = hi + (lo - hi) * Math.pow((u - 0.58) / 0.14, 1.6); // on frappe
      else a = lo + (-0.6 - lo) * ease((u - 0.72) / 0.28);
      P.armL = a;
      P.armR = a;
      P.armSpread = 0.12;
      P.tilt = (f.anim === 'trim' ? 0.32 : 0.06) + (u > 0.58 && u < 0.8 ? 0.16 : 0);
      if (f.anim === 'trim') {
        P.legL = -0.35;
        P.legR = 0.25;
        P.crouch = 0.008;
      }
      P.tool = 'axe';
      break;
    }
    case 'till': {
      const u = (t % 1.0) / 1.0;
      const a = u < 0.62 ? -0.5 + (-2.1 + 0.5) * ease(u / 0.62) : -2.1 + (2.1 - 0.45) * Math.pow((u - 0.62) / 0.38, 1.4);
      P.armL = a;
      P.armR = a;
      P.tilt = 0.18 + (u > 0.62 ? 0.12 : 0);
      P.legL = 0.25;
      P.legR = -0.15;
      P.tool = 'hoe';
      break;
    }
    case 'sow': {
      const ph = t * 5.5;
      P.legL = Math.sin(ph) * 0.3;
      P.legR = -Math.sin(ph) * 0.3;
      P.armL = -0.75;
      P.armR = -0.9 + Math.sin(t * 7) * 0.5;
      P.armSpread = 0.25 + Math.max(0, Math.sin(t * 7)) * 0.35;
      P.tilt = 0.12;
      P.toolL = 'seedbag';
      P.bob = Math.abs(Math.cos(ph)) * 0.004;
      break;
    }
    case 'water': {
      P.armR = -1.05 + Math.sin(t * 1.6) * 0.06;
      P.armL = 0.1;
      P.tilt = 0.1;
      P.look = Math.sin(t * 0.7) * 0.15;
      P.tool = 'can';
      break;
    }
    case 'harvest': {
      const farm = f.role === 'farmer';
      if (farm) {
        // fauchage : grands mouvements de côté
        const u = Math.sin(t * 4.2);
        P.armL = -0.9;
        P.armR = -0.9;
        P.armSpread = u * 0.5;
        P.look = u * 0.25;
        P.tilt = 0.25;
        P.tool = 'scythe';
      } else {
        P.armL = -0.45 + Math.sin(t * 7) * 0.25;
        P.armR = -0.45 - Math.sin(t * 7) * 0.25;
        P.tilt = 0.7;
        P.crouch = 0.012;
        P.legL = -0.5;
        P.legR = 0.3;
      }
      break;
    }
    case 'weed': {
      P.armL = -0.5 + Math.sin(t * 5) * 0.2;
      P.armR = -0.5 - Math.sin(t * 5) * 0.2;
      P.tilt = 0.72;
      P.crouch = 0.014;
      P.legL = -0.55;
      P.legR = 0.35;
      break;
    }
    case 'hammer': {
      // marteau contre le mur : le bras droit frappe, la main gauche tient le clou
      const u = ((t % 0.42) + 0.42) % 0.42 / 0.42;
      const a = u < 0.62 ? -1.25 + (-2.25 + 1.25) * ease(u / 0.62) : -2.25 + (2.25 - 1.15) * Math.pow((u - 0.62) / 0.38, 1.5);
      P.armR = a;
      P.armL = -1.35;
      P.armSpread = -0.05;
      P.tilt = 0.06 + (u > 0.62 ? 0.04 : 0);
      P.look = 0.05;
      P.tool = 'hammer';
      break;
    }
    case 'hammerLow': {
      // à genoux près des fondations
      const u = ((t % 0.5) + 0.5) % 0.5 / 0.5;
      const a = u < 0.6 ? -0.7 + (-1.9 + 0.7) * ease(u / 0.6) : -1.9 + (1.9 - 0.55) * Math.pow((u - 0.6) / 0.4, 1.5);
      P.armR = a;
      P.armL = -0.65;
      P.tilt = 0.55;
      P.crouch = 0.045;
      P.legL = -1.3;
      P.legR = 0.35;
      P.tool = 'hammer';
      break;
    }
    case 'dig': {
      // pelle : on enfonce, on soulève, on jette
      const u = (t % 0.95) / 0.95;
      const a = u < 0.4 ? -0.35 - 0.6 * ease(u / 0.4) : u < 0.7 ? -0.95 + 0.3 * ease((u - 0.4) / 0.3) : -0.65 + 0.3 * ease((u - 0.7) / 0.3);
      P.armL = a - 0.2;
      P.armR = a;
      P.tilt = u < 0.4 ? 0.2 + 0.3 * ease(u / 0.4) : 0.5 - 0.35 * ease((u - 0.4) / 0.6);
      P.legL = 0.3;
      P.legR = -0.2;
      P.look = u > 0.7 ? 0.35 : 0;
      P.tool = 'shovel';
      break;
    }
    case 'saw': {
      const u = Math.sin(t * 17.5);
      P.armR = -1.1 + u * 0.32;
      P.armL = -0.9;
      P.armSpread = -0.1;
      P.tilt = 0.42;
      P.legL = 0.35;
      P.legR = -0.2;
      P.look = -0.15;
      P.tool = 'saw';
      break;
    }
    case 'paint': {
      P.armR = -1.55 + Math.sin(t * 6) * 0.35;
      P.armL = 0.05;
      P.armSpread = Math.sin(t * 3) * 0.12;
      P.tilt = 0.04;
      P.look = Math.sin(t * 1.3) * 0.12;
      P.tool = 'brush';
      break;
    }
    case 'place': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 0.6));
      P.armL = -1.0 - Math.sin(k * Math.PI) * 0.65;
      P.armR = P.armL;
      P.tilt = 0.12;
      P.loadDrop = -Math.sin(k * Math.PI) * 0.03;
      break;
    }
    case 'pickup': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 0.8));
      P.tilt = Math.sin(k * Math.PI) * 0.6;
      P.armL = -0.9 * Math.sin(k * Math.PI) - 0.1;
      P.armR = P.armL;
      P.crouch = Math.sin(k * Math.PI) * 0.012;
      break;
    }
    case 'climb': {
      const ph = t * 7;
      P.armL = -2.5 + Math.sin(ph) * 0.35;
      P.armR = -2.5 - Math.sin(ph) * 0.35;
      P.legL = -0.6 + Math.sin(ph) * 0.45;
      P.legR = -0.6 - Math.sin(ph) * 0.45;
      P.tilt = -0.05;
      break;
    }
    case 'pick': {
      // pioche à deux mains : on lève haut, on frappe bas devant soi
      const per = 0.62;
      const u = ((t % per) + per) % per / per;
      const hi = -3.0, lo = -0.25;
      let a;
      if (u < 0.55) a = -0.5 + (hi + 0.5) * ease(u / 0.55);
      else if (u < 0.7) a = hi + (lo - hi) * Math.pow((u - 0.55) / 0.15, 1.5);
      else a = lo + (-0.5 - lo) * ease((u - 0.7) / 0.3);
      P.armL = a;
      P.armR = a;
      P.armSpread = 0.1;
      P.tilt = 0.12 + (u > 0.55 && u < 0.85 ? 0.3 : 0);
      P.legL = 0.3;
      P.legR = -0.2;
      P.tool = 'pickaxe';
      break;
    }
    case 'cast': {
      // on arme la canne au-dessus de l'épaule, puis on lance
      const k = Math.min(1, t / Math.max(0.2, f.dur || 1.1));
      const a = k < 0.45 ? -1.1 + (-2.7 + 1.1) * ease(k / 0.45) : -2.7 + (2.7 - 1.0) * ease(Math.min(1, (k - 0.45) / 0.25));
      P.armR = a;
      P.armL = a * 0.7;
      P.tilt = k < 0.45 ? -0.08 : 0.1;
      P.legL = 0.3;
      P.legR = -0.15;
      P.tool = 'rod';
      break;
    }
    case 'fishWait': {
      P.armR = -1.0 + Math.sin(time * 1.1 + (f.x || 0)) * 0.03;
      P.armL = -0.8;
      P.tilt = 0.02;
      P.look = Math.sin(time * 0.4 + (f.z || 0)) * 0.35;
      P.bob = Math.sin(time * 1.5) * 0.0015;
      P.tool = 'rod';
      break;
    }
    case 'reel': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 1.3));
      P.armR = -1.0 - k * 0.9 + Math.sin(t * 20) * 0.06;
      P.armL = -0.9 - k * 0.5;
      P.tilt = -0.1 * k;
      P.legL = -0.2;
      P.legR = 0.3;
      P.tool = 'rod';
      break;
    }
    case 'feed': {
      // la main gauche tient le sac de grain, la droite lance de grands arcs
      const s = Math.sin(t * 5.2);
      P.armL = -0.75;
      P.armR = -0.9 + s * 0.35;
      P.armSpread = 0.2 + Math.max(0, s) * 0.55;
      P.tilt = 0.08;
      P.look = s * 0.2;
      P.bob = Math.abs(Math.cos(t * 2.6)) * 0.003;
      P.toolL = 'seedbag';
      break;
    }
    case 'pour': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 2.4));
      P.armR = -0.9 - Math.sin(k * Math.PI) * 0.45;
      P.armL = -0.7 - Math.sin(k * Math.PI) * 0.3;
      P.tilt = 0.2 + Math.sin(k * Math.PI) * 0.15;
      P.tool = 'bucket';
      break;
    }
    case 'pitch': {
      // fourche : on soulève le foin et on le lance dans le râtelier
      const u = (t % 1.1) / 1.1;
      const a = u < 0.5 ? -0.6 - 0.4 * ease(u / 0.5) : -1.0 - 1.1 * ease((u - 0.5) / 0.5);
      P.armR = a;
      P.armL = a + 0.25;
      P.tilt = u < 0.5 ? 0.35 : 0.1;
      P.legL = 0.3;
      P.legR = -0.2;
      P.tool = 'pitchfork';
      break;
    }
    case 'collect': {
      P.armL = -0.55 + Math.sin(t * 4) * 0.2;
      P.armR = -0.75 - Math.sin(t * 4) * 0.25;
      P.tilt = 0.62;
      P.crouch = 0.018;
      P.legL = -0.6;
      P.legR = 0.35;
      break;
    }
    case 'milk': {
      // à genoux près de la vache, on tire en rythme
      P.crouch = 0.05;
      P.legL = -1.35;
      P.legR = 0.4;
      P.tilt = 0.32;
      P.armL = -0.95 + Math.sin(t * 7) * 0.14;
      P.armR = -0.95 - Math.sin(t * 7) * 0.14;
      P.armSpread = 0.06;
      P.tool = 'bucket';
      break;
    }
    case 'smith': {
      // marteau sur l'enclume (à hauteur de taille), la pince dans l'autre main
      const u = ((t % 0.5) + 0.5) % 0.5 / 0.5;
      const a = u < 0.6 ? -0.9 + (-2.3 + 0.9) * ease(u / 0.6) : -2.3 + (2.3 - 0.75) * Math.pow((u - 0.6) / 0.4, 1.6);
      P.armR = a;
      P.armL = -0.95;
      P.tilt = 0.18 + (u > 0.6 ? 0.08 : 0);
      P.legL = 0.25;
      P.legR = -0.2;
      P.tool = 'hammer';
      P.toolL = 'tongs';
      break;
    }
    case 'knead': {
      const s = Math.sin(t * 6);
      P.armL = -1.0 + s * 0.22;
      P.armR = -1.0 + s * 0.22;
      P.armSpread = 0.04;
      P.tilt = 0.32 + Math.max(0, s) * 0.12;
      P.bob = -Math.max(0, s) * 0.004;
      break;
    }
    case 'serve': {
      const k = Math.min(1, t / Math.max(0.3, f.dur || 2));
      const give = Math.sin(Math.min(1, k * 2) * Math.PI);
      P.armR = -0.4 - give * 1.0;
      P.armL = -0.3 + Math.sin(t * 2.2) * 0.2;
      P.tilt = 0.08 + give * 0.08;
      P.look = Math.sin(t * 0.9) * 0.25;
      break;
    }
    case 'call': {
      P.armR = -2.7;
      P.armSpread = 0.3 + Math.sin(t * 9) * 0.25;
      P.armL = 0.05;
      P.look = Math.sin(t * 1.4) * 0.5;
      P.bob = Math.abs(Math.sin(t * 4.5)) * 0.002;
      break;
    }
    case 'loadCart': {
      const u = (t % 0.9) / 0.9;
      P.tilt = Math.sin(u * Math.PI) * 0.55;
      P.armL = -0.5 - Math.sin(u * Math.PI) * 0.6;
      P.armR = P.armL;
      P.look = Math.sin(u * Math.PI) * 0.2;
      break;
    }
    case 'push': {
      const ph = f.phase || 0;
      const sw = Math.sin(ph);
      P.legL = sw * 0.45;
      P.legR = -sw * 0.45;
      P.bob = Math.abs(Math.cos(ph)) * 0.005;
      P.armL = -0.95;
      P.armR = -0.95;
      P.tilt = 0.14;
      break;
    }
    case 'carryTray': {
      const ph = f.phase || 0;
      const sw = Math.sin(ph);
      P.legL = sw * 0.5;
      P.legR = -sw * 0.5;
      P.bob = Math.abs(Math.cos(ph)) * 0.005;
      P.armR = -1.7;
      P.armL = -sw * 0.35;
      break;
    }
    case 'row': {
      // on tire sur les rames : bras devant, buste qui bascule
      const k = Math.sin(t * 3.2);
      P.armL = -1.25 + k * 0.45;
      P.armR = -1.25 + k * 0.45;
      P.armSpread = 0.3;
      P.tilt = -0.05 + k * 0.2;
      break;
    }
    case 'rowRest':
      P.armL = -0.7;
      P.armR = -0.7;
      P.armSpread = 0.25;
      P.look = Math.sin(time * 0.4 + (f.seed || 0)) * 0.6;
      break;
    case 'cheer': {
      const j = Math.abs(Math.sin(t * 7));
      P.armL = -2.9 + Math.sin(t * 14) * 0.15;
      P.armR = -2.9 - Math.sin(t * 14) * 0.15;
      P.armSpread = 0.35;
      P.bob = j * 0.035;
      P.tilt = -0.08;
      P.look = Math.sin(t * 3) * 0.3;
      break;
    }
    case 'drop': {
      const k = Math.min(1, t / Math.max(0.2, f.dur || 0.8));
      P.tilt = Math.sin(k * Math.PI) * 0.55;
      P.armL = -0.95;
      P.armR = -0.95;
      P.loadDrop = k * 0.05;
      P.crouch = Math.sin(k * Math.PI) * 0.01;
      break;
    }
    case 'chat': {
      P.look = Math.sin(time * 0.8 + (f.x || 0)) * 0.4;
      P.armR = -0.3 + Math.sin(time * 2.1 + (f.z || 0)) * 0.25;
      P.armL = 0.08;
      P.bob = Math.sin(time * 2) * 0.002;
      break;
    }
    default: {
      // repos : respiration, regard qui se promène
      const s = (f.x || 0) * 3.1 + (f.z || 0) * 1.7;
      P.armL = 0.06 + Math.sin(time * 1.3 + s) * 0.03;
      P.armR = -0.06 - Math.sin(time * 1.3 + s) * 0.03;
      P.look = Math.sin(time * 0.35 + s) * 0.5;
      P.bob = Math.sin(time * 1.8 + s) * 0.0015;
    }
  }
  if (f.tool === 'axeRest') P.tool = 'axe';
  else if (f.tool && !P.tool) P.tool = f.tool;
  if (f.load) {
    if (f.load === 'logs' || f.load === 'plank') P.armR = Math.min(P.armR, -2.6);
    else if (f.load === 'tray') {
      if (f.anim !== 'carryTray' && f.anim !== 'serve') P.armR = -1.7;
    } else if (f.anim !== 'drop' && f.anim !== 'place' && f.anim !== 'pickup' && f.anim !== 'climb' && !f.anim.startsWith('carry')) {
      P.armL = -1;
      P.armR = -1;
    }
    P.tool = null;
  }
  return P;
}
