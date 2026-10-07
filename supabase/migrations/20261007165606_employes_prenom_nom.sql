-- ============================================================
-- Référentiel › Employés (demande de Maxime du 2026-10-07) :
--   - « Nom complet » devient deux champs, prénom et nom de famille ;
--     nom_complet reste (« Nom, Prénom », lu par les Feuilles de temps), mais
--     il est maintenant posé par la base à partir des deux champs ;
--   - les spécialités (escalade, transport, sauveteur) sont retirées : rien
--     ne s'en servait (aucune valeur en PROD).
-- ============================================================

alter table core.employes
  add column prenom text check (prenom is null or (prenom = btrim(prenom) and prenom <> '')),
  add column nom_famille text check (nom_famille is null or (nom_famille = btrim(nom_famille) and nom_famille <> ''));

-- « Nom, Prénom » → les deux champs ; sans virgule, tout va dans le prénom.
update core.employes
   set nom_famille = nullif(btrim(split_part(nom_complet, ',', 1)), ''),
       prenom = nullif(btrim(substr(nom_complet, strpos(nom_complet, ',') + 1)), '')
 where nom_complet like '%,%';
update core.employes
   set prenom = nullif(btrim(nom_complet), '')
 where nom_complet is not null and nom_complet not like '%,%';

create function core.poser_nom_complet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nom_complet := case
    when new.nom_famille is null then new.prenom
    when new.prenom is null then new.nom_famille
    else new.nom_famille || ', ' || new.prenom
  end;
  return new;
end;
$$;

create trigger trg_nom_complet before insert or update on core.employes
for each row execute function core.poser_nom_complet();

comment on column core.employes.nom_complet is '« Nom, Prénom », posé par la base à partir de prenom et nom_famille';

alter table core.employes drop column specialites;
