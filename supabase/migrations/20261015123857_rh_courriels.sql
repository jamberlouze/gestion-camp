-- ============================================================
-- rh, phase 3 (1/2) : courriels (plan-rh.md §5).
--
-- Décisions de Maxime (2026-10-15) : chaque compagnie envoie de SA boîte
-- (inscriptions@camptremblant.com, messages@opikawa.com, info@rougediable.ca,
-- info@aquabounga.ca, info@trembloc.ca), modifiable dans l'app avec l'état
-- de la connexion ; accusé de réception automatique au candidat + résumé
-- quotidien à la direction ; rappel de dossier préparé après 7 jours,
-- envoyé sur approbation.
--
-- Choisir un statut PRÉPARE le courriel (app) ; on le relit, le corrige,
-- puis il part d'un clic par le Worker (/api/rh/envoyer), seul à pouvoir
-- envoyer : jeton Gmail de la boîte (chiffré ici, jamais lisible par l'app)
-- en PROD, Mailpit en DEV.
-- ============================================================

-- ------------------------------------------------------------
-- Réglages RH par compagnie : boîte d'envoi, signature des courriels,
-- prise de rendez-vous ; coordonnées inscrites dans les contrats.
-- ------------------------------------------------------------
create table rh.compagnies (
  entreprise_id uuid primary key references core.entreprises(id) on delete cascade,
  adresse_envoi text check (adresse_envoi is null or adresse_envoi ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nom_expediteur text,
  -- Bloc sous le nom dans les courriels (une ligne par ligne)
  signature text,
  lien_rendez_vous text,
  -- « notre camp de vacances » : ce qui a retenu l'attention du candidat
  attrait text,
  -- Contrats
  raison_sociale text,
  nom_court text,
  adresse text,
  telephone text,
  updated_at timestamptz not null default now(),
  updated_by_nom text
);

-- Boîte Gmail autorisée par compagnie : jeton d'actualisation chiffré
-- (rh.chiffrer). Aucun droit pour l'app : état par rh.etat_boites().
create table rh.connexions_gmail (
  entreprise_id uuid primary key references core.entreprises(id) on delete cascade,
  adresse text not null,
  jeton bytea not null,
  connecte_le timestamptz not null default now(),
  connecte_par_nom text,
  dernier_envoi_le timestamptz,
  erreur text,
  erreur_le timestamptz
);

-- Réglages du module (clé → valeur JSON).
create table rh.reglages (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_nom text
);

-- ------------------------------------------------------------
-- Modèles de courriels : un par genre, toutes compagnies (entreprise_id
-- null), ou propre à une compagnie (l'emporte). Version anglaise pour un
-- candidat qui a postulé en anglais. Le mode du modèle commun vaut pour
-- le genre.
-- ------------------------------------------------------------
create table rh.modeles_courriels (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('accuse','entrevue','refus_entrevue','refus_equipe','aspi','permis','bienvenue','rappel_dossier','retour','resume')),
  entreprise_id uuid references core.entreprises(id) on delete cascade,
  sujet text not null check (btrim(sujet) <> ''),
  corps text not null,
  sujet_en text,
  corps_en text,
  mode text not null default 'approuver' check (mode in ('approuver','automatique','desactive')),
  updated_at timestamptz not null default now(),
  updated_by_nom text
);
create unique index idx_modeles_courriels_genre on rh.modeles_courriels (genre, coalesce(entreprise_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ------------------------------------------------------------
-- Courriels : préparés (par l'app ou le Worker), corrigés, envoyés par le
-- Worker seulement. `cle` : jamais préparé deux fois (accusé, rappel,
-- invitation, résumé du jour).
-- ------------------------------------------------------------
create table rh.courriels (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('accuse','entrevue','refus_entrevue','refus_equipe','aspi','permis','bienvenue','rappel_dossier','retour','resume','autre')),
  cle text unique,
  personne_id uuid references rh.personnes(id) on delete cascade,
  candidature_id uuid references rh.candidatures(id) on delete set null,
  embauche_id uuid references rh.embauches(id) on delete set null,
  invitation_id uuid references rh.invitations(id) on delete set null,
  -- Boîte d'envoi (compagnie)
  entreprise_id uuid references core.entreprises(id) on delete set null,
  a text[] not null default '{}',
  sujet text not null,
  corps text not null,
  langue text not null default 'fr' check (langue in ('fr','en')),
  statut text not null default 'prepare' check (statut in ('prepare','envoye','annule')),
  erreur text,
  cree_le timestamptz not null default now(),
  cree_par_nom text,
  envoye_le timestamptz,
  envoye_par_nom text,
  message_id text,
  annule_le timestamptz,
  raison text
);
create index idx_courriels_personne on rh.courriels(personne_id);
create index idx_courriels_statut on rh.courriels(statut);

-- L'app ne fait que préparer, corriger ou annuler un courriel préparé ;
-- l'envoi passe par rh.courriel_envoye (Worker), qui pose le réglage de
-- transaction rh.envoi (jamais une session de l'app).
create function rh.verifier_courriel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or current_setting('rh.envoi', true) = 'oui' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.statut <> 'prepare' then
      raise exception 'COURRIEL_PREPARE_SEULEMENT';
    end if;
    new.envoye_le := null;
    new.envoye_par_nom := null;
    new.message_id := null;
    new.cree_par_nom := rh.nom_de(auth.uid());
    return new;
  end if;
  if old.statut <> 'prepare' then
    raise exception 'COURRIEL_DEJA_TRAITE';
  end if;
  if new.statut not in ('prepare','annule') then
    raise exception 'COURRIEL_ENVOI_WORKER';
  end if;
  if new.statut = 'annule' then
    new.annule_le := now();
  end if;
  new.envoye_le := old.envoye_le;
  new.envoye_par_nom := old.envoye_par_nom;
  new.message_id := old.message_id;
  new.cle := old.cle;
  return new;
end;
$$;

create trigger trg_courriels_verifier before insert or update on rh.courriels
for each row execute function rh.verifier_courriel();

create function rh.signer_reglage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by_nom := rh.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_compagnies_signer before insert or update on rh.compagnies
for each row execute function rh.signer_reglage();
create trigger trg_reglages_signer before insert or update on rh.reglages
for each row execute function rh.signer_reglage();
create trigger trg_modeles_courriels_signer before insert or update on rh.modeles_courriels
for each row execute function rh.signer_reglage();

-- ------------------------------------------------------------
-- Fonctions
-- ------------------------------------------------------------

-- Session du Worker : la personne connectée écrit-elle dans RH ?
create function rh.peut_envoyer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', core.peut_ecrire('rh'), 'nom', rh.nom_de(auth.uid()), 'courriel', (select courriel from core.profils where id = auth.uid()))
$$;

-- État des boîtes d'envoi, par compagnie (sans jamais le jeton).
create function rh.etat_boites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.peut_lire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'entreprise_id', e.id,
      'adresse_envoi', c.adresse_envoi,
      'adresse_connectee', g.adresse,
      'etat', case
        when g.entreprise_id is null then 'non_connectee'
        when lower(g.adresse) <> lower(coalesce(c.adresse_envoi, '')) then 'a_reconnecter'
        when g.erreur is not null then 'erreur'
        else 'connectee' end,
      'connecte_le', g.connecte_le,
      'connecte_par_nom', g.connecte_par_nom,
      'dernier_envoi_le', g.dernier_envoi_le,
      'erreur', g.erreur,
      'erreur_le', g.erreur_le) order by e.ordre)
    from core.entreprises e
    left join rh.compagnies c on c.entreprise_id = e.id
    left join rh.connexions_gmail g on g.entreprise_id = e.id
    where e.actif or c.entreprise_id is not null), '[]');
end;
$$;

create function rh.deconnecter_boite(p_entreprise uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.peut_ecrire('rh') then
    raise exception 'ACCES_REFUSE';
  end if;
  delete from rh.connexions_gmail where entreprise_id = p_entreprise;
end;
$$;

-- Worker : boîte autorisée par Google (adresse vérifiée par le Worker).
create function rh.enregistrer_boite(p_entreprise uuid, p_adresse text, p_jeton text, p_par text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into rh.connexions_gmail (entreprise_id, adresse, jeton, connecte_le, connecte_par_nom)
  values (p_entreprise, lower(btrim(p_adresse)), rh.chiffrer(p_jeton), now(), p_par)
  on conflict (entreprise_id) do update
    set adresse = excluded.adresse, jeton = excluded.jeton, connecte_le = now(),
        connecte_par_nom = excluded.connecte_par_nom, erreur = null, erreur_le = null;
$$;

-- Worker : jeton en clair d'une boîte, pour envoyer.
create function rh.jeton_boite(p_entreprise uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('adresse', g.adresse, 'jeton', rh.dechiffrer(g.jeton), 'adresse_envoi', c.adresse_envoi)
  from rh.connexions_gmail g left join rh.compagnies c on c.entreprise_id = g.entreprise_id
  where g.entreprise_id = p_entreprise
$$;

-- Worker : résultat d'un envoi par une boîte (null = réussi).
create function rh.noter_boite(p_entreprise uuid, p_erreur text)
returns void
language sql
security definer
set search_path = ''
as $$
  update rh.connexions_gmail
     set dernier_envoi_le = case when p_erreur is null then now() else dernier_envoi_le end,
         erreur = left(p_erreur, 500),
         erreur_le = case when p_erreur is null then null else now() end
   where entreprise_id = p_entreprise
$$;

-- Worker : courriels préparés (accusé, rappel, résumé), sans doublon (cle).
create function rh.courriels_ajouter(p_courriels jsonb)
returns setof rh.courriels
language sql
security definer
set search_path = ''
as $$
  insert into rh.courriels (genre, cle, personne_id, candidature_id, embauche_id, invitation_id, entreprise_id, a, sujet, corps, langue, cree_par_nom, erreur)
  select x.genre, x.cle, x.personne_id, x.candidature_id, x.embauche_id, x.invitation_id, x.entreprise_id,
         coalesce(x.a, '{}'), x.sujet, x.corps, coalesce(x.langue, 'fr'), coalesce(x.cree_par_nom, 'Envoi automatique'), x.erreur
  from jsonb_to_recordset(p_courriels) as x(genre text, cle text, personne_id uuid, candidature_id uuid, embauche_id uuid,
       invitation_id uuid, entreprise_id uuid, a text[], sujet text, corps text, langue text, cree_par_nom text, erreur text)
  on conflict (cle) do nothing
  returning *
$$;

-- Worker : courriel parti. Journal ; un courriel de bienvenue fait passer
-- l'embauche « Dossier à envoyer » à « Lien envoyé ».
create function rh.courriel_envoye(p_courriel uuid, p_message_id text, p_par text, p_mailpit boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c rh.courriels;
begin
  perform set_config('rh.envoi', 'oui', true);
  update rh.courriels
     set statut = 'envoye', envoye_le = now(), envoye_par_nom = p_par, message_id = p_message_id, erreur = null
   where id = p_courriel and statut = 'prepare'
  returning * into c;
  if c.id is null then
    raise exception 'COURRIEL_DEJA_TRAITE';
  end if;
  if c.personne_id is not null then
    perform rh.journal_public(c.personne_id, c.candidature_id, c.embauche_id, 'courriel',
      'Courriel « ' || c.sujet || ' » envoyé à ' || array_to_string(c.a, ', ') || case when p_mailpit then ' (DEV : Mailpit)' else '' end,
      p_par);
  end if;
  if c.genre = 'bienvenue' and c.embauche_id is not null then
    update rh.embauches set statut = 'envoyee' where id = c.embauche_id and statut = 'a_envoyer';
  end if;
end;
$$;

-- Worker : embauches dont le lien du dossier est parti il y a au moins
-- p_jours jours sans dossier reçu (rappel à préparer), depuis p_depuis.
create function rh.rappels_dus(p_jours integer, p_depuis date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'embauche_id', e.id, 'personne_id', e.personne_id, 'candidature_id', e.candidature_id,
    'entreprise_id', e.entreprise_id, 'jeton', e.jeton, 'saison', s.nom, 'poste', p.nom,
    'prenom', x.prenom, 'nom_famille', x.nom_famille, 'surnom', x.surnom, 'courriel', x.courriel)), '[]')
  from rh.embauches e
  join rh.personnes x on x.id = e.personne_id
  join rh.saisons s on s.id = e.saison_id
  left join rh.postes p on p.id = e.poste_id
  where e.statut = 'envoyee' and e.jeton is not null and e.dossier_recu_le is null
    and x.courriel is not null
    -- Le lien est parti : courriel de bienvenue envoyé, ou « Marquer comme envoyé » (journal).
    and coalesce(
          (select max(c.envoye_le) from rh.courriels c where c.embauche_id = e.id and c.genre = 'bienvenue' and c.statut = 'envoye'),
          (select max(j.le) from rh.journal j where j.embauche_id = e.id and j.texte like '%→ Lien envoyé%')
        ) <= now() - make_interval(days => p_jours)
    and coalesce(
          (select max(c.envoye_le) from rh.courriels c where c.embauche_id = e.id and c.genre = 'bienvenue' and c.statut = 'envoye'),
          (select max(j.le) from rh.journal j where j.embauche_id = e.id and j.texte like '%→ Lien envoyé%')
        ) >= p_depuis
$$;

-- Worker : nouveautés depuis le dernier résumé (candidatures du formulaire,
-- intentions de retour, dossiers d'embauche reçus).
create function rh.nouveautes(p_depuis timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'candidatures', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'id', c.id) order by c.recue_le)
      from rh.candidatures c join rh.personnes p on p.id = c.personne_id
      where c.source = 'formulaire' and c.recue_le > p_depuis), '[]'),
    'retours', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'reponse', i.reponse, 'saison', s.nom) order by i.repondu_le)
      from rh.invitations i join rh.personnes p on p.id = i.personne_id join rh.saisons s on s.id = i.saison_id
      where i.repondu_le > p_depuis), '[]'),
    'dossiers', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'saison', s.nom, 'id', p.id) order by e.dossier_recu_le)
      from rh.embauches e join rh.personnes p on p.id = e.personne_id join rh.saisons s on s.id = e.saison_id
      where e.dossier_recu_le > p_depuis), '[]'))
$$;

revoke execute on function
  rh.enregistrer_boite(uuid, text, text, text), rh.jeton_boite(uuid), rh.noter_boite(uuid, text),
  rh.courriels_ajouter(jsonb), rh.courriel_envoye(uuid, text, text, boolean),
  rh.rappels_dus(integer, date), rh.nouveautes(timestamptz)
from public, anon, authenticated;
grant execute on function
  rh.enregistrer_boite(uuid, text, text, text), rh.jeton_boite(uuid), rh.noter_boite(uuid, text),
  rh.courriels_ajouter(jsonb), rh.courriel_envoye(uuid, text, text, boolean),
  rh.rappels_dus(integer, date), rh.nouveautes(timestamptz)
to service_role;

revoke execute on function rh.etat_boites(), rh.deconnecter_boite(uuid), rh.peut_envoyer() from public, anon;
grant execute on function rh.etat_boites(), rh.deconnecter_boite(uuid), rh.peut_envoyer() to authenticated;

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant select, insert, update, delete on rh.compagnies, rh.reglages, rh.modeles_courriels to authenticated;
grant select, insert, update on rh.courriels to authenticated;
grant all on rh.compagnies, rh.reglages, rh.modeles_courriels, rh.courriels, rh.connexions_gmail to service_role;

alter table rh.compagnies enable row level security;
alter table rh.connexions_gmail enable row level security;
alter table rh.reglages enable row level security;
alter table rh.modeles_courriels enable row level security;
alter table rh.courriels enable row level security;

create policy "Lire compagnies" on rh.compagnies for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire compagnies" on rh.compagnies for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire réglages" on rh.reglages for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire réglages" on rh.reglages for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire modèles" on rh.modeles_courriels for select to authenticated using (core.peut_lire('rh'));
create policy "Écrire modèles" on rh.modeles_courriels for all to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));
create policy "Lire courriels" on rh.courriels for select to authenticated using (core.peut_lire('rh'));
create policy "Préparer courriels" on rh.courriels for insert to authenticated with check (core.peut_ecrire('rh'));
create policy "Corriger courriels" on rh.courriels for update to authenticated
  using (core.peut_ecrire('rh')) with check (core.peut_ecrire('rh'));

-- ============================================================
-- Données de départ
-- ============================================================

-- Compagnies : boîtes données par Maxime (2026-10-15) ; signatures, liens de
-- rendez-vous et formules repris des automatisations d'Airtable.
insert into rh.compagnies (entreprise_id, adresse_envoi, nom_expediteur, signature, lien_rendez_vous, attrait, raison_sociale, nom_court, adresse, telephone)
select rh.entreprise(x.code), x.adresse_envoi, x.nom_expediteur, x.signature, x.lien, x.attrait, x.raison, x.court, x.adresse, x.telephone
from (values
  ('GBPA+', 'inscriptions@camptremblant.com', 'Base de Plein Air Mont-Tremblant',
   E'inscriptions@camptremblant.com\n+1 (819) 425-2461\ncamptremblant.com',
   'https://calendar.app.google/5mExLkYpmiujtDGk9/', 'notre affichage',
   'Gestion Base de Plein Air Mont-Tremblant +', 'La BPA', E'3595 rue Léonard, Mont-Tremblant\nQC J8E 2A5', '(819) 425-2461'),
  ('OPI', 'messages@opikawa.com', 'Opikawa',
   E'messages@opikawa.com\n+1 (888) 890-2887\nopikawa.com',
   'https://calendar.app.google/5mExLkYpmiujtDGk9/', 'notre camp de vacances',
   'Opikawa inc.', 'Opikawa', null, '(888) 890-2887'),
  ('AQB', 'info@aquabounga.ca', 'Aquabounga',
   E'info@aquabounga.ca\n+1 (819) 803-3819\naquabounga.ca',
   'https://calendar.app.google/itK6iuzV9R3Hy7Am8/', 'notre parc gonflable',
   'Aquabounga inc.', 'Aquabounga', null, '(819) 803-3819'),
  ('R&D', 'info@rougediable.ca', 'Rouge & Diable',
   E'info@rougediable.ca\n+1 (819) 201-1366\nrougediable.ca',
   'https://calendar.app.google/itK6iuzV9R3Hy7Am8/', 'notre centre de location',
   'Rouge&Diable inc.', 'Rouge & Diable', null, '(819) 201-1366'),
  ('TRB', 'info@trembloc.ca', 'Trembloc',
   E'info@trembloc.ca\n+1 (819) 425-2461\ntrembloc.ca',
   'https://calendar.app.google/5mExLkYpmiujtDGk9/', 'notre centre d''escalade',
   'Trembloc inc.', 'Trembloc', null, '(819) 425-2461')
) as x(code, adresse_envoi, nom_expediteur, signature, lien, attrait, raison, court, adresse, telephone)
where rh.entreprise(x.code) is not null
on conflict (entreprise_id) do nothing;

insert into rh.reglages (cle, valeur) values
  -- Rien n'est préparé tout seul pour ce qui s'est passé avant (données importées).
  ('courriels_depuis', to_jsonb((now() at time zone 'America/Montreal')::date::text)),
  ('rappel_jours', '7'),
  ('resume_destinataires', '["charlotte@camptremblant.com"]'),
  -- Heure de Montréal du résumé quotidien
  ('resume_heure', '7');

-- Modèles : textes des automatisations d'Airtable (rh-existant §3), la
-- compagnie et le lien venant des réglages ; versions anglaises pour les
-- courriels au candidat. Champs : {{prenom}}, {{appel}} (nom de camp ou
-- prénom), {{compagnie}}, {{attrait}}, {{lien_rendez_vous}}, {{saison}},
-- {{saisons}}, {{poste}}, {{postes}}, {{lien_dossier}}, {{lien_retour}},
-- {{lien_emplois}}, {{expediteur}}, {{signature}}, {{liste}}, {{lien_app}}.
insert into rh.modeles_courriels (genre, sujet, corps, sujet_en, corps_en, mode) values
('accuse', 'Candidature bien reçue',
$t$Bonjour {{prenom}},

Nous avons bien reçu ta candidature pour {{postes}} ({{saisons}}). Merci de ton intérêt !

La direction l'étudiera dans les prochains jours. Si ton profil correspond à nos besoins, nous communiquerons avec toi pour une entrevue.

À bientôt !

La direction
{{signature}}$t$,
'Application received',
$t$Hello {{prenom}},

We have received your application for {{postes}} ({{saisons}}). Thank you for your interest!

Our management team will review it in the coming days. If your profile matches our needs, we will contact you for an interview.

See you soon!

The management team
{{signature}}$t$, 'automatique'),

('entrevue', 'Proposition d''entrevue',
$t$Bonjour {{prenom}},

Nous avons bien reçu ta candidature.
On est vraiment très heureux que {{attrait}} ait retenu ton attention. Ton profil est intéressant et on aimerait bien te rencontrer. Serais-tu disponible prochainement pour une rencontre virtuelle d'environ 30 minutes sur Google Meet ? Tu peux sélectionner le moment qui te convient pour une entrevue [juste ici]({{lien_rendez_vous}}) !
Entre-temps, on t'invite à t'abonner à nos différentes pages : [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/) (camp régulier), [Opikawa](https://www.instagram.com/opikawa_/) (camp international et immersion linguistique), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) (centre de location d'embarcations) et [Aquabounga](https://www.instagram.com/aquabounga/) (structures gonflables sur l'eau).

Merci et au plaisir de discuter avec toi !

{{expediteur}}
{{signature}}$t$,
'Interview invitation',
$t$Hello {{prenom}},

We have received your application.
We are very happy that {{attrait}} caught your attention. Your profile is interesting and we would like to meet you. Would you be available soon for a video call of about 30 minutes on Google Meet? You can pick the time that suits you for an interview [right here]({{lien_rendez_vous}})!
In the meantime, feel free to follow our pages: [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/), [Opikawa](https://www.instagram.com/opikawa_/), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) and [Aquabounga](https://www.instagram.com/aquabounga/).

Thank you, and we look forward to talking with you!

{{expediteur}}
{{signature}}$t$, 'approuver'),

('refus_entrevue', 'Suivi entrevue',
$t$Bonjour {{prenom}},

Nous tenons à te remercier d'avoir pris le temps de passer l'entrevue avec nous, ainsi que pour ton intérêt envers notre poste.

Ta candidature est très bonne. Toutefois, en raison du nombre élevé de candidatures reçues et du nombre limité de places au sein de l'équipe, nous ne serons malheureusement pas en mesure de t'offrir un poste pour la prochaine saison.

Nous conserverons néanmoins tes coordonnées dans notre banque de candidatures et n'hésiterons pas à te recontacter si une place venait à se libérer d'ici le début de la saison.
Nous t'encourageons à soumettre à nouveau ta candidature dans le futur et espérons avoir l'occasion de recroiser ton chemin.
Bonne continuation et merci encore pour ton intérêt,

La direction
{{signature}}$t$,
'Interview follow-up',
$t$Hello {{prenom}},

Thank you for taking the time to interview with us, and for your interest in the position.

Your application is very good. However, because of the large number of applications received and the limited number of places on the team, we are unfortunately unable to offer you a position for the coming season.

We will keep your information in our pool of applicants and will not hesitate to contact you if a place opens up before the start of the season.
We encourage you to apply again in the future and hope our paths will cross again.
All the best, and thank you again for your interest,

The management team
{{signature}}$t$, 'approuver'),

('refus_equipe', 'Suivi candidature',
$t$Bonjour {{prenom}},

Nous avons bien reçu ta candidature et nous te remercions pour l'intérêt que tu portes à {{attrait}}. Nous sommes ravis qu'il ait retenu ton attention.

Malheureusement, notre équipe pour la saison à venir est déjà complète. Nous conserverons toutefois ton CV dans notre banque de candidatures et n'hésiterons pas à te recontacter si un poste venait à se libérer.

Merci encore pour ton intérêt et très bonne continuation !
La direction
{{signature}}$t$,
'Application follow-up',
$t$Hello {{prenom}},

We have received your application and thank you for your interest in {{attrait}}.

Unfortunately, our team for the coming season is already complete. We will keep your résumé in our pool of applicants and will not hesitate to contact you if a position opens up.

Thank you again for your interest, and all the best!
The management team
{{signature}}$t$, 'approuver'),

('aspi', 'Suivi candidature',
$t$Bonjour {{prenom}},

Nous avons bien reçu ta candidature et nous te remercions pour l'intérêt que tu portes à notre camp de vacances. Nous sommes ravis qu'il ait retenu ton attention.

Malheureusement, notre équipe pour l'été à venir est déjà complète.

Nous pouvons toutefois te parler du programme Aspirant-moniteur (ASPI) que nous offrons aux jeunes de secondaire 4 et 5. Ce programme est conçu pour les jeunes qui souhaitent découvrir l'animation en camp et apprendre les bases du métier d'animateur. Nous sommes convaincus que ce programme pourrait te donner une belle première expérience et te préparer pour soumettre ta candidature à nouveau l'an prochain.
Pour en savoir plus : http://camptremblant.com/aspi

Nous t'encourageons à considérer cette opportunité,
Merci encore pour ton intérêt et très bonne continuation !
La direction
{{signature}}$t$,
'Application follow-up',
$t$Hello {{prenom}},

We have received your application and thank you for your interest in our summer camp.

Unfortunately, our team for the coming summer is already complete.

We would however like to tell you about our Counsellor-in-Training program (ASPI), offered to students in Secondary 4 and 5. It is designed for young people who want to discover camp animation and learn the basics of being a counsellor. We are convinced this program could give you a great first experience and prepare you to apply again next year.
To learn more: http://camptremblant.com/aspi

We encourage you to consider this opportunity.
Thank you again for your interest, and all the best!
The management team
{{signature}}$t$, 'approuver'),

('permis', 'Suivi candidature',
$t$Bonjour {{prenom}},

Nous avons bien reçu ta candidature et te remercions pour ton intérêt à travailler avec nous.

Avant d'aller plus loin dans l'analyse de ta candidature, nous souhaitons valider une information. Tu as indiqué dans ton formulaire ne pas détenir actuellement de permis de travail valide au Canada.

Es-tu présentement en attente d'un PVT ou d'un autre permis de travail qui te permettrait de travailler au Canada? Si oui, peux-tu nous indiquer où en est ta démarche et, si tu le sais, à quel moment tu prévois obtenir ton permis?

À noter que nous n'offrons malheureusement pas d'accompagnement ni de parrainage pour l'obtention d'un permis de travail pour une saison précise.

Merci encore pour ton intérêt et au plaisir d'avoir de tes nouvelles!
La direction
{{signature}}$t$,
'Application follow-up',
$t$Hello {{prenom}},

We have received your application and thank you for your interest in working with us.

Before going further, we would like to confirm one thing. You indicated that you do not currently hold a valid Canadian work permit.

Are you currently waiting for a working holiday visa (PVT/IEC) or another permit that would allow you to work in Canada? If so, could you tell us where your application stands and, if you know, when you expect to receive your permit?

Please note that we unfortunately do not offer support or sponsorship to obtain a work permit for a specific season.

Thank you again for your interest; we look forward to hearing from you!
The management team
{{signature}}$t$, 'approuver'),

('bienvenue', 'Bienvenue dans l''équipe !',
$t$Salut {{prenom}},
Merci encore d'avoir pris le temps de participer au processus d'entrevue. On a bien hâte de commencer la saison {{saison}} avec toi : **Bienvenue dans l'aventure 🥳**

**💼 Dossier d'embauche**
Afin de compléter ton dossier employé, je t'invite à remplir ton dossier d'embauche ici : {{lien_dossier}}
Ce lien te permettra de :
* Fournir certaines informations,
* Valider tes disponibilités,
* Téléverser les documents requis,
* Signer ton contrat de travail en ligne (et, si tu as moins de 18 ans au début de ton contrat, faire signer le consentement parental par un parent).

**🤝 Vie de camp et communications**
Les informations liées au fonctionnement du camp, aux communications internes et aux prochaines étapes te seront transmises via un **groupe Facebook privé** regroupant l'ensemble des employés. Ce groupe deviendra notre principal moyen de communication pour la suite.

N'oublie pas de t'abonner à nos différentes pages si ce n'est pas encore fait : [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/) (camp régulier), [Opikawa](https://www.instagram.com/opikawa_/) (camp international et immersion linguistique), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) (centre de location d'embarcations) et [Aquabounga](https://www.instagram.com/aquabounga/) (structures gonflables sur l'eau).

Si tu as des questions concernant ton embauche ou ton dossier employé, n'hésite pas à m'écrire.
On a bien hâte de travailler avec toi,
À très bientôt !

{{expediteur}}
{{signature}}$t$, null, null, 'approuver'),

('rappel_dossier', 'Rappel : ton dossier d''embauche',
$t$Salut {{prenom}},

Petit rappel : ton dossier d'embauche pour la saison {{saison}} n'est pas encore rempli. Tu peux le faire ici (environ 10 minutes) : {{lien_dossier}}

Si tu as des questions, réponds simplement à ce courriel.

À très bientôt !
{{expediteur}}
{{signature}}$t$, null, null, 'approuver'),

('retour', 'Ton retour pour la saison {{saison}} ?',
$t$Salut {{appel}} !

La saison {{saison}} approche et on aimerait savoir si tu souhaites revenir avec nous. Ça prend une minute : {{lien_retour}}

Hâte d'avoir de tes nouvelles ! 😄
{{expediteur}}
{{signature}}$t$, null, null, 'approuver'),

('resume', 'RH : nouveautés',
$t$Bonjour,

Voici les nouveautés du module RH depuis le dernier résumé :

{{liste}}

Pour les voir : {{lien_app}}$t$, null, null, 'automatique');
