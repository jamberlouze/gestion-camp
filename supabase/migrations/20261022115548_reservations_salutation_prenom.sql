-- ============================================================
-- Réservations, modèles de courriels : on salue par le prénom (demande de
-- Maxime du 2026-10-22) — « Bonjour {{prenom}}, » et « Hello {{prenom}}, »
-- au lieu du nom complet, dans tous les modèles. {{civilite_nom}} reste
-- offert (« Bonjour Mme Chassagne, ») modèle par modèle, dans l'onglet
-- Courriels. Les courriels déjà préparés dans la file gardent leur texte.
-- ============================================================
begin;

update reservations.modeles_courriels
set corps_fr = regexp_replace(corps_fr, '^Bonjour \{\{\s*responsable\s*\}\},', 'Bonjour {{prenom}},'),
    corps_en = regexp_replace(corps_en, '^Hello \{\{\s*responsable\s*\}\},', 'Hello {{prenom}},')
where corps_fr ~ '^Bonjour \{\{\s*responsable\s*\}\},' or corps_en ~ '^Hello \{\{\s*responsable\s*\}\},';

commit;
