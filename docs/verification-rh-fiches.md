# Vérification — Fiches du staff (RH)

> **Passée par Claude en DEV le 2026-10-15** (navigateur sur ordinateur et en format téléphone, comptes Admin Test et Sarah (coordo), tests SQL des droits, tests du Worker). Corrigés en chemin : l'adresse `/fiches/…` est déjà une page publique des Réservations (fiches participants) — la page est à **`/staff`** ; une fiche ouverte depuis la liste se rechargeait (la saison par défaut est maintenant gardée sous son id). **Reste pour Maxime** : les cases non cochées et les décisions en bas.

En DEV seulement (base locale ; vraies données d'Airtable). Aucune donnée modifiée : les tests SQL tournent dans une transaction annulée ; le dossier public a été ouvert sans être envoyé.

**Avant de commencer** : `npm run db:start`, migration `20261015164321_rh_fiches` appliquée, puis l'aperçu `rh-essai` (http://localhost:5200/staff). Connexion : `admin@camp.test` ; pour voir comme un coordo, `sarah@camp.test` (le module est caché sauf aux admins jusqu'à la bascule : pour l'essai, mettre en commentaire `cacheSaufAdmins` de l'entrée `rh_fiches` dans `src/shell/modules.ts`, puis le remettre).

## 1. Sécurité et droits

- [x] Coordo (Sarah) : `rh.fiches()` rend les fiches ; aucune clé de paie, de notes, de VAJ ni « ne pas réembaucher » dans la réponse. — tests SQL
- [x] Coordo : `rh.personnes`, `rh.dossiers`, `rh.notes`, `rh.candidatures`, `rh.journal`, `rh.documents` lus vides ; `rh.paie` refusé (403). — tests SQL et navigateur (REST avec son jeton)
- [x] Coordo : lit les photos (66 dans le seau, adresse signée 200) ; un CV lui est refusé (400) ; la liste du seau ne montre que les photos. — navigateur
- [x] Terrain (Léa) : `rh.fiches()` refusé (`ACCES_REFUSE`), aucune photo. Anonyme : refusé. Direction : fiches rendues. — tests SQL
- [x] Grille : « Fiches du staff » en lecture pour la direction, les coordonnateurs et le développeur.
- [x] Tests SQL : 15 sur 15 (transaction annulée).

## 2. Liste (`/staff`)

- [x] Saison par défaut = celle de l'onglet Employés (Automne 2026 en DEV), menu des saisons qui ont des embauches ; une carte par personne (embauches non annulées, bénévoles compris).
- [x] Carte : photo (ou initiales), nom de camp, prénom et nom, compagnie + poste, pastilles 💉 EpiPen / ⚠️ Allergie / 🩺 Santé / diète particulière ; « Dossier pas encore reçu » sinon.
- [x] Recherche (nom, nom de camp, poste), filtre de compagnie (s'il y en a plusieurs), « 🩺 Santé à connaître (n) » ; filtres gardés dans l'adresse.
- [x] Téléphone : deux cartes par rangée, rien ne déborde.
- [ ] Une saison chargée (Été 2026, 89 personnes) : vitesse d'affichage des photos importées d'Airtable (certaines font plusieurs Mo). — à Maxime

## 3. Fiche (`/staff/<personne>`)

- [x] Photo, nom de camp, nom, âge (« Mineur·e » si moins de 18 ans), postes avec compagnie et dates de l'embauche (sinon celles de la saison).
- [x] Boutons 📞 et ✉️ (liens `tel:` et `mailto:`), contacts d'urgence avec numéros cliquables.
- [x] Santé : EpiPen en rouge en premier, allergies en gras, problèmes de santé, médicaments, autre, assurance maladie ; diète ; coordonnées.
- [x] Coordo : ni « Dossier RH » ni « Changer la photo ». Admin : les deux.
- [x] Dossier pas reçu : avis ambre, pas de section santé ni urgence.
- [ ] « Imprimer » : une fiche par page, menu caché (pas d'aperçu d'impression dans le panneau). — à Maxime
- [ ] « 📷 Changer la photo » : la nouvelle photo (réduite à 1600 px) remplace l'ancienne sur la carte. — à Maxime (pas essayé pour ne pas toucher aux vraies fiches)

## 4. Dossier d'embauche et dossier RH

- [x] Page publique `/dossier/<jeton>` (hors été) : section « Santé » (facultative, mention de qui y a accès) avec problèmes de santé, médicaments, EpiPen oui/non, autre ; « Photo — pour ta fiche d'employé » dans Documents. L'été : la photo de la présentation dit qu'elle sert aussi à la fiche.
- [x] `rh.recevoir_dossier` enregistre les 4 champs ; le Worker accepte maintenant la photo hors été. — tests SQL et Worker (142 sur 142)
- [x] Un ancien retrouve ses réponses de santé pré-remplies ; une réponse inconnue pour l'EpiPen ne devient pas un « oui ». — tests Worker
- [x] RH › fiche d'une personne › Dossier › Modifier : les 4 champs (EpiPen = Oui/Non/—) ; lecture : affichés seulement s'ils sont remplis.
- [ ] Envoyer un vrai dossier d'essai de bout en bout avec une photo (Worker local). — à Maxime si souhaité

## 5. Décisions prises par Claude, à confirmer

- Adresse **`/staff`** et nom « Fiches du staff » (🪪, menu Équipe).
- **Lecture seulement** pour tout le monde dans la grille (les corrections se font dans le dossier RH) ; le **développeur** a aussi la lecture (comme les fiches participants des Réservations).
- **Caché sauf aux admins jusqu'à la bascule**, comme RH (vide en PROD avant l'import final).
- Une fiche montre aussi le **numéro d'assurance maladie** (utile à l'hôpital).
- **Pas de journal des consultations** des fiches (contrairement au NAS). À ajouter si la Loi 25 l'exige pour la santé.
- Tous les champs de santé sont **facultatifs**.

## 6. Avant la mise en ligne

- [ ] Migration `20261015164321_rh_fiches` après celles de RH déjà en PROD (une seule, plus récente que la dernière en PROD).
- [ ] À la bascule : retirer `cacheSaufAdmins` des entrées `rh` et `rh_fiches` (`docs/bascule-rh.md` §3.4).
