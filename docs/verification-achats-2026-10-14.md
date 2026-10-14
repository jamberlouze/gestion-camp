# Vérification des Achats — compagnie sous l'item, date cible, compteur (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14.** Demande de la réunion avec Charlotte : mieux voir ce qui reste à commander et quand (ex. le tag à l'arc pas encore commandé). Corrigés en chemin : teinte rouge / ambre du champ date qui ne s'affichait pas (le fond transparent des cellules l'emportait), colonne Item devenue trop étroite avec la nouvelle colonne (largeurs revues : l'item prend ce qui reste, la note a une largeur fixe), champ date coupé à droite. **Reste pour Maxime** : un coup d'œil sur un vrai téléphone, les décisions du §6, puis la mise en ligne (§7).

En DEV seulement (base locale). Données d'essai (`seed.sql`, dates comptées du
jour du chargement) : « Arcs de tag-à-l'arc » en retard de 3 jours, « Masque
tag à l'arc » dans 5 jours, « Tables à picnique +10 » dans 20 jours, « Modules
Aquabounga » dans 60 jours, « Quai Rabaska » commandé à date passée (aucun
signal), les autres sans date.

**Avant de commencer** : l'aperçu `achats-essai` (http://localhost:5204/achats)
ou tout autre aperçu `*-essai` (même code), compte `julie@camp.test`
(direction : le module est à la direction dans la grille) ou `admin@camp.test`.

## 1. Base de données

- [x] Migration `20261014180226_achats_date_cible` : colonne `achats.achats.date_cible` (date, facultative). Appliquée seule en DEV et inscrite à l'historique.
- [x] RLS inchangée : direction lit les 26 achats et modifie `date_cible` ; coordo et terrain ne voient aucune ligne et ne modifient rien (test SQL, transaction annulée).
- [x] Données d'essai chargées (5 dates, voir plus haut).

## 2. Compagnie sous l'item

- [x] Pastille de la compagnie qui paie (`PuceCompagnie`, couleur du référentiel, abréviation si elle existe, sinon le nom) sous le nom de chaque item qui en a une ; rien quand il n'y en a pas.
- [x] Changer la compagnie dans la colonne Entreprise change la pastille tout de suite (Aquabounga : jaune lisible).
- [x] Téléphone : la pastille est visible sous l'item sans faire défiler le tableau.

## 3. Date cible

- [x] Colonne « Date cible » juste après l'item ; vide = « aaaa-mm-jj » pâle.
- [x] Poser une date l'enregistre (vérifié en base) ; la vider remet « pas de date » (null).
- [x] Une date en cours de frappe (année « 0202 ») n'est pas enregistrée ; en quittant le champ, la date d'avant revient. — l'outil de test ne sait pas taper dans un champ date : posée par script
- [x] À l'ajout : « + Ajouter un achat » demande l'item et une date cible facultative ; Entrée ajoute, Échap annule ; l'achat est créé avec sa date (vérifié en base), ou sans.
- [x] Signal, seulement pour « À commander » : rouge (champ et étiquette « En retard de 3 jours » sous l'item) une fois la date passée ; ambre à 7 jours ou moins (« Dans 5 jours », « Dans 2 jours », « Demain », « Aujourd'hui ») ; rien au-delà.
- [x] Passé à « Commandé » ou « Reçu » : plus aucun signal (Masque tag à l'arc, Quai Rabaska), la date reste affichée.
- [x] « Trier par date cible » : la date la plus proche d'abord, sans date à la fin (puis par statut et par nom) ; « Trier par statut » = l'ordre d'avant.
- [x] Règles pures testées : `node --test src/modules/achats/outils.test.mjs` (6 tests : jours, signal, 30 jours, libellés, date en cours de frappe, tri).

## 4. Compteur « à commander dans les 30 prochains jours »

- [x] En haut du module : « 3 achats à commander dans les 30 prochains jours, dont 1 en retard » (retard + 5 jours + 20 jours ; 60 jours et sans date pas comptés ; commandé jamais).
- [x] Un clic filtre la liste sur ces achats, triés par date cible ; l'adresse devient `/achats?cible=30` ; aucun statut n'est allumé ; ✕ ou un clic sur un statut revient à la liste.
- [x] Ouvrir directement `/achats?cible=30` (lien que l'accueil pourra utiliser) : liste filtrée, triée par date.
- [x] Un achat passé à « Commandé » quitte le filtre et le compteur baisse (3 → 2).
- [x] Avec une compagnie choisie, le compteur ne compte que ses achats (GBPA+ : 2, dont 1 en retard), comme les nombres des statuts.
- [x] Aucun achat dans les 30 jours : texte gris « Aucun achat à commander dans les 30 prochains jours. » (pas de bouton).
- [x] Un achat ajouté pendant le filtre, mais hors des 30 jours, fait revenir à la liste complète (il ne disparaît pas).

## 5. Pour l'accueil (pas touché ici)

- [x] Hook `useAchatsACommanderBientot()` dans `src/modules/achats/donnees.ts` : `enRetard` (date passée, la plus ancienne d'abord), `aVenir` (aujourd'hui à 30 jours, la plus proche d'abord), `nombre` (les deux), `pret`, `erreur`, `lien` (`/achats?cible=30`). À monter seulement si `peutLire('achats')`. Libellés réutilisables : `libelleCible`, `dateCourte` (`outils.ts`).
- [x] `src/shell/accueil/` non modifié.

Vérifié aussi : ordinateur (1440 px) et téléphone (375 px), comptes Julie (direction) et Admin Test ; `npm run build` et `oxlint` sans erreur pour le module.

## 6. Décisions prises par Claude, à confirmer

- Pas de fiche dans ce module (tout se modifie dans le tableau) : la date cible est une **colonne** du tableau, plus un champ à l'ajout.
- La **colonne Entreprise** reste (c'est là qu'on la change) ; la pastille sous l'item est en plus.
- Le **compteur suit le filtre de compagnie** (comme les nombres des statuts) ; le hook de l'accueil compte tout.
- Une date à plus de 7 jours n'a **aucune étiquette** sous l'item (seulement dans la colonne), pour garder la liste calme. Sur téléphone, il faut faire défiler pour la voir.
- « Aujourd'hui » compte comme ambre (pas encore en retard) ; le jour est celui de l'appareil.
- Le tri choisi n'est pas gardé (revient à « par statut » à l'ouverture, ou « par date » avec `?cible`).

## 7. Avant la mise en ligne

- [ ] Coup d'œil sur un vrai téléphone (le tableau défile de côté, comme avant). — à Maxime
- [ ] Migration `20261014180226_achats_date_cible` à passer en PROD avec `/mise-en-ligne` (ajout d'une colonne facultative : rien à reprendre, aucun achat n'a de date au départ).
