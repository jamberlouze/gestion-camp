-- ============================================================
-- Subventions : valeurs des nouveaux statuts d'une demande (suite dans
-- 20261022152704_subventions_statuts_demande.sql).
--
-- À part : une valeur ajoutée à un type énuméré ne peut servir qu'après la
-- fin de la transaction qui l'a ajoutée (une migration = une transaction).
-- « en_cours » devient « a_faire » (affiché « À faire ») ; les cartes en
-- cours le deviennent du même coup.
-- ============================================================

alter type subventions.grant_status rename value 'en_cours' to 'a_faire';
alter type subventions.grant_status add value if not exists 'depose' after 'a_faire';
alter type subventions.grant_status add value if not exists 'complete' after 'obtenu';
alter type subventions.grant_status add value if not exists 'desiste' after 'refuse';
