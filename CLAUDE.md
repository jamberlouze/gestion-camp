# Gestion du camp — conventions

- Code, noms de tables, colonnes et variables **en français** (sauf les tables reprises telles quelles de l'ancien Commande : `name`, `cat`, etc.).
- Un schéma Postgres par module (`core`, `embarcations`, `commande`, `horaire`). Toute nouvelle table : RLS activée + politiques `core.peut_lire('<module>')` / `core.peut_ecrire('<module>')` (référentiel `core` : `core.est_direction()`).
- Les changements de base passent **toujours** par une migration dans `supabase/migrations/` (jamais d'édition manuelle dans le tableau de bord).
- Accès aux données côté client : `supabase.schema('<module>').from(...)` ; listes simples via `useListe` / `useEnregistrer` / `useSupprimer` (`src/lib/donnees.ts`), qui gèrent le temps réel.
- Seul le module Embarcations vise le mobile et le hors-ligne ; Commande et Horaire sont pensés pour ordinateur.
- Styles : Tailwind v4, classes partagées dans `src/lib/ui.ts`, couleurs `foret-*` / `pierre-*` (`src/index.css`).
- Node est dans `/usr/local/bin` (installateur officiel, pas Homebrew — macOS 14 non supporté par Homebrew).
