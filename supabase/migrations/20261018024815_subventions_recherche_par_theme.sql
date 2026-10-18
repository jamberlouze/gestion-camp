-- ============================================================
-- Vigie de subventions : recherche par thème (2026-10-17)
--
-- Décision de Maxime après l'essai du 17 octobre (6 thèmes pour tout le
-- groupe : 119 programmes distincts en 200 recherches web, contre 64 en 322
-- pour la recherche entreprise par entreprise) : les nouvelles subventions
-- se cherchent par thème, pour tout le groupe ; chaque programme trouvé
-- nomme les entreprises qui peuvent en profiter, chacune avec sa
-- justification. Puis une courte recherche « angle mort » par entreprise
-- (ce qui lui est propre, que les thèmes ont pu manquer), puis les mises à
-- jour ciblées, comme avant.
--
-- grant_search_runs : `kind = 'theme'` (sans entreprise, `theme` = clé du
-- thème) et `'angle_mort'` (par entreprise) ; `'large'` et `'salariale'`
-- restent pour l'historique. La liste des thèmes vit dans le code
-- (src/modules/subventions/themes.ts) : prochaine_tache_trimestre la reçoit
-- en paramètre.
-- ============================================================

alter table subventions.grant_search_runs
  alter column company_id drop not null,
  add column theme text,
  drop constraint grant_search_runs_kind_check,
  add constraint grant_search_runs_kind_check
    check (kind in ('theme', 'angle_mort', 'ciblee', 'large', 'salariale')),
  add constraint grant_search_runs_cible_check
    check (case when kind = 'theme' then theme is not null and company_id is null
                else theme is null and company_id is not null end);

create index on subventions.grant_search_runs (theme, started_at desc) where theme is not null;

comment on column subventions.grant_search_runs.kind is
  'theme : nouvelles subventions d''un thème pour tout le groupe (theme, sans entreprise) ; angle_mort : nouvelles subventions propres à l''entreprise ; ciblee : mise à jour des subventions retenues ou obtenues (found_count = vérifiées, new_count = nouvelles éditions) ; large et salariale : anciennes recherches par entreprise (historique).';
comment on column subventions.grant_search_runs.theme is
  'Clé du thème d''une recherche par thème (src/modules/subventions/themes.ts) ; null pour les autres.';

-- Dédoublonne et insère les programmes trouvés. Recherche par entreprise :
-- chaque programme est pour l'entreprise de la recherche, avec
-- relevance_justification. Recherche par thème : chaque programme porte ses
-- entreprises (`companies` : [{company_id, justification}] ; inconnues
-- ignorées, programme sans entreprise connue ignoré).
-- Même programme : même program_key, ou même adresse (normalisée) et même
-- type. Déjà connu (carte nouvelle, en attente, en cours ou rejetée, ou
-- trouvée la même année fiscale) : pas de nouvelle carte ; les entreprises
-- qui n'y sont pas s'y ajoutent (sauf carte rejetée), chacune avec sa
-- justification (« Nom : … ») tant que la carte n'est pas décidée. Sinon
-- (obtenue, refusée ou expirée une année précédente) : nouvelle édition
-- d'un programme récurrent, reliée à la précédente.
create or replace function subventions.inserer_resultats(p_run uuid, p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run subventions.grant_search_runs;
  v_fy int := subventions.fiscal_year(current_date);
  v_item jsonb;
  v_url text;
  v_cle text;
  v_type subventions.grant_type;
  v_pour jsonb;
  v_liste jsonb;
  v_e jsonb;
  v_carte subventions.grants;
  v_precedente uuid;
  v_ajoute boolean;
  v_nouveaux int := 0;
  v_doublons int := 0;
  v_ajouts int := 0;
begin
  select * into v_run from subventions.grant_search_runs where id = p_run;
  if not found then
    raise exception 'Recherche % introuvable', p_run;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_url := nullif(btrim(v_item->>'source_url'), '');
    v_cle := nullif(lower(btrim(v_item->>'program_key')), '');
    v_type := coalesce(v_item->>'grant_type', 'autre')::subventions.grant_type;

    -- Entreprises du programme, dans l'ordre donné, une fois chacune :
    -- [{id, j}] (j = justification ou null).
    v_pour := case when v_run.company_id is not null
      then jsonb_build_array(jsonb_build_object(
             'company_id', v_run.company_id, 'justification', v_item->'relevance_justification'))
      else coalesce(v_item->'companies', '[]'::jsonb) end;
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'j', p.j) order by p.i), '[]'::jsonb)
      into v_liste
      from (select c.id, min(u.i) as i,
                   (array_agg(nullif(btrim(u.e->>'justification'), '') order by u.i))[1] as j
              from jsonb_array_elements(case when jsonb_typeof(v_pour) = 'array' then v_pour else '[]'::jsonb end)
                     with ordinality as u(e, i)
              join subventions.grant_companies c on c.id::text = u.e->>'company_id'
             group by c.id) p;
    continue when jsonb_array_length(v_liste) = 0;

    select g.* into v_carte
      from subventions.grants g
     where ((v_cle is not null and g.program_key = v_cle)
         or (v_url is not null and g.grant_type = v_type
             and subventions.normaliser_url(g.source_url) = subventions.normaliser_url(v_url)))
       and (g.status in ('nouveau', 'a_valider', 'en_cours', 'rejete') or g.discovered_fy = v_fy)
     order by (g.discovered_fy = v_fy) desc, g.discovered_at desc
     limit 1;

    if found then
      v_doublons := v_doublons + 1;
      if v_carte.status <> 'rejete' then
        v_ajoute := false;
        for v_e in select value from jsonb_array_elements(v_liste) loop
          continue when (v_e->>'id')::uuid = any (v_carte.company_ids);
          update subventions.grants
             set company_ids = company_ids || (v_e->>'id')::uuid,
                 relevance_justification = case
                   when status not in ('nouveau', 'a_valider') or v_e->>'j' is null then relevance_justification
                   else concat_ws(E'\n\n',
                          case when nullif(btrim(relevance_justification), '') is null then null
                               when cardinality(company_ids) = 1
                                 then subventions.nom_court(company_ids[1]) || ' : ' || btrim(relevance_justification)
                               else btrim(relevance_justification) end,
                          subventions.nom_court((v_e->>'id')::uuid) || ' : ' || (v_e->>'j'))
                 end
           where id = v_carte.id
           returning * into v_carte;
          v_ajoute := true;
        end loop;
        if v_ajoute then
          v_ajouts := v_ajouts + 1;
        end if;
      end if;
      continue;
    end if;

    select g.id into v_precedente
      from subventions.grants g
     where (v_cle is not null and g.program_key = v_cle)
        or (v_url is not null and g.grant_type = v_type
            and subventions.normaliser_url(g.source_url) = subventions.normaliser_url(v_url))
     order by g.discovered_at desc
     limit 1;

    insert into subventions.grants (
      program_name, organisme, description, source_url, grant_type,
      potential_amount_min, potential_amount_max, open_date, deadline_date,
      funded_start, funded_end, eligibility_criteria,
      relevance_justification, program_key, previous_grant_id,
      origin, search_run_id, company_ids, discovered_fy)
    values (
      v_item->>'program_name', v_item->>'organisme', v_item->>'description', v_url, v_type,
      (v_item->>'potential_amount_min')::numeric, (v_item->>'potential_amount_max')::numeric,
      (v_item->>'open_date')::date, (v_item->>'deadline_date')::date,
      (v_item->>'funded_start')::date,
      case when (v_item->>'funded_end')::date >= coalesce((v_item->>'funded_start')::date, '-infinity'::date)
           then (v_item->>'funded_end')::date end,
      nullif(btrim(v_item->>'eligibility_criteria'), ''),
      -- Une entreprise : sa justification telle quelle ; plusieurs : « Nom : … » chacune.
      case when jsonb_array_length(v_liste) = 1 then v_liste->0->>'j'
           else (select string_agg(subventions.nom_court((x.e->>'id')::uuid) || ' : ' || (x.e->>'j'), E'\n\n' order by x.i)
                   from jsonb_array_elements(v_liste) with ordinality as x(e, i)) end,
      v_cle, v_precedente,
      'claude', p_run,
      (select array_agg((x.e->>'id')::uuid order by x.i) from jsonb_array_elements(v_liste) with ordinality as x(e, i)),
      v_fy);
    v_nouveaux := v_nouveaux + 1;
  end loop;

  update subventions.grant_search_runs
     set found_count = jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
         new_count = v_nouveaux,
         duplicate_count = v_doublons
   where id = p_run;

  return jsonb_build_object('found', jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
                            'new', v_nouveaux, 'duplicate', v_doublons, 'added_to', v_ajouts);
end;
$$;

-- Travail du prochain passage du cron du trimestre : (a) la recherche de
-- chaque thème, dans l'ordre reçu (`p_themes`, la liste du code), reprise
-- une fois dans le trimestre si elle échoue ; (b) la recherche « angle
-- mort » de chaque entreprise active ; (c) la mise à jour ciblée des
-- retenues de chaque entreprise (10 par passage) ; null quand tout est
-- fait. Une recherche restée ouverte plus de 20 minutes (Worker coupé) est
-- d'abord fermée en erreur.
drop function subventions.prochaine_tache_trimestre();

create function subventions.prochaine_tache_trimestre(p_themes text[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_debut timestamptz := subventions.debut_trimestre(now());
  v_theme text;
  v_id uuid;
begin
  update subventions.grant_search_runs
     set finished_at = now(),
         error = coalesce(error, 'Recherche interrompue (le Worker a été arrêté avant la fin).')
   where finished_at is null and started_at < now() - interval '20 minutes';

  select t.cle into v_theme
    from unnest(p_themes) with ordinality as t(cle, i)
   where not exists (
           select 1 from subventions.grant_search_runs r
            where r.kind = 'theme' and r.theme = t.cle and r.trigger_source = 'cron'
              and r.started_at >= v_debut and (r.finished_at is null or r.error is null))
     and (select count(*) from subventions.grant_search_runs r
           where r.kind = 'theme' and r.theme = t.cle and r.trigger_source = 'cron'
             and r.started_at >= v_debut) < 2
   order by t.i
   limit 1;
  if v_theme is not null then
    return jsonb_build_object('kind', 'theme', 'theme', v_theme);
  end if;

  select c.id into v_id
    from subventions.grant_companies c
   where c.active
     and not exists (
       select 1 from subventions.grant_search_runs r
        where r.company_id = c.id and r.trigger_source = 'cron' and r.kind = 'angle_mort'
          and r.started_at >= v_debut)
   order by c.sort_order, c.name
   limit 1;
  if v_id is not null then
    return jsonb_build_object('kind', 'angle_mort', 'company_id', v_id);
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

revoke execute on function subventions.prochaine_tache_trimestre(text[]) from public, anon;
grant execute on function subventions.prochaine_tache_trimestre(text[]) to service_role;
