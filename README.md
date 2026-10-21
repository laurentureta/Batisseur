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

- **Monde 3D « maquette »** low-poly, généré en code (aucune image à charger), avec cycle jour/nuit, saisons (neige l'hiver !), météo, passants et voitures.
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
icons/                  icônes de l'appli
src/
  main.js               démarrage
  version.js            numéro de version
  core/                 cœur du jeu : état, actions, sauvegarde, sons
  data/                 ⚙️ réglages du jeu : bâtiments, quêtes, progression, ressources
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
- `resources.js` : ressources et leur valeur.

### Publier une mise à jour

Après une modification, change la valeur `VERSION` en haut de `sw.js` (et dans `src/version.js`) pour que les joueurs reçoivent la nouvelle version. Le jeu propose alors « Mettre à jour ».

## 🛣️ Feuille de route

- [ ] Progression hors ligne (le village continue de tourner quand l'appli est fermée)
- [ ] Mode photo pour partager une image de sa ville
- [ ] Personnalisation des façades et des toits
- [ ] Trains et bateaux animés
- [ ] Musique d'ambiance
- [ ] Nouveaux événements (tempêtes, touristes, élections municipales)

## Crédits

Jeu créé avec [Three.js](https://threejs.org) (licence MIT, voir `lib/THREE-LICENSE.txt`). Modèles 3D, sons et interface générés en code.
