-- ============================================================
-- rooming : les bâtiments, leurs lits et qui dort où.
--
-- Structure fixe : zone > bâtiment > section > chambre (capacité
-- normale de la chambre). Plans = scénarios nommés sans dates (Été 2026,
-- Classe nature…), un seul « en vigueur ». Dans un plan, une chambre a
-- un type (enfants / employés / vide), un nombre, et au besoin une
-- capacité propre au plan (lit d'appoint, chambre fermée à 0). Des
-- employés clés peuvent être nommés dans une chambre d'employés : ils
-- comptent dans le nombre. On ne dépasse jamais les lits.
-- Remplace le Google Sheets « Plan de rooming » (import en bas).
-- ============================================================

create schema if not exists rooming;

alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

insert into core.acces_roles (role, module, niveau) values ('direction','rooming','ecriture');

-- ------------------------------------------------------------
-- Structure : zones > bâtiments > sections > chambres. Un niveau qui
-- contient encore quelque chose ne peut pas être supprimé.
-- ------------------------------------------------------------
create table rooming.zones (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rooming.batiments (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references rooming.zones(id) on delete restrict,
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rooming.sections (
  id uuid primary key default gen_random_uuid(),
  batiment_id uuid not null references rooming.batiments(id) on delete restrict,
  nom text not null check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batiment_id, nom)
);

create table rooming.chambres (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references rooming.sections(id) on delete restrict,
  numero text not null check (btrim(numero) <> ''),
  -- Capacité normale ; un plan peut la changer pour lui seul.
  lits integer not null default 0 check (lits between 0 and 50),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, numero)
);

create index idx_batiments_zone on rooming.batiments(zone_id);
create index idx_sections_batiment on rooming.sections(batiment_id);
create index idx_chambres_section on rooming.chambres(section_id);

-- ------------------------------------------------------------
-- Plans
-- ------------------------------------------------------------
create table rooming.plans (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  en_vigueur boolean not null default false,
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (en_vigueur and archive))
);

create unique index plans_un_seul_en_vigueur on rooming.plans ((true)) where en_vigueur;

-- Une ligne par chambre « touchée » dans un plan ; sans ligne : vide,
-- capacité normale.
create table rooming.occupations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references rooming.plans(id) on delete cascade,
  chambre_id uuid not null references rooming.chambres(id) on delete cascade,
  type text not null default 'vide' check (type in ('enfants','employes','vide')),
  nombre integer not null default 0 check (nombre >= 0),
  -- Capacité propre au plan (null = capacité normale de la chambre).
  lits integer check (lits between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, chambre_id),
  check (type <> 'vide' or nombre = 0)
);

create index idx_occupations_chambre on rooming.occupations(chambre_id);

-- Employés clés nommés dans une chambre d'employés : un employé de
-- core.employes, ou un nom tapé à la main (direction, invité…). Une
-- personne n'est qu'à un endroit par plan.
create table rooming.personnes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  chambre_id uuid not null,
  employe_id uuid references core.employes(id) on delete cascade,
  nom text check (nom is null or btrim(nom) <> ''),
  created_at timestamptz not null default now(),
  check ((employe_id is null) <> (nom is null)),
  foreign key (plan_id, chambre_id) references rooming.occupations(plan_id, chambre_id) on delete cascade
);

create unique index personnes_employe_unique on rooming.personnes(plan_id, employe_id) where employe_id is not null;
create unique index personnes_nom_unique on rooming.personnes(plan_id, lower(btrim(nom))) where nom is not null;
create index idx_personnes_chambre on rooming.personnes(plan_id, chambre_id);
create index idx_personnes_employe on rooming.personnes(employe_id);

create trigger trg_zones_updated_at before update on rooming.zones
for each row execute function core.maj_updated_at();
create trigger trg_batiments_updated_at before update on rooming.batiments
for each row execute function core.maj_updated_at();
create trigger trg_sections_updated_at before update on rooming.sections
for each row execute function core.maj_updated_at();
create trigger trg_chambres_updated_at before update on rooming.chambres
for each row execute function core.maj_updated_at();
create trigger trg_plans_updated_at before update on rooming.plans
for each row execute function core.maj_updated_at();
create trigger trg_occupations_updated_at before update on rooming.occupations
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Règles : jamais plus de monde que de lits ; les noms seulement dans
-- une chambre d'employés et jamais plus nombreux que le chiffre.
-- ------------------------------------------------------------
create function rooming.nom_chambre(p_chambre uuid)
returns text
language sql
stable
set search_path = ''
as $$
  -- « 55 TDL » plutôt que « 55 TDL 55 TDL » (bâtiment d'une seule pièce).
  select case when s.nom = c.numero then c.numero else s.nom || ' ' || c.numero end
  from rooming.chambres c join rooming.sections s on s.id = c.section_id
  where c.id = p_chambre
$$;

create function rooming.verifier_occupation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lits integer;
  v_noms integer;
begin
  select coalesce(new.lits, c.lits) into v_lits from rooming.chambres c where c.id = new.chambre_id;
  if new.nombre > v_lits then
    raise exception 'La chambre % n''a que % lit(s) dans ce plan.', rooming.nom_chambre(new.chambre_id), v_lits
      using errcode = 'check_violation';
  end if;
  if new.type = 'employes' then
    select count(*) into v_noms from rooming.personnes p
    where p.plan_id = new.plan_id and p.chambre_id = new.chambre_id;
    if new.nombre < v_noms then
      raise exception 'La chambre % a % employé(s) nommé(s) : retirez d''abord un nom.', rooming.nom_chambre(new.chambre_id), v_noms
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_occupations_verifier before insert or update on rooming.occupations
for each row execute function rooming.verifier_occupation();

-- Une chambre qui n'est plus « employés » perd ses noms.
create function rooming.oublier_noms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> 'employes' then
    delete from rooming.personnes p where p.plan_id = new.plan_id and p.chambre_id = new.chambre_id;
  end if;
  return null;
end;
$$;

create trigger trg_occupations_oublier_noms after update of type on rooming.occupations
for each row when (old.type = 'employes' and new.type <> 'employes')
execute function rooming.oublier_noms();

create function rooming.verifier_personne()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_occ rooming.occupations;
  v_noms integer;
begin
  select * into v_occ from rooming.occupations o
  where o.plan_id = new.plan_id and o.chambre_id = new.chambre_id;
  if v_occ.type is distinct from 'employes' then
    raise exception 'On ne nomme des personnes que dans une chambre d''employés.' using errcode = 'check_violation';
  end if;
  select count(*) into v_noms from rooming.personnes p
  where p.plan_id = new.plan_id and p.chambre_id = new.chambre_id and p.id <> new.id;
  if v_noms + 1 > v_occ.nombre then
    raise exception 'La chambre % compte % employé(s) : augmentez le nombre avant d''ajouter un nom.', rooming.nom_chambre(new.chambre_id), v_occ.nombre
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_personnes_verifier before insert or update on rooming.personnes
for each row execute function rooming.verifier_personne();

-- Baisser la capacité normale d'une chambre : bloqué si un plan qui
-- l'utilise (sans capacité propre) déborderait.
create function rooming.verifier_capacite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan text;
  v_nombre integer;
begin
  select p.nom, o.nombre into v_plan, v_nombre
  from rooming.occupations o join rooming.plans p on p.id = o.plan_id
  where o.chambre_id = new.id and o.lits is null and o.nombre > new.lits
  order by o.nombre desc
  limit 1;
  if found then
    raise exception 'Le plan « % » loge % personne(s) dans la chambre % : impossible de descendre à % lit(s).', v_plan, v_nombre, rooming.nom_chambre(new.id), new.lits
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_chambres_verifier_capacite before update of lits on rooming.chambres
for each row when (new.lits < old.lits)
execute function rooming.verifier_capacite();

-- ------------------------------------------------------------
-- Opérations (droits de la personne : RLS)
-- ------------------------------------------------------------

-- Nomme une personne dans une chambre. La chambre devient « employés » au
-- besoin et le nombre monte si tous les employés sont déjà nommés. Si la
-- personne est déjà ailleurs dans le plan : erreur, ou déplacement si
-- p_deplacer (elle quitte l'autre chambre, dont le nombre baisse de 1).
create function rooming.placer(p_plan uuid, p_chambre uuid, p_employe uuid, p_nom text, p_deplacer boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  v_employe uuid := p_employe;
  v_ailleurs rooming.personnes;
  v_occ rooming.occupations;
  v_noms integer;
begin
  if (p_employe is null) = (v_nom is null) then
    raise exception 'Choisissez un employé ou tapez un nom.' using errcode = 'check_violation';
  end if;

  select * into v_ailleurs from rooming.personnes p
  where p.plan_id = p_plan
    and (p.employe_id = p_employe or lower(btrim(p.nom)) = lower(v_nom));
  if found then
    if v_ailleurs.chambre_id = p_chambre then
      return;
    end if;
    if not p_deplacer then
      raise exception 'DEJA_PLACE:%', rooming.nom_chambre(v_ailleurs.chambre_id) using errcode = 'P0001';
    end if;
    -- La personne garde son identité d'origine (« Vickie », pas « vickie »).
    v_employe := v_ailleurs.employe_id;
    v_nom := v_ailleurs.nom;
    delete from rooming.personnes where id = v_ailleurs.id;
    update rooming.occupations
    set nombre = greatest(nombre - 1, 0),
        type = case when nombre - 1 <= 0 then 'vide' else type end
    where plan_id = p_plan and chambre_id = v_ailleurs.chambre_id;
  end if;

  select * into v_occ from rooming.occupations o where o.plan_id = p_plan and o.chambre_id = p_chambre;
  if not found then
    insert into rooming.occupations (plan_id, chambre_id, type, nombre) values (p_plan, p_chambre, 'employes', 1);
  elsif v_occ.type = 'enfants' then
    raise exception 'La chambre % est une chambre d''enfants dans ce plan.', rooming.nom_chambre(p_chambre) using errcode = 'check_violation';
  else
    select count(*) into v_noms from rooming.personnes p where p.plan_id = p_plan and p.chambre_id = p_chambre;
    update rooming.occupations
    set type = 'employes', nombre = greatest(case when type = 'vide' then 0 else nombre end, v_noms + 1)
    where id = v_occ.id;
  end if;

  insert into rooming.personnes (plan_id, chambre_id, employe_id, nom) values (p_plan, p_chambre, v_employe, v_nom);
end;
$$;

-- Retire un nom : la personne quitte la chambre (le nombre baisse de 1).
create function rooming.retirer(p_personne uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v rooming.personnes;
begin
  delete from rooming.personnes where id = p_personne returning * into v;
  if not found then
    return;
  end if;
  update rooming.occupations
  set nombre = greatest(nombre - 1, 0),
      type = case when nombre - 1 <= 0 then 'vide' else type end
  where plan_id = v.plan_id and chambre_id = v.chambre_id;
end;
$$;

-- Copie un plan (chiffres, capacités propres, noms) ; renvoie le nouveau.
create function rooming.copier_plan(p_source uuid, p_nom text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into rooming.plans (nom) values (btrim(p_nom)) returning id into v_id;
  insert into rooming.occupations (plan_id, chambre_id, type, nombre, lits)
  select v_id, chambre_id, type, nombre, lits from rooming.occupations where plan_id = p_source;
  insert into rooming.personnes (plan_id, chambre_id, employe_id, nom)
  select v_id, chambre_id, employe_id, nom from rooming.personnes where plan_id = p_source;
  return v_id;
end;
$$;

-- Le plan devient celui qui s'ouvre par défaut (et sort des archives).
create function rooming.mettre_en_vigueur(p_plan uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update rooming.plans set en_vigueur = false where en_vigueur and id <> p_plan;
  update rooming.plans set en_vigueur = true, archive = false where id = p_plan;
end;
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema rooming to authenticated, service_role;
grant select, insert, update, delete on all tables in schema rooming to authenticated, service_role;
revoke execute on all functions in schema rooming from public, anon;
grant execute on all functions in schema rooming to authenticated, service_role;

alter table rooming.zones enable row level security;
alter table rooming.batiments enable row level security;
alter table rooming.sections enable row level security;
alter table rooming.chambres enable row level security;
alter table rooming.plans enable row level security;
alter table rooming.occupations enable row level security;
alter table rooming.personnes enable row level security;

create policy "Lire zones" on rooming.zones for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire zones" on rooming.zones for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire bâtiments" on rooming.batiments for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire bâtiments" on rooming.batiments for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire sections" on rooming.sections for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire sections" on rooming.sections for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire chambres" on rooming.chambres for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire chambres" on rooming.chambres for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire plans" on rooming.plans for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire plans" on rooming.plans for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire occupations" on rooming.occupations for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire occupations" on rooming.occupations for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));
create policy "Lire personnes" on rooming.personnes for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire personnes" on rooming.personnes for all to authenticated
  using (core.peut_ecrire('rooming')) with check (core.peut_ecrire('rooming'));

alter publication supabase_realtime add table
  rooming.zones, rooming.batiments, rooming.sections, rooming.chambres,
  rooming.plans, rooming.occupations, rooming.personnes;

-- ============================================================
-- Import du Google Sheets « Plan de rooming » (2026-10-06)
-- ============================================================
insert into rooming.zones (nom, ordre) values ('Zone 1', 1), ('Zone 2', 2);

insert into rooming.batiments (zone_id, nom, ordre)
select z.id, b.nom, b.ordre from (values
  ('Zone 1', 'Cèdres', 1),
  ('Zone 1', 'Pins', 2),
  ('Zone 2', 'Vieille France', 3),
  ('Zone 2', 'Motel', 4),
  ('Zone 2', '55 TDL', 5),
  ('Zone 2', '100 TDL', 6)
) as b(zone, nom, ordre) join rooming.zones z on z.nom = b.zone;

insert into rooming.sections (batiment_id, nom, ordre)
select b.id, s.nom, s.ordre from (values
  ('Cèdres', 'Cèdres haut', 1),
  ('Cèdres', 'Cèdres bas', 2),
  ('Pins', 'Pins bas', 1),
  ('Pins', 'Pins haut', 2),
  ('Pins', 'Bout du bâtiment', 3),
  ('Vieille France', 'Vieille France bas', 1),
  ('Vieille France', 'Vieille France haut', 2),
  ('Motel', 'Motel', 1),
  ('55 TDL', '55 TDL', 1),
  ('100 TDL', '100 TDL', 1)
) as s(batiment, nom, ordre) join rooming.batiments b on b.nom = s.batiment;

insert into rooming.chambres (section_id, numero, lits, ordre)
select s.id, c.numero, c.lits, c.ordre from (values
  ('Cèdres haut', '1', 4, 1),
  ('Cèdres haut', '2', 6, 2),
  ('Cèdres haut', '3', 6, 3),
  ('Cèdres haut', '4', 6, 4),
  ('Cèdres haut', '5', 4, 5),
  ('Cèdres haut', '6', 4, 6),
  ('Cèdres haut', '7', 6, 7),
  ('Cèdres bas', '8', 4, 1),
  ('Cèdres bas', '9', 6, 2),
  ('Cèdres bas', '10', 6, 3),
  ('Cèdres bas', '11', 8, 4),
  ('Cèdres bas', '12', 4, 5),
  ('Pins bas', '1', 4, 1),
  ('Pins bas', '2', 4, 2),
  ('Pins bas', '3', 4, 3),
  ('Pins bas', '4', 4, 4),
  ('Pins bas', '5', 4, 5),
  ('Pins bas', '6', 4, 6),
  ('Pins bas', '7', 4, 7),
  ('Pins bas', '8', 9, 8),
  ('Pins haut', '9', 4, 1),
  ('Pins haut', '10', 4, 2),
  ('Pins haut', '11', 4, 3),
  ('Pins haut', '12', 4, 4),
  ('Pins haut', '13', 4, 5),
  ('Pins haut', '14', 4, 6),
  ('Pins haut', '15', 4, 7),
  ('Pins haut', '16', 4, 8),
  ('Bout du bâtiment', '17', 2, 1),
  ('Bout du bâtiment', '18', 8, 2),
  ('Vieille France bas', '1', 3, 1),
  ('Vieille France bas', '2', 4, 2),
  ('Vieille France bas', '3', 4, 3),
  ('Vieille France bas', '4', 4, 4),
  ('Vieille France bas', '5', 4, 5),
  ('Vieille France bas', '6', 4, 6),
  ('Vieille France haut', '7', 4, 1),
  ('Vieille France haut', '8', 4, 2),
  ('Vieille France haut', '9', 4, 3),
  ('Vieille France haut', '10', 4, 4),
  ('Vieille France haut', '11', 4, 5),
  ('Vieille France haut', '12', 4, 6),
  ('Vieille France haut', '13', 4, 7),
  ('Vieille France haut', '14', 4, 8),
  ('Vieille France haut', '15', 4, 9),
  ('Motel', '16', 4, 1),
  ('Motel', '17', 6, 2),
  ('Motel', '18', 4, 3),
  ('Motel', '19', 3, 4),
  ('Motel', '20', 6, 5),
  ('Motel', '20 3/4', 2, 6),
  ('Motel', 'Appart', 3, 7),
  ('55 TDL', '55 TDL', 3, 1),
  ('100 TDL', '100 TDL', 5, 1)
) as c(section, numero, lits, ordre) join rooming.sections s on s.nom = c.section;

insert into rooming.plans (nom, en_vigueur, archive) values
  ('Été 2026', true, false),
  ('Classe nature', false, false),
  ('2025 – Pré-camp', false, true),
  ('2025 – Classes nature', false, true),
  ('2025 – Scénario 1', false, true),
  ('2025 – Scénario 2', false, true),
  ('2025 – Scénario 3', false, true),
  ('2025 – Scénario 4', false, true);

insert into rooming.occupations (plan_id, chambre_id, type, nombre, lits)
select p.id, c.id, o.type, o.nombre, o.lits from (values
  ('Été 2026', 'Cèdres haut', '1', 'employes', 4, null),
  ('Été 2026', 'Cèdres haut', '2', 'enfants', 6, null),
  ('Été 2026', 'Cèdres haut', '3', 'enfants', 6, null),
  ('Été 2026', 'Cèdres haut', '4', 'enfants', 6, null),
  ('Été 2026', 'Cèdres haut', '5', 'employes', 4, null),
  ('Été 2026', 'Cèdres haut', '6', 'enfants', 4, null),
  ('Été 2026', 'Cèdres haut', '7', 'enfants', 6, null),
  ('Été 2026', 'Cèdres bas', '8', 'enfants', 4, null),
  ('Été 2026', 'Cèdres bas', '9', 'enfants', 6, null),
  ('Été 2026', 'Cèdres bas', '10', 'employes', 6, null),
  ('Été 2026', 'Cèdres bas', '11', 'enfants', 8, null),
  ('Été 2026', 'Cèdres bas', '12', 'employes', 4, null),
  ('Été 2026', 'Pins bas', '1', 'employes', 4, null),
  ('Été 2026', 'Pins bas', '2', 'enfants', 4, null),
  ('Été 2026', 'Pins bas', '3', 'enfants', 4, null),
  ('Été 2026', 'Pins bas', '4', 'enfants', 4, null),
  ('Été 2026', 'Pins bas', '5', 'enfants', 4, null),
  ('Été 2026', 'Pins bas', '6', 'enfants', 4, null),
  ('Été 2026', 'Pins bas', '7', 'employes', 4, null),
  ('Été 2026', 'Pins bas', '8', 'enfants', 9, null),
  ('Été 2026', 'Pins haut', '9', 'employes', 4, null),
  ('Été 2026', 'Pins haut', '10', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '11', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '12', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '13', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '14', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '15', 'enfants', 4, null),
  ('Été 2026', 'Pins haut', '16', 'employes', 4, null),
  ('Été 2026', 'Bout du bâtiment', '17', 'employes', 2, null),
  ('Été 2026', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('Été 2026', 'Vieille France bas', '1', 'employes', 3, null),
  ('Été 2026', 'Vieille France bas', '2', 'enfants', 4, null),
  ('Été 2026', 'Vieille France bas', '3', 'enfants', 4, null),
  ('Été 2026', 'Vieille France bas', '4', 'enfants', 4, null),
  ('Été 2026', 'Vieille France bas', '5', 'enfants', 4, null),
  ('Été 2026', 'Vieille France bas', '6', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '7', 'employes', 4, null),
  ('Été 2026', 'Vieille France haut', '8', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '9', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '10', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '11', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '12', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '13', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '14', 'enfants', 4, null),
  ('Été 2026', 'Vieille France haut', '15', 'employes', 4, null),
  ('Été 2026', 'Motel', '16', 'employes', 1, null),
  ('Été 2026', 'Motel', '17', 'employes', 4, null),
  ('Été 2026', 'Motel', '18', 'employes', 1, null),
  ('Été 2026', 'Motel', '19', 'employes', 2, null),
  ('Été 2026', 'Motel', '20', 'employes', 1, null),
  ('Été 2026', 'Motel', 'Appart', 'employes', 1, null),
  ('Été 2026', '55 TDL', '55 TDL', 'employes', 2, null),
  ('Été 2026', 'Motel', '20 3/4', 'vide', 0, 0),
  ('Été 2026', '100 TDL', '100 TDL', 'vide', 0, 0),
  ('Classe nature', 'Cèdres haut', '1', 'enfants', 4, null),
  ('Classe nature', 'Cèdres haut', '2', 'enfants', 6, null),
  ('Classe nature', 'Cèdres haut', '3', 'enfants', 6, null),
  ('Classe nature', 'Cèdres haut', '4', 'enfants', 6, null),
  ('Classe nature', 'Cèdres haut', '5', 'enfants', 4, null),
  ('Classe nature', 'Cèdres haut', '6', 'employes', 4, null),
  ('Classe nature', 'Cèdres haut', '7', 'enfants', 6, null),
  ('Classe nature', 'Cèdres bas', '8', 'employes', 4, null),
  ('Classe nature', 'Cèdres bas', '9', 'enfants', 6, null),
  ('Classe nature', 'Cèdres bas', '10', 'enfants', 6, null),
  ('Classe nature', 'Cèdres bas', '11', 'enfants', 8, null),
  ('Classe nature', 'Cèdres bas', '12', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '1', 'employes', 4, null),
  ('Classe nature', 'Pins bas', '2', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '3', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '4', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '5', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '6', 'enfants', 4, null),
  ('Classe nature', 'Pins bas', '8', 'enfants', 9, null),
  ('Classe nature', 'Pins haut', '9', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '10', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '11', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '12', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '13', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '14', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '15', 'enfants', 4, null),
  ('Classe nature', 'Pins haut', '16', 'enfants', 4, null),
  ('Classe nature', 'Bout du bâtiment', '17', 'employes', 2, null),
  ('Classe nature', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('Classe nature', 'Vieille France bas', '1', 'employes', 3, null),
  ('Classe nature', 'Vieille France bas', '2', 'enfants', 4, null),
  ('Classe nature', 'Vieille France bas', '3', 'enfants', 4, null),
  ('Classe nature', 'Vieille France bas', '4', 'enfants', 4, null),
  ('Classe nature', 'Vieille France bas', '5', 'enfants', 4, null),
  ('Classe nature', 'Vieille France bas', '6', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '8', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '9', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '10', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '11', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '12', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '13', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '14', 'enfants', 4, null),
  ('Classe nature', 'Vieille France haut', '15', 'enfants', 4, null),
  ('Classe nature', 'Motel', '16', 'employes', 3, null),
  ('Classe nature', 'Motel', '17', 'employes', 1, null),
  ('Classe nature', 'Motel', '18', 'employes', 3, null),
  ('Classe nature', 'Motel', '19', 'employes', 4, 6),
  ('Classe nature', 'Motel', '20', 'employes', 4, null),
  ('Classe nature', 'Motel', 'Appart', 'employes', 2, 2),
  ('Classe nature', '55 TDL', '55 TDL', 'vide', 0, 0),
  ('Classe nature', 'Motel', '20 3/4', 'vide', 0, 0),
  ('Classe nature', '100 TDL', '100 TDL', 'vide', 0, 0),
  ('2025 – Pré-camp', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Pré-camp', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Pré-camp', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Pré-camp', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Pré-camp', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Pré-camp', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Pré-camp', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Pré-camp', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Pré-camp', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Pré-camp', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Pré-camp', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Pré-camp', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Pré-camp', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Pré-camp', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Pré-camp', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Pré-camp', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Pré-camp', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Pré-camp', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Pré-camp', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Pré-camp', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Pré-camp', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Pré-camp', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Pré-camp', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Pré-camp', 'Motel', '16', 'employes', 4, null),
  ('2025 – Pré-camp', 'Motel', '17', 'employes', 4, null),
  ('2025 – Pré-camp', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Pré-camp', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Pré-camp', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Pré-camp', 'Motel', 'Appart', 'employes', 2, null),
  ('2025 – Pré-camp', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Pré-camp', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'employes', 5, null),
  ('2025 – Classes nature', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Classes nature', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Classes nature', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Classes nature', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Classes nature', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Classes nature', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Classes nature', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Classes nature', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Classes nature', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Classes nature', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Classes nature', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Classes nature', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Classes nature', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Classes nature', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Classes nature', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Classes nature', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Classes nature', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Classes nature', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Classes nature', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Classes nature', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Classes nature', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Classes nature', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Classes nature', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Classes nature', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Classes nature', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Classes nature', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Classes nature', 'Motel', '16', 'employes', 4, null),
  ('2025 – Classes nature', 'Motel', '17', 'employes', 4, null),
  ('2025 – Classes nature', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Classes nature', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Classes nature', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Classes nature', 'Motel', 'Appart', 'employes', 2, null),
  ('2025 – Classes nature', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Classes nature', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Classes nature', '100 TDL', '100 TDL', 'employes', 3, null),
  ('2025 – Scénario 1', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Scénario 1', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Scénario 1', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Scénario 1', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Scénario 1', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Scénario 1', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Scénario 1', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Scénario 1', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Scénario 1', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Scénario 1', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Scénario 1', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Scénario 1', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Scénario 1', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Scénario 1', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Scénario 1', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Scénario 1', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Scénario 1', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Scénario 1', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Scénario 1', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Scénario 1', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Scénario 1', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Scénario 1', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Scénario 1', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Scénario 1', 'Motel', '16', 'employes', 4, null),
  ('2025 – Scénario 1', 'Motel', '17', 'employes', 4, null),
  ('2025 – Scénario 1', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Scénario 1', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Scénario 1', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Scénario 1', 'Motel', 'Appart', 'employes', 2, null),
  ('2025 – Scénario 1', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Scénario 1', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 1', '100 TDL', '100 TDL', 'employes', 4, null),
  ('2025 – Scénario 2', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Scénario 2', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Scénario 2', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Scénario 2', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Scénario 2', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Scénario 2', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Scénario 2', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Scénario 2', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Scénario 2', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Scénario 2', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Scénario 2', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Scénario 2', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Scénario 2', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Scénario 2', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Scénario 2', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Scénario 2', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Scénario 2', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Scénario 2', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Scénario 2', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Scénario 2', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Scénario 2', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Scénario 2', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Scénario 2', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Scénario 2', 'Motel', '16', 'employes', 4, null),
  ('2025 – Scénario 2', 'Motel', '17', 'employes', 4, null),
  ('2025 – Scénario 2', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Scénario 2', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Scénario 2', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Scénario 2', 'Motel', 'Appart', 'employes', 2, null),
  ('2025 – Scénario 2', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Scénario 2', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 2', '100 TDL', '100 TDL', 'employes', 3, null),
  ('2025 – Scénario 3', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Scénario 3', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Scénario 3', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Scénario 3', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Scénario 3', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Scénario 3', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Scénario 3', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Scénario 3', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Scénario 3', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Scénario 3', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Scénario 3', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Scénario 3', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Scénario 3', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Scénario 3', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Scénario 3', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Scénario 3', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Scénario 3', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Scénario 3', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Scénario 3', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Scénario 3', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Scénario 3', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Scénario 3', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Scénario 3', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Scénario 3', 'Motel', '16', 'employes', 4, null),
  ('2025 – Scénario 3', 'Motel', '17', 'employes', 4, null),
  ('2025 – Scénario 3', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Scénario 3', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Scénario 3', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Scénario 3', 'Motel', 'Appart', 'employes', 2, null),
  ('2025 – Scénario 3', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Scénario 3', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'employes', 5, null),
  ('2025 – Scénario 4', 'Cèdres haut', '1', 'employes', 4, null),
  ('2025 – Scénario 4', 'Cèdres haut', '2', 'enfants', 6, null),
  ('2025 – Scénario 4', 'Cèdres haut', '3', 'enfants', 6, null),
  ('2025 – Scénario 4', 'Cèdres haut', '4', 'enfants', 6, null),
  ('2025 – Scénario 4', 'Cèdres haut', '5', 'employes', 4, null),
  ('2025 – Scénario 4', 'Cèdres haut', '6', 'employes', 4, null),
  ('2025 – Scénario 4', 'Cèdres haut', '7', 'enfants', 6, null),
  ('2025 – Scénario 4', 'Cèdres bas', '8', 'employes', 4, null),
  ('2025 – Scénario 4', 'Cèdres bas', '9', 'employes', 6, null),
  ('2025 – Scénario 4', 'Cèdres bas', '10', 'enfants', 6, null),
  ('2025 – Scénario 4', 'Cèdres bas', '11', 'enfants', 8, null),
  ('2025 – Scénario 4', 'Cèdres bas', '12', 'employes', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '1', 'employes', 3, null),
  ('2025 – Scénario 4', 'Pins bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins bas', '7', 'employes', 3, null),
  ('2025 – Scénario 4', 'Pins bas', '8', 'enfants', 9, null),
  ('2025 – Scénario 4', 'Pins haut', '9', 'employes', 3, null),
  ('2025 – Scénario 4', 'Pins haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Pins haut', '15', 'employes', 3, null),
  ('2025 – Scénario 4', 'Pins haut', '16', 'employes', 3, null),
  ('2025 – Scénario 4', 'Bout du bâtiment', '17', 'employes', 1, null),
  ('2025 – Scénario 4', 'Bout du bâtiment', '18', 'employes', 8, null),
  ('2025 – Scénario 4', 'Vieille France bas', '1', 'employes', 2, null),
  ('2025 – Scénario 4', 'Vieille France bas', '2', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France bas', '3', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France bas', '4', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France bas', '5', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France bas', '6', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '7', 'employes', 3, null),
  ('2025 – Scénario 4', 'Vieille France haut', '8', 'employes', 3, null),
  ('2025 – Scénario 4', 'Vieille France haut', '9', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '10', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '11', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '12', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '13', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '14', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Vieille France haut', '15', 'enfants', 4, null),
  ('2025 – Scénario 4', 'Motel', '16', 'employes', 4, null),
  ('2025 – Scénario 4', 'Motel', '17', 'employes', 4, null),
  ('2025 – Scénario 4', 'Motel', '18', 'employes', 5, 5),
  ('2025 – Scénario 4', 'Motel', '19', 'employes', 2, 6),
  ('2025 – Scénario 4', 'Motel', '20', 'employes', 1, 1),
  ('2025 – Scénario 4', 'Motel', 'Appart', 'employes', 3, null),
  ('2025 – Scénario 4', '55 TDL', '55 TDL', 'employes', 1, null),
  ('2025 – Scénario 4', 'Motel', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'employes', 5, null)
) as o(plan, section, numero, type, nombre, lits)
join rooming.plans p on p.nom = o.plan
join rooming.sections s on s.nom = o.section
join rooming.chambres c on c.section_id = s.id and c.numero = o.numero;

-- Un nom qui est le surnom d'un employé actif est lié à sa fiche ; les
-- autres (direction, invités…) restent des noms libres.
insert into rooming.personnes (plan_id, chambre_id, employe_id, nom)
select p.id, c.id, e.id, case when e.id is null then n.nom end from (values
  ('Été 2026', 'Motel', '16', 'Vickie'),
  ('Été 2026', 'Motel', '17', 'Galaxie'),
  ('Été 2026', 'Motel', '17', 'Spag'),
  ('Été 2026', 'Motel', '17', 'Fiji'),
  ('Été 2026', 'Motel', '17', 'Sriracha'),
  ('Été 2026', 'Motel', '18', 'Younes'),
  ('Été 2026', 'Motel', '19', 'Sylvie'),
  ('Été 2026', 'Motel', '19', 'Maxime'),
  ('Été 2026', 'Motel', 'Appart', 'Charlotte'),
  ('Été 2026', '55 TDL', '55 TDL', 'Marco'),
  ('Été 2026', '55 TDL', '55 TDL', 'Vincent'),
  ('2025 – Pré-camp', 'Motel', '16', 'Cliff'),
  ('2025 – Pré-camp', 'Motel', '16', 'Whippet'),
  ('2025 – Pré-camp', 'Motel', '16', 'Maxime'),
  ('2025 – Pré-camp', 'Motel', '17', 'Link'),
  ('2025 – Pré-camp', 'Motel', '17', 'Galaxie'),
  ('2025 – Pré-camp', 'Motel', '17', 'Samya'),
  ('2025 – Pré-camp', 'Motel', '18', 'Rémi'),
  ('2025 – Pré-camp', 'Motel', '19', 'Sylvie'),
  ('2025 – Pré-camp', 'Motel', '19', 'Papachat'),
  ('2025 – Pré-camp', 'Motel', '20', 'Steve'),
  ('2025 – Pré-camp', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'Isabel'),
  ('2025 – Pré-camp', '100 TDL', '100 TDL', 'Audrey'),
  ('2025 – Classes nature', 'Motel', '18', 'Rémi'),
  ('2025 – Classes nature', 'Motel', '19', 'Sylvie'),
  ('2025 – Classes nature', 'Motel', '19', 'Papachat'),
  ('2025 – Classes nature', 'Motel', '20', 'Steve'),
  ('2025 – Classes nature', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Classes nature', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Classes nature', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Classes nature', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Scénario 1', 'Motel', '16', 'Fiji'),
  ('2025 – Scénario 1', 'Motel', '16', 'Loukia'),
  ('2025 – Scénario 1', 'Motel', '17', 'Cliff'),
  ('2025 – Scénario 1', 'Motel', '17', 'Whippet'),
  ('2025 – Scénario 1', 'Motel', '17', 'Glitch'),
  ('2025 – Scénario 1', 'Motel', '18', 'Link'),
  ('2025 – Scénario 1', 'Motel', '18', 'Galaxie'),
  ('2025 – Scénario 1', 'Motel', '19', 'Sylvie'),
  ('2025 – Scénario 1', 'Motel', '19', 'Papachat'),
  ('2025 – Scénario 1', 'Motel', '20', 'Steve / Chef'),
  ('2025 – Scénario 1', 'Motel', 'Appart', 'Audrey'),
  ('2025 – Scénario 1', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Scénario 1', 'Motel', '20 3/4', 'Gecko'),
  ('2025 – Scénario 1', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 1', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Scénario 1', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Scénario 1', '100 TDL', '100 TDL', 'Isabel'),
  ('2025 – Scénario 2', 'Motel', '16', 'Fiji'),
  ('2025 – Scénario 2', 'Motel', '16', 'Loukia'),
  ('2025 – Scénario 2', 'Motel', '17', 'Cliff'),
  ('2025 – Scénario 2', 'Motel', '17', 'Whippet'),
  ('2025 – Scénario 2', 'Motel', '17', 'Glitch'),
  ('2025 – Scénario 2', 'Motel', '18', 'Link'),
  ('2025 – Scénario 2', 'Motel', '18', 'Galaxie'),
  ('2025 – Scénario 2', 'Motel', '19', 'Sylvie'),
  ('2025 – Scénario 2', 'Motel', '19', 'Papachat'),
  ('2025 – Scénario 2', 'Motel', '20', 'Isabel'),
  ('2025 – Scénario 2', 'Motel', 'Appart', 'Audrey'),
  ('2025 – Scénario 2', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Scénario 2', 'Motel', '20 3/4', 'Gecko'),
  ('2025 – Scénario 2', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 2', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Scénario 2', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Scénario 3', 'Motel', '16', 'Link'),
  ('2025 – Scénario 3', 'Motel', '16', 'Galaxie'),
  ('2025 – Scénario 3', 'Motel', '17', 'Cliff'),
  ('2025 – Scénario 3', 'Motel', '17', 'Whippet'),
  ('2025 – Scénario 3', 'Motel', '17', 'Glitch'),
  ('2025 – Scénario 3', 'Motel', '18', 'Rémi'),
  ('2025 – Scénario 3', 'Motel', '19', 'Sylvie'),
  ('2025 – Scénario 3', 'Motel', '19', 'Papachat'),
  ('2025 – Scénario 3', 'Motel', '20', 'Steve'),
  ('2025 – Scénario 3', 'Motel', 'Appart', 'Fiji'),
  ('2025 – Scénario 3', 'Motel', 'Appart', 'Loukia'),
  ('2025 – Scénario 3', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Scénario 3', 'Motel', '20 3/4', 'Gecko'),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'Isabel'),
  ('2025 – Scénario 3', '100 TDL', '100 TDL', 'Audrey'),
  ('2025 – Scénario 4', 'Motel', '16', 'Link'),
  ('2025 – Scénario 4', 'Motel', '16', 'Galaxie'),
  ('2025 – Scénario 4', 'Motel', '17', 'Cliff'),
  ('2025 – Scénario 4', 'Motel', '17', 'Whippet'),
  ('2025 – Scénario 4', 'Motel', '17', 'Glitch'),
  ('2025 – Scénario 4', 'Motel', '18', 'Rémi'),
  ('2025 – Scénario 4', 'Motel', '19', 'Sylvie'),
  ('2025 – Scénario 4', 'Motel', '19', 'Papachat'),
  ('2025 – Scénario 4', 'Motel', '20', 'Steve'),
  ('2025 – Scénario 4', 'Motel', 'Appart', 'Fiji'),
  ('2025 – Scénario 4', 'Motel', 'Appart', 'Sriracha'),
  ('2025 – Scénario 4', 'Motel', 'Appart', 'Gecko'),
  ('2025 – Scénario 4', '55 TDL', '55 TDL', 'Marco'),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'Amélie'),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'Vickie'),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'Isabel'),
  ('2025 – Scénario 4', '100 TDL', '100 TDL', 'Audrey')
) as n(plan, section, numero, nom)
join rooming.plans p on p.nom = n.plan
join rooming.sections s on s.nom = n.section
join rooming.chambres c on c.section_id = s.id and c.numero = n.numero
left join lateral (
  select e.id from core.employes e where e.actif and lower(e.surnom) = lower(n.nom) limit 1
) e on true;
