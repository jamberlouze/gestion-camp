# Plan — module Réservations de groupes

Version 2, du 2026-10-08. Elle remplace la version 1, bâtie sur le prototype Airtable. **À valider par Maxime avant toute construction.**

## 0. Ce que le module remplace

La source de vérité d'aujourd'hui n'est pas Airtable. C'est un ensemble de fichiers :

| Outil d'aujourd'hui | Rôle | Dans l'app |
|---|---|---|
| **Jotform** → onglet JOTFORM | Formulaire de demande | Formulaire public de l'app (§8) |
| **« Demande de réservation BPA \| 2026-27 »** › INFOS Demandes | Une ligne par demande, étapes en ✅/❌, CRM dans « Notes internes » | Réservations + étapes + CRM structuré (§2, §4, §7) |
| › CONTRATS et FACTURES + **autoCrat** (12 tâches) | Contrats, factures 1 et 2, pré-arrivée en PDF | Contrats et pré-arrivée générés par l'app (§5) ; **factures produites dans QuickBooks Online**, selon le SOP de la comptable (§6) |
| › États de comptes | Versements 1 à 4, retards | QuickBooks Online, lu par l'app (§6) |
| › Groupe par mois, Comparatif par mois, Type de séjours, Jour/usager/type | Rapports | Onglet Rapports, corrigé et enrichi (§12) |
| **« Estimés \| Accueil de groupe 2026-27 »** (296 onglets, un par client) | Calcul de l'estimé et de la facture finale | Calcul de l'estimé dans l'app (§3) |
| Gabarits Google Docs et Sheets (contrats, factures BPA et Opikawa, pré-arrivée) | Mise en page | Modèles de l'app, modifiables dans Réglages |

Le prototype Airtable (« GLITCH », jamais déployé) est **abandonné**. On garde trois de ses bonnes idées :
- le calcul des repas d'après les heures d'arrivée et de départ ;
- les 5 calendriers Google ;
- le formulaire de fiche participant.

### Ce que l'analyse a révélé

- **Les prix ne sont jamais figés.** Chaque onglet d'estimé lit la liste de prix en direct. Quand un prix change, les vieux estimés et factures changent aussi : les acomptes payés en 2025-26 ne correspondent plus aux totaux affichés. → L'app copie le prix dans le document au moment où il est fait.
- **Tout tient par la position des lignes.**
  - Le numéro de réservation est calculé à partir de la position de la ligne (`ROW()-21`).
  - Les onglets sont reliés entre eux par position. Trier une ligne décale les statuts, les montants et les paiements.
  - → Dans l'app, un numéro est donné une fois et ne change plus.
- **De l'argent est perdu aujourd'hui** (détail en §16) :
  - repas jamais facturés en Location de salle ;
  - 2 lignes d'extras jamais reportées dans l'estimé Accueil de groupe ;
  - facture 2 à 50 % pour Accueil et Location, alors que le contrat dit 75 % ;
  - facture Accueil en erreur `#REF!`.
- **Les rapports se trompent :**
  - la location de salle n'est jamais comptée ;
  - décembre est compté 3 fois ;
  - une demande compte 1 097 nuits ;
  - des lignes sont hors des plages calculées.
- **Le CRM est une seule colonne de texte libre.** Elle mélange le journal (`jj-mm : action (initiale)`, sans année), le statut, la raison de perte, la prochaine action, le responsable et la source.
- **« Closed lost » n'existe pas comme valeur.** On le code par ❌ dans « Facture finale envoyée ».
- **Opikawa** facture certains groupes, avec ses propres gabarits, numéros de taxes et réponse Interac (3 documents en 2026-27). Maxime confirme : on garde Opikawa comme 2e compagnie (TPS 764169736 RT0001, TVQ 1226925003 TQ0001).
- **SOP de la comptable** (« Facturation des groupes dans QuickBooks Online ») :
  - QBO devient la source de vérité financière dès que le devis est accepté ;
  - les factures sont des **factures progressives QBO** tirées d'un **devis QBO** ;
  - plus de PDF de facture produit hors de QBO.
  - L'app reprend le rôle du fichier Excel (calcul, devis, négociation, acceptation) et fait elle-même les étapes QBO du SOP (§6).

## 1. Organisation et contacts (CRM, déjà en ligne)

- Client = `crm.organisations` ; personnes = `crm.contacts`. Le CRM est en PROD, réservé aux admins pendant les essais.
- On ajoute à l'organisation le **type d'organisation** du formulaire : École, Particulier, OSBL/OBNL, Entreprise privée, Club sportif, Ville ou municipalité, Association étudiante, Autre.
- On ajoute aussi l'**adresse de facturation** structurée (adresse, ville, province, code postal). Elle s'imprime sur les documents. Aujourd'hui, elle est toujours vide dans INFOS, alors que Jotform la reçoit dans 98 % des cas.
- **Trois rôles de contact par réservation** : responsable de la réservation, responsable de la facturation (s'il est différent), courriel de la direction ou du secrétariat.
- **Dédoublonnage** (décision de Maxime) :
  - rien n'est relié automatiquement ;
  - chaque demande arrive « À valider » avec des suggestions : même courriel ou téléphone d'un contact, puis nom semblable, puis même ville ;
  - un clic relie la demande ou crée une nouvelle organisation.

## 2. La réservation

Une ligne de `reservations.reservations` :

**Identification**
- **Numéro** `AA-G-nnn` : AA = **exercice** de la date d'arrivée (octobre à septembre, désigné par l'année où il se termine : 27 = 2026-27) ; nnn = compteur sur 3 chiffres.
  - Il est **figé à la création**, même si les dates changent d'exercice. Il est imprimé sur les documents et sert de question Interac.
  - Le compteur 27 repart après le plus grand numéro importé, et l'app saute les numéros déjà pris (les 19 dossiers repris de 2025-26 vont de 386 à 528).
- **Compagnie qui facture** : GBPA+ par défaut, Opikawa possible (confirmé par Maxime). Elle choisit les modèles, le logo, les numéros de taxes, la réponse Interac, le spécimen de chèque et le dossier QBO.

**Forfait**
- Classe nature, Journée plein air, Accueil de groupe, Location de salle. C'est ce qui choisit le calcul, le contrat et l'échéancier.
- **Variante**, pour les rapports :
  - Classe **verte / blanche / rouge** : proposée selon le mois d'arrivée (vérifié sur 2025-26 et 2026-27 : verte = mai-juin, blanche = décembre-février, rouge = septembre-octobre), modifiable ;
  - Location de salle **jour / soir / sur mesure**.
- On garde le **forfait demandé** (formulaire) à côté du **forfait retenu** : ils diffèrent dans 7 cas en 2026-27.

**Séjour**
- Dates et heures, « heures régulières ? », nombre de nuits et de jours.
- Participants (élèves ou personnes), accompagnateurs, âges et niveaux, langue, description du groupe, commentaires du client.
- Ratio d'animation (1:10, 1:15, 1:20, 1:30, 1:X, sans animation) et animateurs requis (calculés).
- Repas : déjeuners, dîners, soupers, collations. Proposés d'après les heures, modifiables.
- **Sections et étages réservés** (CH, CB, PB, PH, VFB, VFH, Motel…) : lus dans la référence de **Rooming**. Ses lits concordent avec la liste de prix (CH 36, CB 28, PB 37, PH 32, VFB 23, VFH 36). Les tableaux de lits des contrats actuels, eux, sont périmés (CH 34, PB 36…).
- **Salles** : salle à manger, salle vitrée, cuisine, salon Cèdres, salon VF, cuisinette VF.

**Suivi**
- Étape (§4), responsable interne (un compte), source ou référence, raison de perte.
- Notes au contrat (imprimées sur le contrat : clause particulière, n° de bon de commande…), rétroaction après le séjour.
- Dépôt de sécurité (Accueil, Location) : pris le, relâché ou encaissé, montant.
- Référence d'origine : n° de soumission Jotform, pour l'import.

**Plusieurs réservations pour une même demande** sont permises : on scinde un groupe en deux, ou on combine.

## 3. Calcul de l'estimé (repris du chiffrier, formule par formule)

Toutes les règles ci-dessous ont été vérifiées sur des onglets réels :
- 27-G-055 et 27-G-083 : 156,10 $ par élève et 96,35 $ par accompagnateur ;
- 27-G-014 : 179,73 $ avec 6 heures en extra ;
- 27-G-002 et 27-G-012 : Accueil de groupe ;
- 26-G-363 : facture finale 2025-26.

**Critère de réussite** : l'app refait chaque estimé 2026-27 du chiffrier au cent près, sauf les erreurs connues (§16). Un test automatique le vérifie.

**Classe nature** : un prix **par élève**, qui additionne :
- **Nuitée** : 32,50 $ × nuits, mais **37,50 $ s'il n'y a qu'une nuit** (+5 $, réglable) ;
- **Repas** : 19,40 $ × nombre de repas ;
- **Animation** : prix du ratio × **jours**, jour d'arrivée et jour de départ compris (1:10 26,50 $, 1:15 23,50 $, 1:20 20,50 $, 1:X 20,50 $, sans animation 0) ;
- **Heures en extra** : (prix d'animation ÷ 8) × heures hors des heures normales (10 h à 14 h).

Autres lignes de l'estimé :
- **Accompagnateur payant** = ½ des nuitées + tous les repas, sans animation.
- **Gratuités** = plancher(élèves ÷ 20), **toujours 1:20 quel que soit le ratio** (réglable).
- Accompagnateurs payants = accompagnateurs − gratuités, minimum 0.
- Libellé de l'estimé : « Forfait Classe nature (ratio d'animation 1:15) | 1 nuit, 2 jours, 4 repas » × élèves, ligne « Gratuité professeur / accompagnateur (1:20) » à 0 $, ligne « Professeur / accompagnateur supplémentaire (tarif spécial) ».

**Journée plein air** : un prix **par élève** :
- repas (0 ou 1 dîner, la collation n'est pas facturée) ;
- animation par journée (1:10 46 $, 1:15 42 $, 1:20 38 $, 1:X 34 $).

Accompagnateur payant = le repas seulement. Gratuités comme en Classe nature.

**Accueil de groupe** :
- **Hébergement** : **prix de la section par nuit**, peu importe le nombre de personnes. Une ligne par section, quantité = nuits.
  - Prix de la section = **lits de la section (lus dans Rooming) × prix du lit** (25,20 $ en 2026-27). Maxime l'a confirmé : c'est au prorata des lits, toujours.
  - Ça corrige la Vieille-France haut (907,20 $, au lieu de 827 $ tapé) et le site complet (192 lits, au lieu de 190).
  - Les Pins haut ne se vendent pas seuls.
- **Repas** : nombre de repas × 19,40 $ × personnes. Le libellé « (19,40 $ par personne) » est désormais tiré du prix ; aujourd'hui, il est tapé et dit encore 18,50 $.
- Pas de gratuité, pas d'animation.

**Location de salle** :
- forfait (jour 9 h-17 h 840 $, soir 16 h-23 h 1 092 $, journée complète 9 h-23 h 1 815 $) ;
- heures supplémentaires 210 $/h ;
- **repas** (oubliés par le modèle actuel) ;
- accès à la cuisine ;
- extras.

**Extras, pour tous les forfaits** :
- Un catalogue où chaque produit a un **code**, une **unité** (par personne, par jour, par nuit, par heure, par voyage, forfait…), un prix par exercice et une note de minimum (« Min 30 personnes », « min. 20 billets »). La note est affichée comme avertissement, sans blocage.
- **Produits de fournisseurs** : coût du fournisseur × majoration → prix.
  - Billets et activités : × 1,15. Mont-Blanc : arrondi au dollar supérieur.
  - Transport : × 1,15 (Maxime, 2026-10-08 : le 2e × 1,15 du chiffrier n'était qu'une protection en attendant les hausses du fournisseur).
  - Vélo : × 1,15 + 1 $.
  - La majoration est réglable par produit.
- Les surveillances de soirée (150 $) et de nuit (300 $) entrent au catalogue. Aujourd'hui, elles sont tapées à la main.

**Rabais** : une ligne négative, en montant ou en % d'un sous-total (ami de la BPA −5 %, basse saison −15 %, partenariat −10 %, gratuité d'une ligne…). Toujours avant taxes.

**Note de ligne** : un texte en italique sous une ligne (« Les lunchs du 5 et 6 janvier, pour emporter »), comme dans les PDF actuels.

**Taxes** : TPS 5 % et TVQ 9,975 % sur le sous-total, rabais compris, **arrondies au cent** sur chaque document. Aujourd'hui, rien n'est arrondi, d'où des écarts de 1 à 5 ¢ dans les soldes.

**Prix figés** : l'estimé copie chaque prix. Changer la liste de prix ne touche jamais un document existant.

## 4. Étapes d'une réservation

**Parcours** : Nouvelle demande → Contact établi → Estimé envoyé → Estimé accepté → Contrat envoyé → **Confirmée** (contrat signé) → Pré-arrivée envoyée → Séjour terminé → Facture finale envoyée → **Soldée**.

**Hors parcours :**
- **Closed lost**, avec raison obligatoire : prix ou budget, dates indisponibles, a réservé ailleurs, installations inadaptées, projet annulé ou non approuvé (conseil d'établissement, centre de services), aucune réponse (ghost), simple demande d'information, trop loin, redirigé vers Airbnb, transféré à Opikawa, autre.
- **Annulée après signature** : frais d'annulation calculés selon la grille (§5).
- **En attente** : stand by, reportée.

**Automatismes :**
- « Ajouté au calendrier » se fait tout seul (§10).
- Les cases ✅/❌ deviennent l'étape et les dates de chaque passage (date de l'estimé, date de signature…).

**Vues reprises de tes vues filtrées** : Nouvelles demandes, Demandes actives, Non confirmées, Closed lost, Événements complétés, Factures finales à envoyer, Soldes à régler, Paiements en retard.

## 5. Règles de facturation (tableau à valider)

Légende :
- ✔ = écrit clairement dans un contrat ou le chiffrier, ou confirmé par Maxime ;
- ⚠ = choisi par Claude, parce que les contrats sont flous ou se contredisent.

**Validé par Maxime le 2026-10-08** : il a commenté P12, F1, F3, F6, F7, F8, F10, F17, F18 et F21 (reportés ci-dessous). Les règles qu'il n'a pas commentées sont tenues pour acceptées.

Forfaits : **CN** = Classe nature, **JPA** = Journée plein air, **AG** = Accueil de groupe, **LS** = Location de salle.

### A. Calcul de l'estimé

| # | Règle | Forfaits | Statut |
|---|---|---|---|
| P1 | Chaque prix est **copié dans l'estimé** au moment où il est fait. Changer la liste de prix ne touche jamais un document existant. | tous | ⚠ (aujourd'hui, rien n'est figé) |
| P2 | Prix de l'**exercice de la date d'arrivée** (octobre à septembre). Sans prix pour cet exercice : les plus récents. | tous | ⚠ |
| P3 | Nuitée par élève et par nuit : 32,50 $ ; **37,50 $ s'il n'y a qu'une nuit**. | CN | ✔ chiffrier |
| P4 | Repas : 19,40 $ par personne et par repas. | tous | ✔ |
| P5 | Animation par élève, selon le ratio : **par jour**, jour d'arrivée et jour de départ compris (CN) ; par journée (JPA). | CN, JPA | ✔ |
| P6 | Heures en extra : (prix d'animation ÷ 8) × heures en dehors de 10 h à 14 h, par élève. | CN | ✔ |
| P7 | **Gratuité** : 1 accompagnateur gratuit par tranche complète de 20 élèves, quel que soit le ratio. | CN, JPA | ✔ |
| P8 | Accompagnateur payant : ½ des nuitées + les repas (CN) ; les repas seulement (JPA). | CN, JPA | ✔ |
| P9 | Section = **lits de la section × prix du lit (25,20 $)**, par nuit, peu importe le nombre de personnes. | AG | ✔ (Maxime : au prorata des lits) |
| P10 | Repas = nombre de repas × prix × personnes. | AG | ✔ |
| P11 | Salle :<br>• forfait jour 840 $, soir 1 092 $, journée complète 1 815 $ ;<br>• heures supplémentaires 210 $/h ;<br>• **les repas sont facturés** (le modèle actuel les oublie). | LS | ✔ |
| P12 | Fournisseurs = coût × majoration :<br>• × 1,15, **transport compris** ;<br>• Mont-Blanc arrondi au dollar supérieur. | tous | ✔ Maxime : transport × 1,15 seulement (migration 20261008210842) |
| P13 | Rabais = ligne négative (en montant ou en %), avant taxes. | tous | ✔ |
| P14 | Minimums (30 personnes, 6 h, 20 billets…) : simple avertissement, pas de blocage. | tous | ⚠ |
| P15 | TPS 5 % et TVQ 9,975 % sur le sous-total, **arrondies au cent**. | tous | ✔ taux / ⚠ arrondi |
| P16 | Repas proposés d'après les heures (déjeuner 8 h, dîner 12 h, souper 17 h 30), modifiables. | tous | ⚠ |
| P17 | Estimé automatique dès la demande :<br>• ratio par défaut **1:15** (le plus choisi) en CN ;<br>• en AG, sections libres proposées par l'app, envoi approuvé d'un clic. | CN, AG | ✔ (Maxime : « on peut commencer comme ça ») / ⚠ 1:15 |

### B. Facturation et paiement (selon le contrat et le SOP)

| # | Règle | Forfaits | Statut |
|---|---|---|---|
| F1 | Chaque acompte = **% du montant avant taxes + les taxes**. Dans QBO, c'est une facture progressive du devis. | tous | ✔ (Maxime, SOP) ; façon de faire dans QBO : voir §6 (Q12) |
| F2 | Échéancier :<br>• **25 / 50 / 25** en CN et JPA ;<br>• **25 / 75** en AG et LS ;<br>• toute autre répartition convenue peut être réglée par réservation. | tous | ✔ contrats, SOP |
| F3 | **Acompte 1 (25 %)** : facturé à la signature du contrat, **payable sur réception**. C'est la réception de ce paiement qui confirme la réservation. | tous | ✔ Maxime. Le contrat dit encore « 14 jours après la signature » : clause à harmoniser dans le modèle (phase 2) |
| F4 | **Acompte 2** (50 % en CN et JPA, **75 %** en AG et LS) : dû 21 jours avant l'arrivée, facturé 14 jours avant son échéance. | tous | ✔ contrat / ⚠ AG et LS à 75 % (le gabarit actuel facture 50 %) |
| F5 | **Facture finale** = valeur finale du contrat − tout ce qui a déjà été facturé. C'est la dernière facture progressive. Le devis QBO est ajusté d'abord. | tous | ✔ SOP |
| F6 | **Bris et frais hors forfait** (dommages, ménage exceptionnel, matelas…) : **facture séparée**, jamais sur la facture finale, pour ne pas gonfler le montant du séjour dans les rapports. En AG et LS, il n'y a de facture finale que si le séjour lui-même a changé (ajouts, repas sous le minimum). | tous | ✔ Maxime |
| F7 | Facture finale **payable sur réception** (factures séparées aussi). | tous | ✔ Maxime. Le contrat CN et JPA dit « 14 jours » : à harmoniser dans le modèle (phase 2) |
| F8 | **Réservation tardive** (signature moins de 35 jours avant l'arrivée) : acomptes 1 et 2 réunis en une facture, payable sur réception (F3). | tous | ✔ Maxime |
| F9 | Changement de nombre : avis par courriel **au moins 21 jours avant l'arrivée**. Après, c'est le nombre de l'estimé qui est facturé. | tous | ✔ contrat |
| F10 | **Minimum 90 %** : si le nombre réel est sous 90 % des participants de l'estimé, on facture au moins 90 % du total de l'estimé. Les accompagnateurs ne comptent pas. | CN, JPA | ✔ Maxime |
| F11 | **Minimum 90 %** : repas facturés ≥ 90 % du coût des repas de l'estimé. | AG, LS | ✔ |
| F12 | Ne baisse jamais : l'hébergement (AG), la salle (LS), le forfait individuel (CN, JPA). | — | ✔ |
| F13 | Ajout ou changement **avant l'arrivée** : nouvelle version de l'estimé envoyée au client. Le devis QBO est ajusté, et les factures progressives qui restent suivent le nouveau total. | tous | ✔ contrat, SOP |
| F14 | Ajout **au séjour pendant le séjour** (repas, nuitée, activité) : devis ajusté, puis facture finale. Bris : facture séparée (F6). | tous | ✔ |
| F15 | Ajout **après la facture finale** : nouvelle facture. Réduction après la facture finale : **note de crédit**, jamais de facture modifiée. | tous | ✔ SOP |
| F16 | **Annulation** : on retient 25 % (60 jours ou plus avant l'arrivée), 60 % (30 à 59 jours) ou 80 % (moins de 30 jours) du total taxes comprises. | tous | ✔ / ⚠ base taxes comprises |
| F17 | Montant d'annulation à payer = palier − déjà facturé. S'il a été facturé plus que le palier : note de crédit et remboursement. | tous | ✔ Maxime |
| F18 | ~~Annulation avant le paiement de l'acompte : les 25 % sont dus.~~ **Retirée** : en pratique, on ne l'exige jamais. Une demande annulée avant le paiement de l'acompte se ferme sans frais. | tous | ✔ Maxime |
| F19 | **Dépôt de sécurité** préautorisé par carte à l'arrivée, hors de l'app : 2 000 $ en AG, 1 000 $ en LS. | AG, LS | ✔ |
| F20 | **Défaut de paiement** : annulation possible, sans remboursement. Pas d'intérêts. | tous | ✔ |
| F21 | **Contrat à signer dans les 7 jours**, sinon les dates peuvent être libérées. Rappel au 5e jour. | tous | ✔ Maxime |
| F22 | Numéro de réservation `AA-G-nnn` (exercice de l'arrivée, figé). **Numéros de facture donnés par QBO** ; l'app les relie à la réservation. | tous | ✔ Maxime (Q10) |
| F23 | Compagnie :<br>• **GBPA+** : TPS 704647619 RT0001, TVQ 1230915446 TQ0001, réponse Interac BPAMT ;<br>• **Opikawa** : TPS 764169736 RT0001, TVQ 1226925003 TQ0001, réponse Interac OPIMT. | tous | ✔ |
| F24 | Paiement :<br>• comptant sur rendez-vous ;<br>• Interac à inscriptions@ (question = n° de réservation) ;<br>• chèque ;<br>• dépôt direct (spécimen en dernière page du contrat et joint au devis QBO). | tous | ✔ |
| F25 | Les paiements sont **entrés dans QBO** par l'adjointe (SOP), qui reste la source. L'app ne fait que les relire. | tous | ✔ SOP |

### Les documents produits par l'app

- **Estimé** :
  - mise en page actuelle : cases des 4 forfaits, contact, lignes avec notes en italique, note sur les prix des fournisseurs, totaux ;
  - versions : un estimé envoyé est figé ;
  - logo de la compagnie qui facture.
- **Contrat** :
  - les 4 modèles 2026-27 et les modèles Opikawa (CN, AG) ;
  - champs remplis par l'app, estimé accepté en annexe, spécimen de chèque de la compagnie en dernière page ;
  - pré-signé par la direction (« Signé par Marco Patriarco le … à Mont-Tremblant ») ; le signataire se règle dans Réglages ;
  - signature électronique du client (§8).
  - Corrections apportées aux modèles, **approuvées par Maxime le 2026-10-09** :
    - acompte et facture finale payables sur réception ; bris et frais hors forfait sur une facture séparée ;
    - VFH et VFB inversés ;
    - « Souper : <<Dîner>> » en LS ; « chèque » → « paiement » dans la clause d'annulation de LS ;
    - restes d'un copier-coller en JPA ;
    - coquilles ;
    - tableaux de lits tirés de Rooming.
- **Pré-arrivée** (CN et JPA, 30 jours avant l'arrivée) : résumé à confirmer, informations pour les accompagnateurs, rappels de ce qui est dû à J−21 (formulaires de santé, liste des participants par groupe ; en CN, l'horaire et le plan des étages).
- **Factures** : produites **dans QBO** (§6), jamais par l'app, comme le demande le SOP. Leur mise en page est le modèle de facture de QBO : logo, numéros de taxes et consignes de paiement à y mettre.

## 6. QuickBooks Online : l'app fait les étapes du SOP

Le SOP de la comptable dit : Excel pour calculer et négocier, QBO dès que le devis est accepté. L'app remplace Excel et fait elle-même les étapes QBO que l'API permet.

**Limite de l'API, vérifiée le 2026-10-08** dans la référence officielle de l'objet Invoice d'Intuit : « Only one link can be made to an Estimate. Progress Invoicing is not supported via the API. »
- Dans l'écran de QBO, un devis se découpe bien en factures progressives par pourcentage : la comptable a raison.
- Par l'API, une seule facture peut être liée à un devis. L'app ne peut donc pas créer elle-même les 2 ou 3 factures progressives d'un même devis.

| Étape du SOP | Par l'app (API) | Remarque |
|---|---|---|
| Vérifier ou créer le client | ✅ l'app cherche le client (nom, courriel), le relie une fois pour toutes à l'organisation du CRM, met à jour l'adresse et le contact, ou le crée. Conditions de paiement du client : **payable sur réception**. | Deux dossiers QBO : GBPA+ et Opikawa (Q8) |
| Recréer le devis accepté | ✅ à la signature du contrat ; joint le contrat signé et le spécimen de chèque | Lignes par produit et service QBO (Q9) |
| Contrôle : total QBO = total accepté | ✅ automatique ; s'il y a un écart, la facturation s'arrête et une alerte part | |
| **Factures progressives** (25 %, 50 % ou 75 %, solde) | ❌ **pas par l'API** : voir Q12 | |
| Ajuster le devis avant la facture finale | ✅ nombre réel, ajouts, minimum de 90 % | Les factures émises ne sont jamais touchées |
| **Facture séparée** (bris, hors forfait) | ✅ facture indépendante du devis | F6 |
| Note de crédit (réduction après la facture finale) | ✅ | F15, F17 |
| Recevoir un paiement | Reste dans QBO (l'adjointe, compte 1000 - Compte Chèque) | SOP |
| État de compte | ✅ l'app relit les factures et leurs soldes toutes les 15 minutes ; elle note **les numéros de facture de QBO** sur la réservation (Q10) | |

**Q12 — Comment faire les factures progressives ?** **Réponse de Maxime (2026-10-09) : façon A.** Les deux façons étudiées :
- **A. Un clic dans QBO, le reste par l'app** (recommandé) :
  - l'app crée le devis ;
  - au bon moment, elle crée une tâche « Facturer 25 % du devis 27-G-054 dans QBO » ;
  - l'adjointe fait « Créer une facture → 25 % » dans QBO (une minute) ;
  - l'app retrouve la facture toute seule (elle est liée au devis), note son numéro, envoie le PDF officiel au client depuis inscriptions@ et suit le paiement.
  - Le SOP est respecté à la lettre, et le rapport « Estimations et facturation progressive » de QBO reste juste.
- **B. Tout par l'app** :
  - l'app crée elle-même chaque facture (25 %, 50 %, solde), avec les lignes du devis au prorata ;
  - seule la première est liée au devis.
  - QBO ne sait donc plus ce qui reste à facturer sur le devis : c'est l'app qui le suit. Le SOP serait à ajuster.

**Estimé de l'app et devis QBO : pas de double saisie.** Le SOP prévoit un estimé, puis un devis QBO. Avec la façon A, le devis QBO reste nécessaire, parce que « Créer une facture → % » ne part que d'un devis QBO. Mais personne ne le saisit :
- l'estimé de l'app est le document commercial : calcul, versions, envoi au client, acceptation ;
- à la signature, l'app crée le devis QBO toute seule, par l'API, avec les lignes de l'estimé accepté. Il ne part jamais au client ; il sert seulement de base aux factures dans QBO ;
- si l'estimé change avant la facture finale (F13, F14), l'app met le devis QBO à jour.
- À vérifier dans la compagnie d'essai QBO : qu'un devis créé par l'API se facture bien par pourcentage dans l'écran de QBO.

**En attendant que cette phase soit en ligne**, l'app crée les mêmes tâches « À facturer dans QBO », avec les montants à recopier ; l'adjointe suit le SOP à la main.

## 7. CRM intégré à la réservation

- **« Notes internes » devient un journal structuré** (échanges du CRM, reliés à la réservation) :
  - date complète, avec l'année ;
  - canal : appel, message vocal, texto, courriel, visite du site, rencontre ;
  - auteur posé tout seul, au lieu des initiales (N, V, Y, C, A).
- **Prochaine action et date de relance** : une relance du CRM liée à la réservation (« Relancer fin octobre si contrat non signé »). Elle apparaît dans l'onglet Relances du CRM et dans « Ma journée ».
- **Responsable interne** (« Charlotte s'en occupe »), **source** (« amie de Vickie »), **raison de perte** : des champs, plus du texte.
- La fiche d'une organisation montre toutes ses réservations. Le statut client, prospect ou inactif du CRM se calcule à partir des vraies réservations.

## 8. Formulaire public et page client

**Formulaire de demande** (remplace Jotform) :
- **Les mêmes questions que Jotform, mot pour mot**, avec la même logique conditionnelle :
  - une seule date pour JPA et Location, arrivée et départ sinon ;
  - la question des heures normales propre au forfait ;
  - jour, soir ou sur mesure pour la Location ;
  - élèves ou personnes ;
  - accompagnateurs et âges pour les écoles ;
  - responsable de la facturation seulement s'il est différent.
- Page publique, protégée contre les robots (Cloudflare Turnstile, gratuit), intégrable au site camptremblant.com.
- Crée une « Nouvelle demande » à valider (§1) et envoie un accusé de réception (courriel : phase 5 ; en attendant, l'écran de remerciement donne le numéro de la demande).
- **Fait (phase 3, DEV)** : coquilles du Jotform corrigées ; les heures normales et le prix du repas (19,40 $ en 2026-27, le Jotform disait encore 17,50 $) viennent des réglages et du catalogue.

**Page client sans compte** : un lien secret par réservation. Le client peut :
- voir l'estimé et **l'accepter** ;
- **signer le contrat** ;
- télécharger ses factures ;
- faire remplir les fiches participants.

**Signature électronique intégrée** :
- le client tape son nom, coche « j'ai lu et j'accepte », puis signe au doigt ou à la souris ;
- l'app note la date, l'heure, l'adresse IP et l'empreinte du PDF ;
- le PDF signé est conservé et envoyé aux deux parties ;
- c'est valide au Québec et ça ne coûte rien ;
- **à tester tôt** : la phase 2 le livre en DEV pour que Maxime l'essaie.

## 9. Courriels automatiques

Tous les courriels partent de **inscriptions@camptremblant.com**, par l'API Gmail déjà en place : ils apparaissent dans ses « Envoyés ». Chaque envoi est noté dans le journal de la réservation et dans le CRM. Les modèles sont modifiables dans Réglages. Chaque courriel peut être mis en mode « automatique » ou « préparé, à approuver d'un clic ».

| Courriel | Déclencheur | Mode par défaut |
|---|---|---|
| Accusé de réception | demande reçue | automatique |
| Estimé | demande reçue | automatique en CN (ratio 1:15 par défaut), JPA et Location jour/soir ; **à approuver d'un clic en Accueil de groupe** (sections proposées) et en Location sur mesure |
| Contrat à signer | estimé accepté par le client | automatique |
| Rappel de signature | contrat non signé 5 jours après l'envoi | automatique |
| Facture d'acompte 1 (PDF de QBO) | contrat signé : devis QBO + facture progressive de 25 % | automatique |
| Facture d'acompte 2 (PDF de QBO) | 14 jours avant J−21 | automatique |
| Rappel de paiement | 3 jours avant l'échéance, puis à l'échéance si impayé (lu dans QBO) | automatique |
| Pré-arrivée + lien des fiches participants | 30 jours avant l'arrivée | automatique |
| Rappel des formulaires | J−25 si fiches incomplètes | automatique |
| Facture finale (PDF de QBO) | lendemain du départ : **tâche « prête à facturer »** (il faut le nombre réel, les ajouts et les bris), puis devis QBO ajusté et dernière facture progressive, d'un clic | à approuver |
| Suivi post-séjour (merci + sondage) | 2 jours après le départ | automatique |
| Relance pour l'an prochain | règles du CRM | relance interne, pas de courriel |

## 10. Google Agenda et Airbnb

Inchangé par rapport à la version 1, avec les ajouts de Maxime.

- L'app écrit dans tes 5 calendriers (Demande, Estimé, Contrat, Confirmée PP, Confirmée VF), jamais l'inverse.
- **Confirmée VF bloque Airbnb.** On y met seulement les réservations confirmées qui utilisent la VF, mises à jour ou retirées tout de suite. Jamais d'essai depuis la DEV sur le vrai calendrier.
- **Réservations Airbnb de la VF** :
  - lues dans l'iCal d'Airbnb toutes les 15 minutes ;
  - elles arrivent comme réservations confirmées « à compléter » (`source = 'airbnb'`) ;
  - un conflit est signalé et la VF ne peut pas être confirmée par-dessus ;
  - elles ne sont jamais réécrites dans Confirmée VF.
  - Deux annonces Airbnb : **la Vieille-France complète** et **l'étage du bas seulement**. Une réservation de la première bloque VFB et VFH ; une de la seconde bloque VFB seulement.
  - Adresses iCal fournies par Maxime le 2026-10-08 : dans `.dev.vars` en DEV (hors Git), et en secrets Cloudflare `AIRBNB_ICAL_VF_COMPLET` et `AIRBNB_ICAL_VF_BAS` en PROD.
- **Disponibilité** : à la saisie, l'app signale tout chevauchement de sections ou de salles avec une autre réservation confirmée.

## 11. Fiches participants (données de santé)

- Remplacent les « formulaires santé et allergies » exigés à J−21 par les contrats. Champs : allergies, Epipen, problèmes médicaux, diète, autorisation de médicaments, matricule ; aussi pour les professeurs et les accompagnateurs.
- Lien public par réservation, envoyé avec la pré-arrivée ; suivi du nombre de fiches reçues sur le nombre attendu.
- Accès limité à un rôle précis. Cuisine ne voit que des totaux (repas sans gluten…).
- **Fait (phase 3, DEV)** : questions du formulaire du prototype Airtable (matricule, allergies ou santé, Epipen, diète, médicaments en vente libre), pour les élèves et les adultes ; accès « Réservations › Fiches participants » dans la grille (admins au départ) ; effacé : nom, classe, matricule, santé, diète, médicaments ; gardé : le groupe, les dates, le type de fiche et le courriel seulement avec le consentement. Le lien vers la Cuisine (totaux par repas) viendra plus tard.
- **Effacement automatique 3 mois après le départ** (Loi 25 ; durée réglable) **des données de santé seulement** : allergies, Epipen, problèmes médicaux, diète, autorisation de médicaments.
- **On garde** (réponse de Maxime du 2026-10-08) : les adresses courriel et les informations génériques (groupe, date de la visite, forfait, etc.).
  - Garder un courriel pour écrire plus tard à la personne demande son consentement (Loi 25, loi anti-pourriel) : la fiche aura une case « J'accepte de recevoir des nouvelles de la BPA », non cochée par défaut.

## 12. Rapports

**Repris, et corrigés :**
- Revenus par mois sur 3 exercices. Les chiffres mensuels 2023-24 et 2024-25 sont importés comme référence.
- Groupes par mois.
- Montants et jours-usagers par forfait et par variante.

**Ajoutés** (les données existent déjà) :
- Entonnoir et taux de conversion par forfait et par type d'organisation (2025-26 : Accueil 141 → 101 → 42 → 38 ; écoles 95 demandes → 43 signatures, 82 % du revenu).
- **Rythme de réservation** : signé à ce jour comparé à la même date l'an passé.
- Prévision pondérée : estimés envoyés × taux de conversion.
- Raisons de perte.
- Délais : demande → signature (médiane d'environ 35 jours), signature → arrivée.
- Occupation par section et par date (lits × nuits).
- Trois mesures distinctes : **signé** (contrat), **facturé au réel** (facture finale), **encaissé** (QBO). Aujourd'hui, tout repose sur l'estimé.

## 13. Liens avec les autres modules

- **CRM** : organisations, contacts, échanges, relances (§1, §7).
- **Calendrier** : lit les réservations directement. La synchro Airtable et le secret AIRTABLE_TOKEN sont retirés.
- **Rooming** : référence des sections et des lits (§2).
- **Plus tard** : Cuisine (repas et diètes par jour), Horaire d'animation (animateurs requis).

## 14. Migration et bascule

- **2026-27 : données vivantes**, importées à la bascule :
  - les 143 demandes, avec les numéros tels quels, les étapes déduites des cases et des notes, les notes découpées en échanges datés ;
  - les paiements d'États de comptes ;
  - les liens vers les PDF déjà produits.
  - Pour une réservation déjà signée, l'estimé accepté est importé en une ligne au montant de l'estimé, avec le lien vers son PDF. Les factures qui restent à faire sont produites par l'app.
- **2025-26** : historique (247 demandes) pour les rapports et le CRM. Il sert aussi de **données d'essai en DEV**.
- **Listes de prix** : 2026-27 tirée du chiffrier ; 2025-26 tirée d'Airtable et des onglets 26-G.
- **Données personnelles** : les imports se font par script hors du dépôt Git, comme pour Copper.
- **Bascule** (réponse de Maxime à Q7) : toute la saison 2026-27 se gère dans l'app. Import et bascule à un moment précis, choisi avec l'équipe.
  - Ce jour-là, Jotform est remplacé par le formulaire de l'app, et les Sheets et le chiffrier passent en lecture seule.
  - Chaque réservation signée est reliée à son devis et à ses factures QBO s'ils existent déjà. Sinon, ils sont créés selon le SOP (Q11).

## 15. Ordre de construction

Chaque phase est testée en DEV, puis mise en ligne au go de Maxime.

1. **Fondation** — **bâtie en DEV le 2026-10-08**, pas en PROD :
   - tables, catalogue et prix 2026-27, réservations, étapes et vues, CRM intégré, estimés en versions ;
   - calcul de l'estimé vérifié contre 163 onglets réels du chiffrier et les PDF 27-G-083, 27-G-014 et 27-G-002 (`npm run test:calcul`) ;
   - import d'essai en DEV : 385 réservations (2026-27 et 2025-26), 1 324 notes devenues des échanges datés, 304 estimés. Contrôle : les contrats signés 2026-27 font 354 627,19 $, comme le Sheets.
2. **Documents PDF** — **bâtie en DEV le 2026-10-08**, pas en PROD :
   - estimé, contrat (pré-signé par la direction, estimé accepté et annexes de la compagnie à la fin) et pré-arrivée en PDF, produits dans le navigateur ;
   - modèles de contrat et de pré-arrivée modifiables dans l'app (onglet Modèles et compagnies), avec les corrections du §5 et du §16 ;
   - fiches des deux compagnies qui facturent (GBPA+, Opikawa) : logo, taxes, consignes de paiement, spécimens de chèque en annexe ;
   - **signature électronique** : lien secret envoyé au client, page publique sans compte (contrat, case « J'accepte », nom, signature au doigt ou à la souris), réservation confirmée, contrat signé avec certificat (date, IP, navigateur, empreinte SHA-256 du contrat envoyé). Essai complet réussi en DEV.
   - Reste pour plus tard : l'envoi du lien par courriel (phase 5) et la production automatique du contrat signé (pour l'instant, un bouton dans la fiche).
3. **Formulaire public + page client** — **bâtie en DEV le 2026-10-09**, pas en PROD :
   - formulaire `/demande` : les questions et les conditions du Jotform, en français et en anglais ; Turnstile ; la réservation arrive à l'étape Nouvelle, « À valider » ; l'équipe la relie au CRM en un clic (suggestions) ;
   - page client `/client/<lien>` : le séjour, l'estimé à accepter en ligne, la signature du contrat, les documents, le lien des fiches, un message à l'équipe ;
   - fiches participants `/fiches/<lien>` : santé, Epipen, diète, médicaments ; accès propre « Fiches participants » ; totaux pour les autres ; effacées 3 mois après le départ (Loi 25) ;
   - reste pour la mise en ligne : sous-domaine, clés Turnstile (README, section 11) ; les factures QBO s'ajouteront à la page client à la phase 4 ; l'accusé de réception par courriel, à la phase 5.
4. **QuickBooks Online** (§6, façon A) — **bâtie en DEV le 2026-10-10**, pas en PROD, pas encore essayée avec une vraie compagnie QBO (il faut l'application Intuit : README, section 12) :
   - connexion OAuth de chaque compagnie à son dossier QBO (Modèles et compagnies), jetons chiffrés dans le Worker ; article, code de taxes et conditions de paiement choisis dans l'app ;
   - fiche › Facturation : client QBO relié (ou créé) une fois pour toutes, devis QBO créé d'un clic à partir de l'estimé accepté (numéro de la réservation, contrat signé et spécimen joints, contrôle du total), mis à jour si l'estimé change ;
   - échéancier (F2 à F8) et relances « facturer l'acompte… dans QBO » à l'adjointe ; elles se ferment toutes seules quand la facture progressive apparaît dans QBO ;
   - factures et soldes relus de QBO aux 15 minutes (et bouton « Mettre à jour ») ; factures séparées (F6) et notes de crédit (F15) créées par l'app ; PDF officiels de QBO dans la fiche et sur la page client ;
   - relance « créer le devis QBO » à la signature du contrat ;
   - sans QBO relié, l'échéancier donne les montants à facturer à la main ;
   - **reste** : Q9 (un article QBO par produit), le minimum de 90 % calculé pour la facture finale (F10, F11), un échéancier convenu autrement (F2), l'annulation (F16, F17).
5. **Courriels automatiques.**
6. **Google Agenda + Airbnb.**
7. **Rapports.**
8. **Bascule avec l'équipe** : import 2026-27, Jotform, Sheets et chiffrier retirés, Airtable fermé.

## 16. Anomalies trouvées dans les fichiers actuels

À traiter plus tard (Maxime, 2026-10-08).

**Argent non facturé ou mal facturé :**
- Location de salle : les repas saisis ne sont reportés dans aucune ligne de l'estimé (27-G-124, 27-G-116, 27-G-112).
- Accueil de groupe : les extras des lignes 31 et 32 ne sont jamais reportés (27-G-072 collation, 27-G-009 arrivée hâtive, 27-G-104 animation, 27-G-102 cuisine).
- Facture 2 à 50 % pour Accueil et Location, alors que le contrat dit 75 %. Taxes « 75 % » calculées sur la base de 50 % (colonnes V et W, non utilisées).
- Facture Accueil de groupe en `#REF!` dans le modèle et dans environ 60 onglets 27-G.
- Billets Tremblant à 0 $ dans la liste : facturés 0 $ s'ils sont choisis.

**Prix corrigés** (réponse de Maxime à Q5 : au prorata des lits) :
- Vieille-France haut : 907,20 $ au lieu de 827 $.
- Site complet : 192 lits au lieu de 190.
- Pins haut : ne se vend pas seul.

**Contrats :** voir §5 (VFH et VFB inversés, « Souper : <<Dîner>> », restes de copier-coller, coquilles, tableaux de lits périmés).

**Contrat absent du fichier 2026-27** (trouvé par l'import d'essai) : **26-G-532**, signé, arrivée le 4 octobre 2026, 47 027 $ avant taxes. Il n'existe que dans le fichier 2025-26 ; les rapports 2026-27 ne le comptent donc pas.

**Données à nettoyer à l'import :**
- dates en texte et départs avant l'arrivée ;
- « ❌ » dans des montants ;
- 16 graphies de province ;
- 27-G-015 marqué « Close Lost » mais signé ;
- 27-G-027 : montant de l'estimé remplacé par le dépôt ;
- États de comptes coupé à la ligne 252 (2025-26).

## 17. Questions et réponses

**Réponses de Maxime (2026-10-08) :**
- **Q1** : oui, Opikawa est une 2e compagnie qui facture (TPS 764169736 RT0001, TVQ 1226925003 TQ0001 ; logo Drive 1di5reME0X6vdL4OeEFka19xrWYlGsfj1). Spécimens de chèque GBPA+ et Opikawa fournis.
- **Q2** : règles de facturation à valider dans le tableau du §5.
- **Q3** : oui, l'app crée les factures dans QBO. Les acomptes = % avant taxes + taxes. Le **SOP de la comptable** décrit le processus (§6).
- **Q4** : on commence comme proposé (AG : sections proposées, envoi approuvé d'un clic ; CN : envoi automatique).
- **Q5** : section au prorata des lits ; Pins haut pas vendus seuls.
- **Q6** : sous-domaine de camptremblant.com pour le formulaire et la page client.
- **Q7** : toute la saison 2026-27 dans l'app, bascule à un moment précis avec l'équipe.
- iCal Airbnb fournis (2 annonces : VF complète, VF bas).

**Réponses du 2026-10-08 (2e série) :**
- **Q8** : oui, Opikawa a son propre dossier QBO → deux connexions.
- **Q9** : produits et services QBO pas encore connus.
- **Q10** : QBO numérote les factures ; l'app relie ces numéros à la réservation.
- **Q11** : la comptable fait des essais ; le but est d'entrer ces factures dans QBO.

**Réponses du 2026-10-09 :**
- **Q12** : façon A (un clic dans QBO pour chaque facture progressive, l'app fait le reste). Le devis QBO est créé par l'app, sans double saisie (§6).
- Corrections des modèles de contrat approuvées ; signature électronique approuvée.

**Questions ouvertes :**
- **Q9** : liste des produits et services QBO (à déterminer plus tard, avec la comptable).
