-- Vigie des camps (décisions du 2026-10-05, après l'essai sur 5 camps) :
-- 1. modèle par défaut Claude Sonnet 5.5 (environ deux fois moins cher qu'Opus) ;
-- 2. une activité déjà offerte à la BPA est liée au camp sans validation
--    (la fonction Edge le fait désormais d'elle-même) : on applique ici
--    celles qui attendaient déjà dans « À valider ».

update vigie.parametres
set valeur = valeur || jsonb_build_object('modele', 'claude-sonnet-5-5')
where cle = 'reglages';

do $$
declare c record;
begin
  for c in
    select ch.id from vigie.changements ch
    join vigie.activites a on a.id = ch.activite_id
    where ch.type = 'nouvelle_activite' and ch.statut = 'a_valider' and a.offert_bpa
  loop
    perform vigie.valider_changement(c.id, true);
  end loop;
end $$;
