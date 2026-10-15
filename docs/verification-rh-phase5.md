# Vérification du module RH — phase 5 (préparer la bascule)

> **Passée par Claude en DEV le 2026-10-15** (connecteur Airtable en lecture seulement, import appliqué à la base DEV, SQL, simulation et vraie passe du Worker, onglet Courriels dans le navigateur). Corrigés en chemin : le **premier résumé quotidien après un import listait les candidatures et dossiers entrés dans Airtable dans les 24 h d'avant** (2 candidatures du 14 octobre) — migration `20261015134435_rh_nouveautes_sans_import` : une ligne importée n'est jamais une nouveauté ; une relance de l'import **réécrivait toutes les lignes** (dates de mise à jour) et changeait l'ordre des identifiants Airtable de 4 personnes fusionnées — le script ne réécrit plus qu'une ligne dont une valeur a changé, identifiants triés ; contrôle « comptes Airtable = comptes de la base » ajouté à la fin du SQL ; variable inutilisée retirée du script. **Reste pour Maxime** : relire `docs/bascule-rh.md`, choisir l'option de publication (§1.4) et les actions du §9.

En DEV seulement (base locale ; vraies données d'Airtable). Aucune écriture dans Airtable, aucune action PROD, aucun courriel ailleurs que dans Mailpit (aucun n'est parti). La seule fiche fictive (« Essai Phase5 », `essai.phase5@camp.test`) a vécu dans une transaction annulée. Extraits, SQL et outils d'essai dans le scratchpad de la session (hors dépôt : données personnelles).

**Avant de commencer** : `npm run db:start` ; migrations RH appliquées en DEV (`npx supabase migration list --local`, jusqu'à `20261015134435`) ; `.dev.vars` avec `COURRIELS_MAILPIT`.

## 1. Extraits d'Airtable (connecteur de Claude, lecture seulement)

- [x] Seul outil appelé : `list_records_for_table` (base « RH » `appzxLZ4ZO0kb65xU`), une fois par table ; aucun outil qui crée, modifie ou supprime.
- [x] Champs demandés = ceux que lit `rh-airtable.mjs`, **sans NAS, compte, transit, institution, spécimen ni pièce jointe** ; contrôlé dans les 4 fichiers (aucun de ces champs présent).
- [x] Réponses enregistrées telles quelles (copie du fichier de l'outil, jamais recopiées) : Humains 322, Candidatures 323, Embauches 71, Banque 2025 435 — chaque fois = `totalRecordCount` (rien de coupé).
- [x] Ajouté dans Airtable depuis le 2026-10-12 (date de création) : 2 humains, 3 candidatures, 1 dossier d'embauche.

## 2. Import en DEV, sans la paie

- [x] `rh-airtable.mjs --depuis <extraits> --sortie <scratchpad>` (sans `--avec-paie`, sans `--fichiers`) : aucune ligne `rh.paie` dans le SQL ; le même SQL d'une génération à l'autre.
- [x] 1re passe : +3 personnes (692), +3 candidatures (328 : 1 « reçue » pour le printemps et l'été 2027, 2 acceptées pour l'automne 2026), +2 embauches (259 : automne 2026, une « lien envoyé », une « dossier reçu »), +1 dossier (73), +2 lignes de journal (« Dernier courriel envoyé » d'Airtable). Les lignes déjà là reçoivent les changements faits dans Airtable depuis le 12.
- [x] Contrôle à la fin du SQL : candidatures 323 = 323, dossiers d'embauche 71 = 71, humains 322 = 322, banque 2025 435 = 435 (« ok ») ; 687 personnes reliées à Airtable ; embauches importées à revoir : 0.
- [x] **Aucun doublon** : 2e, 3e et 4e passes, mêmes lignes ; avec le script corrigé, **0 ligne modifiée** d'une passe à l'autre (empreinte de toutes les colonnes, dates de mise à jour comprises).
- [x] Le script corrigé ne change aucune donnée par rapport à l'ancien (empreintes sans les dates de mise à jour identiques).
- [x] Déclencheurs ajoutés par les phases 2 à 4 : ils n'agissent que pour une personne connectée (journal, « A refusé le poste » qui annule) — l'import n'en a pas ; `taux_de_la_grille` pose le taux d'une **nouvelle** embauche si la grille en a un (grille vide en DEV : rien).
- [x] Aucune embauche orpheline (embauche créée par un import dont la candidature n'est plus acceptée) : 0 ; ajouté au contrôle.
- [ ] Pièces jointes des 3 nouvelles candidatures (CV) : pas ramenées (extraits sans pièces jointes, `rh-fichiers.mjs` pas lancé : aucun téléchargement pendant la répétition). Se fait à la bascule (`bascule-rh.md` §3.3).
- [ ] Branche `--avec-paie` : pas exercée (interdite en DEV) ; colonnes et contraintes de `rh.paie` visées par le script vérifiées en lecture (conformes) ; clé Vault `rh_cle_paie` présente en DEV.

## 3. Tables des phases 3 et 4 : rien à recevoir de l'import

- [x] Comptes avant et après l'import identiques : compagnies 5, connexions Gmail 0, réglages 6, modèles de courriels 10, courriels 0, modèles de contrats 2, contrats 0, taux 0, textes 4, invitations 1, codes de planification 13, cases 0, pilotage 0, consultations 3, paie 2, notes 1, documents 604.
- [x] Pourquoi rien n'est à importer : courriels envoyés par Airtable = historique (ligne de journal « Dernier courriel envoyé »), pas des courriels à envoyer ; contrats d'Airtable = PDF joints (documents, genre « contrat »), pas des contrats signés dans l'app ; aucune grille de taux dans Airtable (montants dans les pièces jointes) ; invitations : les réponses « Intention de retour » d'Airtable sont des candidatures (`source = retour`) ; planification, pilotage et diètes viennent de la feuille « Suivi RH 2026 » (saison 2026 finie : rien à reprendre) ; boîtes, modèles, textes, codes et réglages : posés par les migrations puis réglés dans l'app.
- [x] Conséquence notée dans `bascule-rh.md` §3.5 : une embauche importée « dossier reçu » ne se valide qu'avec un contrat signé dans l'app.

## 4. Aucun courriel préparé seul pour les données importées

- [x] App : aucun courriel préparé sans un clic (statut, bienvenue, invitations, « Préparer les rappels dus »). Worker : l'accusé seulement après une candidature du formulaire public ; le cron et le bouton appellent `preparerAutomatiques` (rappels, résumé).
- [x] `courriels_depuis` = 2026-10-15 (posé par la migration au jour où elle passe).
- [x] Simulation de `preparerAutomatiques` contre la base DEV (lectures seulement, `courriels_ajouter` intercepté, toute autre écriture refusée) **avant correction** : à 7 h 30 le 15, un résumé avec 2 candidatures importées → corrigé (migration).
- [x] **Après correction** : rien de préparé le 15 à 7 h 30 et à 9 h 50, le 16 à 7 h 30, le 22 à 7 h 30 (rappels à 7 jours).
- [x] Vraie passe (sans interception, Mailpit) le 15 à 7 h 30 et maintenant : 0 préparé, 0 envoyé ; `rh.courriels` = 0 ; Mailpit inchangé (8 messages, le dernier à 12 h 33 UTC, avant la répétition).
- [x] SQL, transaction annulée : une candidature et un dossier reçus **par l'app** restent dans le résumé (1 et 1) ; les mêmes avec un identifiant Airtable n'y sont pas.
- [x] Rappels : jamais pour une embauche importée (pas de lien de dossier de l'app, `jeton` vide).
- [x] Navigateur (aperçu fixe, compte admin) : RH › Courriels › À envoyer : « Rien à envoyer » ; Candidatures : pastille 2 (candidatures « reçues » à traiter, dont la nouvelle).

## 5. Migration et tests

- [x] `20261015134435_rh_nouveautes_sans_import` appliquée seule en DEV (psql, `begin … commit`) et inscrite (`migration repair --local`) ; `rh.nouveautes` exécutable par `service_role` seulement (comme avant).
- [x] `node --test worker/rh/*.test.js` : 43 sur 43 ; `oxlint` du script : propre.
- [x] Aucun écran modifié (pas de vérification au format téléphone à refaire).

## 6. Marche à suivre `docs/bascule-rh.md`

- [x] Établie en direct : `git diff origin/main dev` (223 fichiers : Réservations, RH, Feuilles de temps Employeur D, CRM « Fusionner », socle commun), `npx supabase migration list --local` (toutes appliquées en DEV ; 28 migrations de `dev` absentes de `main`). Jamais `--linked`.
- [x] **RH ne peut pas partir tout à fait seul** : il lit les colonnes Employeur D ajoutées par la migration `20261015120202_temps_employeur_d` des Feuilles de temps ; options A à D décrites, sans trancher.
- [x] Migrations RH dans l'ordre (8), dont 4 plus vieilles que la PROD (une par une, comme Bâtiments) ; schéma `rh` à exposer ; clé Vault ; secrets et variables ; composition d'une publication « RH seul ».
- [x] Jour J dans l'ordre (qui, comment vérifier), lendemain, retour arrière ; 11 automatisations à couper et 4 formulaires à fermer avec leurs identifiants.
- [ ] Relue par Maxime ; option de publication choisie. — à Maxime

## Décisions prises par Claude, à confirmer

- Résumé quotidien : une ligne importée d'Airtable n'est **jamais** une nouveauté (migration), plutôt que de compter sur `courriels_depuis` (une date : ce qui entre dans Airtable le jour J avant l'heure H aurait encore été listé).
- Import : une ligne n'est réécrite que si une valeur d'Airtable a changé ; identifiants Airtable triés ; le contrôle des comptes **n'annule pas** la transaction en cas d'écart (« ÉCART » à examiner : une fusion faite dans l'app peut l'expliquer).
- Import final : **par un jeton Airtable en lecture** plutôt que par le connecteur, pour que les NAS et comptes ne passent pas par la conversation (recommandation, `bascule-rh.md` §2).
- Répétition sans pièces jointes (aucun téléchargement) ; la copie « RH - Été 2026 (Charlotte) » et la base « RH - ACQ » n'ont pas été lues (hors consigne) : les VAJ notées seulement dans la copie de Charlotte ne seraient pas importées (`bascule-rh.md` §2).
- Embauches importées encore en cours : options décrites (annuler les saisons passées ; nouveau lien de dossier ; contrat à signer dans l'app pour valider), sans changer la règle de validation.
- Suggéré (Loi 25), à décider : effacer les NAS et comptes d'Airtable une fois l'import vérifié.

## 9. Avant la bascule (actions pour Maxime)

- [ ] Choisir l'option de publication (`bascule-rh.md` §1.4 : Feuilles de temps d'abord, ensemble, migration seule, ou tout `dev`).
- [ ] Sous-domaine emplois.camptremblant.com ; widget Turnstile (clé du site à Claude, `TURNSTILE_SECRET` dans Cloudflare).
- [ ] Client Google : vérifier si `GMAIL_CLIENT_ID` existe déjà (agenda des Subventions) et passer ce client en External publié, avec `gmail.send` et la redirection `/api/rh/retourgoogle` — sans le remplacer.
- [ ] Jeton Airtable en lecture dans `scripts/migration/.env.rh` et clé Supabase temporaire « import-rh », le jour J.
- [ ] Charlotte : VAJ de sa copie dans la base RH ; valeurs Employeur D et titre d'emploi.
- [ ] Relire le contrat type, faire relire le consentement parental, valider l'entente de bénévolat.
- [ ] Choisir le jour J (avant janvier) et prévenir l'équipe.
