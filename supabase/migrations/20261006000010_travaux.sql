-- ============================================================
-- Travaux : tâches ponctuelles du terrain et du bâtiment
-- (demande de la direction, 2026-10-06 ; avant : Asana).
--
-- Tout le monde signale (photo, lieu, catégorie) ; la direction trie
-- (priorité, assignation, rejet). Statuts simples :
--   a_trier  : signalement pas encore regardé par la direction ;
--   a_faire  : trié, à faire ;
--   terminee : fait (ou annualisé : envoyé vers Mastertimeline).
-- Un rejet efface le signalement.
--
-- Une tâche a un lieu et une catégorie (listes modifiables par la
-- direction dans Réglages) et peut faire partie d'un chantier (date
-- cible, terminé ou non). Les chantiers reprennent les projets
-- ponctuels de Mastertimeline, déplacés ici avec leurs tâches.
--
-- Nouveau rôle « terrain » (aides de camp, équipe d'entretien) : un
-- compte par personne, qui ne voit que les modules de sa ligne dans la
-- grille d'accès (Travaux au départ). Terrain et coordonnateurs
-- signalent, prennent une tâche libre et la cochent ; seuls les champs
-- permis changent (déclencheur travaux.verifier_tache).
--
-- Hors ligne (comme Embarcations) : identifiants créés sur l'appareil,
-- fait_le envoyé par l'appareil (heure réelle du geste).
-- ============================================================

-- ------------------------------------------------------------
-- Rôle terrain et module travaux dans la grille d'accès
-- ------------------------------------------------------------
alter table core.profils drop constraint profils_role_check;
alter table core.profils add constraint profils_role_check
  check (role in ('admin','direction','coordo','terrain'));

alter table core.acces_roles drop constraint acces_roles_role_check;
alter table core.acces_roles add constraint acces_roles_role_check
  check (role in ('direction','coordo','terrain'));

alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats'));

insert into core.acces_roles (role, module, niveau) values
  ('direction','travaux','ecriture'),
  ('coordo','travaux','ecriture'),
  ('terrain','travaux','ecriture');

create schema if not exists travaux;

-- ------------------------------------------------------------
-- Listes : lieux, catégories, chantiers
-- ------------------------------------------------------------
create table travaux.lieux (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table travaux.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un chantier qui se termine (Trembloc…). lieu_id = lieu proposé pour
-- ses nouvelles tâches.
create table travaux.chantiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (btrim(nom) <> ''),
  couleur text,
  lieu_id uuid references travaux.lieux(id) on delete set null,
  date_cible date,
  termine_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Tâches
-- ------------------------------------------------------------
create table travaux.taches (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (btrim(titre) <> ''),
  description text,
  statut text not null default 'a_trier' check (statut in ('a_trier','a_faire','terminee')),
  -- Retirer un lieu, une catégorie ou un chantier ne supprime pas ses tâches.
  lieu_id uuid references travaux.lieux(id) on delete set null,
  categorie_id uuid references travaux.categories(id) on delete set null,
  chantier_id uuid references travaux.chantiers(id) on delete set null,
  assigne_a uuid references core.profils(id) on delete set null,
  -- 1 = urgent, 2 = prioritaire, 3 = normal (par défaut)
  priorite smallint not null default 3 check (priorite between 1 and 3),
  echeance date,
  heures_prevues numeric check (heures_prevues >= 0),
  fournisseur_id uuid references mastertimeline.fournisseurs(id) on delete set null,
  -- Ordre choisi dans un chantier (repris de Mastertimeline).
  position double precision,
  signale_par uuid references core.profils(id) on delete set null,
  fait_le timestamptz,
  fait_par uuid references core.profils(id) on delete set null,
  -- Tâche annuelle créée dans Mastertimeline à partir de celle-ci.
  annualisee_vers uuid references mastertimeline.taches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statut = 'terminee' or annualisee_vers is null)
);

create index idx_travaux_taches_statut on travaux.taches(statut);
create index idx_travaux_taches_chantier on travaux.taches(chantier_id);
create index idx_travaux_taches_assigne on travaux.taches(assigne_a);

create table travaux.photos (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references travaux.taches(id) on delete cascade,
  -- Chemin dans le seau travaux-photos : <tache_id>/<id>.jpg
  chemin text not null unique,
  ajoutee_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_travaux_photos_tache on travaux.photos(tache_id);

create table travaux.commentaires (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references travaux.taches(id) on delete cascade,
  auteur uuid default auth.uid() references core.profils(id) on delete set null,
  texte text not null check (btrim(texte) <> ''),
  created_at timestamptz not null default now()
);

create index idx_travaux_commentaires_tache on travaux.commentaires(tache_id);

create trigger trg_lieux_updated_at before update on travaux.lieux
for each row execute function core.maj_updated_at();
create trigger trg_categories_updated_at before update on travaux.categories
for each row execute function core.maj_updated_at();
create trigger trg_chantiers_updated_at before update on travaux.chantiers
for each row execute function core.maj_updated_at();
create trigger trg_taches_updated_at before update on travaux.taches
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Qui trie : la direction (admin compris) qui écrit dans Travaux.
-- ------------------------------------------------------------
create function travaux.peut_trier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.est_direction() and core.peut_ecrire('travaux')
$$;

-- ------------------------------------------------------------
-- Règles d'une tâche, pour tout le monde :
--   - cochée (passe à terminee) : fait_le = heure envoyée par l'appareil
--     (geste fait hors ligne), sinon maintenant ; fait_par = la personne ;
--   - décochée : plus de fait_le ni fait_par.
-- Pour qui ne trie pas (terrain, coordonnateurs) :
--   - un nouveau signalement arrive « à trier », sans assignation ni
--     champs de la direction ;
--   - son auteur peut corriger titre, description, lieu et catégorie tant
--     qu'il est à trier ;
--   - une tâche à faire ou terminée se coche / décoche, se prend (assignée
--     à soi) ou se laisse (plus assignée) ; rien d'autre ne change.
-- Les requêtes sans personne connectée (migrations, clé de service)
-- passent sans contrôle.
-- ------------------------------------------------------------
create function travaux.verifier_tache()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  trie boolean := moi is not null and travaux.peut_trier();
begin
  if tg_op = 'INSERT' then
    if moi is not null then
      new.signale_par := moi;
    end if;
    if moi is not null and not trie then
      new.statut := 'a_trier';
      new.assigne_a := null;
      new.chantier_id := null;
      new.echeance := null;
      new.heures_prevues := null;
      new.fournisseur_id := null;
      new.position := null;
      new.annualisee_vers := null;
      new.fait_le := null;
      new.fait_par := null;
    end if;
  else
    if moi is not null and not trie then
      if new.chantier_id is distinct from old.chantier_id
        or new.priorite is distinct from old.priorite
        or new.echeance is distinct from old.echeance
        or new.heures_prevues is distinct from old.heures_prevues
        or new.fournisseur_id is distinct from old.fournisseur_id
        or new.position is distinct from old.position
        or new.annualisee_vers is distinct from old.annualisee_vers
        or new.signale_par is distinct from old.signale_par
        or new.created_at is distinct from old.created_at then
        raise exception 'Seule la direction peut modifier ce champ.' using errcode = '42501';
      end if;
      if (new.titre is distinct from old.titre
          or new.description is distinct from old.description
          or new.lieu_id is distinct from old.lieu_id
          or new.categorie_id is distinct from old.categorie_id)
        and not (old.statut = 'a_trier' and old.signale_par = moi) then
        raise exception 'Seule la direction peut modifier une tâche déjà triée.' using errcode = '42501';
      end if;
      if new.statut is distinct from old.statut
        and (old.statut = 'a_trier' or new.statut = 'a_trier' or old.annualisee_vers is not null) then
        raise exception 'Seule la direction peut trier une tâche.' using errcode = '42501';
      end if;
      if new.assigne_a is distinct from old.assigne_a
        and not (old.statut <> 'a_trier'
                 and ((old.assigne_a is null and new.assigne_a = moi)
                      or (old.assigne_a = moi and new.assigne_a is null))) then
        raise exception 'On peut seulement prendre une tâche libre ou laisser la sienne.' using errcode = '42501';
      end if;
    end if;
    if new.statut = 'terminee' and old.statut <> 'terminee' then
      new.fait_le := least(coalesce(new.fait_le, now()), now());
      new.fait_par := coalesce(moi, new.fait_par);
    elsif new.statut <> 'terminee' then
      new.fait_le := null;
      new.fait_par := null;
    elsif moi is not null and not trie then
      new.fait_le := old.fait_le;
      new.fait_par := old.fait_par;
    end if;
  end if;
  if tg_op = 'INSERT' and new.statut = 'terminee' then
    new.fait_le := least(coalesce(new.fait_le, now()), now());
    new.fait_par := coalesce(new.fait_par, moi);
  end if;
  return new;
end;
$$;

create trigger trg_taches_verifier before insert or update on travaux.taches
for each row execute function travaux.verifier_tache();

-- ------------------------------------------------------------
-- Personnes : noms des comptes pour l'assignation et l'affichage
-- (core.profils n'est lisible que par la direction). Jamais le courriel
-- ni le rôle. peut_assigner = écrit dans Travaux.
-- ------------------------------------------------------------
create function travaux.personnes()
returns table (id uuid, nom text, actif boolean, peut_assigner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1)),
         p.actif,
         coalesce(core.niveau_module_de(p.id, 'travaux') = 'ecriture', false)
  from core.profils p
  where core.peut_lire('travaux')
  order by 2
$$;

-- ------------------------------------------------------------
-- Annualiser : la tâche devient une tâche annuelle de Mastertimeline
-- (mois choisis, à partir de l'exercice en cours) ; ici, elle est fermée
-- avec un lien vers elle. Une seule transaction ; droits de la personne
-- (RLS des deux schémas).
-- ------------------------------------------------------------
create function travaux.annualiser(
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
    (titre, entreprise_id, projet_id, responsable_id, fournisseur_id, note, mois, exercice_depart)
  values
    (t.titre, p_entreprise, p_projet, p_responsable, t.fournisseur_id, t.description,
     (select array_agg(distinct m order by m) from unnest(p_mois) m), v_exercice)
  returning id into v_id;

  update travaux.taches
     set statut = 'terminee', annualisee_vers = v_id
   where id = p_tache;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema travaux to authenticated, service_role;
grant select, insert, update, delete on all tables in schema travaux to authenticated, service_role;
revoke execute on all functions in schema travaux from public, anon;
grant execute on function travaux.peut_trier(), travaux.personnes(),
  travaux.annualiser(uuid, smallint[], uuid, uuid, uuid) to authenticated, service_role;

alter table travaux.lieux enable row level security;
alter table travaux.categories enable row level security;
alter table travaux.chantiers enable row level security;
alter table travaux.taches enable row level security;
alter table travaux.photos enable row level security;
alter table travaux.commentaires enable row level security;

-- Listes : lues par le module, modifiées par la direction.
do $$
declare t text;
begin
  foreach t in array array['lieux','categories','chantiers'] loop
    execute format('create policy "Lire" on travaux.%I for select to authenticated using (core.peut_lire(''travaux''))', t);
    execute format(
      'create policy "Direction écrit" on travaux.%I for all to authenticated
         using (travaux.peut_trier()) with check (travaux.peut_trier())', t);
  end loop;
end $$;

-- Tâches : tout le tableau est visible ; le détail des champs permis
-- est vérifié par travaux.verifier_tache.
create policy "Lire" on travaux.taches for select to authenticated
  using (core.peut_lire('travaux'));
create policy "Signaler" on travaux.taches for insert to authenticated
  with check (core.peut_ecrire('travaux'));
create policy "Modifier" on travaux.taches for update to authenticated
  using (core.peut_ecrire('travaux')) with check (core.peut_ecrire('travaux'));
-- Rejeter (direction) ; l'auteur peut retirer son signalement pas encore trié.
create policy "Supprimer" on travaux.taches for delete to authenticated
  using (travaux.peut_trier()
         or (core.peut_ecrire('travaux') and statut = 'a_trier' and signale_par = auth.uid()));

-- Photos et commentaires : chacun ajoute les siens ; on retire les siens,
-- la direction retire tout.
create policy "Lire" on travaux.photos for select to authenticated
  using (core.peut_lire('travaux'));
create policy "Ajouter" on travaux.photos for insert to authenticated
  with check (core.peut_ecrire('travaux') and ajoutee_par = auth.uid());
create policy "Retirer" on travaux.photos for delete to authenticated
  using (travaux.peut_trier() or (core.peut_ecrire('travaux') and ajoutee_par = auth.uid()));

create policy "Lire" on travaux.commentaires for select to authenticated
  using (core.peut_lire('travaux'));
create policy "Ajouter" on travaux.commentaires for insert to authenticated
  with check (core.peut_ecrire('travaux') and auteur = auth.uid());
create policy "Retirer" on travaux.commentaires for delete to authenticated
  using (travaux.peut_trier() or (core.peut_ecrire('travaux') and auteur = auth.uid()));

-- Fournisseurs de Mastertimeline : liste commune, lue aussi par Travaux
-- (modifiée seulement dans Mastertimeline).
create policy "Travaux lit" on mastertimeline.fournisseurs for select to authenticated
  using (core.peut_lire('travaux'));

alter publication supabase_realtime add table
  travaux.lieux, travaux.categories, travaux.chantiers, travaux.taches,
  travaux.photos, travaux.commentaires;

-- ------------------------------------------------------------
-- Photos : seau public travaux-photos (photos de bris et de chantiers,
-- rien de personnel), chemins impossibles à deviner.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travaux-photos', 'travaux-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Travaux : ajouter une photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'travaux-photos' and core.peut_ecrire('travaux'));
create policy "Travaux : retirer une photo" on storage.objects for delete to authenticated
  using (bucket_id = 'travaux-photos'
         and (travaux.peut_trier() or (core.peut_ecrire('travaux') and owner_id = auth.uid()::text)));
-- Le client de stockage relit l'objet après l'envoi.
create policy "Travaux : lire les photos" on storage.objects for select to authenticated
  using (bucket_id = 'travaux-photos' and core.peut_lire('travaux'));

-- ------------------------------------------------------------
-- Lieux et catégories de départ (validés par la direction le 2026-10-06,
-- modifiables dans Réglages).
-- ------------------------------------------------------------
insert into travaux.lieux (nom, ordre) values
  ('Bâtiment principal', 1),
  ('Cuisine', 2),
  ('Motel', 3),
  ('Bureaux et infirmerie', 4),
  ('Costumier', 5),
  ('Plage et quai', 6),
  ('Cabane nautique', 7),
  ('Aires de feux et camping', 8),
  ('Sentiers et forêt', 9),
  ('Terrain sportif et estrade', 10),
  ('Tir à l''arc et tag-à-l''arc', 11),
  ('Trembloc', 12),
  ('Chalet', 13),
  ('Containers et entreposage', 14),
  ('Fosse septique et pompage', 15);

insert into travaux.categories (nom, ordre) values
  ('Plomberie', 1),
  ('Électricité', 2),
  ('Menuiserie et construction', 3),
  ('Peinture et finition', 4),
  ('Nettoyage', 5),
  ('Terrain et paysager', 6),
  ('Équipement et achats', 7),
  ('Sécurité', 8);

-- ------------------------------------------------------------
-- Déplacement des projets ponctuels de Mastertimeline.
-- Lieu = celui du chantier (sauf quelques tâches ailleurs) ; catégorie
-- d'après le titre ; priorité 1 → urgent, 2 → prioritaire, 3-4 ou vide
-- → normal ; responsable → le compte du même nom, sinon nom gardé dans
-- la description ; note permanente → description ; coche faite ou
-- abandonnée → terminée ; note de l'année → commentaire.
-- ------------------------------------------------------------
create temporary table lieu_chantier (projet text, lieu text) on commit drop;
insert into lieu_chantier values
  ('Trembloc', 'Trembloc'),
  ('Chambre Motel', 'Motel'),
  ('Rafraîchissement du bâtiment', 'Bâtiment principal'),
  ('Travaux bâtiment', 'Bâtiment principal'),
  ('Travaux forestiers', 'Sentiers et forêt'),
  ('Nouveau site de tir à l''arc', 'Tir à l''arc et tag-à-l''arc'),
  ('Nouveau site de tag-à-l''arc', 'Tir à l''arc et tag-à-l''arc'),
  ('Aménagement paysager', 'Plage et quai');

create temporary table classement (titre text, categorie text, lieu text) on commit drop;
insert into classement values
  ('Trimmer cèdres côté plage et estrade pour dégager', 'Terrain et paysager', null),
  ('Terminer plancher flotant', 'Menuiserie et construction', null),
  ('Motel : Enlever le mur entre les chambres', 'Menuiserie et construction', null),
  ('Assembler lits', 'Menuiserie et construction', null),
  ('Aménagement nouveau site tag-à-l''arc', 'Terrain et paysager', null),
  ('Solution de rangement (mieux que la tite cabane de plastique)', 'Menuiserie et construction', null),
  ('Nouvelles cibles de tir à l''arc', 'Équipement et achats', null),
  ('Déplacer le filet', 'Terrain et paysager', null),
  ('Construire nouvelles cloisons', 'Menuiserie et construction', null),
  ('Aménagement du site de Tir à l''arc', 'Terrain et paysager', null),
  ('Remettre panneau drapeau et signature', 'Menuiserie et construction', null),
  ('Peinture sur les étages (Chambre, aires communes etc.)', 'Peinture et finition', null),
  ('Peinturer sous les lits', 'Peinture et finition', null),
  ('Finir gypse portes CH et CB', 'Peinture et finition', null),
  ('Nettoyer les murs extérieurs pour qu''ils soient blancs', 'Nettoyage', null),
  ('Nettoyage costumier (lavage vêtement au besoin)', 'Nettoyage', 'Costumier'),
  ('Patcher trous gypse', 'Peinture et finition', null),
  ('Peinturer tous les volets verts', 'Peinture et finition', null),
  ('Nettoyage sous la cuisine (2h ou 3h pour enlever le gros)', 'Nettoyage', 'Cuisine'),
  ('Retirer clous, agrafes et tapes qui tapissent les murs', 'Peinture et finition', null),
  ('Peinture plancher CB', 'Peinture et finition', null),
  ('Circuit électrique dédié pour génératrice', 'Électricité', null),
  ('Achat génératrice', 'Équipement et achats', null),
  ('Ménage forestier (Woodchipper, fendeuse, etc.)', 'Terrain et paysager', null),
  ('Nettoyage des sentier', 'Terrain et paysager', null),
  ('Construction de nouveaux bancs pour les aires de feux', 'Menuiserie et construction', 'Aires de feux et camping'),
  ('Commander Crash pads', 'Équipement et achats', null),
  ('Commande containers (container Sea)', 'Équipement et achats', null),
  ('Construction du mur de TREMBLOC', 'Menuiserie et construction', null),
  ('Besoins Soudure, Valider avec CFAB', 'Menuiserie et construction', null),
  ('Aménagement (Foyer, hamac, sack line, table à picnique etc.)', 'Terrain et paysager', null),
  ('Commander prises', 'Équipement et achats', null),
  ('Commande des matériaux (valider avec dom et magasiner)', 'Équipement et achats', null);

-- Chantiers : même id que le projet (lien facile à suivre).
insert into travaux.chantiers (id, nom, couleur, lieu_id, date_cible, termine_le, created_at)
select p.id, p.nom, p.couleur, l.id, p.date_cible, p.termine_le, p.created_at
from mastertimeline.projets p
left join lieu_chantier lc on lc.projet = p.nom
left join travaux.lieux l on l.nom = lc.lieu
where p.ponctuel and not p.archive;

-- Tâches : même id que dans Mastertimeline.
insert into travaux.taches
  (id, titre, description, statut, lieu_id, categorie_id, chantier_id, assigne_a, priorite,
   echeance, heures_prevues, fournisseur_id, position, fait_le, fait_par, created_at)
select
  t.id,
  t.titre,
  nullif(concat_ws(e'\n\n',
    nullif(btrim(t.note), ''),
    case when r.id is not null and moi.id is null then 'Responsable dans Mastertimeline : ' || r.nom end,
    case when t.debut is not null then 'Début prévu : ' || to_char(t.debut, 'YYYY-MM-DD') end
  ), ''),
  case when c.statut is not null then 'terminee' else 'a_faire' end,
  coalesce(lc2.id, lch.id),
  cat.id,
  ch.id,
  moi.id,
  case when t.priorite in (1, 2) then t.priorite else 3 end,
  t.echeance,
  t.heures_prevues,
  t.fournisseur_id,
  t.position,
  case when c.statut is not null then coalesce(c.fait_le::timestamptz, c.updated_at) end,
  case when c.statut is not null then c.fait_par end,
  t.created_at
from mastertimeline.taches t
join travaux.chantiers ch on ch.id = t.projet_id
left join mastertimeline.coches c on c.tache_id = t.id and c.periode = 'unique'
left join mastertimeline.responsables r on r.id = t.responsable_id
left join lateral (
  select p.id from core.profils p
  where p.actif and lower(btrim(p.nom)) = lower(btrim(r.nom))
  order by p.created_at limit 1
) moi on true
left join classement cl on cl.titre = t.titre
left join travaux.categories cat on cat.nom = cl.categorie
left join travaux.lieux lc2 on lc2.nom = cl.lieu
left join travaux.lieux lch on lch.id = ch.lieu_id
where t.mois is null and not t.archivee;

insert into travaux.commentaires (tache_id, auteur, texte, created_at)
select c.tache_id, c.fait_par, btrim(c.note), c.updated_at
from mastertimeline.coches c
join travaux.taches t on t.id = c.tache_id
where c.periode = 'unique' and nullif(btrim(c.note), '') is not null;

-- Mastertimeline ne garde que les tâches annuelles (les coches des
-- tâches retirées partent en cascade).
delete from mastertimeline.taches where mois is null;
delete from mastertimeline.projets where ponctuel;

alter table mastertimeline.projets drop column ponctuel;
alter table mastertimeline.projets drop column date_cible;
alter table mastertimeline.projets drop column termine_le;

alter table mastertimeline.taches drop constraint taches_check;
alter table mastertimeline.taches drop constraint taches_mois_check;
alter table mastertimeline.taches alter column mois set not null;
alter table mastertimeline.taches alter column exercice_depart set not null;
alter table mastertimeline.taches add constraint taches_mois_check
  check (cardinality(mois) >= 1 and mois <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]);
