-- ============================================================
-- accidents : rapports d'accident des employés (demande de Maxime du
-- 2026-10-23 : blessure, quasi-accident, premiers soins…). Un module à
-- part pour l'instant ; il ira plus tard dans un module plus large.
--
-- Plan accepté par Maxime (2026-10-23) :
--   - la direction (et les admins) voit et gère tous les rapports
--     (module `accidents`) ;
--   - « Accidents › Déclarer » (`accidents_declarer`) : remplir un rapport
--     et ne revoir que les siens, modifiables tant qu'ils sont ouverts
--     (coordonnateurs par défaut, réglable dans la page Utilisateurs) ;
--   - le terrain : rien ; un employé sans compte passe par quelqu'un
--     qui en a un ;
--   - renseignements de santé : en ligne seulement, rien gardé sur
--     l'appareil, pas de copie dans le Drive.
-- ============================================================

create schema if not exists accidents;

-- Deux nouvelles entrées dans la grille d'accès.
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','rh_fiches','batiments','accidents','accidents_declarer'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante','inventaire','rh','rh_paie','rh_fiches','batiments','accidents','accidents_declarer'));

insert into core.acces_roles (role, module, niveau) values
  ('direction', 'accidents', 'ecriture'),
  ('coordo', 'accidents_declarer', 'ecriture'),
  ('developpeur', 'accidents', 'ecriture'),
  ('developpeur', 'accidents_declarer', 'ecriture');

-- ------------------------------------------------------------
-- Rapports
-- ------------------------------------------------------------
create table accidents.rapports (
  id uuid primary key default gen_random_uuid(),
  -- accident = avec blessure ; premiers_soins = blessure légère soignée
  -- sur place ; quasi_accident = personne de blessé, mais ça aurait pu.
  genre text not null check (genre in ('accident', 'premiers_soins', 'quasi_accident', 'autre')),
  -- Résumé d'une ligne (« Coupure à la main en cuisine »).
  titre text not null check (btrim(titre) <> ''),
  survenu_le timestamptz not null,
  lieu text check (lieu is null or btrim(lieu) <> ''),
  -- Personne blessée : un employé du référentiel, sinon son nom
  -- (pas encore dans la liste, bénévole…). Facultative pour un
  -- quasi-accident.
  employe_id uuid references core.employes(id) on delete restrict,
  autre_personne text check (autre_personne is null or btrim(autre_personne) <> ''),
  -- Ce qui s'est passé.
  description text check (description is null or btrim(description) <> ''),
  temoins text check (temoins is null or btrim(temoins) <> ''),
  -- Nature de la blessure et partie du corps.
  blessure text check (blessure is null or btrim(blessure) <> ''),
  -- Premiers soins donnés, et par qui.
  soins text check (soins is null or btrim(soins) <> ''),
  secouriste text check (secouriste is null or btrim(secouriste) <> ''),
  -- Consultation médicale ; null = pas précisé.
  consultation text check (consultation in ('aucune', 'clinique', 'urgence')),
  -- Absent du travail après la journée de l'accident, et retour.
  arret_travail boolean not null default false,
  retour_le date,
  avises text[] not null default '{}' check (avises <@ array['ambulance', 'parents', 'police', 'cnesst']),
  dossier_cnesst text check (dossier_cnesst is null or btrim(dossier_cnesst) <> ''),
  -- Ce qu'on fait pour que ça ne se reproduise pas.
  mesures text check (mesures is null or btrim(mesures) <> ''),
  -- Suivi et fermeture : la direction seulement (accidents.verifier_rapport).
  suivi text check (suivi is null or btrim(suivi) <> ''),
  regle_le date,
  -- Auteur posé par la base, jamais changé ; nom copié (lisible par qui
  -- ne lit pas les comptes, et après le retrait d'un compte).
  redige_par uuid references core.profils(id) on delete set null,
  redige_par_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (genre in ('quasi_accident', 'autre') or employe_id is not null or autre_personne is not null)
);

create index idx_rapports_survenu on accidents.rapports(survenu_le desc);
create index idx_rapports_employe on accidents.rapports(employe_id);
create index idx_rapports_redige_par on accidents.rapports(redige_par);

create trigger trg_rapports_updated_at before update on accidents.rapports
for each row execute function core.maj_updated_at();

-- Auteur et champs de la direction : qui ne gère pas les rapports
-- (« Déclarer » seulement) ne touche ni au suivi ni à la fermeture.
create function accidents.verifier_rapport()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.redige_par := coalesce(auth.uid(), new.redige_par);
    new.redige_par_nom := (select p.nom from core.profils p where p.id = new.redige_par);
  else
    new.redige_par := old.redige_par;
    new.redige_par_nom := old.redige_par_nom;
    new.created_at := old.created_at;
  end if;
  if auth.uid() is not null and not core.peut_ecrire('accidents') then
    if tg_op = 'INSERT' then
      new.suivi := null;
      new.regle_le := null;
    else
      new.suivi := old.suivi;
      new.regle_le := old.regle_le;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_verifier_rapport before insert or update on accidents.rapports
for each row execute function accidents.verifier_rapport();

-- ------------------------------------------------------------
-- Photos et PDF d'un rapport : seau privé, lus par adresses signées.
-- ------------------------------------------------------------
create table accidents.fichiers (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references accidents.rapports(id) on delete cascade,
  -- Chemin dans le seau accidents-fichiers : <rapport>/<id>.jpg ou .pdf
  chemin text not null unique,
  -- Nom d'origine d'un PDF (null pour une photo).
  nom text,
  ajoute_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_fichiers_rapport on accidents.fichiers(rapport_id);

-- Rapport que la personne a déclaré, encore ouvert, avec l'accès
-- « Déclarer » (lu avec ses droits : la RLS des rapports s'applique).
create function accidents.mon_rapport_ouvert(p_rapport uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.peut_ecrire('accidents_declarer') and exists (
    select 1 from accidents.rapports r
     where r.id = p_rapport and r.redige_par = auth.uid() and r.regle_le is null)
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant usage on schema accidents to authenticated, service_role;
grant select, insert, update, delete on all tables in schema accidents to authenticated, service_role;
revoke execute on function accidents.verifier_rapport() from public, anon;
revoke execute on function accidents.mon_rapport_ouvert(uuid) from public, anon;
grant execute on function accidents.mon_rapport_ouvert(uuid) to authenticated, service_role;

alter table accidents.rapports enable row level security;
alter table accidents.fichiers enable row level security;

create policy "Lire" on accidents.rapports for select to authenticated
  using (core.peut_lire('accidents') or (redige_par = auth.uid() and core.peut_ecrire('accidents_declarer')));
create policy "Ajouter" on accidents.rapports for insert to authenticated
  with check (core.peut_ecrire('accidents') or (redige_par = auth.uid() and core.peut_ecrire('accidents_declarer')));
create policy "Modifier" on accidents.rapports for update to authenticated
  using (core.peut_ecrire('accidents') or (redige_par = auth.uid() and regle_le is null and core.peut_ecrire('accidents_declarer')))
  with check (core.peut_ecrire('accidents') or (redige_par = auth.uid() and core.peut_ecrire('accidents_declarer')));
-- Un rapport ne disparaît pas : seule la direction le supprime.
create policy "Supprimer" on accidents.rapports for delete to authenticated
  using (core.peut_ecrire('accidents'));

create policy "Lire" on accidents.fichiers for select to authenticated
  using (exists (select 1 from accidents.rapports r where r.id = rapport_id));
create policy "Ajouter" on accidents.fichiers for insert to authenticated
  with check (core.peut_ecrire('accidents') or (ajoute_par = auth.uid() and accidents.mon_rapport_ouvert(rapport_id)));
create policy "Retirer" on accidents.fichiers for delete to authenticated
  using (core.peut_ecrire('accidents') or (ajoute_par = auth.uid() and accidents.mon_rapport_ouvert(rapport_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accidents-fichiers', 'accidents-fichiers', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Le dossier d'un fichier = son rapport : on le lit si on lit le rapport.
create policy "Accidents : lire les fichiers" on storage.objects for select to authenticated
  using (bucket_id = 'accidents-fichiers'
         and exists (select 1 from accidents.rapports r where r.id::text = (storage.foldername(name))[1]));
create policy "Accidents : ajouter un fichier" on storage.objects for insert to authenticated
  with check (bucket_id = 'accidents-fichiers'
              and (core.peut_ecrire('accidents')
                   or exists (select 1 from accidents.rapports r
                               where r.id::text = (storage.foldername(name))[1] and accidents.mon_rapport_ouvert(r.id))));
create policy "Accidents : retirer un fichier" on storage.objects for delete to authenticated
  using (bucket_id = 'accidents-fichiers'
         and (core.peut_ecrire('accidents')
              or exists (select 1 from accidents.rapports r
                          where r.id::text = (storage.foldername(name))[1] and accidents.mon_rapport_ouvert(r.id))));
