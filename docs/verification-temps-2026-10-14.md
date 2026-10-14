# Vérification des Feuilles de temps — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14.** Corrigés en chemin : le panneau des banques s'appelait `Banques.tsx`, même nom que `banques.ts` à la casse près (renommé `BanquesFeuille.tsx`) ; l'accueil (« À faire pour moi ») lit `useAApprouver` : sa forme est gardée, l'onglet lit un nouveau `useFeuillesAApprouver` ; colonnes de la liste À approuver qui se chevauchaient à 1024 px (la ligne se replie maintenant sous 1280 px) ; libellé des semaines raccourci (« semaine du 4 au 10 oct. »). **Reste pour Maxime** : les cases non cochées (export ouvert dans Excel, impression, dossiers à fermer à la vraie date) et §8 (décisions).

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
- [x] `npm run test:temps` : 6 tests (40 h, 1×, woofing/vacances/maladie hors des 40 h, deux compagnies, report, ajustements, solde négatif, semaine en cours).
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

- [x] 52 vérifications, toutes réussies : Julie (ses heures, sa feuille, ses banques, celles des employés ; rien d'Olivier ; À approuver sans direction ; ne règle ni sa banque ni celle d'Olivier ; règle celles d'un employé ; note obligatoire ; écriture directe refusée), Olivier (rien de Julie), admin (tout ; règle Julie et lui-même ; pas un coordo ; un seul titulaire), coordo (rien : heures, banques, dossiers, À approuver ; aucune écriture), Léa (ses banques et ses heures, toutes compagnies ; rien de la direction ; ne règle rien ; maladie et banque permises sur sa feuille ouverte), types d'heures, anonyme (tout refusé).
- [x] `temps.role_autorise` et les politiques existantes inchangés ; le module reste hors de la grille d'accès.

## 7. Build et lint

- [x] `npm run build` et `npm run lint` passent (avertissements d'autres modules seulement).

## 8. Décisions prises par Claude, à confirmer

- [ ] 1 jour de maladie = **8 h** pour tout le monde (40 h ÷ 5), pas l'horaire de chacun.
- [ ] Maladie non pris **reporté** à l'année suivante (solde continu) ; les 2 jours de 2026 sont accordés à tous dès le départ → saisir les soldes de départ (ajustement « solde de départ »). Pour remettre à zéro au 31 décembre : un ajustement.
- [ ] Changer les jours de maladie vaut **à partir d'une année** (les années d'avant ne bougent pas).
- [ ] 40 h comptées **toutes compagnies confondues** pour un employé de plusieurs compagnies ; heures prises en banque hors des 40 h.
- [ ] Solde négatif permis (en rouge), sans blocage.
- [ ] Ajustements datés, note obligatoire, **jamais modifiés ni effacés** (une erreur = ajustement inverse). Les admins règlent aussi leurs propres banques.
- [ ] Banques montrées à la fin de la période affichée (solde au début, mouvements, solde à la fin) ; les heures d'une semaine comptent le samedi.
- [ ] Dossier à fermer : seulement un employé qui a déjà eu des heures dans l'app ; « 0 h » = aucune heure de tout type (woofing compris) ; une ligne qui a une note reste affichée ; pas de bouton « garder ouvert » (l'alerte reste jusqu'à la confirmation). Alerte dans l'onglet Employés.
- [ ] Employés : maladie et prises en banque affichées sous le nom dans la grille et en 2 colonnes de l'export (le total de la grille reste les heures régulières).
- [ ] À approuver : « Approuver » d'un clic, sans confirmation (comme dans la feuille) ; date de soumission = la dernière soumission.

## 9. Avant la mise en ligne

- [ ] Migration `20261014173205_temps_banques_dossiers.sql` en PROD (`db push` ; le schéma `temps` est déjà exposé).
- [ ] Saisir les soldes de départ de chacun (heures accumulées, maladie déjà pris en 2026) : sinon tout le monde part de 2 jours et 0 h.
- [ ] `src/lib/periodesPaie.ts` part avec le Calendrier s'il l'utilise (commit 759ec21).
- [ ] La ligne « Soumettre ma feuille de temps » de l'accueil affiche encore les dates sans le PP (accueil non touché).
