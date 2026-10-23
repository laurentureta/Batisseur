# Serveur du multijoueur (Supabase)

Projet Supabase gratuit « batisseur » (région Paris). Le schéma a été appliqué en deux migrations :
`batisseur_multijoueur` puis `batisseur_limites` (voir `schema.sql`, qui reprend l'état final).

- Tables `players`, `friends`, `gifts` : RLS activé **sans aucune politique** → illisibles avec la clé publique.
- Fonctions `bat_*` (security definer) appelées par le jeu via `/rest/v1/rpc/…` : elles vérifient
  l'identifiant et le secret du joueur (haché en SHA-256), un cadeau par ami et par jour, contenu fixé
  côté serveur, 20 cadeaux récupérés par jour au plus, village visible seulement par les amis.
