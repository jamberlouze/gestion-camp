# Gestion du camp — conventions

- Code, noms de tables, colonnes et variables **en français** (sauf les tables reprises telles quelles de l'ancien Commande : `name`, `cat`, etc.).
- Un schéma Postgres par module (`core`, `embarcations`, `commande`, `horaire`). Toute nouvelle table : RLS activée + politiques `core.peut_lire('<module>')` / `core.peut_ecrire('<module>')` (référentiel `core` : `core.est_direction()`).
- Les changements de base passent **toujours** par une migration dans `supabase/migrations/` (jamais d'édition manuelle dans le tableau de bord).
- Accès aux données côté client : `supabase.schema('<module>').from(...)` ; listes simples via `useListe` / `useEnregistrer` / `useSupprimer` (`src/lib/donnees.ts`), qui gèrent le temps réel.
- Seul le module Embarcations vise le mobile et le hors-ligne ; Commande et Horaire sont pensés pour ordinateur.
- Modifications hors ligne (voir `src/modules/embarcations/donnees.ts`) : chaque mutation a une clé fixe et est définie avec `clientRequetes.setMutationDefaults` (enregistrée dans `src/lib/requetes.ts` **avant** la restauration du cache), sinon une modification en attente ne peut pas reprendre après un rechargement. Mise à jour optimiste ligne par ligne ; le contexte ne garde que la ligne d'avant (jamais toute la liste). Identifiants créés côté client (`crypto.randomUUID()`).
- `gcTime` des requêtes : `Infinity` — jamais une durée > 24,8 jours (débordement de `setTimeout` : le cache restauré serait effacé aussitôt).
- Canaux temps réel : toujours un nom unique (`${nom}-${crypto.randomUUID()}`), sinon « cannot add postgres_changes callbacks after subscribe() » au remontage.
- Dans un module monté sur `<nom>/*`, les liens d'onglets sont absolus (`/embarcations/tableau`) : un lien relatif se résout depuis l'adresse courante.
- Styles : Tailwind v4, classes partagées dans `src/lib/ui.ts`, couleurs `foret-*` / `pierre-*` (`src/index.css`).
- Node est dans `/usr/local/bin` (installateur officiel, pas Homebrew — macOS 14 non supporté par Homebrew).
