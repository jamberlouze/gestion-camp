-- ============================================================
-- temps : interrupteur « Heures en banque » par personne et onglet
-- Banques (décisions de Maxime du 2026-10-14, après la première version).
--
-- Mise en banque des heures régulières au-delà de 40 h par semaine :
--   - activée par défaut pour la direction et les admins (titulaire = un
--     compte, user_id) ; désactivée par défaut pour les employés
--     (titulaire = une fiche du référentiel, employe_id), qu'ils aient un
--     compte ou non ;
--   - chaque changement vaut à partir de la période de paie EN COURS
--     (temps.banque_heures_etats.depuis) : une période passée n'est jamais
--     réécrite. État d'une semaine = le dernier changement dont `depuis` est
--     au plus tard le dimanche de la semaine, sinon le défaut. Désactivée :
--     plus d'accumulation, le solde reste (on peut encore le prendre ou
--     l'ajuster) ; réactivée : les périodes désactivées restent sans
--     accumulation ;
--   - seuls les admins changent l'interrupteur (temps.regler_banque_heures).
-- Calcul dans l'app (src/modules/temps/banques.ts), rien n'est stocké.
--
-- Onglet Banques : sommes par semaine (temps.semaines_banques, sécurité de
-- l'appelant : chacun ne reçoit que les heures qu'il peut lire). La règle
-- de confidentialité ne change pas (temps.role_autorise, peut_voir_banque).
-- ============================================================

create table temps.banque_heures_etats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.profils(id) on delete restrict,
  employe_id uuid references core.employes(id) on delete restrict,
  -- Premier jour (dimanche) de la période de paie à partir de laquelle l'état vaut.
  depuis date not null check (depuis >= temps.premiere_periode() and depuis = temps.debut_periode(depuis)),
  active boolean not null,
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(user_id, employe_id) = 1)
);

comment on table temps.banque_heures_etats is
  'Interrupteur « Heures en banque » : à partir de telle période, les heures au-delà de 40 h vont (ou non) en banque. Sans ligne : oui pour la direction et les admins, non pour les employés';

create unique index banque_heures_etats_user on temps.banque_heures_etats (user_id, depuis) where user_id is not null;
create unique index banque_heures_etats_employe on temps.banque_heures_etats (employe_id, depuis) where employe_id is not null;

-- Activer ou désactiver, à partir de la période en cours (admins seulement).
create function temps.regler_banque_heures(p_user uuid, p_employe uuid, p_active boolean)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_depuis date := temps.debut_periode(greatest(temps.aujourdhui(), temps.premiere_periode()));
begin
  if not (core.est_admin() and temps.peut_regler_banque(p_user, p_employe)) then
    raise exception 'Seul un administrateur active ou désactive la mise en banque des heures.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_active is null then
    raise exception 'État manquant.' using errcode = 'check_violation';
  end if;
  if p_user is not null then
    insert into temps.banque_heures_etats (user_id, depuis, active, auteur, auteur_nom)
    values (p_user, v_depuis, p_active, auth.uid(), temps.nom_actuel())
    on conflict (user_id, depuis) where user_id is not null do update set
      active = excluded.active, auteur = excluded.auteur, auteur_nom = excluded.auteur_nom, created_at = now();
  else
    insert into temps.banque_heures_etats (employe_id, depuis, active, auteur, auteur_nom)
    values (p_employe, v_depuis, p_active, auth.uid(), temps.nom_actuel())
    on conflict (employe_id, depuis) where employe_id is not null do update set
      active = excluded.active, auteur = excluded.auteur, auteur_nom = excluded.auteur_nom, created_at = now();
  end if;
  return v_depuis;
end;
$$;

-- Heures par personne et par semaine (dimanche) jusqu'au jour p_au :
-- régulières, maladie et prises en banque (woofing et vacances ne servent
-- pas aux banques). Employé : toutes compagnies confondues.
create function temps.semaines_banques(p_au date)
returns table (user_id uuid, employe_id uuid, semaine date, regulieres numeric, maladie numeric, banque numeric)
language sql
stable
set search_path = ''
as $$
  select h.user_id, null::uuid, h.jour - extract(dow from h.jour)::int,
         coalesce(sum(h.heures) filter (where h.type = 'regulieres'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'maladie'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'banque'), 0)
    from temps.heures h
   where h.jour <= p_au
   group by h.user_id, h.jour - extract(dow from h.jour)::int
  union all
  select null::uuid, h.employe_id, h.jour - extract(dow from h.jour)::int,
         coalesce(sum(h.heures) filter (where h.type = 'regulieres'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'maladie'), 0),
         coalesce(sum(h.heures) filter (where h.type = 'banque'), 0)
    from temps.heures_employes h
   where h.jour <= p_au
   group by h.employe_id, h.jour - extract(dow from h.jour)::int
$$;

alter table temps.banque_heures_etats enable row level security;
grant select on temps.banque_heures_etats to authenticated;
grant all on temps.banque_heures_etats to service_role;

-- Pas de politique d'écriture : seulement par temps.regler_banque_heures.
create policy "Lire" on temps.banque_heures_etats for select to authenticated
  using (temps.peut_voir_banque(user_id, employe_id));

revoke execute on function
  temps.regler_banque_heures(uuid, uuid, boolean),
  temps.semaines_banques(date)
from public, anon;

grant execute on function
  temps.regler_banque_heures(uuid, uuid, boolean),
  temps.semaines_banques(date)
to authenticated, service_role;
