-- ============================================================
-- Réservations : courriels envoyés par une fenêtre, un seul fil Gmail par
-- réservation, preuve écrite de l'acceptation, avis à l'équipe.
--
-- Réunion du 2026-10-21 (Maxime + coordonnatrice des groupes) : une touche
-- personnelle dans chaque courriel, l'automatisation invisible pour l'école.
--
-- 1. « Envoyer l'estimé… » et « Envoyer le contrat… » ouvrent une fenêtre
--    (À, Cc, Sujet, Texte, PDF joint) ; le Worker envoie, puis
--    reservations.courriel_parti note tout d'un coup : l'estimé passe
--    « envoyé » (figé, visible au client) SEULEMENT quand le courriel est
--    parti, son PDF est gardé, le contrat passe « Contrat envoyé ».
--    changer_estime n'envoie plus et n'accepte plus.
-- 2. Un seul fil Gmail par réservation (reservations.fils_courriel) :
--    threadId + Message-ID du premier et du dernier courriel ; les suivants
--    partent avec threadId, In-Reply-To / References et le même sujet.
-- 3. « Accepté par le client » exige la preuve écrite (date + texte du
--    courriel du client) : reservations.accepter_estime_equipe.
-- 4. Avis à inscriptions@ pour toute nouvelle demande et tout changement
--    demandé par le client : avis_envoye_le, pris par le Worker
--    (reservations.avis_prendre) à la réception d'une demande et aux 15 minutes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fil Gmail d'une réservation
-- ------------------------------------------------------------
create table reservations.fils_courriel (
  reservation_id uuid primary key references reservations.reservations(id) on delete cascade,
  -- Transport du fil : un fil Mailpit (DEV) n'est jamais repris par Gmail.
  transport text not null check (transport in ('gmail', 'mailpit')),
  -- Identifiant du fil dans la boîte inscriptions@ (Gmail ; null en DEV).
  thread_id text,
  -- Sujet du fil, fixé au premier courriel (Gmail exige le même sujet).
  sujet text not null check (btrim(sujet) <> ''),
  -- En-têtes Message-ID (« <…> ») du premier et du dernier courriel du fil,
  -- relus après l'envoi (jamais devinés).
  premier_message_id text,
  dernier_message_id text,
  courriels integer not null default 1,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

alter table reservations.fils_courriel enable row level security;
create policy "Lire" on reservations.fils_courriel for select to authenticated using (core.peut_lire('reservations'));
grant select on reservations.fils_courriel to authenticated;
grant all on reservations.fils_courriel to service_role;
-- Aucune écriture par l'app : seul le Worker (courriel_parti) tient le fil.

-- Sujet de départ des modèles : celui du fil (« Réservation 27-G-083 · École »).
-- Le sujet d'un modèle ne sert qu'au premier courriel de la réservation ;
-- les suivants gardent le sujet du fil. Seuls les sujets de départ
-- (jamais modifiés) sont remplacés.
update reservations.modeles_courriels set sujet_fr = 'Réservation {{numero}} · {{groupe}}'
where sujet_fr in (
  'Demande reçue — {{numero}}', 'Votre estimé — {{groupe}} ({{numero}})', 'Votre contrat à signer — {{numero}}',
  'Rappel : contrat à signer — {{numero}}', 'Facture {{facture_numero}} — {{groupe}} ({{numero}})',
  'Facture finale — {{groupe}} ({{numero}})', 'Rappel de paiement — facture {{facture_numero}}',
  'Préparer votre séjour — {{groupe}} ({{numero}})', 'Fiches participants à remplir — {{groupe}}', 'Merci ! — {{groupe}}');
update reservations.modeles_courriels set sujet_en = 'Reservation {{numero}} · {{groupe}}'
where sujet_en in (
  'Request received — {{numero}}', 'Your estimate — {{groupe}} ({{numero}})', 'Your contract to sign — {{numero}}',
  'Reminder: contract to sign — {{numero}}', 'Invoice {{facture_numero}} — {{groupe}} ({{numero}})',
  'Final invoice — {{groupe}} ({{numero}})', 'Payment reminder — invoice {{facture_numero}}',
  'Getting ready for your stay — {{groupe}} ({{numero}})', 'Participant forms to fill out — {{groupe}}', 'Thank you! — {{groupe}}');

-- Fiches participants sur la page client (sous-agent Client, 2026-10-21 :
-- le lien des fiches paraît à la signature, le prof voit les fiches reçues
-- avec allergies et diètes). replace() : un modèle déjà modifié par
-- l'équipe ne change que s'il porte encore la phrase de départ.
-- {{fiches_participants}} = « oui » pour Classe nature et Journée plein air.
update reservations.modeles_courriels set
  corps_fr = replace(corps_fr, E'La réservation est confirmée à la réception du premier versement.',
    E'{{#si fiches_participants}}Une fois le contrat signé, le lien des fiches participants paraîtra aussi sur votre page.\n\n{{/si}}La réservation est confirmée à la réception du premier versement.'),
  corps_en = replace(corps_en, E'The reservation is confirmed once the first payment is received.',
    E'{{#si fiches_participants}}Once the contract is signed, the participant forms link will also appear on your page.\n\n{{/si}}The reservation is confirmed once the first payment is received.')
where genre = 'contrat';
update reservations.modeles_courriels set
  corps_fr = replace(corps_fr, E'Transmettez ce lien aux parents et aux accompagnateurs :\n{{lien_fiches}}\n',
    E'Transmettez ce lien aux parents et aux accompagnateurs :\n{{lien_fiches}}\n\nVous voyez sur votre page les fiches reçues, avec les allergies et la diète de chacun :\n{{lien_client}}\n'),
  corps_en = replace(corps_en, E'Please share this link with parents and chaperones:\n{{lien_fiches}}\n',
    E'Please share this link with parents and chaperones:\n{{lien_fiches}}\n\nYour page shows the forms received so far, with each person''s allergies and diet:\n{{lien_client}}\n')
where genre = 'pre_arrivee';
update reservations.modeles_courriels set
  corps_fr = replace(corps_fr, E'de remplir la leur :\n{{lien_fiches}}\n',
    E'de remplir la leur :\n{{lien_fiches}}\n\nVous voyez sur votre page les fiches reçues, avec les allergies et la diète de chacun :\n{{lien_client}}\n'),
  corps_en = replace(corps_en, E'to fill out theirs:\n{{lien_fiches}}\n',
    E'to fill out theirs:\n{{lien_fiches}}\n\nYour page shows the forms received so far, with each person''s allergies and diet:\n{{lien_client}}\n')
where genre = 'rappel_fiches';

-- « 21 octobre 2026 », « 1er octobre 2026 » (journal).
create function reservations.jour_texte(d date)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from d)::int || case when extract(day from d) = 1 then 'er' else '' end || ' '
    || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from d)::int]
    || ' ' || extract(year from d)::int
$$;

-- ------------------------------------------------------------
-- 2. Courriel de la fenêtre (estimé, contrat) : préparé par le Worker juste
--    avant l'envoi, avec ce que l'équipe a écrit. Même clé que la file
--    (« estime:<id> », « contrat:<signature> ») : jamais deux fois.
-- ------------------------------------------------------------
create function reservations.courriel_fenetre(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_statut text;
  v_nouveau boolean := false;
  v_a text[] := array(select jsonb_array_elements_text(coalesce(p -> 'a', '[]')));
  v_cc text[] := array(select jsonb_array_elements_text(coalesce(p -> 'cc', '[]')));
begin
  select id, statut into v_id, v_statut from reservations.courriels where cle = p ->> 'cle' for update;
  if v_id is null then
    insert into reservations.courriels (reservation_id, genre, cle, ref, langue, a, cc, sujet, corps)
    values ((p ->> 'reservation_id')::uuid, p ->> 'genre', p ->> 'cle', nullif(p ->> 'ref', '')::uuid, p ->> 'langue',
      v_a, v_cc, p ->> 'sujet', p ->> 'corps')
    returning id into v_id;
    v_nouveau := true;
  elsif v_statut = 'envoye' then
    raise exception 'Ce courriel est déjà parti.';
  else
    -- Préparé par l'ancienne file (ou annulé) : repris avec le texte de la fenêtre.
    update reservations.courriels set
      statut = 'prepare', langue = p ->> 'langue', a = v_a, cc = v_cc, sujet = p ->> 'sujet', corps = p ->> 'corps',
      erreur = null, raison = null, annule_le = null, annule_par_nom = null, prepare_le = now()
    where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'nouveau', v_nouveau);
end;
$$;

-- ------------------------------------------------------------
-- 3. Après l'envoi (fenêtre ou file) : tout est noté d'un coup.
--    p : { courriel_id, sujet, auteur, transport, message_id (Gmail ou
--    Mailpit), thread_id, message_rfc (en-tête Message-ID relu), nom_genre,
--    document? : { id, chemin, titre, empreinte, estime_id } }
-- ------------------------------------------------------------
create function reservations.courriel_parti(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c reservations.courriels;
  r reservations.reservations;
  e reservations.estimes;
  f reservations.fils_courriel;
  v_auteur text := nullif(p ->> 'auteur', '');
  v_sujet text := coalesce(nullif(btrim(p ->> 'sujet'), ''), '');
  v_transport text := p ->> 'transport';
  v_rfc text := nullif(p ->> 'message_rfc', '');
  v_dest text;
  v_doc jsonb := p -> 'document';
begin
  select * into c from reservations.courriels where id = (p ->> 'courriel_id')::uuid for update;
  if not found then
    raise exception 'Courriel introuvable.';
  end if;
  if c.statut = 'envoye' then
    return;
  end if;
  if v_sujet = '' then
    v_sujet := c.sujet;
  end if;
  select * into r from reservations.reservations where id = c.reservation_id;

  update reservations.courriels set
    statut = 'envoye', envoye_le = now(), envoye_par_nom = v_auteur, message_id = nullif(p ->> 'message_id', ''),
    sujet = v_sujet, erreur = null
  where id = c.id;

  -- Le fil de la réservation : créé au premier courriel, sinon prolongé.
  select * into f from reservations.fils_courriel where reservation_id = c.reservation_id for update;
  if not found or f.transport <> v_transport then
    delete from reservations.fils_courriel where reservation_id = c.reservation_id;
    insert into reservations.fils_courriel (reservation_id, transport, thread_id, sujet, premier_message_id, dernier_message_id)
    values (c.reservation_id, v_transport, nullif(p ->> 'thread_id', ''), v_sujet, v_rfc, v_rfc);
  else
    update reservations.fils_courriel set
      thread_id = coalesce(nullif(p ->> 'thread_id', ''), thread_id),
      premier_message_id = coalesce(premier_message_id, v_rfc),
      dernier_message_id = coalesce(v_rfc, dernier_message_id),
      courriels = courriels + 1,
      maj_le = now()
    where reservation_id = c.reservation_id;
  end if;

  -- PDF joint (estimé de la fenêtre) : gardé dans les documents.
  if jsonb_typeof(v_doc) = 'object' then
    insert into reservations.documents (id, reservation_id, genre, estime_id, titre, chemin, empreinte, meta, cree_par_nom)
    values ((v_doc ->> 'id')::uuid, c.reservation_id, 'estime', nullif(v_doc ->> 'estime_id', '')::uuid, v_doc ->> 'titre',
      v_doc ->> 'chemin', v_doc ->> 'empreinte', '{}', v_auteur);
  end if;

  -- Estimé : envoyé (figé, visible au client) seulement maintenant.
  if c.genre = 'estime' then
    select * into e from reservations.estimes where id = c.ref and reservation_id = c.reservation_id for update;
    if found and e.statut = 'brouillon' then
      update reservations.estimes set statut = 'remplace'
      where reservation_id = e.reservation_id and id <> e.id and statut in ('envoye', 'accepte');
      update reservations.estimes set statut = 'envoye', envoye_le = now() where id = e.id;
      update reservations.reservations set etape = 'estime_envoye'
      where id = e.reservation_id and etape in ('nouvelle', 'contact');
      insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
      values (e.reservation_id, 'document', 'Estimé v' || e.version || ' envoyé (' || e.total || ' $ taxes comprises)', v_auteur);
    end if;
  -- Contrat : « Contrat envoyé » à l'envoi réel ; délai de signature compté d'aujourd'hui.
  elsif c.genre = 'contrat' then
    update reservations.signatures set envoye_le = now(), echeance = (now() at time zone 'America/Toronto')::date + 7
    where id = c.ref and statut = 'en_attente';
    update reservations.reservations set etape = 'contrat_envoye'
    where id = c.reservation_id and etape in ('nouvelle', 'contact', 'estime_envoye', 'estime_accepte');
  end if;

  v_dest := array_to_string(c.a || c.cc, ', ');
  insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
  values (c.reservation_id, 'courriel',
    'Courriel « ' || coalesce(nullif(p ->> 'nom_genre', ''), v_sujet) || ' » envoyé à ' || v_dest
      || case when v_transport = 'mailpit' then ' (DEV : Mailpit)' else '' end,
    v_auteur);
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, contact_id, reservation_id, genre, jour, texte, auteur_nom)
    values (r.organisation_id, r.contact_reservation_id, r.id, 'courriel', (now() at time zone 'America/Toronto')::date,
      coalesce(nullif(p ->> 'nom_genre', ''), 'Courriel') || ' (« ' || v_sujet || ' ») — envoyé par l''app à ' || v_dest || '.',
      v_auteur);
  end if;
  -- Lignes ajoutées par les déclencheurs (étape, document) : au nom de qui a envoyé.
  update reservations.journal set auteur_nom = v_auteur
  where reservation_id = c.reservation_id and quand = now() and auteur is null and auteur_nom is null and v_auteur is not null;
end;
$$;

-- ------------------------------------------------------------
-- 4. Estimés : changer_estime n'envoie plus (fenêtre + Worker) et n'accepte
--    plus sans preuve (accepter_estime_equipe ou la page du client).
-- ------------------------------------------------------------
alter table reservations.estimes
  add column preuve_courriel_le date,
  add column preuve_texte text,
  add column preuve_saisie_par_nom text,
  add constraint estimes_preuve_check check ((preuve_courriel_le is null) = (preuve_texte is null));

create or replace function reservations.changer_estime(p_estime uuid, p_action text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e reservations.estimes;
  v_nouveau uuid;
begin
  select * into e from reservations.estimes where id = p_estime for update;
  if not found then
    raise exception 'Estimé introuvable.';
  end if;
  if p_action = 'envoyer' then
    raise exception 'Un estimé part seulement par « Envoyer l''estimé… » : il devient « envoyé » quand le courriel est parti.';
  elsif p_action = 'accepter' then
    raise exception 'L''acceptation demande la preuve écrite du client : « Accepté par le client » (date et texte du courriel).';
  elsif p_action = 'refuser' then
    if e.statut <> 'envoye' then
      raise exception 'Seul un estimé envoyé peut être refusé.';
    end if;
    update reservations.estimes set statut = 'refuse' where id = e.id;
    insert into reservations.journal (reservation_id, genre, texte)
    values (e.reservation_id, 'document', 'Estimé v' || e.version || ' refusé');
  elsif p_action = 'nouvelle_version' then
    if exists (select 1 from reservations.estimes x where x.reservation_id = e.reservation_id and x.statut = 'brouillon') then
      raise exception 'Un brouillon existe déjà pour cette réservation.';
    end if;
    v_nouveau := gen_random_uuid();
    insert into reservations.estimes (id, reservation_id, version, exercice_prix, sous_total, tps, tvq, total, notes)
    select v_nouveau, e.reservation_id, max(x.version) + 1, e.exercice_prix, e.sous_total, e.tps, e.tvq, e.total, e.notes
    from reservations.estimes x where x.reservation_id = e.reservation_id;
    insert into reservations.lignes (estime_id, ordre, produit_id, code, description, note, quantite, prix_unitaire, pourcentage, montant, auto)
    select v_nouveau, l.ordre, l.produit_id, l.code, l.description, l.note, l.quantite, l.prix_unitaire, l.pourcentage, l.montant, l.auto
    from reservations.lignes l where l.estime_id = e.id;
  else
    raise exception 'Action inconnue : %', p_action;
  end if;
  return coalesce(v_nouveau, e.id);
end;
$$;

-- La base l'impose aussi : une personne connectée ne pose jamais elle-même
-- « envoyé » ou « accepté » sur un estimé (ni par la table) ; seuls le
-- Worker (courriel parti), la page du client (anonyme) et
-- accepter_estime_equipe (réglage de transaction) le font.
create function reservations.verifier_statut_estime()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.statut in ('envoye', 'accepte')
     and (tg_op = 'INSERT' or new.statut is distinct from old.statut)
     and coalesce(current_setting('reservations.acceptation_equipe', true), '') <> 'oui' then
    raise exception '%', case when new.statut = 'envoye'
      then 'Un estimé part seulement par « Envoyer l''estimé… » : il devient « envoyé » quand le courriel est parti.'
      else 'L''acceptation demande la preuve écrite du client : « Accepté par le client » (date et texte du courriel).' end;
  end if;
  return new;
end;
$$;

create trigger trg_reservations_estimes_statut before insert or update of statut on reservations.estimes
for each row execute function reservations.verifier_statut_estime();

-- « Accepté par le client » : la preuve écrite est obligatoire (règle de
-- l'équipe, que l'app exige) : date du courriel du client et son texte
-- collé. Gardée sur l'estimé (avec qui l'a saisie), au journal et dans les
-- échanges du CRM ; même relance « préparer le contrat » que l'acceptation
-- en ligne. (La relance du devis QBO est posée par la base à l'acceptation,
-- quel que soit le chemin.)
create function reservations.accepter_estime_equipe(p_estime uuid, p_courriel_le date, p_texte text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e reservations.estimes;
  r reservations.reservations;
  v_nom text := reservations.nom_de(auth.uid());
  v_texte text := btrim(coalesce(p_texte, ''));
  v_auj date := (now() at time zone 'America/Toronto')::date;
begin
  if auth.uid() is null or not core.peut_ecrire('reservations') then
    raise exception 'Accès refusé.';
  end if;
  select * into e from reservations.estimes where id = p_estime for update;
  if not found then
    raise exception 'Estimé introuvable.';
  end if;
  if e.statut <> 'envoye' then
    raise exception 'Seul un estimé envoyé peut être accepté.';
  end if;
  if p_courriel_le is null then
    raise exception 'La date du courriel du client est obligatoire.';
  end if;
  if p_courriel_le > v_auj then
    raise exception 'La date du courriel du client ne peut pas être dans le futur.';
  end if;
  if length(v_texte) < 10 then
    raise exception 'Collez le texte du courriel où le client accepte l''estimé.';
  end if;
  select * into r from reservations.reservations where id = e.reservation_id;
  -- La relance « préparer le contrat » est au responsable de la réservation (comme en ligne).

  perform set_config('reservations.acceptation_equipe', 'oui', true);
  update reservations.estimes set
    statut = 'accepte', accepte_le = now(),
    preuve_courriel_le = p_courriel_le, preuve_texte = left(v_texte, 20000), preuve_saisie_par_nom = v_nom
  where id = e.id;
  update reservations.reservations set etape = 'estime_accepte'
  where id = r.id and etape in ('nouvelle', 'contact', 'estime_envoye');
  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'document', 'Estimé v' || e.version || ' accepté par le client (courriel du ' || reservations.jour_texte(p_courriel_le)
    || ', preuve saisie par ' || coalesce(v_nom, '?') || ') : « ' || left(v_texte, 4000) || ' »');
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, contact_id, reservation_id, genre, jour, texte, auteur_nom)
    values (r.organisation_id, r.contact_reservation_id, r.id, 'courriel', p_courriel_le,
      'Courriel du client : estimé v' || e.version || ' accepté.' || E'\n\n' || left(v_texte, 4000), v_nom);
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, auteur_nom, source_cle)
    values (r.organisation_id, r.id, r.numero || ' : estimé accepté par courriel, préparer le contrat', v_auj, r.responsable_id, v_nom,
      'estime_accepte:' || e.id)
    on conflict (source_cle) do nothing;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5. Avis à l'équipe (inscriptions@) : nouvelle demande, changement demandé
-- ------------------------------------------------------------
alter table reservations.demandes add column avis_envoye_le timestamptz;
alter table reservations.confirmations add column avis_envoye_le timestamptz;

-- Le Worker prend d'un coup les avis à envoyer (posés « envoyés » tout de
-- suite : deux passages ne les envoient pas deux fois ; rendus si l'envoi
-- rate). Seulement les 2 derniers jours : pas de rafale le jour où Gmail
-- est configuré. Un changement déjà remplacé ou traité n'est pas annoncé.
create function reservations.avis_prendre()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_demandes jsonb;
  v_changements jsonb;
begin
  with prises as (
    update reservations.demandes d set avis_envoye_le = now()
    where d.avis_envoye_le is null and d.recue_le > now() - interval '2 days'
    returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'recue_le', d.recue_le, 'langue', d.langue, 'par_lien', d.par_lien,
    'reponses', d.reponses,
    'r', jsonb_build_object('id', r.id, 'numero', r.numero, 'nom', r.nom, 'forfait', r.forfait,
      'date_arrivee', r.date_arrivee, 'date_depart', r.date_depart,
      'nb_participants', r.nb_participants, 'nb_accompagnateurs', r.nb_accompagnateurs)
  ) order by d.recue_le), '[]')
  into v_demandes
  from prises d join reservations.reservations r on r.id = d.reservation_id;

  with prises as (
    update reservations.confirmations c set avis_envoye_le = now()
    where c.genre = 'changement' and c.avis_envoye_le is null and c.recue_le > now() - interval '2 days'
    returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'recue_le', c.recue_le, 'nom', c.nom, 'message', c.message,
    'texte', reservations.texte_changement(r.forfait, c.actuel, c.propose),
    'r', jsonb_build_object('id', r.id, 'numero', r.numero, 'nom', r.nom, 'forfait', r.forfait,
      'date_arrivee', r.date_arrivee, 'date_depart', r.date_depart)
  ) order by c.recue_le), '[]')
  into v_changements
  from prises c join reservations.reservations r on r.id = c.reservation_id
  where c.statut = 'a_traiter';

  return jsonb_build_object('demandes', v_demandes, 'changements', v_changements);
end;
$$;

-- Envoi raté : l'avis sera retenté au prochain passage.
create function reservations.avis_rendre(p_demande uuid, p_changement uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update reservations.demandes set avis_envoye_le = null where id = p_demande;
  update reservations.confirmations set avis_envoye_le = null where id = p_changement;
$$;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
revoke execute on function
  reservations.courriel_fenetre(jsonb),
  reservations.courriel_parti(jsonb),
  reservations.avis_prendre(),
  reservations.avis_rendre(uuid, uuid),
  reservations.accepter_estime_equipe(uuid, date, text),
  reservations.verifier_statut_estime()
from public, anon;
grant execute on function
  reservations.courriel_fenetre(jsonb),
  reservations.courriel_parti(jsonb),
  reservations.avis_prendre(),
  reservations.avis_rendre(uuid, uuid)
to service_role;
grant execute on function reservations.accepter_estime_equipe(uuid, date, text) to authenticated;
grant execute on function reservations.jour_texte(date) to authenticated, service_role;
