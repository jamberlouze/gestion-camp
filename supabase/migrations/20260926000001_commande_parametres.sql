-- ============================================================
-- commande.parametres : réglages partagés du module (ex. nombre de jours
-- et date de début du planificateur, autrefois perdus au rechargement).
-- ============================================================

create table commande.parametres (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger trg_parametres_updated_at before update on commande.parametres
for each row execute function core.maj_updated_at();

grant select, insert, update, delete on commande.parametres to authenticated, service_role;

alter table commande.parametres enable row level security;

create policy "Lire" on commande.parametres for select to authenticated
  using (core.peut_lire('commande'));
create policy "Écrire" on commande.parametres for all to authenticated
  using (core.peut_ecrire('commande')) with check (core.peut_ecrire('commande'));

alter publication supabase_realtime add table commande.parametres;

insert into commande.parametres (cle, valeur) values ('planificateur', '{"jours": 7, "debut": null}');
