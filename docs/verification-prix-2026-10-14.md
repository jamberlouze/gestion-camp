# Vérification de la liste de prix (Réservations › Catalogue et prix) — révision du 2026-10-14

> **Passée par Claude en DEV le 2026-10-14.** Corrigés en chemin : « Valider » refusé par la base (l'enregistrement d'un prix passait par un upsert, qui vérifie la ligne à ajouter — prix vide + validé — avant de voir qu'elle existe : remplacé par « mise à jour, sinon ajout ») ; colonnes trop serrées entre 768 et 1 100 px (la mise en page suit maintenant la largeur de la carte, pas celle de l'écran) ; date de mise à jour des prix de fournisseurs 2026-27 écrasée par la migration elle-même (ordre des mises à jour corrigé) ; « prix provisoire » affiché sur la ligne de gratuité à 0 $. **Suite du même jour** (décisions de Maxime après le premier compte rendu, §7 à §9) : mention « Prix provisoire » sur le PDF et la page client, aucun prix dans le formulaire public, « + % » de la liste de l'exercice suivant. **Reste pour Maxime** : les cases non cochées (§10), les décisions du §11 et « Avant la mise en ligne ».

En DEV seulement (base locale), module réservé aux admins pendant les essais. Aperçu : config `prix-essai` (http://localhost:5206/reservations/catalogue), compte `admin`. Une fois commité, aussi sur l'aperçu fixe http://localhost:5173/reservations/catalogue.

**Données d'essai** : la réservation **28-G-901 « ESSAI Liste de prix (classe nature 27-28) »** (`supabase/seed.sql`) a un estimé v1 envoyé et un v2 brouillon, tous deux aux prix provisoires de 2027-28. La copie 2027-28 faite plus tôt par l'ancien bouton (prix recopiés) a été effacée par la conversation principale avec le oui de Maxime ; la liste 2027-28 de la DEV est maintenant une vraie liste préparée : 78 lignes vides, « à valider », repli sur 2026-27 (préparée à 15 h 51 avec le compte Admin Test). `seed.sql` ne crée aucun prix (seulement la réservation 28-G-901).

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

- [x] Bouton « Préparer 2027-28 » quand la liste 2027-28 n'existe pas encore ; confirmation qui explique la règle ; `reservations.preparer_exercice` crée une ligne vide « à valider » par produit actif (sections exceptées), marge reprise, repli sur 2026-27 (SQL, transaction annulée : 78 lignes, rien d'écrasé au deuxième appel). Pendant le premier passage, le bouton était caché (l'ancienne copie existait) : le même appel a été fait par « Ajouter les produits manquants (1) », qui apparaît quand un produit n'a pas encore de ligne dans une liste préparée. Après l'effacement de la copie, la liste avait déjà été préparée de nouveau (15 h 51, compte Admin Test, avant ma reprise) : je n'ai donc pas recliqué « Préparer 2027-28 » ; j'en ai vérifié le résultat en SQL : 78 lignes, aucun prix, aucune validée, repli 2027 partout, marge 15 % reprise pour les fournisseurs.
- [x] Liste 2027-28 : prix 2026-27 affichés à côté ; tant qu'un prix n'est pas validé, « estimés : 25,20 $ (2026-27) » sous le statut ; « = 2026-27 » reprend le prix d'avant d'un clic quand la case est vide.
- [x] Prix 2027-28 entré mais pas validé (repas 20 $) : l'estimé prend toujours 19,40 $ (2026-27), provisoire. Validé : 20 $ s'applique aux nouveaux calculs (v2 recalculée : 164,50 $ par élève au lieu de 162,10 $).
- [x] **Un estimé figé ne change pas** : v1 envoyée reste à 9 540,28 $ et garde ses prix provisoires (`estimes.prix_provisoires`, modification refusée par la base une fois l'estimé envoyé).

## 5. Estimé aux prix provisoires

- [x] Brouillon : bandeau ambre « Prix provisoires : Animation 1:15 (prix 2026-27), Nuitée (prix 2026-27)… Les prix de 2027-28 ne sont pas encore validés dans la liste de prix : dès qu'ils le sont, « Recalculer » les reprend. Sur le PDF et la page du client, ces lignes portent la mention « Prix provisoire ». » et « prix provisoire » sous les lignes concernées.
- [x] Estimé envoyé : « Fait avec des prix provisoires : … » (gardé avec l'estimé, même après la validation des prix).
- [x] Nouvelle version : reprend les prix provisoires de la version d'avant (déclencheur) jusqu'à son enregistrement.
- [x] PDF et page client : voir §7 (mention ajoutée à la demande de Maxime).
- [x] Estimés existants : aucun total ne change — les prix sont copiés dans les estimés ; les valeurs 2026-27 sont les mêmes ; `npm run test:calcul` (163 onglets + PDF 27-G-083/014/002) vert, 6 tests ajoutés (fournisseurs, prix provisoires, hausse, lignes provisoires, « + % »).

## 6. Téléphone et ordinateur

- [x] Ordinateur large : tableau à colonnes (code, produit, exercice d'avant, prix, hausse, statut, mise à jour). Écran moyen ou carte étroite : une fiche par produit sur deux colonnes.
- [x] Téléphone (375 px) : liste, filtre « À valider », historique (défile dans sa carte) et bandeau de l'estimé lisibles, aucun défilement horizontal de la page dans la liste de prix.
- [x] `npm run build`, `npm run lint` (aucun avertissement dans mes fichiers), `npm run test:calcul` (13), `npm run test:rapports` (10) et `npm run test:worker` (119) passent.

## 7. Mention « Prix provisoire » chez le client (PDF et page client)

- [x] PDF de l'estimé (même fabrication pour l'aperçu, l'estimé envoyé et l'annexe du contrat) : les lignes à prix provisoire portent « Prix provisoire * » sous leur description, et une note sous le tableau : « * Prix provisoire : le prix 2027-28 n'est pas encore confirmé ; il sera ajusté à la confirmation. » — vérifié en produisant le PDF de 28-G-901 v1 (forfait et accompagnateur marqués, gratuité à 0 $ non marquée).
- [x] Sans prix provisoire : PDF identique à avant (aucune mention, même estimé produit avec `prix_provisoires` vide).
- [x] Page client `/client/<jeton>` de 28-G-901 : même mention sous les lignes et même note sous le tableau, en français et en anglais (« Provisional price * », `?lang=en`) ; `reservations.page_client` renvoie maintenant `exercice_prix`, `prix_provisoires` et, par ligne, `code` et `auto` (rien d'autre de changé).
- [x] Une seule règle partout : `ligneProvisoire` (calcul.ts, testée) — l'app, le PDF et la page client.
- [x] L'aperçu PDF d'un brouillon prend les prix provisoires affichés ; « Marquer envoyé » après une modification garde un PDF avec ceux qu'on vient d'enregistrer (code relu ; la fabrication du PDF est vérifiée ci-dessus, pas de 2e estimé d'essai envoyé).

## 8. Aucun prix dans le formulaire public

- [x] `/demande` : la question « Souhaitez-vous ajouter le service de repas ? » n'a plus « 19,40 $ par personne, par repas » ; aucun montant ailleurs dans le formulaire (texte de la page relu en entier, accueil de groupe choisi).
- [x] `reservations.formulaire_public` ne renvoie plus que les heures normales (vérifié en anonyme) ; le formulaire d'une organisation (`formulaire_organisation`) ne donnait déjà aucun prix.
- [x] Test ajouté (`worker/reservations/api.test.js`) : aucun « {prix} » ni montant en dollars dans les textes français et anglais du formulaire.

## 9. « + % » de la liste de l'exercice suivant

- [x] Liste 2027-28 (préparée) : colonne « + % · hausse » ; prix du lit + 5 % → 26,46 $ (25,20 × 1,05), « à valider », les estimés gardent 25,20 $ (2026-27) en attendant ; le % est gardé sur la ligne (`prix.hausse_pct`).
- [x] Prix ajusté à la main ensuite (26,50 $) : « ajusté à la main (+0,04 $) », le 5 % reste affiché, hausse +1,30 $ · +5,2 %.
- [x] Fournisseur (transport Mont-Blanc semaine) + 5 % : coût 130 → 136,50 $, marge 15 % gardée, prix client 156,98 $.
- [x] « Hausse de 2027-28 sur 2026-27 : + [3] % — Appliquer aux 66 lignes affichées » (selon les filtres) : confirmation, puis un seul envoi : nuitée 33,48 $, repas 19,98 $, Mont-Blanc coût 23,69 $ → 28 $ (dollar supérieur), vélo coût 22,66 $ → 27,06 $ (+ 1 $), Sentier des cimes 22,21 $ ; le prix du lit déjà validé n'est pas touché ; les produits sans prix en 2026-27 (billets Tremblant, pêche) sont sautés. Tout reste « à valider ».
- [x] « Annuler (+3 % sur 66 lignes) » remet chaque ligne comme avant (vérifié en SQL : vides de nouveau, le transport Mont-Blanc revient à son + 5 %).
- [x] Téléphone : la barre du « + % » passe sur plusieurs lignes, pas de défilement horizontal.
- [x] **Ordre des colonnes** (retouche de Maxime) : dans une liste préparée, « 2026-27 | + % · hausse | 2027-28 », la colonne « + % » juste à gauche du prix de l'année suivante ; sur téléphone, même ordre dans chaque carte (« 2026-27 : 149,50 $ » et le « + % » sur une ligne, puis le prix 2027-28 et le statut). Une liste non préparée (2026-27) garde son ordre (prix, puis hausse).
- [x] Essais remis : la liste 2027-28 de la DEV est de nouveau vide, à valider (78 lignes, aucun prix, aucun %). Depuis, + 5 % a été appliqué à toute la liste 2027-28 de la DEV (16 h 08, compte Admin Test, pas par Claude) : laissé tel quel, tout est « à valider ».

## 10. À regarder par Maxime

- [ ] La liste des prix « à valider » au départ (§1) correspond-elle à ce qui était en rouge dans la liste de Vicky ?
- [ ] Coup d'œil à l'historique 2025-26 → 2026-27 (onglet Historique) avant de s'en servir avec les écoles.
- [ ] Fiche d'une réservation au nom très long sur téléphone : la page déborde un peu à l'horizontale (déjà le cas avant ce travail, vu avec 28-G-901 sur l'aperçu fixe) — à signaler à la conversation Réservations.

## 11. Décisions prises par Claude, à confirmer

1. ~~PDF client : rien de plus.~~ Remplacé par la décision de Maxime : mention « Prix provisoire » sur le PDF et la page client (§7). Texte de la note choisi par Claude : « * Prix provisoire : le prix 2027-28 n'est pas encore confirmé ; il sera ajusté à la confirmation. » (général : les prix internes, comme la nuitée, peuvent aussi être provisoires, pas seulement ceux des fournisseurs).
2. **Un prix changé redevient « à valider »** (même un prix déjà validé) ; la validation est un clic à part. Pour 2026-27, un prix à valider reste utilisé tel quel (marqué provisoire) : seul un exercice **préparé** (avec repli) prend les prix de l'exercice d'avant tant que les siens ne sont pas validés.
3. **Statut de départ 2026-27** : validé, sauf billets, transport, activités externes (pas Aquabounga) et prix à définir.
4. **Marge par prix** (par exercice), pas seulement par produit : l'historique garde la marge de chaque année (transport 2025-26 à 25 %). La marge du produit sert de défaut aux nouveaux prix.
5. **Fournisseur nommé sur le produit** (un nom en texte libre), prérempli pour Mont-Blanc, Tremblant et Domaine St-Bernard ; transport laissé vide (Charlotte le connaît).
6. **Source des prix 2025-26** : la liste du chiffrier 2025-26 (lue sur le Drive, gardée en CSV dans `scripts/migration/sauvegarde/`, hors Git), validée sur les estimés importés en DEV — les estimés seuls ne contenaient pas les prix unitaires. Les prix de la liste sont ceux de la fin de l'année (le chiffrier n'a jamais figé ses prix).
7. **« Préparer l'exercice suivant »** ne copie plus les prix (ancien bouton) : lignes vides, avec « = 2026-27 » par ligne pour reprendre un prix inchangé.
8. Sans ligne pour un exercice, le repli est maintenant le prix **le plus récent d'avant** (avant : le plus récent tout court, même d'un exercice futur) ; aucun estimé existant n'en dépendait (tous les estimés 2025-26 sont importés).
9. **« + % » d'un produit de fournisseur** (décision par défaut, demandée) : le % s'applique au **coût** de l'an dernier (arrondi au cent), la marge est gardée, le prix client est recalculé (Mont-Blanc toujours au dollar supérieur) ; sans coût connu, le % s'applique au prix.
10. **« + % » seulement dans une liste préparée** (exercice qui a un repli, ex. 2027-28) : 2026-27 ne se recalcule pas d'après 2025-26. Vider le % ne change pas le prix (le % n'est plus affiché, le prix reste).
11. **« Appliquer aux lignes affichées »** ne touche jamais un prix validé ni une ligne sans prix l'an dernier ; il écrase le « + % » déjà mis sur une ligne pas validée. « Annuler » remet les lignes telles qu'elles étaient juste avant (tant qu'on reste sur la page).

## Avant la mise en ligne

- Migrations `20261014190444_reservations_liste_prix.sql` et `20261014195425_reservations_prix_client.sql` à appliquer en PROD avec le module (`/mise-en-ligne`) ; elles ne changent aucun prix.
- À la bascule : rejouer l'import 2025-26 (`reservations-prix-historique.mjs`, §3) sur la PROD, après les migrations du module.
- Les PDF d'estimés déjà gardés (jamais réécrits) n'ont pas la mention ; seuls les PDF produits à partir de maintenant l'ont.
- En PROD, la première liste 2027-28 sera préparée vide avec « Préparer 2027-28 ».
