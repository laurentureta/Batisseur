// Grain du sol. Le terrain est fait de grands quadrilatères à couleur unie : vu de près,
// une pelouse ressemble alors à du plastique. On ajoute ici un relief de couleur calculé
// dans le nuanceur, à partir d'une texture de bruit répétée en coordonnées du monde.
// Aucune géométrie, aucun fichier à télécharger : la texture est dessinée au démarrage.
import * as THREE from 'three';

const SIZE = 256;

function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Bruit de valeur bouclé sur `period` cases : la texture se répète sans couture. */
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wrap = (a) => ((a % period) + period) % period;
  const a = hash(wrap(xi), wrap(yi), seed);
  const b = hash(wrap(xi + 1), wrap(yi), seed);
  const c = hash(wrap(xi), wrap(yi + 1), seed);
  const d = hash(wrap(xi + 1), wrap(yi + 1), seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/**
 * Texture de pelouse : plusieurs octaves de bruit, étirés verticalement pour évoquer des
 * brins, plus un grain fin. Le résultat tient dans le canal rouge ; le vert porte une
 * variante plus douce qui sert aux surfaces minérales.
 */
export function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const fx = x / SIZE, fy = y / SIZE;
      // brins : bruit très étiré sur un axe, répété à plusieurs échelles
      let blade = 0;
      blade += valueNoise(fx * 32, fy * 7, 32, 1) * 0.5;
      blade += valueNoise(fx * 61 + 3.1, fy * 14 + 1.7, 61, 2) * 0.3;
      blade += valueNoise(fx * 11, fy * 11, 11, 3) * 0.2;
      // touffes : grandes nappes plus claires ou plus sombres
      const tuft = valueNoise(fx * 5, fy * 5, 5, 4) * 0.65 + valueNoise(fx * 13, fy * 13, 13, 5) * 0.35;
      const i = (y * SIZE + x) * 4;
      image.data[i] = Math.round(Math.max(0, Math.min(1, blade)) * 255);
      image.data[i + 1] = Math.round(Math.max(0, Math.min(1, tuft)) * 255);
      image.data[i + 2] = Math.round(hash(x, y, 9) * 255); // grain fin, un pixel sur deux
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace; // ce sont des valeurs, pas des couleurs
  return texture;
}

/**
 * Greffe le grain sur un matériau de terrain.
 * `strength` règle l'amplitude ; `near`/`far` la distance au-delà de laquelle le détail
 * fin s'efface, pour éviter le fourmillement à l'horizon.
 */
export function applyGroundDetail(material, texture, { strength = 1.8, near = 22, far = 58 } = {}) {
  material.userData.groundDetail = { strength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGround = { value: texture };
    shader.uniforms.uDetail = { value: strength };
    shader.uniforms.uRange = { value: new THREE.Vector2(near, far) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGroundPos;
uniform sampler2D uGround;
uniform float uDetail;
uniform vec2 uRange;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float dist = length(vGroundPos - cameraPosition);
  float fade = 1.0 - smoothstep(uRange.x, uRange.y, dist);
  // deux échelles : la touffe reste visible de loin, le brin disparaît avec la distance
  vec3 fine = texture2D(uGround, vGroundPos.xz * 1.35).rgb;
  vec3 cross = texture2D(uGround, vec2(vGroundPos.z, -vGroundPos.x) * 1.12 + vec2(0.21, 0.63)).rgb;
  vec3 wide = texture2D(uGround, vGroundPos.xz * 0.23 + vec2(0.37, 0.11)).rgb;
  float blade = ((fine.r + cross.r) * 0.5 - 0.5) * fade;
  float tuft = (wide.g - 0.5);
  float speck = ((fine.b + cross.b) * 0.5 - 0.5) * fade * 0.45;
  // les surfaces végétales (peu de bleu) prennent plus de relief que la pierre ou le sable
  float leafy = clamp((diffuseColor.g - diffuseColor.b) * 2.6, 0.0, 1.0);
  float amount = uDetail * mix(0.45, 1.0, leafy);
  float lift = (blade * 0.17 + tuft * 0.13 + speck * 0.08) * amount;
  diffuseColor.rgb *= 1.0 + lift;
  // un creux d'herbe tire vers le bleu-vert, une crête vers le jaune : c'est ce qui
  // empêche la pelouse de rester d'un seul vert
  diffuseColor.r += lift * 0.10 * leafy;
  diffuseColor.b -= lift * 0.07 * leafy;
}`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'groundDetail' + strength;
  material.needsUpdate = true;
}
