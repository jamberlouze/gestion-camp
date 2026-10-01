# 🏕️ Gestion du camp

Application unique qui regroupe les outils de gestion du camp. Chaque outil
est un **module** (une mini-app) branché sur une coquille commune :
connexion, menu, référentiel partagé.

| Module | État | Appareils |
|---|---|---|
| 🚣 Embarcations : état de la flotte et réparations | En service | Mobile + ordinateur, hors ligne |
| 🛒 Commande : menus, recettes, commande Colabor | En service | Ordinateur |
| 🧩 Horaire : groupes et animateurs | En service | Ordinateur |
| 📆 Mastertimeline : tâches de l'année, toutes entreprises | En service | Ordinateur + téléphone (en ligne) |

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
  config.toml   réglages Supabase (connexion, courriels, schémas exposés)
worker/         code du Worker : waker Supabase (cron 4×/jour) + /_ping
wrangler.jsonc  configuration du Worker (site + cron)
.env.production valeurs Supabase publiques utilisées au build
scripts/migration/  import unique des anciens projets
```

**Base de données** : un schéma Postgres par module.

- `core` : `profils` et `acces_modules` (rôles), `groupes`, `employes`, `semaines`
- `embarcations` : `modeles`, `embarcations`
- `commande` : `recettes`, `consommables`, `banque_ingredients`, `groupes_repas`, `plan_cells`, `menus_sauves`, `ajouts_*`, `sorties`
- `horaire` : `parametres`, `horaires` (un document par semaine ou par modèle de séjour, le temps que le module se stabilise), `dossiers` (rangement des semaines par saison)
- `mastertimeline` : `taches` (la liste qui sert d'une année à l'autre), `coches` (un passage par mois : faite, « pas cette année », note de l'année), `projets`, `entreprises`, `responsables`, `fournisseurs`, `achats`. Reprise de la base Airtable « Mastertimeline - LÜTRA » le 2026-09-30 (`scripts/migration/mastertimeline.mjs`)

**Accès** : seules les personnes invitées peuvent se connecter. Elles reçoivent
un code à 6 chiffres par courriel. Il y a trois rôles, appliqués par la RLS de
Postgres (et pas seulement dans l'interface) :

| Rôle | Accès |
|---|---|
| `admin` | Tout, y compris la page Utilisateurs |
| `direction` | Tous les modules et le référentiel (rôle par défaut à l'invitation) |
| `coordo` | Seulement les modules cochés dans la page Utilisateurs (lecture ou écriture) |

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

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l'app en local sur http://localhost:5173 |
| `npm run build` | Vérifie les types et construit `dist/` |
| `npm run db:push` | Applique les nouvelles migrations au projet Supabase |
| `npm run db:config` | Envoie `supabase/config.toml` (connexion, courriels) au projet |
| `npm run db:types` | Régénère les types TypeScript à partir de la base |
| `npm run import:essai` | Lit les anciennes bases et affiche les décomptes (n'écrit rien) |
| `npm run import` | Importe les anciennes données dans la nouvelle base |
| `npm run deploy` | Déploiement manuel (normalement automatique à chaque push) |

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
   npm run db:push
   ```

### 2. Courriels (Google Workspace)

Le serveur courriel intégré de Supabase n'écrit qu'aux membres de l'équipe
Supabase. Il faut donc passer par le compte Google du camp.

1. Sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   (la validation en deux étapes doit être activée), créez un mot de passe
   d'application nommé « Supabase ».
2. Copiez `supabase/.env.example` vers `supabase/.env`, puis remplissez
   `SMTP_USER` (l'adresse d'envoi) et `SMTP_PASS` (le mot de passe d'application).
3. Lancez `npm run db:config`.

### 3. Premier administrateur

1. Supabase → **Authentication → Users → Invite user** : entrez votre adresse.
2. Acceptez l'invitation reçue par courriel.
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
Aucune variable n'est à définir dans Cloudflare : tout est dans `wrangler.jsonc`
et `.env.production`.

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

## Ajouter un module

1. Migration SQL : `npx supabase migration new <nom>`, avec un schéma `<nom>`,
   des politiques `core.peut_lire('<nom>')` / `core.peut_ecrire('<nom>')`,
   et le schéma ajouté dans `supabase/config.toml` (`[api] schemas`).
2. Ajoutez le module dans la contrainte `check` de `core.acces_modules.module`.
3. Créez `src/modules/<nom>/index.tsx`, ajoutez-le dans `src/shell/modules.ts`
   et ajoutez sa route dans `src/App.tsx`.
