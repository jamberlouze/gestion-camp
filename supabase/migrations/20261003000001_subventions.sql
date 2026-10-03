-- ============================================================
-- subventions : « Vigie de subventions » du groupe (Base de Plein Air
-- Mont-Tremblant, Opikawa, Trembloc).
--
-- Chaque lundi, le Worker Cloudflare demande à Claude (recherche web)
-- les programmes pertinents, une entreprise à la fois ; la direction
-- valide ou rejette ; le feedback est résumé en règles apprises qui
-- guident les recherches suivantes. Le module suit ensuite ce qui a été
-- demandé, accordé et reçu, les heures investies et la reddition de
-- compte.
--
-- Noms de tables et de colonnes : repris tels quels de la feuille de
-- route (en anglais), pour que le JSON produit par Claude corresponde
-- directement aux colonnes. Fonctions en français, comme ailleurs.
--
-- Accès : administrateurs et direction seulement (core.est_direction()),
-- jamais les coordonnateurs. Le Worker écrit avec la clé secrète
-- (service_role), qui contourne la RLS.
-- ============================================================

create schema if not exists subventions;

-- ------------------------------------------------------------
-- Année fiscale : du 1er octobre au 30 septembre, nommée d'après l'année
-- où elle se termine (1er oct. 2025 au 30 sept. 2026 = 2026, affichée
-- « 2025-26 »).
-- ------------------------------------------------------------
create function subventions.fiscal_year(d date)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when extract(month from d) >= 10
              then extract(year from d)::int + 1
              else extract(year from d)::int end
$$;

-- Adresse comparable : sans protocole, « www. », ancre ni barre finale.
create function subventions.normaliser_url(u text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(u)), '^https?://(www\.)?', ''),
        '#.*$', ''),
      '/+$', ''),
    '')
$$;

-- ------------------------------------------------------------
-- Entreprises du groupe (recherche en silo)
-- ------------------------------------------------------------
create table subventions.grant_companies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,            -- ex. 'bpa', 'opikawa', 'trembloc'
  name text not null,
  specific_criteria text,               -- critères propres à l'entreprise
  legal_status text,                    -- ex. 'OBNL', 'entreprise privée'
  active boolean not null default true,
  sort_order int not null default 0     -- ordre des recherches du lundi
);

-- ------------------------------------------------------------
-- Types
--   nouveau   : trouvée par Claude (ou saisie), pas encore regardée
--   a_valider : regardée, en attente d'une information (question en note)
--   rejete    : écartée par la direction (feedback obligatoire)
--   en_cours  : on y va (demande à préparer ou déposée)
--   obtenu    : accordée
--   refuse    : demande déposée mais refusée par l'organisme (ajout à la
--               feuille de route : ni « rejetée » ni « expirée »)
--   expire    : date limite passée sans demande
-- ------------------------------------------------------------
create type subventions.grant_status as enum
  ('nouveau', 'a_valider', 'rejete', 'en_cours', 'obtenu', 'refuse', 'expire');

create type subventions.grant_type as enum
  ('salarial', 'immobilisation', 'formation', 'rd', 'exportation', 'marketing', 'autre');

create type subventions.reject_category as enum (
  'montant_trop_faible', 'criteres_non_respectes', 'deja_explore', 'hors_secteur',
  'echeance_trop_courte', 'non_pertinent_organisation', 'non_admissible', 'autre'
);

-- ------------------------------------------------------------
-- Mémoire : résumé condensé des règles apprises du feedback.
-- company_id = entreprise pour laquelle le résumé a été produit (il
-- distingue lui-même les règles communes et propres) ; null = commun.
-- ------------------------------------------------------------
create table subventions.grant_learned_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references subventions.grant_companies(id) on delete cascade,
  summary text not null,
  based_on_feedback_count int not null,
  generated_at timestamptz not null default now()
);

create index on subventions.grant_learned_rules (company_id, generated_at desc);

-- ------------------------------------------------------------
-- Journal des recherches (une ligne par entreprise et par recherche)
-- ------------------------------------------------------------
create table subventions.grant_search_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references subventions.grant_companies(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found_count int not null default 0,       -- programmes valides proposés par Claude
  new_count int not null default 0,         -- insérés
  duplicate_count int not null default 0,   -- déjà connus
  invalid_count int not null default 0,     -- éléments mal formés, ignorés
  memory_version_id uuid references subventions.grant_learned_rules(id) on delete set null,
  error text,
  trigger_source text not null default 'cron' check (trigger_source in ('cron', 'manuel')),
  model text,
  input_tokens int,
  output_tokens int,
  web_search_count int,
  raw_output text                           -- réponse brute (diagnostic d'une sortie mal formée)
);

create index on subventions.grant_search_runs (company_id, started_at desc);

-- ------------------------------------------------------------
-- Subventions
-- ------------------------------------------------------------
create table subventions.grants (
  id uuid primary key default gen_random_uuid(),
  program_name text not null check (btrim(program_name) <> ''),
  organisme text,
  description text,
  source_url text,
  grant_type subventions.grant_type not null default 'autre',
  potential_amount_min numeric(12,2),
  potential_amount_max numeric(12,2),
  open_date date,                       -- date d'ouverture de la demande
  deadline_date date,                   -- date limite
  status subventions.grant_status not null default 'nouveau',
  relevance_justification text,         -- pourquoi Claude pense que c'est pertinent
  discovered_at timestamptz not null default now(),
  -- Année fiscale de la découverte : un programme récurrent peut revenir
  -- une autre année (nouvelle édition), jamais deux fois la même année.
  discovered_fy int not null default subventions.fiscal_year(current_date),
  origin text not null default 'manuel' check (origin in ('claude', 'manuel')),
  search_run_id uuid references subventions.grant_search_runs(id) on delete set null,
  target_company_id uuid not null references subventions.grant_companies(id),   -- pour qui trouvée
  applicant_company_id uuid references subventions.grant_companies(id),         -- qui dépose
  -- Suivi financier à trois étapes
  amount_requested numeric(12,2),
  amount_granted numeric(12,2),
  amount_received numeric(12,2),
  requested_at date,
  granted_at date,
  received_at date,
  -- Récurrence
  program_key text,                     -- clé normalisée pour apparier d'une année à l'autre
  previous_grant_id uuid references subventions.grants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on subventions.grants (status);
create index on subventions.grants (target_company_id);
create index on subventions.grants (program_key);
create unique index grants_source_url_company_uq
  on subventions.grants (target_company_id, source_url, discovered_fy) where source_url is not null;

create trigger trg_grants_updated_at before update on subventions.grants
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Feedback humain (alimente la mémoire)
-- ------------------------------------------------------------
create table subventions.grant_feedback (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  decision text not null check (decision in ('valide', 'rejete')),
  reject_category subventions.reject_category,   -- obligatoire si decision = 'rejete'
  comment text,
  decided_by uuid not null default auth.uid() references auth.users(id),
  decided_at timestamptz not null default now(),
  check (decision = 'valide' or reject_category is not null)
);

create index on subventions.grant_feedback (grant_id);

-- Notes internes, visibles par tous les utilisateurs du module.
create table subventions.grant_notes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

create index on subventions.grant_notes (grant_id);

-- Heures investies, par personne.
create table subventions.grant_time_entries (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  hours numeric(5,2) not null check (hours > 0),
  entry_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index on subventions.grant_time_entries (grant_id);

-- Reddition de compte : étapes créées au cas par cas.
create table subventions.grant_reporting_steps (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  description text not null check (btrim(description) <> ''),
  due_date date,
  status text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'complete')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  template_source_step_id uuid references subventions.grant_reporting_steps(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index on subventions.grant_reporting_steps (grant_id, sort_order);

-- Réglages du module : critères communs, destinataires du courriel,
-- recherche hebdomadaire en marche ou en pause.
create table subventions.grant_settings (
  key text primary key,
  value jsonb not null
);

-- Courriel de rappel du lundi : une ligne par semaine (évite un doublon).
create table subventions.grant_digests (
  week_start date primary key,
  sent_at timestamptz not null default now(),
  recipients text[] not null default '{}',
  new_count int not null default 0,
  error text
);

-- ------------------------------------------------------------
-- Fonctions de l'interface (droits de la personne connectée : RLS)
-- ------------------------------------------------------------

-- Le Worker vérifie ainsi qu'un déclenchement manuel vient de la direction.
create function subventions.peut_utiliser()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.est_direction()
$$;

-- Valider (on y va : en_cours, avec l'entreprise qui dépose) ou rejeter
-- (catégorie obligatoire) : feedback et statut en une transaction.
create function subventions.decider(
  p_grant uuid,
  p_decision text,
  p_categorie subventions.reject_category default null,
  p_commentaire text default null,
  p_demandeur uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_decision not in ('valide', 'rejete') then
    raise exception 'Décision inconnue : %', p_decision;
  end if;
  update subventions.grants
     set status = case when p_decision = 'valide' then 'en_cours' else 'rejete' end::subventions.grant_status,
         applicant_company_id = case when p_decision = 'valide'
                                     then coalesce(p_demandeur, applicant_company_id, target_company_id)
                                     else applicant_company_id end
   where id = p_grant;
  if not found then
    raise exception 'Subvention introuvable.';
  end if;
  insert into subventions.grant_feedback (grant_id, decision, reject_category, comment)
  values (p_grant, p_decision,
          case when p_decision = 'rejete' then p_categorie end,
          nullif(btrim(p_commentaire), ''));
end;
$$;

-- Reprend les étapes de reddition de compte d'une autre subvention
-- (programme récurrent) : ajoutées à la suite, « à faire », échéances
-- décalées d'autant d'années fiscales que les deux subventions.
create function subventions.copier_etapes(p_source uuid, p_cible uuid)
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
  select greatest(
           coalesce(subventions.fiscal_year(coalesce(c.granted_at, c.deadline_date)), c.discovered_fy)
         - coalesce(subventions.fiscal_year(coalesce(s.granted_at, s.deadline_date)), s.discovered_fy), 0)
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
-- Fonctions du Worker (clé secrète seulement)
-- ------------------------------------------------------------

-- Prochaine entreprise à chercher cette semaine (lundi, une par appel du
-- cron) ; null quand toutes sont faites. Une recherche restée ouverte plus
-- de 20 minutes (Worker coupé) est d'abord fermée en erreur.
create function subventions.prochaine_entreprise_hebdo()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
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
        where r.company_id = c.id and r.trigger_source = 'cron'
          and r.started_at >= date_trunc('week', now()))
   order by c.sort_order, c.name
   limit 1;
  return v_id;
end;
$$;

-- Vrai quand chaque entreprise active a sa recherche de la semaine,
-- terminée (avec ou sans erreur).
create function subventions.semaine_terminee()
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from subventions.grant_companies c
     where c.active
       and not exists (
         select 1 from subventions.grant_search_runs r
          where r.company_id = c.id and r.trigger_source = 'cron'
            and r.started_at >= date_trunc('week', now())
            and r.finished_at is not null))
$$;

-- Dédoublonne et insère les programmes trouvés par une recherche.
-- Un programme est déjà connu pour l'entreprise s'il a la même adresse
-- (normalisée) ou la même program_key qu'une subvention :
--   - nouvelle, en attente, en cours ou rejetée (jamais reproposée) ;
--   - ou trouvée la même année fiscale.
-- Sinon (obtenue, refusée ou expirée une année précédente), c'est une
-- nouvelle édition d'un programme récurrent : insérée et reliée à la
-- précédente (previous_grant_id).
create function subventions.inserer_resultats(p_run uuid, p_items jsonb)
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
      relevance_justification, program_key, previous_grant_id,
      origin, search_run_id, target_company_id, discovered_fy)
    values (
      v_item->>'program_name', v_item->>'organisme', v_item->>'description', v_url,
      coalesce(v_item->>'grant_type', 'autre')::subventions.grant_type,
      (v_item->>'potential_amount_min')::numeric, (v_item->>'potential_amount_max')::numeric,
      (v_item->>'open_date')::date, (v_item->>'deadline_date')::date,
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

-- Feedback accumulé pour la mémoire : décisions de tout le groupe, la
-- plus récente d'abord (300 au plus), avec l'entreprise concernée.
create function subventions.feedback_pour_memoire()
returns table (
  decision text, reject_category text, comment text, decided_at timestamptz,
  program_name text, organisme text, grant_type text, source_url text,
  potential_amount_max numeric, company_id uuid, company_name text)
language sql
stable
set search_path = ''
as $$
  select f.decision, f.reject_category::text, f.comment, f.decided_at,
         g.program_name, g.organisme, g.grant_type::text, g.source_url,
         g.potential_amount_max, c.id, c.name
    from subventions.grant_feedback f
    join subventions.grants g on g.id = f.grant_id
    join subventions.grant_companies c on c.id = g.target_company_id
   order by f.decided_at desc
   limit 300
$$;

-- Subventions nouvelles ou en attente dont la date limite est passée.
create function subventions.expirer_echues()
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int;
begin
  update subventions.grants
     set status = 'expire'
   where status in ('nouveau', 'a_valider')
     and deadline_date < (now() at time zone 'America/Toronto')::date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Destinataires du courriel du lundi : la liste des réglages, sinon tous
-- les administrateurs et membres de la direction actifs.
create function subventions.destinataires()
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_liste text[];
begin
  select array_agg(distinct btrim(a)) into v_liste
    from subventions.grant_settings s,
         regexp_split_to_table(coalesce(s.value #>> '{}', ''), '[,;\s]+') a
   where s.key = 'destinataires' and btrim(a) like '%@%';
  if coalesce(array_length(v_liste, 1), 0) > 0 then
    return v_liste;
  end if;
  select coalesce(array_agg(p.courriel order by p.courriel), '{}') into v_liste
    from core.profils p
   where p.actif and p.role in ('admin', 'direction');
  return v_liste;
end;
$$;

-- ------------------------------------------------------------
-- Droits et RLS : direction et administrateurs seulement
-- ------------------------------------------------------------
grant usage on schema subventions to authenticated, service_role;
grant select, insert, update, delete on all tables in schema subventions to authenticated, service_role;
revoke execute on all functions in schema subventions from public, anon;
grant execute on function
  subventions.fiscal_year(date), subventions.normaliser_url(text), subventions.peut_utiliser(),
  subventions.decider(uuid, text, subventions.reject_category, text, uuid),
  subventions.copier_etapes(uuid, uuid)
  to authenticated, service_role;
grant execute on function
  subventions.prochaine_entreprise_hebdo(), subventions.semaine_terminee(),
  subventions.inserer_resultats(uuid, jsonb), subventions.feedback_pour_memoire(),
  subventions.expirer_echues(), subventions.destinataires()
  to service_role;

do $$
declare t text;
begin
  -- Lecture et écriture par la direction.
  foreach t in array array['grant_companies', 'grants', 'grant_reporting_steps', 'grant_settings'] loop
    execute format('alter table subventions.%I enable row level security', t);
    execute format(
      'create policy "Direction lit" on subventions.%I for select to authenticated using (core.est_direction())', t);
    execute format(
      'create policy "Direction écrit" on subventions.%I for all to authenticated
         using (core.est_direction()) with check (core.est_direction())', t);
  end loop;
  -- Écrites par le Worker seulement : lues par la direction.
  foreach t in array array['grant_search_runs', 'grant_learned_rules', 'grant_digests'] loop
    execute format('alter table subventions.%I enable row level security', t);
    execute format(
      'create policy "Direction lit" on subventions.%I for select to authenticated using (core.est_direction())', t);
  end loop;
end $$;

-- Feedback : chacun enregistre (et peut retirer) ses propres décisions.
alter table subventions.grant_feedback enable row level security;
create policy "Direction lit" on subventions.grant_feedback for select to authenticated
  using (core.est_direction());
create policy "Ses décisions" on subventions.grant_feedback for insert to authenticated
  with check (core.est_direction() and decided_by = auth.uid());
create policy "Retirer ses décisions" on subventions.grant_feedback for delete to authenticated
  using (core.est_direction() and decided_by = auth.uid());

-- Notes et heures : lues par tous les utilisateurs du module, modifiées
-- ou supprimées seulement par leur auteur.
alter table subventions.grant_notes enable row level security;
create policy "Direction lit" on subventions.grant_notes for select to authenticated
  using (core.est_direction());
create policy "Ses notes" on subventions.grant_notes for insert to authenticated
  with check (core.est_direction() and author_id = auth.uid());
create policy "Modifier ses notes" on subventions.grant_notes for update to authenticated
  using (core.est_direction() and author_id = auth.uid())
  with check (core.est_direction() and author_id = auth.uid());
create policy "Supprimer ses notes" on subventions.grant_notes for delete to authenticated
  using (core.est_direction() and author_id = auth.uid());

alter table subventions.grant_time_entries enable row level security;
create policy "Direction lit" on subventions.grant_time_entries for select to authenticated
  using (core.est_direction());
create policy "Ses heures" on subventions.grant_time_entries for insert to authenticated
  with check (core.est_direction() and user_id = auth.uid());
create policy "Modifier ses heures" on subventions.grant_time_entries for update to authenticated
  using (core.est_direction() and user_id = auth.uid())
  with check (core.est_direction() and user_id = auth.uid());
create policy "Supprimer ses heures" on subventions.grant_time_entries for delete to authenticated
  using (core.est_direction() and user_id = auth.uid());

alter publication supabase_realtime add table
  subventions.grant_companies, subventions.grants, subventions.grant_feedback,
  subventions.grant_notes, subventions.grant_time_entries, subventions.grant_reporting_steps,
  subventions.grant_search_runs, subventions.grant_learned_rules, subventions.grant_settings;

-- ------------------------------------------------------------
-- Données de départ (critères : brouillons à compléter dans Réglages)
-- ------------------------------------------------------------
insert into subventions.grant_companies (slug, name, legal_status, sort_order, specific_criteria) values
  ('bpa', 'Base de Plein Air Mont-Tremblant', 'OBNL', 1,
   'Organisme à but non lucratif : camp de vacances et base de plein air à Mont-Tremblant (Laurentides). '
   'Camps d''été pour jeunes, séjours scolaires et groupes hors saison, activités de plein air '
   '(nautique, escalade, randonnée). Embauche saisonnière importante (animateurs, sauveteurs, cuisine, '
   'entretien), surtout des étudiants et des jeunes. Admissible aux programmes réservés aux OBNL et aux '
   'programmes de loisir, de sport, de plein air, d''accessibilité aux camps et d''infrastructures récréatives.'),
  ('opikawa', 'Opikawa', null, 2,
   'Séjours d''immersion française pour une clientèle surtout hors Québec (autres provinces et '
   'international) : tourisme international, exportation de services éducatifs, promotion à l''étranger, '
   'formation linguistique et culturelle. Statut juridique à préciser.'),
  ('trembloc', 'Trembloc', null, 3,
   'Site d''escalade de bloc extérieur à Mont-Tremblant : tourisme de plein air et d''aventure, loisir, '
   'aménagement et sécurité de sites naturels, accessibilité, développement touristique régional '
   '(Laurentides). Statut juridique à préciser.');

insert into subventions.grant_settings (key, value) values
  ('criteres_communs', to_jsonb(
   'Contexte du groupe : Base de Plein Air Mont-Tremblant (OBNL), Opikawa (clients hors Québec, '
   'immersion française), Trembloc (bloc extérieur). Secteurs : vacances et tourisme, loisirs, '
   'tourisme international / exportation, développement logiciel interne. Exclure le secteur manufacturier.' || E'\n\n' ||
   'Priorité absolue : les subventions salariales (embauche, main-d''œuvre, formation, jeunes, '
   'emplois d''été). Ratisse large : ne manque rien, quitte à proposer des programmes marginaux.'::text)),
  ('destinataires', to_jsonb(''::text)),
  ('recherche_active', 'true'::jsonb);
