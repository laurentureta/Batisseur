// Ajouter chaque nouvelle version ici, de la plus récente à la plus ancienne.
export const RELEASES = [
  {
    version: '3.10.1', title: 'Plus de village, moins d’interface',
    items: [
      { icon: 'map', title: 'La carte retrouve sa place', text: 'Des compteurs plus fins et une barre d’outils discrète libèrent la vue. Les nouveaux pictogrammes sont plus simples et plus légers.' },
      { icon: 'people', title: 'Tout votre village en un bouton', text: 'Boutique, passe, quêtes, commandes, succès, stock, amis, calques et événements se retrouvent dans le bouton Village. Un point vous signale les récompenses et cadeaux en attente.' },
    ],
  },
  {
    version: '3.10.0', title: 'Un nouvel écrin pour votre village',
    items: [
      { icon: 'hammer', title: 'Une interface qui prend du relief', text: 'Compteurs lumineux, boutons colorés, gemmes à portée de main et nouvelle barre de construction : votre village fait peau neuve.' },
      { icon: 'scroll', title: 'Ne manquez plus les nouveautés', text: 'Après chaque mise à jour, retrouvez ici les changements du jeu. Ce carnet reste disponible depuis l’accueil et le menu.' },
    ],
  },
  {
    version: '3.9.1', title: 'À votre rythme',
    items: [
      { icon: 'crate', title: 'Des commandes en temps réel', text: 'Une nouvelle commande arrive 6 heures après une livraison, ou 12 heures après un refus. Le délai avance même en pause ou jeu fermé.' },
      { icon: 'hand', title: 'Une barre d’outils simplifiée', text: 'Le bouton Explorer a été retiré. Déplacez toujours la carte avec le doigt et quittez un outil avec sa croix.' },
    ],
  },
  {
    version: '3.9.0', title: 'Des voies pour tous les quartiers',
    items: [
      { icon: 'road', title: 'Six styles de voies', text: 'Terre, asphalte, gravier, pavés, allée paysagée et grande avenue : composez vos quartiers et reliez leurs bâtiments.' },
    ],
  },
];

export function releasesSince(lastSeen) {
  const index = RELEASES.findIndex((release) => release.version === lastSeen);
  return index < 0 ? RELEASES : RELEASES.slice(0, index);
}
