# Plan — module RH (recrutement, embauche et dossiers d'employés)

Version 1, du 2026-10-11. Décisions de Maxime en §12 ; phase 1 commencée le 2026-10-12 ; phase 2 (pages publiques) bâtie en DEV le 2026-10-12.
Inventaire détaillé de l'existant (champs, formulaires, textes des courriels, Sheets) : `docs/rh-existant.md`.

## 0. Ce que le module remplace

| Outil d'aujourd'hui | Rôle | Dans l'app |
|---|---|---|
| Airtable « RH » › Candidatures + formulaire « Dépôt de candidatures » | Candidatures, tri, décisions | Candidatures (§2), formulaire public (§4) |
| › formulaire « Intention de retour » | Sondage des anciens | Lien personnel envoyé aux employés de la saison (§4) |
| › Humains | Une fiche par personne | Personnes (§2) |
| › Embauches + 2 formulaires « Confirmation d'embauche » (été, hors été) | Dossier d'employé : paie, santé, urgence, documents | Embauches + dossier d'embauche par lien personnel (§4) |
| › 16 automatisations Gmail + table Pièces jointes | Courriels par statut, contrat joint | Modèles de courriels et contrat produit par l'app (§5, §6) |
| › Banque d'employés (2025), Volontariat | Anciens, bénévoles | Importés dans Personnes (historique, « ne reprendrait pas ») |
| Base « RH - Été 2026 (Charlotte) » | Vérification des antécédents judiciaires (VAJ) | Suivi VAJ + export (§7) |
| Base « RH - ACQ » | Version simplifiée pour l'ACQ | Export ACQ (§7) |
| Google Sheets « Suivi RH 2026 » | Qui travaille quelle semaine, besoins, diètes | Planification de la saison (§8) |

### Ce que l'analyse a révélé

- **57 des 93 acceptations de 2026 ont été traitées à la main.** L'embauche n'est automatisée qu'à l'échelon 1, et pas pour Trembloc ni pour plusieurs postes. Quand rien ne correspond, aucun courriel ne part et rien ne le signale.
- **Les automatisations d'été et d'hors-saison se basculent à la main.** Elles ont le même déclencheur : actives ensemble, elles enverraient deux courriels.
- **28 des 29 combinaisons de Pièces jointes sont vides.** Le courriel de bienvenue annonce un contrat qui n'est pas joint.
- **Aucun historique.** Le statut écrase l'étape précédente ; « Dernier courriel envoyé » sert aussi de note libre.
- **Le rattachement par courriel est fragile.** Le courriel est facultatif dans « Intention de retour » ; 2 embauches sont orphelines et une personne est en double.
- **Le NAS est un champ nombre.** Un NAS qui commence par 0 perd son zéro.
- **Les dates de l'été 2026 sont écrites en dur** dans les disponibilités et dans certains courriels.
- **Libellés incohérents** d'une liste à l'autre (Coordonateur / Coordonnateur, Rouge&Diable / Rouge & Diable…), alors que les automatisations en dépendent.
- **Date d'embauche, type d'employé et action A/M** (champs de paie) n'ont jamais été remplis.
- **Sheets** : la ligne « Dispo 2026 » affiche 0 partout (la formule compte « Oui », les cases disent « Anim ») ; diètes, allergies et tailles y sont recopiées à la main.

## 1. Le cycle dans l'app

1. **Saison ouverte** : la direction choisit les postes offerts pour la saison. Ils alimentent le formulaire public de candidature.
2. **Candidature reçue** : la personne est retrouvée par son courriel, sinon créée. Une alerte part à la direction.
3. **Tri** : pré-décision (Oui, Peut-être, Bof, Non, Proposer ASPI) et commentaires internes.
4. **Entrevue** : « Proposer une entrevue » prépare le courriel avec le lien de prise de rendez-vous. Date et notes d'entrevue sur la candidature.
5. **Décision** :
   - « Accepter » demande saison, compagnie, poste et échelon, crée l'**embauche** et prépare le courriel de bienvenue (lien personnel du dossier + contrat) ;
   - « Refuser » (après entrevue ou équipe complète), « Proposer ASPI », « Question permis de travail », « A refusé le poste » préparent chacun leur courriel.
   - Chaque changement va au journal de la candidature, avec son auteur.
6. **Dossier d'embauche** (lien personnel, sans compte) : identité, paie, santé, urgence, disponibilités, code d'éthique, documents, contrat signé. Un ancien retrouve son dossier pré-rempli et confirme ou corrige.
7. **Validation** par la direction : type de rémunération, 4 %, type d'employé, date d'embauche. L'embauche devient complète et la personne entre dans le référentiel Employés.
8. **Fin de saison** : « Intention de retour » envoyée aux employés de la saison par lien personnel. Un « Oui » devient une candidature « retour », réembauchée en un clic, sans entrevue.
9. **En saison** : planification semaine par semaine, diètes par semaine pour la cuisine, conformité (VAJ, cartes qui expirent), exports (paie, ACQ, VAJ).

## 2. Données (schéma `rh`)

- **`personnes`** : une par humain. Prénom, nom de famille, nom de camp, courriel (unique, normalisé), téléphone, date de naissance, notes internes, « ne pas réembaucher » (+ raison), « a déjà travaillé avec nous » (avant la base RH, saisons inconnues), VAJ (date, statut), lien vers `core.employes`.
- **`saisons`** : Printemps / Été / Automne / Hiver + année, dates, genre `ete` / `hors_ete` (choisit la version du dossier et du code d'éthique), ouverte aux candidatures ou non.
- **`saisons_dates`** : formations, classes vertes, semaines d'été, avec dates et « obligatoire ». Sert aux disponibilités du dossier et aux colonnes de la planification. Plus aucune date en dur.
- **`postes`** : une seule liste (nom, compagnie = `core.entreprises`, genres de saison où il est offert, lien vers la description, actif). Fin des libellés en double.
- **`postes_saison`** : postes offerts dans une saison (les « offres d'emploi ») et besoin prévu.
- **`candidatures`** : personne, saisons et postes demandés, source (`formulaire`, `retour`, `manuel`, `import`), réponses du formulaire, statut, pré-décision, commentaires, entrevue (date, notes), décision.
- **`journal`** : chaque changement de statut, chaque courriel, chaque note, avec auteur et date.
- **`embauches`** : une par personne et par saison (+ compagnie, poste, échelon) ; genre emploi ou bénévolat (sans paie, entente de bénévolat). Statut `a_envoyer` → `envoyee` → `dossier_recu` → `complete` (ou `annulee`). Champs de paie : type de rémunération, 4 %, type d'employé (B, C, E, P, R, T), action A/M, date d'embauche. Disponibilités, code d'éthique accepté (date + version du texte), réponses « médias sociaux ».
- **`dossiers`** : ce qui dure d'une année à l'autre : adresse, assurance maladie, études, allergies, diète, tailles, contacts d'urgence. Mis à jour par chaque dossier d'embauche.
- **`paie`** (table à part, accès à part) : NAS, transit, institution, compte, spécimen de chèque. **Chiffrés en base**, lus seulement par une fonction qui vérifie l'accès et note chaque consultation (§3).
- **`documents`** : CV, contrat signé, consentement parental, cartes de premiers soins et SN (avec date d'expiration), pièce d'identité, photo. Seau **privé** `rh-documents` ; le spécimen de chèque va dans le seau `rh-paie`.
- **`modeles`** : courriels (par genre × compagnie) et contrats (par genre de saison × compagnie, avec champs poste, échelon, taux, dates).
- **`notes_dossier`** : notes et mesures disciplinaires (avis verbal, avis écrit, suspension, renvoi), comme le prévoit le code d'éthique.
- **`affectations`**, **`codes`**, **`besoins`** : planification de la saison (§8).

## 3. Accès et confidentialité

- Module `rh` dans la grille d'accès. Au départ : **direction en écriture**, coordonnateurs sans accès (un coordo peut le recevoir en ajout personnel, pour les entrevues).
- Accès à part **`rh_paie`** (NAS, banque, spécimen de chèque ; `parent: 'rh'`, comme `reservations_sante`) : **direction et admins** (décision de Maxime du 2026-10-11).
- NAS et numéro de compte **masqués par défaut** (« •••-•••-123 »). Le bouton « Afficher » passe par `rh.lire_paie()`, qui vérifie l'accès et note la consultation (qui, quand, quelle fiche).
- Chiffrement en base (pgcrypto, clé dans Supabase Vault) : une copie de la base ou une exportation ne montre jamais un NAS en clair.
- Pas de cache sur l'appareil ni de temps réel pour les requêtes du module (comme les Feuilles de temps).
- **Loi 25** : pas d'effacement automatique des candidatures non retenues (décision de Maxime du 2026-10-11) ; « Effacer la candidature » à la main (CV et réponses), journal gardé.

## 4. Pages publiques (sans compte)

Bâties en DEV le 2026-10-12 (phase 2). Adresse : **emplois.camptremblant.com** (décision de Maxime ; variable `VITE_HOTE_EMPLOIS`, toute autre adresse de ce sous-domaine mène à `/emplois`) ; d'ici là, l'adresse de l'app.

- **Sécurité** : l'anonyme n'a **aucun droit** sur le schéma `rh` (pas même `usage`). Les pages parlent seulement au Worker (`/api/rh/*`) : Turnstile (candidature) ou jeton de 48 caractères hexadécimaux (retour, dossier), mêmes vérifications que la page (fichiers purs partagés), fichiers déposés avec la clé secrète dans les seaux privés (jamais d'adresse publique ; retirés si la base refuse), puis fonctions `rh.*` exécutables par `service_role` seulement, qui revérifient le jeton et l'état.
- **Socle commun avec les Réservations** (`src/lib/public/` : habillage, Turnstile, langue, client anonyme ; `worker/commun/turnstile.js`) : RH peut partir en PROD sans les Réservations (décision de Maxime).
- **`/emplois`** (français et anglais, `?lang=en`) : saisons ouvertes, postes actifs du genre de la saison groupés par compagnie (lien vers camptremblant.com/emploi et vers la description du poste s'il y en a une), **3 postes au plus, vraiment imposé** (cases grisées, Worker, base), CV obligatoire (PDF, Word ou photo, 20 Mo). Personne retrouvée par courriel identique (ses coordonnées ne sont pas réécrites : un nom ou un téléphone différent est noté dans la candidature), sinon créée. Candidature `source = 'formulaire'`, CV au dossier, ligne au journal « Formulaire web ». Mention de confidentialité (qui voit, pourquoi, à qui écrire) ; pas de durée de conservation annoncée (pas d'effacement automatique).
- **`/retour/<jeton>`** : une invitation par personne et saison visée (`rh.invitations`). Onglet Employés › « Intention de retour… » : les employés de la saison affichée cochés (sauf « ne pas réembaucher »), d'autres anciens à cocher ; pas de lien générique (décision de Maxime). « Copier le lien » dans la fenêtre et la fiche. « Oui » = candidature `retour` à traiter ; « Non » = `ne_revient_pas`. Réponse modifiable tant que la direction n'a pas traité la candidature. Introduction modifiable (Réglages), avec `{{prenom}}`, `{{saison}}`, `{{lien_emplois}}`.
- **`/dossier/<jeton>`** : un lien par embauche (créer, copier, refaire depuis la carte de l'embauche ; « Marquer comme envoyé »).
  - Version été ou hors été selon la saison (t-shirt, hoodie, présentation et commentaires l'été) ; disponibilités = dates de la saison.
  - Bénévole : pas de section paie, entente de bénévolat sous le code d'éthique.
  - Pré-rempli pour un ancien. Le NAS et le compte déjà connus ne sont **jamais** renvoyés : « NAS au dossier (finit par 123) — le changer ? ». NAS, compte et spécimen exigés seulement s'il n'y en a pas (nouveau compte = nouveau spécimen).
  - Consentement parental demandé à une personne mineure au début de l'embauche (le document signé ; la signature en ligne viendra en phase 3, avec le contrat).
  - Code d'éthique : la version affichée est gardée avec la date (`rh.textes`, modifiable dans Réglages, une version par modification).
  - L'envoi passe l'embauche à « Dossier reçu » ; on peut renvoyer pour corriger tant qu'elle n'est pas complète. « Valider l'embauche » (champs de paie, NAS et compte exigés pour un emploi) la rend complète et ferme le lien.
- Pas de courriel en phase 2 : pastilles « à traiter » et « dossiers reçus » sur les onglets, bandeau des dossiers reçus dans Employés.

## 5. Courriels

Bâtis en DEV le 2026-10-15 (phase 3) : onglet **Courriels** (À envoyer, Envoyés, Compagnies et boîtes, Modèles, Réglages), `worker/rh/courriels.js`, règles et rendu dans `src/modules/rh/courriels.ts` (pur, app et Worker), migration `rh_courriels`.

- **Chaque compagnie écrit de sa boîte** (décision du 2026-10-15) : `rh.compagnies.adresse_envoi`, modifiable ; boîte autorisée par OAuth Google (envoi seulement), jeton chiffré dans `rh.connexions_gmail` ; état affiché (connectée, pas connectée, à reconnecter si l'adresse change, erreur, dernier envoi) et « M'envoyer un essai ». Compagnie qui écrit : celle qui traite la candidature, sinon celle du premier poste ; celle de l'embauche ; pour le retour, celle de la dernière embauche (sinon la GBPA+).
- Préparé (app ou Worker), relu, corrigé, envoyé d'un clic **par le Worker seulement** (`rh.courriel_envoye`, journal) ; un champ vide devient « [champ ?] » et bloque l'envoi ; `cle` unique : jamais préparé deux fois. Un courriel de bienvenue envoyé fait passer l'embauche à « Lien envoyé ».
- Automatiques : **accusé de réception** au candidat (envoyé seul, en anglais s'il a postulé en anglais) et **résumé quotidien** à la direction (heure et destinataires réglables, seulement s'il y a du nouveau) ; **rappel du dossier** préparé seul après 7 jours (réglable), à relire. Rien de préparé seul pour ce qui précède le réglage `courriels_depuis`.

- Un **modèle par genre × compagnie**, modifiable dans l'onglet Modèles :
  - proposition d'entrevue ;
  - refus après entrevue ;
  - refus équipe complète ;
  - proposition ASPI ;
  - question permis de travail ;
  - bienvenue (embauche) ;
  - rappel de dossier incomplet ;
  - intention de retour.
- Chaque compagnie a ses réglages : signature, lien de prise de rendez-vous, « ce qui attire » ; modèle propre à une compagnie possible (sinon le commun).
- Plus de case « Envoi courriel ? » : choisir un statut **prépare** le courriel, qu'on relit, corrige au besoin, puis envoie d'un clic. Il part par l'API Gmail et s'inscrit au journal.
- Si le modèle ou le contrat manque pour la compagnie, l'app le dit **avant** l'envoi.
- Envoi en lot pour l'intention de retour (tous les employés d'une saison).

## 6. Contrat et signature

Bâti en DEV le 2026-10-15 (phase 3) : migration `rh_contrats`, `src/modules/rh/termesContrat.ts` (pur) et `contrat.ts` (PDF), `worker/rh/contrats.js`, socle commun `src/lib/pdf/` (moteur, modèles, pose de la signature) avec les Réservations.

- Contrat produit par l'app (même moteur et même syntaxe de modèles que les contrats de groupes), à partir d'un modèle par compagnie et genre de saison (le plus précis l'emporte). « Préparer le contrat » **fige les termes** (poste, saison, dates, rémunération, taux, échelon, compagnie, tâches du poste) et le texte dans `rh.contrats` ; **pré-signé au nom de la personne qui le prépare** (la base l'impose). Le PDF est produit à la demande avec les coordonnées à jour de l'employé.
- Taux : **grille saison × poste × échelon** (`rh.taux`, Réglages) ; une embauche créée avec poste et échelon reçoit le taux de la grille.
- Signé en ligne dans le dossier d'embauche, après l'envoi du dossier (coordonnées au contrat) : signature au doigt, case « J'ai lu… », PDF signé + certificat (empreinte SHA-256, IP, navigateur) gardé dans les documents ; la validation exige un contrat signé (emploi).
- Mineur à la date de début : consentement parental signé dans la même page par un parent (nom, lien), même certificat ; la validation l'exige (le formulaire signé peut aussi être joint aux documents).

## 7. Employés, conformité et exports

- **Onglet Employés** : embauches d'une saison, filtres compagnie / poste / état du dossier. Pastilles « dossier incomplet », « contrat non signé », « VAJ à faire », « premiers soins expirés ».
- **Fiche d'une personne** : historique (saisons, postes, échelons), candidatures, documents, paie (si accès), notes au dossier, journal.
- **VAJ** : qui en a besoin, date de la dernière, export prêt à coller (date de naissance AAAAMMJJ, nom, prénom), comme la base de Charlotte.
- **Certifications** : premiers soins et SN avec date d'expiration ; alerte si elles expirent avant ou pendant la saison.
- **Exports** : paie (format du système de paie, à préciser), ACQ (la version simplifiée d'aujourd'hui), liste de la saison.

## 8. Planification de la saison (remplace le Sheets)

- Grille : une ligne par embauche de la saison, regroupée par poste ; une colonne par date de la saison (formations, semaines).
- Cases codées : Anim, Remplaçant, Gestion, Cuisine, Spécialiste, Loutre, Sauveteur, Oui, Congé, Non, CDJ, n/a, Coupé. La liste est modifiable, avec une couleur par code et un réglage « compte comme présent ».
- Les disponibilités du dossier d'embauche s'affichent dans la grille, sans qu'on ait rien à recopier.
- Lignes de pilotage calculées : besoin prévu, présents, écart, réel de l'an passé.
- **Diètes par semaine** calculées à partir des dossiers, plus aucune recopie. À brancher plus tard sur Cuisine.
- Hébergement : plus tard, avec Rooming.

## 9. Lien avec le reste de l'app

- **Référentiel Employés** (`core.employes`) : une embauche validée crée ou réactive la fiche (nom de camp, prénom, nom, courriel, poste, compagnie). Le module RH devient la source des nouveaux employés ; le secteur reste réglé dans le référentiel.
- **Feuilles de temps, Animation, Calendrier** : inchangés, ils lisent toujours le référentiel.

## 10. Import d'Airtable

- Script `scripts/migration/rh-airtable.mjs` ; le SQL produit reste hors dépôt (données personnelles), appliqué par l'API Management comme pour le CRM.
- Source : l'API Airtable (jeton en lecture) **ou** des extraits du connecteur Airtable de Claude (`--depuis`, réponses enregistrées telles quelles, jamais recopiées). Import DEV fait le 2026-10-12 par le connecteur, sans les champs de paie : 684 personnes, 320 candidatures (mêmes statuts qu'Airtable), 252 embauches (dont les saisons 2022 à 2025 de la banque 2025), 70 dossiers, 647 disponibilités ; relancé une 2e fois sans doublon.
- Personnes (Humains + Banque 2025 + Volontariat), candidatures, embauches, dossiers, paie (chiffrée), fichiers (téléchargés d'Airtable vers les seaux privés).
- Relançable sans doublons (`airtable_id`), pour importer une première fois à l'essai puis une dernière fois à la bascule.
- Libellés corrigés au passage (postes, compagnies, saisons, tailles).

## 11. Phases

| Phase | Contenu | Visé |
|---|---|---|
| 1 | Schéma, accès, chiffrement ; saisons et postes ; Candidatures (liste, fiche, journal) ; Employés et fiche d'une personne ; import Airtable à l'essai | — |
| 2 | Pages publiques : candidature, intention de retour, dossier d'embauche ; dépôt de fichiers ; alertes | bâtie en DEV le 2026-10-12 |
| 3 | Courriels (modèles, envoi Gmail, journal) ; contrat produit et signé en ligne | bâtie en DEV le 2026-10-15 ; en ligne avant le pic de janvier (122 candidatures en janvier 2026) |
| 4 | Planification, diètes par semaine, conformité, exports, lien avec le référentiel | avant les formations de mai |
| Bascule | Import final, formulaires Airtable fermés et redirigés, automatisations coupées | après la phase 3 |

Airtable continue de tourner jusqu'à la bascule.

## 12. Décisions

Prises par Maxime le 2026-10-11 :

1. ~~**Expéditeur des courriels** : une seule adresse de camptremblant.com, avec le nom et la signature de la compagnie ; « Répondre à » = la boîte de la compagnie.~~ Remplacée par la décision 14.
2. **Contrat** : produit par l'app et signé en ligne dans le dossier d'embauche (consentement parental au même endroit).
3. **Accès** : direction en écriture dès le départ ; `rh_paie` (NAS, banque) : direction et admins.
4. **Conservation** des candidatures non retenues : **pas d'effacement automatique** (on efface à la main au besoin). Aucune durée n'est donc annoncée dans le formulaire.

Réponses de Maxime du 2026-10-12 :

5. **Système de paie** : **Employeur D** (Desjardins). L'export de la phase 4 suit son format d'importation ; les champs Action (A/M) et Type d'employé (B, C, E, P, R, T) d'Airtable en viennent.
6. **Bénévoles** : oui, « la portion embauche ». Une embauche de genre `benevolat` : même dossier, sans paie ni échelon, entente de bénévolat au lieu d'un contrat (fait le 2026-10-12, migration `rh_benevoles`). La table Volontariat d'Airtable est vide : rien à importer.
7. **« CDJ »** = camp de jour, par opposition à **CDV** = camp de vacances. À reprendre dans les codes de la planification (phase 4).

Réponses de Maxime du 2026-10-12 (phase 2) :

8. **Adresse des pages publiques** : emplois.camptremblant.com (sous-domaine propre).
9. **Socle commun** des pages publiques sorti des Réservations (`src/lib/public/`) : RH peut être publié sans elles.
10. **Anglais** : le formulaire de candidature en français et en anglais ; l'intention de retour et le dossier d'embauche en français.
11. **Intention de retour** : aux employés de la saison, cochés à la main (plus des « A déjà travaillé » au besoin) ; pas de lien générique.
12. **Entente de bénévolat** : brouillon rédigé par Claude, marqué « à valider » dans Réglages.
13. **Codes d'éthique** : ceux d'Airtable, mots inchangés, mise en forme corrigée ; modifiables dans Réglages.

Réponses de Maxime du 2026-10-15 (phases 3 et 4) :

14. **Expéditeur** : chaque compagnie écrit de **sa** boîte (GBPA+ inscriptions@camptremblant.com, Opikawa messages@opikawa.com, Rouge & Diable info@rougediable.ca, Aquabounga info@aquabounga.ca, Trembloc info@trembloc.ca), modifiable dans l'app **avec un état de connexion** qui confirme que le changement a fonctionné.
15. **Alertes** : accusé de réception au candidat + résumé quotidien à la direction.
16. **Contrats** : partir des PDF d'Airtable ; pré-signés par la personne qui envoie.
17. **Taux** : grille poste × échelon (par saison), dans les réglages.
18. **Référentiel Employés** : fiche créée ou mise à jour automatiquement à la validation (phase 4).
19. **Rappel du dossier** : préparé après 7 jours, envoyé sur approbation.
20. **Employeur D** : gabarit « Données d'emploi » (canevas de septembre 2026) pour l'export de la phase 4 ; les gabarits « Saisie simple » (heures) servent aux Feuilles de temps.
21. **Sous-domaine** emplois.camptremblant.com : on attend avant de le brancher.

## 13. Choix de Claude (à confirmer si le sujet revient)

- Les postes ouverts par saison sont tenus dans l'app ; les descriptions restent sur camptremblant.com/emploi (lien).
- Une candidature peut viser plusieurs saisons ; chaque acceptation crée une embauche distincte.
- Une personne est retrouvée **automatiquement** seulement si son courriel est identique ; sinon une nouvelle fiche est créée, avec un bouton « Fusionner » si on repère un doublon.
- Un ancien qui revient n'a pas d'entrevue obligatoire ; l'échelon de l'an passé est proposé.
- Phase 2 : tout passe par le Worker (l'anonyme n'a aucun droit sur le schéma `rh`), y compris la lecture des pages à jeton.
- « Valider l'embauche » exige aussi le NAS et le compte bancaire au dossier (un emploi complet doit pouvoir être payé) ; « Complète » ne se choisit plus dans le menu du statut.
- Courriel en double au dossier d'embauche (déjà pris par une autre fiche) : gardé tel quel et noté au journal (à fusionner au besoin).
- Une réponse « Oui » à l'intention de retour peut viser plusieurs saisons ouvertes ; pas de maximum de postes (comme Airtable).
- Adresse à écrire pour les renseignements personnels : inscriptions@camptremblant.com en attendant (`COURRIEL_EMPLOIS`, à confirmer).
- Photos de plus de 1,5 Mo réduites dans le navigateur avant l'envoi du dossier (1600 px).
- Phase 3 : courriels de statut **préparés** (jamais envoyés seuls), sauf l'accusé, le rappel et le résumé, seuls genres qui peuvent passer en « Envoyé seul ».
- Le contrat se signe **après** l'envoi du dossier (les coordonnées de l'employé y sont inscrites) ; il reste lisible par le même lien une fois signé.
- Signature du contrat et du consentement : PDF produit et gardé par le Worker (jamais par le navigateur de l'employé) ; la base n'accepte un fichier que dans le dossier de la personne du jeton.
- Le résumé quotidien part de la boîte de la GBPA+ ; un jour sans nouveauté, pas de résumé.
- Intention de retour : inviter prépare le courriel des personnes qu'on vient d'inviter ; « Préparer les courriels manquants » pour les invitations faites avant.
- Modèles de départ des courriels repris d'Airtable (`docs/rh-existant.md`), à relire ; contrat et consentement « à valider ».
