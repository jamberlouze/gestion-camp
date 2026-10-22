-- ============================================================
-- CRM, contacts : civilité, prénom et nom de famille (demande de Maxime du
-- 2026-10-22 : un courriel commence par « Bonjour Isabelle, » ou par
-- « Bonjour Mme Chassagne, », au choix du modèle).
-- 1. crm.contacts : civilite ('mme' / 'm', null = pas connue), prenom,
--    nom_famille. `nom` (« Prénom Nom ») reste le nom affiché partout.
-- 2. Tenus ensemble par crm.poser_nom_contact : prénom ou nom de famille
--    écrit → `nom` refait ; seulement `nom` écrit (import, formulaire de
--    demande, ancien écran) → coupé au premier espace par crm.decouper_nom
--    (« Mme Roussel » → civilité Mme, nom de famille Roussel).
-- 3. Contacts déjà là : coupés de la même façon (sans toucher à `nom`).
-- 4. reservations.courriels_etat : le contact et l'auteur de la demande
--    donnent aussi prénom, nom de famille et civilité (champs {{prenom}} et
--    {{civilite_nom}} des courriels). Reprise telle quelle de
--    20261010160517, sauf ces champs.
-- ============================================================
begin;

alter table crm.contacts
  add column civilite text check (civilite in ('mme', 'm')),
  add column prenom text,
  add column nom_famille text;

comment on column crm.contacts.civilite is 'Mme (mme) ou M. (m), null = pas connue : {{civilite_nom}} des courriels donne alors le nom complet.';
comment on column crm.contacts.prenom is 'Prénom ; avec nom_famille, refait `nom` (crm.poser_nom_contact).';

-- « Mme Isabelle Chassagne » → (mme, Isabelle, Chassagne) ; « Mme Roussel » → (mme, null, Roussel) ;
-- « Isabelle » → (null, Isabelle, null). Coupé au premier espace : un prénom composé
-- avec une espace (Marie Claude) se corrige dans la fiche du contact.
create function crm.decouper_nom(p_nom text, out civilite text, out prenom text, out nom_famille text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
begin
  if t ~* '^(mme|madame)\.? ' then
    civilite := 'mme';
    t := regexp_replace(t, '^\S+ ', '');
  elsif t ~* '^(m\.|monsieur) ' then
    civilite := 'm';
    t := regexp_replace(t, '^\S+ ', '');
  end if;
  if t = '' then
    return;
  end if;
  if civilite is not null and t !~ ' ' then
    nom_famille := t;
    return;
  end if;
  prenom := split_part(t, ' ', 1);
  nom_famille := nullif(btrim(substr(t, length(prenom) + 2)), '');
end;
$$;

-- Sans toucher à updated_at : rien n'a changé pour l'équipe.
alter table crm.contacts disable trigger trg_crm_contacts_updated_at;
update crm.contacts c
set prenom = d.prenom, nom_famille = d.nom_famille, civilite = coalesce(c.civilite, d.civilite)
from crm.contacts x
cross join lateral crm.decouper_nom(x.nom) d
where x.id = c.id;
alter table crm.contacts enable trigger trg_crm_contacts_updated_at;

create function crm.poser_nom_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d record;
begin
  new.prenom := nullif(btrim(new.prenom), '');
  new.nom_famille := nullif(btrim(new.nom_famille), '');
  if (tg_op = 'INSERT' and (new.prenom is not null or new.nom_famille is not null))
     or (tg_op = 'UPDATE' and (new.prenom is distinct from old.prenom or new.nom_famille is distinct from old.nom_famille)) then
    if new.prenom is not null or new.nom_famille is not null then
      new.nom := concat_ws(' ', new.prenom, new.nom_famille);
    end if;
  elsif tg_op = 'INSERT' or new.nom is distinct from old.nom then
    d := crm.decouper_nom(new.nom);
    new.prenom := d.prenom;
    new.nom_famille := d.nom_famille;
    -- Une civilité écrite devant le nom l'emporte.
    new.civilite := coalesce(d.civilite, new.civilite);
  end if;
  return new;
end;
$$;

create trigger trg_crm_contacts_nom before insert or update on crm.contacts
  for each row execute function crm.poser_nom_contact();

revoke execute on function crm.poser_nom_contact() from public;

-- ------------------------------------------------------------
-- État des courriels : prénom, nom de famille et civilité.
-- ------------------------------------------------------------
create or replace function reservations.courriels_etat(p_reservation uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'r', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'nom', r.nom, 'forfait', r.forfait, 'langue', r.langue,
      'date_arrivee', r.date_arrivee, 'date_depart', r.date_depart, 'signe_le', r.signe_le,
      'fermeture', r.fermeture, 'nb_participants', r.nb_participants, 'nb_accompagnateurs', r.nb_accompagnateurs,
      'acompte1_part', r.acompte1_part, 'acompte2_part', r.acompte2_part, 'compagnie_id', r.compagnie_id,
      'organisation_id', r.organisation_id, 'jeton_client', r.jeton_client, 'jeton_fiches', r.jeton_fiches,
      'courriel_direction', r.courriel_direction),
    'contact_reservation', (
      select jsonb_build_object('id', c.id, 'nom', c.nom, 'courriel', c.courriel, 'prenom', c.prenom, 'nom_famille', c.nom_famille, 'civilite', c.civilite)
      from crm.contacts c where c.id = r.contact_reservation_id),
    'contact_facturation', (
      select jsonb_build_object('id', c.id, 'nom', c.nom, 'courriel', c.courriel, 'prenom', c.prenom, 'nom_famille', c.nom_famille, 'civilite', c.civilite)
      from crm.contacts c where c.id = r.contact_facturation_id),
    'demande', (
      select jsonb_build_object('id', d.id, 'recue_le', d.recue_le, 'langue', d.langue,
        'courriel', d.reponses ->> 'resp_courriel',
        'nom', btrim(coalesce(d.reponses ->> 'resp_prenom', '') || ' ' || coalesce(d.reponses ->> 'resp_nom', '')),
        'prenom', nullif(btrim(d.reponses ->> 'resp_prenom'), ''),
        'nom_famille', nullif(btrim(d.reponses ->> 'resp_nom'), ''))
      from reservations.demandes d where d.reservation_id = r.id order by d.recue_le desc limit 1),
    'estimes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'version', e.version, 'statut', e.statut, 'envoye_le', e.envoye_le, 'total', e.total) order by e.version), '[]')
      from reservations.estimes e where e.reservation_id = r.id),
    'signatures', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'statut', s.statut, 'envoye_le', s.envoye_le, 'echeance', s.echeance, 'jeton', s.jeton) order by s.envoye_le), '[]')
      from reservations.signatures s where s.reservation_id = r.id),
    'factures', (
      select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'qbo_type', f.qbo_type, 'qbo_id', f.qbo_id, 'genre', f.genre, 'numero', f.numero,
        'date_facture', f.date_facture, 'echeance', f.echeance, 'total', f.total, 'solde', f.solde) order by f.date_facture, f.numero), '[]')
      from reservations.factures f where f.reservation_id = r.id and not f.supprimee),
    'devis_total', (select d.total from reservations.qbo_devis d where d.reservation_id = r.id),
    'fiches_recues', (select count(*) from reservations.fiches f where f.reservation_id = r.id),
    'courriels', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'cle', c.cle, 'genre', c.genre, 'statut', c.statut, 'ref', c.ref)), '[]')
      from reservations.courriels c where c.reservation_id = r.id)
  )), '[]')
  from reservations.reservations r
  where (p_reservation is not null and r.id = p_reservation)
     or (p_reservation is null and (
       r.date_depart >= current_date - 30
       or exists (select 1 from reservations.factures f where f.reservation_id = r.id and not f.supprimee and f.solde > 0)))
$$;

commit;
