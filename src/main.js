// Point d'entrée : démarre le jeu, installe le mode hors ligne.
import { Game } from './core/Game.js';
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
function progress(p, text) {
  if (bar) bar.style.width = Math.round(p * 100) + '%';
  if (text && msg) msg.textContent = text;
}

async function start() {
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl2') || test.getContext('webgl');
  if (!gl) throw new Error('WebGL indisponible');
  progress(0.02, 'Chargement des bâtiments…');
  try {
    if (!/[?&]nokit/.test(location.search)) await loadKit('assets/models.bin', (p) => progress(0.05 + p * 0.8));
  } catch (err) {
    // sans les modèles 3D, le jeu garde ses bâtiments faits main
    console.warn('Modèles 3D indisponibles', err);
  }
  progress(0.88, 'Construction du village…');
  await new Promise((r) => requestAnimationFrame(r));
  const game = new Game();
  window.batisseur = game; // pratique pour le débogage
  game.init(root);
  game.boot();
  progress(1, 'Prêt !');
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
