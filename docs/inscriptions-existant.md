# Inscriptions du camp de vacances — inventaire de l'existant

Relevé du 2026-10-16, **en lecture seule**, de la base Airtable « Inscriptions Camp de vacances » (`appTMCcPD9vlzuoyj`) par le connecteur Airtable de Claude. **Aucune donnée personnelle n'est recopiée** (structure, catalogues et volumes seulement) ; les adresses des webhooks Make sont masquées (elles servent de jetons). Les trois applications Softr (ADMIN, portails BPA et Opikawa) ont été relevées dans Softr Studio le même jour, en lecture seule (parties E et F). Les scénarios Make restent à inventorier (§ « À faire »).

## Synthèse

**Ce qu'est le système aujourd'hui**
- **Airtable** = la base (44 tables, ≈ 1 070 champs, 41 automatisations dont 24 actives, 9 interfaces pour l'équipe).
- **Softr** = le portail des familles (inscription, fiches, paiement) et un espace admin ; comptes de l'équipe dans `Admin_Users` (rôles Anim / Coordo / Direction), sans lien avec les employés.
- **Make** = les courriels aux familles et la construction des factures Stripe (13 webhooks écrits en dur, un seul en service : « nouvelle famille »).
- **Stripe** = dépôts (Checkout, crédit sur le solde du client) et factures ; un client Stripe par famille.
- **Deux compagnies** dans la même base : BPA (= GBPA+) et OPI (= Opikawa), séparées par « BPA OPI ? » de la Famille, avec leurs tables Facture et Paiement en double, leur numérotation (`BPA-AA-NNN`, `OPI-AA-NNN`), leurs prix et leurs règles de taxes.

**Volumes** : Famille 1 256 (1 199 en 2026), Campeur 1 207 (1 148 en 2026), Parent 1 125, Fiche médicale 989, registre des médicaments 3 773, Dépôts 1 229, Factures BPA 886 / OPI 336, Paiements BPA 1 381 / OPI 581. **Inscription, Navette, Buanderie et Facture_Items : 0 ligne** au relevé — saison purgée ? (l'automatisation « Annulation » supprime aussi les inscriptions). **À confirmer avec l'équipe** avant de concevoir l'import.

**Problèmes trouvés (à ne pas reproduire)**
- Campeur ≈ 175 champs, surtout des lookups : les données de santé sont recopiées partout, impossibles à cloisonner.
- **NAS en clair** (Prestataire, Relevé 24), carte d'assurance maladie, passeports, visas, rapports de premiers soins : à chiffrer et à cloisonner (niveaux bureau / santé / légal).
- Formule `Bracelet` : coquille « Végérarienne » → un enfant végétarien n'a jamais le bracelet vert.
- Capacité d'une semaine : compte aussi les inscriptions **annulées**.
- Rabais écrits en dur dans les formules (famille −25 $, multisemaine −100 $) ; la table Rabais ne fait que les décrire.
- Lignes de facture = copies en texte, sans lien au catalogue ni quantité ; rollup cassé (« Date de fin facture ») qui rend « Prêt pour Stripe » invalide.
- Événements Stripe sans identifiant gardé : un dépôt a déjà été crédité deux fois (bouton de correction).
- Pas de vrai registre des médicaments donnés (texte libre, sans campeur, dose, heure ni auteur) ; « Administré ? » = état du jour.
- Suppressions définitives (annulation, doublons de Prestataire), logique copiée dans plusieurs scripts, échecs récents (annulation, factures BPA, liste d'attente).

**Ce que gestion-camp a déjà et qui servira** : `core.entreprises` (GBPA+, Opikawa), `core.employes` et la grille d'accès par rôle (remplace `Admin_Users`), Rooming (chambres), Animation (groupes), pages publiques avec Worker + Turnstile + jetons (RH, Réservations), courriels par l'API Gmail, intégration QuickBooks Online, chiffrement pgcrypto + Vault (paie RH), copie vers les Drive.

**Softr (relevé dans Studio)**
- **ADMIN** (admin-camptremblant.softr.app, à intégrer à gestion-camp) : 45 pages en 3 dossiers (Gestion, Facturation, Médicaments), 19 formulaires ; comptes = `Admin_Users`, code par courriel, domaine camptremblant.com, groupes Direction / Coordo / Anim. **Les groupes ne cachent que le menu** : toute page s'ouvre par son adresse pour tout compte connecté (modifier et supprimer compris), et les pages Médicaments et plusieurs formulaires sont réglées « visibles sans connexion » (Studio a des changements non publiés : à vérifier sur la version en ligne). Aucune logique dans Softr : des champs déclenchent les automatisations Airtable. 3 copies du formulaire d'inscription qui ne concordent plus.
- **Portail BPA** (app.camptremblant.com) : 38 pages ; comptes = Famille, mot de passe, inscription ouverte. Parcours : compte → campeur → fiche médicale, médicaments, parents, contacts d'urgence, Relevé 24 → inscription une semaine à la fois (âge, places, liste d'attente, activités, jumelage) → navette, buanderie → annulation en texte libre. Prix affichés en texte, code promo non vérifié, **aucun paiement en ligne** (bouton Stripe désactivé : Interac, chèque, comptant), pages d'attente de 10 s pour laisser tourner Airtable.
- **Portail Opikawa** (app.opikawa.com) : même base, deuxième compte possible par famille ; anglais (Weglot), langue de communication, suivi Google Ads/UTM, résidence, nationalité, passeport, visa/AVE (IRCC), preuve d'assurance, plan de voyage (vols, mineur non accompagné), navette YUL, langue d'immersion ; pas d'EXPÉ ni de buanderie, pas de carte d'assurance maladie ; prix en CAD différents.

## À faire pour compléter l'inventaire
1. **Make** : scénarios (courriels, factures Stripe), textes des courriels.
2. **Stripe** : produits, webhooks, comptes (un par compagnie ?).
3. Confirmer avec l'équipe : où sont les inscriptions 2026 (0 ligne), quel historique garder, Relevé 24.

---

# Inventaire A — base Airtable « Inscriptions Camp de vacances » (appTMCcPD9vlzuoyj)

Périmètre : 12 tables (famille, campeur, parents, fiches de santé, voyage, messagerie). Structure seulement : aucun enregistrement n'a été lu.
La base compte 44 tables au total ; les autres (Inscription, Semaine, Programme, Dépôts, Facture BPA / OPI, Buanderie, Navette, Groupe, Intervention, Rapport de premiers soins, Exception, Activité_Extra, Extra, Annulations_Inscription…) sont seulement nommées ici quand une de mes tables y est liée.

Légende : **(1)** = lien « un seul enregistrement » (`prefersSingleRecordLink`), **(N)** = plusieurs. Airtable ne donne pas la fonction d'agrégation des rollups par l'API (SUM, COUNTA… inconnue) : je donne la source seulement.

Ce qui revient partout :
- `ID_xxx = RECORD_ID()` dans presque chaque table : identifiant Airtable recopié en texte (pour Softr / automatisations). En Supabase : la clé primaire suffit.
- Champs « softr » : formules qui ne font que reformater une valeur pour l'affichage dans le portail Softr (Autre → texte libre, date en ISO, titre fixe…).
- « État de la fiche … » (liste `À valider | ✔️ | Pas remplie encore`) sur chaque fiche : étape du parcours d'inscription du portail, recombinée dans `Campeur.Progression de l'inscription`.
- Lookups en cascade (Parent → Famille → Campeur) : les coordonnées des parents sont recopiées deux fois.
- BPA / OPI : deux marques (Base de Plein Air = GBPA+, Opikawa), déduites de l'adresse du compte famille.

---

## 1. Famille (tbldOmSW4gDgWsbT2)

**Rôle** : le compte du portail (un compte = une famille qui se connecte à Softr) ; regroupe campeurs, parents et fiches, porte le rabais famille, le client Stripe, les relances courriel et le suivi marketing.
**Clé primaire** : `Email du compte famille` (formule = concaténation de l'adresse BPA et de l'adresse OPI). C'est l'identifiant de connexion Softr.
**Vues** : Grid view, Aucun campeur, Aucune inscription, Aucun parent, Importation Google Sheets, OPI, Pré-inscription OPI 2026, Familles créées 8 à 28 derniers jours → flux : relances des comptes incomplets, import depuis Sheets, pré-inscription OPI.

**Liens**
| Champ | Table | Card. |
|---|---|---|
| Campeur | Campeur | 1 famille → N campeurs (côté Campeur : (1)) |
| Parent | Parent | N ↔ N (Parent.Famille en (N)) |
| Fiche_Contact_Urgence | Fiche_Contact_Urgence | 1 → N |
| Fiche_Médicale | Fiche_Médicale | 1 → N (doublon du chemin via Campeur) |
| Prestataire | Prestataire | 1 → N (en pratique 1) |
| Médicament | Médicament | N ↔ N (doublon du chemin via Campeur) |
| Plan de voyage | Plan de voyage | 1 → N |
| Messagerie | Messagerie | N ↔ N |
| Requêtes de modifications | Requêtes de modifications | N ↔ N |
| Inscription, Buanderie, Annulations_Inscription, Ajout Activité_Extra, Exception, Intervention, Dépôt (→ Dépôts), Arrivée_Et_Départ 2 (→ Navette) | hors périmètre | N |

**Saisie**
- Email du compte famille BPA, Email du compte famille OPI (email) — deux colonnes pour un même rôle, une seule remplie selon la marque.
- Responsable du compte (nom), Responsable du compte (téléphone).
- Langue de communication : `Français | Anglais`.
- Acceptation de la politique d'inscription (case).
- stripeCustomerId (texte).
- Pré-inscription OPI 2026, Appel pré-inscription OPI 2026 (cases), Notes pré-inscription OPI 2026 (texte long) — propres à une année.
- Suivi des courriels automatiques (cases + dates) : Relance inscription aucun campeur 48H / 7J (+ Date envoi …), Courriel lancement portail envoyé, Courriel Travel plan + Assurances, Courriel Preflight meeting.
- Marketing (attribution publicitaire) : gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, utm_content.
- Arrivée_Et_Départ, Copie de Arrivée_Et_Départ, Copie de Dépôt BPA (texte) — **obsolètes** (restes d'une conversion en lien : voir `Arrivée_Et_Départ 2` et `Dépôt`).

**Calculés**
- BPA OPI ? : « BPA » si l'adresse BPA est remplie, sinon « OPI ».
- ID_Famille : RECORD_ID().
- Rabais famille (devise) : −25 $ si BPA, plus d'un campeur et tous les dépôts payés ; exclut une adresse interne du camp codée en dur dans la formule.
- Date de création (heure de création).

**Rollups / lookups**
- Nb de campeurs (rollup Campeur.Prénom — en fait un compte), Nb de dépôts payés (rollup Campeur.Depot_paye).
- Lookups Campeur : Pays de résidence, Province de résidence, Nom complet, Buanderie disponible.
- Lookups Parent : Nom complet, Date de naissance, Relation avec l'enfant, Numéro de téléphone (**deux fois** : « à partir de » et « from »), Adresse courriel, Adresse civique, Ville, Province/État, Code postal, Pays, État de la fiche Parent (**deux fois**, l'un suffixé « 2 »).
- État de la fiche de contact d'urgence (**deux fois**, l'un suffixé « 2 »), État de la fiche prestataire.
- **Invalide** : `Disponibilité (from Campeur éligible - ASPI) (from Campeur)` (champ source supprimé) → à jeter.

**Softr** : la clé primaire (courriel de connexion), BPA OPI ?, les lookups d'état de fiches (affichage du parcours).
**Sensible** : coordonnées et date de naissance des parents (en recopie), téléphone du responsable.

---

## 2. Campeur (tblK7jHEEZelZ5O9L)

**Rôle** : l'enfant ; table pivot du portail et des opérations (statut, progression du dossier, éligibilités par programme, soldes, arrivées, fête, âge). Énorme (≈ 175 champs) parce qu'elle recopie à peu près tout le reste pour Softr et les vues.
**Clé primaire** : `Nom complet` (formule Prénom + Nom de famille) — non unique (vue « Doublons »).
**Vues** : Grid view, vue perso d’un membre du personnel, Avec inscription, Aucune inscription, Inscription mais pas de dépôt, Camp de jour, Camp de la relâche, Doublons, Importation Google Sheets, Campeurs confirmé 2026 BPA, Campeurs confirmé 2026 OPI, Produire documents VISA, OPI, Inscription non-confirmée, BPA, Arrivée OPI - Semaine 1, Semaine 1, Validation données, Drapeaux, Dépôt payé sans inscription, Arrivées auto, Campeurs passés 13+, Campeurs futurs 13+, Soldes dûs → flux : relances (pas d'inscription, pas de dépôt), suivi des visas OPI, arrivées par semaine, contrôle qualité des données, recouvrement des soldes, campeurs 13 ans et plus (aspirants / sauveteurs ?).

**Liens**
| Champ | Table | Card. |
|---|---|---|
| Famille | Famille | N → 1 **(1)** |
| Médicament | Médicament | 1 → N |
| Fiche_Médicale | Fiche_Médicale | 1 → N (en pratique 1) |
| Plan de voyage | Plan de voyage | 1 → N (en pratique 1) |
| Preuve d'assurance | Preuve d'assurance | N ↔ N (en pratique 1) |
| Messagerie | Messagerie | N ↔ N |
| Requêtes de modifications | Requêtes de modifications | N ↔ N |
| Inscription | Inscription | 1 → N (une par semaine) |
| Dépôt | Dépôts | 1 → N |
| Facture BPA, Facture OPI | Facture BPA / Facture OPI | 1 → N |
| Buanderie / Buanderie disponible | Buanderie / Buanderie_Disponible | N |
| Arrivée_Et_Départ (→ Navette), Arrivée_Et_Départ_Possible | hors périmètre | N |
| Semaine occupé ; Campeur éligible - Camp de vacances / Camp de jour / EXPÉ / ASPI / Camp de la relâche / SAUVETEUR (6 liens) | Semaine | N ↔ N |
| Programme éligible | Programme | N ↔ N |
| Admissible à l'activité | Activité_Extra | N ↔ N |
| Ajout Activité_Extra, Extra, Exception, Intervention, Registre des visites à l'infirmerie (→ Rapport de premiers soins), Groupe - Semaine 0, Annulations d'inscription | hors périmètre | N |

**Saisie — identité**
- Prénom, Nom de famille, Genre (`Fille | Garçon | Non-binaire`), Date de naissance, Photo (pièce jointe), Documents (pièces jointes), Notes (texte long), Argent de poche (devise).
- Langue maternelle de l'enfant (`Français | Anglais | Espagnol | Autre`) + Autre (Langue maternelle).
- Pays de résidence (209 pays, Canada / États-Unis / Mexique en tête), Province de résidence (13 provinces et territoires), État de résidence (56 États / territoires US).
- Code de conduite, Code de conduite (parent) (cases d'acceptation).

**Saisie — immigration (OPI, campeurs internationaux)** — *sensible*
- Nationalité (208 pays), **Numéro de passeport**.
- Oui/Non : Citoyen ou résidant permanent Canadien, Citoyen ou résidant permanent USA, Visa USA valide, Visa CAN 10 dernières années, Nationalité ETA, Produire documents pour visa.
- Type de visa (`ETA | Visa`), Résultat IRCC (`AVE (Autorisation de voyage électronique) | Visa | Aucun document`), Visa obtenu (case).

**Saisie — automatisations / intégrations**
- stripeInvoiceId, Documint-Campeur (texte : génération de documents Documint).
- Relance inscription aucune semaine 48H / 7J (+ dates), Rappel dépôt 48H / 7J (+ dates), Courriel J-7 (cases).
- Importé dans Pré-inscription 2026 (case : propre à une année).
- **Obsolètes** : Archive Annulations d'inscription, Copie de Arrivée_Et_Départ, Copie de Dépôt BPA (texte : restes de conversions).

**Calculés**
- Nom complet, ID_Campeur (RECORD_ID).
- naissance softr (date en AAAA-MM-JJ), Langue maternelle softr (Autre → texte libre) — Softr.
- Statut de résidence : vide / International (hors Canada) / Québécois / Canadien.
- Médicament Oui/Non : a au moins un médicament lié.
- État des médicaments : ✔️ si pas de médicament annoncé, sinon ✔️ si une fiche médicament est validée.
- Statut du campeur : Annulé (facture BPA ou OPI annulée) / Confirmé (dépôt payé) / Dépôt à payer.
- Statut de présence : « Présent » si les statuts des semaines contiennent Arrivée et Départ, sinon la liste.
- Buanderie oui/non : a une fiche buanderie.
- Rabais multisemaine : −100 $ par semaine CDV/EXPÉ au-delà de la première (résultat **texte**, pas nombre).
- **Progression de l'inscription** : compte les étapes validées (✔️) — médicaments, fiche médicale, parent, contact d'urgence, prestataire, inscription, dépôt ; + plan de voyage et preuve d'assurance si OPI et hors Québec → « ✅ 7/7 complétées » ou « 🛠️ n/7 » (9 pour OPI hors Québec). Logique métier importante.
- État global de l'inscription : Complète / Incomplète (relit le texte de la progression).
- Entente de paiement : celle de la facture OPI, sinon BPA.
- Solde facture : solde de la facture OPI s'il y en a une, sinon BPA.
- Montant payé dépôt pour Facture : montant Stripe ÷ 100 (centimes → dollars).
- Dépôt payé SOFTR : recopie de Depot_paye (Softr).
- Fête : « 🎉 Fête » le jour de l'anniversaire (heure de Toronto). Âge : années révolues.
- Date de création Campeur.

**Rollups (source Inscription, agrégation non visible)**
- Nb de semaines, Nombre de semaines CDV et EXPÉ (deux sur Inscription.Date_creation, filtres différents probablement), Nb d'inscriptions Confirmées (Statut de l'inscription), Date arrivée (début de semaine, min probable), Date de départ (fin de semaine, max probable).

**Lookups — recopies d'autres tables** (à ne pas reprendre en colonnes)
- De Famille : BPA OPI ? (**deux fois** : « BPA OPI ? » et « BPA OPI ? (from Famille) »), Email du compte famille BPA, Email du compte famille OPI, Email du compte, Responsable du compte (nom), Responsable du compte (téléphone) (**deux fois**, l'un suffixé « 2 »), Langue de communication, Rabais famille, ID_Famille, StripeCustomerId, Parent (à partir de Famille).
- De Parent via Famille (lookup de lookup) : Nom complet, Adresse courriel, Numéro de téléphone (**deux fois**), Adresse civique, Ville, Province/État, Code postal, Pays, Date de naissance, Relation avec l'enfant.
- États des fiches via Famille : prestataire, parent, contact d'urgence.
- De Médicament : Nom, Heure d'administration (`Déjeuner | Dîner | Souper | Heure du coucher | Au besoin | Autre`), Autre (heure), Posologie, Raison, Forme softr, Mon enfant prend ses médicaments (`Seul | Avec de l'aide`), Réfrigéré (Oui/Non), Autres infos, État de la fiche de médicament.
- De Fiche_Médicale : **Numéro de la carte d'assurance maladie**, Date d'expiration, Allergie Oui/Non, Allergies, Epipen, Diète (+ Détails diète Autre, Diète affichage), Vaccins, Conditions (+ Autres), Autorisation médicaments libre service, État de la fiche médicale, Médicaments (case « Ajouter un médicament ? »).
- De Inscription : Semaine_Confirmé, Semaine (from Inscription), Semaine (à partir de Inscription) (**trois lookups du même champ** Inscription.Semaine), Programmation, Programme (from …) et Programme (à partir de …) (**deux fois**), Statut de l'inscription, Langue du groupe (`Français | Anglais`), Statut de présence (from Semaine), État de l'inscription, Activité_Extra.
- De Dépôts : stripeCheckoutUrl, Montant payé, Depot_paye, Date_paiement_depot, Dépôt payé avant le 1 février (rabais hâtif ?).
- De Facture BPA / OPI : Annulée, Entente de paiement (BPA : `Cash | Chèque | Gratuité | Cédule de paiement différente` ; OPI : `Cash | Chèque | Cédule de paiement | Gratuité` — **listes différentes pour la même notion**), Solde facture, Solde facture pour envoi courriel.
- Divers : Type (Arrivée_Et_Départ_Possible), Moment d'arrivée ou de départ (Navette), État des fiches buanderie / plan de voyage / preuve d'assurance.
- **Invalides** (source supprimée) : `ID_Semaine (à partir de Semaine) (à partir de Inscription)`, `Arrivée_Et_Départ_Possible (à partir de Arrivée_Et_Départ)`.

**Softr** : naissance softr, Langue maternelle softr, Dépôt payé SOFTR, Forme softr (lookup), Progression / État global (affichage du parcours), Email du compte (filtre « mes campeurs » par courriel du compte), stripeCheckoutUrl (bouton de paiement).
**Sensible** : passeport, statut d'immigration et visas ; carte d'assurance maladie, allergies, conditions, vaccins, médicaments (recopiés ici depuis les fiches → la confidentialité de la fiche médicale est contournée par ces lookups) ; photo ; date de naissance ; liens Intervention et Rapport de premiers soins.

---

## 3. Parent (tbln7GpbzhjY2TPQ1)

**Rôle** : un parent ou tuteur d'une famille (coordonnées, consentement SMS).
**Clé primaire** : `Nom complet` (formule Prénom + Nom de famille).
**Vues** : Grid view, Importation Google Sheets.
**Liens** : Famille (N ↔ N, en pratique N parents → 1 famille) ; Prestataire et Prestataire 2 (N : le parent désigné comme prestataire 1 ou 2 du relevé 24).

**Saisie** : Prénom, Nom de famille, Date de naissance, Relation avec l'enfant (`Père | Mère | Autre | Tuteur Légal`), Adresse courriel, Numéro de téléphone, Acceptation SMS (case), Adresse civique, Ville, Province/État, Code postal / Zip code, Pays (textes libres, pas de liste — contrairement au Campeur), Ajouter un autre parent (case : déclencheur de formulaire Softr), État de la fiche Parent (liste à un seul choix `✔️`).
**Calculés** : Nom complet, ID_Parent, Date de création. Lookup : BPA OPI ? (from Famille).
**Obsolète** : Map TEST (texte).
**Softr** : « Ajouter un autre parent » (bouton de boucle du formulaire), État de la fiche.
**Sensible** : coordonnées personnelles, date de naissance.

---

## 4. Fiche_Contact_Urgence (tblgq63f5TR7GV8yl)

**Rôle** : contact d'urgence de la famille (autre que les parents).
**Clé primaire** : `ID_Contact_Urgence` (RECORD_ID).
**Vues** : Grid view.
**Liens** : Famille **(1)** — donc N contacts par famille.
**Saisie** : Prénom, Nom de famille, Relation avec l'enfant (texte libre ici, liste chez Parent), Adresse courriel, Numéro de téléphone, Adresse civique, Ville, Province/État, Pays, Code postal / Zip code, État de la fiche (`À valider | ✔️ | Pas encore remplie` — libellé différent des autres fiches), Souhaitez-vous ajouter un contact d'urgence ? (`Oui, je veux ajouter un contact | Non, passer cette étape`), Ajouter un autre contact d'urgence? (case).
**Calculés** : Nom complet, ID.
**Softr** : les deux questions « ajouter » (navigation du formulaire) ; la réponse « Non, passer cette étape » crée une fiche vide pour valider l'étape.
**Sensible** : coordonnées.

---

## 5. Prestataire (tblwVpvufow991aDG)

**Rôle** : qui reçoit le **Relevé 24** (frais de garde, Québec) : un ou deux prestataires, avec NAS et répartition en %.
**Clé primaire** : `ID_Prestataire` (RECORD_ID).
**Vues** : Grid view.
**Liens** : Famille **(1)** ; Parent (N) = prestataire 1 choisi parmi les parents ; Parent 2 (N) = prestataire 2.
**Saisie** : Prénom 1 / 2, Nom de famille 1 / 2 (si le prestataire n'est pas un parent saisi), **Numéro d'assurance social / 2**, % Prestataire 1 / 2 (nombres), Diviser en 2 prestataires ? (case), Nombre de prestataires (`Produire un seul Relevé 24 | Produire deux Relevés 24 et diviser le montant des frais de garde | Ne pas produire de relevé 24 pour mon enfant`), État de la fiche prestataire (`✔️ | Pas remplie encore`).
**Calculés** : Nom complet 1 / 2 ; Nom du prestataire 1 / 2 (le parent lié s'il y en a un, sinon le nom saisi) ; NAS caché / NAS caché 2 (« *** *** » + 3 derniers chiffres, ou « NAS invalide ») ; Affichage softr (caractère invisible si la fiche est remplie) ; Date_creation_prestataire.
**Doublons** : « Diviser en 2 prestataires ? » et « Nombre de prestataires » disent la même chose.
**Softr** : NAS caché (affichage masqué dans le portail), Affichage softr.
**Sensible — très** : NAS en clair dans une colonne texte (le masquage n'est qu'une formule d'affichage).

---

## 6. Fiche_Médicale (tbljSkyVUUKYYnKDx)

**Rôle** : questionnaire de santé du campeur (assurance maladie, allergies, diète, vaccins, conditions, autorisation de médicaments en vente libre) ; donne la couleur du bracelet.
**Clé primaire** : `ID_Fiche_Médicale` (RECORD_ID).
**Vues** : Grid view, vue perso d’un membre du personnel.
**Liens** : Campeur **(1)** ; Famille **(1)** (redondant : déductible du campeur).
**Saisie**
- **Numéro de la carte d'assurance maladie du campeur** (texte), Date d'expiration (texte « MM/YYYY », pas une date).
- Allergie Oui/Non (**choix multiple** Oui | Non — devrait être un booléen), Allergies (texte long), Epipen (`Oui | Non`).
- Diète (`Régulière (Aucune restriction) | Végétarienne | Sans porc | Sans lactose | Sans gluten | Autre`) + Détails diète Autre.
- Vaccins (multi : `Covid 19 | Tétanos | Rougeole | Rubéole | Oreillons | Polio | DcaT | Aucun vaccin`).
- Conditions (multi : `Aucune condition | Asthme | Blessure, maladie, intervention chirurgicale | Épilepsie | Hyperactivité | Migraines | Somnambulsime [sic] | Troubles du comportement | Autres conditions`) + Autres (conditions).
- Autorisation d'administrer des médicaments libre service (`Oui | Non`).
- Ajouter un médicament ? (case : ouvre l'étape Médicament du portail ; sert à `État des médicaments`).
- État de la fiche médicale (`À valider | ✔️ | Pas remplie encore`).

**Calculés**
- Diète affichage : « Régulière » au lieu du libellé long.
- **Bracelet** : Rouge (Epipen) > Vert (végétarienne) > Jaune (sans lactose) > Bleu (sans porc) > Noir (autre) > rien (régulière). **Bogue** : cherche « Végérarienne » (coquille) → un végétarien n'a jamais le vert et tombe sur « Noir » ; « Sans gluten » donne aussi Noir.
- Softr titre (texte fixe « Fiche médicale »), ID.

**Lien avec l'app actuelle** : les diètes recoupent celles de Cuisine (`groupes_repas.vege`, `sans_porc`, `sans_lactose`, `sans_gluten`) et ses participants avec allergies.
**Sensible — très** : tout (assurance maladie, santé, allergies). Accès à restreindre fortement (infirmerie / direction).

---

## 7. Médicament (tblmB8JhfikWdLEYo)

**Rôle** : un médicament d'un campeur (posologie, moments de prise) **et** cases « administré ? » qui servent de feuille de distribution du jour (écrasées chaque jour, pas d'historique).
**Clé primaire** : `Nom du médicament`.
**Vues** : Grid view, ZAZU TEST (test).
**Liens** : Campeur **(1)** ; Famille (N, redondant).
**Saisie** : Nom du médicament, Heure d'administration (multi : `Déjeuner | Dîner | Souper | Heure du coucher | Au besoin | Autre`) + Autre (Heure d'administration), Posologie, Raison de la prise, Forme (`Capsule | Liquide | Autre`) + Autre (Forme), Mon enfant prend ses médicaments (`Seul | Avec de l'aide`), Réfrigéré (`Oui | Non`), Autres infos, État de la fiche (`À valider | ✔️ | Pas remplie encore`), Ajouter un autre médicament ? (case Softr), Statut de présence (fixe) (texte : copie figée, probablement par automatisation).
- **Administré ? (Déjeuner / Dîner / Souper / Heure du coucher / Au besoin / Autre)** : 6 cases, état du jour sans date ni auteur.

**Calculés** : ID_Médicament, Heure d'administration softr (liste + texte « Autre » fusionnés), Forme softr.
**Lookups (Campeur)** : Inscription, Statut du campeur, Statut de présence, Famille.
**Sensible — très** : santé.

---

## 8. Registre des médicaments donnés (tblQeMcx4Np06Ac2P)

**Rôle** : journal des médicaments donnés (probablement rempli par automatisation quand une case « Administré ? » est cochée).
**Clé primaire** : `Campeur` — **texte libre**, pas un lien.
**Vues** : Grid view.
**Champs** : Campeur (texte), Nom du médicament (texte), Date de création (heure de création = heure de la prise).
**Problèmes** : aucun lien vers Campeur ni Médicament (copie de noms), pas de dose, de moment (déjeuner…), ni d'auteur (qui l'a donné). Insuffisant comme registre légal de distribution.
**Sensible** : santé.

---

## 9. Preuve d'assurance (tblhupiVj8X0vnN45)

**Rôle** : document d'assurance voyage/maladie d'un campeur international (étape requise pour OPI hors Québec).
**Clé primaire** : `Campeur softr` (formule = nom du campeur lié).
**Vues** : Grid view.
**Liens** : Campeur (N ↔ N, en pratique 1).
**Champs** : Preuve d'assurance (pièces jointes), État de la fiche (`À valider | ✔️ | Pas remplie encore`).
**Sensible** : document d'assurance (numéro de police, identité).

---

## 10. Plan de voyage (tblOqoGmdZ6nYyl4X)

**Rôle** : comment le campeur arrive et repart (voiture ou avion, vols, accompagnateur, mineur non accompagné) ; déclenche la rencontre « preflight ».
**Clé primaire** : `Campeur affichage` (formule = nom du campeur).
**Vues** : Grid view.
**Liens** : Campeur **(1)** ; Famille **(1)** (redondant).
**Saisie**
- Arrivée : Moyen de transport (`En voiture | En avion`), Nom de la personne qui dépose, Relation avec l'enfant, Compagnie aérienne, Numéro de vol, Date et heure d'atterrissage prévue, Correspondance ? (`Oui | Non, il s'agit d'un vol direct`), Accompagnateur vol (`Mon enfant voyagera seul | … « programme pour mineurs non accompagnés » (UM) | Un parent ou un tuteur légal accompagnera mon enfant`).
- Départ : mêmes champs en miroir (personne qui récupère, décollage) **sans** « Correspondance ? », + UM payé ? (`Oui, je vais envoyer une copie du reçu à <adresse OPI> | Non, j'autorise Opikawa à prélever les frais sur ma carte de crédit (jusqu'à 200 $ CAD)`).
- Billets d'avion (pièces jointes), Notes, État de la fiche (`✔️`).

**Calculés** : Envoyer le courriel Preflight (Oui si avion à l'arrivée ou au départ et courriel pas encore envoyé), ID, Date de création.
**Lookups** : Courriel Preflight meeting (Famille), Inscription (Campeur).
**Modèle** : arrivée et départ = deux fois les mêmes colonnes → deux lignes « trajet » (sens = arrivée / départ). Recoupe les tables Navette / Arrivée_Et_Départ_Possible (hors périmètre).
**Sensible** : identité des personnes autorisées à récupérer l'enfant (sécurité), vols.

---

## 11. Requêtes de modifications (tbluKx736greEu0St)

**Rôle** : demande de changement envoyée par une famille depuis le portail (changer de semaine, corriger une fiche…), traitée par le bureau.
**Clé primaire** : `Titre`.
**Vues** : Grid view.
**Liens** : Campeur (N), Inscription (N), Famille (N).
**Champs** : Titre, Description de la requête, Date de création, État de la requête (`Ouverte | Fermée`).
**Manque** : qui a traité, quand, réponse.

---

## 12. Messagerie (tblPqa5cUxjYGtTxv)

**Rôle** : message d'un parent à son enfant pendant le séjour (courrier électronique au campeur, imprimé au camp), avec une adresse de retour.
**Clé primaire** : `Nom du campeur` (formule = campeur lié).
**Vues** : Grid view.
**Liens** : Campeur (N, en pratique 1), Famille (N).
**Champs** : Prénom du campeur, Nom de famille du campeur (texte : **doublon** du lien, sans doute saisi dans un formulaire public avant liaison), Message (texte long), Date de création, Addresse courriel de retour [sic] (texte, pas email).
**Manque** : statut « imprimé / remis ».

---

## Signalements transversaux

**Champs en double**
- Famille : `Numéro de téléphone (from Parent)` et `(à partir de Parent)` ; `État de la fiche Parent` ×2 ; `État de la fiche de contact d'urgence` ×2 ; `Arrivée_Et_Départ` (texte) vs `Arrivée_Et_Départ 2` (lien) ; deux colonnes courriel BPA / OPI.
- Campeur : `BPA OPI ?` ×2 ; `Responsable du compte (téléphone)` ×2 ; trois lookups de `Inscription.Semaine` ; `Programme` ×2 ; `Numéro de téléphone` du parent ×2 ; deux listes « Entente de paiement » BPA / OPI aux choix différents ; deux tables de factures (BPA / OPI).
- Prestataire : « Diviser en 2 prestataires ? » vs « Nombre de prestataires ».
- Messagerie : prénom / nom du campeur saisis en plus du lien.
- Liens Famille redondants sur Fiche_Médicale, Médicament, Plan de voyage (déductibles du campeur).

**Formules / lookups qui recopient des données d'autres tables**
- Campeur recopie toute la fiche médicale, les médicaments, les coordonnées des parents (lookup de lookup), Stripe, les factures, les dépôts.
- Famille recopie les coordonnées des parents et des infos des campeurs.
- Primaires « nom du campeur » des tables Plan de voyage, Preuve d'assurance, Messagerie = formule `{Campeur}`.

**Servent Softr** : tous les `… softr` / `SOFTR`, `Softr titre`, `Affichage softr`, `NAS caché`, les « Ajouter un autre … ? » et « Souhaitez-vous ajouter … » (boucles de formulaire), les `ID_xxx = RECORD_ID()`, la clé `Email du compte famille` (connexion) et `Email du compte` sur Campeur (filtre par utilisateur connecté), les « État de la fiche … » et `Progression de l'inscription` (parcours en étapes).

**Obsolètes probables** : `Map TEST` (Parent), vue `ZAZU TEST` (Médicament), `Copie de Arrivée_Et_Départ`, `Copie de Dépôt BPA` (Famille et Campeur), `Arrivée_Et_Départ` texte (Famille), `Archive Annulations d'inscription` (Campeur), 3 lookups **invalides** (Famille ×1, Campeur ×2), champs liés à une année (`Pré-inscription OPI 2026`, `Appel …`, `Notes … 2026`, `Importé dans Pré-inscription 2026`, vues « … 2026 »), cases `Administré ?` si le registre devient la vraie source.

**Données sensibles à protéger**
- **NAS** (Prestataire, en clair) — chiffrer ou ne garder que ce qui est nécessaire au Relevé 24 ; masquage côté serveur, jamais côté affichage seulement.
- **Carte d'assurance maladie**, allergies, Epipen, conditions, vaccins, diète, médicaments, registre de distribution, liens Intervention / Rapport de premiers soins.
- **Passeport**, nationalité, statut de citoyenneté, visas, résultat IRCC.
- Preuve d'assurance et billets d'avion (pièces jointes), photo de l'enfant, documents.
- Personnes autorisées à déposer / récupérer l'enfant.
- Coordonnées et dates de naissance des parents, contacts d'urgence.
- Identifiants publicitaires (gclid, utm) : pas sensibles en soi mais à séparer des données de l'enfant.

---

## Observations pour le modèle Supabase

**Entités réelles**
1. **famille** (compte) — lien vers le compte d'authentification plutôt qu'un courriel en clé ; `marque` (BPA / OPI) en colonne explicite au lieu de deux colonnes courriel ; langue, responsable, client Stripe, acceptation de la politique (avec date).
2. **parent** (N par famille ; table de liaison seulement si un parent peut appartenir à deux familles — garde partagée ?), consentement SMS daté.
3. **contact_urgence** (N par famille, ou par campeur si on veut préciser).
4. **campeur** (N par famille) — identité, résidence (pays / province / État en codes ISO), langue maternelle.
5. **dossier_immigration** (1 par campeur, OPI) — passeport, nationalité, visas, IRCC ; table séparée à accès restreint.
6. **fiche_medicale** (1 par campeur **et par saison** si on veut la faire revalider chaque été) — diète en liste fermée partagée avec Cuisine ; vaccins et conditions en tableaux de valeurs (enum[]) ou tables de liaison ; allergies ; assurance maladie (chiffrée).
7. **medicament** (N par campeur) — moments de prise en tableau ; **distribution_medicament** (journal : médicament_id, campeur_id, moment, jour, heure, dose, donné_par) qui remplace à la fois les 6 cases `Administré ?` et le « Registre » sans liens. « Donné aujourd'hui ? » devient une requête sur le journal.
8. **prestataire_releve24** (1 par famille et par année fiscale) — 1 ou 2 lignes « bénéficiaire » (parent_id ou nom saisi, NAS chiffré, pourcentage, somme = 100 % vérifiée par contrainte) ; le choix « un / deux / aucun relevé » remplace la case en double.
9. **trajet** (plan de voyage) — une ligne par sens (`arrivee` / `depart`) par campeur et séjour : moyen, personne, relation, compagnie, vol, date-heure, correspondance, accompagnement, UM payé ; billets en stockage privé.
10. **preuve_assurance** — fichier(s) en seau privé, statut de validation.
11. **requete_modification** — avec traité_par, traité_le, réponse.
12. **message_campeur** — campeur_id, texte, courriel de retour, imprimé_le.

**À calculer (vue ou fonction) plutôt que stocker**
- Tous les noms complets, `ID_xxx`, champs « softr », lookups (coordonnées des parents sur le campeur, fiche médicale recopiée, Stripe recopié) → jointures / vues.
- `Statut de résidence`, `Âge`, `Fête`, `Médicament Oui/Non`, `Buanderie oui/non`, `Diète affichage`, `Bracelet` (en corrigeant la coquille « Végérarienne » et en décidant le cas sans gluten), `NAS caché` (fonction côté serveur).
- `Statut du campeur`, `Solde facture`, `Entente de paiement` (une seule table de factures avec une colonne compagnie = `core.entreprises`, une seule liste d'ententes), `Rabais famille`, `Rabais multisemaine` (règles de prix dans une fonction, pas des formules texte).
- `Nb de campeurs`, `Nb de dépôts payés`, `Nb de semaines`, `Date arrivée / départ` → agrégats.
- **Progression de l'inscription / État global** : une vue `progression_dossier(campeur)` qui liste les étapes requises (dont plan de voyage + assurance si OPI hors Québec) et leur état ; le statut de chaque fiche (`a_valider` / `valide` / `non_remplie`) reste une colonne de la fiche, avec qui l'a validée et quand.
- `Envoyer le courriel Preflight` et toutes les cases « relance 48H / 7J / J-7 / courriel envoyé » → une table **envois_courriel** (famille/campeur, modèle, envoyé_le) au lieu de paires case + date par relance.
- Éligibilités (`Campeur éligible - …` ×6, `Programme éligible`, `Admissible à l'activité`, `Buanderie disponible`) : calculables d'après l'âge et les règles du programme → vue ou fonction, pas des liens tenus à la main.
- Attribution marketing (gclid, utm…) : table à part `attribution` (famille_id, source…) saisie à la création du compte.

**Accès (RLS)** : séparer au minimum trois niveaux — bureau des inscriptions (identité, facturation), santé (fiche médicale, médicaments, distribution, interventions : infirmerie + direction), données légales (NAS, passeport : admins). Le portail parent (remplaçant Softr) ne voit que sa famille (`famille.compte_id = auth.uid()`). Ne jamais refaire les recopies de données médicales sur la table campeur : c'est ce qui rend la base actuelle impossible à cloisonner.


---

# Inventaire B — base Airtable « Inscriptions Camp de vacances » (appTMCcPD9vlzuoyj)

Relevé du 2026-10-16, en lecture seule. Portée : les 18 tables Inscription, annulations, catalogue (Programme, Semaine, Programmation), extras (Activité, Buanderie, Navette, Extra), Exception, Chambre, Groupe.
Méthode : `get_table_schema` sur les 18 tables (lu en entier), noms des champs croisés avec `list_tables_for_base`, `list_views_for_table` sur chaque table, enregistrements listés **seulement pour les tables catalogue** (+ `Produits_Stripe`, catalogue des prix, nécessaire pour comprendre le calcul du prix). Aucune donnée personnelle n'est recopiée.

**Constat important** : au 2026-10-16, l'API renvoie **0 enregistrement** dans Inscription, Annulations_Inscription, Archive_Annulation_Inscription, Ajout_Activité_Extra, Buanderie, Navette et Exception, et tous les compteurs (`Nombre d'inscriptions`, `Nb d'inscriptions`, `Nb de buanderies`) valent 0. Les tables transactionnelles ont donc été vidées après l'été 2026 ; le catalogue (été 2026), les groupes (121) et les chambres (43) restent.

Préfixes utilisés plus bas : **[S]** saisie, **[F]** formule, **[L]** lookup / rollup / count, **[→]** lien.

---

## Vue d'ensemble des liens

```
Famille 1─n Campeur 1─n Inscription n─1 Programme
                         │  ├─n─1 Semaine (inscrite)          Semaine n─1 Programme
                         │  ├─n─1 Semaine (liste d'attente)   Semaine n─n Programmation (semaine civile du camp)
                         │  ├─n─n Activité_Extra              Activité_Extra n─n Semaine
                         │  ├─1─n Navette (réservation) ─n─n Arrivée_Et_Départ_Possible n─n Semaine
                         │  ├─n─n Buanderie (réservation) ─n─n Buanderie_Disponible n─n Semaine
                         │  ├─n─1 Groupe  (n─n Semaine, n─n Employé « animateur »)
                         │  ├─n─1 Chambre
                         │  └─n─n Requêtes de modifications
Campeur ─ Annulations_Inscription (Semaine | Activité | Navette | Buanderie) ─ Famille
Campeur ─ Exception (événement daté pour un campeur)    Campeur ─ Extra ─ Produits_Stripe
Semaine / Activité_Extra / Arrivée_Et_Départ_Possible / Buanderie_Disponible / Extra ─n─1 Produits_Stripe (prix)
```

Tous les liens Airtable sont « multiples » sauf mention contraire, même quand le sens est clairement 1 (ex. Inscription → Programme, → Semaine). Dans Supabase : clés étrangères simples.

Deux « entités » (BPA et OPI) traversent toute la base : `BPA OPI ?` sur Programme, Semaine, Activité, Arrivée/Départ, et sur la Famille (lue par lookup). **BPA** = Base de Plein Air (GBPA+), clientèle locale ; **OPI** = Opikawa, clientèle internationale (cours de langue, visites culturelles, prix différents, factures séparées « Facture BPA » / « Facture OPI »).

---

## 1. Inscription (tblOFT5bIV6gG9W2N) — 92 champs

**Rôle** : une ligne = un campeur inscrit à **une** semaine (ou session) d'**un** programme. C'est le pivot : la plupart des champs sont des lookups vers le Campeur (fiche médicale, médicaments, famille) pour fabriquer des listes (présences, feuilles de cuisine, médicaments, Softr).

Vues (18) : Grid view, Destination CAMP, TESTS, Sync Google Sheets, Inscriptions vides, OPI, Confirmées ✅, 7 derniers jours confirmées, CDJ - Semaine 0, Semaine 1 + Session 1, Confirmation Données, Étape d'automatisation, Éligible ASPI 2027, Éligible SAUV 2027, Éligible EXPÉ 2027, Feuilles de présence, CDJ - Semaines 1 à 9, Semaine en cours.

### Liens
| Champ | Vers | Sens |
|---|---|---|
| Campeur | Campeur | n─1 (multi dans Airtable) |
| Famille | Famille | n─1 |
| Programme | Programme | n─1 |
| Semaine | Semaine | n─1 (semaine inscrite) |
| Liste d'attente - Semaine | Semaine (inverse « Liste d'attente ») | n─1 : semaine **demandée en attente** |
| Activité_Extra | Activité_Extra | n─n |
| Arrivée_Et_Départ | Navette (réservations) | 1─n |
| Buanderie | Buanderie (réservations) | n─n |
| Groupe | Groupe | n─1 (single) |
| Chambre | Chambre | n─1 (single) |
| Requêtes de modifications | Requêtes de modifications | 1─n |

### Saisie [S]
- `Langue d'immersion` (Français | Anglais) — choisie par la famille (OPI).
- `Cafétéria` (case), `Taille T-Shirt` (S | M | L | XL), `Demande de jumelage` (texte : avec qui le campeur veut être), `Code promo` (texte libre).
- `État de l'inscription` (✔️ seul choix), `Ajouter une autre semaine` (Oui | Non : question du formulaire Softr).
- `Étape de l'automatisation` (texte, piloté par Make/automatisations) + `Dernière Automatisation` (date de dernière modif. de ce champ).
- `Confirmer une semaine en liste d'attente` (case : action manuelle pour faire passer de l'attente à l'inscription).
- `Doublon ?` (Oui), `Cocher pour annuler cette inscription`, `Cocher pour supprimer cette inscription`, `Email décharge rafting` (cases).
- `Date_creation` (création), `Dernière modification`.

### Formules [F]
- `ID_Inscription` (primaire) = code du programme – « Semaine N » – campeur.
- `ID_d'inscription` = RECORD_ID() ; `ID_Campeur` = nom du campeur.
- `Langue du groupe` : ASPI, SAUVETEUR, EXPÉ → toujours Français ; sinon la `Langue d'immersion` choisie ; sinon la langue maternelle si Français/Anglais ; sinon Français.
- `Année d'été` = année de création, +1 si créée en octobre ou après (saison d'inscription oct.→sept., nommée par l'été visé).
- `Avertissement d'annulation` : message si le délai d'annulation de la semaine et/ou des activités est passé (lit `Annulable` de Semaine et d'Activité_Extra).
- **`Statut de l'inscription`** (voir § cycle de vie).

### Lookups [L] (aucune donnée stockée ici)
- Campeur : prénom, nom, âge, date de naissance, genre, photo, langue maternelle, pays de résidence, nationalité (listes de ~209 pays), argent de poche, `Entente de paiement`, `Statut du campeur`, `Depot_paye (from Dépôt)`, `Solde facture`, `Facture BPA`, `Facture OPI`.
- Santé (via Campeur → Fiche_Médicale / Médicament) : allergies, conditions (Aucune | Asthme | Blessure… | Épilepsie | Hyperactivité | Migraines | Somnambulisme | Troubles du comportement | Autres), Epipen, médicament oui/non, nom/posologie/heure d'administration (Déjeuner | Dîner | Souper | Heure du coucher | Au besoin | Autre), diète (Régulière | Végétarienne | Sans lactose | Sans porc | Sans gluten | Autre) + détails, état des fiches médicale et médicament (À valider | ✔️ | Pas remplie encore).
- Famille : `BPA OPI ?`, courriel du compte, responsable (nom, téléphone ×2), langue de communication, courriel parent.
- Programme : code, nom. Semaine : `Programmation`, `Annulable`, dates début/fin, `Statut de présence`, `Semaine affichage softr`, `Produit_Stripe` (+ rollup texte).
- Activités : nom, `Annulable`. Navette : moment, statut (+ rollup texte). Buanderie : créneau choisi (×2, + rollup texte). Groupe : animateur.

---

## 2. Cycle de vie d'une inscription

`Statut de l'inscription` (formule, évaluée dans cet ordre) :
1. `Cocher pour annuler cette inscription` coché → **Annulée**
2. `Doublon ?` = Oui → **Doublon**
3. `Liste d'attente - Semaine` non vide → **Liste d'attente**
4. `Depot_paye (from Dépôt) (from Campeur)` ≠ « ✔️ » → **Dépôt à payer**
5. sinon → **Confirmée**

Étapes déduites :
1. **Création** par la famille dans le portail **Softr** (champs « softr », « Semaine affichage softr », question « Ajouter une autre semaine ? »). Si la semaine est complète, l'inscription est liée à `Liste d'attente - Semaine` au lieu de `Semaine`.
2. **Dépôt** : table `Dépôts` (hors périmètre B) par campeur, payé par lien Stripe Checkout (`stripeCheckoutUrl`, `stripeSessionId`, `Statut`, `Montant dépôt`, `Montant payé`, `Depot_paye` ✔️ ; rappels 48 h et 7 j sur le Campeur ; drapeau « payé avant le 1er février »). Le dépôt est **par campeur, pas par inscription** : un seul dépôt confirme toutes ses inscriptions.
3. **Confirmée** quand le dépôt est payé. `Étape de l'automatisation` + `Dernière Automatisation` tracent l'avancement des scénarios Make (courriels, création des factures Stripe).
4. **Facturation** : factures **BPA** et **OPI** séparées (tables `Facture BPA` / `Facture OPI`, `Facture_Items`, `Paiement BPA/OPI`, hors périmètre B) ; `Solde facture` et `Entente de paiement` remontent sur l'inscription par le Campeur.
5. **Avant le séjour** : fiches médicale et médicament à valider, groupe, chambre, T-shirt, jumelage, décharge rafting, navette, buanderie.
6. **Pendant** : `Statut de présence` (Arrivée / Présent / Départ, calculé sur la date du jour) pour les feuilles de présence ; `Exception` pour les événements datés.
7. **Fin** : annulation éventuelle (cocher) ; l'inscription n'est jamais supprimée par formule (case « supprimer » = automatisation). Après la saison, les tables sont vidées (constat du 2026-10-16).

Pas de champ de paiement directement sur l'Inscription : tout passe par Campeur → Dépôt / Facture.

---

## 3. Calcul du prix

**Aucune formule de prix dans Inscription.** Le prix vient de `Produits_Stripe` (catalogue Stripe, 2 prix par produit : `Prix unitaire BPA` et `Prix unitaire OPI`, IDs produit/prix Stripe distincts par entité, `Catégorie` Camp | Service | Extra | Merch | Discount, `Taxable`, `Actif ?`, case `Envoyer à Stripe`).

Chaque élément réservable pointe vers **un** produit :
- `Semaine.Produit_Stripe` (single) → « Semaine Camp de vacances », « Session ASPI », etc.
- `Activité_Extra.Produits_Stripe` → « Rafting », « Cascades d'eau », visites…
- `Arrivée_Et_Départ_Possible.Produits_Stripe` → « Navette ».
- `Buanderie_Disponible.Produits_Stripe` → « Buanderie » (et un `Prix unitaire` propre : 25 $).
- `Extra.Produits_Stripe` → extras ponctuels attribués à un campeur (merch, location de sac de couchage, arrivée hâtive…).

Les automatisations (Make) assemblent la facture : une ligne `Facture_Items` (Item, Prix unitaire, Taxable, stripeInvoiceItemId) par semaine, activité, navette, buanderie et extra, au prix BPA ou OPI selon `BPA OPI ?` de la famille. Rabais : produits négatifs (« Multisemaines » −100 $, « Rabais référencement » −100 $ OPI, « Rabais forfait camp de jour été complet » −631 $, rabais proratés), table `Rabais` et table `Code promo` (montant ou pourcentage, semaines applicables, période, BPA/OPI) ; sur l'inscription, `Code promo` n'est qu'un texte saisi. Le dépôt est retranché à la facture (`Montant payé dépôt pour Facture` sur le Campeur). `Pénalité d'annulation` (43,49 $ OPI) existe comme produit.

Prix 2026 (Produits_Stripe, $ ; « — » = pas offert) :

| Produit | Catégorie | BPA | OPI |
|---|---|---|---|
| Semaine Camp de vacances | Camp | 1 049 | 1 355 |
| Semaine Camp de jour | Camp | 239 | 410 |
| Semaine EXPÉ | Camp | 1 069 | — |
| Session ASPI (3 sem.) | Camp | 2 129 | 2 375 |
| Session SAUVETEUR (3 sem.) | Camp | 2 529 | — |
| Semaine Camp de la relâche | Camp | 799 | — |
| Rafting | Service | 129 | 170 |
| Cascades d'eau | Service | 95 | 130 |
| Navette | Service | 49 | 100 |
| Buanderie | Service | 25 | 0 |
| Semaine de cours de français / d'anglais | Service | — | 205 |
| Visite culturelle Montréal / Ottawa | Service | — | 225 |
| Visite culturelle Québec | Service | — | 415 |
| Journée à La Ronde | Service | — | 250 |
| Navette hors-dimanche, Arrivée hâtive, Départ tardif | Extra | — | 100 / 95 / 95 |
| Location sac de couchage | Extra | 30 | 30 |
| Cours de langue à la carte | Extra | — | 205 |
| Merch (chandail 30, coton-ouaté 55, Nalgene 25, collant 3, Crocs charm 5, merch Destination CAMP 100) | Merch/Extra | | |

---

## 4. Capacité et places restantes

Sur **Semaine** (une ligne = une semaine d'un programme) :
- `Nombre d'inscriptions` [count] = nombre d'inscriptions liées par `Inscription` (**toutes**, quel que soit le statut : une inscription annulée ou en doublon compte tant qu'elle reste liée).
- `Nombre maximum d'inscriptions` [S] (vide = illimité ; **−1 = fermée** : `AND(-1, n >= -1)` est vrai → « Complète »). `Modif nb inscription max` = date de dernière modif. du maximum.
- `Disponibilité` [F] : date de début passée → **Passé** ; maximum posé et atteint → **Complète** ; une liste d'attente existe → **Disponible pour liste d'attente** ; sinon **Places disponibles**.
- `Liste d'attente` [→ Inscription] : inscriptions en attente pour la semaine. Le passage attente → inscrit se fait à la main (`Confirmer une semaine en liste d'attente`) puis par automatisation.
- Éligibilité : `Campeur éligible - <programme>` (6 liens vers Campeur : Camp de vacances, Camp de jour, EXPÉ, ASPI, Camp de la relâche, SAUVETEUR) et `Campeur occupé` (campeurs déjà pris cette semaine-là), recalculés par automatisation quand on coche `Recalculer l'éligibilité et les campeurs occupés pour cette semaine`. Ce sont des **listes précalculées pour Softr** (filtrer les semaines proposées à un enfant selon l'âge de `Programme.Âge minimum/maximum` et sans chevauchement).
- Rien n'est calculé au niveau du Programme ni par groupe d'âge ou genre.

Maximums 2026 relevés : Camp de jour S7 = 36, S9 = 25 ; EXPÉ S4, S6, S7 = 12 (S1, S2, S3, S5, S8 = −1, donc fermées) ; ASPI sessions = 10 ; SAUVETEUR = 15 ; Relâche = 10 ; Camp de vacances : aucun maximum.

Activités : `Nb d'inscriptions` (rollup), `Ouverte ?` (non si `Cocher pour fermer l'activité` ou après le début de la semaine) — pas de maximum. Buanderie : `Nb de buanderies` (rollup), `Ouverte ?` jusqu'à 6 jours avant. Navette : `Ouvert ?` jusqu'à 6 jours avant.

---

## 5. Annulations

Trois mécanismes :
1. **Case sur l'inscription** `Cocher pour annuler cette inscription` → statut Annulée (et `Cocher pour annuler cette navette` sur une navette). Geste de l'équipe.
2. **Demande de la famille : `Annulations_Inscription`** (tblTyNu76w4s6ZTO1, 15 champs, vue Grid view). Une demande = `Type d'annulation` (Semaine | Activité | Navette | Buanderie) + liens Campeur, Famille et l'élément visé (`Semaine`, `Activité_Extra`, `Buanderie` → Buanderie_Disponible, `Navette` → Arrivée_Et_Départ_Possible), `Texte de demande d'annulation`, `État de la demande` (En attente | Acceptée | Refusée), `Date de l'envoie de la demande` (création), `Bypass annulable` (case : l'équipe passe outre le délai). Lookups : `BPA OPI ?` (Famille), Parent. Formules : `Campeur softr`, `ID_Annulation_Inscription`. Créée depuis Softr ; traitée par automatisation (retire les liens, ajuste la facture, pénalité éventuelle).
3. **Archive : `Archive_Annulation_Inscription`** (tbl9hykXsl9aceuP5, 8 champs, vue Grid view) : copie **à plat, en texte** d'une demande traitée (`Type d'annulation`, `Campeur`, `Items annulés`, `Motif d'annulation`, `État de la demande`, `Date de l'annulation`) ; les champs texte `Archive Annulations d'inscription` (Activité_Extra) et `Archive_Annulation_Inscription` (Buanderie_Disponible) servent au même archivage. L'archive survit à la suppression des liens.

**Délais (formules `Annulable`)** :
- Semaine : « Oui » jusqu'à **28 jours** avant la date de début.
- Activité extra : jusqu'à **7 jours** avant le début de la semaine (via Programmation).
- Buanderie : jusqu'à **7 jours** avant la date de la buanderie.
- Navette : tant qu'il reste **plus de 7 jours** avant la date.
L'inscription affiche `Avertissement d'annulation` quand l'un de ces délais est passé.

---

## 6. Catalogue

### 6.1 Programme (tblxNqAHQaIBhFXAF) — 11 champs, vue Grid view
**Rôle** : les produits de camp. [S] `Nom du programme` (primaire), `Code de programme`, `BPA OPI ?` (multi BPA | OPI), `Âge minimum`, `Âge maximum`, `Actif ?`, `Buanderie incluse`. [→] `Semaine` (1─n), `Inscription` (1─n), `Campeur éligible` (n─n, précalculé). [F] `ID_Programme`.

| Programme | Code | Entités | Âges | Actif | Buanderie incluse | Semaines 2026 |
|---|---|---|---|---|---|---|
| Camp de vacances | CDV | BPA, OPI | 6–17 | oui | non | 8 semaines du dim. au dim., 28/06 → 23/08 |
| Camp de jour | CDJ | BPA, OPI | 5–12 | oui | non | Semaine 0 (22–26/06) + 9 semaines lun.–ven., 29/06 → 28/08 |
| EXPÉ | EXP | BPA | 13–16 | oui | non | 8 semaines, 28/06 → 23/08 |
| ASPI | ASP | BPA, OPI | 16–17 | oui | oui | Session 1 (28/06–19/07), Session 2 (26/07–16/08) |
| SAUVETEUR | SAU | BPA | 15–17 | oui | oui | Session 1 (19/07–09/08) |
| Camp de la relâche | CDR | BPA | 7–16 | non | non | Semaine Relâche (01–06/03/2026) |

(ASPI = aspirant-moniteur ; SAUVETEUR = formation sauveteur ; EXPÉ = expédition ; tous trois imposent le groupe en français.)

### 6.2 Semaine (tblk07SNhHNe1Q26J) — 50 champs, vue Grid view ; 30 lignes
**Rôle** : une **offre datée d'un programme** (Semaine N ou Session N). C'est l'unité inscrite et facturée.
- [S] `Programme` (single), `Semaine ou session ?` (Semaine | Session) et `Week or session ?` (Week | Session), `Numéro de semaine / session` (texte : 0…9, « Relâche »), `BPA OPI ?`, `Date de début`, `Date de fin` (date-heure, America/Toronto), `Nombre maximum d'inscriptions`, `Recalculer…` (case), `Facture_Items` (texte).
- [→] `Programmation` (n─n : semaines civiles couvertes ; une session ASPI en couvre 3), `Inscription`, `Liste d'attente`, `Activité_Extra`, `Arrivée_Et_Départ_Possible`, `Buanderie` / `Buanderie_Disponible` (avant) / `Copie de Buanderie_Disponible` (après), `Groupe`, `Produit_Stripe` (single), `Code promo`, `Annulations d'inscription`, 6 × `Campeur éligible - …`, `Campeur occupé`.
- [F] `Semaine affichage softr` (primaire : « Semaine 3 : 12/07/2026 - 19/07/2026 ») et version anglaise, `Session`, `Session eng`, `ID_Session` (code-numéro), `Statut de présence` (Arrivée / Présent / Départ selon aujourd'hui), `Annulable` (28 j), `Disponibilité`, `Couleur du programme` (CDV orange, EXPÉ bleu, ASPI vert, CDJ violet, autres gris), `id`.
- [L] `Nombre d'inscriptions` (count), `Inscription_Confirmée`, `Campeur (from Inscription)`, `Campeur_Confirmé`, `Programme (from Inscription)`, nom et code du programme, campeurs des annulations, `Date de début (from Programmation)`, `Date_modification`.

### 6.3 Programmation (tblpLTByay5F9dHNB) — 8 champs, vue Grid view ; 10 lignes
**Rôle** : le **calendrier civil commun** du camp : une ligne par semaine de l'été (Semaine 0 à 9), qui regroupe les « Semaine » de tous les programmes qui la chevauchent (CDV S3, CDJ S3, EXPÉ S3, ASPI Session 1…). Sert à aligner activités, buanderie, groupes et présences tous programmes confondus.
[S] `Numéros de la semaine` (0–9), `Date de début`, `Date de fin` (dates). [F] `Programmation` = « Semaine N : début - fin ». [→] `Semaine` (n─n). [L] inscriptions confirmées, activités, campeurs confirmés.
2026 : S0 22–26/06, S1 28/06–05/07, S2 05–12/07, S3 12–19/07, S4 19–26/07, S5 26/07–02/08, S6 02–09/08, S7 09–16/08, S8 16–23/08, S9 24–28/08.

### 6.4 Activité_Extra (tblSS30ZmWpSV2dAj) — 20 champs, vue Grid view ; 41 lignes
**Rôle** : sortie ou service optionnel payant, rattaché à une ou deux Semaines (même semaine civile en CDV et CDJ).
[S] `Nom activité` (+ eng), `Date de l'activité`, `BPA OPI ?`, `Cocher pour fermer l'activité`, `Lien de la décharge` (URL), `Archive Annulations d'inscription` (texte). [→] `Semaine`, `Inscription`, `Ajout Activité_Extra`, `Annulations d'inscription`, `Admissible à l'activité` (Campeur, précalculé), `Animateur` (Employé), `Produits_Stripe`. [F] `ID_Activité`, `Annulable` (7 j), `Ouverte ?`. [L] `Date de début (from Programmation)`, `Nb d'inscriptions`.
Offre 2026 : **Rafting** (S1–S8, BPA+OPI, CDV), **Cascade d'eau** (S1–S8, BPA+OPI, CDV + CDJ), et pour OPI seulement : **Cours de français** (S1–S8), **Cours d'anglais** (S1–S8), **La Ronde** (S1, S5), **Ottawa** (S2, S5, S8), **Ville de Québec** (S3, S6), **Montréal** (S4, S7).

### 6.5 Ajout_Activité_Extra (tblQftknWQENuBJyr) — 9 champs, vue Grid view
**Rôle** : demande d'ajout d'activités **après** l'inscription (depuis Softr), qui déclenche un lien de paiement Stripe. [→] `Campeur`, `Famille`, `Activité_Extra`. [S] `Envoyer un lien stripe`, `Ajout d'activité extra? (case)`. [F] `Campeur affichage`. [L] factures BPA/OPI du campeur. `Date de création`.

### 6.6 Extra (tblPT6zE8svI6j70F) — 5 champs, vue Grid view
**Rôle** : produit ponctuel facturé à un campeur (merch, location, arrivée hâtive, rabais manuel…). [→] `Campeur`, `Produits_Stripe`. [S] `Date`. [F] `Extra` = nom du produit. [L] nom du produit. (Lignes personnelles : non listées.)

---

## 7. Buanderie

- **Buanderie_Disponible** (tblK2YSuaw3wqdwZC, 20 champs, vue Grid view ; 7 lignes) = **créneaux de lavage offerts entre deux semaines consécutives** pour les campeurs qui restent plusieurs semaines (le dimanche du changement : 05/07, 12/07, 19/07, 26/07, 02/08, 09/08, 16/08/2026). [→] `Semaine avant la buanderie` (single), `Semaine après la buanderie` (single), `Semaine` (n─n), `Admissible à la buanderie` (Campeur, précalculé), `Buanderie sélectionné` (réservations), `Annulations_Inscription`, `Produits_Stripe`. [S] `Prix unitaire` (25 $), `Facture_Items`, `Archive_Annulation_Inscription`. [F] `Buanderie disponible` (« Entre Semaine 1 et Semaine 2 : 05/07/2026 ») + eng, `Annulable` (7 j), `Ouverte ?` (6 j). [L] dates (rollups), `Nb de buanderies`.
- **Buanderie** (tblAgQOBAxGzhFaiv, 16 champs ; vues Grid view, Validation données) = **réservation** d'un campeur. [→] `Campeur`, `Famille`, `Inscription`, `Buanderie sélectionné` (créneaux). [S] `État de la fiche de buanderie` (✔️), `Ajout buanderie ? (case)`. [F] `Campeur affichage`, `ID_Campeur`, `ID_Buanderie`. [L] genre, âge, statut, `BPA OPI ?` du campeur, libellé du créneau.
- **« Buanderie ? »** (tblOCWUpeePay8pVq, 2 champs, vue Grid view) = **table utilitaire** : `recordID` + `Ajout buanderie ?` (Oui | Non). Sert vraisemblablement de source de liste déroulante / question oui-non dans un formulaire Softr. Rien à reprendre comme table.
- ASPI et SAUVETEUR ont la buanderie incluse (`Programme.Buanderie incluse`).

## 8. Navette

- **Arrivée_Et_Départ_Possible** (tblGBtxeWtkd7lREO, 14 champs ; vues Grid view, Grid 2 ; 16 lignes) = **trajets offerts** : une arrivée et un départ par semaine (S1 à S8, toujours le dimanche), BPA seulement en 2026. [S] `Type` (texte « Arrivée » / « Départ »), `BPA OPI ?` (BPA | OPI). [→] `Semaine` (CDV + EXPÉ de la même semaine, + ASPI/SAUV quand la session commence ou finit), `Campeur`, `Arrivée_Et_Départ` (réservations), `Annulations_Inscription`, `Produits_Stripe` (« Navette », 49 $ BPA). [F] `Arrivé et départ possible` (« Semaine 3 : Arrivée le dimanche 12 juillet ») + eng, `Date` (MM/DD/YYYY, texte), `Annulable` (> 7 j), `Ouvert ?` (> 6 j). [L] dates de la Semaine.
- **Navette** (tblMcC6tqMNiDVp4E, 15 champs ; vues Grid view, Arrivée avion semaine 1 OPI, Confirmation Données) = **réservation** d'un trajet par un campeur. [→] `Campeur`, `Famille`, `Inscription` (single), `Moment d'arrivée ou de départ`. [S] `Cocher pour annuler cette navette`, `Ajout navette ? (case)`. [F] `Statut de la navette` (Annulée si cochée ou campeur annulé, sinon le statut du campeur : Confirmé | Dépôt à payer | Annulée), `ID_Navette`, `Campeur affichage`. [L] statut et `BPA OPI ?` du campeur, `Annulable`, libellé du trajet. Dates de création et de modification.
- **« Navette ? »** (tblrqyFonehngdZSR, 2 champs) = table utilitaire oui/non, comme « Buanderie ? ».
- Les arrivées en avion (OPI) ont leur vue ; le `Plan de voyage` (hors périmètre B) porte les vols.

## 9. Exception (tblOqQ62rU7dT8Tfk) — 10 champs, vue Grid view
**Rôle** : **événement ponctuel daté pour un campeur** à signaler à l'équipe (arrivée tardive, départ hâtif, rendez-vous, cueillette par un tiers…), suivi comme une petite liste de tâches. [→] `Campeur`, `Famille`. [S] `Date` (date-heure), `Description`, `Compléter` (✔️ Complète | ❌ Incomplète). [F] `Proximité de la date` (⚫ Terminé, 🟢 Aujourd'hui, 🔵 Demain, 🔷 Dans N jours, 🟣 Plus tard), `Ordre/trie` (1–11), `Filtre` (Aujourd'hui / Demain / Moins d'une semaine), `Campeur affichage`. [L] statut du campeur.

## 10. Groupe (tbllSgEkbABJnL1tV) — 10 champs ; vues Grid view, Semaine 1 à Semaine 9 ; 121 lignes
**Rôle** : groupe d'animation d'une semaine, avec son animateur. [S] `Nom du groupe` (numéro : centaine = semaine, ex. 201–218 en S2 ; « CDJ - 2A » pour le camp de jour ; « ASPI 1 », « Sauvetage », « 4EXPÉ »), `Groupe d'âge` (Dynamo | Ados), `Langue du groupe` (Français | Anglais). [→] `Animateur` (Employé), `Semaine`, `Inscription`, `Campeur - Semaine 0`. [F] `Nom du groupe complet` = animateur – nom. [L] diète de l'animateur, `Semaine de camp`.
Recoupe le module Animation (Horaire) de l'app : les groupes y existent déjà par semaine.

## 11. Chambre (tblS7E0xUJQgNSmOn) — 2 champs ; vues Grid view, PP, VF ; 43 lignes
**Rôle** : chambre où dort le campeur pendant sa semaine. [S] `Nom` ; [→] `Inscription` (1─n). Chambres : CH #1–7, CB #8–12, PB #1–8, PH #9–16 (Pavillon principal ; vue « PP »), VFB #1–6, VFH #7–15 (Vieille-France bas / haut ; vue « VF »). Pas de nombre de lits. Recoupe le module **Rooming** (`rooming.chambres`, codes CH, VFB…).

---

## Observations pour le modèle Supabase

1. **Séparer catalogue et transactions.** Catalogue réutilisable d'une année à l'autre : `programmes` (code, âges, entités, buanderie incluse, actif), `semaines_camp` (= Programmation : semaine civile N, dates, par année), `offres` (= Semaine : programme × semaine(s) civile(s), type semaine/session, dates, maximum, produit), `activites`, `trajets_navette`, `creneaux_buanderie`, `produits` (prix par entité). Transactions : `inscriptions`, `reservations_activite`, `reservations_navette`, `reservations_buanderie`, `extras`, `demandes_annulation`, `exceptions`. Airtable a été vidé après l'été : en base, garder l'historique par `annee` plutôt que purger.
2. **Liens 1─n en vraies clés étrangères** : Inscription → campeur, famille, programme, offre (une seule), groupe, chambre. `programme_id` est redondant avec l'offre : le dériver. La famille aussi (par le campeur).
3. **Statut calculé, jamais stocké en double** : reproduire `Statut de l'inscription` (annulée > doublon > liste d'attente > dépôt à payer > confirmée) dans une vue ou une fonction SQL ; stocker les faits (`annulee_le`, `doublon`, `en_attente`, dépôt payé). La liste d'attente devient un état de l'inscription sur la même offre (`statut_attente` + rang / date), pas un deuxième lien vers Semaine.
4. **Capacité** : compter seulement les inscriptions actives (non annulées, non doublons, pas en attente) — Airtable compte tout ce qui est lié. Remplacer le maximum −1 par une colonne `fermee boolean`. Places restantes = `max - actives` dans une vue ; contrôle de dépassement dans une fonction d'inscription transactionnelle (verrou sur l'offre).
5. **Éligibilité et « campeur occupé »** : ne pas reproduire les 7 liens précalculés ; calculer à la volée (âge du campeur à la date de début entre `age_min` et `age_max`, pas de chevauchement de dates avec une autre inscription active).
6. **Délais d'annulation** (28 j semaine, 7 j activité/buanderie/navette, ouverture 6 j) : en paramètres par type (table de réglages), plus `Bypass annulable` sur la demande. Demande d'annulation = une ligne par élément visé (type + clé étrangère), états `en_attente`/`acceptee`/`refusee` ; l'archive à plat devient inutile si on ne supprime rien (retrait logique `annulee_le`, comme le Calendrier).
7. **Prix** : une table `produits` avec `prix_bpa`, `prix_opi`, `taxable`, `categorie`, IDs Stripe par entité ; chaque élément réservable porte `produit_id`. Copier le prix unitaire sur la ligne de facture au moment de la facturation (les prix changent d'une année à l'autre). Rabais et codes promo : tables dédiées, appliqués par une fonction pure testable (le calcul est aujourd'hui caché dans Make).
8. **BPA / OPI** = deux compagnies du référentiel `core.entreprises` (GBPA+ et Opikawa) : utiliser `entreprise_id` (ou un tableau pour les offres ouvertes aux deux), pas un texte `BPA OPI ?`.
9. **Tables utilitaires** « Buanderie ? » et « Navette ? » : à abandonner (simples booléens de formulaire).
10. **Bilinguisme** : champs `_eng` partout (noms d'activité, libellés de semaine/session, trajets) → colonnes `nom_en` ou libellés générés côté app ; les libellés (« Semaine 3 : 12/07/2026 - 19/07/2026 », « Arrivée le dimanche 12 juillet ») sont des formules d'affichage, à calculer dans l'app.
11. **Dates** : Airtable mélange date-heure (Semaine, Exception) et date (Programmation, Activité) et stocke la date de navette en texte MM/DD/YYYY ; en Postgres : `date` pour les jours, `timestamptz` seulement pour les heures réelles. Le fuseau `America/Toronto` des formules = Montréal.
12. **Année d'été** : saison d'inscription d'octobre à septembre, désignée par l'été visé (créée en oct. 2026 → 2027). C'est l'inverse de la convention Mastertimeline (année où l'exercice commence) et la même que Subventions : choisir explicitement et la documenter.
13. **Données personnelles et de santé** (lookups médicaux, médicaments, allergies, photos, téléphones) : ne pas les dupliquer dans `inscriptions` ; les lire par jointure sur le campeur et sa fiche médicale, sous RLS stricte (module à accès restreint, pas de cache sur l'appareil, comme Feuilles de temps).
14. **Recoupements avec l'app existante** : Groupe ↔ module Animation (Horaire, groupes par semaine et animateurs = `core.employes`) ; Chambre ↔ Rooming (référence des chambres : réutiliser `rooming.chambres` plutôt qu'une 2e liste) ; Employé (animateur) ↔ `core.employes` ; diètes ↔ Cuisine (`groupes_repas`, mêmes diètes standard) ; Exception ↔ éventuellement Calendrier / Réunions.
15. **Automatisations Make** (`Étape de l'automatisation`, cases d'action « Recalculer… », « Envoyer un lien stripe », « Confirmer… », « supprimer ») : à remplacer par des fonctions SQL / routes du Worker explicites et un journal ; inventorier les scénarios Make avant la bascule (logique de facture et de courriels invisible depuis le schéma).
16. **Softr** (portail des familles) lit les champs « softr » et les listes précalculées : le portail parents devra être refait (ou garder Softr branché sur Supabase) — à décider tôt, car il dicte les règles RLS côté familles.


---

# Inventaire C — « Inscriptions Camp de vacances » (appTMCcPD9vlzuoyj)

Facturation, paiements, Stripe, rabais, personnel et infirmerie. Lecture seule. Aucune donnée de famille n'est recopiée ; les catalogues (Produits_Stripe, Rabais, Code promo sans les codes, Logos) ont été lus pour comprendre l'offre.

Sources : `list_tables_for_base` (noms des champs), `get_table_schema` (formules, choix, liens) des 14 tables, `list_views_for_table`. Les tables Famille, Campeur, Inscription et Semaine sont citées seulement par les noms de leurs champs liés (elles sont dans un autre lot).

**Limite** : un rollup Airtable ne donne pas sa fonction d'agrégation (SUM, etc.) par l'API. Les sommes ci-dessous en sont déduites.

---

## Vue d'ensemble

```
Famille ─┬─ Campeur ─┬─ Inscription ─ Semaine ─ Produit_Stripe / Code promo
         │           ├─ Facture BPA ─┬─ Facture_Items (1 ligne = 1 produit facturé)
         │           │               └─ Paiement BPA
         │           ├─ Facture OPI ─┬─ Facture_Items
         │           │               └─ Paiement OPI
         └───────────┴─ Dépôts (Stripe Checkout)
Campeur ─ Intervention / Rapport de premiers soins ─ Employé
```

**Il y a deux compagnies, donc deux facturations.** BPA = Base de Plein Air (GBPA+) et OPI = Opikawa sont deux entités légales. Chacune a son compte Stripe, ses prix, sa numérotation, sa politique de dépôt et sa façon de taxer. D'où une table Facture et une table Paiement par compagnie, avec les mêmes champs à quelques écarts près :

- **Numéros** : `BPA-AA-NNN` et `OPI-AA-NNN` (formule : année sur 2 chiffres + autonumber à 3 chiffres). L'autonumber est propre à chaque table, il ne recommence pas chaque année.
- **Prix** : chaque produit a un prix BPA et un prix OPI (par exemple Semaine Camp de vacances 1049 $ chez BPA et 1355 $ chez OPI).
- **Dépôt non remboursable** : 100 $ chez BPA, 250 $ chez OPI (il est rajouté au solde quand la facture est annulée).
- **Taxes** : BPA sépare le taxable du non taxable et applique les rabais avant les taxes. OPI taxe tout le sous-total.
- **Courriels** : OPI a des vues FR et ENG et lit « Langue de communication » et « Pays de résidence » du campeur (clientèle internationale).
- **Comptes famille** : la famille a un courriel de compte distinct par compagnie (« Email du compte famille BPA / OPI »).

Les deux tables Facture partagent une seule table `Facture_Items` (deux liens : Facture BPA, Facture OPI). Les items sont en partie communs.

L'automatisation passe par **Make** (un champ parle de « l'erreur scénario Make original ») et probablement par des scripts ou webhooks pour Stripe et les courriels. Les cases « Envoyer la facture », « Trigger manuel », « Envoyer à Stripe » et le bouton « Lancer correction Stripe » servent de déclencheurs. Softr sert de portail : un champ s'appelle « Dépôt payé SOFTR » côté Campeur.

---

## 1. Dépôts (tblIgU8kdK5zfilP2) — 26 champs

**Rôle** : le dépôt d'inscription payé en ligne par **Stripe Checkout**, avant la facture. Une ligne par dépôt, rattachée au campeur et à la famille, puis recopiée dans la table Paiement (« Ajouté à la table Paiement »).

**Liens** : Campeur (plusieurs), Famille (plusieurs). Lookups : Facture BPA et Facture OPI (via Campeur), stripeCustomerId (via Famille).

**Saisie / données de Stripe**
- `BPA OPI ?` : liste à choix **BPA / OPI** (compagnie qui encaisse).
- `Montant dépôt` (monnaie), `Montant payé` (nombre entier, probablement le `amount_total` de Stripe, à vérifier : en cents ou en dollars).
- `Statut` (texte libre recopié de Stripe, `"paid"` attendu).
- Identifiants Stripe : `stripeInvoiceId`, `stripeCheckoutUrl`, `stripePaymentIntentId`, `stripeSessionId`.
- `Date paiement dépôt MANUEL` (date).

**Cases de suivi et corrections**
- `Depot_credit_balance` : le dépôt a été porté au **customer balance** Stripe (crédit qui réduit la future facture Stripe).
- `Customer Balance à réduire de 100$ (erreur scénario Make original)`, `Correction Stripe effectuée le` (date) et le bouton `Lancer correction Stripe` : correction ponctuelle d'un double crédit.
- `Dépôt payé avant le 1 février` (case) : sert à une règle de date limite ou de prix hâtif.
- `Ajouté à la table Paiement`, `Pré-inscription OPI 2026`.

**Formules et dates système**
- `ID_Depot` = RECORD_ID().
- `Depot_paye` = ✔️ si Statut = "paid".
- `Date_paiement_depot` = dernière modification de `stripePaymentIntentId` (la date de paiement est déduite du moment où le webhook a écrit l'intent).
- `Dernière modification 2` (sur Statut), `Date de création`.

**Vues** : Grid view, Dépôt payé, Tests, Importation Google Sheets, Importation 2 mars, Destination CAMP.

Côté Campeur, d'autres champs servent au dépôt : « Rappel dépôt 48H / 7J » et leurs dates, « Montant payé dépôt pour Facture », « Dépôt payé SOFTR ». Côté Famille : « Nb de dépôts payés ». Les rappels automatiques sont donc envoyés tant que le dépôt n'est pas payé.

---

## 2. Facture BPA (tblQeiHFuND7Vl89A) — 55 champs

**Rôle** : la facture d'un **campeur**, pas d'une famille (lien Campeur, un seul enregistrement préféré) pour une année. Elle porte les items, les rabais, les taxes, les paiements et le solde, puis est poussée dans Stripe comme Invoice.

**Liens** : Campeur (1), Items facture → Facture_Items, Paiement BPA.

**Lookups via Campeur** : Inscription, Navette (Arrivée_Et_Départ), Buanderie, Activité_Extra, Extra, Famille, StripeCustomerId, et les coordonnées du responsable (courriel du compte BPA, nom, téléphone) pour l'envoi.

**Saisie**
- `Année de la facture` (nombre).
- `Description rabais manuel` et `Rabais manuel` (monnaie, saisi en négatif).
- `Annulée` (case).
- `Description de l'état à revoir` (texte long).
- `Facture PDF` (pièce jointe).
- `Envoyer la facture`, `Facture initiale envoyée`, `Ignorer cette ligne` (cases).
- `Log envoi email` (texte).
- Données de Stripe : `stripeInvoiceId`, `stripeHostedInvoiceUrl`, `stripeInvoicePdfUrl`.

**Listes à choix**
- `Statut facture` : Brouillon / À payer / Finale / Payée.
- `État de la facture` (flux de production) : Brouillon / À générer / Prête à envoyer / Envoyée / À revoir.
- `Statut de la facture` : Fermée / Ouverte.
- `Entente de paiement` : Cash / Chèque / Gratuité / Cédule de paiement différente.

Trois champs de statut se recoupent : c'est une dette de conception.

**Calcul de la facture**
1. Les rollups des items donnent le `Sous-total taxable` et le `Sous-total non-taxable` (somme des `Prix unitaire` ; le filtre taxable / non taxable se fait sans doute dans le rollup) ainsi que le `Rabais multisemaines`.
2. `Rabais famille` = lookup du campeur, qui vient de la formule Famille.Rabais famille (règle : 25 $ dès 2 enfants).
3. `Sous-total taxable après rabais` = taxable + multisemaines + famille + manuel (les rabais sont négatifs).
4. `TPS` = max(0, 5 %) et `TVQ` = max(0, 9,975 %) de ce montant.
5. `Total` = ROUND(non-taxable + taxable après rabais + TPS + TVQ, 2).
6. `Cumul des paiements` = rollup de Paiement BPA (montant signé, voir plus bas).
7. `Solde facture` = 0 si l'entente est « Gratuité ». Sinon Total − paiements, **+100 $ si la facture est annulée** (le dépôt n'est pas remboursé).
8. `Montant à rembourser` = |solde| quand il est négatif (+100 s'il n'y a plus d'items).
9. Formules de présentation pour les courriels : `Solde facture pour envoi courriel` et `Premier paiement 50% pour envoi courriel` (solde ÷ 2, format « 1 234,56 $ »).
10. Autres formules : `Sous-total rabais`, `Sous-total`, `Description rabais multisemaines / famille` (libellés présents seulement si le rabais existe), `Date d'envoi de la facture initiale` (création + 48 h).
11. Champs cassés : `Date de fin facture` est un rollup invalide (champ source supprimé), ce qui rend `Prêt pour Stripe` invalide aussi.

**Dates système** : `Date de création`, `Date Facture PDF`, `Date Facture initiale envoyée`.

**Vues** : Grid view, Facture à générer, Facture à envoyer, À revoir, Solde dû, Remboursement dû, Comptabilité, Année en cours.

---

## 3. Facture OPI (tblErZstPCvJMO2Nw) — 52 champs

Même rôle et même structure que la Facture BPA, avec ces écarts :

- **Numéro** : `OPI-AA-NNN`.
- **Calcul plus simple** : `Sous-total` = rollup de tous les items. Ensuite `Sous-total après rabais` = sous-total + rabais manuel, `TPS` 5 % et `TVQ` 9,975 % **sur tout**, puis `Total`.
  - Pas de rabais famille ni de rabais multisemaines automatiques.
  - Pas de min 0 sur les taxes.
- **Solde** : **+250 $ si la facture est annulée** (dépôt OPI) ; `Montant à rembourser` suit la même logique.
- **Lookups en plus** : `Langue de communication` (Français / Anglais) et `Pays de résidence` (liste complète des pays).
- **Champs en plus** : case `Trigger manuel`, `Dernière modification`.
- **Choix d'Entente de paiement** : Cash / Chèque / **Cédule de paiement** / Gratuité.
- **Statue de la facture** (sic) : Fermée / Ouverte.
- **Même rollup cassé** que BPA : `Date de fin facture`, donc `Prêt pour Stripe` invalide.

**Vues** : Grid view, Facture à générer – FR, Facture à générer – ENG, Facture à envoyer – FR, Facture à envoyer – ENG, À revoir, Remboursement dû, Comptabilité, Année en cours.

---

## 4. Paiement BPA (tblHjN5AUj16BTZ5x) et Paiement OPI (tblblB2DyBHrmVQBF) — 18 champs chacune

**Rôle** : le grand livre des mouvements d'argent d'une facture. On y trouve les paiements Stripe, les paiements hors Stripe (Interac, chèque, comptant), les remboursements et les ajustements. Les dépôts y sont aussi recopiés.

**Liens** : Facture BPA ou Facture OPI (1). Lookups via la facture : Campeur, Famille, StripeCustomerId.

**Saisie**
- `Montant` (monnaie), `Date du paiement`.
- `Référence externe` (n° de chèque, de virement…), `Note interne`.

**Listes à choix**
- `Type d'opération` : Paiement / Remboursement / Ajustement. Chez BPA, un choix parasite « $250,00 » traîne dans la liste.
- `Mode de paiement` : Carte de crédit / Virement Interac / Virement bancaire / Cash / Chèque.

**Formule**
- `Montant pour calcul solde` : +|montant| pour un paiement, −|montant| pour un remboursement, montant tel quel pour un ajustement. C'est ce champ que la facture additionne.

**Synchronisation vers Stripe**
- `Appliquer au Customer Balance` (case).
- `Statut sync Stripe` : À synchroniser / Synchronisé / Erreur.
- `Date sync Stripe`, `stripeBalanceTransactionId`, `Message d'erreur Stripe`.
- Un paiement reçu hors Stripe est donc poussé comme **customer balance transaction**. Le crédit réduit l'Invoice Stripe, et le lien de paiement hébergé reste juste.

**Formules système** : `ID_Paiement` = RECORD_ID(), `Date de création`.

**Vues** : Grid view et une vue personnelle de Maxime, dans les deux tables.

---

## 5. Facture_Items (tblSQvGGaaakqxdmk) — 18 champs

**Rôle** : les lignes de facture. Chaque ligne est une **copie figée** d'un produit : nom FR et EN, prix, taxable. Elle n'est **pas liée** à Produits_Stripe : `Produit_Stripe` est un texte. L'item est poussé comme InvoiceItem Stripe.

**Liens** : Facture BPA et Facture OPI (une seule des deux remplie en pratique). Lookups : Campeur (via BPA et via OPI), Famille.

**Saisie**
- `Item`, `Item eng`, `Produit_Stripe`, `Produit_Stripe eng` (textes).
- `Prix unitaire` (monnaie ; un rabais est saisi en négatif).
- `Taxable` (case).
- `Date finalisation prévue` (date : quand l'Invoice Stripe doit être finalisée, ce qui fixe l'échéance).
- Données de Stripe : `stripeInvoiceId`, `stripeInvoiceItemId`.

**Formules et système**
- `ID_Item_Facture` = « <n° facture> <Item> ».
- `Record ID`, `Autonumber`, `Date de création` (heure de Toronto).

Il n'y a pas de quantité : une ligne par unité.

Côté Semaine et Buanderie_Disponible, un champ texte « Facture_Items » laisse penser qu'un script génère les items à partir des inscriptions : semaine, navette, buanderie, activités extra, extras.

**Vues** : Grid view.

---

## 6. Produits_Stripe (tbl4Uz0qBJCWbPjy3) — 20 champs, 33 produits

**Rôle** : le catalogue de tout ce qui se facture, avec un prix par compagnie et les identifiants Stripe par compagnie.

**Champs**
- `Nom du produit`, `Nom du produit eng`.
- `Catégorie` : Camp / Service / Merch / Transaction / Discount / Extra.
- `Prix unitaire BPA`, `Prix unitaire OPI`.
- `Stripe_ProductID_BPA` et `Stripe_PriceID_BPA` (`prod_…` / `price_…`), et les mêmes pour OPI.
- Cases `Actif ?`, `Taxable`, `Envoyer à Stripe` (déclenche la création du produit et du prix dans Stripe).
- Formules : `Produit` = « Catégorie - Nom » (FR et EN), `ID Produit_Stripe` = RECORD_ID().

**Liens vers ce qui rend le produit achetable**
- Semaine.
- Activité_Extra (par exemple « Semaine N : Rafting »).
- Arrivée_Et_Départ_Possible (navette par jour d'arrivée ou de départ).
- Buanderie_Disponible (entre deux semaines).
- Extra.

**Catalogue observé**
- **Camp** : Semaine Camp de vacances, Semaine EXPÉ, Semaine Camp de jour, Session ASPI, Session SAUVETEUR, Semaine Camp de la relâche (chacun lié à ses semaines ou sessions 2026).
- **Service** : navette, buanderie, rafting, cascades d'eau, visites culturelles (Montréal, Québec, Ottawa), La Ronde, semaines de cours de français et d'anglais. La plupart ont seulement un prix OPI : ce sont des services pour les campeurs internationaux.
- **Merch** : chandail, coton-ouaté, bouteille, collant, breloque.
- **Extra** : arrivée hâtive, départ tardif, navette hors dimanche, location de sac de couchage, cours de langue à la carte, pénalité d'annulation, merch Destination CAMP.
- **Rabais saisis comme produits à prix négatif** : « Multisemaines » (Discount, −100 $), rabais référencement, rabais semaine 7, rabais proraté semaine 7, rabais forfait camp de jour été complet.

**État de l'intégration** : seuls 9 produits BPA (créés en novembre 2025) ont un Product ID et un Price ID Stripe. **Aucun produit OPI n'a d'identifiant Stripe.** Les produits récents n'en ont pas non plus. On en déduit que les InvoiceItems Stripe sont créés avec un montant direct (`amount`) plutôt qu'avec un `price`, du moins pour OPI et pour les ajouts récents.

**Vues** : Grid view.

---

## 7. Rabais (tblz5bsb49IJwFnAG) — 4 champs, 2 lignes

**Rôle** : la documentation des règles de rabais. **Aucun lien** : les montants sont repris en dur dans des formules (Famille.Rabais famille, Campeur.Rabais multisemaine) ou dans le produit « Multisemaines ».

**Champs** : `Rabais` (nom), `Montant`, `Description`, `BPA OPI ?` (BPA / OPI).

**Règles (BPA seulement)**
- **Rabais famille 25 $** : dès 2 enfants ou plus de la même famille, pour tous les programmes.
- **Rabais multisemaines 100 $** : par semaine à partir de la 2ᵉ semaine du même enfant dans le même été, consécutive ou non. Seulement pour Camp de vacances et EXPÉ.

**Vues** : Grid view.

---

## 8. Code promo (tblQC6oFUoyXrQVfp) — 9 champs, 4 lignes

**Rôle** : les codes promotionnels, limités à des semaines et à une période. La famille tape le code à l'inscription : `Inscription.Code promo` est un **texte**, pas un lien. Un script le rapproche du code et ajoute sans doute un item de rabais.

**Champs**
- `Code promo` (texte : le code lui-même, non recopié ici).
- `Montant` (monnaie) **ou** `Pourcentage`.
- `Description`.
- `Semaines applicables` (lien Semaine) et le lookup Programme.
- `Date de début`, `Date de fin` (le début est vide dans les 4 lignes).
- `BPA / OPI` (choix multiples).

**Usages observés (tous BPA, valides jusqu'au 31 août 2026)**
- −10 % sur une session pour les membres d'une fédération partenaire.
- −20 % à l'ajout d'une semaine précise, en deux lignes en double.
- Un « prix » fixe de 239 $ sur des semaines de camp de jour. Le champ `Montant` semble alors servir de **prix de remplacement**, pas de rabais : son sens est ambigu.

**Vues** : Grid view.

---

## 9. Admin_Users (tblffH2HYNHYFGKC5) — 5 champs

**Rôle** : la liste des comptes du personnel autorisés dans l'interface d'administration, sans doute **Softr** : l'utilisateur se connecte par son courriel, et le rôle filtre les pages et les données visibles.

**Champs**
- `Email du compte Admin` (champ primaire).
- `ID_Admin` = RECORD_ID().
- `Prénom`, `Nom de famille`.
- `Rôle` : **Anim / Coordo / Direction**.

Aucun lien vers Employé : les deux listes du personnel sont séparées.

**Vues** : Grid view.

---

## 10. Employé (tbl3BGQzDjAmYnYTO) — 11 champs

**Rôle** : le personnel du camp de vacances (animation, coordination, cuisine), vu sous l'angle opérationnel : groupes, activités, et rôle dans les rapports d'infirmerie et d'intervention.

**Champs**
- `Nom de camp` (champ primaire), `Diète` (texte).
- `État` : Actif / Inactif.
- `Poste` (choix multiples) : Coordo / Animateur / Cuisine.

**Liens**
- Groupe, Activité_Extra.
- Liens inverses : trois vers Rapport de premiers soins (animateur, soignant, témoin) et deux vers Intervention (intervenant, témoin). Ils apparaissent sous les noms « Registre des visites à l'infirmerie 1/2/3 » et « Intervention 1/2 ».

**Vues** : Grid view.

---

## 11. Intervention (tbl5seYMm2v70IuwQ) — 10 champs

**Rôle** : le registre des interventions **comportementales ou psychosociales** auprès d'un campeur (pas médicales).

**Champs**
- `Campeur affichage` (formule = nom du campeur).
- `Date` (date et heure, fuseau de Toronto).
- `Titre`.
- `Situation (Contexte)`, `Intervention (Résumé)`, `Suivi avec le jeune` (textes longs).

**Liens**
- Campeur, Famille.
- `Personne qui a fait l'intervention` → Employé.
- `Témoin` → Employé.

**Vues** : Grid view.

---

## 12. Rapport de premiers soins (tblEzZPkI2KAYO5kR) — 16 champs

**Rôle** : le registre de l'**infirmerie**, une ligne par visite ou blessure. Côté Campeur, le lien s'appelle « Registre des visites à l'infirmerie ». Il complète Fiche_Médicale, Médicament et le « Registre des médicaments donnés », qui sont dans un autre lot.

**Champs**
- `Campeur affichage` (formule), `Campeur` (lien), `Date de naissance` (saisie en double, ce n'est pas un lookup).
- `Date` (date et heure, fuseau de Toronto).
- `Description de la situation`, `Description de la blessure`, `Quel traitements ont été faits?` (textes longs).
- `Photo de la blessure` (pièce jointe).

**Liens vers Employé**
- `Nom de son animateur au moment de la visite`.
- `Personne par qui les traitements ont été administrés`.
- `Témoin`.

**Listes à choix**
- `Prise de médicaments` : Oui / Non, avec `Nom du médicament` et `Posologie du médicament administré` (textes).
- `Suivi nécessaire` : Oui / Non.
- `Lieu de la blessure` : Aquabunga, Terrain de basketball, Terrain de soccer, Plage, Abris survie, Bâtiment, Tag à l'arc, Tir à l'arc, Camping, Lac, Non applicable.

**Vues** : Grid view.

---

## 13. Logos et images (tblABcuYaTAJaaJi6) — 2 champs, 1 ligne

**Rôle** : la banque d'images pour les gabarits (PDF de facture, courriels). Elle contient une seule ligne, le « Logo BPA ».

**Champs** : `Nom de l'imge` (sic), `Image` (pièce jointe).

**Vues** : Grid view.

---

## Intégration Stripe (ce qu'on peut déduire)

### Côté clients

- **Un Customer Stripe par famille** : `Famille.stripeCustomerId`, recopié par lookup vers Campeur, Facture, Paiement et Dépôt.
- Il y a probablement deux comptes Stripe, un par compagnie : les produits et les prix sont doublés par compagnie. Pourtant un seul `stripeCustomerId` existe par famille. Il faut vérifier s'il n'y a qu'un compte Stripe en réalité, ou si l'intégration OPI reste à faire, ce que suggère l'absence d'identifiants OPI.

### Parcours d'une inscription

1. **Dépôt** : une session Stripe Checkout est créée (`stripeSessionId`, `stripeCheckoutUrl`, envoyée à la famille avec des rappels à 48 h et à 7 jours).
2. Un **webhook** (`checkout.session.completed` ou `payment_intent.succeeded`) écrit `stripePaymentIntentId`, `Statut` = "paid" et `Montant payé`.
3. Le dépôt est porté en **crédit au customer balance** (`Depot_credit_balance`).
4. Il est recopié comme ligne de Paiement (`Ajouté à la table Paiement`).
5. **Facture** : une Invoice Stripe est créée (`stripeInvoiceId`), puis un InvoiceItem par ligne de Facture_Items (`stripeInvoiceItemId`). Elle est finalisée à la `Date finalisation prévue`.
6. Stripe renvoie le lien de paiement hébergé (`stripeHostedInvoiceUrl`) et le PDF (`stripeInvoicePdfUrl`). Un PDF maison est aussi joint (`Facture PDF`).
7. L'envoi par courriel est suivi par `Log envoi email`. Les vues FR et ENG d'OPI servent à l'envoi.
8. **Paiements hors Stripe** : chaque paiement est poussé comme customer balance transaction (`stripeBalanceTransactionId`, statut de synchro et message d'erreur).
9. **Webhooks qu'on peut déduire** :
   - `checkout.session.completed` pour les dépôts ;
   - `invoice.paid` / `invoice.payment_succeeded`, qui créent sans doute une ligne de Paiement « Carte de crédit » ;
   - peut-être `charge.refunded` pour les remboursements.

   Aucun champ ne stocke d'identifiant d'événement : rien ne garantit qu'un webhook ne soit pas traité deux fois.
10. **Corrections** : le champ « erreur scénario Make original » montre qu'un scénario Make a crédité deux fois le dépôt (100 $). Il a fallu le corriger à la main, d'où le bouton « Lancer correction Stripe ».

## Échéancier de versements

Rien n'est modélisé comme un vrai échéancier : il n'y a pas de table d'échéances. On ne trouve que :

- `Premier paiement 50% pour envoi courriel` (solde ÷ 2) : une règle implicite « 50 % maintenant, le reste plus tard », annoncée dans le courriel ;
- `Entente de paiement` : la valeur « Cédule de paiement (différente) » marque les cas négociés à la main, suivis hors base ;
- `Date d'envoi de la facture initiale` (création + 48 h) et `Date finalisation prévue` (sur l'item) : elles fixent la date à laquelle l'Invoice Stripe devient due ;
- `Dépôt payé avant le 1 février` : une date butoir qui joue sur un avantage (prix hâtif ou priorité).

---

## Observations pour le modèle Supabase

### Compagnies, numérotation, taxes

1. **Compagnies** : remplacer les deux paires Facture BPA / OPI et Paiement BPA / OPI par **une table `factures` et une table `paiements` avec `entreprise_id` → `core.entreprises`** (GBPA+ = BPA, Opikawa = OPI). Les écarts entre compagnies deviennent des **réglages par compagnie** (préfixe du numéro, montant du dépôt non remboursable 100 / 250, règle de taxes, rabais permis) dans une table de paramètres, et non des tables en double.
2. **Numérotation** : une séquence par (compagnie, année), posée par la base (`BPA-26-001`). Les autonumbers Airtable ne recommencent pas chaque année.
3. **Taxes** : stocker TPS et TVQ **par ligne** (taxable oui / non) et figer les taux sur la facture. Unifier la règle « rabais avant taxes » : BPA et OPI diffèrent aujourd'hui, et OPI taxe aussi les éléments non taxables.

### Lignes, catalogue, rabais

4. **Lignes de facture** : `facture_lignes` avec `produit_id` (lien réel vers le catalogue) **et** la copie figée du libellé FR/EN, du prix et de « taxable ». Ajouter une `quantite`. Les rabais deviennent des lignes négatives typées (`genre = rabais`, avec la règle d'origine), au lieu de trois mécanismes : produits négatifs, rollups et champs manuels.
5. **Catalogue** : `produits` (catégorie, FR/EN, taxable, actif) et `produit_prix` (produit × compagnie × saison, identifiants Stripe Product et Price par compagnie). Les liens vers les semaines, activités, navettes et buanderies sont gérés par les tables d'offre du module Inscriptions.
6. **Rabais et codes promo** : une table de règles réellement utilisée par le calcul (famille, multisemaines, référencement), au lieu de la table descriptive actuelle et de montants en dur.
   - Codes promo : `code` unique (insensible à la casse), `pourcentage` **ou** `montant` (contrainte : un seul des deux), et un **genre distinct pour « prix de remplacement »**.
   - Portée : semaines, compagnie, dates. L'inscription garde un lien vers le code appliqué, pas un texte.
   - Supprimer les doublons.

### Paiements, dépôts, échéancier

7. **Solde** : calculé par une vue ou une fonction (total − Σ montants signés), jamais stocké. Paiement / remboursement / ajustement en `genre`, montant toujours positif avec signe déduit, ou montant signé avec contrainte.
   - Le « +dépôt si annulée » doit devenir une ligne explicite de **pénalité d'annulation** (le produit existe déjà), pas une formule cachée.
8. **Dépôts** : une forme de paiement (`paiements.genre = depot`, `stripe_checkout_session_id`, `stripe_payment_intent_id`). Ils ne doivent pas faire une table qu'on recopie à la main dans Paiement : la case « Ajouté à la table Paiement » disparaît. Les rappels à 48 h et 7 jours passent par un cron, comme les autres modules (Worker / pg_cron).
9. **Échéancier** : créer une vraie table `echeances` (facture, date, montant ou pourcentage, statut), avec un gabarit par défaut par compagnie (dépôt, 50 %, solde à une date fixe avant le camp) et un échéancier sur mesure pour les « cédules différentes ».

### Stripe et QuickBooks Online

10. **Stripe** :
    - Fonction Edge ou Worker qui reçoit les webhooks avec **vérification de signature**, et table `stripe_evenements` (id d'événement unique) pour l'**idempotence**.
    - Clés secrètes par compagnie (Cloudflare / secrets Supabase), jamais dans la base.
    - Garder les identifiants Stripe en colonnes (`stripe_customer_id` par famille **et par compagnie** si deux comptes Stripe, `stripe_invoice_id`, `stripe_invoice_item_id`, `hosted_invoice_url`, `stripe_balance_transaction_id`).
    - Remplacer les cases déclencheurs (« Envoyer la facture », « Trigger manuel », « Envoyer à Stripe ») par des actions explicites (RPC) qui laissent une trace dans un journal.
11. **QuickBooks Online** (déjà intégré à l'app cible) :
    - Les factures et paiements de chaque compagnie doivent se rendre dans **le QBO de cette compagnie**. Prévoir `qbo_id` et un statut de synchro sur factures et paiements, sur le modèle de « Statut sync Stripe ».
    - Correspondance produit → article QBO et compte de revenus, par compagnie.
    - Décider qui fait foi : Stripe encaisse, l'app facture, QBO comptabilise. La vue « Comptabilité » d'Airtable montre le besoin d'un export ou d'une synchro.
12. **Statuts** : ramener les trois champs de statut à un seul `statut` (brouillon → émise → payée / annulée), plus un `etat_envoi` si on en a besoin. Le reste se calcule : solde dû, remboursement dû, à revoir avec une note.

### Infirmerie, personnel, accès

13. **Infirmerie et interventions : données de santé**, donc confidentielles.
    - Un schéma à part, ou des tables du module Inscriptions avec une RLS stricte : direction et responsables santé seulement, jamais le rôle `terrain` par défaut.
    - Photos de blessures dans un seau **privé** à adresses signées (comme Mastertimeline et les documents de Véhicules), jamais gardées sur l'appareil.
    - Journal d'auteur posé par la base.
    - « Lieu de la blessure » devient une liste du module (« Aquabunga » = Aquabounga, compagnie du référentiel).
    - La date de naissance est lue depuis le campeur, pas saisie en double.
14. **Personnel** :
    - `Employé` correspond à `core.employes` (le « Nom de camp » = `surnom`, déjà la convention). Poste, diète, groupe et activités deviennent des affectations par saison.
    - Les liens « intervenant / soignant / témoin » pointent vers `core.employes`.
    - `Admin_Users` (rôles Anim / Coordo / Direction de Softr) disparaît : les comptes sont `core.profils`, et l'accès passe par la grille `core.acces_roles` (direction / coordo / terrain).
15. **Bilinguisme** : libellés FR/EN pour les produits et les courriels, et langue de communication de la famille (OPI : clientèle internationale, pays de résidence).
16. **Logos** : seau public par compagnie, ou colonne logo sur `core.entreprises`, plutôt qu'une table d'images.


---

# Inventaire D — Base Airtable « Inscriptions Camp de vacances » (appTMCcPD9vlzuoyj)

Relevé du 2026-10-16, en lecture seule (aucune automatisation testée ni modifiée). Aucune donnée personnelle n'est recopiée ; les adresses des webhooks Make, qui servent de jetons d'accès, sont **masquées**.

---

## 1. Automatisations

41 automatisations : **24 actives** (déployées) et **17 inactives** (brouillons jamais publiés ou retirés). Sauf mention contraire, les actions sont des **scripts Airtable** (JavaScript). Aucune automatisation n'a d'écart entre le brouillon et la version publiée, sauf « Générations des items de facture OPI ENG » (l'ordre des étapes diffère, voir 1.2).

### 1.1 Tableau

| # | Nom | État | Déclencheur | Action principale | Externe |
|---|---|---|---|---|---|
| 1 | Traitement d'une nouvelle inscription | inactive | Inscription : « Étape de l'automatisation » contient « Campeur occupé » | 5 scripts en chaîne : doublon → campeur occupé → navette → buanderie → activités | — |
| 2 | Buanderie | inactive | Inscription : étape = « Buanderie » | moments de buanderie possibles ; crée les fiches Buanderie (OPI) ; étape → « Admissibilité aux activités » | — |
| 3 | Navette | inactive | Inscription : étape = « Navette » | arrivée/départ du séjour ; étape → « Buanderie » | — |
| 4 | Admissible aux activités | inactive | Inscription : étape contient « Admissibilité aux activités » | ajoute le campeur aux Activité_Extra de ses semaines ; étape → « Code promo » | — |
| 5 | Code promo | inactive | Inscription : étape contient « Code promo » et code saisi | valide le code, crée une ligne de rabais dans Facture_Items | — |
| 6 | Facture - Créer facture à la création d'une inscription | inactive | Inscription créée | crée une Facture BPA ou OPI « Ouverte / À générer » si le campeur n'en a pas d'ouverte | — |
| 7 | Liste d'attente → Inscription confirmée | **active** | Inscription : case « Confirmer une semaine en liste d'attente » | déplace les semaines de la liste d'attente vers Semaine ; étape → « Campeur occupé » | — |
| 8 | Annulation | **active** | Inscription : case d'annulation cochée | efface Buanderie et Navette liées, retire « Campeur occupé », archive, **supprime l'inscription** | — |
| 9 | Mettre Médicaments, Fiche médicale et Contact d'urgence à « À valider » | **active** | Planifiée, chaque année le 1er novembre à 0 h (America/Toronto) | remet l'état des 3 fiches à « À valider » | — |
| 10 | Supprimer si 2 fiches Prestataire pour la même famille | **active** | Prestataire créé | supprime les anciennes fiches Prestataire de la famille | — |
| 11 | Supprimer un contact d'urgence | **active** | Fiche_Contact_Urgence créée | supprime la fiche fictive « Aucun contact d'urgence » de la famille | — |
| 12 | Arrivée et Départ du camp | **active** | Semaine créée | crée ou complète les options Arrivée/Départ (Arrivée_Et_Départ_Possible) | — |
| 13 | Éligibilité à une semaine | **active** | Campeur créé | calcule l'âge au début de chaque semaine et l'ajoute à « Campeur éligible - <programme> » | — |
| 14 | Éligibilité (changement de date de naissance) | **active** | Campeur : date de naissance modifiée | même calcul, ajoute **et retire** | — |
| 15 | Update de l'éligibilité à une semaine | **active** | Planifiée, chaque année le 1er novembre | recalcule tous les campeurs × toutes les semaines | — |
| 16 | Update de l'éligibilité (âge min/max changé) | **active** | Programme : âge min ou max modifié | recalcule tout | — |
| 17 | Éligibilité (ajout d'une semaine) | **active** | Semaine : case « Recalculer l'éligibilité et les campeurs occupés » | éligibilité pour cette semaine, puis décoche | — |
| 18 | Campeur occupé (ajout d'une semaine) | **active** | même case sur Semaine | calcule les campeurs déjà inscrits sur une période qui chevauche | — |
| 19 | Association de l'activité à une inscription | **active** | Ajout_Activité_Extra créé | relie les activités à l'inscription de la bonne semaine (lue dans le nom « Semaine N ») | — |
| 20 | Association d'une navette à une inscription | **active** | Navette créée | supprime le doublon (campeur + moment) sinon relie à l'inscription | — |
| 21 | Association d'une buanderie à une inscription | **active** | Buanderie créée | relie à l'inscription dont la semaine a les mêmes dates | — |
| 22 | Envoi nouvelle famille à MAKE | **active** | Famille : courriel non vide | POST vers un webhook Make (un pour BPA, un pour OPI sans valeur X) | **Make** |
| 23 | Envoi nouveau campeur à MAKE | inactive | Campeur : champ X non vide | POST webhook Make (BPA / OPI) | Make |
| 24 | Envoi email ADMIN demande d'annulation | inactive | Annulations_Inscription : statut = (choix « à traiter ») | **courriel Airtable** au bureau BPA ou OPI | courriel Airtable |
| 25 | BPA - Envoi nouveau paiement à MAKE | inactive | Paiement BPA : case + type + champ vide | POST webhook Make | Make |
| 26 | OPI - Envoi nouveau paiement à MAKE | inactive | Paiement OPI : idem | POST webhook Make | Make |
| 27 | Ajouter Paiement Dépôt à Paiement | **active** | Dépôts : statut = « paid », montant non vide, pas encore traité | **action Airtable** « créer un enregistrement » : Paiement BPA ou OPI « Dépôt Stripe », puis coche « traité » | (Stripe, en amont) |
| 28 | BPA - Envoi nouvelle facture PDF à MAKE | inactive | Facture BPA : PDF présent + case | POST webhook Make | Make |
| 29 | OPI - Envoi nouvelle facture PDF à MAKE | inactive | Facture OPI : idem | POST webhook Make | Make |
| 30 | Mets la facture à « À générer » BPA | **active** | Facture BPA modifiée (5 champs surveillés, vue filtrée) | action « mettre à jour » : état → À générer | — |
| 31 | Mets la facture à « À générer » OPI | **active** | Facture OPI : idem | idem | — |
| 32 | Générations des items de facture BPA | **active** | Facture BPA entre dans une vue | 6 scripts + mise à jour de l'état (voir 1.2) | — |
| 33 | Générations des items de facture OPI FR | **active** | Facture OPI entre dans une vue (FR) | idem | — |
| 34 | Générations des items de facture OPI ENG | **active** | Facture OPI entre dans une vue (ENG) | idem (ordre différent dans la version publiée) | — |
| 35 | Annuler une facture BPA | inactive | Facture BPA : case « annulée » | coche l'annulation de toutes les inscriptions du campeur (ce qui déclenche #8) | — |
| 36 | Annuler une facture OPI | inactive | Facture OPI : idem | idem | — |
| 37 | OPI - Travel plan + Assurances OPI envoi MAKE | inactive | Famille OPI : 2 champs remplis, case décochée, choix absent | POST webhook Make (avec la langue de communication) | Make |
| 38 | OPI - Envoi nouveau Travel plan avion à MAKE | inactive | Plan de voyage : champ = « Oui » | POST webhook Make | Make |
| 39 | OPI + BPA - J-7 envoi MAKE | inactive | Campeur : arrivée dans une semaine, solde > 0, rappel pas envoyé | POST webhook Make (BPA / OPI) | Make |
| 40 | Reset quotidien (présence, médicament) | **active** | Planifiée, chaque jour à 0 h 15 (America/Toronto) | Médicament : fige la présence du jour dans un vrai champ texte (**pour forcer la synchro Softr**) et décoche les cases « Administré ? » | **Softr** (indirect) |
| 41 | Ajouter une entrée au registre des médicaments donnés | **active** | Médicament modifié (6 cases « Administré ? », dans une vue) | crée une ligne dans « Registre des médicaments donnés » | — |

> Les scripts Buanderie, Navette et Admissibilité existent à la fois seuls (#2–#4) et recopiés dans la chaîne #1.

### 1.2 Détail

**Pipeline d'inscription (machine à états `Étape de l'automatisation`)**
Le champ d'une sélection simple sur Inscription (`fld1vJifTqVl5rBSG`) fait avancer l'inscription d'étape en étape : *Campeur occupé → Navette → Buanderie → Admissibilité aux activités → Code promo*. Chaque étape est une automatisation « l'enregistrement correspond aux conditions » qui fait son travail puis écrit l'étape suivante. **Toutes ces étapes (#1–#5) sont inactives** aujourd'hui ; seule #7 (liste d'attente) écrit encore « Campeur occupé ». Ce que fait chaque étape :
- *Doublon* : si le campeur a déjà une inscription dont la semaine chevauche (des semaines consécutives sont permises), **la nouvelle inscription est supprimée**.
- *Campeur occupé* : ajoute le campeur au lien « Campeur occupé » de toutes les semaines/sessions qui chevauchent (sert à cacher dans Softr les semaines où il est déjà pris). Ignore les inscriptions en liste d'attente.
- *Navette* : regroupe les semaines consécutives (écart de 7 jours, programmes EXPÉ, ASPI, Camp de vacances, SAUVETEUR) en séjours, retire le campeur de toutes les lignes Arrivée_Et_Départ_Possible, puis l'ajoute à l'Arrivée du premier jour et au Départ du dernier.
- *Buanderie* : une « session » est découpée en ses semaines simples ; deux semaines qui se touchent (EXPÉ→CDV ou CDV→CDV) donnent un moment de buanderie (Buanderie_Disponible) ; pour un campeur **OPI**, la fiche Buanderie est créée d'office (« ✔️ »).
- *Admissibilité aux activités* : programmes « Camp de vacances » et « Camp de jour » seulement ; ajoute le campeur à « Admissible à l'activité » des Activité_Extra de ses semaines.
- *Code promo* (#5) : vérifie la période du code (contre `Date_creation` de l'inscription) et les semaines applicables, calcule le rabais (pourcentage × prix BPA ou OPI du produit Stripe de la semaine, sinon montant fixe), crée un Facture_Items « Code promo : … ». Attention : #5 écrit un **montant positif**, alors que la génération de facture (#32–34) écrit **−montant**.

**Annulation (#8, active)** : déclenchée par une case de l'Inscription (`fldoaCFzHMallVYWq`). Le script lit la case « Cocher pour supprimer cette inscription » (le schéma contient aussi « Cocher pour annuler cette inscription ») ; il supprime les fiches Buanderie et Navette liées, retire le campeur de « Campeur occupé » sur les semaines qui chevauchent, écrit une ligne dans Archive_Annulation_Inscription (campeur en texte, « Type d'annulation » = Semaine, items annulés, « Acceptée »), puis **supprime l'inscription**. Les activités extra sont seulement notées dans l'archive. Les annulations par la famille passent par la table Annulations_Inscription (demande), et le courriel au bureau (#24) est inactif.

**Éligibilité (#13–#18)** : l'éligibilité est **matérialisée** dans des liens « Campeur éligible - <Nom du programme> » sur Semaine (un champ par programme, trouvés dynamiquement par leur nom) et « Campeur éligible » sur Programme. Âge = âge au début de la semaine, comparé à Âge minimum / Âge maximum du programme. Les versions « recalcule tout » parcourent tous les campeurs × toutes les semaines (lourd) ; la version planifiée tourne une fois par an (1er novembre). Seule la version « changement de date de naissance » retire un campeur devenu inéligible ; les autres ne font qu'ajouter (fusion avec l'existant sur Programme).

**Facturation (#27, #30–#34, actives)**
- Une Facture BPA ou OPI par campeur (et par année : champ « Année de la facture », statut Ouverte/Fermée). La création automatique (#6) est inactive : les factures sont donc créées ailleurs (Softr/Make ou à la main).
- #30/#31 : toute modification de 5 champs (inscriptions, navettes, buanderies, extras, code promo, d'après les scripts) remet l'état à « À générer », ce qui fait entrer la facture dans la vue de génération.
- #32/#33/#34 : 1) supprime tous les Facture_Items liés ; 2) une ligne par semaine (prix BPA ou OPI du Produits_Stripe de la semaine, « Taxable ») et par activité extra ; 3) une ligne par navette (produit Stripe du moment d'arrivée/départ) ; 4) une ligne par buanderie ; 5) une ligne par Extra (sac de couchage, etc., produit Stripe lié) ; 6) code promo (validé par période, BPA/OPI, semaine ; ligne négative « Rabais / Discount », sans doublon) ; 7) l'état passe à « généré ». Les items portent un libellé FR et ENG. Le prix est **figé** dans Facture_Items au moment de la génération. La version ENG publiée fait l'étape « code promo » **après** la mise à jour de l'état (le brouillon l'a remise avant).
- #27 : un dépôt Stripe payé (table Dépôts, statut « paid ») devient un Paiement BPA ou OPI « Dépôt Stripe » ; 3 branches selon que le dépôt vise une facture BPA ou OPI, et pour OPI selon une case qui change le champ de montant lu (montant converti ?), puis coche « traité ».
- L'envoi des factures PDF (#28/#29), des paiements (#25/#26) et l'annulation de facture (#35/#36) vers Make sont **inactifs**.

**Santé (#9, #40, #41, actives)** : chaque 1er novembre, toutes les fiches Médicament, Fiche_Médicale et Fiche_Contact_Urgence repassent à « À valider » (les familles doivent les revalider chaque année). Chaque nuit, la présence du jour est figée et les cases « Administré ? » (Déjeuner, Dîner, Souper, Coucher, Au besoin, Autre) sont décochées. Chaque case cochée ajoute une ligne au registre (campeur et médicament **en texte**, pas de lien, pas d'heure ni d'auteur explicites hormis la date de création).

**Courriels** : une seule automatisation de courriel Airtable (#24, inactive) : « Demande d'annulation à traiter : <campeur> », envoyée à l'adresse générique des inscriptions BPA (domaine camptremblant.com) ou à celle des messages d'Opikawa (domaine opikawa.com), avec le campeur, ce qu'il veut annuler, la date de la demande et le courriel du compte Famille. Tous les autres envois (accueil famille, rappels, J-7, plans de voyage, factures PDF) passent par **Make** (le texte des courriels est dans Make, pas dans Airtable).

### 1.3 Fréquence récente (historique des exécutions)

- *Envoi nouvelle famille à MAKE* : environ 100 exécutions du 21 juillet au 16 octobre 2026 (plusieurs par jour en juillet-août, encore 2 en octobre), **aucun échec** dans l'historique.
- *Reset quotidien* : passe chaque nuit (encore le 15 et le 16 octobre), sans échec.
- *Mettre … à « À valider »* : une seule exécution connue (1er novembre 2025, réussie) ; la prochaine est le 1er novembre 2026.
- *Annulation* : dernières réussites les 13, 16 et 17 août 2026 ; échecs de script répétés du 25 juin au 10 juillet 2026 (au moins 10, dont plusieurs le même jour).
- *Générations des items de facture BPA* : échecs de script le 2 août et le 13 juillet 2026, et plusieurs en mai-juin 2026 (étapes semaines, navettes et extras). OPI FR : aucun échec.
- *Éligibilité (Campeur créé)* : quelques échecs (juillet et novembre 2025).
- *Association d'une navette* : 3 échecs (janvier, février, août 2026 ; le dernier peut être le doublon volontairement signalé par une erreur).
- *Liste d'attente → confirmée* : échecs en mai et juillet 2026, réussite le 19 juillet.
- *Prestataire (doublon)*, *Reset quotidien*, *Ajouter Paiement Dépôt*, *OPI FR* : aucun échec.

---

## 2. Interfaces et formulaires Airtable

**Aucun formulaire Airtable** (ni dans les interfaces, ni autonome, ni intégré) et aucune page en brouillon. Les inscriptions des familles ne viennent donc pas d'Airtable : elles passent par **Softr** (portail), qui écrit dans la base.

9 interfaces (outils internes de l'équipe) :

| Interface | Pages |
|---|---|
| Suivi des inscriptions TOTAL | listes d'inscriptions par programme : Camp de jour, Camp de vacances, ASPI, Camp de la relâche, EXPÉ ; tableau de bord « Sommaire inscriptions » (total des semaines, inscriptions par session, tableau croisé) |
| Suivi des inscriptions OPI | même chose pour Opikawa (Camp de jour, ASPI, Camp de vacances, sommaire) |
| Suivi des activités TOTAL | Activités (Cascade d'eau, Rafting, Cours de langue, Sorties et visites : places par semaine) ; Buanderies BPA/OPI ; Navettes BPA/OPI par semaine |
| Assignation - Camp Français | Assignation ; Demandes de jumelage |
| Assignation - Camp Anglais | Demandes de jumelage ; Assignation |
| Assignation - Animateurs | Animateurs (liste de la table Groupe) |
| Rapports de semaines | ~30 pages de listes à imprimer par semaine : Buanderie, Solde dû total, Arrivée/Départ avion, Arrivée/Départ auto, Navettes (aller-retour vers un autre site), Groupes, Cascades d'eau (et « pas aux cascades »), Rafting (et « pas au rafting »), Sortie Opikawa, Entrecamp, Feuilles boîte à lunch, Cours de langue, Diètes et allergies, Solde dû à l'arrivée (CDV), Sacs de couchage, Médicaments (inscription, à donner), Arrivées et départs Camp de jour, Demandes de jumelage FR/ENG. Les pages « nourriture » comptent les diètes (régulière, végétarienne, sans lactose, sans porc, sans gluten, autre) |
| Coordos OPIKAWA | Plans de voyage (et une page de test) |
| À recevoir | Tableau de bord : somme du solde à recevoir des Factures BPA et OPI |

---

## 3. Volumes par table

Nombre de lignes au 2026-10-16 (outil `analyze_table`, 44 tables).

| Table | Lignes | | Table | Lignes |
|---|---:|---|---|---:|
| Famille | 1 256 | | Arrivée_Et_Départ_Possible | 16 |
| Campeur | 1 207 | | Admin_Users | 40 |
| Parent | 1 125 | | Exception | 0 |
| Fiche_Contact_Urgence | 768 | | Intervention | 111 |
| Prestataire | 605 | | Rapport de premiers soins | 0 |
| Fiche_Médicale | 989 | | Employé | 44 |
| Médicament | 379 | | Chambre | 43 |
| Registre des médicaments donnés | 3 773 | | Groupe | 121 |
| **Inscription** | **0** (voir risques) | | Messagerie | 0 |
| Annulations_Inscription | 0 | | Dépôts | 1 229 |
| Programme | 6 | | Facture BPA | 886 |
| Semaine | 30 | | Paiement BPA | 1 381 |
| Programmation | 10 | | Facture OPI | 336 |
| Activité_Extra | 41 | | Paiement OPI | 581 |
| Ajout_Activité_Extra | 0 | | Facture_Items | 0 |
| Buanderie ? | 0 | | Produits_Stripe | 33 |
| Buanderie | 0 | | Rabais | 2 |
| Buanderie_Disponible | 7 | | Code promo | 4 |
| Navette ? | 0 | | Archive_Annulation_Inscription | 0 |
| Navette | 0 | | Logos et images | 1 |
| | | | Extra | 0 |
| | | | Plan de voyage | 2 |
| | | | Preuve d'assurance | 127 |
| | | | Requêtes de modifications | 3 |

**Par année de création** (champ « date de création » de la table) :

| Table | 2025 | 2026 | Total |
|---|---:|---:|---:|
| Famille (`Date de création`) | 57 | 1 199 | 1 256 |
| Campeur (`Date de création Campeur`) | 59 | 1 148 | 1 207 |
| Inscription (`Date_creation`) | — | — | 0 ligne lue |

Inscription a aussi un champ formule « Année d'été » ; le regroupement ne donne rien, puisque la table paraît vide. La base est récente : presque tout a été créé en 2026, sauf environ 60 familles et campeurs de 2025 (essais ou été 2025).

---

## 4. Intégrations externes déduites

- **Softr** (portail des familles) : les familles s'inscrivent et gèrent leurs fiches par Softr, qui lit et écrit la base. Indices : aucun formulaire Airtable ; champs « Semaine affichage softr » ; le script du reset quotidien explique qu'il écrit un vrai champ pour que **Softr resynchronise** la page « médicaments à donner aujourd'hui » (les formules NOW() ne déclenchent pas de synchro) ; table Admin_Users (40, sans doute les comptes de l'équipe dans Softr) ; « Requêtes de modifications » et Annulations_Inscription = demandes faites par les familles ; fiches fictives « Aucun contact d'urgence » et doublons de Prestataire créés par le portail puis nettoyés par automatisation.
- **Make (Integromat)** : 13 webhooks distincts (`hook.us2.make.com/…`) écrits **en dur** dans les scripts (adresses masquées ici ; elles servent de clé : quiconque les connaît peut lancer les scénarios). Un seul en service : *nouvelle famille* (BPA / OPI). Inactifs dans Airtable : nouveau campeur, paiements BPA/OPI, factures PDF BPA/OPI, plan de voyage + assurances OPI, plan de voyage avion, J-7 BPA/OPI. Make gère sans doute aussi des envois planifiés de son côté (les champs « Date envoi relance inscription 48H / 7J » sur Famille, « relance aucune semaine 48H / 7J » et « rappel dépôt 48H / 7J » sur Campeur indiquent des relances par courriel suivies dans Airtable) : à vérifier dans Make.
- **Stripe** : table Produits_Stripe (33 produits : semaines, navettes, buanderies, activités, extras ; prix BPA et prix OPI, taxable, libellés FR/ENG) et table Dépôts (1 229, statut `paid`, typique d'un paiement Stripe Checkout) → Paiement « Dépôt Stripe ». **Aucune clé Stripe dans les scripts Airtable** : l'appel à Stripe se fait ailleurs (Softr ou Make). Les factures sont calculées dans Airtable, le PDF est produit par Make (champ PDF sur la facture).
- **Courriel** : courriel Airtable natif seulement dans #24 (inactif, vers les boîtes génériques BPA et Opikawa). Tous les courriels aux familles = Make.
- **Deux entreprises dans la même base** : BPA (GBPA+) et OPI (Opikawa), séparées par le champ « BPA OPI ? » de la Famille ; tables Facture et Paiement en double (BPA / OPI), prix par entreprise, adresses de courriel différentes, plans de voyage et preuves d'assurance pour les campeurs internationaux d'Opikawa (avion, navette depuis un autre site).
- Aucune API externe appelée par les scripts en dehors de Make (pas de Gmail, de Twilio ni d'autre service).

---

## 5. Points de risque pour la migration

1. **Inscription vide (0 ligne)**, comme Navette, Buanderie, Facture_Items, Ajout_Activité_Extra, Annulations et Archive, alors qu'il y a 886 + 336 factures et 1 962 paiements. Soit la saison a été purgée après l'été (fin septembre-octobre), soit l'outil de lecture ne compte pas cette table. **À confirmer avec l'équipe avant de concevoir l'import** : l'historique des inscriptions 2026 est peut-être ailleurs (export, Softr) ou perdu. Les tableaux de bord et les factures en dépendent.
2. **Logique métier dispersée dans environ 35 scripts**, souvent recopiés (Navette, Buanderie et Admissibilité existent chacun deux fois ; génération de facture en 3 exemplaires BPA / OPI FR / OPI ENG). À réécrire une seule fois, en fonctions pures (comme `logique.ts` / `calcul.ts` dans l'app), avec des tests.
3. **Suppressions dures** : Annulation supprime l'inscription (et sa navette et sa buanderie) ; Doublon supprime une nouvelle inscription ; Prestataire et Contact d'urgence suppriment d'anciennes fiches ; la génération de facture efface et recrée tous les items. Dans Supabase, prévoir un retrait logique et un journal (comme le Calendrier : rien n'est effacé).
4. **Données dérivées matérialisées** (éligibilité par programme, « Campeur occupé », Arrivée/Départ, admissibilité aux activités) qui peuvent diverger, d'autant que le pipeline d'inscription (#1–#5) est inactif : on ne sait pas ce qui les tient à jour aujourd'hui (Softr ? à la main ?). En SQL, les calculer à la lecture (vues ou fonctions) plutôt que les stocker.
5. **Noms de champs utilisés comme clés** : champs « Campeur éligible - <programme> » trouvés par leur nom, semaine retrouvée par l'expression « Semaine N » dans le nom d'une activité, codes promo par texte, campeur retrouvé par son nom (Admissibilité), libellés de sélection (« À valider », « Ouverte », « Fermée », « paid »). Un renommage casse tout ; à remplacer par des clés étrangères.
6. **Écarts de nom ou de version** : Annulation lit « Cocher pour supprimer cette inscription » alors que le schéma a aussi « Cocher pour annuler… » ; la version ENG publiée de la génération de facture n'a pas le même ordre que le brouillon ; le code promo est positif dans #5 et négatif dans #32–34. Échecs répétés (Annulation, génération BPA, liste d'attente) : à éclaircir avant de reproduire la logique.
7. **Secrets** : 13 adresses de webhooks Make en clair dans les scripts. À changer (ou à retirer) au moment de la bascule ; dans la nouvelle app, les mettre dans les secrets Cloudflare / Supabase, jamais dans le code.
8. **Dépendances externes à inventorier hors Airtable** : scénarios Make (textes des courriels, relances, PDF des factures, synchro Stripe), pages et règles d'accès Softr, compte Stripe (produits, webhooks). Ne pas couper Airtable tant que Make et Softr y écrivent.
9. **Données sensibles** : fiches médicales, médicaments, registre d'administration (3 773 lignes), contacts d'urgence, preuves d'assurance, plans de voyage, rapports de premiers soins et interventions, factures et paiements. Dans Supabase : schéma à part, RLS stricte (au minimum `peut_lire/peut_ecrire`, idéalement un accès plus serré pour la santé), pièces jointes dans un seau **privé** à adresses signées, aucune donnée gardée sur l'appareil, rien dans les journaux.
10. **Deux entreprises (BPA / OPI)** dans une même base, avec des tables en double : à rattacher à `core.entreprises` (une seule table de factures et de paiements, avec `entreprise_id`) ; les prix par entreprise sont à garder ; Opikawa gère en plus la langue (FR/ENG) et des campeurs internationaux.
11. **Cycle annuel** : réinitialisations du 1er novembre (validation des fiches, éligibilité), factures par année, saison purgée ? Le modèle Supabase doit porter l'année ou la saison explicitement (comme les exercices de Mastertimeline) plutôt que de vider les tables.
12. **Pièces jointes** : Logos et images, Preuve d'assurance (127), PDF de factures et peut-être des fichiers médicaux : à télécharger et à reverser dans le stockage Supabase pendant l'import (les adresses de pièces jointes Airtable expirent).


---

# Inventaire Softr — « ADMIN - Plateforme inscription BPA »

Relevé du 2026-10-16, **en lecture seule**, depuis Softr Studio (configuration de l'application et des 45 pages lue en entier ; aucune donnée de famille ou de campeur recopiée ; aucun secret recopié).

## Vue d'ensemble

- **Application** : « ADMIN - Plateforme inscription BPA », sous-domaine `admin-camptremblant.softr.app` (pas de domaine personnalisé). Créée le 2025-06-19 (restaurée d'une version antérieure), dernière publication le 2026-09-03. **Studio signale des modifications non publiées** (dernière modification enregistrée le 2026-10-16 à 12 h 48) : ce qui est en ligne peut différer légèrement de ce qui suit.
- **Données** : une seule source, Airtable, base `appTMCcPD9vlzuoyj` (« Inscriptions Camp de vacances »). Synchronisation bidirectionnelle activée. Aucune autre source (pas de tables Softr).
- **Rôle** : portail interne de l'équipe (direction, coordonnateurs, animateurs) pour la **même base** que le portail des parents : l'équipe y fait à la place des familles tout ce que les parents font de leur côté (profil campeur/parent, fiche médicale, médicaments, contacts d'urgence, prestataires, inscriptions, navette, buanderie, activités, annulations), plus le travail interne (facturation, médicaments à donner, premiers soins, interventions, exceptions, listes d'attente, gestion des programmes/activités/codes promo, requêtes).
- **Langue** : fr-CA. Application installable (PWA « Portail BPA », via Progressier). Intégration dans un iframe permise. Recherche globale désactivée. Commentaires activés (sans mentions ni pièces jointes) — utilisés sur une seule page.
- **Types de blocs utilisés** : listes (`list`), cartes horizontales (`list17`), tableaux (`table`), fiches de détail (`list-details`), formulaires conditionnels (`conditionalForm`, 19), liens rapides, grilles de texte, conteneurs à colonnes, commentaires. **Aucun graphique, kanban ni calendrier.**
- **Volume** : 45 pages d'application (3 dossiers : Gestion, Facturation, Médicaments) + 7 pages utilitaires (connexion, inscription, réglages du compte, lien expiré, accès refusé, page introuvable, parcours d'accueil non assigné).

## Utilisateurs et accès

- **Source des utilisateurs** : table Airtable **`Admin_Users`** (champ courriel « Email du compte Admin », champ nom « Prénom »). Tous les enregistrements sont admis (pas de filtre d'utilisateurs). Softr crée l'utilisateur dans la table à l'inscription.
- **Connexion** : par **courriel + code à usage unique** (code valable 5 minutes). Inscription (sign-up) **réservée au domaine `camptremblant.com`**. Session de 90 jours, pas d'expiration par inactivité. Pas de Google, SSO ni 2FA actifs. Un modèle de courriel d'invitation (« Rejoins … ») existe.
- **Groupes d'utilisateurs** (tous selon le champ **`Rôle`** de `Admin_Users`) :
  - **Direction** (`Rôle` = Direction)
  - **Coordo** (`Rôle` = Coordo)
  - **Anim** (`Rôle` = Anim)
  - plus les groupes prédéfinis Tous / Connectés / Non connectés.
  - Redirections : tous les groupes arrivent sur `/` après connexion et après déconnexion.
- **Aucune restriction de données** (data restrictions) : un utilisateur connecté peut lire toute la base à travers les blocs.
- **Comment l'accès est réellement réglé** : presque toutes les pages sont « connectés » (quelques-unes « tous »), et **la séparation par rôle se fait surtout dans le menu** et dans quelques blocs de l'accueil. Les pages elles-mêmes ne sont presque jamais restreintes par groupe (seule exception : *Suivi des requêtes*, Direction seulement). Quelqu'un qui connaît l'adresse d'une page (ex. `/factures-bpa`) l'ouvre, quel que soit son rôle.
- **Menu (en-tête partagé)** et sa visibilité :
  - Tableau de bord `/`, Rechercher un campeur — connectés
  - Registre des premiers soins, Registre des interventions, Liste d'attente — Coordo + Direction
  - Suivi des requêtes, Demandes d'annulation — Direction
  - Menu « Ajouter » (Direction + Coordo) : Inscription BPA, Inscription OPI, Inscription sans filtres, Navette, Buanderie, Activité
  - Menu « Gestion » : Gestion des programmes, des activités extras, des codes promos
  - Menu « Médicaments » (Coordo + Direction) : Déjeuner, Dîner, Souper, Heure du coucher, Autre moment, Au besoin, Registre des médicaments
  - Pour le groupe **Anim** : six liens directs « Médication déjeuner / dîner / souper / coucher / autre / au besoin »
  - Menu secondaire (Direction) : Factures BPA 🏢, Factures OPI 🏕️
  - Déconnexion, Réglages du compte
- **Permissions des actions** : les boutons « Ajouter » sont permis à « tous » ; modifier / supprimer / mettre à jour des champs : « connectés ». Aucune action n'est restreinte par rôle.

## Pages

Légende : *visible* = visibilité de la page ; les blocs sont visibles par « tous » sauf mention. « Fiche liée » = bloc filtré sur l'enregistrement de la page de détail (`recordId` dans l'adresse).

### Accueil — `/` (connectés) — « Tableau de bord 📊 »
1. **Cartes « Exceptions ⚠️ »** — table `Exception`, filtre Date ≥ aujourd'hui, tri « Ordre/trie ». Champs : Campeur affichage, Description, Compléter, Filtre, Date (fuseau America/Toronto). Bouton « Ajouter une exception » → `/ajouter-une-exception`. Par fiche : ✔ (pose `Compléter` = « ✔️ Complète », visible si Incomplète) et ✖ (pose « ❌ Incomplète »). Message vide : « Aucune exception pour la prochaine semaine ».
2. **Liens rapides** (Coordo + Anim) vers les six pages de médication.
3. **Deux conteneurs à colonnes** (l'un Direction, l'autre Coordo + Direction) qui regroupent les cartes suivantes :
4. **« Premiers soins ❤️‍🩹 »** — table `Rapport de premiers soins`, 5 derniers jours ; recherche sur campeur et animateur. Boutons « Ajouter un incident » → `/rapport-premiers-soins`, « Voir tous les incidents » → `/registre-premiers-soins` ; clic → `/visites-a-l-infirmerie-details`.
5. **« Interventions ✋ »** — table `Intervention`, 7 derniers jours. Bouton « Ajouter une intervention » → `/interventions` (le registre, pas le formulaire) ; clic → `/intervention-details`.
6. **« Annulations à traiter ❌ »** — table `Annulations_Inscription`, « État de la demande » = En attente. Champs : Campeur, date de la demande, Semaine, Activité_Extra, Navette, Buanderie. Bouton → `/demandes-annulation`.
7. **« Inscriptions en liste d'attente ⏳ »** — table `Inscription`, « Liste d'attente - Semaine » non vide. Champs : ID_Campeur, BPA/OPI, semaine demandée, Programme, date de création. Par fiche : **« Confirmer »** (pose « Confirmer une semaine en liste d'attente » = vrai → une automatisation Airtable fait le reste) et **supprimer**.
8. **« Semaines à combler 📋 »** — table `Semaine`, « Disponibilité » = « Disponible pour liste d'attente ». Champs : semaine, programme, nombre d'inscriptions.

### Rechercher un campeur — `/rechercher-un-campeur` (connectés)
- **Tableau** `Campeur`, tri Nom complet, recherche (nom, famille), défilement infini. Colonnes : Nom complet, Photo, Famille (courriel), BPA/OPI, Genre, Âge, Statut du campeur. Ligne → `/campeur-details` (fenêtre).

### Gestion › Gestion des codes promos — `/gestion-des-codes-promos` (connectés)
- **Liste** `Code promo` : code, BPA/OPI, dates de début/fin, montant, pourcentage, semaines applicables (+ programme), description. **Ajouter**, **Modifier** (mêmes champs) et **Supprimer**.

### Gestion › Gestion des programmes — `/gestion-des-programmes` (connectés)
- **Liste** `Programme` : nom, code, BPA/OPI, âge min/max, Actif ?, Buanderie incluse. **Modifier** seulement (pas d'ajout ni de suppression).

### Gestion › Gestion des activités extras — `/gestion-des-activit-s-extras` (connectés)
- **Liste** `Activité_Extra` (50 par page) : nom, Annulable, Ouverte ?, nombre d'inscriptions, date, date de début de la semaine, BPA/OPI. Boutons **« Fermer l'activité »** / **« Ouvrir l'activité »** (case « Cocher pour fermer l'activité », chacun visible selon l'état).

### Facturation › Factures BPA — `/factures-bpa` (connectés ; menu : Direction)
- Trois **listes** `Facture BPA` (ID facture, campeur, famille, solde, identifiant de facture Stripe ; recherche) : toutes (par date de création) ; **« Factures avec solde dû »** (solde > 0, un compte interne exclu) ; **« Factures avec remboursement dû »** (solde < 0). « Ouvrir » → détail (fenêtre).

### Facturation › Facture BPA details — `/facture-bpa-details`
- **Fiche** `Facture BPA` : ID, campeur, famille, **PDF de la facture**, sous-total, total, solde, entente de paiement, annulée. Actions : **« Entente de paiement »** (modifier ce champ), **« Régénérer facture »** (pose « État de la facture » = « À générer » → automatisation), **« Annuler facture »** (case Annulée).
- **Tableau** `Facture_Items` liés : date, item, prix unitaire (lecture seule).
- **Tableau** `Paiement BPA` liés : date, type d'opération, montant, mode. Boutons **« Paiement »**, **« Remboursement »**, **« Ajustement »** : ajoutent une ligne (montant, mode — sauf ajustement —, date, note interne) avec, posés d'office : lien vers la facture, « Appliquer au Customer Balance » = vrai, **« Statut sync Stripe » = « À synchroniser »**, type d'opération. Par ligne : Modifier (montant, date, mode, note), Supprimer.

### Facturation › Factures OPI — `/factures-opi` et Facture OPI details — `/facture-opi-details`
- Identiques à BPA sur les tables `Facture OPI` / `Paiement OPI` (pas de sous-total affiché ; filtre « solde dû » sans exclusion de compte ; édition en ligne activée sur la fiche).

### Médicaments › six pages de médication (visibles par **tous**, même non connectés ; actions pour connectés)
`/medication-dejeuner`, `/medication-diner`, `/medication-souper`, `/medication-l-heure-du-coucher`, `/medication-autre`, `/medication-au-besoin`
- **Liste** `Médicament`, triée par campeur, recherche par campeur. Filtre : moment d'administration = le moment de la page, **campeur présent** (statut de présence : Présent, et selon la page Départ et/ou Arrivée), statut du campeur = Confirmé, et **pas encore donné** pour ce moment (sauf « Au besoin »). Champs : campeur, médicament, posologie, raison, autonomie (« Mon enfant prend ses médicaments »), réfrigéré ?, heure d'administration.
- Action **« Marquer comme donné »** : coche « Administré ? (<moment>) ». Page « Autre » : aussi « Modifier l'heure d'administration ». La remise à zéro des cases (pour le lendemain) et l'écriture du registre ne sont pas dans Softr (automatisation Airtable, voir plus bas).

### Registre des médicaments — `/registre-des-medicaments` (connectés)
- **Tableau** `Registre des médicaments donnés` (campeur, date de création, médicament), lecture seule, 100 par page.

### Exception — `/exception` (connectés ; pas dans le menu)
- **Liste** `Exception` complète (campeur, date, description, compléter), recherche, bouton « Ajouter une exception ».

### Ajouter une exception — `/ajouter-une-exception` (tous)
- **Formulaire** → `Exception` : compte famille, campeur (filtré sur la famille), date, description.

### Suivi des requêtes — `/requetes` (**Direction**)
- **Tableau** « 🐞 Suivi des requêtes client », table `Requêtes de modifications` (date, titre, description, campeur, état). **« Remplir une requête »** (titre, description, campeur, inscription, famille ; état = Ouverte). Par ligne : **« Fermer »**. Ligne → `/requetes-details`.

### Requêtes details — `/requetes-details`
- **Fiche** de la requête + bouton « Fermer la requête » + **bloc Commentaires** (fil de discussion de l'équipe sur la requête — la seule page avec commentaires).

### Liste d'attente — `/liste-d-attente` (connectés ; menu : Coordo + Direction)
- **Liste** `Inscription` avec semaine en liste d'attente, triée par date de création (premier arrivé), filtres par semaine et programme. Champs : programme, semaine demandée, campeur, date, demande de jumelage. **Lecture seule** (la confirmation se fait depuis l'accueil).

### Créer un groupe — `/cr-er-un-groupe` (pas dans le menu)
- **Formulaire** → `Groupe` : nom, langue, groupe d'âge, semaine, animateur.

### Premiers soins
- **Registre des premiers soins** — `/registre-premiers-soins` : tableau `Rapport de premiers soins` (campeur, date, blessure, situation, traitements, par qui), filtres campeur / animateur / soignant, bouton « Remplir un rapport », « Voir plus ».
- **Visite à l'infirmerie détails** — `/visites-a-l-infirmerie-details` : fiche complète en lecture (dont médicament donné, posologie, **photo de la blessure**, suivi nécessaire).
- **Rapport de premiers soins** — `/rapport-premiers-soins` (tous) : **formulaire** → `Rapport de premiers soins` : date, lieu de la blessure, moniteur du campeur (personnel actif), témoin (facultatif), date de naissance, campeur (statut Confirmé), situation, blessure, photo, traitements, soignant, « a reçu un médicament ? » → si Oui : nom et posologie ; suivi nécessaire ?

### Interventions
- **Registre des interventions** — `/interventions` : tableau `Intervention` (campeur, date, intervenant, contexte), « Ajouter une intervention », « Voir plus », Modifier.
- **Intervention details** — `/intervention-details` : fiche (contexte, résumé, suivi avec le jeune, intervenant, témoin), **Modifier** et **Supprimer**.
- **Ajouter une intervention** — `/ajouter-une-intervention` (tous) : formulaire → `Intervention` : campeur(s), date, intervenant, témoin, titre, description, résumé, suivi ; famille reprise de l'adresse (`?famille=`).

### Dossier d'un campeur
- **Campeur details** — `/campeur-details` : la fiche centrale. Fiche `Campeur` (photo, nom, naissance, âge, courriel du compte, BPA/OPI, pays/province, langue, statut, progression de l'inscription, **argent de poche**, notes, documents, dépôt payé avant le 1er février, solde facture) avec **« Modifier le profil »** (prénom, nom, naissance, notes, documents, argent de poche), **« Argent de poche »**, « Voir famille ». Puis des listes liées, chacune avec ses actions :
  - **Fiche médicale** (`Fiche_Médicale`) : allergies, Epipen, diète, conditions, vaccins, autorisation des médicaments en vente libre, **numéro d'assurance maladie et expiration** ; Modifier (pose aussi « État de la fiche médicale » = ✔️) ; « Ajouter une fiche ».
  - **Médicaments** (`Médicament`) : Modifier (pose « État de la fiche de médicament » = ✔️), Supprimer, Ajouter.
  - **Inscriptions** (`Inscription`, triées par date de la semaine) : programme, semaine, avertissement d'annulation, statut, t-shirt, jumelage, activité, langue d'immersion, **groupe, chambre** ; **« Annuler l'inscription »** (case, visible si la semaine n'est plus annulable), **supprimer** (case « Cocher pour supprimer » : suppression par automatisation), Modifier (langue, jumelage, activité) ; Ajouter une inscription / une activité.
  - **Navette** : moment, statut ; Annuler (case), Supprimer, Ajouter.
  - **Buanderie** : Supprimer, Ajouter.
  - **Extra** (`Extra`) : produit Stripe + date ; **Ajouter** directement (produit Stripe) et Supprimer.
  - **Preuve d'assurance médicale** : fichier ; Ajouter.
  - **Plan de voyage** : billets d'avion, transport, compagnie, vol, correspondance, accompagnateur, heures prévues (arrivée/départ) — lecture seule.
  - **Interventions** et **Premiers soins** du campeur (lecture + Ajouter).
  - **Parents** (famille) : Modifier (toutes les coordonnées), « Ajouter un parent ».
- **Famille du campeur** — `/famille-du-campeur` (tous) : fiche de la famille (courriel du compte) + **La famille** (campeurs du même compte, « Ajouter un campeur »), **Les inscriptions** (Modifier langue / jumelage / « Doublon ? » ; « Supprimer le doublon » si Doublon = Oui ; Ajouter une inscription / activité, Annuler une inscription), **Arrivée et départ** (navettes), **Buanderie**, **Contacts d'urgence** (Modifier, Supprimer ; le bouton « Ajouter un contact » n'a **pas de destination**), **Prestataires** (NAS masqué, % des frais de garde ; Ajouter, Supprimer).
- **Liste des campeurs** — `/liste-des-campeurs` (pas dans le menu) : tableau `Campeur` (nom, courriel, naissance, photo), filtre genre → `/campeur-details`. Doublon de « Rechercher un campeur ».

### Formulaires de saisie pour une famille (pages pas dans le menu, ouvertes depuis les fiches)
Tous commencent par **« Courriel du compte » / « Compte famille »** (liste déroulante des familles) puis le campeur filtré sur ce compte.
- **Campeur** — `/profil-campeur` → `Campeur` : prénom, nom, genre, naissance, langue maternelle (+ autre), photo.
- **Parent** — `/parent` → `Parent` : prénom, nom, naissance, relation, courriel, téléphone, adresse complète ; pose « État de la fiche Parent » = ✔️.
- **Contact d'urgence** — `/contact-urgence` → `Fiche_Contact_Urgence`, 2 étapes : « Souhaitez-vous ajouter un contact ? » (Non → fiche « Aucun contact d'urgence » quand même créée) puis coordonnées.
- **Médicaments** — `/medicaments` → `Médicament` : nom, moment(s) d'administration (+ autre), posologie, raison, forme (+ autre), autonomie, réfrigération, autres infos ; pose l'état ✔️.
- **Fiche médicale** — `/fiche-medicale` → `Fiche_Médicale` (seulement les campeurs **sans** fiche) : assurance maladie, allergies (+ Epipen), diète (+ autre), vaccins, conditions (+ autres), autorisation des médicaments en vente libre (liste affichée) ; pose l'état ✔️.
- **Prestataire** — `/prestataire` → `Prestataire` (relevés pour frais de garde), 14 étapes : parent ou nouvelle personne, **NAS**, % des frais payés ; 2e prestataire avec un % complémentaire (une étape par tranche de 10 %, la plupart sans titre : « Title », « LABEL »).
- **Buanderie** — `/buanderie` → `Buanderie` : campeur, buanderie choisie (pas une déjà prise).
- **Navette** — `/navette` → `Navette` : campeur, moments d'arrivée/départ (pas déjà réservés).
- **Ajout d'activité** — `/ajout-d-activit-` → `Ajout_Activité_Extra` : campeur, activités (admissibles, pas déjà prises), case **« Envoyer un lien stripe »**.

### Inscriptions
- **Inscription BPA** — `/inscription-bpa` et **Inscription OPI** — `/inscription-opi` → `Inscription`, formulaire de 11 étapes (repris du portail des parents) : compte famille (filtré BPA ou OPI), campeur, **programme admissible** (selon l'âge : Camp de vacances, Camp de jour, EXPÉ, ASPI, SAUVETEUR, Camp de la relâche ; OPI : + langue d'immersion), puis l'étape du programme : **semaine avec places disponibles** où le campeur n'est pas déjà occupé, **ou** inscription en **liste d'attente** sur une semaine complète ; t-shirt (ASPI) ; **code promo** (texte libre) ; « ajouter une autre semaine ? » ; activités extras (Cascades d'eau, Rafting) ; demande de jumelage. Pose « État de l'inscription » = ✔️ et **« Étape de l'automatisation » = « Campeur occupé »**. Prix affichés en dur dans le texte (799 $, 2 129 $, 239 $, 1 069 $, 1 049 $, 2 529 $ + taxes ; sur la page OPI, plusieurs prix sont absents).
- **Inscription sans filtre** — `/inscription-sans-filtre` : même formulaire **sans les filtres** d'admissibilité, de disponibilité et de BPA/OPI (« Filtres désactivés 🚨 ») et sans liste d'attente : pour forcer une inscription (semaine complète, âge hors norme). Le code promo y est **obligatoire** à l'étape SAUVETEUR.

### Annulations
- **Annuler une inscription** — `/annuler-une-inscription` → `Annulations_Inscription`, 5 étapes : famille, campeur, type d'annulation (semaine, activité, navette, buanderie), l'élément à annuler (pas déjà annulé) et le motif ; pose « État de la demande » = **Acceptée** (l'admin annule directement, sans attente).
- **Demandes d'annulation** — `/demandes-annulation` (menu : Direction) : **« en attente »** (venues du portail des parents) avec **« Accepter »** (État = Acceptée) et **Supprimer** ; et **« acceptées »** (table `Archive_Annulation_Inscription`, lecture seule).

## Actions et intégrations

- **Aucun webhook, aucun workflow Softr, aucune action d'application** : l'onglet Workflows est vide, aucun formulaire n'envoie vers Zapier/Make/courriel/API, aucun bouton « déclencher un webhook » ou « télécharger un fichier ». Aucune intégration Stripe dans Softr.
- **Tout le travail automatique est dans Airtable**, déclenché par des champs que Softr pose :
  - `Facture` : « État de la facture » = « À générer » → régénération de la facture (PDF + Stripe).
  - `Paiement` : « Statut sync Stripe » = « À synchroniser » + « Appliquer au Customer Balance » → envoi du paiement / remboursement / ajustement vers le solde client Stripe.
  - `Inscription` : « Étape de l'automatisation » = « Campeur occupé » ; « Confirmer une semaine en liste d'attente » = vrai ; « Cocher pour annuler / supprimer cette inscription ».
  - `Navette` : « Cocher pour annuler cette navette ». `Activité_Extra` : « Cocher pour fermer l'activité ». `Ajout_Activité_Extra` : « Envoyer un lien stripe ».
  - `Annulations_Inscription` : « État de la demande » = Acceptée → archivage dans `Archive_Annulation_Inscription`.
  - `Médicament` : cases « Administré ? (<moment>) » → `Registre des médicaments donnés` et remise à zéro quotidienne (déduit : rien dans Softr ne décoche).
  - États ✔️ des fiches (parent, médicale, médicament, contact d'urgence, buanderie, prestataire) → « Progression de l'inscription » du campeur.
- **Téléchargements** : seulement les fichiers affichés (PDF de facture, documents, preuve d'assurance, billets, photo de blessure). Pas d'export CSV.
- **Code personnalisé** : un seul script dans l'en-tête de l'application, qui **désactive la saisie automatique** du navigateur sur tous les champs. Aucun code par page ni par bloc.
- **Serveur MCP Softr** activé pour l'application (accès d'agents IA, configuration OAuth).

## Flux de travail de l'équipe

1. **Ouvrir la journée sur le tableau de bord** : exceptions à venir (cocher « complète »), premiers soins des 5 derniers jours, interventions de la semaine, annulations en attente, listes d'attente, semaines à combler.
2. **Médicaments aux repas** (animateurs, coordonnateurs, infirmerie) : ouvrir la page du moment (souvent sur téléphone, même sans être connecté pour la lecture), donner, « Marquer comme donné » ; le campeur disparaît de la liste. Consulter le registre.
3. **Infirmerie** : remplir un rapport de premiers soins (avec photo et médicament donné), revoir le registre et le suivi nécessaire.
4. **Comportement** : noter une intervention (contexte, résumé, suivi, témoin), la corriger ou la supprimer.
5. **Service à la clientèle / dossiers** : chercher un campeur, ouvrir sa fiche, compléter ou corriger pour la famille (profil, parents, fiche médicale, médicaments, contacts, prestataires, assurance, argent de poche, notes, documents), ajouter une navette, une buanderie, un extra ou une activité (avec lien Stripe), repérer et supprimer les **doublons** d'inscription.
6. **Inscriptions au téléphone** : inscrire un campeur BPA ou OPI à la place du parent ; forcer une inscription avec « sans filtre ».
7. **Listes d'attente** : voir les semaines qui se libèrent (« Semaines à combler ») et **confirmer** l'inscription la plus ancienne en attente.
8. **Annulations** : accepter (ou supprimer) les demandes des parents ; annuler directement une semaine, une activité, une navette ou une buanderie.
9. **Facturation (direction)** : suivre les soldes dus et les remboursements dus, ouvrir une facture, saisir un paiement / remboursement / ajustement (envoyé à Stripe), poser une entente de paiement, régénérer ou annuler une facture.
10. **Saison** : gérer les codes promo, les programmes (âges, actif, buanderie), ouvrir/fermer les activités extras ; créer les groupes (semaine + animateur).
11. **Requêtes** (direction) : consigner une demande de modification d'un client, en discuter en commentaires, la fermer.

## Points à noter pour la refonte

**Sécurité et accès (le plus important)**
- Les rôles ne protègent que le **menu** : facturation, demandes d'annulation, listes d'attente, gestion sont ouvertes à tout compte connecté qui tape l'adresse. Les six pages de médication et plusieurs formulaires (premiers soins, intervention, exception, famille du campeur, activité) sont **visibles sans être connecté** (lecture de données de santé de campeurs présents). Dans la refonte : RLS par rôle, pas seulement le menu.
- Données très sensibles affichées ou saisies : **NAS** (prestataires, masqué en liste), **numéro d'assurance maladie**, allergies, conditions, photos de blessures, interventions. À traiter comme les Feuilles de temps (accès restreint, pas de cache sur l'appareil).
- Toute action « modifier / supprimer » est permise à tout connecté, y compris les animateurs (supprimer un paiement, une intervention, un contact d'urgence…). Aucune trace de qui a fait quoi, sauf ce qu'Airtable garde.

**Fragilités**
- La logique est dispersée dans des **automatisations Airtable** déclenchées par des cases et des textes magiques (« À générer », « À synchroniser », « Campeur occupé », cases « Cocher pour… »). Ces automatisations ne sont **pas visibles dans Softr** : il faut les inventorier côté Airtable avant de les refaire (Stripe surtout).
- Le formulaire d'inscription est copié trois fois (BPA, OPI, sans filtre) avec des écarts involontaires : sur OPI, les **activités extras sont filtrées sur BPA** et plusieurs prix et le code promo manquent selon le programme ; sur « sans filtre », le code promo est obligatoire à l'étape SAUVETEUR. **Prix des programmes écrits en dur** dans le texte du formulaire.
- Filtres douteux : annulation de buanderie en **OU** au lieu de ET (propose des buanderies déjà annulées) ; 2e prestataire filtré sur la famille **de l'utilisateur admin** connecté (copié du portail parent) ; la page Dîner/Souper ne compte que « Présent », Déjeuner compte aussi « Départ », Coucher aussi « Arrivée » ; la page « Autre » n'exige pas le statut Confirmé.
- Statuts en émojis comparés comme texte (« ✔️ Complète », « ❌ Incomplète », « ✔️ ») : la condition d'affichage du bouton ✔ teste « Incomplète » sans l'émoji.
- Bouton « Ajouter un contact » sans destination ; bouton « Ajouter une intervention » de l'accueil qui mène au registre ; formulaire Prestataire en 14 étapes avec titres « Title » / « LABEL » ; un compte interne exclu en dur du filtre « solde dû » BPA ; doublons de pages (Liste des campeurs ≈ Rechercher un campeur ; Exception non reliée au menu).
- Les choix des listes déroulantes de famille sont des **listes figées d'identifiants d'enregistrements** dans la configuration (pas toujours synchronisées) ; le choix « Courriel du compte » oblige à connaître le courriel de la famille.
- Médication : rien n'enregistre **qui** a donné le médicament ni l'heure réelle ; la remise à zéro dépend d'une automatisation invisible ; pas de « refusé / absent ».

**Ce qui manque**
- Pas de tableau de bord chiffré (inscriptions par semaine, revenus, places restantes), pas de graphique, pas d'export.
- Pas de gestion des **semaines** (capacité, disponibilité), des groupes et des chambres dans l'admin (les champs Groupe et Chambre sont seulement affichés ; « Créer un groupe » n'est pas dans le menu).
- Pas de journal des annulations refusées (« Supprimer » efface la demande), pas de motif de refus.
- Pas de liens entre l'admin et le portail des parents autrement que par la base commune.

## Ce que je n'ai pas pu lire ou n'ai pas lu

- Les **automatisations, formules et vues Airtable** (hors de Softr) : leur rôle est déduit des champs que Softr pose.
- La **liste des utilisateurs** (onglet Users) : volontairement pas ouverte (données personnelles) ; le nombre de comptes par rôle n'est donc pas relevé.
- Les **valeurs des listes déroulantes** (familles, campeurs, semaines) : ce sont des données, non recopiées.
- Les modifications non publiées : le relevé reflète la version enregistrée dans Studio, qui peut différer de la version en ligne.
- Le parcours d'accueil (« Onboarding flow », non assigné) et le détail des pages utilitaires (connexion, etc.) : seulement leur existence.


---

# Portails clients Softr — inventaire (lecture seule, 2026-10-16)

Source : la configuration lue dans Softr Studio (définition JSON de l'application et de chaque page, rechargée en lecture par l'API de Studio, dans la session déjà ouverte). Rien n'a été modifié, publié ni soumis. Aucune donnée de famille n'est recopiée ici : certaines listes déroulantes contenaient des noms de campeurs en cache, je les ai ignorées. Aucune clé n'est recopiée non plus.

---

## 1. Vue d'ensemble

| | Portail BPA | Portail Opikawa |
|---|---|---|
| Nom Softr | Portail Client Base de Plein Air Mont-Tremblant | Portail client Opikawa |
| Domaine | app.camptremblant.com (camptremblant.softr.app) | app.opikawa.com (opikawa.softr.app) |
| Créé / dernière publication | 2024-11-15 / 2026-10-07 | 2026-01-16 (copie du BPA) / 2026-10-07 |
| Base Airtable | `appTMCcPD9vlzuoyj` (« Inscriptions Camp de vacances ») | **la même base** |
| Table des utilisateurs | `Famille` (courriel = champ **« Email du compte famille BPA »**) | `Famille` (courriel = champ **« Email du compte famille OPI »**) |
| Langue de l'app | fr-CA, fuseau America/Toronto | fr-CA + **Weglot** (traduction automatique, sélecteur de langue en bas à droite) |
| Pages | 38 (dont 3 de test ou de copie) | 39 |

**Principe** : un seul jeu de tables Airtable sert les deux camps. Une même ligne `Famille` peut avoir un compte BPA et un compte Opikawa (deux champs courriel distincts). Les listes et formulaires séparent les deux marques par un champ **`BPA OPI ?`** (valeur `BPA` ou `OPI`) sur Programme, Semaine, Activité, Campeur, Famille ; et les factures sont dans deux tables (`Facture BPA` / `Facture OPI`).

**Tables Airtable touchées par les portails** : Famille, Campeur, Parent, Fiche_Contact_Urgence, Prestataire (Relevé 24), Fiche_Médicale, Médicament, Inscription, Programme, Semaine, Activité (via `Activité_Extra`), Ajout_Activité_Extra, Navette, « Navette ? », Buanderie, « Buanderie ? », Annulations_Inscription, Archive_Annulation_Inscription, Facture BPA, Facture OPI ; Opikawa en plus : **Preuve d'assurance**, **Plan de voyage**. La messagerie aux campeurs écrit dans un **Google Sheets** (onglet « Form submissions »), pas dans Airtable.

**Où vit la logique** : presque nulle part dans Softr. Softr affiche et écrit des lignes ; tous les états (« ✔️ », « À valider », « Campeur occupé », admissibilité par âge, disponibilité, « Dépôt payé SOFTR », lien Stripe, factures PDF, soldes) sont des champs **calculés ou remplis par des automatisations Airtable / Make** que je n'ai pas pu voir (voir § 6). Aucun webhook Make, aucun workflow Softr et aucun envoi Zapier/courriel n'est configuré sur les formulaires des deux portails (tous les réglages « après envoi » sont vides).

---

## 2. Portail BPA

### 2.1 Accès et réglages

- **Groupes** : seulement les trois prédéfinis (Tous, Connectés, Non connectés). Les pages `/inscription` et `/inscription-copie` citent en plus un groupe personnalisé `83af8370…` **qui n'existe plus** (resté orphelin ; sans effet).
- **Connexion** : courriel + **mot de passe** (pas de lien magique ni de code, pas de Google : un identifiant Google est rempli mais la méthode n'est pas activée), inscription **ouverte au public**, session de 90 jours, mots de passe faibles permis. Un compte créé dans Softr **crée la ligne `Famille`** (`create_user_in_datasource`) ; une famille retirée d'Airtable perd son compte (`DELETE`).
- **Redirections** : après inscription → `/onboarding` ; après connexion → `/` ; après déconnexion → `/`.
- **Courriels** de Softr (mot de passe oublié, code, invitation, changement de courriel) traduits en français, envoyés depuis `info@camptremblant.com` (Postmark, domaine vérifié).
- **Code personnalisé** : en-tête global = script qui met `autocomplete="off"` sur tous les champs ; page Famille = traceur **Contentsquare** ; intégrations **Hotjar** et **Stripe Checkout** (clé publique « live » posée ; voir 2.4).
- Commentaires Softr activés sur la table Campeur (aucun bloc commentaire sur les pages).
- Menu (bloc partagé) : Ma famille `/` · Facturation · Demande d'annulation `/annulations-en-traitement` · Écrire à mon campeur `/messagerie-public` ; menu du compte : Paramètres du compte, Me déconnecter. Pied de page : Facebook, Instagram, LinkedIn.

### 2.2 Pages

Visibilité « connectés » sauf mention. « Hidden » = champ caché posé par le formulaire. `→` = page suivante.

**Pages système** : `/login` (connexion), `/sign-up`, `/forgot-password`, `/reset-password`, `/link-expired`, `/401`, `/404`, `/account` (Paramètres du compte : courriel, mot de passe, nom du compte).

**`/onboarding`** (flux d'accueil, met à jour la ligne Famille de l'utilisateur) : 3 étapes — Bonjour (texte) ; **Responsable du compte** (nom complet*, téléphone*) ; **Politique d'inscription** (long texte contractuel, case « Acceptation de la politique d'inscription »*) → `/campeur-onboarding` (bandeau « Commencez par ajouter un campeur ! » + bouton).

**`/` Famille (accueil)** — blocs actifs :
- Titre « Ma famille 🏡 ». (Bandeau désactivé : « L'ajout de semaine est présentement indisponible… » avec courriel et téléphone des inscriptions — un interrupteur manuel pour fermer les inscriptions.)
- **Campeurs** (cartes, table Campeur, filtre `Famille = utilisateur` et `BPA OPI ? = BPA`, 12 par page) : Photo, Nom complet, Date de naissance, Langue maternelle. Bouton « Ajouter un campeur » → `/profil-campeur` ; clic sur une carte / « Voir plus » → `/moncampeur` (dossier).
- **Parents** (table Parent, filtre Famille = utilisateur) : nom, naissance, courriel, relation, adresse complète, téléphone. Boutons Ajouter → `/parent`, **Modifier** (fenêtre : tous les champs, obligatoires), Supprimer.
- **Contacts d'urgence** (Fiche_Contact_Urgence) : mêmes champs. Ajouter → `/contact-urgence` ; « Mettre à jour » si état ✔️ ; **« À valider »** si état = À valider (fenêtre qui repose l'état à ✔️ — c'est le mécanisme de revalidation annuelle des fiches) ; Supprimer.
- **Relevé 24** (Prestataire) : prestataire 1 et 2, NAS masqué (« NAS caché »), % des frais payés. Ajouter → `/prestataires`, Supprimer.
- Désactivés mais révélateurs : « **Étapes pour compléter vos inscriptions** » (une ligne par campeur avec l'état de chaque fiche — médicale, médicaments, parents, contact d'urgence, inscription, prestataire, dépôt payé — et un bouton qui n'apparaît que pour l'étape manquante, dont **« Payer dépôt »** qui ouvre l'URL du champ `stripeCheckoutUrl` du campeur) ; ancienne liste des inscriptions (« Supprimer le doublon » si statut contient Doublon) ; bloc « Ressources » (liste de matériel, guide du parent, itinéraire, tutoriel).

**`/moncampeur` Dossier campeur** (page de détail d'un Campeur, par identifiant de ligne) :
- Fiche du campeur (photo, nom, naissance, langue) + « Modifier le profil » (prénom, nom, genre, naissance, langue, autre langue, photo).
- **Fiche médicale** (liée au campeur) : allergies (oui/non, détail, Épipen), diète, conditions, autres conditions, vaccins, autorisation des médicaments en vente libre, n° d'assurance maladie et expiration. Ajouter → `/fiche-medicale` ; « Mettre à jour » si ✔️, « À valider » si À valider (la version « À valider » demande aussi **« Votre enfant sait-il nager ? »**).
- **Médicaments** : nom, posologie, raison, moment d'administration, forme, réfrigéré, autonomie, autres infos ; Ajouter → `/medicaments`, Mettre à jour / À valider, Supprimer.
- Désactivés (donc pas visibles aujourd'hui) : Inscriptions (Programme, Semaine, Activités spéciales, Demande de jumelage modifiable, Supprimer le doublon), Navettes, Buanderies, Liste d'attente (avec Supprimer), calendrier des séjours (Semaine : date de début/fin, couleur du programme).

**`/profil-campeur` Ajouter un campeur** (crée un Campeur, Famille = `ID_Famille` de l'utilisateur) :
1. Information : Prénom*, Nom*, Genre*, Date de naissance*, Langue maternelle* (si « Autre » : préciser*), **Photo*** (fichier ; usage interne).
2. **Code de conduite** (long texte) : case « Acceptation du campeur »* et « Acceptation d'un parent »*.
→ `/fiche-medicale`.

**`/fiche-medicale`** (crée Fiche_Médicale ; État = ✔️ posé caché) : Campeur* (seulement ceux de la famille **sans fiche**), **n° de carte d'assurance maladie*** (format vérifié `ABCD 12345678`), expiration*, Allergies oui/non* (si oui : lesquelles*, Épipen*), Diète* (Régulière, Végétarienne, Sans porc, Sans lactose, Autre → préciser*), Vaccins* (multiple), Conditions* (multiple ; « Autres conditions » → préciser*), autorisation des médicaments en vente libre* (liste affichée : Tylenol, Advil, Benadryl, Reactine, Claritin, Gravol, pastilles, solution saline, Polysporin, Cortate…), case « Ajouter un médicament ? » → `/medicaments`, sinon → `/loading-f`.

**`/medicaments`** (crée Médicament ; État ✔️) : Campeur*, Nom*, Moments d'administration* (multiple ; Autre → préciser*), Posologie*, Raison*, Forme* (Autre → préciser*), Prend seul ?*, Réfrigéré ?*, Autres infos. Case « Ajouter un autre médicament » → recharge, sinon → `/`.

**`/parent`** (crée Parent ; État ✔️) : Prénom*, Nom*, Naissance*, Relation*, Courriel*, Téléphone*, **Acceptation SMS** (case), Adresse*, Ville*, Province/État*, Code postal*, Pays*. Case « Ajouter un autre parent » → recharge ; sinon, si la famille n'a aucun contact d'urgence → `/contact-urgence`, sinon → `/`. Texte : les parents sont liés à tous les campeurs et sont les contacts d'urgence par défaut.

**`/contact-urgence`** (crée Fiche_Contact_Urgence ; État ✔️) : « Souhaitez-vous ajouter un contact d'urgence ? »* (Non → fin) ; puis Prénom*, Nom*, Relation*, Courriel*, Téléphone*, Adresse*, Ville*, Province*, Pays*, Code postal*. Case « en ajouter un autre ». → `/prestataires`.

**`/prestataires` Relevé 24** (crée Prestataire ; État ✔️) : « Un seul Relevé 24 ou diviser en deux ? »* ; prestataire 1 : prénom*, nom*, **NAS*** (9 chiffres), % des frais*; si deux : prestataire 2 idem. → `/`.

**`/inscription`** — le cœur (formulaire à étapes, crée une ligne **Inscription** par semaine) :
1. **Campeur*** (campeurs de la famille) ; Famille cachée.
2. **Programme*** : liste filtrée sur `Campeur éligible` (admissibilité par âge calculée dans Airtable), `BPA OPI ? = BPA`, `Actif ? = vrai`. Descriptions affichées : Camp de vacances (7 j, 7–16 ans, hébergement), Camp de jour (5 j, 5–12 ans, 9 h–16 h 30), EXPÉ (7 j, 14–16 ans, canot/rando-camping), ASPI (aspirant moniteur, 21 j, 16–17 ans), SAUVETEUR (21 j, 15–17 ans), Camp de la relâche (hiver).
3. Une étape par programme, avec **prix affiché en texte** (rien n'est calculé dans Softr) : Camp de vacances 1 049 $, Camp de jour 239 $, EXPÉ 1 069 $, ASPI 2 129 $/session, SAUVETEUR 2 529 $/session, Relâche 799 $ (+ taxes). Choix **d'une semaine à la fois** (`Semaine`, filtrée : même programme, `Disponibilité = Places disponibles`, campeur admissible à ce programme, campeur pas déjà inscrit cette semaine = `Campeur occupé`, `BPA OPI ? = BPA`). **Si aucune semaine libre** n'apparaît, la section « Liste d'attente » propose les semaines **complètes** (`Liste d'attente - Semaine`). ASPI : **taille de chandail*** (S–XL, inclus). Champ **Code promo** (texte libre, non vérifié par Softr).
4. Camp de vacances et camp de jour : **Activités spéciales** (multiple, filtrées : `Ouverte ? = Oui`, de la semaine choisie, BPA) — Cascades d'eau 95 $, Rafting 129 $ (camp de jour : cascades seulement) ; texte : l'activité peut être déplacée ou annulée faute d'inscriptions.
5. **Demande de jumelage** (texte : nom d'un autre campeur ; même programme, même sexe, âge proche). Caché : `État de l'inscription = ✔️`, **`Étape de l'automatisation = Campeur occupé`** (déclenche une automatisation Airtable).
6. « Ajouter une autre semaine ? » : Oui → recharge `/inscription` ; Non → `/loading` (attente) → navette.

**Extras après l'inscription** (chaîne de pages) :
- `/loading` et `/loading-f` : page « Nous traitons votre inscription… » avec roue, script qui renvoie à `/` **après 10 secondes** (le temps que les automatisations Airtable tournent). À noter : la fin de l'inscription s'appelle « Loading Navette » mais `/loading` renvoie à `/`, pas à `/ajout-navette` (la proposition de navette n'est donc plus enchaînée automatiquement).
- `/ajout-navette` : texte (49 $ par transport, départ du magasin Globo du Marché Central de Montréal ; pas pour le camp de jour ni la relâche) ; « Souhaitez-vous ajouter une navette ? » (table « Navette ? ») : Non → `/ajout-buanderie`, Oui → `/navette`.
- `/navette` (crée Navette) : Campeur* puis **Moment d'arrivée ou de départ*** (options = moments `Ouvert ? = Oui` liés aux séjours du campeur ; une navette à la fois) ; « une autre » → recharge ; si aucune buanderie possible → `/`, sinon → `/ajout-buanderie`. `/navette-ajout` = même formulaire, retour à `/`.
- `/ajout-buanderie` : 25 $ + taxes par lavage entre deux semaines, inclus pour ASPI et SAUVETEUR, pas pour le camp de jour ; Non → `/`, Oui → `/buanderie`.
- `/buanderie` et `/buanderie-ajout` (crée Buanderie ; État ✔️) : Campeur*, lavage* (filtré : campeur admissible, pas déjà choisi, `Ouverte ? = Oui`).
- `/activite-ajout` (crée Ajout_Activité_Extra) : Campeur*, activité* (« Semaine N : Cascade d'eau / Rafting / La Ronde / Ottawa / cours d'anglais / de français… », filtrée sur admissibilité, pas déjà prise, ouverte, BPA).

**Annulation** :
- `/annulation` (crée Annulations_Inscription) : délais affichés (semaine : 28 jours avant ; activité ou service : 7 jours avant), Campeur*, **texte libre*** décrivant ce qu'il faut annuler (pas de choix structuré). → `/`.
- `/annulations-en-traitement` : deux listes filtrées sur les campeurs de l'utilisateur — demandes en attente (état, semaine, activité, buanderie, navette ; bouton « Retirer la demande » = suppression) et demandes acceptées (table Archive_Annulation_Inscription : items annulés, date). Bouton « Annuler une inscription ».

**Facturation** `/facturation` : liste `Facture BPA` (factures dont le campeur est de la famille et qui ont un PDF) : n° de facture, campeur, **PDF**, total, cumul payé, solde (« mis à jour en temps réel » = champs Airtable). Texte « Comment payer » : solde complet avant le 1er juin si inscrit avant ; après le 1er juin, l'inscription n'est valide qu'une fois payée ; modes : **virement Interac** (question de sécurité = n° de facture BPA-26-XXX), chèque par la poste, comptant le jour de l'arrivée. Note : PDF non disponibles sur mobile.

**Autres** : `/merci-depot` (« Nous avons bien reçu votre dépôt 💳 ») et `/depot-paye` (« Dépôt déjà payé ✅ ») = pages de retour du paiement Stripe ; `/messagerie-public` (**publique**, sans connexion) « Envoyer un message à un campeur » : De*, À (nom du campeur)*, courriel de retour*, message*, date → Google Sheets ; `/disponibilites` (**publique**) : tableau des semaines du Camp de vacances BPA (session, date de début, « Disponibilité CDV ») ; `/softr-test-page` (désactivée) ; `/inscription-copie` (ancienne version du formulaire, sans filtres de disponibilité, désactivée en partie).

### 2.3 Parcours d'une famille (BPA)

1. **Compte** : `/sign-up` (courriel + mot de passe) → la ligne Famille est créée → `/onboarding` (responsable du compte + acceptation de la politique) → « Ajoutez un campeur ».
2. **Campeur** : profil + photo + code de conduite → **fiche médicale** → médicaments (facultatif) → page d'attente → `/`.
3. **Parents** et **contacts d'urgence** depuis l'accueil (le formulaire parent envoie au contact d'urgence s'il n'y en a pas), puis **Relevé 24**.
4. **Inscription** : campeur → programme admissible → une semaine (ou liste d'attente) → activités → jumelage → autre semaine ? → attente → **navette** → **buanderie**.
5. **Paiement** : rien n'est payé dans Softr aujourd'hui (le bouton « Payer dépôt » Stripe est dans un bloc désactivé). La facture PDF apparaît dans Facturation (produite ailleurs) ; paiement par Interac, chèque ou comptant ; soldes tenus dans Airtable.
6. **Revalidation** : les fiches passent à « À valider » (par Airtable) ; la famille clique « À valider » et réenregistre (l'état revient à ✔️).
7. **Annulation** : demande en texte libre, suivie dans « Demande d'annulation ».
8. **Documents** : factures PDF seulement (aucun autre document téléchargeable ; le bloc « Ressources » est désactivé).

### 2.4 Paiement Stripe

Intégration « Stripe Checkout » posée dans l'application (clé publique live). Le seul bouton qui s'en sert, « Payer dépôt », ouvre l'adresse du champ **`stripeCheckoutUrl`** du Campeur (lien de paiement préparé par une automatisation, probablement Make) et n'apparaît que si `Dépôt payé SOFTR` est vide ; ce bloc est **désactivé** dans les deux portails. Les pages `/merci-depot` et `/depot-paye` servent de retour. Le montant, la création de la session et le retour (webhook Stripe) ne sont pas dans Softr.

---

## 3. Portail Opikawa — différences avec BPA

Même squelette (copie du BPA en janvier 2026), mêmes tables, mêmes états. Différences :

**Accès / réglages**
- Utilisateur = Famille par **« Email du compte famille OPI »** (la même famille peut avoir deux comptes).
- Groupe personnalisé **« Pré-inscription 2026 »** (utilisateur dont `Pré-inscription OPI 2026` est vrai) — **utilisé par aucune page**.
- **Langues** : l'app est en français, traduite à la volée par **Weglot** (script + clé dans l'en-tête) ; l'onboarding demande la **langue de communication** et rappelle le sélecteur de langue. 3 pages publiques **« Ekocamp est maintenant Opikawa »** en anglais, français et espagnol (`/ekocamp-eng|fr|esp`, ancien nom de marque, boutons vers `app.opikawa.com/sign-up` et `opikawa.com`).
- **Suivi publicitaire** : scripts d'en-tête qui gardent `gclid`, `gbraid`, `wbraid` et les `utm_*` dans le navigateur, les ajoutent aux liens internes et aux formulaires ; l'onboarding les écrit dans la Famille (champs cachés `{URL_PARAM:…}`) — attribution Google Ads.
- Contacts : messages@opikawa.com / info@opikawa.com, téléphone sans frais ; réseaux sociaux Opikawa. Courriels Softr toujours envoyés depuis info@camptremblant.com.

**Pages en plus**
- **`/preuve-assurance`** (crée Preuve d'assurance ; État ✔️) : Campeur*, **fichier de la preuve d'assurance*** (couverture médicale minimale 100 000 $ ; un résident canadien dépose la carte d'assurance maladie de sa province). → `/`.
- **`/plan-de-voyage`** (crée Plan de voyage ; État ✔️) : Campeur* ; **Arrivée** : moyen de transport* — en voiture (nom de la personne qui dépose*, relation*) ou en avion (compagnie*, n° de vol*, date et heure d'atterrissage à YUL*, correspondance ?*, comment l'enfant voyage*) ; **Départ** : même logique (décollage de YUL) + **mineur non accompagné (UM)** : frais déjà payés ?* ; **billets d'avion** (fichier*) si au moins un trajet en avion ; commentaires. → `/`.
- Accueil : les boutons d'étape « Preuve d'assurance » et « Plan de voyage » ne s'affichent que si **Province de résidence ≠ Québec** (dans le bloc d'étapes, désactivé comme chez BPA). Dans le dossier du campeur, deux blocs « Plan de voyage » et « Preuve d'assurance » (bouton « Compléter ») ont une condition `Province de résidence = Québec` — à vérifier : soit c'est « masquer quand », soit c'est inversé.
- Ekocamp ×3 (ci-dessus).

**Pages en moins** : `/disponibilites`, `/softr-test-page`, `/inscription-copie`. **Buanderie désactivée** (`/ajout-buanderie`, `/buanderie`, `/buanderie-ajout`) : la navette renvoie directement à l'accueil.

**Ajout d'un campeur** : nouvelles étapes **Résidence** (pays* ; Canada → province* ; États-Unis → État*) ; si hors Canada/É.-U. : **Nationalité*** et **n° de passeport*** ; citoyen ou résident permanent canadien ? puis américain ? ; sinon renvoi au questionnaire officiel IRCC et **Résultat IRCC*** (Visa / AVE / Aucun document) : Visa → « Aimeriez-vous que nous produisions les documents (lettre d'invitation, déclaration de garde notariée) ? »* ; AVE → explication (7 $ CAD, en ligne) ; rappel que les documents d'entrée restent la responsabilité des parents. Dossier du campeur : affiche pays de résidence, nationalité, passeport, type de visa.

**Fiche médicale** : **plus de n° d'assurance maladie ni d'expiration** (remplacés par la preuve d'assurance) ; mêmes questions sinon. Une fin « Ending 3 » vers `https://app.camptremblant.com/` traîne dans le formulaire (inaccessible, aucune condition n'y mène).

**Inscription** : programmes **Camp de vacances, Camp de jour (immersion française seulement), ASPI, SAUVETEUR, Camp de la relâche** — **pas d'EXPÉ** ; filtre `BPA OPI ? = OPI`. **Langue d'immersion*** (langue parlée dans le groupe) pour le camp de vacances. **Prix** : Camp de vacances 1 355 $, Camp de jour 410 $, ASPI 2 375 $/session, Relâche 799 $ (+ taxes) ; SAUVETEUR saute directement au jumelage (pas d'étape de choix de session : à vérifier, semble incomplet). Activités optionnelles plus nombreuses : sorties (cascades 130 $, rafting 170 $, Six Flags 250 $), visites culturelles (Ottawa 225 $, Montréal 225 $, ville de Québec 415 $ sur 2 jours), cours de français ou d'anglais (205 $, 5 × 1 h 30).

**Navette** : entre **l'aéroport de Montréal (YUL)** et le camp, 100 $ + taxes par transport (BPA : 49 $ depuis Montréal).

**Relevé 24** : choix supplémentaire « Ne pas produire de relevé 24 pour mon enfant » (familles étrangères).

**Facturation** : table `Facture OPI` ; paiement **Interac** pour les clients canadiens (n° OPI-26-XXX) ; **comptant en CAD à l'arrivée** pour les clients internationaux ; autre mode sur demande.

**Annulations en traitement** : la liste des demandes acceptées montre semaine, activité, buanderie, navette (au lieu de « items annulés, date »).

**Formulaires** : les menus déroulants « auto » sont remplacés par des choix en boutons (`quick_select`) ; les formulaires mettent `Famille` = **courriel** du compte au lieu de `ID_Famille` (incohérence entre formulaires, les deux existent dans les deux portails).

---

## 4. Intégrations

| Intégration | Usage | Les deux ? |
|---|---|---|
| Airtable (`appTMCcPD9vlzuoyj`) | toutes les données et les comptes (table Famille) | oui |
| Google Sheets | « Écrire à mon campeur » (onglet Form submissions ; un classeur par portail) | oui |
| Stripe Checkout | dépôt par lien `stripeCheckoutUrl` du campeur ; bouton désactivé | oui |
| Postmark (via Softr) | courriels de compte depuis info@camptremblant.com | oui |
| Hotjar, Contentsquare | analyse du comportement des visiteurs | oui |
| Weglot | traduction automatique de l'interface | Opikawa |
| Google Ads (gclid/UTM) | attribution, écrite dans Famille à l'onboarding | Opikawa |
| Make / webhooks / workflows Softr | **aucun configuré dans les portails** ; le travail se fait dans Airtable (champ `Étape de l'automatisation`, états, liens Stripe, factures) | — |

---

## 5. Points à noter pour la refonte

1. **Modèle de données** : Famille (compte) → Parents, Contacts d'urgence, Prestataires (Relevé 24) au niveau famille ; Campeur → Fiche médicale (1), Médicaments (n), Inscriptions (1 par semaine), Navettes, Buanderies, Activités, Annulations ; Opikawa ajoute Preuve d'assurance et Plan de voyage. Les deux marques partagent tout et se distinguent par un champ (`BPA OPI ?`) : dans notre app, une colonne compagnie (`core.entreprises`) plutôt que deux schémas.
2. **Un compte par marque** aujourd'hui (deux champs courriel sur Famille) ; décider si une famille qui inscrit chez BPA et Opikawa a un compte ou deux.
3. **Règles à reprendre en base** (aujourd'hui des champs calculés Airtable invisibles depuis Softr) : admissibilité par âge et par programme, disponibilité (places, liste d'attente quand complet), « campeur occupé » (pas deux inscriptions la même semaine), activités et navettes ouvertes par semaine, buanderie admissible, doublons, dépôt payé, solde.
4. **Prix** : uniquement du texte dans les formulaires ; il faut une vraie table de prix par programme / activité / service et par marque, et calculer la facture.
5. **Code promo** : texte libre non vérifié ; à transformer en codes validés.
6. **Paiement** : aujourd'hui hors ligne (Interac, chèque, comptant) + dépôt Stripe désactivé ; prévoir Stripe Checkout (dépôt puis solde) avec webhook, les pages de retour, la règle du 1er juin.
7. **Statut des fiches** (vide / ✔️ / À valider) et revalidation annuelle : à reproduire comme état par fiche et par saison, avec la liste « étapes à compléter » par campeur (le bloc désactivé de l'accueil est le bon modèle).
8. **Données sensibles** : NAS (Relevé 24), n° d'assurance maladie, passeport, statut d'immigration, santé, photos, billets d'avion. Chiffrement ou accès très restreint, seau privé, journal d'accès.
9. **Annulation** : texte libre traité à la main ; à remplacer par un choix des éléments (semaine, activité, navette, buanderie) avec les délais (28 j / 7 j) vérifiés.
10. **Messagerie aux campeurs** : formulaire public sans compte vers un Google Sheets (risque de pourriel ; à protéger).
11. **Multilingue** : Opikawa compte sur Weglot ; prévoir FR/EN (et ES ?) natif, plus une langue de communication par famille.
12. **Opikawa international** : pays/province/État, nationalité, visa/AVE, assurance, plan de voyage (vols, UM), navette YUL, paiement en CAD.
13. **Fermeture des inscriptions** : bandeau manuel ; prévoir une date d'ouverture/fermeture par programme.
14. **Pages d'attente de 10 s** : symptôme d'automatisations asynchrones ; dans notre app, faire le travail en transaction (fonction SQL) pour enchaîner sans attente.
15. **Bric-à-brac à ne pas reprendre** : pages de test et de copie, groupe orphelin `83af8370`, groupe « Pré-inscription 2026 » inutilisé, fin de formulaire vers le portail BPA dans Opikawa, SAUVETEUR sans choix de session chez Opikawa, `Famille` posée tantôt par identifiant tantôt par courriel.
16. Textes à récupérer tels quels (politique d'inscription, code de conduite, consignes médicales, modalités de paiement) : ils sont dans les blocs texte des formulaires ; je ne les ai pas recopiés en entier.

---

## 6. Ce que je n'ai pas pu lire

- **Automatisations Airtable et scénarios Make** : rien de visible depuis Softr (états, `Étape de l'automatisation = Campeur occupé`, factures PDF, liens Stripe, courriels aux familles). Il faut lire la base et Make à part.
- **Formules Airtable** derrière `Campeur éligible…`, `Disponibilité…`, `Campeur occupé`, `Dépôt payé SOFTR`, `stripeCheckoutUrl`, soldes.
- **Configuration Stripe** (montant du dépôt, produits, webhook) : seule la nature de l'intégration est visible.
- **Weglot** : langues activées et traductions (côté Weglot).
- **Valeurs des listes** synchronisées avec Airtable (genres, langues, vaccins, conditions, relations, formes, moments, langues d'immersion…) : seulement quelques-unes étaient en cache dans la configuration (diètes, programmes, tailles).
- **Groupe `83af8370`** : supprimé, sa règle est inconnue.
- **Sens exact** de la condition « Province de résidence = Québec » sur les blocs Plan de voyage / Preuve d'assurance du dossier Opikawa (montrer ou masquer).
- Le code des 3 pages Ekocamp (bloc « vibe-coding ») n'a été lu que pour ses textes.
- Je n'ai pas ouvert les portails publiés : l'affichage réel (données d'une famille) n'est pas vérifié.


---

