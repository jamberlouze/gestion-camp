-- ============================================================
-- temps : feuilles de temps de l'équipe de direction.
--
-- Saisie par période de paie de 14 jours, du dimanche au samedi ; la
-- première commence le dimanche 4 octobre 2026 (rien avant). Les périodes
-- ne sont pas des lignes : elles se calculent (temps.debut_periode).
-- Trois types d'heures : régulières, vacances, maladie.
--
-- Qui voit quoi (décision de la direction, 2026-10-05) :
--   direction : sa propre feuille seulement, jamais celle des autres ;
--   admin     : toutes les feuilles + le tableau de bord (et la sienne) ;
--   coordo et tout rôle ajouté plus tard : jamais.
-- Un seul endroit décide qui entre dans le module : temps.role_autorise,
-- une liste blanche propre au module (pas core.est_direction ni
-- core.peut_lire, qui pourraient s'ouvrir un jour à d'autres rôles). Le
-- module n'est pas dans core.acces_modules : il ne peut pas être offert à
-- un coordonnateur.
--
-- Pas de temps réel : les suppressions seraient diffusées à tous les
-- abonnés sans filtre RLS. Les tables ne sont pas dans supabase_realtime.
-- ============================================================

create schema if not exists temps;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
create function temps.role_autorise(p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_role in ('admin', 'direction'), false)
$$;

-- La personne connectée (profil actif) entre-t-elle dans le module ?
create function temps.a_acces()
returns boolean
language sql
stable
set search_path = ''
as $$
  select temps.role_autorise(core.role_actuel())
$$;

-- Voir la feuille de p_user : la sienne, ou n'importe laquelle pour un admin.
create function temps.peut_voir(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select temps.a_acces() and (p_user = auth.uid() or core.est_admin())
$$;

-- ------------------------------------------------------------
-- Périodes de paie
-- ------------------------------------------------------------
create function temps.premiere_periode()
returns date
language sql
immutable
set search_path = ''
as $$
  select date '2026-10-04'
$$;

-- Premier jour (dimanche) de la période qui contient p_jour.
create function temps.debut_periode(p_jour date)
returns date
language sql
immutable
set search_path = ''
as $$
  select temps.premiere_periode() + ((p_jour - temps.premiere_periode()) / 14) * 14
$$;

-- ------------------------------------------------------------
-- Feuilles : une ligne par personne et par période, créée à la première
-- soumission ou note. Sans ligne = brouillon.
--   brouillon : la personne saisit ;
--   soumise   : remise à l'administration, verrouillée pour la personne
--               (elle peut la reprendre tant qu'elle n'est pas approuvée) ;
--   approuvee : vérifiée par un admin, verrouillée.
-- Écritures seulement par les fonctions plus bas (pas de politique
-- d'écriture) : la personne ne peut pas s'approuver elle-même.
-- ------------------------------------------------------------
create table temps.feuilles (
  id uuid primary key default gen_random_uuid(),
  -- restrict : ce sont des registres de paie, on désactive un compte au
  -- lieu de le supprimer.
  user_id uuid not null references core.profils(id) on delete restrict,
  debut date not null check (debut >= temps.premiere_periode() and debut = temps.debut_periode(debut)),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'soumise', 'approuvee')),
  note text,
  soumise_le timestamptz,
  approuvee_le timestamptz,
  approuvee_par uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (user_id, debut)
);

-- ------------------------------------------------------------
-- Heures : une ligne par personne, jour et type (jamais 0 : on supprime).
-- ------------------------------------------------------------
create table temps.heures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.profils(id) on delete restrict,
  jour date not null check (jour >= temps.premiere_periode()),
  type text not null check (type in ('regulieres', 'vacances', 'maladie')),
  -- Au quart d'heure près.
  heures numeric(4,2) not null check (heures > 0 and heures <= 24 and heures * 4 = trunc(heures * 4)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (user_id, jour, type)
);

create index heures_jour on temps.heures (jour);

-- La feuille de la période de p_jour est-elle encore en brouillon ?
-- security definer : lit feuilles sans dépendre de ses politiques. Faux
-- pour la feuille de quelqu'un d'autre (sauf admin) : appelée directement,
-- elle ne révèle rien.
create function temps.feuille_ouverte(p_user uuid, p_jour date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select temps.peut_voir(p_user) and not exists (
    select 1 from temps.feuilles f
     where f.user_id = p_user
       and f.debut = temps.debut_periode(p_jour)
       and f.statut <> 'brouillon'
  )
$$;

-- Modifier les heures de p_user pour p_jour : un admin toujours ; la
-- personne elle-même tant que sa feuille est en brouillon.
create function temps.peut_modifier(p_user uuid, p_jour date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select temps.a_acces()
     and (core.est_admin() or (p_user = auth.uid() and temps.feuille_ouverte(p_user, p_jour)))
$$;

-- Auteur et heure de chaque modification, posés par la base ; au plus
-- 24 heures par jour, tous types confondus.
create function temps.avant_heures()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  select coalesce(sum(h.heures), 0) + new.heures into v_total
    from temps.heures h
   where h.user_id = new.user_id and h.jour = new.jour and h.type <> new.type;
  if v_total > 24 then
    raise exception 'Plus de 24 heures le %.', to_char(new.jour, 'YYYY-MM-DD')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_avant_heures before insert or update on temps.heures
for each row execute function temps.avant_heures();

-- ------------------------------------------------------------
-- Changer l'état d'une feuille.
--   personne : brouillon ↔ soumise, sa propre feuille, jamais si approuvée ;
--   admin    : n'importe quel état, n'importe quelle feuille.
-- ------------------------------------------------------------
create function temps.changer_statut(p_user uuid, p_debut date, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := core.est_admin();
  v_actuel text;
begin
  if not temps.a_acces() then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_user <> auth.uid() and not v_admin then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_statut not in ('brouillon', 'soumise', 'approuvee') then
    raise exception 'État inconnu : %.', p_statut;
  end if;
  if not exists (select 1 from core.profils p where p.id = p_user and temps.role_autorise(p.role)) then
    raise exception 'Cette personne ne fait pas partie de la direction.';
  end if;

  select f.statut into v_actuel from temps.feuilles f where f.user_id = p_user and f.debut = p_debut for update;
  v_actuel := coalesce(v_actuel, 'brouillon');

  if not v_admin and (p_statut = 'approuvee' or v_actuel = 'approuvee') then
    raise exception 'Seul un administrateur approuve une feuille ou modifie une feuille approuvée.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into temps.feuilles as f (user_id, debut, statut, soumise_le, approuvee_le, approuvee_par, updated_by)
  values (
    p_user, p_debut, p_statut,
    case when p_statut <> 'brouillon' then now() end,
    case when p_statut = 'approuvee' then now() end,
    case when p_statut = 'approuvee' then auth.uid() end,
    auth.uid()
  )
  on conflict (user_id, debut) do update set
    statut = excluded.statut,
    soumise_le = case
      when excluded.statut = 'brouillon' then null
      when f.statut = 'brouillon' then now()
      else f.soumise_le end,
    approuvee_le = excluded.approuvee_le,
    approuvee_par = excluded.approuvee_par,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

-- Note de la période (ex. « congé férié le 12 »). Même règle que les
-- heures : la personne tant que la feuille est en brouillon, un admin
-- toujours.
create function temps.enregistrer_note(p_user uuid, p_debut date, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not temps.peut_modifier(p_user, p_debut) then
    raise exception 'Cette feuille ne peut plus être modifiée.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from core.profils p where p.id = p_user and temps.role_autorise(p.role)) then
    raise exception 'Cette personne ne fait pas partie de la direction.';
  end if;
  insert into temps.feuilles (user_id, debut, note, updated_by)
  values (p_user, p_debut, nullif(btrim(p_note), ''), auth.uid())
  on conflict (user_id, debut) do update set
    note = excluded.note,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

-- ------------------------------------------------------------
-- Droits d'accès
-- ------------------------------------------------------------
grant usage on schema temps to authenticated, service_role;
grant select on temps.feuilles to authenticated;
grant select, insert, update, delete on temps.heures to authenticated;
grant all on all tables in schema temps to service_role;
revoke execute on all functions in schema temps from public, anon;
grant execute on all functions in schema temps to authenticated, service_role;

alter table temps.feuilles enable row level security;
alter table temps.heures enable row level security;

create policy "Lire" on temps.feuilles for select to authenticated
  using (temps.peut_voir(user_id));

create policy "Lire" on temps.heures for select to authenticated
  using (temps.peut_voir(user_id));
create policy "Ajouter" on temps.heures for insert to authenticated
  with check (temps.peut_modifier(user_id, jour));
create policy "Modifier" on temps.heures for update to authenticated
  using (temps.peut_modifier(user_id, jour))
  with check (temps.peut_modifier(user_id, jour));
create policy "Supprimer" on temps.heures for delete to authenticated
  using (temps.peut_modifier(user_id, jour));
