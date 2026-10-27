# Aventures collectives

Appliquer `006_coop_adventures.sql` **après** `schema.sql` et `004_cooperatives.sql`. La migration est additive et réexécutable, avec transaction et rechargement du schéma PostgREST. Sans activation serveur, le jeu affiche que cette fonction est indisponible ; aucun progrès multijoueur n'est inventé.

Le fondateur choisit le Phare des équipiers, l'Exposition des villages ou la Gare des horizons. Chaque aventure possède trois étapes demandant une marchandise déterminée. Les dons sont toujours de vingt unités. Ils partagent le quota de deux cents marchandises par jour avec les demandes d'entraide et le chantier coopératif existant. Les progrès sont enregistrés côté serveur pour toute l'équipe. Une étape finie avance automatiquement la suivante. Une aventure suivante peut commencer vingt-quatre heures après l'inauguration finale.

À la fin de chaque étape, le serveur enregistre les membres présents comme bénéficiaires. Un membre arrivé après cette fin ne reçoit pas la récompense passée. Les bénéficiaires peuvent récupérer leurs pièces plus tard, y compris pendant une aventure suivante. Il faut appartenir à la coopérative concernée pour réclamer ses récompenses. Les gains sont de 200, 400 puis 800 pièces. Les récompenses finales déverrouillent de vraies décorations de la collection : Tour de guet, Statue d'or ou Moulin décoratif. Chaque décoration n'est attribuée qu'une fois par compte, sans conversion des doublons en gemmes.

Toutes les tables sont privées, avec RLS et révocation des droits directs. `bat_adventure` vérifie l'identité via le secret du joueur, verrouille la coopérative, impose les règles et les récompenses, et conserve le reçu de chaque opération. Les reçus partagent une limite de cent opérations par jour avec `bat_coop` et utilisent un espace de noms distinct. Un même UUID ne peut servir aux deux API. Le client réserve les ressources et enregistre cette réservation avant l'envoi. Une réponse perdue est redemandée avec le même UUID. Les gains et le reçu local sont sauvegardés ensemble avant de déverrouiller les décorations dans le profil.

**Limite de l'économie actuelle :** les stocks du village restent sauvegardés sur le téléphone. Le serveur limite les contributions et garantit les reçus, les droits et les récompenses, mais ne peut pas attester qu'un client modifié possédait réellement ses vingt ressources. Cette fonction n'est donc pas un inventaire compétitif entièrement autoritaire. Aucun accès aux données d'autres joueurs ou aux tables privées n'est permis par les RPC.

Vérification locale :

```bash
node --test tests/adventures.test.js tests/cooperative.test.js
psql -v ON_ERROR_STOP=1 -f tests/adventures.integration.sql
```

Le test SQL s'exécute dans une transaction annulée et uniquement sur une base de test préparée. Il couvre les rôles, l'identité, les trois étapes partagées entre plusieurs joueurs, les ressources fixées par le serveur, le quota commun, les opérations idempotentes, l'éligibilité après adhésion tardive, les gains uniques, les anciens cycles et le délai de vingt-quatre heures. Le client est testé pour les réponses perdues, les refus, les échecs de sauvegarde et les changements d'emplacement pendant les appels.
