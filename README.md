# 🏕️ Gestion du camp

Application unique qui regroupe les outils de gestion du camp. Chaque outil
est un **module** (une mini-app) branché sur une coquille commune :
connexion, menu, référentiel partagé.

| Module | État | Appareils |
|---|---|---|
| 🚣 Embarcations : état de la flotte et réparations | En service | Mobile + ordinateur, hors ligne |
| 🛒 Commande : menus, recettes, commande Colabor | En service | Ordinateur |
| 🤡 Animation : horaire des groupes et des animateurs | En service | Ordinateur |
| ✅ Mastertimeline : tâches de l'année, toutes entreprises | En service | Ordinateur + téléphone (en ligne) |
| 🛍️ Achats : équipement à commander, commandé ou reçu (direction) | En DEV (sort de Mastertimeline, part en PROD avec Travaux) | Ordinateur (en ligne) |
| 💰 Subventions : vigie hebdomadaire par Claude, demandes, montants, reddition de compte | En service (secrets à ajouter, voir 8) | Ordinateur, administrateurs seulement pour l'instant |
| 🔭 Vigie des camps : prix, programmes et activités des camps compétiteurs, par Claude | En service (secrets à ajouter, voir 9) | Ordinateur, administrateurs seulement (pour l'instant) |
| 🗓️ Calendrier des opérations : séjours (Airtable), événements, qui travaille chaque jour | En service (secret Airtable à ajouter, voir 10) | Téléphone pour consulter, ordinateur pour modifier (en ligne) |

**Stack** : React + TypeScript (Vite), Supabase (base de données, connexion,
temps réel), et un Cloudflare Worker qui sert le site et garde Supabase éveillé.

**Adresse** : https://gestion-camp.maxime-0f5.workers.dev

## Architecture

```
src/
  shell/        coquille : connexion, menu, gardes d'accès, registre des modules
  core/         référentiel commun (groupes, employés, semaines) et utilisateurs
  modules/      une mini-app par dossier (chargée à la demande)
  lib/          client Supabase, types, accès aux données, styles communs
supabase/
  migrations/   schéma SQL versionné (un schéma Postgres par module)
  templates/    courriels d'invitation et de code de connexion
  functions/    fonctions Edge (vigie : recherches de la Vigie des camps par Claude)
  config.toml   réglages Supabase (connexion, courriels, schémas exposés)
worker/         code du Worker : waker Supabase (cron) + /_ping, Vigie de subventions
                (cron du lundi + /api/subventions/*), synchro des séjours Airtable du
                Calendrier (cron aux 15 min + /api/calendrier/*) ; tests : npm run test:worker
wrangler.jsonc  configuration du Worker (site + cron)
.env.production valeurs Supabase publiques utilisées au build
scripts/migration/  import unique des anciens projets
```

**Base de données** : un schéma Postgres par module.

- `core` : `profils` et `acces_modules` (rôles), `groupes`, `employes`, `semaines`
- `embarcations` : `modeles`, `embarcations`
- `commande` : `recettes`, `consommables`, `banque_ingredients`, `groupes_repas`, `plan_cells`, `menus_sauves`, `ajouts_*`, `sorties`
- `horaire` : `parametres`, `horaires` (un document par semaine ou par modèle de séjour, le temps que le module se stabilise ; `debut` = date du premier jour, qui place la semaine dans le Calendrier), `dossiers` (rangement des semaines par saison)
- `subventions` : `grant_companies` (entreprises du groupe, critères), `grants` (une subvention : trouvée, validée ou rejetée, puis demandé / accordé / reçu), `grant_feedback` (décisions qui nourrissent la mémoire), `grant_notes`, `grant_time_entries` (heures), `grant_reporting_steps` (reddition de compte), `grant_search_runs` (journal des recherches), `grant_learned_rules` (mémoire), `grant_settings`, `grant_digests` (courriels du lundi). Noms repris de la feuille de route de la Vigie
- `vigie` : `camps` (proposé / inclus / exclu, compétiteur direct ou référence, membre ACQ ou non), `programmes` (prix et durée ; prix par nuit calculé), `activites` (liste candidate commune : saisons, offerte à la BPA, coûts estimés par Claude), `camps_activites`, `photos` (une par activité et par camp), `maquettes` (3D), `changements` (détectés, à valider), `recherches` (journal), `requetes_ia` (file des appels à Claude), `parametres`. Import du Google Sheets « BPA_Vigie_ Comparatif des camps » le 2026-10-03 (`scripts/migration/vigie.py`)
- `calendrier` : `sejours` (copie en lecture seule de la base Airtable « Réservation Groupes », écrite par le Worker), `evenements` (ponctuels ou récurrents), `personnel` (direction et terrain), `presences_simples`, vue `v_presence_jour` (qui travaille, quel secteur, fait quoi ; la cuisine vient de `commande.quarts`, l'animation des horaires datés de `horaire.horaires`), `journal` (chaque modification, par déclencheur), `synchros`. Rien n'est effacé (`deleted_at`)
- `mastertimeline` : `taches` (la liste qui sert d'une année à l'autre), `coches` (un passage par mois : faite, « pas cette année », note de l'année), `projets`, `entreprises`, `responsables`, `fournisseurs`. Reprise de la base Airtable « Mastertimeline - LÜTRA » le 2026-09-30 (`scripts/migration/mastertimeline.mjs`)
- `achats` : `achats` (item, statut à commander → commandé → reçu, quantité, prix estimé à l'unité, entreprise, fournisseur, note). Sorti de Mastertimeline le 2026-10-06 ; entreprises et fournisseurs = ceux de Mastertimeline

**Accès** : seules les personnes invitées peuvent se connecter. Elles reçoivent
un code à 6 chiffres par courriel. Il y a quatre rôles, appliqués par la RLS de
Postgres (et pas seulement dans l'interface). Les modules de chaque rôle se
règlent dans la grille « Accès par rôle » de la page Utilisateurs :

| Rôle | Accès |
|---|---|
| `admin` | Tout, y compris la page Utilisateurs |
| `direction` | Les modules cochés pour la direction, et le référentiel ; trie les tâches de Travaux |
| `coordo` | Les modules cochés pour les coordonnateurs (lecture ou écriture) |
| `terrain` | Aides de camp et équipe d'entretien : les modules cochés pour Terrain (Travaux au départ). **Rôle par défaut à l'invitation** |

## Hors ligne et installation sur téléphone

L'app est une PWA : sur téléphone, **Partager → Sur l'écran d'accueil** (iPhone,
Safari) ou **Installer l'application** (Android, Chrome). Elle s'ouvre alors
directement sur Embarcations.

- Le code de l'app est gardé par un service worker (généré au build par
  `vite-plugin-pwa`) : elle s'ouvre sans réseau.
- Les données lues sont conservées sur l'appareil (cache TanStack Query dans le
  `localStorage`, 30 jours) : la flotte reste consultable sans réseau.
- Chaque modification s'affiche tout de suite. Sans réseau, elle est mise en
  file d'attente, conservée même si l'app est fermée, puis envoyée au retour du
  réseau. Si la base la refuse, seule cette modification est annulée et un
  bandeau l'explique. La dernière modification l'emporte, champ par champ.
- Une embarcation créée hors ligne reçoit son numéro à la synchronisation.
- La déconnexion efface le cache de l'appareil, file d'attente comprise
  (avec confirmation s'il reste des modifications non envoyées).
- La première ouverture sur un appareil doit se faire avec du réseau (connexion
  et premier chargement).

## Commandes

**DEV et PROD sont séparés** (depuis le 2026-10-06, l'app est utilisée par
l'équipe) : on développe contre une base Supabase **locale** (Docker), jamais
contre la PROD. Les commandes qui touchent la PROD commencent par `prod:`.

| Commande | Effet |
|---|---|
| `npm run db:start` | DEV : démarre la base locale (Docker Desktop doit rouler). Courriels dans Mailpit : http://localhost:54324 |
| `npm run db:reset` | DEV : recrée la base locale (toutes les migrations + `supabase/seed.sql`) |
| `npm run db:stop` | DEV : arrête la base locale |
| `npm run dev` | Lance l'app en local sur http://localhost:5173 (base locale, via `.env.local`) |
| `npm run build` | Vérifie les types et construit `dist/` (base PROD, via `.env.production`) |
| `npm run prod:db:push` | **PROD** : applique les nouvelles migrations au projet Supabase hébergé |
| `npm run prod:db:config` | **PROD** : envoie `supabase/config.toml` (connexion, courriels) au projet hébergé |
| `npm run db:types` | Régénère les types TypeScript à partir de la base locale |
| `npm run import:essai` | Lit les anciennes bases et affiche les décomptes (n'écrit rien) |
| `npm run import` | Importe les anciennes données dans la nouvelle base |
| `npm run deploy` | Déploiement manuel (normalement automatique à chaque push) |
| `npm run test:worker` | Tests du Worker (Subventions, Calendrier, formulaire des Réservations), réseau simulé |
| `npm run worker:dev` | DEV : le Worker en local sur le port 8787 (routes `/api/*`, base locale via `.dev.vars`) ; `npm run dev` lui envoie les `/api/*` |

---

## Mise en route (une seule fois)

### 1. Projet Supabase

1. Sur [supabase.com/dashboard](https://supabase.com/dashboard) : **New project**.
   - Nom : `gestion-camp`
   - Région : **Canada (Central)**
   - Mot de passe de la base : générez-le et gardez-le dans votre gestionnaire de mots de passe.
2. Dans le terminal, à la racine de ce dossier :
   ```bash
   npx supabase login
   npx supabase link --project-ref <identifiant>   # l'identifiant est dans l'URL du tableau de bord
   npm run prod:db:push
   ```

### 2. Courriels (Google Workspace)

Le serveur courriel intégré de Supabase n'écrit qu'aux membres de l'équipe
Supabase. Il faut donc passer par le compte Google du camp.

1. Sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   (la validation en deux étapes doit être activée), créez un mot de passe
   d'application nommé « Supabase ».
2. Copiez `supabase/.env.example` vers `supabase/.env`, puis remplissez
   `SMTP_USER` (l'adresse d'envoi) et `SMTP_PASS` (le mot de passe d'application).
3. Lancez `npm run prod:db:config`.

### 3. Premier administrateur

1. Supabase → **Authentication → Users → Invite user** : entrez votre adresse.
2. Connectez-vous sur le site avec votre adresse : un code vous est envoyé. Le
   lien du courriel d'invitation expire après 15 minutes, mais il n'est pas
   nécessaire : l'adresse est confirmée dès l'invitation.
3. Supabase → **SQL Editor** :
   ```sql
   update core.profils set role = 'admin' where courriel = 'votre@adresse.com';
   ```

Invitez ensuite les autres membres de la direction de la même façon. Ils
reçoivent automatiquement le rôle `direction`.

### 4. Test en local

`.env.production` (versionné) contient déjà les valeurs publiques du projet.
Pour travailler en local, copiez-le vers `.env.local`, puis lancez `npm run dev`.

### 5. GitHub

Dépôt privé `jamberlouze/gestion-camp`. Le jeton GitHub du Mac doit avoir la
permission `workflow` pour pousser les fichiers de `.github/workflows/`.

### 6. Cloudflare (site + waker)

Worker `gestion-camp` connecté au dépôt GitHub (Workers & Pages → le Worker →
Settings → Build) :

- Build command : `npm run build`
- Deploy command : `npx wrangler deploy`

Chaque `git push` sur `main` construit et redéploie le site et le cron du waker.
Les valeurs publiques sont dans `wrangler.jsonc` et `.env.production` ; seuls
les secrets de la Vigie de subventions s'ajoutent dans Cloudflare (section 8).

Vérification du waker : https://gestion-camp.maxime-0f5.workers.dev/_ping.
Le waker de secours (GitHub Actions) lit lui aussi `.env.production` : rien à
configurer.

### 7. Import des anciennes données (fait le 2026-09-25)

1. `npm run import:sauvegarder` copie les anciennes bases dans `scripts/migration/sauvegarde/`.
2. Copiez `.env.migration.example` vers `.env.migration` et remplissez-le avec
   l'URL et une clé **secrète** (Project Settings → API Keys → Secret keys).
3. Lancez `npm run import:essai` (lecture seule), puis `npm run import`.
4. Supprimez `.env.migration` une fois l'import terminé.

Les anciennes apps restent en service jusqu'au portage de leur module. On
éteint ensuite leurs projets Supabase et leurs wakers.

### 8. Vigie de subventions : secrets Cloudflare

Chaque lundi, le Worker demande à Claude (recherche web) les subventions
pertinentes pour chaque entreprise active, une par passage du cron (8 h, 9 h,
10 h UTC, soit 4 h à 6 h l'été à Montréal), puis envoie le courriel de rappel.
Il lui faut six secrets. Ils s'ajoutent dans Cloudflare, **jamais** dans le
dépôt : [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages →
`gestion-camp` → Settings → Variables and Secrets → **Add** → Type **Secret**.
Ils restent en place aux déploiements suivants.

| Secret | Où le trouver |
|---|---|
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) → Settings → Workspaces → **Create workspace** « Vigie de subventions », avec une **limite de dépense mensuelle** (Limits) ; puis API Keys → **Create Key** dans ce workspace. Une clé à part, pas une clé générale. |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret keys → **New secret key** (nom : `worker-gestion-camp`). Elle contourne la RLS : seulement dans Cloudflare. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Voir « Gmail » ci-dessous. |
| `GMAIL_REFRESH_TOKEN` | Voir « Gmail » ci-dessous. |
| `GMAIL_EXPEDITEUR` | L'adresse qui envoie (celle autorisée à l'étape 5 ci-dessous), ex. `maxime@camptremblant.com`. |

**Gmail (API Gmail, compte Google Workspace du camp)** — une seule fois :

1. [console.cloud.google.com](https://console.cloud.google.com), connecté avec le compte du camp : **New project** « Vigie ».
2. APIs & Services → Library → **Gmail API** → Enable.
3. APIs & Services → OAuth consent screen : type **Internal** (sinon le jeton
   expire au bout de 7 jours), nom « Vigie de subventions ».
4. Credentials → Create credentials → **OAuth client ID** → Web application ;
   Authorized redirect URI : `https://developers.google.com/oauthplayground`.
   Notez le Client ID et le Client secret.
5. [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground) :
   roue dentée → **Use your own OAuth credentials** (collez les deux valeurs) ;
   à gauche, tapez la portée `https://www.googleapis.com/auth/gmail.send` →
   Authorize APIs (avec l'adresse d'envoi) → **Exchange authorization code for
   tokens** → copiez le **Refresh token**.

Les mêmes quatre valeurs `GMAIL_*` servent au module Vigie des camps
compétiteurs (secrets Supabase, mêmes noms).

**Vérifier** : app → Subventions → Recherches. La carte Configuration doit
afficher trois ✓. Lancez une recherche pour une entreprise (3 à 10 minutes),
puis « M'envoyer un courriel d'essai ».

**Coût** : avec `claude-opus-5-5` (variable `SUBVENTIONS_MODELE` dans
`wrangler.jsonc`), compter de l'ordre de 1 à 2 $ US par entreprise et par
recherche (jetons + recherches web à 10 $ les 1000) : environ 10 à 25 $ par mois
pour trois entreprises. Le journal des recherches affiche les jetons et le
nombre de recherches web de chaque passage. `claude-sonnet-5-5` coûte deux fois
moins cher.

**Forfait gratuit de Cloudflare** : 10 ms de calcul par appel. Les appels à
Claude ne sont pas diffusés en flux pour rester sous cette limite ; si le
journal montre des erreurs « Exceeded CPU », passer au forfait Workers Paid
(5 $/mois).

### 9. Vigie des camps compétiteurs : secrets Supabase

Le 1er de chaque mois, la base (pg_cron) lance la vérification des camps suivis ;
la découverte de nouveaux camps part à la date choisie dans le module (par défaut
tous les 3 mois, prochaine le 2027-01-01). Les appels à Claude passent par la
fonction Edge Supabase `vigie` (`supabase/functions/vigie`), en lot (Message
Batches : moitié prix, aucune limite de temps) ; pg_cron la réveille toutes les
10 minutes tant qu'il y a du travail. Les changements trouvés attendent une
validation dans l'app ; le rapport part par Gmail.

Secrets **Supabase** (pas Cloudflare) : `ANTHROPIC_API_KEY` et les quatre
`GMAIL_*` de la section 8 (mêmes valeurs). Le plus simple, depuis `gestion-camp/` :

```bash
./scripts/vigie-secrets.sh
```

Le script demande chaque valeur sans l'afficher. Autre façon : Supabase →
Edge Functions → Secrets. Pour la clé Claude, créez de préférence une clé à part
dans un workspace « Vigie des camps » avec une limite de dépense mensuelle
(même marche à suivre qu'en 8).

**Vérifier** : app → Vigie des camps → Réglages → Connexions (deux ✅), puis
« Envoyer un courriel d'essai ». Journal → « Lancer la vérification mensuelle
maintenant » pour une première passe sans attendre le 1er novembre.

**Coût** : avec `claude-sonnet-5-5` (par défaut, modifiable dans Réglages),
compter de l'ordre de 20 à 35 $ US par vérification mensuelle des ~100 camps
suivis (environ 150 000 jetons lus par camp d'après l'essai du 2026-10-05, en lot
à moitié prix, plus les recherches web à 10 $ les 1000) ; environ le double avec
`claude-opus-5-5`. 1 à 3 $ par découverte. Le
Journal affiche le coût de chaque recherche.

**Déployer la fonction** après une modification de `supabase/functions/vigie` :

```bash
npx supabase functions deploy vigie --no-verify-jwt --use-api
```

### 10. Calendrier des opérations : synchro Airtable

Le Worker lit la base Airtable « Réservation Groupes » (table Réservations)
toutes les 15 minutes et met à jour `calendrier.sejours` (sens unique : rien
n'est jamais écrit dans Airtable). Une réservation retirée d'Airtable est
marquée supprimée, pas effacée. Les champs sont lus par leur identifiant
(`worker/calendrier/synchro.js`, `CHAMPS`) : renommer un champ dans Airtable ne
casse rien ; en supprimer ou en remplacer un, oui.

Secrets **Cloudflare** (même endroit qu'en 8) :

| Secret | Où le trouver |
|---|---|
| `AIRTABLE_TOKEN` | [airtable.com/create/tokens](https://airtable.com/create/tokens) → **Create token** « Calendrier gestion-camp », portée `data.records:read` seulement, accès à la base « Réservation Groupes - GLITCH ». |
| `SUPABASE_SECRET_KEY` | Le même qu'en 8 (déjà là si Subventions est configuré). |
| `CALENDRIER_JETON_SYNCHRO` | Facultatif : une longue chaîne au hasard (ex. `openssl rand -hex 24`), pour qu'une automatisation Airtable demande une synchro immédiate (Calendrier → Réglages → « Mise à jour immédiate »). |

**Vérifier** : app → Calendrier → Réglages → « Synchroniser maintenant » ; la
liste « Dernières synchros » affiche le bilan (ou l'erreur).

### 11. Réservations : formulaire public et page client

Pages publiques sans compte : `/demande` (formulaire, remplace Jotform),
`/client/<jeton>` (page client), `/signer/<jeton>`, `/fiches/<jeton>`. Elles
seront servies sur un sous-domaine de camptremblant.com (le site principal est
chez Squarespace) :

1. **Sous-domaine** (ex. `groupes.camptremblant.com`) : Cloudflare → Workers →
   `gestion-camp` → Settings → Domains & Routes → **Add custom domain**. Si le
   DNS de camptremblant.com n'est pas chez Cloudflare, ajouter dans le DNS du
   domaine (Squarespace) l'enregistrement CNAME indiqué par Cloudflare.
2. **Turnstile** (anti-robot, gratuit) : Cloudflare → Turnstile → **Add
   widget**, domaine = le sous-domaine (et celui du Worker), mode « Managed ».
   - clé du site → `VITE_TURNSTILE_SITE_KEY` dans `.env.production` (publique) ;
   - clé secrète → secret Cloudflare `TURNSTILE_SECRET` (même endroit qu'en 8).
3. `.env.production` : `VITE_HOTE_PUBLIC=groupes.camptremblant.com` (sur cet
   hôte, seules les pages publiques s'affichent ; les liens envoyés aux
   clients y mènent).
4. Site camptremblant.com : remplacer le lien du Jotform par
   `https://groupes.camptremblant.com/demande` (`?lang=en` pour l'anglais).

`SUPABASE_SECRET_KEY` (le même qu'en 8) sert aussi au formulaire et aux
téléchargements de la page client. En DEV, `.dev.vars` contient la clé
locale et les clés d'essai de Turnstile (toujours acceptées).

## Ajouter un module

1. Migration SQL : `npx supabase migration new <nom>`, avec un schéma `<nom>`,
   des politiques `core.peut_lire('<nom>')` / `core.peut_ecrire('<nom>')`,
   et le schéma ajouté dans `supabase/config.toml` (`[api] schemas`).
2. Ajoutez le module dans la contrainte `check` de `core.acces_modules.module`.
3. Créez `src/modules/<nom>/index.tsx`, ajoutez-le dans `src/shell/modules.ts`
   et ajoutez sa route dans `src/App.tsx`.
