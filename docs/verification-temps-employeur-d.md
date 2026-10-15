# Vérification — Feuilles de temps : export Employeur D

> **Passée par Claude en DEV le 2026-10-15**, puis de nouveau le même jour avec **les heures de la direction** (demande de Maxime : section Direction dans l'onglet Employés, admins seulement, et direction dans l'export ; §11). Corrigés en chemin : la signature des réglages (« modifié par ») échouait pour tout le monde (`temps.nom_actuel()` n'est pas exécutable par les comptes : le déclencheur est maintenant `security definer`, comme les autres fonctions du module) ; une case de numéro se décalait vers la gauche quand son message d'erreur s'affichait. **Reste pour Maxime** : les cases non cochées (vrais numéros, codes confirmés par Charlotte, premier import d'essai dans Employeur D) et §9 (décisions).

En DEV seulement (base locale). Données d'essai du `seed.sql` : numéros fictifs
**9000001** (GBPA+) et **9000002** (Opikawa), matricules fictifs 101 (Pinson =
Léa Morin), 102 (Manitou), 103 (Marteau) ; les autres compagnies et employés
n'en ont pas, pour voir ce que l'export bloque. Direction : Julie payée par
GBPA+ (matricule fictif 201) ; Olivier sans compagnie de paie ni matricule.

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
- [x] Tests SQL (transaction annulée), **47 vérifications** (dont 16 pour la paie de la direction, §11) : réglages lus et modifiés par l'admin et la direction, rien pour coordo, terrain (même avec une feuille propre) ni anonyme ; pas d'ajout ni d'effacement de la ligne de réglages ; « modifié par » posé par la base (pas modifiable à la main) ; codes hors 1 à 999 et période inconnue refusés ; numéro de compagnie nettoyé (espaces), zéros de tête gardés, 9 caractères ou un tiret refusés, doublon refusé avec le nom de la compagnie, vide = effacé ; matricule nettoyé (espaces, zéros de tête : « 000 450 » → 450), lettre ou 10 chiffres refusés, doublon refusé même écrit autrement (0101 = 101), avec le nom de l'employé ; coordo lit le matricule (référentiel) mais ne le change pas.

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
- [x] Tests automatiques (`npm run test:temps`, 14 de l'export + 10 des banques) : regroupement, woofing, types sans code, deux types au même code additionnés, blocages, filtre, feuilles pas approuvées, dates Excel, nom du fichier, et un fichier .xls écrit puis relu.
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

1. ~~Employés seulement~~ — remplacé par la demande de Maxime : la direction est dans l'export pour les admins (§11).
2. **Période = date de paie** (jeudi) par défaut ; « fin de la période » (samedi) au choix dans les réglages. Le gabarit ne dit pas laquelle Employeur D attend : à confirmer au premier import.
3. **No relevé laissé vide** (Employeur D le pose). Colonnes **G43 et G232 du gabarit pas reprises** telles quelles : le fichier a une colonne par code réglé (G1 au départ), puisque les codes viennent des réglages.
4. **Codes de gains communs à toutes les compagnies** (un code par type d'heures, pas par compagnie). À changer si les tables de gains diffèrent d'une compagnie à l'autre dans Employeur D.
5. **Bloquant** : une ligne sans numéro de compagnie ou sans matricule empêche le téléchargement (plutôt que d'être laissée de côté), pour ne jamais oublier quelqu'un dans la paie. Une feuille propre pas encore approuvée est seulement signalée.
6. **Réglages modifiables par l'admin et la direction** (Charlotte fait la paie), comme le reste de l'onglet Employés.
7. Numéro de compagnie gardé **tel que saisi** (minuscules comprises, « aq01 ») ; seuls les espaces sont retirés. Matricule : espaces et zéros de tête retirés (numérique dans Employeur D).
8. Gabarit « Avec banques » (G305/G101 avec dates d'absence) **pas fait** : maladie et banque passent comme quantités dans la saisie simple si on leur donne un code. À faire si Charlotte doit déclarer des absences.

9. **Direction : une compagnie de paie par personne** (ses heures n'ont pas de compagnie ; toutes ses heures vont à cette compagnie). Compagnie et matricule dans une table du module (`temps.paie_direction`, admins seulement), **pas de fiche du référentiel** pour la direction : elle paraîtrait dans l'Animation, le Rooming, etc.
10. **« Nom, prénom » de la direction** tiré du nom du compte : le premier mot est le prénom (« Julie Tremblay » → « Tremblay, Julie » ; « Marie-Ève De La Fontaine » → « De La Fontaine, Marie-Ève »). Un double prénom sans trait d'union serait mal coupé ; Employeur D retrouve la personne par son matricule.
11. **Admins compris** dans la section Direction (ils ont une feuille et sont payés) ; leur feuille n'a pas d'approbation, donc jamais « pas approuvée ».
12. **Vacances** (direction seulement) : code de gain à part, vide au départ (signalées, pas exportées).
13. La direction (non admin) ouvre encore l'export, **sans** les heures de la direction (avis dans la fenêtre) : un fichier complet ne se fait qu'avec un compte admin.
14. **Totaux de la grille** (jour, semaines, total, total par compagnie) : employés et direction affichés ensemble ; l'export CSV de l'onglet a une colonne « Vacances » en plus.

## 10. Avant la mise en ligne

- [ ] Migrations `20261015120202_temps_employeur_d.sql` (numéro et matricule sur le référentiel, réglages) et `20261015123313_temps_employeur_d_direction.sql` (paie de la direction, code des vacances) appliquées avec les Feuilles de temps.
- [ ] En PROD : saisir le numéro Employeur D de chaque compagnie, le matricule de chaque employé payé, et la compagnie de paie et le matricule de chaque personne de la direction (rappel noté dans `rappels-mise-en-ligne.md`).
- [ ] Codes de gains confirmés par Charlotte et réglés (vacances comprises) ; premier import d'essai réussi.

## 11. Heures de la direction (section Direction et export)

- [x] Admin : section **« Direction · admins seulement »** au bas de la grille de l'onglet Employés, une ligne par compte de la direction et admin actif (Admin Test, Félix, Julie, Olivier) : état de sa feuille (Soumise, En cours ; rien pour un admin), compagnie de paie (GBPA+ pour Julie) ou « Compagnie de paie ? », heures régulières par jour, semaines, total, note de sa feuille ; vacances, maladie et prises en banque sous le nom (« Vacances 8 h · Maladie 4 h »).
- [x] Lecture seule : un clic sur le nom ouvre sa feuille (`/temps/personne/…`), avec « ← Employés » pour revenir.
- [x] Totaux du bas et « Total par compagnie » comprennent la direction (Julie à GBPA+) ; l'export CSV de l'onglet aussi (secteur « Direction », colonne « Vacances »).
- [x] Filtre Secteur : « Direction » (admins seulement) ne garde que la section ; avec un autre secteur, la section disparaît. Filtre Compagnie : la direction suit sa compagnie de paie (GBPA+ → Julie seule ; « Sans compagnie » → ceux qui n'en ont pas). Recherche par nom ; « Seulement ceux qui ont des heures ».
- [x] Julie (direction, pas admin) : ni section ni option « Direction » ; son navigateur ne demande même pas les heures, feuilles ou paie des autres (seulement son profil).
- [x] Export (admin) : Julie a sa ligne GBPA+ (matricule 201, « direction » à côté du nom), 54,5 h régulières et, avec le code 305 pour les vacances, 8 h dans « G305(Quantité) » ; Olivier, sans compagnie de paie, est **bloquant** (« Compagnie de paie de la direction à choisir », menu sur place) ; une fois Opikawa choisie, il a sa ligne et il ne manque plus que son matricule ; « 201 » → « Le matricule Employeur D 201 est déjà celui de Julie Tremblay. », « 202 » enregistré.
- [x] Avertissements : « 8 h de « Vacances (direction) » (1 personne) », maladie et banque comptées avec la direction (« 16 h … (3 personnes) ») ; feuille de Julie soumise signalée (« Tremblay, Julie (GBPA+, soumise) »), jamais celle d'un admin.
- [x] Réglages › **Paie de la direction (admins)** : compagnie et matricule de chaque compte ; code « Vacances (direction) ». Julie (direction) ne voit pas ce bloc, et l'export lui dit « Sans les heures de la direction : seuls les admins… ».
- [x] Fichier (capturé sans être enregistré) : lignes de Julie (`9000001 | 201 | Tremblay, Julie | | 2026/10/22 | 54.5 | 8`) et d'Olivier (`9000002 | 202 | Lavoie, Olivier | … | 14`) avec celles des employés.
- [x] API (PostgREST) : un admin enregistre la compagnie puis le matricule sur la même ligne (« 0201 » → 201) ; un compte coordo refusé ; Julie ne peut pas modifier sa propre paie (RLS).
- [x] Tests SQL de la paie de la direction : admin ajoute, lit tout, modifie, efface ; matricule nettoyé et signé ; matricule d'un employé ou d'un autre membre refusé avec le nom ; compte coordo refusé (aussi en déplaçant une ligne) ; Julie ne lit que sa ligne et ne change rien ; coordo, terrain et anonyme ne lisent rien.
- [x] Tests automatiques : ligne de la direction à sa compagnie de paie, vacances à leur code, admin sans approbation, sans compagnie ou sans matricule = bloquant même filtré, vacances sans code signalées, même matricule pour deux personnes = bloquant (pas pour un employé à deux compagnies), « Nom, prénom » d'un compte.
- [x] Téléphone (375 px) : la section se lit comme les autres (la grille défile de côté, pas la page).
- [ ] Coup d'œil sur les vraies feuilles de la direction, et choix de la compagnie de paie de chacun. — à Maxime
