# Vérification du module Accidents (rapports d'accident des employés)

> **Passée par Claude en DEV le 2026-10-23.** Corrigés en chemin : nom affiché deux fois quand le nom de camp est le nom complet (« Christiane Belisle (Christiane Belisle) »), texte de la recherche coupé sur téléphone. **Reste pour Maxime** : les cases non cochées et §7 (décisions).

En DEV seulement (base locale). **Avant de commencer** : `npm run db:start`, puis
l'aperçu `dev` (http://localhost:5173). Connexion par code (Mailpit,
http://localhost:54324) : `julie@camp.test` (direction), `sarah@camp.test`
(coordo), `lea@camp.test` (terrain), `admin@camp.test` (admin).

## 1. Accès

- [x] Direction (julie) : « Accidents 🩹 » dans la famille Équipe du menu, avant Feuilles de temps ; titre « Accidents », pastille ambre du nombre de dossiers ouverts.
- [x] Coordo (sarah) : « Accidents » dans le menu ; titre « Mes rapports d'accident » et une phrase qui dit qu'on n'y voit que ses rapports.
- [x] Admin › Utilisateurs : lignes « Accidents » (direction et développeur en écriture) et « Accidents › Déclarer » (coordo et développeur en écriture ; écriture ou rien, pas de lecture).
- [x] Tests SQL des droits (29 vérifications, transaction annulée ; script dans le scratchpad de la session) :
  - la direction voit tout, règle, écrit le suivi, supprime ;
  - le coordo ne voit que ses rapports, les modifie tant qu'ils sont ouverts, ne touche ni au suivi ni à la fermeture ni à l'auteur (la base garde l'ancienne valeur), ne supprime rien ;
  - photos : le coordo en ajoute et en retire seulement sur son rapport ouvert (table et seau) ; un autre coordo ne voit ni rapport, ni photo, ni fichier du seau ;
  - le terrain ne voit rien et ne peut pas déclarer ;
  - le développeur voit tout ; l'anonyme est refusé (« permission denied for schema accidents »).
- [x] Terrain (lea) : pas d'Accidents dans le menu, `/accidents` = « Accès refusé ».

## 2. Rapport (direction)

- [x] « + Rapport d'accident » : type (accident avec blessure par défaut, premiers soins seulement, quasi-accident, autre), résumé, personne blessée (employés actifs du référentiel, « Prénom Nom (nom de camp) », ou « Autre personne » avec un nom écrit), quand (maintenant par défaut, jamais dans le futur), où, ce qui s'est passé, témoins.
- [x] Section « Blessure et soins » (accident et premiers soins seulement) : blessure, premiers soins donnés, par qui, consultation médicale, « Absent du travail après la journée de l'accident » → rappel de l'avis de l'employeur à la CNESST (direction seulement) et date de retour au travail.
- [x] Avisés : ambulance, parents (personne mineure), police, CNESST → n° de dossier CNESST.
- [x] « Pour que ça ne se reproduise pas », puis « Suivi de la direction » (suivi, dossier réglé le).
- [x] Accident sans personne : refusé (écran et base) ; quasi-accident sans personne : permis.
- [x] Enregistré : la fiche reste ouverte pour les photos ; la carte montre le type, « Arrêt de travail », « CNESST », la personne, la date et le lieu.
- [x] Réglé : la carte passe sous « Dossiers réglés (n) », repliés.
- [ ] Recherche (nom, blessure, lieu, n° CNESST…). — à Maxime

## 3. Rapport (coordo)

- [x] Sur téléphone (375 px) : formulaire en une colonne, champs à 16 px (pas de zoom de l'iPhone), boutons collés au bas de la fenêtre.
- [x] Pas de section « Suivi de la direction » dans le formulaire ; le suivi écrit par la direction s'affiche en lecture.
- [x] Photo envoyée depuis la fiche de son rapport (seau privé, adresse signée).
- [x] Rapport réglé par la direction : « Dossier réglé par la direction : il ne se modifie plus », tout en lecture, seulement « Fermer ».
- [x] Pas de bouton « Supprimer ».

## 4. Photos et PDF

- [x] Seau privé `accidents-fichiers`, 20 Mo au plus, photos réduites à 1600 px, PDF tels quels (`preparerFichier`) ; adresses signées jamais gardées sur l'appareil.
- [ ] PDF : s'ouvre dans un nouvel onglet. — à Maxime

## 5. Santé : rien sur l'appareil

- [x] Requêtes `['accidents', …]` et `['accidents-adresses', …]` exclues de la persistance (`src/lib/requetes.ts`) ; pas de temps réel ; en ligne seulement.
- [x] Pas de copie dans le Drive (voir §7).

## 6. Données d'essai laissées en DEV

- « Coupure à la main en cuisine » (Julie, Louis Tremblay, arrêt de travail, CNESST 123 456 789), ouvert.
- « Piqûre de guêpe au quai » (Sarah, « Camille Bénévole », une photo rouge d'essai), réglé par Julie.

## 7. Décisions prises par Claude, à confirmer

- [ ] Coordonnateurs : peuvent déclarer et revoir leurs rapports (« Accidents › Déclarer » coché pour eux dans la grille). Le décocher dans Utilisateurs suffit.
- [ ] Le terrain ne déclare pas (comme convenu) : son coordo ou la direction remplit le rapport.
- [ ] Pas de copie dans le Drive partagé (renseignements de santé), contrairement à RH, Bâtiments et Véhicules.
- [ ] Rien dans l'accueil (« À faire pour moi », « À surveiller ») pour l'instant.
- [ ] Icône 🩹, famille Équipe.

## 8. Avant la mise en ligne

- [ ] Oui de Maxime.
- [ ] Migration `20261023161101_accidents` (schéma, accès, seau, politiques) ; elle liste tous les modules dans `module in (…)` de `acces_roles` et `acces_modules`.
- [ ] Exposer le schéma `accidents` (`config.toml` → `prod:db:config` ou PATCH `db_schema`), vérifier avec une requête anonyme (« permission denied for schema accidents »).
- [ ] `dev` porte d'autres changements pas encore en ligne : voir `/ou-on-en-est` avant de publier.
