# Vérification de la Vigie des camps — type de séjour (2026-10-14)

> **Passée par Claude en DEV le 2026-10-14.** Demande de la réunion avec Charlotte : trier / filtrer par type de séjour (camp de vacances, camp familial, classe nature, groupe). Corrigés en chemin : menu « à vérifier » qui ne virait pas à l'ambre (les couleurs de `menu` l'emportaient), règle par mots-clés qui donnait le type du camp à un camp de jour sans nuit, puce du type choisi éteinte dans la fiche d'un camp qui n'a pas ce type, « de 218 $ à 218 $ » quand un seul programme a un prix. **Reste pour Maxime** : confirmer les types proposés (71 en DEV, tous « à vérifier »), les décisions du §9, puis la mise en ligne (§10 : un script à lancer à la main en PROD).

En DEV seulement (base locale). La base DEV n'avait aucune donnée de vigie :
Claude y a chargé l'import du Sheets du 2026-10-03
(`scripts/migration/sauvegarde/vigie*.sql`, hors dépôt ; anciennes
catégories « compétiteur direct » → « référence ») : 137 camps, 71 programmes.

**Avant de commencer** : l'aperçu `vigie-essai` (http://localhost:5201/vigie),
compte `admin@camp.test` (le module est réservé aux admins dans la grille).

## 1. Base de données

- [x] Migration `20261014170019_vigie_type_sejour` : `programmes.type_sejour` (`camp_vacances`, `camp_familial`, `classe_nature`, `groupe` ; null = pas classé) et `programmes.type_a_verifier` (faux par défaut). Appliquée seule en DEV et inscrite à l'historique.
- [x] Une autre valeur est refusée (contrainte : « accueil_groupe » refusé).
- [x] Droits : mêmes politiques que le reste de la table ; la direction (julie, sans Vigie dans la grille) ne voit ni ne modifie aucun programme, l'admin oui (test SQL, transaction annulée).
- [x] `vigie.valider_changement` : un nouveau programme validé garde le type proposé par Claude (`details.type_sejour`), à vérifier ; une valeur inconnue devient « pas classé ».

## 2. Pré-classement des programmes existants

Script `scripts/migration/vigie-types-sejour.sql` : 1) les 71 programmes de l'import, classés un par un par Claude (clé = nom du camp + nom du programme) ; 2) tout autre programme (ajouté depuis en PROD) par une règle de mots-clés sur le nom et la description, puis sans nuit = pas classé, puis le type du camp s'il n'en a qu'un, sinon camp de vacances. Tout est « à vérifier ».

- [x] DEV : 71 programmes par la liste — 64 camp de vacances, 1 camp familial (Kéno, « À l'aventure avec Arthur » : le parent accompagne l'enfant), 6 pas classés à vérifier (camps de jour sans nuit : 100% Vélo ×2, École nationale de cirque, « Déploie tes ailes » ; Camp musical pour adultes ×2). Aucune classe nature ni groupe dans l'import (le Sheets était l'onglet « Camp de vacances Qc »).
- [x] La règle, essayée sur 9 programmes fictifs (transaction annulée) : classe nature (« Classe nature 3 jours », « Séjour scolaire hiver »), famille (« Week-end en famille », « Mission famille »), groupe (« Location pour groupes », « Forfait corporatif »), « Camp de théâtre — jeux de groupes » reste camp de vacances, camp de jour sans nuit = pas classé. — le camp de jour prenait le type du camp : corrigé
- [x] Relancé une 2e fois : « déjà fait », rien ne change (noté dans `vigie.parametres`, clé `pre_classement_types`).

## 3. Tableau de bord

- [x] Puces « Tous les types / Camp de vacances / Camp familial / Classe nature / Groupe » au-dessus de la liste des camps, avec le nombre de camps (selon les autres filtres).
- [x] Un type choisi : seuls les camps qui ont un programme de ce type (Camp de vacances 27, Camp familial 1) ; colonnes Programmes et Prix / nuit, et le tri par prix, sur ce type seulement ; ligne de comparaison « Camp de vacances, camps comparables : 154 $ par nuit en médiane (de 90 $ à 248 $, 62 programmes avec un prix) ».
- [x] Le type est dans l'adresse (`?type=camp_familial`) et suit le lien d'un camp vers sa fiche.
- [x] Lien « 71 types de séjour à vérifier » → onglet Programmes, filtre À vérifier.
- [x] Métriques du haut (activités) inchangées.

## 4. Fiche d'un camp

- [x] Colonne « Type de séjour » dans Programmes : menu (Pas classé + 4 types) ; à vérifier = menu ambre + ✓.
- [x] ✓ confirme le type tel quel (il quitte « à vérifier ») ; changer le menu pose le type et le confirme (vérifié en base).
- [x] Puces des types du camp quand il y en a plusieurs (ou un type venu du tableau de bord) : « Programmes (1 sur 6) ». — la puce restait éteinte si le camp n'avait pas ce type : corrigé
- [x] Sous le prix par nuit : écart à la médiane du même type chez les camps comparables (« +19 % », détail au survol) ; sous le tableau, la médiane de chaque type affiché.
- [x] « + Programme » avec un type choisi : le nouveau programme prend ce type (sinon il serait caché).

## 5. Programmes (nouvel onglet)

- [x] Onglet entre « À valider » et « Activités », pastille ambre = nombre de types à vérifier (71).
- [x] Tous les programmes actifs des camps suivis ou proposés (pas les exclus) : camp, programme, type, durée, prix, prix par nuit et écart, saison du prix.
- [x] Puces des 4 types + « Pas classé », « À vérifier seulement » (`?verifier=1`), recherche, tri par camp ou par prix par nuit.
- [x] « Tout confirmer (n) » (filtre À vérifier) : fenêtre de confirmation, puis les programmes affichés quittent la liste (essayé sur les 6 pas classés, remis ensuite).
- [x] Avec un type : ligne de comparaison des camps comparables.

## 6. À valider

- [x] Nouveaux programmes : le type proposé par Claude est affiché à côté du nom (pastille).
- [x] « Valider » : le programme est créé avec ce type, à vérifier (vérifié en base).

## 7. Recherche par Claude (fonction Edge `vigie`)

- [x] Outil `enregistrer_resultats` : `type_sejour` demandé pour chaque programme (4 valeurs ou null) ; prompts de vérification et de documentation : définition des 4 types ; programmes connus envoyés avec leur type.
- [x] Vérification mensuelle : un nouveau programme part dans « À valider » avec son type ; le type d'un programme **connu** n'est jamais changé (celui de l'app fait foi).
- [x] Documentation (passe 2) : programmes ajoutés avec leur type, à vérifier ; une valeur inconnue → pas classé.
- [x] Tests : `npm run test:vigie` (6 tests, base simulée, aucun appel à l'API). Il n'y avait pas de tests pour la fonction Edge : ajoutés.
- [x] Essai complet sur la fonction locale par un « lot manuel » (résultats déposés à la main, sans clé Anthropic : aucun appel à l'API) : 2 requêtes traitées, changements et programmes comme prévu ; données d'essai retirées ensuite.

## 8. Téléphone

- [x] Tableau de bord et Programmes au format téléphone : puces sur plusieurs lignes, tableau qui défile dans sa carte, pas de défilement de côté de la page. (Le module n'est pas pensé pour le téléphone.)

## 9. Décisions prises par Claude, à confirmer

- [ ] Un **onglet Programmes** (la « liste des programmes ») pour comparer entre camps et retrouver les « à vérifier » ; le tableau de bord et la fiche n'ont que les puces et la comparaison.
- [ ] Comparaison = **médiane du prix par nuit** des programmes du même type chez les camps comparables (leaders et références suivis), avec l'écart en % sous chaque prix par nuit.
- [ ] Le filtre de type est dans l'adresse, pas gardé sur l'appareil (comme les autres filtres du module).
- [ ] « Pas classé » à vérifier = aucun des quatre types ne semblait convenir (camp de jour, séjour pour adultes) ; ✓ le confirme comme « aucun type ».
- [ ] Valider un nouveau programme dans « À valider » ne confirme pas son type : il reste à vérifier dans Programmes (deux gestes). Autre choix possible : valider = type confirmé.
- [ ] La recherche classe seulement les **nouveaux** programmes ; elle ne touche jamais le type d'un programme connu (sinon un type confirmé « aucun » reviendrait chaque mois).
- [ ] Les prompts cherchent maintenant aussi les classes nature, séjours en famille et accueils de groupes (prix par participant) : la vérification du 1er novembre risque d'amener plus de « Nouveaux programmes » à valider, et de coûter un peu plus.
- [ ] Les types du **camp** (`camps.types` : camp de jour, besoins particuliers…) restent tels quels, sans lien avec le type de séjour des programmes.

## 10. Avant la mise en ligne

- [ ] `db push` : migration `20261014170019_vigie_type_sejour` (ajoute deux colonnes, remplace `valider_changement` ; rien n'est déplacé ni effacé).
- [ ] **Puis, une seule fois**, le pré-classement : `npx supabase db query --linked -f scripts/migration/vigie-types-sejour.sql` (ne lit rien d'avance ; bilan affiché à la fin : les programmes ajoutés en PROD depuis l'import passent par la règle de mots-clés). Relancé par erreur, il ne fait rien.
- [ ] Déployer la fonction Edge **après** la migration : `npx supabase functions deploy vigie` (avant la migration, la passe 2 échouerait : colonnes absentes). `vigie.test.ts` n'est pas importé par la fonction : il ne part pas avec elle.
- [ ] Confirmer les types dans Vigie › Programmes › À vérifier (les vrais programmes de la PROD).
- [ ] À savoir (déjà le cas avant) : en DEV, `vigie.tic()` réveille la fonction de la **PROD** (adresse écrite en dur) dès qu'une recherche DEV est en cours ; ne pas lancer de recherche depuis la DEV.
