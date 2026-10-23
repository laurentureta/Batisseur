// Personnages et animaux en vrais modèles 3D animés (squelettes, animations).
// Le fichier assets/creatures.bin (préparé par tools/bake_creatures.py) contient les squelettes,
// les animations échantillonnées et la géométrie de chaque modèle (avec une version simplifiée).
//
// Rendu : chaque modèle est une seule « InstancedMesh » ; la déformation par le squelette se fait
// sur la carte graphique (les matrices des os de chaque instance sont rangées dans une texture).
// Des centaines de personnages animés ne coûtent ainsi que quelques appels de dessin.
// Les poses sont calculées ici : animations du modèle (marche, course, repos, porter…) et gestes
// des métiers ajoutés par-dessus (bras, buste, jambes, tête), voir humanPose.js.
import * as THREE from 'three';

const fromSRGB = (b) => {
  const c = b / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const SRGB_LUT = new Float32Array(256).map((_, i) => fromSRGB(i));

/* ───────── Lecture du fichier ───────── */
let LIB = null;
/** Bibliothèque chargée au démarrage (null si le fichier manque : le jeu garde ses anciens personnages). */
export function creatureLib() {
  return LIB;
}
export function setCreatureLib(lib) {
  LIB = lib;
}

export async function loadCreatures(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`creatures.bin : ${res.status}`);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x52435442) throw new Error('creatures.bin : format inconnu');
  const jlen = dv.getUint32(8, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jlen)));
  const base = 12 + jlen + ((4 - (jlen % 4)) % 4);
  return new CreatureLib(json, buf, base);
}

export class Skel {
  constructor(id, def, buf, base) {
    this.id = id;
    const n = (this.nb = def.nb);
    this.height = def.height;
    this.names = def.bones.map((b) => b.n);
    this.index = new Map(this.names.map((nm, i) => [nm, i]));
    this.parent = new Int16Array(n);
    this.restT = new Float32Array(n * 3);
    this.restQ = new Float32Array(n * 4);
    this.restS = new Float32Array(n);
    this.rootT = new Float32Array(n * 3);
    this.rootQ = new Float32Array(n * 4);
    this.rootS = new Float32Array(n);
    def.bones.forEach((b, i) => {
      this.parent[i] = b.p;
      this.restT.set(b.t, i * 3);
      this.restQ.set(b.r, i * 4);
      this.restS[i] = (b.s[0] + b.s[1] + b.s[2]) / 3;
      if (b.rp) {
        this.rootT.set(b.rp.t, i * 3);
        this.rootQ.set(b.rp.r, i * 4);
        this.rootS[i] = b.rp.s;
      }
    });
    this.ibm = new Float32Array(buf.slice(base + def.ibm, base + def.ibm + n * 64));
    // ordre de calcul : les parents avant les enfants
    const order = [], done = new Uint8Array(n);
    const visit = (i) => {
      if (done[i]) return;
      if (this.parent[i] >= 0) visit(this.parent[i]);
      done[i] = 1;
      order.push(i);
    };
    for (let i = 0; i < n; i++) visit(i);
    this.order = Int16Array.from(order);
  }

  bone(name) {
    return this.index.get(name) ?? -1;
  }
}

export class Clip {
  constructor(def, skel, buf, base) {
    this.n = def.n;
    this.fps = def.fps;
    this.loop = def.loop;
    this.dur = def.dur;
    const cnt = def.n * skel.nb * 4;
    const q = new Int16Array(buf, base + def.rot, cnt);
    this.rot = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) this.rot[i] = q[i] / 32767;
    this.tb = Int16Array.from(def.tb);
    this.tr = def.tr >= 0 ? new Float32Array(buf.slice(base + def.tr, base + def.tr + def.n * def.tb.length * 12)) : new Float32Array(0);
    this.nb = skel.nb;
  }
}

/** Géométrie d'un modèle (une par niveau de détail). */
function makeGeo(def, buf, base, skinned) {
  const vc = def.vc;
  const pq = new Uint16Array(buf, base + def.pos, vc * 3);
  const pos = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = pq[i * 3 + c] * def.pq[c] + def.po[c];
  const cb = new Uint8Array(buf, base + def.col, vc * 4);
  const col = new Float32Array(vc * 3), slot = new Float32Array(vc);
  for (let i = 0; i < vc; i++) {
    col[i * 3] = SRGB_LUT[cb[i * 4]];
    col[i * 3 + 1] = SRGB_LUT[cb[i * 4 + 1]];
    col[i * 3 + 2] = SRGB_LUT[cb[i * 4 + 2]];
    slot[i] = cb[i * 4 + 3];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
  if (skinned) {
    geo.setAttribute('aJ', new THREE.BufferAttribute(new Uint8Array(buf.slice(base + def.j, base + def.j + vc * 4)), 4));
    geo.setAttribute('aW', new THREE.BufferAttribute(new Uint8Array(buf.slice(base + def.w, base + def.w + vc * 4)), 4, true));
  }
  const idx = def.i32 ? new Uint32Array(buf.slice(base + def.idx, base + def.idx + def.ic * 4)) : new Uint16Array(buf.slice(base + def.idx, base + def.idx + def.ic * 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export class CreatureLib {
  constructor(json, buf, base) {
    this.skels = {};
    this.clips = {};
    this.meshes = {};
    this.statics = {};
    for (const [id, def] of Object.entries(json.skels)) this.skels[id] = new Skel(id, def, buf, base);
    for (const [id, def] of Object.entries(json.clips)) this.clips[id] = new Clip(def, this.skels[def.skel], buf, base);
    for (const [id, def] of Object.entries(json.meshes)) this.meshes[id] = { id, skel: this.skels[def.skel], lods: def.lods.map((l) => makeGeo(l, buf, base, true)), tris: def.lods.map((l) => l.ic / 3) };
    for (const [id, def] of Object.entries(json.statics)) this.statics[id] = makeGeo(def, buf, base, false);
  }

  clip(skel, name) {
    return this.clips[`${skel}/${name}`] || null;
  }
}

/* ───────── Pose d'un squelette (calcul sur le processeur, sans allocation) ───────── */
export class Rig {
  constructor(skel) {
    const n = skel.nb;
    this.skel = skel;
    this.lq = new Float32Array(n * 4); // rotations locales
    this.lt = new Float32Array(n * 3); // translations locales
    this.wq = new Float32Array(n * 4); // rotations « monde » (repère du modèle)
    this.wp = new Float32Array(n * 3);
    this.ws = new Float32Array(n);
    this.tmp = new Float32Array(n * 4);
    this.tmpT = new Float32Array(n * 3);
    this.hook = null; // (rig, boneIndex) appelé avant le calcul « monde » d'un os
  }

  rest() {
    this.lq.set(this.skel.restQ);
    this.lt.set(this.skel.restT);
  }

  /** Pose d'une animation à l'instant t (secondes ; bouclée si l'animation boucle). */
  fromClip(clip, t, intoTmp = false) {
    const q = intoTmp ? this.tmp : this.lq, tt = intoTmp ? this.tmpT : this.lt;
    const nb = this.skel.nb;
    let f = t * clip.fps;
    if (clip.loop) f = ((f % clip.n) + clip.n) % clip.n;
    else f = Math.max(0, Math.min(clip.n - 1.001, f));
    const f0 = Math.floor(f), k = f - f0;
    const f1 = clip.loop ? (f0 + 1) % clip.n : Math.min(clip.n - 1, f0 + 1);
    const r = clip.rot, a = f0 * nb * 4, b = f1 * nb * 4;
    for (let i = 0; i < nb * 4; i += 4) {
      // interpolation linéaire normalisée (les clés sont déjà dans le même hémisphère)
      const x = r[a + i] + (r[b + i] - r[a + i]) * k, y = r[a + i + 1] + (r[b + i + 1] - r[a + i + 1]) * k;
      const z = r[a + i + 2] + (r[b + i + 2] - r[a + i + 2]) * k, w = r[a + i + 3] + (r[b + i + 3] - r[a + i + 3]) * k;
      const l = 1 / Math.hypot(x, y, z, w);
      q[i] = x * l;
      q[i + 1] = y * l;
      q[i + 2] = z * l;
      q[i + 3] = w * l;
    }
    tt.set(this.skel.restT);
    const tb = clip.tb, nt = tb.length;
    for (let j = 0; j < nt; j++) {
      const bi = tb[j] * 3, s0 = (f0 * nt + j) * 3, s1 = (f1 * nt + j) * 3, tr = clip.tr;
      tt[bi] = tr[s0] + (tr[s1] - tr[s0]) * k;
      tt[bi + 1] = tr[s0 + 1] + (tr[s1 + 1] - tr[s0 + 1]) * k;
      tt[bi + 2] = tr[s0 + 2] + (tr[s1 + 2] - tr[s0 + 2]) * k;
    }
  }

  /** Mélange vers une seconde animation (poids w de la seconde). */
  blendClip(clip, t, w) {
    if (w <= 0) return;
    this.fromClip(clip, t, true);
    const q = this.lq, o = this.tmp, n = this.skel.nb;
    for (let i = 0; i < n * 4; i += 4) {
      let x = o[i], y = o[i + 1], z = o[i + 2], ww = o[i + 3];
      if (q[i] * x + q[i + 1] * y + q[i + 2] * z + q[i + 3] * ww < 0) {
        x = -x;
        y = -y;
        z = -z;
        ww = -ww;
      }
      const a = q[i] + (x - q[i]) * w, b = q[i + 1] + (y - q[i + 1]) * w, c = q[i + 2] + (z - q[i + 2]) * w, d = q[i + 3] + (ww - q[i + 3]) * w;
      const l = 1 / Math.hypot(a, b, c, d);
      q[i] = a * l;
      q[i + 1] = b * l;
      q[i + 2] = c * l;
      q[i + 3] = d * l;
    }
    const lt = this.lt, ot = this.tmpT;
    for (let i = 0; i < n * 3; i++) lt[i] += (ot[i] - lt[i]) * w;
  }

  /** Passage au repère du modèle (os par os, parents d'abord). */
  forward() {
    const sk = this.skel, order = sk.order, par = sk.parent;
    const lq = this.lq, lt = this.lt, wq = this.wq, wp = this.wp, ws = this.ws;
    for (let o = 0; o < order.length; o++) {
      const i = order[o];
      if (this.hook) this.hook(this, i);
      const p = par[i];
      let pqx, pqy, pqz, pqw, ppx, ppy, ppz, ps;
      if (p < 0) {
        pqx = sk.rootQ[i * 4];
        pqy = sk.rootQ[i * 4 + 1];
        pqz = sk.rootQ[i * 4 + 2];
        pqw = sk.rootQ[i * 4 + 3];
        ppx = sk.rootT[i * 3];
        ppy = sk.rootT[i * 3 + 1];
        ppz = sk.rootT[i * 3 + 2];
        ps = sk.rootS[i];
      } else {
        pqx = wq[p * 4];
        pqy = wq[p * 4 + 1];
        pqz = wq[p * 4 + 2];
        pqw = wq[p * 4 + 3];
        ppx = wp[p * 3];
        ppy = wp[p * 3 + 1];
        ppz = wp[p * 3 + 2];
        ps = ws[p];
      }
      // position = parent + rot(parent) * (échelle * translation locale)
      const tx = lt[i * 3] * ps, ty = lt[i * 3 + 1] * ps, tz = lt[i * 3 + 2] * ps;
      const ix = pqw * tx + pqy * tz - pqz * ty, iy = pqw * ty + pqz * tx - pqx * tz;
      const iz = pqw * tz + pqx * ty - pqy * tx, iw = -pqx * tx - pqy * ty - pqz * tz;
      wp[i * 3] = ppx + ix * pqw + iw * -pqx + iy * -pqz - iz * -pqy;
      wp[i * 3 + 1] = ppy + iy * pqw + iw * -pqy + iz * -pqx - ix * -pqz;
      wp[i * 3 + 2] = ppz + iz * pqw + iw * -pqz + ix * -pqy - iy * -pqx;
      // rotation = parent * locale
      const bx = lq[i * 4], by = lq[i * 4 + 1], bz = lq[i * 4 + 2], bw = lq[i * 4 + 3];
      wq[i * 4] = pqx * bw + pqw * bx + pqy * bz - pqz * by;
      wq[i * 4 + 1] = pqy * bw + pqw * by + pqz * bx - pqx * bz;
      wq[i * 4 + 2] = pqz * bw + pqw * bz + pqx * by - pqy * bx;
      wq[i * 4 + 3] = pqw * bw - pqx * bx - pqy * by - pqz * bz;
      ws[i] = ps * sk.restS[i];
    }
  }

  /**
   * Matrices de déformation (3 x 4, par lignes) dans out à partir de off :
   * figure (position, cap, échelle) × os × inverse de la pose de liaison.
   */
  writeSkin(out, off, fx, fy, fz, yaw, scale) {
    const sk = this.skel, n = sk.nb, wq = this.wq, wp = this.wp, ws = this.ws, ibm = sk.ibm;
    const cy = Math.cos(yaw) * scale, sy = Math.sin(yaw) * scale;
    for (let i = 0; i < n; i++) {
      const x = wq[i * 4], y = wq[i * 4 + 1], z = wq[i * 4 + 2], w = wq[i * 4 + 3], s = ws[i];
      // matrice de l'os (rotation × échelle + translation)
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
      const m00 = (1 - 2 * (yy + zz)) * s, m01 = 2 * (xy - wz) * s, m02 = 2 * (xz + wy) * s;
      const m10 = 2 * (xy + wz) * s, m11 = (1 - 2 * (xx + zz)) * s, m12 = 2 * (yz - wx) * s;
      const m20 = 2 * (xz - wy) * s, m21 = 2 * (yz + wx) * s, m22 = (1 - 2 * (xx + yy)) * s;
      const px = wp[i * 3], py = wp[i * 3 + 1], pz = wp[i * 3 + 2];
      // figure : rotation autour de Y (cap), échelle, position
      const a00 = cy * m00 + sy * m20, a01 = cy * m01 + sy * m21, a02 = cy * m02 + sy * m22, a03 = cy * px + sy * pz + fx;
      const a10 = scale * m10, a11 = scale * m11, a12 = scale * m12, a13 = scale * py + fy;
      const a20 = -sy * m00 + cy * m20, a21 = -sy * m01 + cy * m21, a22 = -sy * m02 + cy * m22, a23 = -sy * px + cy * pz + fz;
      // × inverse de la pose de liaison (colonnes)
      const b = i * 16;
      const b00 = ibm[b], b10 = ibm[b + 1], b20 = ibm[b + 2];
      const b01 = ibm[b + 4], b11 = ibm[b + 5], b21 = ibm[b + 6];
      const b02 = ibm[b + 8], b12 = ibm[b + 9], b22 = ibm[b + 10];
      const b03 = ibm[b + 12], b13 = ibm[b + 13], b23 = ibm[b + 14];
      const o = off + i * 12;
      out[o] = a00 * b00 + a01 * b10 + a02 * b20;
      out[o + 1] = a00 * b01 + a01 * b11 + a02 * b21;
      out[o + 2] = a00 * b02 + a01 * b12 + a02 * b22;
      out[o + 3] = a00 * b03 + a01 * b13 + a02 * b23 + a03;
      out[o + 4] = a10 * b00 + a11 * b10 + a12 * b20;
      out[o + 5] = a10 * b01 + a11 * b11 + a12 * b21;
      out[o + 6] = a10 * b02 + a11 * b12 + a12 * b22;
      out[o + 7] = a10 * b03 + a11 * b13 + a12 * b23 + a13;
      out[o + 8] = a20 * b00 + a21 * b10 + a22 * b20;
      out[o + 9] = a20 * b01 + a21 * b11 + a22 * b21;
      out[o + 10] = a20 * b02 + a21 * b12 + a22 * b22;
      out[o + 11] = a20 * b03 + a21 * b13 + a22 * b23 + a23;
    }
  }

  /** Position d'un os dans la scène (après la figure). */
  worldPos(i, fx, fy, fz, yaw, scale, out) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const px = this.wp[i * 3] * scale, py = this.wp[i * 3 + 1] * scale, pz = this.wp[i * 3 + 2] * scale;
    out.x = c * px + s * pz + fx;
    out.y = py + fy;
    out.z = -s * px + c * pz + fz;
    return out;
  }
}

/* ───────── Quaternions (petits outils pour les gestes) ───────── */
export const Q = {
  /** q = a * b dans out (tableaux plats, indices). */
  mul(out, o, ax, ay, az, aw, bx, by, bz, bw) {
    out[o] = ax * bw + aw * bx + ay * bz - az * by;
    out[o + 1] = ay * bw + aw * by + az * bx - ax * bz;
    out[o + 2] = az * bw + aw * bz + ax * by - ay * bx;
    out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
  },
  /** Vecteur v tourné par q → out [x, y, z]. */
  rot(qx, qy, qz, qw, vx, vy, vz, out) {
    const ix = qw * vx + qy * vz - qz * vy, iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx, iw = -qx * vx - qy * vy - qz * vz;
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
  },
};

/* ───────── Le dessin : une InstancedMesh par modèle et par niveau de détail ───────── */
const SKIN_HEAD = /* glsl */ `
uniform highp sampler2D uBones;
uniform int uRowBase;
attribute vec4 aJ;
attribute vec4 aW;
mat4 crowdBone(int row, float j) {
  int x = int(j + 0.5) * 3;
  vec4 a = texelFetch(uBones, ivec2(x, row), 0);
  vec4 b = texelFetch(uBones, ivec2(x + 1, row), 0);
  vec4 c = texelFetch(uBones, ivec2(x + 2, row), 0);
  return mat4(a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0);
}
`;
const SKIN_BODY = /* glsl */ `
{
  int crowdRow = uRowBase + gl_InstanceID;
  mat4 sk = aW.x * crowdBone(crowdRow, aJ.x) + aW.y * crowdBone(crowdRow, aJ.y) + aW.z * crowdBone(crowdRow, aJ.z) + aW.w * crowdBone(crowdRow, aJ.w);
  transformed = (sk * vec4(transformed, 1.0)).xyz;
}
`;

function crowdMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBones = uniforms.uBones;
    shader.uniforms.uRowBase = uniforms.uRowBase;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_HEAD}\nattribute float aSlot;\nattribute vec3 aT1;\nattribute vec3 aT2;\nattribute vec3 aT3;\nattribute vec3 aT4;\nattribute vec3 aT5;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SKIN_BODY}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
if (aSlot > 0.5) {
  vec3 tint = aSlot < 1.5 ? aT1 : aSlot < 2.5 ? aT2 : aSlot < 3.5 ? aT3 : aSlot < 4.5 ? aT4 : aT5;
  if (tint.r >= 0.0) vColor.rgb = tint;
}`);
  };
  mat.customProgramCacheKey = () => 'crowd-lambert';
  return mat;
}

function crowdDepthMaterial(uniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBones = uniforms.uBones;
    shader.uniforms.uRowBase = uniforms.uRowBase;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${SKIN_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${SKIN_BODY}`);
  };
  mat.customProgramCacheKey = () => 'crowd-depth';
  return mat;
}

/** Texture des os : une ligne par instance, 3 texels par os. */
class BoneTex {
  constructor(maxBones) {
    this.width = maxBones * 3;
    this.rows = 0;
    this.alloc(128);
  }
  alloc(rows) {
    this.cap = rows;
    this.data = new Float32Array(this.width * rows * 4);
    this.tex?.dispose();
    this.tex = new THREE.DataTexture(this.data, this.width, rows, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    if (this.uniform) this.uniform.value = this.tex;
  }
}

export class Crowd {
  constructor(lib) {
    this.lib = lib;
    this.group = new THREE.Group();
    this.group.name = 'habitants et animaux';
    this.entries = new Map(); // "modèle:niveau" -> entrée
    this.list = [];
    let maxH = 0, maxA = 0;
    for (const m of Object.values(lib.meshes)) {
      if (m.skel.id === 'human') maxH = Math.max(maxH, m.skel.nb);
      else maxA = Math.max(maxA, m.skel.nb);
    }
    this.texH = new BoneTex(maxH || 1);
    this.texA = new BoneTex(maxA || 1);
    this.texH.uniform = { value: this.texH.tex };
    this.texA.uniform = { value: this.texA.tex };
    this.rigs = new Map();
    this.shadows = true;
  }

  /** Une pose réutilisable par squelette. */
  rig(skelId) {
    let r = this.rigs.get(skelId);
    if (!r) this.rigs.set(skelId, (r = new Rig(this.lib.skels[skelId])));
    return r;
  }

  entry(meshId, lod) {
    const key = meshId + ':' + lod;
    let e = this.entries.get(key);
    if (e) return e;
    const m = this.lib.meshes[meshId];
    if (!m) return null;
    const bt = m.skel.id === 'human' ? this.texH : this.texA;
    const uniforms = { uBones: bt.uniform, uRowBase: { value: 0 } };
    const cap = 16;
    const geo = m.lods[lod].clone();
    const im = new THREE.InstancedMesh(geo, crowdMaterial(uniforms), cap);
    im.customDepthMaterial = crowdDepthMaterial(uniforms);
    im.frustumCulled = false;
    im.castShadow = this.shadows;
    im.receiveShadow = false;
    im.count = 0;
    e = { key, meshId, lod, m, nb: m.skel.nb, bt, uniforms, im, geo, cap: 0, n: 0, stage: null, tints: null };
    this.grow(e, cap);
    this.group.add(im);
    this.entries.set(key, e);
    this.list.push(e);
    return e;
  }

  grow(e, cap) {
    const old = e.stage, oldT = e.tints;
    e.cap = cap;
    e.stage = new Float32Array(cap * e.nb * 12);
    e.tints = new Float32Array(cap * 15).fill(-1);
    if (old) e.stage.set(old.subarray(0, Math.min(old.length, e.stage.length)));
    if (oldT) e.tints.set(oldT.subarray(0, Math.min(oldT.length, e.tints.length)));
    // les instances ne servent qu'à compter (identité) ; les couleurs par instance
    const im = e.im;
    if (im.count > cap) im.count = cap;
    if (im.instanceMatrix.count < cap) {
      const mats = new Float32Array(cap * 16);
      for (let i = 0; i < cap; i++) mats.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16);
      im.instanceMatrix = new THREE.InstancedBufferAttribute(mats, 16);
    }
    for (let k = 0; k < 5; k++) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(-1), 3);
      a.setUsage(THREE.DynamicDrawUsage);
      e.geo.setAttribute('aT' + (k + 1), a);
    }
    e.geo.instanceCount = cap;
  }

  begin() {
    for (const e of this.list) e.n = 0;
  }

  /**
   * Réserve une instance et renvoie [entrée, indice] : l'appelant écrit les matrices de ses os
   * avec rig.writeSkin(e.stage, idx * e.nb * 12, …) et ses couleurs avec tint().
   */
  add(meshId, lod) {
    const e = this.entry(meshId, lod);
    if (!e) return null;
    if (e.n >= e.cap) this.grow(e, e.cap * 2);
    const i = e.n++;
    e.tints.fill(-1, i * 15, i * 15 + 15);
    return [e, i];
  }

  /** Couleur d'un emplacement (1 peau … 5 chapeau) en hexadécimal. */
  tint(e, i, slot, hex) {
    const o = i * 15 + (slot - 1) * 3;
    e.tints[o] = SRGB_LUT[(hex >> 16) & 255];
    e.tints[o + 1] = SRGB_LUT[(hex >> 8) & 255];
    e.tints[o + 2] = SRGB_LUT[hex & 255];
  }

  end() {
    // on range les lignes de chaque modèle à la suite dans la texture de son squelette
    for (const bt of [this.texH, this.texA]) bt.rows = 0;
    for (const e of this.list) {
      e.uniforms.uRowBase.value = e.bt.rows;
      e.bt.rows += e.n;
    }
    for (const bt of [this.texH, this.texA]) {
      if (bt.rows > bt.cap) {
        let c = bt.cap;
        while (c < bt.rows) c *= 2;
        bt.alloc(c);
      }
    }
    for (const e of this.list) {
      const im = e.im;
      im.count = e.n;
      im.visible = e.n > 0;
      if (!e.n) continue;
      const bt = e.bt, W = bt.width * 4, base = e.uniforms.uRowBase.value;
      const per = e.nb * 12;
      for (let k = 0; k < e.n; k++) bt.data.set(e.stage.subarray(k * per, k * per + per), (base + k) * W);
      for (let s = 0; s < 5; s++) {
        const a = e.geo.attributes['aT' + (s + 1)];
        for (let k = 0; k < e.n; k++) {
          a.array[k * 3] = e.tints[k * 15 + s * 3];
          a.array[k * 3 + 1] = e.tints[k * 15 + s * 3 + 1];
          a.array[k * 3 + 2] = e.tints[k * 15 + s * 3 + 2];
        }
        a.addUpdateRange(0, e.n * 3);
        a.needsUpdate = true;
      }
    }
    for (const bt of [this.texH, this.texA]) if (bt.rows) bt.tex.needsUpdate = true;
  }

  setShadows(on) {
    this.shadows = on;
    for (const e of this.list) e.im.castShadow = on;
  }
}
