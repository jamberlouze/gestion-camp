"""
Import ponctuel de la vigie des camps (Google Sheets « BPA_Vigie_ Comparatif
des camps », onglet « Camp de vacances Qc ») vers le schéma vigie.

Entrées (hors dépôt, scripts/migration/sauvegarde/vigie/) :
  qc.json        : onglet exporté (une entrée par camp, clés « colonne:titre »)
  bpa_offre.json : offre actuelle de la BPA (site camptremblant.com, 2026-10-03)
Sortie :
  sauvegarde/vigie.sql, à lancer avec
  npx supabase db query --linked -f scripts/migration/sauvegarde/vigie.sql

Les colonnes « Activités » / « Activités que nous n'avons pas » ne sont pas
reprises telles quelles : le texte libre a été interprété (2026-10-03) et
regroupé en activités candidates communes (CATALOGUE), puis chaque camp est
lié aux activités qu'il offre (LIENS). Les coûts sont des estimés de Claude
(ordre de grandeur, dollars canadiens, taxes en sus) à raffiner.
"""

import json
import re
import sys
from pathlib import Path

ICI = Path(__file__).parent / 'sauvegarde'
camps_bruts = json.loads((ICI / 'vigie' / 'qc.json').read_text())

# ------------------------------------------------------------------ catalogue
# clé : (nom, saisons, offert_bpa, implantation $, opération $/an, description, hypothèses)
H, P, E, A = 'hiver', 'printemps', 'ete', 'automne'
QUATRE = [H, P, E, A]
TROIS = [P, E, A]

CATALOGUE = {
    # --- Offertes à la BPA (site camptremblant.com, 2026-10-03) ---------------
    'accrobranche': ("Accrobranche (parcours d'arbre en arbre)", [E], True, None, None, "Parcours aérien dans les arbres (ponts, filets, tyroliennes courtes).", None),
    'canot': ('Canot', TROIS, True, None, None, None, None),
    'kayak': ('Kayak', TROIS, True, None, None, None, None),
    'paddle': ('Planche à pagaie (paddle board)', TROIS, True, None, None, None, None),
    'rabaska': ('Rabaska', TROIS, True, None, None, None, None),
    'canot_camping': ('Canot-camping et expéditions courtes', [E], True, None, None, "Expéditions de 2 à 3 jours (programme EXPÉ).", None),
    'camping': ('Nuit en camping', [E], True, None, None, None, None),
    'escalade': ('Escalade sur paroi naturelle', [E], True, None, None, None, None),
    'tir_arc': ("Tir à l'arc", TROIS, True, None, None, None, None),
    'tag_arc': ("Tag à l'arc", QUATRE, True, None, None, None, None),
    'disque_golf': ('Disque-golf', [E], True, None, None, None, None),
    'survie': ('Survie en forêt', QUATRE, True, None, None, None, None),
    'orientation': ('Orientation en forêt', [E], True, None, None, None, None),
    'randonnee': ('Randonnée et rando-camping', [P, E], True, None, None, None, None),
    'chasse_tresor': ('Chasse au trésor', QUATRE, True, None, None, None, None),
    'grand_jeu': ('Grands jeux et jeux de nuit', QUATRE, True, None, None, None, None),
    'feu_camp': ('Feu de camp', QUATRE, True, None, None, None, None),
    'contes': ('Histoires et contes', QUATRE, True, None, None, None, None),
    'brico_nature': ('Brico-nature', QUATRE, True, None, None, None, None),
    'yoga': ('Yoga en nature', TROIS, True, None, None, None, None),
    'spectacle': ('Préparation de spectacle', [E, H], True, None, None, None, None),
    'sports_collectifs': ('Sports collectifs (soccer, volleyball, basket-ball…)', QUATRE, True, None, None, None, None),
    'baignade': ('Baignade et plage', [E], True, None, None, None, None),
    'aquabounga': ('Parcours gonflable sur le lac (Aquabounga)', [E], True, None, None, None, None),
    'trou_bouette': ('Trou de bouette', [E], True, None, None, None, None),
    'kayak_riviere': ('Kayak de rivière (eaux vives)', [E], True, None, None, None, None),
    'rafting': ('Rafting', [E], True, None, None, "Sortie payante.", None),
    'sauveteur': ('Cours de sauveteur (Société de sauvetage)', [E], True, None, None, "Programme SAUVETEUR de 21 jours.", None),
    'raquette': ('Raquette', [H], True, None, None, None, None),
    'ski_fond': ('Ski de fond', [H], True, None, None, "Option payante.", None),
    'ski_alpin': ('Ski alpin et planche à neige', [H], True, None, None, "Sortie payante (relâche, classe blanche).", None),
    'glissade_tubes': ('Glissade sur tubes', [H], True, None, None, "Option payante.", None),
    'luge': ('Glissade (luge)', [H], True, None, None, None, None),
    'quinzhee': ('Construction de quinzhee', [H], True, None, None, None, None),
    'patin': ('Patin à glace', [H], True, None, None, None, None),
    'ballon_balai': ('Ballon-balai', [H], True, None, None, None, None),
    'trottinette_ski': ('Trottinette des neiges', [H], True, None, None, None, None),
    'traineau_chiens': ('Traîneau à chiens', [H], True, None, None, "Option offerte avec un partenaire (classe blanche).", None),
    'peche_glace': ('Pêche sur glace', [H], True, None, None, "Option offerte avec un partenaire (classe blanche).", None),
    'escalade_glace': ('Escalade de glace', [H], True, None, None, "Option offerte avec un partenaire (classe blanche).", None),

    # --- Candidates (absentes à la BPA) ---------------------------------------
    'hebertisme': ("Hébertisme (parcours d'obstacles)", TROIS, False, 30000, 4000,
        "Parcours d'obstacles au sol en forêt : murs, filets, poutres, cordes. L'activité la plus souvent citée chez les autres camps.",
        "12 à 15 modules en bois traité ou cèdre, installés par un fournisseur spécialisé (20 000 à 40 000 $). Opération : inspection annuelle, bois à remplacer, formation des animateurs."),
    'hebertisme_interieur': ("Parcours d'hébertisme intérieur", QUATRE, False, 120000, 6000,
        "Parcours de cordes et de filets dans un bâtiment (ex. « grange de Tarzan »), utilisable l'hiver et les jours de pluie.",
        "Bâtiment existant ou grange à adapter (structure, filets, matelas). Coût très variable si un bâtiment doit être construit. Opération : inspection, assurances."),
    'tyrolienne': ('Tyrolienne', QUATRE, False, 45000, 6000,
        "Câble de descente, en forêt ou au-dessus du lac.",
        "Tyrolienne de 150 à 300 m avec plateformes et freinage, par un installateur certifié (CSA Z267). Opération : inspection annuelle, harnais et poulies, formation."),
    'mur_escalade': ("Mur d'escalade artificiel", QUATRE, False, 60000, 6000,
        "Mur extérieur ou intérieur avec prises, complémentaire à la paroi naturelle.",
        "Mur autoportant de 8 à 10 m (45 000 à 75 000 $), cordes et harnais. Opération : inspection, prises, cordes à remplacer."),
    'bloc_escalade': ("Bloc d'escalade", QUATRE, False, 20000, 2000,
        "Petit mur de bloc sans corde, avec matelas ; peut être intérieur pour l'hiver.",
        "Structure de 3 à 4 m de haut et matelas de chute. Opération : prises et matelas."),
    'corde_tarzan': ('Corde à Tarzan', [E], False, 3000, 500,
        "Grande balançoire de corde (souvent au-dessus de l'eau).",
        "Arbre ou portique, corde marine, aire de réception. Opération : inspection, corde à changer."),
    'slackline': ('Slackline', TROIS, False, 1500, 300, "Sangle tendue entre deux arbres pour l'équilibre.", "3 à 4 slacklines avec protège-arbres."),
    'tir_carabine': ('Tir à la carabine (air comprimé ou plomb)', QUATRE, False, 9000, 3000,
        "Champ de tir encadré avec carabines à air comprimé.",
        "6 carabines, cibles et pare-balles, aménagement du champ de tir (5 000 à 10 000 $). Opération : plombs, formation d'un responsable, assurances."),
    'tir_fronde': ('Tir à la fronde', TROIS, False, 500, 200, "Lance-pierres sur cibles.", "Frondes et cibles."),
    'ski_nautique': ('Ski nautique et wakeboard', [E], False, 85000, 25000,
        "Ski nautique tiré par un bateau à moteur, avec un moniteur certifié.",
        "Bateau de ski usagé (60 000 à 90 000 $), skis, planches et vestes. Opération : essence, entretien, assurance, moniteur et conducteur certifiés. À vérifier : règlements du lac."),
    'bouee_tractee': ('Bouée tractée', [E], False, 45000, 12000,
        "Bouée tirée par un bateau à moteur.",
        "Bateau à moteur usagé (35 000 à 50 000 $) et bouées. Partage le bateau avec le ski nautique."),
    'ponton': ('Tours de ponton', [E], False, 45000, 8000, "Balades en ponton sur le lac.", "Ponton de 22 pi neuf ou récent ; opération : essence, entretien, permis du conducteur."),
    'voile': ('Voile (dériveurs, catamarans)', [E], False, 55000, 18000,
        "Initiation à la voile sur dériveurs ou catamarans, avec formation Voile Canada.",
        "6 dériveurs (Optimist, Laser, Hobie Cat) et un bateau de sécurité. Opération : moniteur certifié, entretien, gréement. À vérifier : taille du lac et vents."),
    'planche_voile': ('Planche à voile', [E], False, 15000, 5000, "Planche à voile sur le lac.", "6 planches et voiles d'initiation ; moniteur formé."),
    'pedalo': ('Pédalo', [E], False, 8000, 1500, 'Pédalos sur le lac.', '4 pédalos et vestes.'),
    'corcl': ('Petites embarcations rondes (CORCL)', [E], False, 12000, 1000, "Bateaux ronds à une ou deux places, très faciles pour les jeunes.", "6 à 8 CORCL et pagaies."),
    'radeau': ('Construction de radeau', [E], False, 2000, 800, "Les jeunes construisent un radeau (barils, cordes, bois) et le mettent à l'eau.", "Barils, planches et cordes réutilisables."),
    'peche': ('Pêche', TROIS, False, 3000, 1500, "Pêche à la ligne au quai ou en embarcation.", "Cannes, coffres, appâts ; vérifier les permis (programme Pêche en herbe)."),
    'snorkeling': ('Plongée en apnée (snorkeling)', [E], False, 3000, 2000, "Masque, tuba et palmes près du rivage.", "20 ensembles, surveillant additionnel."),
    'plongee': ('Plongée sous-marine (initiation)', [E], False, 40000, 12000, "Baptêmes de plongée encadrés.", "Le plus simple : partenariat avec une école de plongée (coût surtout à l'usage)."),
    'cours_natation': ('Cours de natation', [E], False, 2000, 12000, "Cours de natation (Croix-Rouge ou Société de sauvetage).", "Moniteur de natation qualifié, matériel de flottaison."),
    'piscine': ('Piscine', [E], False, 250000, 30000, "Piscine extérieure ou intérieure pour la baignade et les cours.", "Piscine creusée extérieure (150 000 à 400 000 $) ; opération : produits, chauffage, sauveteurs, entretien."),
    'water_polo': ('Water-polo', [E], False, 2000, 500, "Water-polo dans une zone balisée ou en piscine.", "Buts flottants, ballons, bouées."),
    'glissade_eau': ("Glissade d'eau vers le lac", [E], False, 25000, 3000, "Toboggan ou glissade flexible qui finit dans le lac.", "Glissade flexible de quai ou toboggan ; surveillance."),
    'expedition_longue': ('Expéditions de longue durée (10 jours et plus)', [E], False, 20000, 12000,
        "Expéditions de canot ou de randonnée de 10 à 30 jours pour les ados.",
        "Canots, tentes et équipement de groupe supplémentaires ; opération : guides qualifiés, transport, permis de rivière."),
    'velo': ('Vélo de montagne et cyclotourisme', TROIS, False, 35000, 10000,
        "Sorties en vélo de montagne sur sentiers, ou expéditions à vélo.",
        "20 vélos, casques, remorque et outils ; sentiers sur le site ou à proximité. Opération : entretien, mécanicien, assurances."),
    'bmx': ('BMX et piste à bosses (pumptrack)', TROIS, False, 60000, 3000, "Piste de BMX ou pumptrack asphaltée.", "Pumptrack asphaltée par un constructeur (40 000 à 80 000 $) et 10 BMX."),
    'go_kart': ('Go-kart', TROIS, False, 60000, 15000, "Karts sur une piste privée.", "Karts et piste ; assurances élevées. Peu adapté à la mission plein air."),
    'cote_tacot': ('Course de boîtes à savon (côte à tacot)', TROIS, False, 5000, 1000, "Les jeunes construisent et descendent des boîtes à savon.", "Kits de boîtes à savon, pente aménagée."),
    'equitation': ('Équitation et soins des chevaux', TROIS, False, 150000, 80000,
        "Cours d'équitation, soins des chevaux, écurie.",
        "Chevaux, écurie, manège ; opération : nourriture, vétérinaire, palefrenier. Plus réaliste : partenariat avec un centre équestre (coût à l'usage)."),
    'mini_ferme': ('Mini-ferme et soins des animaux', QUATRE, False, 40000, 25000,
        "Petits animaux de ferme dont les jeunes prennent soin.",
        "Bâtiment, enclos et animaux ; opération : nourriture, vétérinaire, soins 12 mois par année."),
    'jardinage': ('Jardinage, potager et cueillette', TROIS, False, 5000, 2000, "Potager pédagogique, cueillette.", "Bacs surélevés, outils, semences, irrigation."),
    'sciences_nature': ('Sciences naturelles et sentier d’interprétation', QUATRE, False, 10000, 4000,
        "Ateliers d'écologie, observation de la faune et de la flore, sentier d'interprétation.",
        "Panneaux d'interprétation, loupes, guides, matériel d'analyse d'eau ; animateur naturaliste ou partenariat (ex. GUEPE)."),
    'astronomie': ('Astronomie et observation des étoiles', QUATRE, False, 4000, 500, "Soirées d'observation du ciel avec télescope.", "Télescope de 8 po, cartes du ciel, application ; formation d'un animateur."),
    'stim': ('Sciences et technologies (STIM, robotique)', QUATRE, False, 10000, 4000, "Projets de science, robotique, simulateurs.", "Trousses de robotique et de science ; animateur spécialisé."),
    'arts_plastiques': ('Arts plastiques et artisanat', QUATRE, False, 5000, 3000, "Peinture, sculpture, bijoux, savons et bougies, crochet…", "Local d'arts, fournitures renouvelées chaque année."),
    'poterie': ('Poterie et céramique', QUATRE, False, 15000, 3000, "Atelier de céramique avec tours et four.", "2 tours, four électrique (220 V), argile ; animateur formé."),
    'menuiserie': ('Menuiserie et travail du bois', QUATRE, False, 12000, 3000, "Atelier de bois (petits projets, charpenterie).", "Établis, outils manuels, bois ; encadrement sécuritaire."),
    'cuisine': ('Ateliers de cuisine (dont cuisine en plein air)', QUATRE, False, 5000, 3000, "Ateliers de cuisine, cuisine sur feu ou réchaud.", "Réchauds, ustensiles, ingrédients ; respect des normes MAPAQ."),
    'musique': ('Musique (instruments, chant, guitare)', QUATRE, False, 8000, 5000, "Ateliers de musique, guitare, chant, jam.", "Guitares, percussions, système de son ; animateur musicien."),
    'theatre': ('Théâtre et improvisation', QUATRE, False, 2000, 2000, "Ateliers de théâtre, improvisation, création de personnages.", "Costumes et accessoires ; animateur formé."),
    'danse': ('Danse (hip-hop, percussions dansées)', QUATRE, False, 2000, 3000, "Cours de danse et chorégraphies.", "Système de son ; animateur ou professeur invité."),
    'cirque': ('Arts du cirque (trapèze, jonglerie, acrobaties)', QUATRE, False, 25000, 10000, "Ateliers de cirque, trapèze, jonglerie.", "Portique de trapèze et matelas, matériel de jonglerie ; entraîneur qualifié."),
    'gymnastique': ('Gymnastique, cheerleading et parkour', QUATRE, False, 30000, 8000, "Entraînement de gymnastique, cheer, parkour.", "Tapis, trampoline au sol, modules de parkour ; entraîneur certifié."),
    'arts_martiaux': ('Arts martiaux (judo)', QUATRE, False, 5000, 6000, "Initiation au judo ou à d'autres arts martiaux.", "Tatamis ; partenariat avec un club (entraîneur)."),
    'trampoline': ('Trampoline', TROIS, False, 8000, 1500, "Trampoline extérieur sécurisé.", "Trampoline creusé avec filet ; assurances."),
    'gn': ('Grandeur nature et combats d’épées en mousse', QUATRE, False, 10000, 4000, "Jeu de rôle grandeur nature, quêtes, épées en mousse (katag).", "Armes en mousse, costumes, décors ; animateurs formés ou partenaire (ex. Versébock)."),
    'jeux_video': ('Jeux vidéo et réalité virtuelle', QUATRE, False, 6000, 1000, "Périodes de jeux vidéo en équipe, casques de réalité virtuelle.", "Consoles, écran, casques VR. À débattre : peu cohérent avec un camp plein air."),
    'langues': ('Ateliers de langue (immersion anglaise)', QUATRE, False, 1000, 8000, "Ateliers d'anglais et activités en anglais.", "Animateurs bilingues formés, matériel pédagogique."),
    'gaga': ('Gaga ball', TROIS, False, 3000, 200, "Ballon-chasseur dans une fosse octogonale en bois.", "Fosse en bois de 6 m."),
    'bubble_soccer': ('Ballons-bulles (bubble soccer)', TROIS, False, 4000, 500, "Soccer dans des bulles gonflables.", "10 bulles gonflables."),
    'tennis': ('Tennis', [P, E, A], False, 80000, 3000, "Terrain de tennis.", "Terrain asphalté, clôture, filet (60 000 à 100 000 $). Pourrait servir aussi au pickleball."),
    'pickleball': ('Pickleball', TROIS, False, 25000, 1000, "Terrains de pickleball.", "Deux terrains tracés sur une surface existante ou neuve."),
    'mini_golf': ('Mini-golf', TROIS, False, 40000, 3000, "Parcours de mini-golf.", "9 trous rustiques (25 000 à 60 000 $)."),
    'dek_hockey': ('Dek hockey', TROIS, False, 80000, 2000, "Surface de dek hockey avec bandes.", "Surface et bandes (60 000 à 120 000 $). Pourrait servir de patinoire l'hiver."),
    'hockey_cosom': ('Hockey cosom', QUATRE, False, 1500, 300, "Hockey intérieur ou extérieur avec bâtons de plastique.", "Bâtons, buts, balles."),
    'hockey_glace': ('Hockey sur glace (patinoire)', [H], False, 15000, 5000, "Patinoire extérieure avec bandes pour le hockey.", "Bandes, filets, entretien de la glace (arrosage, déneigement)."),
    'lacrosse': ('Crosse (lacrosse)', TROIS, False, 2000, 300, "Initiation à la crosse.", "Bâtons, balles, buts."),
    'baseball': ('Baseball et balle molle', TROIS, False, 5000, 500, "Terrain et matériel de balle.", "Marbre et coussins, gants, bâtons ; terrain existant."),
    'athletisme': ('Athlétisme', TROIS, False, 3000, 500, "Courses, sauts et lancers.", "Matériel de saut et de lancer."),
    'petanque': ('Pétanque et jeu de fers', TROIS, False, 2500, 200, "Terrain de pétanque et de fers.", "Allée de gravier, boules, fers."),
    'jeux_geants': ('Jeux géants et jeux en bois', TROIS, False, 5000, 500, "Jeux en bois surdimensionnés, jeux de poches, baby-foot géant.", "Achat ou fabrication d'une dizaine de jeux."),
    'labyrinthe': ('Labyrinthe', TROIS, False, 10000, 1000, "Labyrinthe de haies ou de bois.", "Construction en bois ou plantation de haies."),
    'parc_modules': ('Parc et modules de jeux', TROIS, False, 50000, 2000, "Modules de jeux et balançoires pour les plus jeunes.", "Modules certifiés et surface amortissante."),
    'tour_observation': ("Tour d'observation", QUATRE, False, 60000, 1000, "Tour en bois avec vue sur le site.", "Structure de 10 à 15 m conçue par un ingénieur."),
    'amphitheatre': ('Amphithéâtre extérieur', TROIS, False, 40000, 1000, "Gradins en plein air pour spectacles et rassemblements.", "Gradins en bois ou en pierre, scène, éclairage."),
    'pavillon_couvert': ('Pavillon sportif couvert', QUATRE, False, 250000, 5000, "Grand abri couvert pour les sports et les jeux par mauvais temps.", "Structure de bois ou d'acier de 400 à 600 m² (150 000 à 400 000 $)."),
    'cine_plein_air': ('Cinéma en plein air', TROIS, False, 8000, 500, "Projection de films sur écran extérieur.", "Écran gonflable, projecteur, son ; licence de diffusion."),
    'hebergement_insolite': ('Hébergement insolite (yourtes, cabanes)', QUATRE, False, 80000, 8000, "Yourtes, cabanes perchées ou tentes prospecteur comme expérience d'hébergement.", "3 à 4 yourtes ou tentes prospecteur équipées (15 000 à 30 000 $ chacune), poêles pour l'hiver."),
    'cabane_sucre': ('Cabane à sucre', [P], False, 30000, 8000, "Temps des sucres : entaillage, bouillage, tire sur la neige.", "Petite cabane, évaporateur, chaudières ou tubulure (à petite échelle : 10 000 à 40 000 $)."),
    'peinture_neige': ('Peinture sur neige', [H], False, 300, 300, "Peindre dans la neige avec de l'eau colorée.", "Vaporisateurs et colorant alimentaire."),
}

# ----------------------------------------------- liens camp → activités
# Index = position du camp dans qc.json (ordre de l'onglet).
LIENS = {
    0: ['ski_nautique', 'bouee_tractee', 'jeux_video', 'langues'],
    2: ['hebergement_insolite', 'camping', 'hebertisme', 'accrobranche', 'expedition_longue'],
    3: ['mur_escalade', 'hockey_glace', 'glissade_tubes', 'peche', 'peche_glace', 'tyrolienne'],
    4: ['voile', 'chasse_tresor', 'snorkeling', 'theatre', 'expedition_longue'],
    5: ['camping'],
    7: ['musique'],
    8: ['jeux_video'],
    9: ['velo', 'bmx'],
    11: ['mini_ferme', 'jardinage', 'arts_plastiques'],
    12: ['piscine', 'poterie', 'menuiserie', 'cuisine', 'hebertisme', 'gaga', 'tennis'],
    13: ['mini_golf', 'tennis', 'voile'],
    15: ['corcl', 'slackline', 'sauveteur', 'velo', 'jeux_video'],
    17: ['tir_carabine', 'tyrolienne'],
    19: ['musique'],
    20: ['voile', 'peche', 'tir_carabine', 'gn'],
    21: ['hebertisme', 'arts_plastiques', 'amphitheatre'],
    22: ['pavillon_couvert', 'glissade_eau'],
    23: ['gn'],
    24: ['expedition_longue', 'hebertisme', 'brico_nature', 'sciences_nature', 'corcl', 'amphitheatre', 'mur_escalade'],
    25: ['pavillon_couvert', 'voile', 'bloc_escalade'],
    26: ['tour_observation'],
    30: ['radeau', 'hebertisme'],
    31: ['hebertisme', 'danse'],
    32: ['hebertisme'],
    34: ['cirque'],
    39: ['sciences_nature', 'arts_martiaux', 'gn'],
    43: ['cours_natation', 'ski_nautique', 'baseball', 'tennis', 'arts_plastiques'],
    44: ['ski_nautique', 'voile', 'arts_plastiques', 'theatre'],
    45: ['arts_plastiques', 'athletisme', 'bloc_escalade', 'hebertisme', 'mini_ferme', 'mini_golf', 'tennis', 'pedalo'],
    46: ['tir_carabine', 'hebertisme', 'jeux_geants', 'sciences_nature', 'expedition_longue'],
    47: ['musique', 'arts_plastiques'],
    48: ['hebertisme', 'musique'],
    49: ['tir_carabine', 'lacrosse', 'cuisine', 'bloc_escalade', 'menuiserie', 'musique', 'velo', 'voile',
         'cours_natation', 'sauveteur', 'tennis', 'peche', 'pickleball', 'expedition_longue'],
    51: ['pedalo', 'tir_carabine', 'hebertisme', 'hockey_cosom', 'water_polo', 'musique', 'theatre'],
    52: ['cours_natation', 'tennis', 'hebertisme', 'voile', 'poterie', 'danse', 'cuisine', 'langues'],
    53: ['pedalo', 'parc_modules', 'cine_plein_air'],
    54: ['bouee_tractee', 'ski_nautique', 'ponton', 'bloc_escalade', 'astronomie', 'hockey_cosom', 'arts_plastiques', 'peche'],
    55: ['danse', 'arts_plastiques', 'cuisine', 'musique', 'poterie', 'cours_natation'],
    56: ['mini_ferme', 'jardinage'],
    57: ['tyrolienne', 'pedalo'],
    58: ['contes', 'hebertisme', 'cours_natation', 'danse', 'peche', 'cuisine', 'menuiserie', 'cirque',
         'gymnastique', 'velo', 'arts_martiaux', 'bloc_escalade'],
    59: ['expedition_longue'],
    61: ['piscine', 'arts_plastiques', 'patin', 'jeux_geants', 'glissade_tubes', 'ski_fond', 'parc_modules',
         'labyrinthe', 'hebertisme', 'tyrolienne', 'corde_tarzan', 'bloc_escalade'],
    63: ['hebertisme', 'jeux_geants', 'velo', 'sciences_nature'],
    64: ['yoga', 'jardinage'],
    65: ['stim'],
    66: ['grand_jeu', 'astronomie'],
    67: ['voile', 'peche', 'tir_carabine', 'sciences_nature', 'corde_tarzan', 'tyrolienne', 'poterie', 'expedition_longue'],
    68: ['velo', 'voile', 'disque_golf', 'expedition_longue'],
    69: ['hebertisme', 'petanque', 'glissade_tubes'],
    70: ['snorkeling', 'peche'],
    71: ['gaga', 'sciences_nature', 'hebertisme'],
    72: ['equitation'],
    73: ['hebertisme', 'accrobranche', 'cirque', 'traineau_chiens', 'cabane_sucre', 'peinture_neige'],
    74: ['tyrolienne', 'voile'],
    75: ['ponton'],
    77: ['mini_golf'],
    78: ['sciences_nature', 'astronomie'],
    79: ['contes', 'piscine', 'trampoline', 'hebertisme', 'mini_ferme', 'jardinage'],
    80: ['hebertisme', 'jeux_geants', 'theatre', 'rafting', 'camping', 'cuisine'],
    81: ['dek_hockey'],
    82: ['voile', 'sciences_nature'],
    84: ['peche', 'labyrinthe', 'jeux_geants', 'velo', 'tyrolienne', 'slackline', 'peche_glace'],
    85: ['parc_modules', 'piscine'],
    86: ['hebertisme', 'dek_hockey'],
    87: ['hebertisme', 'tyrolienne', 'hebergement_insolite'],
    88: ['cirque'],
    89: ['sciences_nature'],
    90: ['jardinage', 'mini_ferme'],
    92: ['camping', 'canot_camping', 'stim', 'musique', 'arts_plastiques', 'theatre', 'danse', 'astronomie'],
    94: ['tir_carabine', 'tir_fronde', 'peche', 'hebertisme'],
    96: ['equitation', 'mini_ferme', 'piscine', 'hebertisme_interieur'],
    97: ['jeux_geants'],
    98: ['musique', 'danse', 'mini_ferme'],
    99: ['plongee', 'go_kart', 'voile', 'bmx', 'survie', 'stim'],
    101: ['gymnastique', 'mini_golf', 'cirque', 'danse'],
    102: ['equitation', 'cote_tacot', 'bmx', 'hebertisme', 'tyrolienne', 'accrobranche', 'rafting', 'peche'],
    105: ['dek_hockey'],
    106: ['bubble_soccer', 'glissade_eau', 'jeux_geants'],
    107: ['voile', 'sauveteur', 'planche_voile', 'tir_carabine', 'velo'],
}

# ----------------------------------------------------------- catégories
# Proposition à revoir dans l'app : « compétiteur direct » = camp de vacances
# ou base de plein air généraliste qui vise les mêmes familles ou les mêmes
# écoles ; « référence » = spécialisé, clientèle différente, hors Québec,
# camp de jour seulement…
REFERENCE = {1, 7, 9, 10, 12, 13, 14, 16, 19, 23, 35, 43, 47, 48, 54, 55, 60, 62, 64, 65, 67, 72, 79, 85,
             88, 89, 90, 91, 92, 93, 96, 97, 98, 100, 101, 103, 105}
# Exclus d'emblée (jamais suivis ni reproposés).
EXCLUS = {103: "Clientèle de répit (pas notre clientèle, selon le Sheets).",
          91: "« Pas notre mission » selon le Sheets (camp chrétien)."}
IGNORES = {6: 'la BPA elle-même', 104: 'doublon vide de « Le Grand Village »'}
# Doublon : 55 (« Camp Pardas Chanad », complet) fusionné dans 35.
FUSIONS = {55: 35}

REGIONS = {"Canton de l'Est": 'Estrie', 'Côte Nord': 'Côte-Nord'}

# --------------------------------------------------------- programmes
def entier(texte):
    m = re.search(r'(\d+)', texte or '')
    return int(m.group(1)) if m else None

def prix(texte):
    if not texte or '?' in str(texte):
        return None
    m = re.search(r'(\d[\d ,.]*)\s*\$', str(texte))
    return float(m.group(1).replace(' ', '').replace(',', '.')) if m else None

def duree(texte, camp_de_jour):
    """(jours, nuits) à partir de « 6 jours », « 5 nuits », « 1 mois »…"""
    t = (texte or '').lower()
    if 'nuit' in t:
        n = entier(t)
        return (n + 1, n)
    if 'mois' in t:
        return (30, 29)
    if 'semaine' in t:
        j = entier(t) * 7
        return (j, None if camp_de_jour else j - 1)
    m = re.search(r'\((\d+) jours?\)', t) or re.search(r'(\d+) jours?', t)
    if not m:
        return (None, None)
    j = int(m.group(1))
    return (j, 0 if camp_de_jour else j - 1)

# Programmes qui ne se lisent pas automatiquement (plusieurs prix, etc.).
# Pas de sous-catégories de prix : chaque variante devient un programme.
PROGRAMMES_MANUELS = {
    (4, 'Ado-X'): [('Ado-X (12 jours)', 12, 11, 1410), ('Ado-X (12 jours, 2e séjour)', 12, 11, 1485), ('Ado-X (10 jours)', 10, 9, 1180)],
    (4, 'Camp de théatre'): [('Camp de théâtre (10 jours)', 10, 9, 1250), ('Camp de théâtre (12 jours)', 12, 11, 1405)],
    (15, 'Camp de sauveteur'): [('Camp de sauveteur — Étoile de bronze', 7, 6, 915), ('Camp de sauveteur — Médaille de bronze', 7, 6, 965), ('Camp de sauveteur — Croix de bronze', 7, 6, 965)],
    (24, 'Escalades'): [('Escalades (6 jours)', 6, 5, 1010), ('Escalades (7 jours)', 7, 6, 1175), ('Escalades (13 jours)', 13, 12, 2200)],
    (24, 'Leaders'): [('Leaders (13 jours, 13-15 ans)', 13, 12, 2285), ('Leaders (21 jours)', 21, 20, 3679)],
    (34, 'Camp de cirque'): [('Camp de cirque (5 jours)', 5, 4, 745), ('Camp de cirque (7 jours)', 7, 6, 885), ('Camp de cirque (13 jours)', 13, 12, 1495)],
    (47, 'Camp musical pour adulte'): [('Camp musical pour adultes (2 nuits)', 3, 2, 615), ('Camp musical pour adultes (3 nuits)', 4, 3, 1150)],
    (80, 'Camps Aventure-Jeunesse'): [('Camps Aventure-Jeunesse (6-7 ans, 2 nuits)', 3, 2, 268), ('Camps Aventure-Jeunesse (8-10 ans, 5 nuits)', 6, 5, 738)],
    (80, "Camps de l'avenir"): [("Camps de l'avenir (11-13 ans, 5 nuits)", 6, 5, 738), ("Camps de l'avenir (14-17 ans, 6 nuits)", 7, 6, 845)],
    (73, 'Mini camp'): [('Mini camp', 4, 3, 579)],
    (92, 'Adventure\nWoodlander'): [('Adventure / Woodlander (canot-camping)', 6, 5, 575)],
    # Camps de jour (pas de nuit) malgré la case « Camp de vacances ».
    (88, "Camp d'été immersion cirque"): [("Camp d'été immersion cirque (camp de jour)", 5, 0, 431)],
    (95, 'Déploie tes ailes'): [('Déploie tes ailes (formation de jour)', 28, 0, 480)],
}
SANS_PROGRAMME = {'-', '???', "Différent programme d'expédition", 'Ben des programmes de musique',
                  'Voile Camp', 'Camp adapté au jeunes vivant avec un handicap physique / intellectuel'}

# ------------------------------------------------------------- SQL
def q(v):
    if v is None or v == '':
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return "array[" + ','.join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"

def score(v):
    try:
        f = float(v)
        return f if 0 <= f <= 10 else None
    except (TypeError, ValueError):
        return None

def lien(v):
    v = str(v or '').strip()
    return v if v.startswith('http') else None

def coche(c, k):
    return str(c.get(k, '')).strip() == '✅'

TYPES = [('7:Camp de vacances', 'camp_vacances'), ('8:Camp familial', 'camp_familial'), ('9:Camp de jour', 'camp_jour'),
         ('10:Besoins particuliers', 'besoins_particuliers'), ('11:Classe nature', 'classe_nature'), ('12:Accueil de groupe', 'accueil_groupe')]
HEBERGEMENT = [('14:Tente', 'tente'), ('15:Dortoir', 'dortoir'), ('16:Chalet', 'chalet'), ('17:Chambre', 'chambre'), ('18:Autre', 'autre')]
BLOCS = [('61:Nom', '62:Description', '63:Durée (jours)', '64:Prix', '66:Notes'),
         ('68:Nom', '69:Description', '70:Durée (jours)', '71:Prix', '73:Notes'),
         ('75:Nom', '76:Description', '77:Durée (jours)', '78:Prix', '80:Notes')]

def texte(c, k):
    v = str(c.get(k, '') or '').strip()
    return v if v and v not in ('-', 'n.a', '?') else None

def main():
    sortie = ['-- Généré par scripts/migration/vigie.py — import ponctuel du Sheets « BPA_Vigie_ Comparatif des camps ».',
              'begin;', "set local search_path = '';"]

    # Activités
    for cle, (nom, saisons, offert, impl, oper, desc, hyp) in CATALOGUE.items():
        sortie.append(
            f"insert into vigie.activites (nom, description, saisons, offert_bpa, cout_implantation, cout_operation_annuel, hypotheses_couts, couts_estimes_le) values "
            f"({q(nom)}, {q(desc)}, {q(saisons)}, {q(offert)}, {q(impl)}, {q(oper)}, {q(hyp)}, {'now()' if impl is not None else 'null'});")

    bruts = {i: dict(c) for i, c in enumerate(camps_bruts)}
    for source, cible in FUSIONS.items():
        for k, v in bruts[source].items():
            if k != '1:Camp' and str(v).strip() not in ('', '-', 'n.a'):
                bruts[cible].setdefault(k, v)
                if str(bruts[cible].get(k, '')).strip() in ('', '-', 'n.a'):
                    bruts[cible][k] = v
        LIENS[cible] = LIENS.get(cible, []) + LIENS.pop(source, [])

    nb_camps = nb_prog = nb_liens = 0
    inconnues = set()
    for i, c in bruts.items():
        if i in IGNORES or i in FUSIONS:
            continue
        nom = c['1:Camp'].strip()
        types = [t for k, t in TYPES if coche(c, k)]
        hebergement = [h for k, h in HEBERGEMENT if coche(c, k)]
        region = REGIONS.get(c.get('5:Région administrative'), c.get('5:Région administrative'))
        ville = texte(c, '4:Ville')
        if ville and '\n' in ville:
            ville = ville.split('\n')[0].strip()
        notes = [x for x in [texte(c, '31:Notes')] if x]
        brut_act = texte(c, "30:Activités que nous n'avons pas")
        if brut_act:
            notes.append("Activités notées dans le Sheets : " + brut_act.replace('\n', ', '))
        if texte(c, '32:Lien vers photo'):
            notes.append('Photos : ' + texte(c, '32:Lien vers photo'))
        idees = [f"{t} : {texte(c, k)}" for k, t in [('34:Idée de génie', 'Idée de génie'), ('35:Coup de coeur', 'Coup de cœur'), ('33:Inspiration', 'Inspiration')] if texte(c, k)]
        statut = 'exclu' if i in EXCLUS else 'inclus'
        if i in EXCLUS:
            notes.insert(0, EXCLUS[i])
        categorie = 'reference' if i in REFERENCE else 'competiteur_direct'
        sortie.append(
            "insert into vigie.camps (nom, province, ville, region, types, hebergement, site_web, site_web_score, facebook, facebook_score, "
            "instagram, instagram_score, tiktok, tiktok_score, membre_acq, categorie, statut_inclusion, origine, lien_source, date_decouverte, notes, idees) values ("
            f"{q(nom)}, {q(texte(c, '3:Province'))}, {q(ville)}, {q(region)}, {q(types)}, {q(hebergement)}, "
            f"{q(lien(c.get('21:Site web')))}, {q(score(c.get('22:Site web /10')))}, {q(lien(c.get('23:Facebook')))}, {q(score(c.get('24:Facebook /10')))}, "
            f"{q(lien(c.get('25:Instagram')))}, {q(score(c.get('26:Instagram /10')))}, {q(lien(c.get('27:Tiktok')))}, {q(score(c.get('28:Tiktok /10')))}, "
            f"true, {q(categorie)}, {q(statut)}, 'import', 'Google Sheets « BPA_Vigie_ Comparatif des camps »', '2024-12-10', "
            f"{q(chr(10).join(notes) or None)}, {q(chr(10).join(idees) or None)});")
        nb_camps += 1
        camp = f"(select id from vigie.camps where lower(nom) = lower({q(nom)}))"

        camp_de_jour = types == ['camp_jour'] or 'Camp de jour' in str(c.get('66:Notes', ''))
        for k_nom, k_desc, k_duree, k_prix, k_notes in BLOCS:
            nom_p = str(c.get(k_nom, '') or '').strip()
            if not nom_p or nom_p in SANS_PROGRAMME:
                continue
            if (i, nom_p) in PROGRAMMES_MANUELS:
                variantes = PROGRAMMES_MANUELS[(i, nom_p)]
            else:
                j, n = duree(str(c.get(k_duree, '')), camp_de_jour)
                variantes = [(nom_p, j, n, prix(c.get(k_prix)))]
            for nom_v, j, n, p in variantes:
                sortie.append(
                    "insert into vigie.programmes (camp_id, nom, description, duree_jours, duree_nuits, prix, annee, notes, source_url) values ("
                    f"{camp}, {q(nom_v)}, {q(texte(c, k_desc))}, {q(j)}, {q(n)}, {q(p)}, '2025', "
                    f"{q('Durée notée : ' + str(c.get(k_duree)).replace(chr(10), ' / ') + ('. ' + texte(c, k_notes) if texte(c, k_notes) else ''))}, "
                    f"{q(lien(c.get('21:Site web')))});")
                nb_prog += 1

        for cle in dict.fromkeys(LIENS.get(i, [])):
            if cle not in CATALOGUE:
                inconnues.add(cle)
                continue
            sortie.append(
                f"insert into vigie.camps_activites (camp_id, activite_id, source) values ({camp}, "
                f"(select id from vigie.activites where lower(nom) = lower({q(CATALOGUE[cle][0])})), 'import') on conflict do nothing;")
            nb_liens += 1

    if inconnues:
        sys.exit(f'Clés inconnues : {sorted(inconnues)}')
    sortie.append('commit;')
    (ICI / 'vigie.sql').write_text('\n'.join(sortie) + '\n')
    print(f'{len(CATALOGUE)} activités, {nb_camps} camps, {nb_prog} programmes, {nb_liens} liens → {ICI / "vigie.sql"}')

main()
