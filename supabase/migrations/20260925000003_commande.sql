-- ============================================================
-- commande : calculateur de commande Colabor.
-- Repris de l'ancien projet « Outils de commande ». Les identifiants
-- texte sont conservés : ils sont référencés dans la grille, les
-- menus sauvés et les sorties.
-- ============================================================

create schema if not exists commande;

-- Recettes : ingredients = [{id,name,pkg,qty,unit,caseQty,store,scope}]
create table commande.recettes (
  id text primary key,
  name text not null,
  cat text not null,
  has_veg boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,
  deleted_at timestamptz
);

create index idx_recettes_deleted on commande.recettes(deleted_at);

-- Consommables (ketchup, moutarde, etc. — hors recettes)
create table commande.consommables (
  id text primary key,
  name text not null,
  prod_id text,
  prod_name text,
  pkg text,
  store text not null default 'colabor',
  deleted_at timestamptz
);

create index idx_consommables_deleted on commande.consommables(deleted_at);

-- Banque d'ingrédients (catalogue Colabor, Costco, Maxi)
create table commande.banque_ingredients (
  id text primary key,
  name text not null,
  pkg text default '',
  case_qty numeric,
  unit text not null default 'g',
  store text not null default 'colabor'
);

-- Groupes de portions pour les repas (ex. Campeurs, Employés). Distincts
-- des groupes de campeurs de core.groupes.
create table commande.groupes_repas (
  id text primary key,
  name text not null,
  age text,
  portions integer not null default 0,
  color text
);

-- Grille du planificateur : une ligne par (jour, repas).
-- absent = identifiants de groupes_repas absents à ce repas.
create table commande.plan_cells (
  day integer not null,
  meal text not null,
  plat text default '',
  salade text default '',
  dessert text default '',
  absent jsonb not null default '[]'::jsonb,
  primary key (day, meal)
);

-- Menus sauvés (copie des groupes et de la grille)
create table commande.menus_sauves (
  id text primary key,
  name text not null,
  saved_at timestamptz not null default now(),
  days integer,
  groups jsonb not null default '[]'::jsonb,
  cells jsonb not null default '{}'::jsonb
);

-- Ajouts manuels à la commande en cours
create table commande.ajouts_consommables (
  cons_id text primary key references commande.consommables(id) on delete cascade,
  qty numeric not null default 0
);

create table commande.ajouts_recettes (
  id bigserial primary key,
  recipe_id text not null references commande.recettes(id) on delete cascade,
  portions integer not null,
  veg integer default 0,
  created_at timestamptz not null default now()
);

-- Sorties (groupes hors camp) : retirent des portions des repas
-- réguliers et ajoutent un repas de glacière.
create table commande.sorties (
  id text primary key,
  nom text default '',
  jour_depart integer not null,
  pattern text not null default 'souper_dejeuner' check (pattern in ('souper_dejeuner','diner_souper_dejeuner')),
  groupes jsonb not null default '[]'::jsonb,
  glaciere_id text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Droits et RLS : une politique lecture + une politique écriture
-- par table.
-- ------------------------------------------------------------
grant usage on schema commande to authenticated, service_role;
grant select, insert, update, delete on all tables in schema commande to authenticated, service_role;
grant usage, select on all sequences in schema commande to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['recettes','consommables','banque_ingredients','groupes_repas',
                           'plan_cells','menus_sauves','ajouts_consommables','ajouts_recettes','sorties']
  loop
    execute format('alter table commande.%I enable row level security', t);
    execute format('create policy "Lire" on commande.%I for select to authenticated using (core.peut_lire(''commande''))', t);
    execute format('create policy "Écrire" on commande.%I for all to authenticated using (core.peut_ecrire(''commande'')) with check (core.peut_ecrire(''commande''))', t);
    execute format('alter publication supabase_realtime add table commande.%I', t);
  end loop;
end;
$$;
