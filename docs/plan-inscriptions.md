# Plan — Inscriptions du camp de vacances

Version 1, du 2026-10-16. **Ébauche à discuter entre les deux développeurs et à valider par la direction avant toute construction.** L'inventaire de l'existant (Airtable, Softr) est dans `docs/inscriptions-existant.md`.

## 0. Ce que le projet remplace

| Outil d'aujourd'hui | Rôle | Dans gestion-camp |
|---|---|---|
| Base Airtable « Inscriptions Camp de vacances » (44 tables, 41 automatisations) | Données et logique | Schéma Supabase `inscriptions` + fonctions SQL (§2) |
| Softr « ADMIN - Plateforme inscription BPA » | Travail de l'équipe | **Module Inscriptions de l'app** (§3) |
| Softr « Portail Client BPA » (app.camptremblant.com) | Portail des familles BPA | Pages publiques de l'app, même domaine (§4) |
| Softr « Portail client Opikawa » (app.opikawa.com) | Portail des familles Opikawa, FR/EN | Mêmes pages, habillage et règles Opikawa (§4) |
| Make (courriels, factures Stripe) | Envois et intégrations | Worker Cloudflare + API Gmail (§6) |
| Stripe (dépôts, factures) | Paiement | Stripe Checkout + webhooks du Worker (§5) |
| `Admin_Users` (Direction / Coordo / Anim) | Comptes de l'équipe | Comptes et grille d'accès de l'app (`core.profils`, `core.acces_roles`) |

## 1. Décision : même dépôt (gestion-camp), pas un projet à part

**Recommandation : tout faire dans `gestion-camp`** — schéma, admin **et** portail des familles. C'est déjà le modèle en place sur `dev` : RH (`/emplois`, `/dossier/<jeton>` sur emplois.camptremblant.com) et Réservations (pages publiques sur un sous-domaine) sont servis par la même app et le même Worker, chaque groupe de pages publiques dans son propre paquet chargé à part (`src/lib/public/PagesPubliques.tsx`).

Pourquoi :
- **Une seule base** : le portail et l'admin écrivent les mêmes tables. Les migrations, les types générés (`database.types.ts`) et les fonctions SQL doivent vivre à un seul endroit ; deux dépôts sur une même base = migrations qui se marchent dessus.
- **Le socle existe déjà** : pages publiques (`src/lib/public` : Turnstile, habillage, langue FR/EN, pad de signature), Worker qui vérifie et appelle des fonctions `service_role`, courriels Gmail, QBO, chiffrement (Vault + pgcrypto du NAS de la paie RH), copie vers les Drive, PDF dans le navigateur (pdf-lib).
- **Liens directs avec les autres modules** : Rooming (chambres), Animation (groupes), Cuisine (diètes et allergies : `commande.participants`), Calendrier (présences), Véhicules (navettes), `core.entreprises` (GBPA+ et Opikawa).
- **Un seul déploiement Cloudflare** : app.camptremblant.com et app.opikawa.com deviennent des domaines personnalisés du Worker `gestion-camp`, aiguillés par nom d'hôte comme `VITE_HOTE_EMPLOIS`.

Ce qui justifierait un projet à part (pas le cas aujourd'hui) : une équipe ou une agence différente, un rythme de mise en ligne indépendant imposé, ou une autre base. Les risques du même dépôt se règlent autrement :
- *Taille du paquet* : le portail est chargé à part (lazy), les familles ne téléchargent jamais l'admin.
- *Sécurité* : l'anonyme et les familles n'ont aucun droit sur les autres schémas ; RLS + tests SQL des droits (comme les 85 vérifications de RH).
- *Mises en ligne* : voir §9 (travail à deux).

## 2. Modèle de données (schéma `inscriptions`)

Principes repris de l'app : noms en français, RLS sur toute table, **rien n'est effacé** pour ce qui touche l'argent ou la santé (statuts, `deleted_at`), statuts et totaux **calculés** (vues ou fonctions pures) plutôt que recopiés, une seule table par notion avec la compagnie en colonne (`entreprise_id` → `core.entreprises`) au lieu des tables BPA / OPI en double.

### 2.1 Familles et personnes
- `familles` : compte famille ; `entreprise_id` (BPA ou Opikawa), langue de communication, adresse, source (UTM Opikawa). Une famille inscrite aux deux compagnies = **deux familles distinctes** (décision §10) : rien n'est partagé entre BPA et Opikawa.
- `comptes_famille` : lien `auth.users` ↔ famille (plusieurs adultes peuvent se connecter au même dossier).
- `parents` (tuteurs), `contacts_urgence`, `personnes_autorisees` (qui peut venir chercher l'enfant).
- `campeurs` : identité, date de naissance, photo (seau privé), code de conduite accepté (date, version).

### 2.2 Dossiers par saison (remis « à valider » chaque année : plus d'automatisation du 1er novembre)
- `fiches_medicales` (campeur × saison) : allergies, conditions, diète, vaccins, carte d'assurance maladie (chiffrée), état `a_valider` / `validee` + qui et quand.
- `medicaments` (fiche × médicament : dose, moments de la journée).
- `dossiers_voyage` (Opikawa) : nationalité, passeport, visa/AVE, plan de voyage (un trajet par sens), preuve d'assurance.
- `releves_24` : bénéficiaires, **NAS chiffré** (même mécanique que `rh.chiffrer`/`rh_paie`, lecture notée dans un journal).

### 2.3 Catalogue (par saison et par compagnie)
- `saisons`, `programmes` (camp de vacances, camp de jour, ASPI, EXPÉ…, âges min/max), `sessions` (semaines : dates, capacité, ouverture, liste d'attente), `options` (navette, buanderie, activités extras, extras) avec leurs créneaux, `prix` (produit × compagnie × saison, taxable, libellés FR/EN), `rabais` (règles réelles : famille, multisemaine), `codes_promo` (pourcentage, montant ou prix de remplacement, dates, usages max).

### 2.4 Inscriptions
- `inscriptions` (campeur × session) : statut `liste_attente` → `en_attente_depot` → `confirmee` / `annulee` (jamais supprimée) ; **places restantes = inscriptions actives seulement** (corrige le défaut d'Airtable) ; vérifications dans une fonction SQL `inscriptions.inscrire` (âge à la date de la session, places, campeur déjà inscrit cette semaine-là, doublon) en une transaction, verrou sur la session.
- `inscriptions_options` (navette, buanderie, activités), `annulations` (demande, délai 28 j / 7 j, décision, contournement noté), `exceptions` (événements datés d'un campeur), `requetes` (demandes de modification des familles, commentaires).

### 2.5 Facturation
- `factures` (compagnie, famille, numéro `BPA-AA-NNN` / `OPI-AA-NNN` donné par la base et jamais changé), `factures_lignes` (**liées au produit**, quantité, prix copié au moment de la facture), `paiements` (Stripe, Interac, chèque, comptant, remboursement, ajustement), `echeanciers` (versements prévus), `evenements_stripe` (identifiant unique : un événement n'est traité qu'une fois).
- Taxes calculées ligne par ligne selon les règles de chaque compagnie, dans une fonction pure testée (comme `calcul.ts` de Réservations).

### 2.6 Santé et sécurité sur place
- `medicaments_donnes` : **vrai registre** (campeur, médicament, dose, heure, donné par — posé par la base), plus de cases « Administré ? ».
- `premiers_soins` (rapports, photos dans un seau privé), `interventions` (comportementales).

### 2.7 Journal et courriels
- `journal` (déclencheurs, comme Réservations et RH), `courriels` (chaque envoi : modèle, destinataire, date) au lieu des paires case + date.

### 2.8 Accès (grille de l'app)
- Module `inscriptions` (bureau : familles, inscriptions, catalogue).
- Espace `inscriptions_sante` (`parent: 'inscriptions'`, comme `rh_paie`) : fiches médicales, médicaments, premiers soins — infirmerie et direction.
- Espace `inscriptions_facturation` : factures et paiements — bureau et direction.
- Les animateurs (ex-groupe Anim) : lecture limitée à leurs groupes (liste des campeurs, allergies essentielles, bracelet).
- Les familles : **aucun droit direct** sur le schéma ; tout passe par des fonctions qui vérifient que la ligne appartient à leur famille (ou par le Worker, comme RH).

## 3. Admin dans gestion-camp (remplace l'ADMIN Softr)

Module `modules/inscriptions`, adresse `/inscriptions`. Écrans, d'après les 45 pages de l'ADMIN :
1. **Tableau de bord** : inscriptions par session et programme, places restantes, listes d'attente, fiches à valider, soldes à recevoir.
2. **Familles** (recherche, fiche famille : parents, campeurs, inscriptions, factures, requêtes, journal) ; inscrire un campeur à la place d'une famille (avec contournement explicite et noté des règles, au lieu des 3 formulaires « BPA / OPI / sans filtre »).
3. **Sessions** : liste par semaine, liste d'attente (confirmer d'un clic), annulations à décider.
4. **Catalogue** (Réglages) : saisons, programmes, sessions, options, prix, rabais, codes promo.
5. **Facturation** : factures, paiements, remboursements, ajustements, ententes, échéanciers ; export / synchro QuickBooks Online (réutiliser `worker/qbo`).
6. **Santé** : fiches à valider, **médicaments à donner par moment de la journée** (pensé pour le téléphone et le hors-ligne, comme Inventaire), premiers soins, interventions.
7. **Sur place** : exceptions, navettes et buanderie par jour, plans de voyage Opikawa, bracelets (formule corrigée).
8. **Rapports** : la trentaine de rapports par semaine des interfaces Airtable, à trier avec l'équipe (lesquels servent vraiment).

## 4. Portail des familles (pages publiques)

- **Domaines** : app.camptremblant.com (BPA) et app.opikawa.com (Opikawa) pointés sur le Worker `gestion-camp` ; l'hôte choisit l'habillage, la compagnie, les prix et les règles. Le domaine opikawa.com doit être dans le compte Cloudflare (ou on passe par un sous-domaine camptremblant.com).
- **Connexion des familles** : vrais comptes Supabase (les familles reviennent souvent), par code ou lien envoyé par courriel (pas de mot de passe à gérer). ⚠ Aujourd'hui, le déclencheur `trg_creer_profil` crée un **profil d'employé** (`core.profils`, rôle `terrain`) pour **tout** nouvel utilisateur : il faut l'adapter pour qu'un compte famille n'ait jamais de profil d'employé (métadonnée `genre = 'famille'` posée par le Worker, vérifiée par le déclencheur), avec des tests SQL des droits.
- **Parcours** : compte → famille et parents → campeurs → fiche médicale, médicaments, contacts d'urgence, personnes autorisées → choix de **plusieurs semaines d'un coup** (panier) avec places et âge vérifiés en direct → options (navette, buanderie, activités) → code promo vérifié → récapitulatif avec rabais et taxes → **paiement du dépôt en ligne** → confirmation par courriel. Ensuite : tableau de bord famille (statut de chaque inscription, fiches à compléter, solde, factures PDF, demande d'annulation ou de modification).
- **Opikawa** : FR/EN (le socle `langue.ts`, plutôt que Weglot), dossier de voyage, preuve d'assurance, navette YUL, langue d'immersion, suivi UTM.
- **Plus de pages d'attente de 10 s** : tout est fait par la base en une transaction.

## 5. Paiements (Stripe)

- Stripe Checkout pour le dépôt et les versements ; webhooks reçus par le Worker (`/api/inscriptions/stripe`), signature vérifiée, événement noté une seule fois (`evenements_stripe`).
- À décider : un compte Stripe par compagnie (probable : deux entités, deux taxes) ; garder ou non les factures Stripe, ou facturer dans QBO comme Réservations (SOP de la comptable).
- Interac, chèque et comptant saisis dans l'admin.

## 6. Courriels (remplace Make)

- API Gmail déjà en place : inscriptions@camptremblant.com (BPA), boîte Opikawa (à confirmer : messages@opikawa.com ou info@opikawa.com).
- Modèles modifiables dans Réglages (FR/EN), chaque envoi au journal ; reprendre les textes des scénarios Make (à relever, §10).

## 7. Liens avec les modules existants
- **Rooming** : campeurs placés dans les chambres d'un plan (aujourd'hui `Chambre` d'Airtable).
- **Animation** : groupes (aujourd'hui `Groupe`, 121 lignes) ; listes de campeurs par groupe pour les animateurs.
- **Cuisine** : diètes et allergies des campeurs de la semaine vers `commande.participants` / diètes par groupe.
- **Calendrier** : semaines de camp et nombre de campeurs par jour.
- **Véhicules** : navettes.
- **RH** : employés à la place d'`Employé` d'Airtable.

## 8. Migration et bascule
1. Les inscriptions 2026 ont été purgées d'Airtable ; on importe tout le reste (familles, parents, campeurs, fiches, dépôts, factures, paiements 2025-2026).
2. Script d'import `scripts/migration/inscriptions-airtable.mjs` (SQL généré hors dépôt, comme RH : données de familles), idempotent par identifiant Airtable ; essais répétés en DEV.
3. Comptes des familles : les mots de passe Softr ne se transfèrent pas → connexion par code envoyé au courriel du compte, rien à réinitialiser.
4. Bascule : Airtable en lecture seule, scénarios Make et automatisations Airtable coupés, DNS de app.camptremblant.com et app.opikawa.com vers Cloudflare, Softr retiré après une période de chevauchement.
5. **Date cible** : avant l'ouverture des inscriptions de l'été 2027 (à confirmer avec la direction).

## 9. Travail à deux (à régler avant de commencer)
- Aujourd'hui `CLAUDE.md` dit : un seul développeur, `dev` + `main`, un module à la fois, mise en ligne de tout `dev` par `/mise-en-ligne`. À deux, une mise en ligne de `dev` publierait le travail inachevé de l'autre.
- Proposition : une branche par chantier tirée de `dev` (ex. `inscriptions`), fusionnée dans `dev` par petites étapes terminées ; les migrations nommées à l'heure UTC évitent les collisions de noms, mais deux migrations qui touchent la même table doivent être coordonnées ; le module reste caché (`cacheSaufAdmins`) jusqu'à la bascule pour pouvoir être publié par morceaux sans gêner l'équipe. Mettre `CLAUDE.md` à jour ensemble.
- Poste Windows : `npm install`, Docker Desktop pour Supabase en local (`npm run db:start`), `npx supabase login`, `npx wrangler login`, GitHub CLI facultatif.

## 10. Décisions et questions (revue du 2026-10-16)

### Décidé
1. **Historique** : les inscriptions 2026 ont été purgées d'Airtable après l'été. On importe **tout ce qui reste** : familles, parents, campeurs, fiches, contacts, dépôts, factures et paiements 2025-2026 (sans les inscriptions perdues).
2. **Comptes** : **deux comptes séparés**, comme aujourd'hui — une famille BPA et une famille Opikawa sont distinctes, rien n'est partagé entre les deux portails (`familles.entreprise_id` obligatoire ; un même courriel peut exister une fois par compagnie).
4. **Échéancier et annulation** : règles d'aujourd'hui **gardées telles quelles** (dépôt non remboursable 100 $ BPA / 250 $ Opikawa, premier paiement 50 %, annulation 28 jours avant une semaine et 7 jours avant une option), en réglages par saison et par compagnie.
5. **Rapports** : **tous repris** (la trentaine de rapports des interfaces Airtable et de l'ADMIN) ; à lister un par un dans une phase dédiée.
8. **Domaines** : camptremblant.com et opikawa.com sont tous deux dans Cloudflare → app.camptremblant.com et app.opikawa.com seront des domaines personnalisés du Worker à la bascule.
10. **Ouverture des inscriptions 2027 : début décembre 2026** (≈ 7 semaines à partir du 2026-10-16). Voir §11.

### En attente — à trancher bientôt
3. **Stripe (URGENT)** : pas encore décidé. À trancher **avant la phase Paiements** et au plus tard début novembre si le dépôt doit se payer en ligne dès l'ouverture : paiement en ligne ou non à l'ouverture, un compte Stripe par compagnie, factures dans Stripe ou dans QuickBooks Online (comme Réservations).
6. **Visibilité de la santé** : il y **aura** des règles de visibilité (décision de principe) ; le détail par rôle (infirmerie, direction, coordos, animateurs) est à définir avant la phase Santé. La structure (espace `inscriptions_sante` à part) les permet déjà.
7. **Relevé 24** : le **NAS sera chiffré** (certain). Les relevés seraient produits ailleurs que dans l'app (à confirmer). Ce que la loi exige, d'après la recherche du 2026-10-16 (à faire confirmer par la comptable) :
   - le camp de vacances qui offre des services de garde admissibles doit remettre un RL-24 aux parents ; sans le NAS du payeur, pas de relevé (le parent peut refuser de le donner) ;
   - registres fiscaux : conservés **6 ans après la fin de la dernière année** à laquelle ils se rapportent (plus en cas d'opposition ou d'appel) ;
   - Loi 25 (loi sur le privé, art. 23) : ne recueillir que le nécessaire, puis détruire ou anonymiser une fois le but atteint et la durée légale passée.
   - → Si les RL-24 sont faits ailleurs : l'app ne garde peut-être pas le NAS du tout (seulement le transmettre). Si elle le garde : chiffré, lecture notée au journal, **effacé automatiquement 6 ans après l'année du relevé**.
9. **Make** : remis à plus tard (phase Courriels) ; les textes des courriels seront repris ou réécrits à ce moment.

## 11. Calendrier (ouverture début décembre 2026)

Sept semaines ne suffisent pas pour tout le plan. Ce qui doit être prêt **à l'ouverture** est ce dont une famille a besoin pour s'inscrire et ce dont l'équipe a besoin pour suivre les inscriptions ; le reste (santé sur place, premiers soins, rapports, Relevé 24) sert à l'été et peut suivre.

| Semaines | Livré |
|---|---|
| 1 (fin oct.) | Socle : schéma, droits, comptes famille (déclencheur adapté), catalogue 2027 saisi |
| 2-3 | Admin : familles, campeurs, sessions, listes d'attente, annulations |
| 3-5 | Portail BPA : compte, campeurs, fiches, inscription aux semaines et options, code promo, récapitulatif |
| 5-6 | Paiement du dépôt (selon la décision Stripe) + factures ; Opikawa (habillage, FR/EN, voyage) |
| 6 | Import Airtable, essais par l'équipe en DEV |
| 7 (début déc.) | Bascule des domaines, ouverture |
| Après l'ouverture | Santé et sur place, rapports, courriels (Make), Relevé 24, QBO |

À deux développeurs en parallèle : l'un sur le schéma et l'admin, l'autre sur le portail, une fois le schéma du socle fixé.

## 12. Phases proposées
1. **Socle** : schéma, droits, catalogue, comptes famille (déclencheur adapté), tests SQL des droits.
2. **Admin — familles, inscriptions, catalogue** (l'équipe peut tout saisir elle-même).
3. **Portail des familles BPA** (parcours complet sans paiement en ligne).
4. **Paiements et facturation** (Stripe, factures, QBO).
5. **Santé et sur place** (fiches à valider, médicaments donnés, premiers soins).
6. **Opikawa** (FR/EN, voyage, assurance).
7. **Courriels** (remplace Make).
8. **Import et bascule**.
