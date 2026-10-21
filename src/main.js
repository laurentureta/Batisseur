// Point d'entrée : démarre le jeu, installe le mode hors ligne.
import { Game } from './core/Game.js';

const root = document.getElementById('app');
const loading = document.getElementById('loading');

function fail(msg) {
  if (loading) {
    loading.classList.add('error');
    loading.querySelector('.ld-msg').textContent = msg;
  }
}

try {
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl2') || test.getContext('webgl');
  if (!gl) throw new Error('WebGL indisponible');
  const game = new Game();
  window.batisseur = game; // pratique pour le débogage
  game.init(root);
  game.boot();
  window.__booted = true;
  requestAnimationFrame(() => loading?.classList.add('done'));
  setTimeout(() => loading?.remove(), 900);
} catch (err) {
  console.error(err);
  fail('Impossible de lancer le jeu : ' + (err.message || err));
}

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
