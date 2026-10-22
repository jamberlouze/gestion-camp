-- ============================================================
-- Animation (horaire) : catégories (saisons) des activités et modèle
-- « Journée plein air ». Demandes de Maxime du 2026-10-22, d'après le Sheets
-- « Horaire école classes nature 2025-26 » (Template JPA, Template 3 jours,
-- Template 3 jours - hiver et les horaires d'écoles de 2025-26).
-- Rien de la structure ne change : les catégories vivent dans le document des
-- réglages (horaire.parametres, clé « reglages ») et dans l'état de chaque
-- horaire (etat.categorie, etat.activitesRetirees, etat.invites).
-- ============================================================

-- 1. Catégories des activités des réglages communs : seulement si les
--    réglages existent (sinon l'app prend ses valeurs par défaut, qui ont les
--    mêmes catégories : ACTIVITES_DEFAUT de logique.ts). Une activité qui a
--    déjà des catégories n'est pas touchée ; une activité connue (même nom,
--    sans égard à la casse) prend les siennes ; une activité inconnue (ajoutée
--    par l'équipe) reste sans catégorie, donc proposée partout ; les activités
--    des classes nature absentes sont ajoutées à la fin.
do $migration$
declare
  proposees jsonb := $activites$
  [
    {"name":"Baignade","tags":["sauveteur"],"categories":["verte","ete"]},
    {"name":"Kayak","tags":["sauveteur"],"categories":["verte","ete","rouge"]},
    {"name":"Canot","tags":["sauveteur"],"categories":["verte","ete","rouge"]},
    {"name":"Paddle","tags":["sauveteur"],"categories":["verte","ete","rouge"]},
    {"name":"Pedalo","tags":["sauveteur"],"categories":["verte","ete"]},
    {"name":"Rabaska","tags":["sauveteur"],"categories":["verte","ete","rouge"]},
    {"name":"Aquabounga","tags":[],"categories":["verte","ete"]},
    {"name":"Kayak de rivière","tags":["transport"],"categories":["verte","ete","rouge"]},
    {"name":"Canot-camping","tags":["transport"],"categories":["ete"]},
    {"name":"Rando-camping","tags":["transport"],"categories":["ete"]},
    {"name":"Rando explo","tags":["transport"],"categories":["ete"]},
    {"name":"Rando - Rabaska","tags":["transport"],"categories":["ete"]},
    {"name":"Escalade","tags":["escalade","transport"],"categories":["verte","ete","rouge"]},
    {"name":"Accrobranche / Jeux COOP","tags":[],"categories":["ete"]},
    {"name":"Accrobranche","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Tir à l'arc","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Tag à l'arc","tags":[],"categories":["verte","ete","rouge","blanche"]},
    {"name":"Orientation","tags":[],"categories":["ete","blanche"]},
    {"name":"Disque golf","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Brico-nat","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Abris/Survie","tags":[],"categories":["ete"]},
    {"name":"Trou de bouette","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Prep spectacle","tags":[],"categories":["ete","blanche"]},
    {"name":"Prep Camping","tags":[],"categories":["ete"]},
    {"name":"Retour Camping","tags":[],"categories":["ete"]},
    {"name":"Jeux coop","tags":[],"categories":["verte","ete","rouge","blanche"]},
    {"name":"Sports collectif","tags":[],"categories":["verte","ete","rouge","blanche"]},
    {"name":"Cirque","tags":[],"categories":["ete"]},
    {"name":"Ultimate","tags":[],"categories":["ete"]},
    {"name":"Soccer","tags":[],"categories":["ete"]},
    {"name":"Bootcamp","tags":[],"categories":["ete"]},
    {"name":"Parc aquatique / Journée commune","tags":[],"categories":["ete"]},
    {"name":"SPECTACLE !","tags":[],"categories":["verte","ete","rouge"]},
    {"name":"Congé","tags":[],"categories":["ete"]},
    {"name":"Survie en forêt","tags":[],"categories":["verte","rouge","blanche"]},
    {"name":"Chasse au trésor","tags":[],"categories":["verte","rouge","blanche"]},
    {"name":"Rallye photo","tags":[],"categories":["verte","rouge"]},
    {"name":"Kermesse (Foire)","tags":[],"categories":["verte","rouge"]},
    {"name":"Glissade forêt/lac","tags":[],"categories":["blanche"]},
    {"name":"Ballon-balais","tags":[],"categories":["blanche"]},
    {"name":"Raquette en forêt","tags":[],"categories":["blanche"]},
    {"name":"Ultimate frisbee glacé","tags":[],"categories":["blanche"]},
    {"name":"Construction de Quinzee","tags":[],"categories":["blanche"]},
    {"name":"Atelier feu","tags":[],"categories":["blanche"]},
    {"name":"Course à obstacles dans la neige","tags":[],"categories":["blanche"]}
  ]
  $activites$::jsonb;
  actuelles jsonb;
  resultat jsonb;
begin
  select valeur->'activites' into actuelles from horaire.parametres where cle = 'reglages';
  if actuelles is null or jsonb_typeof(actuelles) <> 'array' then
    return;
  end if;

  select coalesce(jsonb_agg(
           case
             when a ? 'categories' then a
             else coalesce(
               a || (select jsonb_build_object('categories', p->'categories')
                       from jsonb_array_elements(proposees) p
                      where lower(btrim(p->>'name')) = lower(btrim(a->>'name'))
                      limit 1),
               a)
           end order by n), '[]'::jsonb)
    into resultat
    from jsonb_array_elements(actuelles) with ordinality as t(a, n);

  select resultat || coalesce(jsonb_agg(p order by n), '[]'::jsonb)
    into resultat
    from jsonb_array_elements(proposees) with ordinality as t(p, n)
   where not exists (
     select 1 from jsonb_array_elements(actuelles) a
      where lower(btrim(a->>'name')) = lower(btrim(p->>'name')));

  update horaire.parametres
     set valeur = jsonb_set(valeur, '{activites}', resultat)
   where cle = 'reglages';
end
$migration$;

-- 2. Modèle « Journée plein air » (onglet Template JPA) : un jour, cinq
--    groupes, arrivée 10 h 30, départ 15 h 30, pas de soirée. Les activités
--    sont celles du gabarit (sans le préfixe Forêt / Plage), à changer pour
--    chaque école. Pas de catégorie : elle se choisit en créant la semaine
--    (proposée d'après la date). Rien si un modèle porte déjà ce nom.
insert into horaire.horaires (nom, modele, etat)
values ('Journée plein air', true, $etat$
{
  "jours": [
    "Lundi"
  ],
  "periodes": [
    "10h30",
    "10h30 - 11h00",
    "11h00 - 12h00",
    "12h00 - 12h45",
    "12h45 - 14h00",
    "14h00 - 15h15",
    "15h15 - 15h30",
    "15h30"
  ],
  "groupes": [
    {
      "id": 1,
      "num": "1",
      "anim": "",
      "age": "",
      "section": "",
      "conge": "",
      "remp": ""
    },
    {
      "id": 2,
      "num": "2",
      "anim": "",
      "age": "",
      "section": "",
      "conge": "",
      "remp": ""
    },
    {
      "id": 3,
      "num": "3",
      "anim": "",
      "age": "",
      "section": "",
      "conge": "",
      "remp": ""
    },
    {
      "id": 4,
      "num": "4",
      "anim": "",
      "age": "",
      "section": "",
      "conge": "",
      "remp": ""
    },
    {
      "id": 5,
      "num": "5",
      "anim": "",
      "age": "",
      "section": "",
      "conge": "",
      "remp": ""
    }
  ],
  "cellules": {
    "1|Lundi|10h30": "Arrivée du groupe",
    "2|Lundi|10h30": "Arrivée du groupe",
    "3|Lundi|10h30": "Arrivée du groupe",
    "4|Lundi|10h30": "Arrivée du groupe",
    "5|Lundi|10h30": "Arrivée du groupe",
    "1|Lundi|10h30 - 11h00": "Règlements et division des groupes",
    "2|Lundi|10h30 - 11h00": "Règlements et division des groupes",
    "3|Lundi|10h30 - 11h00": "Règlements et division des groupes",
    "4|Lundi|10h30 - 11h00": "Règlements et division des groupes",
    "5|Lundi|10h30 - 11h00": "Règlements et division des groupes",
    "1|Lundi|11h00 - 12h00": "Tir à l'arc",
    "2|Lundi|11h00 - 12h00": "Kayak",
    "3|Lundi|11h00 - 12h00": "Tag à l'arc",
    "4|Lundi|11h00 - 12h00": "Survie en forêt",
    "5|Lundi|11h00 - 12h00": "Disque golf",
    "1|Lundi|12h00 - 12h45": "Dîner supervisé par les profs (tables à pique-nique ou salle à manger du bas)",
    "2|Lundi|12h00 - 12h45": "Dîner supervisé par les profs (tables à pique-nique ou salle à manger du bas)",
    "3|Lundi|12h00 - 12h45": "Dîner supervisé par les profs (tables à pique-nique ou salle à manger du bas)",
    "4|Lundi|12h00 - 12h45": "Dîner supervisé par les profs (tables à pique-nique ou salle à manger du bas)",
    "5|Lundi|12h00 - 12h45": "Dîner supervisé par les profs (tables à pique-nique ou salle à manger du bas)",
    "1|Lundi|12h45 - 14h00": "Tir à l'arc",
    "2|Lundi|12h45 - 14h00": "Kayak",
    "3|Lundi|12h45 - 14h00": "Tag à l'arc",
    "4|Lundi|12h45 - 14h00": "Survie en forêt",
    "5|Lundi|12h45 - 14h00": "Disque golf",
    "1|Lundi|14h00 - 15h15": "Kayak",
    "2|Lundi|14h00 - 15h15": "Tir à l'arc",
    "3|Lundi|14h00 - 15h15": "Rabaska",
    "4|Lundi|14h00 - 15h15": "Rabaska",
    "5|Lundi|14h00 - 15h15": "Tag à l'arc",
    "1|Lundi|15h15 - 15h30": "Rassemblement à la petite scène et crazy signs",
    "2|Lundi|15h15 - 15h30": "Rassemblement à la petite scène et crazy signs",
    "3|Lundi|15h15 - 15h30": "Rassemblement à la petite scène et crazy signs",
    "4|Lundi|15h15 - 15h30": "Rassemblement à la petite scène et crazy signs",
    "5|Lundi|15h15 - 15h30": "Rassemblement à la petite scène et crazy signs",
    "1|Lundi|15h30": "Départ du groupe",
    "2|Lundi|15h30": "Départ du groupe",
    "3|Lundi|15h30": "Départ du groupe",
    "4|Lundi|15h30": "Départ du groupe",
    "5|Lundi|15h30": "Départ du groupe"
  },
  "fusions": {},
  "chouettes": {},
  "jeux": {},
  "surv": {},
  "transport": {},
  "nuits": []
}
$etat$::jsonb)
on conflict on constraint horaires_nom_unique do nothing;
