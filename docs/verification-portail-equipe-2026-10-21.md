# Vérification du portail côté équipe (Réservations › fiche, liste, accueil) — réunion du 2026-10-21, lots B, C, E et F

> **Passée par Claude en DEV le 2026-10-21.** Corrigés en chemin : fiche de réservation plus large que le téléphone (le tableau de l'estimé et l'échéancier de Facturation élargissaient la page : 594 px pour 390 ; colonnes en `minmax(0, 1fr)` et tableaux qui défilent dans leur carte) ; décision d'un changement du client montrée dans les Notes (elle reste dans le Suivi, avec le journal) ; « Accepté » au lieu de « Accepté en partie » dans l'historique ; bandeau de l'estimé et notes trop serrés sur téléphone. **Reste pour Maxime** : les cases non cochées (§7), les décisions du §8 et « Avant la mise en ligne ».

En DEV seulement (base locale), module réservé aux admins pendant les essais. Migration `20261022002631_reservations_portail_equipe.sql`, appliquée en DEV seulement. Aperçu : config `portail-equipe-essai` (http://localhost:5210/reservations), compte `admin` ; rôle sans accès aux Réservations : `direction` (Julie). Une fois commité, aussi sur l'aperçu fixe http://localhost:5173.

**Données d'essai** (`supabase/seed.sql`, section « Portail côté équipe », organisation « Essai Équipe Claude (DEV) », contact Prof Équipe 450 555-0101) : **27-G-986** contrat signé, estimé v1 accepté pour 40 élèves, séjour passé à 42, demande de changement du client (48 élèves, départ +1 jour, arrivée à 11 h) ; **27-G-987** estimé v1 accepté pour 30, séjour à 32, pas signé ; **27-G-988** demande sans organisation. 27-G-595, 27-G-596, 27-G-597 et « École Essai Claude (DEV) » : pas touchés.

## 1. Changement du client décidé ligne par ligne (B)

- [x] En haut de la fiche (986) : « Le client propose un changement au séjour — à décider ligne par ligne », une ligne par champ changé (Départ, Heure d'arrivée, Élèves) avec avant → proposé, « Depuis changé pour : … » si le séjour a bougé depuis la demande, et le verdict **par ligne** : Départ « Hors règle » (nouvelles dates), Heure d'arrivée « Dans les règles », Élèves « Hors règle » (42 → 48 : +14 %) ; la pastille globale reste.
- [x] ✓ Accepter / ✗ Refuser sur chaque ligne (ligne teintée vert ou rouge), « Tout accepter » / « Tout refuser » ; le bouton dit « Appliquer (0 sur 3 décidés) » tant qu'une ligne n'est pas décidée, puis « Appliquer : 2 acceptés, 1 refusé… ».
- [x] Un refus rend le message au client obligatoire (titre en rouge, bouton grisé sans message) ; aperçu « Ce que le client lira sur sa page » : « Accepté : Heure d'arrivée : 10h → 11h ; Élèves : 42 → 48. / Pas accepté : Départ : 12 février 2027 → 13 février 2027. » puis le message.
- [x] Appliquer avec un refus ouvre la fenêtre « Un changement est refusé : appelez le client » : ce qui est refusé, la règle de l'équipe, **Prof Équipe · 450 555-0101** (lien `tel:` ; repli : contact de facturation, puis l'organisation), case « J'ai déjà appelé le client ».
- [x] Après « Appliquer la décision » (pas encore appelé) : séjour à 48 élèves et arrivée à 11 h, **départ inchangé (12 février)** ; l'estimé n'a pas bougé.
- [x] Historique (Confirmation par le client) : « Changement accepté en partie », ✓ Heure d'arrivée, Élèves / ✗ Départ, « Accepté en partie par Admin Test … · client à appeler — message au client : « … » ».
- [x] Journal (Suivi) : « Changement demandé par le client accepté en partie — accepté (séjour mis à jour) : … — refusé : … — message au client : « … » » et « Refus d'un changement : appeler le client (règle de l'équipe : le message sur sa page ne suffit pas) » ; échange « note » au CRM ; relance « 27-G-986 : appeler le client, changement refusé (Départ : …) » assignée à qui a refusé, celle « accepter ou refuser le changement » faite.
- [x] Page client (`/client/<jeton>`) : « Votre changement du 21 octobre 2026 a été accepté. » avec **seulement** ce qui est accepté (Heure d'arrivée, Élèves), puis « Réponse de l'équipe : Accepté : … Pas accepté : Départ … » et le message ; le séjour affiché = 48, 11 h, départ le 12.
- [x] Tout accepté (2e demande : accompagnateurs 4 → 5, langue) au téléphone : pas de fenêtre d'appel, « Accepter et mettre le séjour à jour », séjour mis à jour, `decisions` gardées, `client_appele` vide.
- [x] SQL (transaction annulée) : décision manquante → « Acceptez ou refusez chaque changement (✓ ou ✗). » ; refus sans message → « Écrivez au client pourquoi un changement est refusé. » ; départ qui tomberait avant l'arrivée → refusé ; Julie (sans accès) → « Accès refusé. » ; `traiter_changement` (en bloc) passe par la nouvelle fonction.
- [x] Lecteur sans écriture : lignes et verdicts, sans boutons (même règle `ecriture` qu'avant). — vérifié dans le code seulement : aucun compte en lecture seule sur le module en DEV.

## 2. Avertir l'équipe dans l'app (C)

- [x] Liste « Réservations » : **point rouge** devant le numéro de chaque ligne à traiter (infobulle = les actions) ; sous le nom : « Changement du client à traiter », « Appeler le client : changement refusé », « Aucun paiement reçu » (rouge), « Estimé accepté : préparer le contrat » (ambre) ; « Organisation à valider » gardée.
- [x] Nouvelle vue **« À traiter »** (avec son nombre) : nouvelles demandes, changements à traiter, clients à appeler, aucun paiement reçu, estimés acceptés sans contrat.
- [x] Onglet « Réservations » du module : pastille rouge avec le nombre de réservations à traiter (tous exercices : 9 ; la vue « À traiter » de 2026-27 en montre 8, la 9e est 26-G-606, une nouvelle demande de l'an passé jamais fermée).
- [x] Accueil (admin) › « À faire pour moi » › « 📒 Réservations · à traiter » : « 5 nouvelles demandes » (3 premières nommées, lien vers la liste), puis une ligne par réservation (urgent d'abord, puis par arrivée) qui ouvre sa fiche, « et N autres » vers la vue « À traiter » ; ordinateur et téléphone.
- [x] Après un refus : 27-G-986 reste sur l'accueil avec « Appeler le client : changement refusé » jusqu'à ce que la relance soit cochée (Suivi › Prochaine action ou CRM).
- [x] Julie (direction, sans accès aux Réservations) : aucun groupe Réservations sur l'accueil, aucune requête vers le module.
- [x] Le courriel d'avis à inscriptions@ : fait par le sous-agent « Courriels » (pas ici).

## 3. Notes en haut de la fiche (E)

- [x] Section « Notes » sous les étapes, au-dessus du Séjour : champ + « Noter » (⌘/Ctrl + Entrée aussi), affichée tout de suite, « 21 octobre 2026 à 20 h 41 · Admin Test » (date et auteur posés par la base, jamais par l'app : un faux nom envoyé est remplacé).
- [x] **Sans organisation reliée** (988) : la note s'ajoute (le Suivi, lui, reste grisé sans organisation).
- [x] Modifier sa note : « (modifiée) », `modifie_le` posé par la base ; Retirer (avec confirmation).
- [x] SQL : une autre personne qui écrit dans le module (rôle Développeur) ne peut ni modifier ni retirer la note d'un autre (0 ligne) ; changer l'auteur ou la date → « Seul le texte d'une note se modifie. » ; Julie : ne voit rien et ne peut rien ajouter (RLS).
- [x] Anciennes notes : les échanges « note » du CRM de la réservation (notes du Suivi et notes importées des Sheets, ex. 26-G-3xx) sont montrés dans les Notes, marqués « Suivi », en lecture ; ceux de la page client (« … (client) ») et des décisions sur un changement restent dans le Suivi. Le Suivi n'offre plus le canal « Note ».
- [x] Les champs du contrat (Description du groupe, Commentaires du client, Notes au contrat, Dépôt, Rétroaction) restent, dans la carte renommée « Description et contrat ».

## 4. Séjour changé depuis l'estimé accepté (F)

- [x] 986 (signé) : bandeau en haut « Le séjour a changé depuis l'estimé accepté (v1) : Heure d'arrivée : 10h → 11h ; Élèves : 40 → 48 » + « Contrat signé : faites l'estimé final … « Mettre le devis à jour » (Facturation) la reprend. » ; bouton « Faire l'estimé final » qui descend à l'estimé.
- [x] 987 (pas signé) : « Élèves : 30 → 32 » + « Faites un nouvel estimé et faites-le accepter par le client. » ; après « Nouvelle version » : « Le brouillon v2 est commencé : vérifiez-le (« Recalculer »)… », bouton « Voir le brouillon v2 ».
- [x] v2 recalculée (32), enregistrée, puis envoyée et acceptée (SQL) : le bandeau disparaît ; `estimes.sejour` de v2 = 32.
- [x] Âges et langue changés : pas de bandeau (ne changent pas le prix) ; estimé importé des Sheets : jamais de bandeau ; réservation perdue, annulée, ou facture finale envoyée : pas de bandeau.
- [x] Estimé figé avant la migration (sans séjour gardé) : comparaison des lignes calculées, description et quantité (test `equipe.test.mjs`) ; un prix validé depuis ne déclenche rien.
- [x] L'éditeur de l'estimé (`Estime.tsx`) n'est pas touché : son « Les lignes calculées ne correspondent plus » marche comme avant.

## 5. Devis QBO : relance à l'acceptation, mise à jour (F)

- [x] SQL : estimé accepté (en ligne, par l'équipe, ou par la base) → relance « 27-G-xxx : estimé accepté, créer le devis QBO (fiche › Facturation) » (avant : à la signature) ; une seule, même si la réservation est signée ensuite (la relance de la signature reste un filet, même `source_cle`).
- [x] SQL : devis créé → la relance est faite ; v10 acceptée alors que le devis vient de v9 → « estimé v10 accepté, mettre le devis QBO à jour », faite dès que le devis prend la v10.
- [x] « Mettre le devis à jour » prend bien la **dernière version acceptée** : le Worker lit `statut=eq.accepte&order=version.desc&limit=1` et écrit `estime_version` = 2 (test `qbo.test.js`) ; dans la fiche, le bouton paraît dès qu'une version acceptée est plus récente que celle du devis (inchangé).
- [x] Devis créé avant la signature : à la synchro de la compagnie (cron aux 15 minutes, « Mettre à jour depuis QBO »), l'échéancier est posé et le contrat signé joint au devis (`qbo_devis.contrat_joint`) ; rien pour un devis complet ni pour une réservation pas encore signée (tests `qbo.test.js`). Texte de la fiche : « le contrat signé y sera joint à la signature ».
- [x] Le bouton « Créer le devis QBO » reste d'un clic (choix ou création du client QBO, inchangé).

## 6. Tests

- [x] `node --test src/modules/reservations/equipe.test.mjs` (nouveau, 5 tests : verdict par ligne, réponse au client FR/EN, écart avec l'estimé, lignes calculées, actions) ; `npm run test:calcul` (13), `npm run test:rapports` (10), `npm run test:worker` (QBO : 25, dont 3 nouveaux).
- [x] `npm run lint` : rien dans les fichiers du lot. `npm run build` passe (dossier de travail complet, avec les lots des autres sous-agents) ; l'arbre commité seul (HEAD + ce lot) passe aussi `tsc`.
- [x] Ordinateur (1440 px) et téléphone (390 px, aucune largeur de trop) : fiche, liste, accueil.

## 7. À regarder par Maxime

- [ ] Sur un vrai cas avec la coordonnatrice des groupes : décision ligne par ligne, fenêtre d'appel, réponse lue par le client.
- [ ] Les anciennes notes du Suivi montrées dans les Notes (imports des Sheets) : utiles en haut, ou à garder seulement dans le Suivi ?
- [ ] Le point rouge et le compte de l'onglet : la liste des actions (§2) est-elle la bonne ? (ex. ajouter « devis QBO à créer »).

## 8. Décisions prises par Claude, à confirmer

1. **Accepté en partie** = statut `acceptee` avec au moins un refus dans `decisions` (pas de nouveau statut) ; la page client affiche « Votre changement … a été accepté. » avec seulement ce qui est accepté, et la réponse composée dit ce qui ne l'est pas (sans toucher à la page du sous-agent Client).
2. Un refus sans appel fait crée une **relance CRM « appeler le client »** (à qui a refusé, échéance aujourd'hui) en plus de la ligne du journal ; elle fait aussi le point rouge et la ligne de l'accueil jusqu'à ce qu'on la coche.
3. Verdict par ligne = les règles d'avant appliquées comme si le client n'avait changé que ce champ (`evaluerChamp`).
4. Les notes de l'équipe ne vont pas au CRM (elles sont dans Réservations, même sans organisation) ; le Suivi garde appels, courriels, rencontres et le journal.
5. Séjour comparé à l'estimé : tout ce qui fait le prix (dates, heures, nombres, ratio, repas, forfait, variante, sections, salles, heures en extra et supplémentaires), pas les âges ni la langue ; figé quand l'estimé quitte le brouillon (envoi). Un brouillon envoyé sans « Recalculer » garde le séjour du moment de l'envoi (l'éditeur montre déjà l'écart avant l'envoi).
6. Relances « créer / mettre à jour le devis » : mêmes exclusions qu'à la signature (sans organisation, importées, perdues ou annulées) ; celle de la signature est gardée comme filet.
7. Devis fait avant la signature : échéancier et contrat signé ajoutés par le Worker à la synchro (au plus 5 devis par passage) plutôt qu'à la signature (fichiers du sous-agent « Courriels »).
8. Le compte de l'onglet compte tous les exercices ; la vue « À traiter » suit le filtre d'exercice de la liste.

## Avant la mise en ligne

- `npm run prod:db:push` (migration `20261022002631_reservations_portail_equipe`) avec les migrations des deux autres sous-agents du portail ; puis `main`.
- Rien à régler : pas de réglage ni de secret nouveau. Le module est vide en PROD : rien à reprendre (les estimés acceptés n'ont pas de séjour figé : comparaison des lignes).
- Rappel à la coordonnatrice : un refus se dit aussi au téléphone (l'app le rappelle et pose la relance).
