# Vérification de la phase 5 — courriels aux clients

En DEV seulement. Tout part dans **Mailpit** (http://localhost:54324), jamais
chez un client. Cochez au fur et à mesure ; notez à côté ce qui cloche.

**Avant de commencer** : Docker Desktop, puis `npm run db:start` et
`npm run dev` dans `gestion-camp`. Connexion : `admin@camp.test`, code dans
Mailpit. Gardez Mailpit ouvert dans un deuxième onglet.

## 1. L'onglet Courriels

- [ ] Réservations › **Courriels** : l'avis bleu « DEV : les courriels partent dans Mailpit » est là.
- [ ] « À approuver » montre la facture 1017 de 27-G-055 (laissée en exemple).
- [ ] Ouvrir la carte : À, Cc, Sujet et Texte se modifient ; « 📎 PDF de la facture (QBO) » est indiqué.
- [ ] Changer un mot du texte, puis **Envoyer** : le courriel arrive dans Mailpit avec le texte changé et le PDF de la facture.
- [ ] Il passe dans « Derniers envoyés », avec votre nom et l'heure.
- [ ] Dans la fiche de 27-G-055 : le journal note l'envoi, et un échange « courriel » apparaît dans le CRM.

## 2. Les modèles

- [ ] Relire les 10 modèles, en français **et** en anglais : ton, formule de fin, signature, modes de paiement (Interac, réponse de sécurité).
- [ ] Modifier un modèle, puis Enregistrer : « Modifié par … » s'affiche. Seuls les courriels préparés **ensuite** changent.
- [ ] Mettre un type en **Désactivé** : il n'est plus préparé. Le remettre « À approuver ».
- [ ] La pré-arrivée ne peut pas passer en « Automatique » (option grisée).

## 3. Un parcours complet (nouvelle demande)

- [ ] Remplir le formulaire `/demande` (Classe nature, une adresse courriel à vous) : la fiche montre l'**accusé de réception** à approuver. L'envoyer : il arrive dans Mailpit.
- [ ] Refaire une demande **en anglais** : l'accusé est en anglais.
- [ ] Relier la demande au CRM, créer l'estimé, **Marquer envoyé** : le courriel « Estimé » apparaît dans la fiche (Courriels). L'envoyer : PDF de l'estimé joint, lien vers la page client.
- [ ] Ouvrir le lien de la page client depuis Mailpit, accepter l'estimé.
- [ ] Documents › **Préparer le contrat à signer** : le courriel « Contrat à signer » apparaît, avec le lien de signature et la direction en copie.
- [ ] Signer **sans** envoyer ce courriel : à l'ouverture suivante de la fiche, il est annulé tout seul (« plus nécessaire »).

## 4. Factures (avec QBO, compagnie d'essai)

- [ ] Créer le devis QBO de la demande signée ; dans QBO, faire « Créer une facture → 25 % » ; puis « Mettre à jour depuis QBO ».
- [ ] Le courriel « Facture » est préparé : responsable de la facturation en destinataire, responsable de la réservation en copie, PDF de QBO joint.
- [ ] Une facture qui atteint le total du devis donne le courriel « Facture finale » (texte différent).

## 5. Pré-arrivée

- [ ] Sur une Classe nature signée qui arrive dans moins de 30 jours : le courriel « Pré-arrivée et fiches participants » est préparé.
- [ ] **Envoyer** produit d'abord le PDF de pré-arrivée (il apparaît dans Documents), puis le courriel part avec le PDF et le lien des fiches.

## 6. Rappels (selon les dates)

Les rappels dépendent du calendrier (signature à 5 jours, paiement, fiches à
25 jours, suivi à 2 jours du départ). Les tests automatiques les couvrent ;
pour les voir dans l'app sans attendre, demandez à Claude de simuler une date.

- [ ] Rappel de signature
- [ ] Rappel de paiement
- [ ] Rappel des fiches participants
- [ ] Suivi après le séjour (merci, sans sondage)

## 7. Décisions prises par Claude, à confirmer

- [ ] L'estimé part quand on le **marque envoyé** (pas dès la demande, qui arrive « À valider »).
- [ ] Le contrat part quand il est **préparé**.
- [ ] Rappels de paiement : 3 jours avant l'échéance, puis à l'échéance ; facture payable sur réception : un rappel **7 jours** après.
- [ ] L'acompte 2 est traité comme dû **21 jours avant l'arrivée**, même si QBO le dit payable sur réception.
- [ ] Factures et rappels au responsable de la **facturation**, copie au responsable de la réservation ; contrat avec le **courriel de la direction** en copie.
- [ ] Pré-arrivée et rappel des fiches : Classe nature et Journée plein air seulement.
- [ ] Mise en service : aucun courriel pour un événement d'avant le jour de la mise en ligne (pas d'envoi en masse aux réservations importées).

## 8. Avant la mise en ligne (README, section 13)

- [ ] Jeton Gmail obtenu **en étant connecté avec inscriptions@** → secret Cloudflare `GMAIL_INSCRIPTIONS_REFRESH_TOKEN`.
- [ ] Sous-domaine des pages publiques (`HOTE_PUBLIC`), pour que les liens des courriels y mènent.
- [ ] Premier envoi réel : à une adresse de l'équipe, pour voir le courriel dans une vraie boîte (et dans « Envoyés » d'inscriptions@).
