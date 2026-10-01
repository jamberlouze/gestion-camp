-- ============================================================
-- mastertimeline : un projet est offert pour certaines entreprises
-- (comme le champ « Compagnies » de la table Projets d'Airtable).
-- Dans la fiche d'une tâche, le menu Projet ne montre que les projets de
-- l'entreprise choisie. Liste vide = projet offert pour toutes.
-- ============================================================

alter table mastertimeline.projets add column entreprise_ids uuid[] not null default '{}';

comment on column mastertimeline.projets.entreprise_ids is
  'Entreprises pour lesquelles le projet est offert ; vide = toutes';

-- Départ : les entreprises qui ont déjà des tâches dans le projet.
update mastertimeline.projets p
set entreprise_ids = coalesce(
  (select array_agg(distinct t.entreprise_id order by t.entreprise_id)
     from mastertimeline.taches t
    where t.projet_id = p.id and t.entreprise_id is not null and not t.archivee),
  '{}');
