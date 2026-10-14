-- ============================================================
-- Réservations : lien du formulaire propre à une organisation récurrente
-- (ex. Saint-Paul-de-la-Croix), demande de Maxime du 2026-10-14.
--
-- « Copier le lien du formulaire de l'organisation » (fiche de la
-- réservation, section Client) : /demande?lien=<jeton>. Le formulaire est
-- pré-rempli avec les coordonnées et le groupe de la dernière réservation
-- de l'organisation (dates et forfait à choisir) ; la demande arrive déjà
-- reliée à l'organisation (contacts retrouvés par courriel ou créés, comme
-- valider_demande). Jeton de 48 caractères hexadécimaux, rien d'autre dans
-- l'adresse ; « Nouveau lien » rend l'ancien inutilisable, « Retirer » le
-- ferme. Un lien qui ne marche plus donne le formulaire vide, et la demande
-- arrive « à valider » comme les autres.
-- ============================================================

create table reservations.liens_formulaire (
  organisation_id uuid primary key references crm.organisations(id) on delete cascade,
  jeton text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  cree_le timestamptz not null default now(),
  cree_par uuid references core.profils(id) on delete set null,
  cree_par_nom text
);

alter table reservations.liens_formulaire enable row level security;
grant select on reservations.liens_formulaire to authenticated;
grant all on reservations.liens_formulaire to service_role;
-- Écriture par reservations.lien_organisation seulement.
create policy "Lire" on reservations.liens_formulaire for select to authenticated using (core.peut_lire('reservations'));
alter publication supabase_realtime add table reservations.liens_formulaire;

-- Demande arrivée par le lien d'une organisation (déjà reliée au CRM).
alter table reservations.demandes add column par_lien boolean not null default false;

-- Lien de l'organisation : 'creer' (rend celui qui existe), 'refaire'
-- (nouveau jeton, l'ancien ne marche plus) ou 'retirer'. Rend le jeton.
create function reservations.lien_organisation(p_organisation uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if not core.peut_ecrire('reservations') then
    raise exception 'Accès refusé.';
  end if;
  if not exists (select 1 from crm.organisations where id = p_organisation) then
    raise exception 'Organisation introuvable.';
  end if;
  if p_action = 'retirer' then
    delete from reservations.liens_formulaire where organisation_id = p_organisation;
    return null;
  elsif p_action = 'refaire' then
    insert into reservations.liens_formulaire (organisation_id, cree_par, cree_par_nom)
    values (p_organisation, auth.uid(), reservations.nom_de(auth.uid()))
    on conflict (organisation_id) do update set
      jeton = encode(extensions.gen_random_bytes(24), 'hex'),
      cree_le = now(),
      cree_par = excluded.cree_par,
      cree_par_nom = excluded.cree_par_nom
    returning jeton into v_jeton;
  elsif p_action = 'creer' then
    insert into reservations.liens_formulaire (organisation_id, cree_par, cree_par_nom)
    values (p_organisation, auth.uid(), reservations.nom_de(auth.uid()))
    on conflict (organisation_id) do nothing;
    select jeton into v_jeton from reservations.liens_formulaire where organisation_id = p_organisation;
  else
    raise exception 'Action inconnue : %', p_action;
  end if;
  return v_jeton;
end;
$$;

-- Ce que le formulaire pré-remplit (page publique, sans compte) : l'adresse
-- de l'organisation (CRM), les contacts et le groupe de sa dernière
-- réservation, quelques réponses de sa dernière demande. Rien d'autre
-- (ni prix, ni notes). Le passage en réponses est dans demande.ts
-- (preRemplissage).
create function reservations.formulaire_organisation(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o crm.organisations;
  r reservations.reservations;
  v_rep jsonb;
  v_resp crm.contacts;
  v_fact crm.contacts;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select org.* into o
  from reservations.liens_formulaire l join crm.organisations org on org.id = l.organisation_id
  where l.jeton = p_jeton;
  if not found then
    return null;
  end if;

  select x.* into r from reservations.reservations x
  where x.organisation_id = o.id and x.origine <> 'airbnb'
  order by x.date_arrivee desc, x.created_at desc
  limit 1;
  if r.id is not null then
    select d.reponses into v_rep from reservations.demandes d where d.reservation_id = r.id;
    select c.* into v_resp from crm.contacts c where c.id = r.contact_reservation_id;
    select c.* into v_fact from crm.contacts c where c.id = r.contact_facturation_id;
  end if;
  if v_resp.id is null then
    select c.* into v_resp from crm.contacts c where c.organisation_id = o.id order by c.principal desc, c.created_at limit 1;
  end if;

  return jsonb_build_object(
    'organisation', jsonb_build_object(
      'nom', o.nom, 'genre', o.genre, 'adresse', o.adresse, 'ville', o.ville,
      'province', o.province, 'code_postal', o.code_postal),
    'derniere', case when r.id is not null then jsonb_build_object(
      'forfait', r.forfait, 'nb_participants', r.nb_participants, 'nb_accompagnateurs', r.nb_accompagnateurs,
      'ages', r.ages, 'langue', r.langue, 'description', r.description,
      'service_repas', r.service_repas, 'courriel_direction', r.courriel_direction) end,
    'demande', case when v_rep is not null then jsonb_build_object(
      'type_groupe', v_rep ->> 'type_groupe', 'type_autre', v_rep ->> 'type_autre', 'langue', v_rep ->> 'langue',
      'pays', v_rep ->> 'pays', 'resp_prenom', v_rep ->> 'resp_prenom', 'resp_nom', v_rep ->> 'resp_nom',
      'resp_courriel', v_rep ->> 'resp_courriel') end,
    'responsable', case when v_resp.id is not null then jsonb_build_object(
      'nom', v_resp.nom, 'courriel', v_resp.courriel, 'telephone', v_resp.telephone) end,
    'facturation', case when v_fact.id is not null and v_fact.id is distinct from v_resp.id then jsonb_build_object(
      'nom', v_fact.nom, 'courriel', v_fact.courriel, 'telephone', v_fact.telephone) end);
end;
$$;

-- recevoir_demande : comme avant (20261009114233), plus le lien d'une
-- organisation (p_demande ->> 'lien') : la réservation arrive reliée à
-- l'organisation, avec ses contacts, la compagnie et le responsable
-- interne de sa dernière réservation (sinon le conseiller de
-- l'organisation) ; la demande est marquée reliée (par_lien).
create or replace function reservations.recevoir_demande(p_reservation jsonb, p_demande jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_numero text;
  v_existante uuid;
  v_compagnie uuid;
  v_org uuid;
  v_responsable uuid;
  v_resp uuid;
  v_fact uuid;
  v_adresse text;
  rep jsonb := p_demande -> 'reponses';
  p jsonb := p_reservation;
begin
  select reservation_id into v_existante from reservations.demandes where cle = (p_demande ->> 'cle')::uuid;
  if found then
    select numero into v_numero from reservations.reservations where id = v_existante;
    return jsonb_build_object('id', v_existante, 'numero', v_numero, 'deja', true);
  end if;

  select c.entreprise_id into v_compagnie
  from reservations.compagnies c join core.entreprises e on e.id = c.entreprise_id
  order by (e.nom = 'GBPA+') desc, e.nom
  limit 1;

  -- Lien d'une organisation : un jeton inconnu (retiré, refait) est ignoré.
  if coalesce(p_demande ->> 'lien', '') ~ '^[0-9a-f]{48}$' then
    select l.organisation_id into v_org from reservations.liens_formulaire l where l.jeton = p_demande ->> 'lien';
  end if;
  if v_org is not null then
    select coalesce(x.compagnie_id, v_compagnie), x.responsable_id into v_compagnie, v_responsable
    from reservations.reservations x
    where x.organisation_id = v_org and x.origine <> 'airbnb'
    order by x.date_arrivee desc, x.created_at desc
    limit 1;
    if v_compagnie is null or not exists (select 1 from reservations.compagnies c where c.entreprise_id = v_compagnie) then
      select c.entreprise_id into v_compagnie
      from reservations.compagnies c join core.entreprises e on e.id = c.entreprise_id
      order by (e.nom = 'GBPA+') desc, e.nom
      limit 1;
    end if;
    v_responsable := coalesce(v_responsable, (select o.conseiller_id from crm.organisations o where o.id = v_org));
  end if;

  insert into reservations.reservations (
    nom, compagnie_id, forfait, forfait_demande, variante, date_arrivee, date_depart,
    heure_arrivee, heure_depart, heures_regulieres, nb_participants, nb_accompagnateurs,
    ages, langue, description, commentaires_client, ratio, service_repas,
    nb_dejeuners, nb_diners, nb_soupers, courriel_direction, provenance, origine)
  values (
    left(btrim(p ->> 'nom'), 200),
    v_compagnie,
    p ->> 'forfait',
    p ->> 'forfait',
    nullif(p ->> 'variante', ''),
    (p ->> 'date_arrivee')::date,
    (p ->> 'date_depart')::date,
    nullif(p ->> 'heure_arrivee', '')::time,
    nullif(p ->> 'heure_depart', '')::time,
    (p ->> 'heures_regulieres')::boolean,
    nullif(p ->> 'nb_participants', '')::integer,
    nullif(p ->> 'nb_accompagnateurs', '')::integer,
    left(nullif(btrim(p ->> 'ages'), ''), 500),
    left(nullif(btrim(p ->> 'langue'), ''), 100),
    left(nullif(btrim(p ->> 'description'), ''), 5000),
    left(nullif(btrim(p ->> 'commentaires_client'), ''), 5000),
    nullif(p ->> 'ratio', ''),
    coalesce((p ->> 'service_repas')::boolean, false),
    coalesce((p ->> 'nb_dejeuners')::integer, 0),
    coalesce((p ->> 'nb_diners')::integer, 0),
    coalesce((p ->> 'nb_soupers')::integer, 0),
    left(nullif(btrim(p ->> 'courriel_direction'), ''), 200),
    case when v_org is not null then 'Formulaire web (lien de l''organisation)' else 'Formulaire web' end,
    'formulaire')
  returning id, numero into v_id, v_numero;

  insert into reservations.demandes (reservation_id, cle, langue, reponses, adresse_ip, navigateur, validee_le, validee_par_nom, par_lien)
  values (
    v_id,
    (p_demande ->> 'cle')::uuid,
    coalesce(p_demande ->> 'langue', 'fr'),
    rep,
    left(p_demande ->> 'adresse_ip', 100),
    left(p_demande ->> 'navigateur', 300),
    case when v_org is not null then now() end,
    case when v_org is not null then 'le lien du formulaire de l''organisation' end,
    v_org is not null);

  if v_org is not null then
    -- Comme valider_demande : adresse complétée (jamais remplacée), contacts
    -- retrouvés par courriel ou créés.
    v_adresse := nullif(btrim(concat_ws(', ', nullif(btrim(rep ->> 'adresse'), ''), nullif(btrim(rep ->> 'adresse2'), ''))), '');
    update crm.organisations set
      adresse = coalesce(adresse, v_adresse),
      ville = coalesce(ville, nullif(btrim(rep ->> 'ville'), '')),
      province = coalesce(province, nullif(btrim(rep ->> 'province'), '')),
      code_postal = coalesce(code_postal, nullif(upper(btrim(rep ->> 'code_postal')), ''))
    where id = v_org;
    v_resp := reservations.contact_demande(v_org, rep ->> 'resp_prenom', rep ->> 'resp_nom', rep ->> 'resp_courriel', rep ->> 'resp_telephone');
    if rep ->> 'facturation_meme' = 'non' then
      v_fact := reservations.contact_demande(v_org, rep ->> 'fact_prenom', rep ->> 'fact_nom', rep ->> 'fact_courriel', rep ->> 'fact_telephone');
    end if;
    update reservations.reservations set
      organisation_id = v_org,
      contact_reservation_id = v_resp,
      contact_facturation_id = nullif(v_fact, v_resp),
      responsable_id = v_responsable
    where id = v_id;
  end if;

  insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
  values (v_id, 'note',
    case when v_org is not null
      then 'Demande reçue par le lien du formulaire de l''organisation (déjà reliée au CRM)'
      else 'Demande reçue par le formulaire web' end,
    'Formulaire web');

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja', false);
end;
$$;

revoke execute on function
  reservations.lien_organisation(uuid, text),
  reservations.formulaire_organisation(text)
from public;
grant execute on function reservations.lien_organisation(uuid, text) to authenticated;
grant execute on function reservations.formulaire_organisation(text) to anon, authenticated, service_role;
