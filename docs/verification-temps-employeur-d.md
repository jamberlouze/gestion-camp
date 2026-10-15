# Vérification — Feuilles de temps : export Employeur D

> **Passée par Claude en DEV le 2026-10-15.** Corrigés en chemin : la signature des réglages (« modifié par ») échouait pour tout le monde (`temps.nom_actuel()` n'est pas exécutable par les comptes : le déclencheur est maintenant `security definer`, comme les autres fonctions du module) ; une case de numéro se décalait vers la gauche quand son message d'erreur s'affichait. **Reste pour Maxime** : les cases non cochées (vrais numéros, codes confirmés par Charlotte, premier import d'essai dans Employeur D) et §9 (décisions).

En DEV seulement (base locale). Données d'essai du `seed.sql` : numéros fictifs
**9000001** (GBPA+) et **9000002** (Opikawa), matricules fictifs 101 (Pinson =
Léa Morin), 102 (Manitou), 103 (Marteau) ; les autres compagnies et employés
n'en ont pas, pour voir ce que l'export bloque.

**Avant de commencer** : `npm run db:start`, puis l'aperçu `temps-essai`
(http://localhost:5189/temps/employes) ou l'aperçu fixe une fois commité.
Connexion par code (Mailpit, http://localhost:54324) : `admin@camp.test`,
`julie@camp.test` (direction), `lea@camp.test` (employée qui remplit sa
feuille), `sarah@camp.test` (coordo). Période d'essai : PP21 (4 au 17 oct. 2026).

## 1. Gabarits de Desjardins

- [x] Les 4 gabarits fournis lus avec SheetJS : « Saisie simple » (Compagnie, Matricule, « Nom, prénom », No relevé, Période, G1(Quantité), G43(Quantité), G232(Montant)), « Saisie élaborée », « Distribution des coûts », « Avec banques » (G305 montant, G101 quantité avec dates d'absence). Ce ne sont que des en-têtes, sans exemple de données.
- [x] Formats repris du gabarit et du canevas Desjardins : Compagnie en texte (8 lettres ou chiffres au plus), Matricule numérique (9 chiffres au plus), Période en date `aaaa/mm/jj`, nom de la feuille « Sans distribution coût (simple) », fichier `.xls`.

## 2. Accès

- [x] Admin : bouton « Employeur D » dans Temps › Employés, à côté de « Exporter ».
- [x] Direction (julie) : même bouton ; elle modifie les réglages (« Réglages modifiés par Julie Tremblay »).
- [x] Léa (employée qui remplit sa feuille) : sa feuille s'ouvre comme avant, sans bouton Employeur D.
- [x] Tests SQL (transaction annulée), **31 vérifications** : réglages lus et modifiés par l'admin et la direction, rien pour coordo, terrain (même avec une feuille propre) ni anonyme ; pas d'ajout ni d'effacement de la ligne de réglages ; « modifié par » posé par la base (pas modifiable à la main) ; codes hors 1 à 999 et période inconnue refusés ; numéro de compagnie nettoyé (espaces), zéros de tête gardés, 9 caractères ou un tiret refusés, doublon refusé avec le nom de la compagnie, vide = effacé ; matricule nettoyé (espaces, zéros de tête : « 000 450 » → 450), lettre ou 10 chiffres refusés, doublon refusé même écrit autrement (0101 = 101), avec le nom de l'employé ; coordo lit le matricule (référentiel) mais ne le change pas.

## 3. Fenêtre d'export (Temps › Employés › Employeur D)

- [x] Titre avec la période (« Export Employeur D · PP21 · 4 au 17 oct. 2026 ») ; rappel du gabarit et de la date mise dans la colonne Période (« date de paie, jeu. 22 oct. 2026 »).
- [x] Une ligne par employé et par compagnie qui a des heures : Girard (Cliff) a une ligne GBPA+ et une ligne Opikawa ; Léa une ligne GBPA+ et une ligne Aquabounga ; triées par compagnie puis par nom ; total par colonne.
- [x] Régulières additionnées au code G1 ; le woofing de Léa (7,5 h) n'y est jamais.
- [x] Sans code pour la maladie et les heures prises en banque (départ) : « 8 h de « Maladie » (1 employé) ne sont pas dans le fichier… », « 4 h de « Prises en banque » (2 employés)… ».
- [x] **Bloquant**, en rouge : « Numéro de compagnie Employeur D manquant » (Aquabounga) et « Matricule Employeur D manquant » (Girard, Thomas) ; « Télécharger » grisé avec « Complétez ce qui manque pour télécharger ».
- [x] Feuille propre pas approuvée signalée sans bloquer (« Morin, Léa (Aquabounga, en cours). Ses heures sont dans le fichier telles quelles. ») ; sa feuille GBPA+ approuvée n'est pas signalée.
- [x] Filtre « Toutes les compagnies » / une compagnie (seules celles qui ont des heures) : GBPA+ → 4 lignes, l'avertissement d'Aquabounga disparaît ; le filtre de compagnie de l'onglet est repris à l'ouverture.
- [x] Aucun code réglé : « Aucun code de gain réglé : rien à exporter » (test automatique).

## 4. Saisie sur place

- [x] Numéro invalide (« AB-1 », « A-1 ») : « 1 à 8 lettres ou chiffres. » sous la case, rien n'est enregistré.
- [x] Numéro valide (« aq 01 ») : enregistré (« aq01 »), la compagnie sort de la liste rouge, sa colonne se remplit.
- [x] Matricule invalide (« 12A ») : « 1 à 9 chiffres. ».
- [x] Matricule déjà pris (« 0101 ») : « Le matricule Employeur D 101 est déjà celui de Morin, Léa. ».
- [x] Matricule libre (104) : enregistré, la liste rouge disparaît, « Télécharger » devient actif ; le matricule paraît sur ses deux lignes (GBPA+ et Opikawa).

## 5. Réglages Employeur D (dans la fenêtre)

- [x] Codes de gains : maladie = 101 → colonne « G101 » (8 h de Léa), avertissement retiré ; banque = 43 → colonne « G43 » (2 h Léa, 2 h Manitou) ; 1000 → « 1 à 999. » ; case vidée = code retiré (colonne et heures repassent en avertissement).
- [x] Colonne « Période » : « Fin de la période (sam. 17 oct. 2026) » → toutes les lignes à 2026/10/17 ; retour à « Date de paie (jeu. 22 oct. 2026) ».
- [x] Numéros des compagnies : toutes les compagnies actives (et celles qui ont un numéro), modifiables, vide = effacé.
- [x] « Réglages modifiés par … le 15 oct. 2026 » (jour de Montréal).
- [x] Les réglages s'ouvrent d'office quand aucun code n'est réglé.

## 6. Fichier

- [x] Téléchargé : « Employeur D PP21-2026 (2026-10-04 au 2026-10-17).xls » ; avec une compagnie choisie : « Employeur D GBPA+ PP21-2026 (…).xls ».
- [x] Reconnu par macOS comme « CDFV2 Microsoft Excel » (.xls BIFF8, comme les gabarits).
- [x] Relu par SheetJS : une feuille « Sans distribution coût (simple) », en-têtes `Compagnie | Matricule | Nom, prénom | No relevé | Période | G1(Quantité) | G101(Quantité) | G43(Quantité)`, 6 lignes identiques à l'aperçu ; Compagnie en texte (format « @ », zéros de tête gardés), Matricule et quantités en nombres, Période en vraie date (format `yyyy/mm/dd`, 2026/10/17), cases vides laissées vides, No relevé vide.
- [x] Tests automatiques (`npm run test:temps`, 9 de l'export + 10 des banques) : regroupement, woofing, types sans code, deux types au même code additionnés, blocages, filtre, feuilles pas approuvées, dates Excel, nom du fichier, et un fichier .xls écrit puis relu.
- [ ] Le fichier s'ouvre dans Excel sans avertissement. — à Maxime
- [ ] **Premier import d'essai dans Employeur D** (Saisie de la paie › importation) avec les vrais numéros : Employeur D accepte le fichier et retrouve chaque employé par son matricule. — à Charlotte

## 7. Référentiel

- [x] Référentiel › Employés : colonne « Matricule Employeur D » ; « 00 77 » enregistré devient 77 ; doublon refusé avec le message de la base sous le tableau.
- [x] Référentiel › Compagnies : colonne « No Employeur D », avec les numéros saisis depuis l'export.

## 8. Téléphone et non-régression

- [x] Téléphone (375 px) : la fenêtre tient dans la largeur, le tableau défile de côté, réglages en une colonne, boutons au bas.
- [x] Onglet Employés, export CSV et feuille de Léa : inchangés ; `npm run build` et `npm run lint` passent (aucun avertissement dans les fichiers touchés), `npm run test:periodes` passe.
- [ ] Coup d'œil sur les vraies données une fois les matricules saisis. — à Maxime

## 9. Décisions prises par Claude, à confirmer

1. **Employés seulement** : l'export prend les heures de l'onglet Employés (et des employés qui remplissent leur feuille). Les heures de la direction (`temps.heures`) n'y sont pas : elles n'ont ni compagnie ni matricule. À ajouter si Charlotte le demande.
2. **Période = date de paie** (jeudi) par défaut ; « fin de la période » (samedi) au choix dans les réglages. Le gabarit ne dit pas laquelle Employeur D attend : à confirmer au premier import.
3. **No relevé laissé vide** (Employeur D le pose). Colonnes **G43 et G232 du gabarit pas reprises** telles quelles : le fichier a une colonne par code réglé (G1 au départ), puisque les codes viennent des réglages.
4. **Codes de gains communs à toutes les compagnies** (un code par type d'heures, pas par compagnie). À changer si les tables de gains diffèrent d'une compagnie à l'autre dans Employeur D.
5. **Bloquant** : une ligne sans numéro de compagnie ou sans matricule empêche le téléchargement (plutôt que d'être laissée de côté), pour ne jamais oublier quelqu'un dans la paie. Une feuille propre pas encore approuvée est seulement signalée.
6. **Réglages modifiables par l'admin et la direction** (Charlotte fait la paie), comme le reste de l'onglet Employés.
7. Numéro de compagnie gardé **tel que saisi** (minuscules comprises, « aq01 ») ; seuls les espaces sont retirés. Matricule : espaces et zéros de tête retirés (numérique dans Employeur D).
8. Gabarit « Avec banques » (G305/G101 avec dates d'absence) **pas fait** : maladie et banque passent comme quantités dans la saisie simple si on leur donne un code. À faire si Charlotte doit déclarer des absences.

## 10. Avant la mise en ligne

- [ ] Migration `20261015120202_temps_employeur_d.sql` (numéro et matricule sur le référentiel, réglages) appliquée avec les Feuilles de temps.
- [ ] En PROD : saisir le numéro Employeur D de chaque compagnie et le matricule de chaque employé payé (rappel noté dans `rappels-mise-en-ligne.md`).
- [ ] Codes de gains confirmés par Charlotte et réglés ; premier import d'essai réussi.
