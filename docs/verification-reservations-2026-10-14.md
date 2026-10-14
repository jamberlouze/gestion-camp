# Vérification des Réservations — contrat signé en double, confirmation du client, lien d'organisation (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14.** Quatre demandes de Maxime : (1) bogue des deux contrats signés de 27-G-056, (2) le client confirme ses informations de pré-arrivée sur sa page, (3) lien de formulaire propre à une organisation récurrente, (4) vérification Opikawa / GBPA+ dans les documents. Corrigés en chemin : le presse-papiers refusé par le navigateur affichait « Vous n'avez pas la permission… » après la création du lien (maintenant : le lien est affiché, à copier à la main) ; les suggestions d'une demande à valider mettaient « Collège Saint-Paul » en tête pour « Saint-Paul-de-la-Croix » et ne voyaient pas « St-Paul » = « Saint-Paul » ; « même ville et même type » noyait les vraies suggestions ; le journal d'une décision de l'équipe pouvait rester au nom du client (réglage de transaction remis à zéro). **Reste pour Maxime** : §6 (décisions), §7 (ce qui manque pour Opikawa, à décider), ajouter le lien de la page client au courriel de pré-arrivée quand les courriels seront revus (§3), puis la mise en ligne avec le reste du module (§8).

En DEV seulement (base locale), module jamais publié. Données d'essai gardées
telles quelles : 27-G-595, 27-G-596, organisation « École Essai Claude (DEV) »
(un lien de formulaire lui a été créé pour l'essai : fiche 27-G-595 › Client).
Les réservations d'essai faites pendant la vérification (27-G-597, reçue par
le lien de l'organisation puis signée, et 27-G-598, demande non reliée) ont
été retirées ensuite, avec leurs PDF, échanges et relances. Aucun courriel
envoyé (accusés et pré-arrivée seulement préparés, à approuver), rien dans QBO.

**Avant de commencer** : l'aperçu `reservations-essai` (http://localhost:5196/reservations)
avec le Worker local (port 8787, lancé avec l'aperçu), compte `admin@camp.test`.
Pages publiques : un onglet sans session (navigation privée) suffit, elles
sont toujours anonymes.

## 1. Bogue : deux contrats signés pour 27-G-056

- [x] Cause trouvée : à 15 h 42 min 19,55 s, le client signe ; le Worker produit le contrat signé (19,88 s, « Maxime Chamberland (client) ») ; la fiche, ouverte au même moment par Admin Test, reçoit la signature par le temps réel **avant** que le Worker ait relié son PDF, et produit le sien (filet de sûreté de `Documents.tsx`, 19,96 s), puis remplace le lien sans condition. Ni double signature ni relance : une course entre le Worker et la fiche. Même PDF (même empreinte SHA-256).
- [x] Corrigé à la source : la fiche n'essaie plus qu'**une minute après la signature** (le Worker le fait en moins d'une seconde).
- [x] Empêché pour de bon (migration `20261014185253_reservations_contrat_signe_unique`) : `documents.signature_id` + index unique « un contrat signé par signature » ; c'est la base qui relie le PDF à la signature (`relier_contrat_signe`) ; un contrat signé sans signature est refusé. Le perdant d'une course (Worker ou fiche) retire son fichier et rend celui qui existe.
- [x] Essai de course : trois productions simultanées par le Worker pour la même signature → **un seul** document, un seul fichier, une seule ligne au journal, les trois réponses « ok ».
- [x] Essai réel : contrat préparé dans la fiche, signé sur `/signer/…` pendant que la fiche restait ouverte ; après 75 s : un seul contrat signé, relié, au nom du client.
- [x] Doublon nettoyé en DEV : gardé **1148560c** (le premier, produit par le Worker à la signature, au nom du client, celui que la page de signature a montré) ; retirés le doublon fe4ece02 (ligne, fichier du seau et sa ligne du journal « Contrat 27-G-056 signé (PDF) » par Admin Test). Le lien de la signature pointe sur 1148560c.
- [x] Autres réservations : aucune autre n'a deux contrats signés (les 6 signatures signées de la base DEV en ont chacune un).

## 2. Confirmation des informations par le client (page client)

Migration `20261014185727_reservations_confirmation_client` : table `reservations.confirmations` (RLS : lecture par le module, aucune écriture directe), fonctions `confirmation_client`, `confirmer_infos_client`, `proposer_changement_client` (anonyme, par le lien de la page client), `traiter_changement` (équipe). Règles : `confirmation.ts` (tests : `npm run test:worker`, fichier `worker/reservations/confirmation.test.js`).

- [x] Ouverte après la signature (ou étape Confirmée / Pré-arrivée), pas fermée, jusqu'au départ ; jamais pour Airbnb. Avant : la section n'apparaît pas.
- [x] Page client : « Vos informations pour le séjour » (dates, heures, élèves/personnes, accompagnateurs, âges, ratio, langue, repas ; Journée plein air : dîner à la cafétéria oui/non), **mise en évidence (cadre ambre) à 30 jours ou moins de l'arrivée** tant que ce n'est pas confirmé.
- [x] « Je confirme ces informations » (nom obligatoire) → « ✓ Confirmé par … le … » ; au journal et dans les échanges du CRM, au nom du client.
- [x] Le séjour change après la confirmation (l'équipe passe 4 → 5 accompagnateurs) → page client : « Vous aviez confirmé le …, mais des informations ont changé depuis : merci de confirmer de nouveau » ; fiche : « le séjour a changé depuis (Accompagnateurs : 4 → 5) : à faire confirmer de nouveau ».
- [x] « Je propose un changement » : formulaire pré-rempli, verdict en direct : 40 → 43 élèves à J−27 « respecte ce que prévoit le contrat » ; 43 → 60 + ratio 1:10 « l'équipe évaluera ce changement, sans garantie » avec les raisons (+40 %, ratio sans garantie). Rien changé → bouton grisé ; date passée, heure ou nombre invalide → refusé par la base.
- [x] La demande arrive sur la fiche (temps réel) : bandeau ambre en haut « Le client propose un changement au séjour — à accepter ou refuser », pastille **Dans les règles** / **Hors règle** + raisons, tableau Avant / Proposé (« depuis changé pour … » si l'équipe a modifié ce champ entre-temps), message du client ; liste : « Changement du client à traiter ».
- [x] Relance CRM « accepter ou refuser le changement demandé par le client » au responsable, fermée toute seule à la décision ; une nouvelle demande du client remplace celle qui attend (ancienne « remplacée », sa relance annulée). Au plus 20 réponses par jour et par réservation.
- [x] **Accepter** : seuls les champs changés par le client sont écrits dans le séjour (43 élèves), comme à la main (mêmes vérifications, dont la VF sur Airbnb) ; l'estimé n'est pas touché (rappel : nouvelle version si le prix change). Message au client affiché sur sa page : « Votre changement du … a été accepté. Réponse de l'équipe : … ».
- [x] **Refuser** : message obligatoire (bouton grisé sans message ; la base le refuse aussi) ; séjour inchangé (43, 1:15) ; la page client montre le refus et le message.
- [x] Historique : section « Confirmation par le client » de la fiche (confirmations, changements acceptés, refusés, remplacés, verdict, qui a traité, messages) ; journal de la réservation et échanges du CRM (client et équipe), y compris les changements de dernière minute.
- [x] Droits (SQL, transactions annulées) : l'anonyme ne peut rien écrire dans `confirmations` directement ni appeler `traiter_changement` / `lien_organisation` ; un coordonnateur sans accès aux Réservations reçoit « Accès refusé ».
- [x] Anglais (`?lang=en`) et téléphone (375 px) : page client lisible, sans défilement horizontal.
- [x] Le PDF de pré-arrivée reste disponible (Documents › Pré-arrivée), rien d'enlevé.

## 3. Courriel de pré-arrivée (non modifié)

- [x] Aucun courriel ajouté ni modifié (décision de Maxime : automatisations à revoir ensemble plus tard).
- [ ] **Constat** : le modèle actuel du courriel de pré-arrivée (FR et EN) ne contient **pas** le lien de la page client (`{{lien_client}}`), seulement celui des fiches participants. Pour que le client confirme « avec le courriel de pré-arrivée », il faudra y ajouter une ligne, p. ex. « Confirmez vos informations (ou proposez un changement) sur votre page : {{lien_client}} » — à faire par Maxime dans l'onglet Courriels, ou lors de la revue des courriels. En attendant, la page client reçue avec l'estimé et le contrat suffit.

## 4. Lien du formulaire d'une organisation

Migration `20261014190017_reservations_lien_organisation` : `reservations.liens_formulaire` (un par organisation, jeton de 48 caractères hexadécimaux), `lien_organisation` (créer, refaire, retirer), `formulaire_organisation` (pré-remplissage, anonyme), `recevoir_demande` (lien reconnu), `demandes.par_lien`.

- [x] Fiche › Client › « Formulaire de l'organisation » : « Copier le lien du formulaire de l'organisation » crée le lien au premier clic ; ensuite le lien affiché, Copier, Ouvrir, « Nouveau lien » (l'ancien ne marche plus) et « Retirer ». Rien d'autre que le jeton dans l'adresse (`/demande?lien=…`).
- [x] Le formulaire ouvert par le lien : « Bon retour, École Essai Claude (DEV) ! … » ; pré-rempli : type de groupe, organisation, adresse, description, responsable (prénom et nom tels que donnés à la dernière demande), facturation « oui », courriel de la direction, langue ; après le choix du forfait : élèves 40, âges, accompagnateurs 4. Forfait, dates, heures et commentaires vides.
- [x] Envoyée : la demande arrive **déjà reliée** (« reliée au CRM par le lien du formulaire de l'organisation »), contact retrouvé par courriel (aucun doublon créé), responsable interne et compagnie de la dernière réservation, provenance « Formulaire web (lien de l'organisation) ».
- [x] Lien refait ou retiré : le formulaire dit « Ce lien n'est plus valide : remplissez le formulaire au complet… » et la demande arrive « à valider » comme les autres (jeton inconnu ignoré par la base et le Worker).
- [x] Suggestions d'une demande non reliée (essai « École Saint-Paul de la Croix » avec le courriel d'un contact connu) : phrase de tête « Cette demande vient probablement de « … » (même courriel) : vérifiez, puis reliez-la », ligne verte et bouton « Relier » principal ; chaque suggestion montre le type, la ville, le contact trouvé et les réservations (« 2 réservations · dernière : 27-G-043 ») ; « même nom » (St = Saint) avant « nom semblable » ; « même ville et même type » seulement s'il n'y a rien de mieux ; note « Plusieurs fiches portent un nom semblable… Fusionner avec… ».
- [ ] À voir par Maxime : le CRM DEV a deux fiches pour la même école, « Saint-Paul-de-la-Croix » et « École St-Paul-de-la-Croix » (à réunir avec « Fusionner avec… » ; le lien de formulaire est propre à une fiche).

## 5. Opikawa ou GBPA+ dans les documents (vérification seulement)

Vérifié sur une réservation d'essai passée à Opikawa (estimé, contrat, contrat signé produits pour de vrai, textes lus dans les PDF), comparée à 27-G-056 (GBPA+).

- [x] Estimé : raison sociale, adresse, courriel, téléphone, pied de page et note sur les prix des fournisseurs de la compagnie de la réservation (« Opikawa inc · info@opikawa.com · +1 (888) 890-2887 » / « Gestion Base de Plein Air Mont-Tremblant + · inscriptions@… · (819) 425-2461 ») ; logo de la compagnie.
- [x] Contrat et contrat signé : aucune mention de GBPA+ dans celui d'Opikawa ; `{{compagnie}}` / `{{compagnie_court}}` partout dans les 4 modèles, consignes de paiement d'Opikawa (chèque à l'ordre d'Opikawa inc, Interac à info@opikawa.com, réponse OPIMT), annexes d'Opikawa, certificat « Émis par Opikawa inc ».
- [x] Page client et page de signature : logo et pied de page d'Opikawa (fiches participants : même source, lue dans le code) ; Facturation : « Opikawa n'est pas reliée à son dossier QuickBooks » (dossier QBO propre à la compagnie).
- [x] L'adresse de correspondance suit bien la compagnie (`compagnies.adresse`), mais **les deux fiches ont la même adresse** en DEV (3595 rue Léonard) : à confirmer.

## 6. Décisions prises par Claude, à confirmer

- Règles « dans les règles » : ±10 % sur les **participants** (élèves ou personnes ; les accompagnateurs ne comptent pas, comme le minimum de 90 %), comparé au séjour **actuel** (pas à la signature : plusieurs petits changements successifs ne sont pas cumulés) ; délai de 21 jours pour tout ce qui touche la facture (dates, heures, nombres, ratio, repas), jamais pour les âges ni la langue ; **écoles de l'automne = Classe nature ou Journée plein air arrivant en août ou septembre, délai 3 jours** (« 2-3 jours » : le plus prudent) — le ±10 % reste (un 30 → 130 est hors règle) ; changer les dates ou le ratio est toujours « hors règle » (disponibilités, animateurs, « sans garantie »). Ce n'est qu'une indication : l'équipe décide.
- Fenêtre : de la signature jusqu'au **départ** ; mise en évidence à 30 jours de l'arrivée.
- Responsable sur place et cellulaire : pas de champ à part, la case « Précisions » du changement (ex. « Cellulaire sur place : … ») ; ils restent dans l'historique, rien n'est écrit dans les contacts du CRM.
- Refus : message au client obligatoire ; acceptation : message facultatif.
- Lien d'organisation : sur la fiche de la **réservation** (section Client), pas sur la fiche du CRM — le CRM est en PROD et les Réservations non : un bouton du CRM qui dépend du schéma des Réservations casserait la PROD. À ajouter au CRM après la mise en ligne si voulu.
- Pré-remplissage : la **dernière réservation** = la plus récente par date d'arrivée (même perdue), sans les commentaires ; sans réservation : l'adresse du CRM et le contact principal. La demande reliée prend la **compagnie** et le **responsable interne** de cette réservation (sinon GBPA+ et le conseiller de l'organisation).
- Le lien de formulaire montre les coordonnées du responsable à qui l'a : même niveau de secret que la page client (jeton non devinable, révocable).

## 7. Ce qui manque pour Opikawa (signalé, pas bâti)

- Numéros de TPS / TVQ de la compagnie : imprimés **nulle part** (ni estimé ni contrat), alors que les champs `{{tps_numero}}`, `{{tvq_numero}}` existent. À ajouter aux modèles si on les veut.
- Un seul jeu de modèles de contrat (par forfait) pour les deux compagnies : pas de « modèles Opikawa » propres comme le prévoyait le plan (§5) ; le texte s'adapte par `{{compagnie_court}}`.
- Courriels d'un groupe Opikawa : envoyés d'inscriptions@camptremblant.com (signés « L'équipe de Opikawa · info@opikawa.com ») — à revoir avec les automatisations de courriels.
- Fiches participants : le consentement aux nouvelles nomme toujours « la Base de plein air Mont-Tremblant », même pour un groupe d'Opikawa (Loi 25 : le consentement devrait nommer la bonne compagnie).
- Changer « Facturé par » après coup ne refait rien : estimé et contrat déjà gardés restent à l'ancienne compagnie (voulu : documents figés), le devis QBO reste dans l'ancien dossier ; aucun avertissement dans la fiche.
- Petites coquilles : « fournisseurs de Opikawa inc » (élision), et les clauses d'annulation des contrats disent « l'acompte reçu, soit {{montant_25}} » — faux si l'échéancier est convenu autrement (règle : `{{acompte1}}` pour un versement).

## 8. Avant la mise en ligne

- [x] `npm run build` et `npm run lint` passent (avertissements d'autres fichiers seulement) ; `npm run test:calcul`, `test:rapports`, `test:worker` (118, dont 10 nouveaux) verts.
- [ ] Les trois migrations partent en PROD avec le module (`/mise-en-ligne`), dans l'ordre.
- [ ] Ajouter `{{lien_client}}` au courriel de pré-arrivée (§3), lors de la revue des courriels.
- [ ] Constaté en passant (déjà là avant) : sur téléphone, la fiche d'une réservation déborde en largeur (tableau de l'estimé) — le module est pensé pour ordinateur.
