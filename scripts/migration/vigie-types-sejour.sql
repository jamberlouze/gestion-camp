-- ============================================================
-- Vigie des camps : pré-classement des programmes par type de séjour
-- (décision de Maxime du 2026-10-14 : Claude pré-classe, Maxime valide).
--
-- À lancer UNE fois, juste après la migration 20261014170019_vigie_type_sejour :
--   DEV  : docker exec -i supabase_db_gestion-camp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/migration/vigie-types-sejour.sql
--   PROD : npx supabase db query --linked -f scripts/migration/vigie-types-sejour.sql
--          (à la mise en ligne, après le « oui » de Maxime ; le script ne lit
--          rien d'avance : il se fie au nom du camp et du programme)
--
-- Tout ce que pose ce script est « à vérifier » (type_a_verifier = true) :
-- on confirme ou corrige d'un clic dans Vigie › Programmes. Un programme
-- laissé sans type (null) mais à vérifier = cas douteux (aucun des quatre
-- types ne semble convenir : camp de jour sans nuit, séjour pour adultes).
--
-- 1. Programmes connus (import du Sheets du 2026-10-03), classés un par un
--    par Claude d'après le nom et la description : clé = nom du camp + nom
--    du programme (sans tenir compte des majuscules).
-- 2. Les autres (ajoutés depuis par la recherche ou à la main) : règle par
--    mots-clés sur le nom et la description ; sans nuit = pas classé ; puis
--    le type du camp s'il n'en a qu'un ; sinon camp de vacances.
--
-- Ne touche qu'aux programmes jamais classés (type null et pas à vérifier) ;
-- le passage est noté dans vigie.parametres (clé « pre_classement_types »)
-- et le script ne fait plus rien s'il est relancé.
-- ============================================================

begin;

do $$
declare
  n_liste integer;
  n_regle integer;
begin
  if exists (select 1 from vigie.parametres where cle = 'pre_classement_types') then
    raise notice 'Pré-classement déjà fait (%), rien à faire.',
      (select valeur->>'le' from vigie.parametres where cle = 'pre_classement_types');
    return;
  end if;

  -- 1. Programmes connus -------------------------------------------------
  with liste(camp, programme, type) as (values
    ('Animatours', 'Immersion Anglaise', 'camp_vacances'),
    ('Animatours', 'Jeux vidéo (PS4)', 'camp_vacances'),
    ('Animatours', 'Ski nautique', 'camp_vacances'),
    ('Base de plein air Air Eau Bois', 'Aviron VII', 'camp_vacances'),
    ('Base de plein air Air Eau Bois', 'Aviron VIII', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Ado-X (10 jours)', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Ado-X (12 jours, 2e séjour)', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Ado-X (12 jours)', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Camp de théâtre (10 jours)', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Camp de théâtre (12 jours)', 'camp_vacances'),
    ('Base de plein air de Bellefeuille', 'Camp de voile', 'camp_vacances'),
    -- Camp de jour (5 jours, aucune nuit) : aucun des quatre types.
    ('Camp 100% Vélo, Centre National de Cyclisme de Bromont', '100% adrénaline', null),
    ('Camp 100% Vélo, Centre National de Cyclisme de Bromont', '100% route et piste', null),
    ('Camp Amy Molson', 'LIT', 'camp_vacances'),
    ('Camp Bruchési', 'Camp de sauveteur — Croix de bronze', 'camp_vacances'),
    ('Camp Bruchési', 'Camp de sauveteur — Étoile de bronze', 'camp_vacances'),
    ('Camp Bruchési', 'Camp de sauveteur — Médaille de bronze', 'camp_vacances'),
    ('Camp Bruchési', 'Camp décampe', 'camp_vacances'),
    ('Camp Bruchési', 'Gamer', 'camp_vacances'),
    ('Camp de vacances GN Écuyers', 'GN Écuyers', 'camp_vacances'),
    -- « Le parent accompagne son enfant dans toutes les activités » (4 à 8 ans).
    ('Camp de vacances Kéno', 'À l''aventure avec Arthur (mixte)', 'camp_familial'),
    ('Camp de vacances Kéno', 'Escalades (13 jours)', 'camp_vacances'),
    ('Camp de vacances Kéno', 'Escalades (6 jours)', 'camp_vacances'),
    ('Camp de vacances Kéno', 'Escalades (7 jours)', 'camp_vacances'),
    ('Camp de vacances Kéno', 'Leaders (13 jours, 13-15 ans)', 'camp_vacances'),
    ('Camp de vacances Kéno', 'Leaders (21 jours)', 'camp_vacances'),
    ('Camp De-La-Salle', 'Escalade', 'camp_vacances'),
    ('Camp De-La-Salle', 'Séjour expédition', 'camp_vacances'),
    ('Camp De-La-Salle', 'Séjour Voile', 'camp_vacances'),
    ('Camp et Auberge du Lac en Coeur', 'Initiation à la danse', 'camp_vacances'),
    ('Camp Géronimo', 'Camp de cirque (13 jours)', 'camp_vacances'),
    ('Camp Géronimo', 'Camp de cirque (5 jours)', 'camp_vacances'),
    ('Camp Géronimo', 'Camp de cirque (7 jours)', 'camp_vacances'),
    ('Camp Le Manoir', 'Camp GN', 'camp_vacances'),
    ('Camp Le Manoir', 'Camp Judo', 'camp_vacances'),
    ('Camp Le Manoir', 'Camp nature et aventure GUEPE', 'camp_vacances'),
    -- Séjours pour adultes seuls : ni camp de vacances d'enfants, ni famille, ni groupe.
    ('Camp musical du Père Lindsay', 'Camp musical pour adultes (2 nuits)', null),
    ('Camp musical du Père Lindsay', 'Camp musical pour adultes (3 nuits)', null),
    ('Camp Nomininge', 'LIT program', 'camp_vacances'),
    ('Camp Ouareau', 'Programme de leadership', 'camp_vacances'),
    ('Camp Spatial - Cosmodôme', 'Camp atlantis', 'camp_vacances'),
    ('Camp Tekakwitha', 'Pioneers', 'camp_vacances'),
    ('Centre d''équitation Sans Souci', 'Colonie de vacances', 'camp_vacances'),
    ('Centre de plein air Edphy International', 'Camp d''activités multiple', 'camp_vacances'),
    ('Centre de plein air Edphy International', 'Club explo', 'camp_vacances'),
    ('Centre de plein air Edphy International', 'Mini camp', 'camp_vacances'),
    ('Centre de plein air l''Estacade', 'Nautique', 'camp_vacances'),
    ('Centre de plein air l''Estacade', 'Plein air', 'camp_vacances'),
    ('Centre de plein air l''Estacade', 'Spécialité ados Expédition', 'camp_vacances'),
    ('Centre écologique de Port-au-Saumon', 'Ambassadeur de la nature', 'camp_vacances'),
    ('Centre écologique de Port-au-Saumon', 'Étoile de mer', 'camp_vacances'),
    ('Centre écologique de Port-au-Saumon', 'Étoile polaire', 'camp_vacances'),
    ('Centre Notre-Dame de la Rouge', 'Camp avenir-leadership', 'camp_vacances'),
    ('Centre Notre-Dame de la Rouge', 'Camps Aventure-Jeunesse (6-7 ans, 2 nuits)', 'camp_vacances'),
    ('Centre Notre-Dame de la Rouge', 'Camps Aventure-Jeunesse (8-10 ans, 5 nuits)', 'camp_vacances'),
    ('Centre Notre-Dame de la Rouge', 'Camps de l''avenir (11-13 ans, 5 nuits)', 'camp_vacances'),
    ('Centre Notre-Dame de la Rouge', 'Camps de l''avenir (14-17 ans, 6 nuits)', 'camp_vacances'),
    ('Colonie des Grèves', 'Le versatile', 'camp_vacances'),
    ('Colonie des Grèves', 'Voile sur le fleuve', 'camp_vacances'),
    -- Camp de jour.
    ('École nationale de cirque', 'Camp d''été immersion cirque (camp de jour)', null),
    ('Explo-Nature', 'Camp biologie marine', 'camp_vacances'),
    ('Ferme pédagogique Marichel', 'Le mini ferme', 'camp_vacances'),
    ('Gracefield Christian Camp & Retreat Center', 'Adventure / Woodlander (canot-camping)', 'camp_vacances'),
    ('Gracefield Christian Camp & Retreat Center', 'Music, Art, drama, dance camp (MADD)', 'camp_vacances'),
    ('Gracefield Christian Camp & Retreat Center', 'Science, technology, engineering, technology camp (STEM)', 'camp_vacances'),
    ('La Colonie Sainte-Jeanne d''Arc', 'Aventurières', 'camp_vacances'),
    ('La Colonie Sainte-Jeanne d''Arc', 'Créatives', 'camp_vacances'),
    -- Formation de jour (28 jours, aucune nuit).
    ('La Colonie Sainte-Jeanne d''Arc', 'Déploie tes ailes (formation de jour)', null),
    ('Le P''tit Bonheur de sablon', 'Les programmes sportif', 'camp_vacances'),
    ('Le P''tit Bonheur de sablon', 'Programmes thématiques', 'camp_vacances'),
    ('Les CampsRep', 'Camp D''entrainement', 'camp_vacances')
  )
  update vigie.programmes p
  set type_sejour = l.type, type_a_verifier = true
  from liste l
  join vigie.camps c on lower(c.nom) = lower(l.camp)
  where p.camp_id = c.id
    and lower(p.nom) = lower(l.programme)
    and p.type_sejour is null
    and not p.type_a_verifier;
  get diagnostics n_liste = row_count;

  -- 2. Règle par mots-clés pour les autres -------------------------------
  with textes as (
    select
      p.id,
      p.duree_nuits,
      translate(lower(coalesce(p.nom, '') || ' ' || coalesce(p.description, '')),
        'àâäáãéèêëíìîïóòôöõúùûüçœ’', 'aaaaaeeeeiiiiooooouuuuco''') as t,
      -- Types du camp qui correspondent aux quatre types de séjour.
      array(
        select case x when 'accueil_groupe' then 'groupe' else x end
        from unnest(c.types) x
        where x in ('camp_vacances', 'camp_familial', 'classe_nature', 'accueil_groupe')
      ) as types_camp
    from vigie.programmes p
    join vigie.camps c on c.id = p.camp_id
    where p.type_sejour is null and not p.type_a_verifier
  ),
  classes as (
    select id, case
      when t ~ '\mclasses? (de )?(nature|verte|vertes|neige|blanche|blanches|rouge|rouges|plein air)\M'
        or t ~ '\m(scolaire|scolaires|eleves|enseignant|enseignants|ecoles)\M'
        or t ~ '\msorties? educatives?\M'
        then 'classe_nature'
      when t ~ '\m(famille|familles|familial|familiale|familiaux|parent-enfant|grands-parents)\M'
        or t ~ '\mparents? (et|avec) (leurs? )?enfants?\M'
        or t ~ '\mparents? accompagn'
        then 'camp_familial'
      when t ~ '\m(accueil|location|forfaits?|sejours?) (de |pour |des )?groupes?\M'
        or t ~ '\mgroupes? (organises?|prives?|corporatifs?|sportifs?|adultes)\M'
        or t ~ '\m(corporatif|corporative|corporatifs|entreprise|entreprises|team building|teambuilding|congres|seminaire|seminaires)\M'
        then 'groupe'
      -- Sans nuit (camp de jour) : aucun des quatre types, à vérifier.
      when duree_nuits = 0 then null
      when cardinality(types_camp) = 1 then types_camp[1]
      else 'camp_vacances'
    end as type
    from textes
  )
  update vigie.programmes p
  set type_sejour = k.type, type_a_verifier = true
  from classes k
  where p.id = k.id;
  get diagnostics n_regle = row_count;

  insert into vigie.parametres (cle, valeur)
  values ('pre_classement_types', jsonb_build_object('le', now(), 'liste', n_liste, 'regle', n_regle));

  raise notice 'Pré-classement : % programmes par la liste, % par la règle.', n_liste, n_regle;
end $$;

-- Bilan (à vérifier = tout ce qui vient d'être posé).
select coalesce(type_sejour, '(pas classé)') as type, count(*) as programmes,
       count(*) filter (where type_a_verifier) as a_verifier
from vigie.programmes
group by 1
order by 1;

commit;
