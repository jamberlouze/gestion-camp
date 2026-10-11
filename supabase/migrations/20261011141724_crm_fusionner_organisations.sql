-- CRM : fusionner deux organisations (demande de Maxime du 2026-10-11 : une
-- même école = une seule organisation ; l'import de Copper a laissé des
-- doublons). Tout ce qui pointe vers l'organisation retirée passe à celle qui
-- reste, en une transaction : contacts, échanges, relances, visites, règles
-- propres, réservations (notées au journal) et clients QBO. Les champs vides
-- de celle qui reste sont complétés ; ses notes reçoivent celles de l'autre.
-- Une note « Fusion » est ajoutée à ses échanges. Irréversible.
create function crm.fusionner_organisations(p_garder uuid, p_retirer uuid)
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

  -- Identifiants uniques (Airtable, Copper) : ceux de l'organisation qui reste l'emportent.
  if g.airtable_client_id is not null and x.airtable_client_id is not null and g.airtable_client_id <> x.airtable_client_id then
    v_details := v_details || ('ses séjours Airtable (' || x.airtable_client_id || ') ne sont plus comptés');
  end if;
  update crm.organisations set airtable_client_id = null, copper_id = null where id = x.id;

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
    airtable_client_id = coalesce(g.airtable_client_id, x.airtable_client_id),
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

revoke execute on function crm.fusionner_organisations(uuid, uuid) from public;
grant execute on function crm.fusionner_organisations(uuid, uuid) to authenticated;
