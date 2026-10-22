-- ============================================================
-- Réservations : fin du statut « En attente » (décision de Maxime du
-- 2026-10-22). Il n'avait pas été demandé : ajouté au plan d'après les
-- notes « stand by » et « reporté » des Sheets, et l'import y classait
-- aussi des séjours dont la date avait seulement changé. Une demande en
-- suspens reste à son étape, avec une note ou une relance du CRM.
--
-- 1. Les réservations qui l'avaient reviennent dans leur étape (comme
--    « Rouvrir » ; journalisé). Aucune en PROD (module vide).
-- 2. Hors parcours : perdue (closed_lost) ou annulée après signature.
-- 3. Calendrier : toute réservation fermée est exclue.
-- ============================================================

update reservations.reservations
set fermeture = null
where fermeture = 'en_attente';

alter table reservations.reservations drop constraint reservations_fermeture_check;
alter table reservations.reservations add constraint reservations_fermeture_check
  check (fermeture in ('closed_lost', 'annulee'));

-- Corps inchangé (20261021125905_calendrier_lit_reservations.sql), sauf le filtre.
create or replace function calendrier.reservations()
returns table (
  id uuid,
  numero text,
  nom text,
  forfait text,
  etape text,
  fermeture text,
  origine text,
  date_arrivee date,
  date_depart date,
  heure_arrivee time,
  heure_depart time,
  etages text[],
  salles text[],
  nb_participants integer,
  nb_accompagnateurs integer,
  service_repas boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.numero, r.nom, r.forfait, r.etape, r.fermeture, r.origine,
         r.date_arrivee, r.date_depart, r.heure_arrivee, r.heure_depart,
         r.etages, r.salles, r.nb_participants, r.nb_accompagnateurs, r.service_repas
  from reservations.reservations r
  where core.peut_lire('calendrier')
    and r.fermeture is null
$$;
