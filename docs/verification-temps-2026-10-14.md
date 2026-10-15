# Vérification des Feuilles de temps — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14** (deux passes : la révision, puis l'onglet Banques et l'interrupteur « Heures en banque », §10). Corrigés en chemin : le panneau des banques s'appelait `Banques.tsx`, même nom que `banques.ts` à la casse près (renommé `BanquesFeuille.tsx`) ; l'accueil (« À faire pour moi ») lit `useAApprouver` : sa forme est gardée, l'onglet lit un nouveau `useFeuillesAApprouver` ; colonnes de la liste À approuver qui se chevauchaient à 1024 px (la ligne se replie maintenant sous 1280 px) ; libellé des semaines raccourci (« semaine du 4 au 10 oct. »). **Reste pour Maxime** : les cases non cochées (export ouvert dans Excel, impression, dossiers à fermer à la vraie date) et §8 (décisions).

En DEV seulement (base locale). Aperçu `temps-essai` : http://localhost:5189/temps.
Comptes : `admin@camp.test` (admin), `julie@camp.test` (direction),
`olivier@camp.test` (direction), `sarah@camp.test` (coordo),
`lea@camp.test` (employée « Pinson » qui remplit sa feuille, GBPA+ et
Aquabounga, woofing). Données d'essai de PP21 (4 au 17 oct. 2026) dans
`supabase/seed.sql` (section Feuilles de temps).

## 1. Numéro de période (PP) — `src/lib/periodesPaie.ts`

- [x] Fichier commun, fonctions pures, sans import ; API : `debutPeriodePaie`, `finPeriodePaie`, `datePaie`, `numeroPeriodePaie`, `libellePeriodePaie` (+ `dateVersementPaie`, `codePeriodePaie`, `periodesPaieEntre`). Commité seul en premier (759ec21) pour le Calendrier.
- [x] `npm run test:periodes` : 5 tests, aussi sous 3 fuseaux (Toronto, Los Angeles, Kiritimati).
- [x] Repères : 20 sept. – 3 oct. 2026 = PP20 payée le 8 oct. ; 4 – 17 oct. = PP21 ; 1er – 14 nov. = PP23 ; 13 – 26 déc. = PP26 payée le 31 déc. ; 27 déc. 2026 – 9 janv. 2027 = PP1 de 2027 payée le 14 janv. ; 2025 a 27 paies (1er janv. 2026 versée le 31 déc. 2025 = PP27). Numéros consécutifs chaque année de 2024 à 2039 (26 ou 27).
- [x] `temps/periodes.ts` s'appuie dessus (imports existants inchangés ; rien avant le 4 oct. 2026 dans le module).
- [x] Sélecteur de période : « PP21 · 4 au 17 oct. 2026 (en cours) » + « paie du jeu. 22 oct. » ; jusqu'à PP21 de 2027.
- [x] Feuille (en-tête imprimé), onglet Employés, À approuver, tableau de bord (titre, cumul « PP21 · 4 oct. 2026 »).
- [x] Exports CSV (lus par script, sans téléchargement) : colonnes « Période de paie » (« PP21 · 2026 ») et « Date de paie » en tête ; fichiers « Heures des employés PP21-2026 (2026-10-04 au 2026-10-17).csv », « Feuilles de temps PP21-2026 (…).csv ».
- [ ] Ouvrir un export dans Excel (accents, virgules décimales). — à Maxime

## 2. Approbation (règle inchangée)

- [x] Employé → direction ; direction → admins ; admin → pas d'approbation. Aucune fonction d'approbation modifiée.
- [x] Julie ne peut pas approuver la feuille d'Olivier (test SQL).

## 3. Onglet À approuver

- [x] Admin : feuilles soumises des employés **et** de la direction (Julie, 66,5 h, soumise le 14 oct.) ; compteur sur l'onglet.
- [x] Julie (direction) : seulement la feuille de Léa (73,5 h payées + 7,5 h woofing), jamais la sienne ni celle d'Olivier.
- [x] Une ligne par feuille : personne (lien), compagnie, PP et date de paie, total d'heures, date de soumission.
- [x] « Renvoyer… » depuis la liste (message obligatoire) : la feuille repart à Léa avec le message ; la liste et le compteur se vident.
- [x] Léa corrige, soumet ; Julie l'« Approuve » depuis la liste (au format téléphone).
- [x] « Ouvrir » : la feuille s'ouvre avec « ← À approuver ».
- [x] Ordinateur (1024 et 1440 px) et téléphone (cartes).

## 4. Banques

- [x] En bas de la feuille de Julie, de l'admin et de Léa (une feuille par compagnie, même banque) ; pas de banque de vacances.
- [x] Maladie : « 2 jours par année en 2026, accordés le 1er janvier · 1 jour = 8 h » ; Julie 16 h − 4 h = 12 h (1,5 j) ; Léa 16 h − 8 h = 8 h.
- [x] Heures accumulées : Julie 42,5 h la semaine 1 → +2,5 h (+ solde de départ 6 h = 8,5 h) ; Léa 42,5 h GBPA+ + 3 h Aquabounga = 45,5 h → +5,5 h, − 2 h prises en banque.
- [x] Nouveau type d'heures « Prises en banque » (direction et employés) ; « Maladie » ajouté à la feuille des employés ; vacances refusées sur une feuille d'employé (test SQL).
- [x] Les banques suivent la saisie (heure ajoutée par Léa : totaux et banques à jour).
- [x] « Ajuster une banque… » (admin sur la feuille de Léa) : + 4 h « Solde de départ (essai) » au 3 oct. ; l'historique montre les 3 mouvements et le solde courant.
- [x] « Jours de maladie par année… » (admin sur la feuille de Julie) : 3 jours à partir de 2026 → 24 h accordées (remis à 2 après l'essai).
- [x] Julie et Léa voient leurs banques sans boutons de réglage.
- [x] `npm run test:temps` : 10 tests (40 h, 1×, woofing/vacances/maladie hors des 40 h, deux compagnies, report, ajustements, solde négatif, semaine en cours ; interrupteur, désactivation et réactivation, employé sans compte, sommes par semaine).
- [x] Téléphone : cartes l'une sous l'autre, pas de défilement horizontal.
- [ ] Impression d'une feuille avec ses banques. — à Maxime

## 5. Dossiers à fermer (relevé d'emploi)

Aujourd'hui (PP21), personne ne peut être signalé : il faut 2 périodes sans heures après des heures, donc au plus tôt en PP24 (15 nov.). Essai fait en remplaçant un moment `temps.aujourdhui()` par le 20 nov. 2026, puis remise en état (fonction de la migration remise, fiche réactivée, ligne d'essai retirée).

- [x] SQL : PP24 → Cliff, Marteau et Pinson (heures en PP21 seulement) ; PP23 → personne ; période à venir = comme la période en cours ; coordo et Léa → rien.
- [x] Onglet Employés en PP24 : encadré « Produire le relevé d'emploi » (3 noms, dernières heures « PP21 · 4 au 17 oct. 2026 ») ; les 3 sont retirés de la grille ; « Afficher les dossiers masqués (3) » les remet avec la pastille « Dossier à fermer ».
- [x] « Relevé produit : désactiver la fiche » → confirmation ; « Annuler » ne change rien ; confirmer désactive la fiche (journal `dossiers_fermes` au nom de Julie).
- [x] Fiche réactivée sans nouvelles heures : pas signalée de nouveau.
- [x] Un employé sans aucune heure dans l'app n'est jamais masqué.
- [x] `useDossiersAFermer()` / `useFermerDossier()` dans `donnees.ts` pour l'accueil (vide pour qui n'entre pas dans le module) ; l'accueil n'est pas touché.
- [ ] Voir l'encadré pour de vrai à partir du 15 nov. 2026. — à Maxime

## 6. Confidentialité (tests SQL, transaction annulée)

- [x] 74 vérifications, toutes réussies (52 de la première passe + 22 pour l'interrupteur et l'onglet Banques, voir §10) : Julie (ses heures, sa feuille, ses banques, celles des employés ; rien d'Olivier ; À approuver sans direction ; ne règle ni sa banque ni celle d'Olivier ; règle celles d'un employé ; note obligatoire ; écriture directe refusée), Olivier (rien de Julie), admin (tout ; règle Julie et lui-même ; pas un coordo ; un seul titulaire), coordo (rien : heures, banques, dossiers, À approuver ; aucune écriture), Léa (ses banques et ses heures, toutes compagnies ; rien de la direction ; ne règle rien ; maladie et banque permises sur sa feuille ouverte), types d'heures, anonyme (tout refusé).
- [x] `temps.role_autorise` et les politiques existantes inchangés ; le module reste hors de la grille d'accès.

## 7. Build et lint

- [x] `npm run build` et `npm run lint` passent (avertissements d'autres modules seulement).

## 8. Décisions prises par Claude, à confirmer

- [x] 1 jour de maladie = **8 h** pour tout le monde (40 h ÷ 5), pas l'horaire de chacun. — confirmé par Maxime
- [ ] Maladie non pris **reporté** à l'année suivante (solde continu) ; les 2 jours de 2026 sont accordés à tous dès le départ → saisir les soldes de départ (ajustement « solde de départ »). Pour remettre à zéro au 31 décembre : un ajustement.
- [ ] Changer les jours de maladie vaut **à partir d'une année** (les années d'avant ne bougent pas).
- [ ] 40 h comptées **toutes compagnies confondues** pour un employé de plusieurs compagnies ; heures prises en banque hors des 40 h.
- [ ] Solde négatif permis (en rouge), sans blocage.
- [ ] Ajustements datés, note obligatoire, **jamais modifiés ni effacés** (une erreur = ajustement inverse). Les admins règlent aussi leurs propres banques.
- [ ] Banques montrées à la fin de la période affichée (solde au début, mouvements, solde à la fin) ; les heures d'une semaine comptent le samedi.
- [ ] Dossier à fermer : seulement un employé qui a déjà eu des heures dans l'app ; « 0 h » = aucune heure de tout type (woofing compris) ; une ligne qui a une note reste affichée ; pas de bouton « garder ouvert » (l'alerte reste jusqu'à la confirmation). Alerte dans l'onglet Employés.
- [ ] Employés : maladie et prises en banque affichées sous le nom dans la grille et en 2 colonnes de l'export (le total de la grille reste les heures régulières).
- [ ] À approuver : « Approuver » d'un clic, sans confirmation (comme dans la feuille) ; date de soumission = la dernière soumission.

- [ ] Interrupteur « Heures en banque » : un changement vaut pour **toute la période en cours** (le dimanche qui l'ouvre), pas seulement les jours qui restent — désactiver le 14 oct. retire aussi le surplus de la semaine du 4 au 10 oct. (même période PP21) ; une période passée ne change jamais.
- [ ] Seuls les **admins** changent l'interrupteur (la direction le voit seulement).
- [ ] Employé **sans compte** : pas de banque maladie (son onglet n'a pas d'heures de maladie) ; s'il reçoit un compte plus tard, les jours accordés depuis 2026 apparaissent (saisir un ajustement au besoin).
- [ ] Employé sans compte, banque activée : ses heures prises en banque se saisissent dans une ligne « Prises en banque » sous la sienne, dans l'onglet Employés (une par compagnie) ; la ligne reste visible tant qu'il y a des heures prises dans la période, même désactivée.
- [ ] Onglet Banques : soldes **à ce jour** ; un employé inactif n'y paraît que s'il lui reste un solde ; la direction n'y voit pas sa propre banque (elle est en bas de sa feuille).

## 9. Avant la mise en ligne

- [ ] Migrations `20261014173205_temps_banques_dossiers.sql` et `20261014201808_temps_banque_heures_interrupteur.sql` en PROD (`db push` ; le schéma `temps` est déjà exposé).
- [ ] Activer la mise en banque (onglet Banques) des employés qui y ont droit, et désactiver celle d'un membre de la direction qui n'y a pas droit.
- [ ] Saisir les soldes de départ de chacun (heures accumulées, maladie déjà pris en 2026) : sinon tout le monde part de 2 jours et 0 h.
- [ ] `src/lib/periodesPaie.ts` part avec le Calendrier s'il l'utilise (commit 759ec21).
- [ ] La ligne « Soumettre ma feuille de temps » de l'accueil affiche encore les dates sans le PP (accueil non touché).

## 10. Onglet Banques et interrupteur « Heures en banque » (2e passe)

Décisions de Maxime : onglet central ; interrupteur activé par défaut pour la direction et les admins, désactivé pour les autres ; désactivé = plus d'accumulation, le solde reste. Migration `20261014201808_temps_banque_heures_interrupteur.sql` (`temps.banque_heures_etats`, `temps.regler_banque_heures`, `temps.semaines_banques`). Données d'essai : banque activée depuis PP21 pour Léa et Manitou (sans compte : 45 h la semaine 1, 2 h prises la semaine 2).

- [x] Onglet « Banques » après À approuver ; admin : groupes Direction et admins (4), Employés qui remplissent leur feuille (Léa), Employés sans compte (31) ; soldes à ce jour, recherche, filtre « Seulement une banque activée ou un solde ».
- [x] Julie (direction) : seulement les deux groupes d'employés, jamais un membre de la direction ; interrupteur affiché sans pouvoir le changer ; « Ajuster… » et « Jours de maladie… » des employés comme avant.
- [x] Employé sans compte : maladie « — », « Ajuster… » propose seulement les heures accumulées, pas de « Jours de maladie… ». Manitou : +5 h − 2 h = 3 h ; historique daté.
- [x] Admin active la banque de Marteau (sans compte) : confirmation « à partir de PP21 · 4 au 17 oct. 2026 (période en cours) » ; pastille « activée depuis PP21 ».
- [x] Onglet Employés : Marteau a sa ligne « ↳ Prises en banque » ; 1,5 h saisie le jeu. 15 → ligne `banque` en base, totaux de la ligne à jour.
- [x] Admin désactive la banque de Julie : « désactivée depuis PP21 », solde 6 h (solde de départ gardé, plus de surplus) ; sa feuille l'indique (« Mise en banque des heures désactivée depuis PP21 : rien ne s'ajoute, le solde reste utilisable »).
- [x] Réactivée plus tard : les périodes désactivées restent sans accumulation (test `npm run test:temps`).
- [x] Panneau en bas des feuilles : inchangé, avec l'état de l'interrupteur dans la carte Heures accumulées.
- [x] Téléphone (Julie) : lignes repliées en cartes, pas de défilement horizontal.
- [x] Tests SQL (+22) : Julie ne voit ni l'interrupteur ni les semaines d'Olivier, voit ceux des employés, ne change aucun interrupteur (ni le sien), ajuste un employé sans compte, écriture directe refusée ; Olivier ne voit rien de Julie ; admin : semaines de toute la direction, interrupteur de Julie et d'un employé sans compte (période en cours), deux changements la même période = le dernier, pas un coordo ; coordo : rien ; Léa : son interrupteur et ses semaines seulement, ne change rien ; anonyme refusé.
- [x] Remise en état de la DEV après l'essai (interrupteurs de Julie et de Marteau, heure prise de Marteau).
- [x] Accueil (commit 196cccb) : `useAApprouver`, `useFeuille`, `useDossiersAFermer`, `useFermerDossier` inchangés.
