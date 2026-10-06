-- ============================================================
-- Accès par rôle, suite (demande de la direction, 2026-10-05) :
--   - Subventions et Vigie des camps peuvent aussi être donnés aux
--     coordonnateurs (par la grille ou en ajout personnel) ;
--   - les ajouts personnels (core.acces_modules) valent pour toute personne
--     qui n'est pas admin, plus seulement les coordonnateurs.
-- Inchangé : Subventions = écriture ou rien ; Feuilles de temps hors grille
-- et hors ajouts (liste blanche temps.role_autorise).
-- ============================================================

alter table core.acces_roles drop constraint acces_roles_direction_seulement;

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules'));
alter table core.acces_modules add constraint acces_modules_subventions_sans_lecture
  check (not (module = 'subventions' and niveau = 'lecture'));

create or replace function core.niveau_module_de(p_user uuid, p_module text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select role from core.profils where id = p_user and actif
  ), niveaux as (
    select r.niveau from core.acces_roles r, p
     where r.role = p.role and r.module = p_module
    union all
    select a.niveau from core.acces_modules a, p
     where a.user_id = p_user and a.module = p_module
  )
  select case
    when (select role from p) = 'admin' then 'ecriture'
    when exists (select 1 from niveaux where niveau = 'ecriture') then 'ecriture'
    when exists (select 1 from niveaux) then 'lecture'
  end
$$;
