-- ============================================================
-- rh : recrutement, embauche et dossiers d'employés.
-- Remplace la base Airtable « RH » (candidatures, humains, embauches,
-- formulaires, automatisations Gmail), ses deux copies (VAJ, ACQ) et
-- le Google Sheets « Suivi RH 2026 ». Plan : docs/plan-rh.md.
--
-- Phase 1 : les données, l'accès et le chiffrement des renseignements
-- de paie. Les pages publiques (phase 2), les courriels et le contrat
-- (phase 3) et la planification (phase 4) viendront ensuite.
--
-- Décisions de Maxime (2026-10-11) : direction en écriture dès le
-- départ ; la direction voit le NAS (accès `rh_paie`) ; pas
-- d'effacement automatique des candidatures non retenues.
-- ============================================================

create schema if not exists rh;

-- Grille d'accès : `rh` (le module) et `rh_paie` (NAS, compte bancaire,
-- spécimen de chèque), la direction en écriture pour les deux.
-- La liste garde aussi les modules de Réservations (pas encore en PROD).
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','batiments'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','batiments'));

insert into core.acces_roles (role, module, niveau) values
  ('direction','rh','ecriture'),
  ('direction','rh_paie','ecriture');

-- ------------------------------------------------------------
-- Outils
-- ------------------------------------------------------------

-- Nom affiché d'un compte (auteur d'une note, d'un changement).
create function rh.nom_de(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
  from core.profils p where p.id = p_user
$$;
revoke execute on function rh.nom_de(uuid) from public, anon, authenticated;

-- Compagnie du référentiel d'après un code court (GBPA+, OPI, AQB, R&D,
-- TRB) : par abréviation, sinon par nom (la PROD a des noms longs).
-- Sert aux listes de départ ci-dessous et à l'import d'Airtable.
create function rh.entreprise(p_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select x.id from core.entreprises x
   where x.abreviation = p_code or x.nom = p_code
      or (p_code = 'GBPA+' and x.nom ilike 'gestion base de plein air%')
      or (p_code = 'OPI' and x.nom ilike 'opikawa%')
      or (p_code = 'AQB' and x.nom ilike 'aquabounga%')
      or (p_code = 'R&D' and x.nom ilike 'rouge%diable%')
      or (p_code = 'TRB' and x.nom ilike 'trembloc%')
   order by (x.abreviation = p_code) desc nulls last, (x.nom = p_code) desc
   limit 1
$$;

-- ------------------------------------------------------------
-- Saisons et leurs dates (formations, séjours, semaines).
-- Plus aucune date écrite en dur dans un formulaire ou un courriel.
-- ------------------------------------------------------------
create table rh.saisons (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('hiver','printemps','ete','automne')),
  annee integer not null check (annee between 2000 and 2100),
  nom text generated always as (
    (case genre when 'hiver' then 'Hiver' when 'printemps' then 'Printemps' when 'ete' then 'Été' else 'Automne' end) || ' ' || annee
  ) stored,
  -- Ordre chronologique : hiver, printemps, été, automne d'une même année.
  rang integer generated always as (
    annee * 10 + case genre when 'hiver' then 1 when 'printemps' then 2 when 'ete' then 3 else 4 end
  ) stored,
  debut date,
  fin date check (fin is null or debut is null or fin >= debut),
  -- Offerte dans le formulaire public de candidature (phase 2).
  ouverte boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (genre, annee)
);

create table rh.saisons_dates (
  id uuid primary key default gen_random_uuid(),
  saison_id uuid not null references rh.saisons(id) on delete cascade,
  -- formation ; sejour (classe verte, journée plein air) ; semaine d'été ; autre
  genre text not null default 'semaine' check (genre in ('formation','sejour','semaine','autre')),
  nom text not null check (btrim(nom) <> ''),
  debut date,
  fin date check (fin is null or debut is null or fin >= debut),
  obligatoire boolean not null default false,
  -- Précision affichée (ex. « BPA seulement »)
  note text,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_saisons_dates_saison on rh.saisons_dates(saison_id);

-- ------------------------------------------------------------
-- Postes : une seule liste, par compagnie. Fin des libellés en double
-- d'Airtable (« Coordonateur », « Rouge&Diable »…). On retire un poste
-- en le désactivant (des candidatures et des embauches y renvoient).
-- ------------------------------------------------------------
create table rh.postes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  entreprise_id uuid not null references core.entreprises(id) on delete restrict,
  -- Saisons où le poste est offert (formulaire public)
  genres text[] not null default '{ete}' check (genres <@ array['hiver','printemps','ete','automne']::text[]),
  description_url text,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nom, entreprise_id)
);

-- ------------------------------------------------------------
-- Personnes : une fiche par humain (ex-Humains d'Airtable).
-- Retrouvée par son courriel (unique, normalisé par la base).
-- ------------------------------------------------------------
create table rh.personnes (
  id uuid primary key default gen_random_uuid(),
  prenom text not null check (btrim(prenom) <> ''),
  nom_famille text not null default '',
  nom_complet text generated always as (
    case when btrim(nom_famille) = '' then prenom else nom_famille || ', ' || prenom end
  ) stored,
  -- Nom de camp
  surnom text,
  courriel text check (courriel is null or position('@' in courriel) > 1),
  telephone text,
  date_naissance date,
  sexe text check (sexe in ('f','m','x')),
  -- Notes internes permanentes
  notes text,
  ne_pas_reembaucher boolean not null default false,
  raison_ne_pas text,
  -- Vérification des antécédents judiciaires (dernière)
  vaj_le date,
  vaj_note text,
  -- Fiche du référentiel Employés (core.employes)
  employe_id uuid unique references core.employes(id) on delete set null,
  -- Fiches Airtable d'origine (Humains, Banque 2025) ; une fusion les réunit,
  -- pour qu'un nouvel import ne recrée pas le doublon.
  airtable_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_personnes_courriel on rh.personnes (courriel) where courriel is not null;
create index idx_personnes_airtable on rh.personnes using gin (airtable_ids);

create function rh.normaliser_personne()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.courriel := nullif(lower(btrim(new.courriel)), '');
  new.prenom := btrim(new.prenom);
  new.nom_famille := btrim(coalesce(new.nom_famille, ''));
  new.surnom := nullif(btrim(new.surnom), '');
  return new;
end;
$$;

create trigger trg_personnes_normaliser before insert or update on rh.personnes
for each row execute function rh.normaliser_personne();

-- ------------------------------------------------------------
-- Dossier : ce qui dure d'une année à l'autre, mis à jour par chaque
-- dossier d'embauche (un ancien le retrouve pré-rempli).
-- ------------------------------------------------------------
create table rh.dossiers (
  personne_id uuid primary key references rh.personnes(id) on delete cascade,
  adresse text,
  ville text,
  province text,
  code_postal text,
  pays text,
  assurance_maladie text,
  etudiant_temps_plein boolean,
  -- Programme et établissement
  etudes text,
  -- Vide = aucune allergie ni intolérance
  allergies text,
  diete text check (diete in ('reguliere','vegetarienne','sans_lactose','sans_porc','sans_gluten')),
  taille_tshirt text check (taille_tshirt in ('XS','S','M','L','XL','XXL')),
  taille_hoodie text check (taille_hoodie in ('XS','S','M','L','XL','XXL')),
  urgence1_nom text,
  urgence1_lien text,
  urgence1_telephone text,
  urgence2_nom text,
  urgence2_lien text,
  urgence2_telephone text,
  updated_at timestamptz not null default now(),
  updated_by uuid references core.profils(id) on delete set null
);

-- ------------------------------------------------------------
-- Paie : accès à part (`rh_paie`). NAS et numéro de compte chiffrés
-- (pgcrypto, clé dans Supabase Vault) : une copie de la base n'en montre
-- jamais un en clair. Lus seulement par rh.lire_paie (qui note chaque
-- consultation), écrits seulement par rh.enregistrer_paie.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rh_cle_paie') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'rh_cle_paie',
      'Clé de chiffrement des NAS et numéros de compte (module RH). La perdre = perdre ces données.'
    );
  end if;
end;
$$;

create function rh.cle_paie()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rh_cle_paie'
$$;

create function rh.chiffrer(p text)
returns bytea
language sql
volatile
security definer
set search_path = ''
as $$
  select case when p is null then null else extensions.pgp_sym_encrypt(p, rh.cle_paie()) end
$$;

create function rh.dechiffrer(p bytea)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p is null then null else extensions.pgp_sym_decrypt(p, rh.cle_paie()) end
$$;

revoke execute on function rh.cle_paie(), rh.chiffrer(text), rh.dechiffrer(bytea) from public, anon, authenticated;

-- NAS canadien : 9 chiffres, clé de Luhn.
create function rh.nas_valide(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  s integer := 0;
  d integer;
begin
  if p is null or p !~ '^[0-9]{9}$' then
    return false;
  end if;
  for i in 1..9 loop
    d := substr(p, i, 1)::integer;
    if i % 2 = 0 then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end;
$$;

create table rh.paie (
  personne_id uuid primary key references rh.personnes(id) on delete cascade,
  nas bytea,
  -- 3 derniers chiffres, pour l'affichage masqué (« •••-•••-123 »)
  nas_fin text,
  transit text,
  institution text,
  compte bytea,
  compte_fin text,
  -- Spécimen de chèque : chemin dans le seau privé rh-paie
  specimen text,
  updated_at timestamptz not null default now(),
  updated_by uuid references core.profils(id) on delete set null,
  updated_by_nom text
);

-- Qui a affiché un NAS, un compte ou un spécimen, et quand.
create table rh.consultations (
  id bigint generated always as identity primary key,
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  quoi text not null default 'paie' check (quoi in ('paie','specimen')),
  par uuid references core.profils(id) on delete set null,
  par_nom text,
  le timestamptz not null default now()
);
create index idx_consultations_personne on rh.consultations(personne_id);

-- ------------------------------------------------------------
-- Candidatures. Le statut garde son historique dans le journal
-- (Airtable l'écrasait). Une candidature peut viser plusieurs saisons ;
-- chaque acceptation crée une embauche (rh.accepter).
-- ------------------------------------------------------------
create table rh.candidatures (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  source text not null default 'manuel' check (source in ('formulaire','retour','manuel','import')),
  recue_le timestamptz not null default now(),
  -- Saisons et postes demandés (rh.saisons, rh.postes)
  saison_ids uuid[] not null default '{}',
  poste_ids uuid[] not null default '{}',
  -- Réponses du formulaire (clés : REPONSES dans types.ts)
  reponses jsonb not null default '{}',
  statut text not null default 'recue' check (statut in (
    'recue','entrevue_proposee','en_attente','acceptee','refusee_apres_entrevue',
    'refusee_equipe_complete','aspi_proposee','permis_travail','a_refuse','ne_revient_pas')),
  pre_decision text check (pre_decision in ('oui','peut_etre','bof','non','aspi')),
  commentaires text,
  entrevue_le date,
  notes_entrevue text,
  -- Décision : compagnie qui traite la candidature (signature des
  -- courriels) ; saison, poste et échelon de la dernière acceptation.
  entreprise_id uuid references core.entreprises(id) on delete restrict,
  saison_id uuid references rh.saisons(id) on delete restrict,
  poste_id uuid references rh.postes(id) on delete restrict,
  echelon smallint check (echelon between 1 and 5),
  -- Renseignements effacés à la main (Loi 25) : réponses, commentaires, CV
  efface_le timestamptz,
  airtable_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_candidatures_personne on rh.candidatures(personne_id);
create index idx_candidatures_statut on rh.candidatures(statut);

-- ------------------------------------------------------------
-- Embauches : une par personne, saison et poste (« une embauche par
-- année pour les anciens »). Les champs de paie sont remplis par la
-- direction à la validation.
-- ------------------------------------------------------------
create table rh.embauches (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete restrict,
  saison_id uuid not null references rh.saisons(id) on delete restrict,
  -- Facultatifs seulement pour l'import (Airtable ne les avait pas toujours)
  entreprise_id uuid references core.entreprises(id) on delete restrict,
  poste_id uuid references rh.postes(id) on delete restrict,
  echelon smallint check (echelon between 1 and 5),
  candidature_id uuid references rh.candidatures(id) on delete set null,
  -- a_envoyer : créée, lien du dossier pas encore envoyé ; envoyee ;
  -- dossier_recu : l'employé l'a rempli ; complete : validée par la
  -- direction ; annulee : refus du poste, départ avant la saison…
  statut text not null default 'a_envoyer'
    check (statut in ('a_envoyer','envoyee','dossier_recu','complete','annulee')),
  debut date,
  fin date check (fin is null or debut is null or fin >= debut),
  -- Paie
  remuneration text check (remuneration in ('semaine','heure')),
  taux numeric(8,2) check (taux >= 0),
  -- 4 % : aucun, sur chaque paie, ou en banque de vacances
  vacances text check (vacances in ('aucun','chaque_paie','banque')),
  -- Type d'employé du système de paie : B probation, C contractuel,
  -- E étudiant, P partiel, R régulier, T temporaire
  type_employe text check (type_employe in ('B','C','E','P','R','T')),
  -- A = ajout au système de paie, M = modification (un ancien)
  action_paie text check (action_paie in ('A','M')),
  date_embauche date,
  -- Réponses du dossier d'embauche
  disponibilites uuid[] not null default '{}',
  disponibilites_note text,
  code_ethique_le timestamptz,
  commentaires text,
  -- « Présentation de l'équipe » (photo à part, dans documents)
  presentation jsonb not null default '{}',
  dossier_recu_le timestamptz,
  airtable_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_embauches_personne on rh.embauches(personne_id);
create index idx_embauches_saison on rh.embauches(saison_id);
create index idx_embauches_candidature on rh.embauches(candidature_id);

-- ------------------------------------------------------------
-- Documents : seau privé rh-documents (<personne_id>/<id>.<ext>).
-- ------------------------------------------------------------
create table rh.documents (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  embauche_id uuid references rh.embauches(id) on delete set null,
  candidature_id uuid references rh.candidatures(id) on delete set null,
  genre text not null default 'autre' check (genre in (
    'cv','contrat','consentement_parental','premiers_soins','sauveteur','piece_identite','photo','autre')),
  -- Nom d'origine du fichier
  nom text,
  chemin text not null unique,
  type_mime text,
  taille integer,
  -- Cartes de premiers soins et de sauveteur
  expire_le date,
  ajoute_par uuid references core.profils(id) on delete set null,
  ajoute_par_nom text,
  airtable_id text unique,
  created_at timestamptz not null default now()
);
create index idx_documents_personne on rh.documents(personne_id);

-- ------------------------------------------------------------
-- Notes au dossier et mesures disciplinaires (code d'éthique).
-- ------------------------------------------------------------
create table rh.notes (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  embauche_id uuid references rh.embauches(id) on delete set null,
  genre text not null default 'note' check (genre in ('note','avis_verbal','avis_ecrit','suspension','renvoi')),
  jour date not null default (now() at time zone 'America/Montreal')::date,
  texte text not null check (btrim(texte) <> ''),
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_notes_personne on rh.notes(personne_id);

-- ------------------------------------------------------------
-- Journal : changements de statut, embauches, courriels, paie, fusions.
-- Écrit seulement par la base (déclencheurs et fonctions).
-- ------------------------------------------------------------
create table rh.journal (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references rh.personnes(id) on delete cascade,
  candidature_id uuid references rh.candidatures(id) on delete set null,
  embauche_id uuid references rh.embauches(id) on delete set null,
  genre text not null check (genre in ('candidature','statut','embauche','courriel','paie','dossier','document','fusion','import')),
  texte text not null,
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  le timestamptz not null default now()
);
create index idx_journal_personne on rh.journal(personne_id);

create function rh.journaliser(p_personne uuid, p_candidature uuid, p_embauche uuid, p_genre text, p_texte text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into rh.journal (personne_id, candidature_id, embauche_id, genre, texte, auteur, auteur_nom)
  values (p_personne, p_candidature, p_embauche, p_genre, p_texte, auth.uid(), rh.nom_de(auth.uid()));
$$;
revoke execute on function rh.journaliser(uuid, uuid, uuid, text, text) from public, anon, authenticated;

create function rh.libelle_statut(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'recue' then 'Reçue'
    when 'entrevue_proposee' then 'Entrevue proposée'
    when 'en_attente' then 'En attente'
    when 'acceptee' then 'Acceptée'
    when 'refusee_apres_entrevue' then 'Refusée après entrevue'
    when 'refusee_equipe_complete' then 'Refusée (équipe complète)'
    when 'aspi_proposee' then 'ASPI proposé'
    when 'permis_travail' then 'Question de permis de travail'
    when 'a_refuse' then 'A refusé le poste'
    when 'ne_revient_pas' then 'Ne revient pas'
    when 'a_envoyer' then 'À envoyer'
    when 'envoyee' then 'Lien envoyé'
    when 'dossier_recu' then 'Dossier reçu'
    when 'complete' then 'Complète'
    when 'annulee' then 'Annulée'
    else p
  end
$$;

-- Les déclencheurs ne journalisent que ce que fait une personne connectée ;
-- les imports et les pages publiques (phase 2) écrivent leur propre ligne.
create function rh.journal_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform rh.journaliser(new.personne_id, new.id, null, 'candidature', 'Candidature ajoutée');
  elsif new.statut is distinct from old.statut then
    perform rh.journaliser(new.personne_id, new.id, null, 'statut',
      rh.libelle_statut(old.statut) || ' → ' || rh.libelle_statut(new.statut));
    -- A refusé le poste : ses embauches pas encore complètes sont annulées.
    if new.statut = 'a_refuse' then
      update rh.embauches set statut = 'annulee'
       where candidature_id = new.id and statut in ('a_envoyer','envoyee','dossier_recu');
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_candidatures_journal after insert or update on rh.candidatures
for each row execute function rh.journal_candidature();

create function rh.journal_embauche()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quoi text;
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    select concat_ws(' · ', s.nom, p.nom, coalesce(e.abreviation, e.nom),
                     case when new.echelon is not null then 'échelon ' || new.echelon end)
      into v_quoi
      from rh.saisons s
      left join rh.postes p on p.id = new.poste_id
      left join core.entreprises e on e.id = new.entreprise_id
     where s.id = new.saison_id;
    perform rh.journaliser(new.personne_id, new.candidature_id, new.id, 'embauche', 'Embauche créée : ' || v_quoi);
  elsif new.statut is distinct from old.statut then
    perform rh.journaliser(new.personne_id, new.candidature_id, new.id, 'embauche',
      'Embauche : ' || rh.libelle_statut(old.statut) || ' → ' || rh.libelle_statut(new.statut));
  end if;
  return null;
end;
$$;

create trigger trg_embauches_journal after insert or update on rh.embauches
for each row execute function rh.journal_embauche();

-- Auteur des notes et des documents (sans session : celui fourni est gardé).
create function rh.signer_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    new.auteur := auth.uid();
    new.auteur_nom := rh.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_notes_signer before insert on rh.notes
for each row execute function rh.signer_note();

create function rh.signer_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.ajoute_par := auth.uid();
    new.ajoute_par_nom := rh.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_documents_signer before insert on rh.documents
for each row execute function rh.signer_document();

create function rh.signer_dossier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_dossiers_signer before insert or update on rh.dossiers
for each row execute function rh.signer_dossier();

create trigger trg_saisons_updated_at before update on rh.saisons
for each row execute function core.maj_updated_at();
create trigger trg_saisons_dates_updated_at before update on rh.saisons_dates
for each row execute function core.maj_updated_at();
create trigger trg_postes_updated_at before update on rh.postes
for each row execute function core.maj_updated_at();
create trigger trg_personnes_updated_at before update on rh.personnes
for each row execute function core.maj_updated_at();
create trigger trg_candidatures_updated_at before update on rh.candidatures
for each row execute function core.maj_updated_at();
create trigger trg_embauches_updated_at before update on rh.embauches
for each row execute function core.maj_updated_at();
create trigger trg_notes_updated_at before update on rh.notes
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Fonctions de l'app
-- ------------------------------------------------------------

-- Renseignements de paie en clair. Chaque appel est noté.
create function rh.lire_paie(p_personne uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not core.peut_lire('rh_paie') then
    raise exception 'ACCES_REFUSE';
  end if;
  insert into rh.consultations (personne_id, quoi, par, par_nom)
  values (p_personne, 'paie', auth.uid(), rh.nom_de(auth.uid()));
  select jsonb_build_object(
           'nas', rh.dechiffrer(p.nas),
           'transit', p.transit,
           'institution', p.institution,
           'compte', rh.dechiffrer(p.compte))
    into v
    from rh.paie p where p.personne_id = p_personne;
  return coalesce(v, '{}'::jsonb);
end;
$$;

-- Affichage d'un spécimen de chèque (l'adresse signée est faite par l'app).
create function rh.noter_consultation(p_personne uuid, p_quoi text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_lire('rh_paie') then
    raise exception 'ACCES_REFUSE';
  end if;
  insert into rh.consultations (personne_id, quoi, par, par_nom)
  values (p_personne, p_quoi, auth.uid(), rh.nom_de(auth.uid()));
end;
$$;

-- Enregistre les renseignements de paie. Paramètre null = inchangé ;
-- chaîne vide = effacé. Seuls les chiffres sont gardés.
create function rh.enregistrer_paie(
  p_personne uuid,
  p_nas text default null,
  p_transit text default null,
  p_institution text default null,
  p_compte text default null,
  p_specimen text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nas text := nullif(regexp_replace(coalesce(p_nas, ''), '\D', '', 'g'), '');
  v_compte text := nullif(regexp_replace(coalesce(p_compte, ''), '\D', '', 'g'), '');
begin
  if not core.peut_ecrire('rh_paie') then
    raise exception 'ACCES_REFUSE';
  end if;
  if coalesce(btrim(p_nas), '') <> '' and not rh.nas_valide(v_nas) then
    raise exception 'NAS_INVALIDE';
  end if;
  insert into rh.paie (personne_id) values (p_personne) on conflict (personne_id) do nothing;
  update rh.paie set
    nas = case when p_nas is null then nas else rh.chiffrer(v_nas) end,
    nas_fin = case when p_nas is null then nas_fin else right(v_nas, 3) end,
    transit = case when p_transit is null then transit else nullif(regexp_replace(p_transit, '\D', '', 'g'), '') end,
    institution = case when p_institution is null then institution else nullif(regexp_replace(p_institution, '\D', '', 'g'), '') end,
    compte = case when p_compte is null then compte else rh.chiffrer(v_compte) end,
    compte_fin = case when p_compte is null then compte_fin else right(v_compte, 3) end,
    specimen = case when p_specimen is null then specimen else nullif(p_specimen, '') end,
    updated_at = now(),
    updated_by = auth.uid(),
    updated_by_nom = rh.nom_de(auth.uid())
  where personne_id = p_personne;
  perform rh.journaliser(p_personne, null, null, 'paie', 'Renseignements de paie modifiés');
end;
$$;

-- Accepter une candidature : décision + embauche, en une transaction.
-- Un ancien (déjà une embauche complète) est proposé en « M » pour la paie.
create function rh.accepter(p_candidature uuid, p_saison uuid, p_entreprise uuid, p_poste uuid, p_echelon integer)
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
  select exists (select 1 from rh.embauches e where e.personne_id = v_personne and e.statut = 'complete') into v_ancien;
  insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, candidature_id, debut, fin, action_paie)
  values (v_id, v_personne, p_saison, p_entreprise, p_poste, p_echelon, p_candidature, v_saison.debut, v_saison.fin,
          case when v_ancien then 'M' else 'A' end);
  return v_id;
end;
$$;

-- Réunir deux fiches d'une même personne. Tout passe à celle qui reste ;
-- ses champs vides sont complétés ; ses notes reçoivent celles de l'autre.
create function rh.fusionner_personnes(p_garder uuid, p_retirer uuid)
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

-- Loi 25 : efface à la main les renseignements d'une candidature
-- (réponses, commentaires, notes d'entrevue, CV). Rend les chemins des
-- fichiers à retirer du seau ; le statut et le journal restent.
create function rh.effacer_candidature(p_candidature uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personne uuid;
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  update rh.candidatures
     set reponses = '{}', commentaires = null, notes_entrevue = null, efface_le = now()
   where id = p_candidature
  returning personne_id into v_personne;
  if v_personne is null then
    raise exception 'INTROUVABLE';
  end if;
  perform rh.journaliser(v_personne, p_candidature, null, 'candidature', 'Renseignements de la candidature effacés');
  return query
    delete from rh.documents where candidature_id = p_candidature and genre = 'cv' returning chemin;
end;
$$;

revoke execute on function
  rh.lire_paie(uuid), rh.noter_consultation(uuid, text),
  rh.enregistrer_paie(uuid, text, text, text, text, text),
  rh.accepter(uuid, uuid, uuid, uuid, integer),
  rh.fusionner_personnes(uuid, uuid), rh.effacer_candidature(uuid)
from public, anon;
grant execute on function
  rh.lire_paie(uuid), rh.noter_consultation(uuid, text),
  rh.enregistrer_paie(uuid, text, text, text, text, text),
  rh.accepter(uuid, uuid, uuid, uuid, integer),
  rh.fusionner_personnes(uuid, uuid), rh.effacer_candidature(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Droits et RLS. Pas de temps réel : comme les Feuilles de temps, une
-- suppression serait diffusée sans filtre ; l'app relit au besoin.
-- ------------------------------------------------------------
grant usage on schema rh to authenticated, service_role;
grant select, insert, update, delete on all tables in schema rh to authenticated, service_role;
grant usage on all sequences in schema rh to service_role;

-- Paie : jamais les colonnes chiffrées ; aucune écriture directe.
revoke all on rh.paie from authenticated;
grant select (personne_id, nas_fin, transit, institution, compte_fin, specimen, updated_at, updated_by_nom)
  on rh.paie to authenticated;
-- Journal et consultations : écrits seulement par la base.
revoke insert, update, delete on rh.journal, rh.consultations from authenticated;

alter table rh.saisons enable row level security;
alter table rh.saisons_dates enable row level security;
alter table rh.postes enable row level security;
alter table rh.personnes enable row level security;
alter table rh.dossiers enable row level security;
alter table rh.paie enable row level security;
alter table rh.consultations enable row level security;
alter table rh.candidatures enable row level security;
alter table rh.embauches enable row level security;
alter table rh.documents enable row level security;
alter table rh.notes enable row level security;
alter table rh.journal enable row level security;

create policy "Lire saisons" on rh.saisons for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire saisons" on rh.saisons for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire dates" on rh.saisons_dates for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire dates" on rh.saisons_dates for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire postes" on rh.postes for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire postes" on rh.postes for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire personnes" on rh.personnes for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire personnes" on rh.personnes for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire dossiers" on rh.dossiers for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire dossiers" on rh.dossiers for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire paie" on rh.paie for select to authenticated using (core.peut_lire('rh_paie'));
create policy "Lire consultations" on rh.consultations for select to authenticated using (core.peut_lire('rh_paie'));
create policy "Lire candidatures" on rh.candidatures for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire candidatures" on rh.candidatures for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire embauches" on rh.embauches for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire embauches" on rh.embauches for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire documents" on rh.documents for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire documents" on rh.documents for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire notes" on rh.notes for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire notes" on rh.notes for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire journal" on rh.journal for select to authenticated using (core.peut_lire('rh'));

-- ------------------------------------------------------------
-- Seaux privés : documents (CV, contrats, cartes…) et paie (spécimens).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Tous les types (CV en Pages, courriels .eml… reçus dans Airtable), 50 Mo au plus.
  ('rh-documents', 'rh-documents', false, 52428800, null),
  ('rh-paie', 'rh-paie', false, 10485760,
   array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "RH : lire les documents" on storage.objects for select to authenticated
  using (bucket_id = 'rh-documents' and core.peut_lire('rh'));
create policy "RH : ajouter un document" on storage.objects for insert to authenticated
  with check (bucket_id = 'rh-documents' and core.peut_ecrire('rh'));
create policy "RH : retirer un document" on storage.objects for delete to authenticated
  using (bucket_id = 'rh-documents' and core.peut_ecrire('rh'));

create policy "RH paie : lire un spécimen" on storage.objects for select to authenticated
  using (bucket_id = 'rh-paie' and core.peut_lire('rh_paie'));
create policy "RH paie : ajouter un spécimen" on storage.objects for insert to authenticated
  with check (bucket_id = 'rh-paie' and core.peut_ecrire('rh_paie'));
create policy "RH paie : retirer un spécimen" on storage.objects for delete to authenticated
  using (bucket_id = 'rh-paie' and core.peut_ecrire('rh_paie'));

-- ============================================================
-- Listes de départ (reprises d'Airtable, libellés corrigés)
-- ============================================================

-- Saisons : celles de 2026 (historique) et celles qui recrutent.
insert into rh.saisons (genre, annee, debut, fin, ouverte) values
  ('printemps', 2026, null, null, false),
  ('ete', 2026, '2026-05-01', '2026-08-28', false),
  ('automne', 2026, null, null, false),
  ('hiver', 2027, null, null, true),
  ('printemps', 2027, null, null, true),
  ('ete', 2027, null, null, true),
  ('automne', 2027, null, null, false);

-- Dates de l'été 2026 : options « disponibilités » du formulaire
-- d'embauche d'Airtable + colonnes du Sheets « Suivi RH 2026 ».
insert into rh.saisons_dates (saison_id, genre, nom, debut, fin, obligatoire, note, ordre)
select s.id, d.genre, d.nom, d.debut::date, d.fin::date, d.obligatoire, d.note, d.ordre
  from rh.saisons s,
  (values
    ('formation', 'Formation 1', '2026-05-01', '2026-05-03', true, 'BPA', 1),
    ('sejour', 'Classe verte', '2026-05-08', '2026-05-09', false, null, 2),
    ('sejour', 'Classe verte', '2026-05-11', '2026-05-13', false, null, 3),
    ('sejour', 'Classe verte', '2026-05-13', '2026-05-21', false, null, 4),
    ('sejour', 'Classe verte', '2026-05-21', '2026-05-22', false, null, 5),
    ('sejour', 'Classe verte', '2026-05-22', '2026-05-24', false, null, 6),
    ('sejour', 'Classe verte', '2026-05-27', '2026-05-29', false, null, 7),
    ('sejour', 'Classe verte', '2026-05-29', '2026-05-31', false, null, 8),
    ('sejour', 'Classe verte', '2026-06-04', '2026-06-05', false, null, 9),
    ('formation', 'Formation 2', '2026-06-05', '2026-06-07', true, 'Toutes les compagnies', 10),
    ('sejour', 'Journée plein air', '2026-06-12', '2026-06-12', false, null, 11),
    ('sejour', 'Classe verte', '2026-06-15', '2026-06-16', false, null, 12),
    ('sejour', 'Classe verte', '2026-06-15', '2026-06-17', false, null, 13),
    ('sejour', 'Classe verte', '2026-06-16', '2026-06-17', false, null, 14),
    ('sejour', 'Classe verte', '2026-06-17', '2026-06-18', false, null, 15),
    ('sejour', 'Classe verte', '2026-06-17', '2026-06-19', false, null, 16),
    ('sejour', 'Classe verte', '2026-06-18', '2026-06-19', false, null, 17),
    ('sejour', 'Journée plein air', '2026-06-19', '2026-06-19', false, null, 18),
    ('sejour', 'Journée plein air', '2026-06-20', '2026-06-20', false, null, 19),
    ('autre', 'Pré-saison Aquabounga et R&D', '2026-06-21', '2026-06-27', false, null, 20),
    ('semaine', 'Semaine 0', '2026-06-22', '2026-06-26', false, null, 21),
    ('formation', 'Formation 3', '2026-06-26', '2026-06-27', false, 'Facultative', 22),
    ('semaine', 'Semaine 1', '2026-06-28', '2026-07-05', false, null, 23),
    ('semaine', 'Semaine 2', '2026-07-05', '2026-07-12', false, null, 24),
    ('semaine', 'Semaine 3', '2026-07-12', '2026-07-19', false, null, 25),
    ('semaine', 'Semaine 4', '2026-07-19', '2026-07-26', false, null, 26),
    ('semaine', 'Semaine 5', '2026-07-26', '2026-08-02', false, null, 27),
    ('semaine', 'Semaine 6', '2026-08-02', '2026-08-09', false, null, 28),
    ('semaine', 'Semaine 7', '2026-08-09', '2026-08-16', false, null, 29),
    ('semaine', 'Semaine 8', '2026-08-16', '2026-08-23', false, null, 30),
    ('semaine', 'Semaine 9', '2026-08-23', '2026-08-28', false, null, 31)
  ) as d(genre, nom, debut, fin, obligatoire, note, ordre)
 where s.genre = 'ete' and s.annee = 2026;

-- Postes (listes « Poste | Application » et « Poste | Décision »).
insert into rh.postes (nom, entreprise_id, genres, ordre)
select p.nom, rh.entreprise(p.code), p.genres::text[], p.ordre
  from (values
    ('Coordonnateur', 'GBPA+', '{ete}', 1),
    ('Animateur - Camp d''été', 'GBPA+', '{ete}', 2),
    ('Animateur - Classe nature', 'GBPA+', '{hiver,printemps,ete,automne}', 3),
    ('Animateur - Programme EXPÉ', 'GBPA+', '{ete}', 4),
    ('Aide de camp', 'GBPA+', '{ete}', 5),
    ('Formateur - Programme sauvetage', 'GBPA+', '{ete}', 6),
    ('Formateur PAM DAFA - Programme ASPI', 'GBPA+', '{ete}', 7),
    ('Sauveteur plage', 'GBPA+', '{ete}', 8),
    ('Spécialiste escalade', 'GBPA+', '{ete}', 9),
    ('Spécialiste photos et vidéos', 'GBPA+', '{ete}', 10),
    ('Spécialiste transport (conducteur minibus)', 'GBPA+', '{ete}', 11),
    ('Chef cuisinier', 'GBPA+', '{hiver,printemps,ete,automne}', 12),
    ('Aide cuisinier', 'GBPA+', '{hiver,printemps,ete,automne}', 13),
    ('Préposé à l''entretien', 'GBPA+', '{ete}', 14),
    ('Employé polyvalent', 'GBPA+', '{hiver,printemps,ete,automne}', 15),
    ('Accompagnateur de groupe en ski', 'GBPA+', '{hiver}', 16),
    ('Coordonnateur', 'OPI', '{ete}', 20),
    ('Professeur de français langue seconde', 'OPI', '{ete}', 21),
    ('Professeur d''anglais langue seconde', 'OPI', '{ete}', 22),
    ('Coordonnateur', 'AQB', '{ete}', 30),
    ('Sauveteur sur structure gonflable', 'AQB', '{ete}', 31),
    ('Coordonnateur', 'R&D', '{ete}', 40),
    ('Conducteur minibus', 'R&D', '{ete}', 41),
    ('Préposé à l''accueil', 'R&D', '{ete}', 42),
    ('Spécialiste escalade', 'TRB', '{ete}', 50),
    ('Préposé à l''accueil', 'TRB', '{ete}', 51)
  ) as p(nom, code, genres, ordre);
