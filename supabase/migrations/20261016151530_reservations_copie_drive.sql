-- Copie Drive des documents des Réservations (voir 20261016151529_copie_drive.sql).
-- À part pour partir avec le module : la PROD n'a pas encore le schéma
-- reservations. Le réglage « reservations » reste inactif jusqu'à la bascule.
--
-- 2 - Accueil de groupe › <exercice « 2026-27 »> › <« 27-G-083 – École… »>.
create or replace function reservations.drive_documents()
returns table (document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, cree_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, 'reservations-documents', d.chemin, core.drive_nom(d.titre, d.chemin),
    jsonb_build_array(
      jsonb_build_object('cle', 'reservations:ex:' || r.exercice,
                         'nom', (r.exercice - 1) || '-' || lpad((r.exercice % 100)::text, 2, '0')),
      jsonb_build_object('cle', 'reservations:r:' || r.id, 'nom', left(r.numero || ' – ' || r.nom, 150))),
    d.cree_le
  from reservations.documents d
  join reservations.reservations r on r.id = d.reservation_id
$$;

revoke all on function reservations.drive_documents() from public, anon, authenticated;
grant execute on function reservations.drive_documents() to service_role;
