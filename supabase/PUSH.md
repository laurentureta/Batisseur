# Notifications sur téléphone

Le jeu utilise **Web Push**, avec son service worker, une fonction Supabase Edge et un cron serveur exécuté chaque minute. Les notifications peuvent arriver lorsque le jeu est fermé. Aucun minuteur du navigateur ne simule ce service.

Sur iPhone/iPad, iOS **16.4 ou ultérieur** est nécessaire. Ouvrir le jeu dans Safari, choisir **Partager → Sur l’écran d’accueil**, puis ouvrir l’icône installée. Dans le jeu, **Village → Notifications**, toucher **Activer**. L’autorisation système n’est demandée que sur ce clic. Sur Android et ordinateur, les navigateurs compatibles peuvent aussi s’abonner.

## Activation côté serveur

Ne jamais coller de clé privée dans le jeu ou le chat. Injecter **SUPABASE_ACCESS_TOKEN** via le coffre de secrets de l’environnement cloud. Le rôle public `anon` et la clé publishable ne permettent pas d’activer ce service.

Depuis la racine du dépôt, exécuter :

```bash
python3 tools/deploy_push.py --keys /workspace/.onboarding/push-secrets.json
```

Le script applique la migration additive `005_push.sql`, crée une seule fois un trousseau VAPID hors du dépôt (permissions 600), enregistre les secrets Edge, déploie `push-dispatch` avec Supabase CLI, vérifie la fonction, puis configure les extensions `pg_cron`, `pg_net`, Vault et le cron. La clé publique est communiquée au jeu par `bat_push_config`. La clé privée ne sort jamais de la configuration serveur. **Sauvegarder durablement le trousseau hors de Git** : sa perte nécessiterait de réabonner les téléphones. Le script refuse de remplacer un trousseau déjà utilisé par le serveur.

Le script nécessite Python `cryptography`, Node/npm, et des accès HTTPS à api.supabase.com, au projet Supabase et au registre npm. Le jeton Management est uniquement lu en mémoire. Sans jeton, aucune requête distante n’est effectuée. Le script ne modifie ni les parties ni les comptes des joueurs. Le service conserve ses coûts d’exécution et de base Supabase habituels ; vérifier les limites de l’offre.

Pour désactiver immédiatement le service :

```sql
update public.push_config set enabled=false where id;
select cron.unschedule('batisseur-push-dispatch');
```

## Fonctionnement et limites

- Le joueur choisit commandes, constructions, grands projets, transports et cadeaux d’amis. Au plus cinq téléphones par compte.
- Après une sauvegarde réussie, les échéances des trois emplacements sont réconciliées séparément. Les régions sauvegardées sont incluses. Une annulation supprime le rappel en attente au prochain enregistrement. Une modification locale nécessite une connexion pour atteindre le serveur ; le serveur ne peut pas deviner une annulation faite hors ligne.
- Seuls les événements futurs et les 24 échéances les plus proches de chaque emplacement sont planifiés, jusqu’à sept jours. Les événements sont envoyés au plus une fois en cas normal ; les clés uniques empêchent une reprogrammation par les sauvegardes successives. Comme tout Web Push, une réponse réseau perdue après livraison peut entraîner une nouvelle tentative ; le `tag` stable remplace alors la notification affichée.
- Les vrais cadeaux sont ajoutés par un trigger serveur. Le cadeau quotidien du bot local n’envoie pas de notification distante.
- Le cron traite au plus vingt envois par passage et cinq simultanément. Bail de cinq minutes et cinq tentatives. Les abonnements expirés (404/410) sont supprimés. Plafond de huit notifications par téléphone sur vingt-quatre heures. Un événement âgé de plus de vingt-quatre heures n’est plus envoyé.
- Les corps des messages sont fixés par le serveur. Le client ne peut fournir ni texte libre ni lien externe. Endpoint limité aux fournisseurs Web Push connus, clés validées, tables privées avec RLS ; les fonctions de distribution sont réservées à `service_role`. Le cron s’authentifie avec son propre secret Vault. Ne pas exposer cette clé dans la configuration publique.
- Réception dépendante du réseau, des réglages et du système. La livraison peut être retardée. Aucun SMS ni notification native hors Web Push n’est annoncé.

## Vérification

`node --test tests/notifications.test.js` vérifie les échéances réelles, les régions, les préférences, la limite de calendrier, la compatibilité iOS, l’autorisation volontaire et la synchronisation. `tests/notifications.integration.sql` s’exécute après le schéma existant et la migration dans une base de test PostgreSQL, avec les rôles `anon`, `authenticated`, `service_role`.

Sur un téléphone réel, activer le service, créer un chantier, sauvegarder et fermer le jeu ; attendre son échéance, puis ouvrir la notification. Vérifier aussi désactivation, suppression des rappels après annulation, et blocage par le système. Les essais locaux/mocks ne prouvent pas une livraison réelle sur iPhone.
