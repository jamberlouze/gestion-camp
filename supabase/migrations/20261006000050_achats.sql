-- ============================================================
-- Achats : la liste des achats d'équipement, sortie de Mastertimeline
-- (décision de la direction, 2026-10-06 : un module à part, réservé à
-- la direction).
--
-- Un achat suit trois statuts : a_commander → commande → recu. Il a une
-- quantité et un prix estimé à l'unité (total = quantité × prix), une
-- entreprise (qui paie) et un fournisseur. Entreprises et fournisseurs
-- sont les listes de Mastertimeline, lues seulement (modifiées dans
-- Mastertimeline › Réglages), comme pour Travaux.
--
-- Les achats de mastertimeline.achats sont déplacés ici (même id) :
-- « commandé » → commande, sinon a_commander.
-- ============================================================

-- ------------------------------------------------------------
-- Module achats dans la grille d'accès : la direction écrit.
-- ------------------------------------------------------------
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

insert into core.acces_roles (role, module, niveau) values ('direction','achats','ecriture');

create schema if not exists achats;

create table achats.achats (
  id uuid primary key default gen_random_uuid(),
  item text not null check (btrim(item) <> ''),
  statut text not null default 'a_commander' check (statut in ('a_commander','commande','recu')),
  -- null = pas encore précisée
  quantite integer check (quantite > 0),
  -- Prix estimé à l'unité, en dollars ; null = pas encore estimé.
  prix_unitaire numeric(10,2) check (prix_unitaire >= 0),
  entreprise_id uuid references mastertimeline.entreprises(id) on delete set null,
  fournisseur_id uuid references mastertimeline.fournisseurs(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table achats.achats is 'Achats d''équipement à faire, commandés ou reçus';

create index idx_achats_statut on achats.achats(statut);

create trigger trg_achats_updated_at before update on achats.achats
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema achats to authenticated, service_role;
grant select, insert, update, delete on all tables in schema achats to authenticated, service_role;

alter table achats.achats enable row level security;

create policy "Lire" on achats.achats for select to authenticated
  using (core.peut_lire('achats'));
create policy "Écrire" on achats.achats for all to authenticated
  using (core.peut_ecrire('achats')) with check (core.peut_ecrire('achats'));

-- Entreprises et fournisseurs de Mastertimeline : listes communes, lues
-- aussi par Achats (modifiées seulement dans Mastertimeline).
create policy "Achats lit" on mastertimeline.entreprises for select to authenticated
  using (core.peut_lire('achats'));
create policy "Achats lit" on mastertimeline.fournisseurs for select to authenticated
  using (core.peut_lire('achats'));

alter publication supabase_realtime add table achats.achats;

-- ------------------------------------------------------------
-- Les achats de Mastertimeline déménagent ici.
-- ------------------------------------------------------------
insert into achats.achats (id, item, statut, fournisseur_id, note, created_at, updated_at)
select id, item, case when commande then 'commande' else 'a_commander' end, fournisseur_id, note, created_at, updated_at
from mastertimeline.achats;

drop table mastertimeline.achats;
