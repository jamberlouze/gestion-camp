-- ============================================================
-- Étiquettes (Corvée, Woofing…) aussi sur les tâches de Travaux
-- (demande de Maxime, 2026-10-07). Une seule liste pour les deux
-- modules : mastertimeline.etiquettes, gérée dans Mastertimeline ›
-- Réglages. Seule la direction pose les étiquettes dans Travaux.
-- Les vues par étiquette de Mastertimeline rassemblent les deux.
-- ============================================================

alter table travaux.taches add column etiquette_ids uuid[] not null default '{}';

comment on column travaux.taches.etiquette_ids is
  'Étiquettes de la tâche (mastertimeline.etiquettes) ; posées par la direction seulement';

-- Seule la direction pose ou retire une étiquette (à côté de
-- travaux.verifier_tache, qui garde ses règles).
create function travaux.verifier_etiquettes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or travaux.peut_trier() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.etiquette_ids := '{}';
  elsif new.etiquette_ids is distinct from old.etiquette_ids then
    raise exception 'Seule la direction peut poser une étiquette.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_taches_etiquettes before insert or update on travaux.taches
for each row execute function travaux.verifier_etiquettes();

revoke execute on function travaux.verifier_etiquettes() from public, anon;

-- Une étiquette supprimée disparaît aussi des tâches de Travaux.
create or replace function mastertimeline.retirer_etiquette() returns trigger
language plpgsql set search_path = '' as $$
begin
  update mastertimeline.taches
     set etiquette_ids = array_remove(etiquette_ids, old.id)
   where old.id = any(etiquette_ids);
  update travaux.taches
     set etiquette_ids = array_remove(etiquette_ids, old.id)
   where old.id = any(etiquette_ids);
  return old;
end $$;

-- La liste est lue aussi par Travaux (puces sur les tâches).
create policy "Travaux lit" on mastertimeline.etiquettes for select to authenticated
  using (core.peut_lire('travaux'));

-- Annualiser garde les étiquettes de la tâche.
create or replace function travaux.annualiser(
  p_tache uuid,
  p_mois smallint[],
  p_entreprise uuid,
  p_projet uuid,
  p_responsable uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  t travaux.taches;
  v_id uuid;
  v_aujourdhui date := (now() at time zone 'America/Toronto')::date;
  v_exercice smallint;
begin
  if not travaux.peut_trier() or not core.peut_ecrire('mastertimeline') then
    raise exception 'Seule la direction qui écrit dans Mastertimeline peut annualiser une tâche.' using errcode = '42501';
  end if;
  select * into t from travaux.taches where id = p_tache for update;
  if not found then
    raise exception 'Tâche introuvable.';
  end if;
  if t.annualisee_vers is not null then
    raise exception 'Cette tâche est déjà dans Mastertimeline.';
  end if;
  if coalesce(cardinality(p_mois), 0) = 0 then
    raise exception 'Choisis au moins un mois.';
  end if;
  -- Exercice d'octobre à septembre, désigné par l'année où il commence.
  v_exercice := extract(year from v_aujourdhui)::smallint
    - case when extract(month from v_aujourdhui) >= 10 then 0 else 1 end;

  insert into mastertimeline.taches
    (titre, entreprise_id, projet_id, responsable_id, fournisseur_id, note, mois, exercice_depart, etiquette_ids)
  values
    (t.titre, p_entreprise, p_projet, p_responsable, t.fournisseur_id, t.description,
     (select array_agg(distinct m order by m) from unnest(p_mois) m), v_exercice, t.etiquette_ids)
  returning id into v_id;

  update travaux.taches
     set statut = 'terminee', annualisee_vers = v_id
   where id = p_tache;
  return v_id;
end;
$$;
