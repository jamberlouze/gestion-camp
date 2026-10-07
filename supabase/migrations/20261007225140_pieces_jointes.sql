-- ============================================================
-- Photos et PDF joints aux tâches (demande de Maxime du 2026-10-07)
--
-- Travaux : les photos acceptent aussi des PDF (même table, même seau).
-- Mastertimeline : fichiers joints à la tâche (le modèle, valable toutes
-- les années), dans un seau privé.
-- ============================================================

-- ------------------------------------------------------------
-- Travaux
-- ------------------------------------------------------------
-- Nom d'origine d'un PDF (null pour une photo).
alter table travaux.photos add column nom text;
comment on column travaux.photos.chemin is
  'Chemin dans le seau travaux-photos : <tache_id>/<id>.jpg (photo) ou <tache_id>/<id>.pdf';

update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'],
       file_size_limit = 20971520
 where id = 'travaux-photos';

-- ------------------------------------------------------------
-- Mastertimeline
-- ------------------------------------------------------------
create table mastertimeline.fichiers (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references mastertimeline.taches(id) on delete cascade,
  -- Chemin dans le seau mastertimeline-fichiers : <tache_id>/<id>.jpg ou .pdf
  chemin text not null unique,
  -- Nom d'origine d'un PDF (null pour une photo).
  nom text,
  ajoute_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_mastertimeline_fichiers_tache on mastertimeline.fichiers(tache_id);

alter table mastertimeline.fichiers enable row level security;
create policy "Lire" on mastertimeline.fichiers for select to authenticated
  using (core.peut_lire('mastertimeline'));
create policy "Écrire" on mastertimeline.fichiers for all to authenticated
  using (core.peut_ecrire('mastertimeline')) with check (core.peut_ecrire('mastertimeline'));

grant select, insert, update, delete on mastertimeline.fichiers to authenticated, service_role;

alter publication supabase_realtime add table mastertimeline.fichiers;

-- Seau privé : contrats, soumissions, plans… lus par adresse signée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mastertimeline-fichiers', 'mastertimeline-fichiers', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "Mastertimeline : lire les fichiers" on storage.objects for select to authenticated
  using (bucket_id = 'mastertimeline-fichiers' and core.peut_lire('mastertimeline'));
create policy "Mastertimeline : ajouter un fichier" on storage.objects for insert to authenticated
  with check (bucket_id = 'mastertimeline-fichiers' and core.peut_ecrire('mastertimeline'));
create policy "Mastertimeline : retirer un fichier" on storage.objects for delete to authenticated
  using (bucket_id = 'mastertimeline-fichiers' and core.peut_ecrire('mastertimeline'));
