// La cinématique d'ouverture (à chaque lancement du jeu).
// 1. Au-dessus d'une mer de nuages, au lever du soleil : la caméra regarde le soleil, puis se
//    tourne vers la vallée.
// 2. Elle plonge et traverse les nuages (de vrais nuages volumineux : des centaines de « bouffées »
//    éclairées par le soleil, triées de loin en près), ressort dessous et découvre la vallée.
// 3. Elle descend vers le village. Des blocs de briques tombent du ciel et s'écrasent sur la place
//    (poussière, débris, la caméra tremble), puis les briques s'envolent une à une et s'assemblent
//    en lettres géantes au-dessus des toits : BÂTISSEUR. Un éclat doré, puis la caméra s'élève vers
//    la vue de l'écran d'accueil pendant que les lettres retombent en poussière.
// La dernière image est exactement la vue de l'écran d'accueil : on rend la main sans à-coup.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Point sur une courbe de Catmull-Rom (uniforme) passant par les points p. */
function catmull(p, u, out) {
  const n = p.length - 1;
  const s = Math.min(n - 1e-6, Math.max(0, u));
  const i = Math.floor(s), t = s - i;
  const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[Math.min(n, i + 1)], p3 = p[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

/* ───────── Lettres en briques (grille de 5 × 7, 9 lignes pour le Â) ───────── */
const FONT = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  Â: ['00100', '01010', '01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
};
const WORD = ['B', 'Â', 'T', 'I', 'S', 'S', 'E', 'U', 'R'];
const CW = 0.2, CH = 0.19, GAP = 0.17; // case d'une brique, espace entre les lettres
const BRICK_COLORS = [0xd2693e, 0xc85a36, 0xdb7a45, 0xbf5232, 0xe08850];

/** Les cases des lettres : position dans le plan du titre (u vers la droite, v vers le haut). */
function titleSlots() {
  const slots = [];
  let u = 0;
  WORD.forEach((ch, li) => {
    const rows = FONT[ch];
    const w = rows[0].length;
    rows.forEach((row, r) => {
      const v = (6 - r) * CH; // la ligne du bas (r = 6 pour 7 lignes) est à v = 0 ; le Â dépasse vers le haut
      for (let c = 0; c < w; c++) if (row[c] === '1') slots.push({ u: u + c * CW, v: rows.length === 9 ? (8 - r) * CH : v, letter: li, row: rows.length === 9 ? 8 - r : 6 - r });
    });
    u += w * CW + GAP;
  });
  const width = u - GAP - CW;
  for (const s of slots) s.u -= width / 2;
  return { slots, width };
}

/* ───────── Texture d'une bouffée de nuage (dessinée une fois) ───────── */
function cloudTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // un cumulus : des boules qui se chevauchent, base plus plate
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.55) * 36;
    const x = S / 2 + Math.cos(a) * d * 1.15, y = S / 2 + Math.sin(a) * d * 0.62 - 6 + (d > 20 ? 4 : 0);
    const r = 12 + rnd() * 16;
    const grd = g.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
    const top = Math.round(205 + 50 * (1 - y / S));
    grd.addColorStop(0, `rgba(${top},${top},${top},0.85)`);
    grd.addColorStop(0.62, `rgba(${top},${top},${top},0.62)`);
    grd.addColorStop(0.85, `rgba(${top},${top},${top},0.2)`);
    grd.addColorStop(1, `rgba(${top},${top},${top},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CLOUD_VS = `
attribute vec3 iPos;
attribute vec4 iData; // taille, rotation, ombrage (0 base, 1 sommet), opacité
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
varying float vNear;
varying float vFog;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
  mv.xy += p;
  float d = -mv.z;
  vNear = smoothstep(0.25, 1.1, d / iData.x); // une bouffée trop proche s'efface (on est dedans)
  vFog = smoothstep(uFogNear, uFogFar, d);
  vShade = iData.z;
  vAlpha = iData.w;
  gl_Position = projectionMatrix * mv;
}`;
const CLOUD_FS = `
uniform sampler2D map;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec3 uFogColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
varying float vNear;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  float h = clamp(vUv.y * 0.85 + vShade * 0.55 - 0.18, 0.0, 1.0);
  vec3 col = mix(uShadow, uLit, h) * (0.88 + 0.16 * t.r);
  col = mix(col, uFogColor, vFog * 0.85);
  float a = t.a * vAlpha * uOpacity * vNear;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// le « plancher » de la mer de nuages, jusqu'à l'horizon (bruit fractal calculé sur place)
const FLOOR_VS = `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FLOOR_FS = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec3 uFogColor;
uniform vec3 uCam;
uniform vec2 uCenter;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vW.xz * 0.03 + vec2(uTime * 0.012, 0.0);
  float n = fbm(p);
  float d = distance(vW, uCam);
  float fog = smoothstep(140.0, 460.0, d);
  float cov = smoothstep(0.32, 0.6, n);
  vec3 col = mix(uShadow, uLit, smoothstep(0.3, 0.78, n));
  col = mix(col, uFogColor, fog * 0.85);
  float edge = 1.0 - smoothstep(420.0, 520.0, length(vW.xz - uCenter));
  float a = mix(cov, 1.0, fog * 0.9) * uOpacity * edge;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// le ciel du lever de soleil (dôme autour de la caméra, tant qu'on est au-dessus des nuages)
const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, 1.0 - exp(-max(h, 0.0) * 6.5));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 24.0) * 0.22 + pow(s, 160.0) * 0.5 + pow(s, 1800.0) * 2.2);
  if (h < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Cinematic {
  constructor(renderer) {
    this.r = renderer;
    this.active = false;
    this.pos = [0, 0, 0];
    this.look = [0, 0, 0];
    this.v = new THREE.Vector3();
    this.shake = 0;
  }

  get sound() {
    return this.r.game?.sound;
  }

  /**
   * Le plan de vol, construit autour du point T (centre du titre, au-dessus de la place) et de la
   * vue finale (celle de l'écran d'accueil).
   */
  plan(end) {
    const n = new THREE.Vector3(end.p[0] - end.l[0], 0, end.p[2] - end.l[2]).normalize(); // vers la caméra d'accueil
    const side = new THREE.Vector3(n.z, 0, -n.x); // vers la droite, vu depuis la caméra
    const T = new THREE.Vector3(end.l[0], 0, end.l[2]).addScaledVector(n, 1.2);
    T.y = 3.3; // les lettres flottent au-dessus des toits, sur fond de ciel
    this.n = n;
    this.side = side;
    this.T = T;
    // distance pour que le titre tienne dans l'écran (portrait : il faut reculer)
    const cam = this.r.camera;
    const hfov = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
    const D = Math.max(12, (this.title.width * 0.6) / Math.tan(hfov / 2));
    this.D = D;
    const at = (dn, dy, ds = 0, base = T) => [base.x + n.x * dn + side.x * ds, base.y + dy, base.z + n.z * dn + side.z * ds];
    const g0 = new THREE.Vector3(T.x, 0, T.z);
    const look = (p, dir, dist, dy) => [p[0] + dir[0] * dist, p[1] + dy, p[2] + dir[1] * dist];
    // au-dessus des nuages : on regarde le soleil levant (à l'est, +x), puis on se tourne
    const p0 = at(150, 92, -10, g0), p1 = at(138, 90, -16, g0), p2 = at(104, 62, -6, g0);
    return [
      { t: 0, p: p0, l: look(p0, [0.95, 0.31], 80, 0) },
      { t: 3.6, p: p1, l: look(p1, [0.45, -0.89], 80, -14) },
      { t: 7.2, p: p2, l: at(38, 14, 0, g0) },
      // la traversée des nuages (couche entre 30 et 47)
      { t: 9.8, p: at(68, 33, 2, g0), l: at(12, 0, 0, g0) },
      // sous les nuages : la vallée, le village
      { t: 12.6, p: at(40, 16, 6, g0), l: [T.x, 1, T.z] },
      // devant la place : le titre va se former
      { t: 15, p: at(D * 1.12, 1.6 + D * 0.07, 0.8), l: [T.x, T.y - 1.2, T.z] },
      { t: 17, p: at(D, 0.6 + D * 0.035, 0.3), l: [T.x, T.y - 0.5, T.z] },
      { t: 22.2, p: at(D * 0.95, 0.5 + D * 0.035, 0), l: [T.x, T.y - 0.35, T.z] },
      // on s'élève vers la vue d'accueil
      { t: 26, p: end.p, l: end.l },
    ];
  }

  /** Lance la cinématique. */
  start({ end, onTitle, onEnd, quality = 'high' }) {
    this.title = titleSlots();
    this.K = this.plan(end);
    this.dur = this.K[this.K.length - 1].t;
    this.t = 0;
    this.active = true;
    this.onTitle = onTitle;
    this.onEnd = onEnd;
    this.titled = false;
    this.paused = false;
    this.quality = quality;
    this.ts = this.K.map((k) => k.t);
    this.P = this.K.map((k) => k.p);
    this.L = this.K.map((k) => k.l);
    this.buildClouds(quality);
    this.buildBricks();
    this.r.cam.cinematic = true;
    this.update(0);
  }

  /* ───────── La mer de nuages ───────── */
  buildClouds(quality) {
    this.clearClouds();
    const n = quality === 'low' ? 260 : quality === 'medium' ? 380 : 500;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    this.cPos = new Float32Array(n * 3);
    this.cData = new Float32Array(n * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.cPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(this.cData, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    geo.instanceCount = n;
    this.cloudTex = cloudTexture();
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VS,
      fragmentShader: CLOUD_FS,
      transparent: true,
      depthWrite: false,
      uniforms: {
        map: { value: this.cloudTex },
        uLit: { value: new THREE.Color(1, 0.93, 0.85) },
        uShadow: { value: new THREE.Color(0.36, 0.42, 0.62) },
        uFogColor: { value: new THREE.Color(0.95, 0.86, 0.8) },
        uFogNear: { value: 150 },
        uFogFar: { value: 420 },
        uOpacity: { value: 1 },
      },
    });
    this.cloudMesh = new THREE.Mesh(geo, this.cloudMat);
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.renderOrder = 8;
    // les bouffées : une couche épaisse, plus dense le long du chemin de la caméra
    let seed = 99173;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const C = new THREE.Vector3(this.T.x, 0, this.T.z).addScaledVector(this.n, 78);
    this.puffs = [];
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.8) * 210;
      const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
      const layer = rnd();
      const tower = rnd() < 0.07;
      const y = 31 + layer * 13 + (tower ? 6 + rnd() * 8 : 0);
      const s = (9 + rnd() * 10) * (tower ? 1.5 : 1) * (1 + rr / 170);
      this.puffs.push({ x, y, z, s, rot: rnd() * 6.28, shade: Math.min(1, (y - 30) / 16), alpha: 0.75 + rnd() * 0.25, drift: 0.3 + rnd() * 0.5, d: 0 });
    }
    this.order = this.puffs.map((_, i) => i);
    this.r.scene.add(this.cloudMesh);
    // le ciel
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x3f5f9f) },
        uHorizon: { value: new THREE.Color(0xf6c9a0) },
        uSunDir: { value: new THREE.Vector3(1, 0.3, 0.4).normalize() },
        uSunColor: { value: new THREE.Color(0xffd9a8) },
      },
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 16), this.skyMat);
    this.skyDome.renderOrder = -100;
    this.skyDome.frustumCulled = false;
    this.r.scene.add(this.skyDome);
    // le plancher de nuages jusqu'à l'horizon
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VS,
      fragmentShader: FLOOR_FS,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uLit: this.cloudMat.uniforms.uLit,
        uShadow: this.cloudMat.uniforms.uShadow,
        uFogColor: this.cloudMat.uniforms.uFogColor,
        uCam: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector2(C.x, C.z) },
      },
    });
    const fg = new THREE.PlaneGeometry(1100, 1100, 1, 1);
    fg.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(fg, this.floorMat);
    this.floor.position.set(C.x, 34, C.z);
    this.floor.frustumCulled = false;
    this.floor.renderOrder = 7;
    this.r.scene.add(this.floor);
  }

  /** Les bouffées triées de la plus lointaine à la plus proche (le mélange reste juste). */
  sortClouds(dt) {
    const cam = this.r.camera;
    const cp = cam.position;
    const fwd = this.v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const p of this.puffs) {
      p.x += p.drift * dt * 0.8;
      p.d = (p.x - cp.x) * fwd.x + (p.y - cp.y) * fwd.y + (p.z - cp.z) * fwd.z;
    }
    this.order.sort((a, b) => this.puffs[b].d - this.puffs[a].d);
    for (let k = 0; k < this.order.length; k++) {
      const p = this.puffs[this.order[k]];
      this.cPos[k * 3] = p.x;
      this.cPos[k * 3 + 1] = p.y;
      this.cPos[k * 3 + 2] = p.z;
      this.cData[k * 4] = p.s;
      this.cData[k * 4 + 1] = p.rot;
      this.cData[k * 4 + 2] = p.shade;
      this.cData[k * 4 + 3] = p.d > -p.s ? p.alpha : 0;
    }
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
  }

  clearClouds() {
    if (this.skyDome) {
      this.r.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      this.skyMat.dispose();
      this.skyDome = null;
    }
    if (this.floor) {
      this.r.scene.remove(this.floor);
      this.floor.geometry.dispose();
      this.floorMat.dispose();
      this.floor = null;
    }
    if (!this.cloudMesh) return;
    this.r.scene.remove(this.cloudMesh);
    this.cloudMesh.geometry.dispose();
    this.cloudMat.dispose();
    this.cloudTex.dispose();
    this.cloudMesh = null;
  }

  /* ───────── Les briques du titre ───────── */
  buildBricks() {
    this.clearBricks();
    const T = this.T, n = this.n, side = this.side;
    const slots = this.title.slots;
    const N = slots.length;
    const geo = new THREE.BoxGeometry(CW * 0.92, CH * 0.88, 0.17);
    this.brickMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffb84a, emissiveIntensity: 0 });
    this.bricks = new THREE.InstancedMesh(geo, this.brickMat, N);
    this.bricks.castShadow = true;
    this.bricks.frustumCulled = false;
    this.bricks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // un contour brun foncé derrière les lettres (comme le logo) : lisible sur les toits et le ciel
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0x3a1d0b });
    this.outline = new THREE.InstancedMesh(new THREE.BoxGeometry(CW * 1.5, CH * 1.5, 0.08), this.outlineMat, N);
    this.outline.frustumCulled = false;
    this.outline.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.baseColors = [];
    const col = new THREE.Color();
    // les gros blocs qui s'écrasent sur la place, répartis sous le titre
    const nc = 5;
    this.chunks = [];
    for (let k = 0; k < nc; k++) {
      const f = (k / (nc - 1) - 0.5) * this.title.width * 0.82;
      const gx = T.x + side.x * f + n.x * (0.9 + (k % 2) * 0.5), gz = T.z + side.z * f + n.z * (0.9 + (k % 2) * 0.5);
      this.chunks.push({ x: gx, z: gz, t: 15.3 + k * 0.32 + (k % 2) * 0.12, hit: false, s: 0.55 + (k % 3) * 0.12, spin: (k * 1.7) % 3 });
    }
    const cgeo = new THREE.DodecahedronGeometry(1, 0);
    this.chunkMat = new THREE.MeshLambertMaterial({ color: 0xa8432f, flatShading: true });
    this.chunkMesh = new THREE.InstancedMesh(cgeo, this.chunkMat, nc);
    this.chunkMesh.castShadow = true;
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // chaque brique : départ d'un bloc écrasé, envol, pose dans sa case (de gauche à droite, rangée par rangée)
    slots.forEach((s, i) => {
      const wx = T.x + side.x * s.u, wz = T.z + side.z * s.u, wy = T.y - 0.62 + s.v;
      let best = 0, bd = Infinity;
      this.chunks.forEach((c, k) => {
        const d = (c.x - wx) ** 2 + (c.z - wz) ** 2;
        if (d < bd) (bd = d), (best = k);
      });
      const c = this.chunks[best];
      const order = s.letter * 0.33 + s.row * 0.05 + ((i * 0.618) % 1) * 0.12;
      s.end = [wx, wy, wz];
      s.from = [c.x + (((i * 0.37) % 1) - 0.5) * 0.4, 0.15, c.z + (((i * 0.71) % 1) - 0.5) * 0.4];
      s.t0 = 17.1 + order * 0.98;
      s.dur = 0.62 + ((i * 0.13) % 1) * 0.18;
      s.axis = new THREE.Vector3(((i * 0.31) % 1) - 0.5, 1, ((i * 0.59) % 1) - 0.5).normalize();
      s.fall = 23.4 + (1 - (s.u / this.title.width + 0.5)) * 0.9 + ((i * 0.43) % 1) * 0.2; // ils retombent de droite à gauche
      s.landed = false;
      col.setHex(BRICK_COLORS[i % BRICK_COLORS.length]);
      this.baseColors.push(col.clone());
      this.bricks.setColorAt(i, col);
    });
    this.bricks.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.r.scene.add(this.bricks, this.outline, this.chunkMesh);
    this.M = new THREE.Matrix4();
    this.Q = new THREE.Quaternion();
    this.Qb = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); // face au spectateur
    this.S = new THREE.Vector3();
    this.Vp = new THREE.Vector3();
    this.sfxAcc = 0;
  }

  clearBricks() {
    for (const k of ['bricks', 'outline', 'chunkMesh']) {
      const m = this[k];
      if (!m) continue;
      this.r.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      this[k] = null;
    }
  }

  updateBricks(t, dt) {
    const parts = this.r.particles;
    const S = this.S, M = this.M, Q = this.Q, V = this.Vp;
    // les blocs tombent du ciel et s'écrasent
    this.chunks.forEach((c, k) => {
      let y, sc = c.s;
      if (t < c.t - 1.1) y = 60;
      else if (t < c.t) {
        const u = (t - (c.t - 1.1)) / 1.1;
        y = c.s * 0.55 + (1 - u * u) * 45;
      } else {
        y = c.s * 0.5;
        if (!c.hit) {
          c.hit = true;
          this.shake = Math.max(this.shake, 0.32);
          parts.emit('impact', c.x, 0.3, c.z, this.quality === 'low' ? 22 : 40, { scale: 2.2 });
          parts.emit('debris', c.x, 0.4, c.z, 30, { scale: 2 });
          parts.emit('dust', c.x, 0.1, c.z, 20, { scale: 3.5 });
          this.sound?.play('thud');
        }
        // le bloc se vide à mesure que ses briques s'envolent
        sc = c.s * (1 - smooth(17.2, 21, t) * 0.95);
      }
      Q.setFromEuler(new THREE.Euler(c.spin + t * (t < c.t ? 2 : 0), c.spin * 2, 0.3));
      M.compose(V.set(c.x, y, c.z), Q, S.setScalar(t < c.t - 1.1 || sc < 0.03 ? 0.0001 : sc));
      this.chunkMesh.setMatrixAt(k, M);
    });
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    // les briques s'envolent vers leur case, puis retombent à la fin
    const slots = this.title.slots;
    let landedNow = 0;
    const shine = smooth(20.9, 21.6, t) * (1 - smooth(21.6, 22.8, t));
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      let sc = 1, x, y, z;
      Q.copy(this.Qb);
      if (t < s.t0) {
        sc = 0.0001;
        [x, y, z] = s.from;
      } else if (t < s.t0 + s.dur) {
        const u = (t - s.t0) / s.dur;
        const e = 1 - Math.pow(1 - u, 2.4);
        x = s.from[0] + (s.end[0] - s.from[0]) * e;
        z = s.from[2] + (s.end[2] - s.from[2]) * e;
        y = s.from[1] + (s.end[1] - s.from[1]) * e + Math.sin(u * Math.PI) * 1.6;
        const spin = (1 - e) * 7;
        Q.multiply(new THREE.Quaternion().setFromAxisAngle(s.axis, spin));
        sc = 0.6 + 0.4 * Math.min(1, u * 3);
      } else if (t < s.fall) {
        [x, y, z] = s.end;
        const k = t - (s.t0 + s.dur);
        if (!s.landed) {
          s.landed = true;
          landedNow++;
        }
        // petit tassement à l'arrivée
        sc = 1 + Math.max(0, 0.18 - k) * 1.2;
      } else {
        // la chute finale : la brique tombe et disparaît
        const k = t - s.fall;
        [x, y, z] = s.end;
        y -= 4.9 * k * k;
        Q.multiply(new THREE.Quaternion().setFromAxisAngle(s.axis, k * 5));
        sc = Math.max(0.0001, 1 - k * 0.9);
        if (y < 0.1) sc = 0.0001;
      }
      M.compose(V.set(x, y, z), Q, S.setScalar(sc));
      this.bricks.setMatrixAt(i, M);
      // le contour suit la brique, posé juste derrière (seulement une fois en place)
      const inPlace = t >= s.t0 + s.dur && t < s.fall;
      V.set(x - this.n.x * 0.09, y, z - this.n.z * 0.09);
      M.compose(V, this.Qb, S.setScalar(inPlace ? Math.min(1, (t - s.t0 - s.dur) * 5) : 0.0001));
      this.outline.setMatrixAt(i, M);
      // l'éclat doré balaie les lettres de gauche à droite
      if (shine > 0) {
        const wave = Math.max(0, 1 - Math.abs((t - 20.9) * 1.6 - (s.u / this.title.width + 0.5) * 1.2) * 2.5);
        this.bricks.setColorAt(i, this.Ccol.copy(this.baseColors[i]).lerp(this.gold, wave * 0.7));
      } else if (this.shone && t > 22.8 && !s.reset) {
        s.reset = true;
        this.bricks.setColorAt(i, this.baseColors[i]);
      }
    }
    if (shine > 0) this.shone = true;
    this.bricks.instanceMatrix.needsUpdate = true;
    this.outline.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true;
    this.brickMat.emissiveIntensity = shine * 0.55;
    if (landedNow) {
      this.sfxAcc += landedNow;
      if (this.sfxAcc >= 3) {
        this.sfxAcc = 0;
        this.sound?.play('clack');
      }
    }
    if (t > 21 && !this.sparkled) {
      this.sparkled = true;
      for (let k = 0; k < 40; k++) {
        const s = slots[(k * 37) % slots.length];
        parts.emit('sparkle', s.end[0], s.end[1], s.end[2], 1);
      }
      this.sound?.play('fete');
    }
    void dt;
  }

  /** Fin (ou saut) de la cinématique : on remet la caméra normale. */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.clearClouds();
    this.clearBricks();
    this.r.cam.cinematic = false;
    this.r.hourOverride = null;
    this.r.fogOverride = null;
    this.r.cam.update(0);
  }

  /** Avance la cinématique et place la caméra. Renvoie l'état utile à l'interface. */
  update(dt) {
    if (!this.active) return null;
    if (this.paused) dt = 0;
    this.t = Math.min(this.dur, this.t + dt);
    const t = this.t;
    const ts = this.ts;
    let i = 0;
    while (i < ts.length - 2 && t >= ts[i + 1]) i++;
    const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
    const ease = i === 0 ? f * f * (3 - 2 * f) * 0.5 + f * 0.5 : i === ts.length - 2 ? f * f * (3 - 2 * f) : f;
    const u = i + ease;
    catmull(this.P, u, this.pos);
    catmull(this.L, u, this.look);
    const cam = this.r.cam;
    const camera = this.r.camera;
    // la caméra tremble quand les blocs s'écrasent
    this.shake = Math.max(0, this.shake - dt * 0.9);
    const sk = this.shake * this.shake;
    const jx = (Math.sin(t * 61) + Math.sin(t * 37)) * sk, jy = (Math.sin(t * 53) + Math.cos(t * 29)) * sk;
    camera.position.set(this.pos[0] + jx, this.pos[1] + jy, this.pos[2]);
    camera.lookAt(this.look[0], this.look[1], this.look[2]);
    camera.updateMatrixWorld();
    // le reste du moteur (ombres, détails, habitants) suit le point regardé
    cam.target.set(this.look[0], 0, this.look[2]);
    cam.distance = Math.max(4, Math.min(72, Math.hypot(this.pos[0] - this.look[0], this.pos[1] - this.look[1], this.pos[2] - this.look[2])));
    const y = this.pos[1];
    // lumière : du lever du soleil au matin
    this.r.hourOverride = 5.8 + (8.6 - 5.8) * smooth(0, this.dur, t);
    // brume : très loin en altitude, comme d'habitude près du sol
    const hi = smooth(10, 40, y);
    this.r.fogOverride = { near: 40 + hi * 90, far: 120 + hi * 320 };
    // les nuages : couleurs du lever du soleil, puis ils s'effacent une fois loin au-dessus
    if (this.cloudMesh) {
      const warm = 1 - smooth(4, 16, t);
      this.cloudMat.uniforms.uLit.value.setRGB(1, 0.97 - warm * 0.05, 0.92 - warm * 0.1);
      // l'horizon : une couleur douce, la même pour le ciel, le plancher et les nuages lointains
      const sky = this.r.sky;
      const hor = this.cloudMat.uniforms.uFogColor.value.copy(sky.bottom).lerp(new THREE.Color(0xfff6ec), 0.62);
      if (this.skyDome) {
        this.skyDome.visible = y > 27;
        this.skyDome.position.copy(camera.position);
        this.skyMat.uniforms.uHorizon.value.copy(hor);
        this.skyMat.uniforms.uZenith.value.set(0x2a62b8).lerp(sky.top, 0.25);
        this.skyMat.uniforms.uSunColor.value.copy(sky.sunColor);
        this.skyMat.uniforms.uSunDir.value.copy(sky.sun.position).sub(sky.sun.target.position).normalize();
      }
      const fade = 1 - smooth(15, 19, t);
      this.cloudMat.uniforms.uOpacity.value = fade;
      this.cloudMesh.visible = fade > 0.01;
      if (this.cloudMesh.visible) this.sortClouds(dt);
      if (this.floor) {
        // le plancher n'existe que vu d'en haut
        const f = smooth(37, 47, y);
        this.floorMat.uniforms.uOpacity.value = f;
        this.floor.visible = f > 0.01;
        this.floorMat.uniforms.uTime.value = t;
        this.floorMat.uniforms.uCam.value.copy(camera.position);
      }
    }
    if (!this.gold) {
      this.gold = new THREE.Color(0xffd34f);
      this.Ccol = new THREE.Color();
    }
    if (this.bricks) this.updateBricks(t, dt);
    // voile blanc en traversant les nuages
    const white = Math.max(0, 1 - Math.abs(y - 38.5) / 8) * 0.85;
    // soleil à l'écran (halo)
    this.v.copy(this.r.sky.sun.position).sub(this.r.sky.sun.target.position).normalize().multiplyScalar(300).add(camera.position);
    this.v.project(camera);
    const sun = { x: this.v.x, y: this.v.y, visible: this.v.z < 1 && Math.abs(this.v.x) < 1.6 && Math.abs(this.v.y) < 1.6, strength: smooth(24, 70, y) };
    if (!this.titled && t >= 21.1) {
      this.titled = true;
      this.onTitle?.();
    }
    const done = t >= this.dur;
    return { t, dur: this.dur, y, white, sun, done };
  }
}
