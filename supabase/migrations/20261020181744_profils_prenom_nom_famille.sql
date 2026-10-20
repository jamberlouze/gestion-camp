-- ============================================================
-- Prénom et nom de famille des comptes (demande de Maxime, 2026-10-20) :
-- l'onglet Employés des Feuilles de temps classe tout le monde par nom de
-- famille, la direction comprise, et l'export Employeur D en tire son
-- « Nom, prénom » (avant : deviné en coupant le nom au premier espace).
--
-- Comme core.employes : prenom + nom_famille, réglés dans la page
-- Utilisateurs (admins) ; `nom` (« Prénom Nom », lu partout dans l'app)
-- est refait par la base dès que l'un des deux est connu — ne plus
-- l'écrire directement. Sans prénom ni nom de famille, `nom` reste tel quel.
-- Mêmes droits que le reste du profil (« Admin modifie profils »).
-- ============================================================

alter table core.profils
  add column prenom text,
  add column nom_famille text;

comment on column core.profils.prenom is 'Prénom (page Utilisateurs) ; nom = « Prénom Nom », posé par core.poser_nom_profil';
comment on column core.profils.nom_famille is 'Nom de famille (page Utilisateurs) : ordre des listes, « Nom, prénom » de l''export Employeur D';

create function core.poser_nom_profil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.prenom := nullif(btrim(regexp_replace(new.prenom, '\s+', ' ', 'g')), '');
  new.nom_famille := nullif(btrim(regexp_replace(new.nom_famille, '\s+', ' ', 'g')), '');
  if new.prenom is not null or new.nom_famille is not null then
    new.nom := concat_ws(' ', new.prenom, new.nom_famille);
  end if;
  return new;
end;
$$;

create trigger trg_poser_nom_profil before insert or update on core.profils
for each row execute function core.poser_nom_profil();

-- Reprise des comptes existants : « Prénom Nom » coupé au premier espace
-- (même règle que l'ancien nomDirection de l'export Employeur D ; les
-- prénoms composés ont un trait d'union). Un nom d'un seul mot devient le
-- prénom, sans nom de famille : à compléter dans Utilisateurs. À vérifier
-- dans Utilisateurs (ex. un nom de famille de deux mots est gardé entier,
-- un prénom de deux mots sans trait d'union serait coupé).
update core.profils
   set prenom = split_part(btrim(regexp_replace(nom, '\s+', ' ', 'g')), ' ', 1),
       nom_famille = nullif(substring(btrim(regexp_replace(nom, '\s+', ' ', 'g'))
                                      from position(' ' in btrim(regexp_replace(nom, '\s+', ' ', 'g'))) + 1), '')
 where nullif(btrim(nom), '') is not null
   and position(' ' in btrim(regexp_replace(nom, '\s+', ' ', 'g'))) > 0;

update core.profils
   set prenom = btrim(nom)
 where nullif(btrim(nom), '') is not null
   and prenom is null;
