-- ============================================================
-- Accès aux modules par rôle (demande de la direction, 2026-10-05).
--
-- Une grille modules × rôles, réglée par les admins dans la page
-- Utilisateurs, remplace les règles codées en dur :
--   admin     : tout, toujours (personne ne peut s'enlever l'accès) ;
--   direction : les modules cochés pour la direction ;
--   coordo    : les modules cochés pour les coordonnateurs, plus les
--               ajouts personnels de core.acces_modules.
-- Une case absente = aucun accès. Le niveau retenu est le plus élevé
-- des deux (rôle, ajout personnel).
--
-- Restent hors de la grille :
--   - Feuilles de temps (schéma temps) : liste blanche temps.role_autorise,
--     jamais les coordonnateurs ni un rôle futur (règle de confidentialité) ;
--   - Subventions et Vigie des camps : jamais offerts aux coordonnateurs
--     (directionSeulement dans src/shell/modules.ts) ;
--   - Subventions n'a pas de mode lecture seule dans l'app : écriture ou rien.
-- ============================================================

create table core.acces_roles (
  role text not null check (role in ('direction','coordo')),
  module text not null check (module in
    ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules')),
  niveau text not null check (niveau in ('lecture','ecriture')),
  primary key (role, module),
  constraint acces_roles_direction_seulement
    check (not (role = 'coordo' and module in ('subventions','vigie'))),
  constraint acces_roles_subventions_sans_lecture
    check (not (module = 'subventions' and niveau = 'lecture'))
);

alter table core.acces_roles enable row level security;
create policy "Lire accès des rôles" on core.acces_roles for select to authenticated
  using (core.role_actuel() is not null);
create policy "Admin gère accès des rôles" on core.acces_roles for all to authenticated
  using (core.est_admin()) with check (core.est_admin());
grant select, insert, update, delete on core.acces_roles to authenticated;

-- Ce qui valait jusqu'ici : la direction écrit partout, sauf Subventions et
-- Vigie (admins seulement depuis le 2026-10-04) ; aucun module de base pour
-- les coordonnateurs (ils gardent leurs accès personnels).
insert into core.acces_roles (role, module, niveau) values
  ('direction','embarcations','ecriture'),
  ('direction','commande','ecriture'),
  ('direction','horaire','ecriture'),
  ('direction','mastertimeline','ecriture'),
  ('direction','calendrier','ecriture'),
  ('direction','vehicules','ecriture');

-- Niveau d'une personne dans un module : 'ecriture', 'lecture' ou null.
-- Seul endroit qui décide ; core.peut_lire / peut_ecrire, la fonction Edge
-- vigie et les destinataires de Subventions passent par ici.
create function core.niveau_module_de(p_user uuid, p_module text)
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
       and p.role = 'coordo' and p_module not in ('subventions','vigie')
  )
  select case
    when (select role from p) = 'admin' then 'ecriture'
    when exists (select 1 from niveaux where niveau = 'ecriture') then 'ecriture'
    when exists (select 1 from niveaux) then 'lecture'
  end
$$;

revoke execute on function core.niveau_module_de(uuid, text) from public, anon, authenticated;
grant execute on function core.niveau_module_de(uuid, text) to service_role;

create or replace function core.peut_lire(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.niveau_module_de(auth.uid(), p_module) is not null
$$;

create or replace function core.peut_ecrire(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(core.niveau_module_de(auth.uid(), p_module) = 'ecriture', false)
$$;

-- ------------------------------------------------------------
-- Subventions : l'accès suit la grille (écriture ou rien).
-- ------------------------------------------------------------
create or replace function subventions.a_acces()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.peut_ecrire('subventions')
$$;

create or replace function subventions.destinataires()
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_liste text[];
begin
  select array_agg(distinct btrim(a)) into v_liste
    from subventions.grant_settings s,
         regexp_split_to_table(coalesce(s.value #>> '{}', ''), '[,;\s]+') a
   where s.key = 'destinataires' and btrim(a) like '%@%';
  if coalesce(array_length(v_liste, 1), 0) > 0 then
    return v_liste;
  end if;
  select coalesce(array_agg(p.courriel order by p.courriel), '{}') into v_liste
    from core.profils p
   where core.niveau_module_de(p.id, 'subventions') is not null;
  return v_liste;
end;
$$;

drop function subventions.role_autorise(text);

-- ------------------------------------------------------------
-- Vigie des camps : retour à core.peut_lire / peut_ecrire.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recherches','camps','programmes','activites','camps_activites','photos','maquettes','changements','requetes_ia','parametres'] loop
    execute format('drop policy "Admin lit" on vigie.%I', t);
    execute format('drop policy "Admin écrit" on vigie.%I', t);
    execute format('create policy "Lire" on vigie.%I for select to authenticated using (core.peut_lire(''vigie''))', t);
    execute format(
      'create policy "Écrire" on vigie.%I for all to authenticated
         using (core.peut_ecrire(''vigie'')) with check (core.peut_ecrire(''vigie''))', t);
  end loop;
end $$;

create or replace function vigie.lancer(p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_ecrire('vigie') then
    raise exception 'Permission refusée.';
  end if;
  return vigie.creer_recherche(p_type, auth.uid());
end;
$$;

create or replace function vigie.demander(p_type text, p_activite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_ecrire('vigie') then
    raise exception 'Permission refusée.';
  end if;
  if p_type not in ('couts','maquette') then
    raise exception 'Type inconnu : %', p_type;
  end if;
  if not exists (
    select 1 from vigie.requetes_ia
    where activite_id = p_activite and type = p_type and statut in ('en_attente','soumise')) then
    insert into vigie.requetes_ia (type, activite_id) values (p_type, p_activite);
  end if;
end;
$$;
