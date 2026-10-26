# Serveur du multijoueur (Supabase)

Projet Supabase gratuit « batisseur » (région Paris). Le schéma a été appliqué en deux migrations :
`batisseur_multijoueur` puis `batisseur_limites` (voir `schema.sql`, qui reprend l'état final).

- Tables `players`, `friends`, `gifts` : RLS activé **sans aucune politique** → illisibles avec la clé publique.
- Fonctions `bat_*` (security definer) appelées par le jeu via `/rest/v1/rpc/…` : elles vérifient
  l'identifiant et le secret du joueur (haché en SHA-256), un cadeau par ami et par jour, contenu fixé
  côté serveur, 20 cadeaux récupérés par jour au plus, village visible seulement par les amis.


## Coopératives (v4.0)

Exécuter `migrations/004_cooperatives.sql` dans le SQL Editor du projet après le schéma existant. La migration est additive et réexécutable ; elle crée des tables privées avec RLS et les RPC `bat_coop_capabilities` et `bat_coop`. Elle ne supprime ni les comptes, ni les amis, ni les villages.

Les opérations sont authentifiées par l’identité et le secret déjà utilisés par le jeu. Les dons valent toujours 20 bois, pierres ou nourritures ; le serveur impose 200 marchandises par joueur et jour, deux demandes en attente, cinq demandes par jour, 20 membres par groupe et des récompenses uniques. Une nouvelle ronde attend 24 heures après la fin du chantier. Les tables ne sont pas accessibles directement aux clés publiques. Les requêtes mutables portent un identifiant d’opération : rejouer une réponse perdue ne produit pas un nouveau don. Les colis en attente peuvent être annulés par leur propriétaire.

L’inventaire du village reste un inventaire de jeu hors ligne, modifiable sur l’appareil ; ces RPC ne constituent pas une économie compétitive entièrement autoritaire. Les limites et récompenses du serveur restent fixes, indépendamment des montants envoyés par le client. Aucun achat réel ni classement de ressources n’est introduit.

Le client enregistre la réservation des marchandises et son journal dans le même document de sauvegarde. Une erreur réseau laisse l’envoi à confirmer ; un refus explicite le rembourse. Un changement d’emplacement pendant une requête n’applique jamais le résultat à un autre village.

### Tests du serveur

Sur une base PostgreSQL 16 de test, créer le schéma `extensions` et les rôles `anon`, `authenticated`, puis appliquer `schema.sql`, `migrations/004_cooperatives.sql` et `../tests/cooperative.integration.sql` avec `psql -v ON_ERROR_STOP=1`. Le dernier fichier teste les droits, secrets, quotas, dons, récupérations et idempotence dans une transaction qui est annulée à la fin. Ne pas utiliser les comptes de test pour vérifier une installation de production : `select public.bat_coop_capabilities();` suffit pour contrôler sa disponibilité.

L’administration peut aussi exécuter cette migration par l’API de gestion Supabase avec un jeton fourni par un champ secret d’environnement, jamais dans le code du site ni dans le chat. La sauvegarde du fichier SQL dans GitHub ne l’exécute pas sur Supabase.
