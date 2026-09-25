-- ============================================================
-- horaire : créateur d'horaire (module en développement).
-- Pour l'instant, un document par semaine de camp. On découpera en
-- tables quand le module sera stable.
-- ============================================================

create schema if not exists horaire;

-- Réglages du module : liste des activités, périodes, dortoirs, quotas...
create table horaire.parametres (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now()
);

-- Horaire d'une semaine : grille, fusions, soirées, surveillances.
-- Les groupes et animateurs sont référencés par leur id dans core.
create table horaire.horaires (
  id uuid primary key default gen_random_uuid(),
  semaine_id uuid not null unique references core.semaines(id) on delete cascade,
  etat jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references core.profils(id) on delete set null
);

create trigger trg_parametres_updated_at before update on horaire.parametres
for each row execute function core.maj_updated_at();
create trigger trg_horaires_updated_at before update on horaire.horaires
for each row execute function core.maj_updated_at();

grant usage on schema horaire to authenticated, service_role;
grant select, insert, update, delete on all tables in schema horaire to authenticated, service_role;

alter table horaire.parametres enable row level security;
alter table horaire.horaires enable row level security;

create policy "Lire" on horaire.parametres for select to authenticated
  using (core.peut_lire('horaire'));
create policy "Écrire" on horaire.parametres for all to authenticated
  using (core.peut_ecrire('horaire')) with check (core.peut_ecrire('horaire'));

create policy "Lire" on horaire.horaires for select to authenticated
  using (core.peut_lire('horaire'));
create policy "Écrire" on horaire.horaires for all to authenticated
  using (core.peut_ecrire('horaire')) with check (core.peut_ecrire('horaire'));

alter publication supabase_realtime add table horaire.parametres, horaire.horaires;
