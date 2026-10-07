-- ============================================================
-- Petite caisse (demande de Maxime du 2026-10-07 ; remplace le Google
-- Sheets « Suivi petite caisse 2026 » et son Google Form) : l'argent
-- comptant reçu ou sorti, par poche. Réservé aux admins au départ (aucune
-- ligne dans la grille : seul l'admin y entre).
--
-- Une poche = une compagnie du référentiel (core.entreprises) ou une poche
-- personnelle (caisse.poches : un admin qui a payé de sa poche). Le total
-- de toutes les poches = l'argent dans la caisse.
--
-- Avance « payé de ma poche » : deux lignes qui partagent `avance_id`, la
-- compagnie en sortie et la poche personnelle en entrée (même montant) ;
-- le total ne bouge pas. Le remboursement = la poche personnelle en sortie.
--
-- Québec ⚜️ / International 🌎 : obligatoire sur toute ligne d'une
-- compagnie de caisse.compagnies_qc_int (Opikawa), interdit ailleurs.
-- ============================================================

-- ------------------------------------------------------------
-- Module caisse dans les contraintes d'accès (aucune ligne dans la
-- grille : admins seulement).
-- ------------------------------------------------------------
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse'));

create schema if not exists caisse;

-- Poche personnelle : l'argent de la caisse qui revient à quelqu'un.
create table caisse.poches (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  -- Compte de la personne (« Payé de ma poche » trouve sa poche par ici).
  profil_id uuid unique references core.profils(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table caisse.poches is 'Poches personnelles de la petite caisse (avances payées de sa poche)';

-- Compagnies dont chaque ligne dit Québec ou International.
create table caisse.compagnies_qc_int (
  entreprise_id uuid primary key references core.entreprises(id) on delete cascade
);

create table caisse.transactions (
  id uuid primary key default gen_random_uuid(),
  jour date not null,
  entreprise_id uuid references core.entreprises(id) on delete restrict,
  poche_id uuid references caisse.poches(id) on delete restrict,
  region text check (region in ('qc','int')),
  sens text not null check (sens in ('entree','sortie')),
  montant numeric(12,2) not null check (montant > 0),
  details text not null check (btrim(details) <> ''),
  -- Les deux lignes d'une avance « payé de ma poche ».
  avance_id uuid,
  -- Qui a inscrit la ligne (posé par la base ; nom copié pour l'historique).
  saisi_par uuid references core.profils(id) on delete set null,
  saisi_par_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(entreprise_id, poche_id) = 1)
);

comment on table caisse.transactions is 'Entrées et sorties d''argent comptant de la petite caisse, par poche';

create index idx_caisse_transactions_jour on caisse.transactions(jour);
create index idx_caisse_transactions_avance on caisse.transactions(avance_id) where avance_id is not null;

create trigger trg_caisse_transactions_updated_at before update on caisse.transactions
for each row execute function core.maj_updated_at();

-- Région obligatoire (ou interdite) selon la compagnie ; auteur posé par
-- la base et jamais changé ensuite.
create function caisse.verifier_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entreprise_id is not null
     and exists (select 1 from caisse.compagnies_qc_int c where c.entreprise_id = new.entreprise_id) then
    if new.region is null then
      raise exception 'Préciser Québec ou International pour cette compagnie.';
    end if;
  elsif new.region is not null then
    new.region := null;
  end if;

  if tg_op = 'INSERT' then
    -- Sans session (migration), l'auteur fourni est gardé.
    if auth.uid() is not null then
      new.saisi_par := auth.uid();
      new.saisi_par_nom := (select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
                              from core.profils p where p.id = auth.uid());
    end if;
  else
    new.saisi_par := old.saisi_par;
    new.saisi_par_nom := old.saisi_par_nom;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger trg_caisse_verifier before insert or update on caisse.transactions
for each row execute function caisse.verifier_transaction();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema caisse to authenticated, service_role;
grant select, insert, update, delete on all tables in schema caisse to authenticated, service_role;

alter table caisse.poches enable row level security;
alter table caisse.compagnies_qc_int enable row level security;
alter table caisse.transactions enable row level security;

create policy "Lire" on caisse.poches for select to authenticated
  using (core.peut_lire('caisse'));
create policy "Écrire" on caisse.poches for all to authenticated
  using (core.peut_ecrire('caisse')) with check (core.peut_ecrire('caisse'));

create policy "Lire" on caisse.compagnies_qc_int for select to authenticated
  using (core.peut_lire('caisse'));

create policy "Lire" on caisse.transactions for select to authenticated
  using (core.peut_lire('caisse'));
create policy "Écrire" on caisse.transactions for all to authenticated
  using (core.peut_ecrire('caisse')) with check (core.peut_ecrire('caisse'));

alter publication supabase_realtime add table caisse.transactions, caisse.poches;

-- ------------------------------------------------------------
-- Import du Sheets (onglet « Réponses au formulaire », 111 lignes du
-- 27 mai au 18 septembre 2026). « BPA » = GBPA+ (réponse de Maxime).
-- Les compagnies ont les mêmes id en PROD et dans les données de test ;
-- sur une base vide (DEV remise à zéro), elles sont créées ici et
-- seed.sql les complète. Les avances (poche perso + compagnie, même
-- montant et mêmes détails, à quelques secondes d'écart) sont liées.
-- Les retraits « Cash OPI international » du 10 août n'avaient pas de
-- marqueur : International.
-- Soldes attendus : total 37 036,98 $ ; GBPA+ 22 613,20 ; Opikawa
-- 9 293,48 (Québec 5 660,00, International 3 633,48) ; Aquabounga
-- 4 815,00 ; Rouge & Diable 315,00 ; Maxime 0,30 ; Marco 0,00.
-- ------------------------------------------------------------
insert into core.entreprises (id, nom, ordre) values
  ('d5c57473-f9b8-58b9-8312-11c3e45fb07a', 'GBPA+', 1),
  ('635cb5aa-a46d-551f-a54e-de440410c09f', 'Opikawa', 2),
  ('f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950', 'Aquabounga', 4),
  ('b057c513-f0d2-5299-8620-7749ee2047a7', 'Rouge & Diable', 5)
on conflict (id) do nothing;

insert into caisse.compagnies_qc_int (entreprise_id) values ('635cb5aa-a46d-551f-a54e-de440410c09f');

insert into caisse.poches (nom, profil_id) values
  ('Maxime', (select id from core.profils where lower(courriel) = 'maxime@camptremblant.com')),
  ('Marco', (select id from core.profils where lower(courriel) = 'marco@camptremblant.com'));

insert into caisse.transactions
  (jour, entreprise_id, poche_id, region, sens, montant, details, avance_id, saisi_par, saisi_par_nom, created_at, updated_at)
select v.jour::date,
       case v.compagnie
         when 'GBPA+' then 'd5c57473-f9b8-58b9-8312-11c3e45fb07a'::uuid
         when 'OPI' then '635cb5aa-a46d-551f-a54e-de440410c09f'::uuid
         when 'AQB' then 'f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950'::uuid
         when 'R&D' then 'b057c513-f0d2-5299-8620-7749ee2047a7'::uuid
       end,
       p.id, v.region, v.sens, v.montant, v.details, v.avance_id,
       (select q.profil_id from caisse.poches q where q.nom = v.qui), v.qui, v.horodateur, v.horodateur
from (values
  ('2026-05-27', 'GBPA+', null, null, 'entree', 600.00, 'Vente four piano', null::uuid, 'Marco', '2026-05-27 10:00:22-04'::timestamptz),
  ('2026-05-27', 'GBPA+', null, null, 'entree', 1800.00, 'BPA-26-271 William Leclerc', null::uuid, 'Marco', '2026-05-27 11:30:08-04'::timestamptz),
  ('2026-05-27', 'GBPA+', null, null, 'entree', 1784.00, 'BPA-26-269 - Justin Leclerc', null::uuid, 'Marco', '2026-05-27 11:30:45-04'::timestamptz),
  ('2026-05-29', null, 'Maxime', null, 'entree', 500.00, 'Avance salaire Baobab payé avec argent perso max (virement interac)', '25f8a4ec-33b9-5748-ae8e-6791cc44b1d1'::uuid, 'Maxime', '2026-05-29 17:01:45-04'::timestamptz),
  ('2026-05-29', 'GBPA+', null, null, 'sortie', 500.00, 'Avance salaire Baobab payé avec argent perso max (virement interac)', '25f8a4ec-33b9-5748-ae8e-6791cc44b1d1'::uuid, 'Maxime', '2026-05-29 17:01:45-04'::timestamptz),
  ('2026-06-09', null, 'Maxime', null, 'entree', 1200.00, 'Avance salaire Baobab', '2d282cbc-68a4-564a-a64a-a6bf5bc71681'::uuid, 'Maxime', '2026-06-09 14:04:16-04'::timestamptz),
  ('2026-06-09', 'GBPA+', null, null, 'sortie', 1200.00, 'Avance salaire Baobab', '2d282cbc-68a4-564a-a64a-a6bf5bc71681'::uuid, 'Maxime', '2026-06-09 14:04:16-04'::timestamptz),
  ('2026-06-28', 'OPI', null, 'int', 'entree', 1590.00, 'OPI-26-043 / Lucinda Warner', null::uuid, 'Marco', '2026-06-28 15:17:41-04'::timestamptz),
  ('2026-06-28', 'OPI', null, 'qc', 'entree', 653.50, 'OPI-26-076 / Mathias Ouellet Moali', null::uuid, 'Marco', '2026-06-28 19:19:04-04'::timestamptz),
  ('2026-06-28', 'OPI', null, 'qc', 'entree', 653.50, 'OPI-26-077 / Esteban Ouellet Moali', null::uuid, 'Marco', '2026-06-28 19:19:51-04'::timestamptz),
  ('2026-06-28', 'OPI', null, 'int', 'entree', 260.00, 'OPI-26-095 / Anna Perrin', null::uuid, 'Marco', '2026-06-28 19:21:00-04'::timestamptz),
  ('2026-06-29', 'GBPA+', null, null, 'entree', 139.00, 'BPA-26-846 / Siam Bergeron', null::uuid, 'Marco', '2026-06-29 08:52:59-04'::timestamptz),
  ('2026-06-30', 'AQB', null, null, 'entree', 520.00, 'Paiement cash', null::uuid, 'Marco', '2026-06-30 12:33:50-04'::timestamptz),
  ('2026-06-30', 'R&D', null, null, 'entree', 30.00, 'Paiement cash', null::uuid, 'Marco', '2026-06-30 12:34:09-04'::timestamptz),
  ('2026-06-30', null, 'Maxime', null, 'sortie', 1700.00, 'Remboursement avance salaire bao', null::uuid, 'Marco', '2026-06-30 12:34:09-04'::timestamptz),
  ('2026-07-03', 'AQB', null, null, 'entree', 250.00, 'Paiement cash', null::uuid, 'Marco', '2026-07-03 15:43:56-04'::timestamptz),
  ('2026-07-04', null, 'Maxime', null, 'entree', 126.70, 'Paie Brigitte 11 juin', '34b8217d-4e60-5d72-8e62-8e1fa36b9f22'::uuid, 'Maxime', '2026-07-04 08:46:58-04'::timestamptz),
  ('2026-07-04', 'GBPA+', null, null, 'sortie', 126.70, 'Paie Brigitte 11 juin', '34b8217d-4e60-5d72-8e62-8e1fa36b9f22'::uuid, 'Maxime', '2026-07-04 08:47:17-04'::timestamptz),
  ('2026-07-04', null, 'Maxime', null, 'entree', 480.00, 'Paie Joanne Semaine 15 juin', 'd955e25c-bc97-5865-8703-179d8e03ae35'::uuid, 'Maxime', '2026-07-04 08:49:15-04'::timestamptz),
  ('2026-07-04', 'GBPA+', null, null, 'sortie', 480.00, 'Paie Joanne Semaine 15 juin', 'd955e25c-bc97-5865-8703-179d8e03ae35'::uuid, 'Maxime', '2026-07-04 08:49:30-04'::timestamptz),
  ('2026-07-04', null, 'Maxime', null, 'entree', 470.60, 'Paie Brigitte semaine 15 juin', '06cb9ac4-0e79-506e-bae6-d952ae6a9ea8'::uuid, 'Maxime', '2026-07-04 08:54:40-04'::timestamptz),
  ('2026-07-04', 'GBPA+', null, null, 'sortie', 470.60, 'Paie Brigitte semaine 15 juin', '06cb9ac4-0e79-506e-bae6-d952ae6a9ea8'::uuid, 'Maxime', '2026-07-04 08:54:58-04'::timestamptz),
  ('2026-07-05', 'OPI', null, 'int', 'entree', 375.00, 'Merch Semaine 1 cash', null::uuid, 'Marco', '2026-07-05 11:12:58-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1476.30, 'BPA-26-868 Carla Teisseire', null::uuid, 'Marco', '2026-07-05 18:39:15-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1186.50, 'BPA-26-376 ET BPA-26-493 Luka et Alexa Jolicoeur', null::uuid, 'Marco', '2026-07-05 18:40:49-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1363.75, 'BPA-26-521 Bianka Forest', null::uuid, 'Marco', '2026-07-05 18:43:00-04'::timestamptz),
  ('2026-07-05', 'OPI', null, 'int', 'entree', 3306.80, 'OPI-26-182', null::uuid, 'Marco', '2026-07-05 18:45:26-04'::timestamptz),
  ('2026-07-05', 'OPI', null, 'int', 'entree', 100.00, 'OPI-26-072 Yamine Atallah', null::uuid, 'Marco', '2026-07-05 18:47:01-04'::timestamptz),
  ('2026-07-05', 'OPI', null, 'int', 'entree', 3060.00, 'OPI-26-083', null::uuid, 'Marco', '2026-07-05 18:47:49-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1255.00, 'BPA-26-853 Mila-Rose Leblanc', null::uuid, 'Marco', '2026-07-05 19:17:15-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1364.00, 'BPA-26-848 Léonard Huysmaus-Guillemette', null::uuid, 'Marco', '2026-07-05 19:19:21-04'::timestamptz),
  ('2026-07-05', 'GBPA+', null, null, 'entree', 1215.00, 'BPA-26-861 Liliane Boudreault', null::uuid, 'Marco', '2026-07-05 19:20:31-04'::timestamptz),
  ('2026-07-06', 'AQB', null, null, 'entree', 100.00, 'Paiement cash', null::uuid, 'Marco', '2026-07-06 10:59:58-04'::timestamptz),
  ('2026-07-08', 'R&D', null, null, 'entree', 125.00, 'Paiement cash', null::uuid, 'Marco', '2026-07-08 06:57:16-04'::timestamptz),
  ('2026-07-09', 'OPI', null, 'int', 'entree', 130.00, 'OPI - Ajout glissades d''eau - Joy Champion', null::uuid, 'Marco', '2026-07-09 11:45:39-04'::timestamptz),
  ('2026-07-12', 'AQB', null, null, 'entree', 220.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-12 08:42:36-04'::timestamptz),
  ('2026-07-12', 'R&D', null, null, 'entree', 320.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-12 10:43:34-04'::timestamptz),
  ('2026-07-12', 'AQB', null, null, 'entree', 270.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-12 10:44:12-04'::timestamptz),
  ('2026-07-12', 'OPI', null, 'int', 'entree', 442.00, 'Merch Semaine 2', null::uuid, 'Marco', '2026-07-12 11:21:55-04'::timestamptz),
  ('2026-07-12', 'OPI', null, 'int', 'entree', 157.36, 'OPI-26-021 Malaya Montano', null::uuid, 'Marco', '2026-07-12 18:32:28-04'::timestamptz),
  ('2026-07-12', 'OPI', null, 'int', 'entree', 6000.00, 'OPI-26-308 OPI-26-309 Abril et Ivri Toiber', null::uuid, 'Marco', '2026-07-12 18:33:38-04'::timestamptz),
  ('2026-07-15', 'R&D', null, null, 'entree', 110.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-15 10:18:11-04'::timestamptz),
  ('2026-07-15', 'AQB', null, null, 'entree', 220.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-15 10:18:34-04'::timestamptz),
  ('2026-07-15', 'GBPA+', null, null, 'entree', 2264.00, 'BPA-26-395 BPA-26-329 William et Louis-Charles Labelle', null::uuid, 'Marco', '2026-07-15 10:20:28-04'::timestamptz),
  ('2026-07-15', 'GBPA+', null, null, 'entree', 1106.10, 'BPA-26-180 Alex Légaré', null::uuid, 'Marco', '2026-07-15 10:21:02-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 1543.60, 'OPI-26-131 Tristan Semedard', null::uuid, 'Marco', '2026-07-20 13:08:25-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 1543.60, 'OPI-26-132 Prudence Semerard', null::uuid, 'Marco', '2026-07-20 13:09:11-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 3745.40, 'OPI-26-028 Yoonji McCormick', null::uuid, 'Marco', '2026-07-20 13:12:52-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 110.00, 'OPI-26-287 Maria Romero', null::uuid, 'Marco', '2026-07-20 13:14:50-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 3337.22, 'OPI-26-183 Clara Carter', null::uuid, 'Marco', '2026-07-20 13:16:13-04'::timestamptz),
  ('2026-07-20', 'GBPA+', null, null, 'entree', 57.50, 'BPA-26-666 Elliot Robitaille', null::uuid, 'Marco', '2026-07-20 13:17:50-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 200.00, 'Emilano et Mateo Babatz OPI remaining amount', null::uuid, 'Marco', '2026-07-20 14:51:44-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 150.50, 'OPI-26-117', null::uuid, 'Marco', '2026-07-20 14:54:45-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 345.00, 'OPI-26-026', null::uuid, 'Marco', '2026-07-20 14:55:39-04'::timestamptz),
  ('2026-07-20', 'OPI', null, 'int', 'entree', 1265.00, 'OPI-26-312 Juliette Quinet', null::uuid, 'Marco', '2026-07-20 14:56:37-04'::timestamptz),
  ('2026-07-20', 'GBPA+', null, null, 'entree', 1106.00, 'BPA-26-377 Noah Souvenir', null::uuid, 'Marco', '2026-07-20 14:58:41-04'::timestamptz),
  ('2026-07-20', 'R&D', null, null, 'entree', 50.00, 'Paiement cash', null::uuid, 'Marco', '2026-07-20 15:00:35-04'::timestamptz),
  ('2026-07-20', 'AQB', null, null, 'entree', 560.00, 'Paiement cash', null::uuid, 'Marco', '2026-07-20 15:01:04-04'::timestamptz),
  ('2026-07-25', 'AQB', null, null, 'entree', 950.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-25 14:40:11-04'::timestamptz),
  ('2026-07-26', 'OPI', null, 'int', 'sortie', 132.00, 'Remboursement Emilio Barra', null::uuid, 'Marco', '2026-07-26 11:27:08-04'::timestamptz),
  ('2026-07-26', 'R&D', null, null, 'entree', 240.00, 'Paiement Cash', null::uuid, 'Marco', '2026-07-26 11:27:42-04'::timestamptz),
  ('2026-07-26', 'OPI', null, 'int', 'entree', 140.00, 'OPI-26-294', null::uuid, 'Marco', '2026-07-26 11:28:06-04'::timestamptz),
  ('2026-07-26', 'OPI', null, 'int', 'entree', 240.00, 'Merch Sem 4', null::uuid, 'Marco', '2026-07-26 11:29:01-04'::timestamptz),
  ('2026-07-27', 'OPI', null, 'qc', 'entree', 225.00, 'OPI-26-325 Lazar Kovacevic', null::uuid, 'Marco', '2026-07-27 10:44:24-04'::timestamptz),
  ('2026-07-27', 'OPI', null, 'int', 'entree', 2775.00, 'OPI-26-215-216-127 Isabella, Ethan, Evelyn', null::uuid, 'Marco', '2026-07-27 10:45:31-04'::timestamptz),
  ('2026-07-27', 'GBPA+', null, null, 'entree', 1215.35, 'BPA-26-900 Zack Thériault', null::uuid, 'Marco', '2026-07-27 10:47:44-04'::timestamptz),
  ('2026-07-27', 'OPI', null, 'int', 'entree', 20.00, 'OPI-26-207 Nicolas Bauer', null::uuid, 'Marco', '2026-07-27 10:48:45-04'::timestamptz),
  ('2026-07-27', 'GBPA+', null, null, 'entree', 2155.00, 'BPA-26-928-929 Charlize et Noeva Bélanger', null::uuid, 'Marco', '2026-07-27 10:49:36-04'::timestamptz),
  ('2026-07-27', 'OPI', null, 'int', 'entree', 3685.00, 'OPI-26-196', null::uuid, 'Marco', '2026-07-27 10:53:29-04'::timestamptz),
  ('2026-08-01', 'R&D', null, null, 'entree', 125.00, 'Paiement Cash', null::uuid, 'Marco', '2026-08-01 11:26:32-04'::timestamptz),
  ('2026-08-01', 'GBPA+', null, null, 'entree', 28.00, 'BPA-26-388 - Alex Teasdale', null::uuid, 'Marco', '2026-08-01 11:27:27-04'::timestamptz),
  ('2026-08-01', 'AQB', null, null, 'entree', 480.00, 'Paiement Cash', null::uuid, 'Marco', '2026-08-01 11:28:18-04'::timestamptz),
  ('2026-08-02', 'OPI', null, 'int', 'entree', 320.00, 'Merch semaine 6', null::uuid, 'Marco', '2026-08-02 13:53:32-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'int', 'entree', 700.00, 'OPI-26-310 - Layla Abalkhail', null::uuid, 'Marco', '2026-08-03 10:58:30-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'int', 'entree', 100.00, 'OPI-26-087 - Luka Herrera', null::uuid, 'Marco', '2026-08-03 11:00:11-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'int', 'entree', 440.00, 'OPI-26-171 173 - Kent et Claire', null::uuid, 'Marco', '2026-08-03 11:01:20-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'int', 'entree', 230.00, 'OPI-26-154 Husain', null::uuid, 'Marco', '2026-08-03 11:03:41-04'::timestamptz),
  ('2026-08-03', 'GBPA+', null, null, 'entree', 60.00, 'BPA-26-181 - Narina Nemeroff', null::uuid, 'Marco', '2026-08-03 11:04:47-04'::timestamptz),
  ('2026-08-03', 'GBPA+', null, null, 'entree', 1220.00, 'BPA-26-649 Jasmine Massy', null::uuid, 'Marco', '2026-08-03 11:06:38-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'qc', 'entree', 3751.00, 'OPI-26-240 William Delforge', null::uuid, 'Marco', '2026-08-03 11:07:42-04'::timestamptz),
  ('2026-08-03', 'OPI', null, 'int', 'entree', 6000.00, 'OPI-26-048 Demian Kochelykov', null::uuid, 'Marco', '2026-08-03 11:08:54-04'::timestamptz),
  ('2026-08-05', 'AQB', null, null, 'entree', 730.00, 'Paiement cash', null::uuid, 'Marco', '2026-08-05 09:25:34-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'entree', 260.00, 'Merch 6', null::uuid, 'Marco', '2026-08-10 08:30:17-04'::timestamptz),
  ('2026-08-10', 'AQB', null, null, 'entree', 510.00, 'Paiement Cash', null::uuid, 'Marco', '2026-08-10 08:31:06-04'::timestamptz),
  ('2026-08-10', 'GBPA+', null, null, 'entree', 630.00, 'BPA-26-920 Nailah Rose Nouiche Dimanja', null::uuid, 'Marco', '2026-08-10 08:31:58-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'entree', 3340.00, 'OPI-26-112 Marlene Gronbach', null::uuid, 'Marco', '2026-08-10 08:34:44-04'::timestamptz),
  ('2026-08-10', 'GBPA+', null, null, 'entree', 2757.00, 'BPA-26-638-639 Elliott et Sebastien Ertaskiran', null::uuid, 'Marco', '2026-08-10 08:37:05-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'entree', 2870.00, 'OPI-26-030 Hadren Guinchard Fuentes', null::uuid, 'Marco', '2026-08-10 08:38:16-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'qc', 'entree', 377.00, 'OPI-26-104 Mia Provencal', null::uuid, 'Marco', '2026-08-10 08:40:18-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'entree', 32.00, 'OPI-26-196 Leo Kruglikov', null::uuid, 'Marco', '2026-08-10 08:50:09-04'::timestamptz),
  ('2026-08-10', 'GBPA+', null, null, 'entree', 1218.00, 'BPA-26-881 Gabrielle Fernandez', null::uuid, 'Marco', '2026-08-10 08:50:56-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'entree', 345.00, 'OPI-26-215-216-217', null::uuid, 'Marco', '2026-08-10 08:53:21-04'::timestamptz),
  ('2026-08-10', null, 'Marco', null, 'entree', 360.00, 'Foin', '2972c104-1093-5ef4-970e-fb4d4a0561aa'::uuid, 'Marco', '2026-08-10 12:50:42-04'::timestamptz),
  ('2026-08-10', 'GBPA+', null, null, 'sortie', 360.00, 'Foin', '2972c104-1093-5ef4-970e-fb4d4a0561aa'::uuid, 'Marco', '2026-08-10 12:50:59-04'::timestamptz),
  ('2026-08-10', null, 'Marco', null, 'entree', 250.00, 'Avance paie Vogue', 'f96cb62f-d965-57cf-8b5c-f5a02dd05a41'::uuid, 'Marco', '2026-08-10 12:51:20-04'::timestamptz),
  ('2026-08-10', 'GBPA+', null, null, 'sortie', 250.00, 'Avance paie Vogue', 'f96cb62f-d965-57cf-8b5c-f5a02dd05a41'::uuid, 'Marco', '2026-08-10 12:51:36-04'::timestamptz),
  ('2026-08-10', null, 'Maxime', null, 'sortie', 1077.00, 'Remboursement avance perso', null::uuid, 'Maxime', '2026-08-10 12:52:06-04'::timestamptz),
  ('2026-08-10', null, 'Marco', null, 'sortie', 610.00, 'Remboursement avance perso', null::uuid, 'Marco', '2026-08-10 12:53:02-04'::timestamptz),
  ('2026-08-10', 'R&D', null, null, 'sortie', 500.00, 'Cash R&D à Max', null::uuid, 'Maxime', '2026-08-10 12:54:55-04'::timestamptz),
  ('2026-08-10', 'R&D', null, null, 'sortie', 500.00, 'Cash R&D à Marco', null::uuid, 'Maxime', '2026-08-10 12:55:10-04'::timestamptz),
  ('2026-08-10', 'AQB', null, null, 'sortie', 2405.00, 'Cash AQB Max', null::uuid, 'Maxime', '2026-08-10 12:56:32-04'::timestamptz),
  ('2026-08-10', 'AQB', null, null, 'sortie', 2405.00, 'Cash AQB Maarco', null::uuid, 'Maxime', '2026-08-10 12:56:47-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'sortie', 24500.00, 'Cash OPI international MAX', null::uuid, 'Maxime', '2026-08-10 13:15:01-04'::timestamptz),
  ('2026-08-10', 'OPI', null, 'int', 'sortie', 24500.00, 'Cash OPI international Marco', null::uuid, 'Maxime', '2026-08-10 13:15:18-04'::timestamptz),
  ('2026-08-15', 'AQB', null, null, 'entree', 1090.00, 'Paiement cash', null::uuid, 'Marco', '2026-08-15 12:53:30-04'::timestamptz),
  ('2026-08-15', 'R&D', null, null, 'entree', 315.00, 'Paiement cash', null::uuid, 'Marco', '2026-08-15 12:53:53-04'::timestamptz),
  ('2026-08-18', 'AQB', null, null, 'entree', 2600.00, 'Paiement Cash groupe juif 17 août', null::uuid, 'Marco', '2026-08-18 09:03:56-04'::timestamptz),
  ('2026-09-18', 'AQB', null, null, 'entree', 1125.00, 'Paiement Cash', null::uuid, 'Marco', '2026-09-18 09:27:03-04'::timestamptz),
  ('2026-09-18', 'OPI', null, 'int', 'entree', 150.00, 'Natalia Castillo - Glissade d''eau', null::uuid, 'Marco', '2026-09-18 09:27:43-04'::timestamptz),
  ('2026-09-18', 'OPI', null, 'int', 'entree', 1730.00, 'OPI-26-177 - Uma Emmanuel', null::uuid, 'Marco', '2026-09-18 09:29:03-04'::timestamptz),
  ('2026-09-18', 'OPI', null, 'int', 'entree', 1727.00, 'OPI-27-067 Eva Lemoine-Busserolle', null::uuid, 'Marco', '2026-09-18 09:31:14-04'::timestamptz)
) as v(jour, compagnie, poche, region, sens, montant, details, avance_id, qui, horodateur)
left join caisse.poches p on p.nom = v.poche;

do $$
begin
  if (select count(*) from caisse.transactions) <> 111
     or (select sum(case sens when 'entree' then montant else -montant end) from caisse.transactions) <> 37036.98 then
    raise exception 'Import de la petite caisse : le total ne concorde pas avec le Sheets.';
  end if;
end $$;
