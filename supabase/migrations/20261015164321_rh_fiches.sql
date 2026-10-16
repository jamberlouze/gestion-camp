-- ============================================================
-- RH › Fiches du staff (demande de Maxime, 2026-10-15) : une fiche
-- courte par employé ou bénévole embauché — photo, coordonnées, diète,
-- allergies, fiche médicale, contacts d'urgence —, facile à ouvrir.
--
-- Réponses de Maxime : direction + coordonnateurs (accès propre
-- `rh_fiches`, en lecture) ; questions médicales ajoutées au dossier
-- d'embauche ; en ligne seulement (rien gardé sur l'appareil).
--
-- Un coordo n'a aucun droit sur les tables de `rh` : il lit seulement ce
-- que rend `rh.fiches` (jamais paie, notes, candidatures, contrats,
-- journal) et les photos des personnes (`rh.est_photo`).
-- ============================================================

alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','rh_fiches','batiments'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','rh_fiches','batiments'));

-- Lecture seulement : les fiches se corrigent dans RH (dossier de la personne).
insert into core.acces_roles (role, module, niveau) values
  ('direction','rh_fiches','lecture'),
  ('coordo','rh_fiches','lecture'),
  ('developpeur','rh_fiches','lecture')
on conflict do nothing;

-- ------------------------------------------------------------
-- Fiche médicale (dossier d'embauche, facultatif)
-- ------------------------------------------------------------
alter table rh.dossiers
  -- Problèmes de santé ou limitations physiques à connaître
  add column sante_conditions text,
  add column medicaments text,
  -- Porte un auto-injecteur d'épinéphrine (EpiPen) ; null = pas répondu
  add column auto_injecteur boolean,
  -- Autre chose à savoir en cas d'urgence
  add column sante_notes text;

-- Dossier d'embauche reçu : comme avant, plus la fiche médicale.
create or replace function rh.recevoir_dossier(p_jeton text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_s rh.saisons;
  v_paie rh.paie;
  v_per jsonb := coalesce(p -> 'personne', '{}');
  v_dos jsonb := coalesce(p -> 'dossier', '{}');
  v_courriel text := lower(btrim(v_per ->> 'courriel'));
  v_naissance date;
  v_nas text := nullif(regexp_replace(coalesce(p ->> 'nas', ''), '\D', '', 'g'), '');
  -- null JSON (« banque: null ») = pas donné
  v_banque jsonb := nullif(p -> 'banque', 'null'::jsonb);
  v_transit text;
  v_institution text;
  v_compte text;
  v_specimen jsonb := nullif(p -> 'specimen', 'null'::jsonb);
  v_ancien_specimen text;
  v_dispos uuid[] := rh.ids(p -> 'disponibilites');
  v_ethique uuid := nullif(p ->> 'ethique_texte', '')::uuid;
  v_entente uuid := nullif(p ->> 'entente_texte', '')::uuid;
  v_genre_ethique text;
  v_auteur text;
  v_premier boolean;
  v_note text := '';
  v_fichiers integer := 0;
  v_ete boolean;
  v_fichiers_json jsonb := case when jsonb_typeof(p -> 'fichiers') = 'array' then p -> 'fichiers' else '[]'::jsonb end;
  f jsonb;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    raise exception 'JETON';
  end if;
  select * into e from rh.embauches where jeton = p_jeton for update;
  if not found then
    raise exception 'JETON';
  end if;
  if e.statut not in ('a_envoyer','envoyee','dossier_recu') then
    raise exception 'FERME';
  end if;
  select * into v_s from rh.saisons where id = e.saison_id;
  v_ete := v_s.genre = 'ete';
  select * into v_paie from rh.paie where personne_id = e.personne_id;
  v_premier := e.dossier_recu_le is null;

  -- Identité et coordonnées
  begin
    v_naissance := (v_per ->> 'date_naissance')::date;
  exception when others then
    raise exception 'CHAMPS:date_naissance';
  end;
  if rh.champ(v_per, 'prenom') is null or rh.champ(v_per, 'nom_famille') is null or rh.champ(v_per, 'telephone') is null
     or v_naissance is null or v_naissance < date '1920-01-01' or v_naissance > current_date
     or v_courriel is null or v_courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'CHAMPS:personne';
  end if;
  if rh.champ(v_dos, 'adresse') is null or rh.champ(v_dos, 'ville') is null or rh.champ(v_dos, 'province') is null
     or rh.champ(v_dos, 'code_postal') is null or rh.champ(v_dos, 'pays') is null or rh.champ(v_dos, 'assurance_maladie') is null
     or coalesce(jsonb_typeof(v_dos -> 'etudiant_temps_plein'), '') <> 'boolean' then
    raise exception 'CHAMPS:dossier';
  end if;

  -- Code d'éthique (la version affichée) ; entente pour un bénévole.
  v_genre_ethique := case when v_ete then 'ethique_ete' else 'ethique_hors_ete' end;
  if v_ethique is null or not exists (select 1 from rh.textes t where t.id = v_ethique and t.genre = v_genre_ethique) then
    raise exception 'ETHIQUE';
  end if;
  if e.genre = 'benevolat' and exists (select 1 from rh.textes t where t.genre = 'entente_benevolat' and btrim(t.texte) <> '')
     and (v_entente is null or not exists (select 1 from rh.textes t where t.id = v_entente and t.genre = 'entente_benevolat')) then
    raise exception 'ENTENTE';
  end if;

  -- Disponibilités : dates de la saison seulement.
  if exists (select 1 from unnest(v_dispos) x where not exists (select 1 from rh.saisons_dates d where d.id = x and d.saison_id = e.saison_id)) then
    raise exception 'DISPONIBILITES';
  end if;

  -- Paie (emploi seulement) : NAS, banque et spécimen exigés s'il n'y en a pas déjà.
  if e.genre = 'emploi' then
    if v_nas is not null and not rh.nas_valide(v_nas) then
      raise exception 'NAS_INVALIDE';
    end if;
    if v_nas is null and v_paie.nas is null then
      raise exception 'NAS_REQUIS';
    end if;
    if v_banque is not null then
      v_transit := regexp_replace(coalesce(v_banque ->> 'transit', ''), '\D', '', 'g');
      v_institution := regexp_replace(coalesce(v_banque ->> 'institution', ''), '\D', '', 'g');
      v_compte := regexp_replace(coalesce(v_banque ->> 'compte', ''), '\D', '', 'g');
      if v_transit !~ '^[0-9]{5}$' or v_institution !~ '^[0-9]{3}$' or v_compte !~ '^[0-9]{5,20}$' then
        raise exception 'BANQUE_INVALIDE';
      end if;
    elsif v_paie.compte is null then
      raise exception 'BANQUE_REQUISE';
    end if;
    if v_specimen is not null and coalesce(v_specimen ->> 'chemin', '') !~ ('^' || e.personne_id || '/[0-9a-f-]{36}\.[a-z0-9]{1,5}$') then
      raise exception 'FICHIER';
    end if;
    if v_specimen is null and (v_banque is not null or v_paie.specimen is null) then
      raise exception 'SPECIMEN_REQUIS';
    end if;
  elsif v_nas is not null or v_banque is not null or v_specimen is not null then
    raise exception 'BENEVOLE_SANS_PAIE';
  end if;

  -- Fichiers : chemins du dossier de la personne, genres connus.
  for f in select * from jsonb_array_elements(v_fichiers_json) loop
    if coalesce(f ->> 'chemin', '') !~ ('^' || e.personne_id || '/[0-9a-f-]{36}\.[a-z0-9]{1,5}$')
       or coalesce(f ->> 'genre', '') not in ('cv','premiers_soins','sauveteur','piece_identite','consentement_parental','photo') then
      raise exception 'FICHIER';
    end if;
  end loop;
  -- CV exigé s'il n'y en a pas déjà un au dossier.
  if not exists (select 1 from rh.documents d where d.personne_id = e.personne_id and d.genre = 'cv')
     and not exists (select 1 from jsonb_array_elements(v_fichiers_json) x where x ->> 'genre' = 'cv') then
    raise exception 'CV_REQUIS';
  end if;

  v_auteur := btrim(rh.champ(v_per, 'prenom', 100) || ' ' || rh.champ(v_per, 'nom_famille', 100)) || ' (dossier d''embauche)';

  -- Personne : l'employé fait foi pour ses coordonnées. Un courriel déjà
  -- pris par une autre fiche n'est pas repris (noté au journal).
  update rh.personnes set
    prenom = rh.champ(v_per, 'prenom', 100),
    nom_famille = rh.champ(v_per, 'nom_famille', 100),
    surnom = rh.champ(v_per, 'surnom', 100),
    telephone = rh.champ(v_per, 'telephone', 50),
    date_naissance = v_naissance
  where id = e.personne_id;
  if v_courriel is distinct from (select courriel from rh.personnes where id = e.personne_id) then
    if exists (select 1 from rh.personnes where courriel = v_courriel and id <> e.personne_id) then
      v_note := ' Courriel donné (' || v_courriel || ') déjà utilisé par une autre fiche : non repris.';
    else
      update rh.personnes set courriel = v_courriel where id = e.personne_id;
    end if;
  end if;

  -- Dossier (ce qui dure d'une année à l'autre)
  insert into rh.dossiers (personne_id) values (e.personne_id) on conflict (personne_id) do nothing;
  update rh.dossiers set
    adresse = rh.champ(v_dos, 'adresse', 300),
    ville = rh.champ(v_dos, 'ville', 100),
    province = rh.champ(v_dos, 'province', 100),
    code_postal = rh.champ(v_dos, 'code_postal', 20),
    pays = rh.champ(v_dos, 'pays', 100),
    assurance_maladie = rh.champ(v_dos, 'assurance_maladie', 50),
    etudiant_temps_plein = (v_dos ->> 'etudiant_temps_plein')::boolean,
    etudes = rh.champ(v_dos, 'etudes', 500),
    allergies = rh.champ(v_dos, 'allergies', 1000),
    diete = case when v_dos ->> 'diete' in ('reguliere','vegetarienne','sans_lactose','sans_porc','sans_gluten') then v_dos ->> 'diete' end,
    taille_tshirt = case when v_ete then
      case when v_dos ->> 'taille_tshirt' in ('XS','S','M','L','XL','XXL') then v_dos ->> 'taille_tshirt' end else taille_tshirt end,
    taille_hoodie = case when v_ete then
      case when v_dos ->> 'taille_hoodie' in ('XS','S','M','L','XL','XXL') then v_dos ->> 'taille_hoodie' end else taille_hoodie end,
    urgence1_nom = rh.champ(v_dos, 'urgence1_nom', 200),
    urgence1_lien = rh.champ(v_dos, 'urgence1_lien', 100),
    urgence1_telephone = rh.champ(v_dos, 'urgence1_telephone', 50),
    urgence2_nom = rh.champ(v_dos, 'urgence2_nom', 200),
    urgence2_lien = rh.champ(v_dos, 'urgence2_lien', 100),
    urgence2_telephone = rh.champ(v_dos, 'urgence2_telephone', 50),
    sante_conditions = rh.champ(v_dos, 'sante_conditions', 2000),
    medicaments = rh.champ(v_dos, 'medicaments', 2000),
    auto_injecteur = case when jsonb_typeof(v_dos -> 'auto_injecteur') = 'boolean' then (v_dos ->> 'auto_injecteur')::boolean end,
    sante_notes = rh.champ(v_dos, 'sante_notes', 2000)
  where personne_id = e.personne_id;

  -- Paie, chiffrée (jamais relue par la page)
  if e.genre = 'emploi' and (v_nas is not null or v_banque is not null or v_specimen is not null) then
    insert into rh.paie (personne_id) values (e.personne_id) on conflict (personne_id) do nothing;
    select specimen into v_ancien_specimen from rh.paie where personne_id = e.personne_id;
    update rh.paie set
      nas = case when v_nas is null then nas else rh.chiffrer(v_nas) end,
      nas_fin = case when v_nas is null then nas_fin else right(v_nas, 3) end,
      transit = case when v_banque is null then transit else v_transit end,
      institution = case when v_banque is null then institution else v_institution end,
      compte = case when v_banque is null then compte else rh.chiffrer(v_compte) end,
      compte_fin = case when v_banque is null then compte_fin else right(v_compte, 3) end,
      specimen = case when v_specimen is null then specimen else v_specimen ->> 'chemin' end,
      updated_at = now(),
      updated_by = null,
      updated_by_nom = v_auteur
    where personne_id = e.personne_id;
    if v_specimen is null then
      v_ancien_specimen := null;
    end if;
    perform rh.journal_public(e.personne_id, null, e.id, 'paie',
      'Renseignements de paie donnés dans le dossier d''embauche (' ||
        concat_ws(', ', case when v_nas is not null then 'NAS' end, case when v_banque is not null then 'compte bancaire' end,
                  case when v_specimen is not null then 'spécimen de chèque' end) || ')',
      v_auteur);
  end if;

  -- Documents
  for f in select * from jsonb_array_elements(v_fichiers_json) loop
    insert into rh.documents (id, personne_id, embauche_id, genre, nom, chemin, type_mime, taille, expire_le, ajoute_par_nom)
    values ((f ->> 'id')::uuid, e.personne_id, e.id, f ->> 'genre', left(f ->> 'nom', 200), f ->> 'chemin',
            left(f ->> 'type_mime', 100), nullif(f ->> 'taille', '')::integer,
            case when f ->> 'genre' in ('premiers_soins','sauveteur') and coalesce(f ->> 'expire_le', '') ~ '^\d{4}-\d{2}-\d{2}$'
                 then (f ->> 'expire_le')::date end,
            v_auteur);
    v_fichiers := v_fichiers + 1;
  end loop;

  -- Embauche
  update rh.embauches set
    disponibilites = v_dispos,
    disponibilites_note = rh.champ(p, 'disponibilites_note', 2000),
    code_ethique_le = now(),
    code_ethique_texte = v_ethique,
    entente_benevolat_le = case when e.genre = 'benevolat' and v_entente is not null then now() else entente_benevolat_le end,
    entente_benevolat_texte = case when e.genre = 'benevolat' and v_entente is not null then v_entente else entente_benevolat_texte end,
    presentation = case when v_ete then coalesce((
      select jsonb_object_agg(r.key, left(btrim(r.value), 500))
      from jsonb_each_text(coalesce(p -> 'presentation', '{}')) r
      where r.key in ('Campeur ou anim avant à la BPA','Activité préférée','Repas préféré','Chanson de karaoké')
        and btrim(r.value) <> ''), '{}') else presentation end,
    commentaires = case when v_ete then rh.champ(p, 'commentaires', 5000) else commentaires end,
    statut = 'dossier_recu',
    dossier_recu_le = now()
  where id = e.id;

  perform rh.journal_public(e.personne_id, e.candidature_id, e.id, 'dossier',
    case when v_premier then 'Dossier d''embauche reçu' else 'Dossier d''embauche corrigé et renvoyé' end ||
      case when v_fichiers > 0 then ' (' || v_fichiers || ' fichier' || case when v_fichiers > 1 then 's' else '' end || ')' else '' end ||
      '.' || v_note,
    v_auteur);

  return jsonb_build_object('ok', true, 'specimen_ancien', v_ancien_specimen);
end;
$$;

-- ------------------------------------------------------------
-- Fiches d'une saison : une par personne embauchée (embauches non
-- annulées, emplois et bénévoles), avec ses postes. Saison null = celle
-- de l'onglet Employés (`saisonParDefaut`) : la première, à partir de
-- celle du jour, qui a des embauches, sinon la dernière qui en a.
-- Rend aussi les saisons qui ont des embauches (menu).
-- ------------------------------------------------------------
create function rh.fiches(p_saison uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'America/Toronto')::date;
  v_rang integer;
  v_saison uuid := p_saison;
begin
  if not (core.peut_lire('rh_fiches') or core.peut_lire('rh')) then
    raise exception 'ACCES_REFUSE';
  end if;
  -- Rang du jour, comme rangDuJour (outils.ts)
  v_rang := case
    when extract(month from v_jour) = 12 then (extract(year from v_jour)::integer + 1) * 10 + 1
    when extract(month from v_jour) <= 2 then extract(year from v_jour)::integer * 10 + 1
    when extract(month from v_jour) <= 5 then extract(year from v_jour)::integer * 10 + 2
    when extract(month from v_jour) <= 8 then extract(year from v_jour)::integer * 10 + 3
    else extract(year from v_jour)::integer * 10 + 4 end;
  if v_saison is null then
    select s.id into v_saison from rh.saisons s
    where s.rang >= v_rang and exists (select 1 from rh.embauches e where e.saison_id = s.id and e.statut <> 'annulee')
    order by s.rang limit 1;
  end if;
  if v_saison is null then
    select s.id into v_saison from rh.saisons s
    where exists (select 1 from rh.embauches e where e.saison_id = s.id and e.statut <> 'annulee')
    order by s.rang desc limit 1;
  end if;

  return jsonb_build_object(
    'saison_id', v_saison,
    'saisons', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'debut', s.debut, 'fin', s.fin) order by s.rang desc)
      from rh.saisons s
      where exists (select 1 from rh.embauches e where e.saison_id = s.id and e.statut <> 'annulee')), '[]'),
    'fiches', coalesce((
      select jsonb_agg(f order by f ->> 'tri')
      from (
        select jsonb_build_object(
          'personne_id', p.id,
          'prenom', p.prenom,
          'nom_famille', p.nom_famille,
          'surnom', p.surnom,
          'courriel', p.courriel,
          'telephone', p.telephone,
          'date_naissance', p.date_naissance,
          'tri', lower(coalesce(p.surnom, p.prenom) || ' ' || p.nom_famille),
          'postes', (
            select jsonb_agg(jsonb_build_object(
                     'embauche_id', e.id,
                     'poste', po.nom,
                     'entreprise_id', e.entreprise_id,
                     'genre', e.genre,
                     'statut', e.statut,
                     'debut', coalesce(e.debut, s.debut),
                     'fin', coalesce(e.fin, s.fin))
                   order by po.ordre, e.created_at)
            from rh.embauches e
            join rh.saisons s on s.id = e.saison_id
            left join rh.postes po on po.id = e.poste_id
            where e.personne_id = p.id and e.saison_id = v_saison and e.statut <> 'annulee'),
          'dossier', case when d.personne_id is null then null else jsonb_build_object(
            'adresse', d.adresse, 'ville', d.ville, 'province', d.province, 'code_postal', d.code_postal, 'pays', d.pays,
            'assurance_maladie', d.assurance_maladie,
            'allergies', d.allergies, 'diete', d.diete,
            'sante_conditions', d.sante_conditions, 'medicaments', d.medicaments,
            'auto_injecteur', d.auto_injecteur, 'sante_notes', d.sante_notes,
            'urgence1_nom', d.urgence1_nom, 'urgence1_lien', d.urgence1_lien, 'urgence1_telephone', d.urgence1_telephone,
            'urgence2_nom', d.urgence2_nom, 'urgence2_lien', d.urgence2_lien, 'urgence2_telephone', d.urgence2_telephone,
            'mis_a_jour_le', d.updated_at) end,
          -- Photo la plus récente
          'photo', (select x.chemin from rh.documents x where x.personne_id = p.id and x.genre = 'photo'
                    order by x.created_at desc limit 1)
        ) as f
        from rh.personnes p
        left join rh.dossiers d on d.personne_id = p.id
        where exists (select 1 from rh.embauches e where e.personne_id = p.id and e.saison_id = v_saison and e.statut <> 'annulee')
      ) t), '[]'));
end;
$$;

revoke execute on function rh.fiches(uuid) from public, anon;
grant execute on function rh.fiches(uuid) to authenticated;

-- Photo d'une personne (seau rh-documents) : lisible avec l'accès aux
-- fiches. Fonction à part : un coordo ne lit pas rh.documents.
create function rh.est_photo(p_chemin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from rh.documents where chemin = p_chemin and genre = 'photo');
$$;

revoke execute on function rh.est_photo(text) from public, anon;
grant execute on function rh.est_photo(text) to authenticated;

create policy "RH fiches : lire les photos" on storage.objects for select to authenticated
  using (bucket_id = 'rh-documents' and core.peut_lire('rh_fiches') and rh.est_photo(name));
