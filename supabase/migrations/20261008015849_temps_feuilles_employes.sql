-- ============================================================
-- temps : certains employés remplissent leur propre feuille, et les
-- feuilles passent par une soumission et une approbation (demande de
-- Maxime du 2026-10-07).
--
-- Employés (référentiel core.employes) :
--   - feuille_propre : l'employé remplit lui-même sa feuille. Il se
--     connecte avec le courriel de sa fiche (obligatoire, un seul employé
--     par courriel) ; c'est sa seule porte d'entrée dans le module, quel
--     que soit son rôle (temps.mon_employe). Accès donné à une personne,
--     jamais à un rôle : temps.role_autorise ne change pas.
--   - woofing : ajoute les heures de woofing (non payées) à sa feuille.
-- Sa feuille = ses lignes de temps.heures_employes, une feuille par
-- compagnie. Pas de copie : l'onglet Employés lit les mêmes lignes, mais
-- seulement les heures régulières (le woofing n'est pas payé).
--
-- Soumission et approbation (retirées le 2026-10-05, remises à la demande
-- de Maxime avec un gel) :
--   employé       → soumet à la direction (toute la direction approuve) ;
--   direction     → soumet aux admins ;
--   admin         → pas d'approbation (sa feuille reste ouverte).
--   ouverte  : l'auteur saisit ; la direction (employé) ou un admin
--              (direction) peut aussi corriger ;
--   soumise  : gelée pour l'auteur, qui peut seulement ajouter des notes ;
--              l'approbateur corrige puis approuve, ou renvoie avec un
--              message (retour à « ouverte ») ;
--   approuvee: gelée pour tous ; un admin peut annuler l'approbation
--              (retour à « soumise »).
-- Les employés qui ne remplissent pas leur feuille ne changent pas : la
-- direction saisit leurs heures, sans état.
-- Journal (temps.journal) : soumissions, approbations, renvois,
-- réouvertures et notes ajoutées, datés et signés.
-- ============================================================

-- ------------------------------------------------------------
-- Référentiel : options par employé
-- ------------------------------------------------------------
alter table core.employes
  add column feuille_propre boolean not null default false,
  add column woofing boolean not null default false;

comment on column core.employes.feuille_propre is 'Remplit lui-même sa feuille de temps (connexion avec le courriel de la fiche)';
comment on column core.employes.woofing is 'Heures de woofing (non payées) sur sa feuille de temps';

-- Courriel obligatoire et propre à un seul employé quand il remplit sa feuille :
-- c'est par lui que l'app reconnaît l'employé connecté.
create function core.verifier_feuille_propre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.courriel := nullif(btrim(new.courriel), '');
  if new.feuille_propre then
    if new.courriel is null then
      raise exception 'Un courriel est requis pour qu''un employé remplisse sa feuille : il se connecte avec.'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from core.employes e
                where e.feuille_propre and e.id <> new.id and lower(e.courriel) = lower(new.courriel)) then
      raise exception 'Un autre employé qui remplit sa feuille a déjà le courriel %.', new.courriel
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_feuille_propre before insert or update on core.employes
for each row execute function core.verifier_feuille_propre();

create unique index employes_courriel_feuille on core.employes (lower(courriel)) where feuille_propre;

-- L'employé connecté, s'il remplit sa feuille (null sinon). Un membre de la
-- direction n'y passe jamais : il a sa propre feuille (temps.heures).
create function temps.mon_employe()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
    from core.profils p
    join core.employes e on e.feuille_propre and e.actif and lower(e.courriel) = lower(p.courriel)
   where p.id = auth.uid() and p.actif and not temps.role_autorise(p.role)
   limit 1
$$;

-- ------------------------------------------------------------
-- Heures des employés : régulières ou woofing
-- ------------------------------------------------------------
alter table temps.heures_employes
  add column type text not null default 'regulieres' check (type in ('regulieres', 'woofing'));

comment on column temps.heures_employes.type is
  'regulieres : payées, reprises dans l''onglet Employés ; woofing : non payées, seulement sur la feuille de l''employé';

alter table temps.heures_employes
  drop constraint heures_employes_employe_id_entreprise_id_jour_key,
  add constraint heures_employes_ligne_jour_type unique (employe_id, entreprise_id, jour, type);

-- Au plus 24 heures par jour, toutes compagnies et woofing compris ; du
-- woofing seulement pour un employé qui a l'option.
create or replace function temps.verifier_heures_employe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'woofing'
     and not exists (select 1 from core.employes e where e.id = new.employe_id and e.woofing) then
    raise exception 'Le woofing n''est pas activé pour cet employé (Référentiel › Employés).'
      using errcode = 'check_violation';
  end if;
  if (select coalesce(sum(h.heures), 0) from temps.heures_employes h
       where h.employe_id = new.employe_id and h.jour = new.jour
         and (h.entreprise_id, h.type) is distinct from (new.entreprise_id, new.type))
     + new.heures > 24 then
    raise exception 'Plus de 24 heures le % (toutes compagnies).', to_char(new.jour, 'YYYY-MM-DD')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- États des feuilles
-- ------------------------------------------------------------
alter table temps.feuilles
  add column statut text not null default 'ouverte' check (statut in ('ouverte', 'soumise', 'approuvee'));

comment on table temps.feuilles is
  'Feuille d''une personne de la direction pour une période : note et état (sans ligne = ouverte)';

-- Feuille d'un employé qui remplit la sienne : une par compagnie et par période.
create table temps.feuilles_employes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references core.employes(id) on delete restrict,
  entreprise_id uuid not null references core.entreprises(id) on delete restrict,
  debut date not null check (debut >= temps.premiere_periode() and debut = temps.debut_periode(debut)),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'soumise', 'approuvee')),
  -- Note de l'employé pour la période (la note de paie de la direction reste dans notes_employes).
  note text check (note is null or (note = btrim(note) and note <> '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (employe_id, entreprise_id, debut)
);

comment on table temps.feuilles_employes is
  'Feuille d''un employé qui remplit la sienne, par compagnie et par période : note et état (sans ligne = ouverte)';

create trigger trg_signer before insert or update on temps.feuilles_employes
for each row execute function temps.signer();

-- Historique d'une feuille : qui a soumis, approuvé, renvoyé, rouvert ou
-- ajouté une note, et quand. Nom de l'auteur gardé tel quel (un employé ne
-- lit pas les profils).
create table temps.journal (
  id uuid primary key default gen_random_uuid(),
  feuille_id uuid references temps.feuilles(id) on delete restrict,
  feuille_employe_id uuid references temps.feuilles_employes(id) on delete restrict,
  genre text not null check (genre in ('soumission', 'approbation', 'renvoi', 'reouverture', 'note')),
  texte text check (texte is null or (texte = btrim(texte) and texte <> '')),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(feuille_id, feuille_employe_id) = 1),
  check (genre not in ('note', 'renvoi') or texte is not null)
);

create index journal_feuille on temps.journal (feuille_id) where feuille_id is not null;
create index journal_feuille_employe on temps.journal (feuille_employe_id) where feuille_employe_id is not null;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------

-- État d'une feuille de la direction ; null si on ne peut pas la voir.
create function temps.statut_feuille(p_user uuid, p_debut date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when temps.peut_voir(p_user) then
    coalesce((select f.statut from temps.feuilles f where f.user_id = p_user and f.debut = p_debut), 'ouverte')
  end
$$;

-- État de la feuille d'un employé (par compagnie) ; null si on ne peut pas la voir.
create function temps.statut_feuille_employe(p_employe uuid, p_entreprise uuid, p_debut date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when temps.a_acces() or p_employe = temps.mon_employe() then
    coalesce((select f.statut from temps.feuilles_employes f
               where f.employe_id = p_employe and f.entreprise_id = p_entreprise and f.debut = p_debut), 'ouverte')
  end
$$;

-- Modifier les heures ou la note d'une personne de la direction :
--   ouverte : elle-même ou un admin ; soumise : un admin (pas la sienne) ;
--   approuvée : personne.
create or replace function temps.peut_modifier(p_user uuid, p_jour date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select temps.a_acces() and coalesce(
    case temps.statut_feuille(p_user, temps.debut_periode(p_jour))
      when 'ouverte' then p_user = auth.uid() or core.est_admin()
      when 'soumise' then core.est_admin() and p_user <> auth.uid()
    end, false)
$$;

-- Modifier les heures d'un employé pour une compagnie et un jour :
--   ouverte : la direction, ou l'employé lui-même pour une de ses compagnies ;
--   soumise : la direction ; approuvée : personne.
-- Un employé qui ne remplit pas sa feuille n'a jamais d'état : sa feuille
-- reste « ouverte », la direction saisit comme avant.
create function temps.peut_modifier_employe(p_employe uuid, p_entreprise uuid, p_jour date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case temps.statut_feuille_employe(p_employe, p_entreprise, temps.debut_periode(p_jour))
      when 'ouverte' then temps.a_acces() or (
        p_employe = temps.mon_employe()
        and exists (select 1 from core.employes e where e.id = p_employe and p_entreprise = any (e.entreprise_ids)))
      when 'soumise' then temps.a_acces()
    end, false)
$$;

-- Nom de la personne connectée, pour le journal.
create function temps.nom_actuel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(p.nom), '') from core.profils p where p.id = auth.uid()),
    (select coalesce(nullif(concat_ws(' ', e.prenom, e.nom_famille), ''), e.surnom)
       from core.employes e where e.id = temps.mon_employe()),
    (select p.courriel from core.profils p where p.id = auth.uid()),
    'Inconnu')
$$;

-- Ligne de la feuille (créée au besoin), verrouillée jusqu'à la fin de l'opération.
create function temps.ligne_feuille(p_user uuid, p_debut date)
returns temps.feuilles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v temps.feuilles;
begin
  insert into temps.feuilles (user_id, debut, updated_by) values (p_user, p_debut, auth.uid())
  on conflict (user_id, debut) do nothing;
  select * into v from temps.feuilles f where f.user_id = p_user and f.debut = p_debut for update;
  return v;
end;
$$;

create function temps.ligne_feuille_employe(p_employe uuid, p_entreprise uuid, p_debut date)
returns temps.feuilles_employes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v temps.feuilles_employes;
begin
  insert into temps.feuilles_employes (employe_id, entreprise_id, debut) values (p_employe, p_entreprise, p_debut)
  on conflict (employe_id, entreprise_id, debut) do nothing;
  select * into v from temps.feuilles_employes f
   where f.employe_id = p_employe and f.entreprise_id = p_entreprise and f.debut = p_debut
     for update;
  return v;
end;
$$;

-- ------------------------------------------------------------
-- Actions sur une feuille : soumettre, approuver, renvoyer (message
-- obligatoire), rouvrir (annuler l'approbation), noter (note ajoutée).
-- ------------------------------------------------------------
create function temps.genre_action(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_action
    when 'soumettre' then 'soumission'
    when 'approuver' then 'approbation'
    when 'renvoyer' then 'renvoi'
    when 'rouvrir' then 'reouverture'
    when 'noter' then 'note'
  end
$$;

-- Feuille d'une personne de la direction.
create function temps.changer_feuille(p_user uuid, p_debut date, p_action text, p_texte text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v temps.feuilles;
  v_moi uuid := auth.uid();
  v_approbateur boolean := core.est_admin() and p_user <> auth.uid();
  v_texte text := nullif(btrim(p_texte), '');
  v_statut text;
begin
  if temps.genre_action(p_action) is null then
    raise exception 'Action inconnue : %.', p_action;
  end if;
  if not temps.peut_voir(p_user) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from core.profils p where p.id = p_user and temps.role_autorise(p.role)) then
    raise exception 'Cette personne ne fait pas partie de la direction.';
  end if;
  if p_action in ('renvoyer', 'noter') and v_texte is null then
    raise exception 'Écrivez un message.' using errcode = 'check_violation';
  end if;

  v := temps.ligne_feuille(p_user, p_debut);
  v_statut := v.statut;
  case p_action
    when 'soumettre' then
      if p_user <> v_moi then
        raise exception 'Seule la personne elle-même soumet sa feuille.' using errcode = 'insufficient_privilege';
      end if;
      if core.role_actuel() <> 'direction' then
        raise exception 'La feuille d''un administrateur ne passe pas par l''approbation.';
      end if;
      if v.statut <> 'ouverte' then
        raise exception 'Cette feuille est déjà soumise.';
      end if;
      v_statut := 'soumise';
    when 'approuver', 'renvoyer' then
      if not v_approbateur then
        raise exception 'Seul un administrateur approuve ou renvoie la feuille d''une personne de la direction.'
          using errcode = 'insufficient_privilege';
      end if;
      if v.statut <> 'soumise' then
        raise exception 'Cette feuille n''est pas soumise.';
      end if;
      v_statut := case p_action when 'approuver' then 'approuvee' else 'ouverte' end;
    when 'rouvrir' then
      if not v_approbateur then
        raise exception 'Seul un administrateur annule une approbation.' using errcode = 'insufficient_privilege';
      end if;
      if v.statut <> 'approuvee' then
        raise exception 'Cette feuille n''est pas approuvée.';
      end if;
      v_statut := 'soumise';
    else
      null; -- noter : l'état ne change pas
  end case;

  if v_statut <> v.statut then
    update temps.feuilles set statut = v_statut, updated_at = now(), updated_by = v_moi where id = v.id;
  end if;
  insert into temps.journal (feuille_id, genre, texte, auteur, auteur_nom)
  values (v.id, temps.genre_action(p_action), v_texte, v_moi, temps.nom_actuel());
end;
$$;

-- Feuille d'un employé pour une compagnie.
create function temps.changer_feuille_employe(
  p_employe uuid, p_entreprise uuid, p_debut date, p_action text, p_texte text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v temps.feuilles_employes;
  v_direction boolean := temps.a_acces();
  v_soi boolean := coalesce(p_employe = temps.mon_employe(), false);
  v_texte text := nullif(btrim(p_texte), '');
  v_statut text;
begin
  if temps.genre_action(p_action) is null then
    raise exception 'Action inconnue : %.', p_action;
  end if;
  if not (v_direction or v_soi) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_action in ('renvoyer', 'noter') and v_texte is null then
    raise exception 'Écrivez un message.' using errcode = 'check_violation';
  end if;

  v := temps.ligne_feuille_employe(p_employe, p_entreprise, p_debut);
  v_statut := v.statut;
  case p_action
    when 'soumettre' then
      if not v_soi then
        raise exception 'Seul l''employé soumet sa feuille.' using errcode = 'insufficient_privilege';
      end if;
      if not exists (select 1 from core.employes e where e.id = p_employe and p_entreprise = any (e.entreprise_ids)) then
        raise exception 'Cette compagnie n''est pas la vôtre.';
      end if;
      if v.statut <> 'ouverte' then
        raise exception 'Cette feuille est déjà soumise.';
      end if;
      v_statut := 'soumise';
    when 'approuver', 'renvoyer' then
      if not v_direction then
        raise exception 'Seule la direction approuve ou renvoie la feuille d''un employé.'
          using errcode = 'insufficient_privilege';
      end if;
      if v.statut <> 'soumise' then
        raise exception 'Cette feuille n''est pas soumise.';
      end if;
      v_statut := case p_action when 'approuver' then 'approuvee' else 'ouverte' end;
    when 'rouvrir' then
      if not core.est_admin() then
        raise exception 'Seul un administrateur annule une approbation.' using errcode = 'insufficient_privilege';
      end if;
      if v.statut <> 'approuvee' then
        raise exception 'Cette feuille n''est pas approuvée.';
      end if;
      v_statut := 'soumise';
    else
      null;
  end case;

  if v_statut <> v.statut then
    update temps.feuilles_employes set statut = v_statut where id = v.id;
  end if;
  insert into temps.journal (feuille_employe_id, genre, texte, auteur, auteur_nom)
  values (v.id, temps.genre_action(p_action), v_texte, auth.uid(), temps.nom_actuel());
end;
$$;

-- Note de la période sur la feuille d'un employé : mêmes règles que ses heures.
create function temps.enregistrer_note_employe(p_employe uuid, p_entreprise uuid, p_debut date, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v temps.feuilles_employes;
begin
  if not temps.peut_modifier_employe(p_employe, p_entreprise, p_debut) then
    raise exception 'Cette feuille ne peut plus être modifiée.' using errcode = 'insufficient_privilege';
  end if;
  v := temps.ligne_feuille_employe(p_employe, p_entreprise, p_debut);
  update temps.feuilles_employes set note = nullif(btrim(p_note), '') where id = v.id;
end;
$$;

-- ------------------------------------------------------------
-- Politiques
-- ------------------------------------------------------------
drop policy "Lire" on temps.heures_employes;
drop policy "Ajouter" on temps.heures_employes;
drop policy "Modifier" on temps.heures_employes;
drop policy "Supprimer" on temps.heures_employes;

create policy "Lire" on temps.heures_employes for select to authenticated
  using (temps.a_acces() or employe_id = temps.mon_employe());
create policy "Ajouter" on temps.heures_employes for insert to authenticated
  with check (temps.peut_modifier_employe(employe_id, entreprise_id, jour));
create policy "Modifier" on temps.heures_employes for update to authenticated
  using (temps.peut_modifier_employe(employe_id, entreprise_id, jour))
  with check (temps.peut_modifier_employe(employe_id, entreprise_id, jour));
create policy "Supprimer" on temps.heures_employes for delete to authenticated
  using (temps.peut_modifier_employe(employe_id, entreprise_id, jour));

alter table temps.feuilles_employes enable row level security;
alter table temps.journal enable row level security;

-- Pas de politique d'écriture : seulement par les fonctions plus haut.
create policy "Lire" on temps.feuilles_employes for select to authenticated
  using (temps.a_acces() or employe_id = temps.mon_employe());

create policy "Lire" on temps.journal for select to authenticated
  using (
    (feuille_id is not null and exists (
      select 1 from temps.feuilles f where f.id = feuille_id and temps.peut_voir(f.user_id)))
    or (feuille_employe_id is not null and exists (
      select 1 from temps.feuilles_employes f
       where f.id = feuille_employe_id and (temps.a_acces() or f.employe_id = temps.mon_employe())))
  );

grant select on temps.feuilles_employes, temps.journal to authenticated;
grant all on temps.feuilles_employes, temps.journal to service_role;

revoke execute on function
  core.verifier_feuille_propre(),
  temps.mon_employe(),
  temps.statut_feuille(uuid, date),
  temps.statut_feuille_employe(uuid, uuid, date),
  temps.peut_modifier_employe(uuid, uuid, date),
  temps.nom_actuel(),
  temps.ligne_feuille(uuid, date),
  temps.ligne_feuille_employe(uuid, uuid, date),
  temps.genre_action(text),
  temps.changer_feuille(uuid, date, text, text),
  temps.changer_feuille_employe(uuid, uuid, date, text, text),
  temps.enregistrer_note_employe(uuid, uuid, date, text)
from public, anon;

grant execute on function
  temps.mon_employe(),
  temps.statut_feuille(uuid, date),
  temps.statut_feuille_employe(uuid, uuid, date),
  temps.peut_modifier_employe(uuid, uuid, date),
  temps.genre_action(text),
  temps.changer_feuille(uuid, date, text, text),
  temps.changer_feuille_employe(uuid, uuid, date, text, text),
  temps.enregistrer_note_employe(uuid, uuid, date, text)
to authenticated, service_role;

-- Internes : appelées seulement par les fonctions ci-dessus.
revoke execute on function
  temps.nom_actuel(),
  temps.ligne_feuille(uuid, date),
  temps.ligne_feuille_employe(uuid, uuid, date)
from authenticated;
