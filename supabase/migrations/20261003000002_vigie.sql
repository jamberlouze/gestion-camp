-- ============================================================
-- vigie : vigie des camps compétiteurs.
--
-- Suit les camps (prix, programmes, activités) pour détecter les
-- changements de prix (priorité) et repérer les activités offertes
-- ailleurs mais pas à la Base de Plein Air Mont-Tremblant (BPA).
--
-- Le travail de recherche est fait par l'API Claude (fonction Edge
-- `vigie`, voir supabase/functions/vigie). Chaque appel à Claude est
-- une ligne de `requetes_ia` (file d'attente) : la fonction les envoie
-- en lot (Message Batches) et lit les résultats plus tard. Rien de ce
-- que Claude trouve n'est appliqué directement : les changements vont
-- dans `changements` et attendent une validation dans l'app.
-- ============================================================

create schema if not exists vigie;

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','vigie'));

-- ------------------------------------------------------------
-- Journal des recherches (mensuelle, découverte, documentation)
-- ------------------------------------------------------------
create table vigie.recherches (
  id uuid primary key default gen_random_uuid(),
  -- mensuelle     : vérification des camps déjà suivis (le 1er du mois)
  -- decouverte    : nouveaux camps proposés (passe 1)
  -- documentation : recherche approfondie des camps retenus (passe 2)
  type text not null check (type in ('mensuelle','decouverte','documentation')),
  statut text not null default 'en_cours' check (statut in ('en_cours','terminee','erreur')),
  debut timestamptz not null default now(),
  fin timestamptz,
  camps_verifies integer not null default 0,
  changements_detectes integer not null default 0,
  changements_prix integer not null default 0,
  camps_proposes integer not null default 0,
  erreurs integer not null default 0,
  cout_usd numeric(10,2) not null default 0,
  resume text,
  rapport_html text,
  courriel_envoye_le timestamptz,
  erreur text,
  lance_par uuid references core.profils(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Camps
-- ------------------------------------------------------------
create table vigie.camps (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  province text,
  ville text,
  region text,
  -- camp_vacances, camp_familial, camp_jour, besoins_particuliers,
  -- classe_nature, accueil_groupe
  types text[] not null default '{}',
  -- tente, dortoir, chalet, chambre, autre
  hebergement text[] not null default '{}',
  site_web text,
  site_web_score numeric(3,1) check (site_web_score between 0 and 10),
  facebook text,
  facebook_score numeric(3,1) check (facebook_score between 0 and 10),
  instagram text,
  instagram_score numeric(3,1) check (instagram_score between 0 and 10),
  tiktok text,
  tiktok_score numeric(3,1) check (tiktok_score between 0 and 10),
  membre_acq boolean not null default false,
  -- null = pas encore catégorisé
  categorie text check (categorie in ('competiteur_direct','reference')),
  -- Un camp exclu reste dans la table pour ne jamais être reproposé.
  statut_inclusion text not null default 'propose' check (statut_inclusion in ('propose','inclus','exclu')),
  origine text not null default 'decouverte' check (origine in ('import','decouverte','manuel')),
  lien_source text,
  date_decouverte date not null default current_date,
  recherche_id uuid references vigie.recherches(id) on delete set null,
  -- Passe 1 (tri grossier) : ce que Claude en dit.
  resume text,
  pertinence text,
  notes text,
  -- Coups de cœur, idées de génie, inspiration (repris du Sheets).
  idees text,
  documente_le timestamptz,
  verifie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index camps_nom_unique on vigie.camps (lower(nom));

-- ------------------------------------------------------------
-- Programmes (un camp peut en avoir plusieurs ; pas de sous-prix)
-- ------------------------------------------------------------
create table vigie.programmes (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references vigie.camps(id) on delete cascade,
  nom text not null,
  description text,
  duree_jours integer check (duree_jours > 0),
  duree_nuits integer check (duree_nuits >= 0),
  prix numeric(10,2) check (prix >= 0),
  -- KPI de comparaison malgré les durées différentes.
  prix_par_nuit numeric(10,2) generated always as (round(prix / nullif(duree_nuits, 0), 2)) stored,
  prix_par_jour numeric(10,2) generated always as (round(prix / nullif(duree_jours, 0), 2)) stored,
  -- Saison ou année du prix (« 2025 », « été 2026 »…).
  annee text,
  notes text,
  source_url text,
  actif boolean not null default true,
  verifie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programmes_camp on vigie.programmes (camp_id);

-- ------------------------------------------------------------
-- Activités : une liste candidate COMMUNE (pas une fiche par camp)
-- ------------------------------------------------------------
create table vigie.activites (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  saisons text[] not null default '{}'
    check (saisons <@ array['hiver','printemps','ete','automne']::text[]),
  offert_bpa boolean not null default false,
  -- Estimés de Claude, en dollars canadiens.
  cout_implantation numeric(12,2),
  cout_operation_annuel numeric(12,2),
  hypotheses_couts text,
  couts_estimes_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index activites_nom_unique on vigie.activites (lower(nom));

create table vigie.camps_activites (
  camp_id uuid not null references vigie.camps(id) on delete cascade,
  activite_id uuid not null references vigie.activites(id) on delete cascade,
  -- import (Sheets), site, photo, reseaux (réseaux sociaux), manuel
  source text not null default 'manuel',
  note text,
  created_at timestamptz not null default now(),
  primary key (camp_id, activite_id)
);

create index camps_activites_activite on vigie.camps_activites (activite_id);

-- Une photo par camp source et par activité (pour comparer les interprétations).
create table vigie.photos (
  id uuid primary key default gen_random_uuid(),
  activite_id uuid not null references vigie.activites(id) on delete cascade,
  camp_id uuid not null references vigie.camps(id) on delete cascade,
  -- Copie dans le stockage (seau vigie-photos) ; url = adresse d'origine.
  chemin text,
  url text,
  page_source text,
  legende text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activite_id, camp_id)
);

-- Maquette 3D simple : objets de base (boîtes, cylindres…) en mètres.
-- Sert à visualiser l'activité et à illustrer une implantation à la BPA.
create table vigie.maquettes (
  id uuid primary key default gen_random_uuid(),
  activite_id uuid not null unique references vigie.activites(id) on delete cascade,
  scene jsonb not null,
  description text,
  genere_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Changements détectés, à valider dans l'app
-- ------------------------------------------------------------
create table vigie.changements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('prix','nouveau_programme','nouvelle_activite')),
  camp_id uuid not null references vigie.camps(id) on delete cascade,
  programme_id uuid references vigie.programmes(id) on delete cascade,
  activite_id uuid references vigie.activites(id) on delete cascade,
  ancienne_valeur text,
  nouvelle_valeur text,
  -- Ce qui sera appliqué à la validation (voir vigie.valider_changement).
  details jsonb not null default '{}',
  source_url text,
  statut text not null default 'a_valider' check (statut in ('a_valider','valide','rejete')),
  detecte_le timestamptz not null default now(),
  valide_le timestamptz,
  valide_par uuid references core.profils(id) on delete set null,
  recherche_id uuid references vigie.recherches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index changements_statut on vigie.changements (statut, type);

-- ------------------------------------------------------------
-- File d'attente des appels à Claude
-- ------------------------------------------------------------
create table vigie.requetes_ia (
  id uuid primary key default gen_random_uuid(),
  recherche_id uuid references vigie.recherches(id) on delete cascade,
  -- verification    : un camp suivi (mensuelle)
  -- photos          : interprétation des photos trouvées pour un camp
  -- decouverte      : propose de nouveaux camps (passe 1)
  -- documentation   : recherche approfondie d'un camp retenu (passe 2)
  -- couts           : estimé de coûts d'une activité
  -- maquette        : maquette 3D d'une activité
  type text not null check (type in ('verification','photos','decouverte','documentation','couts','maquette')),
  camp_id uuid references vigie.camps(id) on delete cascade,
  activite_id uuid references vigie.activites(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente','soumise','terminee','erreur')),
  -- Données propres au type (adresses de photos, conversation à reprendre
  -- après une pause du serveur…).
  donnees jsonb not null default '{}',
  lot_id text,
  tentatives integer not null default 0,
  cout_usd numeric(10,4) not null default 0,
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requetes_ia_statut on vigie.requetes_ia (statut);
create index requetes_ia_recherche on vigie.requetes_ia (recherche_id);

-- ------------------------------------------------------------
-- Réglages (clé 'reglages')
-- ------------------------------------------------------------
create table vigie.parametres (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now()
);

insert into vigie.parametres (cle, valeur) values ('reglages', jsonb_build_object(
  'modele', 'claude-opus-5-5',
  'effort', 'medium',
  'destinataires', jsonb_build_array('maxime@camptremblant.com'),
  'url_app', 'https://gestion-camp.maxime-0f5.workers.dev/vigie',
  'frequence_decouverte_mois', 3,
  'prochaine_decouverte', '2027-01-01',
  'mensuelle_active', true,
  'decouverte_active', true,
  -- Ajustements manuels du prompt de recherche (pas de mémoire auto-apprenante).
  'consignes', ''
));

-- ------------------------------------------------------------
-- Horodatage
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recherches','camps','programmes','activites','photos','maquettes','changements','requetes_ia','parametres'] loop
    execute format('create trigger trg_%s_updated_at before update on vigie.%I for each row execute function core.maj_updated_at()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Lancer une recherche : crée l'entrée du journal et une requête par
-- camp à vérifier (mensuelle) ou une seule requête (découverte).
-- ------------------------------------------------------------
create or replace function vigie.creer_recherche(p_type text, p_par uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_type not in ('mensuelle','decouverte') then
    raise exception 'Type de recherche inconnu : %', p_type;
  end if;
  if exists (select 1 from vigie.recherches where type = p_type and statut = 'en_cours') then
    raise exception 'Une recherche de ce type est déjà en cours.';
  end if;

  insert into vigie.recherches (type, lance_par) values (p_type, p_par) returning id into v_id;

  if p_type = 'mensuelle' then
    insert into vigie.requetes_ia (recherche_id, type, camp_id)
    select v_id, 'verification', c.id
    from vigie.camps c
    where c.statut_inclusion = 'inclus'
    order by c.categorie nulls last, c.nom;
  else
    insert into vigie.requetes_ia (recherche_id, type) values (v_id, 'decouverte');
  end if;
  return v_id;
end;
$$;

-- Lancement manuel depuis l'app (direction ou accès en écriture).
create or replace function vigie.lancer(p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_ecrire('vigie') then
    raise exception 'Permission refusée.';
  end if;
  return vigie.creer_recherche(p_type, auth.uid());
end;
$$;

-- Planification (pg_cron, chaque jour) : la vérification mensuelle part le
-- 1er du mois, la découverte à la date prévue dans les réglages.
create or replace function vigie.planifier()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_mois date := date_trunc('month', now() at time zone 'America/Toronto')::date;
  v_freq integer;
begin
  select valeur into r from vigie.parametres where cle = 'reglages';

  -- Rattrapage possible jusqu'au 3 (si le 1er a été manqué), jamais plus tard :
  -- un mois commencé se vérifie à la main (bouton du Journal).
  if coalesce((r->>'mensuelle_active')::boolean, true)
     and extract(day from now() at time zone 'America/Toronto') <= 3
     and not exists (
       select 1 from vigie.recherches
       where type = 'mensuelle' and (debut at time zone 'America/Toronto')::date >= v_mois)
     and not exists (select 1 from vigie.recherches where type = 'mensuelle' and statut = 'en_cours') then
    perform vigie.creer_recherche('mensuelle');
  end if;

  if coalesce((r->>'decouverte_active')::boolean, true)
     and coalesce((r->>'prochaine_decouverte')::date, current_date) <= (now() at time zone 'America/Toronto')::date
     and not exists (select 1 from vigie.recherches where type = 'decouverte' and statut = 'en_cours') then
    perform vigie.creer_recherche('decouverte');
    v_freq := greatest(coalesce((r->>'frequence_decouverte_mois')::integer, 3), 1);
    update vigie.parametres
    set valeur = valeur || jsonb_build_object(
      'prochaine_decouverte', to_char(v_mois + make_interval(months => v_freq), 'YYYY-MM-DD'))
    where cle = 'reglages';
  end if;
end;
$$;

-- Réveille la fonction Edge seulement s'il y a du travail (requêtes à
-- envoyer ou lots à lire, recherche à terminer).
create or replace function vigie.tic()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vigie.requetes_ia where statut in ('en_attente','soumise'))
     or exists (select 1 from vigie.recherches where statut = 'en_cours') then
    perform net.http_post(
      url := 'https://nurjzafcogzgekquzuwh.supabase.co/functions/v1/vigie',
      body := '{"action":"tic"}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Passe 2 : un camp proposé que l'on inclut est documenté en profondeur.
-- ------------------------------------------------------------
create or replace function vigie.documenter_camp_inclus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recherche uuid;
begin
  if new.statut_inclusion = 'inclus' and old.statut_inclusion = 'propose' and new.documente_le is null
     and not exists (
       select 1 from vigie.requetes_ia
       where camp_id = new.id and type = 'documentation' and statut in ('en_attente','soumise')) then
    select id into v_recherche from vigie.recherches
    where type = 'documentation' and statut = 'en_cours'
    order by debut desc limit 1;
    if v_recherche is null then
      insert into vigie.recherches (type, lance_par) values ('documentation', auth.uid())
      returning id into v_recherche;
    end if;
    insert into vigie.requetes_ia (recherche_id, type, camp_id) values (v_recherche, 'documentation', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_camps_documenter after update of statut_inclusion on vigie.camps
for each row execute function vigie.documenter_camp_inclus();

-- Demande un estimé de coûts ou une maquette (bouton dans l'app).
create or replace function vigie.demander(p_type text, p_activite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_ecrire('vigie') then
    raise exception 'Permission refusée.';
  end if;
  if p_type not in ('couts','maquette') then
    raise exception 'Type inconnu : %', p_type;
  end if;
  if not exists (
    select 1 from vigie.requetes_ia
    where activite_id = p_activite and type = p_type and statut in ('en_attente','soumise')) then
    insert into vigie.requetes_ia (type, activite_id) values (p_type, p_activite);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Valider ou rejeter un changement détecté (une transaction).
-- security invoker : les droits d'écriture (RLS) s'appliquent.
-- ------------------------------------------------------------
create or replace function vigie.valider_changement(p_id uuid, p_accepter boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c vigie.changements;
  d jsonb;
  v_activite uuid;
  v_nouvelle boolean := false;
begin
  select * into c from vigie.changements where id = p_id for update;
  if c.id is null then
    raise exception 'Changement introuvable.';
  end if;
  if c.statut <> 'a_valider' then
    raise exception 'Ce changement a déjà été traité.';
  end if;
  d := c.details;

  if p_accepter then
    if c.type = 'prix' then
      update vigie.programmes set
        prix = coalesce((d->>'prix')::numeric, prix),
        duree_jours = coalesce((d->>'duree_jours')::integer, duree_jours),
        duree_nuits = coalesce((d->>'duree_nuits')::integer, duree_nuits),
        annee = coalesce(d->>'annee', annee),
        source_url = coalesce(c.source_url, source_url),
        verifie_le = now()
      where id = c.programme_id;

    elsif c.type = 'nouveau_programme' then
      insert into vigie.programmes (camp_id, nom, description, duree_jours, duree_nuits, prix, annee, source_url, verifie_le)
      values (
        c.camp_id,
        coalesce(d->>'nom', c.nouvelle_valeur),
        d->>'description',
        (d->>'duree_jours')::integer,
        (d->>'duree_nuits')::integer,
        (d->>'prix')::numeric,
        d->>'annee',
        c.source_url,
        now());

    elsif c.type = 'nouvelle_activite' then
      v_activite := c.activite_id;
      if v_activite is null then
        select id into v_activite from vigie.activites where lower(nom) = lower(d->>'activite_nom');
      end if;
      if v_activite is null then
        insert into vigie.activites (nom, description, saisons)
        values (
          d->>'activite_nom',
          d->>'description',
          coalesce(array(select jsonb_array_elements_text(d->'saisons')), '{}'))
        returning id into v_activite;
        v_nouvelle := true;
      end if;
      insert into vigie.camps_activites (camp_id, activite_id, source, note)
      values (c.camp_id, v_activite, coalesce(d->>'source', 'site'), d->>'preuve')
      on conflict do nothing;
      if d->>'photo_chemin' is not null or d->>'photo_url' is not null then
        insert into vigie.photos (activite_id, camp_id, chemin, url, page_source, legende)
        values (v_activite, c.camp_id, d->>'photo_chemin', d->>'photo_url', c.source_url, d->>'preuve')
        on conflict (activite_id, camp_id) do nothing;
      end if;
      update vigie.changements set activite_id = v_activite where id = c.id;
      -- Nouvelle activité candidate : Claude estime ses coûts.
      if v_nouvelle then
        insert into vigie.requetes_ia (type, activite_id) values ('couts', v_activite);
      end if;
    end if;
  end if;

  update vigie.changements set
    statut = case when p_accepter then 'valide' else 'rejete' end,
    valide_le = now(),
    valide_par = auth.uid()
  where id = c.id;
end;
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema vigie to authenticated, service_role;
grant select, insert, update, delete on all tables in schema vigie to authenticated, service_role;
revoke execute on all functions in schema vigie from public, anon, authenticated;
grant execute on function vigie.lancer(text), vigie.demander(text, uuid), vigie.valider_changement(uuid, boolean)
  to authenticated;
grant execute on all functions in schema vigie to service_role;

do $$
declare t text;
begin
  foreach t in array array['recherches','camps','programmes','activites','camps_activites','photos','maquettes','changements','requetes_ia','parametres'] loop
    execute format('alter table vigie.%I enable row level security', t);
    execute format(
      'create policy "Lire" on vigie.%I for select to authenticated using (core.peut_lire(''vigie''))', t);
    execute format(
      'create policy "Écrire" on vigie.%I for all to authenticated
         using (core.peut_ecrire(''vigie'')) with check (core.peut_ecrire(''vigie''))', t);
  end loop;
end $$;

alter publication supabase_realtime add table
  vigie.recherches, vigie.camps, vigie.programmes, vigie.activites, vigie.camps_activites,
  vigie.photos, vigie.maquettes, vigie.changements, vigie.requetes_ia, vigie.parametres;

-- ------------------------------------------------------------
-- Photos : seau public (photos déjà publiques sur les sites des camps).
-- Seule la fonction Edge (clé de service) y écrit.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vigie-photos', 'vigie-photos', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Planification (pg_cron + pg_net)
-- ------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 10 h UTC = 6 h (heure de l'Est) : lance ce qui est dû.
select cron.schedule('vigie-planifier', '0 10 * * *', $$ select vigie.planifier(); select vigie.tic(); $$);
-- Toutes les 10 minutes : envoie les requêtes en attente, lit les lots terminés.
select cron.schedule('vigie-tic', '*/10 * * * *', $$ select vigie.tic(); $$);
