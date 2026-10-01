-- ============================================================
-- mastertimeline : les tâches annuelles de toutes les entreprises
-- (reprise de la base Airtable « Mastertimeline - LÜTRA »).
--
-- Une seule liste de tâches, valable d'une année à l'autre ; chaque
-- passage d'une tâche a sa propre coche (table coches), rangée sous le
-- mois du passage. Rien n'est recopié d'un exercice à l'autre : au
-- changement de mois ou d'exercice, les passages suivants sont
-- simplement décochés. L'exercice va d'octobre à septembre.
-- ============================================================

create schema if not exists mastertimeline;

-- Le nouveau module peut être donné aux coordonnateurs.
alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline'));

create table mastertimeline.entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  couleur text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deux sortes de projets :
--   annuel   (ponctuel = false) : un regroupement de tâches annuelles
--                                 (Ouverture été, Entretien bâtiment…)
--   ponctuel (ponctuel = true)  : un chantier qui se termine (Trembloc…),
--                                 avec une date cible et des tâches ordonnées
create table mastertimeline.projets (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  couleur text,
  ordre integer not null default 0,
  ponctuel boolean not null default false,
  date_cible date,
  termine_le timestamptz,
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les personnes qui reçoivent des tâches : une liste propre au module
-- (la direction et l'équipe permanente ne sont pas dans core.employes).
create table mastertimeline.responsables (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  courriel text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mastertimeline.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  personne_ressource text,
  telephone text,
  courriel text,
  site_web text,
  service text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une tâche est :
--   annuelle   (mois rempli) : revient les mois listés (1 = janvier),
--              tous les intervalle_ans exercices à partir de exercice_depart
--              (année où commence l'exercice : 2026 = 2026-27). jour =
--              date précise dans le mois, optionnelle.
--   ponctuelle (mois vide)   : une seule fois, avec une échéance optionnelle ;
--              dans un projet ponctuel, position garde l'ordre choisi.
create table mastertimeline.taches (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  entreprise_id uuid references mastertimeline.entreprises(id) on delete set null,
  projet_id uuid references mastertimeline.projets(id) on delete set null,
  responsable_id uuid references mastertimeline.responsables(id) on delete set null,
  fournisseur_id uuid references mastertimeline.fournisseurs(id) on delete set null,
  -- Note permanente : comment faire la tâche (la note d'une année vit dans coches).
  note text,
  corvee boolean not null default false,
  mois smallint[],
  intervalle_ans smallint not null default 1 check (intervalle_ans >= 1),
  exercice_depart smallint,
  jour smallint check (jour between 1 and 31),
  debut date,
  echeance date,
  priorite smallint check (priorite between 1 and 4),
  heures_prevues numeric,
  position double precision,
  archivee boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mois is null or (cardinality(mois) >= 1 and mois <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[])),
  check (mois is null or exercice_depart is not null)
);

create index idx_taches_projet on mastertimeline.taches(projet_id);
create index idx_taches_responsable on mastertimeline.taches(responsable_id);

-- Un passage d'une tâche : periode = mois du passage ('2026-10') pour une
-- tâche annuelle, 'unique' pour une ponctuelle.
--   statut 'faite'  : cochée
--   statut 'sautee' : « Pas cette année » (la tâche revient au prochain passage)
--   statut null     : seulement une note de l'année
create table mastertimeline.coches (
  tache_id uuid not null references mastertimeline.taches(id) on delete cascade,
  periode text not null check (periode ~ '^[0-9]{4}-[0-9]{2}$' or periode = 'unique'),
  statut text check (statut in ('faite','sautee')),
  note text,
  fait_le date,
  fait_par uuid references core.profils(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tache_id, periode)
);

create index idx_coches_periode on mastertimeline.coches(periode);

create table mastertimeline.achats (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  fournisseur_id uuid references mastertimeline.fournisseurs(id) on delete set null,
  commande boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_entreprises_updated_at before update on mastertimeline.entreprises
for each row execute function core.maj_updated_at();
create trigger trg_projets_updated_at before update on mastertimeline.projets
for each row execute function core.maj_updated_at();
create trigger trg_responsables_updated_at before update on mastertimeline.responsables
for each row execute function core.maj_updated_at();
create trigger trg_fournisseurs_updated_at before update on mastertimeline.fournisseurs
for each row execute function core.maj_updated_at();
create trigger trg_taches_updated_at before update on mastertimeline.taches
for each row execute function core.maj_updated_at();
create trigger trg_coches_updated_at before update on mastertimeline.coches
for each row execute function core.maj_updated_at();
create trigger trg_achats_updated_at before update on mastertimeline.achats
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema mastertimeline to authenticated, service_role;
grant select, insert, update, delete on all tables in schema mastertimeline to authenticated, service_role;
revoke execute on all functions in schema mastertimeline from public, anon;

do $$
declare t text;
begin
  foreach t in array array['entreprises','projets','responsables','fournisseurs','taches','coches','achats'] loop
    execute format('alter table mastertimeline.%I enable row level security', t);
    execute format(
      'create policy "Lire" on mastertimeline.%I for select to authenticated using (core.peut_lire(''mastertimeline''))', t);
    execute format(
      'create policy "Écrire" on mastertimeline.%I for all to authenticated
         using (core.peut_ecrire(''mastertimeline'')) with check (core.peut_ecrire(''mastertimeline''))', t);
  end loop;
end $$;

alter publication supabase_realtime add table
  mastertimeline.entreprises, mastertimeline.projets, mastertimeline.responsables,
  mastertimeline.fournisseurs, mastertimeline.taches, mastertimeline.coches, mastertimeline.achats;
