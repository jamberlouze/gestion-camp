-- ============================================================
-- QuickBooks : facturer exige aussi de lire le CRM (audit du 2026-10-19).
--
-- Les routes /api/qbo/* du Worker lisent les organisations et les contacts
-- du CRM avec la clé secrète (client QBO, devis, noms des organisations
-- déjà reliées). Le contrôle n'était que le droit d'écrire dans
-- Réservations : une personne sans le CRM aurait reçu des noms et des
-- coordonnées que la RLS lui cache. L'écran d'une réservation lit déjà le
-- client dans le CRM : sans ce droit, il n'y a rien à facturer.
-- ============================================================

create or replace function reservations.peut_facturer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', coalesce(core.peut_ecrire('reservations') and core.peut_lire('crm'), false),
    'nom', reservations.nom_de(auth.uid()))
$$;
