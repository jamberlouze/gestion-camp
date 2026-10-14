-- ============================================================
-- Subventions : révision du 2026-10-14 (réunion avec Charlotte).
--
-- 1. Recherche 4 fois par année (début d'octobre, janvier, avril et
--    juillet : les trimestres de l'année fiscale) au lieu de chaque lundi,
--    en deux temps : (a) recherche large de nouvelles subventions, par
--    entreprise ; (b) mise à jour ciblée des subventions retenues (en
--    cours) ou obtenues. Un champ vide est rempli directement ; un champ
--    déjà rempli qui changerait devient une proposition à valider sur la
--    fiche (grant_proposals), jamais écrasé sans accord.
-- 2. Année fiscale de chaque subvention (fiscal_year) : proposée d'après
--    la période financée, sinon la date limite (déclencheur), modifiable
--    sur la fiche (fiscal_year_manual).
-- 3. Agenda Google « Subventions » : ce que le Worker y a écrit
--    (grant_calendar_events) ; réglage « agenda » de grant_settings.
-- 4. Attribution salariale : une ligne par employé et par subvention
--    (grant_salary_lines). Salaires : mêmes droits que le module.
--
-- Aucun courriel n'est plus envoyé par ce module (décision de Maxime) :
-- grant_digests et subventions.destinataires() restent, inutilisés.
-- ============================================================

-- ------------------------------------------------------------
-- Subventions : période financée, critères, année fiscale, dernière
-- vérification ciblée.
-- ------------------------------------------------------------
alter table subventions.grants
  add column funded_start date,
  add column funded_end date,
  add column eligibility_criteria text,
  add column fiscal_year int,
  add column fiscal_year_manual boolean not null default false,
  add column update_checked_at timestamptz,
  add constraint grants_periode_financee check (funded_end is null or funded_start is null or funded_end >= funded_start),
  add constraint grants_fiscal_year check (fiscal_year between 2000 and 2100);

comment on column subventions.grants.funded_start is 'Début de la période financée (ex. premier jour des emplois d''été).';
comment on column subventions.grants.funded_end is 'Fin de la période financée.';
comment on column subventions.grants.eligibility_criteria is 'Critères d''admissibilité principaux (trouvés par Claude ou saisis).';
comment on column subventions.grants.fiscal_year is
  'Année fiscale de la subvention (nommée d''après l''année où elle se termine). Proposée par subventions.poser_annee_fiscale, sauf si fiscal_year_manual.';
comment on column subventions.grants.update_checked_at is 'Dernière mise à jour ciblée par Claude (vérifiée, avec ou sans changement).';

-- Année fiscale proposée : période financée, sinon date limite, sinon
-- octroi, sinon année de la découverte. Choisie à la main : gardée.
create function subventions.poser_annee_fiscale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fiscal_year is null then
    new.fiscal_year_manual := false;
  end if;
  if not new.fiscal_year_manual then
    new.fiscal_year := coalesce(
      subventions.fiscal_year(new.funded_start),
      subventions.fiscal_year(new.deadline_date),
      subventions.fiscal_year(new.granted_at),
      new.discovered_fy);
  end if;
  return new;
end;
$$;

create trigger trg_annee_fiscale before insert or update on subventions.grants
for each row execute function subventions.poser_annee_fiscale();

update subventions.grants set fiscal_year_manual = false;
alter table subventions.grants alter column fiscal_year set not null;
create index on subventions.grants (fiscal_year);

-- Étapes reprises d'une autre année : échéances décalées d'autant
-- d'années fiscales que les deux subventions (fiscal_year).
create or replace function subventions.copier_etapes(p_source uuid, p_cible uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_ecart int;
  v_debut int;
  v_n int;
begin
  if p_source = p_cible then
    raise exception 'Choisissez une autre subvention.';
  end if;
  select greatest(c.fiscal_year - s.fiscal_year, 0)
    into v_ecart
    from subventions.grants s, subventions.grants c
   where s.id = p_source and c.id = p_cible;
  if v_ecart is null then
    raise exception 'Subvention introuvable.';
  end if;
  select coalesce(max(sort_order) + 1, 0) into v_debut
    from subventions.grant_reporting_steps where grant_id = p_cible;

  insert into subventions.grant_reporting_steps
    (grant_id, description, due_date, status, template_source_step_id, sort_order)
  select p_cible, e.description,
         (e.due_date + make_interval(years => v_ecart))::date,
         'a_faire', e.id, v_debut + row_number() over (order by e.sort_order, e.created_at) - 1
    from subventions.grant_reporting_steps e
   where e.grant_id = p_source;
  get diagnostics v_n = row_count;

  update subventions.grants
     set previous_grant_id = coalesce(previous_grant_id, p_source)
   where id = p_cible;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Journal : genre de recherche et bilan de la mise à jour ciblée.
-- ------------------------------------------------------------
alter table subventions.grant_search_runs
  add column kind text not null default 'large' check (kind in ('large', 'ciblee')),
  add column filled_count int not null default 0,     -- champs vides remplis directement
  add column proposed_count int not null default 0;   -- changements proposés (à valider)

comment on column subventions.grant_search_runs.kind is
  'large : nouvelles subventions pour l''entreprise ; ciblee : mise à jour des subventions retenues ou obtenues (found_count = vérifiées, new_count = nouvelles éditions).';

-- ------------------------------------------------------------
-- Propositions de Claude (mise à jour ciblée)
--   a_valider : un champ déjà rempli changerait ; à accepter ou refuser
--   acceptee / refusee : décidée sur la fiche (une valeur refusée n'est
--               pas reproposée)
--   appliquee : champ vide rempli directement (trace)
-- Valeurs en texte : dates AAAA-MM-JJ, montants en nombre.
-- ------------------------------------------------------------
create table subventions.grant_proposals (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  field text not null check (field in (
    'source_url', 'open_date', 'deadline_date', 'funded_start', 'funded_end',
    'potential_amount_min', 'potential_amount_max', 'eligibility_criteria')),
  current_value text,
  proposed_value text not null,
  status text not null default 'a_valider' check (status in ('a_valider', 'acceptee', 'refusee', 'appliquee')),
  source_url text,          -- page où Claude a vérifié
  comment text,             -- ce qui a changé, selon Claude
  search_run_id uuid references subventions.grant_search_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz
);

create index on subventions.grant_proposals (grant_id);
create unique index grant_proposals_ouverte_uq on subventions.grant_proposals (grant_id, field) where status = 'a_valider';

-- Type SQL d'un champ que la mise à jour ciblée peut toucher.
create function subventions.type_champ(p_champ text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_champ in ('open_date', 'deadline_date', 'funded_start', 'funded_end') then 'date'
    when p_champ in ('potential_amount_min', 'potential_amount_max') then 'numeric'
    else 'text'
  end
$$;

-- Deux valeurs (texte) d'un même champ sont-elles la même ?
create function subventions.meme_valeur(p_champ text, a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when a is null or b is null then a is not distinct from b
    when p_champ = 'source_url' then subventions.normaliser_url(a) = subventions.normaliser_url(b)
    when subventions.type_champ(p_champ) = 'date' then a::date = b::date
    when subventions.type_champ(p_champ) = 'numeric' then a::numeric = b::numeric
    else regexp_replace(btrim(a), '\s+', ' ', 'g') = regexp_replace(btrim(b), '\s+', ' ', 'g')
  end
$$;

-- Accepter (le champ prend la valeur proposée) ou refuser une proposition.
-- Droits de la personne connectée (RLS).
create function subventions.decider_proposition(p_id uuid, p_accepter boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_p subventions.grant_proposals;
begin
  select * into v_p from subventions.grant_proposals where id = p_id and status = 'a_valider' for update;
  if not found then
    raise exception 'Proposition introuvable ou déjà décidée.';
  end if;
  if p_accepter then
    execute format('update subventions.grants set %I = $1::%s where id = $2', v_p.field, subventions.type_champ(v_p.field))
      using v_p.proposed_value, v_p.grant_id;
  end if;
  update subventions.grant_proposals
     set status = case when p_accepter then 'acceptee' else 'refusee' end,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- Trimestres (= trimestres de l'année fiscale : octobre, janvier, avril,
-- juillet) et choix du travail de chaque passage du cron.
-- ------------------------------------------------------------
create function subventions.debut_trimestre(p timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('quarter', p at time zone 'America/Toronto') at time zone 'America/Toronto'
$$;

-- Subventions d'une entreprise à mettre à jour (mise à jour ciblée) : en
-- cours, ou obtenues l'année fiscale en cours ou la précédente et sans
-- édition suivante (on y cherche la nouvelle édition). Celle qui dépose,
-- sinon celle pour qui elle a été trouvée. `p_depuis` : seulement celles
-- pas vérifiées depuis (le trimestre) ; les moins récemment vérifiées d'abord.
create function subventions.retenues_a_verifier(p_company uuid, p_depuis timestamptz default null, p_max int default 10)
returns setof subventions.grants
language sql
stable
set search_path = ''
as $$
  select g.*
    from subventions.grants g
   where coalesce(g.applicant_company_id, g.target_company_id) = p_company
     and (g.status = 'en_cours'
          or (g.status = 'obtenu'
              and g.fiscal_year >= subventions.fiscal_year(current_date) - 1
              and not exists (select 1 from subventions.grants n where n.previous_grant_id = g.id)))
     and (p_depuis is null or g.update_checked_at is null or g.update_checked_at < p_depuis)
   order by g.update_checked_at nulls first, g.deadline_date nulls last, g.program_name
   limit p_max
$$;

-- Travail du prochain passage du cron du trimestre : d'abord la recherche
-- large de chaque entreprise active, puis la mise à jour ciblée de ses
-- retenues (10 par passage) ; null quand tout est fait. Une recherche
-- restée ouverte plus de 20 minutes (Worker coupé) est d'abord fermée en
-- erreur ; une recherche qui échoue n'est pas reprise avant le trimestre
-- suivant (bouton « Lancer » de l'onglet Recherches).
create function subventions.prochaine_tache_trimestre()
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

drop function subventions.prochaine_entreprise_hebdo();
drop function subventions.semaine_terminee();

-- ------------------------------------------------------------
-- Mise à jour ciblée : applique ce que Claude a vérifié.
-- p_items : [{grant_id, <champ>: valeur…, verification_url, comment,
--             new_edition: {…} | null}] (nettoyés par le Worker) ;
-- p_grants : les subventions envoyées à Claude (vérifiées, même sans
-- changement).
--   - en cours : champ vide → rempli (trace « appliquee ») ; champ rempli
--     et différent → proposition à valider (une valeur déjà refusée n'est
--     pas reproposée ; une proposition ouverte est remplacée).
--   - obtenue : seulement la nouvelle édition, ajoutée comme nouvelle
--     subvention (statut nouveau, reliée par previous_grant_id) si elle
--     n'est pas déjà connue. Ses dates à elle ne changent jamais.
-- ------------------------------------------------------------
create function subventions.appliquer_mise_a_jour(p_run uuid, p_items jsonb, p_grants uuid[])
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

    if v_g.status = 'en_cours' then
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

    elsif v_g.status = 'obtenu' and jsonb_typeof(v_item->'new_edition') = 'object' then
      v_ed := v_item->'new_edition';
      v_cle := coalesce(v_g.program_key, nullif(lower(btrim(v_ed->>'program_key')), ''));
      if exists (
        select 1 from subventions.grants x
         where x.id <> v_g.id
           and (x.previous_grant_id = v_g.id
                or (x.target_company_id = v_g.target_company_id
                    and ((v_cle is not null and x.program_key = v_cle)
                         or (nullif(btrim(v_ed->>'source_url'), '') is not null
                             and subventions.normaliser_url(x.source_url) = subventions.normaliser_url(v_ed->>'source_url')))
                    and (x.status in ('nouveau', 'a_valider', 'en_cours', 'rejete') or x.discovered_fy = v_fy)))) then
        v_doublons := v_doublons + 1;
      else
        v_id := null;
        insert into subventions.grants (
          program_name, organisme, description, source_url, grant_type,
          potential_amount_min, potential_amount_max, open_date, deadline_date,
          funded_start, funded_end, eligibility_criteria,
          relevance_justification, program_key, previous_grant_id,
          origin, search_run_id, target_company_id, discovered_fy)
        values (
          coalesce(nullif(btrim(v_ed->>'program_name'), ''), v_g.program_name),
          v_g.organisme,
          coalesce(nullif(btrim(v_ed->>'description'), ''), v_g.description),
          coalesce(nullif(btrim(v_ed->>'source_url'), ''), v_g.source_url),
          v_g.grant_type,
          (v_ed->>'potential_amount_min')::numeric, (v_ed->>'potential_amount_max')::numeric,
          (v_ed->>'open_date')::date, (v_ed->>'deadline_date')::date,
          (v_ed->>'funded_start')::date, (v_ed->>'funded_end')::date,
          coalesce(nullif(btrim(v_ed->>'eligibility_criteria'), ''), v_g.eligibility_criteria),
          'Nouvelle édition d''un programme obtenu (' || v_g.program_name || ').'
            || coalesce(' ' || nullif(btrim(v_item->>'comment'), ''), ''),
          v_cle, v_g.id, 'claude', p_run, v_g.target_company_id, v_fy)
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

-- Recherche large : mêmes règles qu'avant, avec la période financée et
-- les critères d'admissibilité.
create or replace function subventions.inserer_resultats(p_run uuid, p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_entreprise uuid;
  v_fy int := subventions.fiscal_year(current_date);
  v_item jsonb;
  v_url text;
  v_cle text;
  v_connu boolean;
  v_precedente uuid;
  v_nouveaux int := 0;
  v_doublons int := 0;
begin
  select company_id into v_entreprise from subventions.grant_search_runs where id = p_run;
  if v_entreprise is null then
    raise exception 'Recherche % introuvable', p_run;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_url := nullif(btrim(v_item->>'source_url'), '');
    v_cle := nullif(lower(btrim(v_item->>'program_key')), '');

    select coalesce(bool_or(g.status in ('nouveau', 'a_valider', 'en_cours', 'rejete')
                            or g.discovered_fy = v_fy), false),
           (array_agg(g.id order by g.discovered_at desc))[1]
      into v_connu, v_precedente
      from subventions.grants g
     where g.target_company_id = v_entreprise
       and ((v_url is not null and subventions.normaliser_url(g.source_url) = subventions.normaliser_url(v_url))
         or (v_cle is not null and g.program_key = v_cle));

    if v_connu then
      v_doublons := v_doublons + 1;
      continue;
    end if;

    insert into subventions.grants (
      program_name, organisme, description, source_url, grant_type,
      potential_amount_min, potential_amount_max, open_date, deadline_date,
      funded_start, funded_end, eligibility_criteria,
      relevance_justification, program_key, previous_grant_id,
      origin, search_run_id, target_company_id, discovered_fy)
    values (
      v_item->>'program_name', v_item->>'organisme', v_item->>'description', v_url,
      coalesce(v_item->>'grant_type', 'autre')::subventions.grant_type,
      (v_item->>'potential_amount_min')::numeric, (v_item->>'potential_amount_max')::numeric,
      (v_item->>'open_date')::date, (v_item->>'deadline_date')::date,
      (v_item->>'funded_start')::date,
      case when (v_item->>'funded_end')::date >= coalesce((v_item->>'funded_start')::date, '-infinity'::date)
           then (v_item->>'funded_end')::date end,
      nullif(btrim(v_item->>'eligibility_criteria'), ''),
      v_item->>'relevance_justification', v_cle, v_precedente,
      'claude', p_run, v_entreprise, v_fy)
    on conflict do nothing;

    if found then
      v_nouveaux := v_nouveaux + 1;
    else
      v_doublons := v_doublons + 1;
    end if;
  end loop;

  update subventions.grant_search_runs
     set found_count = jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
         new_count = v_nouveaux,
         duplicate_count = v_doublons
   where id = p_run;

  return jsonb_build_object('found', jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
                            'new', v_nouveaux, 'duplicate', v_doublons);
end;
$$;

-- ------------------------------------------------------------
-- Agenda Google « Subventions » : un événement par date (clé
-- « ouverture:<subvention> », « fermeture:<subvention> »,
-- « reddition:<étape> »). Pas de clé étrangère : une subvention ou une
-- étape supprimée laisse sa ligne, et le Worker retire l'événement au
-- passage suivant. Écrite par le Worker seulement.
-- ------------------------------------------------------------
create table subventions.grant_calendar_events (
  event_key text primary key,
  grant_id uuid,
  calendar_id text,
  google_id text,
  content text,             -- événement écrit (JSON), pour savoir s'il a changé
  synced_at timestamptz,
  error text
);

create index on subventions.grant_calendar_events (grant_id);

-- Réglage : écrire ou non, identifiant de l'agenda, et date à partir de
-- laquelle les dates sont écrites (rien d'avant la mise en service).
insert into subventions.grant_settings (key, value)
values ('agenda', jsonb_build_object('actif', false, 'calendrier', '', 'depuis', '2026-10-01'))
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- Attribution salariale : une ligne = un employé sur une subvention.
-- Employé du référentiel (core.employes) ou nom libre (poste pas encore
-- pourvu). Salaire = montant, sinon taux horaire × heures ;
-- contribution de l'employeur vide = salaire − contribution de la
-- subvention (calculée dans l'app).
-- ------------------------------------------------------------
create table subventions.grant_salary_lines (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  employee_id uuid references core.employes(id) on delete restrict,
  free_name text check (free_name is null or (free_name = btrim(free_name) and free_name <> '')),
  hourly_rate numeric(8,2) check (hourly_rate >= 0),
  hours numeric(7,2) check (hours >= 0),
  salary_amount numeric(12,2) check (salary_amount >= 0),
  start_date date,
  end_date date,
  grant_contribution numeric(12,2) check (grant_contribution >= 0),
  employer_contribution numeric(12,2) check (employer_contribution >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((employee_id is null) <> (free_name is null)),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index on subventions.grant_salary_lines (grant_id);
create index on subventions.grant_salary_lines (employee_id);

create trigger trg_salary_lines_updated_at before update on subventions.grant_salary_lines
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant select, insert, update, delete on subventions.grant_proposals, subventions.grant_calendar_events,
  subventions.grant_salary_lines to authenticated, service_role;

alter table subventions.grant_proposals enable row level security;
create policy "Lire" on subventions.grant_proposals for select to authenticated using (subventions.a_acces());
-- Décider (decider_proposition) ; ajoutées par le Worker seulement.
create policy "Décider" on subventions.grant_proposals for update to authenticated
  using (subventions.a_acces()) with check (subventions.a_acces());

alter table subventions.grant_calendar_events enable row level security;
create policy "Lire" on subventions.grant_calendar_events for select to authenticated using (subventions.a_acces());

-- Salaires : mêmes droits que le module (grille d'accès).
alter table subventions.grant_salary_lines enable row level security;
create policy "Lire" on subventions.grant_salary_lines for select to authenticated using (subventions.a_acces());
create policy "Écrire" on subventions.grant_salary_lines for all to authenticated
  using (subventions.a_acces()) with check (subventions.a_acces());

revoke execute on function
  subventions.poser_annee_fiscale(), subventions.type_champ(text), subventions.meme_valeur(text, text, text),
  subventions.decider_proposition(uuid, boolean), subventions.debut_trimestre(timestamptz),
  subventions.retenues_a_verifier(uuid, timestamptz, int), subventions.prochaine_tache_trimestre(),
  subventions.appliquer_mise_a_jour(uuid, jsonb, uuid[])
  from public, anon;
grant execute on function
  subventions.type_champ(text), subventions.meme_valeur(text, text, text),
  subventions.decider_proposition(uuid, boolean), subventions.debut_trimestre(timestamptz)
  to authenticated, service_role;
grant execute on function
  subventions.retenues_a_verifier(uuid, timestamptz, int), subventions.prochaine_tache_trimestre(),
  subventions.appliquer_mise_a_jour(uuid, jsonb, uuid[])
  to service_role;

-- Temps réel pour les propositions et l'agenda (pas pour les salaires :
-- ni temps réel ni cache sur l'appareil, comme les Feuilles de temps).
alter publication supabase_realtime add table subventions.grant_proposals, subventions.grant_calendar_events;
