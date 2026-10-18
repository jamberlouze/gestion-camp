# Vérification de Subventions — recherche par thème (2026-10-17)

> **Passée par Claude en DEV le 2026-10-17.** **Reste pour Maxime** : la
> mise en ligne (`/mise-en-ligne`, avec la migration), puis le §6.

Décision de Maxime après l'essai à l'aveugle du 17 octobre (dossier
`essais/recherche-par-theme-2026-10-17/` à côté du dépôt : 6 thèmes pour tout
le groupe, 119 programmes distincts en 200 recherches web, contre 64 en 322
pour la recherche par entreprise ; les 64 nouveaux sont déjà en PROD). Les
nouvelles subventions se cherchent par thème, pour tout le groupe ; chaque
programme nomme ses entreprises ; puis un « angle mort » par entreprise.
Migration `20261018024815_subventions_recherche_par_theme`.

En DEV seulement (base locale), aperçu `subventions-essai`
(http://localhost:5202/subventions/recherches), compte `admin@camp.test`.

## 1. Base (SQL sur la base DEV, transaction annulée)

- [x] Journal : `kind` `theme` (sans entreprise, `theme` obligatoire) ou `angle_mort` / `ciblee` (avec entreprise, sans thème) ; `large` et `salariale` gardés pour l'historique. — un thème sans clé et un angle mort sans entreprise : refusés
- [x] `inserer_resultats`, recherche par thème : un programme pour deux entreprises → une carte, deux étiquettes, justification « GBPA+ : J1 ‖ Opikawa : J2 » ; une entreprise en double dans la liste comptée une fois ; une seule entreprise → sa justification telle quelle ; entreprise inconnue → programme ignoré.
- [x] Programme déjà connu (carte « nouvelle ») : les entreprises qui n'y étaient pas s'ajoutent, avec leur justification ; `added_to` = 1.
- [x] Recherche par entreprise (angle mort) : comme avant — ajoutée à la carte d'un programme connu (« … ‖ Trembloc : J3 »), sinon nouvelle carte.
- [x] `prochaine_tache_trimestre(p_themes)` : les thèmes dans l'ordre reçu, puis l'angle mort de chaque entreprise active, puis les mises à jour ciblées ; un thème en panne est repris une fois.

## 2. Worker (`npm run test:worker` : 158 tests passent)

- [x] Consigne d'un thème : tout le groupe (statut, embauche, critères), consignes du groupe, familles d'organismes du thème une à une, mémoire, programmes connus avec leurs entreprises ; chaque programme nomme ses entreprises (`companies`) ; un programme connu n'est reproposé que pour ajouter une entreprise. — tests « recherche par thème »
- [x] Chaque thème de `themes.ts` a sa consigne ; thème inconnu refusé.
- [x] Aucun programme qu'on veut voir trouvé n'est nommé dans les consignes (seulement des familles d'organismes). Salarial : ajout de « chacune de ses mesures d'aide à l'embauche et à l'emploi saisonnier » (Services Québec), après les deux programmes manqués à l'essai.
- [x] Validation : noms des entreprises reconnus sans égard à la casse ni aux accents, une fois chacun, inconnus ignorés ; aucun reconnu → écarté (compté dans « écartées »). — test « entreprises reconnues par leur nom »
- [x] Budgets : thème 40 recherches / 20 pages, salarial 50 / 25, angle mort 15 / 8. — tests du pipeline
- [x] Mémoire : celle du groupe pour un thème (`company_id` vide), celle de l'entreprise pour un angle mort.
- [x] Rattrapage d'une réponse illisible : au format avec les entreprises pour un thème.
- [x] Angle mort : ce qui est propre à l'entreprise, après les thèmes, réponse au format d'une entreprise ; entreprise sans personnel : sa consigne d'avant.
- [x] Tour du trimestre : la liste des thèmes passée à la base, la tâche reçue faite (thème, angle mort ou ciblée), jamais de courriel.
- [x] Route `/api/subventions/recherche` : `genre` `theme` (+ `theme`), `angle_mort` ou `ciblee` (+ `company_id`) ; autre genre (dont l'ancien « large » sans genre et « salariale »), thème inconnu ou entreprise manquante → 400 ; même thème ou même entreprise déjà en cours → 409.

## 3. Écran (aperçu, compte Admin Test)

- [x] Recherches › Configuration : « par thème, pour tout le groupe (6 thèmes…), puis une courte recherche « angle mort » par entreprise, puis la mise à jour… ».
- [x] « Lancer une recherche maintenant » : Recherche par thème (menu des 6 thèmes), Angle mort ou Mise à jour des retenues (menu des entreprises) ; « Sans la mémoire » pour le thème et l'angle mort.
- [x] Journal : colonne « Pour » = thème + « tout le groupe », ou l'entreprise ; pastilles « thème », « angle mort » ; les anciennes « salariale » restent. — deux lignes d'essai ajoutées puis retirées
- [x] Mémoire : un bloc « Tout le groupe (recherches par thème) » avant les entreprises (pas visible en DEV : aucune règle apprise).
- [x] Réglages : textes des consignes du groupe et de « Embauche du personnel » à jour.
- [x] Aucune erreur dans la console ; `tsc` et `oxlint` sans erreur.

## 4. Essai réel de la consigne finale (abonnement Claude, à l'aveugle)

Thème salarial bâti par `invitationRechercheTheme` du Worker (groupe et consignes de la PROD, sans règles ni programmes connus), recherche faite par un agent Claude Code avec le même budget (50 recherches, 25 pages). Résultat dans `essais/recherche-par-theme-2026-10-17/final/`.

- [x] 29 programmes (44 recherches web, 22 pages), **tous valides** pour `validerProgrammeTheme` (noms des entreprises reconnus) ; BPA inc (sans personnel) jamais nommée.
- [x] **Retrouvés cette fois** : Stabilisation de l'emploi — prolongation des emplois saisonniers, et IPOP (deux des manqués de l'essai, après l'ajout sur les mesures de Services Québec).
- [x] Toujours trouvés : CTIC (AIT Numérique), Venture for Canada, Fonds étudiant FTQ, Emplois d'été Canada, subvention salariale de Services Québec, 7 partenaires du PSPE.
- [ ] **Encore manqué** : « Un premier emploi pour toi! ». Pas grave en vrai : c'est déjà une carte (en cours) en PROD, et la liste des programmes connus la garde ; ne pas la nommer dans la consigne (règle des essais).
- [ ] **Durée** : environ 21 minutes pour l'agent Claude Code (un appel d'outil à la fois). Voir §5.

## 5. Ce qui change pour la recherche automatique

- [x] Ordre du trimestre : 6 thèmes, puis 6 angles morts, puis les mises à jour : environ 12 passages de recherche au lieu de 11 (6 larges + 5 salariales), pour un budget comparable (≈ 300 recherches web au lieu de 320).
- [ ] **Durée** : un thème à 40-50 recherches web pourrait dépasser les 15 minutes d'un passage du cron (reprise une fois) ; l'essai du salarial a pris environ 21 minutes sur l'abonnement (l'ancienne recherche salariale, 16 à 18). Par l'API, sans doute moins, mais jamais mesuré. À surveiller à la première recherche par l'API (minuteur de « Lancer maintenant ») : au-delà de 12 minutes, réduire `BUDGETS` dans `pipeline.js` ou couper le thème en deux.

## 6. Après la mise en ligne (Maxime)

- [ ] Subventions › Recherches : la Configuration doit afficher ✓ pour la clé Claude (aucune recherche par l'API n'a encore tourné en PROD).
- [ ] Rien à relancer tout de suite : les 64 programmes de l'essai sont déjà dans À valider. La prochaine recherche automatique (1er janvier 2027) se fera par thème.
