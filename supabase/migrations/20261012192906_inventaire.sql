-- ============================================================
-- inventaire : l'équipement du camp et ses comptes.
-- Remplace le Google Sheets « Inventaire - Matériel » (un onglet par
-- compagnie et par année ; demande de Maxime du 2026-10-11).
--
-- Une liste d'articles permanente (nom, type, section, lieu de
-- rangement, compagnie, nombre nécessaire). On compte quand on veut,
-- une section à la fois (choix de Maxime : pas de comptage annuel) :
-- chaque compte d'un article porte sa date (combien en bon état,
-- brisés à réparer, incomplets). Le plus récent fait foi ; les autres
-- restent dans l'historique de l'article.
--
-- Choix de Maxime (2026-10-11) : kayaks, canots et paddleboards restent
-- dans Embarcations, les véhicules dans Véhicules ; les VFI, rames et
-- pagaies vont dans Embarcations, et fonctionnent comme le reste de
-- l'inventaire (2026-10-12, « uniformiser ») : ce sont des articles de
-- sections dont `module` = 'embarcations', montrés dans Embarcations ›
-- Équipement, avec les droits d'Embarcations. Les onglets « BPA » = GBPA+.
-- Comptage sur téléphone, même sans réseau (comme Embarcations).
-- ============================================================

create schema if not exists inventaire;

-- Nouveau module dans la grille d'accès : direction en écriture au départ.
-- La liste garde aussi les modules de Réservations (pas encore en PROD).
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire'));

insert into core.acces_roles (role, module, niveau) values ('direction','inventaire','ecriture');

-- ------------------------------------------------------------
-- Listes du module (onglet Réglages) : sections et lieux.
-- ------------------------------------------------------------
create table inventaire.sections (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  -- Module où la section est montrée et qui donne les droits sur ses
  -- articles et leurs comptes (VFI, rames, pagaies : Embarcations).
  module text not null default 'inventaire' check (module in ('inventaire','embarcations')),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventaire.lieux (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Articles. Le même objet rangé à deux endroits = deux articles
-- (ex. Projecteur au Pavillon principal et à la Vieille-France).
-- Retirer un article déjà compté le cache (actif = false) sans
-- toucher à son historique ; un article jamais compté s'efface.
-- ------------------------------------------------------------
create table inventaire.articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  -- « Type » du Sheets : taille, sorte, couleur… (facultatif)
  variante text check (variante is null or btrim(variante) <> ''),
  section_id uuid references inventaire.sections(id) on delete set null,
  lieu_id uuid references inventaire.lieux(id) on delete set null,
  entreprise_id uuid references core.entreprises(id) on delete restrict,
  -- Nombre qu'il faut avoir (facultatif) : un manque est signalé.
  necessaire integer check (necessaire >= 0),
  -- Note permanente (où exactement, quoi savoir…)
  note text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_articles_section on inventaire.articles(section_id);
create index idx_articles_lieu on inventaire.articles(lieu_id);
create index idx_articles_entreprise on inventaire.articles(entreprise_id);

-- ------------------------------------------------------------
-- Comptes : les nombres d'un article un jour donné. Compter deux fois
-- le même jour corrige le compte de ce jour-là. L'appareil n'envoie que
-- les champs touchés (upsert) : deux personnes qui comptent les bons et
-- les brisés du même article ne s'écrasent pas.
-- ------------------------------------------------------------
create table inventaire.comptes (
  article_id uuid not null references inventaire.articles(id) on delete cascade,
  -- Jour de l'inventaire (posé par l'appareil, aujourd'hui par défaut)
  jour date not null,
  bon integer not null default 0 check (bon >= 0),
  brise integer not null default 0 check (brise >= 0),
  incomplet integer not null default 0 check (incomplet >= 0),
  -- État noté ce jour-là (ex. « tente no 3 : trou dans la bâche »)
  note text,
  -- Posés par la base : dernière personne qui a compté.
  compte_par uuid references core.profils(id) on delete set null,
  compte_par_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, jour)
);

create index idx_comptes_jour on inventaire.comptes(jour);

create trigger trg_sections_updated_at before update on inventaire.sections
for each row execute function core.maj_updated_at();
create trigger trg_lieux_updated_at before update on inventaire.lieux
for each row execute function core.maj_updated_at();
create trigger trg_articles_updated_at before update on inventaire.articles
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema inventaire to authenticated, service_role;
grant select, insert, update, delete on all tables in schema inventaire to authenticated, service_role;

-- Module qui donne les droits sur un article : celui de sa section
-- (sans section : l'inventaire).
create function inventaire.module_section(p_section uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.module from inventaire.sections s where s.id = p_section), 'inventaire')
$$;

create function inventaire.module_article(p_article uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select inventaire.module_section((select a.section_id from inventaire.articles a where a.id = p_article))
$$;

revoke execute on function inventaire.module_section(uuid), inventaire.module_article(uuid) from public, anon;
grant execute on function inventaire.module_section(uuid), inventaire.module_article(uuid) to authenticated;

alter table inventaire.sections enable row level security;
alter table inventaire.lieux enable row level security;
alter table inventaire.articles enable row level security;
alter table inventaire.comptes enable row level security;

create policy "Lire sections" on inventaire.sections for select to authenticated
  using (core.peut_lire(module));
create policy "Écrire sections" on inventaire.sections for all to authenticated
  using (core.peut_ecrire('inventaire')) with check (core.peut_ecrire('inventaire'));

create policy "Lire lieux" on inventaire.lieux for select to authenticated
  using (core.peut_lire('inventaire') or core.peut_lire('embarcations'));
create policy "Écrire lieux" on inventaire.lieux for all to authenticated
  using (core.peut_ecrire('inventaire')) with check (core.peut_ecrire('inventaire'));

create policy "Lire articles" on inventaire.articles for select to authenticated
  using (core.peut_lire(inventaire.module_section(section_id)));
create policy "Écrire articles" on inventaire.articles for all to authenticated
  using (core.peut_ecrire(inventaire.module_section(section_id)))
  with check (core.peut_ecrire(inventaire.module_section(section_id)));

create policy "Lire comptes" on inventaire.comptes for select to authenticated
  using (core.peut_lire(inventaire.module_article(article_id)));
create policy "Écrire comptes" on inventaire.comptes for all to authenticated
  using (core.peut_ecrire(inventaire.module_article(article_id)))
  with check (core.peut_ecrire(inventaire.module_article(article_id)));

alter publication supabase_realtime add table
  inventaire.sections, inventaire.lieux, inventaire.articles, inventaire.comptes;

-- ============================================================
-- Import du Sheets « Inventaire - Matériel »
-- (1LfTRIEv2pwb6sxYVtqmT5BwH8qgY626QD-tzua4doUA, lu le 2026-10-11).
-- Pas importés : kayaks, canots, paddleboards (Embarcations) ; véhicules
-- (Véhicules), sauf le tracteur à gazon, rangé au Garage ; deux lignes
-- « Tentes » vides du gabarit. Doublons exacts gardés une fois (bâtons
-- de hockey et de golf, jeu de poche, cabane des tout-petits). Coquilles
-- corrigées ; « 3 » (sans nom dans le Sheets, inconnu de Maxime) devient
-- « À identifier », avec une note.
-- ============================================================
-- Sections (lignes grises du Sheets)
insert into inventaire.sections (nom, ordre) values
  ('Tir à l''arc', 1),
  ('Tag à l''arc', 2),
  ('Survie en forêt', 3),
  ('Activités nautiques', 4),
  ('Escalade', 5),
  ('Accrobranche', 6),
  ('Chasse au trésor', 7),
  ('Disque golf', 8),
  ('Équipement sportif', 9),
  ('Camping', 10),
  ('Randonnée', 11),
  ('BOOM / Spectacle', 12),
  ('Autre matériel d''animation', 13),
  ('Matériel de bureau', 14),
  ('Matériel d''entretien', 15),
  ('Gros équipement', 16),
  ('Garage', 17),
  ('Autres', 18),
  ('Plage', 19),
  ('Parc gonflable', 20);

-- Lieux de rangement (PP = Pavillon principal, VF = Vieille-France)
insert into inventaire.lieux (nom, ordre) values
  ('Tanière', 1),
  ('Grill', 2),
  ('Forêt', 3),
  ('Plage', 4),
  ('Terrain vert', 5),
  ('Cabane nautique', 6),
  ('Pavillon principal', 7),
  ('Vieille-France', 8),
  ('Garage', 9),
  ('R&D – stationnement', 10),
  ('R&D – forêt', 11);

-- Articles : onglet « BPA 2026 » (GBPA+), « Aquabounga 2024 » et « Rouge et Diable 2024 ».
-- Compagnie retrouvée par abréviation ou par nom (la PROD a des noms longs).
insert into inventaire.articles (id, nom, variante, section_id, lieu_id, entreprise_id, necessaire, note, ordre)
select a.id::uuid, a.nom, a.variante, c.id, l.id, e.id, a.necessaire, a.note, a.ordre
  from (values
    ('c13734d9-4181-5eaf-a9d3-0dda17afe4a8', 'Arc à flèches', 'Régulier', 'Tir à l''arc', 'Tanière', 'GBPA+', null::integer, null, 1),
    ('a50a9147-0eae-5e95-aa75-90be43eaf825', 'Arc à flèches', 'Poulie', 'Tir à l''arc', 'Tanière', 'GBPA+', null::integer, null, 2),
    ('20effccb-fde8-52e6-ac17-dd2b136a8f9a', 'Flèches', null, 'Tir à l''arc', 'Grill', 'GBPA+', null::integer, null, 3),
    ('e1df98ca-cade-5466-a612-deaeeb8744f3', 'Flèches', null, 'Tir à l''arc', 'Forêt', 'GBPA+', 20, null, 4),
    ('ed88fef7-447d-59c6-ae0f-e45a3f78a04a', 'Banc', null, 'Tir à l''arc', 'Forêt', 'GBPA+', null::integer, null, 5),
    ('89cd507b-a367-5c80-a5a0-9b9d23ad1bb6', 'Cibles', null, 'Tir à l''arc', 'Forêt', 'GBPA+', null::integer, null, 6),
    ('311571f7-2f15-5620-a1e2-14acb7a91310', 'Cage de tir', null, 'Tir à l''arc', 'Forêt', 'GBPA+', null::integer, null, 7),
    ('9c129e69-e5b7-5518-a929-e0c6aeaa4bd4', 'Arc à flèches', null, 'Tag à l''arc', 'Forêt', 'GBPA+', 20, null, 8),
    ('b49ed588-5d04-568e-aa1a-734de5fb7dab', 'Flèches', null, 'Tag à l''arc', 'Forêt', 'GBPA+', 35, null, 9),
    ('66f3fa61-15cd-507a-a50e-58d52a901745', 'Masque de protection', null, 'Tag à l''arc', 'Forêt', 'GBPA+', 20, null, 10),
    ('5638f826-1bdd-58c4-a9d1-8351935f074b', 'Cibles', null, 'Tag à l''arc', 'Forêt', 'GBPA+', null::integer, null, 11),
    ('30557363-74ef-5733-af9f-b731ed06a6e4', 'Armoire', null, 'Tag à l''arc', 'Forêt', 'GBPA+', null::integer, null, 12),
    ('53c9143c-1af9-5ffa-af81-e2cbfa45c348', 'Barils', null, 'Tag à l''arc', 'Forêt', 'GBPA+', null::integer, null, 13),
    ('48398afc-27ab-54c4-a94e-c81894a3eec3', 'Planchers', null, 'Tag à l''arc', 'Forêt', 'GBPA+', null::integer, null, 14),
    ('3cef0c8c-6ada-5ec0-a858-6bd468e19f9f', 'Cornets', null, 'Tag à l''arc', 'Forêt', 'GBPA+', null::integer, null, 15),
    ('8660a85a-468f-53b2-a616-339d23a92390', 'Bancs', null, 'Survie en forêt', 'Forêt', 'GBPA+', null::integer, null, 16),
    ('4ff71e9e-2909-5431-a477-973199b6fefb', 'Écopes', null, 'Activités nautiques', 'Cabane nautique', 'GBPA+', null::integer, null, 17),
    ('4073e08f-948e-5929-a235-3b5bb186624f', 'Mini-surfs', null, 'Activités nautiques', 'Grill', 'GBPA+', null::integer, null, 18),
    ('89e0843b-e93b-57d9-a7d5-5df9139a4a4d', 'Sac au sec', null, 'Activités nautiques', null, 'GBPA+', null::integer, null, 19),
    ('6eb2451a-cd0c-530b-a7cd-747f6cc3577d', 'Corde', null, 'Escalade', 'Grill', 'GBPA+', null::integer, null, 20),
    ('ce35aada-041b-5c63-a0de-277efde2a81d', 'Casque', null, 'Escalade', 'Grill', 'GBPA+', null::integer, null, 21),
    ('6eac221d-7818-565e-a1aa-1f3972fdd154', 'Harnais', null, 'Escalade', 'Grill', 'GBPA+', null::integer, null, 22),
    ('6c5b0632-ead4-5b46-a293-4bb5a80240d4', 'Corde', null, 'Accrobranche', 'Grill', 'GBPA+', null::integer, null, 23),
    ('d257ccbf-b10d-5551-ae14-cf776314f2e0', 'Casque', null, 'Accrobranche', 'Grill', 'GBPA+', null::integer, null, 24),
    ('67092808-adef-5188-ac70-aff62f8c3e66', 'Harnais', null, 'Accrobranche', 'Grill', 'GBPA+', null::integer, null, 25),
    ('3d2a0d0a-3228-5d97-a433-ab5b0c589550', 'Échelles', null, 'Accrobranche', 'Terrain vert', 'GBPA+', null::integer, null, 26),
    ('036c36fb-4c47-5dcf-a2e5-9dc048518d4e', 'Cloche', null, 'Accrobranche', 'Terrain vert', 'GBPA+', null::integer, null, 27),
    ('b944f823-ea7e-5947-ac27-45161e007916', 'Boussoles', null, 'Chasse au trésor', 'Grill', 'GBPA+', 20, null, 28),
    ('9ecbb94c-14e7-5899-afeb-5561301a47ff', 'Frisbee', null, 'Disque golf', 'Tanière', 'GBPA+', null::integer, null, 29),
    ('d2e92cae-70b8-5ca9-a817-2acdd2650de6', 'Frisbee (autre)', null, 'Disque golf', 'Grill', 'GBPA+', null::integer, null, 30),
    ('736ae62d-099f-5bcb-afd3-8995adfa182f', 'Panier de lancer', null, 'Disque golf', 'Forêt', 'GBPA+', null::integer, null, 31),
    ('2d3fdbb4-bea7-51e2-a299-59b11b1f91a3', 'Troti-ski', null, 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 32),
    ('72137650-c897-5b07-abb7-17e4fa8a227b', 'Bâtons', 'Hockey', 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 33),
    ('65e3446c-9f21-520d-a8ca-fc9b43573a40', 'Bâtons', 'Golf', 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 34),
    ('92302b24-daa1-5de4-ae35-8dce8fd73b1a', 'Bâtons', 'Ballon-balai', 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 35),
    ('03d3d8a6-7c3d-57f9-a830-c67d0aafdecf', 'But de hockey', null, 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 36),
    ('906d2b74-ec92-581d-a802-10adf18007f5', 'Frites', null, 'Équipement sportif', 'Grill', 'GBPA+', null::integer, null, 37),
    ('3f06a26f-9ff9-5c70-a6ed-ddcfb4eeef97', 'Cornets', null, 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 38),
    ('0fdc7992-a658-551e-a2ff-54a588293f1b', 'Frisbee', null, 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 39),
    ('7413039c-fb83-51b5-a1fb-f6ba0436dc80', 'Ballon', null, 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 40),
    ('d1a22ede-a4c6-5a25-a916-5fa42cca43a4', 'Ballon', 'Foot', 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 41),
    ('4d3caf50-a3b3-5931-a3e0-159fe587a069', 'Ballon', 'Basket', 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 42),
    ('e0df0f8e-d9cb-5df7-a781-38d3bda617a1', 'Ballon', 'Rugby', 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 43),
    ('f7942707-6290-5f0e-a8a9-f8b819b7b55a', 'Ballon', 'Babyfoot', 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 44),
    ('2be9ff03-3cd1-57d4-ae8d-c1e939ec1546', 'Ballon', 'Volleyball', 'Équipement sportif', 'Terrain vert', 'GBPA+', null::integer, null, 45),
    ('b630169f-70f9-590f-ae59-ff891d0837f9', 'Ballon', 'Baseball', 'Équipement sportif', 'Tanière', 'GBPA+', null::integer, null, 46),
    ('91390691-ba13-548b-a908-d0dc5e25b109', 'Ballon', 'Tennis', 'Équipement sportif', 'Tanière', 'GBPA+', null::integer, null, 47),
    ('e699b746-e408-56a8-afc6-2a8fe3756ddb', 'Bâches', 'Dimension 1', 'Camping', null, 'GBPA+', null::integer, null, 48),
    ('17f22211-2e25-5c6b-a5a7-20619f4bedbb', 'Bâches', 'Dimension 2', 'Camping', null, 'GBPA+', null::integer, null, 49),
    ('f362b72e-fd62-5e08-a600-f6c7b1d82c45', 'Bâches', 'Dimension 3', 'Camping', 'Grill', 'GBPA+', null::integer, null, 50),
    ('edc436b6-dee8-582d-a5a9-e7e91a4d1d6d', 'Sleeping bag', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 51),
    ('f682ffe5-7dab-57e2-ae15-02e65f78a216', 'Tentes', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 52),
    ('a3427a25-2eb6-5a44-a825-513eb062d983', 'Ustensiles de cuisine', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 53),
    ('12975f83-c9b6-58b1-a8be-3c8a9407ec81', 'Assiettes', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 54),
    ('400d656a-d8a0-5198-a139-73a1baadf89d', 'Plateau à manger', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 55),
    ('d6f16897-0f84-56a0-a347-165a323be41f', 'Verres', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 56),
    ('04d70a5b-04a3-51ed-a77e-00eaa7e75e0f', 'Ustensiles en plastique', 'Fourchette', 'Camping', null, 'GBPA+', null::integer, null, 57),
    ('5ed60971-c044-52fa-abd1-aaf261c14a7f', 'Ustensiles en plastique', 'Cuillère', 'Camping', null, 'GBPA+', null::integer, null, 58),
    ('415a3e92-7fa0-5988-abb4-bd25d9139692', 'Ustensiles en plastique', 'Couteau', 'Camping', null, 'GBPA+', null::integer, null, 59),
    ('ab2204a9-da7e-5485-ae08-cee571f333ae', 'Bol en métal', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 60),
    ('cbbebc40-4c75-5674-a659-bce0f443a237', 'Casseroles', 'Petite', 'Camping', 'Grill', 'GBPA+', null::integer, null, 61),
    ('97a1a140-9381-5009-a49d-726481b2abad', 'Casseroles', 'Moyenne', 'Camping', 'Grill', 'GBPA+', null::integer, null, 62),
    ('dc702f50-6589-5a6e-a9f1-40b7d02ec526', 'Casseroles', 'Grande', 'Camping', 'Grill', 'GBPA+', null::integer, null, 63),
    ('d81a77ba-cbc5-58cc-ac99-d412aa2ec49b', 'Four de camping', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 64),
    ('174738b2-7879-566b-a13b-089ba8d6c15b', 'Bouteilles de propane', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 65),
    ('5dc2eed5-28b9-5121-a031-1ad7eef38e23', 'Chaufferette', null, 'Camping', null, 'GBPA+', null::integer, null, 66),
    ('9549f089-0a6c-5370-a7c7-37182d7091fa', 'Grilles pour feu', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 67),
    ('516f9dbd-fe15-5b91-a76e-07457e6c684d', 'Nettoyant à four', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 68),
    ('43274423-0d04-5975-a741-14be97512219', 'Butane', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 69),
    ('82e8e129-157f-596d-a075-c5cc74f0ccd8', 'Huile à la citronnelle', null, 'Camping', null, 'GBPA+', null::integer, null, 70),
    ('88f7519b-7d9e-5791-af4b-863c197876af', 'Spray imperméabilisant', null, 'Camping', null, 'GBPA+', null::integer, null, 71),
    ('a4b0d513-8cdb-5689-aa26-2ef09f621984', 'Multipurpose clip', null, 'Camping', null, 'GBPA+', null::integer, null, 72),
    ('a1f668fb-266f-5523-ab96-b7cd3491e6b3', 'Sacs à poubelle transparents', null, 'Camping', 'Grill', 'GBPA+', null::integer, 'Dans une armoire du stock de camping', 73),
    ('30ae13d3-1d6e-50f1-a8fa-ed1e1f9d995f', 'Corde en foin', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 74),
    ('49a9e099-eba5-57c6-aaec-135c49b4b932', 'Planche à découper', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 75),
    ('74ff96bc-29d6-543f-a49b-81c6f2fa61f9', 'Bacs en plastique', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 76),
    ('224eff3a-d4cc-50a8-ae4b-c0efd2daa50f', 'Corde et crochet pour tente', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 77),
    ('58417624-f06e-5f55-ad6d-bc5691a58dff', 'Glacières', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 78),
    ('2ca64d63-2524-5c23-a29e-55dabff852d6', 'Lits de camping', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 79),
    ('1a586a54-8182-5c2b-ab87-5ad8e90ab8e7', 'Plateau à découper', null, 'Camping', 'Grill', 'GBPA+', null::integer, null, 80),
    ('33c0b568-308b-5655-a383-695454c775c6', 'Objets sans utilité visible', null, 'Camping', null, 'GBPA+', null::integer, null, 81),
    ('9b8735df-9030-561a-a6f7-ffbf2ff1fa18', 'Sac de randonnée', null, 'Randonnée', 'Tanière', 'GBPA+', null::integer, null, 82),
    ('ae347e49-d782-5fdc-ad51-0a43a89a4d3e', 'Speaker', null, 'BOOM / Spectacle', 'Pavillon principal', 'GBPA+', null::integer, null, 83),
    ('03045933-b480-59a0-ac29-2c99ea3afffd', 'Boule disco', null, 'BOOM / Spectacle', 'Pavillon principal', 'GBPA+', null::integer, null, 84),
    ('7b8cf61d-fa16-591c-ab5a-b00181c832ec', 'Lumière', null, 'BOOM / Spectacle', 'Pavillon principal', 'GBPA+', null::integer, null, 85),
    ('24829338-e9fd-5ab3-a90c-3f927d52c2df', 'Cabane des tout-petits', null, 'Autre matériel d''animation', 'Terrain vert', 'GBPA+', null::integer, null, 86),
    ('60de6e08-b08e-5f39-aaca-f190d27d36f7', 'Balançoire pneu', null, 'Autre matériel d''animation', 'Terrain vert', 'GBPA+', null::integer, null, 87),
    ('c7fe88e1-8a43-50a7-a7c0-1a5c1397b41d', 'But de soccer', null, 'Autre matériel d''animation', 'Terrain vert', 'GBPA+', null::integer, null, 88),
    ('0da4b5ff-d757-50c2-acb4-a1e8de217b68', 'Cerceaux', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 89),
    ('922b2b15-cdbf-5494-ad8c-d6d3903d412d', 'Pelles', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 90),
    ('3d549420-929c-53fe-a9b4-61e4ad455ec0', 'Filet', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 91),
    ('189d4137-7cb7-5fff-a815-b3b390dea64e', 'Boogie board', null, 'Autre matériel d''animation', null, 'GBPA+', null::integer, null, 92),
    ('484a52ae-2748-53a4-a94b-12ba16350740', 'Parachute', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 93),
    ('d419552b-eca4-5286-a1f5-71c3de3b9dc7', 'Spikeball', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 94),
    ('dec9c0e5-2900-5e89-a1af-8f9f1e48cd0e', 'Raquettes', 'Tennis', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 95),
    ('9403a18f-1fc4-5a1c-a9b5-a8ed045e4922', 'Raquettes', 'Badminton', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 96),
    ('a9d5e60e-9d80-50cd-ac3c-e4e256bcd5bc', 'Raquettes', 'Ping pong', 'Autre matériel d''animation', 'Vieille-France', 'GBPA+', null::integer, null, 97),
    ('b6c3517c-7e60-5c80-ad58-216a1b4b1414', 'Raquettes', 'Ping pong', 'Autre matériel d''animation', 'Pavillon principal', 'GBPA+', null::integer, null, 98),
    ('9675b123-ccb2-57c8-af8e-a9c409334202', 'Raquettes', 'Autre', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 99),
    ('259b35ce-30c3-5171-a95d-0d95c42555db', 'Queues de billard', null, 'Autre matériel d''animation', 'Pavillon principal', 'GBPA+', null::integer, null, 100),
    ('a4fb9f7f-6ec8-5a35-ac78-a92dee263e31', 'Planchette roulante', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 101),
    ('ab5d1cc9-671f-5afc-ad48-b9ce41d227ca', 'Ballon', 'Basketball', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 102),
    ('9b380733-6f92-5ec6-af85-00966babc1dc', 'Ballon', 'Football', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 103),
    ('45e7c0b5-24cc-575b-a4be-68e8bf378ab0', 'Ballon', 'Soccer', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 104),
    ('884b8b68-184a-5d9b-a5ea-9ab34baf0eef', 'Ballon', 'Volleyball', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 105),
    ('98c20e60-5487-5790-a294-5b08ff870141', 'Ballon', 'Ballon chasseur', 'Autre matériel d''animation', null, 'GBPA+', null::integer, null, 106),
    ('16d7c0d9-e7fa-58b1-ae69-dc7f0eb21e69', 'Ballon', 'Autre', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 107),
    ('6d0ce113-f83c-58d4-a9d9-4ef9228e5854', 'Ballon', 'Spikeball', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 108),
    ('f69ad9b2-dbda-5f64-aa3c-3403e3874f41', 'Slackline', null, 'Autre matériel d''animation', null, 'GBPA+', null::integer, null, 109),
    ('477d656f-0cc3-56a0-a2bc-dfc7f546cdef', 'Baches', 'Dimension 1', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 110),
    ('f7b66345-ea05-5e9f-a230-7e3814463d30', 'Baches', 'Dimension 2', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 111),
    ('e6008ce5-c7fb-5173-aaa7-ca8c98510602', 'Baches', 'Dimension 3', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 112),
    ('b6658ab6-edda-50e4-a06c-a5bccd987054', 'Dossard', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 113),
    ('14287019-bc50-5a8b-ad33-b9fbed779d48', 'Flag', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 114),
    ('d934ec20-b45b-52fd-a01b-087378171af6', 'Cônes', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 115),
    ('3d032caa-2862-5375-a2a4-238e95802cdd', 'Jeu de poche', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 116),
    ('c786c1d6-e353-5293-a7f0-e71775bc4668', 'Carrés en mousse', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 117),
    ('d233725f-e207-5fff-ab65-28adaba7706a', 'Chaises de camping', null, 'Autre matériel d''animation', null, 'GBPA+', null::integer, null, 118),
    ('fa897e6a-a45f-5a91-a0b9-98d950964484', 'Cornets', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 119),
    ('9d086af2-0125-5902-ab78-a8aa3ae7c086', 'Matériel de cirque', 'Quilles', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 120),
    ('05f437af-fedf-5f72-ab6e-321961bb991a', 'Matériel de cirque', 'Cordes', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 121),
    ('fabac270-67e4-5ee7-a016-f558cf589890', 'À identifier', 'Adulte - Small', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, 'Sans nom dans le Sheets (« 3 ») ; personne ne sait ce que c''est (2026-10-11). Tailles adulte et enfant, au Grill : à identifier au prochain comptage, puis renommer.', 122),
    ('4a818a79-833c-51a7-a5eb-52b01cef8532', 'À identifier', 'Adulte - Medium', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, 'Sans nom dans le Sheets (« 3 ») ; personne ne sait ce que c''est (2026-10-11). Tailles adulte et enfant, au Grill : à identifier au prochain comptage, puis renommer.', 123),
    ('fccadeff-04ca-5c74-ae74-087bdb96e70c', 'À identifier', 'Enfant - Small', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, 'Sans nom dans le Sheets (« 3 ») ; personne ne sait ce que c''est (2026-10-11). Tailles adulte et enfant, au Grill : à identifier au prochain comptage, puis renommer.', 124),
    ('520c5c09-48c9-5d9e-a991-e522758ae4e2', 'À identifier', 'Enfant - Medium', 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, 'Sans nom dans le Sheets (« 3 ») ; personne ne sait ce que c''est (2026-10-11). Tailles adulte et enfant, au Grill : à identifier au prochain comptage, puis renommer.', 125),
    ('165d94bf-5e69-54f4-a211-15aee0c827ff', 'Traîneau', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 126),
    ('6192ac0d-e0f1-5be7-acaa-f36d5063c9d6', 'Crazy carpet', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 127),
    ('2869f926-fab5-55db-a1b7-8f3a09521faf', 'Crazy carpet', null, 'Autre matériel d''animation', 'Tanière', 'GBPA+', null::integer, null, 128),
    ('7e143677-9ca2-5b78-ac68-5e9ff62a7518', 'Soucoupe', null, 'Autre matériel d''animation', 'Grill', 'GBPA+', null::integer, null, 129),
    ('5f65d2ce-45dc-5e51-a052-798793bf2774', 'Mono-ski', null, 'Autre matériel d''animation', null, 'GBPA+', null::integer, null, 130),
    ('6c5b8e61-fa5b-5ebc-a09a-77780ed71e65', 'Étagères', 'En plastique', 'Matériel de bureau', 'Grill', 'GBPA+', null::integer, null, 131),
    ('0e002b28-f9fe-584b-a2a4-1143798319c9', 'Étagères', 'En bois', 'Matériel de bureau', 'Grill', 'GBPA+', null::integer, null, 132),
    ('ace52f68-c1be-57bc-a328-f63f4d92d862', 'Meuble de rangement', 'En métal', 'Matériel de bureau', 'Pavillon principal', 'GBPA+', null::integer, 'Trois en bas, à côté de la costumière', 133),
    ('023e49de-2c95-53bb-ae5d-125be56439fd', 'Meuble de rangement', 'En plastique', 'Matériel de bureau', 'Grill', 'GBPA+', null::integer, null, 134),
    ('ea971d1d-807d-5075-a9fd-0dc7ca4ce15a', 'Chaises', 'Roulante', 'Matériel de bureau', 'Grill', 'GBPA+', null::integer, 'Aussi dans le Grill', 135),
    ('9b668697-b8bb-5548-a088-74f77449a571', 'Chaises', 'Plastique blanc', 'Matériel de bureau', 'Grill', 'GBPA+', null::integer, null, 136),
    ('dff5904d-5ac3-5ca9-a965-ae60c575373f', 'Chaises', 'De cuisine orange', 'Matériel de bureau', null, 'GBPA+', null::integer, null, 137),
    ('ea758c02-e215-5a54-a4f4-1b283e2baeef', 'Chaises', 'Plastique rouge', 'Matériel de bureau', null, 'GBPA+', null::integer, null, 138),
    ('d502c9be-41ee-5e5d-a24c-b9de47046767', 'Rallonge', null, 'Matériel d''entretien', 'Vieille-France', 'GBPA+', null::integer, null, 139),
    ('4e17b833-e19a-5f94-a89b-e9e45f11959c', 'Projecteur', null, 'Matériel d''entretien', 'Pavillon principal', 'GBPA+', null::integer, null, 140),
    ('54df9344-65b2-5b7b-a7df-508ef8389764', 'Projecteur', null, 'Matériel d''entretien', 'Vieille-France', 'GBPA+', null::integer, null, 141),
    ('573b0ea8-5f02-5f55-a221-fb520046f9d0', 'Écran de projecteur', null, 'Matériel d''entretien', 'Pavillon principal', 'GBPA+', null::integer, null, 142),
    ('de9995d5-cb2d-5e03-a0f3-51a3cb1a75ed', 'Écran de projecteur', null, 'Matériel d''entretien', 'Vieille-France', 'GBPA+', null::integer, null, 143),
    ('177e0150-f96d-5270-a871-468041f4b743', 'Support de projecteur', null, 'Matériel d''entretien', 'Pavillon principal', 'GBPA+', null::integer, null, 144),
    ('d4a551ec-d939-51a5-a6a6-be2f13878e13', 'Support de projecteur', null, 'Matériel d''entretien', 'Vieille-France', 'GBPA+', null::integer, null, 145),
    ('7faef21f-4244-5e60-ad61-267b7c0f6ff6', 'Abreuvoir', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 146),
    ('169eb6e1-a65b-5ec2-a507-2c9651b3cf60', 'Scène', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 147),
    ('e25d713d-c046-5cb5-a7f4-0a3fc5995f21', 'Chaise de sauveteur', null, 'Gros équipement', 'Plage', 'GBPA+', null::integer, null, 148),
    ('fcd4f461-1f69-5d59-af61-2498b73b7ca1', 'Panier de basket', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 149),
    ('806a379f-8b8d-5a74-ab22-db875d40a1cb', 'Filet de soccer', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 150),
    ('ee7481ae-b69d-576a-a077-57cf19c37713', 'Poteau de ballon', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 151),
    ('842714bd-f5e7-5a40-a69f-deae4e4f6b44', 'Mur d''escalade', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 152),
    ('6afa9bc2-7cf7-58c2-aaa4-90b286b615cf', 'Rack à kayak', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 153),
    ('473c10fd-c8ae-59c6-a197-69151ad67b8f', 'Rack à kayak', null, 'Gros équipement', 'Plage', 'GBPA+', null::integer, null, 154),
    ('a750ef0a-c062-5c2d-a33c-4d43e38a7907', 'Rack à canot', null, 'Gros équipement', 'Plage', 'GBPA+', null::integer, null, 155),
    ('a4aa3d7a-66d9-5c92-a992-abbc6debbfde', 'Rack à paddleboard', null, 'Gros équipement', 'Plage', 'GBPA+', null::integer, null, 156),
    ('8254eeec-bb34-5416-a41e-972c7a8243ef', 'Bac à ballons', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 157),
    ('dcb8aa77-1e16-56e1-a7f9-b5e228b903d2', 'Mur de signature / porte drapeau', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 158),
    ('87cbec16-d1ab-573e-ad39-3c6149d69189', 'Cabane', null, 'Gros équipement', 'Terrain vert', 'GBPA+', null::integer, null, 159),
    ('246667bb-c8b4-532a-af3b-5de1294ee139', 'Hose', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 160),
    ('c42ac6ae-f703-5f84-a6ab-83a9f585427f', 'Souffleuse à neige', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 161),
    ('182f8eb7-261c-578c-a301-242f3dc0dfca', 'Weed eater', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 162),
    ('d8f42765-34bf-5a8c-a3af-91c518f1a8a4', 'Souffleur à feuilles', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 163),
    ('cf779b5c-b1d3-52c5-a3f7-2c87a87b8dab', 'Aspirateur à feuilles', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 164),
    ('6a73b6f9-90f9-5445-a168-15b9beb868ba', 'Pelle à neige', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 165),
    ('016691fe-1a07-503e-a05c-93951c4960d5', 'Tracteur à gazon', null, 'Garage', 'Garage', 'GBPA+', null::integer, null, 166),
    ('80458f16-4425-5c51-ac2e-e5e8f5833f0e', 'Cintres', null, 'Autres', null, 'GBPA+', null::integer, null, 167),
    ('9a8ee8f5-f710-57aa-a3f6-619a337f46cb', 'Rack', null, 'Autres', null, 'GBPA+', null::integer, null, 168),
    ('48f17000-8155-5295-af62-46b1dd355820', 'Bois', null, 'Autres', null, 'GBPA+', null::integer, null, 169),
    ('319f9ba9-7974-5b07-ad7a-330624ae2bf1', 'Poubelles', null, 'Autres', 'Grill', 'GBPA+', null::integer, null, 170),
    ('e3446f21-70c3-586f-a971-9c760a06206f', 'Structure de jeux gonflable', null, 'Autres', null, 'GBPA+', null::integer, null, 171),
    ('203780c8-fe88-5eb1-acd3-3f32a6d697b1', 'Ruban', null, 'Autres', 'Grill', 'GBPA+', null::integer, null, 172),
    ('5ab634b1-c332-54b3-ab65-68e75e7e1648', 'Tables à plier', null, 'Autres', 'Pavillon principal', 'GBPA+', null::integer, 'Dans le placard à côté de la table de ping-pong', 173),
    ('746403e0-7d67-5293-ab4c-126dc9d6f3ae', 'Support de parasol (partie dans le sol)', null, 'Plage', 'Plage', 'AQB', null::integer, null, 174),
    ('1606c8cf-6282-5107-a5fd-29c26bbadf31', 'Parasol', null, 'Plage', 'Plage', 'AQB', null::integer, null, 175),
    ('ef983905-3de2-5abd-adce-1e926b73f430', 'Chaise 1', 'Module 1', 'Parc gonflable', null, 'AQB', null::integer, 'Réparée (noté en 2024)', 176),
    ('3b00ac26-7a0a-5de1-aceb-ecad83e73d88', 'Triangle jaune qui s''attache à la chaise 1', 'Module 2', 'Parc gonflable', null, 'AQB', null::integer, null, 177),
    ('d6aa2c8d-fcf9-58e0-a1f2-61611c8ecb45', 'Glissade bleue', 'Module 3', 'Parc gonflable', null, 'AQB', null::integer, null, 178),
    ('211f11ad-b3fa-58cc-a644-ddf60e374e44', 'Carré jaune à deux côtés bleus', 'Module 4', 'Parc gonflable', null, 'AQB', null::integer, null, 179),
    ('841c001e-4c2f-5c4e-a25e-35ac8d4d44f7', 'L''échelle', 'Module 5', 'Parc gonflable', null, 'AQB', null::integer, null, 180),
    ('85c6020a-b7f0-53d3-ac09-ece93bee8397', 'Carré jaune à 4 côtés bleus', 'Module 6', 'Parc gonflable', null, 'AQB', null::integer, null, 181),
    ('205e530b-aea9-58d4-ab32-d0cb13e8f485', 'Les deux montagnes', 'Module 7', 'Parc gonflable', null, 'AQB', null::integer, null, 182),
    ('b3c34e6a-b619-5409-ab1e-9ad3b0098a0c', 'L''octogone', 'Module 8', 'Parc gonflable', null, 'AQB', null::integer, null, 183),
    ('1e9d2a4a-1f3d-52c3-a6b9-380edc928844', 'Les pics bleus', 'Module 9', 'Parc gonflable', null, 'AQB', null::integer, null, 184),
    ('81ce7c67-513e-5524-a6a8-2ed818c9ed87', 'Le rack à vélo', 'Module 10', 'Parc gonflable', null, 'AQB', null::integer, null, 185),
    ('d0f41c3b-19ce-50d8-aa7b-ff8adfbabcc4', 'Trampoline 11', 'Module 11', 'Parc gonflable', null, 'AQB', null::integer, null, 186),
    ('48627a15-9d81-5792-a04c-e55fc5703b32', 'Garfield 5 rattachés à deux petits trapèzes bleus', 'Module 12', 'Parc gonflable', null, 'AQB', null::integer, null, 187),
    ('846c3e5e-1eaf-5c1a-aec1-7a3760b60679', 'Carré jaune à 2 côtés bleus', 'Module 13', 'Parc gonflable', null, 'AQB', null::integer, null, 188),
    ('de632cfc-a70f-5968-a48d-1e000c42e4ee', 'Cliff', 'Module 14', 'Parc gonflable', null, 'AQB', null::integer, null, 189),
    ('481bf7de-abe3-50ec-a764-4f77046ac62d', 'Carré jaune à 4 côtés bleus', 'Module 15', 'Parc gonflable', null, 'AQB', null::integer, null, 190),
    ('a2dae8ed-6932-5e4c-a667-d3cfccd7b7b0', 'Easy-up', null, 'Autres', 'R&D – stationnement', 'R&D', null::integer, null, 191),
    ('e4ff521e-b7d9-5bf9-a73c-4cf6782f464a', 'Support à VFI', null, 'Activités nautiques', 'R&D – stationnement', 'R&D', null::integer, null, 192),
    ('b57786fe-2775-5368-af18-93a29b32198e', 'Support à pagaies', null, 'Activités nautiques', 'R&D – stationnement', 'R&D', null::integer, null, 193),
    ('4f28cf70-c7ee-5fba-a1d6-e9d8060f2d4f', 'Support à kayaks', null, 'Activités nautiques', 'R&D – stationnement', 'R&D', null::integer, null, 194),
    ('63e41391-5bfb-5576-aa17-fb9c8c432d7c', 'Affiche loutres', null, 'Autres', 'R&D – forêt', 'R&D', null::integer, null, 195),
    ('d21d375e-16d7-5bbc-a70c-49ae2979df46', 'Affiche consigne', null, 'Autres', 'R&D – forêt', 'R&D', null::integer, null, 196),
    ('11c41f33-df93-5744-a915-660329bb9120', 'Drapeau', null, 'Autres', 'R&D – forêt', 'R&D', null::integer, null, 197),
    ('370592bc-e4b9-5ed2-a6f4-4f7c65e29e86', 'Quai', null, 'Gros équipement', 'R&D – forêt', 'R&D', null::integer, null, 198)
  ) as a(id, nom, variante, section, lieu, compagnie, necessaire, note, ordre)
  left join inventaire.sections c on c.nom = a.section
  left join inventaire.lieux l on l.nom = a.lieu
  left join lateral (
    select x.id from core.entreprises x
     where x.abreviation = a.compagnie or x.nom = a.compagnie
        or (a.compagnie = 'AQB' and x.nom ilike 'aquabounga%')
        or (a.compagnie = 'R&D' and x.nom ilike 'rouge%diable%')
     order by (x.abreviation = a.compagnie) desc nulls last, (x.nom = a.compagnie) desc
     limit 1
  ) e on true;

-- Comptes de 2024 (seul onglet rempli ; 2025 et 2026 étaient des gabarits
-- vides). Le Sheets ne dit pas le jour : celui de sa création (6 août 2024).
insert into inventaire.comptes (jour, article_id, bon, brise, incomplet, note, compte_par_nom) values
  ('2024-08-06', 'c13734d9-4181-5eaf-a9d3-0dda17afe4a8', 5, 7, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'a50a9147-0eae-5e95-aa75-90be43eaf825', 7, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '20effccb-fde8-52e6-ac17-dd2b136a8f9a', 108, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'e1df98ca-cade-5466-a612-deaeeb8744f3', 26, 10, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ed88fef7-447d-59c6-ae0f-e45a3f78a04a', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '89cd507b-a367-5c80-a5a0-9b9d23ad1bb6', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '311571f7-2f15-5620-a1e2-14acb7a91310', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9c129e69-e5b7-5518-a929-e0c6aeaa4bd4', 7, 1, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'b49ed588-5d04-568e-aa1a-734de5fb7dab', 35, 6, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '66f3fa61-15cd-507a-a50e-58d52a901745', 22, 1, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '30557363-74ef-5733-af9f-b731ed06a6e4', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '53c9143c-1af9-5ffa-af81-e2cbfa45c348', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '48398afc-27ab-54c4-a94e-c81894a3eec3', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '3cef0c8c-6ada-5ec0-a858-6bd468e19f9f', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '8660a85a-468f-53b2-a616-339d23a92390', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '4073e08f-948e-5929-a235-3b5bb186624f', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6eb2451a-cd0c-530b-a7cd-747f6cc3577d', 5, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ce35aada-041b-5c63-a0de-277efde2a81d', 7, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6eac221d-7818-565e-a1aa-1f3972fdd154', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6c5b0632-ead4-5b46-a293-4bb5a80240d4', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd257ccbf-b10d-5551-ae14-cf776314f2e0', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '67092808-adef-5188-ac70-aff62f8c3e66', 8, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '3d2a0d0a-3228-5d97-a433-ab5b0c589550', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '036c36fb-4c47-5dcf-a2e5-9dc048518d4e', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'b944f823-ea7e-5947-ac27-45161e007916', 7, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9ecbb94c-14e7-5899-afeb-5561301a47ff', 55, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd2e92cae-70b8-5ca9-a817-2acdd2650de6', 23, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '736ae62d-099f-5bcb-afd3-8995adfa182f', 10, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '2d3fdbb4-bea7-51e2-a299-59b11b1f91a3', 11, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '72137650-c897-5b07-abb7-17e4fa8a227b', 15, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '65e3446c-9f21-520d-a8ca-fc9b43573a40', 8, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '92302b24-daa1-5de4-ae35-8dce8fd73b1a', 30, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '03d3d8a6-7c3d-57f9-a830-c67d0aafdecf', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '906d2b74-ec92-581d-a802-10adf18007f5', 19, 0, 3, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '0fdc7992-a658-551e-a2ff-54a588293f1b', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '7413039c-fb83-51b5-a1fb-f6ba0436dc80', 7, 2, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd1a22ede-a4c6-5a25-a916-5fa42cca43a4', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '4d3caf50-a3b3-5931-a3e0-159fe587a069', 7, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'e0df0f8e-d9cb-5df7-a781-38d3bda617a1', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'f7942707-6290-5f0e-a8a9-f8b819b7b55a', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '2be9ff03-3cd1-57d4-ae8d-c1e939ec1546', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'b630169f-70f9-590f-ae59-ff891d0837f9', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '91390691-ba13-548b-a908-d0dc5e25b109', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'f362b72e-fd62-5e08-a600-f6c7b1d82c45', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'edc436b6-dee8-582d-a5a9-e7e91a4d1d6d', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'f682ffe5-7dab-57e2-ae15-02e65f78a216', 6, 0, 0, 'Tente no 3 : trou dans la bâche ; tente no 6 : petit trou dans l''arrêt jaune en diagonale', 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'a3427a25-2eb6-5a44-a825-513eb062d983', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '12975f83-c9b6-58b1-a8be-3c8a9407ec81', 42, 1, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '400d656a-d8a0-5198-a139-73a1baadf89d', 19, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd6f16897-0f84-56a0-a347-165a323be41f', 24, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ab2204a9-da7e-5485-ae08-cee571f333ae', 15, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'cbbebc40-4c75-5674-a659-bce0f443a237', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '97a1a140-9381-5009-a49d-726481b2abad', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'dc702f50-6589-5a6e-a9f1-40b7d02ec526', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd81a77ba-cbc5-58cc-ac99-d412aa2ec49b', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '174738b2-7879-566b-a13b-089ba8d6c15b', 12, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9549f089-0a6c-5370-a7c7-37182d7091fa', 9, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '516f9dbd-fe15-5b91-a76e-07457e6c684d', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '43274423-0d04-5975-a741-14be97512219', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '30ae13d3-1d6e-50f1-a8fa-ed1e1f9d995f', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '49a9e099-eba5-57c6-aaec-135c49b4b932', 9, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '74ff96bc-29d6-543f-a49b-81c6f2fa61f9', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '224eff3a-d4cc-50a8-ae4b-c0efd2daa50f', 20, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '58417624-f06e-5f55-ad6d-bc5691a58dff', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '2ca64d63-2524-5c23-a29e-55dabff852d6', 7, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '1a586a54-8182-5c2b-ab87-5ad8e90ab8e7', 9, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '33c0b568-308b-5655-a383-695454c775c6', 9, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ae347e49-d782-5fdc-ad51-0a43a89a4d3e', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '03045933-b480-59a0-ac29-2c99ea3afffd', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '7b8cf61d-fa16-591c-ab5a-b00181c832ec', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '24829338-e9fd-5ab3-a90c-3f927d52c2df', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '60de6e08-b08e-5f39-aaca-f190d27d36f7', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'c7fe88e1-8a43-50a7-a7c0-1a5c1397b41d', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '0da4b5ff-d757-50c2-acb4-a1e8de217b68', 8, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '922b2b15-cdbf-5494-ad8c-d6d3903d412d', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '3d549420-929c-53fe-a9b4-61e4ad455ec0', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '484a52ae-2748-53a4-a94b-12ba16350740', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd419552b-eca4-5286-a1f5-71c3de3b9dc7', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'dec9c0e5-2900-5e89-a1af-8f9f1e48cd0e', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9403a18f-1fc4-5a1c-a9b5-a8ed045e4922', 10, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'b6c3517c-7e60-5c80-ad58-216a1b4b1414', 6, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9675b123-ccb2-57c8-af8e-a9c409334202', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '259b35ce-30c3-5171-a95d-0d95c42555db', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'a4fb9f7f-6ec8-5a35-ac78-a92dee263e31', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ab5d1cc9-671f-5afc-ad48-b9ce41d227ca', 2, 3, 0, 'La plupart des ballons « brisés » ont seulement besoin d''être regonflés', 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9b380733-6f92-5ec6-af85-00966babc1dc', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '45e7c0b5-24cc-575b-a4be-68e8bf378ab0', 2, 2, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '884b8b68-184a-5d9b-a5ea-9ab34baf0eef', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '16d7c0d9-e7fa-58b1-ae69-dc7f0eb21e69', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6d0ce113-f83c-58d4-a9d9-4ef9228e5854', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '477d656f-0cc3-56a0-a2bc-dfc7f546cdef', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'f7b66345-ea05-5e9f-a230-7e3814463d30', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'e6008ce5-c7fb-5173-aaa7-ca8c98510602', 6, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'b6658ab6-edda-50e4-a06c-a5bccd987054', 80, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '14287019-bc50-5a8b-ad33-b9fbed779d48', 42, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd934ec20-b45b-52fd-a01b-087378171af6', 8, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '3d032caa-2862-5375-a2a4-238e95802cdd', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'c786c1d6-e353-5293-a7f0-e71775bc4668', 8, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd233725f-e207-5fff-ab65-28adaba7706a', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'fa897e6a-a45f-5a91-a0b9-98d950964484', 10, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9d086af2-0125-5902-ab78-a8aa3ae7c086', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '05f437af-fedf-5f72-ab6e-321961bb991a', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'fabac270-67e4-5ee7-a016-f558cf589890', 68, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'fccadeff-04ca-5c74-ae74-087bdb96e70c', 25, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '520c5c09-48c9-5d9e-a991-e522758ae4e2', 12, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '165d94bf-5e69-54f4-a211-15aee0c827ff', 17, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6192ac0d-e0f1-5be7-acaa-f36d5063c9d6', 12, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '2869f926-fab5-55db-a1b7-8f3a09521faf', 5, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '7e143677-9ca2-5b78-ac68-5e9ff62a7518', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ace52f68-c1be-57bc-a328-f63f4d92d862', 5, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '023e49de-2c95-53bb-ae5d-125be56439fd', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ea971d1d-807d-5075-a9fd-0dc7ca4ce15a', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '9b668697-b8bb-5548-a088-74f77449a571', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd502c9be-41ee-5e5d-a24c-b9de47046767', 3, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '4e17b833-e19a-5f94-a89b-e9e45f11959c', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '54df9344-65b2-5b7b-a7df-508ef8389764', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '573b0ea8-5f02-5f55-a221-fb520046f9d0', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'de9995d5-cb2d-5e03-a0f3-51a3cb1a75ed', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '177e0150-f96d-5270-a871-468041f4b743', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd4a551ec-d939-51a5-a6a6-be2f13878e13', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '7faef21f-4244-5e60-ad61-267b7c0f6ff6', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '169eb6e1-a65b-5ec2-a507-2c9651b3cf60', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'e25d713d-c046-5cb5-a7f4-0a3fc5995f21', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'fcd4f461-1f69-5d59-af61-2498b73b7ca1', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '806a379f-8b8d-5a74-ab22-db875d40a1cb', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'ee7481ae-b69d-576a-a077-57cf19c37713', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '842714bd-f5e7-5a40-a69f-deae4e4f6b44', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6afa9bc2-7cf7-58c2-aaa4-90b286b615cf', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '473c10fd-c8ae-59c6-a197-69151ad67b8f', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'a750ef0a-c062-5c2d-a33c-4d43e38a7907', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'a4aa3d7a-66d9-5c92-a992-abbc6debbfde', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '8254eeec-bb34-5416-a41e-972c7a8243ef', 2, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'dcb8aa77-1e16-56e1-a7f9-b5e228b903d2', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '87cbec16-d1ab-573e-ad39-3c6149d69189', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '246667bb-c8b4-532a-af3b-5de1294ee139', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'c42ac6ae-f703-5f84-a6ab-83a9f585427f', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '182f8eb7-261c-578c-a301-242f3dc0dfca', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'd8f42765-34bf-5a8c-a3af-91c518f1a8a4', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'cf779b5c-b1d3-52c5-a3f7-2c87a87b8dab', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6a73b6f9-90f9-5445-a168-15b9beb868ba', 10, 1, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '016691fe-1a07-503e-a05c-93951c4960d5', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '80458f16-4425-5c51-ac2e-e5e8f5833f0e', 400, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '319f9ba9-7974-5b07-ad7a-330624ae2bf1', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'e3446f21-70c3-586f-a971-9c760a06206f', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '203780c8-fe88-5eb1-acd3-3f32a6d697b1', 1, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '5ab634b1-c332-54b3-ab65-68e75e7e1648', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)');
-- VFI, rames et pagaies : sections d'Embarcations (onglets BPA et Rouge et
-- Diable). BPA : VFI comptés en 2024, rames et pagaies dans l'onglet 2026
-- (jour inconnu : dernière modification du Sheets, 23 août 2026) ; R&D :
-- liste sans nombres.
insert into inventaire.sections (nom, module, ordre) values
  ('VFI', 'embarcations', 101),
  ('Rames', 'embarcations', 102),
  ('Pagaies', 'embarcations', 103);

insert into inventaire.articles (id, nom, variante, section_id, lieu_id, entreprise_id, ordre)
select a.id::uuid, a.nom, a.variante, c.id, l.id, e.id, a.ordre
  from (values
    ('29439575-bae4-587e-a880-c8e334515c23', 'VFI', 'Enfant - Small', 'VFI', 'Cabane nautique', 'GBPA+', 1001),
    ('75e3ed2e-e653-5b71-a330-8ee79a409256', 'VFI', 'Enfant - Medium', 'VFI', 'Cabane nautique', 'GBPA+', 1002),
    ('40d4f98e-ae2d-5689-ac70-b069531f2971', 'VFI', 'Adulte - Small', 'VFI', 'Cabane nautique', 'GBPA+', 1003),
    ('6cac0b93-9996-54a1-a409-fa2cfa24f8c4', 'VFI', 'Adulte - Medium', 'VFI', 'Cabane nautique', 'GBPA+', 1004),
    ('bf573acd-19e3-55c6-a3fc-f840b5677746', 'VFI', 'Adulte - Large', 'VFI', 'Cabane nautique', 'GBPA+', 1005),
    ('5f8324c7-c1c3-52fd-a64b-80fecc311553', 'VFI', 'Adulte - X-Large', 'VFI', 'Cabane nautique', 'GBPA+', 1006),
    ('b0f68691-2805-55e0-a4e5-be48bd81122c', 'Rame', 'Très petit', 'Rames', 'Cabane nautique', 'GBPA+', 1007),
    ('b84adf60-60b5-50a4-a677-d456741bdff4', 'Rame', 'Petit-moyen', 'Rames', 'Cabane nautique', 'GBPA+', 1008),
    ('a52f4514-dc6e-5d14-ad31-f6ccfd31a6bf', 'Rame', 'Moyen-grand', 'Rames', 'Cabane nautique', 'GBPA+', 1009),
    ('6371951b-633c-507e-a88a-b32aa448214e', 'Rame', 'Très grand', 'Rames', 'Cabane nautique', 'GBPA+', 1010),
    ('42d8083b-b459-5668-ad31-c8ebe5dd7dd3', 'Pagaie', 'Kayak', 'Pagaies', 'Cabane nautique', 'GBPA+', 1011),
    ('e5babae8-40d1-58df-a53a-e8e6c8b20427', 'Pagaie', 'Kayak/paddle', 'Pagaies', 'Cabane nautique', 'GBPA+', 1012),
    ('f2c2305f-48b7-5804-af69-f8304664f5b8', 'Pagaie', 'Paddle', 'Pagaies', 'Cabane nautique', 'GBPA+', 1013),
    ('87616bea-b0c6-5614-a1f5-6309adf8ded0', 'VFI', 'Enfant - Small', 'VFI', 'R&D – stationnement', 'R&D', 1014),
    ('49f0f1c5-7182-5f37-abcf-f554c1b97c7a', 'VFI', 'Enfant - Medium', 'VFI', 'R&D – stationnement', 'R&D', 1015),
    ('8131ba5e-ab02-539d-aa17-9c6ea7e1d389', 'VFI', 'Adulte - Small', 'VFI', 'R&D – stationnement', 'R&D', 1016),
    ('9c2abd7b-7927-57bd-a5c3-8e93415ab721', 'VFI', 'Adulte - Medium', 'VFI', 'R&D – stationnement', 'R&D', 1017),
    ('d81e2280-8de7-5aee-a9c8-04dfb2e515ca', 'VFI', 'Adulte - Large', 'VFI', 'R&D – stationnement', 'R&D', 1018),
    ('df0e7131-407c-580b-a194-333f7f182504', 'VFI', 'Adulte - X-Large', 'VFI', 'R&D – stationnement', 'R&D', 1019),
    ('74566adc-39ab-5bc9-adb7-95c26dd60ae4', 'Pagaie', 'Jaune', 'Pagaies', 'R&D – stationnement', 'R&D', 1020),
    ('aa8c5e70-8df7-5725-a5c1-ca1013a4ec50', 'Pagaie', 'Noire', 'Pagaies', 'R&D – stationnement', 'R&D', 1021),
    ('32c725ff-2d17-577c-ae3d-a67cf4304f47', 'Pagaie', 'Noire carrée', 'Pagaies', 'R&D – stationnement', 'R&D', 1022),
    ('153e0fb2-e438-54e2-aa7f-fe5444211295', 'Pagaie', 'Enfant (orange)', 'Pagaies', 'R&D – stationnement', 'R&D', 1023)
  ) as a(id, nom, variante, section, lieu, compagnie, ordre)
  join inventaire.sections c on c.nom = a.section
  join inventaire.lieux l on l.nom = a.lieu
  left join lateral (
    select x.id from core.entreprises x
     where x.abreviation = a.compagnie or x.nom = a.compagnie
        or (a.compagnie = 'R&D' and x.nom ilike 'rouge%diable%')
     order by (x.abreviation = a.compagnie) desc nulls last, (x.nom = a.compagnie) desc
     limit 1
  ) e on true;

insert into inventaire.comptes (jour, article_id, bon, brise, incomplet, note, compte_par_nom) values
  ('2024-08-06', '29439575-bae4-587e-a880-c8e334515c23', 4, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '75e3ed2e-e653-5b71-a330-8ee79a409256', 23, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '40d4f98e-ae2d-5689-ac70-b069531f2971', 32, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '6cac0b93-9996-54a1-a409-fa2cfa24f8c4', 20, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', 'bf573acd-19e3-55c6-a3fc-f840b5677746', 21, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2024-08-06', '5f8324c7-c1c3-52fd-a64b-80fecc311553', 17, 0, 0, null, 'import du Sheets, onglet 2024 (jour approximatif)'),
  ('2026-08-23', 'b0f68691-2805-55e0-a4e5-be48bd81122c', 5, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', 'b84adf60-60b5-50a4-a677-d456741bdff4', 28, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', 'a52f4514-dc6e-5d14-ad31-f6ccfd31a6bf', 15, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', '6371951b-633c-507e-a88a-b32aa448214e', 9, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', '42d8083b-b459-5668-ad31-c8ebe5dd7dd3', 1, 5, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', 'e5babae8-40d1-58df-a53a-e8e6c8b20427', 5, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)'),
  ('2026-08-23', 'f2c2305f-48b7-5804-af69-f8304664f5b8', 3, 0, 0, null, 'import du Sheets, onglet 2026 (jour approximatif)');

-- ------------------------------------------------------------
-- Après l'import : la base note qui a compté ; pas de compte dans le
-- futur (un jour de marge pour le fuseau de l'appareil).
-- ------------------------------------------------------------
create function inventaire.verifier_compte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.jour > (now() at time zone 'America/Montreal')::date + 1 then
    raise exception 'JOUR_FUTUR' using hint = 'Un compte ne peut pas être daté dans le futur.';
  end if;
  new.compte_par := auth.uid();
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
    into new.compte_par_nom
    from core.profils p
   where p.id = auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function inventaire.verifier_compte() from public, anon;

create trigger trg_comptes_verifier before insert or update on inventaire.comptes
for each row execute function inventaire.verifier_compte();
