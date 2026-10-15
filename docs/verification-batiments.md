# Vérification du module Bâtiments (disjoncteurs et valves)

> **Passée par Claude en DEV le 2026-10-13.** Corrigés en chemin : icône 🏠 déjà prise par l'Accueil (→ 🏘️), « quoi » coupé en fin de case (remis en premier, en gras, texte complet au survol), numéro « 15-17 » qui passait à la ligne, fiche du panneau sous son dessin sur téléphone (remontée), recherche « b10 » qui montrait aussi des disjoncteurs sans rapport, exemple « PB » de la recherche des valves qui ne trouvait rien. **Reste pour Maxime** : les cases non cochées (coup d'œil sur les vraies données) et §8 (décisions).

En DEV seulement (base locale). **Avant de commencer** : `npm run db:start`, puis
l'aperçu `dev` (http://localhost:5173). Connexion par code (Mailpit,
http://localhost:54324) : `julie@camp.test` (direction), `sarah@camp.test`
(coordo), `admin@camp.test` (admin).

## 1. Accès

- [x] Direction (julie) : « Bâtiments 🏘️ » dans le menu, juste après Rooming ; onglets Disjoncteurs, Valves, Réglages.
- [x] Tests SQL des droits (transactions annulées) : admin et direction lisent et modifient (disjoncteurs, valves, fichiers du seau) ; coordo et terrain ne voient rien et ne peuvent rien écrire ; anonyme : « permission denied for schema batiments ».
- [x] Coordo (sarah) : pas de Bâtiments dans le menu ; `/batiments` refusé.
- [ ] Admin › Utilisateurs : la grille a la ligne « Bâtiments », la direction en écriture. — à Maxime

## 2. Import du classeur « Breakers et Valves »

60 disjoncteurs (A 36, B 20, CU 4), 2 valves, panneaux Pins et Cèdres vides.

- [x] Les deux façons de noter du classeur sont regroupées : une fiche par disjoncteur (ex. A #20 = lumière de VFB 1, 3, 5, corridor VFB et SDB côté rue).
- [x] Bandeau « À identifier sur place » : 12 (11 sans rien de noté + CU #30-1 « à vérifier », deux circuits sur le même disjoncteur).
- [x] A #13-2, noté « ??? » une fois mais aussi « prise VFB 1, 3, 5 » : n'est plus à identifier.
- [ ] Coup d'œil sur les panneaux A, B et CU, comparés au classeur. — à Maxime (surtout A #8, A #3-1, A #30-1 et A #39, dont le texte du classeur était difficile à lire)

## 3. Panneau (onglet Disjoncteurs, « Par panneau »)

- [x] Dessiné comme un vrai panneau (demande de Maxime) : boîtier gris, disjoncteurs noirs au centre, manette vers le centre, numéros sur la plaque, étiquettes sur les côtés, de la même hauteur que leur disjoncteur (demi : la moitié ; bipolaire : deux rangées, demande de Maxime) ; demis (13-1 / 13-2) l'un sous l'autre ; bipolaire (A #36-38, B #10-12) sur deux rangées, manettes reliées ; emplacements libres = plaques grises.
- [x] Étiquette jaune = à identifier ; contour ambre et « ? » = à vérifier ; plaque grise = emplacement libre (« + » pour la direction). Rangées de hauteur fixe, texte coupé à 2 lignes (complet au survol et dans la fiche).
- [x] Panneau vide (Pins, Cèdres) : « Aucun disjoncteur noté » + « + Disjoncteur ».
- [x] Panneau choisi gardé sur l'appareil.
- [x] Fiche du panneau (où il est, photos) en bandeau au-dessus du dessin ; téléphone : disjoncteurs plus étroits pour laisser de la place aux étiquettes.

## 4. Fiche d'un disjoncteur

- [x] Ouvrir depuis le bandeau, le panneau, la recherche ou la vue par pièce.
- [x] Modifier ce qu'il alimente (pièce + quoi, suggestions des noms déjà utilisés), enregistrer : le bandeau passe de 12 à 11.
- [x] Ajouter depuis une case libre : emplacement déjà rempli.
- [x] Emplacement déjà pris (A #13 plein, bipolaire 13-15) : refusé avec « Cet emplacement est déjà pris par A #13-1 » (la base refuse aussi).
- [x] Bipolaire 15-17 ajouté puis supprimé (confirmation).
- [x] Panneau avec un nombre d'emplacements : un disjoncteur au-delà est refusé (testé en SQL).

## 5. Recherche et « Par pièce »

- [x] « vfb3 » → A #13-2 (prise) et A #20 (lumière), seule la ligne de VFB 3 en clair, « + n autre(s) ».
- [x] « chauffe-eau » → A #37-2 ; « motel 19 » → ses 6 disjoncteurs ; « b10 » → seulement B #10-12.
- [x] « Par pièce » : chaque pièce et ses disjoncteurs (tri naturel), les lignes sans pièce à la fin.

## 6. Valves, photos, Réglages

- [x] Valves par bâtiment, pastille eau chaude / froide ; fiche modifiable ; recherche.
- [x] Photo ajoutée à une valve (seau privé, adresse signée), affichée, puis retirée (table et seau vides ensuite).
- [ ] Photo de la carte d'un panneau prise avec un téléphone. — à Maxime
- [x] Réglages : bâtiments et panneaux (renommer, ordonner, bâtiment d'un panneau, retirer avec confirmation).

## 7. Hors ligne

- [x] Réseau coupé : modifier A #6 → « Hors ligne · 1 en attente », l'écran à jour, la base pas encore ; au rechargement, l'envoi part et la base est à jour.
- [ ] Sur un vrai téléphone, au sous-sol de la VF : ouvrir le module sans réseau après une première visite. — à Maxime

## 8. Décisions prises par Claude, à confirmer

- Icône 🏘️, après Rooming dans le menu.
- Les chambres 10, 12 et 14 (sans description dans le classeur, sur A #14 comme la 8) : notées « Lumière ».
- La ligne « 20 · Vfb5-1-3 · L · Cvfb · Salle bain côté rue VF » : lue comme A #20 (lumière de VFB 1, 3, 5, du corridor VFB et de la SDB côté rue).
- A #8 (« Prises 19 lac et chambre 18 lac et 3/4… ») découpé en lignes : à relire.
- « À confirmer » sans description (B #15-2, B #17-1) : à identifier, avec une note.
- Pas de lien avec les chambres du Rooming : pièce en texte libre, avec suggestions.
- Photos et PDF : en ligne seulement (seau privé) ; le reste se lit et se modifie sans réseau.
- Onglets Dimensions et BTU du classeur : pas repris (plans avec dimensions plus tard, réponse de Maxime).

## 9. Avant la mise en ligne

- [ ] Oui de Maxime.
- [ ] `dev` porte aussi Réservations et RH (pas prêts) : publier Bâtiments **seul** par-dessus `origin/main` (comme Inventaire), migration `20261013161144_batiments` appliquée seule (`db query --linked -f` + `migration repair`).
- [ ] Exposer le schéma `batiments` (PATCH `db_schema`), vérifier avec une requête anonyme (« permission denied for schema batiments »).
- [ ] Les migrations de Réservations et de RH (pas en PROD) listent maintenant `batiments` dans `module in (…)` : rien à faire de plus.
