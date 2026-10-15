-- ============================================================
-- Calendrier : horaire de la direction en saisie rapide (réunion du
-- 2026-10-14 avec Charlotte, décisions de Maxime).
--
-- 1. personnel.courriel : lien entre un compte et sa personne du
--    Calendrier (« + » choisit d'office la personne connectée). Rangé en
--    minuscules ; comparé au courriel du profil.
-- 2. presences_simples.statut : choix rapide Terrain / Télétravail /
--    Congé (null = présent, sans précision, comme avant). Un congé n'est
--    pas une journée travaillée : il n'est pas dans v_presence_jour.
-- 3. personnel.personne_cuisine_id : une personne de la direction qui est
--    aussi à l'horaire de cuisine (Frédérique). Elle se saisit seulement
--    dans le Calendrier : Cuisine › Horaire lit ses journées
--    (calendrier.horaire_cuisine_lie, jamais recopiées) et ses quarts de
--    cuisine ne sont plus dans la rangée Cuisine du Calendrier.
-- ============================================================

alter table calendrier.personnel
  add column courriel text
    check (courriel is null or (courriel = lower(btrim(courriel)) and courriel <> '')),
  add column personne_cuisine_id uuid references commande.personnel(id) on delete set null;

comment on column calendrier.personnel.courriel is
  'Courriel du compte de la personne (minuscules) : « + » la choisit d''office dans la rangée Direction.';
comment on column calendrier.personnel.personne_cuisine_id is
  'Aussi à l''horaire de cuisine : Cuisine › Horaire lit ses journées du Calendrier (calendrier.horaire_cuisine_lie).';

create unique index personnel_courriel_idx on calendrier.personnel (courriel)
  where deleted_at is null and courriel is not null;
create unique index personnel_cuisine_idx on calendrier.personnel (personne_cuisine_id)
  where deleted_at is null and personne_cuisine_id is not null;

alter table calendrier.presences_simples
  add column statut text check (statut in ('terrain', 'teletravail', 'conge'));

comment on column calendrier.presences_simples.statut is
  'Choix rapide : terrain, teletravail ou conge (null = présent, sans précision). Un congé n''est pas une journée travaillée.';

-- Les présences importées du Google Sheets « Horaire Automne 2026 »
-- (« Télétravail » en note) prennent le statut ; une note plus longue
-- (« Télétravail l'après-midi ») reste une note.
update calendrier.presences_simples
set statut = 'teletravail', description = null
where secteur = 'direction'
  and statut is null
  and calendrier.normaliser(coalesce(description, '')) = 'teletravail';

-- Vue commune : colonne statut ajoutée à la fin ; congés retirés ;
-- télétravail écrit dans la description ; une personne de la direction
-- liée à l'horaire de cuisine n'est plus en double dans la cuisine.
create or replace view calendrier.v_presence_jour with (security_invoker = true) as
  select q.personne_id as personnel_id, p.nom, q.jour as date, 'cuisine'::text as secteur,
         coalesce(f.nom, 'Cuisine') as description, null::text as statut
  from commande.quarts q
  join commande.personnel p on p.id = q.personne_id
  left join commande.fonctions f on f.id = p.fonction_id
  where calendrier.quart_travaille(q.texte)
    and not exists (
      select 1 from calendrier.personnel cp
      where cp.personne_cuisine_id = q.personne_id and cp.deleted_at is null
    )
  union all
  -- Animation : chaque groupe de chaque horaire daté, chaque jour ; pendant
  -- son congé, l'animateur est remplacé (ou absent, sans remplaçant).
  -- Identifiant : l'employé du référentiel (core.employes, par surnom).
  select coalesce(e.id, md5('horaire:' || a.anim)::uuid), a.anim, a.date, 'animation',
         string_agg(distinct case when a.num <> '' then 'Groupe ' || a.num else 'Animation' end, ', '),
         null::text
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
  select ps.personnel_id, p.nom, ps.date, ps.secteur,
         coalesce(concat_ws(' · ', case when ps.statut = 'teletravail' then 'Télétravail' end, nullif(btrim(ps.description), '')), ''),
         ps.statut
  from calendrier.presences_simples ps
  join calendrier.personnel p on p.id = ps.personnel_id
  where ps.deleted_at is null
    and ps.statut is distinct from 'conge';

grant select on calendrier.v_presence_jour to authenticated, service_role;

-- Cuisine › Horaire : les journées (Direction) des personnes liées à
-- l'horaire de cuisine, lues dans le Calendrier. Pour qui lit Cuisine ou
-- le Calendrier ; seulement le statut et la note. Une personne liée sans
-- journée dans la plage revient avec une seule ligne, date null.
create or replace function calendrier.horaire_cuisine_lie(p_debut date, p_fin date)
returns table (personne_cuisine_id uuid, personnel_id uuid, nom text, date date, statut text, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select cp.personne_cuisine_id, cp.id, cp.nom, ps.date, ps.statut, nullif(btrim(ps.description), '')
  from calendrier.personnel cp
  left join calendrier.presences_simples ps
    on ps.personnel_id = cp.id
   and ps.secteur = 'direction'
   and ps.deleted_at is null
   and ps.date between p_debut and p_fin
  where cp.personne_cuisine_id is not null
    and cp.deleted_at is null
    and p_fin >= p_debut
    and p_fin - p_debut <= 400
    and (core.peut_lire('commande') or core.peut_lire('calendrier'))
  order by cp.nom, ps.date
$$;

revoke execute on function calendrier.horaire_cuisine_lie(date, date) from public, anon;
grant execute on function calendrier.horaire_cuisine_lie(date, date) to authenticated, service_role;
