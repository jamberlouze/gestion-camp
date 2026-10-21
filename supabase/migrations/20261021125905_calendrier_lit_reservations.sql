-- ============================================================
-- Calendrier : les séjours viennent du module Réservations (plan des
-- réservations §13 ; choix de Maxime du 2026-10-21).
--
-- 1. calendrier.reservations() lit reservations.reservations directement,
--    sans copie, pour qui lit le Calendrier (même sans accès au module
--    Réservations : seulement les champs utiles à la grille). Toutes les
--    étapes, sauf les réservations perdues (closed_lost) et annulées ;
--    « en attente » reste, dans son étape. L'app range chaque réservation
--    dans la phase de son calendrier Google (agenda.ts) ou Airbnb.
-- 2. En direct : chaque changement des réservations ajoute une ligne à
--    calendrier.signal_reservations, que l'app écoute (temps réel, RLS du
--    Calendrier). Seulement des ajouts : deux transactions ne se disputent
--    jamais une ligne. Les lignes de plus d'un jour partent chaque nuit.
-- 3. Synchro Airtable retirée (fonctions, journal des synchros, secret
--    AIRTABLE_TOKEN côté Worker). La copie calendrier.sejours reste, figée,
--    parce que crm.sejours() (CRM) la lit encore ; les séjours de la
--    démonstration du 2026-10-05 (« sheets:… », que la première synchro
--    devait retirer) y sont retirés.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lecture des réservations
-- ------------------------------------------------------------
create function calendrier.reservations()
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
    and r.fermeture is distinct from 'closed_lost'
    and r.fermeture is distinct from 'annulee'
$$;

revoke execute on function calendrier.reservations() from public, anon;
grant execute on function calendrier.reservations() to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Signal de changement (temps réel)
-- ------------------------------------------------------------
create table calendrier.signal_reservations (
  id bigserial primary key,
  le timestamptz not null default now()
);

alter table calendrier.signal_reservations enable row level security;
create policy "Lire" on calendrier.signal_reservations for select to authenticated using (core.peut_lire('calendrier'));
grant select on calendrier.signal_reservations to authenticated, service_role;
alter publication supabase_realtime add table calendrier.signal_reservations;

-- Une ligne par instruction (un import de cent réservations = un signal).
create function calendrier.signaler_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into calendrier.signal_reservations default values;
  return null;
end;
$$;

revoke execute on function calendrier.signaler_reservations() from public, anon, authenticated;

-- Seulement les colonnes que lit calendrier.reservations() (pas le montant
-- de l'estimé, que la base tient à jour).
create trigger trg_reservations_calendrier
  after insert or delete or update of numero, nom, forfait, etape, fermeture, origine,
    date_arrivee, date_depart, heure_arrivee, heure_depart, etages, salles,
    nb_participants, nb_accompagnateurs, service_repas
  on reservations.reservations
  for each statement
  execute function calendrier.signaler_reservations();

-- 9 h 15 UTC = 5 h 15 (heure de l'Est).
select cron.schedule('calendrier-signal-menage', '15 9 * * *', $$ delete from calendrier.signal_reservations where le < now() - interval '1 day'; $$);

-- ------------------------------------------------------------
-- 3. Fin de la synchro Airtable
-- ------------------------------------------------------------
drop function calendrier.synchroniser_sejours(jsonb, text);
drop function calendrier.noter_echec(text, text);
drop function calendrier.peut_synchroniser();
drop table calendrier.synchros;

-- Personne n'écoute plus la copie : seul crm.sejours() la lit.
alter publication supabase_realtime drop table calendrier.sejours;

-- Retrait logique (journalisé), comme l'aurait fait la synchro.
update calendrier.sejours
set deleted_at = now()
where airtable_record_id like 'sheets:%'
  and deleted_at is null;

comment on table calendrier.sejours is
  'Ancienne copie d''Airtable, figée : lue seulement par crm.sejours() jusqu''à ce que le CRM lise les réservations. Le Calendrier lit calendrier.reservations().';
