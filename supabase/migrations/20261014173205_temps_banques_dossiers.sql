-- ============================================================
-- temps : banques (maladie, heures accumulées), onglet À approuver avec
-- totaux, dossiers à fermer (relevé d'emploi). Demande de Maxime du
-- 2026-10-14 (réunion avec Charlotte).
--
-- La règle de confidentialité ne change pas : une personne de la direction
-- ne voit que ses propres banques ; un admin voit et règle celles de toute
-- la direction (et des admins) ; la direction voit et règle celles des
-- employés qui remplissent leur feuille ; l'employé voit les siennes.
-- Coordonnateurs et tout autre rôle : rien (temps.role_autorise).
--
-- Banques : les soldes ne sont PAS stockés, ils se calculent dans l'app
-- (src/modules/temps/banques.ts) d'après les heures, les jours de maladie
-- accordés et les ajustements. Vacances : pas dans l'app (Employeur D).
--   maladie : N jours par année civile (défaut 2, minimum de la loi),
--             accordés le 1er janvier, 1 jour = 8 h ; les heures de maladie
--             de la feuille se déduisent ;
--   heures  : heures régulières au-delà de 40 h par semaine (dimanche au
--             samedi), à 1× ; les heures « prises en banque » se déduisent.
-- Solde continu : jamais remis à zéro tout seul ; ajustements manuels avec
-- une note (paiement des heures, départ, solde de départ), jamais effacés.
-- ============================================================

-- ------------------------------------------------------------
-- Types d'heures : « banque » = heures prises dans la banque d'heures
-- accumulées ; maladie et banque aussi sur la feuille d'un employé qui
-- remplit la sienne (pas de vacances : elles restent dans Employeur D).
-- ------------------------------------------------------------
alter table temps.heures drop constraint heures_type_check;
alter table temps.heures add constraint heures_type_check
  check (type in ('regulieres', 'vacances', 'maladie', 'banque'));

alter table temps.heures_employes drop constraint heures_employes_type_check;
alter table temps.heures_employes add constraint heures_employes_type_check
  check (type in ('regulieres', 'woofing', 'maladie', 'banque'));

comment on column temps.heures_employes.type is
  'regulieres : payées, reprises dans l''onglet Employés ; woofing : non payées ; maladie et banque (heures prises dans la banque) : payées, sur la feuille de l''employé qui remplit la sienne';

-- ------------------------------------------------------------
-- Droits sur les banques d'une personne : un compte de la direction ou un
-- admin (p_user) OU un employé du référentiel (p_employe), jamais les deux.
-- ------------------------------------------------------------

-- Voir : comme sa feuille (soi ou admin ; employé : la direction ou lui-même).
create function temps.peut_voir_banque(p_user uuid, p_employe uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(case
    when p_user is not null and p_employe is null then temps.peut_voir(p_user)
    when p_employe is not null and p_user is null then temps.a_acces() or p_employe = temps.mon_employe()
  end, false)
$$;

-- Régler (ajustements, jours de maladie) : les admins pour un compte de la
-- direction ou d'un admin ; la direction (et les admins) pour un employé.
create function temps.peut_regler_banque(p_user uuid, p_employe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select temps.a_acces() and coalesce(case
    when p_user is not null and p_employe is null then core.est_admin()
      and exists (select 1 from core.profils p where p.id = p_user and temps.role_autorise(p.role))
    when p_employe is not null and p_user is null then exists (select 1 from core.employes e where e.id = p_employe)
  end, false)
$$;

-- ------------------------------------------------------------
-- Ajustements manuels d'une banque (heures, + ou −), avec une note.
-- Jamais modifiés ni effacés : une erreur se corrige par un ajustement
-- inverse (registre de paie).
-- ------------------------------------------------------------
create table temps.ajustements_banques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.profils(id) on delete restrict,
  employe_id uuid references core.employes(id) on delete restrict,
  banque text not null check (banque in ('maladie', 'heures')),
  -- Date du mouvement (ex. solde de départ au 3 octobre 2026).
  jour date not null check (jour >= date '2026-01-01'),
  heures numeric(6,2) not null check (heures <> 0 and abs(heures) <= 2000 and heures * 4 = trunc(heures * 4)),
  note text not null check (note = btrim(note) and note <> ''),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(user_id, employe_id) = 1)
);

comment on table temps.ajustements_banques is
  'Ajustements manuels des banques (maladie, heures accumulées) : solde de départ, heures payées, départ… ; jamais modifiés ni effacés';

create index ajustements_banques_user on temps.ajustements_banques (user_id) where user_id is not null;
create index ajustements_banques_employe on temps.ajustements_banques (employe_id) where employe_id is not null;

-- ------------------------------------------------------------
-- Jours de maladie par année : une ligne = « à partir de cette année, N
-- jours par année ». Sans ligne : 2 jours (défaut de l'app, minimum de la
-- loi). Changer le nombre ne touche pas les années d'avant.
-- ------------------------------------------------------------
create table temps.jours_maladie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.profils(id) on delete restrict,
  employe_id uuid references core.employes(id) on delete restrict,
  annee int not null check (annee between 2026 and 2100),
  jours numeric(5,2) not null check (jours >= 0 and jours <= 366 and jours * 4 = trunc(jours * 4)),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  updated_at timestamptz not null default now(),
  check (num_nonnulls(user_id, employe_id) = 1)
);

comment on table temps.jours_maladie is
  'Jours de maladie accordés chaque 1er janvier, à partir de l''année indiquée (sans ligne : 2 jours)';

create unique index jours_maladie_user on temps.jours_maladie (user_id, annee) where user_id is not null;
create unique index jours_maladie_employe on temps.jours_maladie (employe_id, annee) where employe_id is not null;

-- ------------------------------------------------------------
-- Écritures : seulement par ces fonctions (aucune politique d'écriture).
-- ------------------------------------------------------------
create function temps.ajuster_banque(
  p_user uuid, p_employe uuid, p_banque text, p_jour date, p_heures numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not temps.peut_regler_banque(p_user, p_employe) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Écrivez une note (ex. solde de départ, heures payées).' using errcode = 'check_violation';
  end if;
  insert into temps.ajustements_banques (user_id, employe_id, banque, jour, heures, note, auteur, auteur_nom)
  values (p_user, p_employe, p_banque, p_jour, p_heures, btrim(p_note), auth.uid(), temps.nom_actuel())
  returning id into v_id;
  return v_id;
end;
$$;

create function temps.regler_jours_maladie(p_user uuid, p_employe uuid, p_annee int, p_jours numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not temps.peut_regler_banque(p_user, p_employe) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_user is not null then
    insert into temps.jours_maladie (user_id, annee, jours, auteur, auteur_nom)
    values (p_user, p_annee, p_jours, auth.uid(), temps.nom_actuel())
    on conflict (user_id, annee) where user_id is not null do update set
      jours = excluded.jours, auteur = excluded.auteur, auteur_nom = excluded.auteur_nom, updated_at = now();
  else
    insert into temps.jours_maladie (employe_id, annee, jours, auteur, auteur_nom)
    values (p_employe, p_annee, p_jours, auth.uid(), temps.nom_actuel())
    on conflict (employe_id, annee) where employe_id is not null do update set
      jours = excluded.jours, auteur = excluded.auteur, auteur_nom = excluded.auteur_nom, updated_at = now();
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Onglet À approuver : une ligne par feuille soumise que la personne
-- connectée peut approuver, avec son total d'heures et sa date de
-- soumission. Sécurité de l'appelant (security invoker) : les politiques
-- des tables s'appliquent en plus des conditions ci-dessous.
--   employés  : toute la direction (temps.a_acces) ;
--   direction : les admins seulement, jamais sa propre feuille.
-- heures = heures payées (tout sauf le woofing) ; woofing à part.
-- ------------------------------------------------------------
create function temps.feuilles_a_approuver()
returns table (
  genre text,
  feuille_id uuid,
  user_id uuid,
  employe_id uuid,
  entreprise_id uuid,
  debut date,
  heures numeric,
  woofing numeric,
  soumise_le timestamptz
)
language sql
stable
set search_path = ''
as $$
  select 'employe', f.id, null::uuid, f.employe_id, f.entreprise_id, f.debut,
         coalesce((select sum(h.heures) from temps.heures_employes h
                    where h.employe_id = f.employe_id and h.entreprise_id = f.entreprise_id
                      and h.jour between f.debut and f.debut + 13 and h.type <> 'woofing'), 0),
         coalesce((select sum(h.heures) from temps.heures_employes h
                    where h.employe_id = f.employe_id and h.entreprise_id = f.entreprise_id
                      and h.jour between f.debut and f.debut + 13 and h.type = 'woofing'), 0),
         (select max(j.created_at) from temps.journal j where j.feuille_employe_id = f.id and j.genre = 'soumission')
    from temps.feuilles_employes f
   where f.statut = 'soumise' and temps.a_acces()
  union all
  select 'direction', f.id, f.user_id, null::uuid, null::uuid, f.debut,
         coalesce((select sum(h.heures) from temps.heures h
                    where h.user_id = f.user_id and h.jour between f.debut and f.debut + 13), 0),
         0,
         (select max(j.created_at) from temps.journal j where j.feuille_id = f.id and j.genre = 'soumission')
    from temps.feuilles f
   where f.statut = 'soumise' and core.est_admin() and temps.a_acces() and f.user_id <> auth.uid()
$$;

-- ------------------------------------------------------------
-- Dossiers à fermer (relevé d'emploi) : un employé actif qui a déjà eu des
-- heures, mais aucune pendant les 2 périodes avant p_periode (ni dans
-- p_periode). Il disparaît de la saisie de p_periode (réaffichable) et la
-- direction voit « Produire le relevé d'emploi ». Confirmer =
-- temps.fermer_dossier (fiche désactivée), jamais sans confirmation.
-- Une fiche réactivée plus tard n'est signalée de nouveau qu'après de
-- nouvelles heures (temps.dossiers_fermes).
-- ------------------------------------------------------------
create table temps.dossiers_fermes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references core.employes(id) on delete restrict,
  -- Période de ses dernières heures au moment de la fermeture.
  derniere_periode date not null
    check (derniere_periode >= temps.premiere_periode() and derniere_periode = temps.debut_periode(derniere_periode)),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  created_at timestamptz not null default now()
);

comment on table temps.dossiers_fermes is
  'Relevés d''emploi confirmés : fiche désactivée après 2 périodes sans heures';

create index dossiers_fermes_employe on temps.dossiers_fermes (employe_id);

-- Jour de Montréal.
create function temps.aujourdhui()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Toronto')::date
$$;

-- p_periode : période affichée (null = en cours) ; une période à venir
-- compte comme la période en cours (les périodes d'avant ne sont pas finies).
create function temps.dossiers_a_fermer(p_periode date default null)
returns table (employe_id uuid, surnom text, nom_complet text, derniere_periode date)
language sql
stable
set search_path = ''
as $$
  with p as (
    select least(
      temps.debut_periode(greatest(coalesce(p_periode, temps.aujourdhui()), temps.premiere_periode())),
      temps.debut_periode(greatest(temps.aujourdhui(), temps.premiere_periode()))
    ) as debut
  ),
  dernieres as (
    select h.employe_id, temps.debut_periode(max(h.jour)) as derniere
      from temps.heures_employes h, p
     where h.jour <= p.debut + 13
     group by h.employe_id
  )
  select e.id, e.surnom, e.nom_complet, d.derniere
    from dernieres d
    join core.employes e on e.id = d.employe_id and e.actif
    cross join p
   where temps.a_acces()
     and d.derniere <= p.debut - 28 - 14
     and not exists (
       select 1 from temps.dossiers_fermes f where f.employe_id = d.employe_id and f.derniere_periode >= d.derniere)
   order by e.surnom
$$;

create function temps.fermer_dossier(p_employe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_derniere date;
begin
  if not temps.a_acces() then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  select temps.debut_periode(max(h.jour)) into v_derniere from temps.heures_employes h where h.employe_id = p_employe;
  if v_derniere is null then
    raise exception 'Cet employé n''a aucune heure : rien à fermer.';
  end if;
  insert into temps.dossiers_fermes (employe_id, derniere_periode, auteur, auteur_nom)
  values (p_employe, v_derniere, auth.uid(), temps.nom_actuel());
  update core.employes set actif = false where id = p_employe;
end;
$$;

-- ------------------------------------------------------------
-- Droits et politiques
-- ------------------------------------------------------------
alter table temps.ajustements_banques enable row level security;
alter table temps.jours_maladie enable row level security;
alter table temps.dossiers_fermes enable row level security;

grant select on temps.ajustements_banques, temps.jours_maladie, temps.dossiers_fermes to authenticated;
grant all on temps.ajustements_banques, temps.jours_maladie, temps.dossiers_fermes to service_role;

-- Pas de politique d'écriture : seulement par les fonctions plus haut.
create policy "Lire" on temps.ajustements_banques for select to authenticated
  using (temps.peut_voir_banque(user_id, employe_id));
create policy "Lire" on temps.jours_maladie for select to authenticated
  using (temps.peut_voir_banque(user_id, employe_id));
create policy "Lire" on temps.dossiers_fermes for select to authenticated
  using (temps.a_acces());

revoke execute on function
  temps.peut_voir_banque(uuid, uuid),
  temps.peut_regler_banque(uuid, uuid),
  temps.ajuster_banque(uuid, uuid, text, date, numeric, text),
  temps.regler_jours_maladie(uuid, uuid, int, numeric),
  temps.feuilles_a_approuver(),
  temps.aujourdhui(),
  temps.dossiers_a_fermer(date),
  temps.fermer_dossier(uuid)
from public, anon;

grant execute on function
  temps.peut_voir_banque(uuid, uuid),
  temps.peut_regler_banque(uuid, uuid),
  temps.ajuster_banque(uuid, uuid, text, date, numeric, text),
  temps.regler_jours_maladie(uuid, uuid, int, numeric),
  temps.feuilles_a_approuver(),
  temps.aujourdhui(),
  temps.dossiers_a_fermer(date),
  temps.fermer_dossier(uuid)
to authenticated, service_role;
