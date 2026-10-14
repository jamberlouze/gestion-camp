/**
 * Maquette 3D du camp (Three.js) : terrain aux bords fondus, lac, bâtiments,
 * arbres, quais et les employés au travail aujourd'hui en petits bonhommes,
 * en quatre saisons (le parc aquatique seulement l'été).
 * Tout est impératif ici ; le composant React ne fait que monter, passer les
 * personnes et détruire. Coordonnées et lieux : `plan.ts`.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Secteur } from '@/modules/calendrier/types'
import {
  AQUA_BOUEE, AQUA_GLISSADE, AQUA_MODULES, AQUA_POUTRES, AUTOBUS, BATIMENTS, BOISES, CANOTS, COULEUR_SECTEUR,
  FILET_VOLLEY, LIEUX, metres, PARASOLS, QUAIS, RIVE, SOCLE,
  SURFACES, TENTES, saisonDe, versImage, versMonde, VOITURES,
  type Batiment, type Lieu, type Point, type Saison, type Sol,
} from './plan'
import { LOTS, ROUTES } from './monde'
import { ajouterPaysage, versScene } from './paysage'

export type { Saison }

export interface PersonneMaquette {
  cle: string
  nom: string
  secteur: Secteur
  detail: string
}

export interface Maquette {
  personnes(liste: PersonneMaquette[]): void
  surligner(cle: string | null): void
  zoomer(facteur: number): void
  recentrer(): void
  /** Glisse vers une des vues (camp, terrain, lac). */
  vue(nom: Vue): void
  /** Position de la caméra si on l'a déplacée (pour la garder d'une saison à l'autre). */
  etatCamera(): EtatCamera | null
  detruire(): void
}

/** Les vues proposées (demande de Maxime du 2026-10-11). */
export type Vue = 'camp' | 'terrain' | 'lac'

export interface EtatCamera {
  position: [number, number, number]
  cible: [number, number, number]
}

interface Options {
  conteneur: HTMLElement
  mouvementReduit: boolean
  date: Date
  /** Par défaut, la saison de la date. */
  saison?: Saison
  camera?: EtatCamera | null
  vue?: Vue
  surSurvol?: (cle: string | null) => void
  /** Appelé quand on tente de zoomer à la molette sans ⌘/Ctrl. */
  surMoletteSeule?: () => void
}


// ---------------------------------------------------------------------------
// Petits outils

function aleatoire(graine: number) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hachage(texte: string) {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619)
  return h >>> 0
}

function dansPolygone([x, y]: Point, poly: readonly Point[]) {
  let dedans = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

function distanceSegment([x, y]: Point, [x1, y1]: Point, [x2, y2]: Point) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

const distancePolyligne = (p: Point, ligne: readonly Point[]) =>
  Math.min(...ligne.slice(1).map((b, i) => distanceSegment(p, ligne[i], b)))

/** La rive coupée aux bords du socle. */
function riveDansSocle(): Point[] {
  const a = (x: number): Point => {
    const i = Math.max(1, RIVE.findIndex((p) => p[0] >= x))
    const [x1, y1] = RIVE[i - 1]
    const [x2, y2] = RIVE[i]
    return [x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)]
  }
  return [a(SOCLE.x1), ...RIVE.filter((p) => p[0] > SOCLE.x1 && p[0] < SOCLE.x2), a(SOCLE.x2)]
}

interface Tache {
  couleurs: string[]
  nombre: number
  /** Rayon en pixels du canevas. */
  rayon: [number, number]
  /** Seulement sur ces sols (sinon partout). */
  sols?: Sol[]
}

interface Ambiance {
  sol: string
  gazon: string
  champ: string
  sols: Record<Exclude<Sol, 'gazon' | 'champ'>, string>
  accotement: string
  taches: Tache[]
  feuillus: string[]
  tailleFeuillus: number
  /** Hiver : feuillus sans feuilles. */
  nus?: boolean
  coniferes: string[]
  eau: { couleur: string; vagues: boolean }
  quais: string
  toitsNeige?: boolean
  /** Parc aquatique, parasols, canots, tentes et filet de volley. */
  ete?: boolean
  lumiere: number
  /** Ciel (haut, horizon) et collines au loin. */
  ciel: [string, string]
  collines: string
}

const CONIFERES = ['#2f5d3a', '#3b6b42', '#24503a', '#356344']
const SOLS_SECS = { gravier: '#cdbd98', sable: '#ead7a4', chemin: '#c2ab83' }

const AMBIANCES: Record<Saison, Ambiance> = {
  ete: {
    sol: '#5d8a43', gazon: '#82b257', champ: '#8fbf5e', sols: SOLS_SECS, accotement: '#b7a988', taches: [],
    feuillus: ['#4f8a3c', '#5f9a45', '#6aa84f', '#7bb257'], tailleFeuillus: 1, coniferes: CONIFERES,
    eau: { couleur: '#3a7fa9', vagues: true }, quais: '#b08d63', ete: true, lumiere: 1, ciel: ['#6fa8dc', '#dbe8f1'], collines: '#56735f',
  },
  automne: {
    sol: '#6b7d3e', gazon: '#8fa954', champ: '#9ab35d', sols: SOLS_SECS, accotement: '#b7a988',
    // Feuilles mortes au sol
    taches: [{ couleurs: ['#c92a2a', '#e8590c', '#a61e1e', '#d9480f', '#f08c00'], nombre: 7000, rayon: [1.5, 3.5] }],
    feuillus: ['#c92a2a', '#e03131', '#b02525', '#d9480f', '#a61e1e', '#e8590c', '#c2255c', '#f08c00'], tailleFeuillus: 1,
    coniferes: CONIFERES, eau: { couleur: '#37789f', vagues: true }, quais: '#a8865d', lumiere: 0.95, ciel: ['#86aed3', '#e5e3dc'], collines: '#7a6250',
  },
  hiver: {
    sol: '#eef2f6', gazon: '#f3f6f9', champ: '#f6f8fa', sols: { gravier: '#d9d6d0', sable: '#f1f4f7', chemin: '#e4e8ec' },
    accotement: '#f7f9fb',
    taches: [{ couleurs: ['#ffffff', '#dde4eb'], nombre: 6000, rayon: [1.5, 4] }],
    feuillus: ['#6f6258', '#7a6b5f', '#65594f'], tailleFeuillus: 1, nus: true,
    coniferes: ['#3e5f4a', '#9db3a6', '#c9d6cf', '#567565'],
    eau: { couleur: '#a9c8da', vagues: false }, quais: '#e8edf1', toitsNeige: true, lumiere: 0.8, ciel: ['#a4b8c9', '#e8ecf0'], collines: '#c6d0d8',
  },
  printemps: {
    sol: '#6f7d45', gazon: '#8c9d5a', champ: '#93a35e', sols: { gravier: '#c2b08c', sable: '#dccb9c', chemin: '#a68b66' },
    accotement: '#b0a080',
    taches: [
      // Un peu de bouette et quelques flaques sur le gravier et les sentiers, des restes de neige
      { couleurs: ['#86684a', '#7b5b3d'], nombre: 220, rayon: [4, 10], sols: ['gravier', 'chemin'] },
      { couleurs: ['#6f8a9a', '#7d97a6'], nombre: 40, rayon: [5, 10], sols: ['gravier', 'chemin'] },
      { couleurs: ['#eef2f5'], nombre: 160, rayon: [3, 9] },
    ],
    feuillus: ['#c5dd8f', '#b3d27b', '#d6e6a6', '#a9cc72', '#e9c9d6'], tailleFeuillus: 0.7, coniferes: CONIFERES,
    eau: { couleur: '#457f9e', vagues: true }, quais: '#9c7c57', lumiere: 0.95, ciel: ['#7fb4df', '#e0ebf1'], collines: '#6a7f5f',
  },
}
/** Les bonhommes sont un peu plus grands que nature, pour se voir de loin. */
const TAILLE_BONHOMME = 0.8
const TEINTES_PEAU = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#f5d6bd', '#b5764f']

// ---------------------------------------------------------------------------

export function creerMaquette({ conteneur, mouvementReduit, date, saison: saisonChoisie, camera: cameraDepart, vue: vueChoisie = 'camp', surSurvol, surMoletteSeule }: Options): Maquette {
  const saison = saisonChoisie ?? saisonDe(date)
  const ambiance = AMBIANCES[saison]
  const petitEcran = conteneur.clientWidth < 640

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.className = 'block h-full w-full outline-none'
  conteneur.appendChild(renderer.domElement)


  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 5, 40000)

  // Ressources à libérer à la fin
  const geometries = new Set<THREE.BufferGeometry>()
  const materiaux = new Map<string, THREE.Material>()
  const textures: THREE.Texture[] = []
  const geo = <G extends THREE.BufferGeometry>(g: G) => (geometries.add(g), g)
  const mat = (couleur: string, extra: THREE.MeshStandardMaterialParameters = {}, cle = '') => {
    const k = `${couleur}|${cle}|${JSON.stringify(extra)}`
    let m = materiaux.get(k)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.85, ...extra })
      materiaux.set(k, m)
    }
    return m as THREE.MeshStandardMaterial
  }
  const ombres = <O extends THREE.Object3D>(o: O, porte = true, recoit = true) => {
    o.castShadow = porte
    o.receiveShadow = recoit
    return o
  }

  // --- Lumière : derrière la caméra, à sa gauche (la scène est vue de la rue)
  scene.add(new THREE.HemisphereLight('#dbeeff', '#5d6b45', 1.5 * ambiance.lumiere))
  const soleil = new THREE.DirectionalLight('#fff4e0', 2.6 * ambiance.lumiere)
  soleil.position.set(150, 200, -130)
  soleil.castShadow = true
  soleil.shadow.mapSize.set(petitEcran ? 1024 : 2048, petitEcran ? 1024 : 2048)
  Object.assign(soleil.shadow.camera, { left: -210, right: 210, top: 170, bottom: -170, near: 10, far: 600 })
  soleil.shadow.bias = -0.0004
  soleil.shadow.normalBias = 0.5
  soleil.shadow.camera.updateProjectionMatrix()
  scene.add(soleil, soleil.target)

  // --- Terrain : sol plat, rive, fond du lac et eau ; les bords se fondent dans le fond
  const [X1, Z1] = versMonde([SOCLE.x1, SOCLE.y1])
  const [X2, Z2] = versMonde([SOCLE.x2, SOCLE.y2])
  const LARGEUR = X2 - X1
  const PROFONDEUR = Z2 - Z1
  // Niveaux (voir paysage.ts) : le sol du monde à 0, le lac à 0,03, l'eau du camp à 0,09, son sol à 0,15
  const NIVEAU_EAU = 0.09
  const SOL_CAMP = 0.15

  // Fondu des bords (gauche, droite, rue, lac ; en mètres), appliqué dans le nuanceur
  const bornes = { value: new THREE.Vector4(X1, X2, Z1, Z2) }
  const fondus = { value: new THREE.Vector4(22, 22, 5, 70) }
  const fondre = <M extends THREE.Material>(m: M) => {
    m.transparent = true
    m.onBeforeCompile = (nuanceur) => {
      nuanceur.uniforms.uBornes = bornes
      nuanceur.uniforms.uFondus = fondus
      nuanceur.vertexShader =
        'varying vec2 vMondeXZ;\n' +
        nuanceur.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 mondeFondu = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mondeFondu = instanceMatrix * mondeFondu;
          #endif
          vMondeXZ = ( modelMatrix * mondeFondu ).xz;`,
        )
      nuanceur.fragmentShader =
        'varying vec2 vMondeXZ;\nuniform vec4 uBornes;\nuniform vec4 uFondus;\n' +
        nuanceur.fragmentShader.replace(
          '#include <dithering_fragment>',
          // Les côtés se fondent de plus en plus large vers le fond du lac (une vignette plutôt qu'une boîte)
          `float versLeFond = clamp( ( vMondeXZ.y - uBornes.z ) / ( uBornes.w - uBornes.z ), 0.0, 1.0 );
          float cote = 1.0 + 2.5 * versLeFond * versLeFond;
          gl_FragColor.a *= smoothstep( 0.0, uFondus.x * cote, vMondeXZ.x - uBornes.x ) * smoothstep( 0.0, uFondus.y * cote, uBornes.y - vMondeXZ.x )
            * smoothstep( 0.0, uFondus.z, vMondeXZ.y - uBornes.z ) * smoothstep( 0.0, uFondus.w, uBornes.w - vMondeXZ.y );
          #include <dithering_fragment>`,
        )
    }
    m.customProgramCacheKey = () => 'fondu'
    return m
  }

  const forme = (points: readonly Point[]) => {
    const s = new THREE.Shape()
    points.forEach((p, i) => {
      const [x, z] = versMonde(p)
      if (i === 0) s.moveTo(x, -z)
      else s.lineTo(x, -z)
    })
    return s
  }
  /** Surface à plat à la hauteur `y`. */
  const aPlat = (points: readonly Point[], y: number) => {
    const g = geo(new THREE.ShapeGeometry(forme(points)))
    g.rotateX(-Math.PI / 2)
    g.translate(0, y, 0)
    return g
  }

  const rive = riveDansSocle()
  const terre: Point[] = [[SOCLE.x1, SOCLE.y1], [SOCLE.x2, SOCLE.y1], ...[...rive].reverse()]
  const eau: Point[] = [...rive, [SOCLE.x2, SOCLE.y2], [SOCLE.x1, SOCLE.y2]]

  // Sol peint (gazon, gravier, champ, sable, rue, feuilles, neige ou bouette)
  const textureSol = new THREE.CanvasTexture(peindreSol(ambiance))
  textureSol.colorSpace = THREE.SRGBColorSpace
  textureSol.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  textures.push(textureSol)

  const gTerre = aPlat(terre, SOL_CAMP)
  const pos = gTerre.getAttribute('position') as THREE.BufferAttribute
  const uv = gTerre.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - X1) / LARGEUR, 1 - (pos.getZ(i) - Z1) / PROFONDEUR)
  uv.needsUpdate = true
  const dessusTerre = fondre(new THREE.MeshStandardMaterial({ map: textureSol, roughness: 1 }))
  materiaux.set('sol', dessusTerre)
  scene.add(ombres(new THREE.Mesh(gTerre, dessusTerre), false, true))



  // Eau (ou glace), opaque : un fond de lac vu à travers ferait une bande sombre dans le fondu.
  // Une grille dont on ne garde que les triangles du lac.
  const matEau = fondre(
    new THREE.MeshStandardMaterial({
      color: ambiance.eau.couleur,
      roughness: ambiance.eau.vagues ? 0.2 : 0.35,
      metalness: 0.05,
      flatShading: ambiance.eau.vagues,
    }),
  )
  materiaux.set('eau', matEau)
  const gEau = geo(new THREE.PlaneGeometry(LARGEUR, PROFONDEUR, petitEcran ? 60 : 96, petitEcran ? 38 : 60))
  gEau.rotateX(-Math.PI / 2)
  gEau.translate((X1 + X2) / 2, NIVEAU_EAU, (Z1 + Z2) / 2)
  {
    const p = gEau.getAttribute('position') as THREE.BufferAttribute
    const dansLac = Array.from({ length: p.count }, (_, i) => dansPolygone(versImage(p.getX(i), p.getZ(i)), eau))
    const index = gEau.getIndex()!.array
    const gardes: number[] = []
    for (let i = 0; i < index.length; i += 3) {
      if (dansLac[index[i]] || dansLac[index[i + 1]] || dansLac[index[i + 2]]) gardes.push(index[i], index[i + 1], index[i + 2])
    }
    gEau.setIndex(gardes)
  }
  const eauBase = Float32Array.from((gEau.getAttribute('position') as THREE.BufferAttribute).array)
  scene.add(ombres(new THREE.Mesh(gEau, matEau), false, true))

  // Tout autour : le lac au complet, la forêt, les routes, les maisons, les collines et le ciel
  const paysage = ajouterPaysage({
    scene,
    petitEcran,
    centre: versMonde([1100, 300]),
    dansCamp: (x, z) => {
      const [u, v] = versImage(x, z)
      return u >= SOCLE.x1 && u <= SOCLE.x2 && v >= SOCLE.y1 && v <= SOCLE.y2
    },
    couleurs: {
      sol: ambiance.sol,
      champ: ambiance.champ,
      eau: ambiance.eau.couleur,
      glace: !ambiance.eau.vagues,
      coniferes: ambiance.coniferes,
      feuillus: ambiance.feuillus,
      nus: !!ambiance.nus,
      tailleFeuillus: ambiance.tailleFeuillus,
      toitsNeige: !!ambiance.toitsNeige,
      collines: ambiance.collines,
      ciel: ambiance.ciel,
    },
  })

  // Lac gelé : des plaques de neige sur la glace
  if (!ambiance.eau.vagues) {
    const aleatNeige = aleatoire(31)
    const plaque = geo(new THREE.CircleGeometry(1, 7))
    plaque.rotateX(-Math.PI / 2)
    const points: THREE.Matrix4[] = []
    while (points.length < 34) {
      const p: Point = [SOCLE.x1 + aleatNeige() * (SOCLE.x2 - SOCLE.x1), SOCLE.y1 + aleatNeige() * (SOCLE.y2 - SOCLE.y1)]
      if (!dansPolygone(p, eau)) continue
      const [x, z] = versMonde(p)
      const r = 8 + aleatNeige() * 16
      points.push(new THREE.Matrix4().compose(new THREE.Vector3(x, NIVEAU_EAU + 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), aleatNeige() * 6), new THREE.Vector3(r, 1, r * (0.18 + aleatNeige() * 0.3))))
    }
    const plaques = new THREE.InstancedMesh(plaque, fondre(mat('#f2f6f9', { roughness: 0.9 }, 'neige-lac')), points.length)
    points.forEach((m, i) => plaques.setMatrixAt(i, m))
    scene.add(ombres(plaques, false, true))
  }

  // --- Bâtiments
  const fenetres: THREE.Matrix4[] = []
  let cheminee: THREE.Vector3 | null = null
  for (const b of BATIMENTS) {
    const g = batiment(b)
    scene.add(g)
    if (b.id === 'pav-b') {
      const c = new THREE.Mesh(geo(new THREE.BoxGeometry(1.4, 3, 1.4)), mat('#8c6d5a'))
      c.position.set(-metres(b.largeur) * 0.22, b.murs + b.hauteurToit * 0.6, -metres(b.profondeur) * 0.18)
      g.add(ombres(c))
      g.updateMatrixWorld(true)
      cheminee = new THREE.Vector3(0, 1.6, 0).applyMatrix4(c.matrixWorld)
    }
  }
  if (fenetres.length) {
    const vitres = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(1.3, 1.1, 0.15)), mat('#3f5f7a', { roughness: 0.3, metalness: 0.2 }), fenetres.length)
    fenetres.forEach((m, i) => vitres.setMatrixAt(i, m))
    scene.add(vitres)
  }

  function batiment(b: Batiment) {
    const [x, z] = versMonde(b.centre)
    const l = metres(b.largeur)
    const p = metres(b.profondeur)
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = -THREE.MathUtils.degToRad(b.angle)
    const murs = new THREE.Mesh(geo(new THREE.BoxGeometry(l, b.murs, p)), mat(b.couleurMurs))
    murs.position.y = b.murs / 2
    g.add(ombres(murs))

    const debord = 0.6
    const L = l / 2 + debord
    const P = p / 2 + debord
    const h = b.hauteurToit
    let toit: THREE.BufferGeometry
    if (b.toit === 'plat') {
      toit = new THREE.BoxGeometry(2 * L, 0.6, 2 * P)
      toit.translate(0, 0.3, 0)
    } else {
      const [A, B] = b.toit === 'pignon' ? (b.faitageTravers ? [P, L] : [L, P]) : L >= P ? [L, P] : [P, L]
      const r = b.toit === 'pignon' ? A : Math.max(A - B, 0.01)
      // Faîte le long de x (A = demi-longueur, B = demi-largeur), puis tourné au besoin
      const v = [
        [-A, 0, -B], [A, 0, -B], [A, 0, B], [-A, 0, B], [-r, h, 0], [r, h, 0],
      ]
      const faces = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [0, 3, 4], [2, 1, 5]]
      toit = new THREE.BufferGeometry()
      toit.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat().flatMap((i) => v[i]), 3))
      toit.computeVertexNormals()
      if ((b.toit === 'pignon' && b.faitageTravers) || (b.toit === 'croupe' && L < P)) toit.rotateY(Math.PI / 2)
    }
    const couleurToit = ambiance.toitsNeige ? `#${new THREE.Color(b.couleurToit).lerp(new THREE.Color('#f4f7fa'), 0.88).getHexString()}` : b.couleurToit
    const mToit = new THREE.Mesh(geo(toit), mat(couleurToit, { flatShading: true, roughness: 0.75, side: THREE.DoubleSide }))
    mToit.position.y = b.murs
    g.add(ombres(mToit))

    // Fenêtres : une rangée par étage sur chaque façade
    g.updateMatrixWorld(true)
    const etages = b.etages ?? 1
    const hEtage = b.murs / etages
    const facade = (longueur: number, place: (t: number, y: number) => THREE.Matrix4) => {
      const n = Math.max(1, Math.floor((longueur - 2) / 3.2))
      for (let e = 0; e < etages; e++) {
        const y = e * hEtage + hEtage * 0.55
        for (let i = 0; i < n; i++) fenetres.push(place(-longueur / 2 + (longueur / n) * (i + 0.5), y).premultiply(g.matrixWorld))
      }
    }
    const tourne = new THREE.Matrix4().makeRotationY(Math.PI / 2)
    facade(l, (t, y) => new THREE.Matrix4().makeTranslation(t, y, p / 2))
    facade(l, (t, y) => new THREE.Matrix4().makeTranslation(t, y, -p / 2))
    facade(p, (t, y) => new THREE.Matrix4().makeTranslation(l / 2, y, t).multiply(tourne))
    facade(p, (t, y) => new THREE.Matrix4().makeTranslation(-l / 2, y, t).multiply(tourne))
    return g
  }

  // --- Quais
  for (const [a, b, largeur] of QUAIS) {
    const [x1, z1] = versMonde(a)
    const [x2, z2] = versMonde(b)
    const l = Math.hypot(x2 - x1, z2 - z1) + largeur * 0.6
    const q = new THREE.Mesh(geo(new THREE.BoxGeometry(l, 0.5, largeur)), fondre(mat(ambiance.quais, { roughness: 0.9 }, 'quai')))
    q.position.set((x1 + x2) / 2, 0.08, (z1 + z2) / 2)
    q.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
    scene.add(ombres(q))
  }

  // --- Parc aquatique (l'été seulement)
  if (ambiance.ete) {
  const flotte = NIVEAU_EAU + 0.35
  const couleursAqua = ['#f1f3f5', '#74c0fc', '#f1f3f5', '#8ce99a', '#f1f3f5', '#4dabf7']
  let numeroBloc = 0
  for (const [a, b] of AQUA_POUTRES) {
    const [x1, z1] = versMonde(a)
    const [x2, z2] = versMonde(b)
    const l = Math.hypot(x2 - x1, z2 - z1)
    const n = Math.max(1, Math.round(l / 4.5))
    const angle = Math.atan2(-(z2 - z1), x2 - x1)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const m = new THREE.Mesh(geo(new THREE.BoxGeometry(l / n - 0.15, 0.9, 2)), mat(couleursAqua[numeroBloc++ % couleursAqua.length], { roughness: 0.5 }))
      m.position.set(x1 + (x2 - x1) * t, flotte, z1 + (z2 - z1) * t)
      m.rotation.y = angle
      scene.add(ombres(m))
    }
  }
  for (const mod of AQUA_MODULES) {
    const [x, z] = versMonde(mod.point)
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(mod.taille, mod.hauteur, mod.taille)), mat(mod.couleur, { roughness: 0.5 }))
    m.position.set(x, NIVEAU_EAU + mod.hauteur / 2, z)
    m.rotation.y = 0.15
    scene.add(ombres(m))
  }
  {
    const [x1, z1] = versMonde(AQUA_GLISSADE[0])
    const [x2, z2] = versMonde(AQUA_GLISSADE[1])
    const l = Math.hypot(x2 - x1, z2 - z1)
    const haut = 5
    const pente = new THREE.Mesh(geo(new THREE.BoxGeometry(Math.hypot(l, haut), 0.6, 2.4)), mat('#fcc419', { roughness: 0.45 }))
    pente.position.set((x1 + x2) / 2, NIVEAU_EAU + haut / 2, (z1 + z2) / 2)
    pente.rotation.set(0, Math.atan2(-(z2 - z1), x2 - x1), Math.atan2(haut, l), 'YXZ')
    const tour = new THREE.Mesh(geo(new THREE.BoxGeometry(3.4, haut + 1, 3.4)), mat('#fab005', { roughness: 0.45 }))
    tour.position.set(x2, NIVEAU_EAU + (haut + 1) / 2, z2)
    scene.add(ombres(pente), ombres(tour))
  }
  {
    const points: THREE.Vector3[] = []
    for (let i = 1; i < AQUA_BOUEE.length; i++) {
      const [x1, z1] = versMonde(AQUA_BOUEE[i - 1])
      const [x2, z2] = versMonde(AQUA_BOUEE[i])
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / 2.4))
      for (let k = 0; k < n; k++) points.push(new THREE.Vector3(x1 + ((x2 - x1) * k) / n, NIVEAU_EAU + 0.1, z1 + ((z2 - z1) * k) / n))
    }
    const bouees = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.45, 8, 6)), mat('#ffffff', { roughness: 0.5 }), points.length)
    const c = new THREE.Color()
    points.forEach((p, i) => {
      bouees.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))
      bouees.setColorAt(i, c.set(i % 2 ? '#fcc419' : '#ffffff'))
    })
    scene.add(bouees)
  }
  }

  // --- Petits objets : autobus, voitures, tentes, parasols, canots, filet
  const placer = (o: THREE.Object3D, p: Point, angle: number, y = 0) => {
    const [x, z] = versMonde(p)
    o.position.set(x, y, z)
    o.rotation.y = -THREE.MathUtils.degToRad(angle)
    scene.add(o)
    return o
  }
  for (const a of AUTOBUS) {
    const g = new THREE.Group()
    const caisse = new THREE.Mesh(geo(new THREE.BoxGeometry(11.5, 2.8, 2.5)), mat('#fcc419', { roughness: 0.55 }))
    caisse.position.y = 1.9
    const vitres = new THREE.Mesh(geo(new THREE.BoxGeometry(10.6, 0.8, 2.56)), mat('#2b2f36', { roughness: 0.3 }))
    vitres.position.set(0.3, 2.6, 0)
    g.add(ombres(caisse), vitres)
    placer(g, a.point, a.angle)
  }
  for (const v of VOITURES) {
    const g = new THREE.Group()
    const bas = new THREE.Mesh(geo(new THREE.BoxGeometry(4.4, 0.9, 1.9)), mat(v.couleur, { roughness: 0.4 }))
    bas.position.y = 0.75
    const haut = new THREE.Mesh(geo(new THREE.BoxGeometry(2.4, 0.7, 1.7)), mat('#3a4048', { roughness: 0.3 }))
    haut.position.set(-0.2, 1.5, 0)
    g.add(ombres(bas), ombres(haut))
    placer(g, v.point, v.angle)
  }
  if (ambiance.ete) {
  for (const t of TENTES) {
    const g = new THREE.Group()
    const toile = new THREE.Mesh(geo(new THREE.ConeGeometry(2.9, 1.3, 4)), mat('#f8f9fa', { flatShading: true }))
    toile.position.y = 2.9
    toile.rotation.y = Math.PI / 4
    g.add(ombres(toile))
    for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [1.9, 1.9], [-1.9, 1.9]]) {
      const patte = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.08, 0.08, 2.3, 5)), mat('#adb5bd'))
      patte.position.set(dx, 1.15, dz)
      g.add(patte)
    }
    placer(g, t, 8)
  }
  for (const p of PARASOLS) {
    const g = new THREE.Group()
    const toile = new THREE.Mesh(geo(new THREE.ConeGeometry(1.9, 0.7, 8)), mat('#4dabf7', { flatShading: true }))
    toile.position.y = 2.6
    const poteau = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5)), mat('#dee2e6'))
    poteau.position.y = 1.3
    const table = new THREE.Mesh(geo(new THREE.BoxGeometry(2.2, 0.2, 1.4)), mat('#a47d55'))
    table.position.y = 0.8
    g.add(ombres(toile), poteau, ombres(table))
    placer(g, p, 0)
  }
  for (const c of CANOTS) {
    const m = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.42, 4, 3, 8)), mat(c.couleur, { roughness: 0.5 }))
    m.rotation.z = Math.PI / 2
    const g = new THREE.Group()
    g.add(ombres(m))
    g.scale.set(1, 0.6, 1)
    placer(g, c.point, c.angle, 0.3)
  }
  {
    const [x1, z1] = versMonde(FILET_VOLLEY[0])
    const [x2, z2] = versMonde(FILET_VOLLEY[1])
    for (const [x, z] of [[x1, z1], [x2, z2]]) {
      const poteau = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6)), mat('#868e96'))
      poteau.position.set(x, 1.25, z)
      scene.add(ombres(poteau))
    }
    const l = Math.hypot(x2 - x1, z2 - z1)
    const filet = new THREE.Mesh(geo(new THREE.PlaneGeometry(l, 0.9)), mat('#ffffff', { transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
    filet.position.set((x1 + x2) / 2, 2.0, (z1 + z2) / 2)
    filet.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
    scene.add(filet)
  }
  }

  // --- Arbres
  const routesPlan = ROUTES.map((r) => r.points.map(([x, y]) => versImage(...versScene(x, y))))
  const exclus = BATIMENTS.map((b) => ({ b, marge: 3 }))
  const lieuxPx = Object.values(LIEUX).flat().flatMap((l: Lieu) => (l.jusqua ? [l.point, l.jusqua] : [l.point]))
  const aleat = aleatoire(20261010)
  const coniferes: THREE.Matrix4[] = []
  const feuillus: { m: THREE.Matrix4; c: string }[] = []
  const nus: { m: THREE.Matrix4; c: string }[] = []
  const troncs: THREE.Matrix4[] = []
  const couleursConiferes: string[] = []
  const pas = 31
  for (const poly of BOISES) {
    const xs = poly.map((p) => p[0])
    const ys = poly.map((p) => p[1])
    for (let px = Math.min(...xs); px <= Math.max(...xs); px += pas) {
      for (let py = Math.min(...ys); py <= Math.max(...ys); py += pas) {
        const p: Point = [px + (aleat() - 0.5) * pas * 0.85, py + (aleat() - 0.5) * pas * 0.85]
        const r = aleat()
        if (!dansPolygone(p, poly) || !dansPolygone(p, terre)) continue
        if (p[0] < SOCLE.x1 + 6 || p[0] > SOCLE.x2 - 6 || p[1] < SOCLE.y1 + 6) continue
        if (routesPlan.some((r) => metres(distancePolyligne(p, r)) < 7.5)) continue
        if (exclus.some(({ b, marge }) => dansBatiment(p, b, marge))) continue
        if (lieuxPx.some((l) => Math.hypot(p[0] - l[0], p[1] - l[1]) < 45)) continue
        const [x, z] = versMonde(p)
        const tourne = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), aleat() * Math.PI * 2)
        if (r < 0.55) {
          const h = 7.5 + aleat() * 5
          const rayon = 2 + aleat() * 1.1
          coniferes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 1.2, z), tourne, new THREE.Vector3(rayon, h, rayon)))
          couleursConiferes.push(ambiance.coniferes[Math.floor(aleat() * ambiance.coniferes.length)])
          troncs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), tourne, new THREE.Vector3(1, 1.6, 1)))
        } else {
          const h = 2.4 + aleat() * 1.6
          const rayon = (2.3 + aleat() * 1.3) * ambiance.tailleFeuillus
          const c = ambiance.feuillus[Math.floor(aleat() * ambiance.feuillus.length)]
          if (ambiance.nus) {
            // Hiver : un tronc et ses branches, sans feuilles
            const haut = h + (2.3 + aleat() * 1.3) * 1.5
            nus.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), tourne, new THREE.Vector3(1.4, haut, 1.4)), c })
          } else {
            feuillus.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h + rayon * 0.7, z), tourne, new THREE.Vector3(rayon, rayon * 1.1, rayon)), c })
            troncs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), tourne, new THREE.Vector3(1, h + rayon * 0.4, 1)))
          }
        }
      }
    }
  }
  {
    const couleur = new THREE.Color()
    const gCone = geo(new THREE.ConeGeometry(1, 1, 7))
    gCone.translate(0, 0.5, 0)
    const matArbre = mat('#ffffff', { flatShading: true }, 'arbre')
    const cones = new THREE.InstancedMesh(gCone, matArbre, coniferes.length)
    coniferes.forEach((m, i) => {
      cones.setMatrixAt(i, m)
      cones.setColorAt(i, couleur.set(couleursConiferes[i]))
    })
    const gBoule = geo(new THREE.IcosahedronGeometry(1, 1))
    const boules = new THREE.InstancedMesh(gBoule, matArbre, feuillus.length)
    feuillus.forEach(({ m, c }, i) => {
      boules.setMatrixAt(i, m)
      boules.setColorAt(i, couleur.set(c))
    })
    const gTronc = geo(new THREE.CylinderGeometry(0.28, 0.4, 1, 6))
    gTronc.translate(0, 0.5, 0)
    const lesTroncs = new THREE.InstancedMesh(gTronc, mat('#6b4f36', {}, 'tronc'), troncs.length)
    troncs.forEach((m, i) => lesTroncs.setMatrixAt(i, m))
    scene.add(ombres(cones), ombres(boules), ombres(lesTroncs, true, false))
    if (nus.length) {
      const arbresNus = new THREE.InstancedMesh(arbreNu(), matArbre, nus.length)
      nus.forEach(({ m, c }, i) => {
        arbresNus.setMatrixAt(i, m)
        arbresNus.setColorAt(i, couleur.set(c))
      })
      scene.add(ombres(arbresNus))
    }
  }

  /** Arbre sans feuilles, haut de 1 : tronc et quelques branches. */
  function arbreNu() {
    const morceaux: THREE.BufferGeometry[] = []
    const tronc = new THREE.CylinderGeometry(0.12, 0.22, 1, 5)
    tronc.translate(0, 0.5, 0)
    morceaux.push(tronc)
    for (let i = 0; i < 5; i++) {
      const branche = new THREE.CylinderGeometry(0.03, 0.07, 0.42, 4)
      branche.translate(0, 0.21, 0)
      branche.rotateZ(0.55 + (i % 2) * 0.25)
      branche.rotateY((i / 5) * Math.PI * 2 + i)
      branche.translate(0, 0.45 + i * 0.1, 0)
      morceaux.push(branche)
    }
    const g = geo(mergeGeometries(morceaux)!)
    morceaux.forEach((m) => m.dispose())
    return g
  }

  function dansBatiment(p: Point, b: Batiment, margeM: number) {
    const a = THREE.MathUtils.degToRad(b.angle)
    const dx = p[0] - b.centre[0]
    const dy = p[1] - b.centre[1]
    const u = dx * Math.cos(a) + dy * Math.sin(a)
    const v = -dx * Math.sin(a) + dy * Math.cos(a)
    const marge = margeM * (340 / 70)
    return Math.abs(u) < b.largeur / 2 + marge && Math.abs(v) < b.profondeur / 2 + marge
  }

  // --- Fumée de la cuisine (quand la cuisine travaille)
  const fumees: THREE.Mesh[] = []
  if (cheminee && !mouvementReduit) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(0.9, 0)), new THREE.MeshStandardMaterial({ color: '#e9ecef', transparent: true, opacity: 0, flatShading: true }))
      materiaux.set(`fumee${i}`, m.material as THREE.Material)
      m.visible = false
      scene.add(m)
      fumees.push(m)
    }
  }

  // --- Bonhommes
  const gBase = geo(new THREE.CylinderGeometry(1.5, 1.65, 0.35, 20))
  gBase.translate(0, 0.18, 0)
  const gJambes = geo(new THREE.CylinderGeometry(0.55, 0.5, 1.4, 10))
  gJambes.translate(0, 0.35 + 0.7, 0)
  const gCorps = geo(new THREE.CylinderGeometry(0.62, 0.75, 1.75, 12))
  gCorps.translate(0, 1.75 + 0.87, 0)
  const gBras = geo(new THREE.CapsuleGeometry(0.2, 1.2, 3, 8))
  const gTete = geo(new THREE.SphereGeometry(0.66, 16, 12))
  gTete.translate(0, 4.2, 0)
  const gOeil = geo(new THREE.SphereGeometry(0.09, 6, 4))
  const gCalotte = geo(new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2))
  const gVisiere = geo(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16, 1, false, -Math.PI / 2, Math.PI))
  const gBord = geo(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 18))
  const gToque = geo(new THREE.CylinderGeometry(0.52, 0.46, 0.75, 14))
  const gToqueHaut = geo(new THREE.SphereGeometry(0.68, 14, 10))
  const gPlanchette = geo(new THREE.BoxGeometry(0.75, 0.95, 0.08))
  const gCible = geo(new THREE.CylinderGeometry(2, 2, 6, 8))
  gCible.translate(0, 3, 0)
  const matCible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
  materiaux.set('cible', matCible)

  function bonhomme(p: PersonneMaquette) {
    const g = new THREE.Group()
    const chandail = mat(COULEUR_SECTEUR[p.secteur], { roughness: 0.7 })
    const peau = mat(TEINTES_PEAU[hachage(p.nom) % TEINTES_PEAU.length], { roughness: 0.8 })
    const base = new THREE.Mesh(gBase, mat(COULEUR_SECTEUR[p.secteur], { roughness: 0.5, emissive: COULEUR_SECTEUR[p.secteur], emissiveIntensity: 0.15 }, 'base'))
    const jambes = new THREE.Mesh(gJambes, mat('#3b3f46'))
    const corps = new THREE.Mesh(gCorps, chandail)
    const tete = new THREE.Mesh(gTete, peau)
    g.add(ombres(base, false, true), ombres(jambes), ombres(corps), ombres(tete))
    for (const cote of [-1, 1]) {
      const bras = new THREE.Mesh(gBras, chandail)
      bras.position.set(cote * 0.92, 2.55, 0)
      bras.rotation.z = cote * 0.18
      g.add(ombres(bras))
      const oeil = new THREE.Mesh(gOeil, mat('#212529'))
      oeil.position.set(cote * 0.24, 4.32, 0.6)
      g.add(oeil)
    }
    if (p.secteur === 'cuisine') {
      const toque = new THREE.Mesh(gToque, mat('#ffffff'))
      toque.position.y = 5.05
      const haut = new THREE.Mesh(gToqueHaut, mat('#ffffff'))
      haut.position.y = 5.55
      haut.scale.set(1, 0.7, 1)
      g.add(ombres(toque), ombres(haut))
    } else if (p.secteur === 'animation') {
      const calotte = new THREE.Mesh(gCalotte, mat('#2b8a3e'))
      calotte.position.y = 4.35
      const visiere = new THREE.Mesh(gVisiere, mat('#2b8a3e'))
      visiere.position.set(0, 4.4, 0.45)
      g.add(ombres(calotte), visiere)
    } else if (p.secteur === 'terrain') {
      const casque = new THREE.Mesh(gCalotte, mat('#fd7e14', { roughness: 0.4 }))
      casque.position.y = 4.4
      const bord = new THREE.Mesh(gBord, mat('#fd7e14', { roughness: 0.4 }))
      bord.position.y = 4.42
      g.add(ombres(casque), bord)
    } else {
      const planchette = new THREE.Mesh(gPlanchette, mat('#8d6e4c'))
      planchette.position.set(0.35, 2.7, 0.85)
      planchette.rotation.x = -0.35
      const feuille = new THREE.Mesh(gPlanchette, mat('#ffffff'))
      feuille.scale.set(0.8, 0.8, 0.5)
      feuille.position.set(0.35, 2.72, 0.9)
      feuille.rotation.x = -0.35
      g.add(planchette, feuille)
    }
    const cible = new THREE.Mesh(gCible, matCible)
    cible.userData.cle = p.cle
    g.add(cible)
    g.scale.setScalar(TAILLE_BONHOMME)
    return { g, cible }
  }

  interface Figure {
    p: PersonneMaquette
    g: THREE.Group
    cible: THREE.Mesh
    centre: THREE.Vector3
    depart: THREE.Vector3
    angle: number
    rayon: number
    mouvement: Lieu['mouvement'] | 'immobile'
    phase: number
    regard: number
  }
  let figures: Figure[] = []
  let survol: string | null = null
  let choisi: string | null = null

  function viderFigures() {
    for (const f of figures) scene.remove(f.g)
    figures = []
  }

  function placerPersonnes(liste: PersonneMaquette[]) {
    viderFigures()
    for (const secteur of Object.keys(LIEUX) as Secteur[]) {
      const lieux = LIEUX[secteur]
      const gens = liste.filter((p) => p.secteur === secteur).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      const parLieu = lieux.map(() => [] as PersonneMaquette[])
      gens.forEach((p, i) => parLieu[i % lieux.length].push(p))
      parLieu.forEach((groupe, li) => {
        const lieu = lieux[li]
        const [cx, cz] = versMonde(lieu.point)
        const centre = new THREE.Vector3(cx, 0, cz)
        const fin = lieu.jusqua ? versMonde(lieu.jusqua) : null
        const y = lieu.jusqua ? 0.05 : 0
        const n = groupe.length
        const rayon = n <= 1 ? 0 : Math.max(2.6, (n * 3.2) / (2 * Math.PI))
        groupe.forEach((p, i) => {
          let depart: THREE.Vector3
          let angle = (i / Math.max(n, 1)) * Math.PI * 2 + li
          if (fin) {
            const t = n <= 1 ? 0.5 : i / (n - 1)
            const longueur = Math.hypot(fin[0] - cx, fin[1] - cz)
            const u = 0.5 + ((t - 0.5) * Math.min(longueur, (n - 1) * 3.2)) / longueur
            depart = new THREE.Vector3(cx + (fin[0] - cx) * u, y, cz + (fin[1] - cz) * u)
            angle = 0
          } else {
            depart = new THREE.Vector3(cx + Math.cos(angle) * rayon, y, cz + Math.sin(angle) * rayon)
          }
          const { g, cible } = bonhomme(p)
          g.position.copy(depart)
          // Immobiles : tournés vers le centre du groupe (ou vers la rue s'ils sont seuls)
          const regard = n <= 1 || fin ? Math.PI : Math.atan2(cx - depart.x, cz - depart.z)
          g.rotation.y = regard
          scene.add(g)

          figures.push({
            p, g, cible, centre, depart, angle, rayon,
            mouvement: lieu.jusqua ? 'immobile' : (lieu.mouvement ?? 'immobile'),
            phase: (hachage(p.cle) % 1000) / 159,
            regard,
          })
        })
      })
    }
    const cuisine = liste.some((p) => p.secteur === 'cuisine')
    fumees.forEach((m) => (m.visible = cuisine))
    rendre()
  }

  // --- Caméra et commandes
  const controles = new OrbitControls(camera, renderer.domElement)
  controles.enableDamping = !mouvementReduit
  controles.dampingFactor = 0.08
  controles.minDistance = 40
  controles.maxDistance = 560
  controles.minPolarAngle = 0.12
  controles.maxPolarAngle = 1.35
  controles.screenSpacePanning = false
  controles.zoomSpeed = 0.8
  controles.zoomToCursor = true
  // Un doigt qui glisse verticalement fait défiler la page ; de côté, il tourne la maquette.
  renderer.domElement.style.touchAction = 'pan-y'

  // --- Les trois vues, toujours de la rue vers le lac
  const enPoints = (pts: Point[]) => pts.map(([x, z]) => new THREE.Vector3(x, 0, z))
  const aqua = AQUA_BOUEE.map((p) => versMonde(p))
  const ptsCamp = enPoints([...[...LOTS.camp, ...LOTS.chalet].flat().map(([x, y]) => versScene(x, y)), ...aqua])
  // Le cœur du camp : les bâtiments du camp et les lieux où travaillent les employés
  const ptsCoeur = enPoints([
    ...BATIMENTS.filter((b) => b.id.startsWith('vf') || b.id.startsWith('pav')).flatMap((b) => {
      const a = THREE.MathUtils.degToRad(b.angle)
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]): Point => {
        const u = (i * b.largeur) / 2
        const w = (j * b.profondeur) / 2
        return versMonde([b.centre[0] + u * Math.cos(a) - w * Math.sin(a), b.centre[1] + u * Math.sin(a) + w * Math.cos(a)])
      })
    }),
    ...Object.values(LIEUX).flat().flatMap((l: Lieu) => (l.jusqua ? [l.point, l.jusqua] : [l.point])).map((p) => versMonde(p)),
  ])
  const ptsTerrain = enPoints([...Object.values(LOTS).flat(2).map(([x, y]) => versScene(x, y)), ...aqua])
  const VUES: Record<Vue, { polaire: number; azimut: number; points: THREE.Vector3[]; demiLargeur: number; demiHauteur: number; centreY: number }> = {
    // Le camp de près : bâtiments, employés, champ, plage
    camp: { polaire: 50, azimut: 186, points: ptsCoeur, demiLargeur: 0.86, demiHauteur: 0.7, centreY: -0.08 },
    // Les trois lots vus de haut, la forêt de l'autre côté de la rue comprise
    terrain: { polaire: 28, azimut: 186, points: ptsTerrain, demiLargeur: 0.9, demiHauteur: 0.86, centreY: -0.04 },
    // Vers le lac : le camp sous le milieu, le lac, l'autre rive, les collines et le ciel
    lac: { polaire: 72, azimut: 186, points: ptsCamp, demiLargeur: 0.7, demiHauteur: 0.27, centreY: -0.35 },
  }
  let manipuleJusqua = 0
  const centreCamp = ptsCamp.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(ptsCamp.length)
  let vueCourante: Vue = vueChoisie

  /** Calcule la caméra d'une vue (on vise au besoin plus haut que le camp pour qu'il tombe à `centreY`). */
  function cadrage(nom: Vue) {
    const { points, demiLargeur, demiHauteur, centreY } = VUES[nom]
    const polaire = THREE.MathUtils.degToRad(VUES[nom].polaire)
    const azimut = THREE.MathUtils.degToRad(VUES[nom].azimut)
    const direction = new THREE.Vector3(Math.sin(polaire) * Math.sin(azimut), Math.cos(polaire), Math.sin(polaire) * Math.cos(azimut))
    const avant = new THREE.Vector3(-direction.x, 0, -direction.z).normalize()
    const droite = new THREE.Vector3(-avant.z, 0, avant.x)
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const pente = Math.PI / 2 - polaire - Math.atan(-centreY * tan)
    const ancre = points.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(points.length)
    const regard = new THREE.Vector3()
    const placer = (d: number) => {
      camera.position.copy(ancre).addScaledVector(direction, d)
      regard.copy(camera.position).addScaledVector(avant, camera.position.y / Math.tan(pente)).setY(0)
      camera.lookAt(regard)
      camera.updateMatrixWorld()
    }
    let distance = 800
    for (let passe = 0; passe < 10; passe++) {
      placer(distance)
      const p = points.map((c) => v.copy(c).project(camera).clone())
      const xs = p.map((q) => q.x)
      const ys = p.map((q) => q.y)
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      // Recentre doucement, puis ajuste la distance pour remplir la part du cadre
      const largeurVue = distance * tan
      ancre.addScaledVector(droite, 0.8 * ((x1 + x2) / 2) * largeurVue * camera.aspect)
      ancre.addScaledVector(avant, (0.8 * ((y1 + y2) / 2 - centreY) * largeurVue) / Math.cos(polaire))
      const ratio = Math.max((x2 - x1) / 2 / demiLargeur, (y2 - y1) / 2 / demiHauteur)
      distance = THREE.MathUtils.clamp(distance * Math.sqrt(ratio), 80, 4000)
    }
    placer(distance)
    return { position: camera.position.clone(), cible: regard.clone(), distance }
  }

  /** Va à une vue : d'un coup, ou en glissant (sauf si l'appareil demande moins d'animations). */
  let transition: { de: { position: THREE.Vector3; cible: THREE.Vector3 }; vers: { position: THREE.Vector3; cible: THREE.Vector3 }; debut: number } | null = null
  const DUREE_TRANSITION = 900
  function allerA(nom: Vue, glisser: boolean) {
    vueCourante = nom
    const de = { position: camera.position.clone(), cible: controles.target.clone() }
    const vers = cadrage(nom)
    controles.maxDistance = Math.max(3500, vers.distance * 2.5)
    if (!glisser || mouvementReduit) {
      transition = null
      camera.position.copy(vers.position)
      controles.target.copy(vers.cible)
    } else {
      camera.position.copy(de.position)
      camera.lookAt(de.cible)
      transition = { de, vers, debut: performance.now() }
      manipuleJusqua = performance.now() + DUREE_TRANSITION + 300
    }
    controles.update()
    aBouge = false
  }
  function avancerTransition(maintenant: number) {
    if (!transition) return
    const t = Math.min(1, (maintenant - transition.debut) / DUREE_TRANSITION)
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    camera.position.lerpVectors(transition.de.position, transition.vers.position, e)
    controles.target.lerpVectors(transition.de.cible, transition.vers.cible, e)
    if (t >= 1) transition = null
  }
  let aBouge = false
  controles.addEventListener('start', () => {
    aBouge = true
    transition = null
  })

  controles.addEventListener('change', () => {
    const t = controles.target
    t.x = THREE.MathUtils.clamp(t.x, X1 - 1500, X2 + 1500)
    t.z = THREE.MathUtils.clamp(t.z, Z1 - 1500, Z2 + 1500)
    t.y = 0
    if (mouvementReduit) rendre()
  })

  // Molette : la page défile ; ⌘/Ctrl (ou pincer sur le pavé tactile) zoome.
  const molette = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return
    e.stopPropagation()
    surMoletteSeule?.()
  }
  conteneur.addEventListener('wheel', molette, { capture: true })

  // Survol et clic sur un bonhomme
  const lanceur = new THREE.Raycaster()
  const souris = new THREE.Vector2()
  let appui: { x: number; y: number } | null = null
  const viser = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect()
    souris.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    lanceur.setFromCamera(souris, camera)
    const touche = lanceur.intersectObjects(figures.map((f) => f.cible), false)[0]
    return (touche?.object.userData.cle as string | undefined) ?? null
  }
  const bouger = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return
    const cle = viser(e)
    if (cle !== survol) {
      survol = cle
      renderer.domElement.style.cursor = cle ? 'pointer' : ''
      surSurvol?.(cle)
      rendre()
    }
  }
  const presser = (e: PointerEvent) => (appui = { x: e.clientX, y: e.clientY })
  const relacher = (e: PointerEvent) => {
    if (!appui || Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 6) return
    const cle = viser(e)
    choisi = cle && cle !== choisi ? cle : null
    rendre()
  }
  const sortir = () => {
    if (survol) {
      survol = null
      surSurvol?.(null)
      rendre()
    }
  }
  renderer.domElement.addEventListener('pointermove', bouger)
  renderer.domElement.addEventListener('pointerdown', presser)
  renderer.domElement.addEventListener('pointerup', relacher)
  renderer.domElement.addEventListener('pointerleave', sortir)

  // --- Rendu
  const v = new THREE.Vector3()
  const debutHorloge = performance.now()
  let largeurEcran = 1
  let hauteurEcran = 1

  function animer(t: number) {
    if (ambiance.eau.vagues) vagues(t)
    animerFigures(t)
  }

  function vagues(t: number) {
    const p = gEau.getAttribute('position') as THREE.BufferAttribute
    const tab = p.array as Float32Array
    for (let i = 0; i < p.count; i++) {
      const x = eauBase[i * 3]
      const z = eauBase[i * 3 + 2]
      tab[i * 3 + 1] = NIVEAU_EAU + Math.sin(x * 0.12 + t * 0.9) * 0.025 + Math.cos(z * 0.17 + t * 1.2) * 0.02
    }
    p.needsUpdate = true
    gEau.computeVertexNormals()
  }

  function animerFigures(t: number) {
    for (const f of figures) {
      const actif = f.p.cle === survol || f.p.cle === choisi
      if (f.mouvement === 'ronde' && f.rayon > 0) {
        const a = f.angle + t * 0.11
        f.g.position.set(f.centre.x + Math.cos(a) * f.rayon, 0, f.centre.z + Math.sin(a) * f.rayon)
        f.g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a))
        f.g.position.y = Math.abs(Math.sin(t * 5 + f.phase)) * 0.22
      } else if (f.mouvement === 'va-et-vient') {
        const s = Math.sin(t * 0.32 + f.phase)
        const d = new THREE.Vector3(Math.cos(f.phase * 2), 0, Math.sin(f.phase * 2))
        f.g.position.copy(f.depart).addScaledVector(d, s * 3.5)
        const sens = Math.cos(t * 0.32 + f.phase) >= 0 ? 1 : -1
        f.g.rotation.y = Math.atan2(d.x * sens, d.z * sens)
        f.g.position.y = f.depart.y + Math.abs(Math.sin(t * 5 + f.phase)) * 0.2
      } else {
        f.g.position.y = f.depart.y + Math.sin(t * 1.8 + f.phase) * 0.06
        f.g.rotation.y = f.regard + Math.sin(t * 0.25 + f.phase) * 0.35
      }
      if (actif) f.g.position.y += Math.abs(Math.sin(t * 7)) * 0.9
    }

    if (cheminee) {
      fumees.forEach((m, i) => {
        if (!m.visible) return
        const k = (t * 0.25 + i / fumees.length) % 1
        m.position.set(cheminee!.x + Math.sin(k * 5 + i) * 0.6 + k * 2.5, cheminee!.y + k * 9, cheminee!.z - k * 1.2)
        m.scale.setScalar(0.6 + k * 2.2)
        ;(m.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - k)
      })
    }
  }

  function rendre() {
    // De loin, les bonhommes grossissent un peu pour rester visibles
    const loin = Math.max(1, camera.position.distanceTo(centreCamp) / 350)
    for (const f of figures) {
      const actif = f.p.cle === survol || f.p.cle === choisi
      f.g.scale.setScalar(TAILLE_BONHOMME * loin * (actif ? 1.25 : 1))
    }
    renderer.render(scene, camera)
  }

  let boucle = 0
  let visible = true
  // Environ 30 images par seconde au repos, toutes pendant qu'on manipule la maquette
  let dernier = 0
  controles.addEventListener('change', () => (manipuleJusqua = performance.now() + 1200))
  const tourner = (maintenant: number) => {
    boucle = requestAnimationFrame(tourner)
    if (maintenant >= manipuleJusqua && maintenant - dernier < 32) return
    dernier = maintenant
    avancerTransition(maintenant)
    controles.update()
    animer((maintenant - debutHorloge) / 1000)
    rendre()
  }
  const demarrer = () => {
    if (mouvementReduit || boucle || !visible || document.hidden) return
    tourner(performance.now())
  }
  const arreter = () => {
    cancelAnimationFrame(boucle)
    boucle = 0
  }
  const vu = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) demarrer()
    else arreter()
  })
  vu.observe(conteneur)
  const onglet = () => (document.hidden ? arreter() : demarrer())
  document.addEventListener('visibilitychange', onglet)

  const redimensionner = () => {
    largeurEcran = Math.max(1, conteneur.clientWidth)
    hauteurEcran = Math.max(1, conteneur.clientHeight)
    renderer.setSize(largeurEcran, hauteurEcran, false)
    camera.aspect = largeurEcran / hauteurEcran
    camera.updateProjectionMatrix()
    if (!aBouge && !transition) allerA(vueCourante, false)
    rendre()
  }
  const taille = new ResizeObserver(redimensionner)
  taille.observe(conteneur)

  redimensionner()
  if (cameraDepart) {
    // Même point de vue qu'avant le changement de saison
    camera.position.fromArray(cameraDepart.position)
    controles.target.fromArray(cameraDepart.cible)
    controles.update()
    aBouge = true
  }
  if (mouvementReduit) animer(0)
  rendre()
  demarrer()

  return {
    personnes: placerPersonnes,
    surligner(cle) {
      survol = cle
      rendre()
    },
    zoomer(facteur) {
      aBouge = true
      // Vers le point du sol un peu sous le milieu de l'image (le camp, à la vue de départ)
      lanceur.setFromCamera(new THREE.Vector2(0, -0.35), camera)
      const pivot = lanceur.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()) ?? controles.target.clone()
      const f = THREE.MathUtils.clamp(facteur, controles.minDistance / camera.position.distanceTo(pivot), controles.maxDistance / camera.position.distanceTo(pivot))
      camera.position.sub(pivot).multiplyScalar(f).add(pivot)
      controles.target.sub(pivot).multiplyScalar(f).add(pivot)
      controles.update()
      rendre()
    },
    recentrer() {
      allerA(vueCourante, true)
      rendre()
    },
    vue(nom) {
      allerA(nom, true)
      rendre()
    },
    etatCamera: () => (aBouge ? { position: camera.position.toArray(), cible: controles.target.toArray() } : null),
    detruire() {
      paysage.detruire()
      arreter()
      vu.disconnect()
      taille.disconnect()
      document.removeEventListener('visibilitychange', onglet)
      conteneur.removeEventListener('wheel', molette, { capture: true })
      controles.dispose()
      viderFigures()
      geometries.forEach((g) => g.dispose())
      materiaux.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}

// ---------------------------------------------------------------------------
// Sol peint sur un canevas : gazon, gravier, champ, sable, rue, puis ce que la
// saison y laisse (feuilles mortes, neige, bouette, flaques)

function peindreSol(ambiance: Ambiance) {
  const L = 2048
  const echelle = L / (SOCLE.x2 - SOCLE.x1)
  const H = Math.round((SOCLE.y2 - SOCLE.y1) * echelle)
  const canevas = document.createElement('canvas')
  canevas.width = L
  canevas.height = H
  const c = canevas.getContext('2d')!
  const vers = ([x, y]: Point): Point => [(x - SOCLE.x1) * echelle, (y - SOCLE.y1) * echelle]
  const chemin = (points: readonly Point[]) => {
    c.beginPath()
    points.forEach((p, i) => (i ? c.lineTo(...vers(p)) : c.moveTo(...vers(p))))
    c.closePath()
  }

  const neige = !!ambiance.toitsNeige
  c.fillStyle = ambiance.sol
  c.fillRect(0, 0, L, H)

  for (const s of SURFACES) {
    chemin(s.points)
    if (s.sol === 'champ') {
      c.fillStyle = ambiance.champ
      c.fill()
      // Bandes de tonte, l'été et l'automne
      if (!neige && ambiance.tailleFeuillus === 1) {
        c.save()
        c.clip()
        c.fillStyle = 'rgba(255,255,255,0.07)'
        for (let x = 0; x < L; x += 36) c.fillRect(x, 0, 18, H)
        c.restore()
      }
    } else {
      c.fillStyle = s.sol === 'gazon' ? ambiance.gazon : ambiance.sols[s.sol]
      c.fill()
    }
  }

  // Grain (taches claires et foncées)
  const aleat = aleatoire(7)
  for (let i = 0; i < 14000; i++) {
    c.fillStyle = aleat() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'
    const r = 1 + aleat() * 3
    c.fillRect(aleat() * L, aleat() * H, r, r)
  }

  // Ce que la saison laisse au sol
  for (const t of ambiance.taches) {
    c.save()
    if (t.sols) {
      c.beginPath()
      for (const s of SURFACES.filter((s) => t.sols!.includes(s.sol))) {
        s.points.forEach((p, i) => (i ? c.lineTo(...vers(p)) : c.moveTo(...vers(p))))
        c.closePath()
      }
      c.clip()
    }
    for (let i = 0; i < t.nombre; i++) {
      const x = aleat() * L
      const y = aleat() * H
      const r = t.rayon[0] + aleat() * (t.rayon[1] - t.rayon[0])
      c.globalAlpha = 0.55 + aleat() * 0.4
      c.fillStyle = t.couleurs[Math.floor(aleat() * t.couleurs.length)]
      c.beginPath()
      c.ellipse(x, y, r, r * (0.55 + aleat() * 0.45), aleat() * Math.PI, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
  }
  c.globalAlpha = 1

  c.setLineDash([])
  return canevas
}
