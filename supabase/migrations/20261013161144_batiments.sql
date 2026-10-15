-- ============================================================
-- batiments : fiche technique des bâtiments (demande de Maxime du
-- 2026-10-13). Remplace le classeur « Breakers et Valves » : quel
-- disjoncteur alimente quoi, et où sont les valves d'eau.
--
-- Choix de Maxime (2026-10-13) : un module à part, « Bâtiments » ;
-- direction seulement ; les panneaux A et B sont au sous-sol de la
-- Vieille-France, CU dans la cuisine ; ceux des Pins (dans PB) et des
-- Cèdres (dans le Grill) sont à inscrire. Les superficies du classeur
-- (onglet Dimensions) et le calcul de thermopompe (onglet BTU) ne sont
-- pas repris : des plans avec dimensions viendront plus tard.
--
-- Un disjoncteur occupe un emplacement numéroté de son panneau (impairs
-- à gauche, pairs à droite) : pleine largeur (A #20), demi (A #13-1,
-- A #13-2 : deux circuits dans le même emplacement) ou bipolaire
-- (A #36-38 : 240 V, chauffage). Ce qu'il alimente = une liste de
-- lignes « pièce + quoi » (VFB 3 · Lumière), en texte libre : beaucoup
-- ne sont pas des chambres (chauffe-eau, trappe à graisse…).
-- Consultable sur téléphone, même sans réseau (sous-sols).
-- ============================================================

create schema if not exists batiments;

-- Nouveau module dans la grille d'accès : direction en écriture.
-- La liste garde aussi les modules de Réservations et de RH (pas encore
-- en PROD).
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','batiments'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','batiments'));

insert into core.acces_roles (role, module, niveau) values ('direction','batiments','ecriture');

-- ------------------------------------------------------------
-- Bâtiments (onglet Réglages)
-- ------------------------------------------------------------
create table batiments.batiments (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Panneaux électriques
-- ------------------------------------------------------------
create table batiments.panneaux (
  id uuid primary key default gen_random_uuid(),
  batiment_id uuid references batiments.batiments(id) on delete set null,
  -- Nom court, devant le numéro d'un disjoncteur : « A » → A #13-2.
  nom text not null unique check (btrim(nom) <> ''),
  -- Où il est (« Sous-sol de la Vieille-France »).
  emplacement text check (emplacement is null or btrim(emplacement) <> ''),
  -- Nombre d'emplacements ; null = jusqu'au plus haut numéro noté.
  positions integer check (positions between 2 and 84),
  note text check (note is null or btrim(note) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Disjoncteurs
-- ------------------------------------------------------------
create table batiments.disjoncteurs (
  id uuid primary key default gen_random_uuid(),
  panneau_id uuid not null references batiments.panneaux(id) on delete cascade,
  position integer not null check (position between 1 and 84),
  -- Demi-disjoncteur : 1 ou 2 (A #13-1, A #13-2) ; null = pleine largeur.
  demi smallint check (demi in (1, 2)),
  -- Bipolaire : occupe aussi l'emplacement du dessous (position + 2).
  bipolaire boolean not null default false,
  -- Ce qu'il alimente : [{ "piece": "VFB 3", "quoi": "Lumière" }, …]
  -- (l'un des deux peut manquer). Liste vide = à identifier.
  alimente jsonb not null default '[]' check (jsonb_typeof(alimente) = 'array'),
  -- Noté, mais à vérifier sur place.
  a_verifier boolean not null default false,
  note text check (note is null or btrim(note) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (bipolaire and demi is not null)),
  unique nulls not distinct (panneau_id, position, demi)
);

create index idx_disjoncteurs_panneau on batiments.disjoncteurs(panneau_id);

-- ------------------------------------------------------------
-- Valves d'eau
-- ------------------------------------------------------------
create table batiments.valves (
  id uuid primary key default gen_random_uuid(),
  batiment_id uuid references batiments.batiments(id) on delete set null,
  -- Ce qu'elle coupe (« Pins Bas + Pins Haut »).
  coupe text not null check (btrim(coupe) <> ''),
  -- null = autre chose (entrée d'eau, arrosage…).
  eau text check (eau in ('chaude', 'froide', 'les_deux')),
  -- Où elle est (« Garde-robe de la balayeuse (cuisine) »).
  emplacement text check (emplacement is null or btrim(emplacement) <> ''),
  a_verifier boolean not null default false,
  note text check (note is null or btrim(note) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Photos et PDF d'un panneau (carte de la porte) ou d'une valve
-- (où elle est) : seau privé, lus par adresses signées.
-- ------------------------------------------------------------
create table batiments.fichiers (
  id uuid primary key default gen_random_uuid(),
  panneau_id uuid references batiments.panneaux(id) on delete cascade,
  valve_id uuid references batiments.valves(id) on delete cascade,
  -- Chemin dans le seau batiments-fichiers : <panneau ou valve>/<id>.jpg ou .pdf
  chemin text not null unique,
  -- Nom d'origine d'un PDF (null pour une photo).
  nom text,
  ajoute_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(panneau_id, valve_id) = 1)
);

create index idx_fichiers_panneau on batiments.fichiers(panneau_id);
create index idx_fichiers_valve on batiments.fichiers(valve_id);

create trigger trg_batiments_updated_at before update on batiments.batiments
for each row execute function core.maj_updated_at();
create trigger trg_panneaux_updated_at before update on batiments.panneaux
for each row execute function core.maj_updated_at();
create trigger trg_disjoncteurs_updated_at before update on batiments.disjoncteurs
for each row execute function core.maj_updated_at();
create trigger trg_valves_updated_at before update on batiments.valves
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Un disjoncteur : lignes « alimente » nettoyées (espaces, lignes
-- vides retirées) ; pas deux disjoncteurs au même emplacement (deux
-- demis 1 et 2 peuvent s'y partager) ; pas au-delà du panneau.
-- ------------------------------------------------------------
create function batiments.etiquette(p_panneau text, p_position integer, p_demi smallint, p_bipolaire boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_panneau || ' #' || p_position
    || case when p_bipolaire then '-' || (p_position + 2)
            when p_demi is not null then '-' || p_demi
            else '' end
$$;

create function batiments.verifier_disjoncteur()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cases integer[] := case when new.bipolaire then array[new.position, new.position + 2] else array[new.position] end;
  v_nom text;
  v_max integer;
  v_autre batiments.disjoncteurs;
begin
  if exists (select 1 from jsonb_array_elements(new.alimente) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Liste « alimente » invalide.';
  end if;
  new.alimente := coalesce((
    select jsonb_agg(jsonb_build_object('piece', l.piece, 'quoi', l.quoi) order by l.rang)
      from (
        select nullif(btrim(e ->> 'piece'), '') as piece, nullif(btrim(e ->> 'quoi'), '') as quoi, rang
          from jsonb_array_elements(new.alimente) with ordinality as t(e, rang)
      ) l
     where l.piece is not null or l.quoi is not null
  ), '[]'::jsonb);

  select p.nom, p.positions into v_nom, v_max from batiments.panneaux p where p.id = new.panneau_id;
  if v_max is not null and v_cases[array_upper(v_cases, 1)] > v_max then
    raise exception 'Le panneau % n''a que % emplacements.', v_nom, v_max;
  end if;

  select d.* into v_autre
    from batiments.disjoncteurs d
   where d.panneau_id = new.panneau_id
     and d.id <> new.id
     and (case when d.bipolaire then array[d.position, d.position + 2] else array[d.position] end) && v_cases
     and not (d.demi is not null and new.demi is not null and d.position = new.position and d.demi <> new.demi)
   limit 1;
  if found then
    raise exception 'Cet emplacement est déjà pris par %.', batiments.etiquette(v_nom, v_autre.position, v_autre.demi, v_autre.bipolaire);
  end if;
  return new;
end;
$$;

create trigger trg_disjoncteurs_verifier before insert or update on batiments.disjoncteurs
for each row execute function batiments.verifier_disjoncteur();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema batiments to authenticated, service_role;
grant select, insert, update, delete on all tables in schema batiments to authenticated, service_role;
revoke execute on function batiments.verifier_disjoncteur() from public, anon;
revoke execute on function batiments.etiquette(text, integer, smallint, boolean) from public, anon;
grant execute on function batiments.etiquette(text, integer, smallint, boolean) to authenticated, service_role;

alter table batiments.batiments enable row level security;
alter table batiments.panneaux enable row level security;
alter table batiments.disjoncteurs enable row level security;
alter table batiments.valves enable row level security;
alter table batiments.fichiers enable row level security;

create policy "Lire" on batiments.batiments for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.batiments for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));
create policy "Lire" on batiments.panneaux for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.panneaux for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));
create policy "Lire" on batiments.disjoncteurs for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.disjoncteurs for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));
create policy "Lire" on batiments.valves for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.valves for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));
create policy "Lire" on batiments.fichiers for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.fichiers for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));

alter publication supabase_realtime add table
  batiments.batiments, batiments.panneaux, batiments.disjoncteurs, batiments.valves, batiments.fichiers;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('batiments-fichiers', 'batiments-fichiers', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "Bâtiments : lire les fichiers" on storage.objects for select to authenticated
  using (bucket_id = 'batiments-fichiers' and core.peut_lire('batiments'));
create policy "Bâtiments : ajouter un fichier" on storage.objects for insert to authenticated
  with check (bucket_id = 'batiments-fichiers' and core.peut_ecrire('batiments'));
create policy "Bâtiments : retirer un fichier" on storage.objects for delete to authenticated
  using (bucket_id = 'batiments-fichiers' and core.peut_ecrire('batiments'));

-- ============================================================
-- Import du classeur « Breakers et Valves » (onglets Breakers et
-- Valves). Les deux façons de noter du classeur (par pièce : « VFB3 →
-- lumière A#20 » ; par disjoncteur : « A#14 → corridor, salle de
-- lavage… ») sont regroupées : une ligne par disjoncteur. Chambres
-- 7 à 15 = Vieille-France Haut (plan des étages). « ??? », « À
-- confirmer » ou rien = à identifier (liste vide). Coquilles
-- corrigées (« À #10 » = A #10, « B##17-2 » = B #17-2, CU = CUI).
-- Chambres 10, 12 et 14 sans description, sur A #14 comme la 8 :
-- lumière.
-- ============================================================
insert into batiments.batiments (nom, ordre) values
  ('Vieille-France', 1),
  ('Pavillon principal', 2);

insert into batiments.panneaux (nom, batiment_id, emplacement, ordre)
select v.nom, b.id, v.emplacement, v.ordre
  from (values
    ('A', 'Vieille-France', 'Sous-sol de la Vieille-France', 1),
    ('B', 'Vieille-France', 'Sous-sol de la Vieille-France', 2),
    ('CU', 'Pavillon principal', 'Cuisine', 3),
    ('Pins', 'Pavillon principal', 'Pins Bas (PB)', 4),
    ('Cèdres', 'Pavillon principal', 'Grill', 5)
  ) as v(nom, batiment, emplacement, ordre)
  join batiments.batiments b on b.nom = v.batiment;

insert into batiments.disjoncteurs (panneau_id, position, demi, bipolaire, alimente, a_verifier, note)
select p.id, v.position, v.demi, v.bipolaire, v.alimente::jsonb, v.a_verifier, v.note
  from (values
    -- Panneau A
    ('A', 1, 1::smallint, false, '[{"piece":"Motel 19","quoi":"Prise 2"}]', false, null),
    ('A', 1, 2::smallint, false, '[{"piece":"Motel 19","quoi":"Prise 3"}]', false, null),
    ('A', 2, 1::smallint, false, '[{"piece":"Corridor du motel (côté appartement)","quoi":"Lumière"}]', false, null),
    ('A', 2, 2::smallint, false, '[]', false, null),
    ('A', 3, 1::smallint, false, '[{"piece":"Motel 17","quoi":"Lumière"},{"piece":"Motel 18","quoi":"Lumière"},{"piece":"Motel 20","quoi":"Lumière"},{"piece":"Motel 20 3/4","quoi":"Lumière"},{"piece":"Corridor central du motel","quoi":"Lumière"},{"piece":"Motel 19","quoi":"Lumière du plafond"}]', false, null),
    ('A', 3, 2::smallint, false, '[{"piece":"Corridor central du motel","quoi":null}]', false, null),
    ('A', 4, null, false, '[{"piece":"Motel SDB 17","quoi":"Lumières et prises"},{"piece":"Motel SDB 19","quoi":"Lumières et prises"}]', false, null),
    ('A', 5, 1::smallint, false, '[{"piece":"Motel SDB 18","quoi":null},{"piece":"Motel SDB 20","quoi":null}]', false, null),
    ('A', 5, 2::smallint, false, '[{"piece":"Motel 19","quoi":"Prise 1"}]', false, null),
    ('A', 6, null, false, '[]', false, null),
    ('A', 7, null, false, '[{"piece":"VFH 7","quoi":"Lumière"},{"piece":"VFH 9","quoi":"Lumière"},{"piece":"VFH 11","quoi":"Lumière"},{"piece":"VFH 13","quoi":"Lumière"},{"piece":"VFH 15","quoi":"Lumière"},{"piece":"Corridor VFH","quoi":"Lumière"},{"piece":"Corridor de la sortie de secours","quoi":"Lumière"},{"piece":"Porte secrète de l''appartement","quoi":"Lumière"}]', false, null),
    ('A', 8, null, false, '[{"piece":"Motel 19","quoi":"Prises côté lac"},{"piece":"Motel 18","quoi":"Prises côté lac"},{"piece":"Motel 20 3/4","quoi":"Prises 4 et 5"},{"piece":"Motel 20","quoi":"Prise 20"},{"piece":"Motel","quoi":"Toutes les prises sauf 1, 2 et 3"},{"piece":"Motel","quoi":"Lumière"}]', false, null),
    ('A', 9, null, false, '[{"piece":"VFB 2","quoi":"Lumière"},{"piece":"VFB 4","quoi":"Lumière"},{"piece":"VFB 6","quoi":"Lumière"},{"piece":"VFB SDB côté lac","quoi":"Lumière"}]', false, null),
    ('A', 10, null, false, '[{"piece":"VFB douche","quoi":"Lumière et ventilation"}]', false, null),
    ('A', 11, null, false, '[{"piece":"VFB côté rue","quoi":"Lumière du plafond"}]', false, null),
    ('A', 12, null, false, '[{"piece":"Salon VF côté rue","quoi":"Prises du divan, boule disco et lumière"}]', false, null),
    ('A', 13, 1::smallint, false, '[]', false, null),
    ('A', 13, 2::smallint, false, '[{"piece":"VFB 1","quoi":"Prise murale"},{"piece":"VFB 3","quoi":"Prise murale"},{"piece":"VFB 5","quoi":"Prise murale"}]', false, null),
    ('A', 14, null, false, '[{"piece":"VFH 8","quoi":"Lumière"},{"piece":"VFH 10","quoi":"Lumière"},{"piece":"VFH 12","quoi":"Lumière"},{"piece":"VFH 14","quoi":"Lumière"},{"piece":"Corridor côté motel","quoi":"Lumière"},{"piece":"Salle de lavage","quoi":"Lumière"},{"piece":"SDB côté lac","quoi":"Lumière"}]', false, null),
    ('A', 16, null, false, '[{"piece":"VFH SDB côté rue","quoi":"Lumière de la douche"}]', false, null),
    ('A', 18, null, false, '[{"piece":"VFH 9","quoi":"Prises (2)"},{"piece":"Appartement cuisine","quoi":"Lumière"},{"piece":"Appartement SDB","quoi":null},{"piece":"Corridor de l''entrée VF","quoi":"Lumière"},{"piece":"Appartement bas de l''escalier","quoi":"Prise"}]', false, null),
    ('A', 20, null, false, '[{"piece":"VFB 1","quoi":"Lumière"},{"piece":"VFB 3","quoi":"Lumière"},{"piece":"VFB 5","quoi":"Lumière"},{"piece":"Corridor VFB","quoi":"Lumière"},{"piece":"SDB côté rue (VF)","quoi":"Lumière"}]', false, null),
    ('A', 22, null, false, '[{"piece":"VFB 2","quoi":"Prise murale"},{"piece":"VFB 4","quoi":"Prise murale"},{"piece":"VFB 6","quoi":"Prise murale"},{"piece":"Cuisinette","quoi":"Lumière murale"}]', false, null),
    ('A', 23, null, false, '[]', false, null),
    ('A', 25, 1::smallint, false, '[{"piece":"Garage","quoi":"Lumière"},{"piece":"Entrepôt Aquabounga","quoi":"Prise"},{"piece":"Appartement","quoi":"Prise 1"}]', false, null),
    ('A', 25, 2::smallint, false, '[{"piece":"Appartement","quoi":"Prises 6, 7 et 8"},{"piece":"Appartement chambre du haut","quoi":"Lumière de la garde-robe"}]', false, null),
    ('A', 29, 1::smallint, false, '[{"piece":"Salle des employés","quoi":"Lumière"},{"piece":"Corde de bois","quoi":"Lumière"}]', false, null),
    ('A', 29, 2::smallint, false, '[{"piece":"Appartement en bas","quoi":"Prise 3"}]', false, null),
    ('A', 30, 1::smallint, false, '[{"piece":"Appartement salon","quoi":"Lumière, prises et garde-robe du salon (5, 9, 20, 11)"}]', false, null),
    ('A', 30, 2::smallint, false, '[{"piece":"Appartement côté cuisine","quoi":"Lumière"}]', false, null),
    ('A', 31, 1::smallint, false, '[]', false, null),
    ('A', 31, 2::smallint, false, '[{"piece":"Motel 16","quoi":"Lumière"},{"piece":"Motel 16","quoi":"Prise"},{"piece":"Corridor du motel","quoi":"Lumière"}]', false, null),
    ('A', 36, null, true, '[{"piece":"Appartement","quoi":"Chauffage"}]', false, null),
    ('A', 37, 1::smallint, false, '[{"piece":"Salon VF côté lac","quoi":"Lumière et prises"}]', false, null),
    ('A', 37, 2::smallint, false, '[{"piece":null,"quoi":"Chauffe-eau"}]', false, null),
    ('A', 39, null, false, '[{"piece":null,"quoi":"Alarme"},{"piece":null,"quoi":"Lumière de garde-robe"},{"piece":null,"quoi":"Prise SVF1"},{"piece":"Appartement","quoi":"Prise du micro-ondes"},{"piece":"Appartement","quoi":"Hotte du four"}]', false, null),
    -- Panneau B
    ('B', 1, 1::smallint, false, '[{"piece":"VFH 11","quoi":"Prise"}]', false, null),
    ('B', 1, 2::smallint, false, '[{"piece":"VFH 15","quoi":"Prise"}]', false, null),
    ('B', 3, 1::smallint, false, '[{"piece":"VFH 13","quoi":"Prise"}]', false, null),
    ('B', 3, 2::smallint, false, '[{"piece":"VFH 12","quoi":"Prise"}]', false, null),
    ('B', 5, 1::smallint, false, '[{"piece":"VFH 14","quoi":"Prise"}]', false, null),
    ('B', 5, 2::smallint, false, '[]', false, null),
    ('B', 7, 1::smallint, false, '[{"piece":"VFH 7","quoi":"Prise"}]', false, null),
    ('B', 7, 2::smallint, false, '[{"piece":"VFH 10","quoi":"Prise"}]', false, null),
    ('B', 9, 1::smallint, false, '[{"piece":"VFH 8","quoi":"Prise"}]', false, null),
    ('B', 9, 2::smallint, false, '[]', false, null),
    ('B', 10, null, true, '[{"piece":"Sous-sol du motel","quoi":"Chauffage"}]', false, null),
    ('B', 11, 1::smallint, false, '[]', false, null),
    ('B', 15, 1::smallint, false, '[]', false, null),
    ('B', 15, 2::smallint, false, '[]', false, 'Noté « À confirmer » dans le classeur, sans description.'),
    ('B', 17, 1::smallint, false, '[]', false, 'Noté « À confirmer » dans le classeur, sans description.'),
    ('B', 17, 2::smallint, false, '[{"piece":"Appartement","quoi":"Prise du frigo"}]', false, null),
    ('B', 19, 1::smallint, false, '[{"piece":null,"quoi":"Aspirateur"}]', false, null),
    ('B', 22, null, false, '[{"piece":null,"quoi":"Micro-ondes"}]', false, null),
    ('B', 23, null, false, '[{"piece":null,"quoi":"Lumière de la boule disco / frigo"}]', false, null),
    ('B', 24, null, false, '[{"piece":"Cuisinette côté chambre","quoi":"Prise"}]', false, null),
    -- Panneau CU (cuisine)
    ('CU', 5, 2::smallint, false, '[{"piece":"Trappe à graisse","quoi":"Pompe"}]', false, null),
    ('CU', 7, 1::smallint, false, '[{"piece":"Trappe à graisse","quoi":"Prise"}]', false, null),
    ('CU', 29, null, false, '[{"piece":"Frigo","quoi":"Contrôleur"},{"piece":"Cuisine","quoi":"Lumière"},{"piece":"Frigo","quoi":"Chaufferette"}]', false, null),
    ('CU', 30, 1::smallint, false, '[{"piece":"Trappe à graisse","quoi":"Lumière de l''alarme"}]', true, 'Deux circuits sur le même disjoncteur : l''autre reste à identifier.')
  ) as v(panneau, position, demi, bipolaire, alimente, a_verifier, note)
  join batiments.panneaux p on p.nom = v.panneau;

insert into batiments.valves (batiment_id, coupe, eau, emplacement, ordre)
select b.id, v.coupe, v.eau, v.emplacement, v.ordre
  from (values
    ('Pins Bas + Pins Haut', 'chaude', 'Garde-robe de la balayeuse (cuisine)', 1),
    ('Pins Bas + Pins Haut', 'froide', 'Derrière la laveuse', 2)
  ) as v(coupe, eau, emplacement, ordre)
  cross join batiments.batiments b
 where b.nom = 'Pavillon principal';
