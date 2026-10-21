// Passe de combat : saisons de 28 jours, 40 paliers gratuits et 40 paliers royaux, défis de la semaine.
// Tout se gagne en jouant : les gemmes servent à débloquer le passe royal (pas d'argent réel).

export const SEASON_EPOCH = Date.UTC(2026, 9, 15); // 15 octobre 2026
export const SEASON_DAYS = 28;
export const TIERS = 40;
export const TIER_XP = 1000;
export const BONUS_TIER_XP = 1500; // au-delà du palier 40 : un coffre tous les 1500 XP
export const PREMIUM_COST = 950;

/** Thèmes des saisons (ils tournent en boucle). */
export const SEASON_THEMES = [
  {
    id: 'citrouilles', name: 'La Nuit des Citrouilles', icon: '🎃', colors: ['#ff8a2a', '#5b2a86'],
    decor: ['x_pumpkins', 'x_lantern', 'x_haunted_tree', 'x_gate', 'x_crypt', 'x_candles'],
    themes: ['violet', 'citrouille'], avatars: ['🎃', '🧛'], titles: ['Citrouille d\'honneur', 'Roi des citrouilles'],
    tagline: 'Citrouilles, lanternes et crypte mystérieuse : le village se pare pour Halloween !',
  },
  {
    id: 'hiver', name: 'L\'Hiver Royal', icon: '❄️', colors: ['#7fd3ff', '#28408f'],
    decor: ['x_snowman', 'x_gifts', 'x_xmas_tree', 'x_sleigh', 'x_ice_rink', 'x_star_lamp'],
    themes: ['turquoise', 'noir'], avatars: ['☃️', '🎅'], titles: ['Flocon d\'or', 'Souverain de l\'hiver'],
    tagline: 'Sapin illuminé, patinoire et bonshommes de neige pour un hiver féerique.',
  },
  {
    id: 'printemps', name: 'Le Printemps Fleuri', icon: '🌸', colors: ['#ff8fc2', '#3a9a4a'],
    decor: ['x_tulips', 'x_beehive', 'x_cherry_tree', 'x_flower_arch', 'x_hedge_maze', 'x_birdbath'],
    themes: ['rose', 'turquoise'], avatars: ['🌷', '🦋'], titles: ['Main verte', 'Jardinier royal'],
    tagline: 'Cerisiers, arches fleuries et labyrinthe de haies : la nature s\'invite en ville.',
  },
  {
    id: 'or', name: 'L\'Âge d\'Or', icon: '👑', colors: ['#f6c851', '#8a4b12'],
    decor: ['x_gold_coins', 'x_banners', 'x_gold_statue', 'x_obelisk', 'x_royal_fountain', 'x_throne'],
    themes: ['noir', 'or'], avatars: ['💰', '👑'], titles: ['Trésorier du roi', 'Monarque doré'],
    tagline: 'Statues d\'or, obélisque et fontaine royale pour une cité qui brille.',
  },
];

export function seasonAt(now = Date.now()) {
  const len = SEASON_DAYS * 864e5;
  const idx = Math.floor((now - SEASON_EPOCH) / len);
  const start = SEASON_EPOCH + idx * len;
  const n = SEASON_THEMES.length;
  const theme = SEASON_THEMES[((idx % n) + n) % n];
  return { index: idx, number: idx + 1, start, end: start + len, theme };
}

/* ───────── Récompenses des paliers ─────────
   Récompense = { coins, wood, ... (au village) } ou { gems } ou { chest: 'argent' } ou { boost: 'prod2', n }
   ou { decor: 'x_...' } ou { theme: 'violet' } ou { avatar: '🎃' } ou { title: '...' } ou { pxp: 100 } */
const RES = (k) => ({ res: k }); // ressources mises à l'échelle du niveau au moment de la récupération

const FREE = {
  1: RES(1), 2: { gems: 5 }, 3: RES(2), 4: { boost: 'prod2', n: 1 }, 5: { gems: 10 }, 6: { chest: 'bois' }, 7: RES(3), 8: RES(1), 9: { gems: 10 },
  10: { chest: 'argent' }, 11: RES(4), 12: { boost: 'tax2', n: 1 }, 13: { gems: 10 }, 14: RES(2), 15: { chest: 'bois' }, 16: RES(1), 17: { gems: 15 },
  18: { boost: 'fete', n: 1 }, 19: RES(3), 20: { decor: 0 }, 21: RES(1), 22: { gems: 15 }, 23: { chest: 'argent' }, 24: RES(4), 25: { boost: 'prod2', n: 1 },
  26: { gems: 15 }, 27: RES(1), 28: { chest: 'bois' }, 29: RES(2), 30: { chest: 'argent' }, 31: { gems: 20 }, 32: { boost: 'growth', n: 1 }, 33: RES(3),
  34: RES(1), 35: { gems: 20 }, 36: { chest: 'argent' }, 37: RES(4), 38: { boost: 'tax2', n: 1 }, 39: { gems: 25 }, 40: { decor: 1, title: 0 },
};
const PREMIUM = {
  1: { gems: 100, avatar: 0 }, 2: { chest: 'argent' }, 3: { gems: 30 }, 4: { boost: 'prod2', n: 2 }, 5: { decor: 2 }, 6: { gems: 30 }, 7: RES(5), 8: { chest: 'or' },
  9: { gems: 30 }, 10: { chest: 'or' }, 11: { gems: 40 }, 12: { theme: 0 }, 13: RES(5), 14: { gems: 40 }, 15: { decor: 3 }, 16: { boost: 'tax2', n: 2 },
  17: { gems: 40 }, 18: { chest: 'or' }, 19: RES(6), 20: { gems: 50, title: 0 }, 21: { boost: 'fete', n: 2 }, 22: { gems: 40 }, 23: RES(5), 24: { chest: 'or' },
  25: { decor: 4 }, 26: { gems: 50 }, 27: RES(6), 28: { boost: 'growth', n: 2 }, 29: { gems: 50 }, 30: { chest: 'royal' }, 31: RES(5), 32: { gems: 50 },
  33: { boost: 'prod2', n: 3 }, 34: { gems: 80 }, 35: { decor: 5 }, 36: { chest: 'or' }, 37: { gems: 80 }, 38: RES(6), 39: { gems: 120 },
  40: { theme: 1, avatar: 1, title: 1, chest: 'royal' },
};

/** Résout les références de saison (décor n°, thème n°...). */
function resolve(r, theme) {
  if (!r) return null;
  const out = { ...r };
  if (typeof r.decor === 'number') out.decor = theme.decor[r.decor];
  if (typeof r.theme === 'number') out.theme = theme.themes[r.theme];
  if (typeof r.avatar === 'number') out.avatar = theme.avatars[r.avatar];
  if (typeof r.title === 'number') out.title = theme.titles[r.title];
  return out;
}

export function tierList(season) {
  const out = [];
  for (let t = 1; t <= TIERS; t++) out.push({ tier: t, free: resolve(FREE[t], season.theme), prem: resolve(PREMIUM[t], season.theme) });
  return out;
}

/** Ressources d'un palier selon le niveau du joueur (kind 1..6). */
export function scaledResources(kind, level) {
  const L = Math.max(1, level || 1);
  switch (kind) {
    case 1: return { coins: Math.round((150 + L * 60) / 10) * 10 };
    case 2: return { wood: 40 + L * 8, stone: 25 + L * 6 };
    case 3: return L >= 6 ? { planks: 20 + L * 4, bricks: 10 + L * 3 } : { wood: 60 + L * 10, food: 50 + L * 8 };
    case 4: return L >= 14 ? { tools: 8 + L, iron: 10 + L } : { stone: 50 + L * 10, coins: 100 + L * 40 };
    case 5: return { coins: Math.round((500 + L * 180) / 10) * 10, wood: 60 + L * 10, stone: 50 + L * 8 };
    case 6: return L >= 10 ? { planks: 50 + L * 8, bricks: 40 + L * 6, tools: Math.round(5 + L * 1.2) } : { coins: 600 + L * 200, food: 120 + L * 15 };
    default: return { coins: 200 };
  }
}

/* ───────── Défis de la semaine ───────── */
export const WEEKLY_POOL = [
  { id: 'build', label: (n) => `Construis ${n} bâtiments`, stat: 'built', n: [12, 20, 30], pxp: 1500 },
  { id: 'upgrade', label: (n) => `Fais ${n} améliorations`, stat: 'upgraded', n: [6, 12, 20], pxp: 1800 },
  { id: 'coins', label: (n) => `Gagne ${n.toLocaleString('fr-FR')} pièces en impôts et commerces`, stat: 'coins', n: [4000, 12000, 30000], pxp: 1500 },
  { id: 'roads', label: (n) => `Trace ${n} cases de route`, stat: 'roads', n: [25, 50, 90], pxp: 1000 },
  { id: 'decor', label: (n) => `Pose ${n} décorations`, stat: 'decor', n: [8, 15, 25], pxp: 1000 },
  { id: 'orders', label: (n) => `Livre ${n} commandes`, stat: 'orders', n: [3, 6, 10], pxp: 1800 },
  { id: 'daily', label: (n) => `Termine ${n} missions du jour`, stat: 'daily', n: [5, 9, 14], pxp: 2000 },
  { id: 'quests', label: (n) => `Termine ${n} quêtes principales`, stat: 'quests', n: [2, 3, 5], pxp: 1500 },
  { id: 'chests', label: (n) => `Ouvre ${n} coffres`, stat: 'chests', n: [2, 4, 6], pxp: 1000 },
  { id: 'levels', label: (n) => `Gagne ${n} niveau${n > 1 ? 'x' : ''}`, stat: 'levels', n: [1, 2, 4], pxp: 1800 },
  { id: 'trade', label: (n) => `Fais ${n} échanges au comptoir`, stat: 'trades', n: [3, 6, 10], pxp: 1000 },
  { id: 'forest', label: (n) => `Plante ${n} forêts`, stat: 'planted', n: [4, 8, 12], pxp: 900 },
  { id: 'food', label: (n) => `Produis ${n.toLocaleString('fr-FR')} nourriture`, stat: 'food', n: [600, 1500, 4000], pxp: 1500 },
  { id: 'fires', label: (n) => `Éteins ${n} incendie${n > 1 ? 's' : ''}`, stat: 'fires', n: [1, 2, 3], pxp: 1200, minLevel: 6 },
  { id: 'gems', label: (n) => `Dépense ${n} gemmes`, stat: 'spent', n: [30, 80, 150], pxp: 1000 },
];
export const WEEKLY_COUNT = 7;

/** Identifiant de semaine (lundi = début) en heure locale : "2026-W43". */
export function weekKey(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const jan4 = new Date(monday.getFullYear(), 0, 4);
  const w1 = new Date(jan4.getFullYear(), 0, 4 - ((jan4.getDay() + 6) % 7));
  const week = 1 + Math.round((monday - w1) / (7 * 864e5));
  return `${monday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weekEnd(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 7).getTime();
}
