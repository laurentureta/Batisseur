// Shaders partagés : végétation vivante (vent, secousse, chute et repousse des arbres) et eau animée.
import * as THREE from 'three';
import { waveTexture } from './waves.js';

/** Uniformes communs à toute la végétation (mis à jour à chaque image). */
export const VEG_UNIFORMS = {
  uTime: { value: 0 }, // secondes réelles (vent)
  uGameTime: { value: 0 }, // secondes de jeu depuis le chargement (coupe, repousse)
  uGrowDur: { value: 140 }, // durée de la repousse (secondes de jeu)
  uWind: { value: 1 }, // force du vent
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
};

// aInfo : x = hauteur du modèle (repère local), y = phase du vent, z = orientation (rad), w = échelle
// aState : x = mode (0 debout, 1 coupé, 2 repousse), y = début (secousse ou repousse), z = début de la chute, w = direction de chute
const VEG_HEAD = /* glsl */ `
attribute vec4 aInfo;
attribute vec4 aState;
uniform float uTime;
uniform float uGameTime;
uniform float uGrowDur;
uniform float uWind;
uniform vec2 uWindDir;
`;

const VEG_BODY = /* glsl */ `
{
  float hf = clamp(transformed.y / max(aInfo.x, 0.001), 0.0, 1.6);
  float mode = aState.x;
  if (mode > 1.5) {
    float g = clamp((uGameTime - aState.y) / uGrowDur, 0.0, 1.0);
    transformed *= 0.12 + 0.88 * g * g * (3.0 - 2.0 * g);
  }
  float cy = cos(-aInfo.z), sy = sin(-aInfo.z);
  vec2 wdir = vec2(uWindDir.x * cy - uWindDir.y * sy, uWindDir.x * sy + uWindDir.y * cy);
  float sway = (sin(uTime * 1.7 + aInfo.y) * 0.6 + sin(uTime * 2.9 + aInfo.y * 1.7) * 0.4) * uWind;
  transformed.xz += wdir * sway * hf * hf * (0.045 / max(aInfo.w, 0.05));
  float ts = uGameTime - aState.y;
  if (mode < 0.5 && ts > 0.0 && ts < 1.0) {
    float a = sin(ts * 42.0) * exp(-ts * 5.0) * 0.07 / max(aInfo.w, 0.05);
    transformed.xz += vec2(wdir.y, -wdir.x) * a * hf;
  }
  if (mode > 0.5 && mode < 1.5) {
    float tf = max(0.0, uGameTime - aState.z);
    float k = clamp(tf / 1.1, 0.0, 1.0);
    float ang = k * k * 1.52;
    float fa = aState.w - aInfo.z;
    vec2 fd = vec2(sin(fa), cos(fa));
    float u = dot(transformed.xz, fd);
    float v = transformed.y;
    float cu = cos(ang), su = sin(ang);
    float nu = u * cu + v * su;
    float nv = -u * su + v * cu;
    transformed.xz += fd * (nu - u);
    transformed.y = nv;
    transformed *= 1.0 - smoothstep(1.45, 2.1, tf);
  }
}
`;

function inject(shader) {
  Object.assign(shader.uniforms, VEG_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VEG_HEAD}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VEG_BODY}`);
}

/** Matériau Lambert « vivant » (couleurs par sommet, instances). */
export function vegetationMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => 'veg-lambert' + (opts.side === THREE.DoubleSide ? '-2' : '');
  return mat;
}

/** Matériau d'ombre assorti (pour que les ombres bougent avec les arbres). */
export function vegetationDepthMaterial() {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => 'veg-depth';
  return mat;
}

/* ───────── Eau ───────── */
export const WATER_UNIFORMS = {
  uTime: { value: 0 },
  uFrozen: { value: 0 },
};

// Réglages de la houle, modifiables à chaud depuis la console pendant la mise au point.
// x, y : périodes spatiales (en cases) de la nappe principale et du détail
// z, w : pente rendue par chacune
export const WAVE_TUNE = {
  uWave: { value: new THREE.Vector4(8.5, 3.0, 0.58, 0.30) },
  // x : période de la houle qui soulève le maillage, y : son amplitude,
  // z : force de l'écume de crête, w : contraste creux / crête sur la couleur
  uSwell: { value: new THREE.Vector4(44.0, 0.022, 0.055, 0.22) },
  // durée de la boucle, en secondes : la simulation d'origine durait 16,7 s
  uLoop: { value: 21.0 },
};

/**
 * Eau : la forme des vagues vient de la simulation d'océan fournie avec le projet, cuite en
 * texture 3D (voir waves.js). Le maillage ne porte qu'une case par sommet : la houle le soulève
 * à grande échelle, et tout le détail — pente, reflets, écume — se calcule pour chaque pixel.
 * Attribut aWater : x = profondeur (0 rive … 1 large), y = vitesse du courant, z, w = direction
 */
export function waterMaterial() {
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true, transparent: true, opacity: 0.86, shininess: 110, specular: 0x8fcdf0,
    emissive: 0x0b3550, emissiveIntensity: 0.3, depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WATER_UNIFORMS, WAVE_TUNE);
    shader.uniforms.uWaves = { value: waveTexture() };
    const COMMON = /* glsl */ `
uniform float uTime;
uniform float uFrozen;
uniform float uLoop;
uniform vec4 uWave;
uniform vec4 uSwell;
uniform sampler3D uWaves;
// hauteur, pentes et courbure de la mer à un point et un instant donnés
vec4 wSea(vec2 p, float period, float t) {
  return texture(uWaves, vec3(p / period, t)) * 2.0 - 1.0;
}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWater;
varying vec4 vWater;
varying vec2 vWorld;
${COMMON}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWater = aWater;
vWorld = position.xz;
{
  // Seule la grande houle peut être portée par le maillage : il n'a qu'un sommet par case,
  // et une vague plus courte que deux cases s'y replierait en escalier. Le reste est en pixels.
  float t = uTime / uLoop;
  float h = wSea(position.xz, uSwell.x, t).r;
  transformed.y += h * uSwell.y * (0.25 + 0.75 * aWater.x) * (1.0 - uFrozen);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vWater;
varying vec2 vWorld;
${COMMON}
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// une rivière emporte sa houle avec elle
vec2 wFlow() { return vWater.zw * vWater.y * uTime * 0.45; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float fw = length(fwidth(vWorld));
  float t = uTime / uLoop;
  vec2 q = vWorld - wFlow();
  // deux échelles de la même mer : la nappe large, puis un détail plus serré et décalé,
  // qui s'efface le premier quand la caméra s'éloigne pour éviter le fourmillement
  vec2 g = wSea(q, uWave.x, t).gb * uWave.z * smoothstep(1.4, 0.35, fw);
  g += wSea(q * 1.07 + vec2(37.0, 11.0), uWave.y, t * 1.31 + 0.37).gb * uWave.w * smoothstep(0.55, 0.12, fw);
  // la houle ne s'éteint qu'un peu près du bord : la profondeur est interpolée par quadrilatère,
  // et s'en servir trop fort redessinerait la grille des cases à la surface
  g *= (1.0 - uFrozen) * (0.72 + 0.28 * vWater.x);
  vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
specularStrength *= 0.25 + 0.75 * smoothstep(1.1, 0.25, length(fwidth(vWorld)));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uFrozen < 0.5) {
  float fw = length(fwidth(vWorld));
  float t = uTime / uLoop;
  vec2 q = vWorld - wFlow();
  vec4 sea = wSea(q, uWave.x, t);
  // un creux est plus sombre et plus bleu, une crête plus claire : c'est ce qui donne du
  // volume à une nappe d'eau vue de dessus
  float lift = sea.r * uSwell.w * smoothstep(1.6, 0.4, fw);
  diffuseColor.rgb *= 1.0 + lift;
  diffuseColor.b += max(0.0, -lift) * 0.12;
  // écume : sur les crêtes marquées (forte courbure) et le long des rives
  float shore = 1.0 - smoothstep(0.0, 0.3, vWater.x);
  // une crête, c'est une bosse haute et raide : l'écume s'y accroche
  vec2 sg = wSea(q, uWave.x, t).gb;
  float crest = smoothstep(0.30, 0.85, sea.r) * smoothstep(0.12, 0.42, length(sg)) * uSwell.z * smoothstep(0.7, 0.18, fw);
  float foam = shore * smoothstep(0.5, 0.78, wNoise(vWorld * 5.0 + vec2(uTime * 0.6, -uTime * 0.4))) * smoothstep(0.6, 0.2, fw);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), clamp(foam * 0.5 + shore * 0.1 + crest * 0.45, 0.0, 0.9));
  // petits éclats de lumière
  float sp = smoothstep(0.88, 0.97, wNoise(vWorld * 6.0 - wFlow() * 6.0 + vec2(uTime * 0.9, uTime * 0.7))) * smoothstep(0.4, 0.1, fw);
  diffuseColor.rgb += sp * vec3(0.09, 0.13, 0.17); // bleuté : un éclat blanc vire au rose sur l'eau
  diffuseColor.a = mix(diffuseColor.a, 0.97, smoothstep(0.35, 1.0, vWater.x) * 0.5);
}`);
  };
  mat.customProgramCacheKey = () => 'water-v4';
  return mat;
}
