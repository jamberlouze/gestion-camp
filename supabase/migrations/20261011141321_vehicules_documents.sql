-- ============================================================
-- Documents des véhicules (demande du 2026-10-11) : certificat
-- d'immatriculation, preuve d'assurance, vérification mécanique…
-- Photo ou PDF, rangé sous une rubrique de la fiche.
-- ============================================================

create table vehicules.documents (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references vehicules.vehicules(id) on delete cascade,
  -- Rubrique de la fiche où le document s'affiche.
  categorie text not null default 'autre'
    check (categorie in ('immatriculation', 'assurance', 'inspection', 'autre')),
  -- Chemin dans le seau vehicules-documents : <vehicule_id>/<id>.jpg ou .pdf
  chemin text not null unique,
  -- Nom d'origine d'un PDF (null pour une photo).
  nom text,
  ajoute_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_vehicules_documents_vehicule on vehicules.documents(vehicule_id);

alter table vehicules.documents enable row level security;
create policy "Lire" on vehicules.documents for select to authenticated
  using (core.peut_lire('vehicules'));
create policy "Écrire" on vehicules.documents for all to authenticated
  using (core.peut_ecrire('vehicules')) with check (core.peut_ecrire('vehicules'));

grant select, insert, update, delete on vehicules.documents to authenticated, service_role;

alter publication supabase_realtime add table vehicules.documents;

-- Seau privé (contrairement aux photos) : NIV, numéro de police, adresse
-- du propriétaire… lus par adresse signée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicules-documents', 'vehicules-documents', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "Véhicules : lire les documents" on storage.objects for select to authenticated
  using (bucket_id = 'vehicules-documents' and core.peut_lire('vehicules'));
create policy "Véhicules : ajouter un document" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicules-documents' and core.peut_ecrire('vehicules'));
create policy "Véhicules : retirer un document" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicules-documents' and core.peut_ecrire('vehicules'));
