-- ============================================================
-- horaire : dossiers (par saison, etc.) et modèles de séjour.
-- - Une semaine peut être rangée dans un dossier ; le nom est unique
--   dans son dossier (« Semaine 1 » peut exister dans « Été 2026 » et
--   dans « Été 2027 »).
-- - Un modèle (2, 3, 4 jours d'école, semaine d'été…) est un horaire
--   comme les autres, marqué modele = true, jamais rangé dans un dossier.
--   Une nouvelle semaine créée à partir d'un modèle en est une copie.
-- ============================================================

create table horaire.dossiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_dossiers_updated_at before update on horaire.dossiers
for each row execute function core.maj_updated_at();

grant select, insert, update, delete on horaire.dossiers to authenticated, service_role;

alter table horaire.dossiers enable row level security;

create policy "Lire" on horaire.dossiers for select to authenticated
  using (core.peut_lire('horaire'));
create policy "Écrire" on horaire.dossiers for all to authenticated
  using (core.peut_ecrire('horaire')) with check (core.peut_ecrire('horaire'));

alter publication supabase_realtime add table horaire.dossiers;

-- Supprimer un dossier ne supprime pas ses semaines : elles passent dans
-- « Sans dossier ».
alter table horaire.horaires
  add column dossier_id uuid references horaire.dossiers(id) on delete set null,
  add column modele boolean not null default false,
  add constraint horaires_modele_sans_dossier check (not modele or dossier_id is null);

create index horaires_dossier_id_idx on horaire.horaires (dossier_id);

-- Nom unique par dossier (sans dossier compris), et parmi les modèles.
alter table horaire.horaires drop constraint horaires_nom_unique;
alter table horaire.horaires add constraint horaires_nom_unique
  unique nulls not distinct (modele, dossier_id, nom);

comment on column horaire.horaires.modele is
  'Modèle de séjour (2, 3, 4 jours, semaine d''été…) : sert de point de départ aux nouvelles semaines.';
