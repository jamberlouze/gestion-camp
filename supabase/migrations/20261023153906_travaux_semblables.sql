-- ============================================================
-- Travaux : tâches semblables (demande de Maxime du 2026-10-23 : un
-- signalement est peut-être déjà dans la liste, écrit autrement).
--
-- 1. travaux.titres_ouverts() : titre, lieu et statut des tâches pas
--    terminées, pour toute personne qui lit Travaux. Terrain ne lit que
--    ses tâches (20261022191304) ; quand il signale, l'app lui montre
--    « Déjà dans la liste ? » d'après ces titres seulement (choix de
--    Maxime : le titre, jamais qui s'en occupe ni les détails). La
--    comparaison se fait dans l'app (semblables.ts), hors ligne aussi.
-- 2. travaux.fusionner(signalement, tache) : la direction réunit un
--    signalement à trier avec la tâche qu'il répète. Ses photos et ses
--    commentaires passent à la tâche, son titre et ses détails y
--    deviennent un commentaire au nom de qui l'a signalé (à sa date),
--    puis il est retiré. Une transaction.
-- ============================================================

create function travaux.titres_ouverts()
returns table (id uuid, titre text, lieu_id uuid, statut text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.titre, t.lieu_id, t.statut
  from travaux.taches t
  where t.statut <> 'terminee'
    and (select core.peut_lire('travaux'))
$$;

create function travaux.fusionner(p_signalement uuid, p_tache uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s travaux.taches;
begin
  if not travaux.peut_trier() then
    raise exception 'Seule la direction réunit un signalement avec une tâche.' using errcode = '42501';
  end if;
  if p_signalement = p_tache then
    raise exception 'Choisis une autre tâche que le signalement lui-même.';
  end if;
  select * into s from travaux.taches where id = p_signalement for update;
  if not found or s.statut <> 'a_trier' then
    raise exception 'Ce signalement n''est plus à trier.';
  end if;
  perform 1 from travaux.taches where id = p_tache and statut <> 'terminee' for update;
  if not found then
    raise exception 'La tâche à garder n''existe plus ou est terminée.';
  end if;

  update travaux.photos set tache_id = p_tache where tache_id = p_signalement;
  update travaux.commentaires set tache_id = p_tache where tache_id = p_signalement;
  insert into travaux.commentaires (tache_id, auteur, texte, created_at)
  values (
    p_tache,
    s.signale_par,
    'Signalé aussi' || case when s.priorite = 1 then ' (urgent)' else '' end || ' : « ' || s.titre || ' »'
      || coalesce(E'\n' || nullif(btrim(s.description), ''), ''),
    s.created_at
  );
  delete from travaux.taches where id = p_signalement;
end;
$$;

revoke execute on function travaux.titres_ouverts(), travaux.fusionner(uuid, uuid) from public, anon;
grant execute on function travaux.titres_ouverts(), travaux.fusionner(uuid, uuid) to authenticated, service_role;
