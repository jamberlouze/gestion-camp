-- ============================================================
-- Terrain voit aussi ses signalements (demande de Maxime du 2026-10-22,
-- suite de 20261022181315) : ses tâches assignées et les tâches qu'il a
-- signalées, à trier ou déjà triées. Il ne coche que les tâches qui lui
-- sont assignées : un signalement trié pour quelqu'un d'autre se lit
-- seulement. Seule la direction assigne (plus de « prendre » ni de
-- « laisser » pour Terrain).
-- ============================================================

drop policy "Lire" on travaux.taches;
create policy "Lire" on travaux.taches for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or assigne_a = (select auth.uid())
              or signale_par = (select auth.uid())));

drop policy "Lire" on travaux.photos;
create policy "Lire" on travaux.photos for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t
                         where t.id = tache_id
                           and (t.assigne_a = (select auth.uid()) or t.signale_par = (select auth.uid())))));

drop policy "Lire" on travaux.commentaires;
create policy "Lire" on travaux.commentaires for select to authenticated
  using (core.peut_lire('travaux')
         and (not (select core.est_terrain())
              or exists (select 1 from travaux.taches t
                         where t.id = tache_id
                           and (t.assigne_a = (select auth.uid()) or t.signale_par = (select auth.uid())))));

-- ------------------------------------------------------------
-- Gestes de Terrain, en plus de travaux.verifier_tache (corriger ou
-- retirer son signalement tant qu'il est à trier reste permis).
-- ------------------------------------------------------------
create function travaux.verifier_terrain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not core.est_terrain() then
    return new;
  end if;
  if new.assigne_a is distinct from old.assigne_a then
    raise exception 'Seule la direction assigne une tâche.' using errcode = '42501';
  end if;
  if new.statut is distinct from old.statut and old.assigne_a is distinct from auth.uid() then
    raise exception 'Seule la personne assignée coche cette tâche.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function travaux.verifier_terrain() from public, anon;

create trigger trg_taches_terrain before update on travaux.taches
for each row execute function travaux.verifier_terrain();
