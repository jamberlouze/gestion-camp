-- ============================================================
-- Réservations, portail client (réunion du 2026-10-21, lots D et G) :
-- 1. Page client par étape : les fiches participants n'y paraissent qu'à
--    partir de la signature du contrat (elles apparaissent seules à la
--    signature) ; avant, ni lien ni compte.
-- 2. Le responsable du groupe (prof) voit sur sa page les fiches reçues
--    avec allergies et diète (nom, groupe, reçue le, allergies, diète ;
--    jamais le reste de la santé, l'Epipen ni les médicaments), tant
--    qu'elles ne sont pas effacées (Loi 25 : 3 mois après le départ) —
--    décision de Maxime.
-- 3. Consentement du formulaire des fiches : case obligatoire qui dit que
--    les allergies et la diète sont communiquées au responsable du groupe ;
--    gardé dans consentement_le. Une fiche reçue avant ce consentement ne
--    montre ni ses allergies ni sa diète au responsable.
-- 4. Totaux des fiches : nombre de fiches avec allergies et avec des
--    problèmes de santé (section de la fiche, sans nom).
-- Le bloc « Une question / un message » est retiré de la page :
-- reservations.message_client reste en base (rien de supprimé).
-- ============================================================
begin;

alter table reservations.fiches add column consentement_le timestamptz;

comment on column reservations.fiches.consentement_le is
  'Consentement coché sur le formulaire : renseignements gardés pour la sécurité et les repas, allergies et diète communiquées au responsable du groupe (page client). Null = fiche reçue avant cette case (2026-10-21) : rien de montré au responsable.';

-- ------------------------------------------------------------
-- Page client : reprise telle quelle de 20261014195425, sauf « fiches ».
-- ------------------------------------------------------------
create or replace function reservations.page_client(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  v_estime jsonb;
  v_ouvertes boolean;
begin
  if p_jeton is null or length(p_jeton) <> 48 then
    return null;
  end if;
  select * into r from reservations.reservations where jeton_client = p_jeton;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', e.id, 'version', e.version, 'statut', e.statut, 'date_estime', e.date_estime,
    'sous_total', e.sous_total, 'tps', e.tps, 'tvq', e.tvq, 'total', e.total,
    'envoye_le', e.envoye_le, 'accepte_le', e.accepte_le, 'accepte_par', e.accepte_par,
    'exercice_prix', e.exercice_prix, 'prix_provisoires', e.prix_provisoires,
    'document_id', (
      select d.id from reservations.documents d
      where d.estime_id = e.id and d.genre = 'estime' order by d.cree_le desc limit 1),
    'lignes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', l.code, 'auto', l.auto,
        'description', l.description, 'note', l.note, 'quantite', l.quantite,
        'prix_unitaire', l.prix_unitaire, 'pourcentage', l.pourcentage, 'montant', l.montant) order by l.ordre), '[]')
      from reservations.lignes l where l.estime_id = e.id))
  into v_estime
  from reservations.estimes e
  where e.reservation_id = r.id and e.statut in ('envoye', 'accepte')
  order by e.version desc
  limit 1;

  -- Fiches encore à remplir : mêmes règles que fiche_infos / ajouter_fiche.
  v_ouvertes := r.fermeture is null and r.date_depart >= (now() at time zone 'America/Toronto')::date;

  return jsonb_build_object(
    'numero', r.numero,
    'nom', r.nom,
    'forfait', r.forfait,
    'variante', r.variante,
    'date_arrivee', r.date_arrivee,
    'date_depart', r.date_depart,
    'heure_arrivee', r.heure_arrivee,
    'heure_depart', r.heure_depart,
    'nb_participants', r.nb_participants,
    'nb_accompagnateurs', r.nb_accompagnateurs,
    'langue', r.langue,
    'etape', r.etape,
    'fermeture', r.fermeture,
    'organisation', (select o.nom from crm.organisations o where o.id = r.organisation_id),
    'compagnie', (
      select jsonb_build_object('nom', c.raison_sociale, 'logo', c.logo, 'courriel', c.courriel, 'telephone', c.telephone)
      from reservations.compagnies c where c.entreprise_id = r.compagnie_id),
    'estime', v_estime,
    'signature', (
      select jsonb_build_object(
        'statut', s.statut,
        'jeton', case when s.statut = 'en_attente' then s.jeton end,
        'echeance', s.echeance, 'signe_le', s.signe_le, 'nom_signataire', s.nom_signataire)
      from reservations.signatures s
      where s.reservation_id = r.id and s.statut <> 'annule'
      order by s.envoye_le desc limit 1),
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'genre', d.genre, 'titre', d.titre, 'cree_le', d.cree_le) order by d.cree_le desc), '[]')
      from reservations.documents d
      where d.reservation_id = r.id and d.genre in ('contrat_signe', 'pre_arrivee')),
    -- Classe nature et Journée plein air, contrat signé (signature en ligne,
    -- ou signée à la main / importée : signe_le ou étape confirmée et
    -- suivantes), dossier ouvert ; rien une fois les fiches fermées et
    -- effacées. Le lien n'est donné que tant qu'on peut remplir une fiche.
    'fiches', case
      when r.forfait in ('classe_nature', 'journee_plein_air') and r.fermeture is null
        and (r.signe_le is not null or r.etape in ('confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee'))
      then (
        select case when v_ouvertes or count(*) filter (where f.effacee_le is null) > 0 then jsonb_build_object(
          'jeton', case when v_ouvertes then r.jeton_fiches end,
          'recues', count(*),
          'attendues', coalesce(r.nb_participants, 0) + coalesce(r.nb_accompagnateurs, 0),
          'liste', coalesce(jsonb_agg(jsonb_build_object(
              'prenom', f.prenom, 'nom', f.nom, 'genre', f.genre, 'groupe', f.groupe, 'recue_le', f.recue_le,
              'partage', f.consentement_le is not null,
              'allergies', case when f.consentement_le is not null then f.allergies end,
              'diete', case when f.consentement_le is not null then f.diete end,
              'diete_autre', case when f.consentement_le is not null then f.diete_autre end)
            order by lower(f.nom), lower(f.prenom)) filter (where f.effacee_le is null), '[]'::jsonb)
        ) end
        from reservations.fiches f
        where f.reservation_id = r.id)
    end
  );
end;
$$;

-- ------------------------------------------------------------
-- Fiche reçue : reprise de 20261009114233, plus la case de consentement
-- (obligatoire, gardée avec sa date).
-- ------------------------------------------------------------
create or replace function reservations.ajouter_fiche(p_jeton text, p_fiche jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  f jsonb := p_fiche;
  v_id uuid;
  v_sante boolean := (f ->> 'sante')::boolean;
  v_diete text := nullif(f ->> 'diete', '');
begin
  select * into r from reservations.reservations where jeton_fiches = p_jeton and length(p_jeton) = 48;
  if not found then
    raise exception 'Lien invalide.';
  end if;
  if r.fermeture is not null or r.date_depart < (now() at time zone 'America/Toronto')::date then
    raise exception 'Les fiches de ce séjour sont fermées.';
  end if;
  if (select count(*) from reservations.fiches x where x.reservation_id = r.id)
     >= 2 * (coalesce(r.nb_participants, 0) + coalesce(r.nb_accompagnateurs, 0)) + 20 then
    raise exception 'Nombre maximal de fiches atteint : communiquez avec nous.';
  end if;
  if btrim(coalesce(f ->> 'prenom', '')) = '' or btrim(coalesce(f ->> 'nom', '')) = '' then
    raise exception 'Le prénom et le nom sont obligatoires.';
  end if;
  if not coalesce((f ->> 'consentement')::boolean, false) then
    raise exception 'Il faut cocher la case de consentement pour envoyer la fiche.';
  end if;

  insert into reservations.fiches (
    reservation_id, genre, prenom, nom, groupe, matricule, sante, allergies, problemes_sante,
    epipen, diete, diete_autre, medicaments, courriel, nouvelles, langue, consentement_le)
  values (
    r.id,
    coalesce(nullif(f ->> 'genre', ''), 'participant'),
    left(btrim(f ->> 'prenom'), 100),
    left(btrim(f ->> 'nom'), 100),
    left(nullif(btrim(f ->> 'groupe'), ''), 100),
    left(nullif(btrim(f ->> 'matricule'), ''), 50),
    v_sante,
    case when v_sante then left(nullif(btrim(f ->> 'allergies'), ''), 2000) end,
    case when v_sante then left(nullif(btrim(f ->> 'problemes_sante'), ''), 2000) end,
    case when v_sante then (f ->> 'epipen')::boolean end,
    v_diete,
    case when v_diete = 'autre' then left(nullif(btrim(f ->> 'diete_autre'), ''), 500) end,
    (f ->> 'medicaments')::boolean,
    left(nullif(lower(btrim(f ->> 'courriel')), ''), 200),
    coalesce((f ->> 'nouvelles')::boolean, false),
    coalesce(nullif(f ->> 'langue', ''), 'fr'),
    now())
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Totaux pour l'équipe (jamais un nom) : plus allergies et problèmes de santé.
-- ------------------------------------------------------------
create or replace function reservations.totaux_fiches(p_reservation uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when core.peut_lire('reservations') then jsonb_build_object(
    'recues', count(*),
    'participants', count(*) filter (where f.genre = 'participant'),
    'adultes', count(*) filter (where f.genre = 'adulte'),
    'sante', count(*) filter (where f.sante),
    'allergies', count(*) filter (where f.allergies is not null),
    'problemes', count(*) filter (where f.problemes_sante is not null),
    'epipen', count(*) filter (where f.epipen),
    'sans_medicaments', count(*) filter (where f.medicaments = false),
    'effacees', count(*) filter (where f.effacee_le is not null),
    'dietes', (
      select coalesce(jsonb_object_agg(x.diete, x.n), '{}')
      from (select g.diete, count(*) as n from reservations.fiches g
            where g.reservation_id = p_reservation and g.diete is not null and g.diete <> 'reguliere'
            group by g.diete) x))
  end
  from reservations.fiches f
  where f.reservation_id = p_reservation
$$;

commit;
