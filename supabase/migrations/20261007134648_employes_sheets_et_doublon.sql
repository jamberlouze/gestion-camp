-- ============================================================
-- Données (demande de Maxime du 2026-10-07).
--
-- 1. Employés du Google Sheets « Feuille de temps - BPA/Opikawa/R&D/
--    Aquabounga », onglet de la période du 4 au 17 octobre 2026 : nom complet,
--    poste (« Vrai poste »), secteur (« Service ») et compagnie (tous chez
--    Gestion BPA+ = GBPA+). Les 5 personnes au poste « Direction » sont
--    exclues (elles ont leur propre feuille, choix de Maxime). Surnom = nom de
--    camp (sans le suffixe « GBPA+ »), sinon « Prénom Nom ». Un employé déjà
--    là (même surnom) garde ce qui est déjà rempli ; seuls les champs vides
--    sont complétés.
--
-- 2. Vigie de subventions : la recherche rattachée à la compagnie
--    « … DOUBLON » (créée par la migration core_entreprises, faute de
--    correspondance de nom) passe à BPA inc., avec toutes ses subventions ;
--    la compagnie DOUBLON, qui ne sert plus à rien, est retirée.
-- ============================================================

insert into core.employes (surnom, nom_complet, poste, secteur, entreprise_ids)
select v.surnom, v.nom_complet, v.poste, v.secteur,
       array(select e.id from core.entreprises e where e.abreviation = 'GBPA+' or e.nom = 'GBPA+' order by e.ordre limit 1)
  from (values
    ('Baobab', 'Ahyte, Wesley', 'Terrain', 'Opération'),
    ('Christiane Belisle', 'Belisle, Christiane', 'Cuisinier', 'Cuisine'),
    ('Luc Brunette', 'Brunette, Luc', 'Cuisinier', 'Cuisine'),
    ('Glitch', 'Corriveau, Maxime', 'Conseiller', 'Administration'),
    ('Tajin', 'Crespo Galindo, Anna Sofia', 'Marmitton', 'Cuisine'),
    ('Fanta', 'Damerval, Kyllian', 'Terrain', 'Opération'),
    ('Kiwi', 'Eddaoudi, Wissal', 'Animateur', 'Animation'),
    ('Andouille', 'Gagnon, Vincent', 'Stage', 'Administration'),
    ('Ikea', 'Grenier, Dominique', 'Entretien', 'Entretien'),
    ('Christine Guay', 'Guay, Christine', 'Cuisinier', 'Cuisine'),
    ('Garfield', 'Bélisle, Théo', 'Marmitton', 'Cuisine'),
    ('La Frite', 'Khtouta, Younes', 'Adjoint administratif', 'Administration'),
    ('Tisane', 'Latour, Sarah', 'Cuisinier', 'Cuisine'),
    ('Ketchup', 'LeDocte, Maria Flavia', 'Animateur', 'Animation'),
    ('Moutic', 'Lemoignet, Gwladys', 'Marmitton', 'Cuisine'),
    ('Syl', 'Martinaud, Cécile', 'Animateur', 'Animation'),
    ('Swiffer', 'Morin, Sylvie', 'Entretien', 'Entretien'),
    ('Andalouse', 'Neyken, Bérénice', 'Animateur', 'Animation'),
    ('Gazébo', 'Plourde, Léonie', 'Animateur', 'Animation'),
    ('Plume', 'Rollain, Paloma', 'Animateur', 'Animation'),
    ('Babaga', 'Rourke, Lily', 'Animateur', 'Animation'),
    ('Cannelle', 'Routier, Annaëlle', 'Animateur', 'Animation'),
    ('Couscous', 'Saliou, Emma', 'Animateur', 'Animation'),
    ('Étoile', 'Siller Prado, Marely', 'Animateur', 'Animation'),
    ('Frédérique Therriault', 'Therriault, Frédérique', 'Gestion', 'Cuisine')
  ) as v(surnom, nom_complet, poste, secteur)
on conflict (surnom) do update set
  nom_complet = coalesce(core.employes.nom_complet, excluded.nom_complet),
  poste = coalesce(core.employes.poste, excluded.poste),
  secteur = coalesce(core.employes.secteur, excluded.secteur),
  entreprise_ids = case when cardinality(core.employes.entreprise_ids) = 0 then excluded.entreprise_ids
                        else core.employes.entreprise_ids end;

do $$
declare
  v_bpa uuid := (select e.id from core.entreprises e
                  where e.nom not like '%DOUBLON%'
                    and (e.abreviation in ('BPA inc.', 'BPA inc') or e.nom in ('BPA inc.', 'Base de Plein Air Mont-Tremblant inc'))
                  order by e.ordre limit 1);
  v_doublons uuid[] := array(select e.id from core.entreprises e where e.nom like '%DOUBLON%');
begin
  if cardinality(v_doublons) = 0 then
    return;  -- rien à corriger (DEV)
  end if;
  if v_bpa is null then
    raise exception 'Compagnie BPA inc. introuvable.';
  end if;
  if exists (select 1 from subventions.grant_companies g where g.entreprise_id = v_bpa) then
    raise exception 'BPA inc. a déjà sa recherche : fusion à faire à la main.';
  end if;
  update subventions.grant_companies set entreprise_id = v_bpa where entreprise_id = any (v_doublons);
  -- Retirée seulement si plus rien ne s'en sert.
  if exists (select 1 from mastertimeline.taches where entreprise_id = any (v_doublons))
     or exists (select 1 from mastertimeline.projets where entreprise_ids && v_doublons)
     or exists (select 1 from achats.achats where entreprise_id = any (v_doublons))
     or exists (select 1 from core.employes where entreprise_ids && v_doublons) then
    raise exception 'La compagnie DOUBLON sert encore ailleurs : rien n''est retiré.';
  end if;
  delete from core.entreprises where id = any (v_doublons);
end $$;
