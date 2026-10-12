-- ============================================================
-- rh, phase 2 : pages publiques (plan-rh.md §4).
--   /emplois            formulaire de candidature (remplace « Dépôt de candidatures »)
--   /retour/<jeton>     intention de retour, par lien personnel (remplace « Intention de retour »)
--   /dossier/<jeton>    dossier d'embauche d'une embauche (remplace les deux « Confirmation d'embauche »)
--
-- L'anonyme n'a AUCUN droit sur le schéma rh (pas même usage). Les pages
-- passent toutes par le Worker (/api/rh/*, worker/rh/api.js) : Turnstile ou
-- jeton vérifié, fichiers déposés avec la clé secrète dans les seaux privés,
-- puis appel des fonctions publiques ci-dessous, exécutables par service_role
-- seulement. Les jetons (48 caractères hexadécimaux) y sont revérifiés.
--
-- Décisions de Maxime (2026-10-12) : codes d'éthique d'Airtable tels quels,
-- mise en forme corrigée, modifiables dans Réglages (la version acceptée est
-- gardée) ; entente de bénévolat rédigée par Claude, à valider ; intention de
-- retour envoyée aux employés d'une saison, cochés à la main, sans lien
-- générique. Pas de contrat ni de courriel en phase 2.
-- ============================================================

-- ------------------------------------------------------------
-- Textes modifiables : codes d'éthique (été, hors été), entente de
-- bénévolat, introduction de l'intention de retour. Une ligne par
-- version, jamais réécrite : une embauche garde la version acceptée.
-- ------------------------------------------------------------
create table rh.textes (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('ethique_ete','ethique_hors_ete','entente_benevolat','intro_retour')),
  version integer not null check (version > 0),
  texte text not null,
  -- Brouillon (ex. rédigé par Claude) que la direction n'a pas encore relu
  a_valider boolean not null default false,
  cree_par uuid references core.profils(id) on delete set null,
  cree_par_nom text,
  created_at timestamptz not null default now(),
  unique (genre, version)
);

-- Version en vigueur d'un texte (la plus récente).
create function rh.texte_courant(p_genre text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', t.id, 'version', t.version, 'texte', t.texte)
  from rh.textes t where t.genre = p_genre
  order by t.version desc limit 1
$$;
revoke execute on function rh.texte_courant(text) from public, anon, authenticated;

-- Nouvelle version d'un texte (Réglages). Même texte qu'avant = version
-- relue (« à valider » retiré).
create function rh.nouveau_texte(p_genre text, p_texte text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  perform pg_advisory_xact_lock(hashtext('rh.textes:' || p_genre));
  insert into rh.textes (genre, version, texte, cree_par, cree_par_nom)
  values (p_genre,
          coalesce((select max(version) from rh.textes where genre = p_genre), 0) + 1,
          btrim(coalesce(p_texte, '')),
          auth.uid(), rh.nom_de(auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Candidatures : anti-doublon du formulaire (clé tirée par la page).
-- ------------------------------------------------------------
alter table rh.candidatures add column cle uuid unique;

-- ------------------------------------------------------------
-- Embauches : lien du dossier d'embauche et versions acceptées.
-- ------------------------------------------------------------
alter table rh.embauches
  -- Lien personnel /dossier/<jeton> ; null = pas encore créé
  add column jeton text unique check (jeton ~ '^[0-9a-f]{48}$'),
  add column code_ethique_texte uuid references rh.textes(id) on delete restrict,
  add column entente_benevolat_texte uuid references rh.textes(id) on delete restrict;

-- ------------------------------------------------------------
-- Intention de retour : une invitation par personne et saison visée.
-- La réponse crée une candidature « retour » (« Non » = ne revient pas).
-- ------------------------------------------------------------
create table rh.invitations (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  -- Saison visée (ex. Été 2027)
  saison_id uuid not null references rh.saisons(id) on delete restrict,
  jeton text not null unique default encode(extensions.gen_random_bytes(24), 'hex') check (jeton ~ '^[0-9a-f]{48}$'),
  -- null = pas encore répondu
  reponse text check (reponse in ('oui','non')),
  repondu_le timestamptz,
  candidature_id uuid references rh.candidatures(id) on delete set null,
  invite_par_nom text,
  created_at timestamptz not null default now(),
  unique (personne_id, saison_id)
);
create index idx_invitations_saison on rh.invitations(saison_id);

-- Spécimens de chèque : 20 Mo comme les autres fichiers des pages publiques.
update storage.buckets set file_size_limit = 20971520 where id = 'rh-paie';

-- ------------------------------------------------------------
-- Outils internes
-- ------------------------------------------------------------

-- Ligne au journal au nom d'une personne sans compte (pages publiques).
create function rh.journal_public(p_personne uuid, p_candidature uuid, p_embauche uuid, p_genre text, p_texte text, p_auteur text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into rh.journal (personne_id, candidature_id, embauche_id, genre, texte, auteur, auteur_nom)
  values (p_personne, p_candidature, p_embauche, p_genre, p_texte, null, p_auteur);
$$;
revoke execute on function rh.journal_public(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- Texte d'un champ : espaces retirés, vide = null, longueur bornée.
create function rh.champ(p jsonb, p_cle text, p_max integer default 500)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(nullif(btrim(p ->> p_cle), ''), p_max)
$$;
revoke execute on function rh.champ(jsonb, text, integer) from public, anon, authenticated;

-- Liste d'identifiants d'un tableau JSON (doublons retirés).
create function rh.ids(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x::uuid), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
$$;
revoke execute on function rh.ids(jsonb) from public, anon, authenticated;

-- ============================================================
-- Fonctions des pages publiques (service_role seulement : le Worker)
-- ============================================================

-- Ce que le formulaire de candidature affiche : saisons ouvertes, postes
-- actifs offerts dans le genre d'une de ces saisons, compagnies.
create function rh.formulaire_emplois()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ouvertes as (select * from rh.saisons where ouverte)
  select jsonb_build_object(
    'saisons', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'genre', s.genre) order by s.rang) from ouvertes s), '[]'),
    'postes', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'compagnie', p.entreprise_id, 'genres', to_jsonb(p.genres), 'description_url', p.description_url)
                       order by e.ordre, p.ordre, p.nom)
      from rh.postes p join core.entreprises e on e.id = p.entreprise_id
      where p.actif and e.actif and p.genres && array(select distinct genre from ouvertes)), '[]'),
    'compagnies', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom) order by e.ordre)
      from core.entreprises e
      where e.actif and exists (select 1 from rh.postes p where p.entreprise_id = e.id and p.actif
                                  and p.genres && array(select distinct genre from ouvertes))), '[]'))
$$;

-- Candidature reçue du formulaire public (/emplois), après Turnstile et
-- les vérifications du Worker (candidature.ts), refaites ici en bref.
-- p : cle, prenom, nom_famille, courriel, telephone, saison_ids, poste_ids,
--     reponses {…}, cv {id, chemin, nom, type_mime, taille}.
-- La personne est retrouvée par son courriel identique, sinon créée.
create function rh.recevoir_candidature(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cle uuid := (p ->> 'cle')::uuid;
  v_courriel text := lower(btrim(p ->> 'courriel'));
  v_prenom text := rh.champ(p, 'prenom', 100);
  v_nom text := coalesce(rh.champ(p, 'nom_famille', 100), '');
  v_tel text := rh.champ(p, 'telephone', 50);
  v_saisons uuid[] := rh.ids(p -> 'saison_ids');
  v_postes uuid[] := rh.ids(p -> 'poste_ids');
  v_genres text[];
  v_cv jsonb := nullif(p -> 'cv', 'null'::jsonb);
  v_personne rh.personnes;
  v_nouvelle boolean := false;
  v_id uuid := gen_random_uuid();
  v_reponses jsonb;
  v_existante uuid;
begin
  if v_cle is null then
    raise exception 'CLE';
  end if;
  select id into v_existante from rh.candidatures where cle = v_cle;
  if found then
    return jsonb_build_object('id', v_existante, 'deja', true);
  end if;

  if v_prenom is null or v_courriel is null or v_courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_tel is null then
    raise exception 'COORDONNEES';
  end if;
  if cardinality(v_saisons) = 0
     or exists (select 1 from unnest(v_saisons) i where not exists (select 1 from rh.saisons s where s.id = i and s.ouverte)) then
    raise exception 'SAISONS';
  end if;
  select array_agg(distinct s.genre) into v_genres from rh.saisons s where s.id = any (v_saisons);
  -- Trois postes au plus, vraiment.
  if not (cardinality(v_postes) between 1 and 3)
     or exists (select 1 from unnest(v_postes) i
                 where not exists (select 1 from rh.postes x where x.id = i and x.actif and x.genres && v_genres)) then
    raise exception 'POSTES';
  end if;
  if v_cv is null or coalesce(v_cv ->> 'chemin', '') !~ '^candidatures/[0-9a-f-]{36}\.[a-z0-9]{1,5}$' then
    raise exception 'CV';
  end if;

  -- Personne : même courriel, sinon nouvelle fiche.
  select * into v_personne from rh.personnes where courriel = v_courriel for update;
  if not found then
    insert into rh.personnes (prenom, nom_famille, courriel, telephone)
    values (v_prenom, v_nom, v_courriel, v_tel)
    on conflict (courriel) where courriel is not null do nothing
    returning * into v_personne;
    if v_personne.id is null then
      select * into v_personne from rh.personnes where courriel = v_courriel;
    else
      v_nouvelle := true;
    end if;
  end if;

  -- Réponses connues seulement, en texte.
  select coalesce(jsonb_object_agg(r.key, left(btrim(r.value), 5000)), '{}')
    into v_reponses
    from jsonb_each_text(coalesce(p -> 'reponses', '{}')) r
   where r.key in ('niveau_etudes','citoyennete','francais','anglais','date_debut','empechements',
                   'motivation','connu_par','refere_par','autre','langue')
     and btrim(r.value) <> '';

  if not v_nouvelle then
    -- Fiche retrouvée : on ne réécrit pas ses coordonnées ; ce qui diffère est noté.
    if lower(btrim(v_prenom || ' ' || v_nom)) <> lower(btrim(v_personne.prenom || ' ' || v_personne.nom_famille)) then
      v_reponses := v_reponses || jsonb_build_object('nom_donne', btrim(v_prenom || ' ' || v_nom));
    end if;
    if v_personne.telephone is null then
      update rh.personnes set telephone = v_tel where id = v_personne.id;
    elsif regexp_replace(v_personne.telephone, '\D', '', 'g') <> regexp_replace(v_tel, '\D', '', 'g') then
      v_reponses := v_reponses || jsonb_build_object('telephone_donne', v_tel);
    end if;
  end if;

  insert into rh.candidatures (id, personne_id, source, saison_ids, poste_ids, reponses, cle)
  values (v_id, v_personne.id, 'formulaire', v_saisons, v_postes, v_reponses, v_cle);

  insert into rh.documents (id, personne_id, candidature_id, genre, nom, chemin, type_mime, taille, ajoute_par_nom)
  values ((v_cv ->> 'id')::uuid, v_personne.id, v_id, 'cv',
          left(v_cv ->> 'nom', 200), v_cv ->> 'chemin', left(v_cv ->> 'type_mime', 100),
          nullif(v_cv ->> 'taille', '')::integer, 'Formulaire web');

  perform rh.journal_public(v_personne.id, v_id, null, 'candidature',
    'Candidature reçue par le formulaire web' ||
      case when v_nouvelle then ' (nouvelle fiche)' else ' (fiche retrouvée par le courriel)' end,
    'Formulaire web');

  return jsonb_build_object('id', v_id, 'personne_id', v_personne.id, 'nouvelle_personne', v_nouvelle, 'deja', false);
end;
$$;

-- Page d'intention de retour (/retour/<jeton>) : à qui elle s'adresse,
-- pour quelle saison, et la réponse déjà donnée (modifiable tant que la
-- direction n'a pas traité la candidature).
create function rh.retour_public(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i rh.invitations;
  v_p rh.personnes;
  v_s rh.saisons;
  v_c rh.candidatures;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select * into i from rh.invitations where jeton = p_jeton;
  if not found then
    return null;
  end if;
  select * into v_p from rh.personnes where id = i.personne_id;
  select * into v_s from rh.saisons where id = i.saison_id;
  select * into v_c from rh.candidatures where id = i.candidature_id;
  return jsonb_build_object(
    'prenom', v_p.prenom,
    'surnom', v_p.surnom,
    'saison', jsonb_build_object('id', v_s.id, 'nom', v_s.nom, 'genre', v_s.genre),
    'saisons', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'genre', s.genre) order by s.rang)
      from rh.saisons s where s.ouverte or s.id = i.saison_id), '[]'),
    'postes', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'compagnie', p.entreprise_id, 'genres', to_jsonb(p.genres))
                       order by e.ordre, p.ordre, p.nom)
      from rh.postes p join core.entreprises e on e.id = p.entreprise_id
      where (p.actif and e.actif) or p.id = any (coalesce(v_c.poste_ids, '{}'))), '[]'),
    'compagnies', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom) order by e.ordre)
      from core.entreprises e where e.actif), '[]'),
    'intro', rh.texte_courant('intro_retour'),
    'reponse', i.reponse,
    'repondu_le', i.repondu_le,
    'modifiable', v_c.id is null or v_c.statut in ('recue','ne_revient_pas'),
    'precedent', case when v_c.id is null then null else jsonb_build_object(
      'saison_ids', to_jsonb(v_c.saison_ids),
      'poste_ids', to_jsonb(v_c.poste_ids),
      'date_debut', v_c.reponses ->> 'date_debut',
      'empechements', v_c.reponses ->> 'empechements',
      'autre', v_c.reponses ->> 'autre') end);
end;
$$;

-- Réponse à l'intention de retour. « Oui » = candidature « retour » à
-- traiter ; « Non » = candidature au statut « Ne revient pas ».
-- p : reponse ('oui'|'non'), saison_ids, poste_ids, date_debut, empechements, autre.
create function rh.repondre_retour(p_jeton text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i rh.invitations;
  v_p rh.personnes;
  v_s rh.saisons;
  v_c rh.candidatures;
  v_oui boolean;
  v_saisons uuid[];
  v_postes uuid[];
  v_debut date;
  v_reponses jsonb;
  v_auteur text;
  v_noms text;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    raise exception 'JETON';
  end if;
  select * into i from rh.invitations where jeton = p_jeton for update;
  if not found then
    raise exception 'JETON';
  end if;
  select * into v_c from rh.candidatures where id = i.candidature_id for update;
  if v_c.id is not null and v_c.statut not in ('recue','ne_revient_pas') then
    raise exception 'DEJA_TRAITEE';
  end if;
  if coalesce(p ->> 'reponse', '') not in ('oui','non') then
    raise exception 'REPONSE';
  end if;
  v_oui := p ->> 'reponse' = 'oui';
  select * into v_p from rh.personnes where id = i.personne_id;
  select * into v_s from rh.saisons where id = i.saison_id;

  if v_oui then
    v_saisons := rh.ids(p -> 'saison_ids');
    v_postes := rh.ids(p -> 'poste_ids');
    if cardinality(v_saisons) = 0
       or exists (select 1 from unnest(v_saisons) x where not exists (select 1 from rh.saisons s where s.id = x and (s.ouverte or s.id = i.saison_id))) then
      raise exception 'SAISONS';
    end if;
    if cardinality(v_postes) = 0
       or exists (select 1 from unnest(v_postes) x where not exists (select 1 from rh.postes s where s.id = x and (s.actif or s.id = any (coalesce(v_c.poste_ids, '{}'))))) then
      raise exception 'POSTES';
    end if;
    begin
      v_debut := (p ->> 'date_debut')::date;
    exception when others then
      raise exception 'DATE_DEBUT';
    end;
    if v_debut is null then
      raise exception 'DATE_DEBUT';
    end if;
  else
    v_saisons := array[i.saison_id];
    v_postes := '{}';
  end if;

  v_reponses := jsonb_strip_nulls(jsonb_build_object(
    'intention', case when v_oui then 'Oui, veut revenir' else 'Non' end,
    'date_debut', case when v_oui then v_debut::text end,
    'empechements', case when v_oui then rh.champ(p, 'empechements', 2000) end,
    'autre', rh.champ(p, 'autre', 5000)));

  if v_c.id is null then
    insert into rh.candidatures (personne_id, source, saison_ids, poste_ids, reponses, statut)
    values (i.personne_id, 'retour', v_saisons, v_postes, v_reponses, case when v_oui then 'recue' else 'ne_revient_pas' end)
    returning * into v_c;
  else
    update rh.candidatures
       set saison_ids = v_saisons, poste_ids = v_postes, reponses = v_reponses,
           statut = case when v_oui then 'recue' else 'ne_revient_pas' end
     where id = v_c.id;
  end if;
  update rh.invitations
     set reponse = p ->> 'reponse', repondu_le = now(), candidature_id = v_c.id
   where id = i.id;

  select string_agg(s.nom, ', ' order by s.rang) into v_noms from rh.saisons s where s.id = any (v_saisons);
  v_auteur := coalesce(v_p.surnom, v_p.prenom) || ' (intention de retour)';
  perform rh.journal_public(i.personne_id, v_c.id, null, 'candidature',
    case when i.reponse is null then 'Intention de retour : ' else 'Intention de retour modifiée : ' end ||
      case when v_oui then 'Oui — ' || v_noms else 'Non (' || v_s.nom || ')' end,
    v_auteur);
  return jsonb_build_object('ok', true, 'reponse', p ->> 'reponse');
end;
$$;

-- Dossier d'embauche (/dossier/<jeton>) : de quoi afficher et pré-remplir
-- la page. Le NAS et le numéro de compte ne sortent JAMAIS : seulement
-- leurs 3 derniers chiffres. Dossier complet ou annulé : lien fermé.
-- personne_id et embauche_id servent au Worker (retirés avant la page).
create function rh.dossier_public(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_p rh.personnes;
  v_s rh.saisons;
  v_d rh.dossiers;
  v_paie rh.paie;
  v_poste rh.postes;
  v_cie core.entreprises;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select * into e from rh.embauches where jeton = p_jeton;
  if not found then
    return null;
  end if;
  select * into v_p from rh.personnes where id = e.personne_id;
  if e.statut in ('complete','annulee') then
    return jsonb_build_object('ferme', true, 'statut', e.statut, 'prenom', v_p.prenom);
  end if;
  select * into v_s from rh.saisons where id = e.saison_id;
  select * into v_d from rh.dossiers where personne_id = e.personne_id;
  select * into v_paie from rh.paie where personne_id = e.personne_id;
  select * into v_poste from rh.postes where id = e.poste_id;
  select * into v_cie from core.entreprises where id = e.entreprise_id;

  return jsonb_build_object(
    'ferme', false,
    'embauche_id', e.id,
    'personne_id', e.personne_id,
    'statut', e.statut,
    'dossier_recu_le', e.dossier_recu_le,
    'genre', e.genre,
    'poste', v_poste.nom,
    'compagnie', case when v_cie.id is null then null else jsonb_build_object('nom', v_cie.nom, 'abreviation', v_cie.abreviation) end,
    'debut', coalesce(e.debut, v_s.debut),
    'fin', coalesce(e.fin, v_s.fin),
    'saison', jsonb_build_object('nom', v_s.nom, 'genre', v_s.genre, 'debut', v_s.debut, 'fin', v_s.fin),
    'dates', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'genre', d.genre, 'nom', d.nom, 'debut', d.debut, 'fin', d.fin,
                                          'obligatoire', d.obligatoire, 'note', d.note) order by d.ordre, d.debut)
      from rh.saisons_dates d where d.saison_id = e.saison_id), '[]'),
    'personne', jsonb_build_object('prenom', v_p.prenom, 'nom_famille', v_p.nom_famille, 'surnom', v_p.surnom,
                                   'courriel', v_p.courriel, 'telephone', v_p.telephone, 'date_naissance', v_p.date_naissance),
    'dossier', case when v_d.personne_id is null then null else to_jsonb(v_d) - 'personne_id' - 'updated_at' - 'updated_by' end,
    'paie', case when e.genre = 'emploi' then jsonb_build_object(
      'nas_fin', v_paie.nas_fin,
      'compte_fin', v_paie.compte_fin,
      'specimen', v_paie.specimen is not null) end,
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('genre', x.genre, 'nom', x.nom, 'le', x.created_at) order by x.created_at)
      from rh.documents x where x.personne_id = e.personne_id and x.genre <> 'autre'), '[]'),
    'disponibilites', to_jsonb(e.disponibilites),
    'disponibilites_note', e.disponibilites_note,
    'presentation', e.presentation,
    'commentaires', e.commentaires,
    'ethique', rh.texte_courant(case when v_s.genre = 'ete' then 'ethique_ete' else 'ethique_hors_ete' end),
    'ethique_accepte_le', e.code_ethique_le,
    'entente', case when e.genre = 'benevolat' then rh.texte_courant('entente_benevolat') end,
    'entente_acceptee_le', e.entente_benevolat_le);
end;
$$;

-- Dossier d'embauche envoyé (ou renvoyé pour corriger) : personne,
-- dossier, paie chiffrée, embauche, documents ; l'embauche passe à
-- « Dossier reçu ». Les fichiers sont déjà dans les seaux (Worker) ; en
-- cas d'erreur, le Worker les retire. Rend l'ancien spécimen remplacé.
create function rh.recevoir_dossier(p_jeton text, p jsonb)
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
    urgence2_telephone = rh.champ(v_dos, 'urgence2_telephone', 50)
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

-- ============================================================
-- Fonctions de l'app (direction : écriture dans RH)
-- ============================================================

-- Lien du dossier d'embauche : créé au besoin, ou refait (l'ancien ne
-- fonctionne plus). Rend le jeton.
create function rh.lien_dossier(p_embauche uuid, p_refaire boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_jeton text;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into e from rh.embauches where id = p_embauche for update;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  if e.statut in ('complete','annulee') then
    raise exception 'FERME';
  end if;
  if e.jeton is not null and not p_refaire then
    return e.jeton;
  end if;
  v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
  update rh.embauches set jeton = v_jeton where id = e.id;
  perform rh.journaliser(e.personne_id, e.candidature_id, e.id, 'dossier',
    case when e.jeton is null then 'Lien du dossier d''embauche créé' else 'Lien du dossier d''embauche refait (l''ancien ne fonctionne plus)' end);
  return v_jeton;
end;
$$;

-- Valider une embauche : elle devient complète (le lien du dossier se
-- ferme). Un emploi doit avoir ses champs de paie, son NAS et son compte.
create function rh.valider_embauche(p_embauche uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_paie rh.paie;
  v_manque text[] := '{}';
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into e from rh.embauches where id = p_embauche for update;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  if e.statut in ('complete','annulee') then
    raise exception 'FERME';
  end if;
  if e.entreprise_id is null then v_manque := array_append(v_manque, 'compagnie'); end if;
  if e.genre = 'emploi' then
    select * into v_paie from rh.paie where personne_id = e.personne_id;
    if e.poste_id is null then v_manque := array_append(v_manque, 'poste'); end if;
    if e.remuneration is null then v_manque := array_append(v_manque, 'remuneration'); end if;
    if e.taux is null then v_manque := array_append(v_manque, 'taux'); end if;
    if e.vacances is null then v_manque := array_append(v_manque, 'vacances'); end if;
    if e.type_employe is null then v_manque := array_append(v_manque, 'type_employe'); end if;
    if e.action_paie is null then v_manque := array_append(v_manque, 'action_paie'); end if;
    if e.date_embauche is null then v_manque := array_append(v_manque, 'date_embauche'); end if;
    if v_paie.nas is null then v_manque := array_append(v_manque, 'nas'); end if;
    if v_paie.compte is null then v_manque := array_append(v_manque, 'compte'); end if;
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'CHAMPS_MANQUANTS:%', array_to_string(v_manque, ',');
  end if;
  -- Le déclencheur note « Dossier reçu → Complète » au journal.
  update rh.embauches set statut = 'complete' where id = e.id;
end;
$$;

-- Inviter des personnes à l'intention de retour d'une saison. Une
-- invitation par personne et saison (les déjà invitées sont ignorées).
-- Rend le nombre de nouvelles invitations.
create function rh.inviter_retour(p_saison uuid, p_personnes uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s rh.saisons;
  v_n integer := 0;
  r record;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_s from rh.saisons where id = p_saison;
  if not found then
    raise exception 'SAISON_INTROUVABLE';
  end if;
  for r in
    insert into rh.invitations (personne_id, saison_id, invite_par_nom)
    select distinct x, p_saison, rh.nom_de(auth.uid())
      from unnest(p_personnes) x
     where exists (select 1 from rh.personnes p where p.id = x)
    on conflict (personne_id, saison_id) do nothing
    returning personne_id
  loop
    perform rh.journaliser(r.personne_id, null, null, 'candidature', 'Invitation à l''intention de retour (' || v_s.nom || ')');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Droits. Les fonctions publiques : service_role seulement (le Worker).
-- ------------------------------------------------------------
revoke execute on function
  rh.formulaire_emplois(), rh.recevoir_candidature(jsonb),
  rh.retour_public(text), rh.repondre_retour(text, jsonb),
  rh.dossier_public(text), rh.recevoir_dossier(text, jsonb)
from public, anon, authenticated;
grant execute on function
  rh.formulaire_emplois(), rh.recevoir_candidature(jsonb),
  rh.retour_public(text), rh.repondre_retour(text, jsonb),
  rh.dossier_public(text), rh.recevoir_dossier(text, jsonb)
to service_role;

revoke execute on function
  rh.nouveau_texte(text, text), rh.lien_dossier(uuid, boolean),
  rh.valider_embauche(uuid), rh.inviter_retour(uuid, uuid[])
from public, anon;
grant execute on function
  rh.nouveau_texte(text, text), rh.lien_dossier(uuid, boolean),
  rh.valider_embauche(uuid), rh.inviter_retour(uuid, uuid[])
to authenticated;

grant select on rh.textes, rh.invitations to authenticated;
grant delete on rh.invitations to authenticated;
grant all on rh.textes, rh.invitations to service_role;

alter table rh.textes enable row level security;
alter table rh.invitations enable row level security;

create policy "Lire textes" on rh.textes for select to authenticated using (core.peut_lire('rh'));
create policy "Lire invitations" on rh.invitations for select to authenticated using (core.peut_lire('rh'));
-- Une invitation pas encore répondue peut être retirée.
create policy "Retirer invitations" on rh.invitations for delete to authenticated
  using (core.peut_ecrire('rh') and reponse is null);

-- ============================================================
-- Textes de départ
-- ============================================================

-- Codes d'éthique d'Airtable, mots inchangés ; seule la mise en forme est
-- corrigée (les puces « Être ponctuel.le »… étaient rangées par erreur sous
-- « Être respectueux.euse »). Syntaxe : « - » puce, « ␣␣- » sous-puce.
insert into rh.textes (genre, version, texte) values
('ethique_ete', 1, $t$Je dois :
- Assurer la sécurité des enfants/clients en tout temps
- Offrir une animation, une gestion d'équipe et un travail de qualité
- Être respectueux.euse
  - Des campeurs ;
  - Des clients externes ;
  - Des collègues et des supérieurs ;
  - De l'environnement ; et
  - Du matériel
- Être ponctuel.le, constant.e, enthousiaste et souriant.e
- Représenter mon organisation par mon positivisme.
- Rester professionnel.le dans mon attitude et mes actions.
- Porter des vêtements appropriés. *N'oubliez pas que vous travaillez avec des enfants.
- Participer aux activités, aux réunions tel que requis par la direction
- Accepter la critique constructive, les façons de faire des autres, les traditions du camp, les décisions de la direction, etc.
- Avoir une bonne hygiène corporelle.

Je ne peux pas :
- Utiliser mon cellulaire, tablette, etc. à des fins personnelles lorsque je travaille.
- Inviter des personnes sur le camp.
- Fumer, boire ou consommer de l'alcool et de la drogue sur le site de la BPA.
- Avoir des relations amicales ou amoureuses avec un.e campeur.euse / client.es
- Exprimer toutes formes d'agressions physiques, psychologiques, verbales ou sexuelles.
- Laisser mon groupe sans surveillance sans en avoir, au préalable, avisé ma ou mon supérieur.e.
- Faire écouter de la musique ou des vidéos aux campeur.euse.s sans m'être assuré.e qu'elles soient adéquates pour des jeunes. (Sans propos violents, sexistes, racistes ou sexuels).

En cas de non-respect d'une des clauses du présent code d'éthique, la direction appliquera la politique suivante en matière de mesure disciplinaire.
- 1ère infraction : Avis verbal
- 2e infraction : Avis écrit noté au dossier de l'employé
- 3e infraction : Suspension sans solde (durée déterminée selon le cas)
- 4e infraction : Renvoi

Pour les fautes jugées graves et/ou manquements au code d'éthique, la direction se réserve le droit de renvoyer l'animateur sans préavis.$t$),
('ethique_hors_ete', 1, $t$Je dois :
- Assurer la sécurité des enfants/clients en tout temps
- Offrir une animation, une gestion d'équipe et un travail de qualité
- Être respectueux.euse
  - Des campeurs ;
  - Des clients externes ;
  - Des collègues et des supérieurs ;
  - De l'environnement ; et
  - Du matériel
- Être ponctuel.le, constant.e, enthousiaste et souriant.e
- Représenter mon organisation par mon positivisme.
- Rester professionnel.le dans mon attitude et mes actions.
- Porter des vêtements appropriés. *N'oubliez pas que vous travaillez avec des enfants.
- Participer aux activités, aux réunions tel que requis par la direction
- Accepter la critique constructive, les façons de faire des autres, les traditions du camp, les décisions de la direction, etc.
- Avoir une bonne hygiène corporelle.

Je ne peux pas :
- Utiliser mon cellulaire, tablette, etc. à des fins personnelles lorsque je travaille.
- Inviter des personnes sur le camp.
- Posséder ou consommer de l'alcool ou de la drogue sur le site de la BPA
- Avoir des relations amicales ou amoureuses avec un.e campeur.euse / client.es
- Exprimer toutes formes d'agressions physiques, psychologiques, verbales ou sexuelles.
- Laisser mon groupe sans surveillance sans en avoir, au préalable, avisé ma ou mon supérieur.e.
- Faire écouter de la musique ou des vidéos aux campeur.euse.s sans m'être assuré.e qu'elles soient adéquates pour des jeunes. (Sans propos violents, sexistes, racistes ou sexuels).

En cas de non-respect d'une des clauses du présent code d'éthique, la direction appliquera la politique suivante en matière de mesure disciplinaire.
- 1ère infraction : Avis verbal
- 2e infraction : Avis écrit noté au dossier de l'employé
- 3e infraction : Renvoi

Pour les fautes jugées graves et/ou manquements au code d'éthique, la direction se réserve le droit de renvoyer l'animateur sans préavis.$t$);

-- Entente de bénévolat : brouillon rédigé par Claude (aucun texte dans
-- Airtable), à relire par la direction (« à valider » dans Réglages).
insert into rh.textes (genre, version, texte, a_valider) values
('entente_benevolat', 1, $t$En cochant la case ci-dessous, je confirme que :
- Je donne mon temps comme bénévole, sans rémunération, pour les dates et les tâches convenues avec la direction.
- Cette entente ne crée pas de lien d'emploi : je ne reçois ni salaire ni avantage d'un employé.
- Je respecte le code d'éthique ci-dessus, les consignes de sécurité et les directives de la personne qui m'encadre.
- Je garde confidentiels les renseignements sur les campeurs, les clients et l'équipe dont je prends connaissance.
- J'avise la direction le plus tôt possible si je ne peux pas être présent.e à une date convenue.
- Je peux mettre fin à mon bénévolat en tout temps en avisant la direction ; la direction peut aussi y mettre fin.
- J'accepte qu'une vérification de mes antécédents judiciaires soit faite si mes tâches me mettent en contact avec des jeunes.$t$, true);

-- Introduction de l'intention de retour : texte d'Airtable ; la saison et
-- le lien du formulaire ne sont plus écrits en dur ({{saison}}, {{lien_emplois}}).
insert into rh.textes (genre, version, texte) values
('intro_retour', 1, $t$Salut {{prenom}} !

Un petit sondage express pour connaître tes intentions quant à la saison {{saison}} ! 👀

Merci d'y répondre rapidement, ça nous aidera à planifier les besoins en embauche à l'externe... mais on espère vraiment garder le plus de nos anciens parmi nous ! 🥳
On te tiendra au courant très vite pour la suite (rencontre préparatoire, contrat, planification d'été). 🚀

En passant, si tu as des ami(e)s ou connaissances qui voudraient rejoindre l'équipe l'été prochain, dis-leur de soumettre leur candidature au plus vite via ce formulaire : {{lien_emplois}}
Une prime de référencement de **100$/pers** est à gagner si la personne fait l'été au complet avec nous! 🎉💰

Hâte d'avoir de tes nouvelles! 😄$t$);
