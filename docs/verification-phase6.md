# Vérification de la phase 6 — Google Agenda et Airbnb

En DEV seulement. Rien n'est écrit dans les vrais calendriers Google : en DEV,
l'agenda est **simulé** (calendriers « essai-… » dans Réglages). Les iCal
d'Airbnb sont seulement **lus**.

**Avant de commencer** : comme pour la phase 5 (`npm run db:start`,
`npm run dev`, connexion `admin@camp.test`).

## 1. Airbnb

- [ ] Réservations › Réglages › **Airbnb (Vieille-France)** : « Dernière lecture » indique 1 réservation pour la VF complète et 3 pour l'étage du bas. « Lire maintenant » ne crée pas de doublons.
- [ ] La liste montre 27-A-001 à 27-A-004, étiquette « Airbnb · à compléter ».
- [ ] Ouvrir l'une d'elles : bandeau rose, lien « Ouvrir dans Airbnb » vers la bonne réservation, dates identiques à Airbnb.
- [ ] Compléter le nombre de personnes et une note : à la lecture suivante, ils restent.
- [ ] Les blocages « Not available » d'Airbnb ne deviennent **pas** des réservations.

## 2. Conflits avec Airbnb

- [ ] Sur une réservation de groupe en « Contrat envoyé », mettre les nuits d'une réservation Airbnb (ex. 24 au 25 décembre) et la section VFB : un bandeau rouge « Conflit avec Airbnb » s'affiche, et « Préparer le contrat » est grisé.
- [ ] Essayer de la passer en « Confirmée » : refusé, avec le numéro Airbnb en cause.
- [ ] Même dates avec seulement VFH (étage du haut) contre « étage du bas » : pas de conflit.
- [ ] Remettre la réservation comme avant.

## 3. Chevauchements

- [ ] Deux réservations confirmées sur les mêmes sections ou salles et les mêmes nuits : la liste jaune « Mêmes sections ou salles, mêmes nuits… » apparaît en haut de chaque fiche.
- [ ] Départ le 23 et arrivée suivante le 23 : **pas** de chevauchement (le jour du départ reste libre).

## 4. Google Agenda (simulé)

- [ ] Réglages › Google Agenda : « Écrire dans Google Agenda » coché en DEV, calendriers « essai-… ».
- [ ] En haut d'une fiche : « Google Agenda (simulé en DEV) : Confirmée PP ✓ » (ou l'étape en cours).
- [ ] Faire avancer une demande (Nouvelle → Estimé envoyé → Contrat envoyé → Confirmée) : le calendrier suit (Demande, Estimé, Contrat, Confirmée…).
- [ ] Une réservation confirmée avec une section VF va dans **Confirmée VF** ; sans VF, dans **Confirmée PP**.
- [ ] Closed lost, annulée ou en attente : « dans aucun calendrier ».
- [ ] Les réservations Airbnb : « dans aucun calendrier » (jamais réécrites).

## 5. Décisions prises par Claude, à confirmer (plan §10)

- [ ] Calendrier selon l'étape (Demande : nouvelle et contact établi ; Estimé : envoyé et accepté ; Contrat : envoyé ; puis Confirmée VF ou PP).
- [ ] Événements d'une **journée entière**, nuits [arrivée, départ) comme Airbnb (le jour du départ n'est pas bloqué).
- [ ] Titre « 27-G-055 · Collège Citoyen (266) », description sans données personnelles.
- [ ] Confirmée VF = au moins une section ou salle de la VF (VFB, VFH, SVF, CVF).
- [ ] Airbnb « VF complète » occupe VFB, VFH, SVF et CVF ; « étage du bas » occupe VFB seulement.
- [ ] Réservations Airbnb numérotées **AA-A-nnn**, hors de la suite des groupes.
- [ ] Une signature du client sur une réservation en conflit n'est pas bloquée (seulement signalée).

## 6. Avant la mise en ligne (README, section 14)

- [ ] Secrets Cloudflare `AIRBNB_ICAL_VF_COMPLET` et `AIRBNB_ICAL_VF_BAS`.
- [ ] `GOOGLE_AGENDA_REFRESH_TOKEN` (compte qui possède les 5 calendriers, portée calendar.events).
- [ ] Identifiants des 5 calendriers dans Réglages.
- [ ] À la bascule : retirer les événements d'Airtable, puis cocher « Écrire dans Google Agenda ».
- [ ] Vérifier que chaque annonce Airbnb importe bien l'iCal de « Confirmée VF ».
