-- ============================================================
-- Réservations de groupes (plan : docs/plan-reservations.md, v2 du
-- 2026-10-08). Remplace Jotform, le Sheets « Demande de réservation BPA »
-- et le chiffrier « Estimés | Accueil de groupe ».
--
-- Phase 1 : réservations, catalogue et prix, estimés (lignes aux prix
-- figés), journal ; liens avec le CRM (organisations, contacts, échanges,
-- relances). Admins seulement pendant les essais (aucune ligne dans la
-- grille, comme le CRM).
--
-- Exercice : d'octobre à septembre, désigné par l'année où il SE TERMINE
-- (2027 = 2026-27), comme le préfixe des numéros (27-G-054).
-- ============================================================

alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations'));

create schema if not exists reservations;

-- Exercice d'une date (octobre à septembre, année de fin).
create function reservations.exercice_de(p_jour date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (extract(year from p_jour) + case when extract(month from p_jour) >= 10 then 1 else 0 end)::smallint
$$;

-- Nom affiché d'un compte.
create function reservations.nom_de(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
  from core.profils p where p.id = p_user
$$;
revoke execute on function reservations.nom_de(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Réglages (clé → valeur)
-- ------------------------------------------------------------
create table reservations.reglages (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger trg_reservations_reglages_updated_at before update on reservations.reglages
for each row execute function core.maj_updated_at();

insert into reservations.reglages (cle, valeur) values
  -- Heures normales d'arrivée et de départ par forfait (chiffrier, contrats, Jotform).
  ('heures_normales', '{
    "classe_nature": ["10:00", "14:00"],
    "journee_plein_air": ["09:00", "15:00"],
    "accueil_groupe": ["16:00", "10:00"],
    "location_salle_jour": ["09:00", "17:00"],
    "location_salle_soir": ["16:00", "23:00"]
  }'),
  -- Heures des repas (contrats) : servent à proposer le nombre de repas.
  ('heures_repas', '{"dejeuner": "08:00", "diner": "12:00", "souper": "17:30"}'),
  -- Une gratuité d'accompagnateur par tranche complète de N élèves, quel que soit le ratio.
  ('gratuite_par', '20'),
  -- Ratio proposé en Classe nature quand le formulaire n'en donne pas (Maxime : on commence comme ça).
  ('ratio_defaut', '"1:15"'),
  -- Heures en extra (CN) : prix d'animation ÷ ce nombre, par élève et par heure.
  ('diviseur_heures_extra', '8'),
  -- Variante de Classe nature selon le mois d'arrivée (vérifié sur 2025-26 et 2026-27).
  ('variantes_classe', '{"1": "blanche", "2": "blanche", "3": "blanche", "12": "blanche",
    "4": "verte", "5": "verte", "6": "verte", "7": "verte", "8": "verte",
    "9": "rouge", "10": "rouge", "11": "rouge"}');

-- ------------------------------------------------------------
-- Catalogue : produits et prix par exercice
-- ------------------------------------------------------------
create table reservations.produits (
  id uuid primary key default gen_random_uuid(),
  -- Code stable : le calcul de l'estimé retrouve ses produits par ce code.
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9:._-]*$'),
  nom text not null check (btrim(nom) <> ''),
  categorie text not null check (categorie in (
    'hebergement','nuitee','repas','animation','surveillance','salle','restauration','cuisine',
    'service','materiel','activite','transport','billet','etat_des_lieux','autre')),
  unite text not null check (unite in (
    'par_lit_nuit','par_personne_nuit','par_personne_repas','par_personne_jour','par_personne',
    'par_nuit','par_soiree','par_jour','par_heure','par_repas','par_bloc','par_voyage',
    'aller_retour','forfait','unite')),
  -- Forfaits où le produit est offert comme extra (vide = tous).
  forfaits text[] not null default '{}',
  -- Hébergement : étages de Rooming couverts (codes : CH, CB, PB, PH, VFB, VFH).
  -- Prix = lits de ces étages × prix du lit (produit LIT), au prorata (Maxime, 2026-10-08).
  etages text[],
  -- Produits de fournisseurs : prix = coût × majoration + ajout, arrondi.
  majoration numeric(8,4),
  ajout numeric(10,2),
  arrondi text not null default 'aucun' check (arrondi in ('aucun','dollar_superieur')),
  note_minimum text,
  -- Produit du calcul (nuitée, repas, animations, forfaits de salle…) : jamais supprimé.
  systeme boolean not null default false,
  -- Proposé dans la liste des extras de l'estimé.
  extra boolean not null default true,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_reservations_produits_updated_at before update on reservations.produits
for each row execute function core.maj_updated_at();

create table reservations.prix (
  produit_id uuid not null references reservations.produits(id) on delete cascade,
  exercice smallint not null check (exercice between 2020 and 2100),
  -- Prix de vente (null = à définir). Quatre décimales : prix de fournisseur majoré.
  prix numeric(12,4) check (prix is null or prix >= 0),
  -- Coût du fournisseur (produits majorés).
  cout numeric(12,4) check (cout is null or cout >= 0),
  updated_at timestamptz not null default now(),
  primary key (produit_id, exercice)
);

create trigger trg_reservations_prix_updated_at before update on reservations.prix
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Réservations
-- ------------------------------------------------------------
create table reservations.reservations (
  id uuid primary key default gen_random_uuid(),
  -- « 27-G-054 » : préfixe = exercice de l'arrivée à la création, figé.
  numero text not null unique,
  exercice smallint not null,
  numero_seq integer not null check (numero_seq > 0),
  nom text not null check (btrim(nom) <> ''),
  -- Compagnie qui facture (GBPA+ par défaut, Opikawa possible).
  compagnie_id uuid not null references core.entreprises(id) on delete restrict,
  organisation_id uuid references crm.organisations(id) on delete set null,
  contact_reservation_id uuid references crm.contacts(id) on delete set null,
  contact_facturation_id uuid references crm.contacts(id) on delete set null,
  courriel_direction text,
  forfait text not null check (forfait in ('classe_nature','journee_plein_air','accueil_groupe','location_salle')),
  -- Classe nature : verte, blanche, rouge. Location de salle : jour, soir, journée complète, sur mesure.
  variante text check (variante in ('verte','blanche','rouge','jour','soir','complete','sur_mesure')),
  forfait_demande text check (forfait_demande in ('classe_nature','journee_plein_air','accueil_groupe','location_salle')),
  date_arrivee date not null,
  -- Journée plein air, location de salle : même jour que l'arrivée.
  date_depart date not null,
  heure_arrivee time,
  heure_depart time,
  heures_regulieres boolean,
  nb_participants integer check (nb_participants >= 0),
  nb_accompagnateurs integer check (nb_accompagnateurs >= 0),
  ages text,
  langue text,
  description text,
  commentaires_client text,
  ratio text check (ratio in ('1:10','1:15','1:20','1:30','1:X','aucun')),
  service_repas boolean not null default false,
  nb_dejeuners integer not null default 0 check (nb_dejeuners >= 0),
  nb_diners integer not null default 0 check (nb_diners >= 0),
  nb_soupers integer not null default 0 check (nb_soupers >= 0),
  nb_collations integer not null default 0 check (nb_collations >= 0),
  -- Classe nature : heures en dehors des heures normales, facturées à l'heure.
  heures_extra numeric(5,2) not null default 0 check (heures_extra >= 0),
  -- Location de salle : heures supplémentaires.
  heures_supplementaires numeric(5,2) not null default 0 check (heures_supplementaires >= 0),
  -- Étages occupés (codes Rooming) ; en Accueil de groupe, ce sont les sections facturées.
  etages text[] not null default '{}',
  -- Salles (codes des contrats : SMB, SV, CU, SC, SVF, CVF).
  salles text[] not null default '{}',
  etape text not null default 'nouvelle' check (etape in (
    'nouvelle','contact','estime_envoye','estime_accepte','contrat_envoye','confirmee',
    'pre_arrivee','terminee','facture_finale','soldee')),
  -- Hors parcours : perdue, annulée après signature, en attente.
  fermeture text check (fermeture in ('closed_lost','annulee','en_attente')),
  raison_perte text check (raison_perte in (
    'prix','dates','ailleurs','installations','projet_annule','aucune_reponse','information',
    'distance','airbnb','opikawa','autre')),
  responsable_id uuid references core.profils(id) on delete set null,
  -- Source du prospect (« amie de Vickie », site web…).
  provenance text,
  notes_contrat text,
  retroaction text,
  -- Dépôt de sécurité (Accueil, Location) : préautorisation par carte, hors de l'app.
  depot_securite text check (depot_securite in ('pris','relache','encaisse')),
  -- Sous-total de l'estimé courant (accepté, sinon le plus récent) ; tenu par la base.
  montant_estime numeric(12,2),
  demande_le timestamptz not null default now(),
  signe_le date,
  origine text not null default 'app' check (origine in ('app','formulaire','import','airbnb')),
  -- Référence d'origine (import : « sheets-2027:<n° de ligne> », Jotform…).
  ref_externe text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_depart >= date_arrivee),
  check (fermeture is distinct from 'closed_lost' or raison_perte is not null or origine = 'import'),
  unique (exercice, numero_seq)
);

create index idx_reservations_dates on reservations.reservations (date_arrivee, date_depart);
create index idx_reservations_organisation on reservations.reservations (organisation_id);

create trigger trg_reservations_updated_at before update on reservations.reservations
for each row execute function core.maj_updated_at();

-- Numéro donné à la création (si l'import n'en fournit pas) : compteur de
-- l'exercice, après le plus grand déjà pris. Verrou par exercice.
create function reservations.numeroter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null then
    new.exercice := coalesce(new.exercice, reservations.exercice_de(new.date_arrivee));
    perform pg_advisory_xact_lock(hashtext('reservations.numero'), new.exercice);
    select coalesce(max(r.numero_seq), 0) + 1 into new.numero_seq
    from reservations.reservations r where r.exercice = new.exercice;
    new.numero := lpad((new.exercice % 100)::text, 2, '0') || '-G-' || lpad(new.numero_seq::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_reservations_numeroter before insert on reservations.reservations
for each row execute function reservations.numeroter();

-- Le numéro ne change jamais (imprimé sur les documents, question Interac).
create function reservations.figer_numero()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.numero <> old.numero or new.exercice <> old.exercice or new.numero_seq <> old.numero_seq then
    raise exception 'Le numéro d''une réservation ne change pas.';
  end if;
  return new;
end;
$$;

create trigger trg_reservations_figer_numero before update on reservations.reservations
for each row execute function reservations.figer_numero();

-- ------------------------------------------------------------
-- Estimés (versions) et leurs lignes, aux prix figés
-- ------------------------------------------------------------
create table reservations.estimes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  version integer not null check (version > 0),
  statut text not null default 'brouillon' check (statut in ('brouillon','envoye','accepte','remplace','refuse')),
  -- Exercice des prix copiés dans les lignes.
  exercice_prix smallint not null,
  date_estime date not null default (now() at time zone 'America/Toronto')::date,
  sous_total numeric(12,2) not null default 0,
  tps numeric(12,2) not null default 0,
  tvq numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  -- Estimé importé des Sheets : une seule ligne au montant accepté.
  importe boolean not null default false,
  envoye_le timestamptz,
  accepte_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, version)
);

create trigger trg_reservations_estimes_updated_at before update on reservations.estimes
for each row execute function core.maj_updated_at();

create table reservations.lignes (
  id uuid primary key default gen_random_uuid(),
  estime_id uuid not null references reservations.estimes(id) on delete cascade,
  ordre integer not null default 0,
  produit_id uuid references reservations.produits(id) on delete set null,
  code text,
  description text not null check (btrim(description) <> ''),
  -- Précision en italique sous la ligne (« Les lunchs du 5 et 6 janvier, pour emporter »).
  note text,
  quantite numeric(12,2) not null default 1,
  prix_unitaire numeric(12,4) not null default 0,
  -- Rabais en % (négatif) d'un sous-total : montant recalculé par l'app.
  pourcentage numeric(7,3),
  montant numeric(12,2) not null default 0,
  -- Ligne produite par le calcul (refaite par « Recalculer ») ; sinon saisie à la main.
  auto boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_reservations_lignes_estime on reservations.lignes (estime_id, ordre);

-- Un estimé envoyé, accepté, remplacé ou refusé est figé : ni ses lignes ni
-- ses montants ne changent (seuls statut et dates évoluent).
create function reservations.verifier_estime_fige()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_statut text;
begin
  if tg_table_name = 'estimes' then
    if old.statut <> 'brouillon' and (
      new.sous_total <> old.sous_total or new.tps <> old.tps or new.tvq <> old.tvq
      or new.total <> old.total or new.exercice_prix <> old.exercice_prix
      or new.reservation_id <> old.reservation_id or new.version <> old.version) then
      raise exception 'Cet estimé est figé : faites-en une nouvelle version.';
    end if;
    return new;
  end if;
  select e.statut into v_statut from reservations.estimes e
  where e.id = coalesce(new.estime_id, old.estime_id);
  if v_statut is not null and v_statut <> 'brouillon' then
    raise exception 'Cet estimé est figé : faites-en une nouvelle version.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_reservations_estimes_fige before update on reservations.estimes
for each row execute function reservations.verifier_estime_fige();
create trigger trg_reservations_lignes_fige before insert or update or delete on reservations.lignes
for each row execute function reservations.verifier_estime_fige();

-- Montant de la réservation = sous-total de l'estimé courant (accepté,
-- sinon le plus récent qui n'est ni remplacé ni refusé).
create function reservations.maj_montant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res uuid := coalesce(new.reservation_id, old.reservation_id);
begin
  update reservations.reservations r set montant_estime = (
    select e.sous_total from reservations.estimes e
    where e.reservation_id = v_res and e.statut not in ('remplace','refuse')
    order by (e.statut = 'accepte') desc, e.version desc
    limit 1)
  where r.id = v_res;
  return null;
end;
$$;

create trigger trg_reservations_estimes_montant after insert or update or delete on reservations.estimes
for each row execute function reservations.maj_montant();

-- ------------------------------------------------------------
-- Journal de la réservation (étapes, documents, courriels…)
-- ------------------------------------------------------------
create table reservations.journal (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  quand timestamptz not null default now(),
  genre text not null check (genre in ('etape','fermeture','document','courriel','note')),
  texte text not null,
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text
);

create index idx_reservations_journal on reservations.journal (reservation_id, quand desc);

create function reservations.signer_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.auteur := auth.uid();
    new.auteur_nom := reservations.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_reservations_journal_signer before insert on reservations.journal
for each row execute function reservations.signer_journal();

-- Chaque changement d'étape ou de fermeture est noté au journal.
create function reservations.journaliser_etape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.origine <> 'import' then
      insert into reservations.journal (reservation_id, genre, texte)
      values (new.id, 'etape', 'Réservation créée (' || new.etape || ')');
    end if;
  else
    if new.etape <> old.etape then
      insert into reservations.journal (reservation_id, genre, texte)
      values (new.id, 'etape', old.etape || ' → ' || new.etape);
    end if;
    if new.fermeture is distinct from old.fermeture then
      insert into reservations.journal (reservation_id, genre, texte)
      values (new.id, 'fermeture', coalesce(new.fermeture, 'rouverte')
        || case when new.raison_perte is not null and new.fermeture = 'closed_lost' then ' (' || new.raison_perte || ')' else '' end);
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_reservations_journaliser after insert or update on reservations.reservations
for each row execute function reservations.journaliser_etape();

-- ------------------------------------------------------------
-- CRM : échanges et relances liés à une réservation ; types
-- d'organisation du formulaire ; adresse de facturation.
-- ------------------------------------------------------------
alter table crm.echanges add column reservation_id uuid references reservations.reservations(id) on delete set null;
create index idx_crm_echanges_reservation on crm.echanges (reservation_id);
alter table crm.echanges drop constraint echanges_genre_check;
alter table crm.echanges add constraint echanges_genre_check
  check (genre in ('appel','message_vocal','texto','courriel','visite','rencontre','note'));

alter table crm.relances add column reservation_id uuid references reservations.reservations(id) on delete set null;
create index idx_crm_relances_reservation on crm.relances (reservation_id);

alter table crm.organisations drop constraint organisations_genre_check;
alter table crm.organisations add constraint organisations_genre_check
  check (genre in ('ecole_primaire','ecole_secondaire','cegep','universite','entreprise','organisme',
    'particulier','club_sportif','municipalite','association_etudiante','autre'));
alter table crm.regles drop constraint regles_genre_check;
alter table crm.regles add constraint regles_genre_check
  check (genre in ('ecole_primaire','ecole_secondaire','cegep','universite','entreprise','organisme',
    'particulier','club_sportif','municipalite','association_etudiante','autre'));
insert into crm.regles (genre, mois_avant) values
  ('particulier', 6), ('club_sportif', 6), ('municipalite', 6), ('association_etudiante', 6)
on conflict do nothing;

alter table crm.organisations add column province text;
alter table crm.organisations add column code_postal text;

-- ------------------------------------------------------------
-- Catalogue de départ : liste de prix 2026-27 du chiffrier
-- « Estimés | Accueil de groupe 2026-27 » (exercice 2027).
-- ------------------------------------------------------------
insert into reservations.produits (code, nom, categorie, unite, forfaits, etages, majoration, ajout, arrondi, note_minimum, systeme, extra, ordre) values
  -- Calcul (systeme)
  ('LIT', 'Prix du lit par nuit (hébergement)', 'hebergement', 'par_lit_nuit', '{accueil_groupe}', null, null, null, 'aucun', null, true, false, 10),
  ('CN-N', 'Nuitée', 'nuitee', 'par_personne_nuit', '{classe_nature}', null, null, null, 'aucun', null, true, false, 20),
  ('CN-N1', 'Supplément pour une seule nuit', 'nuitee', 'par_personne_nuit', '{classe_nature}', null, null, null, 'aucun', null, true, false, 21),
  ('REPAS', 'Repas régulier', 'repas', 'par_personne_repas', '{}', null, null, null, 'aucun', 'Min 30 personnes', true, false, 30),
  ('CN-1:10', 'Animation 1:10', 'animation', 'par_personne_jour', '{classe_nature}', null, null, null, 'aucun', null, true, false, 40),
  ('CN-1:15', 'Animation 1:15', 'animation', 'par_personne_jour', '{classe_nature}', null, null, null, 'aucun', null, true, false, 41),
  ('CN-1:20', 'Animation 1:20', 'animation', 'par_personne_jour', '{classe_nature}', null, null, null, 'aucun', null, true, false, 42),
  ('CN-1:X', 'Animation 1:X', 'animation', 'par_personne_jour', '{classe_nature}', null, null, null, 'aucun', null, true, false, 43),
  ('JPA-1:10', 'Animation 1:10', 'animation', 'par_personne', '{journee_plein_air}', null, null, null, 'aucun', null, true, false, 50),
  ('JPA-1:15', 'Animation 1:15', 'animation', 'par_personne', '{journee_plein_air}', null, null, null, 'aucun', null, true, false, 51),
  ('JPA-1:20', 'Animation 1:20', 'animation', 'par_personne', '{journee_plein_air}', null, null, null, 'aucun', null, true, false, 52),
  ('JPA-1:X', 'Animation 1:X', 'animation', 'par_personne', '{journee_plein_air}', null, null, null, 'aucun', null, true, false, 53),
  ('LS-JR', 'Forfait | Journée régulier (9h - 17h)', 'salle', 'forfait', '{location_salle}', null, null, null, 'aucun', 'Minimum 6h', true, false, 60),
  ('LS-SR', 'Forfait | Soirée régulier (16h - 23h)', 'salle', 'forfait', '{location_salle}', null, null, null, 'aucun', 'Minimum 6h', true, false, 61),
  ('LS-JC', 'Forfait | Journée complète (9h - 23h)', 'salle', 'forfait', '{location_salle}', null, null, null, 'aucun', null, true, false, 62),
  ('LS-HS', 'Heures supplémentaires | Facturées selon les heures réelles', 'salle', 'par_heure', '{location_salle}', null, null, null, 'aucun', null, true, false, 63),
  -- Sections d'hébergement (prix = lits × prix du lit)
  ('AG-CH', 'Cèdres haut', 'hebergement', 'par_nuit', '{accueil_groupe}', '{CH}', null, null, 'aucun', null, true, false, 100),
  ('AG-CB', 'Cèdres bas', 'hebergement', 'par_nuit', '{accueil_groupe}', '{CB}', null, null, 'aucun', null, true, false, 101),
  ('AG-C', 'Cèdres', 'hebergement', 'par_nuit', '{accueil_groupe}', '{CH,CB}', null, null, 'aucun', null, true, false, 102),
  ('AG-PB', 'Pins bas', 'hebergement', 'par_nuit', '{accueil_groupe}', '{PB}', null, null, 'aucun', null, true, false, 103),
  ('AG-PH', 'Pins haut', 'hebergement', 'par_nuit', '{accueil_groupe}', '{PH}', null, null, 'aucun', null, true, false, 104),
  ('AG-P', 'Pins', 'hebergement', 'par_nuit', '{accueil_groupe}', '{PB,PH}', null, null, 'aucun', null, true, false, 105),
  ('AG-PP', 'Pavillon Principal', 'hebergement', 'par_nuit', '{accueil_groupe}', '{CH,CB,PB,PH}', null, null, 'aucun', null, true, false, 106),
  ('AG-VB', 'Vieille-France Bas', 'hebergement', 'par_nuit', '{accueil_groupe}', '{VFB}', null, null, 'aucun', null, true, false, 107),
  ('AG-VH', 'Vieille-France Haut', 'hebergement', 'par_nuit', '{accueil_groupe}', '{VFH}', null, null, 'aucun', null, true, false, 108),
  ('AG-V', 'Vieille-France', 'hebergement', 'par_nuit', '{accueil_groupe}', '{VFB,VFH}', null, null, 'aucun', null, true, false, 109),
  ('AG-SC', 'Site complet', 'hebergement', 'par_nuit', '{accueil_groupe}', '{CH,CB,PB,PH,VFB,VFH}', null, null, 'aucun', null, true, false, 110),
  -- Extras
  ('SURV-SOIR', 'Surveillance de soirée 20h à 22h (par soirée, par section)', 'surveillance', 'par_soiree', '{}', null, null, null, 'aucun', null, false, true, 200),
  ('SURV-NUIT', 'Surveillance de nuit 22h à 7h (par nuit, par section)', 'surveillance', 'par_nuit', '{}', null, null, null, 'aucun', null, false, true, 201),
  ('MAT-NAUT', 'Matériel nautique (VFI + canot, kayak, planche à pagaie)', 'materiel', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 210),
  ('MAT-HIVER', 'Matériel d''hiver (raquette, luge)', 'materiel', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 211),
  ('MAT-SPEC', 'Matériel spécialisé (tir à l''arc, tag à l''arc, boussoles)', 'materiel', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 212),
  ('REPAS-FESTIF', 'Repas festif | Par personne', 'restauration', 'par_personne', '{}', null, null, null, 'aucun', 'Min 30 personnes', false, true, 220),
  ('COCKTAIL', 'Cocktail dinatoire (17h00 à 19h00, sans service) | Par personne', 'restauration', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 221),
  ('COLLATION', 'Collation du soir | Par personne (Délicookie et fruits frais)', 'restauration', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 222),
  ('CH-FROIDE', 'Accès chambre froide uniquement (4 étagères) | Par jour', 'cuisine', 'par_jour', '{}', null, null, null, 'aucun', null, false, true, 230),
  ('CUIS-5H', 'Location de cuisine commerciale avec production | Bloc 5h', 'cuisine', 'par_bloc', '{}', null, null, null, 'aucun', null, false, true, 231),
  ('CUIS-10H', 'Location de cuisine commerciale avec production | Bloc 10h', 'cuisine', 'par_bloc', '{}', null, null, null, 'aucun', null, false, true, 232),
  ('CUISINETTE-VF', 'Location cuisinette Vieille France | Par jour', 'cuisine', 'par_jour', '{}', null, null, null, 'aucun', null, false, true, 233),
  ('CUIS-REPAS', 'Location cuisine commerciale | Par repas', 'cuisine', 'par_repas', '{}', null, null, null, 'aucun', null, false, true, 234),
  ('ARRIVEE-HATIVE', 'Arrivée hâtive | Par heure', 'service', 'par_heure', '{}', null, null, null, 'aucun', null, false, true, 240),
  ('DEPART-TARDIF', 'Départ tardif | Par heure', 'service', 'par_heure', '{}', null, null, null, 'aucun', null, false, true, 241),
  ('CHAMBRE-MOTEL', 'Chambre supplémentaire | Section Motel | Par nuitée', 'service', 'par_nuit', '{}', null, null, null, 'aucun', null, false, true, 242),
  ('BUCHES', 'Bac de buche supplémentaire', 'service', 'unite', '{}', null, null, null, 'aucun', null, false, true, 243),
  ('AUDIOVISUEL', 'Location audiovisuel | Par jour', 'service', 'par_jour', '{}', null, null, null, 'aucun', null, false, true, 244),
  ('EMBARCATION', 'Location d''embarcation nautique | Par personne et par jour', 'service', 'par_personne_jour', '{}', null, null, null, 'aucun', null, false, true, 245),
  ('ANIMATEUR', 'Animation (1 employé dédié à l''animation du groupe, de 9h à 17h)', 'service', 'par_jour', '{}', null, null, null, 'aucun', null, false, true, 246),
  ('SALLE-HEBERG', 'Location de salle avec hébergement (50% de rabais) | Soirée', 'salle', 'forfait', '{}', null, null, null, 'aucun', null, false, true, 247),
  ('TR-SEM-ADU', 'Tremblant | Semaine | Billet Adulte 18 ans et + (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 300),
  ('TR-SEM-ETU', 'Tremblant | Semaine | Billet Étudiants 18-25 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 301),
  ('TR-SEM-JEU', 'Tremblant | Semaine | Billet Jeunes 5-17 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 302),
  ('TR-WE-ADU', 'Tremblant | Weekend | Billet Adulte 18 ans et + (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 303),
  ('TR-WE-ETU', 'Tremblant | Weekend | Billet Étudiants 18-25 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 304),
  ('TR-WE-JEU', 'Tremblant | Weekend | Billet Jeunes 5-17 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 305),
  ('TR-HS-ADU', 'Tremblant | Haute saison | Billet Adulte 18 ans et + (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 306),
  ('TR-HS-ETU', 'Tremblant | Haute saison | Billet Étudiants 18-25 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 307),
  ('TR-HS-JEU', 'Tremblant | Haute saison | Billet Jeunes 5-17 ans (min. 20 billets)', 'billet', 'par_personne', '{}', null, 1.15, null, 'aucun', 'min. 20 billets', false, true, 308),
  ('MB-SEM-BILLET', 'Ski Mont-Blanc | Semaine | Billet', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', '20 pax et +', false, true, 320),
  ('MB-SEM-COURS', 'Ski Mont-Blanc | Semaine | Cours initiation SKI/SNOW 90 min (min. 6 - max. 8 pers.)', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 321),
  ('MB-SEM-ETU', 'Ski Mont-Blanc | Semaine | Billet étudiant 18-24 ans', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 322),
  ('MB-WE-BILLET', 'Ski Mont-Blanc | Weekend/HS | Billet', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 323),
  ('MB-WE-COURS', 'Ski Mont-Blanc | Weekend/HS | Cours initiation SKI/SNOW 60 min (min. 6 - max. 8 pers.)', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 324),
  ('MB-SOIR', 'Ski Mont-Blanc | Soirée (15h à 20h) | Billet', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 325),
  ('MB-LOCATION', 'Ski Mont-Blanc | Location équipement (ski, bottes et casque)', 'billet', 'par_personne', '{}', null, 1.15, null, 'dollar_superieur', null, false, true, 326),
  ('TRANS-SEM-MB', 'Transport | Semaine | Mont-Blanc (par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 340),
  ('TRANS-SEM-TS', 'Transport | Semaine | Tremblant Sud (par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 341),
  ('TRANS-SEM-TN', 'Transport | Semaine | Tremblant Nord (par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 342),
  ('TRANS-SEM-DSB', 'Transport | Semaine | Domaine St-Bernard (par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 343),
  ('TRANS-SEM-STS', 'Transport | Semaine | St-sauveur (location de 8 heures)', 'transport', 'forfait', '{}', null, 1.3225, null, 'aucun', null, false, true, 344),
  ('TRANS-SEM-SJ', 'Transport | Semaine | Saint-Jovite (24 passagers - par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 345),
  ('TRANS-SEM-GAN', 'Transport | Semaine | Glissades Aventure-Neige (18h à 20h30)', 'transport', 'forfait', '{}', null, 1.3225, null, 'aucun', null, false, true, 346),
  ('TRANS-SEM-CIMES', 'Transport | Semaine | Sentier des Cimes (13h à 17h)', 'transport', 'forfait', '{}', null, 1.3225, null, 'aucun', null, false, true, 347),
  ('TRANS-WE-MB', 'Transport | Weekend | Mont-Blanc (aller-retour)', 'transport', 'aller_retour', '{}', null, 1.3225, null, 'aucun', null, false, true, 348),
  ('TRANS-WE-TS', 'Transport | Weekend | Tremblant Sud (aller-retour)', 'transport', 'aller_retour', '{}', null, 1.3225, null, 'aucun', null, false, true, 349),
  ('TRANS-WE-DSB', 'Transport | Weekend | Domaine St-Bernard (aller-retour)', 'transport', 'aller_retour', '{}', null, 1.3225, null, 'aucun', null, false, true, 350),
  ('TRANS-WE-SJ', 'Transport | Weekend | Saint-Jovite (24 passagers - par voyage)', 'transport', 'par_voyage', '{}', null, 1.3225, null, 'aucun', null, false, true, 351),
  ('TRANS-MA', 'Transport | Montage d''argent (aller-retour)', 'transport', 'aller_retour', '{}', null, 1.3225, null, 'aucun', null, false, true, 352),
  ('TRANS-ST', 'Transport | Station Tremblant (13h à 16h15)', 'transport', 'forfait', '{}', null, 1.3225, null, 'aucun', null, false, true, 353),
  ('TUBE', 'Glissade sur tube', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 370),
  ('VELO', 'Location de vélo', 'activite', 'par_personne', '{}', null, 1.15, 1, 'aucun', null, false, true, 371),
  ('AQUA-GROUPE', 'Aquabounga - Bloc de 2h (tarif de groupe)', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 372),
  ('AQUA-SPECIAL', 'Aquabounga - Bloc de 2h (tarif spécial)', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 373),
  ('PECHE', 'Pêche sur glace', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 374),
  ('TRAINEAU', 'Traîneau à chien', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 375),
  ('DSB-ENTREE', 'Domaine St-Bernard | Entrée sur le site (15+ personnes)', 'activite', 'par_personne', '{}', null, 1.15, null, 'aucun', '15+ personnes', false, true, 376),
  ('DSB-SKI', 'Domaine St-Bernard | Location d''équipement ski classique', 'activite', 'par_personne', '{}', null, 1.15, null, 'aucun', null, false, true, 377),
  ('MONT-ARGENT', 'Montagne d''argent', 'activite', 'par_personne', '{}', null, null, null, 'aucun', null, false, true, 378),
  ('CIMES', 'Sentier des cimes', 'activite', 'par_personne', '{}', null, 1.15, null, 'aucun', null, false, true, 379),
  ('MATELAS', 'Matelas à remplacer', 'etat_des_lieux', 'unite', '{}', null, null, null, 'aucun', null, false, true, 400);

-- Prix 2026-27 (exercice 2027). Billets Tremblant, pêche et traîneau : à définir.
insert into reservations.prix (produit_id, exercice, prix, cout)
select p.id, 2027, v.prix, v.cout
from (values
  ('LIT', 25.20, null), ('CN-N', 32.50, null), ('CN-N1', 5.00, null), ('REPAS', 19.40, null),
  ('CN-1:10', 26.50, null), ('CN-1:15', 23.50, null), ('CN-1:20', 20.50, null), ('CN-1:X', 20.50, null),
  ('JPA-1:10', 46.00, null), ('JPA-1:15', 42.00, null), ('JPA-1:20', 38.00, null), ('JPA-1:X', 34.00, null),
  ('LS-JR', 840.00, null), ('LS-SR', 1092.00, null), ('LS-JC', 1815.00, null), ('LS-HS', 210.00, null),
  ('SURV-SOIR', 150.00, null), ('SURV-NUIT', 300.00, null),
  ('MAT-NAUT', 34.00, null), ('MAT-HIVER', 44.00, null), ('MAT-SPEC', 40.00, null),
  ('REPAS-FESTIF', 38.50, null), ('COCKTAIL', 26.00, null), ('COLLATION', 3.00, null),
  ('CH-FROIDE', 65.00, null), ('CUIS-5H', 375.00, null), ('CUIS-10H', 590.00, null),
  ('CUISINETTE-VF', 175.00, null), ('CUIS-REPAS', 185.00, null),
  ('ARRIVEE-HATIVE', 47.00, null), ('DEPART-TARDIF', 47.00, null), ('CHAMBRE-MOTEL', 105.00, null),
  ('BUCHES', 16.00, null), ('AUDIOVISUEL', 52.00, null), ('EMBARCATION', 16.00, null),
  ('ANIMATEUR', 210.00, null), ('SALLE-HEBERG', 575.00, null),
  ('TR-SEM-ADU', null, null), ('TR-SEM-ETU', null, null), ('TR-SEM-JEU', null, null),
  ('TR-WE-ADU', null, null), ('TR-WE-ETU', null, null), ('TR-WE-JEU', null, null),
  ('TR-HS-ADU', null, null), ('TR-HS-ETU', null, null), ('TR-HS-JEU', null, null),
  ('MB-SEM-BILLET', 27.00, 23), ('MB-SEM-COURS', 11.00, 9), ('MB-SEM-ETU', 36.00, 31),
  ('MB-WE-BILLET', 35.00, 30), ('MB-WE-COURS', 11.00, 9), ('MB-SOIR', 23.00, 20), ('MB-LOCATION', 32.00, 27),
  ('TRANS-SEM-MB', 171.925, 130), ('TRANS-SEM-TS', 165.3125, 125), ('TRANS-SEM-TN', 231.4375, 175),
  ('TRANS-SEM-DSB', 165.3125, 125), ('TRANS-SEM-STS', 952.20, 720), ('TRANS-SEM-SJ', 174.9006, 132.25),
  ('TRANS-SEM-GAN', 608.35, 460), ('TRANS-SEM-CIMES', 760.4375, 575), ('TRANS-WE-MB', 628.1875, 475),
  ('TRANS-WE-TS', 628.1875, 475), ('TRANS-WE-DSB', 628.1875, 475), ('TRANS-WE-SJ', 250.9444, 189.75),
  ('TRANS-MA', 608.35, 460), ('TRANS-ST', 687.70, 520),
  ('TUBE', 30.00, null), ('VELO', 26.30, 22), ('AQUA-GROUPE', 10.49, null), ('AQUA-SPECIAL', 7.49, null),
  ('PECHE', null, null), ('TRAINEAU', null, null), ('DSB-ENTREE', 20.70, 18), ('DSB-SKI', 48.30, 42),
  ('MONT-ARGENT', 8.05, null), ('CIMES', 21.5625, 18.75), ('MATELAS', 249.00, null)
) as v(code, prix, cout)
join reservations.produits p on p.code = v.code;

-- ------------------------------------------------------------
-- Lits par étage (référence de Rooming), pour le prix des sections et
-- le tableau des lits des contrats. Lisible avec le module, sans Rooming.
-- ------------------------------------------------------------
create function reservations.lits_par_etage()
returns table (code text, nom text, lits integer, chambres integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.code, l.nom, sum(c.lits)::integer, count(*)::integer
  from rooming.lieux l
  join rooming.chambres c on c.lieu_id = l.id and c.actif
  where l.actif and l.code in ('CH','CB','PB','PH','VFB','VFH')
    and core.peut_lire('reservations')
  group by l.code, l.nom
$$;

-- Comptes qui peuvent être responsables d'une réservation.
create function reservations.responsables()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, reservations.nom_de(p.id)
  from core.profils p
  where p.actif and core.peut_lire('reservations')
    and (p.role = 'admin' or core.niveau_module_de(p.id, 'reservations') = 'ecriture')
  order by 2
$$;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant usage on schema reservations to authenticated, service_role;
grant select, insert, update, delete on all tables in schema reservations to authenticated, service_role;
revoke execute on function reservations.lits_par_etage(), reservations.responsables() from public, anon;
grant execute on function reservations.lits_par_etage(), reservations.responsables() to authenticated;
grant execute on function reservations.exercice_de(date) to authenticated, service_role;

alter table reservations.reglages enable row level security;
alter table reservations.produits enable row level security;
alter table reservations.prix enable row level security;
alter table reservations.reservations enable row level security;
alter table reservations.estimes enable row level security;
alter table reservations.lignes enable row level security;
alter table reservations.journal enable row level security;

create policy "Lire" on reservations.reglages for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.reglages for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

create policy "Lire" on reservations.produits for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.produits for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

create policy "Lire" on reservations.prix for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.prix for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

create policy "Lire" on reservations.reservations for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.reservations for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

create policy "Lire" on reservations.estimes for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.estimes for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

create policy "Lire" on reservations.lignes for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.lignes for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

-- Journal : on ajoute des notes, on ne réécrit pas l'histoire.
create policy "Lire" on reservations.journal for select to authenticated using (core.peut_lire('reservations'));
create policy "Ajouter" on reservations.journal for insert to authenticated with check (core.peut_ecrire('reservations'));

alter publication supabase_realtime add table
  reservations.reservations, reservations.estimes, reservations.lignes, reservations.journal,
  reservations.produits, reservations.prix, reservations.reglages;

-- ------------------------------------------------------------
-- Estimés : enregistrer un brouillon et changer d'état, en une transaction
-- (droits de l'appelant : RLS du module).
-- ------------------------------------------------------------
create function reservations.enregistrer_estime(p_estime jsonb, p_lignes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_estime ->> 'id')::uuid;
begin
  insert into reservations.estimes (id, reservation_id, version, exercice_prix, sous_total, tps, tvq, total, notes)
  values (
    v_id, (p_estime ->> 'reservation_id')::uuid, (p_estime ->> 'version')::integer,
    (p_estime ->> 'exercice_prix')::smallint, (p_estime ->> 'sous_total')::numeric,
    (p_estime ->> 'tps')::numeric, (p_estime ->> 'tvq')::numeric, (p_estime ->> 'total')::numeric,
    p_estime ->> 'notes')
  on conflict (id) do update set
    exercice_prix = excluded.exercice_prix, sous_total = excluded.sous_total, tps = excluded.tps,
    tvq = excluded.tvq, total = excluded.total, notes = excluded.notes;
  delete from reservations.lignes where estime_id = v_id;
  insert into reservations.lignes (id, estime_id, ordre, produit_id, code, description, note, quantite, prix_unitaire, pourcentage, montant, auto)
  select l.id, v_id, l.ordre, l.produit_id, l.code, l.description, l.note, l.quantite, l.prix_unitaire, l.pourcentage, l.montant, coalesce(l.auto, false)
  from jsonb_to_recordset(p_lignes) as l(
    id uuid, ordre integer, produit_id uuid, code text, description text, note text,
    quantite numeric, prix_unitaire numeric, pourcentage numeric, montant numeric, auto boolean);
end;
$$;

-- envoyer : le brouillon devient l'estimé envoyé (figé) ; les précédents sont remplacés.
-- accepter / refuser : réponse du client. nouvelle_version : copie en brouillon.
create function reservations.changer_estime(p_estime uuid, p_action text)
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
    if e.statut <> 'brouillon' then
      raise exception 'Seul un brouillon peut être envoyé.';
    end if;
    update reservations.estimes set statut = 'remplace'
    where reservation_id = e.reservation_id and id <> e.id and statut in ('envoye', 'accepte');
    update reservations.estimes set statut = 'envoye', envoye_le = now() where id = e.id;
    update reservations.reservations set etape = 'estime_envoye'
    where id = e.reservation_id and etape in ('nouvelle', 'contact');
    insert into reservations.journal (reservation_id, genre, texte)
    values (e.reservation_id, 'document', 'Estimé v' || e.version || ' envoyé (' || e.total || ' $ taxes comprises)');
  elsif p_action = 'accepter' then
    if e.statut <> 'envoye' then
      raise exception 'Seul un estimé envoyé peut être accepté.';
    end if;
    update reservations.estimes set statut = 'accepte', accepte_le = now() where id = e.id;
    update reservations.reservations set etape = 'estime_accepte'
    where id = e.reservation_id and etape in ('nouvelle', 'contact', 'estime_envoye');
    insert into reservations.journal (reservation_id, genre, texte)
    values (e.reservation_id, 'document', 'Estimé v' || e.version || ' accepté');
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

revoke execute on function reservations.enregistrer_estime(jsonb, jsonb), reservations.changer_estime(uuid, text) from public, anon;
grant execute on function reservations.enregistrer_estime(jsonb, jsonb), reservations.changer_estime(uuid, text) to authenticated;
