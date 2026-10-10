-- Réservations, phase 4 (suite) : échéancier convenu autrement (F2),
-- annulation (F16, F17), seuils de l'échéancier gardés avec le devis QBO
-- (une seule source : facturation.ts). Le minimum de 90 % (F10, F11) est
-- une ligne de l'estimé final : rien en base.

-- ------------------------------------------------------------
-- Colonnes
-- ------------------------------------------------------------

alter table reservations.reservations
  -- F2 : parts des acomptes 1 et 2 convenues avec le groupe (null = standard :
  -- 25 / 50 en CN et JPA, 25 / 75 en AG et LS). Une part à 0 = pas d'acompte.
  add column acompte1_part numeric(5,4),
  add column acompte2_part numeric(5,4),
  -- F16 : jour de l'avis d'annulation (posé par la base à l'annulation, modifiable).
  add column annule_le date,
  add constraint reservations_parts_acomptes check (
    (acompte1_part is null) = (acompte2_part is null)
    and (acompte1_part is null or (acompte1_part >= 0 and acompte2_part >= 0 and acompte1_part + acompte2_part <= 1))
  );

alter table reservations.qbo_devis
  -- Seuils des relances de facturation, posés par le Worker (seuilsEcheancier) :
  -- [{cle, cumul, apres}] ; une relance se ferme quand le cumul facturé
  -- atteint cumul × total du devis (et, s'il y a lieu, après le jour `apres`).
  add column echeancier jsonb not null default '[]',
  -- Annulation : le devis ne porte plus que les frais d'annulation (F17).
  add column annulation boolean not null default false;

-- ------------------------------------------------------------
-- Relances de facturation fermées d'après les seuils du devis
-- ------------------------------------------------------------

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

-- ------------------------------------------------------------
-- Annulation après signature (F16) : jour de l'avis et relances
-- ------------------------------------------------------------

-- Annulée : le jour de l'avis est posé (aujourd'hui, modifiable) ; les
-- relances d'acompte, de facture finale et de devis sont annulées et une
-- relance « frais d'annulation à traiter » va à la facturation. Rouverte :
-- l'inverse.
create function reservations.annulation_apres_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cles text[] := array['qbo:' || new.id || ':devis', 'qbo:' || new.id || ':acompte1', 'qbo:' || new.id || ':acompte2', 'qbo:' || new.id || ':finale'];
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
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_reservations_annulation before update of fermeture, annule_le on reservations.reservations
for each row execute function reservations.annulation_apres_signature();

revoke execute on function reservations.annulation_apres_signature() from public;

-- ------------------------------------------------------------
-- Contrats : versements tirés de l'échéancier de la réservation (F2)
-- ------------------------------------------------------------
-- Mêmes textes qu'avant pour un échéancier standard ; {{acompte1}},
-- {{acompte2}}, {{solde}} et leurs {{…_pct}} suivent un échéancier convenu.
-- Un modèle déjà retouché à la main garde ses phrases (remplacement exact).

update reservations.modeles set contenu =
  replace(replace(replace(replace(replace(replace(contenu,
    '| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |',
    '| 1er versement ({{acompte1_pct}}, payable sur réception de la facture) | {{acompte1}} |'),
    '| 2e versement (50 %, au plus tard le {{date_limite}}) | {{montant_50}} |',
    '| 2e versement ({{acompte2_pct}}, au plus tard le {{date_limite}}) | {{acompte2}} |'),
    '| 3e versement (25 %, payable sur réception de la facture finale) | {{montant_25}} +/- ajustements |',
    '| 3e versement ({{solde_pct}}, payable sur réception de la facture finale) | {{solde}} +/- ajustements |'),
    'Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé,',
    'Un dépôt de {{acompte1}}, représentant {{acompte1_pct}} du montant total de l’estimé,'),
    'Un second paiement de {{montant_50}}, représentant 50 % du montant total de l’estimé,',
    'Un second paiement de {{acompte2}}, représentant {{acompte2_pct}} du montant total de l’estimé,'),
    'La balance de {{montant_25}}, qui correspond aux 25 % restants du montant total de l’estimé,',
    'La balance de {{solde}}, qui correspond aux {{solde_pct}} restants du montant total de l’estimé,')
where genre = 'contrat' and forfait in ('classe_nature', 'journee_plein_air');

update reservations.modeles set contenu =
  replace(replace(replace(replace(contenu,
    '| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |',
    '| 1er versement ({{acompte1_pct}}, payable sur réception de la facture) | {{acompte1}} |'),
    '| 2e versement (75 %, au plus tard le {{date_limite}}) | {{montant_75}} |',
    '| 2e versement ({{acompte2_pct}}, au plus tard le {{date_limite}}) | {{acompte2}} |'),
    'Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé,',
    'Un dépôt de {{acompte1}}, représentant {{acompte1_pct}} du montant total de l’estimé,'),
    'La balance de {{montant_75}}, représentant 75 % du montant total de l’estimé,',
    'La balance de {{acompte2}}, représentant {{acompte2_pct}} du montant total de l’estimé,')
where genre = 'contrat' and forfait in ('accueil_groupe', 'location_salle');
