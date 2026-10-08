-- ============================================================
-- CRM (demande de Maxime du 2026-10-08, d'après la rencontre avec Vickie ;
-- remplacera Copper pour le démarchage et les relances des groupes).
--
-- Une organisation = un client ou une cible (école, cégep, entreprise…).
-- Ses contacts y sont rattachés à la main (pas de devinette par domaine de
-- courriel : toutes les profs d'un centre de services partagent le même).
--
-- Statut (cible / prospect / client / client inactif) et « jours inactifs »
-- ne sont PAS stockés : l'app les calcule d'après les vraies données —
-- échanges, visites passées (`visites`, saisies ou importées) et séjours
-- de la base de réservations Airtable (`calendrier.sejours`, lus par
-- `crm.sejours()`, liés par `organisations.airtable_client_id`). Un client
-- qui a un séjour confirmé à venir n'est donc jamais « inactif ».
--
-- Relances automatiques : après un séjour, l'app crée une relance (une
-- seule, `relances.source_cle` unique) à la date donnée par `regles` :
-- règle du client pour la saison > du client > du type pour la saison >
-- du type. Une relance annulée ou faite n'est jamais recréée.
-- ============================================================

-- ------------------------------------------------------------
-- Module crm dans les contraintes d'accès ; la direction écrit.
-- ------------------------------------------------------------
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm'));

insert into core.acces_roles (role, module, niveau) values ('direction','crm','ecriture');

create schema if not exists crm;

-- Nom affiché d'un compte (comme ailleurs : nom, sinon le début du courriel).
create function crm.nom_de(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
  from core.profils p where p.id = p_user
$$;
revoke execute on function crm.nom_de(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Organisations
-- ------------------------------------------------------------
create table crm.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  genre text not null default 'autre'
    check (genre in ('ecole_primaire','ecole_secondaire','cegep','universite','entreprise','organisme','autre')),
  ville text,
  -- Adresse en texte libre (le format varie : adresse du bureau, de
  -- l'administration…). Jamais utilisée pour reconnaître un client.
  adresse text,
  telephone text,
  site_web text,
  notes text,
  -- Conseiller responsable : chacun voit ses relances et ses clients.
  conseiller_id uuid references core.profils(id) on delete set null,
  -- Étape du démarchage (null = pas en démarchage).
  etape text check (etape in ('identification','contacte','conversation','conclusion')),
  -- Cible prioritaire (« all-in »).
  prioritaire boolean not null default false,
  -- Revient chaque année (1) ou une année sur deux (2)…
  cycle_ans smallint not null default 1 check (cycle_ans between 1 and 5),
  -- Client de la base de réservations Airtable (lien vers ses séjours).
  airtable_client_id text unique,
  -- Identifiant Copper (import).
  copper_id text unique,
  -- Statut noté dans Copper à l'import, faute de dates de séjour : sert
  -- seulement quand l'app ne connaît aucun séjour (calculs.ts, statutDe).
  -- « client » vaut comme un séjour terminé à `statut_depart_le`.
  statut_depart text check (statut_depart in ('client','inactif')),
  statut_depart_le date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((statut_depart is null) = (statut_depart_le is null))
);

comment on table crm.organisations is 'Clients et cibles du démarchage ; statut et jours inactifs calculés par l''app';

create trigger trg_crm_organisations_updated_at before update on crm.organisations
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Contacts (rattachés à la main à leur organisation)
-- ------------------------------------------------------------
create table crm.contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references crm.organisations(id) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  fonction text,
  courriel text,
  telephone text,
  notes text,
  principal boolean not null default false,
  copper_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_crm_contacts_organisation on crm.contacts(organisation_id);

create trigger trg_crm_contacts_updated_at before update on crm.contacts
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Échanges (appels, courriels, rencontres, notes)
-- ------------------------------------------------------------
create table crm.echanges (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references crm.organisations(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  genre text not null default 'appel' check (genre in ('appel','courriel','rencontre','note')),
  jour date not null default (now() at time zone 'America/Toronto')::date,
  texte text not null check (btrim(texte) <> ''),
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  copper_id text unique,
  created_at timestamptz not null default now()
);

create index idx_crm_echanges_organisation on crm.echanges(organisation_id, jour desc);

-- ------------------------------------------------------------
-- Visites passées hors de la base de réservations (historique, import)
-- ------------------------------------------------------------
create table crm.visites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references crm.organisations(id) on delete cascade,
  date_arrivee date not null,
  date_depart date not null,
  nb_participants integer check (nb_participants >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (date_depart >= date_arrivee)
);

create index idx_crm_visites_organisation on crm.visites(organisation_id);

-- ------------------------------------------------------------
-- Relances (tâches)
-- ------------------------------------------------------------
create table crm.relances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references crm.organisations(id) on delete cascade,
  titre text not null check (btrim(titre) <> ''),
  echeance date not null,
  assigne_a uuid references core.profils(id) on delete set null,
  statut text not null default 'a_faire' check (statut in ('a_faire','faite','annulee')),
  note text,
  -- Relance automatique : séjour ou visite qui l'a fait naître (une seule fois).
  source_cle text unique,
  faite_le timestamptz,
  faite_par_nom text,
  auteur_nom text,
  copper_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_crm_relances_echeance on crm.relances(statut, echeance);

create trigger trg_crm_relances_updated_at before update on crm.relances
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Règles de relance : « relancer N mois avant la prochaine visite ».
-- Par type d'organisation (genre) ou par client, pour une saison ou toutes.
-- ------------------------------------------------------------
create table crm.regles (
  id uuid primary key default gen_random_uuid(),
  genre text check (genre in ('ecole_primaire','ecole_secondaire','cegep','universite','entreprise','organisme','autre')),
  organisation_id uuid references crm.organisations(id) on delete cascade,
  saison text check (saison in ('hiver','printemps','ete','automne')),
  mois_avant smallint not null check (mois_avant between 0 and 24),
  created_at timestamptz not null default now(),
  check (num_nonnulls(genre, organisation_id) = 1)
);

create unique index crm_regles_unique on crm.regles
  (coalesce(genre, ''), coalesce(organisation_id::text, ''), coalesce(saison, ''));

-- Règles de départ (Vickie, 2026-10-08) : école 11-12 mois avant, cégep 6.
insert into crm.regles (genre, mois_avant) values
  ('ecole_primaire', 11), ('ecole_secondaire', 11), ('cegep', 6), ('universite', 6),
  ('entreprise', 6), ('organisme', 6), ('autre', 6);

-- ------------------------------------------------------------
-- Auteurs et dates posés par la base
-- ------------------------------------------------------------
create function crm.signer_echange()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sans session (migration, import), l'auteur fourni est gardé.
  if auth.uid() is not null then
    new.auteur := auth.uid();
    new.auteur_nom := crm.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_crm_echanges_signer before insert on crm.echanges
for each row execute function crm.signer_echange();

create function crm.signer_relance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.auteur_nom := crm.nom_de(auth.uid());
  end if;
  if new.statut = 'faite' and (tg_op = 'INSERT' or old.statut <> 'faite') then
    new.faite_le := now();
    new.faite_par_nom := crm.nom_de(auth.uid());
  elsif new.statut <> 'faite' then
    new.faite_le := null;
    new.faite_par_nom := null;
  end if;
  return new;
end;
$$;

create trigger trg_crm_relances_signer before insert or update on crm.relances
for each row execute function crm.signer_relance();

-- ------------------------------------------------------------
-- Séjours de la base de réservations (copie Airtable du Calendrier),
-- pour qui a accès au CRM même sans le Calendrier. « Closed lost » exclus.
-- ------------------------------------------------------------
create function crm.sejours()
returns table (
  id uuid,
  airtable_client_id text,
  nom_groupe text,
  numero text,
  type_sejour text,
  etat text,
  date_arrivee date,
  date_depart date,
  nb_participants integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, c.client_id, s.nom_groupe, s.numero, s.type_sejour, s.etat,
         s.date_arrivee, s.date_depart, s.nb_participants
  from calendrier.sejours s
  cross join lateral (
    select jsonb_array_elements_text(
      case when jsonb_typeof(s.raw -> 'fldPuFu1m9Qv53HkM') = 'array'
           then s.raw -> 'fldPuFu1m9Qv53HkM' else '[]'::jsonb end
    ) as client_id
    union all
    -- Séjour sans client lié : gardé pour pouvoir le relier (nom seulement).
    select null where jsonb_typeof(s.raw -> 'fldPuFu1m9Qv53HkM') is distinct from 'array'
       or jsonb_array_length(s.raw -> 'fldPuFu1m9Qv53HkM') = 0
  ) c
  where s.deleted_at is null
    and coalesce(s.etat, '') <> 'Closed lost'
    and core.peut_lire('crm')
$$;

-- Comptes qui peuvent écrire dans le CRM (choix du conseiller).
create function crm.conseillers()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, crm.nom_de(p.id)
  from core.profils p
  where p.actif and core.peut_lire('crm')
    and (p.role = 'admin' or core.niveau_module_de(p.id, 'crm') = 'ecriture')
  order by 2
$$;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant usage on schema crm to authenticated, service_role;
grant select, insert, update, delete on all tables in schema crm to authenticated, service_role;
revoke execute on function crm.sejours(), crm.conseillers() from public, anon;
grant execute on function crm.sejours(), crm.conseillers() to authenticated;

alter table crm.organisations enable row level security;
alter table crm.contacts enable row level security;
alter table crm.echanges enable row level security;
alter table crm.visites enable row level security;
alter table crm.relances enable row level security;
alter table crm.regles enable row level security;

create policy "Lire" on crm.organisations for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.organisations for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

create policy "Lire" on crm.contacts for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.contacts for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

create policy "Lire" on crm.echanges for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.echanges for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

create policy "Lire" on crm.visites for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.visites for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

create policy "Lire" on crm.relances for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.relances for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

create policy "Lire" on crm.regles for select to authenticated using (core.peut_lire('crm'));
create policy "Écrire" on crm.regles for all to authenticated
  using (core.peut_ecrire('crm')) with check (core.peut_ecrire('crm'));

alter publication supabase_realtime add table
  crm.organisations, crm.contacts, crm.echanges, crm.visites, crm.relances, crm.regles;
