# Vérification du Rooming — un plan par été, résumé hors saison (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14.** Demandes de la réunion avec Charlotte : retirer les barres de taux d'occupation, un seul plan par été (Été 2026 en vigueur, Été 2025 archivé), page d'accueil du module = total de lits par bâtiment tiré de la Référence, plan de l'été à un clic. Motel inchangé (chiffres par chambre, noms au besoin), rien pour l'hiver. Rien n'a eu à être corrigé en chemin. **Reste pour Maxime** : confirmer le choix du plan gardé pour 2025 (§9) et la mise en ligne (§10).

En DEV seulement (base locale). Aperçu : `rooming-essai` (http://localhost:5203/rooming).
Comptes : `admin@camp.test` (admin), `julie@camp.test` (direction, écriture),
`sarah@camp.test` (coordo, lecture).

## 1. Migration `20261014175117_rooming_un_plan_par_ete`

- [x] Appliquée seule en DEV (psql, dans une transaction) et inscrite à l'historique local (`migration repair --local`).
- [x] Avant : 8 plans (Été 2026, Classe nature, 2025 – Pré-camp, 2025 – Classes nature, 2025 – Scénario 1 à 4). Après : **Été 2026** (en vigueur) et **Été 2025** (archivé) — « 2025 – Scénario 4 » renommé, 6 plans supprimés.
- [x] Repérage par nom seulement (minuscules et espaces ignorés), aucun identifiant de la DEV : elle fera la même chose en PROD.
- [x] Été 2025 = l'ancien Scénario 4 sans aucun changement : 54 chambres, 240 lits, 135 enfants, 88 employés, 18 noms (empreintes des lignes identiques avant et après).
- [x] Été 2026 sans aucun changement : 52 chambres, 231 lits, 147 enfants, 67 employés, 11 noms (empreintes identiques).
- [x] Référence pas touchée : 17 lieux et 54 chambres, empreintes identiques (noms, codes, lits, actif, ordre, parents) ; 231 lits.
- [x] Rien d'orphelin : occupations 427 → 106, noms 104 → 29 (cascade) ; 0 occupation sans plan, 0 nom sans chambre de plan ; la chambre « 20 3/4 » et le 100 TDL (retirés de la référence) servent encore à Été 2025, donc gardés. Aucune autre table ne pointe vers les plans (seule `reservations.lits_par_etage` lit Rooming, et seulement la référence).
- [x] Relancée une 2e fois (transaction annulée) : rien ne change (« 0 plan supprimé »).
- [x] Cas de repli essayés (transaction annulée) : Scénario 4 absent, Scénario 3 présent, Classe nature en vigueur, plan « Classe nature – École X » créé à la main → Scénario 3 devient Été 2025, Classe nature supprimé, Été 2026 remis en vigueur, le plan au nom inconnu est gardé.
- [x] Ce qui était déjà retiré de la référence et ne sert plus à aucun plan est effacé (même règle que `rooming.retirer_lieu`) : rien à effacer en DEV.

## 2. Résumé (nouvel accueil, `/rooming`)

- [x] Onglets : Résumé, Plan, Tous les plans, Référence (Référence : seulement pour qui écrit).
- [x] « Lits aujourd'hui » : 231, 52 chambres.
- [x] Camp : sous-total 228 = Pavillon principal 143 (Cèdres 64 : CH 36 · CB 28 ; Pins 79 : PB 37 · PH 32 · Bout du bâtiment 10) + Vieille-France 85 (Vieille-France 59 : VFB 23 · VFH 36 ; Motel 23 ; Appart 3). 55 chemin du Tour du Lac : 3. Mêmes chiffres que l'onglet 2026 du Sheets (Cèdres 64, Pins 79, Pavillon 143, total 231).
- [x] Retirés de la référence (100 TDL, 20 3/4) : pas comptés.
- [x] Suit la référence tout seul : CH 1 passé de 4 à 5 lits dans Référence → Résumé à 232, Camp 229, Pavillon 144, Cèdres 65, CH 37 ; remis à 4 → 231.
- [x] Carte « Plan de l'été en vigueur » : Été 2026, 147 enfants · 67 employés, bouton « Ouvrir » → `/rooming/plan/<id>` en un clic.
- [x] Lien « Modifier la référence » pour qui écrit ; absent pour la coordo (lecture).
- [x] Aucun plan en vigueur (Été 2026 retiré de « en vigueur » un instant en DEV, puis remis) : la carte devient « Aucun plan en vigueur — Voir tous les plans ».

## 3. Plan

- [x] Plus aucune barre de taux d'occupation dans les tuiles (0 élément à largeur en % dans la page) ; « N libres » reste en texte, en bas de la tuile.
- [x] En-tête (Lits, Enfants, Employés, Libres), totaux par lieu et panneau Totaux inchangés.
- [x] Menu des plans : « Été 2026 (en vigueur) », puis Archivés › « Été 2025 ».
- [x] Été 2025 s'ouvre : 240 lits, 135 enfants, 88 employés, 17 libres ; badge Archivé.
- [x] Motel inchangé : chiffres par chambre et noms (Motel 16 : 1 employé, Vickie ; 17 : Fiji, Galaxie, Spag, Sriracha…) ; la fenêtre d'une chambre s'ouvre comme avant.

## 4. Anciennes adresses

- [x] `/rooming` = le Résumé (avant : redirigeait vers le plan en vigueur, qui est maintenant à un clic).
- [x] `/rooming/plan` (onglet Plan) → le plan en vigueur.
- [x] `/rooming/plan/<id>` d'un plan existant : s'ouvre ; d'un plan qui n'existe plus (essayé avec un identifiant inconnu, comme celui de Classe nature) : retour au Résumé.
- [x] `/rooming/plans` et `/rooming/reglages` inchangés.

## 5. Tous les plans

- [x] Été 2026 (En vigueur, 231 lits, 147 enf., 67 empl., 11 nommés) ; Archivés (1) : Été 2025 (240 lits, 135 enf., 88 empl., 18 nommés).
- [x] « Nouveau plan » : exemple « Été 2027 » (avant : « Classe nature – École X »).

## 6. Accès

- [x] Admin : tout.
- [x] Direction (julie, écriture) : Résumé, Plan, Tous les plans, Référence ; mêmes chiffres.
- [x] Coordo (sarah, lecture) : Résumé, Plan, Tous les plans ; pas de Référence ni de lien « Modifier la référence ». Aucun changement de droits (RLS du module inchangée).

## 7. Téléphone (375 px)

- [x] Résumé lisible : cartes l'une sous l'autre, gros chiffres à droite, pas de défilement horizontal (largeur de page = 375).
- [x] « Ouvrir » du plan en vigueur atteignable et mène au plan ; tuiles du plan sans barre.

## 8. Code

- [x] `npm run build` passe ; `npm run lint` : aucun avertissement dans `src/modules/rooming` (ceux qui restent sont dans d'autres fichiers).
- [x] Aucune erreur dans la console.
- [x] Pas de test existant pour le module.

## 9. Décisions prises par Claude, à confirmer

- **Plan gardé pour 2025 = « 2025 – Scénario 4 »**, renommé « Été 2025 ». Le Sheets ne dit pas lequel a été retenu : les 6 variantes de 2025 ne diffèrent que par le motel, l'Appart et le 100 TDL (mêmes lits, 240). Pré-camp et Classes nature ne sont pas l'été ; parmi les scénarios d'été, le 4 est le dernier et le plus complet (toutes les chambres du motel attribuées, Appart plein avec Fiji, Gecko, Sriracha, 100 TDL plein, 88 employés, 18 noms). Si un autre scénario est le bon, il est perdu en DEV après la migration (à dire avant la mise en ligne : on change l'ordre de préférence dans la migration).
- **Classe nature (2026) supprimé** avec ses chiffres (pas archivé), comme demandé.
- **Un plan dont le nom n'est pas l'un de ceux de l'import n'est jamais touché** (s'il y en a un en PROD, il restera ; la migration écrit dans le journal combien de plans elle a supprimés).
- **« Retiré de la référence » et plus utilisé par aucun plan = effacé** par la migration (même règle que le bouton Retirer) ; rien en DEV.
- Accueil = onglet **« Résumé »** ; l'onglet **Plan** mène au plan en vigueur (`/rooming/plan`).
- Le résumé montre les **sections** sous chaque bâtiment (Cèdres 64, Pins 79, comme Charlotte) et les étages en petit (CH 36 · CB 28), avec le nombre de chambres ; un bâtiment sans chambre n'y est pas.
- La carte du plan en vigueur montre aussi ses enfants et employés (repère rapide).
- Le plan de révision mentionnait « Motel = 12 lits en bloc » : non fait, la consigne de Maxime est « Motel : aucun changement ».

## 10. Avant la mise en ligne

- [ ] Maxime confirme le plan gardé pour 2025 (§9).
- [ ] En PROD, des plans ont pu être renommés ou créés depuis le 2026-10-07 : regarder Tous les plans avant (ce qui porte un nom de l'import sera supprimé, le reste gardé), puis après la migration (Été 2026 en vigueur, Été 2025 archivé).
- [ ] `prod:db:push` applique `20261014175117_rooming_un_plan_par_ete` (aucun nouveau schéma à exposer).
- [ ] Après la publication : `/rooming` montre le Résumé (rechargement forcé si l'ancienne version reste en cache).
