-- ============================================================
-- temps : les heures de la direction dans l'onglet Employés et dans
-- l'export Employeur D (demande de Maxime du 2026-10-15 : « comme c'est
-- les admins qui préparent la paie »).
--
-- La direction (comptes admin et direction, feuilles temps.heures) n'a ni
-- fiche du référentiel ni compagnie : sa compagnie de paie et son
-- matricule Employeur D sont réglés par compte dans temps.paie_direction,
-- par les admins seulement (même confidentialité que les feuilles : chacun
-- ne lit que sa ligne, un admin toutes). Pas de fiche core.employes pour
-- la direction : elle paraîtrait dans l'Animation, le Rooming, etc.
-- Une compagnie de paie par personne (ses heures n'ont pas de compagnie).
--
-- Les vacances (heures de la direction seulement) ont leur code de gain.
-- ============================================================

alter table temps.reglages_employeur_d
  add column code_vacances smallint check (code_vacances between 1 and 999);
grant update (code_vacances) on temps.reglages_employeur_d to authenticated;

create table temps.paie_direction (
  user_id uuid primary key references core.profils(id) on delete restrict,
  entreprise_id uuid references core.entreprises(id) on delete restrict,
  matricule_employeur_d text check (matricule_employeur_d ~ '^[0-9]{1,9}$'),
  modifie_le timestamptz not null default now(),
  modifie_par text
);

comment on table temps.paie_direction is
  'Paie d''un compte de la direction dans Employeur D : compagnie qui le paie et matricule (admins seulement)';

create unique index paie_direction_matricule on temps.paie_direction (matricule_employeur_d)
  where matricule_employeur_d is not null;

-- Matricule nettoyé comme celui des employés (core.verifier_matricule_employeur_d)
-- et jamais celui d'un autre compte ou d'une fiche du référentiel ; compte de
-- la direction ou admin seulement ; auteur posé par la base.
-- Security definer : temps.nom_actuel() n'est pas exécutable par les comptes.
create function temps.verifier_paie_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autre text;
begin
  if (tg_op = 'INSERT' or new.user_id <> old.user_id) and not exists (
    select 1 from core.profils p where p.id = new.user_id and p.role in ('admin', 'direction')) then
    raise exception 'La paie de la direction ne vaut que pour un compte de la direction ou un admin.'
      using errcode = 'check_violation';
  end if;
  new.matricule_employeur_d := nullif(regexp_replace(coalesce(new.matricule_employeur_d, ''), '\s', '', 'g'), '');
  if new.matricule_employeur_d is not null then
    if new.matricule_employeur_d !~ '^[0-9]{1,9}$' then
      raise exception 'Le matricule Employeur D compte de 1 à 9 chiffres.'
        using errcode = 'check_violation';
    end if;
    new.matricule_employeur_d := (new.matricule_employeur_d::bigint)::text;
    select coalesce(nullif(btrim(p.nom), ''), p.courriel) into v_autre
      from temps.paie_direction d join core.profils p on p.id = d.user_id
     where d.user_id <> new.user_id and d.matricule_employeur_d = new.matricule_employeur_d;
    if not found then
      select coalesce(e.nom_complet, e.surnom) into v_autre from core.employes e
       where e.matricule_employeur_d = new.matricule_employeur_d;
    end if;
    if v_autre is not null then
      raise exception 'Le matricule Employeur D % est déjà celui de %.', new.matricule_employeur_d, v_autre
        using errcode = 'unique_violation';
    end if;
  end if;
  new.modifie_le := now();
  new.modifie_par := temps.nom_actuel();
  return new;
end;
$$;

create trigger trg_verifier before insert or update on temps.paie_direction
for each row execute function temps.verifier_paie_direction();

alter table temps.paie_direction enable row level security;
grant select, insert, delete on temps.paie_direction to authenticated;
-- user_id : l'« upsert » de PostgREST le réécrit (même valeur).
grant update (user_id, entreprise_id, matricule_employeur_d) on temps.paie_direction to authenticated;
grant all on temps.paie_direction to service_role;

create policy "Lire" on temps.paie_direction for select to authenticated
  using (temps.peut_voir(user_id));
create policy "Admins ajoutent" on temps.paie_direction for insert to authenticated
  with check (temps.a_acces() and core.est_admin());
create policy "Admins modifient" on temps.paie_direction for update to authenticated
  using (temps.a_acces() and core.est_admin()) with check (temps.a_acces() and core.est_admin());
create policy "Admins effacent" on temps.paie_direction for delete to authenticated
  using (temps.a_acces() and core.est_admin());
