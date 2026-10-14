# Vérification de Travaux et Mastertimeline — lignes, étiquettes, téléphone, priorités, Réglages (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14** (ordinateur 1280 px et téléphone 375 px ; comptes direction = Julie, terrain = Léa). Demandes de la réunion avec Charlotte : toute la ligne d'une tâche ouvre sa fiche, étiquettes en couleur dans les lignes, Travaux complet sur téléphone pour la direction, 3e niveau de priorité « Éventuellement », Réglages de Mastertimeline au visuel du Référentiel. Corrigés en chemin : coche « ✓ » collée au nom dans le choix des étiquettes, étiquettes absentes de la vue Année. **Reste pour Maxime** : les cases non cochées (sur un vrai iPhone), les décisions du §8, puis la mise en ligne (§9 : rien en base).

En DEV seulement (base locale). Aucune migration : les étiquettes avaient déjà
une couleur (Corvée `#d97706`, Woofing `#5E7C3F`, posées par la migration
20261006000060, donc aussi en PROD) et la priorité reste un nombre (1, 2, 3 ;
3 par défaut) : seul le nom affiché change.

**Avant de commencer** : l'aperçu `mastertimeline-essai`
(http://localhost:5198/travaux et http://localhost:5198/mastertimeline),
compte `julie@camp.test` (direction) et `lea@camp.test` (terrain, n'a que
Travaux). Les tâches d'essai de Claude (« Essai Claude : … ») ont été retirées
après la vérification (photos comprises).

## 1. Toute la ligne ouvre la fiche

Une seule règle pour les deux modules : `clicLigne` (`src/lib/ligneCliquable.ts`). Un clic n'importe où dans la ligne ouvre la fiche, sauf sur un contrôle (case, menu, lien, vignette, bouton, zone `data-garde-clic`) ; au clavier, le titre reste un bouton (Tab puis Entrée).

- [x] Travaux › Tâches, ordinateur (tableau) : clic dans la colonne Catégorie ou Chantier → fiche de la tâche.
- [x] Travaux, menu « Assignée à » dans la ligne : s'ouvre et change la personne, la fiche ne s'ouvre pas.
- [x] Travaux, case à cocher dans la ligne : coche la tâche (vérifié en base : `terminee`), la fiche ne s'ouvre pas ; terrain (Léa) : décoche une tâche, pas de fiche.
- [x] Travaux, téléphone (liste) : toucher la ligne à côté des étiquettes → fiche.
- [x] Travaux, bandeau « Signalements à trier » (direction) : clic dans la carte → fiche du signalement ; clic entre les menus du tri ou à côté de « Rejeter » → rien ; clic sur la photo → visionneuse, puis clic à côté pour la fermer → la fiche ne s'ouvre pas.
- [x] Terrain (Léa), ordinateur et téléphone : clic dans une ligne → fiche en lecture (« Je m'en occupe ») ; toucher la carte de son signalement → sa fiche.
- [x] Mastertimeline › Mois, ordinateur : clic dans la colonne Fournisseur → fiche du passage ; menu du responsable dans la ligne → pas de fiche ; case → coche le passage (vérifié en base), pas de fiche.
- [x] Mastertimeline › Mois, au clavier : Tab jusqu'au titre, Entrée → fiche.
- [x] Mastertimeline › Mois, téléphone : toucher la ligne → fiche.
- [x] Mastertimeline › Année : clic dans une case vide d'un mois → fiche ; clic sur la case d'un mois → coche ce passage, pas de fiche.
- [x] Mastertimeline › Corvée (vue d'une étiquette) : ligne de Mastertimeline → fiche de Mastertimeline ; ligne de Travaux → fiche de Travaux.
- [x] Mastertimeline › Responsables : clic dans une ligne → fiche du bon passage (« Passage de septembre 2027 »).
- [ ] Sur un vrai iPhone : toucher une ligne ouvre la fiche, toucher un menu de la ligne ouvre seulement le menu. — à Maxime

## 2. Étiquettes en couleur dans les lignes

- [x] Chaque étiquette d'une tâche = une pastille de sa couleur + son nom (teinte pâle, bord et point de la couleur) : Travaux (tableau et liste téléphone), Mastertimeline › Mois (tableau et liste), **Année** (nouveau : à côté du titre), Responsables, Projets, Corvée / Woofing, fiche de Travaux en lecture.
- [x] Choix des étiquettes (filtres et fiches) : point de la couleur devant le nom quand elle n'est pas choisie, « ✓ » quand elle l'est. — le ✓ était collé au nom : corrigé
- [x] Couleurs : déjà là (Corvée orange `#d97706`, Woofing vert `#5E7C3F`), réglées dans Mastertimeline › Réglages › Étiquettes avec le même sélecteur de couleur que Référentiel › Compagnies (Modifier → case Couleur). Rien à ajouter en base.

## 3. Travaux sur téléphone (direction)

- [x] Bouton rond « + » en bas à droite → « Nouvelle tâche » : Quoi, Où, Catégorie, Détails, Photos et PDF, puis **Priorité** (Urgent / Prioritaire / Éventuellement, « Éventuellement » d'office), Assigner à, Échéance, **Heures prévues**, Chantier, **Fournisseur**, Étiquettes. Avant : seulement « C'est urgent » et pas d'heures ni de fournisseur.
- [x] Tâche créée sur ordinateur avec tout rempli : en base, `a_faire`, priorité 2, Léa, 30 oct., 2,5 h, Trembloc, Plombier (test), Corvée, Chalet, Plomberie.
- [x] Tâche créée sur téléphone (Motel, Urgent, Woofing) : en base comme saisie.
- [x] Fiche sur téléphone : tous les champs au doigt, une colonne ; priorité changée (→ 3 en base) ; photo ajoutée (dans le seau et dans `photos`).
- [x] Boutons du bas (Ajouter / Annuler, Fermer / Envoyer vers Mastertimeline / Supprimer) collés au bas de l'écran pendant que la fiche défile ; sur ordinateur, à leur place habituelle.
- [x] Champs à 16 px sur téléphone (14 px sur ordinateur) : l'iPhone ne zoome plus au toucher d'un champ (vérifié : 16 px pour les 10 champs de « Nouvelle tâche » à 375 px).
- [x] Étiquettes plus hautes sur téléphone (plus faciles à toucher).
- [x] Terrain (Léa), téléphone : « Signaler un problème » sans les champs du tri, avec « C'est urgent » ; le signalement arrive à trier (bandeau ambre, pastille 1 sur l'onglet Tâches), avec « Signalé urgent » ; Léa ajoute une photo à son signalement.
- [x] Direction : accepte le signalement depuis le bandeau avec « Éventuellement » (en base : `a_faire`, priorité 3).
- [ ] Sur un vrai iPhone : prendre une photo depuis « Photo ou PDF » dans « Nouvelle tâche » et dans la fiche. — à Maxime (le navigateur d'essai ne peut pas ouvrir l'appareil photo : fichier fourni par script)

## 4. Hors ligne sur téléphone (inchangé, revérifié)

- [x] Hors ligne simulé : commentaire ajouté et tâche cochée → « Hors ligne · 2 en attente » ; rien en base.
- [x] Rechargement de la page : les 2 modifications repartent d'elles-mêmes (commentaire et `terminee` en base).
- [ ] Vrai mode avion sur un téléphone : signaler avec une photo, cocher, puis revenir en ligne. — à Maxime

## 5. Priorités : Urgent · Prioritaire · Éventuellement

- [x] Filtre « Toutes les priorités » : Urgent, Prioritaire, Éventuellement.
- [x] Regrouper par « Urgence » : groupes Urgent, Prioritaire, Éventuellement.
- [x] Fiche (direction), menu du tri du bandeau, « Nouvelle tâche » : mêmes trois noms ; nouvelle tâche = niveau 3 d'office (défaut de la base inchangé : 3).
- [x] Accueil (`src/shell/accueil/`, pas touché) : il ne montre le nom de la priorité que pour Urgent et Prioritaire (`t.priorite < 3`) ; le 3e niveau n'y apparaît nulle part, rien à changer.
- [x] Les lignes de Travaux ne montrent toujours que « Urgent » et « Prioritaire » (le niveau 3 = rien, comme avant).

## 6. Mastertimeline › Réglages

- [x] Responsables, Fournisseurs, Projets, Étiquettes : mêmes tableaux que le Référentiel (`TableauReferentiel`), mêmes boutons Modifier / Supprimer (`BoutonsAction`), même modification sur la ligne et même confirmation avant de supprimer.
- [x] Choix de la liste en boutons groupés (comme « Regrouper par ») au lieu des onglets gris ; défile sur téléphone.
- [x] Onglet **Entreprises retiré** ; à côté des boutons : « Compagnies : Référentiel › Compagnies » (lien pour la direction, texte seul sinon). L'ancienne adresse `/mastertimeline/reglages/entreprises` mène à Référentiel › Compagnies.
- [x] Projets : la colonne Entreprises montre les compagnies teintées de leur couleur, comme Référentiel › Employés.
- [x] Fournisseurs : note « Liste commune : Mastertimeline, Travaux et Achats s'en servent ».

## 7. Compilation

- [x] `tsc -b` et `vite build` : passent. `npm run lint` : rien de nouveau dans Travaux, Mastertimeline ni `src/lib` (avertissements existants ailleurs).
- [x] Aucun test automatique dans ces deux modules.

## 8. Décisions prises par Claude, à confirmer

- Réglages : les tableaux étaient **déjà** ceux du Référentiel (même composant) ; ce qui changeait à l'œil, c'étaient les onglets gris et l'onglet Entreprises. Claude a remplacé les onglets par les boutons groupés de l'app et retiré Entreprises. Si Maxime pensait à autre chose (ex. modifier dans une fenêtre plutôt que sur la ligne), le dire : il faudrait le faire aussi dans le Référentiel.
- Étiquettes : un **point de leur couleur** devant le nom, en plus de la teinte (la teinte seule était pâle).
- Couleur des étiquettes : le sélecteur du Référentiel (case Couleur), pas une palette fixe ; Corvée et Woofing avaient déjà leur couleur.
- Téléphone : boutons du bas collés au bas de l'écran et champs à 16 px **dans Travaux seulement** (module pensé pour le téléphone) ; les autres fenêtres de l'app ne changent pas.
- « Nouvelle tâche » de la direction : le menu Priorité remplace la case « C'est urgent » (la case reste pour les signalements du terrain et des coordonnateurs).
- Bandeau à trier : toute la carte ouvre la fiche, sauf la zone des menus du tri.
- Aucune donnée d'essai ajoutée au `seed.sql` (la base DEV n'a qu'une tâche Mastertimeline : « Vider la gouttière du motel », avec Corvée et Woofing).

## 9. Avant la mise en ligne

- Rien en base (pas de migration). Mettre en ligne seulement les fichiers de Travaux, de Mastertimeline, `src/lib/ligneCliquable.ts` et `src/lib/Etiquettes.tsx`.
- Après la mise en ligne : sur un téléphone, rechargement forcé si l'ancienne version reste affichée (version en cache).
