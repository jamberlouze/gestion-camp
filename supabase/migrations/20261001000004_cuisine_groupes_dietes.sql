-- ============================================================
-- Cuisine : diètes et allergies des groupes d'un menu.
-- - Diètes standard demandées à chaque groupe : Régulière, Végétarienne
--   (colonne vege, déjà comptée dans la commande), Sans porc, Sans lactose,
--   Sans gluten. Une diète par participant : régulière = portions − les
--   autres. Sans porc, sans lactose et sans gluten sont de l'information pour
--   la cuisine (la commande ne change pas).
-- - Participants avec allergies ou restrictions : une ligne par personne,
--   imprimée sur la liste du groupe.
-- ============================================================

alter table commande.groupes_repas
  add column sans_porc integer not null default 0 check (sans_porc >= 0),
  add column sans_lactose integer not null default 0 check (sans_lactose >= 0),
  add column sans_gluten integer not null default 0 check (sans_gluten >= 0),
  add column notes text not null default '';

create table commande.participants (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null,
  groupe_id text not null,
  nom text not null default '',
  allergies text not null default '',
  -- Allergie grave : auto-injecteur (EpiPen) à garder près de la personne.
  epipen boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (menu_id, groupe_id) references commande.groupes_repas(menu_id, id) on delete cascade
);

create index participants_groupe_idx on commande.participants (menu_id, groupe_id);

create trigger trg_participants_toucher_menu after insert or update or delete on commande.participants
for each row execute function commande.toucher_menu();

grant select, insert, update, delete on commande.participants to authenticated, service_role;
alter table commande.participants enable row level security;
create policy "Lire" on commande.participants for select to authenticated using (core.peut_lire('commande'));
create policy "Écrire" on commande.participants for all to authenticated
  using (core.peut_ecrire('commande')) with check (core.peut_ecrire('commande'));
alter publication supabase_realtime add table commande.participants;

-- Copier un menu copie aussi les diètes, les notes et les participants.
create or replace function commande.copier_menu(
  p_source uuid,
  p_nom text,
  p_dossier uuid,
  p_modele boolean,
  p_debut date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  src commande.menus;
  m uuid;
begin
  select * into src from commande.menus where id = p_source;
  if not found then
    raise exception 'Menu introuvable.';
  end if;

  insert into commande.menus (nom, dossier_id, modele, jours, debut)
  values (
    p_nom,
    case when p_modele then null else p_dossier end,
    p_modele,
    src.jours,
    case when p_modele then null else p_debut end
  )
  returning id into m;

  insert into commande.groupes_repas (menu_id, id, name, age, portions, vege, sans_porc, sans_lactose, sans_gluten, notes, color, created_at)
  select m, g.id, g.name, g.age, g.portions, g.vege, g.sans_porc, g.sans_lactose, g.sans_gluten, g.notes, g.color, g.created_at
  from commande.groupes_repas g where g.menu_id = p_source;

  insert into commande.participants (menu_id, groupe_id, nom, allergies, epipen, note, created_at)
  select m, p.groupe_id, p.nom, p.allergies, p.epipen, p.note, p.created_at
  from commande.participants p where p.menu_id = p_source;

  insert into commande.plan_cells (menu_id, day, meal, plat, salade, dessert, absent)
  select m, c.day, c.meal, c.plat, c.salade, c.dessert, c.absent
  from commande.plan_cells c where c.menu_id = p_source;

  insert into commande.sorties (id, menu_id, nom, jour_depart, pattern, groupes, glaciere_id, created_at)
  select 's_' || left(replace(gen_random_uuid()::text, '-', ''), 13), m, s.nom, s.jour_depart, s.pattern,
         s.groupes, s.glaciere_id, s.created_at
  from commande.sorties s where s.menu_id = p_source;

  insert into commande.ajouts_consommables (menu_id, cons_id, qty)
  select m, a.cons_id, a.qty from commande.ajouts_consommables a where a.menu_id = p_source;

  insert into commande.ajouts_recettes (menu_id, recipe_id, portions, veg, created_at)
  select m, a.recipe_id, a.portions, a.veg, a.created_at
  from commande.ajouts_recettes a where a.menu_id = p_source;

  return m;
end;
$$;
