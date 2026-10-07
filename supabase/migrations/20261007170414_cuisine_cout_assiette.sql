-- ============================================================
-- Cuisine › Coût par assiette (demande de Maxime du 2026-10-07 ; remplace
-- le Google Sheets « Suivi coût par assiette 2026 »).
--
-- Coût par assiette = (nourriture + salaires de la cuisine) ÷ assiettes
-- servies. Tout est rattaché à des **jours** ; l'app fait deux découpages
-- des mêmes données : l'année par mois civils (octobre à septembre) et le
-- camp d'été par semaine (`couts_semaines`).
--   - Années : exercice d'octobre à septembre, désigné par l'année où il
--     commence (2025 = 2025-2026, comme Mastertimeline).
--   - Nourriture : factures (fournisseur, date de livraison, montant ; un
--     crédit est négatif), comptées au jour de `jour_impute` s'il est posé
--     (nourriture qui sert plus tard), sinon au jour de livraison.
--   - Salaires : un montant par période de paie (14 jours, du dimanche au
--     samedi, mêmes périodes que les Feuilles de temps : temps.debut_periode)
--     et par poste, réparti dans l'app au prorata des jours.
--   - Assiettes : calculées dans l'app à partir des menus datés de Cuisine
--     (portions des groupes présents × repas planifiés, jour par jour) ; un
--     total corrigé à la main (`couts_menus`) est réparti comme le calcul.
--     Plus des groupes saisis à la main (`couts_groupes`, personnes × repas
--     répartis du `debut` à la `fin` ; sans dates = « à classer », pas
--     compté). `couts_annees.menus = false` : les menus ne comptent pas
--     cette année-là (2025-2026, importée du Sheets).
--
-- Accès : module « cuisine_couts » de la grille (Utilisateurs) — l'onglet
-- montre les salaires. Aucune ligne dans la grille : admins, plus
-- Frédérique (responsable de la cuisine) en ajout personnel.
-- Pas de temps réel (les suppressions seraient diffusées sans filtre RLS).
-- ============================================================

alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts'));

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
create table commande.couts_annees (
  annee integer primary key check (annee between 2000 and 2100),
  -- Compter les assiettes des menus de Cuisine datés dans l'année.
  menus boolean not null default true,
  created_at timestamptz not null default now()
);

-- Semaines du camp d'été (vue « Camp d'été »), sans chevauchement.
create table commande.couts_semaines (
  id uuid primary key default gen_random_uuid(),
  annee integer not null references commande.couts_annees(annee) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  debut date not null,
  fin date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin >= debut),
  check (debut >= make_date(annee, 10, 1) and fin <= make_date(annee + 1, 9, 30)),
  constraint couts_semaines_sans_chevauchement exclude using gist (daterange(debut, fin, '[]') with &&)
);

create table commande.couts_factures (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null check (btrim(fournisseur) <> ''),
  -- Date de livraison.
  jour date not null,
  -- Jour où la nourriture compte (null = jour de livraison).
  jour_impute date,
  montant numeric(12,2) not null check (montant <> 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_couts_factures_jour on commande.couts_factures(coalesce(jour_impute, jour));

create table commande.couts_postes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table commande.couts_salaires (
  -- Premier jour (dimanche) de la période de paie.
  debut_paie date not null check ((debut_paie - date '2026-10-04') % 14 = 0),
  poste_id uuid not null references commande.couts_postes(id) on delete restrict,
  montant numeric(12,2) not null check (montant <> 0),
  updated_at timestamptz not null default now(),
  primary key (debut_paie, poste_id)
);

-- Groupe sans menu dans Cuisine : personnes × repas, répartis du début à la fin.
create table commande.couts_groupes (
  id uuid primary key default gen_random_uuid(),
  annee integer not null references commande.couts_annees(annee) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  personnes integer not null check (personnes >= 0),
  repas integer not null check (repas >= 0),
  -- Sans dates : à classer (pas compté).
  debut date,
  fin date,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((debut is null) = (fin is null)),
  check (fin >= debut),
  check (debut >= make_date(annee, 10, 1) and fin <= make_date(annee + 1, 9, 30))
);

-- Assiettes d'un menu corrigées à la main (remplace le total calculé).
create table commande.couts_menus (
  menu_id uuid primary key references commande.menus(id) on delete cascade,
  assiettes integer not null check (assiettes >= 0)
);

create trigger trg_couts_semaines_updated_at before update on commande.couts_semaines
for each row execute function core.maj_updated_at();
create trigger trg_couts_factures_updated_at before update on commande.couts_factures
for each row execute function core.maj_updated_at();
create trigger trg_couts_salaires_updated_at before update on commande.couts_salaires
for each row execute function core.maj_updated_at();
create trigger trg_couts_groupes_updated_at before update on commande.couts_groupes
for each row execute function core.maj_updated_at();

-- Un groupe daté prend l'année de son début.
create function commande.couts_annee_du_groupe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.debut is not null then
    new.annee := extract(year from new.debut)::integer - case when extract(month from new.debut) >= 10 then 0 else 1 end;
  end if;
  return new;
end;
$$;

create trigger trg_couts_groupes_annee before insert or update on commande.couts_groupes
for each row execute function commande.couts_annee_du_groupe();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant select, insert, update, delete on
  commande.couts_annees, commande.couts_semaines, commande.couts_factures, commande.couts_postes,
  commande.couts_salaires, commande.couts_groupes, commande.couts_menus
to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['couts_annees','couts_semaines','couts_factures','couts_postes','couts_salaires','couts_groupes','couts_menus'] loop
    execute format('alter table commande.%I enable row level security', t);
    execute format($p$create policy "Lire" on commande.%I for select to authenticated using (core.peut_lire('cuisine_couts'))$p$, t);
    execute format($p$create policy "Écrire" on commande.%I for all to authenticated using (core.peut_ecrire('cuisine_couts')) with check (core.peut_ecrire('cuisine_couts'))$p$, t);
  end loop;
end $$;

-- Frédérique, responsable de la cuisine (demande de Maxime du 2026-10-07).
-- Sans compte à son nom (base DEV), rien ne se passe : l'ajouter dans
-- Utilisateurs.
insert into core.acces_modules (user_id, module, niveau)
select id, 'cuisine_couts', 'ecriture'
  from core.profils
 where role <> 'admin'
   and (lower(nom) ~ '^fr[eé]d[eé]rique' or lower(courriel) ~ '^fr[eé]d[eé]rique')
on conflict (user_id, module) do update set niveau = excluded.niveau;

-- ------------------------------------------------------------
-- Import du Sheets (onglets « Analyse coût/assiette 2026 », « Décompte
-- assiettes Classes natures 2026 », « Salaires par période »).
--   - Périodes du Sheets : mois civils, CN Juin jusqu'au 27 juin, Semaines 1
--     à 10 du dimanche au samedi à partir du 28 juin 2026, Septembre = le
--     reste. Les 10 semaines du Sheets deviennent les semaines de 2025-2026.
--   - 2026-2027 créée avec 8 semaines à partir du 27 juin 2027 (à ajuster).
--   - Factures : quand la période choisie dans le Sheets (✅) n'est pas
--     celle de la livraison, la facture est imputée au premier jour de la
--     période choisie (mois et semaines restent ceux du Sheets).
--   - Groupes : datés du début à la fin de leur période ; sans ✅ : à classer.
--   - Salaires : périodes de paie 22 à 27 (2025) puis 1 à 20 (2026) ; la
--     période 1 commence le 28 décembre 2025. Les montants à 0 sont omis.
-- Contrôles : nourriture 142 645,61 $ ; assiettes datées 31 323 ;
-- salaires 76 882,19 $. (Les totaux du Sheets ne comptaient que mai à
-- septembre ; Sarah était hors de son total.)
-- ------------------------------------------------------------
insert into commande.couts_annees (annee, menus) values (2025, false);
insert into commande.couts_semaines (annee, nom, debut, fin) values
  (2025, 'Semaine 1', '2026-06-28', '2026-07-04'),
  (2025, 'Semaine 2', '2026-07-05', '2026-07-11'),
  (2025, 'Semaine 3', '2026-07-12', '2026-07-18'),
  (2025, 'Semaine 4', '2026-07-19', '2026-07-25'),
  (2025, 'Semaine 5', '2026-07-26', '2026-08-01'),
  (2025, 'Semaine 6', '2026-08-02', '2026-08-08'),
  (2025, 'Semaine 7', '2026-08-09', '2026-08-15'),
  (2025, 'Semaine 8', '2026-08-16', '2026-08-22'),
  (2025, 'Semaine 9', '2026-08-23', '2026-08-29'),
  (2025, 'Semaine 10', '2026-08-30', '2026-09-05');
insert into commande.couts_annees (annee, menus) values (2026, true);
insert into commande.couts_semaines (annee, nom, debut, fin) values
  (2026, 'Semaine 1', '2027-06-27', '2027-07-03'),
  (2026, 'Semaine 2', '2027-07-04', '2027-07-10'),
  (2026, 'Semaine 3', '2027-07-11', '2027-07-17'),
  (2026, 'Semaine 4', '2027-07-18', '2027-07-24'),
  (2026, 'Semaine 5', '2027-07-25', '2027-07-31'),
  (2026, 'Semaine 6', '2027-08-01', '2027-08-07'),
  (2026, 'Semaine 7', '2027-08-08', '2027-08-14'),
  (2026, 'Semaine 8', '2027-08-15', '2027-08-21');
-- 188 factures, total 142645.61 $ ; 49 imputées au début de la période choisie dans le Sheets (≠ période de la livraison).
insert into commande.couts_factures (fournisseur, jour, jour_impute, montant) values
  ('Colabor', '2025-09-30', '2025-10-01', 1415.22),
  ('Colabor', '2025-09-30', '2025-10-01', 201.03),
  ('Colabor', '2025-12-02', null, 1298.72),
  ('Colabor', '2025-12-02', null, 208.36),
  ('Colabor', '2025-12-04', null, 649.56),
  ('Colabor', '2025-12-22', null, -23.82),
  ('Colabor', '2025-12-19', null, -3.45),
  ('Colabor', '2025-12-30', '2026-01-01', 72.28),
  ('Colabor', '2025-12-30', '2026-01-01', 84.02),
  ('Colabor', '2025-12-30', '2026-01-01', 1461.72),
  ('Colabor', '2026-01-20', null, 2041.97),
  ('Colabor', '2026-01-20', null, 107.90),
  ('Colabor', '2026-01-13', null, 884.72),
  ('Colabor', '2026-02-10', null, 280.22),
  ('Colabor', '2026-02-10', null, 26.00),
  ('Colabor', '2026-02-10', null, 3768.47),
  ('Colabor', '2026-02-10', null, 578.06),
  ('Colabor', '2026-02-17', null, 212.31),
  ('Colabor', '2026-02-17', null, 1580.53),
  ('Colabor', '2026-02-19', null, 138.38),
  ('Colabor', '2026-02-19', null, 2798.29),
  ('Colabor', '2026-02-24', null, -6.90),
  ('Colabor', '2026-02-26', '2026-03-01', 55.61),
  ('Colabor', '2026-02-27', '2026-03-01', -10.35),
  ('Colabor', '2026-02-26', '2026-03-01', 846.27),
  ('Colabor', '2026-03-12', null, 91.35),
  ('Colabor', '2026-03-12', null, 2566.82),
  ('Colabor', '2026-03-12', null, -3.45),
  ('Colabor', '2026-03-05', null, 1106.80),
  ('Colabor', '2026-03-05', null, 173.10),
  ('Colabor', '2026-03-05', null, -112.72),
  ('Colabor', '2026-05-05', null, 1969.17),
  ('Colabor', '2026-05-05', null, -16.13),
  ('Colabor', '2026-05-07', null, 164.13),
  ('Colabor', '2026-05-07', null, 2152.28),
  ('Colabor', '2026-05-12', null, 816.16),
  ('Colabor', '2026-05-12', null, 18.08),
  ('Colabor', '2026-05-12', null, 64.18),
  ('Colabor', '2026-05-12', null, 219.81),
  ('Colabor', '2026-05-12', null, 2501.32),
  ('Colabor', '2026-05-12', null, -17.25),
  ('Colabor', '2026-05-14', null, 105.11),
  ('Colabor', '2026-05-14', null, 60.90),
  ('Colabor', '2026-05-14', null, 3678.31),
  ('Colabor', '2026-05-19', null, 75.05),
  ('Colabor', '2026-05-19', null, -10.35),
  ('Colabor', '2026-05-19', null, 96.68),
  ('Colabor', '2026-05-19', null, 1774.80),
  ('Colabor', '2026-05-26', '2026-06-01', 3192.41),
  ('Colabor', '2026-05-26', '2026-06-01', 140.87),
  ('Colabor', '2026-05-26', '2026-06-01', 256.07),
  ('Colabor', '2026-05-26', '2026-06-01', -49.02),
  ('Colabor', '2026-06-11', null, 7711.68),
  ('Colabor', '2026-06-11', null, 439.97),
  ('Colabor', '2026-06-11', null, -6.90),
  ('Colabor', '2026-06-11', null, -25.00),
  ('Colabor', '2026-06-26', null, 41.99),
  ('Colabor', '2026-06-26', null, 4515.95),
  ('Colabor', '2026-06-30', null, 4538.74),
  ('Colabor', '2026-06-30', null, 107.74),
  ('Colabor', '2026-07-02', '2026-07-05', 5423.30),
  ('Colabor', '2026-07-02', '2026-07-05', 33.45),
  ('Colabor', '2026-07-02', '2026-07-05', -17.25),
  ('Colabor', '2026-07-02', '2026-07-05', -839.76),
  ('Colabor', '2026-07-07', null, 3501.52),
  ('Colabor', '2026-07-09', '2026-07-12', 4717.87),
  ('Colabor', '2026-07-09', '2026-07-12', -268.73),
  ('Colabor', '2026-07-14', null, 3368.63),
  ('Colabor', '2026-07-14', null, 324.87),
  ('Colabor', '2026-07-16', '2026-07-19', 4744.47),
  ('Colabor', '2026-07-16', '2026-07-19', 343.60),
  ('Colabor', '2026-07-16', '2026-07-19', 23.83),
  ('Colabor', '2026-07-21', null, 3858.33),
  ('Colabor', '2026-07-23', '2026-07-26', 5237.01),
  ('Maxi', '2025-12-04', null, 44.87),
  ('Maxi', '2025-12-05', null, 41.00),
  ('Maxi', '2025-12-13', null, 25.96),
  ('Maxi', '2026-01-06', null, 162.66),
  ('Maxi', '2026-01-15', null, 99.71),
  ('Maxi', '2026-01-21', null, 120.83),
  ('Maxi', '2026-02-11', null, 159.13),
  ('Maxi', '2026-02-13', null, 519.09),
  ('Maxi', '2026-02-13', null, 69.19),
  ('Maxi', '2026-02-13', null, 109.50),
  ('Maxi', '2026-02-13', null, 126.00),
  ('Maxi', '2026-02-18', null, 114.00),
  ('Bourassa', '2026-02-18', null, 92.25),
  ('Maxi', '2026-02-26', null, 328.77),
  ('Maxi', '2026-02-26', null, 82.16),
  ('Maxi', '2026-02-27', null, 146.38),
  ('Maxi', '2026-03-05', null, 269.99),
  ('Costco', '2026-03-06', null, 303.72),
  ('Maxi', '2026-03-10', null, 28.95),
  ('Maxi', '2026-03-13', null, 82.67),
  ('Costco', '2026-03-14', null, 257.17),
  ('Maxi', '2026-03-14', null, 9.01),
  ('Maxi', '2026-03-17', null, 95.34),
  ('Maxi', '2026-03-19', null, 57.00),
  ('Maxi', '2026-03-27', null, 96.85),
  ('Maxi', '2026-04-11', null, 2.63),
  ('Maxi', '2026-04-27', null, 120.84),
  ('Maxi', '2026-04-28', null, 495.72),
  ('Maxi', '2026-04-28', null, 179.72),
  ('Maxi', '2026-05-02', null, 26.38),
  ('Maxi', '2026-05-03', null, 60.00),
  ('Maxi', '2026-05-03', null, 7.58),
  ('Maxi', '2026-05-06', null, 105.44),
  ('Costco', '2026-05-08', null, 328.40),
  ('Costco', '2026-05-08', null, 277.92),
  ('Maxi', '2026-05-09', null, 354.05),
  ('Maxi', '2026-05-13', null, 126.48),
  ('Costco', '2026-05-15', null, 348.04),
  ('Costco', '2026-05-15', null, 366.47),
  ('Maxi', '2026-05-15', null, 176.47),
  ('Maxi', '2026-05-15', null, 176.47),
  ('Maxi', '2026-05-16', null, 134.35),
  ('Super C', '2026-05-18', null, 42.00),
  ('Maxi', '2026-05-18', null, 279.91),
  ('Maxi', '2026-05-18', null, 29.20),
  ('Tigre géant', '2026-05-19', null, 11.50),
  ('Maxi', '2026-05-19', null, 276.00),
  ('Super C', '2026-05-19', null, 126.00),
  ('Maxi', '2026-05-22', null, 165.74),
  ('Maxi', '2026-05-30', '2026-06-01', 84.91),
  ('Maxi', '2026-06-03', null, 16.54),
  ('Maxi', '2026-06-06', null, 323.61),
  ('Costco', '2026-06-12', null, 282.89),
  ('Maxi', '2026-06-15', null, 63.95),
  ('Maxi', '2026-06-18', null, 500.00),
  ('Maxi', '2026-06-30', null, 147.92),
  ('Costco', '2026-07-17', '2026-07-19', 58.45),
  ('Costco', '2026-07-17', '2026-07-19', 77.46),
  ('Costco', '2026-07-17', '2026-07-19', 348.12),
  ('Super C', '2026-07-21', '2026-07-26', 254.54),
  ('Maxi', '2026-07-21', '2026-07-26', 130.48),
  ('Maxi', '2026-07-22', '2026-07-26', 86.80),
  ('Maxi', '2026-07-22', '2026-07-26', 50.85),
  ('Costco', '2026-07-23', '2026-07-26', 283.56),
  ('Maxi', '2026-07-01', null, 136.74),
  ('Maxi', '2026-07-01', null, 24.21),
  ('Maxi', '2026-07-02', null, 250.81),
  ('Maxi', '2026-07-02', null, 320.00),
  ('Super C', '2026-07-02', null, 38.59),
  ('Costco', '2026-07-03', '2026-07-05', 262.27),
  ('Maxi', '2026-07-03', '2026-07-05', 10.35),
  ('Maxi', '2026-07-04', '2026-07-05', 69.80),
  ('Super C', '2026-07-04', '2026-07-05', 55.92),
  ('Maxi', '2026-07-04', '2026-07-05', 87.04),
  ('Maxi', '2026-07-05', null, 60.00),
  ('Maxi', '2026-07-06', null, 59.80),
  ('Bourassa', '2026-07-07', null, 40.19),
  ('Maxi', '2026-07-07', null, 120.14),
  ('Super C', '2026-07-07', null, 23.79),
  ('Super C', '2026-07-07', null, 47.87),
  ('Super C', '2026-07-08', null, 18.47),
  ('Maxi', '2026-07-11', '2026-07-12', 171.93),
  ('Maxi', '2026-07-14', null, 307.76),
  ('Super C', '2026-07-15', null, 26.52),
  ('Maxi', '2026-07-15', null, 197.12),
  ('Maxi', '2026-07-15', null, 89.70),
  ('Maxi', '2026-07-15', null, 96.00),
  ('Maxi', '2026-07-16', null, 37.31),
  ('Maxi', '2026-07-17', null, 42.45),
  ('Maxi', '2026-07-18', null, 319.35),
  ('Maxi', '2026-07-18', null, 16.80),
  ('Maxi', '2026-07-19', null, 64.92),
  ('Super C', '2026-07-23', null, 162.60),
  ('Maxi', '2026-07-26', null, 16.80),
  ('Super C', '2026-07-27', null, 125.66),
  ('Super C', '2026-07-27', null, 24.64),
  ('Colabor', '2026-07-27', '2026-08-02', 2748.05),
  ('Colabor', '2026-07-27', '2026-08-02', 270.64),
  ('Colabor', '2026-07-29', '2026-08-02', 4984.28),
  ('Colabor', '2026-08-04', '2026-08-09', 2936.04),
  ('Colabor', '2026-08-06', '2026-08-09', 3985.04),
  ('Colabor', '2026-08-11', '2026-08-16', 2476.82),
  ('Colabor', '2026-08-13', '2026-08-16', 3235.55),
  ('Colabor', '2026-08-18', '2026-08-23', 139.95),
  ('Colabor', '2026-08-18', '2026-08-23', 1198.04),
  ('Colabor', '2026-08-20', '2026-08-30', 620.59),
  ('Colabor', '2026-08-31', null, 3701.12),
  ('Colabor', '2026-09-03', '2026-09-06', 421.80),
  ('Colabor', '2026-09-03', '2026-09-06', 412.53),
  ('Colabor', '2026-09-08', null, 2734.31),
  ('Colabor', '2026-09-14', null, 3094.57),
  ('Colabor', '2026-09-22', null, 4012.09),
  ('Colabor', '2026-09-22', null, 434.45),
  ('Colabor', '2026-09-29', null, 4089.69);
-- 67 groupes ; assiettes datées : 31323.
insert into commande.couts_groupes (annee, nom, personnes, repas, debut, fin, ordre) values
  (2025, 'Direction + staff cuisine (oct)', 5, 16, '2025-10-01', '2025-10-31', 1),
  (2025, 'CIMF', 135, 7, '2025-10-01', '2025-10-31', 2),
  (2025, 'CCHEC', 100, 1, '2025-10-01', '2025-10-31', 3),
  (2025, 'PAQ', 30, 7, '2025-10-01', '2025-10-31', 4),
  (2025, 'Mariage de Michael', 60, 1, '2025-10-01', '2025-10-31', 5),
  (2025, 'La Corvée', 20, 1, '2025-11-01', '2025-11-30', 6),
  (2025, 'Direction + staff cuisine (déc)', 5, 7, '2025-12-01', '2025-12-31', 7),
  (2025, 'Polyvalente des Monts', 31, 5, '2025-12-01', '2025-12-31', 8),
  (2025, 'CPE Les Petits Manitous', 30, 1, '2025-12-01', '2025-12-31', 9),
  (2025, 'Ministères', 50, 1, '2025-12-01', '2025-12-31', 10),
  (2025, 'Noël LUTRA', 45, 1, '2025-12-01', '2025-12-31', 11),
  (2025, 'Noël des Patriarco', 30, 1, '2025-12-01', '2025-12-31', 12),
  (2025, 'Collège Champlain', 60, 6, '2026-01-01', '2026-01-31', 13),
  (2025, 'Collège Dawson', 25, 4, '2026-01-01', '2026-01-31', 14),
  (2025, 'Collège Champlain', 60, 3, '2026-01-01', '2026-01-31', 15),
  (2025, 'École Mille-Sport', 96, 7, '2026-01-01', '2026-01-31', 16),
  (2025, 'Poly Deux-montagne', 182, 4, '2026-02-01', '2026-02-28', 17),
  (2025, 'Dawson', 26, 6, '2026-02-01', '2026-02-28', 18),
  (2025, 'PET', 40, 7, '2026-02-01', '2026-02-28', 19),
  (2025, 'St-anthony Elementay School', 40, 7, '2026-02-01', '2026-02-28', 20),
  (2025, 'École des Ramiles', 39, 7, '2026-02-01', '2026-02-28', 21),
  (2025, 'North Star Academy', 21, 2, null, null, 22),
  (2025, 'Dawson', 30, 6, '2026-03-01', '2026-03-31', 23),
  (2025, 'Dawson', 25, 6, '2026-03-01', '2026-03-31', 24),
  (2025, 'Équipe de compétition St-Sauveur', 20, 12, '2026-03-01', '2026-03-31', 25),
  (2025, 'Snowhawks', 65, 14, '2026-03-01', '2026-03-31', 26),
  (2025, 'Association étudiante polytechnique', 130, 3, '2026-03-01', '2026-03-31', 27),
  (2025, 'Formation anim 1 (Mai)', 35, 5, null, null, 28),
  (2025, 'Kells Academy', 79, 4, '2026-05-01', '2026-05-31', 29),
  (2025, 'Charlemagne', 39, 3, '2026-05-01', '2026-05-31', 30),
  (2025, 'Jean-Grou', 57, 7, '2026-05-01', '2026-05-31', 31),
  (2025, 'Rochambeau', 118, 26, '2026-05-01', '2026-05-31', 32),
  (2025, 'St-paul de la Croix', 46, 4, '2026-05-01', '2026-05-31', 33),
  (2025, 'Cavelier de LaSalle', 54, 3, '2026-05-01', '2026-05-31', 34),
  (2025, 'École de Karaté Therriault', 32, 6, '2026-05-01', '2026-05-31', 35),
  (2025, 'Paul Bruchési', 107, 6, '2026-05-01', '2026-05-31', 36),
  (2025, 'Tribut', 20, 6, '2026-05-01', '2026-05-31', 37),
  (2025, 'AE', 41, 2, '2026-06-01', '2026-06-27', 38),
  (2025, 'John F Kennedy', 25, 7, '2026-06-01', '2026-06-27', 39),
  (2025, 'Formation anim 2 (Juin)', 43, 5, '2026-06-01', '2026-06-27', 40),
  (2025, 'Mille-Fleurs', 119, 4, '2026-06-01', '2026-06-27', 41),
  (2025, 'École Boisée', 77, 4, '2026-06-01', '2026-06-27', 42),
  (2025, 'St-Marc', 83, 4, '2026-06-01', '2026-06-27', 43),
  (2025, 'De la Rive', 67, 7, '2026-06-01', '2026-06-27', 44),
  (2025, 'Jonathan-Wilson', 51, 7, '2026-06-01', '2026-06-27', 45),
  (2025, 'Cano camping anims', 23, 3, null, null, 46),
  (2025, 'Semaine 1', 150, 19, '2026-06-28', '2026-07-04', 47),
  (2025, 'Entrecamp 1-2', 90, 2, '2026-06-28', '2026-07-04', 48),
  (2025, 'Semaine 2', 179, 19, '2026-07-05', '2026-07-11', 49),
  (2025, 'Entrecamp 2-3', 90, 2, '2026-07-05', '2026-07-11', 50),
  (2025, 'Semaine 3', 183, 19, '2026-07-12', '2026-07-18', 51),
  (2025, 'Entrecamp 3-4', 90, 2, '2026-07-12', '2026-07-18', 52),
  (2025, 'Semaine 4', 181, 19, '2026-07-19', '2026-07-25', 53),
  (2025, 'Entrecamp 4-5', 90, 2, '2026-07-19', '2026-07-25', 54),
  (2025, 'Semaine 5', 157, 19, '2026-07-26', '2026-08-01', 55),
  (2025, 'Entrecamp 5-6', 90, 2, '2026-07-26', '2026-08-01', 56),
  (2025, 'Sacre Heart School', 43, 7, null, null, 57),
  (2025, 'Culb Vélorette', 42, 6, null, null, 58),
  (2025, 'Westboro', 25, 6, null, null, 59),
  (2025, 'Dawson', 26, 7, null, null, 60),
  (2025, 'LFNY', 100, 15, null, null, 61),
  (2025, 'Sepaq', 100, 1, null, null, 62),
  (2025, 'Astro', 32, 5, null, null, 63),
  (2025, 'Dawson', 26, 4, null, null, 64),
  (2025, 'CIMF', 125, 7, null, null, 65),
  (2025, 'Dawson', 26, 7, null, null, 66),
  (2025, 'LFNY', 100, 0, null, null, 67);
insert into commande.couts_postes (id, nom, ordre) values
  ('5071436d-861a-5688-b7ff-15573472e569', 'Chefs', 1),
  ('da495b7c-859e-5fe8-8d39-f97012d4bfb1', 'Cuisinières', 2),
  ('a30ea619-f7f6-576d-9942-e6e93c82452b', 'Moutic', 3),
  ('b93e09ca-0d0b-5648-bd5a-49e4eb676ef9', 'Stéphanie', 4),
  ('063453a0-31e4-5136-b990-f400da32ce17', 'Sakky', 5),
  ('78a6a00d-fc41-5771-9b6a-a9a716b379a8', 'Marmitons', 6),
  ('2b3c89bd-0beb-53b3-bc5a-7224abd5a900', 'Sarah', 7);
-- 53 montants, total 76882.19 $.
insert into commande.couts_salaires (debut_paie, poste_id, montant) values
  ('2026-02-08', '5071436d-861a-5688-b7ff-15573472e569', 1638.00),
  ('2026-02-22', '5071436d-861a-5688-b7ff-15573472e569', 2320.50),
  ('2026-03-08', '5071436d-861a-5688-b7ff-15573472e569', 1583.40),
  ('2026-03-22', '5071436d-861a-5688-b7ff-15573472e569', 850.20),
  ('2026-04-19', '5071436d-861a-5688-b7ff-15573472e569', 678.60),
  ('2026-05-03', '5071436d-861a-5688-b7ff-15573472e569', 3077.10),
  ('2026-05-17', '5071436d-861a-5688-b7ff-15573472e569', 3927.93),
  ('2026-05-31', '5071436d-861a-5688-b7ff-15573472e569', 1039.27),
  ('2026-06-14', '5071436d-861a-5688-b7ff-15573472e569', 1306.50),
  ('2026-06-28', '5071436d-861a-5688-b7ff-15573472e569', 3536.72),
  ('2026-07-12', '5071436d-861a-5688-b7ff-15573472e569', 1879.80),
  ('2026-07-26', '5071436d-861a-5688-b7ff-15573472e569', 2152.80),
  ('2026-08-09', '5071436d-861a-5688-b7ff-15573472e569', 2176.20),
  ('2025-10-05', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 750.62),
  ('2025-11-30', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 777.02),
  ('2025-12-28', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 553.13),
  ('2026-01-11', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 1151.54),
  ('2026-01-25', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 74.50),
  ('2026-02-08', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 1414.28),
  ('2026-02-22', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 1410.12),
  ('2026-03-08', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 707.20),
  ('2026-03-22', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 707.20),
  ('2026-04-05', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 707.20),
  ('2026-04-19', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 300.82),
  ('2026-05-03', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 999.12),
  ('2026-05-17', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 1536.22),
  ('2026-05-31', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 729.70),
  ('2026-06-14', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 1553.82),
  ('2026-06-28', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 5837.14),
  ('2026-07-12', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 7073.84),
  ('2026-07-26', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 5351.23),
  ('2026-08-09', 'da495b7c-859e-5fe8-8d39-f97012d4bfb1', 5409.46),
  ('2025-12-28', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 124.49),
  ('2026-01-11', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 336.96),
  ('2026-02-08', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 140.40),
  ('2026-05-03', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 252.72),
  ('2026-05-17', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 451.12),
  ('2026-06-14', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 336.96),
  ('2026-06-28', 'a30ea619-f7f6-576d-9942-e6e93c82452b', 463.36),
  ('2026-06-28', 'b93e09ca-0d0b-5648-bd5a-49e4eb676ef9', 1440.95),
  ('2026-07-12', 'b93e09ca-0d0b-5648-bd5a-49e4eb676ef9', 1449.00),
  ('2026-07-26', 'b93e09ca-0d0b-5648-bd5a-49e4eb676ef9', 1334.00),
  ('2026-08-09', 'b93e09ca-0d0b-5648-bd5a-49e4eb676ef9', 586.50),
  ('2026-05-03', '063453a0-31e4-5136-b990-f400da32ce17', 957.60),
  ('2026-05-17', '063453a0-31e4-5136-b990-f400da32ce17', 1073.88),
  ('2026-05-31', '063453a0-31e4-5136-b990-f400da32ce17', 136.80),
  ('2026-06-14', '063453a0-31e4-5136-b990-f400da32ce17', 547.20),
  ('2026-06-28', '063453a0-31e4-5136-b990-f400da32ce17', 772.07),
  ('2026-07-12', '063453a0-31e4-5136-b990-f400da32ce17', 1368.00),
  ('2026-07-26', '063453a0-31e4-5136-b990-f400da32ce17', 820.00),
  ('2025-10-05', '2b3c89bd-0beb-53b3-bc5a-7224abd5a900', 630.50),
  ('2025-10-19', '2b3c89bd-0beb-53b3-bc5a-7224abd5a900', 370.50),
  ('2025-12-28', '2b3c89bd-0beb-53b3-bc5a-7224abd5a900', 78.00);
