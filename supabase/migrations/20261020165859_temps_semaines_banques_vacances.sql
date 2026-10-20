-- ============================================================
-- temps : la banque d'heures se calcule toute seule (demande de Maxime du
-- 2026-10-20) — une semaine finie où les heures payées n'atteignent pas
-- les heures attendues, le manque est tiré de la banque (banques.ts). Les
-- vacances comblent le manque comme la maladie : semaines_banques les rend
-- aussi. Rien d'autre ne change (sécurité de l'appelant, mêmes droits).
-- ============================================================

drop function temps.semaines_banques(date);

-- Heures par personne et par semaine (dimanche) jusqu'au jour p_au :
-- régulières, vacances, maladie et anciennes heures prises en banque
-- (woofing : jamais). Employé : toutes compagnies confondues, pas de vacances.
create function temps.semaines_banques(p_au date)
returns table (user_id uuid, employe_id uuid, semaine date, regulieres numeric, vacances numeric, maladie numeric, banque numeric)
language sql
stable
set search_path = ''
as $$
  select h.user_id, null::uuid, h.jour - extract(dow from h.jour)::int,
         coalesce(sum(h.heures) filter (where h.type = 'regulieres'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'vacances'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'maladie'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'banque'), 0)
    from temps.heures h
   where h.jour <= p_au
   group by h.user_id, h.jour - extract(dow from h.jour)::int
  union all
  select null::uuid, h.employe_id, h.jour - extract(dow from h.jour)::int,
         coalesce(sum(h.heures) filter (where h.type = 'regulieres'), 0),
         0::numeric,
         coalesce(sum(h.heures) filter (where h.type = 'maladie'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'banque'), 0)
    from temps.heures_employes h
   where h.jour <= p_au
   group by h.employe_id, h.jour - extract(dow from h.jour)::int
$$;

revoke execute on function temps.semaines_banques(date) from public, anon;
grant execute on function temps.semaines_banques(date) to authenticated, service_role;
