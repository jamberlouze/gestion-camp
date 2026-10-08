-- ============================================================
-- Améliorations (demande de Maxime du 2026-10-07) : sa liste pour faire
-- avancer l'app. Trois genres d'idées dans une seule liste :
--   `module`         nouveau module à bâtir ;
--   `fonctionnalite` ajout à un module existant (`module` = son id) ;
--   `commentaire`    commentaire de l'équipe (`de_qui` = qui l'a dit,
--                    `module` facultatif : vide = l'app en général).
-- Statuts simples : a_faire → fait, ou ecarte.
--
-- Admins seulement (« juste pour moi ») : hors de la grille d'accès
-- (accesFixe dans l'app), RLS par core.est_admin(). Le module n'est donc
-- pas ajouté aux contraintes de core.acces_roles / core.acces_modules.
-- ============================================================

create schema if not exists ameliorations;

create table ameliorations.idees (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('module','fonctionnalite','commentaire')),
  titre text not null check (btrim(titre) <> ''),
  details text,
  -- Id d'un module de l'app (src/shell/modules.ts), en texte libre : la
  -- liste des modules change sans migration.
  module text,
  de_qui text,
  statut text not null default 'a_faire' check (statut in ('a_faire','fait','ecarte')),
  important boolean not null default false,
  -- Posé par la base au passage à « fait » ou « écarté », effacé au retour.
  ferme_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (genre <> 'module' or module is null),
  check (genre <> 'fonctionnalite' or module is not null)
);

create trigger trg_ameliorations_idees_updated_at before update on ameliorations.idees
for each row execute function core.maj_updated_at();

create or replace function ameliorations.poser_ferme_le()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut = 'a_faire' then
    new.ferme_le := null;
  elsif tg_op = 'INSERT' or old.statut is distinct from new.statut then
    new.ferme_le := now();
  end if;
  return new;
end;
$$;

create trigger trg_ameliorations_ferme_le before insert or update on ameliorations.idees
for each row execute function ameliorations.poser_ferme_le();

-- ------------------------------------------------------------
-- Droits et RLS : admins seulement.
-- ------------------------------------------------------------
grant usage on schema ameliorations to authenticated, service_role;
grant select, insert, update, delete on all tables in schema ameliorations to authenticated, service_role;

alter table ameliorations.idees enable row level security;

create policy "Admins" on ameliorations.idees for all to authenticated
  using (core.est_admin()) with check (core.est_admin());

alter publication supabase_realtime add table ameliorations.idees;
