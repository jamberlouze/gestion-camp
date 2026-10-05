-- ============================================================
-- vehicules : la flotte (minibus, VTT, remorques) au même endroit.
--
-- Une fiche par véhicule : identification, propriétaire, statut
-- (en circulation / remisé), immatriculation et assurance (valeurs en
-- cours + échéance), photo. Deux registres datés par véhicule :
-- inspections (avec la prochaine échéance) et entretiens.
-- Photos : seau public `vehicules-photos` (photos de véhicules, rien de
-- confidentiel), écriture réservée à qui peut écrire dans le module.
-- ============================================================

create schema if not exists vehicules;

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','vigie','calendrier','vehicules'));

-- ------------------------------------------------------------
-- Compagnies propriétaires (liste propre au module).
-- ------------------------------------------------------------
create table vehicules.proprietaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Véhicules
-- ------------------------------------------------------------
create table vehicules.vehicules (
  id uuid primary key default gen_random_uuid(),
  surnom text not null unique check (btrim(surnom) <> ''),
  type text not null check (type in ('minibus','vtt','remorque','autre')),
  statut text not null default 'en_circulation' check (statut in ('en_circulation','remise')),
  proprietaire_id uuid references vehicules.proprietaires(id) on delete restrict,
  marque text,
  modele text,
  annee integer check (annee between 1950 and 2100),
  couleur text,
  niv text,
  places integer check (places between 0 and 100),
  -- Immatriculation (SAAQ)
  plaque text,
  immatriculation_echeance date,
  -- Assurance
  assureur text,
  police_assurance text,
  assurance_echeance date,
  -- Chemin dans le seau vehicules-photos
  photo text,
  notes text,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vehicules_proprietaire on vehicules.vehicules(proprietaire_id);

-- ------------------------------------------------------------
-- Inspections : une ligne par inspection faite. `prochaine` = échéance
-- de la suivante (la plus récente inspection fait foi).
-- ------------------------------------------------------------
create table vehicules.inspections (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references vehicules.vehicules(id) on delete cascade,
  date date not null,
  type text not null default 'Inspection mécanique' check (btrim(type) <> ''),
  resultat text check (resultat in ('conforme','mineures','majeures')),
  atelier text,
  cout numeric(10,2) check (cout >= 0),
  prochaine date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inspections_vehicule on vehicules.inspections(vehicule_id, date desc);

-- ------------------------------------------------------------
-- Registre des entretiens
-- ------------------------------------------------------------
create table vehicules.entretiens (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references vehicules.vehicules(id) on delete cascade,
  date date not null,
  type text not null check (btrim(type) <> ''),
  description text,
  -- Kilométrage (minibus) ou heures (VTT) au moment de l'entretien
  compteur integer check (compteur >= 0),
  cout numeric(10,2) check (cout >= 0),
  fournisseur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_entretiens_vehicule on vehicules.entretiens(vehicule_id, date desc);

create trigger trg_proprietaires_updated_at before update on vehicules.proprietaires
for each row execute function core.maj_updated_at();
create trigger trg_vehicules_updated_at before update on vehicules.vehicules
for each row execute function core.maj_updated_at();
create trigger trg_inspections_updated_at before update on vehicules.inspections
for each row execute function core.maj_updated_at();
create trigger trg_entretiens_updated_at before update on vehicules.entretiens
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema vehicules to authenticated, service_role;
grant select, insert, update, delete on all tables in schema vehicules to authenticated, service_role;
revoke execute on all functions in schema vehicules from public, anon;

alter table vehicules.proprietaires enable row level security;
alter table vehicules.vehicules enable row level security;
alter table vehicules.inspections enable row level security;
alter table vehicules.entretiens enable row level security;

create policy "Lire propriétaires" on vehicules.proprietaires for select to authenticated
  using (core.peut_lire('vehicules'));
create policy "Écrire propriétaires" on vehicules.proprietaires for all to authenticated
  using (core.peut_ecrire('vehicules')) with check (core.peut_ecrire('vehicules'));

create policy "Lire véhicules" on vehicules.vehicules for select to authenticated
  using (core.peut_lire('vehicules'));
create policy "Écrire véhicules" on vehicules.vehicules for all to authenticated
  using (core.peut_ecrire('vehicules')) with check (core.peut_ecrire('vehicules'));

create policy "Lire inspections" on vehicules.inspections for select to authenticated
  using (core.peut_lire('vehicules'));
create policy "Écrire inspections" on vehicules.inspections for all to authenticated
  using (core.peut_ecrire('vehicules')) with check (core.peut_ecrire('vehicules'));

create policy "Lire entretiens" on vehicules.entretiens for select to authenticated
  using (core.peut_lire('vehicules'));
create policy "Écrire entretiens" on vehicules.entretiens for all to authenticated
  using (core.peut_ecrire('vehicules')) with check (core.peut_ecrire('vehicules'));

alter publication supabase_realtime add table
  vehicules.proprietaires, vehicules.vehicules, vehicules.inspections, vehicules.entretiens;

-- ------------------------------------------------------------
-- Photos : seau public (lecture par adresse), écriture par le module.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicules-photos', 'vehicules-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Véhicules : ajouter une photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicules-photos' and core.peut_ecrire('vehicules'));
create policy "Véhicules : remplacer une photo" on storage.objects for update to authenticated
  using (bucket_id = 'vehicules-photos' and core.peut_ecrire('vehicules'))
  with check (bucket_id = 'vehicules-photos' and core.peut_ecrire('vehicules'));
create policy "Véhicules : retirer une photo" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicules-photos' and core.peut_ecrire('vehicules'));
-- Le client de stockage relit l'objet après l'envoi : lecture aussi
-- permise par la politique (le seau public sert les images sans elle).
create policy "Véhicules : lire les photos" on storage.objects for select to authenticated
  using (bucket_id = 'vehicules-photos' and core.peut_lire('vehicules'));

-- ------------------------------------------------------------
-- Données de départ : compagnies du groupe et la flotte actuelle
-- (propriétaire et dates à préciser dans l'app).
-- ------------------------------------------------------------
insert into vehicules.proprietaires (nom, ordre) values
  ('GBPA+', 1),
  ('BPA inc.', 2),
  ('Opikawa', 3),
  ('Rouge & Diable', 4),
  ('Aquabounga', 5);

insert into vehicules.vehicules (surnom, type, ordre) values
  ('Étobus', 'minibus', 1),
  ('Minotour', 'minibus', 2),
  ('Spécial', 'minibus', 3),
  ('Disco van', 'minibus', 4),
  ('Fisher price', 'vtt', 5),
  ('Teryx Noir', 'vtt', 6),
  ('Teryx Blanc', 'vtt', 7),
  ('Maman loutre', 'remorque', 8),
  ('Chatte pirate', 'remorque', 9),
  ('Joyeuse marmaille', 'remorque', 10),
  ('Ptite à Étienne', 'remorque', 11),
  ('Quenouille qui grouille', 'remorque', 12);
