# Les enregistrements d'ambiance

Le jeu sait jouer un lit d'ambiance fait de vrais enregistrements, fondus entre eux selon
l'heure, la saison et ce que la caméra regarde (`src/core/ambience.js`). **Tant que ces
fichiers sont absents, rien ne casse** : chaque couche manquante est simplement muette, et
l'ambiance synthétisée de `src/core/audio.js` continue de jouer comme avant.

## Les cinq couches attendues

| Fichier | Quand on l'entend | Ce qu'il doit contenir |
|---|---|---|
| `amb_jour.ogg` | de l'aube au crépuscule, atténué en hiver | oiseaux variés, vent léger dans les feuilles, insectes lointains |
| `amb_nuit.ogg` | la nuit | grillons, chouette de loin en loin, vent très calme |
| `amb_hiver.ogg` | en hiver, surtout le jour | vent froid, craquements, pas d'oiseaux chanteurs |
| `amb_village.ogg` | caméra proche, le jour, à partir d'une soixantaine d'habitants | rumeur humaine indistincte, charrettes, marteaux au loin, volaille |
| `amb_eau.ogg` | caméra proche d'un plan d'eau | clapot de rive, pas de vagues de haute mer |

## Contraintes techniques

- **Boucle parfaite** : le début et la fin doivent se raccorder sans clic. Prévoir un fondu
  croisé de la fin sur le début avant d'exporter.
- **Durée** : 30 à 60 secondes. Plus court s'entend comme une répétition, plus long alourdit
  le téléchargement pour rien.
- **Format** : Ogg Vorbis mono, 44,1 kHz, environ 96 kb/s. Viser moins de 700 ko par couche.
  (Mettre `.mp3` ou `.m4a` dans `LAYERS` si le format Ogg pose problème sur un appareil.)
- **Niveau** : normaliser à −20 LUFS environ. Le mélange final se règle par `gain` dans
  `LAYERS` ; les fichiers doivent être discrets, pas spectaculaires.
- **Aucun événement marquant** : pas d'aboiement net, pas de voix compréhensible, rien dont
  l'oreille puisse retenir le retour toutes les quarante secondes.

## Mise en cache

Inutile de les ajouter à la liste du service worker : ce sont de gros fichiers facultatifs, et
`sw.js` met déjà en cache tout ce qu'il sert au premier passage. La première écoute passe par
le réseau, les suivantes sont hors ligne.
