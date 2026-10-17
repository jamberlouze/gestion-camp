-- ============================================================
-- Subventions : responsable de chaque demande (demande de Maxime,
-- 2026-10-16) : une personne par ligne de suivi (subvention × compagnie
-- qui dépose), affichée dans le tableau du Suivi et choisie sur place ou
-- sur la fiche. Vide = pas encore assignée.
-- ============================================================

alter table subventions.grant_applications
  add column responsible_id uuid references core.profils(id) on delete set null;

comment on column subventions.grant_applications.responsible_id is
  'Responsable de la demande (compte) ; vide = pas encore assignée.';

create index on subventions.grant_applications (responsible_id);

-- Personnes qu'on peut choisir : comptes actifs qui écrivent dans
-- Subventions (les admins toujours). Aussi, pour garder leur nom à l'écran,
-- celles déjà responsables d'une demande (choisissable = false si elles
-- n'y ont plus accès). core.profils n'est lisible que par la direction :
-- d'où security definer, pour qui a le module seulement.
create function subventions.responsables()
returns table (id uuid, nom text, choisissable boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1)),
         p.actif and (p.role = 'admin' or core.niveau_module_de(p.id, 'subventions') = 'ecriture')
    from core.profils p
   where subventions.a_acces()
     and ((p.actif and (p.role = 'admin' or core.niveau_module_de(p.id, 'subventions') = 'ecriture'))
          or exists (select 1 from subventions.grant_applications a where a.responsible_id = p.id))
   order by 2
$$;

revoke execute on function subventions.responsables() from public, anon;
grant execute on function subventions.responsables() to authenticated;
