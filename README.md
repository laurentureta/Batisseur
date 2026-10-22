# 🏘️ Bâtisseur

**Construis ton village en 3D, améliore-le et fais-le grandir jusqu'à la métropole.**

Un jeu de construction de ville pour iPhone (et tout navigateur récent) : routes, maisons, commerces, fermes, services, monuments… Chaque bâtiment s'améliore, ta mairie monte en rang, et ton hameau devient peu à peu une grande ville.

👉 **Jouer : https://laurentureta.github.io/Batisseur/**

---

## 📱 Installer sur iPhone

1. Ouvre le lien dans **Safari**.
2. Touche le bouton **Partager** ⬆️.
3. Choisis **« Sur l'écran d'accueil »**.

Le jeu s'ouvre alors en plein écran, comme une vraie appli, et fonctionne même **hors ligne**. Ta partie est sauvegardée automatiquement sur ton téléphone.

## 🎮 Commandes

| Geste | Action |
|---|---|
| ☝️ Glisser un doigt | Déplacer la carte |
| 🤏 Pincer | Zoomer |
| 🔄 Tourner à deux doigts | Pivoter la vue |
| 👆 Toucher un bâtiment | Ouvrir sa fiche (améliorer, déplacer, détruire) |
| 🛣️ Route + glisser | Tracer une route |
| 🔨 Construire + toucher | Poser un bâtiment (↻ pour le tourner) |
| ↩️ Annuler | Annuler la dernière action (remboursée) |

Sur ordinateur : clic gauche pour déplacer, molette pour zoomer, clic droit pour pivoter, `R` pour tourner un bâtiment, `Échap` pour quitter un outil.

## ✨ Ce que contient le jeu

- **Vrais modèles 3D** : près de 200 modèles — maisons, commerces, châteaux, immeubles, véhicules et décors (packs KayKit et Kenney), du hameau médiéval à la ville moderne, avec chantier animé à chaque construction.
- **HUD de jeu dessiné sur mesure** : plus de 140 icônes vectorielles (ressources, outils, bâtiments, météo, avatars…) au style « jeu mobile », compteurs, boutons et barre d'outils façon jeu pro.
- **Monde 3D « maquette »** avec cycle jour/nuit, fenêtres et lampadaires allumés la nuit, saisons (neige l'hiver !), météo, nuages, passants et voitures.
- **Une fête chaque semaine, toute l'année** 🎉 : chaque semaine, une journée d'événement (le jour change d'une semaine à l'autre). Les grandes dates reviennent chaque année (Nouvel An, Galette des rois, Chandeleur, Saint-Valentin, Carnaval, Pâques, 1er Mai, Fête de la musique, 14 juillet, Halloween, Marché de Noël, Noël…) et les autres semaines piochent parmi plus de 20 fêtes surprises (Ruée vers l'or, Grand Jackpot, Braderie à −50 %, Cirque, Fête foraine, Chasse au trésor, Montgolfières…). Chaque fête a ses bonus (impôts ×2, commerces ×2, production ×1,5, XP du passe ×2…), ses objets à ramasser dans le village, 5 défis et 8 paliers de récompenses tirés au sort : des pièces en masse, des gemmes, des coffres, des titres, des toits et **35 décorations exclusives** en 3D. Le calendrier se met à jour tout seul.
- **Passe de combat** 🎖️ : une saison de 4 semaines (saison 1 : *La Nuit des Citrouilles* 🎃), 40 paliers gratuits + 40 paliers du **Passe Royal**, paliers bonus et 7 défis de la semaine.
- **Boutique** 🛒 et **gemmes** 💎 : coffres (bois, argent, or, royal), boosts (récolte ×2, impôts ×1,5, fête, afflux d'habitants), packs de ressources, offres du jour, 31 décorations exclusives et 11 thèmes de toits. Les gemmes se gagnent uniquement en jouant — aucun achat réel.
- **Cadeau du jour** (calendrier de 7 jours), coffre gratuit toutes les 4 heures, profil du maire (nom, avatar, titres, statistiques).
- **3 terrains de départ** : Vallée verdoyante, Côte sauvage, Pied des montagnes.
- **25 zones à débloquer** : tu choisis où agrandir ton territoire (forêts, lacs, montagnes, littoral…).
- **40 types de bâtiments**, la plupart avec **5 niveaux** qui changent leur apparence : de la cabane à l'immeuble.
- **La mairie, colonne vertébrale** : 8 rangs, de Hameau à Métropole. Elle débloque les niveaux des autres bâtiments.
- **Économie complète** : bois, pierre, blé → farine → pain, planches, argile → briques, fer → outils, stockage, négoce.
- **Habitants exigeants** : eau, commerces, loisirs, éducation, santé, sécurité, beauté du quartier, pollution, chômage.
- **Main-d'œuvre avec priorités** : nourriture, puis production, commerces et services.
- **Progression** : niveau du village de 1 à 50, 46 quêtes principales, missions du jour, 14 succès à paliers, tableau des commandes.
- **Événements** : fêtes de village, récoltes exceptionnelles, sécheresses, marchand ambulant, incendies (pense aux pompiers !).
- **Monuments** : tour de l'horloge, stade, gare, phare, château, arc de triomphe.
- **Deux modes** : Carrière (budget et déblocages) ou Libre (ressources illimitées).
- **Calques** pour voir la couverture des services, le bonheur, la beauté et la pollution.
- **3 emplacements de sauvegarde**, export / import de sauvegarde.

## 🗂️ Organisation du projet

```
index.html              page du jeu
manifest.webmanifest    installation sur l'écran d'accueil
sw.js                   mode hors ligne (service worker)
css/style.css           interface
lib/                    Three.js (moteur 3D, licence MIT)
assets/models.bin       modèles 3D KayKit / Kenney (CC0), préparés par tools/bake_models.py
assets/keyart.jpg       image de l'écran de chargement (rendue avec le moteur du jeu)
fonts/                  polices Lilita One et Fredoka (licence OFL)
icons/                  icônes de l'appli et logo (tools/make_logo.py)
src/
  main.js               démarrage
  version.js            numéro de version
  core/                 cœur du jeu : état, actions, sauvegarde, sons, profil et événements (meta.js)
  data/                 ⚙️ réglages du jeu : bâtiments, quêtes, progression, ressources, passe, boutique
  world/                carte, terrain, génération procédurale
  sim/                  simulation : économie, habitants, progression, événements
  render/               rendu 3D : terrain, routes, bâtiments, caméra, effets
  input/                gestes tactiles et souris
  ui/                   interface : barre du haut, menus, fiches, panneaux
```

### Modifier l'équilibrage

Tout se règle dans `src/data/` :

- `buildings.js` : coûts, production, rayons d'action, niveaux de chaque bâtiment ;
- `progression.js` : courbe d'XP, rangs de la mairie, prix des zones ;
- `quests.js` : quêtes principales, missions du jour, succès ;
- `resources.js` : ressources et leur valeur ;
- `pass.js` : saisons du passe de combat, paliers, défis de la semaine ;
- `shop.js` : coffres, boosts, packs, prix en gemmes, cadeau du jour ;
- `events.js` : fêtes de la semaine (thèmes, dates, bonus, récompenses, défis).

### Publier une mise à jour

Après une modification, change la valeur `VERSION` en haut de `sw.js` (et dans `src/version.js`) pour que les joueurs reçoivent la nouvelle version. Le jeu propose alors « Mettre à jour ».

## 🛣️ Feuille de route

- [ ] Progression hors ligne (le village continue de tourner quand l'appli est fermée)
- [ ] Mode photo pour partager une image de sa ville
- [x] Personnalisation des toits (thèmes)
- [ ] Personnalisation des façades
- [ ] Trains et bateaux animés
- [ ] Musique d'ambiance
- [ ] Nouveaux événements (tempêtes, touristes, élections municipales)

## Crédits

Jeu créé avec [Three.js](https://threejs.org) (licence MIT, voir `lib/THREE-LICENSE.txt`).

Modèles 3D : packs gratuits et libres de droits (CC0) de **KayKit** par Kay Lousberg (Medieval Hexagon, City Builder Bits, Halloween Bits, Restaurant Bits) et de **Kenney** (voir `assets/CREDITS.md`). Ils sont regroupés dans `assets/models.bin` par `tools/bake_models.py`.

Icônes : dessinées pour le jeu en SVG (`src/ui/iconDefs.js`).

Polices : **Lilita One** et **Fredoka** (Google Fonts, licence SIL OFL, voir `fonts/`). Sons générés en code.
