# Vérification du portail client (Réservations › page client et fiches participants) — réunion du 2026-10-21, lots D et G

> **Passée par Claude en DEV le 2026-10-21.** Corrigés en chemin : contrat signé à la main ou importé (étape Confirmée, sans signature en ligne) affiché « Votre contrat vous sera envoyé sous peu » sur la page client (maintenant « ✓ Contrat signé ») ; dates de la page client au jour UTC (un estimé accepté ou un contrat signé le soir paraissait daté du lendemain : jour de Montréal maintenant) ; tableau des fiches qui élargissait toute la fiche de réservation (la page débordait de 42 px) ; « Total » collé au montant sur téléphone. **Reste pour Maxime** : les cases non cochées (§7), les décisions du §8 et « Avant la mise en ligne ».

En DEV seulement (base locale), module réservé aux admins pendant les essais. Migration `20261022002253_reservations_portail_client.sql`, appliquée en DEV seulement. Aperçu : config `portail-client-essai` (http://localhost:5211/reservations), compte `admin` ; page client : `http://localhost:5211/client/<jeton_client>` (lien dans la fiche › Page client). Une fois commité, aussi sur l'aperçu fixe http://localhost:5173.

**Données d'essai** (`supabase/seed.sql`, section « Portail client ») : **27-G-981** demande (aucun estimé), **27-G-982** estimé envoyé (accepté pendant l'essai, voir §1), **27-G-983** estimé accepté (signé pendant l'essai, voir §1 ; a une fiche « Ne-doit-pas Paraître » reçue avant la signature), **27-G-984** contrat signé avec 10 fiches fictives (dont Jade Fortin, reçue avant la case de consentement), **27-G-985** séjour passé (fiches fermées, pas encore effacées). 27-G-595, 27-G-596 et « École Essai Claude (DEV) » : pas touchés.

## 1. Page client à chaque étape (D)

- [x] Une seule colonne (`max-w-3xl`), blocs dans l'ordre du déroulement : séjour, estimé, contrat, confirmation des infos, fiches, documents, factures, puis la ligne « Une question ? ».
- [x] **Demande** (981) : séjour + « Votre estimé est en préparation » ; ni contrat, ni fiches.
- [x] **Estimé envoyé** (982) : estimé avec la case et le nom ; **pas de bloc contrat** (déjà fait, vérifié). Acceptation faite sur la page (« Prof Essai ») → « ✓ Estimé accepté par Prof Essai le 21 octobre 2026 » et le bloc contrat « vous sera envoyé sous peu » paraît ; toujours pas de fiches.
- [x] **Estimé accepté** (983) : contrat « à venir » ; la fiche reçue avant la signature n'est **pas** sur la page (SQL : `page_client` → `fiches` null).
- [x] **Contrat envoyé** (983, demande de signature d'essai) : « Lire et signer le contrat » ; toujours pas de fiches.
- [x] **Contrat signé** (983, signature par `signer_contrat` comme la page `/signer`) : au rechargement, « ✓ Contrat signé par Prof Essai le 21 octobre 2026 », puis « Vos informations pour le séjour » et le bloc **Fiches participants** apparaissent seuls (lien + la fiche reçue).
- [x] Contrat signé à la main ou importé (984, 985 : `signe_le` / étape Confirmée, pas de signature en ligne) : « ✓ Contrat signé. Votre réservation est confirmée. » (avant : « vous sera envoyé sous peu »).
- [x] **Bloc « Une question / un message » retiré** ; à la place : « Une question ? Écrivez-nous à inscriptions@camptremblant.com » (`CourrielCopiable` : copié au clic, jamais de `mailto:` ; adresse = courriel de la compagnie de la réservation, repli inscriptions@). EN : « A question? Write to us at … ». `message_client` reste en base (SQL : fonction et droits inchangés).
- [x] Anglais (`?lang=en`) : tous les nouveaux textes traduits (fiches, manquantes, filtre, ligne question, contrat signé).
- [x] Téléphone (375 px) : aucune largeur de trop (`scrollWidth` = 375) sur 981, 982, 983, 984 ; tableau de l'estimé lisible ; ordinateur : idem.

## 2. Fiches participants sur la page client (G, côté prof)

- [x] Seulement à partir de la signature (SQL, 5 réservations d'essai : 981 et 982 → rien, 983 après signature, 984, 985 → le bloc) ; réservation fermée (annulée, perdue, en attente) → rien.
- [x] Lien à transmettre + « Copier le lien » tant qu'on peut remplir une fiche ; après le départ (985) : « Les fiches de ce séjour sont fermées. », plus de lien (`jeton` null) ni de compte de manquantes.
- [x] « 10 fiche(s) reçue(s) sur 27 attendue(s) · 17 manquante(s) » (« toutes reçues ✓ » quand il n'en manque plus).
- [x] Liste des fiches reçues par nom de famille : nom, « (adulte) », classe, date de réception ; **allergies** (ambre) et **diète particulière** seulement (« Sans œufs » pour une diète « autre ») ; résumé « 3 avec allergies · 5 avec une diète particulière » ; filtre « Toutes / Allergies ou diète ».
- [x] Rien d'autre de la santé : SQL, les clés rendues par fiche sont `nom, prenom, genre, groupe, recue_le, partage, allergies, diete, diete_autre` ; une fiche avec « problèmes de santé », Epipen et médicaments ne fait rien paraître de tout ça (recherche dans la réponse JSON : aucune fuite) ; jamais le courriel.
- [x] Fiche reçue avant la case de consentement (Jade Fortin) : nom seulement, « Allergies et diète non communiquées (fiche reçue avant le consentement) ».
- [x] Effacement (Loi 25) : simulé en SQL (conservation à 0 mois, transaction annulée) → le bloc disparaît de la page du séjour passé.

## 3. Formulaire des fiches : consentement (G)

- [x] Nouvelle case obligatoire, juste avant « Envoyer la fiche », texte selon élève ou adulte : « J'accepte que ces renseignements servent à la sécurité et aux repas de mon enfant pendant le séjour, et que ses allergies et sa diète soient communiquées au responsable du groupe (enseignant·e et accompagnateurs). » (adulte : « ma sécurité… mes allergies et ma diète ») ; EN traduit.
- [x] Sans la case : « Cochez cette case pour envoyer la fiche. » + « Quelques champs sont à compléter. » ; la base refuse aussi (`ajouter_fiche` : « Il faut cocher la case de consentement… », essai SQL en anonyme).
- [x] Avec la case : fiche reçue, `consentement_le` posé ; elle paraît aussitôt chez le prof avec allergies et diète, jamais le « problème de santé » saisi (essai « Alice Essai-Formulaire », au téléphone).
- [x] « Remplir une autre fiche » : la case de consentement est à recocher (le consentement aux nouvelles et le courriel restent).
- [x] Mention de confidentialité revue : l'équipe voit la fiche complète, le responsable du groupe seulement le nom, la classe, les allergies et la diète ; effacé 3 mois après le séjour.
- [ ] **Textes du consentement et de la confidentialité à faire relire** (FR et EN, `public/textes.ts` : `consentement_enfant`, `consentement_adulte`, `confidentialite`). — à Maxime

## 4. Section « Fiches participants » de la fiche de réservation (G, côté équipe)

- [x] Section à part, juste sous « Page client » (Classe nature et Journée plein air) : « 11 fiche(s) reçue(s) sur 27 attendue(s) · 16 manquante(s) (10 élève(s), 1 adulte(s)) », pastilles par diète, Allergies, Problèmes de santé, Epipen, Sans autorisation de médicaments, Effacées.
- [x] Lien des fiches (Copier, Ouvrir, Nouveau lien pour qui écrit) + l'état sur la page client : « Pas encore sur la page client : … y paraîtront à la signature du contrat » (ambre) ou « Sur la page client : ce lien et les fiches reçues (nom, classe, allergies, diète…) ».
- [x] Avec l'accès « Fiches participants » (admin) : tableau nom, classe, reçue, allergies, santé, Epipen, diète, médicaments, poubelle ; filtre « À signaler » par défaut (allergies, santé, Epipen, diète particulière ou pas d'autorisation de médicaments), « Epipen », « Toutes ».
- [x] Le tableau défile de côté dans sa carte : il n'élargit plus la fiche (ordinateur à 1 024 px : `scrollWidth` = largeur de la fenêtre).
- [x] Export CSV (« Fiches participants 27-G-984.csv », séparateur « ; », BOM, sans courriel ni fiche effacée) — vérifié sans téléchargement (contenu lu dans la page) et par `npm run test:fiches`.
- [x] Sans l'accès « Fiches participants » (Julie, Réservations en lecture ajoutée le temps de l'essai puis retirée) : totaux et lien seulement, « Le détail des fiches (noms, santé) est réservé… », ni Rapport cuisine ni CSV ; l'adresse du rapport → « Ce rapport est réservé… » ; SQL : l'anonyme ne lit pas `reservations.fiches` (permission refusée).

## 5. Rapport allergies et diètes pour la cuisine (G)

- [x] « Rapport cuisine » → `/reservations/r/<id>/allergies` : en-tête (numéro, groupe, forfait, dates, élèves et accompagnateurs, reçues contre attendues, « 17 manquante(s) : à vérifier à l'arrivée »), pastilles par diète + « Régulière : 4 » + « Sans fiche : 17 », tableau des diètes particulières (diète, nom, classe), tableau des allergies (Epipen en tête, « OUI » en rouge), mention « confidentiel (Loi 25) … à détruire après le séjour ».
- [x] Jamais les problèmes de santé ni les médicaments dans le rapport.
- [x] Bouton « Imprimer » ; titre du PDF « Allergies et diètes - 27-G-984 - … » (`useTitreImpression`) ; le titre « Réservations », les onglets, le menu et le bouton sont cachés à l'impression.
- [ ] Aperçu avant impression (Imprimer → PDF) : une à deux pages lisibles. — à Maxime (l'impression ne se fait pas depuis le panneau)

## 6. Tests

- [x] `npm run test:fiches` (nouveau, 6 tests : règle de la page client, manquantes, diètes, ordre par nom, rapport cuisine, CSV), `test:calcul` (13), `test:rapports` (10), `test:worker` (155) : tout passe, aussi sur une copie propre du commit.
- [x] `tsc -b` et `vite build` passent sur la copie propre du commit ; `npm run lint` : rien dans mes fichiers (avertissements d'autres modules en cours, pas les miens). Pendant l'essai, `tsc` signalait une erreur dans `Estime.tsx` (travail en cours du sous-agent Courriels), disparue ensuite.

## 7. À regarder par Maxime

- [ ] Relire les textes du consentement et de la confidentialité (§3).
- [ ] Aperçu avant impression du rapport cuisine (§5).
- [ ] Une vraie signature par `/signer/<jeton>` sur un contrat préparé dans l'app : la page client montre ensuite les fiches (l'essai a signé par la même fonction SQL, sans PDF).

## 8. Décisions prises par Claude, à confirmer

1. **Adresse de la ligne « Une question ? »** : le courriel de la compagnie de la réservation (`reservations.compagnies.courriel`, onglet Modèles et compagnies : inscriptions@ pour GBPA+, info@opikawa.com pour Opikawa), comme le pied de page ; inscriptions@ si la compagnie n'en a pas. Pas de nouveau réglage.
2. **« Contrat signé »** = `signe_le` posé ou étape Confirmée et suivantes (contrats signés à la main ou importés compris) ; réservation fermée (annulée, perdue, en attente) : rien des fiches sur la page.
3. **Consentement obligatoire** : pas de fiche sans la case (sinon le prof ne pourrait pas savoir), vérifié aussi par la base, recoché pour chaque fiche. Une fiche d'avant la case ne montre au prof que le nom (« non communiquées »).
4. Le prof voit aussi la **classe** et la **date de réception** (rien de santé), pour relancer les bons parents. **Pas l'Epipen** (décision suivie à la lettre : « pas le reste de la santé ») — facile à ajouter si voulu.
5. Après le départ : plus de lien ni de manquantes sur la page ; la liste reste jusqu'à l'effacement (3 mois).
6. Le **lien des fiches reste visible pour l'équipe** à toutes les étapes (elle peut l'envoyer elle-même) et le formulaire `/fiches/` n'est pas bloqué avant la signature : seule la page client attend la signature.
7. Le rapport cuisine compte aussi les fiches d'avant la case (l'équipe y a toujours eu accès) ; il ne montre que les allergies, l'Epipen et les diètes.
8. L'export CSV contient toute la fiche sauf le courriel (avec un avertissement au survol : le fichier n'est pas effacé par la Loi 25).

## Avant la mise en ligne

- Risque : **le lien de la page client circule par courriel** (transféré, boîte partagée de l'école…) : quiconque l'a voit les noms, classes, allergies et diètes des fiches reçues. « Nouveau lien » (fiche › Page client) coupe l'ancien.
- Faire relire les textes du §3 (Loi 25).
- Le rapport imprimé et l'export CSV sortent de l'app : ils ne sont pas effacés 3 mois après le séjour.
- Migration `20261022002253` à pousser en PROD avec le reste du plan (`/mise-en-ligne`) ; aucune donnée à reprendre (module vide en PROD).
- Phrases de modèles de courriels à revoir (sous-agent Courriels, rien changé ici) : aucun modèle ne renvoie au bloc message ; suggestions — `pre_arrivee` et `rappel_fiches` : ajouter « Vous voyez sur votre page les fiches reçues, avec les allergies et la diète de chacun : {{lien_client}} » ; `contrat` : « Une fois le contrat signé, le lien des fiches participants paraîtra aussi sur votre page. »
- À savoir (pas de ce lot) : au téléphone, la fiche de réservation déborde de côté à cause du tableau de l'estimé (`Estime.tsx`, `min-w-[34rem]`, même effet que corrigé ici pour le tableau des fiches : `w-0 min-w-full` sur son conteneur).
