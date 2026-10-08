-- ============================================================
-- Réunions (demande de Maxime du 2026-10-07 ; remplace la présentation
-- Google Slides « Réunion quotidienne de direction »). Direction au départ.
--
-- Quotidien de direction = un ordre du jour CONTINU : les points sans
-- réunion (`reunion_id` null) attendent jusqu'à ce qu'on les traite ; un
-- point non traité revient le lendemain (le nombre de reports est calculé
-- dans l'app, rien n'est recopié). La vue Semaine regroupe les points
-- traités par `traite_jour`.
--
-- Réunions spéciales (MT Lab, post-mortem, planification…) =
-- `reunions.reunions`, avec leur propre ordre du jour minuté (points dont
-- `reunion_id` = la réunion). Un point passe d'un ordre du jour à l'autre
-- en changeant `reunion_id`.
--
-- Points fixes (`recurrents`) : Topo RH, Topo terrain… Ils ne sont pas
-- recopiés d'avance ; l'app les montre le jour voulu (ou une fois par
-- semaine) et ne crée une ligne de `points` qu'au moment où on les traite.
--
-- Auteur de chaque point posé par la base (demande de Maxime : chaque
-- point est identifié à la personne qui l'a ajouté), jamais changé ensuite.
-- ============================================================

-- ------------------------------------------------------------
-- Module reunions dans les contraintes d'accès ; la direction écrit.
-- ------------------------------------------------------------
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions'));

insert into core.acces_roles (role, module, niveau) values ('direction','reunions','ecriture');

create schema if not exists reunions;

-- Nom affiché d'un compte (comme ailleurs : nom, sinon le début du courriel).
create function reunions.nom_de(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
  from core.profils p where p.id = p_user
$$;
revoke execute on function reunions.nom_de(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Réunions spéciales
-- ------------------------------------------------------------
create table reunions.reunions (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (btrim(titre) <> ''),
  genre text not null default 'autre' check (genre in ('mt_lab','post_mortem','planification','autre')),
  jour date,                 -- null = date à fixer
  heure time,
  lieu text,
  -- Compagnie visée (ex. post-mortem d'Opikawa) ; facultative.
  entreprise_id uuid references core.entreprises(id) on delete set null,
  objectif text,
  participants text,
  compte_rendu text,
  creee_par uuid references core.profils(id) on delete set null,
  creee_par_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table reunions.reunions is 'Réunions spéciales (MT Lab, post-mortem, planification) ; le quotidien n''a pas de ligne ici';

create index idx_reunions_reunions_jour on reunions.reunions(jour);

create trigger trg_reunions_reunions_updated_at before update on reunions.reunions
for each row execute function core.maj_updated_at();

-- ------------------------------------------------------------
-- Points fixes (récurrents) du quotidien
-- ------------------------------------------------------------
create table reunions.recurrents (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (btrim(texte) <> ''),
  type text not null default 'info' check (type in ('info','decision','discussion')),
  -- Jours ISO (1 = lundi … 7 = dimanche). Vide = une fois par semaine :
  -- le point reste affiché jusqu'à ce qu'on le traite dans la semaine.
  jours smallint[] not null default '{}' check (jours <@ '{1,2,3,4,5,6,7}'::smallint[]),
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table reunions.recurrents is 'Points fixes du quotidien (Topo RH…), montrés par l''app, recopiés dans points seulement une fois traités';

-- ------------------------------------------------------------
-- Points
-- ------------------------------------------------------------
create table reunions.points (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (btrim(texte) <> ''),
  details text,
  type text not null default 'discussion' check (type in ('info','decision','discussion')),
  urgent boolean not null default false,
  duree_min smallint check (duree_min between 1 and 480),
  -- null = ordre du jour continu du quotidien.
  reunion_id uuid references reunions.reunions(id) on delete cascade,
  -- Ordre dans une réunion spéciale (le quotidien trie lui-même).
  ordre double precision not null default 0,
  -- Quotidien : pas avant ce jour (ex. « jeudi, quand Marco est là »).
  pour_le date,
  recurrent_id uuid references reunions.recurrents(id) on delete set null,
  statut text not null default 'ouvert' check (statut in ('ouvert','traite','retire')),
  decision text,
  -- Posés par la base quand le point quitte « ouvert ».
  traite_le timestamptz,
  traite_jour date,
  traite_par uuid references core.profils(id) on delete set null,
  traite_par_nom text,
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((statut = 'ouvert') = (traite_le is null)),
  -- Un point fixe n'est traité qu'une fois par jour.
  unique (recurrent_id, traite_jour)
);

comment on table reunions.points is 'Points des ordres du jour : quotidien (reunion_id null) ou réunion spéciale';

create index idx_reunions_points_reunion on reunions.points(reunion_id);
create index idx_reunions_points_traite on reunions.points(traite_jour);

create trigger trg_reunions_points_updated_at before update on reunions.points
for each row execute function core.maj_updated_at();

-- Auteur (posé à l'ajout, jamais changé) ; date et auteur du traitement
-- (posés quand le point quitte « ouvert », effacés s'il est rouvert).
create function reunions.verifier_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Sans session (migration), l'auteur fourni est gardé.
    if auth.uid() is not null then
      new.auteur := auth.uid();
      new.auteur_nom := reunions.nom_de(auth.uid());
    end if;
    new.created_at := now();
  else
    new.auteur := old.auteur;
    new.auteur_nom := old.auteur_nom;
    new.created_at := old.created_at;
  end if;

  if new.statut = 'ouvert' then
    new.traite_le := null;
    new.traite_jour := null;
    new.traite_par := null;
    new.traite_par_nom := null;
  elsif tg_op = 'INSERT' or old.statut = 'ouvert' or new.traite_le is null then
    new.traite_le := now();
    new.traite_jour := (now() at time zone 'America/Toronto')::date;
    new.traite_par := auth.uid();
    new.traite_par_nom := reunions.nom_de(auth.uid());
  else
    new.traite_le := old.traite_le;
    new.traite_jour := old.traite_jour;
    new.traite_par := old.traite_par;
    new.traite_par_nom := old.traite_par_nom;
  end if;
  return new;
end;
$$;

create trigger trg_reunions_verifier_point before insert or update on reunions.points
for each row execute function reunions.verifier_point();

-- ------------------------------------------------------------
-- Suivis (actions décidées : qui fait quoi pour quand)
-- ------------------------------------------------------------
create table reunions.suivis (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (btrim(texte) <> ''),
  -- Point d'où vient le suivi (facultatif).
  point_id uuid references reunions.points(id) on delete cascade,
  responsable_id uuid references core.profils(id) on delete set null,
  -- Copie du nom (posée par la base) : lisible après le retrait d'un compte.
  responsable_nom text,
  echeance date,
  fait_le timestamptz,
  fait_par_nom text,
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table reunions.suivis is 'Actions décidées en réunion ; elles reviennent à l''ordre du jour tant qu''elles ne sont pas faites';

create index idx_reunions_suivis_point on reunions.suivis(point_id);

create trigger trg_reunions_suivis_updated_at before update on reunions.suivis
for each row execute function core.maj_updated_at();

create function reunions.verifier_suivi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.auteur := auth.uid();
      new.auteur_nom := reunions.nom_de(auth.uid());
    end if;
  else
    new.auteur := old.auteur;
    new.auteur_nom := old.auteur_nom;
    new.created_at := old.created_at;
  end if;

  if new.responsable_id is null then
    new.responsable_nom := null;
  elsif tg_op = 'INSERT' or new.responsable_id is distinct from old.responsable_id then
    new.responsable_nom := reunions.nom_de(new.responsable_id);
  else
    new.responsable_nom := old.responsable_nom;
  end if;

  if new.fait_le is null then
    new.fait_par_nom := null;
  elsif tg_op = 'INSERT' or old.fait_le is null then
    new.fait_le := now();
    new.fait_par_nom := reunions.nom_de(auth.uid());
  else
    new.fait_le := old.fait_le;
    new.fait_par_nom := old.fait_par_nom;
  end if;
  return new;
end;
$$;

create trigger trg_reunions_verifier_suivi before insert or update on reunions.suivis
for each row execute function reunions.verifier_suivi();

-- Créateur d'une réunion spéciale.
create function reunions.verifier_reunion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.creee_par := auth.uid();
      new.creee_par_nom := reunions.nom_de(auth.uid());
    end if;
  else
    new.creee_par := old.creee_par;
    new.creee_par_nom := old.creee_par_nom;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger trg_reunions_verifier_reunion before insert or update on reunions.reunions
for each row execute function reunions.verifier_reunion();

-- ------------------------------------------------------------
-- Supprimer une réunion spéciale : ses points encore ouverts retournent
-- au quotidien, le reste part avec elle. Une transaction, droits de la
-- personne (RLS).
-- ------------------------------------------------------------
create function reunions.supprimer_reunion(p_reunion uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update reunions.points set reunion_id = null
   where reunion_id = p_reunion and statut = 'ouvert';
  delete from reunions.reunions where id = p_reunion;
end;
$$;

-- Personnes à qui confier un suivi : comptes actifs qui ont accès au module.
create function reunions.personnes()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, reunions.nom_de(p.id)
  from core.profils p
  where core.peut_lire('reunions')
    and p.actif
    and core.niveau_module_de(p.id, 'reunions') is not null
  order by 2
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema reunions to authenticated, service_role;
grant select, insert, update, delete on all tables in schema reunions to authenticated, service_role;
grant execute on function reunions.supprimer_reunion(uuid), reunions.personnes() to authenticated;

alter table reunions.reunions enable row level security;
alter table reunions.recurrents enable row level security;
alter table reunions.points enable row level security;
alter table reunions.suivis enable row level security;

create policy "Lire" on reunions.reunions for select to authenticated using (core.peut_lire('reunions'));
create policy "Écrire" on reunions.reunions for all to authenticated
  using (core.peut_ecrire('reunions')) with check (core.peut_ecrire('reunions'));

create policy "Lire" on reunions.recurrents for select to authenticated using (core.peut_lire('reunions'));
create policy "Écrire" on reunions.recurrents for all to authenticated
  using (core.peut_ecrire('reunions')) with check (core.peut_ecrire('reunions'));

create policy "Lire" on reunions.points for select to authenticated using (core.peut_lire('reunions'));
create policy "Écrire" on reunions.points for all to authenticated
  using (core.peut_ecrire('reunions')) with check (core.peut_ecrire('reunions'));

create policy "Lire" on reunions.suivis for select to authenticated using (core.peut_lire('reunions'));
create policy "Écrire" on reunions.suivis for all to authenticated
  using (core.peut_ecrire('reunions')) with check (core.peut_ecrire('reunions'));

alter publication supabase_realtime add table reunions.reunions, reunions.recurrents, reunions.points, reunions.suivis;

-- ------------------------------------------------------------
-- Points fixes de départ : ceux qui revenaient chaque semaine dans la
-- présentation. Une fois par semaine ; les jours se règlent dans Réglages.
-- ------------------------------------------------------------
insert into reunions.recurrents (texte, type, ordre) values
  ('Topo RH', 'info', 1),
  ('Estimés en attente', 'info', 2),
  ('Contrats non signés', 'info', 3),
  ('Paiements en retard', 'info', 4),
  ('Topo terrain', 'info', 5),
  ('Validation horaire', 'decision', 6);
