-- ============================================================
-- rh, phase 4 (plan-rh.md §14) : planification de la saison, diètes par
-- semaine, conformité, exports (Employeur D « Données d'emploi », ACQ, VAJ,
-- liste de la saison) et lien avec le référentiel Employés.
--
-- Remplace la feuille « Suivi RH 2026 » (grille, diètes) et les vues de
-- conformité d'Airtable (VAJ, premiers soins).
--
-- Décisions de Maxime (2026-10-15) : système de paie Employeur D, gabarit
-- « Données d'emploi » (canevas de septembre 2026) ; « CDJ » = camp de
-- jour ; fiche du référentiel créée ou reliée automatiquement à la
-- validation d'une embauche ; numéro de compagnie et matricule Employeur D
-- repris des Feuilles de temps (core.entreprises.numero_employeur_d,
-- core.employes.matricule_employeur_d, migration 20261015120202) : aucune
-- colonne en double.
-- ============================================================

-- ------------------------------------------------------------
-- Planification : codes, cases (embauche × date de la saison), pilotage
-- ------------------------------------------------------------

-- Codes des cases (« Anim », « Congé »…). `present` : compte comme présent
-- (diètes, « Tous présents ») ; `besoin` : compte face au besoin prévu
-- (« Présents », « Écart »). On retire un code en le désactivant.
create table rh.codes_planification (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = btrim(code) and code <> '' and char_length(code) <= 8),
  nom text not null check (btrim(nom) <> ''),
  couleur text not null default 'gris'
    check (couleur in ('vert','sarcelle','lime','violet','orange','bleu','brun','ciel','jaune','gris','rouge','rose')),
  present boolean not null default true,
  besoin boolean not null default false check (not besoin or present),
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_codes_planification_code on rh.codes_planification (lower(code));

create trigger trg_codes_planification_updated_at before update on rh.codes_planification
for each row execute function core.maj_updated_at();

-- Une case = une embauche × une date de sa saison. Case vide = pas de ligne.
create table rh.planification (
  embauche_id uuid not null references rh.embauches(id) on delete cascade,
  date_id uuid not null references rh.saisons_dates(id) on delete cascade,
  code_id uuid not null references rh.codes_planification(id) on delete restrict,
  note text check (note is null or btrim(note) <> ''),
  updated_at timestamptz not null default now(),
  updated_by_nom text,
  primary key (embauche_id, date_id)
);
create index idx_planification_date on rh.planification(date_id);

-- La date doit être de la saison de l'embauche ; auteur posé par la base.
create function rh.verifier_planification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from rh.embauches e join rh.saisons_dates d on d.saison_id = e.saison_id
     where e.id = new.embauche_id and d.id = new.date_id) then
    raise exception 'DATE_HORS_SAISON' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by_nom := rh.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_planification_verifier before insert or update on rh.planification
for each row execute function rh.verifier_planification();

-- Une embauche qui change de saison perd ses cases (dates de l'autre saison).
create function rh.embauche_change_saison()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from rh.planification where embauche_id = new.id;
  return null;
end;
$$;

create trigger trg_embauches_change_saison after update of saison_id on rh.embauches
for each row when (old.saison_id is distinct from new.saison_id)
execute function rh.embauche_change_saison();

-- Lignes de pilotage saisies, une par date : besoin prévu et réel de l'an
-- passé (présents et écart sont calculés par l'app).
create table rh.pilotage (
  date_id uuid primary key references rh.saisons_dates(id) on delete cascade,
  besoin integer check (besoin between 0 and 9999),
  reel_an_passe integer check (reel_an_passe between 0 and 9999),
  updated_at timestamptz not null default now(),
  updated_by_nom text
);

create trigger trg_pilotage_signer before insert or update on rh.pilotage
for each row execute function rh.signer_reglage();

-- ------------------------------------------------------------
-- Postes : certifications exigées et numéro de poste Employeur D
-- ------------------------------------------------------------
alter table rh.postes
  add column certifications text[] not null default '{}'
    check (certifications <@ array['premiers_soins','sauveteur']::text[]),
  add column poste_employeur_d text check (poste_employeur_d ~ '^[A-Za-z0-9]{1,8}$');
comment on column rh.postes.certifications is
  'Cartes exigées pour le poste (premiers_soins, sauveteur) : « manquante » dans la conformité';
comment on column rh.postes.poste_employeur_d is
  'Numéro du poste dans Employeur D (table des postes de la compagnie), 8 lettres ou chiffres au plus';

-- ------------------------------------------------------------
-- Embauches : date du dernier export vers Employeur D
-- ------------------------------------------------------------
alter table rh.embauches add column employeur_d_le timestamptz;
comment on column rh.embauches.employeur_d_le is
  'Dernier export vers Employeur D (« Données d''emploi »), posé par rh.export_employeur_d';

-- Consultations : un export Employeur D lit le NAS et le compte en clair.
alter table rh.consultations drop constraint consultations_quoi_check;
alter table rh.consultations add constraint consultations_quoi_check
  check (quoi in ('paie','specimen','export'));

-- Journal : lien avec le référentiel Employés.
alter table rh.journal drop constraint journal_genre_check;
alter table rh.journal add constraint journal_genre_check
  check (genre in ('candidature','statut','embauche','courriel','paie','dossier','document','fusion','import','referentiel'));

-- ------------------------------------------------------------
-- VAJ : chaque changement de la date va au journal (fiche ou lot).
-- ------------------------------------------------------------
create function rh.journal_personne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if new.vaj_le is distinct from old.vaj_le then
    perform rh.journaliser(new.id, null, null, 'dossier',
      case when new.vaj_le is null then 'VAJ effacée'
           else 'VAJ faite le ' || to_char(new.vaj_le, 'YYYY-MM-DD') end);
  end if;
  return null;
end;
$$;

create trigger trg_personnes_journal after update of vaj_le on rh.personnes
for each row execute function rh.journal_personne();

-- ------------------------------------------------------------
-- Lien avec le référentiel Employés (core.employes)
-- ------------------------------------------------------------

-- Le lien (personnes.employe_id) ne change que par les fonctions
-- ci-dessous (réglage de transaction rh.referentiel), par la direction
-- (fusion de deux fiches) ou sans session (imports).
create function rh.verifier_lien_employe()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_avant uuid;
begin
  if tg_op = 'UPDATE' then
    v_avant := old.employe_id;
  end if;
  if new.employe_id is distinct from v_avant
     and auth.uid() is not null
     and coalesce(current_setting('rh.referentiel', true), '') <> 'oui'
     and not core.est_direction() then
    raise exception 'Seule la direction relie une fiche au référentiel Employés.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_personnes_lien_employe before insert or update of employe_id on rh.personnes
for each row execute function rh.verifier_lien_employe();

-- Nom de camp libre dans le référentiel (core.employes.surnom est unique) :
-- le nom de camp, sinon le prénom ; « Prénom N. », « Prénom Nom », puis un chiffre.
create function rh.surnom_libre(p_surnom text, p_prenom text, p_nom text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(btrim(p_surnom), ''), btrim(p_prenom));
  v text;
  i integer := 2;
begin
  foreach v in array array[
    v_base,
    nullif(v_base || ' ' || left(btrim(coalesce(p_nom, '')), 1) || '.', v_base || ' .'),
    nullif(btrim(p_prenom || ' ' || coalesce(p_nom, '')), '')]
  loop
    if v is not null and not exists (select 1 from core.employes e where lower(e.surnom) = lower(v)) then
      return v;
    end if;
  end loop;
  loop
    v := v_base || ' ' || i;
    exit when not exists (select 1 from core.employes e where lower(e.surnom) = lower(v));
    i := i + 1;
  end loop;
  return v;
end;
$$;

-- Fiche du référentiel d'une personne (cœur de la validation et de
-- « Relier au référentiel ») :
--   - p_employe donné : cette fiche (jamais celle d'une autre personne) ;
--   - sinon (p_chercher) personnes.employe_id, puis la seule fiche au même
--     courriel, puis la seule au même prénom et nom de famille (fiches pas
--     déjà reliées) ;
--   - sinon une nouvelle fiche (nom de camp, prénom, nom, courriel, poste,
--     compagnie de p_embauche).
-- p_activer (validation) : la fiche est active et contient la compagnie de
-- l'embauche. Nom de famille, prénom et courriel posés s'ils manquent, jamais
-- écrasés. Une personne de la direction (compte admin ou direction au même
-- courriel) n'a pas de fiche créée d'office (décision des Feuilles de temps).
-- Rend la fiche, ou null si aucune.
create function rh.lier_referentiel(p_personne uuid, p_embauche uuid, p_employe uuid, p_chercher boolean, p_activer boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p rh.personnes;
  e rh.embauches;
  v_emp core.employes;
  v_id uuid;
  v_n integer;
  v_poste text;
  v_texte text;
  v_actif boolean;
begin
  select * into v_p from rh.personnes where id = p_personne for update;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  if p_embauche is not null then
    select * into e from rh.embauches where id = p_embauche;
  else
    -- Dernière embauche complète (compagnie et poste d'une nouvelle fiche).
    select x.* into e from rh.embauches x join rh.saisons s on s.id = x.saison_id
     where x.personne_id = p_personne and x.statut = 'complete'
     order by s.rang desc limit 1;
  end if;

  if p_employe is not null then
    v_id := p_employe;
    if exists (select 1 from rh.personnes x where x.employe_id = v_id and x.id <> p_personne) then
      raise exception 'DEJA_RELIEE';
    end if;
  elsif p_chercher then
    v_id := v_p.employe_id;
    if v_id is null and v_p.courriel is not null then
      select count(*), min(x.id::text)::uuid into v_n, v_id from core.employes x
       where lower(btrim(x.courriel)) = v_p.courriel
         and not exists (select 1 from rh.personnes y where y.employe_id = x.id);
      if v_n <> 1 then v_id := null; end if;
    end if;
    if v_id is null and v_p.nom_famille <> '' then
      select count(*), min(x.id::text)::uuid into v_n, v_id from core.employes x
       where lower(btrim(x.prenom)) = lower(v_p.prenom) and lower(btrim(x.nom_famille)) = lower(v_p.nom_famille)
         and not exists (select 1 from rh.personnes y where y.employe_id = x.id);
      if v_n <> 1 then v_id := null; end if;
    end if;
    if v_id is null and p_activer and exists (
      select 1 from core.profils pr where lower(pr.courriel) = v_p.courriel and pr.role in ('admin','direction')) then
      perform rh.journaliser(p_personne, null, p_embauche, 'referentiel',
        'Pas de fiche au référentiel Employés : compte de la direction (même courriel)');
      return null;
    end if;
  end if;

  if v_id is null then
    select p.nom into v_poste from rh.postes p where p.id = e.poste_id;
    -- Fiche active si l'embauche n'est pas terminée (ou à la validation).
    select p_activer or coalesce(e.fin, s.fin, make_date(s.annee, 12, 31)) >= current_date
      into v_actif from rh.saisons s where s.id = e.saison_id;
    insert into core.employes (surnom, prenom, nom_famille, courriel, poste, entreprise_ids, actif)
    values (rh.surnom_libre(v_p.surnom, v_p.prenom, nullif(v_p.nom_famille, '')),
            v_p.prenom, nullif(v_p.nom_famille, ''), v_p.courriel, v_poste,
            case when e.entreprise_id is null then '{}'::uuid[] else array[e.entreprise_id] end,
            coalesce(v_actif, true))
    returning * into v_emp;
    v_texte := 'Fiche du référentiel Employés créée : ' || v_emp.surnom;
  else
    select * into v_emp from core.employes where id = v_id for update;
    if not found then
      raise exception 'INTROUVABLE';
    end if;
    if p_activer and not v_emp.actif then
      v_texte := 'Fiche du référentiel Employés réactivée : ' || v_emp.surnom;
    end if;
    update core.employes x set
      prenom = coalesce(x.prenom, v_p.prenom),
      nom_famille = coalesce(x.nom_famille, nullif(v_p.nom_famille, '')),
      courriel = coalesce(nullif(btrim(x.courriel), ''), v_p.courriel),
      actif = x.actif or p_activer,
      entreprise_ids = case when p_activer and e.entreprise_id is not null and not e.entreprise_id = any (x.entreprise_ids)
                            then x.entreprise_ids || e.entreprise_id else x.entreprise_ids end
     where x.id = v_id
    returning * into v_emp;
    if v_p.employe_id is distinct from v_id then
      v_texte := 'Reliée à la fiche du référentiel Employés : ' || v_emp.surnom;
    end if;
  end if;

  if v_p.employe_id is distinct from v_emp.id then
    perform set_config('rh.referentiel', 'oui', true);
    update rh.personnes set employe_id = v_emp.id where id = p_personne;
    perform set_config('rh.referentiel', '', true);
  end if;
  if v_texte is not null then
    perform rh.journaliser(p_personne, null, p_embauche, 'referentiel', v_texte);
  end if;
  return v_emp.id;
end;
$$;
revoke execute on function rh.lier_referentiel(uuid, uuid, uuid, boolean, boolean), rh.surnom_libre(text, text, text)
  from public, anon, authenticated;

-- « Relier au référentiel » (onglet Personnes, fiche) : direction seulement.
-- p_employe = la fiche choisie, ou null pour en créer une.
create function rh.relier_employe(p_personne uuid, p_employe uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (core.peut_ecrire('rh') and core.est_direction()) then
    raise exception 'ACCES_REFUSE';
  end if;
  return rh.lier_referentiel(p_personne, null, p_employe, false, false);
end;
$$;

-- Délier (la fiche du référentiel reste telle quelle).
create function rh.delier_employe(p_personne uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surnom text;
begin
  if not (core.peut_ecrire('rh') and core.est_direction()) then
    raise exception 'ACCES_REFUSE';
  end if;
  select e.surnom into v_surnom from rh.personnes p join core.employes e on e.id = p.employe_id where p.id = p_personne;
  if v_surnom is null then
    return;
  end if;
  perform set_config('rh.referentiel', 'oui', true);
  update rh.personnes set employe_id = null where id = p_personne;
  perform set_config('rh.referentiel', '', true);
  perform rh.journaliser(p_personne, null, null, 'referentiel', 'Déliée de la fiche du référentiel Employés : ' || v_surnom);
end;
$$;

-- Valider : comme en phase 3 (paie, contrat, consentement), puis la
-- personne est reliée au référentiel Employés (fiche créée au besoin).
create or replace function rh.valider_embauche(p_embauche uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e rh.embauches;
  v_s rh.saisons;
  v_p rh.personnes;
  v_paie rh.paie;
  v_manque text[] := '{}';
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into e from rh.embauches where id = p_embauche for update;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  if e.statut in ('complete','annulee') then
    raise exception 'FERME';
  end if;
  select * into v_s from rh.saisons where id = e.saison_id;
  select * into v_p from rh.personnes where id = e.personne_id;
  if e.entreprise_id is null then v_manque := array_append(v_manque, 'compagnie'); end if;
  if e.genre = 'emploi' then
    select * into v_paie from rh.paie where personne_id = e.personne_id;
    if e.poste_id is null then v_manque := array_append(v_manque, 'poste'); end if;
    if e.remuneration is null then v_manque := array_append(v_manque, 'remuneration'); end if;
    if e.taux is null then v_manque := array_append(v_manque, 'taux'); end if;
    if e.vacances is null then v_manque := array_append(v_manque, 'vacances'); end if;
    if e.type_employe is null then v_manque := array_append(v_manque, 'type_employe'); end if;
    if e.action_paie is null then v_manque := array_append(v_manque, 'action_paie'); end if;
    if e.date_embauche is null then v_manque := array_append(v_manque, 'date_embauche'); end if;
    if v_paie.nas is null then v_manque := array_append(v_manque, 'nas'); end if;
    if v_paie.compte is null then v_manque := array_append(v_manque, 'compte'); end if;
    if not exists (select 1 from rh.contrats c where c.embauche_id = e.id and c.genre = 'contrat' and c.statut = 'signe') then
      v_manque := array_append(v_manque, 'contrat');
    end if;
  end if;
  if v_p.date_naissance is not null
     and rh.age_a(v_p.date_naissance, coalesce(e.debut, v_s.debut, current_date)) < 18
     and not exists (select 1 from rh.contrats c where c.embauche_id = e.id and c.genre = 'consentement' and c.statut = 'signe') then
    v_manque := array_append(v_manque, 'consentement');
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'CHAMPS_MANQUANTS:%', array_to_string(v_manque, ',');
  end if;
  update rh.embauches set statut = 'complete' where id = e.id;
  perform rh.lier_referentiel(e.personne_id, e.id, null, true, true);
end;
$$;

-- ------------------------------------------------------------
-- Export Employeur D : NAS, transit, institution et compte en clair des
-- embauches complètes de genre emploi demandées. Seul endroit (avec
-- rh.lire_paie) où l'app les lit en clair : accès rh_paie, chaque
-- personne notée dans les consultations (« export ») et au journal ; la
-- date de l'export est gardée sur l'embauche. Rien n'est gardé par l'app.
-- ------------------------------------------------------------
create function rh.export_employeur_d(p_embauches uuid[])
returns table (embauche_id uuid, personne_id uuid, nas text, transit text, institution text, compte text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
begin
  if not core.peut_lire('rh_paie') then
    raise exception 'ACCES_REFUSE';
  end if;
  for r in
    select e.id, e.personne_id, s.nom as saison
      from rh.embauches e join rh.saisons s on s.id = e.saison_id
     where e.id = any (p_embauches) and e.statut = 'complete' and e.genre = 'emploi'
  loop
    insert into rh.consultations (personne_id, quoi, par, par_nom)
    select r.personne_id, 'export', auth.uid(), rh.nom_de(auth.uid())
     where not exists (
       select 1 from rh.consultations c
        where c.personne_id = r.personne_id and c.quoi = 'export' and c.par is not distinct from auth.uid()
          and c.le = now());
    update rh.embauches set employeur_d_le = now() where id = r.id;
    perform rh.journaliser(r.personne_id, null, r.id, 'paie', 'Exportée vers Employeur D (' || r.saison || ')');
  end loop;
  return query
    select e.id, e.personne_id, rh.dechiffrer(p.nas), p.transit, p.institution, rh.dechiffrer(p.compte)
      from rh.embauches e left join rh.paie p on p.personne_id = e.personne_id
     where e.id = any (p_embauches) and e.statut = 'complete' and e.genre = 'emploi';
end;
$$;

revoke execute on function
  rh.relier_employe(uuid, uuid), rh.delier_employe(uuid), rh.export_employeur_d(uuid[])
from public, anon;
grant execute on function
  rh.relier_employe(uuid, uuid), rh.delier_employe(uuid), rh.export_employeur_d(uuid[])
to authenticated;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant select, insert, update, delete on rh.codes_planification, rh.planification, rh.pilotage to authenticated;
grant all on rh.codes_planification, rh.planification, rh.pilotage to service_role;

alter table rh.codes_planification enable row level security;
alter table rh.planification enable row level security;
alter table rh.pilotage enable row level security;

create policy "Lire codes" on rh.codes_planification for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire codes" on rh.codes_planification for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire planification" on rh.planification for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire planification" on rh.planification for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire pilotage" on rh.pilotage for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire pilotage" on rh.pilotage for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));

-- ============================================================
-- Données de départ
-- ============================================================

-- Codes de la feuille « Suivi RH 2026 » (docs/rh-existant.md §7.1).
-- CDJ (camp de jour) : présent, mais pas compté face au besoin du camp de
-- vacances (choix de Claude, à confirmer).
insert into rh.codes_planification (code, nom, couleur, present, besoin, ordre) values
  ('Anim', 'Anim (avec un groupe)', 'vert', true, true, 1),
  ('Remp', 'Remplaçant', 'sarcelle', true, true, 2),
  ('CDJ', 'Camp de jour', 'lime', true, false, 3),
  ('Gest', 'Gestion', 'violet', true, false, 4),
  ('Cuis', 'Cuisine', 'orange', true, false, 5),
  ('Spéc', 'Spécialiste', 'bleu', true, false, 6),
  ('Lout', 'Loutre', 'brun', true, false, 7),
  ('Sauv', 'Sauveteur', 'ciel', true, false, 8),
  ('Oui', 'Oui (présent)', 'vert', true, false, 9),
  ('Congé', 'Congé', 'jaune', false, false, 10),
  ('Non', 'Non', 'gris', false, false, 11),
  ('n/a', 'Non applicable', 'gris', false, false, 12),
  ('Coupé', 'Coupé', 'rouge', false, false, 13);

-- Réglages : validité d'une VAJ (ans) et valeurs par défaut de l'export
-- Employeur D (à confirmer avec Charlotte). Titre d'emploi : aucun par
-- défaut (obligatoire à l'ajout ; à régler avant le premier export).
insert into rh.reglages (cle, valeur) values
  ('vaj_validite_ans', '3'),
  ('employeur_d', jsonb_build_object(
    'taux_ae', '1',
    'statut', '1',
    'titre_emploi', null,
    'regroupement', '999',
    'classe_cp', '7777',
    'province_paie', 'QUE',
    'type_remuneration', 'REM',
    'affichage', '001',
    'heures_paie', 80,
    'heures_semaine', 40,
    'type_depot', '1',
    'mode_paiement', '2',
    'base_federal', '1',
    'base_provincial', 'A',
    'dentaire', '1',
    'nationalite', '1',
    'fumeur', 'N',
    'impression_massive', 'N'))
on conflict (cle) do nothing;
