-- Réservations : retouches des listes de vérification des phases 5 et 6
-- (2026-10-11) et alerte « aucun paiement reçu » après la signature.

-- ------------------------------------------------------------
-- Lien de la réservation Airbnb dans sa propre colonne
-- ------------------------------------------------------------

-- Avant : dans la description, perdu dès que l'équipe la réécrivait (la
-- relecture de l'iCal ne touche jamais ce que l'équipe a complété).
alter table reservations.reservations add column lien_externe text;

update reservations.reservations
set lien_externe = substring(description from 'https://\S+')
where origine = 'airbnb' and description ~ 'https://';

update reservations.reservations
set description = nullif(btrim(regexp_replace(description, '\s*https://\S+', '', 'g')), '')
where origine = 'airbnb' and lien_externe is not null;

create or replace function reservations.recevoir_airbnb(p_annonce text, p_evenements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  r reservations.reservations;
  v_ref text;
  v_refs text[] := '{}';
  v_compagnie uuid;
  v_nom text;
  v_etages text[];
  v_salles text[];
  v_arrivee date;
  v_depart date;
  v_exercice smallint;
  v_seq integer;
  v_note text;
  v_ajoutees integer := 0;
  v_modifiees integer := 0;
  v_annulees integer := 0;
begin
  if p_annonce = 'vf_complet' then
    v_nom := 'Airbnb — Vieille-France complète';
    v_etages := array['VFB', 'VFH'];
    v_salles := array['SVF', 'CVF'];
  elsif p_annonce = 'vf_bas' then
    v_nom := 'Airbnb — Vieille-France, étage du bas';
    v_etages := array['VFB'];
    v_salles := '{}';
  else
    raise exception 'Annonce Airbnb inconnue : %', p_annonce;
  end if;
  select c.entreprise_id into v_compagnie
  from reservations.compagnies c join core.entreprises x on x.id = c.entreprise_id
  order by (x.nom = 'GBPA+') desc, x.nom limit 1;

  for e in select * from jsonb_array_elements(p_evenements) loop
    v_ref := 'airbnb:' || p_annonce || ':' || (e ->> 'uid');
    v_refs := v_refs || v_ref;
    v_arrivee := (e ->> 'arrivee')::date;
    v_depart := (e ->> 'depart')::date;
    select * into r from reservations.reservations where ref_externe = v_ref;
    if r.id is null then
      v_exercice := reservations.exercice_de(v_arrivee);
      perform pg_advisory_xact_lock(hashtext('reservations.numero'), v_exercice);
      select coalesce(max(x.numero_seq), 100000) + 1 into v_seq
      from reservations.reservations x where x.exercice = v_exercice and x.numero_seq >= 100000;
      insert into reservations.reservations (numero, exercice, numero_seq, nom, compagnie_id, forfait, date_arrivee, date_depart,
        etages, salles, etape, origine, ref_externe, lien_externe, description)
      values (lpad((v_exercice % 100)::text, 2, '0') || '-A-' || lpad((v_seq - 100000)::text, 3, '0'), v_exercice, v_seq, v_nom,
        v_compagnie, 'accueil_groupe', v_arrivee, v_depart, v_etages, v_salles, 'confirmee', 'airbnb', v_ref,
        e ->> 'lien', 'Réservation Airbnb à compléter.')
      returning * into r;
      insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
      values (r.id, 'note', 'Réservation Airbnb reçue (' || v_nom || ')', 'Airbnb');
      v_ajoutees := v_ajoutees + 1;
    elsif r.date_arrivee <> v_arrivee or r.date_depart <> v_depart or r.fermeture = 'annulee' then
      v_note := 'Airbnb : ' || to_char(v_arrivee, 'YYYY-MM-DD') || ' → ' || to_char(v_depart, 'YYYY-MM-DD');
      if r.fermeture = 'annulee' then
        v_note := v_note || ' (de retour sur Airbnb)';
      end if;
      update reservations.reservations
      set date_arrivee = v_arrivee, date_depart = v_depart, fermeture = null
      where id = r.id;
      insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
      values (r.id, 'note', v_note, 'Airbnb');
      v_modifiees := v_modifiees + 1;
    end if;
    -- Le lien suit Airbnb, sans toucher à ce que l'équipe a écrit.
    update reservations.reservations set lien_externe = e ->> 'lien'
    where id = r.id and e ->> 'lien' is not null and lien_externe is distinct from e ->> 'lien';
  end loop;

  -- Disparues du calendrier Airbnb (à venir seulement) : annulées.
  for r in
    select * from reservations.reservations x
    where x.origine = 'airbnb' and x.ref_externe like 'airbnb:' || p_annonce || ':%'
      and x.fermeture is null and x.date_depart >= current_date and not (x.ref_externe = any (v_refs))
  loop
    update reservations.reservations set fermeture = 'annulee' where id = r.id;
    insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
    values (r.id, 'note', 'Annulée sur Airbnb (disparue du calendrier)', 'Airbnb');
    v_annulees := v_annulees + 1;
  end loop;

  return jsonb_build_object('ajoutees', v_ajoutees, 'modifiees', v_modifiees, 'annulees', v_annulees);
end;
$$;

-- ------------------------------------------------------------
-- Courriels : « le contrat de École… » (élision)
-- ------------------------------------------------------------

-- replace() : un modèle déjà modifié par l'équipe ne change que s'il porte
-- encore la phrase de départ.
update reservations.modeles_courriels
set corps_fr = replace(corps_fr, 'Voici le contrat de {{groupe}}', 'Voici le contrat pour {{groupe}}')
where genre = 'contrat';

update reservations.modeles_courriels
set corps_fr = replace(corps_fr, 'le contrat de {{groupe}} ({{dates}}) attend', 'le contrat pour {{groupe}} ({{dates}}) attend')
where genre = 'rappel_signature';

-- ------------------------------------------------------------
-- Alerte : contrat signé, aucun paiement reçu
-- ------------------------------------------------------------

-- Jours après la signature (0 = jamais). Au plus tard 7 jours avant
-- l'arrivée, jamais moins de 3 jours après la signature.
insert into reservations.reglages (cle, valeur) values ('alerte_paiement_jours', '14')
on conflict (cle) do nothing;

-- Payé, comme bilanFactures (facturation.ts) : factures moins leurs soldes,
-- moins les notes de crédit appliquées (elles baissent un solde sans être
-- un paiement). Un dollar de jeu.
create function reservations.paiement_recu(p_reservation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(f.total - f.solde) filter (where f.qbo_type = 'Invoice'), 0)
       - coalesce(sum(f.total - f.solde) filter (where f.qbo_type = 'CreditMemo'), 0) >= 1
  from reservations.factures f
  where f.reservation_id = p_reservation and not f.supprimee
$$;

-- Contrat signé (pas un import) : relance « aucun paiement reçu » au
-- responsable de la réservation (sinon à la facturation), datée du jour de
-- l'alerte ; fermée par qbo_fermer_taches au premier paiement.
create function reservations.alerte_paiement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jours integer;
  v_echeance date;
begin
  if new.signe_le is null or old.signe_le is not null or new.organisation_id is null or new.origine = 'import'
     or reservations.paiement_recu(new.id) then
    return null;
  end if;
  select nullif(g.valeur #>> '{}', '')::integer into v_jours from reservations.reglages g where g.cle = 'alerte_paiement_jours';
  v_jours := coalesce(v_jours, 14);
  if v_jours <= 0 then
    return null;
  end if;
  v_echeance := greatest(new.signe_le + 3, least(new.signe_le + v_jours, new.date_arrivee - 7));
  insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
  values (new.organisation_id, new.id,
    new.numero || ' : contrat signé, aucun paiement reçu — relancer le client ou libérer les dates',
    v_echeance, coalesce(new.responsable_id, reservations.responsable_facturation(new.id)),
    'qbo:' || new.id || ':paiement', 'Réservations')
  on conflict (source_cle) do nothing;
  return null;
end;
$$;

create trigger trg_reservations_alerte_paiement after update of signe_le on reservations.reservations
for each row execute function reservations.alerte_paiement();

-- Premier paiement : l'alerte se ferme (avant les seuils du devis : un
-- paiement compte même sans devis connu).
create or replace function reservations.qbo_fermer_taches(p_reservation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d reservations.qbo_devis;
  v_facture numeric;
  s jsonb;
  v_cumul numeric;
  v_jeu numeric;
  v_jour date := (now() at time zone 'America/Toronto')::date;
begin
  if reservations.paiement_recu(p_reservation) then
    update crm.relances set statut = 'faite'
    where source_cle = 'qbo:' || p_reservation || ':paiement' and statut = 'a_faire';
  end if;
  select * into d from reservations.qbo_devis where reservation_id = p_reservation;
  if d.reservation_id is null or d.total <= 0 then
    return;
  end if;
  select coalesce(sum(f.total), 0) into v_facture
  from reservations.factures f
  where f.reservation_id = p_reservation and f.genre = 'progressive' and not f.supprimee;
  for s in select * from jsonb_array_elements(d.echeancier) loop
    v_cumul := (s ->> 'cumul')::numeric;
    -- Un dollar de jeu sur un acompte (arrondi du % dans QBO), un cent sur le solde.
    v_jeu := 0.01;
    if v_cumul < 1 then
      v_jeu := 1;
    end if;
    if v_facture >= v_cumul * d.total - v_jeu and (s ->> 'apres' is null or v_jour > (s ->> 'apres')::date) then
      update crm.relances set statut = 'faite'
      where source_cle = 'qbo:' || p_reservation || ':' || (s ->> 'cle') and statut = 'a_faire';
    end if;
  end loop;
end;
$$;

-- Annulée : l'alerte de paiement s'annule avec les autres relances ;
-- rouverte, elle revient seulement si rien n'a été payé entre-temps.
create or replace function reservations.annulation_apres_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cles text[] := array['qbo:' || new.id || ':devis', 'qbo:' || new.id || ':acompte1', 'qbo:' || new.id || ':acompte2',
    'qbo:' || new.id || ':finale', 'qbo:' || new.id || ':paiement'];
begin
  if new.fermeture = 'annulee' then
    if old.fermeture is distinct from 'annulee' then
      new.annule_le := coalesce(new.annule_le, (now() at time zone 'America/Toronto')::date);
      update crm.relances set statut = 'annulee' where source_cle = any (v_cles) and statut = 'a_faire';
      if new.organisation_id is not null and new.signe_le is not null then
        insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
        values (new.organisation_id, new.id, new.numero || ' : annulée, frais d''annulation à traiter (fiche › Facturation)',
          (now() at time zone 'America/Toronto')::date, reservations.responsable_facturation(new.id),
          'qbo:' || new.id || ':annulation', 'Réservations')
        on conflict (source_cle) do update set statut = 'a_faire', titre = excluded.titre, echeance = excluded.echeance;
      end if;
    end if;
  else
    new.annule_le := null;
    if old.fermeture = 'annulee' then
      update crm.relances set statut = 'a_faire' where source_cle = any (v_cles) and statut = 'annulee';
      update crm.relances set statut = 'annulee' where source_cle = 'qbo:' || new.id || ':annulation' and statut = 'a_faire';
      if reservations.paiement_recu(new.id) then
        update crm.relances set statut = 'faite' where source_cle = 'qbo:' || new.id || ':paiement' and statut = 'a_faire';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function reservations.paiement_recu(uuid), reservations.alerte_paiement() from public;
grant execute on function reservations.paiement_recu(uuid) to service_role;
