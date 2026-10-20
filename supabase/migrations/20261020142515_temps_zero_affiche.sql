-- Feuilles de temps : un « 0 » saisi est gardé et affiché (demande de Maxime,
-- 2026-10-20 : la feuille se remplit au jour le jour ; un 0 dit que la
-- journée est remplie, sans heures, et pas oubliée). Avant, 0 = ligne
-- supprimée ; maintenant seule une case vidée supprime la ligne.
--
-- Une ligne à 0 h ne compte pour rien : sommes inchangées, exports filtrés
-- (`!h.heures`), et elle ne repousse pas le relevé d'emploi (plus bas).

alter table temps.heures drop constraint heures_heures_check;
alter table temps.heures add constraint heures_heures_check
  check (heures >= 0 and heures <= 24 and heures * 4 = trunc(heures * 4));

alter table temps.heures_employes drop constraint heures_employes_heures_check;
alter table temps.heures_employes add constraint heures_employes_heures_check
  check (heures >= 0 and heures <= 24 and heures * 4 = trunc(heures * 4));

-- Dossiers à fermer : « a eu des heures » = des heures non nulles (un 0 saisi
-- ne garde pas un dossier ouvert). Sinon identiques à 20261014173205.
create or replace function temps.dossiers_a_fermer(p_periode date default null)
returns table (employe_id uuid, surnom text, nom_complet text, derniere_periode date)
language sql
stable
set search_path = ''
as $$
  with p as (
    select least(
      temps.debut_periode(greatest(coalesce(p_periode, temps.aujourdhui()), temps.premiere_periode())),
      temps.debut_periode(greatest(temps.aujourdhui(), temps.premiere_periode()))
    ) as debut
  ),
  dernieres as (
    select h.employe_id, temps.debut_periode(max(h.jour)) as derniere
      from temps.heures_employes h, p
     where h.jour <= p.debut + 13 and h.heures > 0
     group by h.employe_id
  )
  select e.id, e.surnom, e.nom_complet, d.derniere
    from dernieres d
    join core.employes e on e.id = d.employe_id and e.actif
    cross join p
   where temps.a_acces()
     and d.derniere <= p.debut - 28 - 14
     and not exists (
       select 1 from temps.dossiers_fermes f where f.employe_id = d.employe_id and f.derniere_periode >= d.derniere)
   order by e.surnom
$$;

create or replace function temps.fermer_dossier(p_employe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_derniere date;
begin
  if not temps.a_acces() then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  select temps.debut_periode(max(h.jour)) into v_derniere
    from temps.heures_employes h where h.employe_id = p_employe and h.heures > 0;
  if v_derniere is null then
    raise exception 'Cet employé n''a aucune heure : rien à fermer.';
  end if;
  insert into temps.dossiers_fermes (employe_id, derniere_periode, auteur, auteur_nom)
  values (p_employe, v_derniere, auth.uid(), temps.nom_actuel());
  update core.employes set actif = false where id = p_employe;
end;
$$;
