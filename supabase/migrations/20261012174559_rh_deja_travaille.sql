-- ============================================================
-- rh : « A déjà travaillé avec nous », avant la base RH.
-- La banque d'employés 2025 d'Airtable ne garde que la DERNIÈRE saison
-- de chacun (« Été 2026 » pour la plupart des anciens de l'été 2026) :
-- leurs saisons d'avant sont inconnues. Cet indicateur, repris du champ
-- « Ancien » des dossiers d'embauche et de « À déjà travaillé avec nous ? »
-- de la banque, fait d'eux des anciens même sans embauche passée connue.
-- ============================================================

alter table rh.personnes
  add column deja_travaille boolean not null default false;

comment on column rh.personnes.deja_travaille is
  'A travaillé avec nous avant la base RH (saisons inconnues) : compte comme un ancien.';

-- La fusion garde l'indicateur de l'une ou l'autre fiche.
create or replace function rh.fusionner_personnes(p_garder uuid, p_retirer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r rh.personnes;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  if p_garder = p_retirer then
    raise exception 'MEME_FICHE';
  end if;
  select * into r from rh.personnes where id = p_retirer for update;
  if r.id is null or not exists (select 1 from rh.personnes where id = p_garder) then
    raise exception 'INTROUVABLE';
  end if;

  update rh.candidatures set personne_id = p_garder where personne_id = p_retirer;
  update rh.embauches set personne_id = p_garder where personne_id = p_retirer;
  update rh.documents set personne_id = p_garder where personne_id = p_retirer;
  update rh.notes set personne_id = p_garder where personne_id = p_retirer;
  update rh.journal set personne_id = p_garder where personne_id = p_retirer;
  update rh.consultations set personne_id = p_garder where personne_id = p_retirer;
  if not exists (select 1 from rh.dossiers where personne_id = p_garder) then
    update rh.dossiers set personne_id = p_garder where personne_id = p_retirer;
  end if;
  if not exists (select 1 from rh.paie where personne_id = p_garder) then
    update rh.paie set personne_id = p_garder where personne_id = p_retirer;
  end if;

  -- Libère les valeurs uniques avant de les reporter.
  update rh.personnes set courriel = null, employe_id = null where id = p_retirer;
  update rh.personnes g set
    surnom = coalesce(g.surnom, r.surnom),
    courriel = coalesce(g.courriel, r.courriel),
    telephone = coalesce(g.telephone, r.telephone),
    date_naissance = coalesce(g.date_naissance, r.date_naissance),
    sexe = coalesce(g.sexe, r.sexe),
    notes = nullif(concat_ws(E'\n\n', g.notes, r.notes), ''),
    ne_pas_reembaucher = g.ne_pas_reembaucher or r.ne_pas_reembaucher,
    raison_ne_pas = nullif(concat_ws(E'\n', g.raison_ne_pas, r.raison_ne_pas), ''),
    deja_travaille = g.deja_travaille or r.deja_travaille,
    vaj_le = greatest(g.vaj_le, r.vaj_le),
    vaj_note = coalesce(g.vaj_note, r.vaj_note),
    employe_id = coalesce(g.employe_id, r.employe_id),
    airtable_ids = array(select distinct unnest(g.airtable_ids || r.airtable_ids))
  where g.id = p_garder;

  delete from rh.personnes where id = p_retirer;
  perform rh.journaliser(p_garder, null, null, 'fusion',
    'Fiche « ' || r.nom_complet || coalesce(' (' || r.courriel || ')', '') || ' » fusionnée dans celle-ci');
end;
$$;

-- Accepter : un ancien (embauche complète, ou « a déjà travaillé ») est proposé en « M ».
create or replace function rh.accepter(p_candidature uuid, p_saison uuid, p_entreprise uuid, p_poste uuid, p_echelon integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personne uuid;
  v_saison rh.saisons;
  v_id uuid := gen_random_uuid();
  v_ancien boolean;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  select personne_id into v_personne from rh.candidatures where id = p_candidature for update;
  if v_personne is null then
    raise exception 'INTROUVABLE';
  end if;
  select * into v_saison from rh.saisons where id = p_saison;
  if v_saison.id is null then
    raise exception 'SAISON_INTROUVABLE';
  end if;
  update rh.candidatures
     set statut = 'acceptee', saison_id = p_saison, entreprise_id = p_entreprise, poste_id = p_poste, echelon = p_echelon
   where id = p_candidature;
  select exists (select 1 from rh.embauches e where e.personne_id = v_personne and e.statut = 'complete')
      or (select deja_travaille from rh.personnes where id = v_personne)
    into v_ancien;
  insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, candidature_id, debut, fin, action_paie)
  values (v_id, v_personne, p_saison, p_entreprise, p_poste, p_echelon, p_candidature, v_saison.debut, v_saison.fin,
          case when v_ancien then 'M' else 'A' end);
  return v_id;
end;
$$;
