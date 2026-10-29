// Pelouse en volume. Le terrain donne la couleur, ce module donne les brins : de petites
// touffes photographiées, semées autour de la caméra et instanciées en trois maillages.
//
// Trois points de méthode :
//  — les touffes sont posées par un tirage déterministe à partir des coordonnées de la case,
//    donc elles ne « nagent » pas quand on déplace la caméra ;
//  — elles ne portent pas la couleur de la photo mais celle du sol qu'elles recouvrent, pour
//    que la pelouse reste dans la palette du jeu (prairie, herbe sèche, automne, neige) ;
//  — les normales pointent vers le ciel : une touffe s'éclaire comme le sol, pas comme un mur.
import * as THREE from 'three';
import { SIZE, T } from '../world/constants.js';
import { RING } from '../world/landscape.js';
import { VEG_UNIFORMS } from './shaders.js';

const HALF = SIZE / 2;
const TYPES = 3;              // trois photos de touffe, pour casser la répétition
const PER_TYPE = 2600;        // instances réservées par photo
const PER_TILE = 18;          // candidats tirés par case (les derniers servent de réserve)
const NATIVE_W = 2.567;       // largeur de la bande complète pour une hauteur de 1
const HEIGHT = 0.19;          // hauteur d'une touffe, en cases
const SLICE = [0.70, 1.0];   // part de la photo montrée par touffe : chacune est différente
const MOVE = 1.6;             // déplacement de caméra qui déclenche un nouveau semis
const REBUILD_MS = 150;
const TAU = Math.PI * 2;

/**
 * Géométrie d'une touffe : une bande verticale coudée en trois bandeaux, reprise du modèle
 * fourni. Normales redressées vers le haut, hauteur ramenée à 1 et base posée sur y = 0.
 */
function plateGeometry(lean) {
  // y, décalage en x : la touffe se couche progressivement vers +x
  const bands = [[0, 0], [0.3333, 0], [0.6667, 0.26 * lean], [1, 0.92 * lean]];
  const hw = NATIVE_W / 2;
  const pos = [], uv = [], idx = [];
  for (let b = 0; b < 3; b++) {
    const [y0, x0] = bands[b], [y1, x1] = bands[b + 1];
    const o = pos.length / 3;
    pos.push(x0, y0, hw, x0, y0, -hw, x1, y1, -hw, x1, y1, hw);
    uv.push(0, y0, 1, y0, 1, y1, 0, y1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // toutes vers le ciel : la pelouse s'éclaire d'un bloc au lieu de clignoter brin par brin
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  // couleur de sommet neutre : three.js en a besoin pour activer la teinte par instance
  g.setAttribute('color', new THREE.Float32BufferAttribute(pos.map(() => 1), 3));
  g.setIndex(idx);
  return g;
}

/** Tirage pseudo-aléatoire reproductible : même case, même touffes, quelle que soit la caméra. */
function rnd(x, z, k) {
  const n = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Second tirage tiré du premier : évite un sinus de plus par valeur. */
function split(v) {
  const n = v * 317.73;
  return n - Math.floor(n);
}

export class GrassField {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.meshes = [];
    this.enabled = true;
    this.quality = 1;          // 0 coupé, 1 normal (réglable depuis les options)
    this.loaded = 0;
    this.last = { x: 1e9, z: 1e9, d: 0, version: -1, at: 0 };
    this.tile = [0, 0, 0];
    this.fade = { value: new THREE.Vector2(16, 21) }; // uniforme partagé par les trois matériaux
    this.slices = [];
    // Rendu de la touffe : x = clarté du pied, y = gain de lumière, z = ombre du pied,
    // w = part de teinte reprise à la photo. Deux réglages : vu de près, on veut du relief ;
    // vu de loin, une simple texture, sinon la prairie se couvre de taches sombres.
    this.toneNear = { value: new THREE.Vector4(0.56, 1.28, 0.58, 0.34) };
    this.tone = { value: new THREE.Vector4(0.92, 0.78, 0.86, 0.24) };

    const loader = new THREE.TextureLoader();
    for (let i = 0; i < TYPES; i++) {
      const tex = loader.load(`assets/grass/blade${i + 1}.png`, () => { this.loaded++; });
      tex.flipY = false;                       // convention glTF : v = 0 en haut de l'image
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const material = this.makeMaterial(tex);
      const geometry = plateGeometry(0.75 + i * 0.22);
      // découpe de la photo propre à chaque touffe : x = début, y = largeur
      const slice = new THREE.InstancedBufferAttribute(new Float32Array(PER_TYPE * 2), 2);
      slice.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aSlice', slice);
      this.slices.push(slice);
      const mesh = new THREE.InstancedMesh(geometry, material, PER_TYPE);
      mesh.count = 0;
      mesh.frustumCulled = false;              // le semis suit déjà la caméra
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_TYPE * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /**
   * Matériau : découpe par seuil d'opacité (pas de tri de transparence), couleur venue du sol,
   * la photo ne servant que pour la forme des brins et leur ombrage. Le vent est celui des arbres.
   */
  makeMaterial(map) {
    const mat = new THREE.MeshLambertMaterial({
      map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = VEG_UNIFORMS.uTime;
      shader.uniforms.uWind = VEG_UNIFORMS.uWind;
      shader.uniforms.uWindDir = VEG_UNIFORMS.uWindDir;
      shader.uniforms.uFade = this.fade;
      shader.uniforms.uTone = this.tone;
      shader.uniforms.uToneNear = this.toneNear;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec2 uFade;
attribute vec2 aSlice;
varying float vBlade;
varying float vNear;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 root = instanceMatrix[3].xyz;
  // les touffes du bord se tassent au lieu de disparaître d'un coup
  float d = distance(root.xz, cameraPosition.xz);
  transformed *= 1.0 - smoothstep(uFade.x, uFade.y, d);
  // le vent est donné dans le repère du monde : on le ramène dans celui de la touffe,
  // sinon chaque touffe se coucherait dans une direction différente
  float sx = max(length(instanceMatrix[0].xyz), 1e-4);
  float sz = max(length(instanceMatrix[2].xyz), 1e-4);
  vec2 wd = vec2(dot(uWindDir, instanceMatrix[0].xz) / sx, dot(uWindDir, instanceMatrix[2].xz) / sz);
  // houle : le haut du brin suit le vent, la base reste plantée
  float ph = root.x * 2.3 + root.z * 1.7;
  float h = clamp(transformed.y, 0.0, 1.0);
  float sway = (sin(uTime * 1.9 + ph) * 0.62 + sin(uTime * 3.3 + ph * 1.6) * 0.38) * uWind;
  transformed.xz += wd * sway * h * h * 0.13;
  vBlade = h;
  vNear = 1.0 - smoothstep(4.0, 15.0, d);
}`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
vMapUv.x = vMapUv.x * aSlice.y + aSlice.x;`);
      shader.fragmentShader = shader.fragmentShader
        // une touffe s'éclaire comme le gazon qu'elle prolonge, jamais comme une paroi : on
        // force la normale vers le ciel, sinon la face arrière de chaque brin partirait au noir
        .replace('#include <common>', `#include <common>
varying float vBlade;
varying float vNear;
uniform vec4 uTone;
uniform vec4 uToneNear;`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`)
        .replace('#include <map_fragment>', `
{
  vec4 grass = texture2D(map, vMapUv);
  diffuseColor.a *= grass.a;
  float lum = dot(grass.rgb, vec3(0.299, 0.587, 0.114));
  // on garde un tiers de la teinte de la photo (brins jaunis, brins foncés) et tout son relief,
  // mais la couleur dominante reste celle de la case : la pelouse suit les saisons du jeu
  vec3 hue = grass.rgb / max(lum, 0.02);
  // le pied de la touffe reste dans l'ombre, la pointe attrape la lumière : c'est ce relief
  // qui empêche la pelouse de se confondre avec le sol peint en dessous
  vec4 tone = mix(uTone, uToneNear, vNear);
  float depth = tone.z + (1.0 - tone.z) * vBlade * vBlade;
  diffuseColor.rgb *= mix(vec3(1.0), hue, tone.w) * (tone.x + lum * tone.y) * depth;
}`);
    };
    mat.customProgramCacheKey = () => 'grass-v1';
    return mat;
  }

  setFade(near, far) {
    if (this.fade) this.fade.value.set(near, far);
  }

  /** La case porte-t-elle de la pelouse libre ? */
  grassy(x, z) {
    const w = this.r.world;
    if (x >= 0 && z >= 0 && x < SIZE && z < SIZE) {
      const i = z * SIZE + x;
      const t = w.terrain[i];
      if (t !== T.GRASS && t !== T.FOREST) return 0;
      if (w.occ[i] >= 0 || w.road[i]) return 0;
      return t === T.FOREST ? 2 : 1;
    }
    const ring = this.r.ring;
    if (!ring?.ok) return 0;
    const rx = x + RING, rz = z + RING;
    if (rx < 0 || rz < 0 || rx >= ring.W || rz >= ring.W) return 0;
    const t = ring.terrain[rz * ring.W + rx];
    return t === T.GRASS ? 1 : t === T.FOREST ? 2 : 0;
  }

  /** Nouveau semis autour de la caméra, si elle a bougé ou si le monde a changé. */
  sync(force = false) {
    const world = this.r.world;
    if (!world || !this.enabled || this.quality <= 0 || this.loaded < TYPES) {
      for (const m of this.meshes) m.count = 0;
      return;
    }
    const cam = this.r.cam;
    const now = performance.now();
    const moved = Math.abs(cam.target.x - this.last.x) + Math.abs(cam.target.z - this.last.z);
    const zoomed = Math.abs(cam.distance - this.last.d) > 1.5;
    if (!force && world.version === this.last.version && moved < MOVE && !zoomed) return;
    if (!force && now - this.last.at < REBUILD_MS) return;
    this.last = { x: cam.target.x, z: cam.target.z, d: cam.distance, version: world.version, at: now };

    // La pelouse en volume est un détail de premier plan : son rayon reste court et varie peu
    // avec le zoom. Au-delà, c'est le grain peint du terrain qui prend le relais.
    const radius = Math.min(22, Math.max(9, 5 + cam.distance * 0.6)) * this.quality;
    this.setFade(radius * 0.74, radius);
    const budget = PER_TYPE * TYPES;
    // nombre de touffes par case pour remplir le disque sans dépasser le budget
    const perTile = Math.max(2, Math.min(PER_TILE, Math.floor(budget / (Math.PI * radius * radius))));

    const terrain = this.r.terrain;
    const cx = Math.floor(cam.target.x + HALF), cz = Math.floor(cam.target.z + HALF);
    const counts = [0, 0, 0];
    const matrices = this.meshes.map((m) => m.instanceMatrix.array);
    const colors = this.meshes.map((m) => m.instanceColor.array);
    const slices = this.slices.map((a) => a.array);
    const tile = this.tile;
    // l'hiver couche l'herbe : sous la neige, il ne dépasse que des pointes
    const height = HEIGHT * (this.r.season === 3 ? 0.5 : 1);
    const limit = Math.ceil(radius);
    const r2 = radius * radius;

    // on balaie les cases par anneaux concentriques : les plus proches sont servies d'abord
    outer:
    for (let ring = 0; ring <= limit; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        const edge = Math.abs(dz) === ring;
        for (let dx = -ring; dx <= ring; dx += edge ? 1 : 2 * ring || 1) {
          const tx = cx + dx, tz = cz + dz;
          const kind = this.grassy(tx, tz);
          if (!kind) continue;
          const wx = tx - HALF, wz = tz - HALF;
          if ((wx + 0.5 - cam.target.x) ** 2 + (wz + 0.5 - cam.target.z) ** 2 > r2) continue;
          // couleur du sol : une fois par case, partagée par ses touffes
          terrain.groundColor(tile, kind === 2 ? T.FOREST : T.GRASS, 0, tx, tz);
          const y0 = terrain.yAt(tx, tz);
          for (let k = 0; k < perTile; k++) {
            const type = k % TYPES;
            const n = counts[type];
            if (n >= PER_TYPE) continue;
            const a = rnd(tx, tz, k + 1), b = rnd(tx, tz, k + 101), c = rnd(tx, tz, k + 211);
            const s = height * (0.70 + split(a) * 0.66);
            // chaque touffe ne montre qu'un morceau de la photo : largeur réelle = part x bande
            const cut = SLICE[0] + split(b) * (SLICE[1] - SLICE[0]);
            const ang = c * TAU;
            const sz = s * cut, ca = Math.cos(ang), sa = Math.sin(ang);
            // matrice écrite directement : la composer via Object3D coûte plus cher que le semis
            const mat = matrices[type], o = n * 16;
            mat[o] = ca * s; mat[o + 1] = 0; mat[o + 2] = -sa * s; mat[o + 3] = 0;
            mat[o + 4] = 0; mat[o + 5] = s; mat[o + 6] = 0; mat[o + 7] = 0;
            mat[o + 8] = sa * sz; mat[o + 9] = 0; mat[o + 10] = ca * sz; mat[o + 11] = 0;
            mat[o + 12] = wx + a; mat[o + 13] = y0; mat[o + 14] = wz + b; mat[o + 15] = 1;
            const sl = slices[type], p2 = n * 2;
            sl[p2] = split(c) * (1 - cut); sl[p2 + 1] = cut;
            // chaque touffe s'écarte un peu de la couleur de sa case, sinon la pelouse est plate
            const v = 0.86 + split(a + c) * 0.3;
            const cl = colors[type], p3 = n * 3;
            cl[p3] = tile[0] * v; cl[p3 + 1] = tile[1] * v; cl[p3 + 2] = tile[2] * v;
            counts[type] = n + 1;
          }
          if (counts[0] >= PER_TYPE && counts[1] >= PER_TYPE && counts[2] >= PER_TYPE) break outer;
        }
      }
    }
    for (let i = 0; i < TYPES; i++) {
      this.meshes[i].count = counts[i];
      this.meshes[i].instanceMatrix.needsUpdate = true;
      this.meshes[i].instanceColor.needsUpdate = true;
      this.slices[i].needsUpdate = true;
    }
  }

  /** La pelouse s'efface quand on prend de la hauteur : de si loin, le grain du sol suffit. */
  update(distance) {
    const on = this.enabled && this.quality > 0 && distance < 46;
    this.group.visible = on;
  }
}
