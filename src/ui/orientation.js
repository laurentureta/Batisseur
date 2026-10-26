import { h } from './dom.js';

// Safari iPhone ne propose pas toujours ScreenOrientation.lock : la rotation
// physique reste le chemin principal, sans retourner artificiellement le canvas.
export function setupLandscape(root) {
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  const hint = h('p.rotate-hint', 'Si rien ne change, désactivez le verrouillage de rotation dans le centre de contrôle de votre téléphone.');
  const lock = h('button.btn.primary.rotate-button', {
    onclick: async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        await screen.orientation.lock('landscape');
      } catch {
        hint.textContent = 'Tournez votre téléphone à l’horizontale. Si nécessaire, désactivez son verrouillage de rotation.';
      }
    },
  }, 'Activer le paysage');
  lock.hidden = typeof screen.orientation?.lock !== 'function';
  const gate = h('div.orientation-gate', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rotate-title', tabIndex: -1 },
    h('div.rotate-device', { 'aria-hidden': 'true' }, h('span', '↻')),
    h('p.rotate-eyebrow', 'BÂTISSEUR'),
    h('h1#rotate-title', 'Un village en grand !'),
    h('p', 'Tournez votre téléphone pour jouer en paysage.'), lock, hint,
  );
  document.body.appendChild(gate);
  let wasBlocked = false, previousFocus;
  const sync = () => {
    const blocked = portrait.matches;
    document.documentElement.classList.toggle('needs-landscape', blocked);
    root.inert = blocked;
    gate.hidden = !blocked;
    if (blocked && !wasBlocked) {
      previousFocus = document.activeElement;
      window.batisseur?.save();
      gate.focus({ preventScroll: true });
    } else if (!blocked && wasBlocked && previousFocus?.isConnected) {
      previousFocus.focus?.({ preventScroll: true });
    }
    if (window.batisseur) window.batisseur.lastT = 0;
    wasBlocked = blocked;
  };
  portrait.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  sync();
}
