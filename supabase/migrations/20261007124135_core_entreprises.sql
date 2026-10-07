-- ============================================================
-- core.entreprises : les compagnies du groupe dans le référentiel commun
-- (demande de Maxime du 2026-10-07 : plusieurs modules s'en servent).
--
-- La liste de Mastertimeline (mastertimeline.entreprises : GBPA+,
-- Opikawa, BPA inc., Aquabounga, Rouge & Diable) est DÉPLACÉE telle quelle
-- dans core : mêmes lignes, mêmes identifiants, et les clés étrangères
-- (tâches de Mastertimeline, achats) suivent la table. Rien n'est copié ni
-- effacé. On y ajoute une abréviation et une description.
--
-- Vigie de subventions et Véhicules suivent (décisions de Maxime du même
-- jour) : plus qu'une seule liste de compagnies dans l'app.
--
-- Droits : comme le reste du référentiel, lue par toute personne active et
-- modifiée par la direction (avant : les personnes qui écrivent dans
-- Mastertimeline). Elle se gère maintenant dans Référentiel › Compagnies,
-- plus dans Mastertimeline › Réglages.
-- ============================================================

alter table mastertimeline.entreprises set schema core;

-- Anciennes politiques (propres à Mastertimeline et Achats).
drop policy "Lire" on core.entreprises;
drop policy "Écrire" on core.entreprises;
drop policy "Achats lit" on core.entreprises;

alter table core.entreprises
  add column abreviation text check (abreviation is null or (abreviation = btrim(abreviation) and abreviation <> '')),
  add column description text check (description is null or (description = btrim(description) and description <> ''));

comment on table core.entreprises is 'Compagnies du groupe (référentiel commun : Mastertimeline, Achats, Feuilles de temps…)';

create policy "Lire compagnies" on core.entreprises for select to authenticated
  using (core.role_actuel() is not null);
create policy "Direction gère compagnies" on core.entreprises for all to authenticated
  using (core.est_direction()) with check (core.est_direction());

-- ============================================================
-- Véhicules : la liste « compagnies propriétaires » (vehicules.proprietaires,
-- mêmes noms) est remplacée par le référentiel. Chaque propriétaire est
-- retrouvé par son nom (ajouté au référentiel s'il n'y est pas) et les
-- véhicules pointent vers la compagnie du référentiel.
-- ============================================================
insert into core.entreprises (nom, ordre)
select p.nom, (select coalesce(max(ordre), 0) from core.entreprises) + row_number() over (order by p.ordre, p.nom)
  from vehicules.proprietaires p
 where not exists (select 1 from core.entreprises e where lower(e.nom) = lower(p.nom));

alter table vehicules.vehicules drop constraint vehicules_proprietaire_id_fkey;
update vehicules.vehicules v
   set proprietaire_id = (select e.id from core.entreprises e join vehicules.proprietaires p on lower(p.nom) = lower(e.nom)
                           where p.id = v.proprietaire_id order by e.nom = p.nom desc limit 1)
 where v.proprietaire_id is not null;
alter table vehicules.vehicules add constraint vehicules_proprietaire_id_fkey
  foreign key (proprietaire_id) references core.entreprises(id) on delete restrict;
comment on column vehicules.vehicules.proprietaire_id is 'Compagnie propriétaire (core.entreprises)';

drop table vehicules.proprietaires;

-- ============================================================
-- Vigie de subventions : une « entreprise » de recherche
-- (subventions.grant_companies) devient le profil de recherche d'une
-- compagnie du référentiel (entreprise_id, une seule recherche par
-- compagnie). Ses réglages restent ici (critères, statut juridique,
-- embauche, ordre, active) ; son nom vient du référentiel.
--
-- Correspondance (Maxime, 2026-10-07) : « Base de Plein Air
-- Mont-Tremblant » (l'OBNL) = GBPA+ ; Opikawa = Opikawa ; Trembloc est
-- ajouté au référentiel. Toute autre entreprise de recherche est retrouvée
-- par son nom, sinon ajoutée au référentiel.
-- ============================================================
alter table subventions.grant_companies
  add column entreprise_id uuid unique references core.entreprises(id) on delete restrict;

update subventions.grant_companies g
   set entreprise_id = e.id
  from core.entreprises e
 where e.nom = case g.slug when 'bpa' then 'GBPA+' when 'opikawa' then 'Opikawa' when 'trembloc' then 'Trembloc' end;

update subventions.grant_companies g
   set entreprise_id = (select e.id from core.entreprises e where lower(e.nom) = lower(g.name) limit 1)
 where g.entreprise_id is null;

insert into core.entreprises (nom, ordre)
select g.name, (select coalesce(max(ordre), 0) from core.entreprises) + row_number() over (order by g.sort_order, g.name)
  from subventions.grant_companies g
 where g.entreprise_id is null;

update subventions.grant_companies g
   set entreprise_id = (select e.id from core.entreprises e where e.nom = g.name)
 where g.entreprise_id is null;

-- Le nom long de la recherche (ex. « Base de Plein Air Mont-Tremblant »)
-- devient la description de la compagnie, s'il diffère et qu'elle n'en a pas.
update core.entreprises e
   set description = g.name || coalesce(' (' || g.legal_status || ')', '')
  from subventions.grant_companies g
 where g.entreprise_id = e.id and g.name <> e.nom and e.description is null;

alter table subventions.grant_companies alter column entreprise_id set not null;

-- Le nom affiché et envoyé à Claude (colonne name, lue telle quelle par le
-- Worker) est une copie du nom du référentiel, tenue à jour par la base.
create function subventions.nom_compagnie()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select e.nom into new.name from core.entreprises e where e.id = new.entreprise_id;
  return new;
end;
$$;

create trigger trg_nom_compagnie before insert or update of entreprise_id, name on subventions.grant_companies
for each row execute function subventions.nom_compagnie();

update subventions.grant_companies g set name = e.nom from core.entreprises e where e.id = g.entreprise_id;

create function core.renommer_compagnie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update subventions.grant_companies set name = new.nom where entreprise_id = new.id;
  return new;
end;
$$;

create trigger trg_renommer_compagnie after update of nom on core.entreprises
for each row when (old.nom is distinct from new.nom) execute function core.renommer_compagnie();

revoke execute on function subventions.nom_compagnie(), core.renommer_compagnie() from public, anon;

-- ============================================================
-- Couleur de chaque compagnie (Maxime, 2026-10-07) : ses étiquettes en
-- prennent la teinte dans tous les modules.
-- ============================================================
update core.entreprises e
   set couleur = v.couleur
  from (values
    ('GBPA+', '#19774a'),          -- vert
    ('Opikawa', '#e67e22'),        -- orange
    ('Aquabounga', '#f1c40f'),     -- jaune
    ('Rouge & Diable', '#c0392b'), -- rouge
    ('Trembloc', '#8b5a2b'),       -- brun
    ('BPA inc.', '#7f8c8d')        -- gris
  ) as v(nom, couleur)
 where e.nom = v.nom;
