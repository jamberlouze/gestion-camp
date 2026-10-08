-- ============================================================
-- temps : « remplit sa feuille » se règle sur le COMPTE (page Utilisateurs),
-- plus sur la fiche d'employé (demande de Maxime du 2026-10-07 : tous ces
-- employés ont un compte, la case n'a pas à être sur chaque fiche).
--
-- core.profils.employe_id : la fiche du référentiel dont ce compte remplit
-- la feuille (ses heures restent par employé et par compagnie dans
-- temps.heures_employes, comme la grille Employés). core.profils.woofing :
-- heures de woofing sur sa feuille. Réglés par les admins seulement
-- (politique « Admin modifie profils »).
-- Remplace core.employes.feuille_propre / woofing et la reconnaissance par
-- courriel (20261008015849, jamais en PROD).
-- ============================================================

alter table core.profils
  add column employe_id uuid unique references core.employes(id) on delete set null,
  add column woofing boolean not null default false;

comment on column core.profils.employe_id is
  'Fiche d''employé dont ce compte remplit lui-même la feuille de temps (null = non) ; jamais pour la direction';
comment on column core.profils.woofing is 'Heures de woofing (non payées) sur sa feuille de temps';

-- Reprise des réglages faits sur les fiches (base DEV seulement).
update core.profils p
   set employe_id = e.id, woofing = e.woofing
  from core.employes e
 where e.feuille_propre and lower(e.courriel) = lower(p.courriel);

drop trigger trg_feuille_propre on core.employes;
drop function core.verifier_feuille_propre();
drop index core.employes_courriel_feuille;
alter table core.employes drop column feuille_propre, drop column woofing;

-- L'employé connecté, s'il remplit sa feuille (null sinon). Un membre de la
-- direction n'y passe jamais : il a sa propre feuille (temps.heures).
create or replace function temps.mon_employe()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.employe_id
    from core.profils p
    join core.employes e on e.id = p.employe_id and e.actif
   where p.id = auth.uid() and p.actif and not temps.role_autorise(p.role)
$$;

-- Employés qui remplissent leur feuille (compte actif hors direction) et
-- leur option woofing : tous pour la direction, soi-même pour un employé.
create function temps.feuilles_propres()
returns table (employe_id uuid, woofing boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.employe_id, p.woofing
    from core.profils p
    join core.employes e on e.id = p.employe_id and e.actif
   where p.actif and not temps.role_autorise(p.role)
     and (temps.a_acces() or p.employe_id = temps.mon_employe())
$$;

revoke execute on function temps.feuilles_propres() from public, anon;
grant execute on function temps.feuilles_propres() to authenticated, service_role;

-- Du woofing seulement pour un employé dont le compte a l'option.
create or replace function temps.verifier_heures_employe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'woofing'
     and not exists (select 1 from core.profils p where p.employe_id = new.employe_id and p.woofing) then
    raise exception 'Le woofing n''est pas activé pour cet employé (page Utilisateurs).'
      using errcode = 'check_violation';
  end if;
  if (select coalesce(sum(h.heures), 0) from temps.heures_employes h
       where h.employe_id = new.employe_id and h.jour = new.jour
         and (h.entreprise_id, h.type) is distinct from (new.entreprise_id, new.type))
     + new.heures > 24 then
    raise exception 'Plus de 24 heures le % (toutes compagnies).', to_char(new.jour, 'YYYY-MM-DD')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
