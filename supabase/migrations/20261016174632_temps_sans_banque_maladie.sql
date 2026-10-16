-- ============================================================
-- Feuilles de temps : plus de banque maladie dans l'app (décision de
-- Maxime du 2026-10-16). La banque maladie est tenue dans Employeur D,
-- comme les vacances ; l'app garde seulement la banque d'heures
-- (heures accumulées). Les heures de maladie restent saisies dans les
-- feuilles et partent dans l'export avec leur code d'utilisation.
--
-- Rien n'est effacé : les jours de maladie par année (temps.jours_maladie)
-- et les ajustements « maladie » déjà saisis restent en base, en archive
-- (l'app ne les lit plus), le temps de reporter les soldes dans
-- Employeur D. Seules les écritures sont fermées.
-- ============================================================

-- Jours de maladie par année : plus modifiables.
drop function temps.regler_jours_maladie(uuid, uuid, int, numeric);

comment on table temps.jours_maladie is
  'Archive (plus lue ni modifiée par l''app depuis le 2026-10-16 : la banque maladie est dans Employeur D). Jours de maladie accordés chaque 1er janvier, à partir de l''année indiquée (sans ligne : 2 jours)';

-- Ajustements : la banque d'heures seulement, pour toute nouvelle ligne
-- (les lignes « maladie » d'avant restent, d'où « not valid »).
alter table temps.ajustements_banques
  add constraint ajustements_banque_heures check (banque = 'heures') not valid;

comment on table temps.ajustements_banques is
  'Ajustements manuels de la banque d''heures : solde de départ, heures payées, départ… ; jamais modifiés ni effacés. Les lignes « maladie » d''avant le 2026-10-16 sont une archive (banque maladie dans Employeur D)';

-- Même fonction, avec un message clair si on demande une autre banque.
create or replace function temps.ajuster_banque(
  p_user uuid, p_employe uuid, p_banque text, p_jour date, p_heures numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not temps.peut_regler_banque(p_user, p_employe) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_banque is distinct from 'heures' then
    raise exception 'Seule la banque d''heures est dans l''app (vacances et maladie : Employeur D).' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Écrivez une note (ex. solde de départ, heures payées).' using errcode = 'check_violation';
  end if;
  insert into temps.ajustements_banques (user_id, employe_id, banque, jour, heures, note, auteur, auteur_nom)
  values (p_user, p_employe, p_banque, p_jour, p_heures, btrim(p_note), auth.uid(), temps.nom_actuel())
  returning id into v_id;
  return v_id;
end;
$$;
