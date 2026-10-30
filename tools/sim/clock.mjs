// Horloge virtuelle du banc d'essai.
//
// Deux temps cohabitent dans Bâtisseur, et il faut tromper les deux :
//  — le temps de jeu (journées, saisons), avancé par sim.update() ;
//  — le temps réel (chantiers, commandes, marchés, expéditions), lu dans Date.now().
// On remplace donc l'horloge du système par une horloge qu'on avance à la main. Ce module
// doit être importé avant tout module du jeu, pour que personne ne capture l'ancienne.
const T0 = Date.UTC(2026, 3, 6, 9, 0, 0); // un lundi matin, 9 h
let VNOW = T0;

const RealDate = Date;
class VirtualDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(VNOW);
    else super(...args);
  }
  static now() { return VNOW; }
}
VirtualDate.parse = RealDate.parse;
VirtualDate.UTC = RealDate.UTC;
globalThis.Date = VirtualDate;
globalThis.performance = { now: () => VNOW - T0 };

export const clock = {
  get now() { return VNOW; },
  get start() { return T0; },
  advance(ms) { VNOW += ms; },
  get hours() { return (VNOW - T0) / 3600000; },
  get days() { return (VNOW - T0) / 86400000; },
};
