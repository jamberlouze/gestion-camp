-- Vigie des camps : trois catégories (décision du 2026-10-05).
--   leader          : leader de l'industrie (courte liste donnée par la direction)
--   reference       : référence, catégorie par défaut de tout camp
--   non_comparable  : pas un comparable (appliqué à la main) ; ne compte pas
--                     dans les comparaisons et n'est plus vérifié chaque mois
-- Les anciennes catégories (compétiteur direct / référence, pré-remplies par
-- Claude à l'import) deviennent toutes « référence ».

alter table vigie.camps drop constraint camps_categorie_check;
update vigie.camps set categorie = 'reference' where categorie is distinct from 'reference';
alter table vigie.camps alter column categorie set default 'reference';
alter table vigie.camps alter column categorie set not null;
alter table vigie.camps add constraint camps_categorie_check
  check (categorie in ('leader','reference','non_comparable'));

-- La vérification mensuelle laisse de côté les camps « pas un comparable »,
-- et commence par les leaders.
create or replace function vigie.creer_recherche(p_type text, p_par uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_type not in ('mensuelle','decouverte') then
    raise exception 'Type de recherche inconnu : %', p_type;
  end if;
  if exists (select 1 from vigie.recherches where type = p_type and statut = 'en_cours') then
    raise exception 'Une recherche de ce type est déjà en cours.';
  end if;

  insert into vigie.recherches (type, lance_par) values (p_type, p_par) returning id into v_id;

  if p_type = 'mensuelle' then
    insert into vigie.requetes_ia (recherche_id, type, camp_id)
    select v_id, 'verification', c.id
    from vigie.camps c
    where c.statut_inclusion = 'inclus' and c.categorie <> 'non_comparable'
    order by (c.categorie = 'leader') desc, c.nom;
  else
    insert into vigie.requetes_ia (recherche_id, type) values (v_id, 'decouverte');
  end if;
  return v_id;
end;
$$;
