// Service worker : le jeu fonctionne hors ligne une fois chargé.
// Pense à changer VERSION à chaque mise à jour pour que les joueurs reçoivent la nouvelle version.
const VERSION = 'batisseur-v3.9.1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './lib/three.module.min.js',
  './fonts/LilitaOne.woff',
  './fonts/Fredoka.woff',
  './icons/logo.svg',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './assets/keyart.jpg',
  './assets/models.bin',
  './assets/creatures.bin',
  './src/main.js',
  './src/version.js',
  './src/core/Actions.js',
  './src/core/EventBus.js',
  './src/core/Game.js',
  './src/core/GameCore.js',
  './src/core/audio.js',
  './src/core/demo.js',
  './src/core/meta.js',
  './src/core/music.js',
  './src/core/rng.js',
  './src/core/save.js',
  './src/core/state.js',
  './src/core/util.js',
  './src/data/buildings.js',
  './src/data/cosmetics.js',
  './src/data/events.js',
  './src/data/pass.js',
  './src/data/presets.js',
  './src/data/progression.js',
  './src/data/quests.js',
  './src/data/resources.js',
  './src/data/shop.js',
  './src/input/Input.js',
  './src/net/bot.js',
  './src/net/online.js',
  './src/net/snapshot.js',
  './src/render/Agents.js',
  './src/render/Animals.js',
  './src/render/Boats.js',
  './src/render/BuildingView.js',
  './src/render/CameraController.js',
  './src/render/Cinematic.js',
  './src/render/Clouds.js',
  './src/render/Labels.js',
  './src/render/Overlays.js',
  './src/render/Particles.js',
  './src/render/People.js',
  './src/render/Renderer.js',
  './src/render/RoadView.js',
  './src/render/Sites.js',
  './src/render/Sky.js',
  './src/render/TerrainView.js',
  './src/render/Thumbnails.js',
  './src/render/Train.js',
  './src/render/Vegetation.js',
  './src/render/Worksites.js',
  './src/render/creatures.js',
  './src/render/eventModels.js',
  './src/render/geom.js',
  './src/render/humanPose.js',
  './src/render/kit.js',
  './src/render/kitModels.js',
  './src/render/models.js',
  './src/render/prestigeModels.js',
  './src/render/shaders.js',
  './src/sim/Construction.js',
  './src/sim/Progression.js',
  './src/sim/RandomEvents.js',
  './src/sim/Requests.js',
  './src/sim/Simulation.js',
  './src/sim/Villagers.js',
  './src/sim/jobs.js',
  './src/sim/paths.js',
  './src/ui/BuildMenu.js',
  './src/ui/InfoPanel.js',
  './src/ui/Panels.js',
  './src/ui/StartScreen.js',
  './src/ui/UI.js',
  './src/ui/art.js',
  './src/ui/dom.js',
  './src/ui/event.js',
  './src/ui/friends.js',
  './src/ui/iconDefs.js',
  './src/ui/icons.js',
  './src/ui/intro.js',
  './src/ui/pass.js',
  './src/ui/profile.js',
  './src/ui/rewards.js',
  './src/ui/screens.js',
  './src/ui/shop.js',
  './src/world/Trees.js',
  './src/world/World.js',
  './src/world/constants.js',
  './src/world/landscape.js',
  './src/world/mapgen.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' évite de remettre en cache une ancienne copie gardée par le navigateur
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    }),
  );
});
