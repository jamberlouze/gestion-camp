-- ============================================================
-- embarcations : suivi de l'état de la flotte et des réparations.
-- Repris tel quel de l'ancien projet « Suivi des embarcations »,
-- avec updated_at en plus (synchronisation hors ligne).
-- ============================================================

create schema if not exists embarcations;

create table embarcations.modeles (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('Kayak','Canot','Pédalo','SUP','Rabaska')),
  nom text not null,
  prefix_id text not null unique,
  bouchon text check (bouchon in ('Liège','Plastique') or bouchon is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, nom)
);

comment on table embarcations.modeles is 'Catalogue des modèles (type, nom, préfixe de numérotation, type de bouchon)';

create table embarcations.embarcations (
  id uuid primary key default gen_random_uuid(),
  numero_identification text unique,
  modele_id uuid not null references embarcations.modeles(id) on delete restrict,
  entreprise_utilisation text check (entreprise_utilisation in ('BPA lac','BPA rivière','R&D','AQB') or entreprise_utilisation is null),
  fonctionnel boolean not null default true,
  notes text,
  date_creation timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_embarcations_modele on embarcations.embarcations(modele_id);
create index idx_embarcations_deleted on embarcations.embarcations(deleted_at);

create trigger trg_modeles_updated_at before update on embarcations.modeles
for each row execute function core.maj_updated_at();
create trigger trg_embarcations_updated_at before update on embarcations.embarcations
for each row execute function core.maj_updated_at();

-- Numéro d'identification automatique (PREFIXE-001, PREFIXE-002, ...),
-- propre à chaque modèle.
create or replace function embarcations.generer_numero_identification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefix text;
  v_next int;
begin
  if new.numero_identification is not null then
    return new;
  end if;

  select prefix_id into v_prefix from embarcations.modeles where id = new.modele_id;

  if v_prefix is null then
    raise exception 'Modèle % introuvable', new.modele_id;
  end if;

  select coalesce(max(cast(split_part(numero_identification, '-', 2) as int)), 0) + 1
    into v_next
    from embarcations.embarcations
    where modele_id = new.modele_id;

  new.numero_identification := v_prefix || '-' || lpad(v_next::text, 3, '0');
  return new;
end;
$$;

create trigger trg_numero_identification before insert on embarcations.embarcations
for each row execute function embarcations.generer_numero_identification();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema embarcations to authenticated, service_role;
grant select, insert, update, delete on all tables in schema embarcations to authenticated, service_role;
revoke execute on all functions in schema embarcations from public, anon;

alter table embarcations.modeles enable row level security;
alter table embarcations.embarcations enable row level security;

create policy "Lire modèles" on embarcations.modeles for select to authenticated
  using (core.peut_lire('embarcations'));
create policy "Écrire modèles" on embarcations.modeles for all to authenticated
  using (core.peut_ecrire('embarcations')) with check (core.peut_ecrire('embarcations'));

create policy "Lire embarcations" on embarcations.embarcations for select to authenticated
  using (core.peut_lire('embarcations'));
create policy "Écrire embarcations" on embarcations.embarcations for all to authenticated
  using (core.peut_ecrire('embarcations')) with check (core.peut_ecrire('embarcations'));

alter publication supabase_realtime add table embarcations.modeles, embarcations.embarcations;
