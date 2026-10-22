// La cinématique d'introduction : l'écran « Touche pour commencer », le bouton « Passer », les
// bandes noires, le voile des nuages, le halo du soleil, le titre, la musique, puis le passage en
// douceur à l'écran d'accueil (la dernière image de la caméra est la vue de l'accueil).
import { h } from './dom.js';
import { saveSettings } from '../core/save.js';
import { DAY_SECONDS } from '../world/constants.js';

/** Faut-il jouer la cinématique au lancement ? (pas si elle a déjà été vue, ou si on l'a coupée) */
export function introWanted(game) {
  const s = game.settings;
  if (s.intro === false || s.introSeen) return false;
  if (/[?&]nointro/.test(location.search)) return false;
  return true;
}

/** Vue finale = vue de l'écran d'accueil. */
function menuView(game) {
  const r = game.renderer;
  const cam = r.cam;
  const th = game.world.townhall();
  const c = game.world.centerOf(th);
  cam.cinematic = false;
  cam.fly = null;
  cam.autoOrbit = 0;
  cam.target.set(c.cx - game.world.size / 2, 0, c.cz - game.world.size / 2 + 1);
  cam.distance = 26;
  cam.azimuth = Math.PI / 4;
  cam.update(0);
  const p = r.camera.position;
  return { p: [p.x, p.y, p.z], l: [cam.target.x, cam.target.y, cam.target.z] };
}

/** Le village d'accueil au petit matin : les habitants partent déjà au travail. */
function prepareVillage(game) {
  const st = game.state;
  st.time.day = Math.floor(st.time.day) + 6 / 24;
  const step = 0.25;
  for (let k = 0; k < 18; k++) {
    st.time.day += step / DAY_SECONDS;
    game.villagers.demoTick(step);
    game.construction.demoTick(step);
  }
}

export function playIntro(game, { onDone } = {}) {
  const ui = game.ui;
  const r = game.renderer;
  if (!game.world || !r) {
    onDone?.();
    return;
  }
  ui.start.hide();
  ui.setPlayingUI(false);
  game.cinematicOn = true;
  prepareVillage(game);
  const end = menuView(game);

  // ─── les calques de l'interface
  const white = h('div.intro-white');
  const sun = h('div.intro-sun');
  const barT = h('div.intro-bar.top'), barB = h('div.intro-bar.bottom');
  const skip = h('button.intro-skip', { onclick: (e) => { e.stopPropagation(); finish(true); } }, 'Passer l\'intro ', h('b', '›'));
  const title = h('div.intro-title',
    h('div.it-rays'),
    h('div.it-logo-wrap', h('img.it-logo', { src: 'icons/logo.svg', alt: 'Bâtisseur' }), h('div.it-shine')),
    h('div.it-sub', 'Ton village t\'attend…'),
  );
  const tap = h('div.intro-tap', h('div.it-tap-txt', matchMedia('(hover: hover)').matches ? 'Clique pour commencer' : 'Touche l\'écran pour commencer'), h('div.it-tap-hint', 'Monte le son pour l\'ambiance 🎶'));
  const root = h('div.intro', white, sun, barT, barB, title, tap, skip);
  ui.root.appendChild(root);
  requestAnimationFrame(() => root.classList.add('on'));

  let started = false, finished = false, score = null, raf = 0;
  // première image : au-dessus des nuages, en attendant le top départ
  r.cinematic.start({ end, quality: r.quality, onTitle: () => showTitle() });
  r.cinematic.paused = true;
  game.demoRate = 0;

  const begin = () => {
    if (started) return;
    started = true;
    game.sound.unlock();
    tap.classList.add('gone');
    root.classList.add('play');
    r.cinematic.paused = false;
    // la musique part avec la caméra (le contexte audio met un instant à démarrer)
    setTimeout(() => {
      score = game.sound.cineScore();
    }, 30);
    game.demoRate = 0.16; // la matinée avance doucement pendant le vol
    loop();
  };
  // pas besoin d'attendre un geste si le son est coupé ; sinon on attend un peu, puis on part
  const onTap = (e) => {
    if (e.target.closest('.intro-skip')) return;
    begin();
  };
  root.addEventListener('pointerdown', onTap);
  // le son est déjà débloqué (on revoit l'intro) ou coupé : on part tout de suite
  const ready = !game.settings.sound || game.sound.ctx?.state === 'running';
  const autoStart = setTimeout(begin, ready ? 350 : 6000);
  if (ready) tap.classList.add('gone');
  const onKey = (e) => {
    if (e.key === 'Escape') finish(true);
    else if (!started && (e.key === 'Enter' || e.key === ' ')) begin();
  };
  window.addEventListener('keydown', onKey);

  const showTitle = () => {
    title.classList.add('show');
    root.classList.add('titled');
  };

  const loop = () => {
    if (finished) return;
    const s = r.cineState;
    if (s) {
      white.style.opacity = s.white.toFixed(3);
      if (s.sun.visible && s.sun.strength > 0.02) {
        const rect = r.canvas.getBoundingClientRect();
        sun.style.opacity = (s.sun.strength * 0.95).toFixed(3);
        sun.style.transform = `translate(${((s.sun.x * 0.5 + 0.5) * rect.width).toFixed(1)}px, ${((-s.sun.y * 0.5 + 0.5) * rect.height).toFixed(1)}px)`;
      } else sun.style.opacity = '0';
      if (s.done) {
        // le titre reste un instant sur la vue d'accueil, puis l'accueil apparaît
        setTimeout(() => finish(false), 1200);
        return;
      }
    }
    raf = requestAnimationFrame(loop);
  };

  function finish(skipped) {
    if (finished) return;
    finished = true;
    clearTimeout(autoStart);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    game.settings.introSeen = true;
    saveSettings(game.settings);
    const done = () => {
      r.cinematic.stop();
      r.cam.autoOrbit = 0.04;
      game.demoRate = 0.6;
      game.cinematicOn = false;
      ui.start.show();
      ui.start.el.classList.add('from-intro');
      setTimeout(() => ui.start.el.classList.remove('from-intro'), 1200);
      root.classList.add('out');
      setTimeout(() => root.remove(), 900);
      onDone?.();
    };
    if (skipped) {
      // on passe : un fondu rapide vers la vue d'accueil
      score?.stop(0.4);
      root.classList.add('skipping');
      setTimeout(done, 380);
    } else {
      score?.stop(2.5);
      done();
    }
  }
}
