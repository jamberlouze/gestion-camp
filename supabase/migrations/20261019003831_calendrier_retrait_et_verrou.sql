-- ============================================================
-- Calendrier : corrections de l'audit du 2026-10-06.
--
-- 1. Retirer une personne (Réglages › Personnel) retire aussi ses
--    présences à partir du jour du retrait (heure de Montréal) ; ses
--    journées passées restent (période de paie, historique). Avant, ses
--    présences à venir restaient dans la grille sans qu'on puisse les
--    décocher et comptaient dans la vue Mois. v_presence_jour ignore en
--    plus toute présence d'une personne retirée à partir de ce jour-là.
-- 2. Synchros Airtable simultanées (cron, bouton, automatisation
--    Airtable) : synchroniser_sejours prend un verrou, la deuxième attend
--    la fin de la première au lieu de se heurter à ses ajouts.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Retrait d'une personne
-- ------------------------------------------------------------
create or replace function calendrier.retirer_presences_a_venir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Journalisé comme une suppression, au nom de qui retire la personne.
  update calendrier.presences_simples
  set deleted_at = now()
  where personnel_id = new.id
    and deleted_at is null
    and date >= (new.deleted_at at time zone 'America/Toronto')::date;
  return null;
end;
$$;

revoke execute on function calendrier.retirer_presences_a_venir() from public, anon, authenticated;

create trigger trg_personnel_retrait
  after update of deleted_at on calendrier.personnel
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function calendrier.retirer_presences_a_venir();

-- Personnes déjà retirées : même règle, comme si elle avait existé.
update calendrier.presences_simples ps
set deleted_at = now()
from calendrier.personnel p
where p.id = ps.personnel_id
  and p.deleted_at is not null
  and ps.deleted_at is null
  and ps.date >= (p.deleted_at at time zone 'America/Toronto')::date;

-- Vue commune : inchangée, sauf la dernière condition (personne retirée).
create or replace view calendrier.v_presence_jour with (security_invoker = true) as
  select q.personne_id as personnel_id, p.nom, q.jour as date, 'cuisine'::text as secteur,
         coalesce(f.nom, 'Cuisine') as description, null::text as statut
  from commande.quarts q
  join commande.personnel p on p.id = q.personne_id
  left join commande.fonctions f on f.id = p.fonction_id
  where calendrier.quart_travaille(q.texte)
    and not exists (
      select 1 from calendrier.personnel cp
      where cp.personne_cuisine_id = q.personne_id and cp.deleted_at is null
    )
  union all
  -- Animation : chaque groupe de chaque horaire daté, chaque jour ; pendant
  -- son congé, l'animateur est remplacé (ou absent, sans remplaçant).
  -- Identifiant : l'employé du référentiel (core.employes, par surnom).
  select coalesce(e.id, md5('horaire:' || a.anim)::uuid), a.anim, a.date, 'animation',
         string_agg(distinct case when a.num <> '' then 'Groupe ' || a.num else 'Animation' end, ', '),
         null::text
  from (
    select calendrier.date_du_jour(h.debut, j.jour) as date,
           btrim(coalesce(g ->> 'num', '')) as num,
           nullif(btrim(case when j.jour = any (calendrier.jours_conge(g ->> 'conge'))
                             then coalesce(g ->> 'remp', '') else coalesce(g ->> 'anim', '') end), '') as anim
    from horaire.horaires h
    cross join lateral jsonb_array_elements_text(coalesce(h.etat -> 'jours', '[]'::jsonb)) as j(jour)
    cross join lateral jsonb_array_elements(coalesce(h.etat -> 'groupes', '[]'::jsonb)) as g
    where not h.modele and h.debut is not null
      and j.jour in ('Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi')
  ) a
  left join core.employes e on e.surnom = a.anim
  where a.anim is not null
  group by coalesce(e.id, md5('horaire:' || a.anim)::uuid), a.anim, a.date
  union all
  select ps.personnel_id, p.nom, ps.date, ps.secteur,
         coalesce(concat_ws(' · ', case when ps.statut = 'teletravail' then 'Télétravail' end, nullif(btrim(ps.description), '')), ''),
         ps.statut
  from calendrier.presences_simples ps
  join calendrier.personnel p on p.id = ps.personnel_id
  where ps.deleted_at is null
    and ps.statut is distinct from 'conge'
    and (p.deleted_at is null or ps.date < (p.deleted_at at time zone 'America/Toronto')::date);

-- ------------------------------------------------------------
-- 2. Une synchro à la fois
-- ------------------------------------------------------------
-- Corps inchangé (20261004000020_calendrier.sql), sauf le verrou du début.
create or replace function calendrier.synchroniser_sejours(p_sejours jsonb, p_source text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ajoutes integer;
  v_modifies integer;
  v_retires integer;
  v_recus integer := jsonb_array_length(p_sejours);
begin
  -- Deux synchros en même temps (cron, bouton, automatisation Airtable) :
  -- la deuxième attend la fin de la première (verrou relâché au commit),
  -- puis compare avec ce que la première a écrit.
  perform pg_advisory_xact_lock(hashtext('calendrier.synchroniser_sejours'));

  -- Garde-fou : une liste vide viendrait d'une erreur (jeton, filtre),
  -- pas d'une base Airtable vidée d'un coup.
  if v_recus = 0 and exists (select 1 from calendrier.sejours where deleted_at is null) then
    raise exception 'Airtable n''a renvoyé aucun séjour : rien n''est retiré.';
  end if;

  -- Deux appels dans la même transaction : la table du premier existe encore.
  drop table if exists pg_temp.entrants;
  create temporary table entrants on commit drop as
  select * from jsonb_to_recordset(p_sejours) as s(
    airtable_record_id text, numero text, nom_groupe text, type_sejour text, etat text,
    date_arrivee date, date_depart date, heure_arrivee time, heure_depart time,
    section_batiment text, batiment text, nb_participants integer, nb_animateurs integer,
    avec_animation boolean, avec_repas boolean, notes text, raw jsonb
  );

  with maj as (
    update calendrier.sejours s set
      numero = e.numero, nom_groupe = e.nom_groupe, type_sejour = e.type_sejour, etat = e.etat,
      date_arrivee = e.date_arrivee, date_depart = e.date_depart,
      heure_arrivee = e.heure_arrivee, heure_depart = e.heure_depart,
      section_batiment = e.section_batiment, batiment = e.batiment,
      nb_participants = e.nb_participants, nb_animateurs = e.nb_animateurs,
      avec_animation = coalesce(e.avec_animation, false), avec_repas = coalesce(e.avec_repas, false),
      notes = e.notes, raw = e.raw, synced_at = now(), deleted_at = null
    from entrants e
    where s.airtable_record_id = e.airtable_record_id
      and (s.numero, s.nom_groupe, s.type_sejour, s.etat, s.date_arrivee, s.date_depart,
           s.heure_arrivee, s.heure_depart, s.section_batiment, s.batiment, s.nb_participants,
           s.nb_animateurs, s.avec_animation, s.avec_repas, s.notes, s.raw, s.deleted_at)
        is distinct from
          (e.numero, e.nom_groupe, e.type_sejour, e.etat, e.date_arrivee, e.date_depart,
           e.heure_arrivee, e.heure_depart, e.section_batiment, e.batiment, e.nb_participants,
           e.nb_animateurs, coalesce(e.avec_animation, false), coalesce(e.avec_repas, false), e.notes, e.raw, null::timestamptz)
    returning 1
  )
  select count(*) into v_modifies from maj;

  with ins as (
    insert into calendrier.sejours (
      airtable_record_id, numero, nom_groupe, type_sejour, etat, date_arrivee, date_depart,
      heure_arrivee, heure_depart, section_batiment, batiment, nb_participants, nb_animateurs,
      avec_animation, avec_repas, notes, raw)
    select e.airtable_record_id, e.numero, e.nom_groupe, e.type_sejour, e.etat, e.date_arrivee, e.date_depart,
      e.heure_arrivee, e.heure_depart, e.section_batiment, e.batiment, e.nb_participants, e.nb_animateurs,
      coalesce(e.avec_animation, false), coalesce(e.avec_repas, false), e.notes, e.raw
    from entrants e
    where not exists (select 1 from calendrier.sejours s where s.airtable_record_id = e.airtable_record_id)
    returning 1
  )
  select count(*) into v_ajoutes from ins;

  with ret as (
    update calendrier.sejours s set deleted_at = now()
    where s.deleted_at is null
      and not exists (select 1 from entrants e where e.airtable_record_id = s.airtable_record_id)
    returning 1
  )
  select count(*) into v_retires from ret;

  insert into calendrier.synchros (source, recus, ajoutes, modifies, retires)
  values (coalesce(p_source, 'cron'), v_recus, v_ajoutes, v_modifies, v_retires);

  return jsonb_build_object('recus', v_recus, 'ajoutes', v_ajoutes, 'modifies', v_modifies, 'retires', v_retires);
end;
$$;
