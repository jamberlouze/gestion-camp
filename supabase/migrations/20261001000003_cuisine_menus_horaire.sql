-- ============================================================
-- commande → module « Cuisine » (le schéma garde son nom).
--
-- 1. Menus nommés, rangés en dossiers, et modèles (comme l'Horaire).
--    Chaque menu a ses propres groupes, grille, dates, sorties et ajouts
--    manuels ; les recettes et la banque d'ingrédients restent communes.
--    La grille actuelle devient le menu « Menu en cours ». Les « menus
--    sauvegardés » (table vide) sont remplacés par les modèles.
-- 2. Portions végé par groupe (« dont N végé »).
-- 3. Horaire du personnel de cuisine : fonctions, personnel, quarts.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dossiers et menus
-- ------------------------------------------------------------
create table commande.dossiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_dossiers_updated_at before update on commande.dossiers
for each row execute function core.maj_updated_at();

-- debut null : jours numérotés (Jour 1, Jour 2…). Un modèle n'a ni dossier
-- ni date : on choisit la date en créant un menu à partir de lui.
create table commande.menus (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  dossier_id uuid references commande.dossiers(id) on delete set null,
  modele boolean not null default false,
  jours integer not null default 7 check (jours between 1 and 14),
  debut date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menus_modele_sans_dossier check (not modele or dossier_id is null),
  constraint menus_modele_sans_date check (not modele or debut is null),
  -- Nom unique dans son dossier (sans dossier compris), et parmi les modèles.
  constraint menus_nom_unique unique nulls not distinct (modele, dossier_id, nom)
);

create index menus_dossier_id_idx on commande.menus (dossier_id);

create trigger trg_menus_updated_at before update on commande.menus
for each row execute function core.maj_updated_at();

comment on table commande.menus is
  'Menu d''un séjour ou d''une semaine : ses groupes, sa grille, ses sorties et ses ajouts manuels (tables liées par menu_id). modele = point de départ des nouveaux menus.';

-- Tables propres à un menu.
alter table commande.groupes_repas
  add column menu_id uuid references commande.menus(id) on delete cascade,
  add column vege integer not null default 0 check (vege >= 0),
  add column created_at timestamptz not null default now();
alter table commande.plan_cells add column menu_id uuid references commande.menus(id) on delete cascade;
alter table commande.sorties add column menu_id uuid references commande.menus(id) on delete cascade;
alter table commande.ajouts_consommables add column menu_id uuid references commande.menus(id) on delete cascade;
alter table commande.ajouts_recettes add column menu_id uuid references commande.menus(id) on delete cascade;

comment on column commande.groupes_repas.vege is
  'Portions végé comprises dans portions : pour une recette avec option végé, régulier = portions − vege, végé = vege.';

-- Recettes avec des ingrédients végé mais sans « option végé » cochée
-- (ex. Penne Bolo, Hamberger steak) : jusqu'ici la case ne servait qu'aux
-- ajouts manuels. Avec les portions végé par groupe, leurs ingrédients végé
-- seraient ignorés : on coche l'option (avec 0 végé, la commande ne change pas).
update commande.recettes set has_veg = true
where not has_veg and ingredients @> '[{"scope": "veggie"}]'::jsonb;

-- La grille actuelle devient « Menu en cours ».
do $$
declare
  m uuid;
  j integer;
  d date;
begin
  if exists (select 1 from commande.menus_sauves) then
    raise exception 'commande.menus_sauves n''est pas vide : convertir ces menus en modèles avant cette migration.';
  end if;
  select (valeur->>'jours')::integer, nullif(valeur->>'debut', '')::date
    into j, d
    from commande.parametres where cle = 'planificateur';
  insert into commande.menus (nom, jours, debut)
  values ('Menu en cours', least(greatest(coalesce(j, 7), 1), 14), d)
  returning id into m;
  update commande.groupes_repas set menu_id = m;
  update commande.plan_cells set menu_id = m;
  update commande.sorties set menu_id = m;
  update commande.ajouts_consommables set menu_id = m;
  update commande.ajouts_recettes set menu_id = m;
end;
$$;

alter table commande.groupes_repas alter column menu_id set not null;
alter table commande.plan_cells alter column menu_id set not null;
alter table commande.sorties alter column menu_id set not null;
alter table commande.ajouts_consommables alter column menu_id set not null;
alter table commande.ajouts_recettes alter column menu_id set not null;

-- Clés : un groupe garde son identifiant quand on copie un menu (la grille
-- et les sorties y font référence), d'où la clé (menu_id, id).
alter table commande.groupes_repas drop constraint groupes_repas_pkey;
alter table commande.groupes_repas add primary key (menu_id, id);
alter table commande.plan_cells drop constraint plan_cells_pkey;
alter table commande.plan_cells add primary key (menu_id, day, meal);
alter table commande.ajouts_consommables drop constraint ajouts_consommables_pkey;
alter table commande.ajouts_consommables add primary key (menu_id, cons_id);
create index sorties_menu_id_idx on commande.sorties (menu_id);
create index ajouts_recettes_menu_id_idx on commande.ajouts_recettes (menu_id);

-- Remplacés par les menus et les modèles.
drop table commande.menus_sauves;
delete from commande.parametres where cle = 'planificateur';

-- « Modifié » d'un menu : toute modification de son contenu le met à jour.
create or replace function commande.toucher_menu()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update commande.menus set updated_at = now()
  where id = case when tg_op = 'DELETE' then old.menu_id else new.menu_id end;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['groupes_repas','plan_cells','sorties','ajouts_consommables','ajouts_recettes']
  loop
    execute format(
      'create trigger trg_%s_toucher_menu after insert or update or delete on commande.%I for each row execute function commande.toucher_menu()',
      t, t);
  end loop;
end;
$$;

-- Garde-fou : une suppression dans la grille ou les groupes ne vise jamais
-- qu'un menu. Un onglet resté ouvert sur l'ancienne application (avant les
-- menus) effacerait sinon la grille de tous les menus (« Effacer ») ou un
-- groupe dans toutes les copies d'un menu (les copies gardent les id). La
-- suppression d'un menu (cascade) passe : ce menu n'existe déjà plus.
create or replace function commande.un_seul_menu()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(distinct a.menu_id) from anciens a
      where exists (select 1 from commande.menus m where m.id = a.menu_id)) > 1 then
    raise exception 'Suppression refusée : elle toucherait plusieurs menus. Rechargez la page.';
  end if;
  return null;
end;
$$;

create trigger trg_plan_cells_un_seul_menu after delete on commande.plan_cells
referencing old table as anciens for each statement execute function commande.un_seul_menu();
create trigger trg_groupes_repas_un_seul_menu after delete on commande.groupes_repas
referencing old table as anciens for each statement execute function commande.un_seul_menu();

-- Nouveau menu vide avec son premier groupe (au moins un groupe est requis),
-- en une seule transaction. p_groupe : {id, name, age, portions, vege, color}.
-- Droits de l'appelant (RLS).
create or replace function commande.creer_menu(
  p_nom text,
  p_dossier uuid,
  p_modele boolean,
  p_jours integer,
  p_debut date,
  p_groupe jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  m uuid;
begin
  insert into commande.menus (nom, dossier_id, modele, jours, debut)
  values (
    p_nom,
    case when p_modele then null else p_dossier end,
    p_modele,
    p_jours,
    case when p_modele then null else p_debut end
  )
  returning id into m;

  insert into commande.groupes_repas (menu_id, id, name, age, portions, vege, color)
  select m, g.id, g.name, g.age, g.portions, g.vege, g.color
  from jsonb_to_record(p_groupe) as g(id text, name text, age text, portions integer, vege integer, color text);

  return m;
end;
$$;

-- Copie d'un menu (dupliquer, créer un modèle, créer un menu à partir d'un
-- modèle) : tout son contenu, en une seule transaction. Un modèle n'a ni
-- dossier ni date. Droits de l'appelant (RLS).
create or replace function commande.copier_menu(
  p_source uuid,
  p_nom text,
  p_dossier uuid,
  p_modele boolean,
  p_debut date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  src commande.menus;
  m uuid;
begin
  select * into src from commande.menus where id = p_source;
  if not found then
    raise exception 'Menu introuvable.';
  end if;

  insert into commande.menus (nom, dossier_id, modele, jours, debut)
  values (
    p_nom,
    case when p_modele then null else p_dossier end,
    p_modele,
    src.jours,
    case when p_modele then null else p_debut end
  )
  returning id into m;

  insert into commande.groupes_repas (menu_id, id, name, age, portions, vege, color, created_at)
  select m, g.id, g.name, g.age, g.portions, g.vege, g.color, g.created_at
  from commande.groupes_repas g where g.menu_id = p_source;

  insert into commande.plan_cells (menu_id, day, meal, plat, salade, dessert, absent)
  select m, c.day, c.meal, c.plat, c.salade, c.dessert, c.absent
  from commande.plan_cells c where c.menu_id = p_source;

  insert into commande.sorties (id, menu_id, nom, jour_depart, pattern, groupes, glaciere_id, created_at)
  select 's_' || left(replace(gen_random_uuid()::text, '-', ''), 13), m, s.nom, s.jour_depart, s.pattern,
         s.groupes, s.glaciere_id, s.created_at
  from commande.sorties s where s.menu_id = p_source;

  insert into commande.ajouts_consommables (menu_id, cons_id, qty)
  select m, a.cons_id, a.qty from commande.ajouts_consommables a where a.menu_id = p_source;

  insert into commande.ajouts_recettes (menu_id, recipe_id, portions, veg, created_at)
  select m, a.recipe_id, a.portions, a.veg, a.created_at
  from commande.ajouts_recettes a where a.menu_id = p_source;

  return m;
end;
$$;

-- ------------------------------------------------------------
-- 3. Horaire du personnel de cuisine
-- ------------------------------------------------------------
create table commande.fonctions (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  couleur text not null default '#e7e5e4',
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_fonctions_updated_at before update on commande.fonctions
for each row execute function core.maj_updated_at();

-- Liste propre au module (pas core.employes, qui ne contient que le
-- personnel d'été venu d'Airtable).
create table commande.personnel (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  fonction_id uuid references commande.fonctions(id) on delete set null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_personnel_updated_at before update on commande.personnel
for each row execute function core.maj_updated_at();

-- Une case de l'horaire : le texte tel qu'écrit (« 6h30 à 14h30 », « 9ish »,
-- « OFF », « Vacance »…). Les heures sont calculées à l'affichage.
create table commande.quarts (
  personne_id uuid not null references commande.personnel(id) on delete cascade,
  jour date not null,
  texte text not null check (btrim(texte) <> ''),
  updated_at timestamptz not null default now(),
  primary key (personne_id, jour)
);

create index quarts_jour_idx on commande.quarts (jour);

create trigger trg_quarts_updated_at before update on commande.quarts
for each row execute function core.maj_updated_at();

-- Remplace tous les quarts d'une période (copier la semaine précédente,
-- vider la semaine) en une seule transaction : en cas d'échec, la semaine
-- reste telle quelle. p_quarts : [{personne_id, jour, texte}]. Droits de
-- l'appelant (RLS).
create or replace function commande.remplacer_quarts(p_debut date, p_fin date, p_quarts jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from commande.quarts where jour between p_debut and p_fin;
  insert into commande.quarts (personne_id, jour, texte)
  select q.personne_id, q.jour, btrim(q.texte)
  from jsonb_to_recordset(p_quarts) as q(personne_id uuid, jour date, texte text)
  where q.jour between p_debut and p_fin and btrim(coalesce(q.texte, '')) <> ''
  -- Case écrite au même moment par quelqu'un d'autre : la copie l'emporte.
  on conflict (personne_id, jour) do update set texte = excluded.texte;
end;
$$;

-- Fonctions et couleurs de la feuille « Cuisine automne 2026 ».
insert into commande.fonctions (nom, couleur, ordre) values
  ('Gestionnaire', '#b6d7a8', 1),
  ('Lead', '#ead1dc', 2),
  ('Cook', '#ffe599', 3),
  ('Help', '#cfe2f3', 4),
  ('Marmiton', '#d9d2e9', 5);

-- Quarts proposés en un clic et mots qui ne sont pas des quarts travaillés.
insert into commande.parametres (cle, valeur) values (
  'horaire_cuisine',
  '{"quarts": ["6h30 à 14h30", "7h30 à 15h30", "8h30 à 16h30", "9h à 19h", "11h à 19h"], "statuts": ["OFF", "Vacance", "Congé", "Malade"]}'
);

-- ------------------------------------------------------------
-- Droits, RLS et temps réel des nouvelles tables
-- ------------------------------------------------------------
grant select, insert, update, delete on
  commande.dossiers, commande.menus, commande.fonctions, commande.personnel, commande.quarts
  to authenticated, service_role;
grant execute on function commande.copier_menu(uuid, text, uuid, boolean, date) to authenticated, service_role;
grant execute on function commande.creer_menu(text, uuid, boolean, integer, date, jsonb) to authenticated, service_role;
grant execute on function commande.remplacer_quarts(date, date, jsonb) to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['dossiers','menus','fonctions','personnel','quarts']
  loop
    execute format('alter table commande.%I enable row level security', t);
    execute format('create policy "Lire" on commande.%I for select to authenticated using (core.peut_lire(''commande''))', t);
    execute format('create policy "Écrire" on commande.%I for all to authenticated using (core.peut_ecrire(''commande'')) with check (core.peut_ecrire(''commande''))', t);
    execute format('alter publication supabase_realtime add table commande.%I', t);
  end loop;
end;
$$;
