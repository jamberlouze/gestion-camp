-- Réservations, phase 6 : Google Agenda et Airbnb (plan §10).
-- - L'app écrit dans les 5 calendriers Google (Demande, Estimé, Contrat,
--   Confirmée PP, Confirmée VF), jamais l'inverse ; Confirmée VF bloque
--   Airbnb. Le Worker garde ici ce qu'il a écrit (reservations.agenda).
--   Écriture désactivée tant que les vieux événements d'Airtable sont là
--   (réglage « agenda », actif = false) ; en DEV, jamais Google : simulé.
-- - Les réservations Airbnb de la Vieille-France (deux annonces) sont lues
--   dans leur iCal aux 15 minutes : confirmées, « à compléter », numérotées
--   AA-A-nnn (pas dans la suite des groupes AA-G-nnn).
-- - Une réservation de groupe ne peut pas être confirmée par-dessus une
--   réservation Airbnb (mêmes étages ou salles de la VF, mêmes nuits).

-- ------------------------------------------------------------
-- Nuits et chevauchements
-- ------------------------------------------------------------

-- Nuits occupées : [arrivée, départ) ; une journée sans nuit compte pour son jour.
create function reservations.nuits(p_arrivee date, p_depart date)
returns daterange
language sql
immutable
set search_path = ''
as $$
  select daterange(p_arrivee, greatest(p_depart, p_arrivee + 1), '[)')
$$;

-- Étape où la réservation est confirmée (contrat signé), ou réservation Airbnb.
create function reservations.est_confirmee(p_etape text, p_fermeture text, p_origine text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_fermeture is null and (p_origine = 'airbnb' or p_etape in ('confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee'))
$$;

-- ------------------------------------------------------------
-- Numéros : la suite des groupes ignore les réservations Airbnb
-- ------------------------------------------------------------

create or replace function reservations.numeroter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.numero is null then
    new.exercice := coalesce(new.exercice, reservations.exercice_de(new.date_arrivee));
    perform pg_advisory_xact_lock(hashtext('reservations.numero'), new.exercice);
    -- Les numéros Airbnb (AA-A-nnn) ont numero_seq à partir de 100 000.
    select coalesce(max(r.numero_seq), 0) + 1 into new.numero_seq
    from reservations.reservations r where r.exercice = new.exercice and r.numero_seq < 100000;
    new.numero := lpad((new.exercice % 100)::text, 2, '0') || '-G-' || lpad(new.numero_seq::text, 3, '0');
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Google Agenda
-- ------------------------------------------------------------

-- Ce que le Worker a écrit dans Google Agenda pour chaque réservation : un
-- événement dans un seul calendrier à la fois.
create table reservations.agenda (
  reservation_id uuid primary key references reservations.reservations(id) on delete cascade,
  calendrier text check (calendrier in ('demande','estime','contrat','confirmee_pp','confirmee_vf')),
  -- Identifiant de l'événement Google (« simule:… » en DEV).
  google_id text,
  -- Contenu envoyé (JSON) : on ne réécrit que s'il change.
  contenu text,
  synchronise_le timestamptz,
  erreur text
);

alter table reservations.agenda enable row level security;
create policy "Lire" on reservations.agenda for select to authenticated using (core.peut_lire('reservations'));
grant select on reservations.agenda to authenticated;
grant all on reservations.agenda to service_role;

-- Réglages : écriture désactivée au départ ; identifiants des calendriers
-- (« …@group.calendar.google.com ») à remplir dans Réglages.
insert into reservations.reglages (cle, valeur) values
  ('agenda', '{"actif": false, "calendriers": {"demande": "", "estime": "", "contrat": "", "confirmee_pp": "", "confirmee_vf": ""}}')
on conflict (cle) do nothing;

-- ------------------------------------------------------------
-- Airbnb
-- ------------------------------------------------------------

-- Réservations « Reserved » d'une annonce (iCal) : [{uid, arrivee, depart,
-- lien}]. Ajoutées, déplacées si leurs dates changent, annulées si elles
-- disparaissent du calendrier (seulement à venir), rouvertes si elles
-- reviennent. Les champs remplis par l'équipe ne sont jamais touchés.
create function reservations.recevoir_airbnb(p_annonce text, p_evenements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  r reservations.reservations;
  v_ref text;
  v_refs text[] := '{}';
  v_compagnie uuid;
  v_nom text;
  v_etages text[];
  v_salles text[];
  v_arrivee date;
  v_depart date;
  v_exercice smallint;
  v_seq integer;
  v_note text;
  v_ajoutees integer := 0;
  v_modifiees integer := 0;
  v_annulees integer := 0;
begin
  if p_annonce = 'vf_complet' then
    v_nom := 'Airbnb — Vieille-France complète';
    v_etages := array['VFB', 'VFH'];
    v_salles := array['SVF', 'CVF'];
  elsif p_annonce = 'vf_bas' then
    v_nom := 'Airbnb — Vieille-France, étage du bas';
    v_etages := array['VFB'];
    v_salles := '{}';
  else
    raise exception 'Annonce Airbnb inconnue : %', p_annonce;
  end if;
  select c.entreprise_id into v_compagnie
  from reservations.compagnies c join core.entreprises x on x.id = c.entreprise_id
  order by (x.nom = 'GBPA+') desc, x.nom limit 1;

  for e in select * from jsonb_array_elements(p_evenements) loop
    v_ref := 'airbnb:' || p_annonce || ':' || (e ->> 'uid');
    v_refs := v_refs || v_ref;
    v_arrivee := (e ->> 'arrivee')::date;
    v_depart := (e ->> 'depart')::date;
    select * into r from reservations.reservations where ref_externe = v_ref;
    if r.id is null then
      v_exercice := reservations.exercice_de(v_arrivee);
      perform pg_advisory_xact_lock(hashtext('reservations.numero'), v_exercice);
      select coalesce(max(x.numero_seq), 100000) + 1 into v_seq
      from reservations.reservations x where x.exercice = v_exercice and x.numero_seq >= 100000;
      insert into reservations.reservations (numero, exercice, numero_seq, nom, compagnie_id, forfait, date_arrivee, date_depart,
        etages, salles, etape, origine, ref_externe, description)
      values (lpad((v_exercice % 100)::text, 2, '0') || '-A-' || lpad((v_seq - 100000)::text, 3, '0'), v_exercice, v_seq, v_nom,
        v_compagnie, 'accueil_groupe', v_arrivee, v_depart, v_etages, v_salles, 'confirmee', 'airbnb', v_ref,
        'Réservation Airbnb à compléter.' || coalesce(E'\n' || (e ->> 'lien'), ''))
      returning * into r;
      insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
      values (r.id, 'note', 'Réservation Airbnb reçue (' || v_nom || ')', 'Airbnb');
      v_ajoutees := v_ajoutees + 1;
    elsif r.date_arrivee <> v_arrivee or r.date_depart <> v_depart or r.fermeture = 'annulee' then
      v_note := 'Airbnb : ' || to_char(v_arrivee, 'YYYY-MM-DD') || ' → ' || to_char(v_depart, 'YYYY-MM-DD');
      if r.fermeture = 'annulee' then
        v_note := v_note || ' (de retour sur Airbnb)';
      end if;
      update reservations.reservations
      set date_arrivee = v_arrivee, date_depart = v_depart, fermeture = null
      where id = r.id;
      insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
      values (r.id, 'note', v_note, 'Airbnb');
      v_modifiees := v_modifiees + 1;
    end if;
  end loop;

  -- Disparues du calendrier Airbnb (à venir seulement) : annulées.
  for r in
    select * from reservations.reservations x
    where x.origine = 'airbnb' and x.ref_externe like 'airbnb:' || p_annonce || ':%'
      and x.fermeture is null and x.date_depart >= current_date and not (x.ref_externe = any (v_refs))
  loop
    update reservations.reservations set fermeture = 'annulee' where id = r.id;
    insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
    values (r.id, 'note', 'Annulée sur Airbnb (disparue du calendrier)', 'Airbnb');
    v_annulees := v_annulees + 1;
  end loop;

  return jsonb_build_object('ajoutees', v_ajoutees, 'modifiees', v_modifiees, 'annulees', v_annulees);
end;
$$;

-- ------------------------------------------------------------
-- Pas de groupe confirmé par-dessus Airbnb
-- ------------------------------------------------------------

-- Réservation Airbnb active qui occupe les mêmes étages ou salles les mêmes nuits.
create function reservations.conflit_airbnb(p_id uuid, p_arrivee date, p_depart date, p_etages text[], p_salles text[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select x.numero || ' (' || to_char(x.date_arrivee, 'YYYY-MM-DD') || ' → ' || to_char(x.date_depart, 'YYYY-MM-DD') || ')'
  from reservations.reservations x
  where x.origine = 'airbnb' and x.fermeture is null and x.id <> p_id
    and reservations.nuits(x.date_arrivee, x.date_depart) && reservations.nuits(p_arrivee, p_depart)
    and (x.etages && p_etages or x.salles && p_salles)
  order by x.date_arrivee
  limit 1
$$;

-- L'équipe ne confirme pas (ni ne déplace une réservation confirmée) sur une
-- réservation Airbnb. La signature du client (sans session) n'est pas
-- bloquée : le conflit s'affiche alors dans la fiche.
create function reservations.verifier_vf_airbnb()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflit text;
begin
  if auth.uid() is null or new.origine = 'airbnb' or not reservations.est_confirmee(new.etape, new.fermeture, new.origine) then
    return new;
  end if;
  v_conflit := reservations.conflit_airbnb(new.id, new.date_arrivee, new.date_depart, new.etages, new.salles);
  if v_conflit is not null then
    raise exception 'La Vieille-France est réservée sur Airbnb ces nuits-là : %. Changez les dates ou les sections avant de confirmer.', v_conflit;
  end if;
  return new;
end;
$$;

create trigger trg_reservations_vf_airbnb
before update of etape, fermeture, etages, salles, date_arrivee, date_depart on reservations.reservations
for each row execute function reservations.verifier_vf_airbnb();

revoke execute on function
  reservations.recevoir_airbnb(text, jsonb),
  reservations.conflit_airbnb(uuid, date, date, text[], text[]),
  reservations.verifier_vf_airbnb()
from public;

grant execute on function reservations.nuits(date, date), reservations.est_confirmee(text, text, text) to authenticated, service_role;
grant execute on function reservations.recevoir_airbnb(text, jsonb) to service_role;
