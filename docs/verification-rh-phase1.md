# Vérification du module RH — phase 1 (données, accès, écrans internes)

> **Passée par Claude en DEV le 2026-10-12.** Corrigés en chemin : fiche d'une candidature ou d'une personne qui plantait juste après sa création (ligne provisoire incomplète), « Ajouter » grisé après le choix d'une personne connue, Réglages qui plantaient après la suppression de la saison affichée, embauches pas relues après « A refusé le poste », fusion qui proposait de garder la fiche vide, focus du 1er champ des fenêtres « Nouvelle… », pastille « Ancien » qui manquait à 25 anciens de l'été 2026 (nouvel indicateur « A déjà travaillé avec nous »). **Reste pour Maxime** : les cases non cochées (coups d'œil sur les vraies données, ouverture des fichiers dans un nouvel onglet) et §9 (décisions).

En DEV seulement (base locale). Les données d'Airtable y sont importées **sans
NAS ni comptes bancaires** ; les fiches fictives du `seed.sql` (Rosalie
Gauthier, Maya Nguyen, Thomas Pelletier « Hibou », Samuel Leblanc « Castor »,
Inès Haddad) servent aux essais de paie (NAS d'essai 046 454 286).

**Avant de commencer** : `npm run db:start`, puis l'aperçu `rh-essai`
(http://localhost:5200) ou `npm run dev`. Connexion par code (Mailpit,
http://localhost:54324) : `julie@camp.test` (direction), `sarah@camp.test`
(coordo), `alex@camp.test` (terrain), `admin@camp.test` (admin).

## 1. Accès

- [x] Direction (julie) : « RH 👥 » dans le menu, juste avant Feuilles de temps.
- [x] Coordo (sarah) : pas de RH dans le menu ; l'adresse `/rh` affiche « Accès refusé ». Terrain : vérifié par les tests SQL.
- [x] Admin › Utilisateurs : la grille a les lignes « RH » et « RH › Paie », la direction en écriture.
- [x] Ajouter « RH » à sarah (ajout personnel) : elle voit le module, **sans** la carte « 🔒 Paie » des fiches. — l'app ne relit les droits qu'au rechargement (comme pour les autres modules) ; accès retiré ensuite
- [x] Tests SQL des droits : 28 vérifications (direction, coordo avec et sans ajout, terrain, anonyme ; colonnes chiffrées illisibles ; écriture directe de la paie et du journal refusée ; NAS invalide refusé ; accepter, A refusé le poste, fusion, personne avec embauches protégée).

## 2. Import d'Airtable (DEV)

Import fait le 2026-10-12 par le connecteur Airtable de Claude (extraits enregistrés tels quels, sans les champs de paie) : 684 personnes, 320 candidatures, 252 embauches, 70 dossiers, 600 fichiers (CV, contrats, cartes, pièces d'identité, photos).

- [x] Candidatures › « Toutes » : 320 d'Airtable + les fictives ; par statut, les mêmes nombres qu'Airtable (Acceptée 93, Refusée après entrevue 59, Refusée équipe complète 55, En attente 47, A refusé le poste 28, ASPI proposé 21, Question de permis 13, Entrevue proposée 3, À traiter 1).
- [x] Comparaison automatique fiche par fiche : statut, pré-décision, saisons, postes, entrevue, commentaires, notes d'entrevue, échelon, motivation, courriel (320 candidatures) ; rémunération, 4 %, disponibilités, code d'éthique (70 dossiers) ; adresse, assurance maladie, diète, t-shirt, allergies, contacts d'urgence (68 dossiers retrouvés par courriel) : **aucun écart**. 647 disponibilités reprises sur 647.
- [ ] 5 candidatures prises au hasard, comparées à Airtable à l'œil : nom, saisons, postes demandés, réponses, commentaires, entrevue, CV qui s'ouvre. — à Maxime
- [x] Le courriel en double dans Humains (2 fiches) donne une seule personne.
- [ ] Employés › Été 2026 : la liste (89) correspond aux employés de l'été ; postes, compagnies et échelons justes. Ceux acceptés sans poste dans Airtable sont « À préciser » (18). — à Maxime
- [x] Banque 2025 : 34 « ne reprendrait pas » → 34 ⛔ ; Employés › Été 2025 (53), Été 2024 (33)… sans poste, « Complète ».
- [x] Journal : les 273 « Dernier courriel envoyé » d'Airtable sont gardés.
- [x] Relancer l'import : aucun doublon (deux fois).
- [x] Fichiers : 600 sur 600 dans le seau (7 refusés au 1er passage : 2 Pages, 1 .eml, 1 HTML, 3 de plus de 20 Mo ; le seau accepte maintenant tous les types jusqu'à 50 Mo).

## 3. Candidatures (liste)

- [x] Par défaut « À faire » (65 = À traiter 1 + Entrevue proposée 3 + En attente 48 + Question de permis 13) ; chaque pastille montre son nombre.
- [x] Filtres saison, compagnie, nouveaux / anciens, recherche ; l'adresse garde les filtres.
- [x] Pastille « Ancien », ⛔ pour « ne pas réembaucher », ✓ et le poste quand la candidature est acceptée.
- [x] « + Candidature » : recherche par nom de camp (« hibou »), personne choisie ; un courriel déjà connu (même avec des majuscules) est signalé et bloque le doublon. — « Ajouter » restait grisé après le choix d'une personne connue : corrigé

## 4. Fiche d'une candidature

- [x] Pré-décision : un clic la pose, un 2e clic la retire.
- [x] Changer le statut : « Reçue → Entrevue proposée » au journal, avec le nom de qui l'a fait.
- [x] « Proposer une entrevue » ; date et notes d'entrevue gardées après un rechargement. — la date posée par script : l'outil de test ne sait pas taper dans un champ date
- [x] « Accepter… » : saison, compagnie et poste proposés d'après la demande ; l'échelon d'un ancien = celui de sa dernière embauche (3) ; l'embauche est créée en « M ».
- [x] Avertissement si la personne a déjà une embauche pour la saison choisie.
- [x] Statut « A refusé le poste » : son embauche passe à « Annulée » (et la fiche le montre tout de suite). — relecture ajoutée
- [x] « Modifier » la demande (une saison et un poste ajoutés), puis « Terminé ».
- [x] CV : ajouter un PDF ; l'adresse signée se crée et le fichier se télécharge.
- [ ] CV : un clic sur le nom l'ouvre dans un nouvel onglet. — le panneau de test bloque les nouveaux onglets ; à Maxime
- [x] « Effacer les renseignements » : notes d'entrevue, réponses et CV (fichier compris) disparaissent ; le statut, le journal et le bandeau « effacés le … » restent.
- [x] « Supprimer la candidature » : retour à la liste ; la personne et ses embauches restent.
- [x] Une candidature tout juste ajoutée s'ouvre sans erreur. — plantait : corrigé

## 5. Fiche d'une personne

- [x] Nom de camp modifié et gardé ; dossier (diète) modifié et gardé.
- [x] Carte d'embauche : statut, compagnie, poste, échelon, dates, paie ; une embauche complète est repliée.
- [x] « + Embauche » › Bénévolat : pas d'échelon ni de paie, pastille « Bénévolat », « Entente de bénévolat » dans la carte, « Bénévole » à la place du poste.
- [ ] « + Embauche » › Emploi : ajoutée, A ou M selon que la personne est un ancien. — même calcul que « Accepter » (vérifié) ; à refaire par Maxime
- [x] 🔒 Paie (Thomas Pelletier) : NAS « •••-•••-286 », compte « •••567 ». « Afficher » montre 046-454-286, puis se masque seul après une minute ; la consultation s'ajoute à la liste.
- [x] Paie › « Modifier » : un NAS invalide (123 456 789) est refusé avec « Ce NAS n'est pas valide (9 chiffres, clé de contrôle). » ; changer seulement le transit garde le NAS.
- [x] Spécimen de chèque : envoyé ; l'ouvrir note la consultation (« spécimen »).
- [ ] Spécimen et documents : s'ouvrent dans un nouvel onglet. — à Maxime (même limite du panneau de test)
- [x] Documents : carte de premiers soins avec une date d'expiration passée, en rouge.
- [x] Conformité : « Ne pas réembaucher » ajoute le bandeau ⛔ ; nouvelle case « A déjà travaillé avec nous avant la base RH ».
- [x] Notes au dossier : « Avis écrit » ajouté avec l'auteur, puis supprimé.
- [x] « Fusionner avec… » : la fiche en double disparaît ; le courriel et le nom de camp de l'autre restent ; ligne « fusionnée » au journal. Par défaut, la fiche qui a le plus d'historique reste. — défaut corrigé
- [x] « Supprimer » grisé pour une personne qui a des embauches ; une personne sans embauche se supprime (seulement elle : 689 personnes restent).

## 6. Employés

- [x] Saison proposée : Automne 2026 (la prochaine qui a des embauches).
- [x] Filtres saison, compagnie, emploi / bénévolat (gardés dans l'adresse), pastilles par état du dossier.
- [x] Colonne Paie : « À compléter » ou ✓ ; « — » pour un bénévole.
- [x] Pastille « Ancien » : pas pour un premier été (Thomas en Été 2026), oui l'hiver suivant ; Été 2026 : 43 anciens sur 89 avec « A déjà travaillé ».

## 7. Personnes

- [x] Recherche par téléphone (« 819 555 0202 ») et par nom de camp ; filtres « Déjà embauchés » (237), « Jamais embauchés » (452), « Ne pas réembaucher » (35).
- [x] 100 lignes puis « Voir plus ».
- [x] « + Personne » : le prénom a le focus ; la fiche s'ouvre.

## 8. Réglages

- [x] Saisons : « + Saison » (Hiver 2028), « Ouverte » cochée, supprimée ; pas de poubelle pour une saison qui sert (Été 2026). — plantait après la suppression de la saison affichée : corrigé
- [x] Dates de l'été 2027 reprises de 2026 (+ 1 an, même jour de la semaine : vendredi 1er mai 2026 → vendredi 30 avril 2027 ; semaine 1 du dimanche 27 juin).
- [x] Postes : « + Poste », saison Hiver cochée, « Supprimer » (inutilisé) ; « Retirer » un poste utilisé, visible grisé dans « Voir les postes retirés », « Remettre ».

## 9. Décisions prises par Claude, à confirmer

- [ ] NAS et compte chiffrés dans la base ; affichés une minute ; chaque affichage (et chaque spécimen ouvert) noté.
- [ ] « A refusé le poste » annule les embauches pas encore complètes.
- [ ] Une personne est retrouvée automatiquement seulement par un courriel identique ; sinon « Fusionner ».
- [ ] Libellés uniformisés des postes (« Coordonnateur », « Spécialiste photos et vidéos », « Professeur de français langue seconde »…).
- [ ] Banque d'employés 2025 : chaque « dernière saison active » devient une embauche complète sans poste ; « À déjà travaillé = Oui » et « Ancien = Oui » des dossiers deviennent « A déjà travaillé avec nous » ; « ne reprendrait pas » = ⛔ ; ses notes vont dans les notes permanentes.
- [ ] Les acceptés de l'été 2026 sans dossier dans Airtable sont « Dossier à envoyer » (à passer à « Annulée » à la main s'ils n'ont pas travaillé).
- [ ] Courriels invalides d'Airtable (« n.a »…) ignorés : la personne reste sans courriel.
- [ ] Documents : tous les types acceptés (Pages, .eml…), 50 Mo au plus.

## 10. Avant la mise en ligne

- [ ] Exposer le schéma `rh` en PROD (PATCH `db_schema`, voir la leçon du schéma `caisse`).
- [ ] Après `db push` : la clé `rh_cle_paie` existe dans le coffre (Vault) de la PROD.
- [ ] Import final en PROD **avec** NAS et comptes (`--avec-paie`) et fichiers (spécimens compris), puis la comparaison automatique.
- [ ] Publier RH seul : `dev` porte aussi Réservations.
- [ ] Airtable reste en service jusqu'à la bascule (après les courriels de la phase 3).
