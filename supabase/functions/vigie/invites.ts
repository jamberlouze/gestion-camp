// Prompts et outils envoyés à Claude. Fonctions pures : tout ce qui varie
// (camp, programmes connus, liste d'activités, consignes) est en paramètre.
//
// Pas de mémoire auto-apprenante : le prompt est large par défaut ; les
// ajustements se font à la main dans Réglages (`consignes`).

export const SAISONS = ['hiver', 'printemps', 'ete', 'automne']
export const TYPES_CAMP = ['camp_vacances', 'camp_familial', 'camp_jour', 'besoins_particuliers', 'classe_nature', 'accueil_groupe']
export const HEBERGEMENTS = ['tente', 'dortoir', 'chalet', 'chambre', 'autre']
/** Type de séjour d'un programme (pas du camp : un camp peut en offrir plusieurs). */
export const TYPES_SEJOUR = ['camp_vacances', 'camp_familial', 'classe_nature', 'groupe']

const BPA = `La Base de Plein Air Mont-Tremblant (BPA) est un camp de vacances et une base de plein air
à Mont-Tremblant (Laurentides, Québec) : 190 lits en chambres de 4 à 6, une plage et un lac, accès
à la rivière du Diable, terrain forestier. Clientèles : camp de vacances (7-16 ans), EXPÉ, ASPI,
SAUVETEUR, camp de jour, relâche, classes nature / classes neige (écoles, en automne, hiver et
printemps), groupes, familles, entreprises. Son offre hivernale est mince alors qu'elle accueille
des classes neige l'hiver.`

// ------------------------------------------------------------------ outils
const nul = (type: string) => ({ type: [type, 'null'] })

const ACTIVITE = {
  type: 'object',
  properties: {
    activite_id: { ...nul('string'), description: "Identifiant de l'activité dans la liste commune, ou null si aucune ne correspond." },
    nom: { type: 'string', description: "Nom générique et court en français (sans le nom du camp)." },
    saisons: { type: 'array', items: { type: 'string', enum: SAISONS } },
    source: { type: 'string', enum: ['site', 'reseaux', 'photo'] },
    preuve: { type: 'string', description: 'Ce qui montre que le camp offre cette activité (une phrase).' },
    source_url: nul('string'),
    photo_url: { ...nul('string'), description: "Adresse directe d'une image (jpg, png, webp) qui montre l'activité dans ce camp, lue dans une page ; sinon null." },
  },
  required: ['activite_id', 'nom', 'saisons', 'source', 'preuve', 'source_url', 'photo_url'],
}

export const OUTIL_RESULTATS = {
  name: 'enregistrer_resultats',
  description: "Enregistre les résultats de la recherche sur ce camp. Appeler une seule fois, à la toute fin.",
  input_schema: {
    type: 'object',
    properties: {
      programmes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            programme_id: { ...nul('string'), description: 'Identifiant du programme connu correspondant, ou null pour un nouveau programme.' },
            nom: { type: 'string' },
            description: nul('string'),
            duree_jours: nul('integer'),
            duree_nuits: nul('integer'),
            prix: { ...nul('number'), description: 'Prix régulier total pour un enfant, en dollars canadiens ; null si introuvable.' },
            annee: { ...nul('string'), description: 'Saison ou année du prix, ex. « été 2027 ».' },
            type_sejour: {
              type: ['string', 'null'],
              enum: [...TYPES_SEJOUR, null],
              description: 'Type de séjour du programme (voir les consignes) ; null si aucun ne convient.',
            },
            source_url: nul('string'),
          },
          required: ['programme_id', 'nom', 'description', 'duree_jours', 'duree_nuits', 'prix', 'annee', 'type_sejour', 'source_url'],
        },
      },
      activites: { type: 'array', items: ACTIVITE },
      photos_a_analyser: {
        type: 'array',
        items: { type: 'string' },
        description: "Jusqu'à 6 adresses directes d'images trouvées dans les pages lues (galerie, activités).",
      },
      presence_web: {
        type: 'object',
        properties: {
          site_web: nul('string'), site_web_score: nul('number'),
          facebook: nul('string'), facebook_score: nul('number'),
          instagram: nul('string'), instagram_score: nul('number'),
          tiktok: nul('string'), tiktok_score: nul('number'),
        },
        required: ['site_web', 'site_web_score', 'facebook', 'facebook_score', 'instagram', 'instagram_score', 'tiktok', 'tiktok_score'],
      },
      fiche: {
        type: 'object',
        properties: {
          ville: nul('string'),
          region: { ...nul('string'), description: 'Région administrative du Québec.' },
          types: { type: 'array', items: { type: 'string', enum: TYPES_CAMP } },
          hebergement: { type: 'array', items: { type: 'string', enum: HEBERGEMENTS } },
        },
        required: ['ville', 'region', 'types', 'hebergement'],
      },
      resume: { type: 'string', description: '2 ou 3 phrases en français ; mentionner les changements de prix observés.' },
    },
    required: ['programmes', 'activites', 'photos_a_analyser', 'presence_web', 'fiche', 'resume'],
  },
}

export const OUTIL_PHOTOS = {
  name: 'enregistrer_activites_photos',
  description: 'Enregistre les activités reconnues sur les photos. Appeler une seule fois.',
  input_schema: {
    type: 'object',
    properties: { activites: { type: 'array', items: ACTIVITE } },
    required: ['activites'],
  },
}

export const OUTIL_DECOUVERTE = {
  name: 'proposer_camps',
  description: 'Propose les nouveaux camps trouvés (passe 1, tri grossier). Appeler une seule fois, à la fin.',
  input_schema: {
    type: 'object',
    properties: {
      camps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string' },
            ville: nul('string'),
            region: nul('string'),
            site_web: nul('string'),
            types: { type: 'array', items: { type: 'string', enum: TYPES_CAMP } },
            membre_acq: { type: 'boolean', description: "Membre de l'Association des camps du Québec, si connu." },
            resume: { type: 'string', description: 'Une phrase : ce que c’est, clientèle, activités phares.' },
            pertinence: { type: 'string', description: 'Une phrase : pourquoi c’est (ou non) pertinent pour la BPA.' },
          },
          required: ['nom', 'ville', 'region', 'site_web', 'types', 'membre_acq', 'resume', 'pertinence'],
        },
      },
    },
    required: ['camps'],
  },
}

export const OUTIL_COUTS = {
  name: 'estimer_couts',
  description: "Enregistre l'estimé de coûts de l'activité. Appeler une seule fois.",
  input_schema: {
    type: 'object',
    properties: {
      cout_implantation: { type: 'number', description: 'Dollars canadiens, taxes en sus.' },
      cout_operation_annuel: { type: 'number', description: 'Dollars canadiens par année.' },
      hypotheses: { type: 'string', description: 'Ce qui est compris et les hypothèses, 2 à 4 phrases.' },
      description: { type: 'string', description: "Description courte de l'activité." },
      saisons: { type: 'array', items: { type: 'string', enum: SAISONS } },
    },
    required: ['cout_implantation', 'cout_operation_annuel', 'hypotheses', 'description', 'saisons'],
  },
}

const VECTEUR = { type: 'array', items: { type: 'number' } }
export const OUTIL_MAQUETTE = {
  name: 'creer_maquette',
  description: 'Enregistre la maquette 3D. Appeler une seule fois.',
  input_schema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: "Comment l'activité pourrait s'implanter à la BPA (3 à 5 phrases)." },
      scene: {
        type: 'object',
        properties: {
          sol: {
            type: 'object',
            properties: { largeur: { type: 'number' }, profondeur: { type: 'number' }, couleur: { type: 'string' } },
            required: ['largeur', 'profondeur', 'couleur'],
          },
          objets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nom: { type: 'string' },
                forme: { type: 'string', enum: ['boite', 'cylindre', 'sphere', 'cone'] },
                position: { ...VECTEUR, description: '[x, y, z] du centre, en mètres ; y vers le haut, sol à y = 0.' },
                dimensions: {
                  ...VECTEUR,
                  description: 'boite : [largeur x, hauteur y, profondeur z] ; cylindre et cone : [rayon, hauteur] ; sphere : [rayon].',
                },
                rotation: { ...VECTEUR, description: '[x, y, z] en degrés.' },
                couleur: { type: 'string', description: 'Couleur hexadécimale, ex. #8b5a2b.' },
              },
              required: ['nom', 'forme', 'position', 'dimensions', 'rotation', 'couleur'],
            },
          },
        },
        required: ['sol', 'objets'],
      },
    },
    required: ['description', 'scene'],
  },
}

// ----------------------------------------------------------------- invites
export interface ActiviteListe { id: string; nom: string }

/** Liste commune (bloc système mis en cache, partagé par tout le lot). */
export const blocListe = (activites: ActiviteListe[]) =>
  `Liste commune des activités candidates (identifiant | nom) :\n${activites.map((a) => `${a.id} | ${a.nom}`).join('\n')}`

/** Les quatre types de séjour, pour classer chaque programme (décision du 2026-10-14). */
const TYPES_SEJOUR_TEXTE = `Type de séjour (type_sejour) de CHAQUE programme, connu ou nouveau ; un camp peut offrir
plusieurs types, classe chaque programme à part, d'après son nom, sa description et la page lue :
- camp_vacances : enfants ou ados inscrits seuls par leurs parents (séjour régulier, spécialisé,
  aspirant-moniteur, expédition…) ;
- camp_familial : parents et enfants ensemble (séjour ou fin de semaine en famille) ;
- classe_nature : écoles (classes nature, vertes, neige ou blanches, sorties scolaires avec nuitées) ;
- groupe : groupes organisés qui réservent le site (organismes, équipes sportives, entreprises,
  retraites, location du site) ;
- null si aucun ne convient (camp de jour sans nuit, séjour pour adultes seuls…).`

const consignesManuelles = (consignes: string) =>
  consignes.trim() ? `\n\nConsignes de la direction (prioritaires) :\n${consignes.trim()}` : ''

export function systemeVerification(consignes: string) {
  return `Tu es l'agent de vigie concurrentielle de la BPA.
${BPA}

Tu vérifies UN camp à la fois (camp déjà suivi) et tu enregistres ce que tu trouves avec l'outil
enregistrer_resultats, appelé une seule fois à la toute fin.

1. Prix des programmes — PRIORITÉ NUMÉRO UN. Trouve la page des tarifs de la saison la plus récente
   affichée. Pour chaque programme connu (liste fournie avec identifiants), donne le prix régulier
   actuel, la durée en jours et en nuits, la saison ou l'année du prix et le type de séjour, avec
   programme_id. Prix = montant total pour un enfant (par participant pour une classe nature, une
   famille ou un groupe), en dollars canadiens, sans rabais (lève-tôt, fratrie, membre). Si le
   camp affiche plusieurs durées ou prix pour un même programme, une entrée par variante (ex.
   « Ado-X (12 jours) ») en réutilisant programme_id pour la variante qui correspond au programme
   connu. N'invente jamais un prix : null si introuvable. Un programme connu introuvable : ne le liste
   pas.
2. Nouveaux programmes (programme_id null) : séjours distincts (régulier, aspirant-moniteur,
   expédition, spécialisé, classe nature, famille, groupes…), sans sous-catégories de prix.
   ${TYPES_SEJOUR_TEXTE.replace(/\n/g, '\n   ')}
3. Activités (priorité secondaire, rarement listées de façon structurée) : cherche plus loin qu'un
   simple passage sur le site — pages d'activités, d'installations, de programmes, de classes nature
   et d'hiver, galerie de photos — et surveille les réseaux sociaux (recherche web sur le nom du camp
   avec Facebook ou Instagram, publications récentes) pour repérer des activités absentes du site.
   Associe chaque activité à la liste commune (activite_id) dès que c'est la même activité, même sous
   un autre nom ; null seulement si aucune ne correspond (nom générique, en français). Liste toutes
   les activités observées, même celles déjà connues pour ce camp (les doublons sont ignorés). Pas
   de sorties extérieures banales (cinéma en ville, magasinage).
4. photos_a_analyser : jusqu'à 6 adresses directes d'images (jpg, png, webp) lues dans les pages
   (galerie, activités, installations), qui montrent des activités — de préférence des activités
   qui ne sont pas listées en texte. Jamais d'adresse inventée.
5. presence_web : liens officiels et score sur 10 (qualité, fraîcheur, clarté de l'information et
   des prix pour un parent). fiche : ville, région administrative, types de camp, hébergement.

Cite des pages réellement lues (source_url). Si le site est inaccessible, dis-le dans le résumé et
enregistre ce que tu as.${consignesManuelles(consignes)}`
}

export function systemeDocumentation(consignes: string) {
  return `Tu es l'agent de vigie concurrentielle de la BPA.
${BPA}

Passe 2 (recherche approfondie) : la direction vient de retenir ce camp. Documente TOUS les
paramètres suivis et enregistre-les avec l'outil enregistrer_resultats, appelé une seule fois à la fin :
- programmes : tous les séjours offerts (programme_id null) — camp de vacances, mais aussi classes
  nature, séjours en famille et accueil de groupes s'il y en a —, avec nom, description courte,
  durée en jours et en nuits, prix régulier total par participant (dollars canadiens, sans rabais),
  saison du prix et type de séjour ; une entrée par variante de durée ou de prix ; null plutôt
  qu'un prix inventé ;
  ${TYPES_SEJOUR_TEXTE.replace(/\n/g, '\n  ')}
- activités : recherche approfondie (site, galerie, programmes, hiver, classes nature, réseaux
  sociaux) ; associe chaque activité à la liste commune (activite_id) dès que c'est la même ;
- photos_a_analyser : jusqu'à 6 adresses directes d'images montrant des activités ;
- presence_web : liens officiels (site, Facebook, Instagram, TikTok) et score sur 10 chacun ;
- fiche : ville, région administrative, types de camp, hébergement.
Cite des pages réellement lues (source_url).${consignesManuelles(consignes)}`
}

export interface CampInvite {
  nom: string
  ville: string | null
  region: string | null
  site_web: string | null
  facebook: string | null
  instagram: string | null
  tiktok: string | null
}
export interface ProgrammeInvite {
  id: string
  nom: string
  duree_jours: number | null
  duree_nuits: number | null
  prix: number | null
  annee: string | null
  type_sejour?: string | null
}

export function inviteCamp(camp: CampInvite, programmes: ProgrammeInvite[], activitesConnues: string[], aujourdhui: string) {
  const liens = [camp.site_web, camp.facebook, camp.instagram, camp.tiktok].filter(Boolean).join(' · ')
  const progs = programmes.length
    ? programmes
        .map(
          (p) =>
            `- ${p.id} | ${p.nom} | ${p.duree_jours ?? '?'} jours / ${p.duree_nuits ?? '?'} nuits | ${p.prix ?? '?'} $ | ${p.annee ?? '?'} | ${p.type_sejour ?? '?'}`,
        )
        .join('\n')
    : '(aucun)'
  return `Nous sommes le ${aujourdhui}.

Camp : ${camp.nom} (${[camp.ville, camp.region].filter(Boolean).join(', ') || 'lieu inconnu'})
Liens connus : ${liens || 'aucun'}

Programmes connus (identifiant | nom | durée | prix | saison | type de séjour) :
${progs}

Activités déjà notées pour ce camp : ${activitesConnues.length ? activitesConnues.join(', ') : '(aucune)'}`
}

export function systemePhotos() {
  return `Tu es l'agent de vigie concurrentielle de la BPA.
${BPA}

On te montre des photos tirées du site d'un camp. Reconnais les activités qu'on y voit pratiquer
ou les installations d'activité (tyrolienne, mur d'escalade, voiliers, etc.). Associe chaque
activité à la liste commune (activite_id) dès que c'est la même ; null seulement si aucune ne
correspond (nom générique, en français). photo_url = l'adresse de la photo qui la montre ;
source = "photo". Ignore les photos sans activité reconnaissable. Enregistre avec l'outil
enregistrer_activites_photos (liste vide si rien).`
}

export function systemeDecouverte(consignes: string) {
  return `Tu es l'agent de vigie concurrentielle de la BPA.
${BPA}

Découverte de nouveaux camps (passe 1, tri grossier). Trouve des camps québécois avec
hébergement (camps de vacances, bases et centres de plein air qui accueillent des enfants ou des
classes nature) qui ne sont PAS dans la liste fournie (y compris les camps exclus, à ne jamais
reproposer ; attention aux variantes de nom). Couvre tout le Québec en priorisant les Laurentides,
Lanaudière, l'Outaouais, la Mauricie, l'Estrie, la Capitale-Nationale et la région de Montréal.
Cherche en français et en anglais. Filtre de qualité : écarte les camps de jour sans hébergement,
les maisons de retraite fermée sans programme jeunesse, les hôtels et les camps fermés.
Au plus 15 camps, avec un minimum d'information (c'est un tri rapide). Enregistre avec l'outil
proposer_camps, appelé une seule fois à la fin (liste vide si rien de nouveau).${consignesManuelles(consignes)}`
}

export function inviteDecouverte(connus: { nom: string; site_web: string | null }[], aujourdhui: string) {
  return `Nous sommes le ${aujourdhui}. Camps déjà dans la vigie (ne pas reproposer) :
${connus.map((c) => `- ${c.nom}${c.site_web ? ` (${c.site_web})` : ''}`).join('\n')}`
}

export function systemeCouts() {
  return `Tu estimes, pour la direction de la BPA, ce que coûterait l'ajout d'une activité.
${BPA}

Donne un ordre de grandeur réaliste en dollars canadiens (taxes en sus) :
- cout_implantation : achat d'équipement, aménagement, installation par un fournisseur, formation
  initiale, certifications ;
- cout_operation_annuel : entretien, inspections, consommables, personnel spécialisé additionnel,
  assurances, remplacement d'équipement amorti.
Tu peux faire quelques recherches web pour des prix de référence. Précise les hypothèses (taille,
nombre de participants, partenariat possible). Enregistre avec l'outil estimer_couts.`
}

export function systemeMaquette() {
  return `Tu crées des maquettes 3D simples pour la direction de la BPA.
${BPA}

La maquette sert à la fois à visualiser l'activité et à illustrer une implantation possible à la
BPA (ex. près du lac, en forêt, à côté des pavillons). Construis-la avec des formes de base
(boite, cylindre, sphere, cone), en mètres, à l'échelle : sol plat, y vers le haut, objets posés
sur le sol (position = centre de l'objet, donc y = moitié de la hauteur pour un objet au sol).
Entre 10 et 80 objets : installations, arbres simplifiés (cylindre brun + cone vert), personnages
simplifiés pour l'échelle (cylindre de 1,7 m), eau (boite bleue très mince), sentiers. Couleurs
réalistes. Enregistre avec l'outil creer_maquette.`
}

export function inviteActivite(a: { nom: string; description: string | null; saisons: string[] }, camps: string[]) {
  return `Activité : ${a.nom}
Description : ${a.description ?? '(aucune)'}
Saisons : ${a.saisons.join(', ') || '(non précisées)'}
Offerte chez : ${camps.length ? camps.join(', ') : '(aucun camp suivi)'}`
}
