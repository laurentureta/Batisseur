// Règles de développement : chiffres affichés au joueur et utilisés par la simulation.
export const SPECIALTIES = {
  residential: { name: 'Quartier résidentiel', icon: '🏡', color: 0x82ad80, goal: 'Deux habitations', count: 2, categories: ['housing'], happy: 0.04 },
  farming: { name: 'Terres agricoles', icon: '🌾', color: 0xcbb65e, goal: 'Deux fermes, potagers ou élevages', count: 2, types: ['farm','garden','coop','pasture'], production: 1.15 },
  industry: { name: 'Quartier des artisans', icon: '⚒️', color: 0xb68d72, goal: 'Deux bâtiments de production', count: 2, categories: ['production'], production: 1.2, happy: -0.05 },
  commerce: { name: 'Cœur commerçant', icon: '🛒', color: 0x70a9bf, goal: 'Deux commerces', count: 2, categories: ['commerce'], commerce: 1.15 },
  heritage: { name: 'Quartier historique', icon: '🏛️', color: 0xb395bd, goal: 'Un monument et deux décors', count: 1, categories: ['monuments'], decor: 2, tourism: 20 },
};
export const FACADES = {
  original: { name: 'D’origine', color: null },
  ivory: { name: 'Ivoire', color: 0xf5edda },
  peach: { name: 'Pêche', color: 0xe8b59e },
  sage: { name: 'Sauge', color: 0xb1c7aa },
  sky: { name: 'Bleu pastel', color: 0xaecbd7 },
};
export const GARDENS = { none: 'Sans jardin', flowers: 'Massifs fleuris', hedge: 'Haie et clôture' };
export const PROJECTS = {
  civic_square: { name: 'Place des Fêtes', icon: '🎪', level: 3, bonus: '+3 % de bonheur ; commerces +25 % les jours de fête.', phases: [
    { name: 'Paver la place', cost: { coins: 250, stone: 50 }, seconds: 60 },
    { name: 'Installer la fontaine', cost: { coins: 500, wood: 60, stone: 80 }, seconds: 180 },
    { name: 'Préparer les fêtes', cost: { coins: 800, wood: 100, food: 80 }, seconds: 600 },
  ] },
  civic_garden: { name: 'Jardin des Horlogers', icon: '🌷', level: 10, bonus: '+200 de stockage et +20 de tourisme par jour.', phases: [
    { name: 'Tracer les allées', cost: { coins: 800, stone: 120 }, seconds: 120 },
    { name: 'Restaurer le kiosque', cost: { coins: 1200, wood: 150, planks: 60 }, seconds: 600 },
    { name: 'Fleurir le jardin', cost: { coins: 2000, food: 120, stone: 100 }, seconds: 1200 },
  ] },
  civic_harbor: { name: 'Port des Explorateurs', icon: '⚓', level: 18, bonus: 'Débloque les liaisons maritimes ; +40 de tourisme par jour.', phases: [
    { name: 'Aménager les quais', cost: { coins: 1800, wood: 180, stone: 120 }, seconds: 300 },
    { name: 'Monter la capitainerie', cost: { coins: 2500, planks: 100, bricks: 60 }, seconds: 1200 },
    { name: 'Ouvrir le port', cost: { coins: 4000, tools: 50, food: 100 }, seconds: 1800 },
  ] },
};
export const TERRITORIES = {
  home: { name: 'Village fondateur', icon: '🏡', preset: 'vallee', level: 1, cost: {}, seed: 0 },
  island: { name: 'Île des Vergers', icon: '🏝️', preset: 'ile', level: 12, cost: { coins: 2500, wood: 150, food: 100 }, seed: 1907, specialty: 'farming', cargo: 'food', rate: 1.15 },
  mountain: { name: 'Vallée des Mines', icon: '🏔️', preset: 'montagne', level: 20, cost: { coins: 5000, stone: 200, tools: 30 }, seed: 4019, specialty: 'industry', cargo: 'stone', rate: 1.15 },
  coast: { name: 'Rivage des Voyageurs', icon: '⛵', preset: 'cote', level: 30, cost: { coins: 12000, planks: 200, bricks: 100 }, seed: 7907, specialty: 'commerce', cargo: 'coins', rate: 1.15 },
};
export const TRANSPORT = {
  cart: { name: 'Convoi léger · route ou bac', icon: '🐎', seconds: 180, capacity: 100, fee: 25 },
  train: { name: 'Train de fret', icon: '🚂', seconds: 90, capacity: 300, fee: 50, building: 'station' },
  boat: { name: 'Cargo maritime', icon: '⛵', seconds: 120, capacity: 500, fee: 60, building: 'civic_harbor' },
};
export const HOUSEHOLDS = [
  { name: 'La famille Rivière', people: 'Léa, Hugo et leur fille Jade', icon: '👨‍👩‍👧', job: 'Une famille de jardiniers', chapters: [
    { title: 'Une maison pour grandir', text: 'Jade rêve d’une chambre à elle. Pourriez-vous agrandir notre maison ?', kind: 'home', target: 2, reward: { coins: 250, xp: 60 } },
    { title: 'Du pain au village', text: 'Léa aimerait acheter du pain frais chaque matin.', kind: 'building', type: 'bakery', target: 1, reward: { coins: 500, xp: 100 } },
    { title: 'Un jardin pour se retrouver', text: 'Offrons aux enfants un parc où jouer après l’école.', kind: 'building', type: 'park', target: 1, reward: { coins: 800, xp: 150 } },
  ] },
  { name: 'Les Morel', people: 'Camille et son père Émile', icon: '🧑‍🌾', job: 'Deux générations d’artisans', chapters: [
    { title: 'Les mains du village', text: 'Émile veut transmettre son métier : il nous faudrait une scierie.', kind: 'building', type: 'sawmill', target: 1, reward: { coins: 300, xp: 70 } },
    { title: 'La tournée de Camille', text: 'Camille aimerait voir une vraie tournée de marchandises arriver à l’entrepôt.', kind: 'deliveries', target: 3, reward: { coins: 600, xp: 120 } },
    { title: 'Notre première fête', text: 'Rien ne ferait plus plaisir à Émile qu’inaugurer la Place des Fêtes.', kind: 'project', type: 'civic_square', target: 1, reward: { coins: 1200, xp: 200 } },
  ] },
  { name: 'Les Delorme', people: 'Noa et Inès', icon: '🧭', job: 'De jeunes explorateurs', chapters: [
    { title: 'Prêts pour l’aventure', text: 'Nous préparons nos bagages. Aidons d’abord le village à accueillir 20 habitants.', kind: 'population', target: 20, reward: { coins: 350, xp: 80 } },
    { title: 'L’île au loin', text: 'Noa a repéré une île fertile. Pourrions-nous y fonder un village ?', kind: 'territory', type: 'island', target: 1, reward: { coins: 900, xp: 150 } },
    { title: 'Un lien entre nos villages', text: 'Inès attend la première livraison venue d’un autre territoire.', kind: 'regionalDeliveries', target: 1, reward: { coins: 1600, xp: 250 } },
  ] },
];
