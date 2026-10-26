// Terrains de départ proposés à la création d'une partie.
export const PRESETS = {
  ile: { id:'ile',name:'Île des Vergers',icon:'🏝️',desc:'Une île fertile entourée par la mer, dédiée aux échanges de marchandises.' },
  vallee: {
    id: 'vallee',
    name: 'Vallée verdoyante',
    icon: '🏞️',
    desc: 'Une rivière, des forêts et quelques collines. Un terrain équilibré, idéal pour débuter.',
  },
  cote: {
    id: 'cote',
    name: 'Côte sauvage',
    icon: '🏖️',
    desc: 'La mer à l\'est, des plages et des criques. Parfait pour la pêche, mais moins de pierre.',
  },
  montagne: {
    id: 'montagne',
    name: 'Pied des montagnes',
    icon: '🏔️',
    desc: 'Des sommets, des lacs et beaucoup de roche. Riche en pierre et en fer, moins de place pour bâtir.',
  },
};

export const PRESET_ORDER = ['vallee', 'cote', 'montagne'];
