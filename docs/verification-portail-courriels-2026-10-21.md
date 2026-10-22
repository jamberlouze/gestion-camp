# Vérification — portail de réservation, lot A (courriels par fenêtre, fil Gmail, acceptation avec preuve) et avis à l'équipe

> **Passée par Claude en DEV le 2026-10-21** (soir ; 22 octobre en UTC). Corrigés en chemin : erreur de la fenêtre cachée sous un long texte (maintenant dans le bas collant, toujours visible) ; dates « envoyé le » / « accepté le » / « envoyé au client le » qui donnaient le jour UTC (le lendemain après 20 h : `dateLongue` lit maintenant le jour à Montréal) ; la base laissait encore poser « envoyé » ou « accepté » directement dans la table (nouveau déclencheur `verifier_statut_estime`) ; liste des modèles qui montrait « À approuver d'un clic » pour l'estimé et le contrat. Demandes du sous-agent Client ajoutées : phrases des fiches participants dans les modèles `pre_arrivee`, `rappel_fiches` et `contrat` (`{{fiches_participants}}`), tableau de l'estimé qui faisait déborder la fiche au téléphone. **Reste pour Maxime** : §8 (Gmail en PROD, après la mise en ligne) et §9 (décisions).

En DEV seulement (base locale) : tout part dans **Mailpit** (http://localhost:54324), jamais chez un client. Aperçu `reservations-essai` (http://localhost:5196), Worker local sur 8787 (lancé par Vite ou `worker-dev`). Compte : `admin@camp.test`.

Données d'essai (`supabase/seed.sql`, section « Courriels par fenêtre et fil Gmail ») : **27-G-971** « ESSAI Courriels — fenêtre » (français, contact Leïla Essai) et **27-G-972** « ESSAI Courriels — English » (anglais, contact Ruth English), organisation « Groupe Essai Courriels (DEV) ». 27-G-595, 27-G-596 et « École Essai Claude (DEV) » n'ont pas été touchées.

## 1. « Envoyer l'estimé… » (fiche › Estimé)

- [x] « Marquer envoyé » n'existe plus ; « Envoyer l'estimé… » à côté de « Aperçu PDF » (qui reste).
- [x] Un brouillon modifié est enregistré avant d'ouvrir la fenêtre ; le PDF de cette version est produit (lignes de la base, comme l'aperçu).
- [x] Fenêtre : De inscriptions@, À (contact de la réservation), Cc, Sujet, Texte du modèle `estime` déjà rempli, pièce jointe « 📎 Estimé 27-G-971.pdf (45 Ko) » cliquable (ouvre le PDF), avis DEV Mailpit, ce qui arrivera à l'envoi.
- [x] 27-G-972 (langue « Anglais ») : texte du modèle anglais, « Texte (anglais) », sujet « Reservation 27-G-972 · … », lien de la page avec `?lang=en`.
- [x] Avant l'envoi : l'estimé est encore « brouillon », aucun document, aucun courriel (SQL), rien sur la page du client.
- [x] Texte modifié (« Allô Leïla, contente de savoir que tu reviens avec ta classe ! »), Cc ajouté, Envoyer → la fenêtre se ferme ; l'estimé passe « Envoyé » (figé), « Accepté par le client… » / « Refusé » / « Nouvelle version » apparaissent.
- [x] Mailpit : sujet, À, Cc, texte modifié tel quel, PDF joint (45 804 octets).
- [x] SQL : estimé `envoye` + `envoye_le`, étape `estime_envoye`, document « Estimé 27-G-971 » (estime_id, auteur), courriel `estime:<id>` `envoye` (même clé que la file), journal (PDF, « Estimé v1 envoyé », « Courriel « Estimé » envoyé à … (DEV : Mailpit) », étape — tout au nom d'Admin Test), échange du CRM.
- [x] La page du client montre l'estimé envoyé (`page_client`).
- [x] Adresse invalide en Cc → « Adresse invalide : pas-un-courriel », rien n'est envoyé (aussi au téléphone).
- [x] Envoi raté (tests du Worker, Mailpit en panne simulé) : PDF retiré du seau, courriel de la fenêtre retiré, rien de noté, l'estimé reste brouillon.
- [x] Courriels pas configurés (PROD sans secret) : `GET /api/reservations/envoi` rend la raison ; bouton grisé avec la raison en infobulle et sous les boutons (code + tests du Worker ; pas simulable dans la base locale qui a Mailpit). — à revoir par Maxime en PROD, où Gmail n'est pas encore configuré : le bouton y sera grisé jusqu'à la bascule
- [x] Tests du Worker : brouillon, refus (estimé déjà envoyé, contrat déjà parti), ordre PDF → envoi → note, envoi raté, refus avant tout envoi.

## 2. « Envoyer le contrat… » (fiche › Documents)

- [x] « Préparer le contrat à signer » ne change plus l'étape (reste « Estimé accepté ») et ouvre aussitôt la fenêtre du contrat.
- [x] Fenêtre : modèle `contrat`, Cc = courriel de la direction, sujet du fil grisé « Même fil que les courriels précédents… », lien de signature, « d'ici le 28 octobre 2026 » (aujourd'hui + 7 jours), pas de pièce jointe.
- [x] Fenêtre fermée sans envoyer : bandeau ambre « Contrat préparé, pas encore envoyé au client » + « Envoyer le contrat… » ; le lien, « Copier le lien » et « Ouvrir la page du client » restent.
- [x] Envoyé → étape « Contrat envoyé », signature `envoye_le` = maintenant, échéance = +7 jours ; « Envoyé au client le 21 octobre 2026 par Admin Test, en attente de sa signature · à signer d'ici le 28 oct. ».
- [x] Rappel de signature : rien tant que le contrat n'est pas parti (test) ; signature vieillie de 6 jours (SQL) → « Rappel de signature » préparé dans la file, au sujet du fil.

## 3. File « À approuver » (fiche › Courriels, onglet Courriels)

- [x] Plus aucun courriel `estime` ni `contrat` préparé (tests ; les anciens déjà préparés restent envoyables).
- [x] Carte : type, sujet, destinataires, début du texte, « Annuler le courriel », « Ouvrir et envoyer… » → même fenêtre (sujet grisé si le fil existe, pièce « joint au moment de l'envoi »).
- [x] « Enregistrer sans envoyer » garde le texte modifié (SQL) ; « Envoyer » part dans le fil.
- [x] Lignes envoyées : « Estimé · Réservation 27-G-971 · … », « Contrat à signer · … » (le type devant le sujet du fil).
- [x] Modèles : estimé et contrat marqués « Fenêtre de la fiche » (pas de mode) ; note « le sujet du modèle ne sert qu'au premier courriel » ; sujets de départ remplacés par « Réservation {{numero}} · {{groupe}} » (seulement ceux jamais modifiés).

## 4. Un seul fil Gmail par réservation

- [x] Premier courriel (estimé) : `fils_courriel` créé (transport mailpit, sujet, Message-ID relu dans Mailpit).
- [x] Contrat : même sujet, `In-Reply-To: <premier>`, `References: <premier>` (en-têtes lus dans Mailpit).
- [x] Rappel de signature : `In-Reply-To: <contrat>`, `References: <premier> <contrat>` ; `fils_courriel.courriels` = 3.
- [x] Gmail (tests du Worker, réseau simulé) : `threadId` dans `messages.send`, Message-ID relu par `messages.get?format=metadata&metadataHeaders=Message-ID` (documentation officielle de l'API Gmail : guide « Manage threads » — threadId, References/In-Reply-To RFC 2822, même Subject ; référence `users.messages`, `Format`) ; fil retiré de la boîte (400/404) → renvoyé sans threadId, nouveau fil gardé.
- [x] Un fil Mailpit n'est jamais repris par Gmail (transport du fil) ; en-têtes sans saut de ligne injecté (test MIME).

## 5. « Accepté par le client… » (preuve écrite)

- [x] Fenêtre : date du courriel (aujourd'hui par défaut, pas dans le futur), texte collé obligatoire ; « Confirmer l'acceptation » grisé tant que c'est vide.
- [x] Accepté → « accepté le 21 octobre 2026 par courriel du client (21 octobre 2026), preuve saisie par Admin Test » + « Courriel du client (preuve de l'acceptation) » dépliable.
- [x] SQL : `preuve_courriel_le`, `preuve_texte`, `preuve_saisie_par_nom` ; journal (date, qui, texte) ; échange du CRM (courriel du client, à sa date) ; relance « 27-G-971 : estimé accepté par courriel, préparer le contrat » au responsable ; la relance « créer le devis QBO » du sous-agent Équipe est posée aussi (déclencheur à l'acceptation).
- [x] Refusé par la base : date future, sans date, texte trop court, estimé pas « envoyé », compte Terrain, anonyme ; `changer_estime` « envoyer » et « accepter » ; « envoyé » ou « accepté » posé directement dans la table (`verifier_statut_estime`). L'acceptation en ligne par le client (anonyme) marche toujours.

## 6. Avis à l'équipe (inscriptions@)

- [x] Nouvelle demande : avis « Nouvelle demande · 27-G-597 · École Essai Claude (DEV) » (groupe, forfait, dates, participants, responsable, description, lien de la fiche `http://localhost:5173/reservations/r/…`), de et à inscriptions@, sans en-tête de fil (Mailpit) ; test de la route `/demande` : avis tout de suite après l'enregistrement.
- [x] Changement demandé : « Changement demandé · 27-G-986 · … » avec avant → après ligne par ligne (« Accompagnateurs : 4 → 5 ») et le lien ; un changement déjà remplacé ou traité n'est pas annoncé (3 pris, 1 envoyé).
- [x] Jamais deux fois (`avis_prendre` les prend d'un coup) ; envoi raté = rendu pour le passage suivant ; rien de plus de 2 jours ; rien sans Mailpit ni Gmail (tests).
- [x] Déclenché à la réception d'une demande, à l'ouverture d'une fiche ou de l'onglet Courriels, et aux 15 minutes (cron, essayé une fois en DEV par `/cdn-cgi/handler/scheduled`).

## 7. Téléphone et ordinateur

- [x] Ordinateur : fenêtres larges, boutons collés en bas.
- [x] Téléphone (375 px) : fenêtre en feuille du bas, champs à 16 px, boutons visibles ; fiche sans défilement de côté (tableau de l'estimé qui défile dans sa carte).
- [x] `npm run build` et `npm run lint` passent ; `npm run test:worker` (169), `test:calcul`, `test:rapports`.

## 8. Avant la mise en ligne (Maxime)

- [ ] **Gmail d'inscriptions@ (bascule)** : le jeton `GMAIL_INSCRIPTIONS_REFRESH_TOKEN` doit être autorisé avec **`gmail.send` et `gmail.metadata`** (README §13, mis à jour) : sans `gmail.metadata`, les courriels partent, mais le Message-ID ne se relit pas et le fil peut se couper chez le client.
- [ ] Premier vrai envoi en PROD : vérifier dans les « Envoyés » d'inscriptions@ que l'estimé, le contrat et un rappel sont dans le même fil, et chez un destinataire d'essai (Gmail et Outlook).
- [ ] Migration `20261022002730_reservations_courriels_fenetre` à passer en PROD avec les autres du portail (le module y est vide : rien d'ancien à reprendre).
- [ ] Tant que Gmail n'est pas configuré en PROD, « Envoyer l'estimé… » et « Envoyer le contrat… » sont grisés (voulu).

## 9. Décisions prises par Claude, à confirmer

- Sujet du fil = sujet du premier courriel envoyé (quel qu'il soit, accusé compris) ; tous les sujets de départ des modèles deviennent « Réservation {{numero}} · {{groupe}} » (« Reservation … » en anglais), seulement s'ils n'avaient pas été modifiés.
- L'accusé de réception, les factures, la pré-arrivée, le merci… sont aussi dans le fil (tous les courriels au client d'une réservation).
- Le courriel du contrat ne joint pas le PDF (comme avant : le client le voit et le signe en ligne).
- Acceptation : la preuve va aussi dans les échanges du CRM (courriel du client, à sa date) ; date du courriel pas plus tard qu'aujourd'hui, pas de limite vers le passé ; texte d'au moins 10 caractères.
- Une personne connectée ne peut plus poser « envoyé » ni « accepté » à la main (même par la table) : pas de « marquer envoyé » sans courriel (un estimé remis en main propre devra partir par courriel).
- Avis à l'équipe : de inscriptions@ à inscriptions@, en français ; changements annoncés au plus 15 minutes après (pas de déclencheur depuis la page du client, qui est au sous-agent Client).
- Rappel de signature : 5 jours après l'envoi réel du contrat (avant : après sa préparation) ; seulement si le contrat est parti par l'app.
- **À voir avec le sous-agent Client** : la page du client montre le lien de signature dès « Préparer le contrat », avant l'envoi du courriel (`page_client`, pas touchée ici).
