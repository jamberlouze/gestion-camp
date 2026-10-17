-- ============================================================
-- Vigie de subventions : recherche salariale à part (2026-10-17)
--
-- Demande de Maxime : la recherche n'avait pas trouvé des subventions
-- salariales que le groupe a utilisées (programmes distribués par des
-- organismes intermédiaires : partenaires du Programme de stages pratiques
-- pour étudiants, fonds syndicaux…). Chaque entreprise active qui embauche
-- (`hires_staff`) a maintenant, à chaque trimestre, une recherche
-- consacrée aux subventions salariales (`kind = 'salariale'`), après la
-- recherche large de toutes les entreprises et avant les mises à jour
-- ciblées. Une recherche salariale qui échoue est reprise une fois dans le
-- trimestre (elle est longue : un passage coupé ne doit pas faire perdre
-- tout le trimestre).
-- ============================================================

alter table subventions.grant_search_runs
  drop constraint grant_search_runs_kind_check,
  add constraint grant_search_runs_kind_check check (kind in ('large', 'salariale', 'ciblee'));

comment on column subventions.grant_search_runs.kind is
  'large : nouvelles subventions pour l''entreprise ; salariale : nouvelles subventions salariales (embauche, stages, emplois d''été, organisme par organisme) ; ciblee : mise à jour des subventions retenues ou obtenues (found_count = vérifiées, new_count = nouvelles éditions).';

-- Travail du prochain passage du cron du trimestre : d'abord la recherche
-- large de chaque entreprise active, puis la recherche salariale de chaque
-- entreprise active qui embauche, puis la mise à jour ciblée de ses
-- retenues (10 par passage) ; null quand tout est fait. Une recherche
-- restée ouverte plus de 20 minutes (Worker coupé) est d'abord fermée en
-- erreur ; une recherche large ou ciblée qui échoue n'est pas reprise avant
-- le trimestre suivant (bouton « Lancer » de l'onglet Recherches), une
-- salariale l'est une fois.
create or replace function subventions.prochaine_tache_trimestre()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_debut timestamptz := subventions.debut_trimestre(now());
  v_id uuid;
begin
  update subventions.grant_search_runs
     set finished_at = now(),
         error = coalesce(error, 'Recherche interrompue (le Worker a été arrêté avant la fin).')
   where finished_at is null and started_at < now() - interval '20 minutes';

  select c.id into v_id
    from subventions.grant_companies c
   where c.active
     and not exists (
       select 1 from subventions.grant_search_runs r
        where r.company_id = c.id and r.trigger_source = 'cron' and r.kind = 'large'
          and r.started_at >= v_debut)
   order by c.sort_order, c.name
   limit 1;
  if v_id is not null then
    return jsonb_build_object('kind', 'large', 'company_id', v_id);
  end if;

  select c.id into v_id
    from subventions.grant_companies c
   where c.active
     and c.hires_staff
     and not exists (
       select 1 from subventions.grant_search_runs r
        where r.company_id = c.id and r.trigger_source = 'cron' and r.kind = 'salariale'
          and r.started_at >= v_debut and (r.finished_at is null or r.error is null))
     and (select count(*) from subventions.grant_search_runs r
           where r.company_id = c.id and r.trigger_source = 'cron' and r.kind = 'salariale'
             and r.started_at >= v_debut) < 2
   order by c.sort_order, c.name
   limit 1;
  if v_id is not null then
    return jsonb_build_object('kind', 'salariale', 'company_id', v_id);
  end if;

  select c.id into v_id
    from subventions.grant_companies c
   where c.active
     and exists (select 1 from subventions.retenues_a_verifier(c.id, v_debut, 1))
     and not exists (
       select 1 from subventions.grant_search_runs r
        where r.company_id = c.id and r.kind = 'ciblee' and r.finished_at is null)
     and (select count(*) from subventions.grant_search_runs r
           where r.company_id = c.id and r.trigger_source = 'cron' and r.kind = 'ciblee'
             and r.started_at >= v_debut) < 5
   order by c.sort_order, c.name
   limit 1;
  if v_id is not null then
    return jsonb_build_object('kind', 'ciblee', 'company_id', v_id);
  end if;
  return null;
end;
$$;
