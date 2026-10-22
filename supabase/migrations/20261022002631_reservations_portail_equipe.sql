-- ============================================================
-- Réservations, portail côté équipe (réunion du 2026-10-21 avec la
-- coordonnatrice des groupes, lots B, E et F ; le lot C — accueil et point
-- rouge — est dans l'app seulement).
--
-- B. Demande de changement du client décidée ligne par ligne : ✓ / ✗ sur
--    chaque champ changé (confirmations.decisions) ; seuls les champs
--    acceptés sont écrits dans le séjour. Au moins un refus : message au
--    client obligatoire, et règle de l'équipe « un refus, on appelle le
--    client » (le message sur sa page ne suffit pas) : noté au journal,
--    relance CRM si l'appel reste à faire. La page client montre ce qui est
--    accepté (confirmation_client réduit `propose` aux champs acceptés) ;
--    la réponse composée par l'app dit aussi ce qui ne l'est pas.
-- E. Notes de l'équipe en haut de la fiche (reservations.notes) : datées et
--    signées par la base, même sans organisation reliée ; chacun modifie
--    ou retire les siennes.
-- F. Séjour figé avec l'estimé (estimes.sejour, posé quand il quitte le
--    brouillon) : la fiche dit ce qui a changé depuis l'estimé accepté.
--    Relance « créer le devis QBO » posée à l'acceptation de l'estimé (en
--    ligne ou manuelle) au lieu de la signature (celle de la signature reste
--    un filet : même source_cle) ; « mettre le devis à jour » quand une
--    version plus récente est acceptée ; ces relances se ferment quand le
--    devis est créé ou mis à jour. qbo_devis.contrat_joint : un devis créé
--    avant la signature reçoit le contrat signé plus tard (Worker).
-- ============================================================

-- ------------------------------------------------------------
-- B. Décision ligne par ligne
-- ------------------------------------------------------------
alter table reservations.confirmations
  add column decisions jsonb,
  add column client_appele boolean;

comment on column reservations.confirmations.decisions is
  'Changement décidé ligne par ligne : champ de infos_sejour → true (accepté) ou false (refusé). Null : décidé en bloc (avant le 2026-10-21). Accepté en partie = statut acceptee avec au moins un false.';
comment on column reservations.confirmations.client_appele is
  'Au moins un refus : le client avait-il déjà été appelé (règle de l''équipe) ? Null sans refus.';

-- Champs changés entre deux états du séjour, dans l'ordre de la
-- pré-arrivée : mêmes champs que champsDe (confirmation.ts) selon le forfait.
create function reservations.champs_changes(p_forfait text, a jsonb, p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(c.cle order by c.ordre), '{}')
  from (values
    (1, 'date_arrivee'), (2, 'date_depart'), (3, 'heure_arrivee'), (4, 'heure_depart'),
    (5, 'nb_participants'), (6, 'nb_accompagnateurs'), (7, 'ages'), (8, 'ratio'), (9, 'langue'),
    (10, 'service_repas'), (11, 'nb_dejeuners'), (12, 'nb_diners'), (13, 'nb_soupers')
  ) as c(ordre, cle)
  where (a -> c.cle) is distinct from (p -> c.cle)
    -- Séjour d'un jour : le départ suit la date.
    and not (p_forfait in ('journee_plein_air', 'location_salle') and c.cle = 'date_depart')
    -- Écoles seulement : accompagnateurs, âges et ratio.
    and not (p_forfait not in ('classe_nature', 'journee_plein_air') and c.cle in ('nb_accompagnateurs', 'ages', 'ratio'))
    -- Classe nature : service de repas toujours inclus ; Journée plein air : le dîner suit le service.
    and not (p_forfait = 'classe_nature' and c.cle = 'service_repas')
    and not (p_forfait = 'journee_plein_air' and c.cle in ('nb_dejeuners', 'nb_diners', 'nb_soupers'))
$$;

-- Séjour proposé réduit aux champs acceptés (le reste tel qu'avant).
create function reservations.propose_accepte(a jsonb, p jsonb, d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select a || coalesce((select jsonb_object_agg(e.key, p -> e.key) from jsonb_each(d) e where e.value = 'true'::jsonb), '{}'::jsonb)
$$;

-- L'équipe décide chaque changement demandé par le client.
-- p_decisions : {champ: true|false} pour chaque champ changé (tous exigés).
-- p_reponse : affichée au client sur sa page (obligatoire s'il y a un refus ;
-- l'app y met ce qui est accepté et ce qui ne l'est pas, puis le message).
-- p_client_appele : s'il y a un refus, le client a-t-il déjà été appelé ?
create function reservations.decider_changement(p_confirmation uuid, p_decisions jsonb, p_reponse text, p_client_appele boolean default null)
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
  d jsonb := coalesce(p_decisions, '{}'::jsonb);
  v_reponse text := left(nullif(btrim(coalesce(p_reponse, '')), ''), 4000);
  v_qui text := reservations.nom_de(auth.uid());
  v_auj date := (now() at time zone 'America/Toronto')::date;
  v_champs text[];
  v_cle text;
  v_acceptes text[] := '{}';
  v_refuses text[] := '{}';
  v_decisions jsonb := '{}'::jsonb;
  v_arrivee date;
  v_depart date;
  v_texte_ok text;
  v_texte_non text;
  v_texte text;
  v_appele boolean;
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
  if jsonb_typeof(d) <> 'object' then
    raise exception 'Décisions invalides.';
  end if;
  select * into r from reservations.reservations where id = c.reservation_id for update;
  a := c.actuel;
  p := c.propose;
  v_champs := reservations.champs_changes(r.forfait, a, p);

  foreach v_cle in array v_champs loop
    if jsonb_typeof(d -> v_cle) is distinct from 'boolean' then
      raise exception 'Acceptez ou refusez chaque changement (✓ ou ✗).';
    end if;
    if (d ->> v_cle)::boolean then
      v_acceptes := v_acceptes || v_cle;
    else
      v_refuses := v_refuses || v_cle;
    end if;
    v_decisions := v_decisions || jsonb_build_object(v_cle, (d ->> v_cle)::boolean);
  end loop;
  -- Séjour d'un jour : le départ suit la date (même décision).
  if r.forfait in ('journee_plein_air', 'location_salle') and (p -> 'date_depart') is distinct from (a -> 'date_depart') then
    v_decisions := v_decisions || jsonb_build_object('date_depart', 'date_arrivee' = any(v_acceptes));
    if 'date_arrivee' = any(v_acceptes) then
      v_acceptes := v_acceptes || 'date_depart'::text;
    end if;
  end if;

  if cardinality(v_refuses) > 0 and v_reponse is null then
    raise exception 'Écrivez au client pourquoi un changement est refusé.';
  end if;
  v_arrivee := case when 'date_arrivee' = any(v_acceptes) then (p ->> 'date_arrivee')::date else r.date_arrivee end;
  v_depart := case when 'date_depart' = any(v_acceptes) then (p ->> 'date_depart')::date else r.date_depart end;
  if v_depart < v_arrivee then
    raise exception 'Le départ tomberait avant l''arrivée : acceptez ou refusez l''arrivée et le départ ensemble.';
  end if;

  -- Seuls les champs acceptés vont au séjour (comme à la main : mêmes
  -- vérifications, disponibilités Airbnb…) ; l'estimé ne change pas.
  if cardinality(v_acceptes) > 0 then
    update reservations.reservations set
      date_arrivee = v_arrivee,
      date_depart = v_depart,
      heure_arrivee = case when 'heure_arrivee' = any(v_acceptes) then (p ->> 'heure_arrivee')::time else heure_arrivee end,
      heure_depart = case when 'heure_depart' = any(v_acceptes) then (p ->> 'heure_depart')::time else heure_depart end,
      nb_participants = case when 'nb_participants' = any(v_acceptes) then (p ->> 'nb_participants')::integer else nb_participants end,
      nb_accompagnateurs = case when 'nb_accompagnateurs' = any(v_acceptes) then (p ->> 'nb_accompagnateurs')::integer else nb_accompagnateurs end,
      ages = case when 'ages' = any(v_acceptes) then p ->> 'ages' else ages end,
      langue = case when 'langue' = any(v_acceptes) then p ->> 'langue' else langue end,
      ratio = case when 'ratio' = any(v_acceptes) then p ->> 'ratio' else ratio end,
      service_repas = case when 'service_repas' = any(v_acceptes) then (p ->> 'service_repas')::boolean else service_repas end,
      nb_dejeuners = case when 'nb_dejeuners' = any(v_acceptes) then (p ->> 'nb_dejeuners')::integer else nb_dejeuners end,
      nb_diners = case when 'nb_diners' = any(v_acceptes) then (p ->> 'nb_diners')::integer else nb_diners end,
      nb_soupers = case when 'nb_soupers' = any(v_acceptes) then (p ->> 'nb_soupers')::integer else nb_soupers end
    where id = r.id;
  end if;

  v_texte_ok := reservations.texte_changement(r.forfait, a, reservations.propose_accepte(a, p, v_decisions));
  v_texte_non := reservations.texte_changement(r.forfait, a,
    a || coalesce((select jsonb_object_agg(k, p -> k) from unnest(v_refuses) k), '{}'::jsonb));
  v_texte := case
    when cardinality(v_refuses) = 0 then 'Changement demandé par le client accepté (séjour mis à jour) : ' || coalesce(nullif(v_texte_ok, ''), 'rien à changer')
    when cardinality(v_acceptes) = 0 then 'Changement demandé par le client refusé : ' || v_texte_non
    else 'Changement demandé par le client accepté en partie — accepté (séjour mis à jour) : ' || v_texte_ok || ' — refusé : ' || v_texte_non
  end;
  v_appele := case when cardinality(v_refuses) > 0 then coalesce(p_client_appele, false) end;

  update reservations.confirmations set
    statut = case when cardinality(v_refuses) > 0 and cardinality(v_acceptes) = 0 then 'refusee' else 'acceptee' end,
    decisions = v_decisions,
    client_appele = v_appele,
    reponse = v_reponse,
    traitee_le = now(),
    traitee_par = auth.uid(),
    traitee_par_nom = v_qui
  where id = c.id;

  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'note', v_texte || coalesce(' — message au client : « ' || v_reponse || ' »', ''));
  -- Règle de l'équipe : un refus se dit aussi au téléphone.
  if cardinality(v_refuses) > 0 then
    insert into reservations.journal (reservation_id, genre, texte)
    values (r.id, 'note', case when v_appele
      then 'Refus d''un changement : client appelé (règle de l''équipe : un refus se dit aussi au téléphone)'
      else 'Refus d''un changement : appeler le client (règle de l''équipe : le message sur sa page ne suffit pas)' end);
  end if;
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, reservation_id, contact_id, genre, texte)
    values (r.organisation_id, r.id, r.contact_reservation_id, 'note',
      v_texte || coalesce(E'\nMessage au client (page client) : ' || v_reponse, ''));
    if cardinality(v_refuses) > 0 and not v_appele then
      insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, auteur_nom, source_cle)
      values (r.organisation_id, r.id, r.numero || ' : appeler le client, changement refusé (' || v_texte_non || ')',
        v_auj, auth.uid(), v_qui, 'appel:' || c.id)
      on conflict (source_cle) do nothing;
    end if;
  end if;
  update crm.relances set statut = 'faite' where source_cle = 'changement:' || c.id and statut = 'a_faire';
end;
$$;

-- L'ancienne décision en bloc passe par la décision ligne par ligne (tout
-- accepté ou tout refusé) ; l'app ne s'en sert plus.
create or replace function reservations.traiter_changement(p_confirmation uuid, p_accepter boolean, p_reponse text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c reservations.confirmations;
  v_forfait text;
begin
  select * into c from reservations.confirmations where id = p_confirmation;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  select forfait into v_forfait from reservations.reservations where id = c.reservation_id;
  perform reservations.decider_changement(
    p_confirmation,
    coalesce((select jsonb_object_agg(k, coalesce(p_accepter, false))
              from unnest(reservations.champs_changes(v_forfait, c.actuel, coalesce(c.propose, c.actuel))) k), '{}'::jsonb),
    p_reponse,
    null);
end;
$$;

-- Page client : une décision acceptée en partie montre seulement ce qui est
-- accepté (la réponse dit ce qui ne l'est pas). Le reste est inchangé.
create or replace function reservations.confirmation_client(p_jeton text)
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
        'actuel', d.actuel,
        'propose', case when d.statut = 'acceptee' and d.decisions is not null
          then reservations.propose_accepte(d.actuel, d.propose, d.decisions) else d.propose end,
        'reponse', d.reponse) order by d.traitee_le desc), '[]')
      from (
        select * from reservations.confirmations c
        where c.reservation_id = r.id and c.statut in ('acceptee', 'refusee')
        order by c.traitee_le desc limit 5) d));
end;
$$;

-- ------------------------------------------------------------
-- E. Notes de l'équipe
-- ------------------------------------------------------------
create table reservations.notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  texte text not null check (btrim(texte) <> ''),
  -- Posés par la base (signer_note) ; sans session (import), ceux fournis sont gardés.
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz
);

create index idx_reservations_notes on reservations.notes (reservation_id, cree_le desc);

create function reservations.signer_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.auteur := auth.uid();
      new.auteur_nom := reservations.nom_de(auth.uid());
      new.cree_le := now();
    end if;
    new.modifie_le := null;
  else
    if new.reservation_id <> old.reservation_id or new.auteur is distinct from old.auteur
       or new.auteur_nom is distinct from old.auteur_nom or new.cree_le <> old.cree_le then
      raise exception 'Seul le texte d''une note se modifie.';
    end if;
    if new.texte is distinct from old.texte then
      new.modifie_le := now();
    end if;
  end if;
  new.texte := btrim(new.texte);
  return new;
end;
$$;

create trigger trg_reservations_notes_signer before insert or update on reservations.notes
for each row execute function reservations.signer_note();

alter table reservations.notes enable row level security;
grant select, insert, update, delete on reservations.notes to authenticated;
grant all on reservations.notes to service_role;
create policy "Lire" on reservations.notes for select to authenticated using (core.peut_lire('reservations'));
create policy "Ajouter" on reservations.notes for insert to authenticated with check (core.peut_ecrire('reservations'));
-- Chacun modifie ou retire ses notes (comme les notes des autres modules).
create policy "Modifier ses notes" on reservations.notes for update to authenticated
  using (core.peut_ecrire('reservations') and auteur = auth.uid())
  with check (core.peut_ecrire('reservations') and auteur = auth.uid());
create policy "Retirer ses notes" on reservations.notes for delete to authenticated
  using (core.peut_ecrire('reservations') and auteur = auth.uid());
alter publication supabase_realtime add table reservations.notes;

-- ------------------------------------------------------------
-- F. Séjour de l'estimé, relances du devis QBO
-- ------------------------------------------------------------
alter table reservations.estimes add column sejour jsonb;
comment on column reservations.estimes.sejour is
  'Séjour au moment où l''estimé a quitté le brouillon (infos_sejour + forfait, variante, étages, salles, heures en extra et supplémentaires) : comparé au séjour d''aujourd''hui (« le séjour a changé depuis l''estimé accepté »). Null : figé avant le 2026-10-21 (comparaison des lignes calculées).';

-- Ce que l'estimé a pris du séjour (mêmes clés que SejourEstime, ecartEstime.ts).
create function reservations.sejour_estime(r reservations.reservations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select reservations.infos_sejour(r) || jsonb_build_object(
    'forfait', r.forfait,
    'variante', r.variante,
    'etages', to_jsonb(r.etages),
    'salles', to_jsonb(r.salles),
    'heures_extra', r.heures_extra,
    'heures_supplementaires', r.heures_supplementaires)
$$;

create function reservations.figer_sejour_estime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
begin
  if old.statut = 'brouillon' and new.statut <> 'brouillon' and new.sejour is null then
    select * into r from reservations.reservations where id = new.reservation_id;
    new.sejour := reservations.sejour_estime(r);
  end if;
  return new;
end;
$$;

create trigger trg_reservations_estimes_sejour before update of statut on reservations.estimes
for each row execute function reservations.figer_sejour_estime();

-- Estimé accepté (en ligne ou par l'équipe) : « créer le devis QBO », ou
-- « mettre le devis à jour » si le devis vient d'une version plus ancienne.
-- Mêmes exclusions que la relance de la signature (tache_devis_qbo), qui
-- reste un filet : même source_cle, jamais deux fois.
create function reservations.tache_devis_acceptation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  d reservations.qbo_devis;
begin
  if new.statut <> 'accepte' or old.statut = 'accepte' or new.importe then
    return null;
  end if;
  select * into r from reservations.reservations where id = new.reservation_id;
  if r.organisation_id is null or r.origine = 'import' or r.fermeture in ('closed_lost', 'annulee') then
    return null;
  end if;
  select * into d from reservations.qbo_devis where reservation_id = r.id;
  if d.reservation_id is null then
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
    values (r.organisation_id, r.id, r.numero || ' : estimé accepté, créer le devis QBO (fiche › Facturation)',
      (now() at time zone 'America/Toronto')::date, reservations.responsable_facturation(r.id),
      'qbo:' || r.id || ':devis', 'Réservations')
    on conflict (source_cle) do nothing;
  elsif not d.annulation and coalesce(d.estime_version, 0) < new.version then
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
    values (r.organisation_id, r.id, r.numero || ' : estimé v' || new.version || ' accepté, mettre le devis QBO à jour (fiche › Facturation)',
      (now() at time zone 'America/Toronto')::date, reservations.responsable_facturation(r.id),
      'qbo:' || r.id || ':devis_v' || new.version, 'Réservations')
    on conflict (source_cle) do nothing;
  end if;
  return null;
end;
$$;

create trigger trg_reservations_estimes_tache_devis after update of statut on reservations.estimes
for each row execute function reservations.tache_devis_acceptation();

-- Devis créé ou mis à jour : ses relances (créer, mettre à jour jusqu'à sa version) sont faites.
create function reservations.fermer_taches_devis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update crm.relances set statut = 'faite'
  where statut = 'a_faire'
    and (source_cle = 'qbo:' || new.reservation_id || ':devis'
      or (source_cle ~ ('^qbo:' || new.reservation_id || ':devis_v[0-9]+$')
          and substring(source_cle from ':devis_v([0-9]+)$')::integer <= coalesce(new.estime_version, 0)));
  return null;
end;
$$;

create trigger trg_reservations_qbo_devis_taches after insert or update of estime_version on reservations.qbo_devis
for each row execute function reservations.fermer_taches_devis();

-- Contrat signé joint au devis QBO : à la création, ou plus tard par le
-- Worker quand le devis a été créé avant la signature.
alter table reservations.qbo_devis add column contrat_joint boolean not null default false;
update reservations.qbo_devis d set contrat_joint = exists (
  select 1 from reservations.documents x
  where x.reservation_id = d.reservation_id and x.genre = 'contrat_signe' and x.cree_le <= d.cree_le);

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
revoke execute on function
  reservations.champs_changes(text, jsonb, jsonb),
  reservations.propose_accepte(jsonb, jsonb, jsonb),
  reservations.decider_changement(uuid, jsonb, text, boolean),
  reservations.sejour_estime(reservations.reservations),
  reservations.signer_note(),
  reservations.figer_sejour_estime(),
  reservations.tache_devis_acceptation(),
  reservations.fermer_taches_devis()
from public, anon, authenticated;

grant execute on function reservations.decider_changement(uuid, jsonb, text, boolean) to authenticated;
grant execute on function
  reservations.champs_changes(text, jsonb, jsonb),
  reservations.propose_accepte(jsonb, jsonb, jsonb),
  reservations.sejour_estime(reservations.reservations)
to service_role;
