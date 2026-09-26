-- ============================================================
-- horaire : des semaines nommées, indépendantes (comme dans l'ancien
-- créateur : « Semaine 5 », « Semaine 5 (copie) »…), avec un lien
-- facultatif vers une semaine du calendrier commun (core.semaines).
-- La table est encore vide : modification sans risque.
-- ============================================================

alter table horaire.horaires add column nom text;
update horaire.horaires set nom = 'Semaine ' || id where nom is null;
alter table horaire.horaires alter column nom set not null;
alter table horaire.horaires add constraint horaires_nom_unique unique (nom);
alter table horaire.horaires alter column semaine_id drop not null;
alter table horaire.horaires add column created_at timestamptz not null default now();

comment on table horaire.horaires is
  'Horaire d''une semaine : grille, fusions, congés, soirées (document etat). Réglages communs dans horaire.parametres (clé « reglages »).';
