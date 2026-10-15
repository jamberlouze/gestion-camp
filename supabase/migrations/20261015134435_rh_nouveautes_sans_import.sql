-- ============================================================
-- rh, phase 5 (plan-rh.md §15) : le résumé quotidien ignore les données
-- importées d'Airtable.
--
-- Constaté à la répétition de l'import en DEV (2026-10-15) : le premier
-- résumé après un import listait les candidatures et les dossiers entrés
-- dans Airtable dans les 24 heures d'avant (déjà annoncés par Airtable).
-- Une ligne importée a un airtable_id : elle n'est jamais une « nouveauté ».
-- Seul changement : les deux conditions « airtable_id is null ».
-- ============================================================

create or replace function rh.nouveautes(p_depuis timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'candidatures', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'id', c.id) order by c.recue_le)
      from rh.candidatures c join rh.personnes p on p.id = c.personne_id
      where c.source = 'formulaire' and c.recue_le > p_depuis and c.airtable_id is null), '[]'),
    'retours', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'reponse', i.reponse, 'saison', s.nom) order by i.repondu_le)
      from rh.invitations i join rh.personnes p on p.id = i.personne_id join rh.saisons s on s.id = i.saison_id
      where i.repondu_le > p_depuis), '[]'),
    'dossiers', coalesce((select jsonb_agg(jsonb_build_object('nom', p.prenom || ' ' || p.nom_famille, 'saison', s.nom, 'id', p.id) order by e.dossier_recu_le)
      from rh.embauches e join rh.personnes p on p.id = e.personne_id join rh.saisons s on s.id = e.saison_id
      where e.dossier_recu_le > p_depuis and e.airtable_id is null), '[]'))
$$;

-- Mêmes droits qu'avant (create or replace les garde ; redits par prudence).
revoke execute on function rh.nouveautes(timestamptz) from public, anon, authenticated;
grant execute on function rh.nouveautes(timestamptz) to service_role;
