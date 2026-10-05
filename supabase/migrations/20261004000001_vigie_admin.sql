-- Vigie des camps : réservée aux administrateurs pour l'instant (décision du
-- 2026-10-04), pas encore à la direction. Pour l'ouvrir plus tard, remettre
-- core.peut_lire('vigie') / core.peut_ecrire('vigie') dans les politiques et
-- les fonctions ci-dessous, et retirer adminSeulement dans src/shell/modules.ts.

do $$
declare t text;
begin
  foreach t in array array['recherches','camps','programmes','activites','camps_activites','photos','maquettes','changements','requetes_ia','parametres'] loop
    execute format('drop policy "Lire" on vigie.%I', t);
    execute format('drop policy "Écrire" on vigie.%I', t);
    execute format('create policy "Admin lit" on vigie.%I for select to authenticated using (core.est_admin())', t);
    execute format(
      'create policy "Admin écrit" on vigie.%I for all to authenticated using (core.est_admin()) with check (core.est_admin())', t);
  end loop;
end $$;

create or replace function vigie.lancer(p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.est_admin() then
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
  if not core.est_admin() then
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
