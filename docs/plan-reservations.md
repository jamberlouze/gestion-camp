# Plan — module Réservations de groupes

Remplace la base Airtable « Réservation Groupes - GLITCH » (appJLHSRSayvzzSST). Rédigé le 2026-10-08, **à valider par Maxime avant toute construction**.

## 1. Ce qui existe dans Airtable et où ça va

| Airtable | App | Note |
|---|---|---|
| Réservations | `reservations.reservations` | Le cœur. |
| Client | `crm.organisations` (existe déjà) | Une seule liste de clients pour le CRM et les réservations. |
| Responsable_de_la_réservation / _facturation | `crm.contacts` (existe déjà) + rôle sur la réservation | Une personne peut avoir les deux rôles. |
| Liste de prix (176 lignes, 2025-26 et 2026-27) | `reservations.produits` + `reservations.prix` (produit × exercice) | Importée. Gérée dans Réglages, sans code. |
| Liens Hébergement, Location et matériel, Extra, Prix repas, Prix des nuits, Ratio d'animation, Forfait de salle (7+ champs) | **une seule table** `reservations.lignes` : produit, quantité, prix unitaire **figé**, total | Airtable n'avait pas de quantité sur les extras ni de total : l'app les ajoute. |
| Ancienne réservation | (rien) | Un état suffit ; l'historique reste dans la même table. |
| Type de séjour (4) | `reservations.types_sejour` | Animation ?, heures normales, ratio d'accompagnateurs gratuits, repas inclus. |
| Type de location | `reservations.types_location` | Heures normales d'arrivée et de départ. |
| Formulaire_de_demande_de_réservation | Formulaire public + `reservations.demandes` (copie brute de ce que le client a saisi) | Voir §4. |
| Fiche_du_participant | `reservations.fiches` | Données de santé : voir §6. |
| EventID, CalendarIDCible, CalendarIDDelete (×2) | `reservations.evenements_google` (interne) | Remplace Make. |
| MÉM - Réunions / Décisions / Questions | (rien) | Hors périmètre (décision de Maxime). |

**Migration** : les 9 réservations, les 2 clients et la réservation archivée sont des tests → **non migrés**. On importe la liste de prix, les types de séjour et les types de location.

## 2. Règles d'affaires reprises de tes scripts (à l'identique)

- **Numéro** : `AA-G-n` (année d'arrivée sur 2 chiffres + compteur), ex. 26-G-54.
- **Nom de l'événement** (Agenda) : `PP:Client (participants+accompagnateurs🍽️) N🤡`.
- **Jours / nuits** : nuits = écart de dates (heure de Montréal) ; jours = nuits + 1. Recalculés dès qu'une date change.
- **Heures** : Location de salle → heures du type de location (sinon celles du formulaire). Autres types : « heure normale convient » = Oui → heures normales du type de séjour, sinon heures du formulaire.
- **Repas** (si service repas = Oui) : déjeuner 8 h, dîner 12 h, souper 17 h 30. Le premier jour, seuls les repas après l'arrivée comptent ; le dernier jour, seuls ceux avant le départ.
- **Accompagnateurs gratuits** = plancher(participants ÷ y) × x selon le ratio du type (1:20, 1:30, Aucun). Payants = confirmés − gratuits (minimum 0).
- **Animateurs requis** = arrondi supérieur(participants ÷ ratio) ; ratio 1:X → 1.
- **Prix** : exercice d'octobre à septembre selon la date d'arrivée ; s'il n'y a pas de prix pour cet exercice, on prend le plus récent.
- **Produits automatiques** : nuitée (Classe nature), repas (selon le type), animation 1:20 (si le type a de l'animation). Dans l'app, c'est configurable par type de séjour dans Réglages, au lieu d'être écrit dans le code.
- **Prix d'hébergement** = nombre de lits × prix par lit.
- **Dédoublonnage du formulaire** (corrigé le 2026-10-08 à la demande de Maxime : l'adresse ne suffit pas, son format varie et c'est tantôt celle du bureau, tantôt celle de l'administration) : **rien n'est relié automatiquement**. Chaque demande arrive « À valider » avec des suggestions classées : organisation dont un contact a le même courriel ou le même téléphone, puis nom d'organisation semblable (sans accents, tirets ni « École »/« Collège »), puis même ville. Un clic relie à l'organisation suggérée ou en crée une nouvelle. L'adresse est gardée sur l'organisation (`crm.organisations.adresse`, texte libre) pour la facturation, jamais pour reconnaître.

## 3. Le parcours d'une réservation

États (les tiens) : **Demande de réservation → Estimé envoyé → Estimé approuvé → Contrat envoyé → Confirmée**, plus **Closed lost**. S'y ajoute un **état de paiement** séparé : à facturer, facturée, payée en partie, payée.

| Étape | Déclencheur | Courriel au client | Document |
|---|---|---|---|
| 1 | Le client remplit le formulaire public | Accusé de réception + **estimé** | Estimé PDF |
| 2 | Le client approuve l'estimé (bouton sur sa page) | — | — |
| 3 | Estimé approuvé | **Contrat à signer** | Contrat PDF |
| 4 | Le client signe → état **Confirmée** | **Facture** | Facture PDF |
| 5 | N jours avant l'arrivée (réglable) | **Rappel(s)** + lien des fiches participants | — |
| 6 | N jours après le départ (réglable) | **Suivi** (remerciement, sondage) | — |

- **Page client sans compte** : chaque réservation a un lien secret. Le client y voit son estimé, l'approuve, signe le contrat, télécharge ses factures et fait remplir les fiches participants. Tous les courriels pointent vers cette page.
- **Signature** : signature électronique intégrée (nom tapé + case « j'accepte », date, heure et adresse IP notées, PDF signé conservé). C'est valide au Québec et ça ne coûte rien. DocuSign reste possible si tu préfères.
- **Un estimé ou une facture envoyé est figé.** Une modification crée une nouvelle version (E-27-0001-v2) et le client reçoit la nouvelle.
- **Courriels** : envoyés par l'API Gmail déjà en place (Vigie de subventions), donc ils apparaissent dans « Envoyés » du compte expéditeur. Les modèles sont modifiables dans Réglages. Chaque envoi est noté dans le journal de la réservation **et** dans les échanges du CRM.
- **Garde-fou** : chaque type de courriel a un mode « automatique » ou « préparé, à approuver d'un clic ». Voir la question Q2.

## 4. Formulaire public de demande

- Mêmes champs que le formulaire Airtable : type de groupe, type de séjour, dates, heures, type de location, nombre de personnes, service repas, âges, accompagnateurs, langue, organisation, adresse, responsable de la réservation et de la facturation, adresse courriel de la direction, commentaires.
- Une page publique de l'app, protégée contre les robots (Cloudflare Turnstile, gratuit).
- Crée la demande, l'organisation et les contacts (avec dédoublonnage), puis la réservation calculée selon §2.

## 5. Synchro Google Agenda

- L'app est la seule source ; elle écrit dans Google, jamais l'inverse. Une modification faite dans Google Agenda serait écrasée.
- On reprend tes 5 calendriers existants : Demande, Estimé, Contrat, Confirmée PP, Confirmée VF. Une réservation confirmée qui touche PP et VF apparaît dans les deux. Closed lost → retirée.
- Chaque changement d'état, de date ou d'hébergement déplace ou met à jour l'événement.
- Demande d'ajouter la portée Agenda au jeton Google déjà utilisé pour Gmail (voir actions).

## 6. Fiches participants (données de santé)

- Les champs actuels : allergies, Epipen, problèmes médicaux, diète, autorisation de médicaments, matricule. Formulaire public par réservation ; la question de la diète est masquée si la réservation n'a pas de service repas (comme ton lien Airtable).
- Accès limité à un rôle précis (réglable dans la grille). Les autres modules ne voient que des totaux (ex. nombre de repas sans gluten pour Cuisine).
- **Effacement automatique** N mois après le départ (Loi 25). Proposition : 3 mois.

## 7. Liens avec les autres modules

- **CRM** : un client = une organisation du CRM. `crm.sejours()` lit les réservations au lieu de la copie Airtable.
- **Calendrier** : lit les réservations directement. La synchro Airtable aux 15 min et le secret AIRTABLE_TOKEN deviennent inutiles pour ça.
- **Plus tard, hors de ce plan** : Cuisine (nombre de repas et diètes par jour), Rooming (hébergement relié aux lieux), Horaire d'animation (animateurs requis).

## 8. Ordre de construction (chaque phase testée en DEV, puis mise en ligne à ton go)

0. **Finir et mettre en ligne le CRM** (en DEV en ce moment) : les réservations s'appuient sur ses organisations et contacts.
1. Fondation : catalogue, prix, types, réservations, lignes, calculs (§2), saisie interne, Réglages, import de la liste de prix.
2. Estimés et factures PDF : numérotation, taxes, versions.
3. Formulaire public + page client : approbation, signature, factures, fiches participants.
4. Courriels automatisés : modèles, déclencheurs, rappels, suivis, journal.
5. Synchro Google Agenda.
6. Bascule : CRM et Calendrier branchés sur les réservations, synchro Airtable retirée, base Airtable en lecture seule.

## 9. Questions ouvertes

Voir le message de Claude du 2026-10-08 (Q1 à Q6).
