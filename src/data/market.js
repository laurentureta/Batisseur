// Marchands régionaux : toutes les périodes et tous les prix utilisent l'heure réelle.
import { RESOURCES, GOODS } from './resources.js';

export const MARKET_SLOT_MS = 15 * 60 * 1000;
export const MARKET_DAY_MS = 24 * 60 * 60 * 1000;
export const MARKET_DAILY_UNITS = 1600;
export const MARKET_MAX_TRADE = 200;
export const MARKET_SPREAD = .16;
export const MARKET_REGIONS = {
  home: { name: 'Marché du bourg', icon: '🏘️', specialty: 'Matériaux de construction', supply: ['wood','stone','furniture'], demand: ['planks','bricks','tools','clothing'], budget: 2800 },
  island: { name: 'Halles des Vergers', icon: '🍎', specialty: 'Récoltes et produits agricoles', supply: ['food','wheat','flour','wool','cheese','jam'], demand: ['wood','bricks','tools','fabric'], budget: 3200 },
  mountain: { name: 'Comptoir des Mines', icon: '⛏️', specialty: 'Minerais et pierre', supply: ['stone','iron','clay','machinery'], demand: ['food','flour','planks','clothing'], budget: 3800 },
  coast: { name: 'Bourse du Rivage', icon: '⚓', specialty: 'Matériaux importés par les quais', supply: ['planks','bricks','ceramics','fabric'], demand: ['food','wheat','tools','pastries','furniture'], budget: 4400 },
};

// Mélange entier stable, sans Math.random : recharger le jeu ne relance jamais les cours.
function sample(seed, region, resource, slot, salt = 0) {
  let value = (seed ^ Math.imul(slot | 0, 2654435761) ^ salt) >>> 0;
  for (const c of region + ':' + resource) value = Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0;
  value ^= value >>> 16; value = Math.imul(value, 2246822507); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}
export function marketOfferRule(region, resource) {
  const rule = MARKET_REGIONS[region];
  if (!rule || !GOODS.includes(resource)) return null;
  const abundant = rule.supply.includes(resource), sought = rule.demand.includes(resource);
  const base = Math.max(28, Math.round(220 / Math.sqrt(RESOURCES[resource].value)));
  const capacity = Math.round(base * (abundant ? 1.6 : sought ? .7 : 1));
  const demand = Math.round(base * (sought ? 1.5 : abundant ? .6 : 1));
  return { capacity, demand, abundant, sought, restock: Math.max(5,Math.ceil(capacity*.3)), demandRestock: Math.max(5,Math.ceil(demand*.4)) };
}
export function marketIndex(seed, region, resource, slot) {
  const rule = marketOfferRule(region,resource);
  if (!rule) return 1;
  // Deux périodes glissantes évitent les bonds de prix au milieu d'un échange.
  const slow = sample(seed,region,resource,Math.floor(slot/4),371);
  const fast = sample(seed,region,resource,slot,719);
  return (rule.abundant ? .83 : rule.sought ? 1.17 : 1) * (.88 + slow*.16 + fast*.08);
}
export function unitPriceCents(seed, region, resource, slot, stock, side) {
  const rule = marketOfferRule(region,resource);
  const pressure = (.65 - stock/rule.capacity) * .18;
  const index = Math.max(.55,Math.min(1.85,marketIndex(seed,region,resource,slot)+pressure));
  const price = RESOURCES[resource].value * index * 100;
  return side === 'buy' ? Math.ceil(price*(1+MARKET_SPREAD)) : Math.max(1,Math.floor(price*(1-MARKET_SPREAD)));
}
export function marketDemand(seed,region,resource,slot) {
  const rule=marketOfferRule(region,resource);
  return Math.max(1,Math.round(rule.demand*(.65+sample(seed,region,resource,slot,719)*.35)));
}
export function initialMarketOffer(seed,region,resource,slot) {
  const rule=marketOfferRule(region,resource);
  return { stock: Math.max(1,Math.floor(rule.capacity*(.6+sample(seed,region,resource,slot,127)*.3))), wanted: marketDemand(seed,region,resource,slot) };
}
