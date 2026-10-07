-- ============================================================
-- temps : heures des employés (hors direction), saisies par la direction.
--
-- Remplace le Google Sheets « Feuille de temps - BPA/Opikawa/R&D/
-- Aquabounga » : une ligne par employé, les 14 jours de la période de paie,
-- une note de paie par employé et par période. Pas de types d'heures
-- (régulières, vacances, maladie) : un seul nombre par jour.
--
-- Qui (décision de la direction, 2026-10-07) : une feuille PARTAGÉE. Toute
-- personne qui entre dans le module (temps.a_acces : admin et direction)
-- voit et modifie les heures de tous les employés ; pas de responsable par
-- employé, seulement un filtre par secteur (core.employes.secteur). La
-- confidentialité des feuilles de la direction (temps.heures) ne change
-- pas : ces tables-ci ne contiennent jamais un membre de la direction par
-- son compte, seulement des employés du référentiel.
--
-- Pas de temps réel ni de cache sur l'appareil, comme le reste du module.
-- ============================================================

-- Secteur d'un employé (Cuisine, Entretien, Animation…) : texte libre, sert
-- à regrouper et filtrer la feuille des employés.
alter table core.employes add column secteur text
  check (secteur is null or (secteur = btrim(secteur) and secteur <> ''));

-- ------------------------------------------------------------
-- Heures : une ligne par employé et par jour (jamais 0 : on supprime).
-- ------------------------------------------------------------
create table temps.heures_employes (
  id uuid primary key default gen_random_uuid(),
  -- restrict : registres de paie, on désactive un employé au lieu de le
  -- supprimer.
  employe_id uuid not null references core.employes(id) on delete restrict,
  jour date not null check (jour >= temps.premiere_periode()),
  -- Au quart d'heure près, au plus 24 h.
  heures numeric(4,2) not null check (heures > 0 and heures <= 24 and heures * 4 = trunc(heures * 4)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (employe_id, jour)
);

create index heures_employes_jour on temps.heures_employes (jour);

-- ------------------------------------------------------------
-- Note de paie d'un employé pour une période (ex. « EN BANQUE »).
-- ------------------------------------------------------------
create table temps.notes_employes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references core.employes(id) on delete restrict,
  debut date not null check (debut >= temps.premiere_periode() and debut = temps.debut_periode(debut)),
  note text not null check (note = btrim(note) and note <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (employe_id, debut)
);

-- Auteur et heure de chaque modification, posés par la base.
create function temps.signer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger trg_signer before insert or update on temps.heures_employes
for each row execute function temps.signer();
create trigger trg_signer before insert or update on temps.notes_employes
for each row execute function temps.signer();

-- ------------------------------------------------------------
-- Droits : quiconque entre dans le module (temps.a_acces), rien d'autre.
-- ------------------------------------------------------------
grant select, insert, update, delete on temps.heures_employes, temps.notes_employes to authenticated;
grant all on temps.heures_employes, temps.notes_employes to service_role;
revoke execute on function temps.signer() from public, anon;

alter table temps.heures_employes enable row level security;
alter table temps.notes_employes enable row level security;

create policy "Lire" on temps.heures_employes for select to authenticated using (temps.a_acces());
create policy "Ajouter" on temps.heures_employes for insert to authenticated with check (temps.a_acces());
create policy "Modifier" on temps.heures_employes for update to authenticated
  using (temps.a_acces()) with check (temps.a_acces());
create policy "Supprimer" on temps.heures_employes for delete to authenticated using (temps.a_acces());

create policy "Lire" on temps.notes_employes for select to authenticated using (temps.a_acces());
create policy "Ajouter" on temps.notes_employes for insert to authenticated with check (temps.a_acces());
create policy "Modifier" on temps.notes_employes for update to authenticated
  using (temps.a_acces()) with check (temps.a_acces());
create policy "Supprimer" on temps.notes_employes for delete to authenticated using (temps.a_acces());
