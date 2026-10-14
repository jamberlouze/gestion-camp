# Vérification de l'accueil et du menu par familles (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14** (repassée après le passage à la version A compacte). Demandes de la réunion avec Charlotte : voir tout le menu d'un seul coup d'œil (familles : d'abord la version B des maquettes, puis, au choix de Maxime, **la version A en compact**, avec l'icône de la famille à côté de son nom), plus d'entrée « Accueil », « Ma journée » pour tout le monde en vrai tableau de bord, cartes plus petites. Corrigés en chemin : info-bulle de la première icône qui sortait de l'écran à gauche (bulle calée dans l'écran), avertissement du linter (« Fast refresh ») réglé en sortant le type `Entree` dans `entreesMenu.ts`. **Reste pour Maxime** : un coup d'œil sur un vrai téléphone et un iPad, les décisions du §7, puis la mise en ligne (§8).

En DEV seulement (base locale). Aucune migration, aucune donnée ajoutée au
`seed.sql`. Pour voir la section Mastertimeline de l'accueil, Claude a ajouté le
temps de la vérification un responsable « Essai accueil » (courriel
`admin@camp.test`) et deux tâches d'octobre, **retirés ensuite** (la base DEV a
de nouveau 1 tâche, 7 responsables, 1 coche). Le relevé d'emploi a été vu avec
une réponse simulée dans le navigateur (aucun dossier ne peut être à fermer
avant décembre : rien n'est saisi avant le 4 octobre).

**Avant de commencer** : l'aperçu fixe http://localhost:5173 (une fois
commité) ou `accueil-essai` (http://localhost:5192). Comptes : `admin`
(Admin Test), `direction` (Julie), `coordo` (Sarah), `terrain` (Léa).

## 1. Menu ouvert (ordinateur) — version A compacte

Changement de Maxime le 2026-10-14 en fin de journée : la version B (rangées
d'icônes, nom au survol) est remplacée par la **version A en compact**. Les
rangées d'icônes et les tuiles de la version B sont retirées du code.

- [x] Familles dans l'ordre demandé : Opérations (Réservations, CRM, Calendrier, Cuisine, Animation, Rooming), Bâtiment et matériel (Travaux, Bâtiments, Inventaire, Embarcations, Véhicules), Gestion (Mastertimeline, Réunions, Achats, Petite caisse, Subventions, Vigie des camps), Équipe (RH, Feuilles de temps), puis la rangée du bas (Améliorations, Référentiel, Utilisateurs). — admin : 22 entrées, une pour chaque route de `App.tsx`
- [x] Liste avec l'**icône et le nom** de chaque module, **lignes de 28 px**, sous un titre de famille discret (petites capitales grises) avec **la petite icône de la famille** (tente, maison, planchette, deux personnes), la même que dans le menu réduit.
- [x] **Chaque famille se replie** d'un clic sur son titre (chevron, `aria-expanded`) ; l'état est gardé sur l'appareil (`menu-familles-repliees`, vérifié après un rechargement). Une famille repliée garde visible le module de la page ouverte (Gestion repliée sur `/achats` : seul Achats reste).
- [x] **Tout tient sans défiler** pour l'admin, familles ouvertes, à 1280 × 800 : 632 px de liste pour 650 px de place.
- [x] Améliorations / Référentiel / Utilisateurs en **rangée d'icônes en bas** (au-dessus du nom) ; nom en info-bulle au survol et au focus clavier (au-dessus de l'icône) ; `aria-label` sur chaque lien.
- [x] Focus clavier visible (contour vert) sur les titres de familles, les modules et les icônes du bas.
- [x] Utilisateurs = 🔑, RH garde 👥 (aussi 🔑 dans la liste « Utilisateurs et accès » des Améliorations).
- [x] Plus d'entrée « Accueil » : le logo « Gestion du camp » y ramène.
- [x] Calendrier : visible pour l'admin seulement, grisé avec la pastille « admins » ; pour Julie, absent du menu et `/calendrier` affiche « Calendrier : en pause » (comportement d'avant).
- [x] Page ouverte marquée (fond vert) ; `/cuisine/couts` marque Cuisine, `/achats?cible=30` marque Achats.
- [x] 🌲 (maquette 3D) et 👉 (Poke) toujours au pied du menu ; la maquette s'ouvre et se ferme avec Échap.

## 2. Menu réduit (ordinateur) — inchangé

- [x] Un bouton par famille (icône + nom court : Opérations, Bâtiment, Gestion, Équipe) ; la famille de la page ouverte est en vert (« Gestion (page ouverte : Achats) » pour les lecteurs d'écran).
- [x] Clic : la sous-liste s'ouvre à droite (titre de la famille, icônes et noms, page ouverte marquée, Calendrier « admins ») ; clic sur une autre famille = l'autre sous-liste ; clic ailleurs ou Échap = fermée (Échap remet le focus sur le bouton).
- [x] Au clavier : Entrée ouvre, Tab entre dans la sous-liste, Entrée ouvre le module (CRM) et la sous-liste se ferme.
- [x] Rangée du bas (💡 🗂️ 🔑) en icônes avec info-bulle à droite.
- [x] Logo en haut du menu réduit (ramène à l'accueil), bouton « Déployer le menu » dessous ; choix gardé sur l'appareil comme avant.

## 3. Téléphone (tiroir)

- [x] Tiroir = **la même liste A** (plus de tuiles) : titres de familles repliables avec leur icône, lignes de 36 px (doigt), rangée d'icônes du bas au-dessus du nom.
- [x] Admin, familles toutes ouvertes : la liste défile dans le tiroir (822 px pour 658 px de place sur un écran de 812 px) ; replier une famille suffit pour tout voir.
- [x] Choisir un module ferme le tiroir ; la barre du haut montre son icône et son nom.
- [x] Aucun défilement horizontal (375 px : largeur de la page = 375 px) pour l'admin, Julie et Léa.
- [ ] Sur un vrai iPhone et un vrai iPad. — à Maxime

## 4. Par rôle

- [x] **Admin** : 4 familles + rangée du bas (Améliorations, Référentiel, Utilisateurs).
- [x] **Direction (Julie)** : Opérations (Cuisine, Animation, Rooming), Bâtiment et matériel (5), Gestion (Mastertimeline, Réunions, Achats), Équipe (RH, Feuilles de temps), en bas Référentiel ; pas de Calendrier.
- [x] **Coordo (Sarah)** : 3 entrées → liste à plat avec les noms (Rooming, Travaux, Véhicules), sans familles.
- [x] **Terrain (Léa)** : Travaux et Feuilles de temps (elle remplit sa feuille) → liste à plat (lignes de 36 px) ; menu réduit = 2 icônes avec info-bulle ; tiroir = 2 lignes.
- [x] Julie : liste A sans défiler (4 familles + 🗂️ Référentiel en bas), comme la maquette A « rôles ».

## 5. Accueil (tableau de bord)

- [x] « Ma journée » pour tout le monde : drapeau d'essai (`COMPTES_ESSAI`, `voitNouvelAccueil`) et ancien accueil à 15 cartes retirés (`src/shell/Accueil.tsx`, `NouvelAccueil.tsx`) ; adresse `/` gardée (`Depart` : une personne qui n'a qu'un module y va encore directement).
- [x] Cartes et lignes plus compactes (en-têtes et lignes plus bas, détails en petit, raccourcis plus petits, recherche plus basse) ; lisibles sur téléphone.
- [x] **À faire pour moi**, groupé par module avec un petit titre :
  - [x] ⏱️ Feuilles de temps (direction et admins) : « Approuver 1 feuille de temps — PP21 · 4 au 17 oct. » (admin ; plusieurs périodes = « PP20, PP21 »).
  - [ ] « Soumettre ma feuille » (direction) avec « PP21 · 4 au 17 oct. » : pas visible avant la fin de la première période (18 octobre), même calcul que le libellé vu plus haut. — à revoir après le 17 octobre
  - [x] « Produire le relevé d'emploi : Morin, Léa — Aucune heure depuis 2 périodes · dernières heures : PP18 » avec le bouton « Relevé produit » → même confirmation que l'onglet Employés → `temps.fermer_dossier` reçoit le bon employé (réponse simulée, aucune fiche désactivée).
  - [x] ✅ « Mastertimeline · mes tâches d'octobre », résumé « 2 ce mois-ci », case à cocher du module ; responsable relié au compte par son courriel (Mastertimeline › Réglages › Responsables). Les en retard viennent d'abord (« N en retard · » dans le résumé, « En retard · septembre 2026 » sous la tâche) : même calcul qu'avant (`retards`), pas visible en octobre, premier mois de l'exercice.
  - [ ] Les vrais responsables de Mastertimeline n'ont pas encore de courriel en DEV : à remplir (Réglages › Responsables) pour que chacun voie ses tâches. — à Maxime
  - [x] 🛠️ « Travaux · assignés à moi » (inchangé sur le fond).
- [x] **À surveiller** : travaux urgents, « 3 achats à commander dans les 30 prochains jours — dont 1 en retard » (hook `useAchatsACommanderBientot`, lien `/achats?cible=30` : même compteur en haut des Achats), échéances des véhicules, notes d'Embarcations, dates limites des Subventions.
- [x] Rien de nouveau d'autre (pas d'assiettes du jour ni d'embarcations hors d'usage).
- [x] Chaque carte seulement avec l'accès : Julie voit « Aujourd'hui » et « Au travail » sans le lien Calendrier ; Sarah et Léa n'ont ni « Aujourd'hui » ni « Au travail » (la colonne de droite disparaît) ; Sarah et Léa n'ont pas de section Feuilles de temps.
- [x] Aucune erreur dans la console.

## 6. Code

- [x] `modules.ts` : champ `famille` obligatoire sur chaque module (un nouveau module sans famille ne compile pas), `FAMILLES` ; registre remis dans l'ordre du menu (la grille d'accès de la page Utilisateurs suit le même ordre).
- [x] `npm run build` passe ; `npm run lint` : aucune erreur (avertissements d'avant seulement).

## 7. Décisions prises par Claude, à confirmer

- [ ] Menu réduit : **le logo est ajouté en haut** (au-dessus du bouton « Déployer »), sinon on ne pouvait plus revenir à l'accueil en mode réduit (la maquette n'avait que le bouton).
- [ ] Menu réduit : la sous-liste s'ouvre **au clic** (et au clavier), pas au simple survol.
- [ ] Tiroir du téléphone : lignes de 36 px (au lieu de 28) pour le doigt, comme la maquette A téléphone ; la liste de l'admin y défile si tout est ouvert.
- [ ] Une famille repliée garde visible le module de la page ouverte.
- [ ] À surveiller : la ligne « N achats à commander » (sans date) est **remplacée** par « X achats à commander dans les 30 prochains jours (dont N en retard) » ; un achat sans date cible n'y paraît plus.
- [ ] Ordre de la grille d'accès (Utilisateurs) = ordre du menu par familles.
- [ ] « Relevé produit » directement depuis l'accueil (avec confirmation), en plus de l'onglet Employés.

## 8. Avant la mise en ligne

- [ ] Mettre en ligne avec le cadre : `src/shell/modules.ts`, `Layout.tsx`, `Menu.tsx`, `entreesMenu.ts`, `accueil/` (`Accueil.tsx`, `AFaire.tsx`, `ASurveiller.tsx`, `Aujourdhui.tsx`, `commun.tsx`, `outils.ts`), `App.tsx` (une ligne), `modules/ameliorations/types.ts` (une icône). L'accueil lit `useAchatsACommanderBientot` (Achats, 509533b), `useDossiersAFermer` / `useFermerDossier` (Feuilles de temps, 04aae6a) et `libellePeriodePaie` (759ec21) : ces commits doivent partir avant ou avec celui-ci.
- [ ] Prévenir l'équipe : plus d'entrée « Accueil » (cliquer le logo), menu par familles repliables.
