-- ============================================================
-- Subventions : réservé aux administrateurs pour l'instant (décision du
-- 2026-10-04), pas encore à la direction.
--
-- Un seul endroit décide qui y a accès : subventions.role_autorise. Il
-- sert aux politiques RLS (par subventions.a_acces), au déclenchement
-- manuel du Worker (peut_utiliser) et aux destinataires par défaut du
-- courriel du lundi. Pour ouvrir le module à la direction plus tard :
-- une migration qui remplace role_autorise par
--   p_role in ('admin', 'direction')
-- et retirer adminSeulement dans src/shell/modules.ts.
-- ============================================================

create function subventions.role_autorise(p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_role = 'admin', false)
$$;

-- La personne connectée (profil actif) a-t-elle accès au module ?
create function subventions.a_acces()
returns boolean
language sql
stable
set search_path = ''
as $$
  select subventions.role_autorise(core.role_actuel())
$$;

revoke execute on function subventions.role_autorise(text), subventions.a_acces() from public, anon;
grant execute on function subventions.role_autorise(text), subventions.a_acces() to authenticated, service_role;

-- Le Worker vérifie ainsi qu'un déclenchement manuel vient d'une personne autorisée.
create or replace function subventions.peut_utiliser()
returns boolean
language sql
stable
set search_path = ''
as $$
  select subventions.a_acces()
$$;

-- Destinataires du courriel du lundi : la liste des réglages, sinon les
-- personnes actives qui ont accès au module.
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
   where p.actif and subventions.role_autorise(p.role);
  return v_liste;
end;
$$;

-- Politiques : toutes refaites sur subventions.a_acces().
do $$
declare
  r record;
  t text;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'subventions' loop
    execute format('drop policy %I on subventions.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array array['grant_companies', 'grants', 'grant_reporting_steps', 'grant_settings'] loop
    execute format(
      'create policy "Lire" on subventions.%I for select to authenticated using (subventions.a_acces())', t);
    execute format(
      'create policy "Écrire" on subventions.%I for all to authenticated
         using (subventions.a_acces()) with check (subventions.a_acces())', t);
  end loop;

  -- Écrites par le Worker seulement.
  foreach t in array array['grant_search_runs', 'grant_learned_rules', 'grant_digests'] loop
    execute format(
      'create policy "Lire" on subventions.%I for select to authenticated using (subventions.a_acces())', t);
  end loop;
end $$;

-- Feedback : chacun enregistre (et peut retirer) ses propres décisions.
create policy "Lire" on subventions.grant_feedback for select to authenticated
  using (subventions.a_acces());
create policy "Ses décisions" on subventions.grant_feedback for insert to authenticated
  with check (subventions.a_acces() and decided_by = auth.uid());
create policy "Retirer ses décisions" on subventions.grant_feedback for delete to authenticated
  using (subventions.a_acces() and decided_by = auth.uid());

-- Notes et heures : lues par tous ceux qui ont accès, modifiées ou
-- supprimées seulement par leur auteur.
create policy "Lire" on subventions.grant_notes for select to authenticated
  using (subventions.a_acces());
create policy "Ses notes" on subventions.grant_notes for insert to authenticated
  with check (subventions.a_acces() and author_id = auth.uid());
create policy "Modifier ses notes" on subventions.grant_notes for update to authenticated
  using (subventions.a_acces() and author_id = auth.uid())
  with check (subventions.a_acces() and author_id = auth.uid());
create policy "Supprimer ses notes" on subventions.grant_notes for delete to authenticated
  using (subventions.a_acces() and author_id = auth.uid());

create policy "Lire" on subventions.grant_time_entries for select to authenticated
  using (subventions.a_acces());
create policy "Ses heures" on subventions.grant_time_entries for insert to authenticated
  with check (subventions.a_acces() and user_id = auth.uid());
create policy "Modifier ses heures" on subventions.grant_time_entries for update to authenticated
  using (subventions.a_acces() and user_id = auth.uid())
  with check (subventions.a_acces() and user_id = auth.uid());
create policy "Supprimer ses heures" on subventions.grant_time_entries for delete to authenticated
  using (subventions.a_acces() and user_id = auth.uid());
