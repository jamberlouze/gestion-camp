-- ============================================================
-- Réservations : le client confirme les informations de son séjour sur sa
-- page (pré-arrivée), au lieu de les renvoyer par un nouveau PDF.
--
-- Demande de Maxime (2026-10-14) : « Je confirme » ou « Je propose un
-- changement ». Un changement est une demande que l'équipe accepte ou
-- refuse (avec un message au client, affiché sur sa page) ; accepté, il met
-- le séjour à jour comme l'équipe l'aurait fait à la main ; l'estimé n'est
-- jamais touché. Tout est gardé : cette table, le journal de la réservation
-- et les échanges du CRM, jusqu'aux changements de dernière minute.
-- Les règles (« dans les règles » / « hors règle ») sont dans
-- src/modules/reservations/confirmation.ts : une indication, rien d'automatique.
-- ============================================================

create table reservations.confirmations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  genre text not null check (genre in ('confirmation', 'changement')),
  -- Confirmation : recue. Changement : a_traiter → acceptee / refusee, ou
  -- remplacee (le client en a proposé un autre avant la réponse).
  statut text not null check (statut in ('recue', 'a_traiter', 'acceptee', 'refusee', 'remplacee')),
  recue_le timestamptz not null default now(),
  -- Nom donné par le client.
  nom text not null check (btrim(nom) <> ''),
  -- Le séjour tel qu'affiché au client à ce moment (reservations.infos_sejour).
  actuel jsonb not null,
  -- Changement : le séjour proposé (mêmes clés).
  propose jsonb,
  message text,
  adresse_ip text,
  navigateur text,
  -- Réponse de l'équipe, affichée au client sur sa page.
  reponse text,
  traitee_le timestamptz,
  traitee_par uuid references core.profils(id) on delete set null,
  traitee_par_nom text,
  check ((genre = 'confirmation') = (statut = 'recue')),
  check (genre = 'confirmation' or propose is not null)
);

create index idx_reservations_confirmations on reservations.confirmations (reservation_id, recue_le desc);
-- Une seule demande de changement en attente par réservation.
create unique index reservations_un_changement_ouvert on reservations.confirmations (reservation_id) where statut = 'a_traiter';

alter table reservations.confirmations enable row level security;
grant select on reservations.confirmations to authenticated;
grant all on reservations.confirmations to service_role;
-- Aucune écriture directe : tout passe par les fonctions plus bas.
create policy "Lire" on reservations.confirmations for select to authenticated using (core.peut_lire('reservations'));
alter publication supabase_realtime add table reservations.confirmations;

-- ------------------------------------------------------------
-- Outils
-- ------------------------------------------------------------

-- Ce que le client confirme ou change (mêmes clés que InfosSejour, confirmation.ts).
create function reservations.infos_sejour(r reservations.reservations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'date_arrivee', r.date_arrivee,
    'date_depart', r.date_depart,
    'heure_arrivee', to_char(r.heure_arrivee, 'HH24:MI'),
    'heure_depart', to_char(r.heure_depart, 'HH24:MI'),
    'nb_participants', r.nb_participants,
    'nb_accompagnateurs', r.nb_accompagnateurs,
    'ages', r.ages,
    'langue', r.langue,
    'ratio', r.ratio,
    'service_repas', r.service_repas,
    'nb_dejeuners', r.nb_dejeuners,
    'nb_diners', r.nb_diners,
    'nb_soupers', r.nb_soupers)
$$;

-- Le client peut confirmer ou proposer un changement : contrat signé (ou
-- réservation confirmée), pas fermée, jusqu'à la fin du séjour
-- (confirmationOuverte, confirmation.ts).
create function reservations.confirmation_ouverte(r reservations.reservations)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.fermeture is null
    and r.origine <> 'airbnb'
    and (r.signe_le is not null or r.etape in ('confirmee', 'pre_arrivee'))
    and r.date_depart >= (now() at time zone 'America/Toronto')::date
$$;

-- « Élèves : 54 → 60 ; Départ : 2027-05-14 → 2027-05-15 » (journal, CRM).
create function reservations.texte_changement(p_forfait text, a jsonb, p jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
    c.libelle || ' : '
      || case when c.cle = 'service_repas' then case when (a ->> c.cle)::boolean then 'oui' else 'non' end
              else coalesce(nullif(a ->> c.cle, ''), '—') end
      || ' → '
      || case when c.cle = 'service_repas' then case when (p ->> c.cle)::boolean then 'oui' else 'non' end
              else coalesce(nullif(p ->> c.cle, ''), '—') end,
    ' ; ' order by c.ordre), '')
  from (values
    (1, 'date_arrivee', case when p_forfait in ('journee_plein_air', 'location_salle') then 'Date' else 'Arrivée' end),
    (2, 'date_depart', 'Départ'),
    (3, 'heure_arrivee', 'Heure d''arrivée'),
    (4, 'heure_depart', 'Heure de départ'),
    (5, 'nb_participants', case when p_forfait in ('classe_nature', 'journee_plein_air') then 'Élèves' else 'Personnes' end),
    (6, 'nb_accompagnateurs', 'Accompagnateurs'),
    (7, 'ages', 'Âges et niveaux'),
    (8, 'ratio', 'Ratio'),
    (9, 'langue', 'Langue'),
    (10, 'service_repas', 'Service de repas'),
    (11, 'nb_dejeuners', 'Déjeuners'),
    (12, 'nb_diners', 'Dîners'),
    (13, 'nb_soupers', 'Soupers')
  ) as c(ordre, cle, libelle)
  where (a -> c.cle) is distinct from (p -> c.cle)
    -- Séjour d'un jour : le départ suit la date.
    and not (p_forfait in ('journee_plein_air', 'location_salle') and c.cle = 'date_depart')
    -- Classe nature : le service de repas est toujours inclus.
    and not (p_forfait = 'classe_nature' and c.cle = 'service_repas')
$$;

-- Date AAAA-MM-JJ, ou null si elle est invalide.
create function reservations.lire_date(t text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return t::date;
exception when others then
  return null;
end;
$$;

-- Réservation d'un lien client valide (null sinon).
create function reservations.reservation_du_lien(p_jeton text)
returns reservations.reservations
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from reservations.reservations r
  where r.jeton_client = p_jeton and length(coalesce(p_jeton, '')) = 48
$$;

-- Au plus 20 réponses par jour et par réservation (page publique).
create function reservations.verifier_rythme_confirmations(p_reservation uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from reservations.confirmations c
      where c.reservation_id = p_reservation and c.recue_le > now() - interval '1 day') >= 20 then
    raise exception 'Trop de réponses aujourd''hui : écrivez-nous plutôt par courriel.';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Page client : ce qui est affiché
-- ------------------------------------------------------------
create function reservations.confirmation_client(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
begin
  r := reservations.reservation_du_lien(p_jeton);
  if r.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'ouverte', reservations.confirmation_ouverte(r),
    'infos', reservations.infos_sejour(r),
    'confirmee', (
      select jsonb_build_object('nom', c.nom, 'recue_le', c.recue_le, 'actuel', c.actuel)
      from reservations.confirmations c
      where c.reservation_id = r.id and c.genre = 'confirmation'
      order by c.recue_le desc limit 1),
    'en_attente', (
      select jsonb_build_object('nom', c.nom, 'recue_le', c.recue_le, 'actuel', c.actuel, 'propose', c.propose, 'message', c.message)
      from reservations.confirmations c
      where c.reservation_id = r.id and c.statut = 'a_traiter'),
    'decisions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'statut', d.statut, 'recue_le', d.recue_le, 'traitee_le', d.traitee_le,
        'actuel', d.actuel, 'propose', d.propose, 'reponse', d.reponse) order by d.traitee_le desc), '[]')
      from (
        select * from reservations.confirmations c
        where c.reservation_id = r.id and c.statut in ('acceptee', 'refusee')
        order by c.traitee_le desc limit 5) d));
end;
$$;

-- ------------------------------------------------------------
-- « Je confirme » : les informations affichées sont bonnes.
-- ------------------------------------------------------------
create function reservations.confirmer_infos_client(p_jeton text, p_nom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  v_nom text := left(nullif(btrim(coalesce(p_nom, '')), ''), 200);
  v_entetes json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_infos jsonb;
begin
  r := reservations.reservation_du_lien(p_jeton);
  if r.id is null then
    raise exception 'Lien invalide.';
  end if;
  if not reservations.confirmation_ouverte(r) then
    raise exception 'Ces informations ne sont plus à confirmer en ligne : écrivez-nous plutôt.';
  end if;
  if v_nom is null then
    raise exception 'Votre nom est obligatoire.';
  end if;
  perform reservations.verifier_rythme_confirmations(r.id);
  v_infos := reservations.infos_sejour(r);

  insert into reservations.confirmations (reservation_id, genre, statut, nom, actuel, adresse_ip, navigateur)
  values (r.id, 'confirmation', 'recue', v_nom, v_infos,
    split_part(coalesce(v_entetes ->> 'x-forwarded-for', v_entetes ->> 'x-real-ip', ''), ',', 1),
    left(v_entetes ->> 'user-agent', 300));

  perform set_config('reservations.signataire', v_nom, true);
  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'note', 'Informations du séjour confirmées en ligne par ' || v_nom);
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, reservation_id, contact_id, genre, texte, auteur_nom)
    values (r.organisation_id, r.id, r.contact_reservation_id, 'note',
      'Informations du séjour confirmées par la page client (' || v_nom || ') : '
        || concat_ws(', ',
          r.date_arrivee::text || case when r.date_depart <> r.date_arrivee then ' au ' || r.date_depart::text else '' end,
          r.nb_participants || case when r.forfait in ('classe_nature', 'journee_plein_air') then ' élèves' else ' personnes' end,
          case when r.nb_accompagnateurs is not null then r.nb_accompagnateurs || ' accompagnateurs' end,
          case when r.ratio is not null then 'ratio ' || r.ratio end),
      v_nom || ' (client)');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- « Je propose un changement » : une demande que l'équipe accepte ou
-- refuse. Une nouvelle demande remplace celle qui attend encore.
-- p_propose : clés de InfosSejour (les autres sont ignorées).
-- ------------------------------------------------------------
create function reservations.proposer_changement_client(p_jeton text, p_nom text, p_propose jsonb, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  q jsonb := coalesce(p_propose, '{}'::jsonb);
  v_nom text := left(nullif(btrim(coalesce(p_nom, '')), ''), 200);
  v_message text := left(nullif(btrim(coalesce(p_message, '')), ''), 4000);
  v_entetes json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_auj date := (now() at time zone 'America/Toronto')::date;
  v_actuel jsonb;
  v_p jsonb;
  v_un_jour boolean;
  v_scolaire boolean;
  v_arrivee date;
  v_depart date;
  v_t text;
  v_cle text;
  v_ancienne uuid;
  v_id uuid;
  v_texte text;
begin
  r := reservations.reservation_du_lien(p_jeton);
  if r.id is null then
    raise exception 'Lien invalide.';
  end if;
  if not reservations.confirmation_ouverte(r) then
    raise exception 'Ces informations ne se changent plus en ligne : écrivez-nous plutôt.';
  end if;
  if v_nom is null then
    raise exception 'Votre nom est obligatoire.';
  end if;
  perform reservations.verifier_rythme_confirmations(r.id);

  v_un_jour := r.forfait in ('journee_plein_air', 'location_salle');
  v_scolaire := r.forfait in ('classe_nature', 'journee_plein_air');
  v_actuel := reservations.infos_sejour(r);
  v_p := v_actuel;

  -- Dates.
  v_arrivee := r.date_arrivee;
  v_depart := r.date_depart;
  if q ? 'date_arrivee' then
    v_arrivee := reservations.lire_date(q ->> 'date_arrivee');
    if v_arrivee is null then
      raise exception 'Date d''arrivée invalide.';
    end if;
  end if;
  if not v_un_jour and q ? 'date_depart' then
    v_depart := reservations.lire_date(q ->> 'date_depart');
    if v_depart is null then
      raise exception 'Date de départ invalide.';
    end if;
  end if;
  if v_un_jour then
    v_depart := v_arrivee;
  end if;
  if v_arrivee is distinct from r.date_arrivee and v_arrivee < v_auj then
    raise exception 'Choisissez une date à venir.';
  end if;
  if v_depart < v_arrivee then
    raise exception 'Le départ doit être le jour de l''arrivée ou après.';
  end if;
  v_p := v_p || jsonb_build_object('date_arrivee', v_arrivee, 'date_depart', v_depart);

  -- Heures.
  foreach v_cle in array array['heure_arrivee', 'heure_depart'] loop
    if q ? v_cle then
      v_t := nullif(btrim(coalesce(q ->> v_cle, '')), '');
      if v_t is not null and v_t !~ '^([01]\d|2[0-3]):[0-5]\d$' then
        raise exception 'Heure invalide.';
      end if;
      v_p := v_p || jsonb_build_object(v_cle, v_t);
    end if;
  end loop;

  -- Nombres (participants ; accompagnateurs : écoles seulement).
  foreach v_cle in array array['nb_participants', 'nb_accompagnateurs'] loop
    if q ? v_cle and (v_cle = 'nb_participants' or v_scolaire) then
      v_t := nullif(btrim(coalesce(q ->> v_cle, '')), '');
      if v_t is not null and v_t !~ '^\d{1,4}$' then
        raise exception 'Entrez un nombre entier.';
      end if;
      v_p := v_p || jsonb_build_object(v_cle, v_t::integer);
    end if;
  end loop;

  -- Repas.
  foreach v_cle in array array['nb_dejeuners', 'nb_diners', 'nb_soupers'] loop
    if q ? v_cle then
      v_t := coalesce(nullif(btrim(coalesce(q ->> v_cle, '')), ''), '0');
      if v_t !~ '^\d{1,2}$' then
        raise exception 'Entrez un nombre de repas entier.';
      end if;
      v_p := v_p || jsonb_build_object(v_cle, v_t::integer);
    end if;
  end loop;
  if r.forfait <> 'classe_nature' and q ? 'service_repas' and jsonb_typeof(q -> 'service_repas') = 'boolean' then
    v_p := v_p || jsonb_build_object('service_repas', (q ->> 'service_repas')::boolean);
  end if;

  -- Textes et ratio (écoles seulement pour les âges et le ratio).
  if q ? 'langue' then
    v_p := v_p || jsonb_build_object('langue', left(nullif(btrim(coalesce(q ->> 'langue', '')), ''), 100));
  end if;
  if v_scolaire and q ? 'ages' then
    v_p := v_p || jsonb_build_object('ages', left(nullif(btrim(coalesce(q ->> 'ages', '')), ''), 500));
  end if;
  if v_scolaire and q ? 'ratio' then
    v_t := nullif(q ->> 'ratio', '');
    if v_t is not null and v_t not in ('1:10', '1:15', '1:20', '1:30', '1:X', 'aucun') then
      raise exception 'Ratio inconnu.';
    end if;
    v_p := v_p || jsonb_build_object('ratio', v_t);
  end if;

  v_texte := reservations.texte_changement(r.forfait, v_actuel, v_p);
  if v_texte = '' then
    raise exception 'Aucun changement aux informations : utilisez « Je confirme », ou écrivez-nous plus bas.';
  end if;

  -- La demande qui attend encore est remplacée (et sa relance annulée).
  update reservations.confirmations set statut = 'remplacee', traitee_le = now(), traitee_par_nom = v_nom || ' (client)'
  where reservation_id = r.id and statut = 'a_traiter'
  returning id into v_ancienne;
  if v_ancienne is not null then
    update crm.relances set statut = 'annulee' where source_cle = 'changement:' || v_ancienne and statut = 'a_faire';
  end if;

  insert into reservations.confirmations (reservation_id, genre, statut, nom, actuel, propose, message, adresse_ip, navigateur)
  values (r.id, 'changement', 'a_traiter', v_nom, v_actuel, v_p, v_message,
    split_part(coalesce(v_entetes ->> 'x-forwarded-for', v_entetes ->> 'x-real-ip', ''), ',', 1),
    left(v_entetes ->> 'user-agent', 300))
  returning id into v_id;

  perform set_config('reservations.signataire', v_nom, true);
  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'note', 'Changement proposé en ligne par ' || v_nom || ' : ' || v_texte || coalesce(' — « ' || v_message || ' »', ''));
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, reservation_id, contact_id, genre, texte, auteur_nom)
    values (r.organisation_id, r.id, r.contact_reservation_id, 'note',
      'Changement proposé par la page client (' || v_nom || ') : ' || v_texte || coalesce(E'\nMessage : ' || v_message, ''),
      v_nom || ' (client)');
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, auteur_nom, source_cle)
    values (r.organisation_id, r.id, r.numero || ' : accepter ou refuser le changement demandé par le client',
      v_auj, r.responsable_id, v_nom || ' (client)', 'changement:' || v_id);
  end if;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- L'équipe accepte ou refuse un changement. Accepté : seuls les champs
-- que le client a changés sont écrits dans la réservation (comme à la main,
-- mêmes vérifications : disponibilités Airbnb…) ; l'estimé ne change pas.
-- Refusé : un message au client est obligatoire.
-- ------------------------------------------------------------
create function reservations.traiter_changement(p_confirmation uuid, p_accepter boolean, p_reponse text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c reservations.confirmations;
  r reservations.reservations;
  a jsonb;
  p jsonb;
  v_reponse text := left(nullif(btrim(coalesce(p_reponse, '')), ''), 4000);
  v_qui text := reservations.nom_de(auth.uid());
  v_texte text;
  change boolean;
begin
  if not core.peut_ecrire('reservations') then
    raise exception 'Accès refusé.';
  end if;
  -- Au journal au nom de qui traite (jamais au nom d'un client).
  perform set_config('reservations.signataire', '', true);
  select * into c from reservations.confirmations where id = p_confirmation for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if c.statut <> 'a_traiter' then
    raise exception 'Cette demande a déjà été traitée.';
  end if;
  if not coalesce(p_accepter, false) and v_reponse is null then
    raise exception 'Écrivez au client pourquoi le changement est refusé.';
  end if;
  select * into r from reservations.reservations where id = c.reservation_id for update;
  a := c.actuel;
  p := c.propose;
  v_texte := reservations.texte_changement(r.forfait, a, p);

  if coalesce(p_accepter, false) then
    update reservations.reservations set
      date_arrivee = case when (p -> 'date_arrivee') is distinct from (a -> 'date_arrivee') then (p ->> 'date_arrivee')::date else date_arrivee end,
      date_depart = case when (p -> 'date_depart') is distinct from (a -> 'date_depart') then (p ->> 'date_depart')::date else date_depart end,
      heure_arrivee = case when (p -> 'heure_arrivee') is distinct from (a -> 'heure_arrivee') then (p ->> 'heure_arrivee')::time else heure_arrivee end,
      heure_depart = case when (p -> 'heure_depart') is distinct from (a -> 'heure_depart') then (p ->> 'heure_depart')::time else heure_depart end,
      nb_participants = case when (p -> 'nb_participants') is distinct from (a -> 'nb_participants') then (p ->> 'nb_participants')::integer else nb_participants end,
      nb_accompagnateurs = case when (p -> 'nb_accompagnateurs') is distinct from (a -> 'nb_accompagnateurs') then (p ->> 'nb_accompagnateurs')::integer else nb_accompagnateurs end,
      ages = case when (p -> 'ages') is distinct from (a -> 'ages') then p ->> 'ages' else ages end,
      langue = case when (p -> 'langue') is distinct from (a -> 'langue') then p ->> 'langue' else langue end,
      ratio = case when (p -> 'ratio') is distinct from (a -> 'ratio') then p ->> 'ratio' else ratio end,
      service_repas = case when (p -> 'service_repas') is distinct from (a -> 'service_repas') then (p ->> 'service_repas')::boolean else service_repas end,
      nb_dejeuners = case when (p -> 'nb_dejeuners') is distinct from (a -> 'nb_dejeuners') then (p ->> 'nb_dejeuners')::integer else nb_dejeuners end,
      nb_diners = case when (p -> 'nb_diners') is distinct from (a -> 'nb_diners') then (p ->> 'nb_diners')::integer else nb_diners end,
      nb_soupers = case when (p -> 'nb_soupers') is distinct from (a -> 'nb_soupers') then (p ->> 'nb_soupers')::integer else nb_soupers end
    where id = r.id;
  end if;

  update reservations.confirmations set
    statut = case when coalesce(p_accepter, false) then 'acceptee' else 'refusee' end,
    reponse = v_reponse,
    traitee_le = now(),
    traitee_par = auth.uid(),
    traitee_par_nom = v_qui
  where id = c.id;

  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'note',
    case when coalesce(p_accepter, false) then 'Changement demandé par le client accepté (séjour mis à jour) : ' else 'Changement demandé par le client refusé : ' end
      || v_texte || coalesce(' — message au client : « ' || v_reponse || ' »', ''));
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, reservation_id, contact_id, genre, texte)
    values (r.organisation_id, r.id, r.contact_reservation_id, 'note',
      case when coalesce(p_accepter, false) then 'Changement demandé par le client accepté : ' else 'Changement demandé par le client refusé : ' end
        || v_texte || coalesce(E'\nMessage au client (page client) : ' || v_reponse, ''));
  end if;
  update crm.relances set statut = 'faite' where source_cle = 'changement:' || c.id and statut = 'a_faire';
end;
$$;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
revoke execute on function
  reservations.infos_sejour(reservations.reservations),
  reservations.confirmation_ouverte(reservations.reservations),
  reservations.texte_changement(text, jsonb, jsonb),
  reservations.lire_date(text),
  reservations.reservation_du_lien(text),
  reservations.verifier_rythme_confirmations(uuid),
  reservations.confirmation_client(text),
  reservations.confirmer_infos_client(text, text),
  reservations.proposer_changement_client(text, text, jsonb, text),
  reservations.traiter_changement(uuid, boolean, text)
from public;

grant execute on function
  reservations.confirmation_client(text),
  reservations.confirmer_infos_client(text, text),
  reservations.proposer_changement_client(text, text, jsonb, text)
to anon, authenticated;

grant execute on function
  reservations.infos_sejour(reservations.reservations),
  reservations.confirmation_ouverte(reservations.reservations),
  reservations.texte_changement(text, jsonb, jsonb),
  reservations.traiter_changement(uuid, boolean, text)
to authenticated;

grant execute on function
  reservations.infos_sejour(reservations.reservations),
  reservations.confirmation_ouverte(reservations.reservations),
  reservations.texte_changement(text, jsonb, jsonb),
  reservations.lire_date(text),
  reservations.reservation_du_lien(text),
  reservations.verifier_rythme_confirmations(uuid),
  reservations.confirmation_client(text),
  reservations.confirmer_infos_client(text, text),
  reservations.proposer_changement_client(text, text, jsonb, text)
to service_role;
