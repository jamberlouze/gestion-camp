-- ============================================================
-- Terrain : un signalement quitte la vue de son auteur dès qu'il est
-- assigné, peu importe à qui (demande de Maxime du 2026-10-22, suite de
-- 20261022190310). Terrain voit ses tâches assignées et ses signalements
-- pas encore assignés (à trier, ou triés « à assigner ») ; assigné à
-- lui-même, le signalement reste dans sa liste comme sa tâche.
-- travaux.verifier_terrain ne change pas.
-- ============================================================

drop policy "Lire" on travaux.taches;
create policy "Lire" on travaux.taches for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or assigne_a = (select auth.uid())
              or (signale_par = (select auth.uid()) and assigne_a is null)));

drop policy "Lire" on travaux.photos;
create policy "Lire" on travaux.photos for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t
                         where t.id = tache_id
                           and (t.assigne_a = (select auth.uid())
                                or (t.signale_par = (select auth.uid()) and t.assigne_a is null)))));

drop policy "Lire" on travaux.commentaires;
create policy "Lire" on travaux.commentaires for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t
                         where t.id = tache_id
                           and (t.assigne_a = (select auth.uid())
                                or (t.signale_par = (select auth.uid()) and t.assigne_a is null)))));
