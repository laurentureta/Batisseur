// Catalogue des bâtiments : coûts, niveaux, production, services, bonus.
// Les coûts sont donnés par niveau : costs[0] = construction, costs[n] = passage au niveau n+1.

import { costValue } from './resources.js';
import { round5 } from '../core/util.js';
import { RANKS } from './progression.js';

export const CATEGORIES = [
  { id: 'roads', name: 'Routes', icon: '🛣️' },
  { id: 'housing', name: 'Habitations', icon: '🏠' },
  { id: 'production', name: 'Production', icon: '🌾' },
  { id: 'commerce', name: 'Commerces', icon: '🛒' },
  { id: 'services', name: 'Services', icon: '🏛️' },
  { id: 'decor', name: 'Décors', icon: '🌳' },
  { id: 'monuments', name: 'Monuments', icon: '🏰' },
  { id: 'exclusive', name: 'Exclusifs', icon: '⭐' },
];

// Besoins des habitants (couverture par les services)
export const NEEDS = {
  water: { name: 'Eau', icon: '💧' },
  commerce: { name: 'Commerces', icon: '🛒' },
  leisure: { name: 'Loisirs', icon: '🎡' },
  education: { name: 'Éducation', icon: '🎓' },
  health: { name: 'Santé', icon: '⚕️' },
  security: { name: 'Sécurité', icon: '🛡️' },
  paved: { name: 'Route pavée', icon: '🛣️' },
};
export const COVER_NAMES = { ...NEEDS, fire: { name: 'Pompiers', icon: '🚒' } };

export const ROAD_TYPES = {
  1: {
    id: 'path', type: 1, name: 'Chemin de terre', icon: '🟫', unlock: 1, cat: 'roads',
    cost: { coins: 2 }, bridgeCost: { coins: 20, wood: 5 },
    desc: 'Relie tes bâtiments à la mairie. Pas cher, parfait pour débuter.',
  },
  2: {
    id: 'paved', type: 2, name: 'Route pavée', icon: '⬛', unlock: 6, cat: 'roads',
    cost: { coins: 6, stone: 1 }, upgradeCost: { coins: 4, stone: 1 }, bridgeCost: { coins: 35, stone: 6 },
    desc: 'Plus belle, les voitures y roulent. Indispensable aux villas et immeubles.',
  },
  3: {
    id: 'gravel', type: 3, name: 'Sentier de gravier', icon: '🟫', unlock: 10, cat: 'roads', paved: false,
    cost: { coins: 4, stone: 1 }, bridgeCost: { coins: 25, wood: 5, stone: 2 },
    desc: 'Un sentier clair pour les jardins, fermes et quartiers champêtres.',
  },
  4: {
    id: 'cobbles', type: 4, name: 'Rue en pavés', icon: '⬛', unlock: 16, cat: 'roads', paved: true,
    cost: { coins: 9, stone: 2 }, upgradeCost: { coins: 6, stone: 2 }, bridgeCost: { coins: 45, stone: 8 },
    desc: 'Des pavés de pierre élégants, accessibles aux voitures.',
  },
  5: {
    id: 'promenade', type: 5, name: 'Allée paysagée', icon: '🟫', unlock: 24, cat: 'roads', paved: false,
    cost: { coins: 10, stone: 2, wood: 1 }, bridgeCost: { coins: 55, stone: 8, wood: 3 },
    desc: 'Une promenade piétonne bordée de pierre et de verdure.',
  },
  6: {
    id: 'avenue', type: 6, name: 'Grande avenue', icon: '⬛', unlock: 36, cat: 'roads', paved: true,
    cost: { coins: 18, stone: 3, bricks: 1 }, upgradeCost: { coins: 12, stone: 2, bricks: 1 }, bridgeCost: { coins: 70, stone: 10, bricks: 3 },
    desc: 'Large chaussée, marquage doré et lampadaires prestigieux.',
  },
};
/** Une route carrossable donne accès aux voitures et aux bâtiments exigeant le pavage. */
export const isPavedRoad = (type) => type === 2 || type === 4 || type === 6;
export const BRIDGE_UNLOCK = 8;

// Multiplicateurs par niveau (index = niveau - 1)
export const PROD_MULT = [1, 1.6, 2.3, 3.1, 4];
export const WORKER_MULT = [1, 1.5, 2, 2.5, 3];
export const INCOME_MULT = [1, 1.4, 1.8, 2.3, 2.8];
export function prodMult(level) {
  return PROD_MULT[Math.min(level, 5) - 1];
}

/** Génère les coûts d'amélioration à partir du coût de construction. */
function upgrades(base, maxLevel) {
  const v = Math.max(150, costValue(base));
  const out = [base];
  for (let L = 2; L <= maxLevel; L++) {
    const c = {};
    if (L === 2) Object.assign(c, { coins: round5(v * 0.9), wood: round5(v * 0.12), stone: round5(v * 0.08) });
    if (L === 3) Object.assign(c, { coins: round5(v * 1.8), stone: round5(v * 0.12), planks: round5(v * 0.07) });
    if (L === 4) Object.assign(c, { coins: round5(v * 3.5), planks: round5(v * 0.1), bricks: round5(v * 0.07) });
    if (L === 5) Object.assign(c, { coins: round5(v * 7), bricks: round5(v * 0.12), tools: round5(v * 0.03) });
    out.push(c);
  }
  return out;
}

const LIST = [];
function def(d) {
  d.maxLevel = d.maxLevel || 1;
  d.size = d.size || [1, 1];
  if (!d.costs) d.costs = upgrades(d.cost, d.maxLevel);
  LIST.push(d);
}

/* ───────────── Habitations ───────────── */
def({
  id: 'house', name: 'Maison', icon: '🏠', cat: 'housing', unlock: 1, maxLevel: 5,
  levelNames: ['Cabane', 'Chaumière', 'Maison en pierre', 'Villa', 'Immeuble'],
  costs: [
    { coins: 30, wood: 10 },
    { coins: 60, wood: 20, stone: 10 },
    { coins: 150, wood: 30, stone: 30, planks: 15 },
    { coins: 400, stone: 40, planks: 40, bricks: 30 },
    { coins: 900, planks: 60, bricks: 70, tools: 20 },
  ],
  residents: [2, 4, 8, 14, 24],
  tax: [6, 6.5, 7, 7.5, 8],
  upgradeNeeds: [
    [],
    ['water'],
    ['water', 'commerce', 'leisure'],
    ['water', 'commerce', 'leisure', 'education', 'health', 'paved'],
    ['water', 'commerce', 'leisure', 'education', 'health', 'security', 'paved'],
  ],
  xp: 3,
  desc: 'Loge des habitants qui paient des impôts. Améliore-la pour accueillir plus de monde.',
});
def({
  id: 'manor', name: 'Manoir', icon: '🏰', cat: 'housing', unlock: 25, maxLevel: 3, size: [2, 2],
  levelNames: ['Manoir', 'Grand manoir', 'Palais'],
  costs: [
    { coins: 5000, planks: 200, bricks: 300, tools: 50 },
    { coins: 9000, bricks: 500, tools: 120 },
    { coins: 16000, bricks: 800, tools: 250 },
  ],
  residents: [45, 70, 100],
  tax: [11, 12, 13],
  needsToGrow: ['water', 'commerce', 'leisure', 'education', 'health', 'security', 'paved'],
  upgradeNeeds: [[], ['water', 'commerce', 'leisure', 'education', 'health', 'security', 'paved'], ['water', 'commerce', 'leisure', 'education', 'health', 'security', 'paved']],
  desc: 'Résidence de luxe. Les habitants ne viennent que si tous les besoins sont couverts.',
});

/* ───────────── Production ───────────── */
def({
  id: 'garden', name: 'Potager', icon: '🥕', cat: 'production', unlock: 1, maxLevel: 3,
  cost: { coins: 40, wood: 10 }, workers: 1, produces: { food: 15 }, seasonal: 'garden',
  desc: 'Produit un peu de nourriture. Moins efficace en hiver.',
});
def({
  id: 'lumber', name: 'Bûcheron', icon: '🪓', cat: 'production', unlock: 1, maxLevel: 5,
  cost: { coins: 50, wood: 10 }, workers: 2, produces: { wood: 40 },
  near: { types: ['forest'], radius: 3, sat: 6, label: 'forêt' },
  desc: 'Coupe du bois. Place-le près d\'une forêt : plus il y a d\'arbres autour, plus il produit.',
});
def({
  id: 'quarry', name: 'Carrière', icon: '⛏️', cat: 'production', unlock: 2, maxLevel: 5,
  cost: { coins: 80, wood: 25 }, workers: 3, produces: { stone: 25 },
  near: { types: ['rock', 'mountain'], radius: 3, sat: 4, label: 'rochers ou montagne' },
  pollution: { v: 0.08, r: 3 },
  desc: 'Extrait de la pierre. Doit être près de rochers ou d\'une montagne.',
});
def({
  id: 'fisher', name: 'Pêcheur', icon: '🎣', cat: 'production', unlock: 3, maxLevel: 4,
  cost: { coins: 70, wood: 30 }, workers: 2, produces: { food: 30 }, seasonal: 'fish',
  near: { types: ['water', 'deep'], radius: 2, sat: 4, label: 'eau' },
  desc: 'Pêche du poisson pour nourrir le village. Doit être au bord de l\'eau.',
});
def({
  id: 'farm', name: 'Ferme', icon: '🚜', cat: 'production', unlock: 3, maxLevel: 5, size: [2, 2],
  cost: { coins: 150, wood: 50 }, workers: 3, produces: { wheat: 40 }, seasonal: 'farm',
  desc: 'Cultive du blé. Récolte au top en été, presque rien en hiver.',
});
def({
  id: 'coop', name: 'Poulailler', icon: '🐔', cat: 'production', unlock: 2, maxLevel: 3,
  cost: { coins: 60, wood: 25 }, workers: 1, produces: { food: 22 },
  desc: 'Des poules qui picorent dans leur enclos. L\'éleveuse les nourrit, ramasse les œufs et les rapporte au village.',
});
def({
  id: 'pasture', name: 'Étable', icon: '🐄', cat: 'production', unlock: 5, maxLevel: 4, size: [2, 2],
  cost: { coins: 220, wood: 60, stone: 20 }, workers: 2, produces: { food: 55 },
  desc: 'Vaches et moutons au pré. Les éleveurs apportent le foin, remplissent l\'abreuvoir, traient les vaches et rapportent le lait.',
});
def({
  id: 'mill', name: 'Moulin', icon: '🌀', cat: 'production', unlock: 4, maxLevel: 5,
  cost: { coins: 180, wood: 40, stone: 25 }, workers: 2, consumes: { wheat: 40 }, produces: { flour: 40 },
  desc: 'Transforme le blé en farine.',
});
def({
  id: 'bakery', name: 'Boulangerie', icon: '🥖', cat: 'production', unlock: 5, maxLevel: 5,
  cost: { coins: 220, wood: 40, stone: 35 }, workers: 2, consumes: { flour: 30 }, produces: { food: 60 },
  desc: 'Fait du pain avec la farine : la meilleure source de nourriture.',
});
def({
  id: 'sawmill', name: 'Scierie', icon: '🪚', cat: 'production', unlock: 6, maxLevel: 5,
  cost: { coins: 250, wood: 60, stone: 40 }, workers: 3, consumes: { wood: 30 }, produces: { planks: 30 },
  pollution: { v: 0.04, r: 2 },
  desc: 'Découpe le bois en planches, nécessaires aux améliorations.',
});
def({
  id: 'claypit', name: 'Argilière', icon: '🏺', cat: 'production', unlock: 7, maxLevel: 5,
  cost: { coins: 220, wood: 50, planks: 15 }, workers: 2, produces: { clay: 25 },
  near: { types: ['water', 'sand', 'deep'], radius: 2, sat: 3, label: 'eau ou sable' },
  desc: 'Extrait de l\'argile. Doit être près de l\'eau ou du sable.',
});
def({
  id: 'brickworks', name: 'Briqueterie', icon: '🧱', cat: 'production', unlock: 8, maxLevel: 5,
  cost: { coins: 350, stone: 60, planks: 30 }, workers: 3, consumes: { clay: 25 }, produces: { bricks: 20 },
  pollution: { v: 0.14, r: 4 },
  desc: 'Cuit l\'argile pour faire des briques. Un peu polluante.',
});
def({
  id: 'mine', name: 'Mine de fer', icon: '⚒️', cat: 'production', unlock: 12, maxLevel: 5,
  cost: { coins: 600, stone: 80, planks: 60 }, workers: 4, produces: { iron: 15 },
  near: { types: ['mountain'], radius: 2, sat: 3, label: 'montagne' },
  pollution: { v: 0.12, r: 3 },
  desc: 'Extrait du minerai de fer. Doit être au pied d\'une montagne.',
});
def({
  id: 'forge', name: 'Forge', icon: '🔨', cat: 'production', unlock: 14, maxLevel: 5,
  cost: { coins: 800, stone: 80, bricks: 60 }, workers: 3, consumes: { iron: 10, wood: 10 }, produces: { tools: 10 },
  pollution: { v: 0.16, r: 4 },
  desc: 'Fabrique des outils avec du fer et du bois. Pollue le voisinage.',
});

/* ───────────── Commerces ───────────── */
def({
  id: 'market', name: 'Marché', icon: '🧺', cat: 'commerce', unlock: 2, maxLevel: 3,
  cost: { coins: 100, wood: 30 }, workers: 2,
  coverage: { need: 'commerce', radius: [5, 6, 7] }, income: { base: 20, perRes: 0.5, radius: 5 },
  desc: 'Rapporte des pièces et couvre le besoin de commerces autour.',
});
def({
  id: 'tavern', name: 'Taverne', icon: '🍺', cat: 'commerce', unlock: 4, maxLevel: 4,
  cost: { coins: 200, wood: 50, stone: 20 }, workers: 3,
  coverage: { need: 'leisure', radius: [5, 6, 7, 8] }, income: { base: 25, perRes: 0.4, radius: 5 },
  desc: 'Lieu de détente : couvre les loisirs et rapporte des pièces.',
});
def({
  id: 'shop', name: 'Boutique', icon: '🛍️', cat: 'commerce', unlock: 10, maxLevel: 5,
  cost: { coins: 450, planks: 40, bricks: 20 }, workers: 3,
  coverage: { need: 'commerce', radius: [6, 7, 8, 9, 10] }, income: { base: 60, perRes: 0.8, radius: 7 },
  desc: 'Grand rayon de commerce et bons revenus.',
});
def({
  id: 'mall', name: 'Grand magasin', icon: '🏬', cat: 'commerce', unlock: 18, maxLevel: 3, size: [2, 2],
  cost: { coins: 3000, planks: 150, bricks: 200, tools: 20 }, workers: 10,
  coverage: { need: 'commerce', radius: [12, 14, 16] }, income: { base: 300, perRes: 1.2, radius: 12 },
  desc: 'Énorme zone de commerce et revenus importants.',
});

/* ───────────── Services ───────────── */
def({
  id: 'well', name: 'Puits', icon: '🪣', cat: 'services', unlock: 1, maxLevel: 3,
  cost: { coins: 40, stone: 5 }, coverage: { need: 'water', radius: [3.5, 4.5, 5.5] },
  desc: 'Donne de l\'eau aux maisons proches. Nécessaire pour les améliorer.',
});
def({
  id: 'depot', name: 'Grand Entrepôt', icon: '📦', cat: 'services', unlock: 2, maxLevel: 10, size: [2, 2], unique: true,
  levelNames: ['Remise', 'Grange à provisions', 'Entrepôt', 'Entrepôt en pierre', 'Grand entrepôt', 'Halle aux marchandises', 'Docks du village', 'Grands docks', 'Entrepôt royal', 'Cité des réserves'],
  costs: [
    { coins: 120, wood: 40 },
    { coins: 300, wood: 90, stone: 30 },
    { coins: 650, wood: 140, stone: 90 },
    { coins: 1200, stone: 160, planks: 60 },
    { coins: 2200, stone: 200, planks: 140, bricks: 40 },
    { coins: 3600, planks: 220, bricks: 150 },
    { coins: 5500, planks: 260, bricks: 260, tools: 30 },
    { coins: 8500, bricks: 400, tools: 70 },
    { coins: 12500, bricks: 560, tools: 120 },
    { coins: 18000, bricks: 760, tools: 180 },
  ],
  workers: 1, storage: [400, 800, 1300, 1900, 2700, 3700, 5000, 6600, 8600, 11000], upkeep: 3,
  levelReq: [2, 4, 7, 10, 15, 22, 30, 42, 55, 70], // niveau du village pour chaque niveau d'entrepôt
  desc: 'Le seul bâtiment de stockage du village : toutes les marchandises y sont rangées. Chaque amélioration agrandit le stock de tout.',
});
def({
  id: 'school', name: 'École', icon: '🎓', cat: 'services', unlock: 5, maxLevel: 5,
  cost: { coins: 400, wood: 80, stone: 60 }, workers: 3, coverage: { need: 'education', radius: [6, 7, 8, 9, 10] }, upkeep: 15,
  desc: 'Éduque les enfants du quartier. Nécessaire aux villas.',
});
def({
  id: 'clinic', name: 'Dispensaire', icon: '⚕️', cat: 'services', unlock: 6, maxLevel: 4,
  cost: { coins: 450, wood: 60, stone: 80 }, workers: 2, coverage: { need: 'health', radius: [5, 6, 7, 8] }, upkeep: 15,
  desc: 'Soigne les habitants. Nécessaire aux villas.',
});
def({
  id: 'firestation', name: 'Caserne de pompiers', icon: '🚒', cat: 'services', unlock: 7, maxLevel: 5,
  cost: { coins: 500, stone: 80, planks: 30 }, workers: 3, coverage: { need: 'fire', radius: [6, 7, 8, 9, 10] }, upkeep: 18,
  desc: 'Réduit les risques d\'incendie et éteint les feux automatiquement.',
});
def({
  id: 'police', name: 'Gendarmerie', icon: '🛡️', cat: 'services', unlock: 8, maxLevel: 5,
  cost: { coins: 550, stone: 90, planks: 40 }, workers: 3, coverage: { need: 'security', radius: [6, 7, 8, 9, 10] }, upkeep: 18,
  desc: 'Assure la sécurité. Nécessaire aux immeubles.',
});
def({
  id: 'watertower', name: 'Château d\'eau', icon: '🗼', cat: 'services', unlock: 14, maxLevel: 3,
  cost: { coins: 900, planks: 40, bricks: 80 }, workers: 2, coverage: { need: 'water', radius: [9, 11, 13] }, upkeep: 12,
  desc: 'Alimente en eau tout un quartier.',
});
def({
  id: 'hospital', name: 'Hôpital', icon: '🏥', cat: 'services', unlock: 16, maxLevel: 3, size: [2, 2],
  cost: { coins: 4000, planks: 150, bricks: 250, tools: 40 }, workers: 10, coverage: { need: 'health', radius: [14, 16, 18] }, upkeep: 60,
  desc: 'Couvre la santé d\'une grande partie de la ville.',
});

/* ───────────── Décors ───────────── */
def({
  id: 'tree', name: 'Arbre', icon: '🌳', cat: 'decor', unlock: 1,
  cost: { coins: 8 }, beauty: { v: 0.03, r: 2 }, xp: 1,
  desc: 'Embellit le quartier.',
});
def({
  id: 'forest', name: 'Planter une forêt', icon: '🌲', cat: 'decor', unlock: 2,
  cost: { coins: 15 }, plantsTerrain: 'forest', xp: 1,
  desc: 'Transforme une case de prairie en forêt : idéal pour nourrir tes bûcherons.',
});
def({
  id: 'flowers', name: 'Parterre de fleurs', icon: '🌷', cat: 'decor', unlock: 1,
  cost: { coins: 15 }, beauty: { v: 0.05, r: 2 }, xp: 1,
  desc: 'Des fleurs colorées qui rendent les voisins heureux.',
});
def({
  id: 'bench', name: 'Banc', icon: '🪑', cat: 'decor', unlock: 2,
  cost: { coins: 20, wood: 5 }, beauty: { v: 0.03, r: 2 }, coverage: { need: 'leisure', radius: [1.5] }, xp: 1,
  desc: 'Un petit coin de repos (loisirs juste à côté).',
});
def({
  id: 'fountain', name: 'Fontaine', icon: '⛲', cat: 'decor', unlock: 4,
  cost: { coins: 120, stone: 30 }, beauty: { v: 0.08, r: 3 }, coverage: { need: 'leisure', radius: [3] },
  desc: 'Embellit la place et offre un peu de loisirs.',
});
def({
  id: 'park', name: 'Parc', icon: '🏞️', cat: 'decor', unlock: 7, maxLevel: 3, size: [2, 2],
  cost: { coins: 300, wood: 40, stone: 20 }, beauty: { v: 0.1, r: 4 }, coverage: { need: 'leisure', radius: [6, 8, 10] }, upkeep: 4,
  desc: 'Un grand espace vert : loisirs et beauté pour tout le quartier.',
});
def({
  id: 'statue', name: 'Statue', icon: '🗽', cat: 'decor', unlock: 10,
  cost: { coins: 500, stone: 100, bricks: 20 }, beauty: { v: 0.12, r: 4 },
  desc: 'Une belle statue sur la place.',
});
def({
  id: 'bandstand', name: 'Kiosque à musique', icon: '🎶', cat: 'decor', unlock: 16,
  cost: { coins: 1200, planks: 80, bricks: 40 }, beauty: { v: 0.12, r: 5 }, coverage: { need: 'leisure', radius: [8] },
  desc: 'Concerts le dimanche : beauté et loisirs.',
});

/* ───────────── Monuments (uniques) ───────────── */
def({
  id: 'clocktower', name: 'Tour de l\'horloge', icon: '🕰️', cat: 'monuments', unlock: 12, unique: true,
  cost: { coins: 2500, stone: 300, planks: 120, bricks: 60 }, beauty: { v: 0.15, r: 8 }, bonus: { taxes: 0.05 },
  desc: 'Fierté du village : +5 % d\'impôts et beaucoup de beauté.',
});
def({
  id: 'stadium', name: 'Stade', icon: '🏟️', cat: 'monuments', unlock: 18, unique: true, size: [3, 3],
  cost: { coins: 8000, planks: 300, bricks: 400, tools: 60 }, workers: 6, upkeep: 40,
  coverage: { need: 'leisure', radius: [16] }, income: { base: 200, perRes: 0, radius: 0 }, bonus: { happiness: 0.05 },
  desc: 'Matchs tous les week-ends : +5 % de bonheur, loisirs pour toute la ville.',
});
def({
  id: 'station', name: 'Gare', icon: '🚉', cat: 'monuments', unlock: 22, unique: true, size: [3, 2],
  cost: { coins: 12000, planks: 400, bricks: 500, tools: 120 }, workers: 8, bonus: { tourism: 400 },
  desc: 'Les touristes arrivent : jusqu\'à 400 pièces par jour selon le bonheur.',
});
def({
  id: 'lighthouse', name: 'Phare', icon: '🗼', cat: 'monuments', unlock: 26, unique: true,
  cost: { coins: 6000, stone: 400, bricks: 200, tools: 50 }, beauty: { v: 0.1, r: 5 }, bonus: { fishers: 0.3 },
  near: { types: ['water', 'deep'], radius: 1, sat: 1, label: 'eau' },
  desc: 'Guide les bateaux : +30 % de pêche. Se construit au bord de l\'eau.',
});
def({
  id: 'castle', name: 'Château', icon: '🏰', cat: 'monuments', unlock: 30, unique: true, size: [3, 3],
  cost: { coins: 30000, stone: 1500, bricks: 800, tools: 200 }, beauty: { v: 0.25, r: 10 }, bonus: { happiness: 0.08, taxes: 0.08 },
  desc: 'Le joyau de la ville : +8 % de bonheur et d\'impôts.',
});
def({
  id: 'arch', name: 'Arc de triomphe', icon: '🏛️', cat: 'monuments', unlock: 40, unique: true, size: [2, 1],
  cost: { coins: 60000, stone: 2500, bricks: 1200, tools: 400 }, beauty: { v: 0.3, r: 12 }, bonus: { taxes: 0.1 },
  desc: 'Un monument légendaire : +10 % d\'impôts.',
});

/* ───────────── Prestige : décorations et monuments des hauts niveaux (45 → 100) ───────────── */
def({
  id: 'ferris', name: 'Grande roue', icon: '🎡', cat: 'decor', unlock: 45, size: [2, 2],
  cost: { coins: 14000, planks: 300, tools: 80 }, beauty: { v: 0.16, r: 6 }, coverage: { need: 'leisure', radius: [9] }, xp: 400,
  desc: 'Elle tourne pour de vrai ! Les habitants viennent admirer la ville d\'en haut : beauté et loisirs.',
});
def({
  id: 'equestrian', name: 'Statue équestre', icon: '🐎', cat: 'decor', unlock: 50,
  cost: { coins: 12000, stone: 400, tools: 60 }, beauty: { v: 0.15, r: 5 }, xp: 350,
  desc: 'Le fondateur du village à cheval, en bronze, sur son grand socle de pierre.',
});
def({
  id: 'frgarden', name: 'Jardin à la française', icon: '🌹', cat: 'decor', unlock: 55, size: [2, 2],
  cost: { coins: 18000, stone: 400, planks: 250 }, beauty: { v: 0.2, r: 7 }, coverage: { need: 'leisure', radius: [8] }, xp: 450,
  desc: 'Allées de gravier, buis taillés, roses et bassin : le plus beau jardin de la région.',
});
def({
  id: 'opera', name: 'Opéra', icon: '🎭', cat: 'monuments', unlock: 60, unique: true, size: [3, 2],
  cost: { coins: 90000, stone: 3000, bricks: 2000, tools: 600 }, beauty: { v: 0.3, r: 12 }, coverage: { need: 'leisure', radius: [18] },
  bonus: { happiness: 0.06, tourism: 600 }, xp: 1500,
  desc: 'Colonnes, dôme doré et grands soirs : +6 % de bonheur, loisirs pour tout un quartier et des touristes.',
});
def({
  id: 'goldkiosk', name: 'Kiosque doré', icon: '✨', cat: 'decor', unlock: 65,
  cost: { coins: 22000, bricks: 300, tools: 120 }, beauty: { v: 0.18, r: 6 }, coverage: { need: 'leisure', radius: [6] }, xp: 500,
  desc: 'Un kiosque octogonal à colonnes, coiffé d\'or. Il s\'illumine la nuit.',
});
def({
  id: 'grandfountain', name: 'Fontaine monumentale', icon: '⛲', cat: 'decor', unlock: 70, size: [2, 2],
  cost: { coins: 30000, stone: 1200, tools: 150 }, beauty: { v: 0.24, r: 8 }, coverage: { need: 'water', radius: [8] }, xp: 650,
  desc: 'Trois vasques, des jets d\'eau et une statue d\'or : la place devient magnifique (et donne de l\'eau).',
});
def({
  id: 'planetarium', name: 'Planétarium', icon: '🔭', cat: 'monuments', unlock: 75, unique: true, size: [2, 2],
  cost: { coins: 140000, bricks: 3500, tools: 1200 }, beauty: { v: 0.26, r: 10 }, coverage: { need: 'education', radius: [16] },
  bonus: { tourism: 900, happiness: 0.04 }, xp: 2200,
  desc: 'Son grand dôme montre les étoiles : éducation pour toute la ville, +4 % de bonheur, touristes.',
});
def({
  id: 'citygate', name: 'Porte de la ville', icon: '🏯', cat: 'decor', unlock: 80, size: [2, 1],
  cost: { coins: 40000, stone: 1800, tools: 200 }, beauty: { v: 0.24, r: 8 }, xp: 800,
  desc: 'Deux tours crénelées et une grande arche : l\'entrée majestueuse de ta cité.',
});
def({
  id: 'goldtower', name: 'Tour dorée', icon: '🗼', cat: 'decor', unlock: 85,
  cost: { coins: 50000, bricks: 1500, tools: 300 }, beauty: { v: 0.22, r: 8 }, xp: 900,
  desc: 'Une flèche élancée, quatre horloges et une pointe en or qui brille au soleil.',
});
def({
  id: 'colosseum', name: 'Colisée', icon: '🏟️', cat: 'monuments', unlock: 90, unique: true, size: [3, 3],
  cost: { coins: 220000, stone: 6000, bricks: 4000, tools: 1800 }, beauty: { v: 0.35, r: 14 }, coverage: { need: 'leisure', radius: [24] },
  bonus: { tourism: 1400, happiness: 0.05 }, xp: 3500,
  desc: 'Une arène antique de trois étages d\'arches : loisirs pour toute la ville et des foules de touristes.',
});
def({
  id: 'mayorstatue', name: 'Statue géante du maire', icon: '🗽', cat: 'decor', unlock: 95, size: [2, 2],
  cost: { coins: 80000, stone: 2500, tools: 500 }, beauty: { v: 0.3, r: 10 }, xp: 1200,
  desc: 'Toi, en or, marteau levé, sur un socle de marbre : le village ne t\'oubliera jamais.',
});
def({
  id: 'palace', name: 'Palais du Bâtisseur', icon: '👑', cat: 'monuments', unlock: 100, unique: true, size: [3, 3],
  cost: { coins: 400000, bricks: 8000, tools: 3000 }, beauty: { v: 0.4, r: 16 }, bonus: { taxes: 0.15, happiness: 0.1, tourism: 2000 }, xp: 6000,
  desc: 'Le sommet de ta carrière : un palais aux toits d\'or. +15 % d\'impôts, +10 % de bonheur, des touristes du monde entier.',
});

/* ───────────── Décorations exclusives (boutique, coffres, passe de combat) ───────────── */
function excl(id, name, icon, beauty, r, extra = {}) {
  def({ id, name, icon, cat: 'decor', tab: 'exclusive', exclusive: true, unlock: 1, cost: { coins: extra.price ?? 40 }, beauty: { v: beauty, r }, xp: 2, ...extra });
}
// Saison 1 : La Nuit des Citrouilles
excl('x_pumpkins', 'Carré de citrouilles', '🎃', 0.07, 3, { desc: 'Des citrouilles et une lanterne-citrouille qui brille la nuit.' });
excl('x_lantern', 'Lanterne hantée', '🏮', 0.06, 3, { desc: 'Une lanterne qui éclaire la rue d\'une lueur orangée.' });
excl('x_haunted_tree', 'Arbre ensorcelé', '🌳', 0.09, 3, { desc: 'Un vieil arbre décoré de lanternes et de crânes.' });
excl('x_gate', 'Portail gothique', '⛩️', 0.1, 4, { size: [2, 1], price: 80, desc: 'Une grande arche de pierre avec sa grille en fer forgé.' });
excl('x_crypt', 'Crypte mystérieuse', '⚰️', 0.14, 5, { size: [2, 2], price: 150, coverage: { need: 'leisure', radius: [6] }, desc: 'Une crypte qui attire les curieux : beauté et loisirs.' });
excl('x_candles', 'Autel aux mille bougies', '🕯️', 0.1, 4, { price: 60, desc: 'Un autel de pierre couvert de bougies allumées.' });
// Saison 2 : L'Hiver Royal
excl('x_snowman', 'Bonhomme de neige', '☃️', 0.06, 3, { desc: 'Il ne fond jamais, même en été !' });
excl('x_gifts', 'Montagne de cadeaux', '🎁', 0.06, 3, { desc: 'Des paquets colorés empilés au pied du sapin.' });
excl('x_xmas_tree', 'Grand sapin illuminé', '🎄', 0.12, 4, { price: 80, desc: 'Un immense sapin couvert de guirlandes lumineuses.' });
excl('x_sleigh', 'Traîneau du Père Noël', '🛷', 0.08, 3, { desc: 'Un traîneau rouge chargé de cadeaux.' });
excl('x_ice_rink', 'Patinoire', '⛸️', 0.12, 5, { size: [2, 2], price: 150, coverage: { need: 'leisure', radius: [7] }, desc: 'Une patinoire illuminée : beauté et loisirs.' });
excl('x_star_lamp', 'Lampadaire étoilé', '⭐', 0.07, 3, { desc: 'Un lampadaire surmonté d\'une étoile dorée.' });
// Saison 3 : Le Printemps Fleuri
excl('x_tulips', 'Champ de tulipes', '🌷', 0.07, 3, { desc: 'Des rangées de tulipes de toutes les couleurs.' });
excl('x_beehive', 'Ruches', '🐝', 0.06, 3, { desc: 'Des ruches en bois au milieu des fleurs.' });
excl('x_cherry_tree', 'Cerisier en fleurs', '🌸', 0.09, 3, { desc: 'Un cerisier rose qui fleurit toute l\'année.' });
excl('x_flower_arch', 'Arche fleurie', '💐', 0.1, 4, { size: [2, 1], price: 80, desc: 'Une arche de pierre couverte de fleurs.' });
excl('x_hedge_maze', 'Labyrinthe de haies', '🌿', 0.13, 5, { size: [2, 2], price: 150, coverage: { need: 'leisure', radius: [7] }, desc: 'Un labyrinthe de verdure : beauté et loisirs.' });
excl('x_birdbath', 'Fontaine aux oiseaux', '🐦', 0.08, 3, { desc: 'Une petite fontaine où les oiseaux viennent boire.' });
// Saison 4 : L'Âge d'Or
excl('x_gold_coins', 'Coffre au trésor', '💰', 0.07, 3, { desc: 'Un coffre débordant de pièces d\'or.' });
excl('x_banners', 'Allée de bannières', '🚩', 0.05, 3, { desc: 'Des bannières colorées qui flottent au vent.' });
excl('x_gold_statue', 'Statue d\'or', '🗿', 0.12, 4, { price: 100, desc: 'La statue dorée du maire, rien que ça.' });
excl('x_obelisk', 'Obélisque', '🗼', 0.1, 4, { price: 80, desc: 'Une haute aiguille de pierre gravée.' });
excl('x_royal_fountain', 'Fontaine royale', '⛲', 0.15, 6, { size: [2, 2], price: 200, coverage: { need: 'leisure', radius: [6] }, desc: 'Une fontaine monumentale aux reflets dorés.' });
excl('x_throne', 'Trône du roi', '🪑', 0.1, 4, { price: 80, desc: 'Un trône doré sous un dais royal.' });
// Boutique
excl('x_camp', 'Campement', '⛺', 0.04, 2, { desc: 'Une tente, des tonneaux et un feu de camp.' });
excl('x_grove', 'Bosquet', '🌲', 0.06, 3, { desc: 'Un petit bois touffu.' });
excl('x_fruit_cart', 'Charrette de fruits', '🍎', 0.05, 2, { desc: 'Une brouette pleine de fruits frais.' });
excl('x_archery', 'Pas de tir à l\'arc', '🎯', 0.05, 3, { coverage: { need: 'leisure', radius: [3] }, desc: 'Des cibles pour s\'entraîner : un peu de loisirs.' });
excl('x_mini_mill', 'Moulin décoratif', '🌀', 0.08, 3, { price: 60, desc: 'Un joli petit moulin dont les ailes tournent.' });
excl('x_watchtower', 'Tour de guet', '🏯', 0.08, 4, { price: 100, desc: 'Une tour en pierre surmontée d\'un drapeau.' });
excl('x_catapult', 'Catapulte', '🏹', 0.09, 4, { price: 120, desc: 'Une catapulte sur sa tour, pour impressionner les voisins.' });

// Événements de la semaine : décorations exclusives gagnées pendant les fêtes (jamais dans les coffres)
function evdec(id, name, icon, beauty, r, extra = {}) {
  def({ id, name, icon, cat: 'decor', tab: 'exclusive', exclusive: true, event: true, unlock: 1, cost: { coins: extra.price ?? 60 }, beauty: { v: beauty, r }, xp: 2, ...extra });
}
evdec('e_fireworks', 'Feu d\'artifice', '🎆', 0.1, 4, { price: 80, desc: 'Des fusées prêtes à partir et des gerbes de lumière dans le ciel.' });
evdec('e_lanterns', 'Guirlande de lanternes', '🏮', 0.1, 4, { size: [2, 1], price: 90, desc: 'Des lanternes en papier qui s\'allument à la nuit tombée.' });
evdec('e_galette', 'Table de la galette', '👑', 0.07, 3, { desc: 'Une galette dorée, sa couronne et ses chaises.' });
evdec('e_crepes', 'Stand de crêpes', '🥞', 0.08, 3, { desc: 'Crêpes, confitures et petite ardoise des prix.' });
evdec('e_heart', 'Cœur fleuri', '❤️', 0.1, 4, { price: 80, desc: 'Une sculpture végétale en forme de cœur, entourée de roses.' });
evdec('e_carnival', 'Char du carnaval', '🎭', 0.13, 5, { size: [2, 1], price: 150, coverage: { need: 'leisure', radius: [4] }, desc: 'Le géant du carnaval sur son char couvert de ballons.' });
evdec('e_cotton_candy', 'Stand de barbe à papa', '🎉', 0.07, 3, { desc: 'Des nuages de sucre rose et bleu.' });
evdec('e_rainbow', 'Arc-en-ciel et chaudron d\'or', '🌈', 0.15, 5, { size: [2, 1], price: 160, desc: 'Au pied de l\'arc-en-ciel… un chaudron rempli d\'or !' });
evdec('e_fish', 'Fontaine du poisson', '🐟', 0.1, 4, { price: 90, desc: 'Un poisson farceur qui crache de l\'eau.' });
evdec('e_easter_egg', 'Œuf de Pâques géant', '🥚', 0.1, 4, { price: 80, desc: 'Un œuf rayé dans son nid, et des petits œufs cachés autour.' });
evdec('e_picnic', 'Pique-nique', '🧺', 0.07, 3, { desc: 'Une nappe à carreaux, un panier et de bonnes choses.' });
evdec('e_lily', 'Muguet géant', '🌼', 0.08, 3, { desc: 'Des clochettes de muguet porte-bonheur.' });
evdec('e_stage', 'Scène de concert', '🎤', 0.15, 6, { size: [2, 2], price: 220, coverage: { need: 'leisure', radius: [7] }, desc: 'Projecteurs, enceintes et public : beauté et loisirs.' });
evdec('e_bonfire', 'Feu de joie', '🔥', 0.08, 4, { desc: 'Un grand feu de bois et des bancs pour se réchauffer.' });
evdec('e_guinguette', 'Guinguette lumineuse', '💡', 0.13, 5, { size: [2, 2], price: 200, coverage: { need: 'leisure', radius: [6] }, desc: 'Tables, guirlandes et piste de danse : beauté et loisirs.' });
evdec('e_telescope', 'Télescope des étoiles', '🔭', 0.08, 3, { desc: 'Pour observer les étoiles filantes.' });
evdec('e_grape_press', 'Pressoir des vendanges', '🍇', 0.09, 4, { price: 90, desc: 'Un vieux pressoir, des tonneaux et des grappes de raisin.' });
evdec('e_cauldron', 'Chaudron de sorcière', '🧪', 0.09, 4, { price: 90, desc: 'Une potion verte qui bouillonne, la nuit surtout.' });
evdec('e_xmas_market', 'Chalets du marché de Noël', '🎄', 0.13, 5, { size: [2, 1], price: 160, coverage: { need: 'commerce', radius: [3] }, desc: 'Deux chalets enneigés et leurs guirlandes : beauté et commerces.' });
evdec('e_gold_cart', 'Wagonnet d\'or', '💰', 0.1, 4, { price: 100, desc: 'Un wagonnet de mine qui déborde de pépites.' });
evdec('e_wishing_well', 'Puits à vœux', '✨', 0.1, 4, { price: 90, desc: 'Un puits magique où l\'on jette des pièces.' });
evdec('e_market_stall', 'Étal de la braderie', '🏷️', 0.07, 3, { coverage: { need: 'commerce', radius: [3] }, desc: 'Des cagettes de légumes à prix cassés : beauté et commerces.' });
evdec('e_haystacks', 'Meules de foin', '🌾', 0.06, 3, { desc: 'Des bottes de foin et une fourche.' });
evdec('e_scarecrow', 'Épouvantail', '🌽', 0.06, 3, { desc: 'Il garde le potager… et fait peur aux corbeaux.' });
evdec('e_builder_statue', 'Marteau d\'or', '🔨', 0.13, 5, { price: 120, desc: 'Le monument des bâtisseurs : un marteau en or massif.' });
evdec('e_joust', 'Lice du tournoi', '🛡️', 0.13, 5, { size: [2, 2], price: 200, coverage: { need: 'leisure', radius: [6] }, desc: 'La tente des chevaliers, la barrière de joute et leurs écus.' });
evdec('e_pirate_ship', 'Bateau pirate', '⛵', 0.15, 6, { size: [2, 2], price: 220, desc: 'Un navire pirate échoué près de son trésor.' });
evdec('e_carousel', 'Manège de chevaux de bois', '🎠', 0.16, 6, { size: [2, 2], price: 240, coverage: { need: 'leisure', radius: [8] }, desc: 'Il tourne pour de vrai ! Beauté et loisirs.' });
evdec('e_balloon', 'Montgolfière', '🎈', 0.12, 5, { price: 120, desc: 'Une montgolfière à rayures prête à décoller.' });
evdec('e_circus', 'Chapiteau du cirque', '🎪', 0.16, 6, { size: [2, 2], price: 240, coverage: { need: 'leisure', radius: [8] }, desc: 'Un grand chapiteau rouge et jaune : beauté et loisirs.' });
evdec('e_igloo', 'Igloo', '🧊', 0.09, 4, { price: 90, desc: 'Un igloo, ses blocs de glace et deux pingouins.' });
evdec('e_sandcastle', 'Château de sable', '🏰', 0.09, 4, { price: 80, desc: 'Avec ses tours, son drapeau, son seau et sa pelle.' });
evdec('e_icecream', 'Kiosque à glaces', '🍦', 0.08, 3, { desc: 'Trois parfums, un parasol et un cornet géant.' });
evdec('e_foodtruck', 'Food truck', '🚚', 0.1, 4, { size: [2, 1], price: 150, coverage: { need: 'commerce', radius: [4] }, desc: 'Un camion gourmand, ses tables et ses guirlandes : beauté et commerces.' });
evdec('e_giant_tree', 'Chêne millénaire', '🌳', 0.17, 6, { size: [2, 2], price: 200, desc: 'Un arbre immense avec une porte de lutin et une balançoire.' });

/* ───────────── Mairie ───────────── */
def({
  id: 'townhall', name: 'Mairie', icon: '🏛️', cat: 'special', unlock: 1, maxLevel: RANKS.length, size: [2, 2],
  unique: true, notBuildable: true, produces: { wood: 10, stone: 5, food: 8 },
  levelNames: RANKS.map((r) => `Mairie · ${r.name}`),
  costs: [{}, ...RANKS.slice(1).map((r) => r.cost)],
  desc: 'Le cœur du village. Elle fournit un peu de bois, de pierre et de nourriture chaque jour. L\'améliorer fait grandir ton rang et permet d\'améliorer tous les autres bâtiments.',
});

export const BUILDING_LIST = LIST;
export const BUILDINGS = Object.fromEntries(LIST.map((d) => [d.id, d]));

/* ───────────── Accesseurs ───────────── */
export function sizeOf(def, rot = 0) {
  const [w, d] = def.size;
  return rot & 1 ? [d, w] : [w, d];
}

export function levelName(def, level) {
  return def.levelNames?.[level - 1] ?? def.name;
}

/** Coût pour atteindre un niveau (1 = construction). */
export function costToLevel(def, level) {
  return def.costs[level - 1] || {};
}

/** Total investi dans un bâtiment jusqu'à son niveau actuel. */
export function totalInvested(def, level) {
  const out = {};
  for (let L = 1; L <= level; L++) {
    const c = def.costs[L - 1] || {};
    for (const k in c) out[k] = (out[k] || 0) + c[k];
  }
  return out;
}

export function workersAt(def, level) {
  return def.workers ? Math.round(def.workers * WORKER_MULT[Math.min(level, 5) - 1]) : 0;
}

export function radiusAt(def, level) {
  const r = def.coverage?.radius;
  if (!r) return 0;
  return r[Math.min(level, r.length) - 1];
}

export function residentsAt(def, level) {
  return def.residents ? def.residents[level - 1] : 0;
}

export function upkeepAt(def, level) {
  return def.upkeep ? Math.round(def.upkeep * (1 + 0.35 * (level - 1))) : 0;
}

export function isDecor(def) {
  return def.cat === 'decor';
}

export function buildXP(def) {
  if (def.xp != null) return def.xp;
  return Math.max(1, Math.round(costValue(def.costs[0]) / 12));
}

export function upgradeXP(def, toLevel) {
  return Math.max(2, Math.round(costValue(def.costs[toLevel - 1] || {}) / 10));
}
