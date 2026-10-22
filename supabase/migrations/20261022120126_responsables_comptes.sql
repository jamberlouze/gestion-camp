-- ============================================================
-- Responsables uniformes (demande de Maxime du 2026-10-21) : Mastertimeline,
-- Travaux et Achats choisissent leurs responsables dans la même liste, les
-- comptes de l'app (core.profils), comme Subventions. On ne peut choisir
-- qu'un compte actif qui écrit dans le module (les admins toujours) —
-- Mastertimeline : qui le lit (le responsable coche ses tâches, voir plus
-- bas) ; une personne déjà responsable garde son nom à l'écran.
-- ============================================================

-- ------------------------------------------------------------
-- Liste commune : noms des comptes pour un module (core.profils n'est
-- lisible que par la direction). Jamais le courriel ni le rôle.
-- peut_assigner = compte actif qui écrit dans le module ; dans
-- Mastertimeline, la lecture suffit (demande de Maxime du 2026-10-22).
-- ------------------------------------------------------------
create function core.personnes_module(p_module text)
returns table (id uuid, nom text, actif boolean, peut_assigner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1)),
         p.actif,
         case p_module
           when 'mastertimeline' then core.niveau_module_de(p.id, p_module) is not null
           else coalesce(core.niveau_module_de(p.id, p_module) = 'ecriture', false)
         end
  from core.profils p
  where core.peut_lire(p_module)
  order by 2
$$;

revoke execute on function core.personnes_module(text) from public, anon;
grant execute on function core.personnes_module(text) to authenticated;

-- Travaux avait déjà cette règle : un seul endroit la tient.
create or replace function travaux.personnes()
returns table (id uuid, nom text, actif boolean, peut_assigner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select * from core.personnes_module('travaux')
$$;

-- ------------------------------------------------------------
-- Mastertimeline : les tâches passent de la liste du module aux comptes.
-- Un responsable du module = le compte au même courriel, sinon au même
-- prénom (ou nom complet) ; homonymes : le compte actif le plus ancien.
-- Sans compte : la tâche devient sans responsable, l'ancien nom est gardé
-- dans sa note permanente.
-- ------------------------------------------------------------
create temporary table correspondance on commit drop as
select r.id as responsable_id, r.nom,
       (select p.id
          from core.profils p
         where (r.courriel is not null and lower(btrim(p.courriel)) = lower(btrim(r.courriel)))
            or lower(btrim(r.nom)) in (lower(btrim(p.prenom)), lower(btrim(p.nom)), lower(split_part(btrim(p.nom), ' ', 1)))
         order by (r.courriel is not null and lower(btrim(p.courriel)) = lower(btrim(r.courriel))) desc,
                  p.actif desc, p.created_at
         limit 1) as profil_id
  from mastertimeline.responsables r;

update mastertimeline.taches t
   set note = concat_ws(E'\n\n', nullif(btrim(t.note), ''), 'Ancien responsable : ' || c.nom || ' (pas de compte dans l''app).')
  from correspondance c
 where c.responsable_id = t.responsable_id
   and c.profil_id is null;

alter table mastertimeline.taches drop constraint taches_responsable_id_fkey;

update mastertimeline.taches t
   set responsable_id = c.profil_id
  from correspondance c
 where c.responsable_id = t.responsable_id;

alter table mastertimeline.taches
  add constraint taches_responsable_id_fkey foreign key (responsable_id) references core.profils(id) on delete set null;

comment on column mastertimeline.taches.responsable_id is
  'Responsable de la tâche (compte, choisi parmi core.personnes_module) ; vide = sans responsable.';

drop table mastertimeline.responsables;

-- Le responsable d'une tâche coche ses passages (statut et note de l'année)
-- même s'il ne fait que lire le module ; les tâches des autres et la tâche
-- elle-même restent à qui écrit dans Mastertimeline.
create policy "Responsable : cocher ses tâches" on mastertimeline.coches
  for all to authenticated
  using (core.peut_lire('mastertimeline')
         and exists (select 1 from mastertimeline.taches t where t.id = tache_id and t.responsable_id = (select auth.uid())))
  with check (core.peut_lire('mastertimeline')
              and exists (select 1 from mastertimeline.taches t where t.id = tache_id and t.responsable_id = (select auth.uid())));

-- ------------------------------------------------------------
-- Achats : un responsable par achat, même liste.
-- ------------------------------------------------------------
alter table achats.achats
  add column responsable_id uuid references core.profils(id) on delete set null;

comment on column achats.achats.responsable_id is
  'Responsable de l''achat (compte, choisi parmi core.personnes_module) ; vide = personne.';

create index on achats.achats (responsable_id);
