// Quêtes principales (dans l'ordre), missions du jour et succès.
import { round5 } from '../core/util.js';

const q = (id, title, desc, goal, reward) => ({ id, title, desc, goal, reward });

export const MAIN_QUESTS = [
  q('road', 'Premier chemin', 'Choisis 🛣️ Route puis glisse le doigt pour tracer un chemin qui touche la mairie. Tout bâtiment doit être relié à la mairie par la route.', { kind: 'roadConnected' }, { coins: 50, xp: 15 }),
  q('houses', 'Des habitants !', 'Construis 3 cabanes le long du chemin (🔨 Construire → Habitations).', { kind: 'count', type: 'house', n: 3 }, { coins: 60, xp: 20 }),
  q('garden', 'Nourrir le village', 'Chaque habitant mange tous les jours. Construis un potager.', { kind: 'count', type: 'garden', n: 1 }, { wood: 20, xp: 20 }),
  q('lumber', 'Le bois, c\'est la vie', 'Construis un bûcheron tout près de la forêt 🌲.', { kind: 'count', type: 'lumber', n: 1 }, { coins: 80, xp: 25 }),
  q('pop10', 'Un hameau qui grandit', 'Atteins 10 habitants.', { kind: 'pop', n: 10 }, { coins: 100, xp: 30 }),
  q('well', 'De l\'eau potable', 'Construis un puits près des maisons.', { kind: 'count', type: 'well', n: 1 }, { stone: 20, xp: 25 }),
  q('up2', 'Première amélioration', 'Touche une cabane puis ⬆️ Améliorer pour en faire une chaumière.', { kind: 'countLevel', type: 'house', level: 2, n: 1 }, { coins: 120, xp: 40 }),
  q('quarry', 'Tailleur de pierre', 'Construis une carrière près des rochers 🪨.', { kind: 'count', type: 'quarry', n: 1 }, { coins: 100, xp: 40 }),
  q('market', 'Jour de marché', 'Construis un marché : il rapporte des pièces et rend les habitants heureux.', { kind: 'count', type: 'market', n: 1 }, { coins: 120, xp: 45 }),
  q('pop25', 'Ça se peuple', 'Atteins 25 habitants.', { kind: 'pop', n: 25 }, { coins: 150, wood: 40, xp: 50 }),
  q('zone', 'Agrandir le territoire', 'Touche un cadenas 🔒 au bord de la carte pour débloquer une nouvelle zone.', { kind: 'zones', n: 2 }, { coins: 150, xp: 60 }),
  q('farm', 'Les champs', 'Construis une ferme pour cultiver du blé.', { kind: 'count', type: 'farm', n: 1 }, { coins: 150, xp: 60 }),
  q('order', 'Premier client', 'Livre une commande depuis le tableau 📜.', { kind: 'orders', n: 1 }, { coins: 200, xp: 70 }),
  q('mairie2', 'Devenir un village', 'Améliore la mairie au rang de Village.', { kind: 'mairie', n: 2 }, { coins: 300, stone: 50, xp: 100 }),
  q('mill', 'Le moulin', 'Construis un moulin pour transformer le blé en farine.', { kind: 'count', type: 'mill', n: 1 }, { coins: 200, xp: 80 }),
  q('bakery', 'Du bon pain', 'Construis une boulangerie.', { kind: 'count', type: 'bakery', n: 1 }, { coins: 250, xp: 90 }),
  q('school', 'L\'école du village', 'Construis une école.', { kind: 'count', type: 'school', n: 1 }, { coins: 300, xp: 100 }),
  q('pop60', 'Un vrai village', 'Atteins 60 habitants.', { kind: 'pop', n: 60 }, { coins: 400, xp: 120 }),
  q('sawmill', 'Des planches', 'Construis une scierie.', { kind: 'count', type: 'sawmill', n: 1 }, { coins: 300, wood: 80, xp: 120 }),
  q('paved', 'Routes pavées', 'Pose 10 cases de route pavée.', { kind: 'paved', n: 10 }, { coins: 300, stone: 60, xp: 120 }),
  q('up3', 'Maisons en pierre', 'Possède 5 maisons en pierre (niveau 3).', { kind: 'countLevel', type: 'house', level: 3, n: 5 }, { coins: 500, planks: 40, xp: 160 }),
  q('clinic', 'Prendre soin de tous', 'Construis un dispensaire.', { kind: 'count', type: 'clinic', n: 1 }, { coins: 400, xp: 150 }),
  q('mairie3', 'Devenir un bourg', 'Améliore la mairie au rang de Bourg.', { kind: 'mairie', n: 3 }, { coins: 800, planks: 60, xp: 250 }),
  q('happy', 'Village heureux', 'Atteins 75 % de bonheur avec au moins 80 habitants.', { kind: 'happiness', n: 0.75, minPop: 80 }, { coins: 600, xp: 200 }),
  q('claypit', 'Trouver l\'argile', 'Construis une argilière au bord de l\'eau ou du sable, puis relie-la par la route : sans argile, aucune brique.', { kind: 'count', type: 'claypit', n: 1 }, { coins: 400, xp: 180 }),
  q('bricks', 'Des briques', 'Construis une briqueterie. Elle cuira l\'argile de ton argilière.', { kind: 'count', type: 'brickworks', n: 1 }, { coins: 500, xp: 200 }),
  q('fire', 'Au feu les pompiers', 'Construis une caserne de pompiers.', { kind: 'count', type: 'firestation', n: 1 }, { coins: 500, xp: 200 }),
  q('police', 'Ordre et sécurité', 'Construis une gendarmerie.', { kind: 'count', type: 'police', n: 1 }, { coins: 500, xp: 220 }),
  q('pop200', 'Ville en devenir', 'Atteins 200 habitants.', { kind: 'pop', n: 200 }, { coins: 1000, bricks: 40, xp: 300 }),
  q('zones5', 'Grand territoire', 'Possède 5 zones.', { kind: 'zones', n: 5 }, { coins: 1000, xp: 300 }),
  q('shop', 'Boutiques', 'Construis une boutique.', { kind: 'count', type: 'shop', n: 1 }, { coins: 800, xp: 300 }),
  q('mairie4', 'Petite ville', 'Améliore la mairie au rang de Petite ville.', { kind: 'mairie', n: 4 }, { coins: 2000, bricks: 80, xp: 500 }),
  q('up4', 'Les villas', 'Possède 5 villas (niveau 4).', { kind: 'countLevel', type: 'house', level: 4, n: 5 }, { coins: 1500, xp: 450 }),
  q('clock', 'L\'heure tourne', 'Construis la tour de l\'horloge.', { kind: 'count', type: 'clocktower', n: 1 }, { coins: 1500, xp: 500 }),
  q('mine', 'Au fond de la mine', 'Construis une mine de fer.', { kind: 'count', type: 'mine', n: 1 }, { coins: 1200, xp: 450 }),
  q('forge', 'Le forgeron', 'Construis une forge.', { kind: 'count', type: 'forge', n: 1 }, { coins: 1500, xp: 500 }),
  q('pop500', 'Une vraie ville', 'Atteins 500 habitants.', { kind: 'pop', n: 500 }, { coins: 3000, tools: 30, xp: 700 }),
  q('mairie5', 'Ville !', 'Améliore la mairie au rang de Ville.', { kind: 'mairie', n: 5 }, { coins: 5000, tools: 50, xp: 900 }),
  q('up5', 'Les immeubles', 'Possède 5 immeubles (niveau 5).', { kind: 'countLevel', type: 'house', level: 5, n: 5 }, { coins: 4000, xp: 900 }),
  q('stadium', 'Allez les bleus !', 'Construis le stade.', { kind: 'count', type: 'stadium', n: 1 }, { coins: 5000, xp: 1200 }),
  q('mairie6', 'Grande ville', 'Améliore la mairie au rang de Grande ville.', { kind: 'mairie', n: 6 }, { coins: 9000, xp: 1500 }),
  q('station', 'En voiture !', 'Construis la gare.', { kind: 'count', type: 'station', n: 1 }, { coins: 8000, xp: 1500 }),
  q('pop1000', 'Mille habitants', 'Atteins 1 000 habitants.', { kind: 'pop', n: 1000 }, { coins: 12000, xp: 2000 }),
  q('mairie7', 'Cité', 'Améliore la mairie au rang de Cité.', { kind: 'mairie', n: 7 }, { coins: 18000, xp: 2500 }),
  q('castle', 'Le château', 'Construis le château.', { kind: 'count', type: 'castle', n: 1 }, { coins: 20000, xp: 3000 }),
  q('pop2000', 'Grande cité', 'Atteins 2 000 habitants.', { kind: 'pop', n: 2000 }, { coins: 30000, xp: 4000 }),
  q('mairie8', 'Métropole !', 'Améliore la mairie au rang de Métropole. Tu es un bâtisseur de légende !', { kind: 'mairie', n: 8 }, { coins: 50000, xp: 6000 }),
];

// Missions du jour (renouvelées chaque jour réel)
export const DAILY_POOL = [
  { id: 'roads', icon: '🛣️', unlock: 1, counter: 'roads', label: (n) => `Construis ${n} cases de route`, target: (L) => Math.min(60, 10 + L * 2) },
  { id: 'build', icon: '🏗️', unlock: 1, counter: 'built', label: (n) => `Construis ${n} bâtiments`, target: (L) => 3 + Math.floor(L / 4) },
  { id: 'upgrade', icon: '⬆️', unlock: 2, counter: 'upgrades', label: (n) => `Améliore ${n} bâtiments`, target: (L) => 2 + Math.floor(L / 6) },
  { id: 'decor', icon: '🌷', unlock: 1, counter: 'decor', label: (n) => `Pose ${n} décorations`, target: () => 4 },
  { id: 'coins', icon: '🪙', unlock: 1, counter: 'coins', label: (n) => `Gagne ${n} pièces`, target: (L) => round5(250 + L * 120) },
  { id: 'wood', icon: '🪵', unlock: 1, counter: 'produced.wood', label: (n) => `Produis ${n} bois`, target: (L) => round5(80 + L * 30) },
  { id: 'food', icon: '🍞', unlock: 1, counter: 'produced.food', label: (n) => `Produis ${n} nourriture`, target: (L) => round5(60 + L * 30) },
  { id: 'stone', icon: '🪨', unlock: 2, counter: 'produced.stone', label: (n) => `Produis ${n} pierres`, target: (L) => round5(50 + L * 20) },
  { id: 'planks', icon: '🪚', unlock: 7, counter: 'produced.planks', label: (n) => `Produis ${n} planches`, target: (L) => round5(30 + L * 8) },
  { id: 'bricks', icon: '🧱', unlock: 9, counter: 'produced.bricks', label: (n) => `Produis ${n} briques`, target: (L) => round5(20 + L * 6) },
  { id: 'tools', icon: '🛠️', unlock: 15, counter: 'produced.tools', label: (n) => `Produis ${n} outils`, target: (L) => round5(10 + L * 2) },
  { id: 'orders', icon: '📜', unlock: 3, counter: 'orders', label: (n) => (n > 1 ? `Livre ${n} commandes` : 'Livre 1 commande'), target: (L) => 1 + Math.floor(L / 10) },
];

export function dailyReward(level) {
  return { coins: round5(60 + level * 25), xp: 15 + level * 5 };
}

// Succès à paliers : stat = fonction (game) => valeur
export const ACHIEVEMENTS = [
  { id: 'pop', icon: '👥', name: 'Démographe', desc: 'Record d\'habitants', tiers: [25, 100, 300, 800, 1500, 2500], stat: (g) => g.state.stats.popRecord },
  { id: 'build', icon: '🏗️', name: 'Bâtisseur', desc: 'Bâtiments construits', tiers: [10, 50, 150, 300, 600], stat: (g) => g.state.stats.totalBuilt },
  { id: 'roads', icon: '🛣️', name: 'Cantonnier', desc: 'Cases de route posées', tiers: [25, 100, 300, 800], stat: (g) => g.state.stats.roadsBuilt },
  { id: 'upgrades', icon: '⬆️', name: 'Rénovateur', desc: 'Améliorations effectuées', tiers: [5, 25, 100, 250], stat: (g) => g.state.stats.upgrades },
  { id: 'zones', icon: '🗺️', name: 'Explorateur', desc: 'Zones possédées', tiers: [3, 6, 12, 18, 25], stat: (g) => g.state.stats.zonesUnlocked },
  { id: 'level', icon: '⭐', name: 'Maire expérimenté', desc: 'Niveau du village', tiers: [5, 10, 20, 30, 40, 50], stat: (g) => g.state.level },
  { id: 'orders', icon: '📜', name: 'Négociant', desc: 'Commandes livrées', tiers: [5, 25, 75, 200], stat: (g) => g.state.stats.ordersDone },
  { id: 'mairie', icon: '🏛️', name: 'Urbaniste', desc: 'Rang de la mairie', tiers: [2, 3, 4, 5, 6, 7, 8], stat: (g) => g.townhallLevel() },
  { id: 'monuments', icon: '🏰', name: 'Patrimoine', desc: 'Monuments construits', tiers: [1, 2, 4, 6], stat: (g) => g.state.stats.monuments },
  { id: 'fires', icon: '🚒', name: 'Soldat du feu', desc: 'Incendies éteints', tiers: [1, 5, 20], stat: (g) => g.state.stats.firesOut },
  { id: 'coins', icon: '🪙', name: 'Trésorier', desc: 'Pièces gagnées', tiers: [1000, 10000, 100000, 1000000], stat: (g) => g.state.stats.coinsEarned },
  { id: 'food', icon: '🍞', name: 'Grenier plein', desc: 'Nourriture produite', tiers: [500, 5000, 50000, 250000], stat: (g) => g.state.stats.produced.food || 0 },
  { id: 'quests', icon: '🎯', name: 'Mission accomplie', desc: 'Quêtes principales terminées', tiers: [5, 15, 30, 46], stat: (g) => g.state.stats.questsDone },
  { id: 'happy', icon: '😊', name: 'Ville radieuse', desc: 'Bonheur (avec 100 habitants ou plus)', tiers: [70, 80, 90], stat: (g) => (g.sim.d.population >= 100 ? Math.round(g.sim.d.happiness * 100) : 0), unit: '%' },
];

export function achievementReward(tierIndex) {
  return { coins: round5(150 * Math.pow(2.2, tierIndex)), xp: Math.round(40 * Math.pow(2, tierIndex)) };
}
