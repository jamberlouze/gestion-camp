-- ============================================================
-- Calendrier : l'animation vient du module Horaire (décision de la
-- direction, 2026-10-04). Plus de feuille de route propre au Calendrier.
--
-- 1. horaire.horaires.debut : date du premier jour d'une semaine ou d'un
--    séjour (jamais pour un modèle). Un horaire sans date n'apparaît pas
--    dans le Calendrier.
-- 2. Vue commune : la partie animation lit les horaires datés (animateur
--    de chaque groupe, remplaçant pendant son congé).
-- 3. calendrier.affectations_animation retirée (vide : jamais utilisée).
-- ============================================================

alter table horaire.horaires add column debut date;
alter table horaire.horaires add constraint horaires_modele_sans_date check (not modele or debut is null);
create index horaires_debut_idx on horaire.horaires (debut) where debut is not null;

comment on column horaire.horaires.debut is
  'Date du premier jour (semaine ou séjour) ; null pour un modèle. Chaque jour de etat.jours tombe à la première date >= debut qui porte ce nom.';

-- Date d'un jour (« Mardi ») d'un horaire qui commence à p_debut : la
-- première date à partir de p_debut qui tombe ce jour de la semaine (même
-- règle que dateDuJour dans modules/calendrier/horaire.ts).
create or replace function calendrier.date_du_jour(p_debut date, p_jour text)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_debut + ((array_position(array['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'], p_jour) - 1
                     - extract(dow from p_debut)::integer + 7) % 7)
$$;

-- Jours de congé d'un code (mêmes paires que CONGES dans modules/horaire/types.ts).
create or replace function calendrier.jours_conge(p_code text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'MM' then array['Mardi','Mercredi']
    when 'JV' then array['Jeudi','Vendredi']
    when 'SD' then array['Samedi','Dimanche']
    else array[]::text[]
  end
$$;

drop view calendrier.v_presence_jour;
drop table calendrier.affectations_animation;

create view calendrier.v_presence_jour with (security_invoker = true) as
  select q.personne_id as personnel_id, p.nom, q.jour as date, 'cuisine'::text as secteur,
         coalesce(f.nom, 'Cuisine') as description
  from commande.quarts q
  join commande.personnel p on p.id = q.personne_id
  left join commande.fonctions f on f.id = p.fonction_id
  where calendrier.quart_travaille(q.texte)
  union all
  -- Animation : chaque groupe de chaque horaire daté, chaque jour ; pendant
  -- son congé, l'animateur est remplacé (ou absent, sans remplaçant).
  -- Identifiant : l'employé du référentiel (core.employes, par surnom).
  select coalesce(e.id, md5('horaire:' || a.anim)::uuid), a.anim, a.date, 'animation',
         string_agg(distinct case when a.num <> '' then 'Groupe ' || a.num else 'Animation' end, ', ')
  from (
    select calendrier.date_du_jour(h.debut, j.jour) as date,
           btrim(coalesce(g ->> 'num', '')) as num,
           nullif(btrim(case when j.jour = any (calendrier.jours_conge(g ->> 'conge'))
                             then coalesce(g ->> 'remp', '') else coalesce(g ->> 'anim', '') end), '') as anim
    from horaire.horaires h
    cross join lateral jsonb_array_elements_text(coalesce(h.etat -> 'jours', '[]'::jsonb)) as j(jour)
    cross join lateral jsonb_array_elements(coalesce(h.etat -> 'groupes', '[]'::jsonb)) as g
    where not h.modele and h.debut is not null
      and j.jour in ('Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi')
  ) a
  left join core.employes e on e.surnom = a.anim
  where a.anim is not null
  group by coalesce(e.id, md5('horaire:' || a.anim)::uuid), a.anim, a.date
  union all
  select ps.personnel_id, p.nom, ps.date, ps.secteur, coalesce(nullif(btrim(ps.description), ''), '')
  from calendrier.presences_simples ps
  join calendrier.personnel p on p.id = ps.personnel_id
  where ps.deleted_at is null;

grant select on calendrier.v_presence_jour to authenticated, service_role;
grant execute on function calendrier.date_du_jour(date, text), calendrier.jours_conge(text) to authenticated, service_role;

-- Le personnel du Calendrier : direction et terrain seulement (les
-- animateurs sont les employés du référentiel, choisis dans Horaire).
update calendrier.personnel set secteur_principal = null where secteur_principal = 'animation';
alter table calendrier.personnel drop constraint personnel_secteur_principal_check;
alter table calendrier.personnel add constraint personnel_secteur_principal_check
  check (secteur_principal in ('direction','terrain'));
