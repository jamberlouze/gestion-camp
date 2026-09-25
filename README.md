# 🏕️ Gestion du camp

Application unique qui regroupe les outils de gestion du camp. Chaque outil
est un **module** (une mini-app) branché sur une coquille commune :
connexion, menu, référentiel partagé.

| Module | État | Appareils |
|---|---|---|
| 🚣 Embarcations : état de la flotte et réparations | Migration début octobre | Mobile + ordinateur, hors ligne |
| 🛒 Commande : menus, recettes, commande Colabor | Migration après Embarcations | Ordinateur |
| 🗓️ Horaire : groupes et animateurs | En développement | Ordinateur |

**Stack** : React + TypeScript (Vite), Supabase (base de données, connexion,
temps réel), Cloudflare Pages (site), Cloudflare Worker (waker).

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
worker/         waker Supabase (cron 4×/jour)
scripts/migration/  import unique des anciens projets
```

**Base de données** : un schéma Postgres par module.

- `core` : `profils` et `acces_modules` (rôles), `groupes`, `employes`, `semaines`
- `embarcations` : `modeles`, `embarcations`
- `commande` : `recettes`, `consommables`, `banque_ingredients`, `groupes_repas`, `plan_cells`, `menus_sauves`, `ajouts_*`, `sorties`
- `horaire` : `parametres`, `horaires` (un document par semaine, le temps que le module se stabilise)

**Accès** : seules les personnes invitées peuvent se connecter. Elles reçoivent
un code à 6 chiffres par courriel. Il y a trois rôles, appliqués par la RLS de
Postgres (et pas seulement dans l'interface) :

| Rôle | Accès |
|---|---|
| `admin` | Tout, y compris la page Utilisateurs |
| `direction` | Tous les modules et le référentiel (rôle par défaut à l'invitation) |
| `coordo` | Seulement les modules cochés dans la page Utilisateurs (lecture ou écriture) |

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
| `npm run waker:deploy` | Déploie le waker sur Cloudflare |

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

Copiez `.env.example` vers `.env.local` et remplissez les deux valeurs
(Supabase → **Project Settings → API Keys** : l'URL du projet et la clé
*publishable*). Lancez ensuite `npm run dev`.

### 5. GitHub

Sur [github.com/new](https://github.com/new) : nom `gestion-camp`, **Private**,
sans README ni .gitignore. Suivez ensuite les commandes « …or push an existing
repository » affichées par GitHub.

### 6. Cloudflare Pages (le site)

1. Tableau de bord Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → dépôt `gestion-camp`.
2. Build command : `npm run build`. Build output directory : `dist`.
3. **Environment variables** : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Chaque `git push` sur `main` redéploie ensuite le site automatiquement.

### 7. Sous-domaine gestion.camptremblant.com (GoDaddy)

Le DNS reste chez GoDaddy. Le courriel Google et le site Squarespace ne sont pas touchés.

1. Cloudflare → projet Pages → **Custom domains → Set up a custom domain** → `gestion.camptremblant.com`.
2. GoDaddy → **Mes produits → camptremblant.com → DNS → Ajouter un enregistrement** :
   - Type : **CNAME**
   - Nom : `gestion`
   - Valeur : `gestion-camp.pages.dev` (l'adresse exacte est affichée par Cloudflare à l'étape 1)
   - TTL : 1 heure
3. Revenez dans Cloudflare : le domaine passe à *Active* en quelques minutes, ou jusqu'à quelques heures, et le certificat HTTPS est automatique.

### 8. Waker

1. Dans `worker/wrangler.jsonc`, remplacez les deux valeurs `A-REMPLACER` (mêmes valeurs qu'à l'étape 4).
2. Lancez `npx wrangler login`, puis `npm run waker:deploy`.
3. Vérifiez sur `https://gestion-camp-waker.<compte>.workers.dev/_ping`.
4. Waker de secours (GitHub Actions) : sur GitHub, allez dans le dépôt → **Settings → Secrets and variables → Actions → Variables** et ajoutez `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`.

### 9. Import des anciennes données

1. Copiez `.env.migration.example` vers `.env.migration` et remplissez-le avec
   l'URL et une clé **secrète** (Project Settings → API Keys → Secret keys).
2. Lancez `npm run import:essai` (lecture seule), puis `npm run import`.
3. Supprimez `.env.migration` une fois l'import terminé.

Les anciennes apps restent en service jusqu'au portage de leur module. On
éteint ensuite leurs projets Supabase et leurs wakers.

## Ajouter un module

1. Migration SQL : `npx supabase migration new <nom>`, avec un schéma `<nom>`,
   des politiques `core.peut_lire('<nom>')` / `core.peut_ecrire('<nom>')`,
   et le schéma ajouté dans `supabase/config.toml` (`[api] schemas`).
2. Ajoutez le module dans la contrainte `check` de `core.acces_modules.module`.
3. Créez `src/modules/<nom>/index.tsx`, ajoutez-le dans `src/shell/modules.ts`
   et ajoutez sa route dans `src/App.tsx`.
