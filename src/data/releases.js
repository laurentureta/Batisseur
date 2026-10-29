// Ajouter chaque nouvelle version ici, de la plus récente à la plus ancienne.
export const RELEASES = [
  { version: '6.4.0', title: 'De l’herbe qui pousse', items: [
    { icon: 'map', title: 'Une pelouse en trois dimensions', text: 'De vraies touffes d’herbe photographiées poussent autour de la caméra : elles prennent la couleur du sol et la saison qu’elles recouvrent, se couchent sous le vent avec les arbres et s’effacent doucement au loin. Zoome sur un jardin pour les voir de près.' },
    { icon: 'sun', title: 'Réglable depuis les options', text: 'La pelouse suit le réglage Qualité : touffue en Haute, allégée en Moyenne, désactivée en Économie si ton téléphone peine.' },
  ] },
  { version: '6.3.0', title: 'De la vraie pelouse', items: [
    { icon: 'map', title: 'L’herbe a du grain', text: 'Le sol n’est plus un aplat de vert. Brins croisés, touffes plus claires et plus sombres, grain fin : la pelouse se regarde de près. Le détail s’efface doucement avec la distance pour éviter le fourmillement, et la terre comme le sable en profitent aussi.' },
  ] },
  { version: '6.2.0', title: 'La résidence', items: [
    { icon: 'people', title: 'Un immeuble de logements', text: 'La Résidence se débloque au niveau 18 : huit logements, deux par palier, sur quatre niveaux. Balcons à panneaux colorés, cage d’escalier vitrée, toit-terrasse et panneaux solaires dès la première amélioration. Beaucoup d’habitants sur deux cases, mais des loyers modestes.' },
  ] },
  { version: '6.1.0', title: 'Une nouvelle lumière', items: [
    { icon: 'sun', title: 'Le village prend du relief', text: 'Rendu filmique, soleil plus franc et lumière d’ambiance plus discrète : les ombres portées se voient enfin, et les hautes lumières ne brûlent plus.' },
    { icon: 'map', title: 'Des prairies qui respirent', text: 'La palette du sol s’élargit : herbe tondue claire, verts profonds dans les creux, plaques sèches. Fini le vert uniforme.' },
    { icon: 'hammer', title: 'Les bâtiments posés au sol', text: 'Une ombre de contact douce sous chaque construction. Elles ne flottent plus au-dessus de l’herbe, même en plein midi.' },
  ] },
  { version: '6.0.2', title: 'Toujours à jour', items: [
    { icon: 'scroll', title: 'La dernière version s’installe toute seule', text: 'Quand tu ouvres le jeu sans partie en cours, la mise à jour s’applique immédiatement. En pleine partie, elle attend toujours ton accord pour ne rien interrompre.' },
  ] },
  { version: '6.0.1', title: 'Du neuf bien rangé', items: [
    { icon: 'scroll', title: 'Les activités s’ouvrent à leur tour', text: 'Ateliers, Développer, urbaniste, marchés, parc et coopératives apparaissent dans Village avec le niveau qui les débloque, au lieu d’être tous proposés dès le départ.' },
    { icon: 'hammer', title: 'Le menu Construire en grand', text: 'En paysage, la fenêtre profite de toute la largeur et les huit familles de bâtiments tiennent à l’écran : plus d’onglet coupé.' },
    { icon: 'crate', title: 'Des messages compréhensibles', text: 'Les erreurs du service de sauvegarde s’affichent en français, et le jeu prévient tout de suite si le stockage du téléphone est plein.' },
    { icon: 'event', title: 'Le parc ne se bloque plus', text: 'Un changement d’heure ou de fuseau ne gèle plus les recettes du Parc des Merveilles.' },
  ] },
  { version: '6.0.0', title: 'Ma ville, ma stratégie', items: [
    { icon: 'map', title: 'Bellerive, une île achevée', text: 'Capucine vous accueille sur une île entièrement recomposée : quartiers architecturaux, monuments, marina, parc et jardins. Tous les types de bâtiments y sont représentés au niveau maximal ; sept points de vue permettent de la découvrir.' },
    { icon: 'hammer', title: 'Des recettes à choisir', text: 'Quatorze recettes et neuf nouvelles marchandises : tissus, vêtements, meubles, viennoiseries et bien plus. Préparez jusqu’à six lots par atelier, avec de véritables ingrédients réservés, des délais réels et un stockage limité.' },
    { icon: 'road', title: 'Le mode urbaniste', text: 'Déplacez ensemble vos bâtiments et leurs routes après validation. Rangez vos décorations sans perdre leur apparence, enregistrez des plans et construisez-les avec le budget et les chantiers habituels.' },
    { icon: 'people', title: 'Les voyageurs découvrent votre ville', text: 'Les visiteurs comptés dans le parc arrivent, visitent les attractions et fréquentent les restaurants accessibles. Le train, la beauté et les offres de restauration influencent la fréquentation et les dépenses.' },
    { icon: 'crate', title: 'Des marchés régionaux vivants', text: 'Les prix et les besoins changent toutes les quinze minutes. Chaque marché possède des stocks et un budget limités ; vos achats et ventes utilisent les ressources du village sélectionné.' },
    { icon: 'medal', title: 'Trois aventures à partager', text: 'En coopérative, choisissez le phare, l’exposition ou la gare régionale. Financez leurs trois étapes ensemble et recevez des récompenses et une décoration. Nécessite l’activation du service serveur.' },
    { icon: 'scroll', title: 'Un compte et cinq versions de chaque village', text: 'Connectez votre compte pour sauvegarder trois villages, votre profil et votre code ami. Retrouvez-les sur un autre appareil ou restaurez une version précédente. Les conflits suspendent la synchronisation ; le service cloud doit être activé sur le serveur.' },
  ] },
  {
    version: '5.0.0', title: 'Une ville qui vit',
    items: [
      { icon: 'hammer', title: '240 nouvelles maisons, commerces, services et décorations', text: 'Six collections architecturales, de nouvelles silhouettes 3D et un catalogue avec recherche, collections et pagination pour composer votre ville.' },
      { icon: 'people', title: 'Les habitants ont leur journée', text: 'Les familles rejoignent les commerces, les écoles et les parcs reliés à leur quartier, puis rentrent chez elles. Leurs déplacements suivent les routes de votre ville.' },
      { icon: 'road', title: 'Le fret prend vie', text: 'Les livraisons régionales animent les trains de marchandises et les cargos : chargement, départ et retour suivent leurs véritables échéances.' },
      { icon: 'map', title: 'Vos régions travaillent ensemble', text: 'Les bâtiments continuent à produire en votre absence, dans la limite de huit heures et de leurs stocks. Organisez des liaisons régulières et financez des contrats ferroviaires ou maritimes.' },
      { icon: 'event', title: 'Le Parc des Merveilles', text: 'Six attractions se construisent par étapes : entrée, jardins, gourmandises, carrousel, grande roue et théâtre. Reliez-les pour accueillir des visiteurs et recevoir leurs recettes.' },
      { icon: 'medal', title: 'Les festivals de votre ville', text: 'Approvisionnez une fête chaque semaine, gagnez une décoration saisonnière et exposez vos trophées au parc. Les projets des coopératives restent accessibles depuis leur propre écran.' },
      { icon: 'people', title: 'Capucine développe vraiment son village', text: 'Votre amie simulée possède ses habitants, ses ateliers et ses stocks. Elle finance de nouveaux bâtiments, inaugure ses chantiers et conserve sa progression entre vos visites.' },
      { icon: 'scroll', title: 'Des notifications sur téléphone', text: 'Un écran dédié permet de connecter votre téléphone aux rappels de commandes, travaux, livraisons et cadeaux. Les envois nécessitent l’activation du service serveur ; sur iPhone, installez le jeu sur l’écran d’accueil.' },
      { icon: 'sun', title: 'Un affichage plus propre sur mobile', text: 'Panneaux adaptés aux encoches, saisie plus confortable et étiquettes de carte qui évitent les chevauchements et les bords de l’écran.' },
    ],
  },
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
