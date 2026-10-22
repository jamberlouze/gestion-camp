-- ============================================================
-- Rôle Terrain : seulement ses tâches (demande de Maxime du 2026-10-22 :
-- « seulement montrer les tâches qui sont assignées au compte dans Travaux
-- et Mastertimeline. Rien d'autre »). Travaux : assigne_a = soi ;
-- Mastertimeline : responsable_id = soi. Ni les tâches libres, ni celles
-- des autres, ni ses signalements une fois envoyés (la direction les trie).
-- Photos, commentaires, coches et pièces jointes suivent leur tâche.
-- Les autres rôles ne changent pas.
-- ============================================================

create function core.est_terrain()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(core.role_actuel() = 'terrain', false)
$$;

revoke execute on function core.est_terrain() from public, anon;
grant execute on function core.est_terrain() to authenticated, service_role;

-- ------------------------------------------------------------
-- Travaux. Écrire ne donne jamais à lire (politiques par commande) ;
-- l'app envoie un signalement sans le relire (insertion simple, pas
-- d'« on conflict », qui demanderait de voir la ligne).
-- ------------------------------------------------------------
drop policy "Lire" on travaux.taches;
create policy "Lire" on travaux.taches for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain()) or assigne_a = (select auth.uid())));

drop policy "Lire" on travaux.photos;
create policy "Lire" on travaux.photos for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t where t.id = tache_id and t.assigne_a = (select auth.uid()))));

drop policy "Lire" on travaux.commentaires;
create policy "Lire" on travaux.commentaires for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t where t.id = tache_id and t.assigne_a = (select auth.uid()))));

-- ------------------------------------------------------------
-- Mastertimeline. « Écrire » (pour tout) donnait aussi à lire : séparé
-- en ajouter / modifier / supprimer, pour que seule « Lire » décide de ce
-- qu'on voit (un compte Terrain qui écrirait dans le module ne voit
-- toujours que ses tâches).
-- ------------------------------------------------------------
drop policy "Lire" on mastertimeline.taches;
create policy "Lire" on mastertimeline.taches for select to authenticated
  using (core.peut_lire('mastertimeline')
         and (not (select core.est_terrain()) or responsable_id = (select auth.uid())));

drop policy "Lire" on mastertimeline.coches;
create policy "Lire" on mastertimeline.coches for select to authenticated
  using (core.peut_lire('mastertimeline')
         and (not (select core.est_terrain())
              or exists (select 1 from mastertimeline.taches t where t.id = tache_id and t.responsable_id = (select auth.uid()))));

drop policy "Lire" on mastertimeline.fichiers;
create policy "Lire" on mastertimeline.fichiers for select to authenticated
  using (core.peut_lire('mastertimeline')
         and (not (select core.est_terrain())
              or exists (select 1 from mastertimeline.taches t where t.id = tache_id and t.responsable_id = (select auth.uid()))));

do $$
declare t text;
begin
  foreach t in array array['taches','coches','fichiers'] loop
    execute format('drop policy "Écrire" on mastertimeline.%I', t);
    execute format(
      'create policy "Ajouter" on mastertimeline.%I for insert to authenticated
         with check (core.peut_ecrire(''mastertimeline''))', t);
    execute format(
      'create policy "Modifier" on mastertimeline.%I for update to authenticated
         using (core.peut_ecrire(''mastertimeline'')) with check (core.peut_ecrire(''mastertimeline''))', t);
    execute format(
      'create policy "Supprimer" on mastertimeline.%I for delete to authenticated
         using (core.peut_ecrire(''mastertimeline''))', t);
  end loop;
end $$;
