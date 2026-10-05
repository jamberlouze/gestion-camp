-- ============================================================
-- calendrier : « Calendrier des opérations ». Remplace le Google
-- Calendar et le Google Sheets recopiés à la main.
--
-- Séjours de groupe : copie en lecture seule de la base Airtable
-- « Réservation Groupes » (synchro à sens unique par le Worker, avec la
-- clé secrète ; personne n'écrit dans `sejours` depuis l'app).
-- Événements hors séjour : ponctuels ou récurrents (RRULE simple).
-- Présences par secteur :
--   cuisine   : l'horaire du personnel du module Cuisine (commande.quarts),
--               lu tel quel — pas de deuxième horaire de cuisine ;
--   animation : feuille de route d'activités (affectations_animation) ;
--   direction et terrain : présence simple du jour + note (presences_simples).
-- Vue commune : calendrier.v_presence_jour (qui travaille, quel secteur,
-- fait quoi ; jamais d'heures).
-- Rien n'est effacé (deleted_at, pas de politique DELETE) et chaque
-- changement va dans calendrier.journal (déclencheur).
-- ============================================================

create schema if not exists calendrier;

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','vigie','calendrier'));

-- ------------------------------------------------------------
-- Auteur et heure de chaque modification (posés par la base, jamais
-- par le client).
-- ------------------------------------------------------------
create or replace function calendrier.auteur()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Personnel (direction, animation, terrain). L'équipe de cuisine reste
-- celle du module Cuisine (commande.personnel).
-- ------------------------------------------------------------
create table calendrier.personnel (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  -- null : secteur à préciser
  secteur_principal text check (secteur_principal in ('direction','animation','terrain')),
  actif boolean not null default true,
  ordre integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ------------------------------------------------------------
-- Séjours (Airtable → app)
-- ------------------------------------------------------------
create table calendrier.sejours (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique not null,
  numero text,                         -- « 26-G-54 »
  nom_groupe text not null,            -- client
  type_sejour text,                    -- Classe nature, Accueil de groupe…
  etat text,                           -- état de la réservation (Confirmée, Closed lost…)
  date_arrivee date not null,
  date_depart date not null,
  heure_arrivee time,
  heure_depart time,
  section_batiment text,               -- hébergement(s) : « Cèdres haut, Cèdres bas »
  batiment text,                       -- code(s) du bâtiment : « PP », « VF »
  nb_participants integer,
  nb_animateurs integer,               -- animateurs requis (Airtable)
  avec_animation boolean not null default false,
  avec_repas boolean not null default false,
  notes text,                          -- commentaires / notes internes
  raw jsonb,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_depart >= date_arrivee)
);

create index sejours_dates_idx on calendrier.sejours (date_arrivee, date_depart);

-- Journal des synchronisations (dernier passage affiché dans Réglages).
create table calendrier.synchros (
  id bigserial primary key,
  debut timestamptz not null default now(),
  source text not null,                -- cron, app, airtable
  recus integer,
  ajoutes integer,
  modifies integer,
  retires integer,
  erreur text
);

-- Upsert de tous les séjours lus dans Airtable, en une transaction.
-- Un séjour absent de la liste reçoit deleted_at (et revient s'il
-- réapparaît). Une ligne n'est réécrite que si quelque chose a changé
-- (pas de bruit dans le journal). Réservée à la clé secrète du Worker.
create or replace function calendrier.synchroniser_sejours(p_sejours jsonb, p_source text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ajoutes integer;
  v_modifies integer;
  v_retires integer;
  v_recus integer := jsonb_array_length(p_sejours);
begin
  -- Garde-fou : une liste vide viendrait d'une erreur (jeton, filtre),
  -- pas d'une base Airtable vidée d'un coup.
  if v_recus = 0 and exists (select 1 from calendrier.sejours where deleted_at is null) then
    raise exception 'Airtable n''a renvoyé aucun séjour : rien n''est retiré.';
  end if;

  -- Deux appels dans la même transaction : la table du premier existe encore.
  drop table if exists pg_temp.entrants;
  create temporary table entrants on commit drop as
  select * from jsonb_to_recordset(p_sejours) as s(
    airtable_record_id text, numero text, nom_groupe text, type_sejour text, etat text,
    date_arrivee date, date_depart date, heure_arrivee time, heure_depart time,
    section_batiment text, batiment text, nb_participants integer, nb_animateurs integer,
    avec_animation boolean, avec_repas boolean, notes text, raw jsonb
  );

  with maj as (
    update calendrier.sejours s set
      numero = e.numero, nom_groupe = e.nom_groupe, type_sejour = e.type_sejour, etat = e.etat,
      date_arrivee = e.date_arrivee, date_depart = e.date_depart,
      heure_arrivee = e.heure_arrivee, heure_depart = e.heure_depart,
      section_batiment = e.section_batiment, batiment = e.batiment,
      nb_participants = e.nb_participants, nb_animateurs = e.nb_animateurs,
      avec_animation = coalesce(e.avec_animation, false), avec_repas = coalesce(e.avec_repas, false),
      notes = e.notes, raw = e.raw, synced_at = now(), deleted_at = null
    from entrants e
    where s.airtable_record_id = e.airtable_record_id
      and (s.numero, s.nom_groupe, s.type_sejour, s.etat, s.date_arrivee, s.date_depart,
           s.heure_arrivee, s.heure_depart, s.section_batiment, s.batiment, s.nb_participants,
           s.nb_animateurs, s.avec_animation, s.avec_repas, s.notes, s.raw, s.deleted_at)
        is distinct from
          (e.numero, e.nom_groupe, e.type_sejour, e.etat, e.date_arrivee, e.date_depart,
           e.heure_arrivee, e.heure_depart, e.section_batiment, e.batiment, e.nb_participants,
           e.nb_animateurs, coalesce(e.avec_animation, false), coalesce(e.avec_repas, false), e.notes, e.raw, null::timestamptz)
    returning 1
  )
  select count(*) into v_modifies from maj;

  with ins as (
    insert into calendrier.sejours (
      airtable_record_id, numero, nom_groupe, type_sejour, etat, date_arrivee, date_depart,
      heure_arrivee, heure_depart, section_batiment, batiment, nb_participants, nb_animateurs,
      avec_animation, avec_repas, notes, raw)
    select e.airtable_record_id, e.numero, e.nom_groupe, e.type_sejour, e.etat, e.date_arrivee, e.date_depart,
      e.heure_arrivee, e.heure_depart, e.section_batiment, e.batiment, e.nb_participants, e.nb_animateurs,
      coalesce(e.avec_animation, false), coalesce(e.avec_repas, false), e.notes, e.raw
    from entrants e
    where not exists (select 1 from calendrier.sejours s where s.airtable_record_id = e.airtable_record_id)
    returning 1
  )
  select count(*) into v_ajoutes from ins;

  with ret as (
    update calendrier.sejours s set deleted_at = now()
    where s.deleted_at is null
      and not exists (select 1 from entrants e where e.airtable_record_id = s.airtable_record_id)
    returning 1
  )
  select count(*) into v_retires from ret;

  insert into calendrier.synchros (source, recus, ajoutes, modifies, retires)
  values (coalesce(p_source, 'cron'), v_recus, v_ajoutes, v_modifies, v_retires);

  return jsonb_build_object('recus', v_recus, 'ajoutes', v_ajoutes, 'modifies', v_modifies, 'retires', v_retires);
end;
$$;

-- Échec d'une synchro (Airtable injoignable…) : gardé pour Réglages.
create or replace function calendrier.noter_echec(p_source text, p_erreur text)
returns void
language sql
set search_path = ''
as $$
  insert into calendrier.synchros (source, erreur) values (coalesce(p_source, 'cron'), left(p_erreur, 2000));
$$;

-- Le bouton « Synchroniser maintenant » passe par le Worker avec le jeton
-- de la personne : la base dit si elle a droit au module.
create or replace function calendrier.peut_synchroniser()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.peut_ecrire('calendrier')
$$;

-- ------------------------------------------------------------
-- Événements hors séjour (inspections d'autobus, livraisons,
-- fournisseurs, travaux…)
-- ------------------------------------------------------------
create table calendrier.evenements (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (btrim(titre) <> ''),
  type text not null default 'autre' check (type in ('inspection','livraison','fournisseur','travaux','autre')),
  date_debut date not null,
  date_fin date,                       -- événement de plusieurs jours (ponctuel)
  heure_debut time,
  heure_fin time,
  -- RRULE (FREQ=WEEKLY;BYDAY=TU,TH, FREQ=DAILY, FREQ=MONTHLY ; INTERVAL
  -- facultatif) ; null si ponctuel. Lue par recurrence.ts.
  regle_recurrence text,
  fin_recurrence date,                 -- dernière date possible (null : sans fin)
  exceptions date[] not null default '{}', -- occurrences retirées une à une
  lieu text,
  notes text,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_fin is null or date_fin >= date_debut),
  check (fin_recurrence is null or fin_recurrence >= date_debut)
);

-- ------------------------------------------------------------
-- Animation : feuille de route (pas de quart)
-- ------------------------------------------------------------
create table calendrier.affectations_animation (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references calendrier.personnel(id),
  date date not null,
  sejour_id uuid references calendrier.sejours(id),
  activite text,
  heure_debut time,                    -- facultatif
  heure_fin time,                      -- facultatif
  lieu text,
  preparation text,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index affectations_date_idx on calendrier.affectations_animation (date);

-- ------------------------------------------------------------
-- Direction et terrain : présence du jour + note courte
-- ------------------------------------------------------------
create table calendrier.presences_simples (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references calendrier.personnel(id),
  date date not null,
  secteur text not null check (secteur in ('direction','terrain')),
  description text,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Une seule présence active par personne, jour et secteur (une case
-- décochée garde sa ligne, avec deleted_at, et la recocher la réactive).
create unique index presences_unique_idx on calendrier.presences_simples (personnel_id, date, secteur);
create index presences_date_idx on calendrier.presences_simples (date);

-- ------------------------------------------------------------
-- Vue commune : qui travaille ce jour-là, dans quel secteur, et fait
-- quoi. Pas d'heures. security_invoker : chaque partie suit la RLS de sa
-- table (la cuisine n'apparaît qu'à qui peut lire le module Cuisine).
-- ------------------------------------------------------------

-- « OFF », « Vacance(s) », « - »… ne sont pas des journées travaillées
-- (mêmes règles que travaille() dans modules/commande/quarts.ts).
create or replace function calendrier.normaliser(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(btrim(t)), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'),
    's$', '')
$$;

create or replace function calendrier.quart_travaille(p_texte text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_texte !~ '^[\s\-–—]*$'
    and not exists (
      select 1
      from commande.parametres p,
           jsonb_array_elements_text(coalesce(p.valeur -> 'statuts', '[]'::jsonb)) s
      where p.cle = 'horaire_cuisine'
        and calendrier.normaliser(s) = calendrier.normaliser(p_texte)
    )
$$;

create view calendrier.v_presence_jour with (security_invoker = true) as
  select q.personne_id as personnel_id, p.nom, q.jour as date, 'cuisine'::text as secteur,
         coalesce(f.nom, 'Cuisine') as description
  from commande.quarts q
  join commande.personnel p on p.id = q.personne_id
  left join commande.fonctions f on f.id = p.fonction_id
  where calendrier.quart_travaille(q.texte)
  union all
  select a.personnel_id, p.nom, a.date, 'animation',
         string_agg(distinct coalesce(nullif(btrim(a.activite), ''), 'Animation')
                    || coalesce(' (' || s.nom_groupe || ')', ''), ', ')
  from calendrier.affectations_animation a
  join calendrier.personnel p on p.id = a.personnel_id
  left join calendrier.sejours s on s.id = a.sejour_id
  where a.deleted_at is null
  group by a.personnel_id, p.nom, a.date
  union all
  select ps.personnel_id, p.nom, ps.date, ps.secteur, coalesce(nullif(btrim(ps.description), ''), '')
  from calendrier.presences_simples ps
  join calendrier.personnel p on p.id = ps.personnel_id
  where ps.deleted_at is null;

-- ------------------------------------------------------------
-- Journal des modifications (lecture seule ; écrit par déclencheur)
-- ------------------------------------------------------------
create table calendrier.journal (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  -- ajout, modification, suppression (deleted_at posé), restauration
  action text not null,
  ancien jsonb,
  nouveau jsonb,
  modifie_par uuid,
  -- Nom au moment du changement : lisible même par qui ne voit pas les
  -- profils des autres. Null + table sejours : synchro Airtable.
  modifie_par_nom text,
  modifie_le timestamptz not null default now()
);

create index journal_date_idx on calendrier.journal (modifie_le desc);
create index journal_ligne_idx on calendrier.journal (table_name, record_id);

create or replace function calendrier.journaliser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_ancien jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nouveau jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_op = 'INSERT' then
    v_action := 'ajout';
  elsif tg_op = 'DELETE' then
    v_action := 'effacement';
  elsif v_ancien ->> 'deleted_at' is null and v_nouveau ->> 'deleted_at' is not null then
    v_action := 'suppression';
  elsif v_ancien ->> 'deleted_at' is not null and v_nouveau ->> 'deleted_at' is null then
    v_action := 'restauration';
  else
    v_action := 'modification';
    -- Rien de visible n'a changé (seulement l'heure de synchro) : on ne note pas.
    if (v_ancien - array['updated_at','updated_by','synced_at']) = (v_nouveau - array['updated_at','updated_by','synced_at']) then
      return new;
    end if;
  end if;

  insert into calendrier.journal (table_name, record_id, action, ancien, nouveau, modifie_par, modifie_par_nom)
  values (
    tg_table_name,
    coalesce(v_nouveau ->> 'id', v_ancien ->> 'id')::uuid,
    v_action,
    v_ancien,
    v_nouveau,
    auth.uid(),
    (select coalesce(nullif(btrim(p.nom), ''), p.courriel) from core.profils p where p.id = auth.uid())
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['personnel','evenements','affectations_animation','presences_simples'] loop
    execute format('create trigger trg_%s_auteur before insert or update on calendrier.%I for each row execute function calendrier.auteur()', t, t);
  end loop;
  foreach t in array array['personnel','sejours','evenements','affectations_animation','presences_simples'] loop
    execute format('create trigger trg_%s_journal after insert or update or delete on calendrier.%I for each row execute function calendrier.journaliser()', t, t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Droits, RLS et temps réel
-- ------------------------------------------------------------
grant usage on schema calendrier to authenticated, service_role;
grant select on all tables in schema calendrier to authenticated, service_role;
grant insert, update on calendrier.personnel, calendrier.evenements,
  calendrier.affectations_animation, calendrier.presences_simples to authenticated;
grant insert, update, delete on all tables in schema calendrier to service_role;
grant usage on all sequences in schema calendrier to service_role;
revoke execute on all functions in schema calendrier from public, anon;
grant execute on function calendrier.peut_synchroniser() to authenticated, service_role;
grant execute on function calendrier.normaliser(text), calendrier.quart_travaille(text) to authenticated, service_role;
grant execute on function calendrier.synchroniser_sejours(jsonb, text), calendrier.noter_echec(text, text) to service_role;

-- Tables modifiables : lecture et écriture selon l'accès au module, jamais
-- d'effacement (pas de politique DELETE : on pose deleted_at).
do $$
declare
  t text;
begin
  foreach t in array array['personnel','evenements','affectations_animation','presences_simples'] loop
    execute format('alter table calendrier.%I enable row level security', t);
    execute format('create policy "Lire" on calendrier.%I for select to authenticated using (core.peut_lire(''calendrier''))', t);
    execute format('create policy "Ajouter" on calendrier.%I for insert to authenticated with check (core.peut_ecrire(''calendrier''))', t);
    execute format('create policy "Modifier" on calendrier.%I for update to authenticated using (core.peut_ecrire(''calendrier'')) with check (core.peut_ecrire(''calendrier''))', t);
  end loop;
  -- Lecture seule dans l'app : séjours (écrits par le Worker), journal
  -- (déclencheur), synchros (Worker).
  foreach t in array array['sejours','journal','synchros'] loop
    execute format('alter table calendrier.%I enable row level security', t);
    execute format('create policy "Lire" on calendrier.%I for select to authenticated using (core.peut_lire(''calendrier''))', t);
  end loop;
  foreach t in array array['personnel','sejours','evenements','affectations_animation','presences_simples','synchros'] loop
    execute format('alter publication supabase_realtime add table calendrier.%I', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Personnel de départ (responsables de Mastertimeline) : secteur à
-- préciser dans Réglages. L'équipe de cuisine vient du module Cuisine.
-- ------------------------------------------------------------
insert into calendrier.personnel (nom, ordre)
select nom, row_number() over (order by nom)
from mastertimeline.responsables
where actif;
