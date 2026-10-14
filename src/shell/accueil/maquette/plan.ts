/**
 * Plan du camp pour la maquette 3D de l'accueil (demande de Maxime du 2026-10-10).
 *
 * Toutes les coordonnées sont en pixels de la vue Google Earth que Maxime a
 * fournie (2000 × 856, route en haut, lac Maskinongé en bas, échelle 70 m =
 * 340 px). Pour corriger un bâtiment ou une rive, on reprend ses pixels sur
 * cette image. `versMonde` les convertit en mètres pour la scène (X vers la
 * droite, Z vers le bas de l'image, donc vers le lac).
 *
 * Ce que Maxime a précisé (2026-10-10) : le contour rouge = le 3595 ; le 3785
 * (chalet en cours d'achat) = la maison au toit rouge juste à gauche, hors du
 * contour ; Pavillon principal = le complexe de droite (cuisine dans sa partie
 * gauche, direction sous la section du centre, côté rue) ; Vieille-France = le
 * long bâtiment de gauche. Les limites des terrains ne sont pas dessinées et la
 * maison voisine au bout du champ n'est pas montrée (demandes de Maxime).
 */
import type { Secteur } from '@/modules/calendrier/types'

export type Point = readonly [number, number]

/** Les quatre versions de la maquette (demande de Maxime du 2026-10-10 ; le parc aquatique seulement l'été). */
export type Saison = 'ete' | 'automne' | 'hiver' | 'printemps'

/** Saison d'une date (Laurentides) : hiver de décembre à mars, printemps avril-mai, été jusqu'à la mi-septembre. */
export function saisonDe(date: Date): Saison {
  const m = date.getMonth() + 1
  if (m === 12 || m <= 3) return 'hiver'
  if (m <= 5) return 'printemps'
  if (m <= 8 || (m === 9 && date.getDate() < 15)) return 'ete'
  return 'automne'
}

/**
 * Pixels par mètre sur l'image de Maxime : mesuré en la calant sur l'imagerie et les routes
 * (la barre d'échelle de Google, 70 m = 340 px, surestimait de 7 %). Même valeur que
 * `VERS_PLAN.echelle` de `monde.ts`.
 */
const PX_PAR_M = 5.24284
const ORIGINE: Point = [1100, 420]

export const versMonde = ([x, y]: Point): Point => [(x - ORIGINE[0]) / PX_PAR_M, (y - ORIGINE[1]) / PX_PAR_M]
/** L'inverse : des mètres de la scène aux pixels de l'image. */
export const versImage = (x: number, z: number): Point => [x * PX_PAR_M + ORIGINE[0], z * PX_PAR_M + ORIGINE[1]]
/** Une longueur en pixels, en mètres. */
export const metres = (px: number) => px / PX_PAR_M

/** Le terrain détaillé du camp (pixels), juste au sud de la rue ; ses bords se fondent dans le paysage (`paysage.ts`). */
export const SOCLE = { x1: 380, y1: 60, x2: 1860, y2: 1120 }

/** La rive, de gauche à droite ; le lac est en dessous. */
export const RIVE: Point[] = [
  [330, 285], [420, 295], [470, 302], [540, 325], [615, 354], [700, 393], [742, 407], [797, 436],
  [870, 435], [960, 449], [1025, 465], [1080, 497], [1130, 528], [1250, 545], [1370, 564],
  [1440, 579], [1530, 605], [1600, 624], [1690, 640], [1800, 662], [1900, 680],
]

/** Rue Léonard (axe), largeur en mètres. */
export const ROUTE: Point[] = [[300, 8], [700, 28], [1000, 35], [1300, 35], [1600, 28], [1800, 18], [1930, 10]]
export const LARGEUR_ROUTE = 8.5

export type Sol = 'gravier' | 'gazon' | 'champ' | 'sable' | 'chemin'

/** Surfaces peintes sur le sol (dans l'ordre : les suivantes recouvrent les précédentes). */
export const SURFACES: { sol: Sol; points: Point[] }[] = [
  // Gazon autour du chalet du 3785 et sous Vieille-France
  { sol: 'gazon', points: [[450, 55], [668, 62], [668, 165], [600, 230], [500, 232], [452, 150]] },
  { sol: 'gazon', points: [[700, 300], [945, 300], [995, 372], [990, 432], [870, 433], [797, 434], [745, 405], [700, 380]] },
  // Stationnement et allées de gravier, côté rue
  {
    sol: 'gravier',
    points: [
      [700, 52], [800, 55], [800, 118], [960, 132], [980, 160], [1170, 150], [1170, 58], [1262, 58], [1262, 150],
      [1312, 150], [1312, 292], [1236, 302], [1232, 262], [1130, 258], [1060, 248], [960, 240], [905, 246],
      [722, 216], [702, 212], [690, 160],
    ],
  },
  { sol: 'gravier', points: [[420, 40], [452, 40], [458, 140], [470, 190], [440, 192], [428, 140]] },
  // Le champ
  {
    sol: 'champ',
    points: [[1312, 152], [1600, 118], [1712, 108], [1700, 330], [1690, 450], [1600, 455], [1505, 335], [1420, 322], [1312, 330]],
  },
  // Volley-ball et plage
  { sol: 'sable', points: [[1305, 152], [1360, 150], [1362, 245], [1307, 247]] },
  { sol: 'sable', points: [[1262, 470], [1330, 452], [1420, 455], [1482, 472], [1492, 522], [1450, 578], [1370, 564], [1250, 546], [1252, 505]] },
  // Sentiers
  { sol: 'chemin', points: [[1715, 60], [1738, 60], [1735, 160], [1726, 262], [1710, 262], [1714, 160]] },
  { sol: 'chemin', points: [[1607, 470], [1620, 470], [1622, 622], [1609, 622]] },
]

export type Toit = 'pignon' | 'croupe' | 'plat'

export interface Batiment {
  id: string
  /** Centre, largeur (le long de l'image) et profondeur, en pixels. */
  centre: Point
  largeur: number
  profondeur: number
  /** Rotation en degrés (sens horaire sur l'image). */
  angle: number
  /** Hauteur des murs et du toit, en mètres. */
  murs: number
  hauteurToit: number
  toit: Toit
  /** Faîte le long de la profondeur plutôt que de la largeur. */
  faitageTravers?: boolean
  couleurMurs: string
  couleurToit: string
  /** Rangées de fenêtres (une par étage). */
  etages?: number
}

/** Même toit foncé pour les deux bâtiments du camp (demande de Maxime du 2026-10-10). */
const TOIT_CAMP = '#2f3237'

export const BATIMENTS: Batiment[] = [
  // Vieille-France (A) : partie ouest au toit de tôle, partie est au toit foncé
  { id: 'vf-ouest', centre: [768, 258], largeur: 106, profondeur: 76, angle: 9, murs: 6.5, hauteurToit: 3.5, toit: 'pignon', couleurMurs: '#e9e2d3', couleurToit: TOIT_CAMP, etages: 2 },
  { id: 'vf-est', centre: [860, 276], largeur: 82, profondeur: 80, angle: 9, murs: 6.5, hauteurToit: 3.2, toit: 'croupe', couleurMurs: '#e9e2d3', couleurToit: TOIT_CAMP, etages: 2 },
  // Pavillon principal : B (cuisine), section du centre (direction, côté rue), C
  { id: 'pav-b', centre: [1007, 280], largeur: 95, profondeur: 76, angle: 3, murs: 7, hauteurToit: 3.6, toit: 'croupe', couleurMurs: '#efe7d6', couleurToit: TOIT_CAMP, etages: 2 },
  { id: 'pav-b-sud', centre: [1022, 337], largeur: 64, profondeur: 38, angle: 3, murs: 3.6, hauteurToit: 1.2, toit: 'pignon', couleurMurs: '#efe7d6', couleurToit: TOIT_CAMP, etages: 1 },
  { id: 'pav-centre', centre: [1093, 305], largeur: 76, profondeur: 88, angle: 3, murs: 7.5, hauteurToit: 3, toit: 'pignon', faitageTravers: true, couleurMurs: '#efe7d6', couleurToit: TOIT_CAMP, etages: 2 },
  { id: 'pav-c', centre: [1178, 306], largeur: 94, profondeur: 86, angle: 3, murs: 7, hauteurToit: 3.4, toit: 'pignon', couleurMurs: '#efe7d6', couleurToit: TOIT_CAMP, etages: 2 },
  // Le chalet du 3785 (D), toit rouge
  { id: 'chalet-3785', centre: [516, 160], largeur: 88, profondeur: 76, angle: 4, murs: 4.2, hauteurToit: 3.8, toit: 'pignon', couleurMurs: '#f3ead8', couleurToit: '#c8442f', etages: 1 },
  // Petite cabane au bout du champ (E) ; la maison voisine (F) n'est pas montrée
  { id: 'cabane-champ', centre: [1661, 473], largeur: 36, profondeur: 40, angle: 0, murs: 3, hauteurToit: 1.8, toit: 'pignon', couleurMurs: '#b08b62', couleurToit: '#5b4636', etages: 1 },
]

/** Quais : segments [début, fin, largeur en m]. */
export const QUAIS: [Point, Point, number][] = [
  // Quai en U devant la plage
  [[1253, 545], [1251, 605], 2.4],
  [[1365, 562], [1362, 613], 2.4],
  [[1251, 605], [1362, 613], 2.4],
  // Quai en T au coin du champ
  [[1612, 622], [1606, 676], 2],
  [[1545, 672], [1652, 685], 2.4],
  // Accès au parc aquatique et quai du chalet
  [[872, 432], [875, 480], 1.8],
  [[468, 298], [478, 336], 3],
]

/** Parc aquatique gonflable : poutres flottantes (segments) et modules. */
export const AQUA_POUTRES: [Point, Point][] = [
  [[915, 577], [1218, 634]],
  [[890, 630], [1230, 680]],
  [[945, 676], [1210, 725]],
  [[908, 552], [915, 680]],
  [[985, 605], [975, 690]],
  [[1065, 620], [1060, 700]],
  [[1140, 622], [1135, 720]],
  [[1217, 634], [1222, 742]],
]
export const AQUA_MODULES: { point: Point; taille: number; hauteur: number; couleur: string }[] = [
  { point: [912, 554], taille: 4, hauteur: 2.2, couleur: '#f5d76e' },
  { point: [1065, 660], taille: 7, hauteur: 1.6, couleur: '#f1d98a' },
  { point: [1140, 668], taille: 5, hauteur: 2.4, couleur: '#ffffff' },
  { point: [1057, 696], taille: 3.5, hauteur: 2, couleur: '#f5d76e' },
  { point: [985, 690], taille: 3.5, hauteur: 1.4, couleur: '#7cc4e8' },
  { point: [1217, 638], taille: 4, hauteur: 1.8, couleur: '#7fd1a8' },
  { point: [1156, 772], taille: 5, hauteur: 2, couleur: '#f5d76e' },
]
/** Glissade jaune : du bas vers le haut. */
export const AQUA_GLISSADE: [Point, Point] = [[1003, 596], [1017, 538]]
/** Bouée de sécurité qui ferme la baignade. */
export const AQUA_BOUEE: Point[] = [
  [875, 445], [870, 570], [860, 700], [900, 745], [950, 775], [1040, 792], [1150, 805], [1220, 800],
  [1240, 760], [1255, 700], [1262, 615],
]

/** Petits objets du terrain. */
export const AUTOBUS: { point: Point; angle: number }[] = [{ point: [1673, 352], angle: 90 }]
export const VOITURES: { point: Point; angle: number; couleur: string }[] = [
  { point: [722, 118], angle: 90, couleur: '#f1f3f5' },
  { point: [742, 120], angle: 90, couleur: '#495057' },
  { point: [763, 190], angle: 80, couleur: '#ced4da' },
  { point: [1172, 152], angle: 90, couleur: '#f8f9fa' },
  { point: [1018, 198], angle: 0, couleur: '#e9ecef' },
]
export const TENTES: Point[] = [[1453, 160], [1480, 150], [1527, 143]]
export const PARASOLS: Point[] = [[885, 395], [935, 410], [968, 408]]
export const CANOTS: { point: Point; angle: number; couleur: string }[] = [
  { point: [1455, 548], angle: 35, couleur: '#e03131' },
  { point: [1465, 556], angle: 35, couleur: '#f8f9fa' },
  { point: [1474, 562], angle: 35, couleur: '#e03131' },
]
export const FILET_VOLLEY: [Point, Point] = [[1306, 199], [1361, 197]]

/** Boisés (polygones) : les arbres y sont semés, hors bâtiments et lieux de travail. */
export const BOISES: Point[][] = [
  // Haie le long de la rue
  [[440, 58], [700, 60], [700, 104], [440, 100]],
  [[805, 86], [990, 96], [990, 128], [805, 120]],
  [[1268, 60], [1705, 52], [1705, 98], [1268, 146]],
  // À gauche du chalet du 3785 et autour
  [[330, 25], [418, 35], [418, 292], [330, 284]],
  [[565, 150], [665, 168], [615, 352], [540, 325], [470, 302], [440, 240], [452, 205], [530, 210], [565, 190]],
  // Bande entre le 3785 et Vieille-France
  [[668, 168], [705, 172], [712, 300], [742, 405], [700, 392], [615, 352]],
  [[700, 330], [758, 335], [758, 425], [700, 395]],
  [[862, 300], [915, 300], [915, 368], [862, 368]],
  // Entre le Pavillon et le lac
  [[1000, 372], [1240, 358], [1252, 448], [1258, 540], [1130, 526], [1080, 496], [1025, 464], [995, 440]],
  // Bosquets du champ
  [[1240, 332], [1330, 322], [1420, 332], [1500, 342], [1510, 430], [1478, 462], [1420, 452], [1330, 447], [1265, 456], [1240, 420]],
  [[1580, 342], [1700, 332], [1700, 445], [1680, 445], [1640, 445], [1580, 420]],
  [[1492, 445], [1600, 462], [1640, 500], [1690, 560], [1690, 638], [1600, 622], [1530, 603], [1492, 580], [1494, 525]],
  // Boisé à droite
  [[1716, 40], [1900, 30], [1900, 680], [1800, 661], [1700, 640], [1716, 300]],
]

/** Lieux de travail par secteur (pixels). On remplit chaque secteur à tour de rôle. */
export interface Lieu {
  point: Point
  /** En ligne (quai), sinon en cercle. */
  jusqua?: Point
  /** Les personnes se promènent autour (animation) ou font des allers-retours (terrain). */
  mouvement?: 'ronde' | 'va-et-vient'
}

export const LIEUX: Record<Secteur, Lieu[]> = {
  // Vue de la rue : on place d'abord les gens là où on les voit (côté rue, champ)
  direction: [{ point: [1093, 226] }],
  cuisine: [{ point: [948, 222] }],
  animation: [
    { point: [1470, 262], mouvement: 'ronde' },
    { point: [1585, 205], mouvement: 'ronde' },
    { point: [1334, 222], mouvement: 'ronde' },
    { point: [1385, 505], mouvement: 'ronde' },
    { point: [1262, 604], jusqua: [1352, 612] },
    { point: [922, 395], mouvement: 'ronde' },
  ],
  terrain: [
    { point: [770, 166], mouvement: 'va-et-vient' },
    { point: [1648, 318], mouvement: 'va-et-vient' },
    { point: [1240, 262], mouvement: 'va-et-vient' },
    { point: [808, 350], mouvement: 'va-et-vient' },
  ],
}

/** Couleur du chandail par secteur (mêmes teintes que le Calendrier). */
export const COULEUR_SECTEUR: Record<Secteur, string> = {
  direction: '#0284c7',
  cuisine: '#f59e0b',
  animation: '#19774a',
  terrain: '#78716c',
}

