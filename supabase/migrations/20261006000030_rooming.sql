-- ============================================================
-- rooming : les bâtiments, leurs lits et qui dort où.
--
-- Référence : [site] > bâtiment > [section] > [étage] > chambre, avec
-- les lits d'aujourd'hui (la réalité, sans personne). Plans = scénarios nommés
-- sans dates (Été 2026, Classe nature…), un seul « en vigueur ». Un plan
-- prend une PHOTO de la référence à sa création (ses chambres et leurs
-- lits) : changer la référence ensuite ne le touche pas. Dans un plan,
-- une chambre a un type (enfants / employés / vide) et un nombre. Des
-- employés clés peuvent être nommés dans une chambre d'employés : ils
-- comptent dans le nombre. On ne dépasse jamais les lits du plan.
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
-- Référence : un arbre de lieux, puis les chambres.
--   site (ex. le Camp, qui regroupe des bâtiments ; facultatif)
--   > bâtiment (Pavillon principal, Vieille-France, 55 TDL…)
--   > section (Cèdres, Pins, Motel… ; facultative)
--   > étage (Cèdres Haut… ; facultatif)
-- Une chambre est rattachée à un bâtiment, une section ou un étage.
-- Retirer un lieu (rooming.retirer_lieu) : s'il sert dans un plan, il est
-- seulement retiré de la référence (actif = false, lui, ce qu'il contient
-- et ses chambres) et les anciens plans le gardent ; sinon il est effacé.
-- ------------------------------------------------------------
create table rooming.lieux (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references rooming.lieux(id) on delete restrict,
  niveau text not null check (niveau in ('site','batiment','section','etage')),
  nom text not null check (btrim(nom) <> ''),
  -- Abréviation affichée devant le numéro de chambre (CH, VFB…).
  code text check (code is null or btrim(code) <> ''),
  -- Retiré de la référence (ex. un chalet loué quelques étés) : les
  -- nouveaux plans ne l'ont plus, les anciens le gardent.
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (parent_id, nom)
);

create table rooming.chambres (
  id uuid primary key default gen_random_uuid(),
  lieu_id uuid not null references rooming.lieux(id) on delete restrict,
  numero text not null check (btrim(numero) <> ''),
  -- Lits d'aujourd'hui (référence). Les plans en gardent leur propre copie.
  lits integer not null default 0 check (lits between 0 and 50),
  -- Retirée de la référence : les nouveaux plans ne l'ont plus, les
  -- anciens la gardent.
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lieu_id, numero)
);

create index idx_lieux_parent on rooming.lieux(parent_id);
create index idx_chambres_lieu on rooming.chambres(lieu_id);

-- Un site est en haut ; un bâtiment est en haut ou dans un site ; une
-- section dans un bâtiment ; un étage dans une section. Une chambre n'est
-- jamais directement dans un site.
create function rooming.verifier_lieu()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent text;
begin
  select niveau into v_parent from rooming.lieux where id = new.parent_id;
  if not (
    (new.niveau = 'site' and v_parent is null)
    or (new.niveau = 'batiment' and (v_parent is null or v_parent = 'site'))
    or (new.niveau = 'section' and v_parent = 'batiment')
    or (new.niveau = 'etage' and v_parent = 'section')
  ) then
    raise exception 'Un lieu de niveau « % » ne peut pas être placé là.', new.niveau using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.niveau <> old.niveau then
    raise exception 'Le niveau d''un lieu ne change pas.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lieux_verifier before insert or update of parent_id, niveau on rooming.lieux
for each row execute function rooming.verifier_lieu();

create function rooming.verifier_chambre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select niveau from rooming.lieux where id = new.lieu_id) = 'site' then
    raise exception 'Une chambre va dans un bâtiment, une section ou un étage, pas directement dans un site.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_chambres_verifier before insert or update of lieu_id on rooming.chambres
for each row execute function rooming.verifier_chambre();

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

-- Les chambres d'un plan et leurs lits, copiés de la référence à la
-- création du plan (une ligne par chambre ; sans ligne, la chambre ne
-- fait pas partie du plan).
create table rooming.occupations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references rooming.plans(id) on delete cascade,
  chambre_id uuid not null references rooming.chambres(id) on delete restrict,
  type text not null default 'vide' check (type in ('enfants','employes','vide')),
  nombre integer not null default 0 check (nombre >= 0),
  -- Lits de la chambre dans ce plan (0 = fermée).
  lits integer not null check (lits between 0 and 50),
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

create trigger trg_lieux_updated_at before update on rooming.lieux
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
-- « CH 2 », « Motel 16 », « Appart » : abréviation (sinon nom) du lieu
-- de la chambre, puis son numéro, sauf si c'est le même mot.
create function rooming.nom_chambre(p_chambre uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when c.numero in (l.nom, coalesce(l.code, '')) then c.numero else coalesce(l.code, l.nom) || ' ' || c.numero end
  from rooming.chambres c join rooming.lieux l on l.id = c.lieu_id
  where c.id = p_chambre
$$;

create function rooming.verifier_occupation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_noms integer;
begin
  if new.nombre > new.lits then
    raise exception 'La chambre % n''a que % lit(s) dans ce plan.', rooming.nom_chambre(new.chambre_id), new.lits
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
    raise exception 'La chambre % ne fait pas partie de ce plan.', rooming.nom_chambre(p_chambre) using errcode = 'check_violation';
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

-- Les lieux de la référence d'aujourd'hui : actifs, et tous leurs
-- parents aussi.
create function rooming.lieux_actifs()
returns table (id uuid)
language sql
stable
set search_path = ''
as $$
  with recursive actifs as (
    select id from rooming.lieux where parent_id is null and actif
    union all
    select l.id from rooming.lieux l join actifs a on l.parent_id = a.id where l.actif
  )
  select id from actifs
$$;

-- Retire un lieu de la référence. S'il sert dans un plan : le lieu, ce
-- qu'il contient et ses chambres passent à actif = false (les anciens
-- plans les gardent) et on renvoie 'retire'. Sinon tout est effacé
-- (chambres, puis lieux du plus profond au plus haut) : 'efface'.
create function rooming.retirer_lieu(p_lieu uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  with recursive arbre as (
    select id, 0 as profondeur from rooming.lieux where id = p_lieu
    union all
    select l.id, a.profondeur + 1 from rooming.lieux l join arbre a on l.parent_id = a.id
  )
  select array_agg(id order by profondeur desc) into v_ids from arbre;
  if v_ids is null then
    return null;
  end if;
  if exists (
    select 1 from rooming.occupations o join rooming.chambres c on c.id = o.chambre_id where c.lieu_id = any (v_ids)
  ) then
    update rooming.lieux set actif = false where id = any (v_ids);
    update rooming.chambres set actif = false where lieu_id = any (v_ids);
    return 'retire';
  end if;
  delete from rooming.chambres where lieu_id = any (v_ids);
  foreach v_id in array v_ids loop
    delete from rooming.lieux where id = v_id;
  end loop;
  return 'efface';
end;
$$;

-- Remet un lieu dans la référence, avec ce qu'il contient et ses chambres,
-- et ses parents s'ils avaient été retirés.
create function rooming.remettre_lieu(p_lieu uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with recursive arbre as (
    select id from rooming.lieux where id = p_lieu
    union all
    select l.id from rooming.lieux l join arbre a on l.parent_id = a.id
  ), parents as (
    select parent_id as id from rooming.lieux where id = p_lieu
    union all
    select l.parent_id from rooming.lieux l join parents p on l.id = p.id where l.parent_id is not null
  )
  update rooming.lieux set actif = true
  where id in (select id from arbre) or id in (select id from parents);
  update rooming.chambres set actif = true
  where lieu_id in (
    with recursive arbre as (
      select id from rooming.lieux where id = p_lieu
      union all
      select l.id from rooming.lieux l join arbre a on l.parent_id = a.id
    )
    select id from arbre
  );
end;
$$;

-- Nouveau plan : photo de la référence d'aujourd'hui (chambres actives
-- et leurs lits), sans personne ; renvoie le nouveau.
create function rooming.creer_plan(p_nom text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into rooming.plans (nom) values (btrim(p_nom)) returning id into v_id;
  insert into rooming.occupations (plan_id, chambre_id, type, nombre, lits)
  select v_id, c.id, 'vide', 0, c.lits
  from rooming.chambres c
  where c.actif and c.lieu_id in (select id from rooming.lieux_actifs());
  return v_id;
end;
$$;

-- Copie un plan (ses chambres, ses lits, ses chiffres et ses noms) ;
-- renvoie le nouveau.
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

alter table rooming.lieux enable row level security;
alter table rooming.chambres enable row level security;
alter table rooming.plans enable row level security;
alter table rooming.occupations enable row level security;
alter table rooming.personnes enable row level security;

create policy "Lire lieux" on rooming.lieux for select to authenticated using (core.peut_lire('rooming'));
create policy "Écrire lieux" on rooming.lieux for all to authenticated
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
  rooming.lieux, rooming.chambres,
  rooming.plans, rooming.occupations, rooming.personnes;

-- ============================================================
-- Import du Google Sheets « Plan de rooming » (2026-10-06)
-- ============================================================

insert into rooming.lieux (parent_id, niveau, nom, code, ordre)
select pa.id, l.niveau, l.nom, l.code, l.ordre from (values
  ('Camp', 'site', null, null, null, 1)
) as l(nom, niveau, code, parent_nom, parent_niveau, ordre)
left join rooming.lieux pa on pa.nom = l.parent_nom and pa.niveau = l.parent_niveau;

insert into rooming.lieux (parent_id, niveau, nom, code, ordre)
select pa.id, l.niveau, l.nom, l.code, l.ordre from (values
  ('Pavillon principal', 'batiment', null, 'Camp', 'site', 1),
  ('Vieille-France', 'batiment', null, 'Camp', 'site', 2),
  ('55 chemin du Tour du Lac', 'batiment', '55 TDL', null, null, 2),
  ('100 chemin du Tour du Lac', 'batiment', '100 TDL', null, null, 3)
) as l(nom, niveau, code, parent_nom, parent_niveau, ordre)
left join rooming.lieux pa on pa.nom = l.parent_nom and pa.niveau = l.parent_niveau;

insert into rooming.lieux (parent_id, niveau, nom, code, ordre)
select pa.id, l.niveau, l.nom, l.code, l.ordre from (values
  ('Cèdres', 'section', null, 'Pavillon principal', 'batiment', 1),
  ('Pins', 'section', null, 'Pavillon principal', 'batiment', 2),
  ('Vieille-France', 'section', null, 'Vieille-France', 'batiment', 1),
  ('Motel', 'section', null, 'Vieille-France', 'batiment', 2),
  ('Appart', 'section', null, 'Vieille-France', 'batiment', 3)
) as l(nom, niveau, code, parent_nom, parent_niveau, ordre)
left join rooming.lieux pa on pa.nom = l.parent_nom and pa.niveau = l.parent_niveau;

insert into rooming.lieux (parent_id, niveau, nom, code, ordre)
select pa.id, l.niveau, l.nom, l.code, l.ordre from (values
  ('Cèdres Haut', 'etage', 'CH', 'Cèdres', 'section', 1),
  ('Cèdres Bas', 'etage', 'CB', 'Cèdres', 'section', 2),
  ('Pins Bas', 'etage', 'PB', 'Pins', 'section', 1),
  ('Pins Haut', 'etage', 'PH', 'Pins', 'section', 2),
  ('Bout du bâtiment', 'etage', null, 'Pins', 'section', 3),
  ('Vieille-France Bas', 'etage', 'VFB', 'Vieille-France', 'section', 1),
  ('Vieille-France Haut', 'etage', 'VFH', 'Vieille-France', 'section', 2)
) as l(nom, niveau, code, parent_nom, parent_niveau, ordre)
left join rooming.lieux pa on pa.nom = l.parent_nom and pa.niveau = l.parent_niveau;

-- Référence = l'onglet 2026 ; « 20 3/4 » et le chalet du 100 TDL (loué
-- quelques étés, 2025 seulement) sont retirés.
insert into rooming.chambres (lieu_id, numero, lits, ordre, actif)
select l.id, c.numero, c.lits, c.ordre, c.actif from (values
  ('Cèdres Haut', 'etage', '1', 4, 1, true),
  ('Cèdres Haut', 'etage', '2', 6, 2, true),
  ('Cèdres Haut', 'etage', '3', 6, 3, true),
  ('Cèdres Haut', 'etage', '4', 6, 4, true),
  ('Cèdres Haut', 'etage', '5', 4, 5, true),
  ('Cèdres Haut', 'etage', '6', 4, 6, true),
  ('Cèdres Haut', 'etage', '7', 6, 7, true),
  ('Cèdres Bas', 'etage', '8', 4, 1, true),
  ('Cèdres Bas', 'etage', '9', 6, 2, true),
  ('Cèdres Bas', 'etage', '10', 6, 3, true),
  ('Cèdres Bas', 'etage', '11', 8, 4, true),
  ('Cèdres Bas', 'etage', '12', 4, 5, true),
  ('Pins Bas', 'etage', '1', 4, 1, true),
  ('Pins Bas', 'etage', '2', 4, 2, true),
  ('Pins Bas', 'etage', '3', 4, 3, true),
  ('Pins Bas', 'etage', '4', 4, 4, true),
  ('Pins Bas', 'etage', '5', 4, 5, true),
  ('Pins Bas', 'etage', '6', 4, 6, true),
  ('Pins Bas', 'etage', '7', 4, 7, true),
  ('Pins Bas', 'etage', '8', 9, 8, true),
  ('Pins Haut', 'etage', '9', 4, 1, true),
  ('Pins Haut', 'etage', '10', 4, 2, true),
  ('Pins Haut', 'etage', '11', 4, 3, true),
  ('Pins Haut', 'etage', '12', 4, 4, true),
  ('Pins Haut', 'etage', '13', 4, 5, true),
  ('Pins Haut', 'etage', '14', 4, 6, true),
  ('Pins Haut', 'etage', '15', 4, 7, true),
  ('Pins Haut', 'etage', '16', 4, 8, true),
  ('Bout du bâtiment', 'etage', '17', 2, 1, true),
  ('Bout du bâtiment', 'etage', '18', 8, 2, true),
  ('Vieille-France Bas', 'etage', '1', 3, 1, true),
  ('Vieille-France Bas', 'etage', '2', 4, 2, true),
  ('Vieille-France Bas', 'etage', '3', 4, 3, true),
  ('Vieille-France Bas', 'etage', '4', 4, 4, true),
  ('Vieille-France Bas', 'etage', '5', 4, 5, true),
  ('Vieille-France Bas', 'etage', '6', 4, 6, true),
  ('Vieille-France Haut', 'etage', '7', 4, 1, true),
  ('Vieille-France Haut', 'etage', '8', 4, 2, true),
  ('Vieille-France Haut', 'etage', '9', 4, 3, true),
  ('Vieille-France Haut', 'etage', '10', 4, 4, true),
  ('Vieille-France Haut', 'etage', '11', 4, 5, true),
  ('Vieille-France Haut', 'etage', '12', 4, 6, true),
  ('Vieille-France Haut', 'etage', '13', 4, 7, true),
  ('Vieille-France Haut', 'etage', '14', 4, 8, true),
  ('Vieille-France Haut', 'etage', '15', 4, 9, true),
  ('Motel', 'section', '16', 4, 1, true),
  ('Motel', 'section', '17', 6, 2, true),
  ('Motel', 'section', '18', 4, 3, true),
  ('Motel', 'section', '19', 3, 4, true),
  ('Motel', 'section', '20', 6, 5, true),
  ('Motel', 'section', '20 3/4', 2, 6, false),
  ('Appart', 'section', 'Appart', 3, 1, true),
  ('55 chemin du Tour du Lac', 'batiment', '55 TDL', 3, 1, true),
  ('100 chemin du Tour du Lac', 'batiment', '100 TDL', 5, 1, false)
) as c(lieu, niveau, numero, lits, ordre, actif) join rooming.lieux l on l.nom = c.lieu and l.niveau = c.niveau;

insert into rooming.plans (nom, en_vigueur, archive) values
  ('Été 2026', true, false),
  ('Classe nature', false, false),
  ('2025 – Pré-camp', false, true),
  ('2025 – Classes nature', false, true),
  ('2025 – Scénario 1', false, true),
  ('2025 – Scénario 2', false, true),
  ('2025 – Scénario 3', false, true),
  ('2025 – Scénario 4', false, true);

update rooming.lieux set actif = false where nom = '100 chemin du Tour du Lac';

-- Chaque plan : ses chambres (celles de son onglet) et leurs lits.
insert into rooming.occupations (plan_id, chambre_id, type, nombre, lits)
select p.id, c.id, o.type, o.nombre, o.lits from (values
  ('Été 2026', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('Été 2026', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('Été 2026', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('Été 2026', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('Été 2026', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('Été 2026', 'Cèdres Haut', 'etage', '6', 'enfants', 4, 4),
  ('Été 2026', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('Été 2026', 'Cèdres Bas', 'etage', '8', 'enfants', 4, 4),
  ('Été 2026', 'Cèdres Bas', 'etage', '9', 'enfants', 6, 6),
  ('Été 2026', 'Cèdres Bas', 'etage', '10', 'employes', 6, 6),
  ('Été 2026', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('Été 2026', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '1', 'employes', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '7', 'employes', 4, 4),
  ('Été 2026', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('Été 2026', 'Pins Haut', 'etage', '9', 'employes', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '15', 'enfants', 4, 4),
  ('Été 2026', 'Pins Haut', 'etage', '16', 'employes', 4, 4),
  ('Été 2026', 'Bout du bâtiment', 'etage', '17', 'employes', 2, 2),
  ('Été 2026', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('Été 2026', 'Vieille-France Bas', 'etage', '1', 'employes', 3, 3),
  ('Été 2026', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '7', 'employes', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '8', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('Été 2026', 'Vieille-France Haut', 'etage', '15', 'employes', 4, 4),
  ('Été 2026', 'Motel', 'section', '16', 'employes', 1, 4),
  ('Été 2026', 'Motel', 'section', '17', 'employes', 4, 6),
  ('Été 2026', 'Motel', 'section', '18', 'employes', 1, 4),
  ('Été 2026', 'Motel', 'section', '19', 'employes', 2, 3),
  ('Été 2026', 'Motel', 'section', '20', 'employes', 1, 6),
  ('Été 2026', 'Appart', 'section', 'Appart', 'employes', 1, 3),
  ('Été 2026', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 2, 3),
  ('Classe nature', 'Cèdres Haut', 'etage', '1', 'enfants', 4, 4),
  ('Classe nature', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Haut', 'etage', '5', 'enfants', 4, 4),
  ('Classe nature', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('Classe nature', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('Classe nature', 'Cèdres Bas', 'etage', '9', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('Classe nature', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('Classe nature', 'Cèdres Bas', 'etage', '12', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '1', 'employes', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('Classe nature', 'Pins Bas', 'etage', '7', 'vide', 0, 4),
  ('Classe nature', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('Classe nature', 'Pins Haut', 'etage', '9', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '15', 'enfants', 4, 4),
  ('Classe nature', 'Pins Haut', 'etage', '16', 'enfants', 4, 4),
  ('Classe nature', 'Bout du bâtiment', 'etage', '17', 'employes', 2, 2),
  ('Classe nature', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('Classe nature', 'Vieille-France Bas', 'etage', '1', 'employes', 3, 3),
  ('Classe nature', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '7', 'vide', 0, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '8', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('Classe nature', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('Classe nature', 'Motel', 'section', '16', 'employes', 3, 4),
  ('Classe nature', 'Motel', 'section', '17', 'employes', 1, 6),
  ('Classe nature', 'Motel', 'section', '18', 'employes', 3, 4),
  ('Classe nature', 'Motel', 'section', '19', 'employes', 4, 6),
  ('Classe nature', 'Motel', 'section', '20', 'employes', 4, 6),
  ('Classe nature', 'Appart', 'section', 'Appart', 'employes', 2, 2),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Pré-camp', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Pré-camp', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Pré-camp', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Pré-camp', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Pré-camp', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Pré-camp', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Pré-camp', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Pré-camp', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Pré-camp', 'Appart', 'section', 'Appart', 'employes', 2, 3),
  ('2025 – Pré-camp', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Pré-camp', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 5, 5),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Classes nature', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Classes nature', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Classes nature', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Classes nature', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Classes nature', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Classes nature', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Classes nature', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Classes nature', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Classes nature', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Classes nature', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Classes nature', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Classes nature', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Classes nature', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Classes nature', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Classes nature', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Classes nature', 'Appart', 'section', 'Appart', 'employes', 2, 3),
  ('2025 – Classes nature', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Classes nature', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Classes nature', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 3, 5),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Scénario 1', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Scénario 1', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Scénario 1', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Scénario 1', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Scénario 1', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Scénario 1', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Scénario 1', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Scénario 1', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Scénario 1', 'Appart', 'section', 'Appart', 'employes', 2, 3),
  ('2025 – Scénario 1', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Scénario 1', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 1', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 4, 5),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Scénario 2', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Scénario 2', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Scénario 2', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Scénario 2', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Scénario 2', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Scénario 2', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Scénario 2', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Scénario 2', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Scénario 2', 'Appart', 'section', 'Appart', 'employes', 2, 3),
  ('2025 – Scénario 2', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Scénario 2', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 2', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 3, 5),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Scénario 3', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Scénario 3', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Scénario 3', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Scénario 3', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Scénario 3', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Scénario 3', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Scénario 3', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Scénario 3', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Scénario 3', 'Appart', 'section', 'Appart', 'employes', 2, 3),
  ('2025 – Scénario 3', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Scénario 3', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 5, 5),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '1', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '2', 'enfants', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '3', 'enfants', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '4', 'enfants', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '5', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '6', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Cèdres Haut', 'etage', '7', 'enfants', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Bas', 'etage', '8', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Cèdres Bas', 'etage', '9', 'employes', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Bas', 'etage', '10', 'enfants', 6, 6),
  ('2025 – Scénario 4', 'Cèdres Bas', 'etage', '11', 'enfants', 8, 8),
  ('2025 – Scénario 4', 'Cèdres Bas', 'etage', '12', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '1', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Pins Bas', 'etage', '8', 'enfants', 9, 9),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '9', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '15', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Pins Haut', 'etage', '16', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Bout du bâtiment', 'etage', '17', 'employes', 1, 2),
  ('2025 – Scénario 4', 'Bout du bâtiment', 'etage', '18', 'employes', 8, 8),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '1', 'employes', 2, 3),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '2', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '3', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '4', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '5', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Bas', 'etage', '6', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '7', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '8', 'employes', 3, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '9', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '10', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '11', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '12', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '13', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '14', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Vieille-France Haut', 'etage', '15', 'enfants', 4, 4),
  ('2025 – Scénario 4', 'Motel', 'section', '16', 'employes', 4, 4),
  ('2025 – Scénario 4', 'Motel', 'section', '17', 'employes', 4, 6),
  ('2025 – Scénario 4', 'Motel', 'section', '18', 'employes', 5, 5),
  ('2025 – Scénario 4', 'Motel', 'section', '19', 'employes', 2, 6),
  ('2025 – Scénario 4', 'Motel', 'section', '20', 'employes', 1, 1),
  ('2025 – Scénario 4', 'Appart', 'section', 'Appart', 'employes', 3, 3),
  ('2025 – Scénario 4', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'employes', 1, 3),
  ('2025 – Scénario 4', 'Motel', 'section', '20 3/4', 'employes', 5, 5),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'employes', 5, 5)
) as o(plan, lieu, niveau, numero, type, nombre, lits)
join rooming.plans p on p.nom = o.plan
join rooming.lieux l on l.nom = o.lieu and l.niveau = o.niveau
join rooming.chambres c on c.lieu_id = l.id and c.numero = o.numero;

-- Un nom qui est le surnom d'un employé actif est lié à sa fiche ; les
-- autres (direction, invités…) restent des noms libres.
insert into rooming.personnes (plan_id, chambre_id, employe_id, nom)
select p.id, c.id, e.id, case when e.id is null then o.nom end from (values
  ('Été 2026', 'Motel', 'section', '16', 'Vickie'),
  ('Été 2026', 'Motel', 'section', '17', 'Galaxie'),
  ('Été 2026', 'Motel', 'section', '17', 'Spag'),
  ('Été 2026', 'Motel', 'section', '17', 'Fiji'),
  ('Été 2026', 'Motel', 'section', '17', 'Sriracha'),
  ('Été 2026', 'Motel', 'section', '18', 'Younes'),
  ('Été 2026', 'Motel', 'section', '19', 'Sylvie'),
  ('Été 2026', 'Motel', 'section', '19', 'Maxime'),
  ('Été 2026', 'Appart', 'section', 'Appart', 'Charlotte'),
  ('Été 2026', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('Été 2026', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Vincent'),
  ('2025 – Pré-camp', 'Motel', 'section', '16', 'Cliff'),
  ('2025 – Pré-camp', 'Motel', 'section', '16', 'Whippet'),
  ('2025 – Pré-camp', 'Motel', 'section', '16', 'Maxime'),
  ('2025 – Pré-camp', 'Motel', 'section', '17', 'Link'),
  ('2025 – Pré-camp', 'Motel', 'section', '17', 'Galaxie'),
  ('2025 – Pré-camp', 'Motel', 'section', '17', 'Samya'),
  ('2025 – Pré-camp', 'Motel', 'section', '18', 'Rémi'),
  ('2025 – Pré-camp', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Pré-camp', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Pré-camp', 'Motel', 'section', '20', 'Steve'),
  ('2025 – Pré-camp', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Isabel'),
  ('2025 – Pré-camp', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Audrey'),
  ('2025 – Classes nature', 'Motel', 'section', '18', 'Rémi'),
  ('2025 – Classes nature', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Classes nature', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Classes nature', 'Motel', 'section', '20', 'Steve'),
  ('2025 – Classes nature', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Classes nature', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Classes nature', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Classes nature', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Scénario 1', 'Motel', 'section', '16', 'Fiji'),
  ('2025 – Scénario 1', 'Motel', 'section', '16', 'Loukia'),
  ('2025 – Scénario 1', 'Motel', 'section', '17', 'Cliff'),
  ('2025 – Scénario 1', 'Motel', 'section', '17', 'Whippet'),
  ('2025 – Scénario 1', 'Motel', 'section', '17', 'Glitch'),
  ('2025 – Scénario 1', 'Motel', 'section', '18', 'Link'),
  ('2025 – Scénario 1', 'Motel', 'section', '18', 'Galaxie'),
  ('2025 – Scénario 1', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Scénario 1', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Scénario 1', 'Motel', 'section', '20', 'Steve / Chef'),
  ('2025 – Scénario 1', 'Appart', 'section', 'Appart', 'Audrey'),
  ('2025 – Scénario 1', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Scénario 1', 'Motel', 'section', '20 3/4', 'Gecko'),
  ('2025 – Scénario 1', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 1', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Scénario 1', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Scénario 1', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Isabel'),
  ('2025 – Scénario 2', 'Motel', 'section', '16', 'Fiji'),
  ('2025 – Scénario 2', 'Motel', 'section', '16', 'Loukia'),
  ('2025 – Scénario 2', 'Motel', 'section', '17', 'Cliff'),
  ('2025 – Scénario 2', 'Motel', 'section', '17', 'Whippet'),
  ('2025 – Scénario 2', 'Motel', 'section', '17', 'Glitch'),
  ('2025 – Scénario 2', 'Motel', 'section', '18', 'Link'),
  ('2025 – Scénario 2', 'Motel', 'section', '18', 'Galaxie'),
  ('2025 – Scénario 2', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Scénario 2', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Scénario 2', 'Motel', 'section', '20', 'Isabel'),
  ('2025 – Scénario 2', 'Appart', 'section', 'Appart', 'Audrey'),
  ('2025 – Scénario 2', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Scénario 2', 'Motel', 'section', '20 3/4', 'Gecko'),
  ('2025 – Scénario 2', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 2', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Scénario 2', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Scénario 3', 'Motel', 'section', '16', 'Link'),
  ('2025 – Scénario 3', 'Motel', 'section', '16', 'Galaxie'),
  ('2025 – Scénario 3', 'Motel', 'section', '17', 'Cliff'),
  ('2025 – Scénario 3', 'Motel', 'section', '17', 'Whippet'),
  ('2025 – Scénario 3', 'Motel', 'section', '17', 'Glitch'),
  ('2025 – Scénario 3', 'Motel', 'section', '18', 'Rémi'),
  ('2025 – Scénario 3', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Scénario 3', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Scénario 3', 'Motel', 'section', '20', 'Steve'),
  ('2025 – Scénario 3', 'Appart', 'section', 'Appart', 'Fiji'),
  ('2025 – Scénario 3', 'Appart', 'section', 'Appart', 'Loukia'),
  ('2025 – Scénario 3', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Scénario 3', 'Motel', 'section', '20 3/4', 'Gecko'),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Isabel'),
  ('2025 – Scénario 3', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Audrey'),
  ('2025 – Scénario 4', 'Motel', 'section', '16', 'Link'),
  ('2025 – Scénario 4', 'Motel', 'section', '16', 'Galaxie'),
  ('2025 – Scénario 4', 'Motel', 'section', '17', 'Cliff'),
  ('2025 – Scénario 4', 'Motel', 'section', '17', 'Whippet'),
  ('2025 – Scénario 4', 'Motel', 'section', '17', 'Glitch'),
  ('2025 – Scénario 4', 'Motel', 'section', '18', 'Rémi'),
  ('2025 – Scénario 4', 'Motel', 'section', '19', 'Sylvie'),
  ('2025 – Scénario 4', 'Motel', 'section', '19', 'Papachat'),
  ('2025 – Scénario 4', 'Motel', 'section', '20', 'Steve'),
  ('2025 – Scénario 4', 'Appart', 'section', 'Appart', 'Fiji'),
  ('2025 – Scénario 4', 'Appart', 'section', 'Appart', 'Sriracha'),
  ('2025 – Scénario 4', 'Appart', 'section', 'Appart', 'Gecko'),
  ('2025 – Scénario 4', '55 chemin du Tour du Lac', 'batiment', '55 TDL', 'Marco'),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Charlotte'),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Amélie'),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Vickie'),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Isabel'),
  ('2025 – Scénario 4', '100 chemin du Tour du Lac', 'batiment', '100 TDL', 'Audrey')
) as o(plan, lieu, niveau, numero, nom)
join rooming.plans p on p.nom = o.plan
join rooming.lieux l on l.nom = o.lieu and l.niveau = o.niveau
join rooming.chambres c on c.lieu_id = l.id and c.numero = o.numero
left join lateral (
  select e.id from core.employes e where e.actif and lower(e.surnom) = lower(o.nom) limit 1
) e on true;
