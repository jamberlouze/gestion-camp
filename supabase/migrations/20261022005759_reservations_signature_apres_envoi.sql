-- ============================================================
-- Réservations, page client : le lien de signature n'y paraît qu'une
-- fois le courriel du contrat parti (« Envoyer le contrat… », étape
-- Contrat envoyé et suivantes), pas dès « Préparer le contrat à signer ».
-- Un contrat déjà signé s'affiche toujours. Reprise telle quelle de
-- 20261022002253, sauf la condition de « signature ».
-- ============================================================
begin;

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
        and (s.statut = 'signe' or r.etape not in ('nouvelle', 'contact', 'estime_envoye', 'estime_accepte'))
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

commit;
