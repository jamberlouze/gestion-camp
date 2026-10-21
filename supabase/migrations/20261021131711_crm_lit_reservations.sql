-- ============================================================
-- CRM : les séjours viennent du module Réservations (plan des
-- réservations §7 et §13 ; choix de Maxime du 2026-10-21).
--
-- 1. crm.reservations() lit reservations.reservations directement, sans
--    copie, pour qui lit le CRM (même sans accès au module Réservations :
--    seulement les champs utiles au statut, aux saisons et aux relances).
--    Client = organisation_id ; Airbnb exclu. L'app décide : venu =
--    contrat signé ou plus loin, jamais fermée (estConfirmee) ; perdues
--    et annulées hors calculs, montrées dans la fiche.
-- 2. Plus rien d'Airtable : crm.sejours(), la copie figée
--    calendrier.sejours (et son déclencheur de journal) et
--    organisations.airtable_client_id sont retirés. Le journal du
--    Calendrier garde l'historique de la copie.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lecture des réservations
-- ------------------------------------------------------------
create function crm.reservations()
returns table (
  id uuid,
  organisation_id uuid,
  numero text,
  nom text,
  forfait text,
  variante text,
  etape text,
  fermeture text,
  raison_perte text,
  origine text,
  date_arrivee date,
  date_depart date,
  nb_participants integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.organisation_id, r.numero, r.nom, r.forfait, r.variante, r.etape, r.fermeture, r.raison_perte,
         r.origine, r.date_arrivee, r.date_depart, r.nb_participants
  from reservations.reservations r
  where core.peut_lire('crm')
    and r.organisation_id is not null
    and r.origine <> 'airbnb'
$$;

revoke execute on function crm.reservations() from public, anon;
grant execute on function crm.reservations() to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Fin d'Airtable
-- ------------------------------------------------------------
drop function crm.sejours();
drop table calendrier.sejours;
alter table crm.organisations drop column airtable_client_id;

-- Fusion : même chose qu'avant, sans le lien Airtable.
create or replace function crm.fusionner_organisations(p_garder uuid, p_retirer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g crm.organisations;
  x crm.organisations;
  q reservations.qbo_clients;
  v_contacts integer;
  v_echanges integer;
  v_relances integer;
  v_visites integer;
  v_reservations integer;
  v_details text[] := '{}';
  v_note text;
  v_statut text;
  v_statut_le date;
  v_texte text;
begin
  if not core.peut_ecrire('crm') then
    raise exception 'Accès refusé.';
  end if;
  if p_garder = p_retirer then
    raise exception 'Choisissez deux organisations différentes.';
  end if;
  select * into g from crm.organisations where id = p_garder for update;
  select * into x from crm.organisations where id = p_retirer for update;
  if g.id is null or x.id is null then
    raise exception 'Organisation introuvable.';
  end if;

  update crm.contacts set organisation_id = g.id where organisation_id = x.id;
  get diagnostics v_contacts = row_count;
  update crm.echanges set organisation_id = g.id where organisation_id = x.id;
  get diagnostics v_echanges = row_count;
  update crm.relances set organisation_id = g.id where organisation_id = x.id;
  get diagnostics v_relances = row_count;
  update crm.visites set organisation_id = g.id where organisation_id = x.id;
  get diagnostics v_visites = row_count;

  -- Règles propres : pour une même saison, celle de l'organisation qui reste l'emporte.
  delete from crm.regles r
  where r.organisation_id = x.id
    and exists (select 1 from crm.regles k where k.organisation_id = g.id and coalesce(k.saison, '') = coalesce(r.saison, ''));
  update crm.regles set organisation_id = g.id where organisation_id = x.id;

  -- Réservations : notées au journal de chacune.
  insert into reservations.journal (reservation_id, genre, texte, auteur, auteur_nom)
  select r.id, 'note', 'Organisation fusionnée : « ' || x.nom || ' » → « ' || g.nom || ' »', auth.uid(), reservations.nom_de(auth.uid())
  from reservations.reservations r where r.organisation_id = x.id;
  update reservations.reservations set organisation_id = g.id where organisation_id = x.id;
  get diagnostics v_reservations = row_count;

  -- Clients QBO : compagnie par compagnie, celui de l'organisation qui reste l'emporte.
  for q in select * from reservations.qbo_clients where organisation_id = x.id loop
    if exists (select 1 from reservations.qbo_clients k where k.organisation_id = g.id and k.compagnie_id = q.compagnie_id) then
      delete from reservations.qbo_clients where organisation_id = x.id and compagnie_id = q.compagnie_id;
      v_details := v_details || ('le client QBO « ' || q.nom || ' » n''est plus relié (les devis déjà faits restent dans QBO)');
    else
      update reservations.qbo_clients set organisation_id = g.id where organisation_id = x.id and compagnie_id = q.compagnie_id;
    end if;
  end loop;

  -- Identifiant unique (Copper) : celui de l'organisation qui reste l'emporte.
  update crm.organisations set copper_id = null where id = x.id;

  v_statut := g.statut_depart;
  v_statut_le := g.statut_depart_le;
  if v_statut is null then
    v_statut := x.statut_depart;
    v_statut_le := x.statut_depart_le;
  end if;
  v_note := 'Fusionnée le ' || to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD') || ' avec « ' || x.nom || ' »';
  if nullif(btrim(x.notes), '') is not null then
    v_note := v_note || ' : ' || btrim(x.notes);
  end if;
  update crm.organisations set
    ville = coalesce(g.ville, x.ville),
    conseiller_id = coalesce(g.conseiller_id, x.conseiller_id),
    etape = coalesce(g.etape, x.etape),
    prioritaire = g.prioritaire or x.prioritaire,
    copper_id = coalesce(g.copper_id, x.copper_id),
    adresse = coalesce(g.adresse, x.adresse),
    telephone = coalesce(g.telephone, x.telephone),
    site_web = coalesce(g.site_web, x.site_web),
    province = coalesce(g.province, x.province),
    code_postal = coalesce(g.code_postal, x.code_postal),
    statut_depart = v_statut,
    statut_depart_le = v_statut_le,
    notes = concat_ws(E'\n\n', nullif(btrim(g.notes), ''), v_note)
  where id = g.id;

  delete from crm.organisations where id = x.id;

  v_texte := 'Fusion : « ' || x.nom || ' » fusionnée ici (' || v_contacts || ' contact(s), ' || v_echanges || ' échange(s), '
    || v_relances || ' relance(s), ' || v_visites || ' visite(s), ' || v_reservations || ' réservation(s))';
  if cardinality(v_details) > 0 then
    v_texte := v_texte || ' ; ' || array_to_string(v_details, ' ; ');
  end if;
  insert into crm.echanges (organisation_id, genre, texte) values (g.id, 'note', v_texte || '.');

  return jsonb_build_object('contacts', v_contacts, 'echanges', v_echanges, 'relances', v_relances, 'visites', v_visites,
    'reservations', v_reservations, 'details', to_jsonb(v_details));
end;
$$;
