-- ============================================================
-- rh, phase 3 (2/2) : contrat produit et signé en ligne (plan-rh.md §6).
--
-- Décisions de Maxime (2026-10-15) : modèles de départ tirés des PDF
-- d'Airtable (« BPA - Animateur Classes Rouges - Contrat », « Consentement
-- parental »), à relire ; le contrat est pré-signé au nom de la personne qui
-- le prépare ; taux tirés d'une grille poste × échelon par saison.
--
-- « Préparer le contrat » (app) fige les termes (poste, taux, dates,
-- compagnie, signataire) et le texte du modèle dans rh.contrats ; le PDF est
-- produit à la demande avec les coordonnées à jour de l'employé (Worker,
-- src/modules/rh/contrat.ts). L'employé le signe dans son dossier
-- d'embauche (/dossier/<jeton>) ; un parent signe le consentement parental
-- d'une personne mineure au début de l'embauche, dans la même page. Le
-- Worker pose la signature, ajoute le certificat et garde le PDF signé dans
-- les documents ; seules les fonctions ci-dessous (service_role) écrivent
-- une signature.
-- ============================================================

-- Tâches du poste, reprises dans le contrat (« 1.2 Tâches »).
alter table rh.postes add column taches text;

-- ------------------------------------------------------------
-- Grille des taux : par saison, poste et échelon.
-- ------------------------------------------------------------
create table rh.taux (
  id uuid primary key default gen_random_uuid(),
  saison_id uuid not null references rh.saisons(id) on delete cascade,
  poste_id uuid not null references rh.postes(id) on delete cascade,
  echelon smallint not null check (echelon between 1 and 5),
  remuneration text not null default 'heure' check (remuneration in ('heure','semaine')),
  montant numeric(8,2) not null check (montant >= 0),
  updated_at timestamptz not null default now(),
  unique (saison_id, poste_id, echelon)
);

-- Une embauche d'emploi créée sans taux reçoit celui de la grille.
create function rh.taux_de_la_grille()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t rh.taux;
begin
  if new.genre = 'emploi' and new.taux is null and new.poste_id is not null and new.echelon is not null then
    select * into t from rh.taux where saison_id = new.saison_id and poste_id = new.poste_id and echelon = new.echelon;
    if t.id is not null then
      new.taux := t.montant;
      new.remuneration := coalesce(new.remuneration, t.remuneration);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_embauches_taux before insert on rh.embauches
for each row execute function rh.taux_de_la_grille();

create trigger trg_taux_updated_at before update on rh.taux
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Modèles de contrats : contrat d'emploi, consentement parental. Le plus
-- précis l'emporte (compagnie et genre de saison, puis compagnie, puis
-- genre de saison, puis le modèle commun).
-- ------------------------------------------------------------
create table rh.modeles_contrats (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('contrat','consentement')),
  entreprise_id uuid references core.entreprises(id) on delete cascade,
  genre_saison text check (genre_saison in ('ete','hors_ete')),
  titre text not null check (btrim(titre) <> ''),
  contenu text not null,
  -- Repris d'Airtable ou rédigé par Claude, pas encore relu
  a_valider boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_nom text
);
create unique index idx_modeles_contrats on rh.modeles_contrats (genre, coalesce(entreprise_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(genre_saison, ''));

create trigger trg_modeles_contrats_signer before insert or update on rh.modeles_contrats
for each row execute function rh.signer_reglage();

-- ------------------------------------------------------------
-- Contrats (et consentements) d'une embauche. Un seul en attente par
-- embauche et genre ; le refaire annule l'ancien.
-- ------------------------------------------------------------
create table rh.contrats (
  id uuid primary key default gen_random_uuid(),
  embauche_id uuid not null references rh.embauches(id) on delete cascade,
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  genre text not null default 'contrat' check (genre in ('contrat','consentement')),
  statut text not null default 'en_attente' check (statut in ('en_attente','signe','annule')),
  titre text not null,
  -- Texte du modèle, figé à la préparation
  contenu text not null,
  -- Termes figés : poste, saison, dates, taux, compagnie, tâches, signataire
  termes jsonb not null default '{}',
  cree_le timestamptz not null default now(),
  cree_par uuid references core.profils(id) on delete set null,
  cree_par_nom text,
  signe_le timestamptz,
  nom_signataire text,
  -- Consentement : lien du signataire avec l'employé (mère, père, tuteur…)
  lien_signataire text,
  adresse_ip text,
  navigateur text,
  -- Empreinte SHA-256 du document présenté à la signature
  empreinte text,
  document_id uuid references rh.documents(id) on delete set null,
  annule_le timestamptz
);
create index idx_contrats_embauche on rh.contrats(embauche_id);
create unique index idx_contrats_un_en_attente on rh.contrats (embauche_id, genre) where statut = 'en_attente';

-- L'app prépare un contrat (en attente) ou l'annule ; la signature passe
-- par rh.contrat_signe / rh.consentement_signe (Worker), qui posent le
-- réglage de transaction rh.signature (jamais une session de l'app).
create function rh.verifier_contrat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or current_setting('rh.signature', true) = 'oui' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.statut <> 'en_attente' or new.genre <> 'contrat' then
      raise exception 'CONTRAT_EN_ATTENTE_SEULEMENT';
    end if;
    new.cree_par := auth.uid();
    new.cree_par_nom := rh.nom_de(auth.uid());
    -- Pré-signé au nom de la personne qui le prépare, ce jour-là (jamais au nom d'une autre).
    new.termes := coalesce(new.termes, '{}'::jsonb)
      || jsonb_build_object('signataire', new.cree_par_nom, 'prepare_le', (now() at time zone 'America/Montreal')::date);
    new.signe_le := null;
    new.nom_signataire := null;
    new.document_id := null;
    -- Un nouveau contrat remplace celui en attente.
    update rh.contrats set statut = 'annule', annule_le = now()
     where embauche_id = new.embauche_id and genre = 'contrat' and statut = 'en_attente';
    perform rh.journaliser(new.personne_id, null, new.embauche_id, 'embauche', 'Contrat préparé : ' || new.titre);
    return new;
  end if;
  if old.statut <> 'en_attente' or new.statut not in ('en_attente','annule') then
    raise exception 'CONTRAT_DEJA_SIGNE';
  end if;
  if new.statut = 'annule' then
    new.annule_le := now();
  end if;
  new.contenu := old.contenu;
  new.termes := old.termes;
  new.signe_le := old.signe_le;
  new.document_id := old.document_id;
  return new;
end;
$$;

create trigger trg_contrats_verifier before insert or update on rh.contrats
for each row execute function rh.verifier_contrat();

-- Âge en années pleines à une date.
create function rh.age_a(p_naissance date, p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from age(p_date, p_naissance))::integer
$$;

-- ------------------------------------------------------------
-- Fonctions des pages publiques (service_role : le Worker)
-- ------------------------------------------------------------

-- Embauche ouverte d'après le jeton du dossier, sinon une exception.
create function rh.embauche_ouverte(p_jeton text)
returns rh.embauches
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    raise exception 'JETON';
  end if;
  select * into e from rh.embauches where jeton = p_jeton;
  if not found then
    raise exception 'JETON';
  end if;
  if e.statut not in ('a_envoyer','envoyee','dossier_recu') then
    raise exception 'FERME';
  end if;
  return e;
end;
$$;

-- Ce qu'il faut pour produire le contrat d'une embauche (à lire ou à signer) :
-- termes figés, texte, coordonnées à jour de l'employé.
create function rh.contrat_a_produire(p_jeton text, p_contrat uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  k rh.contrats;
  v_p rh.personnes;
  v_d rh.dossiers;
  v_doc rh.documents;
begin
  -- Un contrat signé reste lisible tant que le lien existe, même l'embauche validée.
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    raise exception 'JETON';
  end if;
  select * into e from rh.embauches where jeton = p_jeton;
  if not found then
    raise exception 'JETON';
  end if;
  select * into k from rh.contrats where id = p_contrat and embauche_id = e.id and genre = 'contrat';
  if not found or k.statut = 'annule' then
    raise exception 'CONTRAT_INTROUVABLE';
  end if;
  select * into v_p from rh.personnes where id = e.personne_id;
  select * into v_d from rh.dossiers where personne_id = e.personne_id;
  select * into v_doc from rh.documents where id = k.document_id;
  return jsonb_build_object(
    'id', k.id, 'statut', k.statut, 'titre', k.titre, 'contenu', k.contenu, 'termes', k.termes,
    'cree_le', k.cree_le, 'cree_par_nom', k.cree_par_nom, 'signe_le', k.signe_le,
    'chemin_signe', v_doc.chemin,
    'embauche_id', e.id, 'personne_id', e.personne_id, 'embauche_ouverte', e.statut in ('a_envoyer','envoyee','dossier_recu'),
    'employe', jsonb_build_object(
      'prenom', v_p.prenom, 'nom_famille', v_p.nom_famille, 'courriel', v_p.courriel, 'telephone', v_p.telephone,
      'adresse', v_d.adresse, 'ville', v_d.ville, 'province', v_d.province, 'code_postal', v_d.code_postal));
end;
$$;

-- Contrat signé : le Worker a posé la signature et déposé le PDF.
-- p : nom, adresse_ip, navigateur, empreinte, document {id, chemin, nom, taille}.
create function rh.contrat_signe(p_jeton text, p_contrat uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches := rh.embauche_ouverte(p_jeton);
  k rh.contrats;
  v_doc jsonb := p -> 'document';
begin
  select * into k from rh.contrats where id = p_contrat and embauche_id = e.id and genre = 'contrat' for update;
  if not found or k.statut <> 'en_attente' then
    raise exception 'CONTRAT_INTROUVABLE';
  end if;
  if rh.champ(p, 'nom', 200) is null then
    raise exception 'NOM_REQUIS';
  end if;
  if coalesce(v_doc ->> 'chemin', '') !~ ('^' || e.personne_id || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'FICHIER';
  end if;
  perform set_config('rh.signature', 'oui', true);
  insert into rh.documents (id, personne_id, embauche_id, genre, nom, chemin, type_mime, taille, ajoute_par_nom)
  values ((v_doc ->> 'id')::uuid, e.personne_id, e.id, 'contrat', left(v_doc ->> 'nom', 200), v_doc ->> 'chemin',
          'application/pdf', nullif(v_doc ->> 'taille', '')::integer, rh.champ(p, 'nom', 200) || ' (signature en ligne)');
  update rh.contrats set
    statut = 'signe', signe_le = now(), nom_signataire = rh.champ(p, 'nom', 200),
    adresse_ip = rh.champ(p, 'adresse_ip', 100), navigateur = rh.champ(p, 'navigateur', 300),
    empreinte = rh.champ(p, 'empreinte', 100), document_id = (v_doc ->> 'id')::uuid
  where id = k.id;
  perform rh.journal_public(e.personne_id, e.candidature_id, e.id, 'embauche',
    'Contrat signé en ligne : ' || k.titre, rh.champ(p, 'nom', 200) || ' (signature en ligne)');
end;
$$;

-- Ce qu'il faut pour le consentement parental d'une embauche : modèle,
-- employé, compagnie, saison. Null si personne n'est mineur au début.
create function rh.consentement_a_produire(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e rh.embauches := rh.embauche_ouverte(p_jeton);
  v_p rh.personnes;
  v_s rh.saisons;
  v_c rh.compagnies;
  v_e core.entreprises;
  m rh.modeles_contrats;
begin
  select * into v_p from rh.personnes where id = e.personne_id;
  select * into v_s from rh.saisons where id = e.saison_id;
  select * into v_c from rh.compagnies where entreprise_id = e.entreprise_id;
  select * into v_e from core.entreprises where id = e.entreprise_id;
  select * into m from rh.modeles_contrats x
   where x.genre = 'consentement'
     and (x.entreprise_id is null or x.entreprise_id = e.entreprise_id)
     and (x.genre_saison is null or x.genre_saison = case when v_s.genre = 'ete' then 'ete' else 'hors_ete' end)
   order by (x.entreprise_id is not null) desc, (x.genre_saison is not null) desc
   limit 1;
  return jsonb_build_object(
    'embauche_id', e.id, 'personne_id', e.personne_id,
    'modele', case when m.id is null then null else jsonb_build_object('titre', m.titre, 'contenu', m.contenu) end,
    'employe', jsonb_build_object('prenom', v_p.prenom, 'nom_famille', v_p.nom_famille, 'date_naissance', v_p.date_naissance),
    'compagnie', coalesce(v_c.raison_sociale, v_e.nom),
    'saison', v_s.nom,
    'debut', coalesce(e.debut, v_s.debut));
end;
$$;

-- Consentement parental signé (PDF produit et déposé par le Worker).
-- p : nom (parent), lien, adresse_ip, navigateur, empreinte, titre, contenu,
--     document {id, chemin, nom, taille}.
create function rh.consentement_signe(p_jeton text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches := rh.embauche_ouverte(p_jeton);
  v_doc jsonb := p -> 'document';
  v_id uuid := gen_random_uuid();
begin
  if rh.champ(p, 'nom', 200) is null or rh.champ(p, 'lien', 100) is null then
    raise exception 'NOM_REQUIS';
  end if;
  if coalesce(v_doc ->> 'chemin', '') !~ ('^' || e.personne_id || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'FICHIER';
  end if;
  perform set_config('rh.signature', 'oui', true);
  insert into rh.documents (id, personne_id, embauche_id, genre, nom, chemin, type_mime, taille, ajoute_par_nom)
  values ((v_doc ->> 'id')::uuid, e.personne_id, e.id, 'consentement_parental', left(v_doc ->> 'nom', 200), v_doc ->> 'chemin',
          'application/pdf', nullif(v_doc ->> 'taille', '')::integer, rh.champ(p, 'nom', 200) || ' (parent, signature en ligne)');
  insert into rh.contrats (id, embauche_id, personne_id, genre, statut, titre, contenu, signe_le, nom_signataire, lien_signataire,
                           adresse_ip, navigateur, empreinte, document_id, cree_par_nom)
  values (v_id, e.id, e.personne_id, 'consentement', 'signe', coalesce(rh.champ(p, 'titre', 200), 'Consentement parental'),
          coalesce(p ->> 'contenu', ''), now(), rh.champ(p, 'nom', 200), rh.champ(p, 'lien', 100),
          rh.champ(p, 'adresse_ip', 100), rh.champ(p, 'navigateur', 300), rh.champ(p, 'empreinte', 100),
          (v_doc ->> 'id')::uuid, rh.champ(p, 'nom', 200));
  perform rh.journal_public(e.personne_id, e.candidature_id, e.id, 'embauche',
    'Consentement parental signé en ligne par ' || rh.champ(p, 'nom', 200) || ' (' || rh.champ(p, 'lien', 100) || ')',
    rh.champ(p, 'nom', 200) || ' (parent)');
end;
$$;

-- Dossier d'embauche : comme en phase 2, plus le contrat à signer et le
-- consentement parental.
create or replace function rh.dossier_public(p_jeton text)
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
  k rh.contrats;
  v_cons rh.contrats;
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
  select * into k from rh.contrats where embauche_id = e.id and genre = 'contrat' and statut <> 'annule' order by cree_le desc limit 1;
  select * into v_cons from rh.contrats where embauche_id = e.id and genre = 'consentement' and statut = 'signe' order by signe_le desc limit 1;

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
    'entente_acceptee_le', e.entente_benevolat_le,
    'contrat', case when k.id is null then null else jsonb_build_object(
      'id', k.id, 'titre', k.titre, 'statut', k.statut, 'signe_le', k.signe_le, 'nom_signataire', k.nom_signataire) end,
    'consentement', case when v_cons.id is null then null else jsonb_build_object(
      'id', v_cons.id, 'signe_le', v_cons.signe_le, 'nom_signataire', v_cons.nom_signataire, 'lien_signataire', v_cons.lien_signataire) end);
end;
$$;

-- Valider : comme avant, plus le contrat signé (emploi) et, pour une
-- personne mineure au début de l'embauche, le consentement parental signé.
create or replace function rh.valider_embauche(p_embauche uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_s rh.saisons;
  v_p rh.personnes;
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
  select * into v_s from rh.saisons where id = e.saison_id;
  select * into v_p from rh.personnes where id = e.personne_id;
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
    if not exists (select 1 from rh.contrats c where c.embauche_id = e.id and c.genre = 'contrat' and c.statut = 'signe') then
      v_manque := array_append(v_manque, 'contrat');
    end if;
  end if;
  if v_p.date_naissance is not null
     and rh.age_a(v_p.date_naissance, coalesce(e.debut, v_s.debut, current_date)) < 18
     and not exists (select 1 from rh.contrats c where c.embauche_id = e.id and c.genre = 'consentement' and c.statut = 'signe') then
    v_manque := array_append(v_manque, 'consentement');
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'CHAMPS_MANQUANTS:%', array_to_string(v_manque, ',');
  end if;
  update rh.embauches set statut = 'complete' where id = e.id;
end;
$$;

revoke execute on function
  rh.embauche_ouverte(text), rh.contrat_a_produire(text, uuid), rh.contrat_signe(text, uuid, jsonb),
  rh.consentement_a_produire(text), rh.consentement_signe(text, jsonb), rh.age_a(date, date)
from public, anon, authenticated;
grant execute on function
  rh.embauche_ouverte(text), rh.contrat_a_produire(text, uuid), rh.contrat_signe(text, uuid, jsonb),
  rh.consentement_a_produire(text), rh.consentement_signe(text, jsonb)
to service_role;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant select, insert, update, delete on rh.taux, rh.modeles_contrats to authenticated;
grant select, insert, update on rh.contrats to authenticated;
grant all on rh.taux, rh.modeles_contrats, rh.contrats to service_role;

alter table rh.taux enable row level security;
alter table rh.modeles_contrats enable row level security;
alter table rh.contrats enable row level security;

create policy "Lire taux" on rh.taux for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire taux" on rh.taux for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire modèles" on rh.modeles_contrats for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire modèles" on rh.modeles_contrats for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire contrats" on rh.contrats for select to authenticated using (core.peut_lire('rh'));
create policy "Préparer contrats" on rh.contrats for insert to authenticated with check (core.peut_ecrire('rh'));
create policy "Annuler contrats" on rh.contrats for update to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));

-- ============================================================
-- Modèles de départ (à relire)
-- ============================================================

-- Tâches du poste « Animateur - Classe nature » (contrat d'Airtable, 1.2).
update rh.postes set taches = $t$**Animation d'activités**
- Planifier, organiser, et animer des activités variées en petit groupe et grand groupes (activités, jeux de soirée, feux de camp)

**Vie de camp**
- Être un modèle pour l'ensemble des campeurs
- Encourager et encadrer les campeurs durant le séjour (esprit d'équipe, participation…)
- Participer activement aux réunions et aux animations
- Créer et maintenir un environnement de vie accueillant et sécuritaire

**Encadrement et sécurité**
- Assurer avec bienveillance la santé, le bien-être et la sécurité des campeurs
- Faire respecter les règles du camp et les consignes de sécurité sur les différents plateaux d'activités.

**Support et collaboration**
- Collaborer avec les autres membres de l'équipe pour assurer un séjour harmonieux
- Gérer les conflits et aider les enfants à résoudre leurs problèmes$t$
where nom = 'Animateur - Classe nature';

-- Contrat d'emploi : « BPA - Animateur Classes Rouges - Contrat.pdf »
-- (Airtable), rendu général (poste, saison, dates, taux et compagnie en
-- champs). À relire : l'hébergement, les repas et les règles du site
-- viennent du contrat de la BPA.
insert into rh.modeles_contrats (genre, titre, contenu, a_valider) values
('contrat', 'Contrat de travail', $t$# CONTRAT DE TRAVAIL
### {{poste}} ({{saison}})
[[entete]]
### OBJET DU CONTRAT
Le présent contrat a pour but de déterminer les modalités de l'embauche de l'employé(e) au poste de {{poste}} pour la saison {{saison}}.

### PRÉREQUIS
Une vérification d'absence d'antécédent judiciaire est obligatoire si vous avez 18 ans et plus. Vous devrez suivre les procédures demandées par {{compagnie_court}}, afin que nous puissions procéder à la vérification dans les délais prescrits.

## DESCRIPTION DE L'EMPLOI
### Poste
{{compagnie_court}} retient les services de l'employé(e) à titre de {{poste}} pour la saison {{saison}}, sous la supervision de l'équipe de direction.
{{#si taches}}
### Tâches
Les tâches principales de l'employé(e) sont les suivantes :
[[taches]]
{{/si}}

## CONDITIONS D'EMBAUCHE
### Durée du contrat
Le présent contrat prend effet le {{debut}} et se termine le {{fin}}.

Des ententes de congé, d'arrivée tardive ou de départ hâtif pourront être obtenues par l'employé(e), mais {{compagnie}} se réserve le droit de refuser toutes demandes qui nuiraient au bon fonctionnement de l'accueil des groupes.

L'employé s'engage à offrir, en cas de départ, un préavis de cessation d'emploi de 3 semaines (21 jours) durant lequel il travaillera ou s'engage à payer le salaire dû et les inconvénients monétaires liés à un départ hâtif.

### Horaire de travail
L'horaire des activités, des périodes de congé, des surveillances de nuit et de toute autre tâche ou responsabilité est déterminé par la direction. L'employé(e) doit respecter l'horaire qui lui est communiqué et être présent(e) aux heures et aux endroits prévus. Tout retard ou toute absence doit être signalé(e) à la direction dans les meilleurs délais et être justifié(e) par un motif valable. En raison de la nature particulière du travail avec des enfants, les journées de travail peuvent comporter des périodes de travail de plus de huit (8) heures.

L'employé(e) reconnaît que le nombre de séjours, de semaines ou de quarts de travail anticipés au moment de l'embauche n'est pas garanti. Ce nombre peut varier en fonction de l'ajout, de la modification ou de l'annulation de groupes, ainsi que des besoins opérationnels du camp.

### Rémunération
{{#si a_la_semaine}}
Pour la durée du présent contrat, {{compagnie_court}} s'engage à verser à l'employé(e) un salaire hebdomadaire de {{taux}} (pour une semaine de 5 jours travaillés) lorsqu'il/elle/iel a la charge d'un groupe ou effectue des tâches prévues à l'horaire. Le salaire hebdomadaire sera ajusté au prorata du nombre de jours travaillés (salaire journalier de {{taux_jour}}). Si l'employé(e) désire rester sur le site entre deux séjours d'animation, il peut le faire sans frais. Le tout est payable aux 2 semaines par dépôt direct.
{{/si}}
{{#si a_l_heure}}
Pour la durée du présent contrat, {{compagnie_court}} s'engage à verser à l'employé(e) un salaire horaire de {{taux}} pour les heures travaillées. Le tout est payable aux 2 semaines par dépôt direct.
{{/si}}

L'employé(e) sera hébergé gratuitement pour la durée du contrat au sein des installations de la BPA. L'employé(e) sera nourri sans frais lorsqu'un service de repas est offert aux groupes sur place et qu'il/elle/iel travaille.

### Formation(s) et planification
Une formation d'une journée sera fournie et rémunérée par {{compagnie}} et devra être obligatoirement suivie avant que l'employé(e) entre en poste.

## COMPÉTENCES ET ATTITUDE
L'employé(e) devra rester professionnel.le durant toute la durée du contrat de travail avec {{compagnie_court}}.

L'employé(e) est en position d'autorité et ne peut donc en aucun cas développer de relation amoureuse ou amicale avec les campeur.euse.s / client.e.s (cela inclut les réseaux sociaux).

**La possession ou la consommation de drogues, d'alcool ou de tabac est strictement interdite sur le site de la BPA.**

Une personne qui apparaît intoxiquée pourrait se faire refuser l'accès à la BPA. Votre travail au camp pourrait aussi être remis en cause.

La direction se réserve le droit d'instaurer un couvre-feu s'il le juge nécessaire.

L'employé devra respecter le code d'éthique, les tâches et responsabilités liées à sa fonction.

Les informations qui sont dédiées uniquement aux employé(e)s ne devront pas être répétées de même que les situations, problèmes et autres.

La BPA est un endroit où le sourire, la bonne humeur, l'empathie, le respect, le professionnalisme et l'ouverture d'esprit sont mis de l'avant. L'employé(e) représente {{compagnie_court}} en tout temps lorsqu'il/elle/iel travaille. Il doit donc s'assurer de les appliquer et de les faire respecter.

Aucune forme de discrimination, d'intimidation ou de violence ne sera tolérée.

## AUTRES ASPECTS
### Téléphone
L'usage du téléphone est uniquement autorisé pour des tâches liées au travail : heure, alarme, localisation, photos/vidéos du séjour lorsque autorisée. L'utilisation de votre cellulaire à des fins personnelles n'est pas permise lorsqu'en poste. **La publication d'images ou vidéos des campeur.euse.s vous est interdite.**

### Lavage
Il est permis d'utiliser une machine à laver du camp (savon et assouplisseur à vos frais). L'utilisation devra se faire selon l'horaire convenu avec les autres membres de l'équipe. L'endroit devra rester propre en tout temps, le linge devra disparaître de la machine dès la fin du cycle. L'utilisation d'un sèche-linge est privilégiée à l'utilisation de la sécheuse. L'utilisation est un privilège, la direction se réserve le droit de le retirer en cas d'abus.

### Cuisine
Il est interdit à l'employé(e) d'entrer dans la cuisine, sauf pour servir la collation ou si autorisé par un membre de la direction.

Aucun employé(e) ne peut apporter au camp : beurre d'arachides, Nutella ou de noix ou tout autre élément susceptible de causer des allergies.

Il ne sera pas permis de consommer des produits extérieurs tels que : redbull, boissons gazeuses, chips, crème glacée, « fast-food » devant les campeur.euse.s.

L'employé(e) ne peut en aucun cas donner de bonbons, ou toute autre nourriture/boissons extérieures aux campeur.euse.s sans avoir obtenu l'accord d'un membre de l'équipe de direction.

## RÈGLEMENTS
À moins d'une urgence, l'employé(e) ne peut en aucun cas se trouver seul dans une chambre avec un.e ou des campeur.euse.s.

La Base de Plein Air Mont-Tremblant est avant tout un endroit de travail. Les relations amoureuses ou amicales entre employé(e)s ne doivent pas perturber l'ambiance, le déroulement des activités, l'équipe de travail, etc.

{{compagnie_court}} met à la disposition de l'employé(e) une chambre, mais aussi du matériel qui devra être remis en bon état à son départ. Les chambres doivent rester propres et rangées et surtout dépourvues de vaisselle et de déchets et ce, tout au long du présent contrat.

## SANCTIONS
### Protocole
En cas de non-respect d'une des clauses du présent contrat ou d'une politique annexée, {{compagnie}} appliquera la politique suivante en matière de mesure disciplinaire.
- 1ère infraction : Avis verbal
- 2e infraction : Avis écrit noté au dossier de l'employé
- 3e infraction : Renvoi

Pour les fautes jugées graves et/ou manquement(s) au code d'éthique, {{compagnie}} se réserve le droit de renvoyer l'employé(e) sans préavis.

Chaque partie reconnaît avoir lu et pris conscience **en entier** du présent contrat ainsi que d'avoir signé et reçu son exemplaire.
[[signatures]]$t$, true);

-- Consentement parental : « Consentement parental.pdf » (Airtable), mots
-- inchangés. À relire (le texte porte sur l'alcool et la responsabilité de
-- l'entreprise envers une personne mineure).
insert into rh.modeles_contrats (genre, titre, contenu, a_valider) values
('consentement', 'Consentement parental', $t$# CONSENTEMENT PARENTAL
### {{saison}}

Je, soussigné(e), {{parent}}, agissant en qualité de parent/tuteur légal de {{employe}}, né(e) le {{date_naissance}}, donne par la présente mon consentement pour que mon enfant puisse consommer de l'alcool et d'autres substances dans des circonstances spécifiques réglementées et encadrées par l'entreprise {{compagnie}}.

1. Je comprends que mon enfant loge sur la Base de Plein Air Mont-Tremblant et que cette autorisation concerne uniquement des moments spécifiques et encadrés en dehors de ses heures de travail.
2. Je reconnais que mon enfant est mineur et que sa consommation d'alcool et d'autres substances est strictement limitée aux événements ou occasions spécifiquement autorisées par l'entreprise, conformément aux lois en vigueur et aux politiques internes de l'entreprise.
3. Je suis au courant des politiques de l'entreprise concernant la consommation d'alcool et d'autres substances, et je consens à ce que mon enfant y participe dans le respect des règles établies.
4. Je comprends que l'alcool et les autres substances seront consommés de manière responsable et modérée, sous la supervision et l'encadrement de l'entreprise, afin de prévenir tout comportement inapproprié ou non sécuritaire.
5. Je reconnais que l'entreprise n'a pas la responsabilité de surveiller ses activités personnelles en dehors du camp, à condition qu'il respecte les règles de conduite et le code d'éthique en vigueur sur le camp.
6. Je reconnais également que l'entreprise n'est en aucun cas responsable des comportements personnels de mon enfant en dehors de ses heures de travail, y compris ses relations interpersonnelles. Par conséquent, je dégage l'entreprise, ses dirigeants, ses employés et ses représentants de toute responsabilité liée aux choix de mon enfant en dehors de ses fonctions professionnelles.
7. En outre, je comprends et accepte que l'entreprise ne pourra en aucun cas être tenue responsable des conséquences éventuelles liées à des relations sexuelles qui pourraient impliquer mon enfant mineur lors de son emploi à Tremblant.

En signant ce document, j'atteste avoir pris connaissance des règlements en vigueur et j'accepte ces conditions pour mon enfant lors de sa résidence sur la Base de Plein Air Mont-Tremblant.
[[signature_parent]]$t$, true);
