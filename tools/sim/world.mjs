// Création et avance d'une partie sans écran.
import { clock } from './clock.mjs';
import { GameCore } from '../../src/core/GameCore.js';
import { createNewState } from '../../src/core/state.js';

export function newGame({ seed = 1234, preset = 'vallee', mode = 'carriere', name = 'Essai' } = {}) {
  const game = new GameCore({ sites: false, fires: true, sound: false });
  const state = createNewState({ seed, preset, mode, name });
  game.loadState(state);
  game.playing = true;
  game.save = () => true;          // pas de stockage dans le banc d'essai
  game.toast = () => {};
  return game;
}

/** Le joueur est devant son téléphone : tout tourne, comme dans la boucle du jeu. */
export function play(game, seconds, step = 0.5) {
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(step, left);
    clock.advance(dt * 1000);
    game.sim.update(dt);
    game.city.tick(dt);
    game.tourism.tick(dt);
    game.market.tick(dt);
    game.workshopAcc = (game.workshopAcc || 0) + dt;
    if (game.workshopAcc >= 1) { game.workshopAcc = 0; game.workshop.tick(); }
    left -= dt;
  }
}

/** Le jeu est fermé : seul le temps réel passe. Les chantiers avancent, pas la simulation. */
export function away(game, seconds) {
  clock.advance(seconds * 1000);
  game.construction.lastReal = 0;
  game.construction.realTick();
  game.workshop.tick();   // les lots de l'atelier cuisent aussi quand le jeu est fermé
}
