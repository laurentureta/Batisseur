// Point d'entrée : écran de chargement, modèles 3D, puis le jeu ; installe le mode hors ligne.
import { loadKit } from './render/kit.js';

const root = document.getElementById('app');
const loading = document.getElementById('loading');

function fail(msg) {
  if (loading) {
    loading.classList.add('error');
    loading.querySelector('.ld-msg').textContent = msg;
  }
}

const bar = loading?.querySelector('.ld-bar i');
const msg = loading?.querySelector('.ld-msg');
const tipEl = loading?.querySelector('.ld-tip');
const TIPS = [
  'Astuce : relie chaque bâtiment à la mairie par un chemin.',
  'Astuce : améliore la mairie pour débloquer de nouveaux niveaux de bâtiments.',
  'Astuce : les missions du jour rapportent des gemmes 💎.',
  'Astuce : le passe de combat se remplit en construisant et en améliorant.',
  'Astuce : place un bûcheron près d\'une forêt pour qu\'il produise plus.',
  'Astuce : un coffre en bois gratuit t\'attend toutes les 4 heures dans la boutique.',
  'Astuce : les décorations embellissent le quartier et rendent les habitants heureux.',
  'Astuce : la nuit, les fenêtres s\'allument. Ouvre l\'œil !',
];
let tipIdx = Math.floor(Math.random() * TIPS.length);
if (tipEl) tipEl.textContent = TIPS[tipIdx];
const tipTimer = setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length;
  if (tipEl) tipEl.textContent = TIPS[tipIdx];
}, 3200);
import('./version.js').then((m) => {
  const v = loading?.querySelector('.ld-ver');
  if (v) v.textContent = 'v' + m.VERSION;
});
function progress(p, text) {
  if (bar) bar.style.width = Math.round(p * 100) + '%';
  if (text && msg) msg.textContent = text;
}

async function start() {
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl2') || test.getContext('webgl');
  if (!gl) throw new Error('WebGL indisponible');
  progress(0.02, 'Chargement des bâtiments…');
  // le moteur du jeu se charge en même temps que les modèles 3D
  const gameModule = import('./core/Game.js');
  // les polices du jeu (sans bloquer si le réseau est lent)
  const fonts = document.fonts ? Promise.race([Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('16px "Fredoka"')]), new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  try {
    if (!/[?&]nokit/.test(location.search)) await loadKit('assets/models.bin', (p) => progress(0.05 + p * 0.8));
  } catch (err) {
    // sans les modèles 3D, le jeu garde ses bâtiments faits main
    console.warn('Modèles 3D indisponibles', err);
  }
  await fonts.catch(() => {});
  progress(0.88, 'Construction du village…');
  await new Promise((r) => requestAnimationFrame(r));
  const { Game } = await gameModule;
  const game = new Game();
  window.batisseur = game; // pratique pour le débogage
  game.init(root);
  game.boot();
  progress(1, 'Prêt !');
  clearInterval(tipTimer);
  window.__booted = true;
  requestAnimationFrame(() => loading?.classList.add('done'));
  setTimeout(() => loading?.remove(), 900);
}

start().catch((err) => {
  console.error(err);
  fail('Impossible de lancer le jeu : ' + (err.message || err));
});

// Mode hors ligne (uniquement en ligne en HTTPS)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.batisseur?.ui?.toast('✨ Nouvelle version disponible', 'info', {
              label: 'Mettre à jour',
              onclick: () => {
                window.batisseur?.save();
                nw.postMessage('skipWaiting');
              },
            });
          }
        });
      });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  });
}
