# Vérification du module RH — phase 2 (pages publiques)

> **Passée par Claude en DEV le 2026-10-12** (navigateur en format téléphone et ordinateur, SQL, tests du Worker). Corrigés en chemin : un `null` JSON pris pour une valeur (« compte manquant » refusé comme « compte invalide »), le refus de validation qui plantait (« malformed array literal »), une erreur de champ effacée qui masquait l'erreur calculée par la page (même défaut corrigé dans le formulaire des Réservations), le journal « Invitée » (genré, devenu « Invitation »), la saison visée par défaut de l'intention de retour. **Reste pour Maxime** : les cases non cochées (vrai téléphone, presse-papiers, nouvel onglet, relecture des textes) et §9 (décisions et actions).

En DEV seulement (base locale ; vraies données d'Airtable, sans NAS). Aucun courriel en phase 2 : les liens se copient.
Fiches fictives du `seed.sql` utilisées : Rosalie Gauthier (emploi Été 2027, dossier reçu puis **validée** pendant la vérification), Thomas Pelletier « Hibou » (bénévolat Hiver 2027 : dossier reçu ; invité au retour Été 2027 : a répondu « Non »), Maya Nguyen (emploi Hiver 2027, mineure : lien créé, pas encore rempli).

**Avant de commencer** : `npm run db:start`, puis l'aperçu `rh-essai` (http://localhost:5200) ou `npm run dev` (le Worker local, port 8787, part avec). Connexion par code (Mailpit, http://localhost:54324) : `julie@camp.test` (direction), `admin@camp.test`.

## 1. Sécurité et droits

- [x] L'anonyme n'a **aucun droit** sur le schéma `rh` (pas même `usage`) : ni fonctions, ni tables (`textes`, `invitations`, jetons des embauches). — tests SQL
- [x] Les six fonctions des pages publiques (`formulaire_emplois`, `recevoir_candidature`, `retour_public`, `repondre_retour`, `dossier_public`, `recevoir_dossier`) refusent la direction et les coordos : Worker seulement (clé secrète). — tests SQL
- [x] Jeton mal formé, inconnu ou d'un lien refait : refusé (404) ; dossier complet ou annulé : fermé (la page dit « Dossier fermé », l'envoi est refusé, 409). — SQL et navigateur
- [x] Le jeton d'une embauche ne touche qu'elle (l'autre embauche reste intacte). — tests SQL
- [x] `GET /api/rh/dossier` ne renvoie jamais le NAS, le numéro de compte, le transit ni les identifiants internes : seulement les 3 derniers chiffres. — navigateur
- [x] Paie écrite seulement par `rh.recevoir_dossier`, chiffrée (le NAS n'est pas lisible dans la colonne). — tests SQL
- [x] Coordo sans RH et terrain : refusés pour « créer le lien », « valider », « inviter », « nouveau texte » ; ne voient ni textes ni invitations. — tests SQL
- [x] Textes et réponses aux invitations : aucune écriture directe (fonctions seulement). — tests SQL
- [x] Tests du Worker (`npm run test:worker`) : 94 sur 94, dont 21 du RH (Turnstile refusé, champ piège, 4 postes, sans CV, doublon, fichiers retirés si la base refuse, bénévole sans paie, ancien spécimen retiré).
- [x] Tests SQL des droits et des fonctions : 85 sur 85 (transaction annulée : rien ne reste dans la base).

## 2. Formulaire de candidature (`/emplois`)

- [x] Téléphone (375 px) : logo, intro avec les compagnies du référentiel, sections d'Airtable dans l'ordre, gros boutons.
- [x] Saisons = celles cochées « Ouverte » (Hiver, Printemps, Été 2027) ; postes du genre des saisons choisies, groupés par compagnie ; décocher une saison retire les postes qui ne s'y appliquent plus.
- [x] **3 postes au plus** : au 3e, les autres cases se grisent (« 3 sur 3 ») ; le Worker et la base refusent un 4e. — navigateur, tests
- [x] Champs obligatoires en rouge ; CV obligatoire ; un `.exe` est refusé tout de suite (« Type de fichier non accepté »).
- [x] Envoi (Turnstile d'essai) : « Merci ! » ; la candidature arrive « À traiter », source « Formulaire », CV joint (seau privé, dossier `candidatures/`), journal « Candidature reçue par le formulaire web (nouvelle fiche) ».
- [x] Réponses gardées avec les libellés d'Airtable (statut de citoyenneté, niveaux…) et « Langue du formulaire » ; visibles dans la fiche de la candidature.
- [x] Courriel déjà connu (même avec des majuscules) : même fiche, coordonnées pas réécrites, nom différent noté (« Nom donné »). — tests SQL
- [x] Même envoi reçu deux fois (même clé) : une seule candidature, le 2e CV retiré. — tests
- [x] Anglais (`?lang=en` ou bouton EN) : textes, options et messages d'erreur en anglais ; les réponses restent gardées en français.
- [x] Mention de confidentialité (qui voit, pourquoi, à qui écrire), sans durée de conservation.
- [ ] Sur ton téléphone : remplir et envoyer une candidature avec une photo de CV prise sur le moment. — à Maxime
- [ ] Le texte de la mention de confidentialité et l'adresse à écrire (`inscriptions@camptremblant.com` en attendant). — à Maxime

## 3. Intention de retour

- [x] Employés › saison Été 2026 › « Intention de retour… » : saison visée proposée Été 2027 ; 89 employés de la saison, cochés sauf le ⛔ (Samuel « Castor ») ; « Autres anciens » (139) repliés, aucun coché.
- [x] « Inviter 1 personne » : l'invitation apparaît « En attente » avec « Copier le lien » ; journal « Invitation à l'intention de retour (Été 2027) ».
- [x] La page `/retour/<jeton>` (téléphone) : introduction modifiable avec le nom de camp (« Salut Hibou ! »), la saison et le lien `/emplois` ; « Oui » exige saison(s), poste(s) et date.
- [x] « Oui » → candidature « Intention de retour » à traiter ; la page dit ensuite « Tu as répondu « Oui » le … » avec « Modifier ma réponse » (pré-remplie) ; « Non » → même candidature, statut « Ne revient pas ».
- [x] Une fois la candidature traitée par la direction : la réponse ne se modifie plus. — tests SQL
- [x] Fiche de la personne : section « Intention de retour » (saison, réponse, lien vers la candidature, « Copier le lien »).
- [x] « Retirer » une invitation sans réponse (le lien cesse de marcher) ; une invitation répondue ne se retire pas. — navigateur et SQL
- [ ] « Copier le lien » met bien l'adresse dans le presse-papiers (le panneau de test le refuse : l'adresse s'affiche alors, sélectionnée, à copier à la main). — à Maxime

## 4. Dossier d'embauche — dans l'app

- [x] Carte de l'embauche : bloc « Dossier d'embauche » ; « Créer le lien du dossier » → l'adresse, « Copier le lien », « Marquer comme envoyé » (statut « Lien envoyé »), « Refaire le lien » (confirmation ; l'ancien cesse de marcher).
- [x] « Valider l'embauche » sans dossier reçu : confirmation, puis refus clair « Il manque la rémunération, le taux, le 4 %, le type d'employé, la date d'embauche, le NAS et le compte bancaire. »
- [x] Statut : « Complète » n'est plus dans le menu (seulement par « Valider »).
- [x] Pastilles des onglets : Candidatures (à traiter), Employés (dossiers reçus) ; bandeau « Dossiers d'embauche reçus, à valider » par saison, qui filtre la liste.
- [x] Dossier reçu : disponibilités, code d'éthique « Accepté le … (version 1) », présentation, commentaires ; dossier (adresse, santé, urgence), documents et paie (3 derniers chiffres) remplis.
- [x] Paie complétée puis « Valider l'embauche » : « Complète », journal « Dossier reçu → Complète », « Lien du dossier d'embauche fermé (embauche complète) ».

## 5. Dossier d'embauche — la page (`/dossier/<jeton>`)

- [x] Téléphone : compagnie et saison en haut, logo de la compagnie (GBPA+, Opikawa ; aucun pour les autres), sections d'Airtable.
- [x] Emploi d'été (Rosalie) : paie, vie au camp avec t-shirt et hoodie, disponibilités = dates de la saison (31), code d'éthique d'été, documents, présentation, commentaires.
- [x] Champs exigés en rouge (assurance maladie, adresse…, NAS, transit, institution, compte, spécimen, CV, code d'éthique) ; NAS invalide refusé (« Ce NAS n'est pas valide »).
- [x] Envoi : « Merci Rosalie ! » ; embauche « Dossier reçu » ; NAS et compte chiffrés ; spécimen dans `rh-paie`, CV et carte (avec sa date d'expiration) dans `rh-documents` ; journal au nom de l'employée.
- [x] « Revoir mon dossier » : « Dossier reçu le … — tu peux le corriger » ; **« NAS au dossier (finit par 286) — le changer ? »**, « Compte au dossier (finit par 321) — le changer ? », « Spécimen déjà au dossier », « CV déjà au dossier » ; bouton « Renvoyer mon dossier corrigé ».
- [x] Nouveau compte : nouveau spécimen exigé, l'ancien fichier retiré du seau. — tests
- [x] Bénévole hors été (Thomas) : « Dossier de bénévole », ni paie ni t-shirt ni présentation ; code d'éthique hors été (3 paliers) ; entente de bénévolat exigée ; pré-rempli d'après son dossier.
- [x] Mineure au début de l'embauche (Maya, 17 ans) : « Consentement parental » demandé.
- [ ] Sur un iPhone : joindre une photo HEIC (spécimen, carte) ; les photos de plus de 1,5 Mo sont réduites avant l'envoi. — à Maxime
- [ ] Ouvrir un document reçu depuis la fiche (nouvel onglet ; le panneau de test les bloque). — à Maxime

## 6. Réglages

- [x] « Pages publiques » : lien `/emplois` à copier, saisons ouvertes rappelées.
- [x] « Textes des pages publiques » : codes d'éthique été et hors été (puces et sous-puces corrigées), entente de bénévolat **« À valider »**, introduction du retour ; aperçu en direct pendant la modification ; « Relire et valider » crée une version relue ; historique des versions. (La version validée pendant l'essai a été retirée : l'entente est de nouveau « à valider » en DEV.)
- [ ] Relire l'entente de bénévolat (brouillon de Claude) et la valider ou la corriger. — à Maxime
- [ ] Relire les deux codes d'éthique (mots d'Airtable, seule l'indentation corrigée). — à Maxime

## 7. Socle commun des pages publiques

- [x] Habillage, Turnstile, langue et client anonyme dans `src/lib/public/` ; `worker/commun/turnstile.js` ; l'aiguillage `src/lib/public/PagesPubliques.tsx` charge les pages RH ou Réservations (paquets séparés : Emplois 8 Ko, Retour 7 Ko, Dossier 21 Ko).
- [x] Réservations après le déplacement : tests du Worker (demande, Turnstile) passés ; build et compilation sans erreur.
- [x] Formulaire `/demande` des Réservations : logo, Turnstile, erreurs en rouge ; un courriel invalide tapé après un premier essai est maintenant signalé (« Adresse email invalide »), ce qui ne s'affichait pas avant.

## 8. Ce qui n'est pas dans la phase 2

Courriels (lien du dossier, intention de retour en lot, accusé de réception), contrat et consentement parental signés en ligne : phase 3. Planification, diètes, conformité, exports : phase 4.

## 9. Décisions et actions pour Maxime

- [ ] Adresse de contact des pages RH (`COURRIEL_EMPLOIS`, aujourd'hui inscriptions@camptremblant.com).
- [ ] À la mise en ligne : sous-domaine emplois.camptremblant.com, domaine ajouté à Turnstile, `VITE_HOTE_EMPLOIS` dans `.env.production` (README, section 15) ; schéma `rh` à exposer (phase 1).
- [ ] À la bascule : lien du site (page Emploi) vers `/emplois`, formulaires Airtable fermés.
