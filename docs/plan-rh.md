# Plan — module RH (recrutement, embauche et dossiers d'employés)

Version 1, du 2026-10-11. Décisions de Maxime en §12 ; phase 1 commencée le 2026-10-12.
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

- **`personnes`** : une par humain. Prénom, nom de famille, nom de camp, courriel (unique, normalisé), téléphone, date de naissance, notes internes, « ne pas réembaucher » (+ raison), VAJ (date, statut), lien vers `core.employes`.
- **`saisons`** : Printemps / Été / Automne / Hiver + année, dates, genre `ete` / `hors_ete` (choisit la version du dossier et du code d'éthique), ouverte aux candidatures ou non.
- **`saisons_dates`** : formations, classes vertes, semaines d'été, avec dates et « obligatoire ». Sert aux disponibilités du dossier et aux colonnes de la planification. Plus aucune date en dur.
- **`postes`** : une seule liste (nom, compagnie = `core.entreprises`, genres de saison où il est offert, lien vers la description, actif). Fin des libellés en double.
- **`postes_saison`** : postes offerts dans une saison (les « offres d'emploi ») et besoin prévu.
- **`candidatures`** : personne, saisons et postes demandés, source (`formulaire`, `retour`, `manuel`, `import`), réponses du formulaire, statut, pré-décision, commentaires, entrevue (date, notes), décision.
- **`journal`** : chaque changement de statut, chaque courriel, chaque note, avec auteur et date.
- **`embauches`** : une par personne et par saison (+ compagnie, poste, échelon). Statut `a_envoyer` → `envoyee` → `dossier_recu` → `complete` (ou `annulee`). Champs de paie : type de rémunération, 4 %, type d'employé (B, C, E, P, R, T), action A/M, date d'embauche. Disponibilités, code d'éthique accepté (date + version du texte), réponses « médias sociaux ».
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

Mêmes fondations que les Réservations : pages chargées avant la connexion, client Supabase anonyme, envoi par le Worker avec Turnstile, fonctions `security definer` comme seules portes d'entrée.

- **`/emplois`** : postes ouverts par saison, puis le formulaire de candidature (CV en pièce jointe, 3 postes au plus, vraiment imposé).
- **`/retour/<jeton>`** : intention de retour d'un employé, déjà identifié par son lien. Fini le rattachement par courriel.
- **`/dossier/<jeton>`** : dossier d'embauche d'une embauche précise.
  - Version été ou hors été selon la saison.
  - Disponibilités tirées des dates de la saison.
  - Pré-rempli pour un ancien. Le NAS déjà connu n'est jamais réaffiché : « NAS au dossier (finit par 123) — le changer ? ».
  - Signature du contrat (et du consentement parental pour un mineur, §6).
  - Lien valable jusqu'à ce que le dossier soit validé ; peut être renvoyé.
- Fichiers déposés par le Worker dans le seau privé (taille et type vérifiés).

## 5. Courriels

- Un **modèle par genre × compagnie**, modifiable dans l'onglet Modèles :
  - proposition d'entrevue ;
  - refus après entrevue ;
  - refus équipe complète ;
  - proposition ASPI ;
  - question permis de travail ;
  - bienvenue (embauche) ;
  - rappel de dossier incomplet ;
  - intention de retour.
- Chaque compagnie a ses réglages : signature et lien de prise de rendez-vous.
- Plus de case « Envoi courriel ? » : choisir un statut **prépare** le courriel, qu'on relit, corrige au besoin, puis envoie d'un clic. Il part par l'API Gmail et s'inscrit au journal.
- Si le modèle ou le contrat manque pour la compagnie, l'app le dit **avant** l'envoi.
- Envoi en lot pour l'intention de retour (tous les employés d'une saison).

## 6. Contrat et signature

- Contrat produit par l'app (moteur PDF des Réservations), à partir d'un modèle par genre de saison × compagnie. Champs : nom, poste, échelon, taux, dates, compagnie.
- Signé en ligne dans le dossier d'embauche (même signature électronique que les contrats de groupes : PDF signé + certificat, gardés dans le dossier).
- Mineur à la date de début : consentement parental signé dans la même page.

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

- Script dans `scripts/migration/` ; le SQL produit reste hors dépôt (données personnelles), appliqué par l'API Management comme pour le CRM.
- Personnes (Humains + Banque 2025 + Volontariat), candidatures, embauches, dossiers, paie (chiffrée), fichiers (téléchargés d'Airtable vers les seaux privés).
- Relançable sans doublons (`airtable_id`), pour importer une première fois à l'essai puis une dernière fois à la bascule.
- Libellés corrigés au passage (postes, compagnies, saisons, tailles).

## 11. Phases

| Phase | Contenu | Visé |
|---|---|---|
| 1 | Schéma, accès, chiffrement ; saisons et postes ; Candidatures (liste, fiche, journal) ; Employés et fiche d'une personne ; import Airtable à l'essai | — |
| 2 | Pages publiques : candidature, intention de retour, dossier d'embauche ; dépôt de fichiers ; alertes | avant décembre |
| 3 | Courriels (modèles, envoi Gmail, journal) ; contrat produit et signé en ligne | avant le pic de janvier (122 candidatures en janvier 2026) |
| 4 | Planification, diètes par semaine, conformité, exports, lien avec le référentiel | avant les formations de mai |
| Bascule | Import final, formulaires Airtable fermés et redirigés, automatisations coupées | après la phase 3 |

Airtable continue de tourner jusqu'à la bascule.

## 12. Décisions

Prises par Maxime le 2026-10-11 :

1. **Expéditeur des courriels** : une seule adresse de camptremblant.com, avec le nom et la signature de la compagnie ; « Répondre à » = la boîte de la compagnie.
2. **Contrat** : produit par l'app et signé en ligne dans le dossier d'embauche (consentement parental au même endroit).
3. **Accès** : direction en écriture dès le départ ; `rh_paie` (NAS, banque) : direction et admins.
4. **Conservation** des candidatures non retenues : **pas d'effacement automatique** (on efface à la main au besoin). Aucune durée n'est donc annoncée dans le formulaire.

Encore à préciser (pas bloquant pour la phase 1) :

5. **Système de paie** : lequel (pour le format de l'export, phase 4) ?
6. **Bénévoles** (table Volontariat) : dans le module, avec une embauche « bénévole » sans paie ?
7. **« CDJ »** dans le Sheets : que veut dire ce code ?

## 13. Choix de Claude (à confirmer si le sujet revient)

- Les postes ouverts par saison sont tenus dans l'app ; les descriptions restent sur camptremblant.com/emploi (lien).
- Une candidature peut viser plusieurs saisons ; chaque acceptation crée une embauche distincte.
- Une personne est retrouvée **automatiquement** seulement si son courriel est identique ; sinon une nouvelle fiche est créée, avec un bouton « Fusionner » si on repère un doublon.
- Un ancien qui revient n'a pas d'entrevue obligatoire ; l'échelon de l'an passé est proposé.
- Formulaires publics en français seulement au départ (anglais possible ensuite, comme les Réservations).
