-- Réunions : « ❌ Pas de réunion » devient un choix (demande de Maxime du
-- 2026-10-08) : une ligne par jour sans réunion, cochée dans la vue Semaine.
create table reunions.jours_sans (
  jour date primary key,
  created_at timestamptz not null default now()
);

comment on table reunions.jours_sans is 'Jours marqués « Pas de réunion » dans la vue Semaine';

grant select, insert, update, delete on reunions.jours_sans to authenticated, service_role;
alter table reunions.jours_sans enable row level security;

create policy "Lire" on reunions.jours_sans for select to authenticated using (core.peut_lire('reunions'));
create policy "Écrire" on reunions.jours_sans for all to authenticated
  using (core.peut_ecrire('reunions')) with check (core.peut_ecrire('reunions'));

alter publication supabase_realtime add table reunions.jours_sans;
