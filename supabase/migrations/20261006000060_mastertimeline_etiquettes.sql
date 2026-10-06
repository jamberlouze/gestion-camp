-- ============================================================
-- mastertimeline : étiquettes (tags) des tâches
-- La case « Corvée » devient une étiquette, et on ajoute « Woofing »
-- (demande de Maxime, 2026-10-06). La liste est propre au module et se
-- modifie dans Réglages ; une tâche peut en porter plusieurs.
-- ============================================================

create table mastertimeline.etiquettes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  couleur text,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_etiquettes_updated_at before update on mastertimeline.etiquettes
for each row execute function core.maj_updated_at();

alter table mastertimeline.taches add column etiquette_ids uuid[] not null default '{}';

comment on column mastertimeline.taches.etiquette_ids is
  'Étiquettes de la tâche (mastertimeline.etiquettes) ; retirées des tâches quand l''étiquette est supprimée';

-- Une étiquette supprimée disparaît des tâches qui la portaient.
create function mastertimeline.retirer_etiquette() returns trigger
language plpgsql set search_path = '' as $$
begin
  update mastertimeline.taches
     set etiquette_ids = array_remove(etiquette_ids, old.id)
   where old.id = any(etiquette_ids);
  return old;
end $$;

create trigger trg_etiquettes_retirer after delete on mastertimeline.etiquettes
for each row execute function mastertimeline.retirer_etiquette();

-- Départ : Corvée (reprend la case) et Woofing.
insert into mastertimeline.etiquettes (id, nom, couleur, ordre) values
  ('a3c1e7d2-5b0f-4c8e-9a61-2f4d8b7e0c01', 'Corvée', '#d97706', 1),
  ('a3c1e7d2-5b0f-4c8e-9a61-2f4d8b7e0c02', 'Woofing', '#5E7C3F', 2);

update mastertimeline.taches
   set etiquette_ids = array['a3c1e7d2-5b0f-4c8e-9a61-2f4d8b7e0c01'::uuid]
 where corvee;

alter table mastertimeline.taches drop column corvee;

-- Droits, RLS et temps réel : comme les autres listes du module.
grant select, insert, update, delete on mastertimeline.etiquettes to authenticated, service_role;
revoke execute on function mastertimeline.retirer_etiquette() from public, anon;
alter table mastertimeline.etiquettes enable row level security;
create policy "Lire" on mastertimeline.etiquettes for select to authenticated
  using (core.peut_lire('mastertimeline'));
create policy "Écrire" on mastertimeline.etiquettes for all to authenticated
  using (core.peut_ecrire('mastertimeline')) with check (core.peut_ecrire('mastertimeline'));
alter publication supabase_realtime add table mastertimeline.etiquettes;
