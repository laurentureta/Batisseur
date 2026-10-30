# Banc d'essai

Fait jouer Bâtisseur par une machine, sans écran et à l'horloge accélérée, pour mesurer
l'équilibrage au lieu de le deviner.

```
node tools/sim/run.mjs [jours] [sortie.json]
```

Par défaut : trois profils de joueur (pressé, régulier, acharné) sur trois cartes, 21 jours
de temps réel chacun. Le relevé indique la progression atteinte, la part de moments où le
joueur n'a rien à faire, ce qui le bloque, les quêtes sur lesquelles il stagne, les bâtiments
que personne ne construit jamais et les ressources en surplus ou en pénurie.

| fichier | rôle |
|---|---|
| `clock.mjs` | horloge virtuelle : remplace `Date.now`, car les chantiers suivent le temps réel |
| `world.mjs` | crée une partie sans rendu et avance le monde comme la boucle du jeu |
| `town.mjs`  | l'urbanisme du joueur automatique : trame de rues et parcelles |
| `player.mjs`| ses décisions : inaugurer, livrer, suivre la quête, loger, nourrir, améliorer |
| `run.mjs`   | la campagne et le dépouillement |

`clock.mjs` doit être importé en premier : il remplace l'horloge globale avant que les
modules du jeu ne la capturent.

Le joueur automatique ne cherche pas à bien jouer. Il joue comme quelqu'un qui suit les
quêtes et bouche les trous — ce sont ses blocages, pas ses performances, qui nous intéressent.
