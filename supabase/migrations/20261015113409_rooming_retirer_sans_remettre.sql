-- ============================================================
-- rooming : retirer de la référence, c'est la supprimer (demande de
-- Maxime, 2026-10-15). Plus de « Remettre » : un lieu ou une chambre
-- retiré disparaît de la référence. S'il sert encore dans un plan, la
-- ligne reste en base (actif = false) pour que ce plan garde ses chambres,
-- mais elle n'apparaît plus que dans ce plan ; dès qu'aucun plan ne
-- l'utilise plus (plan supprimé), elle est effacée.
-- ============================================================

drop function rooming.remettre_lieu(uuid);

-- Efface les lieux et les chambres retirés de la référence qu'aucun plan
-- n'utilise plus (chambres, puis lieux du plus profond au plus haut).
create function rooming.effacer_retires()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from rooming.chambres c
  where not c.actif
    and not exists (select 1 from rooming.occupations o where o.chambre_id = c.id);
  loop
    delete from rooming.lieux l
    where not l.actif
      and not exists (select 1 from rooming.chambres c where c.lieu_id = l.id)
      and not exists (select 1 from rooming.lieux e where e.parent_id = l.id);
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
end;
$$;

create function rooming.apres_suppression_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform rooming.effacer_retires();
  return null;
end;
$$;

create trigger effacer_retires
after delete on rooming.plans
for each statement execute function rooming.apres_suppression_plan();

-- Ce qui était déjà retiré et ne sert plus.
select rooming.effacer_retires();
