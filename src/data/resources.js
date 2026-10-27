// Ressources du jeu. "value" sert à estimer les récompenses et l'XP.

export const RESOURCES = {
  coins: { id: 'coins', name: 'Pièces', icon: '🪙', value: 1 },
  wood: { id: 'wood', name: 'Bois', icon: '🪵', value: 2 },
  stone: { id: 'stone', name: 'Pierre', icon: '🪨', value: 3 },
  food: { id: 'food', name: 'Nourriture', icon: '🍞', value: 2 },
  wheat: { id: 'wheat', name: 'Blé', icon: '🌾', value: 2 },
  flour: { id: 'flour', name: 'Farine', icon: '🥣', value: 4 },
  planks: { id: 'planks', name: 'Planches', icon: '🪚', value: 5 },
  clay: { id: 'clay', name: 'Argile', icon: '🏺', value: 3 },
  bricks: { id: 'bricks', name: 'Briques', icon: '🧱', value: 8 },
  iron: { id: 'iron', name: 'Fer', icon: '🔩', value: 8 },
  tools: { id: 'tools', name: 'Outils', icon: '🛠️', value: 18 },
  wool: { id: 'wool', name: 'Laine', icon: '🧶', value: 8 },
  fabric: { id: 'fabric', name: 'Tissu', icon: '🧵', value: 15 },
  clothing: { id: 'clothing', name: 'Vêtements', icon: '👕', value: 40 },
  pastries: { id: 'pastries', name: 'Viennoiseries', icon: '🥐', value: 12 },
  furniture: { id: 'furniture', name: 'Meubles', icon: '🪑', value: 32 },
  cheese: { id: 'cheese', name: 'Fromage', icon: '🧀', value: 9 },
  jam: { id: 'jam', name: 'Confiture', icon: '🫙', value: 10 },
  ceramics: { id: 'ceramics', name: 'Céramiques', icon: '🏺', value: 14 },
  machinery: { id: 'machinery', name: 'Machines', icon: '⚙️', value: 120 },
};

export const RES_ORDER = Object.keys(RESOURCES);
export const GOODS = RES_ORDER.filter((r) => r !== 'coins');

/** Valeur totale d'un coût, en équivalent pièces. */
export function costValue(cost) {
  let v = 0;
  for (const k in cost) v += (RESOURCES[k]?.value ?? 1) * cost[k];
  return v;
}

export function emptyStock() {
  const s = {};
  for (const r of RES_ORDER) s[r] = 0;
  return s;
}
