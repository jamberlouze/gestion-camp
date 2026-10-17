# Vérification de Subventions — recherche salariale à part (2026-10-17)

> **Passée par Claude en DEV le 2026-10-17.** **Reste pour Maxime** : après la
> mise en ligne, lancer une « Recherche salariale » pour chaque compagnie qui
> embauche (§5) plutôt que d'attendre la recherche automatique du 1er janvier.

Commentaire de Charlotte : la recherche n'avait pas trouvé CTIC, VFC et FTQ,
des subventions salariales utilisées cet été. Ces programmes ne passent pas
par un ministère mais par un organisme intermédiaire (CTIC et Venture for
Canada : partenaires du Programme de stages pratiques pour étudiants ; FTQ :
Fonds étudiant, un fonds syndical). Migration
`20261017021353_subventions_recherche_salariale`.

En DEV seulement (base locale), aperçu `subventions-essai`
(http://localhost:5202/subventions/recherches), compte `admin@camp.test`.

## 1. Pourquoi ils avaient été manqués

- [x] Une seule recherche par compagnie, tous types confondus (les 6 du 2026-10-05, sur l'abonnement : 45 à 70 recherches web chacune ; par l'API : 20) : 15 cartes salariales sur 67 en PROD, dont 3 partenaires du PSPE (FCCQ, ECO Canada, RH Tourisme Canada), mais ni CTIC, ni Venture for Canada, ni le Fonds étudiant FTQ. Le nombre de recherches ne suffit donc pas : des recherches générales n'atteignent pas les organismes intermédiaires. — lecture de la PROD
- [x] La consigne demandait des programmes « ouverts ou à venir » : en octobre, les programmes d'été sont fermés (Venture for Canada depuis le 28 août, Fonds étudiant en pause jusqu'au 1er mars).
- [x] L'app ne sait pas ce que le groupe a utilisé cet été (historique jamais importé) : la mise à jour du trimestre ne peut pas suivre leur prochaine édition. — voir §5

## 2. Recherche salariale (Worker)

- [x] Nouvelle consigne `invitationRechercheSalariale` : seulement le salarial (salaires, stages, emplois d'été, formation des employés, crédits d'impôt), familles passées une à une — gouvernements, **chaque partenaire du PSPE**, organismes de la SECJ, fonds de travailleurs, syndicats, coopératives et fondations, associations de nos secteurs, crédits d'impôt, pages « financement des stages » des écoles comme liste de pistes. — test « recherche salariale : familles d'organismes… »
- [x] Aucun des trois programmes manqués n'est nommé dans la consigne (l'essai du §4 doit prouver la méthode).
- [x] Même contexte que la recherche large (groupe, consignes, critères, mémoire, programmes connus avec leurs compagnies) : partie commune `contexteRecherche`.
- [x] 40 recherches web et 20 pages (la large : 20 et 10). — tests du pipeline
- [x] Journal : `kind = 'salariale'`, mêmes compteurs que la large.
- [x] La large, pour une compagnie qui embauche, ne consacre plus ses recherches au salarial (sans l'écarter) ; une compagnie sans personnel garde sa consigne d'avant.
- [x] Programme récurrent fermé aujourd'hui : proposé quand même, avec sa prochaine édition ; jamais les dates d'une édition passée (les deux consignes).
- [x] Filet : date limite passée → dates retirées avant l'insertion (sinon la carte expirerait le lendemain). — test « édition passée » et pipeline
- [x] `npm run test:worker` : 156 tests passent.

## 3. Trimestre et « Lancer maintenant »

- [x] Ordre des travaux : les larges de toutes les compagnies, puis la salariale de chaque compagnie active qui embauche, puis les mises à jour ciblées. — SQL (transaction annulée) : salariale GBPA+ après les larges ; Trembloc sans personnel sauté ; puis ciblée
- [x] Une salariale qui échoue est reprise une fois dans le trimestre, pas plus ; une en cours n'est pas relancée. — SQL : après un échec, GBPA+ encore ; après deux, Opikawa
- [x] Contrainte : `kind` large, salariale ou ciblee seulement. — SQL : « autre » refusé
- [x] Onglet Recherches : choix « Recherche salariale » entre la large et la mise à jour ; « Sans la mémoire » offert pour la large et la salariale ; « 3 à 15 minutes ». — aperçu
- [x] Journal : pastille « salariale ». — aperçu, après l'essai du §4
- [x] Route `/api/subventions/recherche` avec `genre: 'salariale'`. — test « recherche salariale manuelle en flux »

## 4. Essai réel (abonnement Claude, consigne du Worker, sans nommer les trois)

Consigne bâtie par `invitationRechercheSalariale` à partir de la base DEV, recherche faite par un agent Claude Code avec le même budget (40 recherches, 20 pages), réponse validée par `validerProgrammes` + `sansEditionPassee` et insérée par `subventions.inserer_resultats` (journal : `salariale`, `manuel`, modèle « claude-code (abonnement, essai) »).

- [x] **GBPA+** : 24 programmes (40 recherches, 19 pages), tous valides. **Les trois trouvés** : CTIC « Apprentissage intégré au travail numérique », Venture for Canada (stages), Fonds étudiant solidarité travail du Québec (FTQ). Autres absents de la PROD : Magnet, TECHNATION Career Ready, Emplois verts (ACPL), Desjardins Jeunes au travail, PAIPNI, francisation de courte durée, Mitacs stage de stratégie d'entreprise, bourse FRQ-Mitacs, incitatif fédéral à l'embauche d'apprentis ; à écarter sans doute : Talent Opportunities (Chambre de commerce de l'Ontario).
- [x] **Opikawa** : 20 programmes (38 recherches, 20 pages), tous valides ; **les trois trouvés** aussi. En DEV : 7 nouvelles cartes, 13 ajoutées aux cartes de GBPA+ (une carte par programme).
- [x] Programmes fermés gardés : Venture for Canada (prochaine date limite 2027-02-28), Fonds étudiant (dates à null, ouverture habituelle dans la description).
- [x] Journal : pastilles « salariale », « manuelle », « sans mémoire » ; 24 nouvelles, 40 recherches web. — aperçu
- [ ] **Durée** : environ 16 et 18 minutes par agent Claude Code (un appel d'outil à la fois). Par l'API, probablement moins, mais une recherche du cron est coupée à 15 minutes (reprise une fois). À surveiller à la première recherche salariale par l'API (minuteur de « Lancer maintenant ») : au-delà de 12 minutes, réduire `GENRES.salariale.budget` ou couper la recherche en deux.

## 5. Après la mise en ligne (Maxime)

- [ ] Subventions › Recherches › Configuration : « Clé API Claude » doit afficher ✓. Aucune recherche par l'API n'a encore tourné en PROD (les 6 du journal ont été faites sur l'abonnement) : sans le secret `ANTHROPIC_API_KEY` dans Cloudflare, ni « Lancer maintenant » ni la recherche automatique du 1er janvier ne partent.

- [ ] Subventions › Recherches : « Recherche salariale » pour chaque compagnie qui embauche (une à la fois, jusqu'à 15 minutes chacune), puis trier les nouvelles cartes dans À valider.
- [ ] Entrer les programmes salariaux de cet été (CTIC, VFC, FTQ…) comme **obtenus 2025-26**, avec leurs compagnies (ajout manuel) : la mise à jour du trimestre suivra ensuite leur prochaine édition.
