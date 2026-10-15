# Bascule du module RH : d'Airtable à l'app

Préparée en DEV le 2026-10-15 (phase 5, `docs/plan-rh.md` §15). **Rien de ce qui suit n'a été fait en PROD ni dans Airtable** : c'est la marche à suivre du jour J. Répétition de l'import passée en DEV : `docs/verification-rh-phase5.md`.

La bascule attend deux choses de Maxime : le sous-domaine emplois.camptremblant.com (décision 21 : « on attend ») et son « oui » à `/mise-en-ligne`. Airtable continue de tourner jusque-là (plan §11). Viser un jour calme, **avant le pic de janvier** (122 candidatures en janvier 2026).

Qui : **Maxime** ; **Charlotte** (Airtable, Employeur D) ; **Claude** = une conversation qui lance `/mise-en-ligne` puis suit cette page. Claude ne saisit jamais un secret (clé, jeton, mot de passe) : Maxime les colle lui-même.

## 0. En bref

| # | Étape | Qui | Quand |
|---|---|---|---|
| 1 | Choisir l'option de publication (§1.4) | Maxime | avant |
| 2 | Sous-domaine, Turnstile, client Google, jeton Airtable, clé d'import (§2) | Maxime | avant |
| 3 | Relectures et réglages de contenu (§2) | Maxime, Charlotte | avant |
| 4 | Publier RH en PROD (§3.1) | Claude (`/mise-en-ligne`, après le oui) | J, le matin |
| 5 | Geler Airtable : automatisations coupées, formulaires fermés (§3.2) | Charlotte ou Maxime | J, heure H |
| 6 | Import final avec la paie, puis les fichiers (§3.3) | Claude, puis Maxime | J, juste après H |
| 7 | Réglages du jour J : boîtes, saisons, `courriels_depuis` (§3.4) | Maxime | J |
| 8 | Embauches en cours (§3.5) | Maxime, Charlotte | J |
| 9 | Ouvrir les nouvelles adresses (site, offres) (§3.6) | Maxime | J, en dernier |
| 10 | Airtable et la feuille « Suivi RH 2026 » en lecture seule ; nettoyage (§3.7, §3.8) | Maxime, Claude | J |
| 11 | Vérifications du lendemain (§4) | Claude, Maxime | J+1 |

Retour arrière : §5.

## 1. Ce qui partirait avec RH (relevé en direct le 2026-10-15)

### 1.1 État des branches

- PROD (`origin/main`) = `798c527` (Rooming, 2026-10-15 7 h 45). Base PROD : dernière migration `20261015113409` (mémoire de déploiement ; à revérifier par `/ou-on-en-est`).
- `git log origin/main..dev` liste plus de 80 commits, mais la plupart sont **déjà en PROD** : ils ont été publiés « seuls » par-dessus `main` (copies, pas des ancêtres). La vraie différence se mesure avec `git diff --stat origin/main dev` : 223 fichiers, soit
  - **Réservations** (phases 1 à 7, pas fini : reste la phase 8) : `src/modules/reservations/`, `worker/reservations/`, `worker/qbo/`, 18 migrations ;
  - **RH** (phases 1 à 5) : `src/modules/rh/`, `worker/rh/`, `scripts/migration/rh-*.mjs`, 8 migrations (§1.3) ;
  - **Feuilles de temps, export Employeur D** (`223db8e`, `c92ea11`) : `src/modules/temps/`, `src/core/Referentiel.tsx`, 2 migrations (`20261015120202_temps_employeur_d`, `20261015123313_temps_employeur_d_direction`) ;
  - **CRM « Fusionner »** : 3 fichiers, 1 migration (`20261011141724`) ;
  - **socle commun** : `src/lib/pdf/` (moteur PDF, `e3eaeef`), `src/lib/public/` et `src/lib/pagesPubliques.ts` (pages publiques), `worker/commun/` (`courriel.js`, `etat.js`, `turnstile.js`) ;
  - fichiers partagés : `src/App.tsx`, `src/main.tsx`, `src/shell/modules.ts`, `src/lib/{supabase,types,requetes}.ts`, `worker/index.js`, `wrangler.jsonc`, `vite.config.ts`, `supabase/config.toml`, `package.json` (+ lock), `CLAUDE.md`, `README.md`, `supabase/seed.sql`.

### 1.2 Dépendances de RH

| RH a besoin de | Pourquoi | Déjà en PROD ? |
|---|---|---|
| `src/lib/pdf/` (`e3eaeef`) | contrat et consentement (`contrat.ts`), signature posée par le Worker (`worker/rh/contrats.js`) | non |
| `src/lib/public/`, `src/lib/pagesPubliques.ts` | pages publiques (`/emplois`, `/retour`, `/dossier`), Turnstile, pad de signature | non |
| `worker/commun/` | envoi Gmail ou Mailpit, `state` signé de l'OAuth, Turnstile | non (`agendaGoogle.js` l'est) |
| paquet npm `pdf-lib` | PDF | non (`xlsx` l'est) |
| **migration `20261015120202_temps_employeur_d`** (Feuilles de temps) | ajoute `core.entreprises.numero_employeur_d` et `core.employes.matricule_employeur_d`, que RH lit (`donnees.ts`, export Employeur D, Réglages) : sans elle, RH plante au chargement des compagnies | **non** |
| `core.peut_lire`, `core.entreprises`, `core.employes`, Vault, pgcrypto, seaux | schéma, accès, chiffrement | oui |

Rien dans RH n'importe de fichier des Réservations, sauf deux fichiers communs à corriger si elles ne partent pas : `src/lib/public/PagesPubliques.tsx` (charge `@/modules/reservations/public`) et `src/lib/pagesPubliques.ts` (chemins `/demande`, `/client/`… des Réservations).

### 1.3 Migrations de RH, dans l'ordre

| # | Migration | Note |
|---|---|---|
| 1 | `20261012120839_rh` | schéma `rh`, accès `rh` et `rh_paie` (direction en écriture), **crée la clé Vault `rh_cle_paie`** (la perdre = perdre les NAS), seaux privés |
| 2 | `20261012172252_rh_benevoles` | |
| 3 | `20261012174559_rh_deja_travaille` | |
| 4 | `20261012193705_rh_pages_publiques` | |
| — | `20261015120202_temps_employeur_d` | **Feuilles de temps**, requise par RH (§1.2) ; déjà en PROD si les Feuilles de temps sont publiées avant |
| 5 | `20261015123857_rh_courriels` | pose `courriels_depuis` = le jour où elle passe (heure de Montréal) |
| 6 | `20261015123858_rh_contrats` | |
| 7 | `20261015125223_rh_phase4` | |
| 8 | `20261015134435_rh_nouveautes_sans_import` | phase 5 : le résumé quotidien ignore les lignes importées |

Les migrations 1 à 4 sont **plus vieilles** que la dernière migration en PROD : `db push` les refuse sans `--include-all`, qui enverrait aussi les 18 migrations des Réservations et celle du CRM. Comme pour Bâtiments et Rooming : une par une, `npx supabase db query --linked -f <copie enveloppée de begin; … commit;>` puis `npx supabase migration repair --linked --status applied <numéro>`. Les contraintes `module in (…)` réécrites par la migration 1 contiennent déjà tous les modules en PROD (même liste que la migration de Bâtiments, déjà en PROD).

Schéma `rh` à **exposer** (PATCH de `db_schema`, API Management ; renvoyer le même PATCH si l'API répond encore PGRST106). Aucune fonction Edge.

### 1.4 RH ne peut pas partir tout à fait seul : options (à Maxime de choisir)

- **A. Feuilles de temps d'abord, puis RH seul.** Publier l'export Employeur D des Feuilles de temps (2 commits, 2 migrations, indépendant des Réservations ; liste `docs/verification-temps-employeur-d.md`, rappels dans `rappels-mise-en-ligne.md`), puis RH seul (§1.5). Un module à la fois, deux passages.
- **B. RH et Feuilles de temps ensemble**, en un passage (§1.5 plus les fichiers des Feuilles de temps et leurs 2 migrations). Deux modules mélangés.
- **C. RH avec seulement la migration `20261015120202`**, sans l'écran des Feuilles de temps : la migration crée aussi `temps.reglages_employeur_d`, qui resterait inutilisée en PROD. Possible, mais un morceau d'un autre module part sans son code.
- **D. Tout `dev` d'un coup** (`db push --include-all`) : les Réservations partiraient avec leurs pages publiques, alors que leur phase 8 (bascule) n'est pas faite. Déconseillé tant que les Réservations ne sont pas prêtes.

Retirer la phase 4 de RH pour éviter la dépendance n'est pas réaliste : son code est dans les mêmes fichiers que le reste du module.

### 1.5 Composer une publication « RH seul » (pour Claude, partie A de `/mise-en-ligne`)

Comme pour Bâtiments (mémoire de déploiement, 2026-10-15) : index temporaire depuis `origin/main`, puis `git commit-tree -p origin/main`.

- Fichiers entiers de `dev` : `src/modules/rh/**`, `worker/rh/**`, `worker/commun/{courriel,etat,turnstile}.js`, `src/lib/pdf/**`, `src/lib/public/**`, `src/lib/pagesPubliques.ts`, `scripts/migration/rh-*.mjs`, les 8 migrations RH (+ celle des Feuilles de temps selon l'option), `docs/plan-rh.md`, `docs/rh-existant.md`, `docs/bascule-rh.md`, `docs/verification-rh-phase*.md`.
- Fichiers partagés refaits à la main depuis `main`, **sans rien des Réservations** :
  - `src/App.tsx` : route `rh/*`, `estPagePublique` et `PagesPubliques` (pas la route des Réservations) ;
  - `src/lib/public/PagesPubliques.tsx` : seulement `PagesRh` ; `src/lib/pagesPubliques.ts` : `estPagePublique` = pages RH seulement ;
  - `src/main.tsx` : pas de service worker sur une page publique ;
  - `src/shell/modules.ts` : entrées `rh` et `rh_paie` (retirées de `main`) ;
  - `src/lib/supabase.ts` (`'rh'`), `src/lib/types.ts` (`'rh' | 'rh_paie'`), `src/lib/requetes.ts` (`'rh'`, `'rh-adresses'` jamais gardés sur l'appareil) ;
  - `worker/index.js` : `routeRh` (`/api/rh/*`) et `preparerAutomatiques` dans le cron ; rien des Réservations ni de QBO ;
  - `supabase/config.toml` : `"rh"` dans `schemas` ;
  - `package.json` = celui de `main` + `pdf-lib` ; lock régénéré (`npm install --package-lock-only` dans le scratchpad) ;
  - `wrangler.jsonc` : rien pour RH (pas besoin de `ASSETS` ni de QBO) ; `HOTE_EMPLOIS` quand le sous-domaine marche (§2) ;
  - `.env.production` : `VITE_TURNSTILE_SITE_KEY` (clé publique, §2) et `VITE_HOTE_EMPLOIS` (quand le sous-domaine marche) ;
  - `CLAUDE.md` et `README.md` : celui de `main` + les seuls paragraphes RH (puce RH, README §15 et §16).
- Vérifier sur `git archive` : `npm ci && npm run build`, `node --test worker/rh/*.test.js`, `node --test "src/modules/rh/*.test.mjs"`, `npx wrangler deploy --dry-run`.

## 2. Avant le jour J

| Quoi | Qui | Comment vérifier |
|---|---|---|
| **Sous-domaine** emplois.camptremblant.com : Cloudflare → Workers → `gestion-camp` → Domains & Routes → Add custom domain (CNAME chez Squarespace si le DNS n'est pas chez Cloudflare) — README §15.1 | Maxime | `https://emplois.camptremblant.com/_ping` répond |
| **Turnstile** : le widget n'existe pas encore en PROD (les Réservations ne sont pas publiées) → Cloudflare → Turnstile → Add widget, domaines `emplois.camptremblant.com` et `gestion-camp.maxime-0f5.workers.dev` (plus tard `groupes.camptremblant.com`), mode Managed — README §11.2 | Maxime | clé du site (publique) donnée à Claude pour `.env.production` ; secret `TURNSTILE_SECRET` collé par Maxime dans Cloudflare (Variables and Secrets). **Sans les deux, le formulaire refuse toute candidature** |
| **Client OAuth Google** (README §16) : attention, `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` existent peut-être déjà dans Cloudflare pour l'agenda des Subventions (projet « Vigie », écran de consentement **Internal**). RH utilise les **mêmes noms**, donc le même client : le passer en **External** et **publié** (les boîtes d'Opikawa, Rouge & Diable, Aquabounga et Trembloc sont dans d'autres domaines), activer l'API Gmail, ajouter la portée `gmail.send` et la redirection `https://gestion-camp.maxime-0f5.workers.dev/api/rh/retourgoogle`. **Ne pas remplacer** ces secrets par ceux d'un autre client : le jeton de l'agenda des Subventions cesserait de marcher. Si Maxime préfère un client à part pour RH, demander à Claude des secrets propres à RH (petit changement du Worker) | Maxime | après la publication : « Connecter la boîte » mène à Google sans erreur de redirection ; l'agenda des Subventions écrit encore |
| `SUPABASE_SECRET_KEY` dans Cloudflare (sert aux pages publiques et au cron RH) | Maxime | déjà là si les Subventions marchent en PROD (README §8) ; sinon à ajouter |
| **Jeton Airtable en lecture** (`data.records:read`, base RH `appzxLZ4ZO0kb65xU` seulement) dans `gestion-camp/scripts/migration/.env.rh` (`AIRTABLE_TOKEN_RH=…` ; ignoré par Git). **Recommandé pour l'import final** : avec le jeton, les NAS et comptes vont d'Airtable à la base sans passer par la conversation ; par le connecteur de Claude, ils resteraient dans les fichiers de la session | Maxime | le fichier existe ; Claude ne l'affiche pas |
| **Clé secrète Supabase PROD temporaire** pour envoyer les fichiers (Supabase → Project Settings → API Keys → New secret key « import-rh »), gardée par Maxime pour la commande du §3.3 | Maxime | supprimée au §3.8 |
| Relire le **contrat type** (marquer relu), faire relire le **consentement parental** (repris tel quel d'Airtable : alcool, décharge), valider l'**entente de bénévolat** et les **codes d'éthique** (Réglages) | Maxime | faisable en DEV dès maintenant ; à refaire en PROD (les textes partent avec la migration, pas avec les corrections faites en DEV) |
| Adresse et téléphone des compagnies (contrats), grille des **taux** de la saison, tâches des postes, **saisons de recrutement** et leurs dates (formations, semaines : servent aux disponibilités du dossier), postes offerts par saison | Maxime, Charlotte | faisable seulement en PROD (après §3.1) ; noter ce qu'on veut d'avance |
| VAJ : les dates faites dans la copie « RH - Été 2026 (Charlotte) » ne sont **pas** importées (l'import lit seulement Humains › Date VAJ de la base RH) | Charlotte | soit elles sont aussi dans la base RH, soit les reporter après l'import (Employés › « VAJ… », en lot) |
| Employeur D : valeurs par défaut, **titre d'emploi**, numéros de compagnie et de poste (rappels de la phase 4) | Charlotte | pas bloquant pour la bascule (sert à l'export de paie) |
| Prévenir l'équipe : date J, Airtable gelé dès l'heure H, plus de saisie dans Airtable après | Maxime | |

## 3. Jour J

### 3.1 Publier RH (Claude, `/mise-en-ligne`, après le « oui » de Maxime sur le plan détaillé)

1. Selon l'option choisie (§1.4) ; migrations une par une dans l'ordre du §1.3, puis exposer `rh`.
2. Contrôles en PROD (lectures, avec le oui) :
   - `select count(*) from vault.secrets where name = 'rh_cle_paie'` = 1 (sinon **arrêter** : l'import de la paie échouerait) ;
   - seaux `rh-documents` et `rh-paie` présents et privés ;
   - `select valeur from rh.reglages where cle = 'courriels_depuis'` = le jour J ;
   - requête anonyme avec `Accept-Profile: rh` → « permission denied » (schéma exposé, l'anonyme n'a aucun droit).
3. Code publié vérifié dans les fichiers du site (un texte des pages RH, ex. « Dossier d'embauche ») ; `https://<app>/emplois` affiche le formulaire et le widget Turnstile.
4. Dès ce moment, la **direction voit le module RH** (accès donnés par la migration) : il est vide jusqu'au §3.3. Prévenir Charlotte de ne rien y saisir avant la fin de l'import.

### 3.2 Geler Airtable (Charlotte ou Maxime, heure H)

Dans la base « RH » (`appzxLZ4ZO0kb65xU`), dans cet ordre (inventaire : `docs/rh-existant.md` §2 et §3, état du 2026-10-11 à revérifier) :

1. **Couper les 11 automatisations déployées** :

   | Automatisation | ID |
   |---|---|
   | Proposition entrevue | `wflOUraO0VvzUfU1z` |
   | Embauche - BPA - Échelon 1 - Hors saison | `wflpkQ4oFFYdo44K9` |
   | Candidature rejetée (après entrevue) | `wflPjFv95j0aT4WR6` |
   | Candidature rejetée (équipe complète) | `wflLGMfVxxStFbr35` |
   | BPA - Proposition ASPI | `wflk296AMjIxaNCAv` |
   | BPA - Candidatures sans permis de travail | `wflyGJn0ak9oO43YS` |
   | Réception - Nouvelle candidature | `wflu0xr3NjT06W1zk` |
   | Réception - Intention de retour | `wflICVheFfZ2bQbX5` |
   | Réception - Confirmation d'embauche | `wfl2iVWX19tTkth9j` |
   | Création d'un humain lorsque réception d'une candidature | `wflP2hhxDhKSw3e1o` |
   | Association d'un formulaire d'embauche à un humain | `wflHfEbdAFLGWBLDe` |

   Vérifier que les 5 non déployées le sont toujours (`wflMJANzvFBG5PE29`, `wflWWTJKebuY8lVop`, `wfl4GKDW8QPCnYrlr`, `wflpMeiScPPkbHd9N`, `wflyD2cSE5BaYNoOW`). Noter la liste exacte de ce qui était allumé (sert au retour arrière).
2. **Fermer les 4 formulaires** (désactiver le partage public de la page de formulaire) et noter leur remplaçant :

   | Formulaire Airtable | Page | Remplacé par |
   |---|---|---|
   | Dépôt de candidatures | `pag3yj3XvFt8SfebP` | `https://emplois.camptremblant.com/emplois` (`?lang=en` en anglais) |
   | Intention de retour | `pagJgXEh4LVYnAsvv` | plus de lien commun : invitations personnelles (Employés › « Intention de retour… », lien `/retour/<jeton>`) |
   | Confirmation d'embauche | `pagrBKfcmnvR480Mb` | lien personnel du dossier (`/dossier/<jeton>`, carte de l'embauche) |
   | Confirmation d'embauche - Hors été | `pagAEI5UvWkMejhsS` | idem (version hors été choisie selon la saison) |

   Airtable ne redirige pas un formulaire fermé : mettre à jour tous les endroits où ces liens apparaissent (§3.6). Une personne qui a reçu un lien de « Confirmation d'embauche » d'Airtable reçoit un nouveau lien de l'app (§3.5).
3. Plus aucune saisie dans Airtable à partir de H (sinon elle ne serait pas importée, ou elle écraserait l'app si on relançait l'import).

Vérifier : Airtable › Automatisations, toutes « Off » ; ouvrir chaque ancienne adresse de formulaire dans une fenêtre privée → indisponible.

### 3.3 Import final, avec la paie (Claude, puis Maxime)

Tout le SQL et les fichiers restent dans un dossier temporaire **hors du dépôt** (scratchpad de la conversation, `chmod 700`) : ils contiennent les NAS et comptes **en clair**.

1. Produire (Claude ; lit le jeton de `.env.rh`) :

   ```bash
   D=<scratchpad>/bascule-rh ; mkdir -p $D && chmod 700 $D
   node scripts/migration/rh-airtable.mjs --avec-paie --fichiers $D/fichiers --sortie $D/import-final.sql
   ```

   La console donne les comptes d'Airtable (humains, candidatures, embauches, anciens de la banque 2025) et le nombre de fichiers du manifeste.
2. Appliquer en PROD (Claude, avec le oui ; le mode automatique peut refuser, Maxime lance alors la même commande) :

   ```bash
   npx supabase db query --linked -f $D/import-final.sql
   ```

   Une seule transaction : une erreur = rien d'importé. Si l'API refuse la taille du fichier (environ 2,5 Mo), Maxime l'applique avec `psql` et la chaîne de connexion de la PROD.
3. **Contrôle des comptes** : la dernière table affichée doit dire « ok » partout (candidatures, dossiers d'embauche, humains, banque 2025 = comptes d'Airtable ; « embauches importées à revoir » = 0). Recouper avec les comptes affichés dans Airtable (Charlotte). « ÉCART » = arrêter et examiner avant d'ouvrir les nouvelles adresses.
4. **Fichiers, tout de suite** (les adresses d'Airtable expirent en quelques heures) — Maxime, dans son terminal, depuis `gestion-camp/` :

   ```bash
   SUPABASE_URL_PROD=https://nurjzafcogzgekquzuwh.supabase.co SUPABASE_SECRET_KEY_PROD=<clé import-rh> \
     node scripts/migration/rh-fichiers.mjs --fichiers $D/fichiers --prod
   ```

   Attendu : « N envoyé(s), 0 déjà là, 0 erreur(s) » avec N = nombre du manifeste. Relançable (un fichier déjà envoyé est sauté) ; si des adresses ont expiré, refaire l'étape 1 (même SQL, aucun doublon) puis celle-ci.
5. Coup d'œil dans l'app (Maxime) : une fiche avec dossier → « NAS au dossier (finit par …) » = les 3 derniers chiffres d'Airtable ; ouvrir un CV et un spécimen.
6. **Ne plus jamais relancer l'import** après le §3.4 : une valeur d'Airtable écraserait le statut, la décision ou le dossier modifiés dans l'app.

### 3.4 Réglages du jour J (Maxime, dans l'app)

1. RH › Courriels › Réglages : **`courriels_depuis` = le jour J** (la migration l'a posé au jour de la publication ; le corriger si la publication a eu lieu avant). Rien de ce qui précède n'est préparé seul : ni rappel (seulement pour un lien de dossier envoyé par l'app) ni résumé (les lignes importées n'y sont jamais, migration 8).
2. Courriels › Compagnies et boîtes : vérifier les 5 adresses d'envoi, **connecter les 5 boîtes** (avec la boîte de chaque compagnie), « M'envoyer un essai » pour chacune. Toutes « Connectée » **avant le §3.6** : l'accusé de réception part seul de la boîte de la compagnie dès la première candidature.
3. Destinataires du résumé quotidien (charlotte@ au départ) et heure ; mode de chaque modèle (accusé et résumé « Envoyé seul » au départ, les autres « À relire puis envoyer »).
4. Réglages : **saisons de recrutement ouvertes** (le formulaire n'offre que les saisons ouvertes), postes offerts par saison, dates des saisons, taux, coordonnées des compagnies (§2).

Vérifier : `https://emplois.camptremblant.com/emplois` montre les bonnes saisons et les bons postes, en français et en anglais.

### 3.5 Embauches en cours (Maxime, Charlotte)

L'import garde le statut d'Airtable. En DEV le 2026-10-15 : 42 embauches importées non terminées — 32 de saisons passées (été 2026 : 19 « à envoyer », 4 « lien envoyé », 2 « dossier reçu » ; printemps 2026 : 7) et 10 de l'automne 2026 (8 « dossier reçu »). Dans Employés, par saison :

- **saisons passées** : les marquer « Annulée » (ou les laisser, elles ne gênent pas) ;
- **« Dossier à envoyer » / « Lien envoyé »** (le lien d'Airtable ne marche plus) : « Créer le lien du dossier », puis « Préparer le courriel de bienvenue » et l'envoyer ; le rappel se préparera 7 jours après ;
- **« Dossier reçu »** (rempli dans Airtable) : la validation exige un **contrat signé dans l'app** (emploi), le taux, le NAS et le compte. Préparer le contrat, créer le lien du dossier et l'envoyer pour signature. *Si Maxime préfère valider ces embauches avec le contrat d'Airtable (PDF dans les documents), c'est un changement de règle à demander à Claude.*

### 3.6 Ouvrir les nouvelles adresses (Maxime, en dernier)

- camptremblant.com, page Emploi (Squarespace) : lien vers `https://emplois.camptremblant.com/emplois` (et `?lang=en` pour l'anglais).
- Autres endroits où le lien Airtable apparaît : offres sur le site de l'ACQ, Indeed, LinkedIn, groupes Facebook, signatures de courriel, documents internes.
- Variables `VITE_HOTE_EMPLOIS` et `HOTE_EMPLOIS` déjà publiées (§1.5) : les liens copiés dans l'app et ceux des rappels mènent au sous-domaine.

Vérifier : depuis un téléphone, page Emploi du site → formulaire → envoyer une candidature d'essai **avec sa propre adresse** → accusé reçu de la bonne boîte → la candidature est dans RH › Candidatures (pastille) → l'effacer (« Effacer les renseignements », puis « Supprimer la candidature »).

### 3.7 Airtable et Sheets en lecture seule (Maxime)

- Bases « RH » (`appzxLZ4ZO0kb65xU`), « RH - Été 2026 (Charlotte) » (`appHddi3eH03p9EyW`) et « RH - ACQ » (`appXVtZA6nZEyKBZm`) : collaborateurs en lecture seule. Les garder comme archive ; ne pas les supprimer tout de suite.
- Google Sheets « Suivi RH 2026 » (`1vszl-NNdhIHYlsau0VjVpwtloUvAlFf-RD7NKNbEqqM`) : partage en lecteur, titre « (archive) » ; la saison 2026 est finie, rien n'est importé (la planification repart dans l'app).
- À décider par Maxime (Loi 25) : une fois l'import vérifié (une semaine plus tard ?), **effacer dans Airtable les NAS, comptes, transits, institutions et spécimens** (table Embauches) : ils y sont en clair, dans un service tiers.

### 3.8 Nettoyage (Claude et Maxime, le jour même)

- Supprimer `$D` (SQL avec NAS en clair, fichiers téléchargés).
- Retirer `scripts/migration/.env.rh` ; **révoquer le jeton** Airtable (Maxime) ; supprimer la clé Supabase « import-rh » (Maxime).
- Retirer de `App de gestion de camp/rappels-mise-en-ligne.md` les sections RH une fois données à Maxime (`/mise-en-ligne` C.3).

## 4. Le lendemain (J+1)

| Vérification | Qui | Attendu |
|---|---|---|
| RH › Courriels › Envoyés | Maxime | les accusés des nouvelles candidatures, partis de la bonne boîte ; rien pour une personne importée |
| Résumé de 7 h | Charlotte | reçu s'il y a eu du nouveau dans l'app ; aucune donnée importée dedans |
| Courriels › À envoyer | Maxime | aucun rappel ni résumé pour des données importées |
| Compagnies et boîtes | Maxime | 5 « Connectée », aucune erreur, « dernier envoi » pour celles qui ont écrit |
| SQL (Claude, lecture PROD avec le oui) : `select genre, count(*) from rh.courriels c join rh.personnes p on p.id = c.personne_id where p.airtable_ids <> '{}' and c.cree_par_nom = 'Envoi automatique' group by 1` | Claude | rien, ou seulement des accusés de personnes déjà connues qui ont repostulé par l'app |
| Journaux du Worker (Cloudflare → Logs) | Maxime ou Claude | aucune ligne « Courriels RH : » ni « Accusé de réception RH : » en erreur |
| Airtable | Charlotte | aucun nouvel enregistrement depuis H ; historique des automatisations vide depuis H |
| Site, page Emploi | Maxime | mène au nouveau formulaire, en français et en anglais |
| Nettoyage du §3.8 | Maxime | jeton révoqué, clé supprimée, dossier temporaire effacé |

## 5. Retour arrière

Ne jamais supprimer le schéma `rh` ni la clé Vault `rh_cle_paie` : les NAS chiffrés deviendraient illisibles. Les migrations ne se défont pas ; on arrête d'utiliser le module.

- **Erreur à la publication (§3.1)** : `/mise-en-ligne` s'arrête ; Airtable n'a pas bougé. Corriger en DEV, recommencer un autre jour.
- **Erreur ou « ÉCART » à l'import (§3.3), avant le §3.6** : rien de public n'a changé. Erreur SQL = rien d'importé (une transaction) ; corriger le script en DEV, relancer (aucun doublon). Pour revenir en arrière : rallumer les automatisations notées au §3.2 et rouvrir les 4 formulaires (mêmes adresses qu'avant) : Airtable reprend comme avant. Si des données importées doivent être retirées de la PROD, Claude prépare le SQL (oui de Maxime), seulement si personne n'a encore travaillé dans le module.
- **Problème après l'ouverture (§3.6 fait)** :
  1. remettre l'ancien lien Airtable sur le site et dans les offres ; rouvrir les 4 formulaires ; rallumer les automatisations notées au §3.2 ;
  2. dans l'app, mettre le modèle « Accusé de réception » à « Désactivé » (pas de double accusé) ;
  3. **recouper ce qui est arrivé dans l'app depuis H** : candidatures (`source` formulaire, `airtable_id` vide, reçues après H), réponses d'intention de retour, dossiers d'embauche reçus, courriels envoyés (Courriels › Envoyés), statuts changés — Claude en sort la liste ; Charlotte les reporte dans Airtable ;
  4. avant une nouvelle bascule : l'import ne retire jamais une ligne créée dans l'app, mais il réécrit les lignes importées dont Airtable a changé (statut, décision, dossier) : refaire la bascule à partir du §3.2.

## 6. Répétition en DEV (2026-10-15)

Faite par le connecteur Airtable (lecture seulement, champs de paie exclus), sans la paie, sur la base DEV : 3 candidatures, 2 embauches, 1 dossier et 3 personnes ajoutés dans Airtable depuis le 2026-10-12 ramenés ; comptes Airtable = comptes DEV ; 2e, 3e et 4e passes sans aucun changement ; tables des phases 3 et 4 intactes ; aucun courriel préparé seul après correction du résumé (migration 8). Détail : `docs/verification-rh-phase5.md`.
