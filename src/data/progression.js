// Progression : niveaux du village, rangs de la mairie, zones, récompenses.

export const MAX_LEVEL = 100;

/** XP nécessaire pour passer du niveau `level` au suivant (au-delà de 50, la courbe s'adoucit). */
export function xpToNext(level) {
  if (level <= 50) return Math.round(30 * Math.pow(level, 1.6) + 40);
  const at50 = 30 * Math.pow(50, 1.6) + 40;
  return Math.round((at50 * Math.pow(1.024, level - 50)) / 10) * 10;
}

// Rangs de la mairie (niveau 1 à 8) : conditions et coûts pour y accéder.
export const RANKS = [
  { name: 'Hameau', level: 1, pop: 0, cost: {} },
  { name: 'Village', level: 4, pop: 30, cost: { coins: 500, wood: 120, stone: 80 } },
  { name: 'Bourg', level: 8, pop: 100, cost: { coins: 1500, wood: 200, stone: 200, planks: 80 } },
  { name: 'Petite ville', level: 13, pop: 250, cost: { coins: 4000, stone: 300, planks: 200, bricks: 120 } },
  { name: 'Ville', level: 18, pop: 500, cost: { coins: 9000, planks: 350, bricks: 300, tools: 60 } },
  { name: 'Grande ville', level: 24, pop: 900, cost: { coins: 18000, planks: 500, bricks: 600, tools: 150 } },
  { name: 'Cité', level: 30, pop: 1500, cost: { coins: 35000, stone: 1000, bricks: 1000, tools: 300 } },
  { name: 'Métropole', level: 38, pop: 2500, cost: { coins: 70000, planks: 1500, bricks: 1800, tools: 600 } },
  { name: 'Capitale', level: 55, pop: 3500, cost: { coins: 140000, planks: 2500, bricks: 3000, tools: 1200 } },
  { name: 'Mégapole', level: 75, pop: 5000, cost: { coins: 260000, planks: 4000, bricks: 5000, tools: 2200 } },
];

/** Niveau de mairie requis pour qu'un bâtiment atteigne un niveau donné (index = niveau). */
export const MAIRIE_FOR_LEVEL = [0, 1, 1, 2, 4, 5];

/** Prix de la n-ième zone achetée (n = 0 pour la première) : 120 zones à conquérir. */
export function zoneCost(n) {
  return Math.round((300 + 380 * Math.pow(n, 1.35)) / 50) * 50;
}

/** Niveau de village requis pour acheter la n-ième zone. */
export function zoneLevelReq(n) {
  return Math.min(95, 2 + Math.floor(n * 0.8));
}

// Fonctionnalités débloquées avec le niveau du village
export const FEATURES = {
  missions: { level: 2, name: 'Missions du jour', icon: '📅' },
  orders: { level: 3, name: 'Tableau des commandes', icon: '📜' },
  events: { level: 4, name: 'Événements du village', icon: '🎉' },
  trade: { level: 5, name: 'Comptoir de négoce (acheter et vendre des marchandises)', icon: '⚖️' },
  fires: { level: 6, name: 'Incendies (pense aux pompiers !)', icon: '🔥' },
  workshops: { level: 7, name: 'Ateliers et recettes', icon: '🛠️' },
  city: { level: 8, name: 'Développer : quartiers, projets et région', icon: '🏙️' },
  urbanist: { level: 10, name: 'Mode urbaniste (déplacer un quartier entier)', icon: '📐' },
  market: { level: 12, name: 'Marchés régionaux', icon: '🏪' },
  tourism: { level: 14, name: 'Parc des Merveilles et festivals', icon: '🎡' },
  coop: { level: 16, name: 'Coopératives et aventures en équipe', icon: '⚖️' },
};

export function levelReward(level) {
  const r = { coins: 40 * level };
  if (level % 5 === 0) {
    r.wood = Math.min(1000, 20 * level);
    r.stone = Math.min(800, 10 * level);
  }
  if (level % 10 === 0) r.gems = level >= 50 ? 20 : 10; // gemmes tous les 10 niveaux
  return r;
}

export const MAYOR_TITLES = [
  { level: 1, title: 'Maire débutant' },
  { level: 5, title: 'Maire du hameau' },
  { level: 10, title: 'Maire apprécié' },
  { level: 15, title: 'Bâtisseur confirmé' },
  { level: 20, title: 'Grand bâtisseur' },
  { level: 30, title: 'Urbaniste de génie' },
  { level: 40, title: 'Bâtisseur de légende' },
  { level: 50, title: 'Légende vivante' },
  { level: 60, title: 'Visionnaire' },
  { level: 70, title: 'Architecte du siècle' },
  { level: 80, title: 'Seigneur des cités' },
  { level: 90, title: 'Empereur bâtisseur' },
  { level: 100, title: 'Bâtisseur éternel' },
];

export function mayorTitle(level) {
  let t = MAYOR_TITLES[0].title;
  for (const m of MAYOR_TITLES) if (level >= m.level) t = m.title;
  return t;
}
