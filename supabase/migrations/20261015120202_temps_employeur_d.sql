-- ============================================================
-- temps : export des heures d'une période de paie vers Employeur D
-- (Desjardins), gabarit « Saisie simple » (demande de Maxime du
-- 2026-10-15).
--
-- Une ligne du fichier = un employé (référentiel core.employes) pour une
-- compagnie : Compagnie (numéro Employeur D), Matricule, « Nom, prénom »,
-- No relevé (vide), Période (date), puis une colonne G<code>(Quantité) par
-- code de gain. Calcul dans l'app (src/modules/temps/employeurD.ts).
--
-- Choix de Maxime :
--   - numéro de compagnie Employeur D sur la liste commune des compagnies
--     (core.entreprises), saisi dans les réglages de l'export (et dans
--     Référentiel › Compagnies) ; le futur export RH s'en servira aussi ;
--   - matricule Employeur D : un par employé, le même pour toutes ses
--     compagnies, sur sa fiche du référentiel (core.employes). Le module RH
--     le lira par rh.personnes.employe_id (pas de colonne en double) ;
--   - codes de gains réglables dans l'app (à confirmer avec Charlotte) :
--     régulières = G1 au départ, maladie et prises en banque sans code
--     (pas exportées) tant qu'ils ne sont pas réglés.
-- Formats (canevas Desjardins) : numéro de compagnie alphanumérique, 8
-- caractères au plus ; matricule numérique, 9 chiffres au plus ; numéro
-- de gain de 1 à 999.
-- ============================================================

-- ------------------------------------------------------------
-- Référentiel : numéro de compagnie et matricule
-- ------------------------------------------------------------
alter table core.entreprises
  add column numero_employeur_d text check (numero_employeur_d ~ '^[A-Za-z0-9]{1,8}$');
comment on column core.entreprises.numero_employeur_d is
  'Numéro de compagnie dans Employeur D (Desjardins), 8 lettres ou chiffres au plus';
create unique index entreprises_numero_employeur_d on core.entreprises (numero_employeur_d)
  where numero_employeur_d is not null;

alter table core.employes
  add column matricule_employeur_d text check (matricule_employeur_d ~ '^[0-9]{1,9}$');
comment on column core.employes.matricule_employeur_d is
  'Matricule dans Employeur D (Desjardins), 9 chiffres au plus ; le même pour toutes ses compagnies';
create unique index employes_matricule_employeur_d on core.employes (matricule_employeur_d)
  where matricule_employeur_d is not null;

-- Valeurs nettoyées (espaces, zéros de tête d'un matricule) et messages
-- clairs ; les contraintes ci-dessus restent le dernier rempart.
create function core.verifier_numero_employeur_d()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_autre text;
begin
  new.numero_employeur_d := nullif(regexp_replace(coalesce(new.numero_employeur_d, ''), '\s', '', 'g'), '');
  if new.numero_employeur_d is null then
    return new;
  end if;
  if new.numero_employeur_d !~ '^[A-Za-z0-9]{1,8}$' then
    raise exception 'Le numéro de compagnie Employeur D compte de 1 à 8 lettres ou chiffres.'
      using errcode = 'check_violation';
  end if;
  select e.nom into v_autre from core.entreprises e
   where e.id <> new.id and e.numero_employeur_d = new.numero_employeur_d;
  if found then
    raise exception 'Le numéro Employeur D % est déjà celui de %.', new.numero_employeur_d, v_autre
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger trg_numero_employeur_d before insert or update of numero_employeur_d on core.entreprises
for each row execute function core.verifier_numero_employeur_d();

create function core.verifier_matricule_employeur_d()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_autre text;
begin
  new.matricule_employeur_d := nullif(regexp_replace(coalesce(new.matricule_employeur_d, ''), '\s', '', 'g'), '');
  if new.matricule_employeur_d is null then
    return new;
  end if;
  if new.matricule_employeur_d !~ '^[0-9]{1,9}$' then
    raise exception 'Le matricule Employeur D compte de 1 à 9 chiffres.'
      using errcode = 'check_violation';
  end if;
  -- Numérique dans Employeur D : 000123 = 123.
  new.matricule_employeur_d := (new.matricule_employeur_d::bigint)::text;
  select coalesce(e.nom_complet, e.surnom) into v_autre from core.employes e
   where e.id <> new.id and e.matricule_employeur_d = new.matricule_employeur_d;
  if found then
    raise exception 'Le matricule Employeur D % est déjà celui de %.', new.matricule_employeur_d, v_autre
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger trg_matricule_employeur_d before insert or update of matricule_employeur_d on core.employes
for each row execute function core.verifier_matricule_employeur_d();

-- ------------------------------------------------------------
-- Réglages de l'export (une seule ligne)
-- ------------------------------------------------------------
create table temps.reglages_employeur_d (
  id boolean primary key default true check (id),
  -- Numéro du code de gain par type d'heures ; null = pas dans le fichier.
  code_regulieres smallint check (code_regulieres between 1 and 999),
  code_maladie smallint check (code_maladie between 1 and 999),
  code_banque smallint check (code_banque between 1 and 999),
  -- Date de la colonne « Période » : date de paie (jeudi) ou fin de la période (samedi).
  periode text not null default 'date_paie' check (periode in ('date_paie', 'fin_periode')),
  modifie_le timestamptz not null default now(),
  modifie_par text
);

comment on table temps.reglages_employeur_d is
  'Export Employeur D : code de gain de chaque type d''heures (null = pas exporté) et date de la colonne Période';

insert into temps.reglages_employeur_d (code_regulieres) values (1);

-- Security definer : temps.nom_actuel() n'est pas exécutable par les comptes.
create function temps.signer_reglages_employeur_d()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := true;
  new.modifie_le := now();
  new.modifie_par := temps.nom_actuel();
  return new;
end;
$$;

create trigger trg_signer before update on temps.reglages_employeur_d
for each row execute function temps.signer_reglages_employeur_d();

-- Toute personne qui entre dans le module (admins et direction : Charlotte
-- fait la paie) lit et modifie les réglages ; jamais d'ajout ni d'effacement.
alter table temps.reglages_employeur_d enable row level security;
grant select, update (code_regulieres, code_maladie, code_banque, periode) on temps.reglages_employeur_d to authenticated;
grant all on temps.reglages_employeur_d to service_role;

create policy "Lire" on temps.reglages_employeur_d for select to authenticated
  using (temps.a_acces());
create policy "Modifier" on temps.reglages_employeur_d for update to authenticated
  using (temps.a_acces()) with check (temps.a_acces());
