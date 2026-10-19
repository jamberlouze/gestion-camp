-- ============================================================
-- Référentiel Employés : courriel et matricule Employeur D cachés
-- (audit du 2026-10-19, réponse de Maxime : « pas normal »).
--
-- Toute personne active lisait toute la fiche des employés, dont le
-- courriel et le matricule Employeur D (paie). Les fiches restent
-- lisibles par tous (noms : Animation, Rooming, Subventions, Calendrier…),
-- mais ces deux colonnes ne le sont plus (droits par colonne, comme la
-- paie du RH) : la direction et qui lit le RH les obtiennent par
-- core.employes_complets(), les autres y voient null.
--
-- Nouvelle colonne de core.employes : l'ajouter au « grant select (…) »
-- ci-dessous si elle n'est pas confidentielle, sinon elle reste illisible
-- hors de core.employes_complets().
-- ============================================================

revoke select on core.employes from authenticated;
grant select (id, surnom, prenom, nom_famille, nom_complet, poste, secteur, entreprise_ids, actif, airtable_id, created_at, updated_at)
  on core.employes to authenticated;

-- Toute la fiche, courriel et matricule compris pour la direction et le
-- RH ; les autres personnes actives reçoivent ces deux colonnes à null.
create function core.employes_complets()
returns setof core.employes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e core.employes;
  v_tout boolean := core.est_direction() or core.peut_lire('rh');
begin
  if core.role_actuel() is null then
    return;
  end if;
  for e in select * from core.employes loop
    if not v_tout then
      e.courriel := null;
      e.matricule_employeur_d := null;
    end if;
    return next e;
  end loop;
end;
$$;

revoke execute on function core.employes_complets() from public, anon;
grant execute on function core.employes_complets() to authenticated;

-- Le contrôle d'unicité du matricule lit celui des autres fiches : il ne
-- dépend plus des droits de qui écrit (la RLS réserve l'écriture à la
-- direction).
alter function core.verifier_matricule_employeur_d() security definer;
revoke execute on function core.verifier_matricule_employeur_d() from public, anon, authenticated;
