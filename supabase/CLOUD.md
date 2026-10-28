# Comptes et sauvegardes cloud — v6

Supabase Auth gère e-mail, mot de passe, confirmation et récupération. Le navigateur utilise uniquement la clé publique et le JWT de sa session ; aucun mot de passe n’est stocké dans les sauvegardes. Les jetons de session restent sur l’appareil comme pour une application web connectée.

La migration `007_cloud_saves.sql` crée deux tables privées, protégées par RLS et `auth.uid()` : trois emplacements par utilisateur, cinq révisions chacun. Les RPC authentifiées vérifient l’identité de la session, les tailles, les emplacements et l’existence de l’identité multijoueur liée. Aucun identifiant de propriétaire fourni par le client ne permet de sélectionner un autre compte. Les tables sont lisibles seulement par leur propriétaire et modifiables uniquement via les fonctions validées.

## Activer

Le jeton `SUPABASE_ACCESS_TOKEN` doit être injecté via les secrets de l’environnement cloud, jamais collé dans le chat ou dans Git.

```bash
python3 tools/deploy_v6.py
```

Ce script applique les migrations additives `004`, `006` et `007`, active l’authentification par e-mail et les inscriptions, et conserve les URL autorisées existantes en ajoutant celle du jeu. Les liens de confirmation et de récupération reviennent vers `https://laurentureta.github.io/Batisseur/`. Le projet doit disposer d’un service d’envoi d’e-mails opérationnel pour recevoir ces messages.

Pour activer aussi les rappels téléphoniques déjà préparés :

```bash
python3 tools/deploy_v6.py --with-push --keys /workspace/.onboarding/push-secrets.json
```

Le trousseau privé reste hors du dépôt ; conserver durablement ce fichier selon les instructions de `PUSH.md`. Sans jeton, aucune opération distante n’est tentée. Le script ne crée aucun compte de joueur, n’envoie aucun e-mail et ne modifie aucun village.

## Comportement

- Le premier envoi et les remplacements cloud sont choisis explicitement. Ensuite, le village lié peut se synchroniser environ toutes les 90 secondes lorsque le jeu est ouvert et connecté. L’export local reste disponible.
- Chaque écriture présente la révision attendue. Un autre appareil ayant enregistré entre-temps provoque un conflit ; aucune copie n’est écrasée automatiquement. Un envoi manuel peut choisir de remplacer la tête cloud après confirmation, avec maintien de l’historique limité à cinq versions.
- Restaurer un village restaure aussi le profil et le code ami enregistrés avec lui. Une copie des données locales remplacées permet d’annuler la dernière restauration. Le jeu gèle ses écritures pendant la transaction et le rechargement pour ne pas écraser la version restaurée avec l’ancien état en mémoire.
- L’annulation rétablit les fichiers locaux sauvegardés avant restauration et suspend leur synchronisation automatique. Une ancienne version restaurée ne repart pas automatiquement vers le cloud.
- Échec de sauvegarde locale, stockage saturé, perte de réseau ou changement de compte pendant une réponse ne doivent pas écraser une autre copie. Les appels authentifiés vérifient leur génération de session avant l’envoi et après la réponse ; le renouvellement d’une ancienne connexion ne peut pas ressusciter un compte déconnecté.
- Le serveur limite les documents à 3 Mio par village, 200 Kio par profil et une écriture toutes les 20 secondes par emplacement. Les parties du bot ne peuvent pas être téléversées.

## Vérifier

`node --test tests/cloud.test.js` vérifie conflits, restauration annulable, absence de perte lors d’un échec, changements de comptes, renouvellement, seed zéro et interdiction d’envoyer une sauvegarde locale échouée. `tests/cloud.integration.sql` vérifie les RPC, RLS, l’historique borné et la validation de l’identité dans une base PostgreSQL isolée avec le schéma existant et un schéma `auth` de test.

L’essai navigateur avec réponses simulées vérifie la restauration à travers un véritable rechargement de page. Il ne prouve pas la disponibilité du serveur de production ni l’arrivée réelle d’un e-mail. Après activation : créer son compte depuis le jeu, confirmer son e-mail, enregistrer un village, se connecter sur un second appareil et le restaurer ; vérifier aussi le conflit et la récupération du mot de passe.
