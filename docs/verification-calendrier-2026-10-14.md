# Vérification du Calendrier — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14.** Corrigés en chemin : dans une période libre (séjour cadré), un 2e bouton « Période de paie » serrait le titre sur trois lignes (retiré : aucun bouton de la bascule n'est allumé, « Période de paie » y ramène) ; le courriel de Réglages › Personnel prenait toute la largeur (`w-56!`, et seulement pour la direction) ; champs de la fenêtre à 16 px sur téléphone (sinon l'iPhone zoome) ; bandeau « Annuler » gardé 20 s au lieu de 12. **Reste pour Maxime** : les cases non cochées (vrai doigt sur iPad et téléphone, lien de la maquette 3D), §7 (décisions) et §8 (PROD).

En DEV seulement (base locale). Aperçu `calendrier-essai` : http://localhost:5205/calendrier.
Comptes : `admin@camp.test` (admin ; en DEV, lié à « Maxime » du Calendrier),
`julie@camp.test` (direction), `sarah@camp.test` (coordo), `alex@camp.test`
(terrain). Données d'essai : `supabase/seed.sql`, section « Calendrier :
horaire de la direction » (Frédérique à la direction et liée à Frédérique de
Cuisine, journées du 12 au 20 oct.). Migration : `20261014180840_calendrier_saisie_direction.sql`.

## 1. Module caché sauf les admins (droits inchangés)

- [x] `src/shell/modules.ts` : `cacheSaufAdmins: "jusqu'à ce que les Réservations soient en place"` sur le Calendrier ; `peutOuvrir` dans `useAuth` (= `peutLire`, sauf un module caché pour un non-admin) ; menu (`Layout`), accueils (`Accueil`, `NouvelAccueil` : raccourcis et recherche ⌘K, même liste), `Depart` et `GardeModule` s'en servent. Grille d'accès et RLS : aucun changement.
- [x] Admin : Calendrier dans le menu, la page s'ouvre.
- [x] Julie (direction) : plus de Calendrier dans le menu ni dans les raccourcis (Mastertimeline, Réunions, Travaux, Feuilles de temps).
- [x] Julie à l'adresse `/calendrier?vue=periode` : « Calendrier : en pause — Réservé aux administrateurs pour l'instant, jusqu'à ce que les Réservations soient en place » + « Retour à l'accueil ».
- [x] Accueil de Julie : « Le camp aujourd'hui » montre toujours 16 personnes au travail (Direction : Frédérique, Maxime, Vickie) ; carte « Aujourd'hui » sans le lien « Calendrier » (séjours et événements restent lus, sans lien).
- [x] SQL (Julie) : `v_presence_jour` lisible (16 lignes le 14 oct.), `core.peut_ecrire('calendrier')` = vrai : rien n'a bougé en base.
- [x] Cuisine › Horaire de Julie : « Sur le camp cette semaine » sans le lien « Calendrier » ; légende de Frédérique sans lien.
- [ ] « Voir le calendrier » de la maquette 3D (`LeCamp.tsx`, travail non commité de la conversation « Maquette 3D ») mène encore à la page « en pause » pour un non-admin : à remplacer par `peutOuvrir('calendrier')` dans cette conversation (fichier pas touché).

## 2. Horaire de la direction — saisie rapide (`HoraireDirection.tsx`)

- [x] « + » d'un jour : la fenêtre choisit d'office la personne connectée (« Maxime (moi) », lien par `calendrier.personnel.courriel`).
- [x] Choix rapide 🏕️ Terrain / 💻 Télétravail / 🌴 Congé : un clic enregistre et ferme (2 clics en tout) ; la case montre l'émoji ; le choix actuel est encadré quand on rouvre.
- [x] Sam. 17 : Terrain → SQL `statut = terrain`, `updated_by` = Admin Test ; bandeau « 🏕️ Terrain · Maxime · sam. 17 — Annuler ».
- [x] Note + Congé (dim. 18) : « 🌴 Maxime · Mariage », grisé, à la fin de la case.
- [x] Sans lien (courriel retiré) : personne n'est choisi, boutons grisés, message ; choisir Maxime → « C'est moi (Maxime) » enregistre le courriel ; la puce devient « Maxime (moi) ».
- [x] Autre personne choisie à la main (Vickie, puis « Autre personne… » pour le reste du personnel).
- [x] « Retirer Maxime » (un jour) → bandeau « Retiré : Maxime · sam. 17 ».
- [x] Glisser à la souris sur la rangée Direction, mer. 21 → ven. 23 : cases surlignées, fenêtre « Direction · mer. 21 → ven. 23 (3 jours) » ; Vickie en Télétravail sur les 3 jours ; « Annuler » → les 3 jours retirés (journal : 3 ajouts puis 3 suppressions au nom d'Admin Test).
- [x] « Du lun. 12 au [ven. 16] » (au format téléphone) : « 5 jours », « Retirer Maxime (3 jours) » ; Télétravail sur les 5, puis « Annuler » : chaque jour revient tel quel (SQL : 12 et 16 retirés, 13 Terrain, 14 sans précision, 15 Télétravail).
- [x] Glisser au doigt : événements pointeur `pointerType: 'touch'` simulés (lun. → mar.) → fenêtre « 2 jours » ; cases de la rangée en `touch-action: pan-y` (le défilement vertical de la page reste possible).
- [ ] Vrai doigt sur iPad et sur téléphone (glisser sur la rangée Direction ; la grille défile en touchant les autres rangées). — à Maxime
- [x] Journal : « choix : 💻 Télétravail → 🏕️ Terrain », « courriel : ∅ → admin@camp.test ».
- [x] Migration : les notes exactement « Télétravail » (import du Sheets « Horaire Automne 2026 ») deviennent le statut ; en DEV aucune (la note « Télétravail l'après-midi » de Vickie reste une note).
- [x] SQL : courriel en majuscules refusé (minuscules seulement), même courriel deux fois refusé, statut inconnu (« vacances ») refusé.
- [x] `v_presence_jour` : un congé n'y est pas (16 oct. : Frédérique absente du compte de l'accueil) ; télétravail = « Télétravail » dans la description ; colonne `statut` ajoutée à la fin.
- [x] Rangée Terrain inchangée (fenêtre à cocher).

## 3. Rangée Cuisine du Calendrier

- [x] Rôles cachés (plus de « · Cook », « · Gestionnaire »).
- [x] Ordre Gestionnaire > Lead > Help > autres : essai temporaire (Ketchup = Lead, Couscous = Help, quarts le 15 oct.) → Ketchup puis Couscous, contre l'ordre alphabétique ; remis comme avant (Cook, quarts d'essai effacés).

## 4. Frédérique : direction, et lue dans l'horaire de cuisine

- [x] DEV : « Frédérique » du Calendrier (Direction) liée à « Frédérique » de Cuisine (Gestionnaire) par `personnel.personne_cuisine_id` (seed).
- [x] Calendrier : Frédérique seulement dans la rangée Direction ; le 14 oct., la rangée Cuisine = Couscous, Ketchup (son quart « 6h30 à 14h30 » n'y est plus).
- [x] Cuisine › Horaire (admin et Julie) : sa ligne est lue, sans champ : lun.–mer. 🏕️ Terrain, jeu. 💻 Télétravail, ven. 🌴 Congé ; 🗓️ après son nom et légende « journées lues dans l'horaire de la direction du Calendrier (elles s'y saisissent, pas ici) » ; total « 0 h + 4 ? » (jours sans heures) ; « Au travail » ne compte que sur place (Terrain ou sans précision).
- [x] Son ancien quart du 14 oct. n'est pas effacé : caché ce jour-là (journée du Calendrier), montré en gris un jour sans journée.
- [x] « Copier la semaine précédente » (19 oct.) : « 2 cases » copiées, pas la sienne ; « Vider la semaine » ensuite (remis comme avant).
- [x] Réglages › Personnel : « Pas à l'horaire de cuisine » → elle revient en double dans la rangée Cuisine (SQL) ; « Aussi à l'horaire de cuisine : Frédérique » → corrigé.
- [x] SQL : `calendrier.horaire_cuisine_lie` = 5 journées pour l'admin et Julie ; 0 pour Sarah (coordo) et Alex (terrain), qui ne lisent ni Cuisine ni le Calendrier.

## 5. Vue Période = périodes de paie

- [x] Bascule « Semaine | Mois | Période de paie » ; 14 colonnes du dimanche au samedi.
- [x] « PP22 · 18 au 31 oct. 2026 · paie le 5 nov. » ; → « PP23 · 1er au 14 nov. 2026 · paie le 19 nov. » ; au téléphone « PP21 · 4 au 17 oct. 2026 · paie le 22 oct. » (mêmes repères que `docs/verification-temps-2026-10-14.md`).
- [x] Clic sur un séjour (Cégep Dawson) → période libre 20 → 22 oct. (Du / Au), aucun bouton de la bascule allumé ; « Période de paie » → PP22.
- [x] `src/lib/periodesPaie.ts` pas modifié (aucune fonction ajoutée) ; `npm run test:periodes` passe.

## 6. Vues Semaine et Mois : constat (rien de bâti)

**Semaine, pour remplacer le Sheets « Horaires Automne »** : utilisable (une colonne par jour ; Direction en saisie rapide, Terrain, Cuisine et Animation lues ; séjours par section ; événements). Manque :
- pas de version imprimée de la grille (le menu et les boutons sortiraient sur papier) ;
- pas de demi-journée (seulement la note : « Télétravail l'après-midi ») ;
- pas de « copier la semaine précédente » pour la direction (le glisser compense en partie) ;
- les personnes viennent de la liste du module (Réglages › Personnel), pas du référentiel Employés ; chacune doit avoir son courriel (ou cliquer « C'est moi » une fois) ;
- au téléphone, deux jours à l'écran ; la rangée Direction ne fait pas défiler la grille de côté (le doigt y sélectionne des jours).

**Mois, pour remplacer Google Agenda (réservations)** : utilisable pour voir les groupes du mois (couleur du bâtiment, pointillé = pas confirmé, « → » à l'arrivée, clic = jours exacts). Manque :
- les séjours viennent encore d'Airtable, pas du module Réservations (et pas d'Airbnb) ;
- au plus 4 groupes par jour (« + N groupes » mène à la semaine) ; pas de barres continues d'un jour à l'autre ;
- rien sur le séjour au survol que le nom et les dates (ni numéro, ni nombre de personnes, ni lien vers la réservation) ;
- pas de filtre (bâtiment, état) ; la direction n'y est qu'un chiffre par jour ;
- au téléphone, la grille du mois défile de côté (42 rem).

## 7. Décisions prises par Claude, à confirmer

1. Module caché par un nouveau drapeau `cacheSaufAdmins` (texte affiché sur la page « en pause ») + `peutOuvrir`, pas `adminsSeulement` (qui aurait aussi coupé les données de l'accueil et de Cuisine). Les coordonnateurs cochés ne le voient plus non plus. La page Utilisateurs montre toujours ses cases (ce sont les droits, inchangés).
2. Les liens vers `/calendrier` des autres écrans (carte « Aujourd'hui », « Sur le camp cette semaine » de Cuisine) sont cachés aux non-admins ; leurs données restent.
3. Émojis : 🏕️ Terrain (sur place au camp), 💻 Télétravail, 🌴 Congé.
4. Un congé est une ligne avec `statut = conge` (la trace reste), absente de `v_presence_jour` (pas « au travail ») ; affiché grisé à la fin de la case.
5. Télétravail = au travail (dans `v_presence_jour`) ; mais dans « Au travail » de Cuisine, seulement Terrain ou sans précision (sur place).
6. Un choix rapide ferme la fenêtre ; « Annuler » reste 20 s dans un bandeau en bas.
7. Plusieurs jours : seulement parmi les jours affichés ; sans note, chaque jour garde la sienne.
8. Choix rapide seulement dans la rangée Direction (Terrain : la fenêtre à cocher d'avant).
9. Lien compte ↔ personne = nouvelle colonne `calendrier.personnel.courriel` (minuscules, unique), réglée dans Réglages › Personnel ou par « C'est moi » ; rien de rempli d'avance en PROD.
10. Frédérique : un réglage (`personnel.personne_cuisine_id`, menu « Aussi à l'horaire de cuisine ») plutôt qu'une migration de données ; sa ligne de Cuisine devient lue ; ses anciens quarts restent (gris un jour sans journée) ; ses jours comptent comme « + N ? » (sans heures) ; elle est exclue de « Copier la semaine précédente ».
11. La vue Période devient la période de paie ; le clic sur un séjour garde la période libre (demandée avant par la direction), avec Du / Au seulement dans ce cas.
12. Seules les notes exactement « Télétravail » deviennent le statut (migration).
13. DEV : « Maxime » du Calendrier = compte Admin Test.

## 8. Avant la mise en ligne

- [ ] Migration `20261014180840_calendrier_saisie_direction.sql` (`npm run prod:db:push`) ; rien à exposer (schéma `calendrier` déjà exposé).
- [ ] À mettre en ligne ensemble : `modules/calendrier`, Cuisine (`HoraireCuisine.tsx`, `SurLeCamp.tsx`), le cadre (`auth.tsx`, `Gardes.tsx`, `Layout.tsx`, `Accueil.tsx`, `App.tsx`, `modules.ts`) et l'accueil (`NouvelAccueil.tsx`, `Aujourdhui.tsx` : une ligne chacun ; le reste de ces fichiers est à la maquette 3D).
- [ ] En PROD, après le déploiement (Maxime, admin) — Calendrier › Réglages › Personnel :
  - Frédérique : secteur **Direction**, puis menu **« Aussi à l'horaire de cuisine : Frédérique »** (si elle n'est pas dans la liste : « + Ajouter » « Frédérique », puis les deux mêmes réglages) ;
  - courriel du compte de chaque personne de la direction (Maxime : maxime@camptremblant.com, Marco…), ou chacune clique « C'est moi » la première fois.
- [ ] Prévenir la direction et les coordonnateurs que le Calendrier est en pause (il disparaît de leur menu ; l'accueil et Cuisine continuent de lire ses données).
- [ ] Maquette 3D : lien « Voir le calendrier » de `LeCamp.tsx` (§1) ; si la maquette ne doit montrer que les gens sur place, écarter `statut = 'teletravail'` de `usePresenceJour`.
