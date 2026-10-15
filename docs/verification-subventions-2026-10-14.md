# Vérification de Subventions — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14.** Corrigés en chemin : en-tête de la fiche écrasé sur téléphone (le nom du programme disparaissait derrière les boutons), cartes de totaux de l'attribution salariale trop hautes sur téléphone, nom d'un employé répété quand son nom de camp est son nom (« Luc Brunette (Luc Brunette) »), bouton « Supprimer » au lieu de « Retirer » dans la confirmation d'une ligne de salaire. **Reste pour Maxime** : créer l'agenda Google « Subventions » et son jeton (§8), §7 (décisions) ; une vraie recherche (large et mise à jour) seulement en PROD, avec la clé Claude.

En DEV seulement (base locale). **Aucun appel réel à l'API Claude** : la base
locale n'a pas de clé `ANTHROPIC_API_KEY` (« Lancer maintenant » est grisé) ;
la recherche en deux temps est vérifiée par les tests du Worker (réseau
simulé) et par les fonctions SQL avec une fausse réponse de Claude. **Jamais
Google** depuis une base locale : l'agenda est simulé (`essai-subventions`).

**Avant de commencer** : `npm run db:start`, puis l'aperçu `subventions-essai`
(http://localhost:5202/subventions) ; le Worker local (port 8787) part avec
`npm run dev`. Compte `admin@camp.test`. Données d'essai du `seed.sql` :
« Jeunesse Canada au travail (essai) » (en cours, une proposition de Claude) et
« Emplois d'été Canada 2027 (essai) » (obtenue, deux étapes de reddition),
avec 4 lignes d'attribution salariale.

## 1. Recherche 4 fois par année

- [x] Worker : passages du 1er au 7 octobre, janvier, avril et juillet, à l'heure pile de 8 h à 11 h UTC (`estTourTrimestriel`) ; plus rien le lundi. — tests : 1er janvier 8 h oui, 12 octobre (un lundi) non, 8 octobre non, 8 h 15 non
- [x] Le cron reste `*/15 * * * *` (partagé) ; seule la logique de Subventions a changé (`passageSubventions` dans `worker/index.js`, une ligne).
- [x] Un travail par passage, choisi par la base (`prochaine_tache_trimestre`) : d'abord la recherche large de chaque entreprise active, puis la mise à jour de ses retenues ; rien quand tout est fait. — SQL : `large` puis `ciblee` puis rien
- [x] En pause (Réglages), rien ne part ; secrets manquants : rien. — tests
- [x] Subventions échues (nouvelles ou en attente, date limite passée) expirées chaque jour à 8 h UTC (avant : seulement avec le courriel du lundi).
- [x] Recherches › Configuration : « active, 4 fois par année (début d'octobre, janvier, avril et juillet) : prochaine le 1 janv. 2027 » ; en pause : « en pause ». Validation vide : « La prochaine recherche automatique a lieu le 1 janv. 2027 ».
- [x] Réglages › Recherche automatique : « Chercher 4 fois par année… », le texte dit qu'aucun courriel n'est envoyé.
- [x] « Lancer maintenant » reste, avec le choix « Recherche large » ou « Mise à jour des retenues » (sans la mémoire : seulement pour la large). — grisé en DEV (pas de clé Claude), comme prévu

## 2. Recherche en deux temps (mise à jour ciblée)

- [x] Retenues à mettre à jour (`retenues_a_verifier`) : en cours, ou obtenues de l'année fiscale ou la précédente sans édition suivante ; 10 par appel, les moins récemment vérifiées d'abord. — SQL : EÉC 2026 obtenue et JCTDLO en cours ; EÉC 2025 (qui a une édition suivante) exclue
- [x] Prompt : chaque subvention avec une référence (S1, S2…) et ce que l'app en sait ; une obtenue « ne change rien », seulement sa nouvelle édition. — tests
- [x] Champ vide → rempli directement, avec une trace « Complété par Claude » sur la fiche. — SQL : ouverture, période financée, critères remplis
- [x] Champ rempli qui changerait → proposition à valider sur la fiche (encadré ambre « Claude propose un changement ») ; jamais écrasé. — SQL : date limite 1er → 15 févr. en proposition, la subvention garde le 1er
- [x] Même lien (à la barre près) et même montant : rien de proposé. Fin de période avant le début : le champ reste vide (la base refuse, la mise à jour continue).
- [x] Accepter → le champ prend la valeur ; Refuser → la même valeur n'est plus jamais reproposée. — navigateur (Accepter) et SQL (Refuser puis nouveau passage : 0 proposition)
- [x] Une nouvelle proposition pour le même champ remplace l'ancienne (une seule ouverte par champ).
- [x] Obtenue : ses dates ne changent jamais ; une nouvelle édition annoncée devient une subvention « Nouvelle » liée à l'obtenue (`previous_grant_id`), une seule fois. — SQL : « Emplois d'été Canada 2027 » créée, 2e passage = doublon
- [x] Journal : pastille « mise à jour » ; « 2 vérifiées : 3 champs complétés, 1 changement à valider sur la fiche, 1 nouvelle édition (à valider) ».
- [x] Réponse illisible : rattrapage en sorties structurées (schéma des mises à jour). — test
- [x] `npm run test:worker` : 108 tests passent (36 pour Subventions).

## 3. Année fiscale proposée, modifiable

- [x] Chaque fiche a son année (`fiscal_year`) : période financée, sinon date limite, sinon octroi, sinon année de la découverte. — JCTDLO (période mai–août 2027) = 2026-27
- [x] Fiche : menu « année fiscale 2026-27 (proposée) » ; choisir 2027-28 → « (choisie à la main) », gardée même si les dates changent ; « (proposée) » → recalculée. — navigateur + SQL
- [x] Changer la période financée ou la date limite recalcule l'année proposée. — SQL
- [x] Suivi et Attribution salariale lisent cette année (Suivi 2026-27 : les deux subventions d'essai).
- [x] Claude donne maintenant la période financée et les critères d'admissibilité dans la recherche large ; la fiche les montre et les rend modifiables.

## 4. Plus aucun courriel

- [x] Le tour du trimestre n'envoie rien, même quand tout est fait (pas d'appel à Gmail ni aux destinataires). — test
- [x] Route `/api/subventions/courriel` : 410 « Ce module n'envoie aucun courriel (jusqu'à nouvel ordre) ». — test
- [x] Interface : plus de « Courriels de rappel » ni de « M'envoyer un courriel d'essai » (Recherches), plus de « Destinataires du courriel du lundi » (Réglages), plus de ligne Gmail dans Configuration.
- [x] Code gardé, éteint par `COURRIELS = false` (`pipeline.js`) ; puce Subventions de `CLAUDE.md` : « aucun courriel, jusqu'à nouvel ordre, ne pas en rajouter ».

## 5. Agenda Google « Subventions » (simulé)

- [x] Réglages › Agenda Google : identifiant de l'agenda, « Écrire dans l'agenda », « Écrire maintenant », « simulé (base locale : rien n'est écrit dans Google) ».
- [x] Retenir une subvention (À valider › Retenir…) → ses dates d'ouverture et limite écrites aussitôt (journée entière, sans bloquer le temps), titre « Date limite · Programme (Compagnie) ».
- [x] Fiche : « Agenda « Subventions » (simulé en DEV) : Ouverture 2 nov. 2026 ✓ · Date limite 15 févr. 2027 ✓ ».
- [x] Date changée (proposition acceptée) → l'événement suit. — date limite du 1er au 15 févr.
- [x] Obtenue → aussi ses échéances de reddition ; une étape complétée sort de l'agenda, remise à faire elle revient.
- [x] Expirée (ou rejetée, refusée, remise en nouvelle) → ses dates sont retirées ; remise en cours → écrites de nouveau.
- [x] Subvention supprimée → ses dates retirées au passage suivant (« Écrire maintenant » ou le cron).
- [x] Rien d'avant la mise en service (1er octobre 2026) : les vieilles dates d'EÉC 2025 et 2026 ne sont pas écrites.
- [x] Mode Google (réseau simulé) : PUT/DELETE dans l'agenda réglé ; sans jeton, message « SUBVENTIONS_AGENDA_REFRESH_TOKEN ». — test
- [x] Aucun fichier des Réservations modifié ; client minimal à part : `worker/commun/agendaGoogle.js`.

## 6. Attribution salariale

- [x] Onglet « Attribution salariale » (après Suivi) : un seul tableau par année fiscale, une section par subvention avec des employés (salariales d'abord), un total par subvention et pour l'année, filtre par entreprise.
- [x] Colonnes : employé, salaire (taux × heures en petit dessous, ou montant), dates, contribution de la subvention, contribution de l'employeur, % couvert. — EÉC : 15 900 $ / 11 800 $ / 4 100 $ / 74 % ; année : 27 900 $ / 18 800 $ / 9 100 $ / 67 %
- [x] Employeur vide = salaire − subvention (en italique) ; % couvert = subvention ÷ (subvention + employeur).
- [x] Ajouter un employé : subvention retenue ou obtenue de l'année, employé du référentiel (« Prénom Nom (nom de camp) ») ou « Nom libre » (pastille « à pourvoir ») ; aperçu du salaire et du % pendant la saisie ; virgule acceptée (16,75).
- [x] Modifier (clic sur la ligne), Retirer (confirmation « Retirer »).
- [x] Droits : mêmes que le module. SQL : coordo et direction sans accès → 0 ligne, insertion refusée ; direction avec la grille → lit et modifie ; admin → tout. Navigateur : Julie (direction, sans Subventions dans la grille) → « Accès refusé ».
- [x] Salaires jamais gardés sur l'appareil (clé `subventions-salaires` exclue de la persistance), pas de temps réel. — vérifié dans le cache du navigateur
- [x] Téléphone : cartes de totaux 2 par 2, le tableau défile dans sa carte, pas de défilement horizontal de la page.

## 7. Décisions prises par Claude, à confirmer

- [ ] Passages du **1er au 7** du mois (un travail par heure pile de 8 h à 11 h UTC) : tout est d'ordinaire fait le 1er ; les jours suivants rattrapent une panne. Une recherche en erreur n'est pas reprise avant le trimestre suivant (« Lancer maintenant » au besoin).
- [ ] Mise à jour ciblée **par entreprise** (celle qui dépose, sinon celle pour qui elle a été trouvée), **10 subventions par appel**.
- [ ] « Retenues / obtenues » = en cours, ou obtenues de l'année fiscale en cours ou la précédente **sans édition suivante**. Une obtenue ne change jamais (ses dates sont l'historique) : on y cherche seulement la **nouvelle édition**, ajoutée comme subvention « Nouvelle » à valider.
- [ ] Critères d'admissibilité = un nouveau champ texte (`eligibility_criteria`) ; Claude ne les repropose que s'ils changent sur le fond.
- [ ] Année fiscale proposée : période financée (son début), sinon date limite, sinon **date d'octroi**, sinon année de la découverte. Remplace l'ancien rattachement (octroi d'abord) partout, Suivi compris.
- [ ] Les subventions échues sont expirées **chaque jour** (avant : seulement le lundi avec le courriel), même recherche en pause.
- [ ] Agenda : « abandonnée » = tout statut autre que en cours ou obtenue (rejetée, refusée, expirée, remise en nouvelle) ; pas de nouveau statut « abandonnée ». Une étape de reddition **complétée sort** de l'agenda. Rien d'avant le **1er octobre 2026**. Événements « transparents » (ne bloquent pas le temps), sans rappel.
- [ ] Jeton de l'agenda : `SUBVENTIONS_AGENDA_REFRESH_TOKEN`, sinon celui des Réservations (`GOOGLE_AGENDA_REFRESH_TOKEN`) s'il a accès à l'agenda.
- [ ] Attribution salariale : subventions offertes = retenues ou obtenues de l'année affichée (salariales d'abord) ; compagnie du filtre = celle de la subvention (qui dépose) ; % couvert = subvention ÷ (subvention + employeur), les charges comprises si l'employeur est saisi.

## 8. Avant la mise en ligne (README, section 8)

- [ ] Maxime : créer l'agenda Google « Subventions » (son compte), le partager au besoin (Charlotte, Marco) en lecture.
- [ ] Activer **Google Calendar API** dans le projet Google Cloud « Vigie », puis OAuth Playground (portée `calendar.events`, compte qui possède l'agenda) → secret Cloudflare `SUBVENTIONS_AGENDA_REFRESH_TOKEN`. `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` doivent être en place (client OAuth interne).
- [ ] Subventions › Réglages › Agenda Google : coller l'identifiant (`…@group.calendar.google.com`), cocher « Écrire dans l'agenda », « Écrire maintenant ».
- [ ] Vérifier que « Recherche automatique » est cochée en PROD (prochaine : 1er janvier 2027). Le trimestre d'octobre est passé : lancer à la main une « Mise à jour des retenues » par entreprise après le tri de Charlotte, si utile.
- [ ] Migration `20261014170419_subventions_trimestres` à passer en PROD avec le module (aucune dépendance aux autres modules en cours).
