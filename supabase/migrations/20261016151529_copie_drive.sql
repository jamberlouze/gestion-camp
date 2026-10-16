-- Copie des documents de l'app vers les Drive partagés (demande de Maxime,
-- 2026-10-16 : « tout centralisé sur l'app, mais garder une copie sur le
-- Drive automatiquement »). L'app reste la référence ; la copie va
-- seulement de l'app vers le Drive, et rien n'y est jamais effacé (un
-- document retiré de l'app garde sa copie).
--
-- Le Worker (worker/drive/copie.js), à chaque passage du cron, demande à
-- core.drive_a_copier les documents pas encore copiés des modules actifs,
-- range chacun dans son dossier (trouvé par son nom ou créé) et note le
-- résultat avec core.drive_noter. Chaque module dit où vont ses documents
-- par sa fonction <module>.drive_documents() (Réservations : migration à
-- part, publiée avec le module). Photos décoratives jamais copiées
-- (photo d'un véhicule, des Travaux, de la Vigie, portrait d'un employé).

-- ------------------------------------------------------------
-- Réglages : un dossier racine par module (identifiant Google Drive)
-- ------------------------------------------------------------
create table core.drive_reglages (
  module text primary key check (module in ('vehicules', 'batiments', 'reservations', 'rh')),
  actif boolean not null default false,
  dossier text check (dossier is null or btrim(dossier) <> ''),
  updated_at timestamptz not null default now()
);

-- Une ligne par document tenté : copié (drive_id) ou en erreur (réessayé
-- de plus en plus tard : 15 min × 2^essais, au plus ~16 h).
create table core.drive_copies (
  module text not null,
  document_id uuid not null,
  drive_id text,
  copie_le timestamptz,
  essais integer not null default 0,
  erreur text,
  essai_le timestamptz,
  primary key (module, document_id)
);

-- Dossiers déjà trouvés ou créés dans le Drive : clé stable (« vehicules:<id> »,
-- « reservations:ex:2027 »…) → identifiant. Un dossier renommé dans l'app
-- garde son dossier du Drive.
create table core.drive_dossiers (
  cle text primary key,
  drive_id text not null,
  nom text not null,
  cree_le timestamptz not null default now()
);

alter table core.drive_reglages enable row level security;
alter table core.drive_copies enable row level security;
alter table core.drive_dossiers enable row level security;

-- Lecture pour les admins seulement ; écriture par le Worker (clé secrète).
create policy "Admins : lire les réglages de la copie Drive" on core.drive_reglages
  for select to authenticated using (core.est_admin());
create policy "Admins : lire les copies Drive" on core.drive_copies
  for select to authenticated using (core.est_admin());
create policy "Admins : lire les dossiers Drive" on core.drive_dossiers
  for select to authenticated using (core.est_admin());

revoke all on core.drive_reglages, core.drive_copies, core.drive_dossiers from anon;
revoke insert, update, delete on core.drive_reglages, core.drive_copies, core.drive_dossiers from authenticated;
grant select on core.drive_reglages, core.drive_copies, core.drive_dossiers to authenticated;
grant all on core.drive_reglages, core.drive_copies, core.drive_dossiers to service_role;

-- ------------------------------------------------------------
-- Petits outils de nommage
-- ------------------------------------------------------------

-- Jour de Montréal (« 2026-10-16 »).
create or replace function core.drive_jour(p_moment timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_moment at time zone 'America/Montreal', 'YYYY-MM-DD')
$$;

-- Nom de fichier : sans barre oblique, 180 caractères au plus, avec une
-- extension si le nom n'en a pas : celle du type (p_type, connu pour RH),
-- sinon celle du fichier rangé (« .pdf », « .jpg »). Des CV importés
-- d'Airtable ont un chemin en « .curri » : le type dit « .docx ».
create or replace function core.drive_nom(p_base text, p_chemin text, p_type text default null)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.b ~ '\.[A-Za-z0-9]{1,5}$' then x.b else x.b || x.e end
  from (
    select left(btrim(replace(coalesce(p_base, 'Document'), '/', '-')), 180) as b,
           coalesce(
             case lower(p_type)
               when 'application/pdf' then '.pdf'
               when 'image/jpeg' then '.jpg'
               when 'image/png' then '.png'
               when 'image/webp' then '.webp'
               when 'image/heic' then '.heic'
               when 'application/msword' then '.doc'
               when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx'
             end,
             lower(substring(p_chemin from '(\.[A-Za-z0-9]{1,5})$')),
             '') as e
  ) x
$$;

-- ------------------------------------------------------------
-- Ce que chaque module copie, et où
-- ------------------------------------------------------------
-- Chaque fonction rend : document, seau et chemin du fichier, nom dans le
-- Drive, dossiers sous la racine du module ([{cle, nom}], du haut vers le
-- bas) et date d'ajout (les plus vieux partent d'abord).

-- Véhicules : Opérations › Véhicules › <dossier du véhicule, existant du même
-- nom ou créé> › <rubrique>. Remorques : sous « Remorques ».
create or replace function vehicules.drive_documents()
returns table (document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, cree_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, 'vehicules-documents', d.chemin,
    core.drive_nom(coalesce(nullif(btrim(d.nom), ''), r.fichier || ' ' || core.drive_jour(d.created_at)), d.chemin),
    case when v.type = 'remorque'
      then jsonb_build_array(jsonb_build_object('cle', 'vehicules:remorques', 'nom', 'Remorques'))
      else '[]'::jsonb end
    || jsonb_build_array(
      jsonb_build_object('cle', 'vehicules:' || v.id, 'nom', v.surnom),
      jsonb_build_object('cle', 'vehicules:' || v.id || ':' || d.categorie, 'nom', r.dossier)),
    d.created_at
  from vehicules.documents d
  join vehicules.vehicules v on v.id = d.vehicule_id
  cross join lateral (
    select case d.categorie
             when 'immatriculation' then 'Immatriculation'
             when 'assurance' then 'Assurance'
             when 'inspection' then 'Inspections'
             else 'Autres documents' end as dossier,
           case d.categorie
             when 'immatriculation' then 'Immatriculation'
             when 'assurance' then 'Assurance'
             when 'inspection' then 'Inspection'
             else 'Document' end as fichier
  ) r
$$;

-- Bâtiments : Terrain et bâtiment › Bâtiments › <bâtiment> › <panneau ou valve>.
create or replace function batiments.drive_documents()
returns table (document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, cree_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, 'batiments-fichiers', f.chemin,
    core.drive_nom(coalesce(nullif(btrim(f.nom), ''), 'Photo ' || core.drive_jour(f.created_at)), f.chemin),
    jsonb_build_array(
      jsonb_build_object('cle', 'batiments:racine', 'nom', 'Bâtiments'),
      jsonb_build_object('cle', coalesce('batiments:b:' || b.id, 'batiments:sans'), 'nom', coalesce(b.nom, 'Sans bâtiment')),
      case when p.id is not null
        then jsonb_build_object('cle', 'batiments:p:' || p.id, 'nom', 'Panneau ' || p.nom)
        else jsonb_build_object('cle', 'batiments:v:' || va.id, 'nom', left('Valve – ' || va.coupe, 120)) end),
    f.created_at
  from batiments.fichiers f
  left join batiments.panneaux p on p.id = f.panneau_id
  left join batiments.valves va on va.id = f.valve_id
  left join batiments.batiments b on b.id = coalesce(p.batiment_id, va.batiment_id)
$$;

-- RH : Ressources humaines › Dossiers d'employés (copies de l'app) › <Nom, Prénom>.
-- Le portrait (genre « photo ») n'est pas copié.
create or replace function rh.drive_documents()
returns table (document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, cree_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, 'rh-documents', d.chemin,
    core.drive_nom(coalesce(nullif(btrim(d.nom), ''), g.libelle || ' ' || core.drive_jour(d.created_at)), d.chemin, d.type_mime),
    jsonb_build_array(
      jsonb_build_object('cle', 'rh:racine', 'nom', 'Dossiers d''employés (copies de l''app)'),
      jsonb_build_object('cle', 'rh:p:' || p.id, 'nom', p.nom_complet)),
    d.created_at
  from rh.documents d
  join rh.personnes p on p.id = d.personne_id
  cross join lateral (
    select case d.genre
             when 'cv' then 'CV'
             when 'contrat' then 'Contrat'
             when 'consentement_parental' then 'Consentement parental'
             when 'premiers_soins' then 'Premiers soins'
             when 'sauveteur' then 'Carte de sauveteur'
             when 'piece_identite' then 'Pièce d''identité'
             else 'Document' end as libelle
  ) g
  where d.genre <> 'photo'
$$;

-- ------------------------------------------------------------
-- Pour le Worker (clé secrète seulement)
-- ------------------------------------------------------------

-- Documents à copier des modules actifs : au plus p_limite par module, pas
-- encore copiés, et pas réessayés trop tôt après une erreur. Le premier
-- dossier de chaque ligne est la racine du module (« id » connu).
create or replace function core.drive_a_copier(p_limite integer default 3)
returns table (module text, document_id uuid, seau text, chemin text, nom_fichier text, dossiers jsonb, essais integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select g.module as nom, btrim(g.dossier) as dossier
    from core.drive_reglages g
    where g.actif and g.dossier is not null
    order by g.module
  loop
    -- Module pas encore en place dans cette base (ex. Réservations) : rien.
    if to_regprocedure(format('%I.drive_documents()', r.nom)) is null then
      continue;
    end if;
    return query execute format(
      'select %1$L::text, d.document_id, d.seau, d.chemin, d.nom_fichier,
              jsonb_build_array(jsonb_build_object(''cle'', %2$L, ''id'', %3$L)) || d.dossiers,
              coalesce(c.essais, 0)
         from %1$I.drive_documents() d
         left join core.drive_copies c on c.module = %1$L and c.document_id = d.document_id
        where c.copie_le is null
          and (c.essai_le is null
               or c.essai_le < now() - make_interval(mins => 15 * (2 ^ least(c.essais, 6))::integer))
        order by d.cree_le
        limit %4$s',
      r.nom, 'racine:' || r.nom, r.dossier, greatest(coalesce(p_limite, 3), 0));
  end loop;
end
$$;

-- Résultat d'un essai : copié (p_drive_id) ou erreur (p_erreur).
create or replace function core.drive_noter(p_module text, p_document uuid, p_drive_id text, p_erreur text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into core.drive_copies as c (module, document_id, drive_id, copie_le, essais, erreur, essai_le)
  values (p_module, p_document, p_drive_id, case when p_drive_id is not null then now() end, 1,
          left(p_erreur, 500), now())
  on conflict (module, document_id) do update set
    drive_id = coalesce(excluded.drive_id, c.drive_id),
    copie_le = coalesce(excluded.copie_le, c.copie_le),
    essais = c.essais + 1,
    erreur = excluded.erreur,
    essai_le = now()
$$;

revoke all on function
  vehicules.drive_documents(), batiments.drive_documents(), rh.drive_documents(),
  core.drive_a_copier(integer), core.drive_noter(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  vehicules.drive_documents(), batiments.drive_documents(), rh.drive_documents(),
  core.drive_a_copier(integer), core.drive_noter(text, uuid, text, text)
  to service_role;

-- ------------------------------------------------------------
-- Emplacements choisis par Maxime (2026-10-16)
-- ------------------------------------------------------------
-- Véhicules : Drive « LÜTRA » › Opérations › Véhicules.
-- Bâtiments : Drive de la BPA › Opérations › Terrain et bâtiment.
-- Réservations : Drive de la BPA › Opérations › 2 - Accueil de groupe
--   (actif à la bascule des Réservations).
-- RH : Ressources humaines (ses gestionnaires voient les copies : accepté).
insert into core.drive_reglages (module, actif, dossier) values
  ('vehicules', true, '1FNxIaZxPcxx3DMnToNvLn7yN4DMcuAoA'),
  ('batiments', true, '19s98hzQ0MEmrBKQ73Chahj8duu-QsUZA'),
  ('reservations', false, '1alUVfXwD6PGWKklGylY2ZWR45M83jGa-'),
  ('rh', true, '17uRv0i8pbY78PHlVGX0kVckvmUO6-Hcr');

-- Dossiers de véhicules existants qui ne portent pas le nom de l'app.
insert into core.drive_dossiers (cle, drive_id, nom)
select 'vehicules:' || v.id, m.dossier, m.nom
from vehicules.vehicules v
join (values
  ('spécial', '1F5O19903uSfwbHRRYx2xLUQ3Q5v9h5OV', 'Minotour SPÉCIAL'),
  ('teryx noir', '1J8NzlwzUn71W12eWummGPNDoze4DIgbK', 'Tyrex Noir')
) as m (surnom, dossier, nom) on lower(btrim(v.surnom)) = m.surnom
on conflict (cle) do nothing;
