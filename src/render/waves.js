// Houle. Les vagues du jeu ne sont plus inventées à la main : elles viennent d'une simulation
// d'océan fournie avec le projet (water_waves.glb, 500 images d'un maillage de 81 x 81).
//
// Le fichier d'origine pesait 163 Mo parce qu'il gardait la position de chaque sommet à chaque
// image. On n'en a gardé que ce qui compte : le champ de hauteur. Analysé en transformée de
// Fourier à trois dimensions, il tient dans 148 000 coefficients — l'essentiel de son énergie
// est dans les basses fréquences. Reconstruit sur une grille de 96 x 96 et 64 instants, il
// devient parfaitement périodique en espace comme en temps : la mer se répète sans couture et
// la boucle est invisible. Le tout pèse 1,5 Mo et se lit en une texture 3D.
//
// La texture porte, par texel : R = hauteur, G = pente est-ouest, B = pente nord-sud. Les
// pentes sont cuites, jamais dérivées à l'écran : c'est ce qui évite l'escalier qu'on obtient
// en dérivant une hauteur codée sur huit bits. L'alpha reste plein : un canevas HTML range ses
// couleurs pré-multipliées, et un alpha partiel abîmerait les trois autres canaux à la relecture.
import * as THREE from 'three';

export const WAVE_SIZE = 96;   // côté de la grille spatiale
export const WAVE_FRAMES = 64; // instants de la boucle
const COLS = 8;                // l'atlas est un damier de 8 x 8 blocs

/** Texture neutre : une mer plate, le temps que l'image arrive. */
function neutral() {
  const data = new Uint8Array(WAVE_SIZE * WAVE_SIZE * WAVE_FRAMES * 4).fill(128);
  const tex = new THREE.Data3DTexture(data, WAVE_SIZE, WAVE_SIZE, WAVE_FRAMES);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // la répétition sur les trois axes est ce qui rend la mer infinie et la boucle continue
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace; // ce sont des mesures, pas des couleurs
  tex.needsUpdate = true;
  return tex;
}

let texture = null;
let loading = false;

/** Texture de houle, partagée par tous les plans d'eau. Le chargement se fait une seule fois. */
export function waveTexture() {
  if (texture) return texture;
  texture = neutral();
  load();
  return texture;
}

function load() {
  if (loading || typeof document === 'undefined') return;
  loading = true;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    try {
      const side = COLS * WAVE_SIZE;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const src = ctx.getImageData(0, 0, side, side).data;
      const dst = texture.image.data;
      // l'atlas est rangé en damier pour tenir dans un canevas d'iPhone ; la texture 3D, elle,
      // veut les instants les uns derrière les autres
      for (let f = 0; f < WAVE_FRAMES; f++) {
        const bx = (f % COLS) * WAVE_SIZE, by = Math.floor(f / COLS) * WAVE_SIZE;
        for (let y = 0; y < WAVE_SIZE; y++) {
          let s = ((by + y) * side + bx) * 4;
          let d = ((f * WAVE_SIZE + y) * WAVE_SIZE) * 4;
          for (let x = 0; x < WAVE_SIZE * 4; x++) dst[d++] = src[s++];
        }
      }
      texture.needsUpdate = true;
    } catch (err) {
      console.warn('houle indisponible', err);
    }
  };
  image.onerror = () => console.warn('houle : image introuvable');
  image.src = 'assets/water/waves.png';
}
