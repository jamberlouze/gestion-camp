-- ============================================================
-- core : utilisateurs, rôles, accès aux modules et référentiel
-- commun (groupes de campeurs, employés, semaines de camp).
-- ============================================================

create schema if not exists core;

-- ------------------------------------------------------------
-- Horodatage automatique des modifications (réutilisé par les
-- autres schémas).
-- ------------------------------------------------------------
create or replace function core.maj_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Profils : un par compte Supabase Auth.
--   admin     : tout, y compris gérer les utilisateurs
--   direction : lecture et écriture dans tous les modules
--   coordo    : seulement les modules listés dans acces_modules
-- ------------------------------------------------------------
create table core.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  courriel text not null,
  nom text,
  role text not null default 'direction' check (role in ('admin','direction','coordo')),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profils_updated_at before update on core.profils
for each row execute function core.maj_updated_at();

-- Création automatique du profil à l'invitation. Le rôle par défaut est
-- « direction » parce que seule la direction est invitée pour l'instant ;
-- le passer à « coordo » quand des coordonnateurs seront invités.
create or replace function core.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into core.profils (id, courriel)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_creer_profil after insert on auth.users
for each row execute function core.creer_profil();

-- ------------------------------------------------------------
-- Accès par module (utilisé pour les coordonnateurs seulement).
-- ------------------------------------------------------------
create table core.acces_modules (
  user_id uuid not null references core.profils(id) on delete cascade,
  module text not null check (module in ('embarcations','commande','horaire')),
  niveau text not null default 'lecture' check (niveau in ('lecture','ecriture')),
  primary key (user_id, module)
);

-- ------------------------------------------------------------
-- Fonctions d'autorisation utilisées par toutes les politiques RLS.
-- security definer : elles lisent profils/acces_modules sans
-- dépendre des politiques de ces tables.
-- ------------------------------------------------------------
create or replace function core.role_actuel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from core.profils where id = auth.uid() and actif
$$;

create or replace function core.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(core.role_actuel() = 'admin', false)
$$;

create or replace function core.est_direction()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(core.role_actuel() in ('admin','direction'), false)
$$;

create or replace function core.peut_lire(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.est_direction()
    or exists (
      select 1 from core.acces_modules a
      join core.profils p on p.id = a.user_id and p.actif
      where a.user_id = auth.uid() and a.module = p_module
    )
$$;

create or replace function core.peut_ecrire(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.est_direction()
    or exists (
      select 1 from core.acces_modules a
      join core.profils p on p.id = a.user_id and p.actif
      where a.user_id = auth.uid() and a.module = p_module and a.niveau = 'ecriture'
    )
$$;

-- Ping du waker : garde le projet éveillé. Touche une vraie table (pour
-- compter comme de l'activité) mais ne renvoie que l'heure du serveur.
create or replace function core.ping()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform 1 from core.groupes limit 1;
  return now();
end;
$$;

-- ------------------------------------------------------------
-- Référentiel commun
-- ------------------------------------------------------------
create table core.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  tranche_age text,
  effectif integer not null default 0 check (effectif >= 0),
  couleur text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table core.groupes is 'Groupes de campeurs, partagés entre les modules';

create trigger trg_groupes_updated_at before update on core.groupes
for each row execute function core.maj_updated_at();

-- Source officielle : Airtable (base « Inscriptions Camp de vacances »,
-- table Employé). airtable_id sert à la synchronisation future.
create table core.employes (
  id uuid primary key default gen_random_uuid(),
  surnom text not null unique,
  nom_complet text,
  courriel text,
  poste text,
  specialites text[] not null default '{}'
    check (specialites <@ array['escalade','transport','sauveteur']::text[]),
  actif boolean not null default true,
  airtable_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table core.employes is 'Employés et animateurs (source officielle : Airtable)';

create trigger trg_employes_updated_at before update on core.employes
for each row execute function core.maj_updated_at();

create table core.semaines (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date_debut date not null unique,
  date_fin date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_fin >= date_debut)
);

comment on table core.semaines is 'Semaines ou sessions du calendrier de camp';

create trigger trg_semaines_updated_at before update on core.semaines
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits : personne n'accède sans être connecté (sauf core.ping).
-- ------------------------------------------------------------
grant usage on schema core to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema core to authenticated, service_role;
revoke execute on all functions in schema core from public, anon;
grant execute on all functions in schema core to authenticated, service_role;
grant execute on function core.ping() to anon;

alter table core.profils enable row level security;
alter table core.acces_modules enable row level security;
alter table core.groupes enable row level security;
alter table core.employes enable row level security;
alter table core.semaines enable row level security;

-- Profils : chacun voit le sien ; la direction voit tout le monde ;
-- seul un admin modifie (rôles, activation).
create policy "Lire profils" on core.profils for select to authenticated
  using (id = auth.uid() or core.est_direction());
create policy "Admin modifie profils" on core.profils for update to authenticated
  using (core.est_admin()) with check (core.est_admin());
create policy "Admin supprime profils" on core.profils for delete to authenticated
  using (core.est_admin());

create policy "Lire accès" on core.acces_modules for select to authenticated
  using (user_id = auth.uid() or core.est_direction());
create policy "Admin gère accès" on core.acces_modules for all to authenticated
  using (core.est_admin()) with check (core.est_admin());

-- Référentiel : lu par toute personne active, modifié par la direction.
create policy "Lire groupes" on core.groupes for select to authenticated
  using (core.role_actuel() is not null);
create policy "Direction gère groupes" on core.groupes for all to authenticated
  using (core.est_direction()) with check (core.est_direction());

create policy "Lire employés" on core.employes for select to authenticated
  using (core.role_actuel() is not null);
create policy "Direction gère employés" on core.employes for all to authenticated
  using (core.est_direction()) with check (core.est_direction());

create policy "Lire semaines" on core.semaines for select to authenticated
  using (core.role_actuel() is not null);
create policy "Direction gère semaines" on core.semaines for all to authenticated
  using (core.est_direction()) with check (core.est_direction());

alter publication supabase_realtime add table core.groupes, core.employes, core.semaines;
