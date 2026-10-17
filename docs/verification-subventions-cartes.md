# Vérification de Subventions — une carte par programme (2026-10-16)

> **Passée par Claude en DEV le 2026-10-16.** Corrigé en chemin : les compagnies
> verrouillées (qui ont une ligne de suivi) avaient l'air décochées dans
> « Modifier ». **Reste pour Maxime** : regarder les cartes regroupées en PROD
> après la mise en ligne (§1), surtout celles qu'il avait déjà retenues.

Demande de Maxime : une seule carte par subvention, avec des étiquettes de
compagnie ; en la retenant, on choisit les compagnies qui déposent, et chacune
a sa ligne de suivi. Migration `20261016235848_subventions_cartes_par_programme`.

En DEV seulement (base locale), aperçu `subventions-essai`
(http://localhost:5202/subventions), compte `admin@camp.test`. Cartes d'essai
du `seed.sql` : « Jeunesse Canada au travail (essai) » (en cours, GBPA+),
« Emplois d'été Canada 2027 (essai) » (obtenue, GBPA+, reddition et salaires),
« Programme d'appui au développement des attraits touristiques (essai) »
(à valider, GBPA+, Opikawa et Trembloc).

## 1. Doublons existants réunis (migration)

- [x] Même année de découverte et même `program_key`, ou même adresse et même type, de proche en proche. — répétée sur une copie des 128 subventions de la PROD dans une transaction annulée : **67 cartes** (22 programmes regroupés, 83 doublons réunis)
- [x] Deux programmes différents sur la même page (Ville de Mont-Tremblant : accessibilité et soutien aux organismes) restent séparés (types différents).
- [x] La carte la plus avancée reste (obtenue, en cours, refusée, en attente, nouvelle, expirée, rejetée) ; ce qui lui manque est pris chez les autres ; période financée et montants potentiels par paires.
- [x] « Pourquoi Claude la propose » : une justification par compagnie (« GBPA+ : … ») quand elles diffèrent.
- [x] Chaque compagnie retenue devient une ligne de suivi avec son statut, ses montants et ses dates. — PROD : Emplois d'été Canada et Jeunesse Canada au travail, 5 lignes chacune
- [x] Notes, décisions, heures, propositions, étapes de reddition et attributions salariales passent à la carte gardée (étapes et salaires sur la ligne de leur compagnie). Décisions identiques réunies. — DEV : 2 étapes et 3 salaires d'EÉC 2027 sur la ligne GBPA+
- [x] Une carte groupée de nouvelles et de rejetées reste à valider (statut le plus avancé).

## 2. À valider

- [x] Une carte par programme, avec les étiquettes de ses compagnies (couleur du référentiel).
- [x] Filtre par entreprise : les cartes qui portent cette compagnie.
- [x] « Retenir… » : cases des compagnies (celles de la carte d'abord ; une seule = déjà cochée), au moins une ; « Retenir pour 2 compagnies ». — PADAT (essai) retenue pour GBPA+ et Trembloc : 2 lignes dans le Suivi
- [x] « Rejeter… » : la carte entière, une fois (« ne sera plus proposée, pour aucune compagnie »). — Un premier emploi (essai), 2 compagnies, rejetée d'un coup
- [x] Recherche : « Déjà décidées » avec les étiquettes et le statut.
- [x] « Ajouter une subvention » : cases « Pour » (au moins une compagnie).

## 3. Fiche

- [x] En-tête : statut, étiquettes des compagnies, année fiscale ; « Retenir… » / « Rejeter… » à valider, « Remettre à valider » / « Retenir… » rejetée ou expirée.
- [x] « Suivi par compagnie » : une ligne par compagnie (statut, demandé, accordé, reçu) ; « Obtenue » pose la date d'octroi du jour. — Trembloc obtenue : 2026-10-16
- [x] Statut de la carte tiré des lignes : en cours s'il en reste une en cours, sinon obtenue, sinon refusée ; dernière ligne retirée : à valider. — SQL
- [x] Ajouter une compagnie au suivi, la retirer (confirmation : montants, étapes et salaires supprimés).
- [x] Reddition de compte par ligne, repliable ; « Reprendre les étapes de » propose d'abord la même subvention pour une autre compagnie (★). — 1 étape de Trembloc reprise pour GBPA+
- [x] « Modifier » : cases des compagnies ; celles qui ont une ligne restent cochées.
- [x] Rejeter une carte qui a des lignes : refusé par la base. — SQL

## 4. Suivi et attribution salariale

- [x] Suivi : une ligne par compagnie qui dépose (compagnie, statut de sa demande, montants) ; totaux sur les lignes ; filtres Toutes les demandes / En cours / Obtenues / Refusées.
- [x] Colonne **Responsable** (ajout du 2026-10-16) : choisie sur place (« À assigner » au départ), sans ouvrir la fiche ; aussi sur chaque ligne de la fiche. Choix : comptes qui écrivent dans Subventions (`subventions.responsables()`). — Admin Test sur Jeunesse Canada au travail (essai)
- [x] Attribution salariale : un groupe par ligne de suivi (« programme — compagnie ») ; « Ajouter un employé » propose les lignes en cours ou obtenues.

## 5. Recherche (Worker) et agenda

- [x] Programme déjà connu pour une autre compagnie (même clé, ou même adresse et type) : la compagnie s'ajoute à la carte avec sa justification, pas de nouvelle carte ; rejetée : rien. — SQL (CanExport retrouvé pour Trembloc)
- [x] Prompt : programmes connus de tout le groupe avec « pour » ; reproposer avec la même clé un programme connu pour une autre entreprise. — tests
- [x] Mise à jour ciblée : cartes où l'entreprise a une ligne ; nouvelle édition d'une obtenue = nouvelle carte avec les mêmes compagnies. — SQL
- [x] Mémoire : chaque décision avec toutes les compagnies de la carte. — SQL
- [x] Agenda : titre avec les compagnies des lignes pas refusées ; reddition seulement pour les lignes obtenues. — tests (`npm run test:worker` : 151 réussis)
