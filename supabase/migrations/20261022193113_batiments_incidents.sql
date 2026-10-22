-- ============================================================
-- batiments : rapports d'incidents (demande de Maxime du 2026-10-22) :
-- feu mineur, bris important, vol… Un rapport par incident, avec son
-- suivi (pompiers, police, assureur, coût) jusqu'à ce qu'il soit réglé.
--
-- Choix de Maxime (2026-10-22) : direction seulement, comme le reste du
-- module (le terrain signale ses bris dans Travaux) ; un bouton crée la
-- tâche de réparation dans Travaux et le rapport garde le lien.
-- ============================================================

create table batiments.incidents (
  id uuid primary key default gen_random_uuid(),
  -- Résumé d'une ligne (« Feu de poubelle derrière la cuisine »).
  titre text not null check (btrim(titre) <> ''),
  genre text not null check (genre in ('feu', 'bris', 'vol', 'degat_eau', 'vandalisme', 'intrusion', 'autre')),
  gravite text not null default 'mineur' check (gravite in ('mineur', 'important', 'majeur')),
  survenu_le timestamptz not null,
  batiment_id uuid references batiments.batiments(id) on delete set null,
  -- Où exactement (« Derrière la cuisine, près du conteneur »).
  lieu text check (lieu is null or btrim(lieu) <> ''),
  -- Ce qui s'est passé.
  description text check (description is null or btrim(description) <> ''),
  -- Ce qui a été fait sur le moment (extincteur, eau coupée…).
  mesures text check (mesures is null or btrim(mesures) <> ''),
  -- Personnes impliquées et témoins (texte libre).
  personnes text check (personnes is null or btrim(personnes) <> ''),
  -- Qui a été avisé.
  avises text[] not null default '{}' check (avises <@ array['pompiers', 'police', 'ambulance', 'assureur']),
  dossier_police text check (dossier_police is null or btrim(dossier_police) <> ''),
  dossier_assureur text check (dossier_assureur is null or btrim(dossier_assureur) <> ''),
  cout_estime numeric(12, 2) check (cout_estime >= 0),
  -- Suivi : réparations, réponse de l'assureur…
  suivi text check (suivi is null or btrim(suivi) <> ''),
  -- Jour où le dossier a été fermé ; null = ouvert.
  regle_le date,
  -- Tâche de réparation créée dans Travaux (batiments.creer_tache).
  tache_id uuid references travaux.taches(id) on delete set null,
  redige_par uuid default auth.uid() references core.profils(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_incidents_survenu on batiments.incidents(survenu_le desc);

create trigger trg_incidents_updated_at before update on batiments.incidents
for each row execute function core.maj_updated_at();

-- Photos et PDF d'un incident : même table et même seau que ceux des
-- panneaux et des valves.
alter table batiments.fichiers add column incident_id uuid references batiments.incidents(id) on delete cascade;
alter table batiments.fichiers drop constraint fichiers_check;
alter table batiments.fichiers add constraint fichiers_check check (num_nonnulls(panneau_id, valve_id, incident_id) = 1);
create index idx_fichiers_incident on batiments.fichiers(incident_id);

-- ------------------------------------------------------------
-- Tâche de réparation dans Travaux, reliée au rapport, en une
-- transaction. Droits de la personne (security invoker) : la RLS et le
-- déclencheur de Travaux s'appliquent (une personne qui ne trie pas
-- Travaux crée une tâche « à trier »).
-- ------------------------------------------------------------
create function batiments.creer_tache(p_incident uuid, p_titre text, p_description text, p_lieu uuid, p_priorite smallint)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tache uuid;
begin
  if not core.peut_ecrire('batiments') then
    raise exception 'Réservé à qui écrit dans Bâtiments.' using errcode = '42501';
  end if;
  select i.tache_id into v_tache from batiments.incidents i where i.id = p_incident for update;
  if not found then
    raise exception 'Rapport introuvable.';
  end if;
  if v_tache is not null then
    raise exception 'Ce rapport a déjà sa tâche dans Travaux.';
  end if;
  insert into travaux.taches (titre, description, statut, lieu_id, priorite)
  values (btrim(p_titre), nullif(btrim(p_description), ''), 'a_faire', p_lieu, coalesce(p_priorite, 3))
  returning id into v_tache;
  update batiments.incidents set tache_id = v_tache where id = p_incident;
  return v_tache;
end;
$$;

-- ------------------------------------------------------------
-- Copie vers le Drive : les fichiers d'un incident vont dans
-- Bâtiments › Incidents › « 2026-10-22 – Feu de poubelle… » (nom du
-- dossier pris à la création ; la clé reste celle de l'incident).
-- ------------------------------------------------------------
create or replace function batiments.drive_documents()
returns table (document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, cree_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, 'batiments-fichiers', f.chemin,
    core.drive_nom(coalesce(nullif(btrim(f.nom), ''), 'Photo ' || core.drive_jour(f.created_at)), f.chemin),
    case when i.id is not null then
      jsonb_build_array(
        jsonb_build_object('cle', 'batiments:racine', 'nom', 'Bâtiments'),
        jsonb_build_object('cle', 'batiments:incidents', 'nom', 'Incidents'),
        jsonb_build_object('cle', 'batiments:i:' || i.id, 'nom', left(core.drive_jour(i.survenu_le) || ' – ' || replace(i.titre, '/', '-'), 120)))
    else
      jsonb_build_array(
        jsonb_build_object('cle', 'batiments:racine', 'nom', 'Bâtiments'),
        jsonb_build_object('cle', coalesce('batiments:b:' || b.id, 'batiments:sans'), 'nom', coalesce(b.nom, 'Sans bâtiment')),
        case when p.id is not null
          then jsonb_build_object('cle', 'batiments:p:' || p.id, 'nom', 'Panneau ' || p.nom)
          else jsonb_build_object('cle', 'batiments:v:' || va.id, 'nom', left('Valve – ' || va.coupe, 120)) end)
    end,
    f.created_at
  from batiments.fichiers f
  left join batiments.panneaux p on p.id = f.panneau_id
  left join batiments.valves va on va.id = f.valve_id
  left join batiments.incidents i on i.id = f.incident_id
  left join batiments.batiments b on b.id = coalesce(p.batiment_id, va.batiment_id)
$$;

-- ------------------------------------------------------------
-- Droits et RLS
-- ------------------------------------------------------------
grant select, insert, update, delete on batiments.incidents to authenticated, service_role;
revoke execute on function batiments.creer_tache(uuid, text, text, uuid, smallint) from public, anon;
grant execute on function batiments.creer_tache(uuid, text, text, uuid, smallint) to authenticated, service_role;

alter table batiments.incidents enable row level security;

create policy "Lire" on batiments.incidents for select to authenticated using (core.peut_lire('batiments'));
create policy "Écrire" on batiments.incidents for all to authenticated
  using (core.peut_ecrire('batiments')) with check (core.peut_ecrire('batiments'));

alter publication supabase_realtime add table batiments.incidents;
