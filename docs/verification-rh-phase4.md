# Vérification du module RH — phase 4 (planification, diètes, conformité, exports, référentiel)

> **Passée par Claude en DEV le 2026-10-15** (navigateur sur ordinateur et en format téléphone, tests SQL des droits, tests Node des fichiers purs, fichiers produits relus avec SheetJS). Corrigés en chemin : les lettres tapées au clavier s'accumulaient d'une case à l'autre (« a » puis « c » ailleurs = « ac », aucun code) — elles repartent à zéro en changeant de case ; modifier un code dans Réglages était refusé par la base (ligne partielle envoyée en « upsert ») — ajout et modification séparés ; la fiche ne montrait le lien au référentiel qu'après un rechargement — la validation relit les personnes ; conflit de casse `Planification.tsx` / `planification.ts` (même piège que les courriels : `OngletPlanification.tsx`, `ConformiteEmployes.tsx`, `LienReferentiel.tsx`) ; grille trop large au téléphone (colonne des noms, légende et astuce clavier réduites) ; libellés au singulier (« Copier la ligne », « Relier la correspondance sûre »). **Reste pour Maxime** : les cases non cochées (vrai import dans Employeur D, valeurs à confirmer avec Charlotte, impression) et §9 (actions).

En DEV seulement (base locale ; vraies données d'Airtable). Fiches d'essai créées puis retirées : « Zoé Essai-Phase4 » (`zoe.essai4@camp.test`, emploi Été 2027, dossier, paie et contrat d'essai) et « Liam Essai-Phase4 » (`liam.essai4@camp.test`, bénévole mineur) ; leurs cases, la fiche « Zozo » du référentiel, la fiche « Hibou » créée pour Thomas (fiche fictive du seed) et les lignes de journal qui vont avec sont retirées ; titre d'emploi, numéro de poste « ANIM01 » et code « Code 1 » d'essai remis à vide ou retirés ; aucune vraie personne reliée au référentiel.

**Avant de commencer** : `npm run db:start`, migration `20261015125223_rh_phase4` appliquée, puis l'aperçu `rh-essai` (http://localhost:5200/rh/planification). Connexion : `julie@camp.test` (direction, accès `rh_paie`).

## 1. Sécurité et droits

- [x] L'anonyme n'a aucun droit sur les codes, les cases, le pilotage, `export_employeur_d` ni `relier_employe`. — tests SQL
- [x] Terrain (sans RH) : ne lit ni ne modifie codes, cases ou pilotage ; `export_employeur_d` et `relier_employe` refusés (`ACCES_REFUSE`) ; `lier_referentiel` n'est exécutable par aucun compte (fonction interne). — tests SQL
- [x] Coordo avec le RH en écriture (ajout personnel) mais sans `rh_paie` : export Employeur D refusé ; « relier » refusé (direction seulement), y compris en écrivant `personnes.employe_id` directement ; **sa validation d'une embauche relie quand même** la personne (fonction de la base). — tests SQL
- [x] NAS et compte : en clair **seulement** par `rh.export_employeur_d` (direction, `rh_paie`), pour des embauches complètes de genre emploi (ni bénévole ni embauche pas complète) ; chaque personne notée une fois par export dans les consultations (« export ») et au journal (« Exportée vers Employeur D (saison) ») ; `employeur_d_le` posé sur les embauches exportées seulement ; la colonne chiffrée reste illisible. — tests SQL et navigateur (consultation de Zoé : « export Employeur D (NAS et compte) »)
- [x] Cases : une date d'une autre saison est refusée ; auteur posé par la base ; une embauche qui change de saison perd ses cases ; un code utilisé ne se supprime pas (le retirer). — tests SQL
- [x] Codes : texte unique sans tenir compte de la casse ; « compté au besoin » exige « présent » ; poste Employeur D : 8 lettres ou chiffres. — tests SQL
- [x] Tests SQL : 43 sur 43 (transaction annulée) ; ceux de la phase 3 repassés : 58 sur 58 (`valider_embauche` modifiée).

## 2. Planification (onglet Planification)

- [x] Saison par défaut : Été 2027 (la prochaine qui a des embauches et des dates ; l'automne 2026 n'a pas de dates). Saison sans dates : « Aucune date … Réglages ».
- [x] Une ligne par embauche non annulée, groupée par compagnie (ordre du référentiel) puis poste (« Poste à préciser » pour le bénévole), nom de camp sinon prénom, nom complet dessous, statut de l'embauche s'il n'est pas « Complète », « Bén. » pour un bénévole.
- [x] Colonnes : formations, semaines et autres ; « Séjours » ajoute les classes vertes (gardé dans l'adresse, `?dates=`). Diète, allergies, t-shirt et hoodie du dossier à droite.
- [x] Pastille ● dans une case vide où la personne s'est dite disponible (Zozo : Formation 1, Semaines 1 et 2) ; contour rouge sur un code « présent » hors de ses disponibilités (CDJ en semaine 3, Sauv de Loutre en semaine 5) ; rien pour « Congé ».
- [x] Clic sur une case : menu des codes (couleurs), « Vider la case », note facultative (✎ dans la case, dans l'infobulle avec l'auteur).
- [x] Clavier : flèches ; « a » = Anim, « r » = Remp, « c » = CDJ, « co » = Congé, « sa » = Sauv ; Suppr vide ; Entrée ouvre le menu ; Échap le ferme et rend la case.
- [x] Pilotage : besoin prévu 3 et réel 2 en semaine 1 (enregistrés en quittant la case) ; Présents (Anim, Remp) 1, Écart −2 en rouge, Tous présents (codes « présent ») ; CDJ compte dans « Tous présents », pas dans « Présents ».
- [x] Modifications optimistes, une seule file ; relue toutes les 60 secondes ; enregistrées dans la base (vérifiées en SQL).
- [x] CSV : en-têtes des dates, lignes de pilotage puis une ligne par embauche (compagnie, poste, nom de camp, prénom, nom, statut, codes, diète, allergies, tailles), « ; », accents corrects.
- [ ] Impression paysage (bouton « Imprimer », menu et onglets cachés) : pas d'aperçu d'impression dans le panneau. — à Maxime

## 3. Diètes par semaine (vue « Diètes »)

- [x] Par date : présents (codes « présent ») par diète du dossier, « Non précisée » sans dossier ou sans réponse, pourcentages, total.
- [x] Allergies des présents par date (nom de camp : allergie) ; dates sans allergie omises.
- [x] Rien n'est envoyé à Cuisine (mention à l'écran).

## 4. Conformité (onglet Employés)

- [x] Colonne « À régler » : « Lien à envoyer », « Dossier attendu » (ambre), « Dossier à valider », « Contrat à préparer » / « Contrat à signer » (emploi pas encore complet), « Consentement parental » (Liam, 17 ans au début), « VAJ à faire » (Zoé, Rosalie : aucune VAJ), « Premiers soins expirés » (Thomas : carte du 1er mai 2026).
- [x] Rien pour une embauche complète en règle ; bénévole : pas de contrat.
- [x] Filtre « À régler » (avec son nombre), combiné aux autres filtres.

## 5. Exports (menu « Exporter »)

- [x] Liste de la saison (.xlsx) : « Liste Été 2027 (2026-10-15).xlsx », 18 colonnes (coordonnées, diète, allergies, tailles, contacts d'urgence, disponibilités en clair), une ligne par embauche non annulée ; jamais de NAS ni de compte.
- [x] ACQ (.xlsx) : prénom, nom, courriel, compagnie, poste, étudiant à temps plein, pays, ancien, études, CV, pièce d'identité, expirations des cartes.
- [x] VAJ… : personnes de 18 ans et plus au début, sans VAJ ou VAJ de plus de 3 ans ; « Copier les lignes » (`20030303,Essai-Phase4,Zoé`, `20060412,Gauthier,Rosalie` ; presse-papiers refusé → zone de texte sélectionnée) ; « VAJ faite le 15 oct. » pour la personne cochée : retirée de la liste, journal « VAJ faite le 2026-10-15 ».
- [x] Employeur D (.xls) : seulement avec `rh_paie` ; embauches complètes de genre emploi. Ce qui manque, par personne : titre d'emploi (réglage), numéro de poste, matricule, fiche du référentiel ; saisis sur place (titre 001, poste ANIM01, matricule 990001) → « Prête », cochée ; Rosalie (sans fiche) reste grisée.
- [x] Fichier : « Employeur D Données d'emploi Été 2027 (2026-10-15).xls » (BIFF8), un onglet « Données à importer » A1:DH4 : `[Profil personnel]`, la ligne (A, 09000001, matricule 990001, nom, prénom, NAS 046454286, naissance 2003-03-03, F, F, 1, ESSZ03030399, N, adresse, ville, QUE, J8E2B2, 1, 5145550401, N, courriel), `[Profil emploi]`, la ligne (A, 09000001, 990001, 1, ANIM01, 1, 001, 999, 2027-06-20, E, 7777, 80, 16.2500 = 650 $ ÷ 40 h, 2027-06-20, QUE, REM, 001, 1, 81530, 815, 7654321, 2, 1, A, 2027-06-20, 1) ; colonnes « Aucune valeur » et structure administrative vides.
- [x] Après le téléchargement : « déjà exporté (15 oct. 2026) », décochée par défaut ; consultation et journal notés.
- [ ] Importer un fichier d'essai dans Employeur D (une ou deux personnes) et corriger au besoin les valeurs par défaut. — à Maxime, avec Charlotte

## 6. Lien avec le référentiel Employés

- [x] « Valider l'embauche » (Zoé) : fiche « Zozo » créée (prénom, nom, courriel, poste, GBPA+, active), journal « Fiche du référentiel Employés créée : Zozo » ; la fiche montre « Référentiel Employés : Zozo (Essai-Phase4, Zoé) · matricule à saisir » avec « Changer » et « Délier ».
- [x] Personnes › « Relier au référentiel » (direction) : 207 personnes avec une embauche complète sans fiche ; correspondances « même nom : à vérifier » en tête (aucune sûre en DEV : les fiches du référentiel n'ont presque pas de courriel) ; recherche ; « Créer la fiche » (Thomas, fiche fictive : « Hibou », inactive car l'été 2026 est fini) ; « Autre fiche… ». **Aucune vraie personne reliée pendant l'essai.**
- [x] Fiche : « Délier » (confirmation, journal « Déliée… »), « Relier… » avec le choix d'une fiche (les fiches déjà reliées à une autre personne n'y sont pas), « Créer la fiche ».
- [x] Règles de la base : seule fiche au même courriel (sans la casse), sinon même prénom et nom ; fiche existante réactivée et compagnie ajoutée, rien d'écrasé ; nom de camp déjà pris → « Pinson E. » ; compte de la direction au même courriel → pas de fiche (journal) ; bénévole relié aussi. — tests SQL

## 7. Réglages

- [x] Codes de la planification : 13 codes de départ ; texte, nom, couleur, présent, besoin (désactivé si pas présent), ▲ ▼, « Retirer » / « Remettre », « + Code ».
- [x] Postes : cases PS et SN (cartes exigées), numéro « No ED » (effacé = vide).
- [x] Employeur D et VAJ : valeurs par défaut (lettre de la colonne du canevas et aide), titre d'emploi « à régler », numéros de compagnie (partagés avec les Feuilles de temps), validité d'une VAJ ; lien « Réglages › Employeur D » de la fenêtre d'export (ancre `#employeur-d`).

## 8. Téléphone (375 px) et qualité

- [x] Planification : légende sans les noms, astuce clavier et « Imprimer » cachés, colonne des noms étroite et collante, grille qui défile de côté, menu d'une case dans l'écran ; pas de défilement horizontal de la page.
- [x] Employés : filtres et « À régler » sur deux lignes, menu « Exporter » dans l'écran, tableau qui défile de côté.
- [x] `npm run build` et `npm run lint` passent (aucun avertissement dans les nouveaux fichiers) ; `node --test "src/modules/rh/*.test.mjs"` : 28 sur 28 ; `npm run test:worker` : 141 sur 141.

## Décisions prises par Claude, à confirmer

- **Titre d'emploi** (colonne G du profil emploi) : le résumé du plan l'omettait, le canevas l'exige pour un ajout → réglage `titre_emploi`, vide au départ (bloquant pour un ajout) ; à donner par Charlotte.
- Un **ancien (M)** : date de réembauche (K) au lieu de la date d'embauche (I), pour ne pas écraser sa première date ; toutes les colonnes remplies comme pour un ajout.
- **Type de dépôt (1) = 1** (salaire) par défaut ; sans compte bancaire = chèque (mode 1) ; le **4 %** n'est pas dans le fichier (banque de vacances dans Employeur D).
- Province et pays du dossier (texte libre) traduits en codes ; « Laurentides », un pays autre que Canada ou États-Unis = à corriger au dossier avant l'export ; États-Unis = province ZZ.
- Dates, NAS, transit, institution, compte et codes en **texte** (zéros de tête gardés) ; matricule, heures par paie et taux horaire en nombres.
- **CDJ** présent mais pas compté au besoin ; seuls Anim et Remp comptent au besoin au départ.
- VAJ : âge inconnu = à faire ; validité mesurée au début de l'embauche ; bénévoles compris.
- Contrat et consentement signalés seulement **avant** la validation.
- **Bénévoles** reliés au référentiel comme les employés (Animation, Rooming) ; une personne au même courriel qu'un compte de la direction n'a pas de fiche d'office (règle des Feuilles de temps).
- « Relier au référentiel » ne change pas l'état actif ni les compagnies d'une fiche existante ; une fiche **créée** là est active seulement si la dernière embauche complète n'est pas terminée.
- Lien direct `personnes.employe_id` : direction seulement (sinon les fonctions) ; conséquence : une coordo ne peut pas fusionner deux fiches dont l'une est reliée.

## 9. Avant la mise en ligne (actions pour Maxime)

- [ ] Numéro Employeur D de chaque compagnie et de chaque poste payé ; titre d'emploi ; faire confirmer les valeurs par défaut par Charlotte, puis un import d'essai.
- [ ] Relier l'existant au référentiel (Personnes › Relier au référentiel), puis saisir les matricules.
- [ ] Cocher les cartes exigées par poste ; confirmer la validité d'une VAJ (3 ans).
- [ ] Saisir les dates de la saison, le besoin prévu et le réel de l'an passé ; relire les codes.
- [ ] Ajouter un script `test:rh` à `package.json` (`node --test "src/modules/rh/*.test.mjs"`) quand le fichier sera libre.
