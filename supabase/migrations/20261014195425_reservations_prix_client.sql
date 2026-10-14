-- Réservations, liste de prix (suite du 2026-10-14, décisions de Maxime) :
-- 1. « + % » de la liste de l'exercice suivant : l'augmentation appliquée au
--    prix (ou au coût d'un fournisseur) de l'exercice d'avant, gardée sur la
--    ligne pour qu'on voie ce qui a été appliqué.
-- 2. Page client : les lignes à prix provisoire sont repérables (code, ligne
--    calculée, prix provisoires de l'estimé) pour porter la mention.
-- 3. Formulaire public : plus aucun prix (le prix du repas est retiré de
--    `formulaire_public`).

alter table reservations.prix
  add column hausse_pct numeric(7,2) check (hausse_pct is null or hausse_pct > -100);

comment on column reservations.prix.hausse_pct is
  'Augmentation appliquée (%) au prix — ou au coût d''un fournisseur — de l''exercice d''avant ; le prix reste modifiable à la main.';

-- ------------------------------------------------------------
-- Page client : estimé avec ses prix provisoires et, par ligne, le code et
-- « calculée » (même règle que l'app : ligneProvisoire de calcul.ts).
-- Reprise telle quelle de 20261009114233, sauf ces trois champs.
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
    'fiches', case when r.forfait in ('classe_nature', 'journee_plein_air') then jsonb_build_object(
      'jeton', r.jeton_fiches,
      'recues', (select count(*) from reservations.fiches f where f.reservation_id = r.id),
      'attendues', coalesce(r.nb_participants, 0) + coalesce(r.nb_accompagnateurs, 0)) end
  );
end;
$$;

-- ------------------------------------------------------------
-- Formulaire public : les heures normales seulement, aucun prix.
-- ------------------------------------------------------------
create or replace function reservations.formulaire_public()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'heures_normales', (select g.valeur from reservations.reglages g where g.cle = 'heures_normales'))
$$;
