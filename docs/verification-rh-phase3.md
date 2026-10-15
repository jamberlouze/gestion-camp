# Vérification du module RH — phase 3 (courriels et contrat signé en ligne)

> **Passée par Claude en DEV le 2026-10-15** (navigateur sur ordinateur et en format téléphone, Mailpit, tests SQL, tests du Worker). Corrigés en chemin : la signature d'un contrat et l'envoi d'un courriel ne dépendaient que de « pas de session = Worker » (rendu explicite : réglage de transaction posé par `rh.contrat_signe`, `rh.consentement_signe` et `rh.courriel_envoye` seulement) ; la recherche de la GBPA+ par abréviation (vide en DEV : aussi par nom) ; l'invitation au retour qui préparait le courriel de toutes les invitations en attente (seulement les personnes qu'on vient d'inviter ; « Préparer les courriels manquants » pour les autres) ; la partie texte des courriels qui gardait la syntaxe des liens (`[texte](adresse)` → « texte (adresse) »). **Reste pour Maxime** : les cases non cochées (vraie boîte Gmail, relecture des modèles et du consentement) et §8 (actions).

En DEV seulement (base locale ; vraies données d'Airtable). Les courriels partent **dans Mailpit** (http://localhost:54324), jamais chez la personne : `COURRIELS_MAILPIT` dans `.dev.vars` ; une base locale sans lui refuse tout envoi.
Fiches d'essai créées puis retirées après la vérification : « Zoé Essai-Phase3 » (mineure, emploi Été 2027), « Liam Essai-Accuse » (candidature en anglais). Statut de la candidature d'Océane remis à « À traiter » après l'essai ; taux et dates d'Été 2027 remis à vide.

**Avant de commencer** : `npm run db:start`, puis l'aperçu `rh-essai` (http://localhost:5200 ; le Worker local, port 8787, part avec). Connexion : `julie@camp.test` (direction).

## 1. Sécurité et droits

- [x] L'anonyme n'a toujours aucun droit sur le schéma `rh` (fonctions de la phase 3 comprises). — tests SQL
- [x] Fonctions du Worker seulement (clé secrète) : `jeton_boite`, `enregistrer_boite`, `noter_boite`, `courriels_ajouter`, `courriel_envoye`, `rappels_dus`, `nouveautes`, `contrat_a_produire`, `contrat_signe`, `consentement_a_produire`, `consentement_signe` ; la direction est refusée. — tests SQL
- [x] Jeton Gmail d'une boîte : chiffré (`rh.chiffrer`), table `connexions_gmail` illisible par l'app ; l'état passe par `rh.etat_boites` (jamais le jeton). — tests SQL
- [x] Terrain (sans RH) : ne lit ni compagnies, ni taux, ni modèles, ni contrats ; ne prépare ni courriel ni contrat ; `etat_boites` et `deconnecter_boite` refusés. — tests SQL
- [x] L'app ne fait que **préparer, corriger ou annuler** un courriel : jamais « envoyé » (Worker seulement), la clé ne change pas, un courriel annulé ne se rouvre pas. — tests SQL
- [x] Contrat : l'app ne prépare qu'un contrat **en attente** ; jamais signé par l'app, jamais un consentement ; refaire annule celui en attente ; **pré-signé au nom de la personne connectée, ce jour-là** (la base l'impose, quoi que l'app envoie). — tests SQL
- [x] Signature : jeton d'une autre embauche refusé, fichier hors du dossier de la personne refusé, nom exigé, pas de deuxième signature, embauche annulée = plus de signature. — tests SQL et Worker
- [x] Validation : un emploi exige le **contrat signé** ; une personne **mineure au début** exige le **consentement parental signé**. — tests SQL et navigateur
- [x] Tests SQL : 58 sur 58 (transaction annulée). Tests du Worker (`npm run test:worker`) : 141 sur 141, dont 22 nouveaux pour les courriels, la connexion Gmail et les signatures.

## 2. Boîtes d'envoi des compagnies (Courriels › Compagnies et boîtes)

- [x] Une carte par compagnie : adresse d'envoi modifiable (inscriptions@camptremblant.com, messages@opikawa.com, info@aquabounga.ca, info@rougediable.ca, info@trembloc.ca), état de la boîte, signature, rendez-vous et coordonnées des contrats repliés.
- [x] État de la connexion (Gmail) : « Connectée », « Pas connectée », « À reconnecter » (dès qu'on change l'adresse d'envoi), « Erreur » (Google refuse le jeton), dernier envoi réussi. — tests SQL (DEV : Mailpit, pastille cachée)
- [x] « M'envoyer un essai » : courriel d'essai de la boîte d'Opikawa reçu dans Mailpit (expéditeur « Opikawa <messages@opikawa.com> »).
- [x] « Connecter la boîte » en DEV : « Gmail n'est pas configuré (secrets GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET) ». Connexion simulée : Google demande l'envoi seulement, pour l'adresse d'envoi ; une autre boîte autorisée est refusée ; un lien expiré ou falsifié aussi. — tests du Worker
- [ ] Connecter pour vrai chaque boîte (client OAuth Google, README §16), puis « M'envoyer un essai » de chacune. — à Maxime, à la mise en ligne

## 3. Courriels d'une candidature

- [x] Fiche d'une candidature « À traiter » › « Proposer une entrevue » : statut changé, courriel « Proposition d'entrevue » préparé (avis bleu), section « Courriels (1 à envoyer) » : de inscriptions@camptremblant.com (GBPA+, compagnie du poste), à la personne, sujet et texte modifiables, lien de rendez-vous de la compagnie.
- [x] « Envoyer » : reçu dans Mailpit (HTML : lien cliquable « juste ici » ; texte : « juste ici (adresse) »), ligne « ✉️ envoyé … · Julie Tremblay », journal « Courriel « Proposition d'entrevue » envoyé à … (DEV : Mailpit) ».
- [x] Même statut choisi une 2e fois : pas de 2e courriel (« existe déjà »). Un champ vide devient « [champ ?] » et bloque l'envoi. — code et tests
- [x] Refus après entrevue, équipe complète, ASPI, permis : même mécanisme (`COURRIEL_DU_STATUT`). — code
- [x] **Accusé de réception automatique** : candidature en anglais au formulaire pour un poste d'Opikawa → « Application received » envoyé seul, de messages@opikawa.com, signature d'Opikawa, « Envoi automatique ».

## 4. Contrat, bienvenue et signature

- [x] Réglages › Grille des taux : Été 2027, Animateur – Classe nature, échelon 2 = 664,00, « à la semaine » ; une embauche créée avec ce poste et cet échelon reçoit 664 $ / semaine.
- [x] Carte de l'embauche (mineure, 17 ans au début) : bloc « Contrat » (« Pas encore préparé », Aperçu) et « Consentement parental (17 ans au début) — à signer par un parent ».
- [x] « Préparer le contrat » : avertissement « Modèle pas encore relu » (modèle repris d'Airtable), puis « En attente de la signature · préparé le 15 oct. 2026 par Julie Tremblay · 664 $ par semaine ».
- [x] « Préparer le courriel de bienvenue » : lien du dossier créé au besoin, courriel prêt (avec « Signer ton contrat de travail en ligne… ») dans Courriels › À envoyer ; envoyé (Mailpit) → embauche « Lien envoyé ».
- [x] PDF du contrat (`/api/rh/contrat`) : en-tête des deux parties (raison sociale, adresse et téléphone de la compagnie ; coordonnées de l'employée), poste et saison, tâches du poste, dates, rémunération, pré-signature « Signé par Julie Tremblay le 15 octobre 2026 ».
- [x] Page du dossier (téléphone) : « Contrat de travail » en haut ; avant l'envoi du dossier, « Envoie d'abord ton dossier ci-dessous » ; après : nom, pavé de signature au doigt, case « J'ai lu… », « Signer mon contrat ». Case non cochée : « Coche la case pour confirmer. »
- [x] Contrat signé : signature dans la case, nom et « Signé électroniquement le … », certificat en dernière page (document, employeur, signé pour l'employeur, signataire, courriel, empreinte SHA-256, adresse IP, navigateur, date) ; gardé dans les documents de la personne ; « Voir mon contrat signé ».
- [x] Consentement parental (même page, mineure) : nom du parent, lien (Mère / Père / Tuteur ou tutrice légale), signature, case ; PDF signé (modèle d'Airtable rempli, signature, certificat) ; un autre identifiant est refusé (404). Le formulaire signé peut encore être joint aux documents si le parent ne peut pas signer en ligne.
- [x] Fiche : « ✓ Signé le … par Zoé Essai-Phase3 », « Voir le contrat signé », « ✓ Consentement signé par Marie Essai (mère) » ; « Valider l'embauche » ne réclame plus que la paie (« Il manque le 4 %, le type d'employé, l'action (paie) et la date d'embauche »), puis « Complète ».
- [ ] Relire le contrat type d'été et marquer « relu » (Réglages › Modèles de contrats) ; écrire les tâches des autres postes. — à Maxime
- [ ] **Faire relire le consentement parental** (repris tel quel d'Airtable : consommation d'alcool par une personne mineure, décharge sur les relations sexuelles) avant de l'utiliser. — à Maxime

## 5. Intention de retour en lot

- [x] Employés › Été 2027 › « Intention de retour… » (Hiver 2027) : inviter 1 personne → « 1 invitation créée. 1 courriel préparé (Courriels › À envoyer). » ; courriel du nom de camp (« Salut Zozo ! »), lien personnel, signé par la personne qui invite, de la boîte de la compagnie de sa dernière embauche.
- [x] « Préparer les courriels manquants » une 2e fois : « 0 courriel préparé » (jamais deux fois).
- [x] Courriels › À envoyer : cases à cocher et « Envoyer les N cochés » dès qu'il y en a plusieurs (chacun part de la boîte de sa compagnie ; un refus reste coché avec son erreur). — code

## 6. Rappels et résumé quotidien

- [x] Rappel du dossier : préparé seul (cron aux 15 minutes) quand le lien est parti depuis 7 jours (réglable) sans dossier reçu ; un seul par embauche ; à relire avant l'envoi ; rien avant le réglage « Rien de préparé seul avant le » (données importées). « Préparer les rappels dus » le fait tout de suite. — tests SQL et Worker
- [x] Résumé quotidien : pendant l'heure réglée (7 h, Montréal), aux destinataires réglés, seulement s'il y a du nouveau depuis le résumé d'avant (candidatures du formulaire, intentions de retour, dossiers reçus) ; de la boîte de la GBPA+. — tests du Worker
- [ ] Choisir les destinataires du résumé (charlotte@camptremblant.com au départ). — à Maxime

## 7. Modèles et réglages

- [x] Courriels › Modèles : un modèle par genre (français et anglais), mode (« À relire puis envoyer », « Envoyé seul » pour l'accusé, le rappel et le résumé seulement, « Désactivé ») ; « Créer un modèle propre » à une compagnie (copie du commun, ●) puis « Revenir au modèle commun ».
- [x] Réglages › Modèles de contrats : contrat et consentement « à valider », aperçu sur un exemple, « + Modèle propre » (compagnie et/ou été, hors été).
- [x] Réglages › Tâches des postes (reprises dans le contrat) ; Grille des taux avec « Copier » d'une autre saison (cases vides seulement).
- [x] Téléphone (375 px) : onglet Courriels lisible (pastilles des vues sur deux lignes, cartes pleine largeur).
- [ ] Relire les textes des modèles de courriels (repris d'Airtable). — à Maxime

## 8. Actions pour Maxime

- [ ] Client OAuth Google (README §16) puis connecter les cinq boîtes ; un essai par boîte.
- [ ] Compléter l'adresse et le téléphone des compagnies (Courriels › Compagnies : manquent pour Opikawa, Aquabounga, Rouge & Diable et Trembloc ; ceux de Trembloc sont devinés) : ils vont dans les contrats.
- [ ] Relire le contrat type, faire relire le consentement parental.
- [ ] Remplir la grille des taux de la saison qui s'en vient.
