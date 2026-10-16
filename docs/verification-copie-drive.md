# Vérification — copie des documents vers les Drive partagés

Passée par Claude en DEV le 2026-10-16 (base locale, copie simulée : rien ne part vers Google en DEV). Essai réel avec Google fait le même jour par Maxime (`scripts/essai-drive.mjs` : PDF déposé dans Opérations › Véhicules).

Corrigé en chemin :
- Des CV importés d'Airtable ont un chemin en « .curri » ou « .cv202 » : l'extension du nom vient maintenant du type du fichier (« Curriculum Vitae.docx »).
- Un arriéré d'un module (import RH) aurait bloqué les autres : les documents sont pris **un module à tour de rôle**.
- Une copie réussie dont la note échoue n'est plus comptée comme une erreur.

## Base (SQL, DEV)

- [x] Migration `20261016151529_copie_drive` appliquée ; `20261016151530_reservations_copie_drive` aussi (Réservations, à part).
- [x] `core.drive_a_copier` : modules actifs seulement ; Réservations inactif → rien de ses documents.
- [x] Un module sans sa fonction `drive_documents()` (Réservations en PROD aujourd'hui) est sauté sans erreur.
- [x] `anon` et `authenticated` ne peuvent pas appeler `drive_a_copier` ni `drive_noter` (« permission denied ») ; tables lisibles par les admins seulement.
- [x] Noms : PDF = son nom d'origine ; photo sans nom = « Assurance 2026-10-16.jpg », « Photo 2026-10-16.jpg » ; Réservations = « Contrat 27-G-055 signé.pdf ».
- [x] Dossiers : véhicule › rubrique (Immatriculation, Assurance, Inspections, Autres documents) ; remorque sous « Remorques » ; Bâtiments › bâtiment › « Panneau B » / « Valve – … » ; RH › « Dossiers d'employés (copies de l'app) » › « Nom, Prénom » ; Réservations › « 2026-27 » › « 27-G-045 – Dominique Cottereau ».
- [x] Pré-reliés : Spécial → « Minotour SPÉCIAL », Teryx Noir → « Tyrex Noir », Fisher price → « 4 roues » (confirmé par Maxime).
- [x] Portrait RH (genre « photo ») pas copié.

## Worker

- [x] `npm run test:worker` : 150 + 9 tests passent (mode, noms comparés, pas configuré, simulé, dossier existant retrouvé, rubrique créée, envoi dans le Drive partagé, au plus 3 par passage, tour de rôle, erreurs).
- [x] DEV, vraie base locale : 4 documents d'essai (Étobus, Maman loutre, Spécial, panneau B) déposés puis copiés en 4 passages, sans erreur ; dossiers notés dans `core.drive_dossiers`.
- [x] Moteur de Cloudflare en local (workerd) : le fichier passe en flux (`FixedLengthStream`), 3 copiés, sans erreur.
- [x] Jamais d'effacement ni de modification dans le Drive (aucun DELETE ni PATCH vers Google).

## Décisions prises par Claude, à confirmer

- Projet Google à part (« Copie Drive », Internal) plutôt que le client des courriels : la bascule RH le passe en External, où la portée Drive complète demanderait un examen de Google.
- Portée `drive` complète : « fichiers de l'app seulement » ne garantit pas l'écriture dans un dossier existant.
- 3 documents par passage (forfait gratuit de Cloudflare : 50 appels par passage, partagés avec le reste du cron) : 12 par heure.
- Fichiers des Bâtiments copiés même quand ce sont des photos (ce sont les pièces jointes des panneaux et valves, pas une photo décorative).
- Les documents déjà dans l'app sont copiés aussi (au rythme ci-dessus).

## Avant la mise en ligne

- [ ] Secrets Cloudflare `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN` (README §17) — à Maxime.
- [ ] (Recommandé) Relancer `node scripts/essai-drive.mjs --client …` : même essai, cette fois avec le client du Worker (liste et création de dossiers) — à Maxime.
- [ ] Supprimer « Essai copie de l'app (à supprimer) » dans Opérations › Véhicules, puis le fichier JSON du client dans Téléchargements — à Maxime.
- [ ] Publier seul : migration `20261016151529` seulement (pas `…151530`, qui part avec les Réservations), `worker/commun/drive.js`, `worker/drive/`, l'appel dans `worker/index.js`.
- [ ] Après le premier passage en PROD : regarder `core.drive_copies` (copiés, erreurs) et les dossiers créés dans le Drive.
- [ ] À la bascule des Réservations : `update core.drive_reglages set actif = true where module = 'reservations'`, puis classer les anciens documents de 2026-27 sous « Ancien système » de chaque réservation (liste proposée d'abord).
