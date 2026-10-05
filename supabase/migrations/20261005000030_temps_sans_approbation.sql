-- ============================================================
-- temps : plus de circuit d'approbation (décision de la direction,
-- 2026-10-05). Chacun saisit et corrige sa feuille en tout temps ; un
-- admin peut corriger n'importe quelle feuille. `feuilles` ne garde que
-- la note de la période.
--
-- Les règles de lecture ne changent pas : sa feuille seulement, toutes
-- pour un admin, jamais pour un autre rôle (temps.role_autorise).
-- ============================================================

-- Modifier les heures ou la note de p_user : soi-même ou un admin.
create or replace function temps.peut_modifier(p_user uuid, p_jour date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select temps.a_acces() and (p_user = auth.uid() or core.est_admin())
$$;

drop function temps.changer_statut(uuid, date, text);
drop function temps.feuille_ouverte(uuid, date);

alter table temps.feuilles
  drop column statut,
  drop column soumise_le,
  drop column approuvee_le,
  drop column approuvee_par;

comment on table temps.feuilles is 'Note de la période, une ligne par personne et par période (créée à la première note)';
