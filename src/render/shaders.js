// Shaders partagés : végétation vivante (vent, secousse, chute et repousse des arbres) et eau animée.
import * as THREE from 'three';

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

/**
 * Eau : petites vagues calculées pour chaque pixel (pas d'effet de grille), reflets du soleil,
 * courant des rivières, écume près des rives, scintillement.
 * Attribut aWater : x = profondeur (0 rive … 1 large), y = vitesse du courant, z, w = direction du courant
 */
export function waterMaterial() {
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true, transparent: true, opacity: 0.86, shininess: 90, specular: 0x86c4ea,
    emissive: 0x0b3550, emissiveIntensity: 0.3, depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WATER_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWater;
uniform float uTime;
varying vec4 vWater;
varying vec2 vWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWater = aWater;
vWorld = position.xz;
transformed.y += (sin(position.x * 0.62 + uTime * 0.9) + cos(position.z * 0.47 + uTime * 0.7)) * 0.008 * (0.3 + 0.7 * aWater.x);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uFrozen;
varying vec4 vWater;
varying vec2 vWorld;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 wFlow() { return vWater.zw * vWater.y * uTime * 0.45; }
// pente de la surface (somme de vagues), atténuée au loin pour éviter le scintillement
vec2 wGrad(vec2 p, float t, float fw) {
  vec2 g = vec2(0.0);
  const vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.866), d3 = vec2(0.17, -0.985), d4 = vec2(-0.93, -0.37);
  g += d1 * cos(dot(d1, p) * 2.1 + t * 1.5) * 0.07 * smoothstep(1.6, 0.5, fw);
  g += d2 * cos(dot(d2, p) * 3.3 + t * 2.0) * 0.05 * smoothstep(0.9, 0.3, fw);
  g += d3 * cos(dot(d3, p) * 5.1 + t * 2.6) * 0.035 * smoothstep(0.5, 0.15, fw);
  g += d4 * cos(dot(d4, p) * 7.3 + t * 3.4) * 0.025 * smoothstep(0.32, 0.08, fw);
  return g;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float fw = length(fwidth(vWorld));
  vec2 g = wGrad(vWorld - wFlow(), uTime, fw) * (1.0 - uFrozen);
  vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
specularStrength *= 0.25 + 0.75 * smoothstep(1.1, 0.25, length(fwidth(vWorld)));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uFrozen < 0.5) {
  vec2 p = vWorld * 2.2 - wFlow() * 2.2;
  float fw = length(fwidth(vWorld));
  float n = wNoise(p + vec2(uTime * 0.21, uTime * 0.17)) * 0.6 + wNoise(p * 2.3 - vec2(uTime * 0.31, -uTime * 0.12)) * 0.4;
  diffuseColor.rgb *= 0.93 + n * 0.14;
  // écume près des rives
  float shore = 1.0 - smoothstep(0.0, 0.3, vWater.x);
  float foam = shore * smoothstep(0.5, 0.78, wNoise(vWorld * 5.0 + vec2(uTime * 0.6, -uTime * 0.4))) * smoothstep(0.6, 0.2, fw);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), foam * 0.5 + shore * 0.1);
  // petits éclats de lumière
  float sp = smoothstep(0.88, 0.97, wNoise(vWorld * 6.0 - wFlow() * 6.0 + vec2(uTime * 0.9, uTime * 0.7))) * smoothstep(0.4, 0.1, fw);
  diffuseColor.rgb += sp * 0.18;
  diffuseColor.a = mix(diffuseColor.a, 0.97, smoothstep(0.35, 1.0, vWater.x) * 0.5);
}`);
  };
  mat.customProgramCacheKey = () => 'water-v3c';
  return mat;
}
