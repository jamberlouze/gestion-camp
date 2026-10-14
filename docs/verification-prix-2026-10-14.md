# Vérification de la liste de prix (Réservations › Catalogue et prix) — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14.** Corrigés en chemin : « Valider » refusé par la base (l'enregistrement d'un prix passait par un upsert, qui vérifie la ligne à ajouter — prix vide + validé — avant de voir qu'elle existe : remplacé par « mise à jour, sinon ajout ») ; colonnes trop serrées entre 768 et 1 100 px (la mise en page suit maintenant la largeur de la carte, pas celle de l'écran) ; date de mise à jour des prix de fournisseurs 2026-27 écrasée par la migration elle-même (ordre des mises à jour corrigé) ; « prix provisoire » affiché sur la ligne de gratuité à 0 $. **Reste pour Maxime** : les cases non cochées (§7), les décisions du §8 et « Avant la mise en ligne ».

En DEV seulement (base locale), module réservé aux admins pendant les essais. Aperçu : config `prix-essai` (http://localhost:5206/reservations/catalogue), compte `admin`. Une fois commité, aussi sur l'aperçu fixe http://localhost:5173/reservations/catalogue.

**Données d'essai** : la réservation **28-G-901 « ESSAI Liste de prix (classe nature 27-28) »** (`supabase/seed.sql`) a un estimé v1 envoyé et un v2 brouillon, tous deux aux prix provisoires de 2027-28. La liste 2027-28 de la DEV est une copie de 2026-27 faite plus tôt par l'ancien bouton « Préparer l'exercice suivant » (prix copiés, maintenant « à valider » avec repli sur 2026-27) — elle montre bien « prix entré mais pas validé → l'estimé prend 2026-27 ».

## 1. Dernière mise à jour et statut par ligne

- [x] Chaque prix montre la date et l'auteur de sa dernière modification (colonne « Mise à jour », détail au survol : « Modifié le … par … · validé le … par … »). Prix d'origine : « 8 oct. · Chiffrier 2026-27 (import) ».
- [x] Statut « À valider » (ligne en rouge) ou « ✓ Validé » ; « À définir » quand il n'y a pas de prix. Au départ, 2026-27 est validé sauf ce qui était en rouge dans la liste de Vicky : billets (Tremblant, Mont-Blanc), transport et activités externes (Aquabounga reste validé), plus les prix à définir — 38 à valider.
- [x] Filtre « À valider (38) » (gardé dans l'adresse, `?filtre=a_valider`) ; « Tous les prix … sont validés » quand il n'en reste plus.
- [x] « Valider » d'un clic → « ✓ Validé », auteur et date de validation posés par la base (essai : Transport Mont-Blanc semaine). Un clic sur « ✓ Validé » le remet à valider.
- [x] Un prix, un coût ou une marge changé dans l'app redevient « à valider » et prend l'auteur et la date (essai : coût Tremblant Sud 125 → 130 $ : « 14 oct. · Admin Test », à valider).
- [x] SQL : l'auteur, les dates et le statut ne peuvent pas être écrits par l'app (un `modifie_par_nom = 'Pirate'` envoyé est ignoré) ; un prix vide ne peut pas être validé (contrainte `prix_valide_defini`) ; un compte sans écriture dans les Réservations (Julie) ne voit ni ne change rien.

## 2. Fournisseurs externes (coût + marge → prix client)

- [x] Sous chaque produit de fournisseur : « Coût fournisseur [ ] + marge [15] % = prix calculé », le fournisseur nommé à côté du produit (Ski Mont-Blanc, Tremblant, Domaine St-Bernard prérempli d'après les libellés).
- [x] Coût changé → prix client recalculé (130 × 1,15 = 149,50 $) ; marge changée → recalculé (125 × 1,20 = 150 $) ; Mont-Blanc arrondi au dollar supérieur (23 → 27 $), vélo + 1 $ (22 → 26,30 $).
- [x] Prix client arrondi à la main : gardé tel quel et montré (« arrondi à la main : 202,00 $ (+0,75 $) » sur Tremblant Nord, calculé 201,25 $).
- [x] Règle « transport × 1,15 » = marge de 15 % par prix : **aucun prix ne change** — en SQL, les 25 prix de fournisseurs 2026-27 (et les 24 de 2025-26) = coût × (1 + marge) + ajout, arrondi, au cent près ; test `npm run test:calcul` (20 prix 2026-27 refaits).
- [x] « Modifier le produit » (crayon) : libellé, catégorie, unité, note de minimum, fournisseur, « prix d'un fournisseur externe » (marge par défaut, ajout, arrondi), retirer / remettre. La marge par défaut ne sert qu'aux nouveaux prix ; chaque prix garde la sienne.
- [x] Essais remis comme avant (prix 2026-27 de Mont-Blanc, Tremblant Sud et Nord, Domaine St-Bernard ; produit d'essai retiré).

## 3. Historique des prix année par année

- [x] Bouton « Historique » : chaque produit avec son prix par exercice (2025-26, 2026-27, 2027-28) et, sous chaque prix, la hausse en $ et en % par rapport à l'année d'avant (ex. nuitée 31,00 → 32,50 $ : +1,50 $ · +4,8 % ; repas 18,50 → 19,40 $ : +0,90 $ · +4,9 %) ; en rouge = pas encore validé. Sections = lits d'aujourd'hui × prix du lit de l'exercice.
- [x] Dans la liste d'un exercice, l'exercice d'avant est affiché à côté avec la hausse.
- [x] **Import 2025-26** (méthode) : les estimés 2025-26 importés en DEV n'ont qu'**une ligne au montant des Sheets**, sans prix unitaires — on ne peut pas en tirer les prix directement. Les prix viennent donc de l'onglet « Liste de prix » du chiffrier « Estimés | Accueil de groupe 2025-26 » (export CSV gardé sur ce Mac dans `scripts/migration/sauvegarde/reservations-liste-prix-2025-26.csv`, dossier hors Git comme les autres sauvegardes ; à refaire depuis le Drive au besoin : Fichier › Télécharger › CSV sur l'onglet « Liste de prix »), puis ont été **vérifiés sur les montants des estimés importés** : avec ces prix, l'app refait au cent près 22 estimés 2025-26 (12 Classe nature dont 26-G-407 et 26-G-435 d'une nuit, 4 Journées plein air, 6 Accueils de groupe) ; avec les prix 2026-27, aucun. Les autres ont des extras (transport, ski…) ou un montant arrangé à la main.
- [x] 66 prix 2025-26 importés, validés, signés « Chiffrier 2025-26 (import) », coût et marge compris pour les fournisseurs (transport 2025-26 : marge de 25 % sauf Mont-Blanc semaine 15 % et Saint-Jovite 0 %, comme le chiffrier). Supplément d'une seule nuit (5 $) : pas dans la liste, il était dans la formule du chiffrier — confirmé par les estimés.
- [x] Trous laissés vides : billets de Tremblant (0 $ dans la liste), pêche sur glace, traîneau à chien ; sections (calculées).
- [x] Script rejouable à la bascule : `node scripts/migration/reservations-prix-historique.mjs --liste scripts/migration/sauvegarde/reservations-liste-prix-2025-26.csv --exercice 2026 --sortie <sql>` ; une ligne déjà modifiée ou validée dans l'app n'est jamais réécrite.

## 4. Préparer l'exercice suivant (27-28)

- [x] Bouton « Préparer 2027-28 » quand la liste 2027-28 n'existe pas encore ; confirmation qui explique la règle ; `reservations.preparer_exercice` crée une ligne vide « à valider » par produit actif (sections exceptées), marge reprise, repli sur 2026-27 (SQL, transaction annulée : 78 lignes, rien d'écrasé au deuxième appel). En DEV le bouton est caché (la copie 2027-28 existe déjà) : le même appel a été fait par « Ajouter les produits manquants (1) », qui apparaît quand un produit n'a pas encore de ligne dans une liste préparée.
- [x] Liste 2027-28 : prix 2026-27 affichés à côté ; tant qu'un prix n'est pas validé, « estimés : 25,20 $ (2026-27) » sous le statut ; « = 2026-27 » reprend le prix d'avant d'un clic quand la case est vide.
- [x] Prix 2027-28 entré mais pas validé (repas 20 $) : l'estimé prend toujours 19,40 $ (2026-27), provisoire. Validé : 20 $ s'applique aux nouveaux calculs (v2 recalculée : 164,50 $ par élève au lieu de 162,10 $).
- [x] **Un estimé figé ne change pas** : v1 envoyée reste à 9 540,28 $ et garde ses prix provisoires (`estimes.prix_provisoires`, modification refusée par la base une fois l'estimé envoyé).

## 5. Estimé aux prix provisoires

- [x] Brouillon : bandeau ambre « Prix provisoires : Animation 1:15 (prix 2026-27), Nuitée (prix 2026-27)… Les prix de 2027-28 ne sont pas encore validés dans la liste de prix : dès qu'ils le sont, « Recalculer » les reprend. Le PDF du client montre les prix tels quels. » et « prix provisoire » sous les lignes concernées.
- [x] Estimé envoyé : « Fait avec des prix provisoires : … » (gardé avec l'estimé, même après la validation des prix).
- [x] Nouvelle version : reprend les prix provisoires de la version d'avant (déclencheur) jusqu'à son enregistrement.
- [x] PDF client : **inchangé** (aucune mention ; la phrase existante « Les prix des activités de fournisseurs … sont sujets à changement » reste). Voir §8.
- [x] Estimés existants : aucun total ne change — les prix sont copiés dans les estimés ; les valeurs 2026-27 sont les mêmes ; `npm run test:calcul` (163 onglets + PDF 27-G-083/014/002) vert, 4 tests ajoutés (fournisseurs, prix provisoires, hausse).

## 6. Téléphone et ordinateur

- [x] Ordinateur large : tableau à colonnes (code, produit, exercice d'avant, prix, hausse, statut, mise à jour). Écran moyen ou carte étroite : une fiche par produit sur deux colonnes.
- [x] Téléphone (375 px) : liste, filtre « À valider », historique (défile dans sa carte) et bandeau de l'estimé lisibles, aucun défilement horizontal de la page dans la liste de prix.
- [x] `npm run build`, `npm run lint` (aucun avertissement dans mes fichiers), `npm run test:calcul`, `npm run test:rapports` passent.

## 7. À regarder par Maxime

- [ ] La liste des prix « à valider » au départ (§1) correspond-elle à ce qui était en rouge dans la liste de Vicky ?
- [ ] Coup d'œil à l'historique 2025-26 → 2026-27 (onglet Historique) avant de s'en servir avec les écoles.
- [ ] Fiche d'une réservation au nom très long sur téléphone : la page déborde un peu à l'horizontale (déjà le cas avant ce travail, vu avec 28-G-901 sur l'aperçu fixe) — à signaler à la conversation Réservations.

## 8. Décisions prises par Claude, à confirmer

1. **PDF client : rien de plus.** « Provisoire » est un état interne de la liste de prix ; le client voit les prix tels quels (la phrase sur les prix des fournisseurs sujets à changement reste). Réversible : une phrase à ajouter dans `pdf/documents.ts` si Maxime veut prévenir l'école.
2. **Un prix changé redevient « à valider »** (même un prix déjà validé) ; la validation est un clic à part. Pour 2026-27, un prix à valider reste utilisé tel quel (marqué provisoire) : seul un exercice **préparé** (avec repli) prend les prix de l'exercice d'avant tant que les siens ne sont pas validés.
3. **Statut de départ 2026-27** : validé, sauf billets, transport, activités externes (pas Aquabounga) et prix à définir.
4. **Marge par prix** (par exercice), pas seulement par produit : l'historique garde la marge de chaque année (transport 2025-26 à 25 %). La marge du produit sert de défaut aux nouveaux prix.
5. **Fournisseur nommé sur le produit** (un nom en texte libre), prérempli pour Mont-Blanc, Tremblant et Domaine St-Bernard ; transport laissé vide (Charlotte le connaît).
6. **Source des prix 2025-26** : la liste du chiffrier 2025-26 (lue sur le Drive, gardée en CSV dans `scripts/migration/sauvegarde/`, hors Git), validée sur les estimés importés en DEV — les estimés seuls ne contenaient pas les prix unitaires. Les prix de la liste sont ceux de la fin de l'année (le chiffrier n'a jamais figé ses prix).
7. **« Préparer l'exercice suivant »** ne copie plus les prix (ancien bouton) : lignes vides, avec « = 2026-27 » par ligne pour reprendre un prix inchangé.
8. Sans ligne pour un exercice, le repli est maintenant le prix **le plus récent d'avant** (avant : le plus récent tout court, même d'un exercice futur) ; aucun estimé existant n'en dépendait (tous les estimés 2025-26 sont importés).

## Avant la mise en ligne

- Migration `20261014190444_reservations_liste_prix.sql` à appliquer en PROD avec le module (`/mise-en-ligne`) ; elle ne change aucun prix.
- À la bascule : rejouer l'import 2025-26 (`reservations-prix-historique.mjs`, §3) sur la PROD, après les migrations du module.
- Le formulaire public (`reservations.formulaire_public`, conversation Réservations) montre le prix du repas de l'exercice même s'il n'est pas validé : à aligner sur la règle des prix provisoires si Maxime le veut (pas touché ici pour ne pas croiser le travail en cours sur `/demande`).
- La copie 2027-28 de la DEV (prix recopiés par l'ancien bouton) n'existe pas en PROD : la première liste 2027-28 sera préparée vide par Charlotte avec « Préparer 2027-28 ».
