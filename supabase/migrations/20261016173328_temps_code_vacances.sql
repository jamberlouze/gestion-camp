-- ============================================================
-- Feuilles de temps : les vacances passent par un code d'utilisation
-- (demande de Maxime du 2026-10-16). Les vacances n'ont pas de code de
-- gain : Employeur D calcule lui-même la paie de vacances ; les heures de
-- vacances prises (direction) sont déclarées avec le code d'utilisation
-- G305. Seule la valeur change (même colonne code_vacances) ; un code
-- déjà réglé est gardé. Déclencheur de signature coupé le temps de la mise
-- à jour : ce n'est pas une personne qui a modifié les réglages.
-- ============================================================

alter table temps.reglages_employeur_d alter column code_vacances set default 305;

alter table temps.reglages_employeur_d disable trigger trg_signer;
update temps.reglages_employeur_d set code_vacances = 305 where code_vacances is null;
alter table temps.reglages_employeur_d enable trigger trg_signer;
