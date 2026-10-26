// Ajouter chaque nouvelle version ici, de la plus récente à la plus ancienne.
export const RELEASES = [
  {
    version: '4.0.0', title: 'Mon village, toute une région',
    items: [
      { icon: 'map', title: 'Des quartiers qui ont leur caractère', text: 'Nommez vos quartiers, associez leurs zones et spécialisez-les. Leur composition apporte de vrais bonus à la production, au commerce, au bonheur ou au tourisme.' },
      { icon: 'hammer', title: 'Trois grands projets', text: 'La Place des Fêtes, le Jardin des Horlogers et le Port des Explorateurs se construisent par étapes, en temps réel. Leur modèle 3D évolue à chaque inauguration.' },
      { icon: 'people', title: 'Les familles du village', text: 'Retrouvez les Rivière, les Morel et les Delorme. Leurs histoires suivent leurs maisons, vos bâtiments et vos voyages, avec des récompenses à gagner.' },
      { icon: 'crate', title: 'Des marchandises en mouvement', text: 'Organisez des tournées de charrettes et de camions vers l’entrepôt. Les marchandises attendent leur véritable arrivée avant de rejoindre le stock.' },
      { icon: 'road', title: 'Une région à développer', text: 'Fondez des villages sur l’Île des Vergers, dans la Vallée des Mines et au Rivage des Voyageurs. Reliez leurs stocks par caravanes, trains de fret ou cargos.' },
      { icon: 'sun', title: 'Votre village en carte postale', text: 'Personnalisez les façades, toitures et jardins. Le mode photo masque l’interface, règle le cadrage et la lumière, puis enregistre ou partage une vraie image du jeu.' },
      { icon: 'medal', title: 'Des coopératives entre maires', text: 'Rejoignez jusqu’à 20 joueurs, demandez des marchandises et participez aux chantiers collectifs. L’accès dépend de l’activation des coopératives sur le serveur.' },
    ],
  },
  {
    version: '3.11.0', title: 'Votre village en paysage',
    items: [
      { icon: 'map', title: 'Jouez à l’horizontale', text: 'Tournez votre téléphone pour profiter du village en grand. En portrait, le jeu vous invite à pivoter et met la simulation en pause, sans perdre votre partie.' },
      { icon: 'hammer', title: 'Une vraie interface de jeu de gestion', text: 'Compteurs colorés, niveau et population en haut, outils en bas : la carte garde le centre de l’écran.' },
      { icon: 'scroll', title: 'Vos activités à portée de doigt', text: 'Quêtes, commandes, stock, amis, boutique, passe et événements retrouvent leurs raccourcis visibles. Village garde les activités complémentaires.' },
    ],
  },
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
