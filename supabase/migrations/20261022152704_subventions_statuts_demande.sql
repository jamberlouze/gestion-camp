-- ============================================================
-- Subventions : statut d'une demande, étape par étape (demande de Maxime,
-- 2026-10-22 : une subvention retenue était « En cours », c'est plutôt
-- « À faire »).
--
-- Statut d'une ligne de suivi (grant_applications.status), dans l'ordre :
--   a_faire (À faire, ex-en_cours) → depose (Déposée)
--   → obtenu (Acceptée) / refuse (Refusée par l'organisme) / desiste (Désistée)
--   → complete (Complétée : argent reçu).
-- Les valeurs du type de la carte sont posées par 20261022152703.
--
-- Statut de la carte, tiré de ses lignes : la moins avancée qui reste
-- ouverte (à faire, déposée, acceptée, complétée), sinon refusée, sinon
-- désistée.
-- Mise à jour ciblée : à faire ou déposée = l'ancienne « en cours » (dates,
-- montants, critères) ; acceptée ou complétée = l'ancienne « obtenue »
-- (seulement sa nouvelle édition). Dédoublonnage : à faire et déposée
-- comptent comme l'ancienne « en cours » ; complétée et désistée, comme
-- obtenue et refusée (la prochaine édition peut revenir).
--
-- Lignes existantes : à faire avec une date de dépôt passée → déposée ;
-- acceptée dont tout l'accordé est reçu → complétée.
-- ============================================================

-- Statut tiré des lignes de suivi ; null : aucune ligne.
create or replace function subventions.statut_des_suivis(p_grant uuid)
returns subventions.grant_status
language sql
stable
set search_path = ''
as $$
  select case
           when bool_or(a.status = 'a_faire') then 'a_faire'
           when bool_or(a.status = 'depose') then 'depose'
           when bool_or(a.status = 'obtenu') then 'obtenu'
           when bool_or(a.status = 'complete') then 'complete'
           when bool_or(a.status = 'refuse') then 'refuse'
           when count(*) > 0 then 'desiste'
         end::subventions.grant_status
    from subventions.grant_applications a
   where a.grant_id = p_grant
$$;

-- Avant chaque écriture d'une carte : avec des lignes de suivi, son statut en
-- vient ; sans ligne, elle ne peut pas avoir un statut de demande (dernière
-- ligne retirée : retour « en attente »). Ses compagnies comprennent
-- toujours celles de ses lignes, sans doublon.
create or replace function subventions.poser_carte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_statut subventions.grant_status := subventions.statut_des_suivis(new.id);
begin
  if v_statut is not null then
    new.status := v_statut;
  elsif new.status in ('a_faire', 'depose', 'obtenu', 'complete', 'refuse', 'desiste') then
    new.status := 'a_valider';
  end if;
  new.company_ids := array(
    select x
      from unnest(new.company_ids || array(select a.company_id from subventions.grant_applications a where a.grant_id = new.id))
           with ordinality as u(x, i)
     where x is not null
     group by x
     order by min(i));
  return new;
end;
$$;

-- Cartes d'une entreprise à mettre à jour (mise à jour ciblée) : celles où
-- elle a une ligne de suivi, à faire ou déposées, ou acceptées (complétées
-- comprises) l'année fiscale en cours ou la précédente et sans édition
-- suivante. Une carte de plusieurs compagnies n'est vérifiée qu'une fois par
-- trimestre (`p_depuis`).
create or replace function subventions.retenues_a_verifier(p_company uuid, p_depuis timestamptz default null, p_max int default 10)
returns setof subventions.grants
language sql
stable
set search_path = ''
as $$
  select g.*
    from subventions.grants g
   where exists (select 1 from subventions.grant_applications a where a.grant_id = g.id and a.company_id = p_company)
     and (g.status in ('a_faire', 'depose')
          or (g.status in ('obtenu', 'complete')
              and g.fiscal_year >= subventions.fiscal_year(current_date) - 1
              and not exists (select 1 from subventions.grants n where n.previous_grant_id = g.id)))
     and (p_depuis is null or g.update_checked_at is null or g.update_checked_at < p_depuis)
   order by g.update_checked_at nulls first, g.deadline_date nulls last, g.program_name
   limit p_max
$$;

-- Mise à jour ciblée : à faire ou déposée → dates, montants et critères ;
-- acceptée ou complétée → seulement sa nouvelle édition.
create or replace function subventions.appliquer_mise_a_jour(p_run uuid, p_items jsonb, p_grants uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_champs text[] := array['source_url', 'open_date', 'deadline_date', 'funded_start', 'funded_end',
                           'potential_amount_min', 'potential_amount_max', 'eligibility_criteria'];
  v_item jsonb;
  v_g subventions.grants;
  v_champ text;
  v_nouveau text;
  v_actuel text;
  v_ed jsonb;
  v_cle text;
  v_url text;
  v_id uuid;
  v_fy int := subventions.fiscal_year(current_date);
  v_remplis int := 0;
  v_proposes int := 0;
  v_editions int := 0;
  v_doublons int := 0;
begin
  if not exists (select 1 from subventions.grant_search_runs where id = p_run) then
    raise exception 'Recherche % introuvable', p_run;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_g from subventions.grants
     where id = (v_item->>'grant_id')::uuid and id = any (p_grants)
     for update;
    if not found then
      continue;
    end if;

    if v_g.status in ('a_faire', 'depose') then
      foreach v_champ in array v_champs loop
        v_nouveau := nullif(btrim(v_item->>v_champ), '');
        continue when v_nouveau is null;
        v_actuel := nullif(btrim(to_jsonb(v_g)->>v_champ), '');
        if v_actuel is null then
          begin
            execute format('update subventions.grants set %I = $1::%s where id = $2', v_champ, subventions.type_champ(v_champ))
              using v_nouveau, v_g.id;
            insert into subventions.grant_proposals
              (grant_id, field, current_value, proposed_value, status, source_url, comment, search_run_id)
            values (v_g.id, v_champ, null, v_nouveau, 'appliquee',
                    nullif(btrim(v_item->>'verification_url'), ''), nullif(btrim(v_item->>'comment'), ''), p_run);
            v_remplis := v_remplis + 1;
          exception when others then
            -- Ex. fin de période avant le début : le champ reste vide.
            null;
          end;
        elsif not subventions.meme_valeur(v_champ, v_actuel, v_nouveau)
              and not exists (
                select 1 from subventions.grant_proposals p
                 where p.grant_id = v_g.id and p.field = v_champ and p.status = 'refusee'
                   and subventions.meme_valeur(v_champ, p.proposed_value, v_nouveau)) then
          delete from subventions.grant_proposals
           where grant_id = v_g.id and field = v_champ and status = 'a_valider';
          insert into subventions.grant_proposals
            (grant_id, field, current_value, proposed_value, status, source_url, comment, search_run_id)
          values (v_g.id, v_champ, v_actuel, v_nouveau, 'a_valider',
                  nullif(btrim(v_item->>'verification_url'), ''), nullif(btrim(v_item->>'comment'), ''), p_run);
          v_proposes := v_proposes + 1;
        end if;
      end loop;

    elsif v_g.status in ('obtenu', 'complete') and jsonb_typeof(v_item->'new_edition') = 'object' then
      v_ed := v_item->'new_edition';
      v_cle := coalesce(v_g.program_key, nullif(lower(btrim(v_ed->>'program_key')), ''));
      v_url := nullif(btrim(v_ed->>'source_url'), '');
      if exists (
        select 1 from subventions.grants x
         where x.id <> v_g.id
           and (x.previous_grant_id = v_g.id
                or (((v_cle is not null and x.program_key = v_cle)
                     or (v_url is not null and x.grant_type = v_g.grant_type
                         and subventions.normaliser_url(x.source_url) = subventions.normaliser_url(v_url)))
                    and (x.status in ('nouveau', 'a_valider', 'a_faire', 'depose', 'rejete') or x.discovered_fy = v_fy)))) then
        v_doublons := v_doublons + 1;
      else
        v_id := null;
        insert into subventions.grants (
          program_name, organisme, description, source_url, grant_type,
          potential_amount_min, potential_amount_max, open_date, deadline_date,
          funded_start, funded_end, eligibility_criteria,
          relevance_justification, program_key, previous_grant_id,
          origin, search_run_id, company_ids, discovered_fy)
        values (
          coalesce(nullif(btrim(v_ed->>'program_name'), ''), v_g.program_name),
          v_g.organisme,
          coalesce(nullif(btrim(v_ed->>'description'), ''), v_g.description),
          coalesce(v_url, v_g.source_url),
          v_g.grant_type,
          (v_ed->>'potential_amount_min')::numeric, (v_ed->>'potential_amount_max')::numeric,
          (v_ed->>'open_date')::date, (v_ed->>'deadline_date')::date,
          (v_ed->>'funded_start')::date, (v_ed->>'funded_end')::date,
          coalesce(nullif(btrim(v_ed->>'eligibility_criteria'), ''), v_g.eligibility_criteria),
          'Nouvelle édition d''un programme obtenu (' || v_g.program_name || ').'
            || coalesce(' ' || nullif(btrim(v_item->>'comment'), ''), ''),
          v_cle, v_g.id, 'claude', p_run, v_g.company_ids, v_fy)
        on conflict do nothing
        returning id into v_id;
        if v_id is not null then
          v_editions := v_editions + 1;
        else
          v_doublons := v_doublons + 1;
        end if;
      end if;
    end if;
  end loop;

  update subventions.grants set update_checked_at = now() where id = any (p_grants);

  -- Mise à jour ciblée : found_count = subventions vérifiées.
  update subventions.grant_search_runs
     set found_count = coalesce(array_length(p_grants, 1), 0),
         new_count = v_editions,
         duplicate_count = v_doublons,
         filled_count = v_remplis,
         proposed_count = v_proposes
   where id = p_run;

  return jsonb_build_object('checked', coalesce(array_length(p_grants, 1), 0), 'filled', v_remplis,
                            'proposed', v_proposes, 'new', v_editions, 'duplicate', v_doublons);
end;
$$;

-- Résultats d'une recherche : un programme déjà connu (carte nouvelle, en
-- attente, à faire, déposée ou rejetée, ou trouvée la même année fiscale)
-- ne fait pas de nouvelle carte ; sinon (acceptée, complétée, refusée,
-- désistée ou expirée une année précédente) : nouvelle édition d'un
-- programme récurrent, reliée à la précédente. Le reste comme dans
-- 20261018024815.
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
       and (g.status in ('nouveau', 'a_valider', 'a_faire', 'depose', 'rejete') or g.discovered_fy = v_fy)
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

-- ------------------------------------------------------------
-- Lignes de suivi : nouveaux statuts
-- ------------------------------------------------------------

-- Les déclencheurs des lignes recalculent le statut de leur carte à la fin
-- de chaque instruction (fonctions ci-dessus déjà en place).
alter table subventions.grant_applications drop constraint grant_applications_status_check;

update subventions.grant_applications set status = 'a_faire' where status = 'en_cours';

alter table subventions.grant_applications
  alter column status set default 'a_faire',
  add constraint grant_applications_status_check
    check (status in ('a_faire', 'depose', 'obtenu', 'refuse', 'desiste', 'complete'));

-- Ce que les lignes disent déjà : une date de dépôt passée = déposée ; tout
-- l'accordé reçu = complétée.
update subventions.grant_applications
   set status = 'depose'
 where status = 'a_faire' and requested_at <= current_date;

update subventions.grant_applications
   set status = 'complete'
 where status = 'obtenu' and amount_granted > 0 and amount_received >= amount_granted;
