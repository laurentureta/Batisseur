// Boutique : coffres, boosts, packs de ressources, décorations et thèmes à acheter avec des gemmes 💎.
// Les gemmes se gagnent en jouant (missions, niveaux, passe, connexion, coffres) : aucun achat réel.
import { mulberry32, hashStr } from '../core/rng.js';

export const GEM = '💎';
export const START_GEMS = 100;
export const FREE_CHEST_HOURS = 4;

export const CHESTS = {
  bois: { id: 'bois', name: 'Coffre en bois', icon: '🎁', price: 0, color: '#b07a45', rolls: 3, desc: '3 récompenses' },
  argent: { id: 'argent', name: 'Coffre d\'argent', icon: '🎁', price: 80, color: '#a9b8c9', rolls: 4, desc: '4 récompenses, gemmes probables' },
  or: { id: 'or', name: 'Coffre d\'or', icon: '🎁', price: 200, color: '#f2c14e', rolls: 5, desc: '5 récompenses, décoration possible' },
  royal: { id: 'royal', name: 'Coffre royal', icon: '🎁', price: 450, color: '#9b59d6', rolls: 6, desc: '6 récompenses, décoration garantie' },
};

// Boosts : activés dans le village en cours, durée en jours de jeu
export const BOOSTS = {
  prod2: { id: 'prod2', name: 'Récolte ×2', icon: '⚡', days: 1, price: 30, desc: 'Toute la production est doublée pendant 1 jour.' },
  tax2: { id: 'tax2', name: 'Impôts ×1,5', icon: '💰', days: 1, price: 30, desc: 'Les impôts et commerces rapportent 50 % de plus pendant 1 jour.' },
  fete: { id: 'fete', name: 'Grande fête', icon: '🎉', days: 2, price: 25, desc: '+12 % de bonheur pendant 2 jours.' },
  growth: { id: 'growth', name: 'Afflux d\'habitants', icon: '🏃', days: 2, price: 20, desc: 'Les maisons se remplissent 3 fois plus vite pendant 2 jours.' },
};

/** Packs de ressources (mis à l'échelle du niveau du village). */
export const PACKS = [
  { id: 'p_coins', name: 'Bourse de pièces', icon: '🪙', price: 25, minLevel: 1, give: (L) => ({ coins: Math.round((500 + 250 * L) / 50) * 50 }) },
  { id: 'p_basic', name: 'Chariot de bois et pierre', icon: '🪵', price: 20, minLevel: 1, give: (L) => ({ wood: 150 + 30 * L, stone: 100 + 25 * L }) },
  { id: 'p_food', name: 'Grenier plein', icon: '🍞', price: 15, minLevel: 1, give: (L) => ({ food: 200 + 30 * L }) },
  { id: 'p_mat', name: 'Matériaux du bâtisseur', icon: '🧱', price: 35, minLevel: 6, give: (L) => ({ planks: 60 + 15 * L, bricks: 40 + 12 * L }) },
  { id: 'p_tools', name: 'Caisse d\'outils', icon: '🛠️', price: 40, minLevel: 12, give: (L) => ({ tools: 20 + 5 * L, iron: 20 + 4 * L }) },
  { id: 'p_big', name: 'Grand convoi', icon: '🚚', price: 100, minLevel: 8, give: (L) => ({ coins: Math.round((1500 + 500 * L) / 50) * 50, wood: 300 + 50 * L, stone: 250 + 40 * L, planks: 120 + 25 * L, bricks: 90 + 20 * L }) },
];

/** Décorations exclusives vendues en permanence (les autres viennent du passe et des coffres). */
export const SHOP_DECOR = [
  { id: 'x_camp', price: 50 }, { id: 'x_banners', price: 40 }, { id: 'x_grove', price: 40 }, { id: 'x_fruit_cart', price: 45 },
  { id: 'x_archery', price: 70 }, { id: 'x_mini_mill', price: 90 }, { id: 'x_watchtower', price: 120 }, { id: 'x_catapult', price: 160 },
];

/** Thèmes de toits vendus (les thèmes de saison s'obtiennent dans le passe). */
export const SHOP_THEMES = [
  { id: 'noir', price: 250 }, { id: 'rose', price: 250 }, { id: 'turquoise', price: 250 }, { id: 'or', price: 400 },
];

/** Récompenses de connexion (cycle de 7 jours). */
export const LOGIN_REWARDS = [
  { res: 1 }, { gems: 5 }, { chest: 'bois' }, { boost: 'prod2', n: 1 }, { gems: 10 }, { chest: 'argent' }, { gems: 25, chest: 'or' },
];

/** Offres du jour (3 réductions, identiques pour tout le monde ce jour-là). */
export function dailyDeals(dayKey, level) {
  const rng = mulberry32(hashStr('deals:' + dayKey));
  const pool = [];
  for (const b of Object.values(BOOSTS)) pool.push({ kind: 'boost', id: b.id, price: Math.round(b.price * 0.6), was: b.price });
  for (const p of PACKS) if (level >= p.minLevel) pool.push({ kind: 'pack', id: p.id, price: Math.round(p.price * 0.7), was: p.price });
  for (const d of SHOP_DECOR) pool.push({ kind: 'decor', id: d.id, price: Math.round(d.price * 0.75), was: d.price });
  pool.push({ kind: 'chest', id: 'argent', price: 60, was: 80 });
  pool.push({ kind: 'chest', id: 'or', price: 160, was: 200 });
  const out = [];
  const kinds = new Set();
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const o = pool[Math.floor(rng() * pool.length)];
    if (kinds.has(o.kind + o.id)) continue;
    if (out.filter((x) => x.kind === o.kind).length >= 2) continue;
    kinds.add(o.kind + o.id);
    out.push({ ...o, key: `${dayKey}:${o.kind}:${o.id}` });
  }
  return out;
}

/** Contenu d'un coffre : liste de récompenses (tirées au moment de l'ouverture). */
export function rollChest(type, level, rng, ownedDecor, allDecor, ownedThemes, allThemes) {
  const L = Math.max(1, level || 1);
  const out = [];
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const res = (mult) => {
    const r = rng();
    if (r < 0.34) return { wood: Math.round((50 + L * 15) * mult), stone: Math.round((30 + L * 10) * mult) };
    if (r < 0.55) return { food: Math.round((60 + L * 15) * mult) };
    if (r < 0.8 && L >= 6) return { planks: Math.round((20 + L * 5) * mult), bricks: Math.round((12 + L * 4) * mult) };
    if (L >= 14) return { tools: Math.round((6 + L) * mult) };
    return { stone: Math.round((50 + L * 12) * mult) };
  };
  const coins = (mult) => ({ coins: Math.round(((100 + L * 40) * mult) / 10) * 10 });
  const decorLeft = allDecor.filter((d) => !ownedDecor.includes(d));
  const themesLeft = allThemes.filter((t) => !ownedThemes.includes(t));
  const boost = () => ({ boost: pick(Object.keys(BOOSTS)), n: 1 });
  if (type === 'bois') {
    out.push(coins(1), res(1));
    const r = rng();
    if (r < 0.3) out.push({ gems: 3 + Math.floor(rng() * 6) });
    else if (r < 0.42) out.push(boost());
    else if (r < 0.47 && decorLeft.length) out.push({ decor: pick(decorLeft) });
    else out.push({ pxp: 150 });
  } else if (type === 'argent') {
    out.push(coins(3), res(2.5));
    out.push(rng() < 0.7 ? { gems: 10 + Math.floor(rng() * 16) } : res(2));
    if (rng() < 0.18 && decorLeft.length) out.push({ decor: pick(decorLeft) });
    else out.push(rng() < 0.55 ? boost() : { pxp: 400 });
  } else if (type === 'or') {
    out.push(coins(8), res(6), res(5));
    out.push({ gems: 25 + Math.floor(rng() * 36) });
    const r = rng();
    if (r < 0.4 && decorLeft.length) out.push({ decor: pick(decorLeft) });
    else if (r < 0.52 && themesLeft.length) out.push({ theme: pick(themesLeft) });
    else out.push({ boost: pick(Object.keys(BOOSTS)), n: 2 });
  } else {
    out.push(coins(18), res(12), res(10));
    out.push({ gems: 60 + Math.floor(rng() * 91) });
    out.push(decorLeft.length ? { decor: pick(decorLeft) } : { gems: 60 });
    out.push(rng() < 0.3 && themesLeft.length ? { theme: pick(themesLeft) } : { boost: pick(Object.keys(BOOSTS)), n: 3 });
  }
  return out;
}

/** Effet des boosts actifs d'un village. */
export function boostMul(st) {
  const m = { prod: 1, tax: 1, happy: 0, growth: 1 };
  if (!st?.boosts?.length) return m;
  const day = st.time.day;
  for (const b of st.boosts) {
    if (b.until <= day) continue;
    if (b.id === 'prod2') m.prod = 2;
    else if (b.id === 'tax2') m.tax = 1.5;
    else if (b.id === 'fete') m.happy = 0.12;
    else if (b.id === 'growth') m.growth = 3;
  }
  return m;
}
