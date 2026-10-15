/**
 * Le paysage autour du camp (demande de Maxime du 2026-10-11 : que le camp ne flotte
 * plus dans le vide) : sol jusqu'à l'horizon, lac Maskinongé au complet, forêts,
 * routes, rivière, maisons des alentours, collines des Laurentides (dont le mont
 * Tremblant), ciel et brume. Données : `monde.ts` (mètres, nord en haut).
 */
import * as THREE from 'three'
import { BOIS, BORNES, ETANGS, LAC, MAISONS, RIVIERES, ROUTES, VERS_PLAN } from './monde'
import { versMonde, type Point } from './plan'

export interface CouleursPaysage {
  /** Sous-bois (et neige l'hiver). */
  sol: string
  /** Champs et terrains ouverts. */
  champ: string
  eau: string
  glace: boolean
  coniferes: string[]
  feuillus: string[]
  nus: boolean
  tailleFeuillus: number
  toitsNeige: boolean
  collines: string
  ciel: [string, string]
}

/**
 * Niveaux (m) : tout le sol est à plat à 0 ; l'eau est posée juste au-dessus (le lac
 * n'a pas besoin de trou dans le sol), le terrain détaillé du camp un peu plus haut
 * (voir scene.ts : eau du camp 0,09, sol du camp 0,15). Les écarts sont minces : les
 * surfaces du dessus sont avancées dans le tampon de profondeur (polygonOffset).
 */
export const NIVEAU_SOL = 0
export const NIVEAU_LAC = 0.03
const devant = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }

/** Des mètres d'ici (nord en haut) aux coordonnées de la scène. */
export function versScene(x: number, y: number): Point {
  const { echelle, angle, tx, ty } = VERS_PLAN
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return versMonde([echelle * (c * x + s * y) + tx, echelle * (s * x - c * y) + ty])
}

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

function dansPolygone([x, y]: Point, poly: readonly Point[]) {
  let dedans = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

const LARGEUR_ROUTE: Record<string, number> = { secondary: 9, tertiary: 7, unclassified: 5.5, residential: 5.5, service: 3.5 }

interface Options {
  scene: THREE.Scene
  couleurs: CouleursPaysage
  petitEcran: boolean
  /** Vrai si le point (scène) est dans le terrain détaillé du camp (on n'y sème rien). */
  dansCamp: (x: number, z: number) => boolean
  /** Centre du camp (scène), pour la densité des arbres. */
  centre: Point
}

export function ajouterPaysage({ scene, couleurs, petitEcran, dansCamp, centre }: Options) {
  const jetables: { dispose(): void }[] = []
  const garder = <T extends { dispose(): void }>(o: T) => (jetables.push(o), o)

  // --- Ciel et brume (le lointain se fond dans l'horizon)
  {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const g = c.getContext('2d')!
    const d = g.createLinearGradient(0, 0, 0, 256)
    d.addColorStop(0, couleurs.ciel[0])
    d.addColorStop(0.62, couleurs.ciel[1])
    d.addColorStop(1, couleurs.ciel[1])
    g.fillStyle = d
    g.fillRect(0, 0, 4, 256)
    const ciel = garder(new THREE.CanvasTexture(c))
    ciel.colorSpace = THREE.SRGBColorSpace
    scene.background = ciel
    scene.fog = new THREE.Fog(couleurs.ciel[1], 1100, 11000)
  }

  // --- Sol du monde : texture peinte (nord en haut) sur le rectangle des données
  const L = 2048
  const largeurM = BORNES.x2 - BORNES.x1
  const hauteurM = BORNES.y2 - BORNES.y1
  const H = Math.round((L * hauteurM) / largeurM)
  const k = L / largeurM
  const vers = ([x, y]: Point): Point => [(x - BORNES.x1) * k, (BORNES.y2 - y) * k]
  const canevas = document.createElement('canvas')
  canevas.width = L
  canevas.height = H
  const c = canevas.getContext('2d')!
  // Masque des arbres (blanc = forêt), à plus basse résolution
  const LM = 1024
  const km = LM / largeurM
  const HM = Math.round(LM * (hauteurM / largeurM))
  const masque = document.createElement('canvas')
  masque.width = LM
  masque.height = HM
  const cm = masque.getContext('2d')!
  const versM = ([x, y]: Point): Point => [(x - BORNES.x1) * km, (BORNES.y2 - y) * km]

  const trace = (ctx: CanvasRenderingContext2D, f: (p: Point) => Point, anneaux: Point[][]) => {
    ctx.beginPath()
    for (const a of anneaux) {
      a.forEach((p, i) => (i ? ctx.lineTo(...f(p)) : ctx.moveTo(...f(p))))
      ctx.closePath()
    }
  }
  const ligne = (ctx: CanvasRenderingContext2D, f: (p: Point) => Point, pts: Point[], largeur: number, couleur: string) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(...f(p)) : ctx.moveTo(...f(p))))
    ctx.strokeStyle = couleur
    ctx.lineWidth = largeur
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  c.fillStyle = couleurs.champ
  c.fillRect(0, 0, L, H)
  cm.fillStyle = '#000'
  cm.fillRect(0, 0, LM, HM)
  for (const b of BOIS) {
    trace(c, vers, [b.ext, ...b.trous])
    c.fillStyle = couleurs.sol
    c.fill('evenodd')
    trace(cm, versM, [b.ext, ...b.trous])
    cm.fillStyle = '#fff'
    cm.fill('evenodd')
  }
  // Grain
  {
    const aleat = aleatoire(11)
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = aleat() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'
      const r = 1 + aleat() * 3
      c.fillRect(aleat() * L, aleat() * H, r, r)
    }
  }
  const eau = couleurs.glace ? '#a9c8da' : couleurs.eau
  for (const r of RIVIERES) {
    ligne(c, vers, r, 26 * k, eau)
    ligne(cm, versM, r, 34 * km, '#000')
  }
  for (const e of ETANGS) {
    trace(c, vers, [e])
    c.fillStyle = eau
    c.fill()
    trace(cm, versM, [e])
    cm.fillStyle = '#000'
    cm.fill()
  }
  trace(c, vers, [LAC])
  c.fillStyle = eau
  c.fill()
  trace(cm, versM, [LAC])
  cm.fillStyle = '#000'
  cm.fill()
  for (const r of ROUTES) ligne(cm, versM, r.points, ((LARGEUR_ROUTE[r.genre] ?? 4) + 6) * km, '#000')

  const texture = garder(new THREE.CanvasTexture(canevas))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  // Le plan texturé, posé sommet par sommet (mètres → scène)
  const gSol = garder(new THREE.PlaneGeometry(1, 1, 8, 8))
  {
    const p = gSol.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const [x, z] = versScene(BORNES.x1 + (p.getX(i) + 0.5) * largeurM, BORNES.y1 + (p.getY(i) + 0.5) * hauteurM)
      p.setXYZ(i, x, NIVEAU_SOL, z)
    }
    gSol.computeVertexNormals()
  }
  const matSol = garder(new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }))
  const sol = new THREE.Mesh(gSol, matSol)
  sol.receiveShadow = true
  scene.add(sol)

  // Au-delà des données : un grand sol uni, un peu plus bas
  const gLoin = garder(new THREE.CircleGeometry(30000, 48))
  gLoin.rotateX(-Math.PI / 2)
  gLoin.translate(centre[0], NIVEAU_SOL - 0.3, centre[1])
  const loin = new THREE.Mesh(gLoin, garder(new THREE.MeshStandardMaterial({ color: couleurs.sol, roughness: 1 })))
  scene.add(loin)

  // --- Le lac au complet (près du camp, l'eau animée du camp passe par-dessus)
  {
    const forme = new THREE.Shape(LAC.map(([x, y]) => new THREE.Vector2(...versScene(x, y))))
    const g = garder(new THREE.ShapeGeometry(forme, 4))
    g.rotateX(Math.PI / 2)
    g.translate(0, NIVEAU_LAC, 0)
    g.computeVertexNormals()
    const m = garder(
      new THREE.MeshStandardMaterial({ color: eau, roughness: couleurs.glace ? 0.35 : 0.15, metalness: 0.05, side: THREE.DoubleSide, ...devant }),
    )
    const lac = new THREE.Mesh(g, m)
    lac.receiveShadow = true
    scene.add(lac)

    // L'hiver : des plaques de neige sur toute la glace
    if (couleurs.glace) {
      const aleatN = aleatoire(31)
      const xs = LAC.map((p) => p[0])
      const ys = LAC.map((p) => p[1])
      const plaque = garder(new THREE.CircleGeometry(1, 7))
      plaque.rotateX(-Math.PI / 2)
      const matrices: THREE.Matrix4[] = []
      const q = new THREE.Quaternion()
      for (let essai = 0; essai < 2000 && matrices.length < 160; essai++) {
        const x = Math.min(...xs) + aleatN() * (Math.max(...xs) - Math.min(...xs))
        const y = Math.min(...ys) + aleatN() * (Math.max(...ys) - Math.min(...ys))
        if (!dansPolygone([x, y], LAC)) continue
        const [sx, sz] = versScene(x, y)
        const r = 10 + aleatN() * 30
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), aleatN() * Math.PI)
        matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(sx, NIVEAU_LAC + 0.02, sz), q, new THREE.Vector3(r, 1, r * (0.2 + aleatN() * 0.3))))
      }
      const plaques = new THREE.InstancedMesh(plaque, garder(new THREE.MeshStandardMaterial({ color: '#f2f6f9', roughness: 0.9, ...devant, polygonOffsetUnits: -8 })), matrices.length)
      matrices.forEach((mm, i) => plaques.setMatrixAt(i, mm))
      plaques.receiveShadow = true
      scene.add(plaques)
    }
  }

  // --- Routes : de vrais rubans (accotements, asphalte, ligne jaune), nets de près
  {
    const enScene = (pts: Point[]) => {
      // Points en scène, aux 5 m au plus (les courbes restent douces)
      const out: Point[] = []
      const p = pts.map(([x, y]) => versScene(x, y))
      p.forEach((b, i) => {
        if (!i) return out.push(b)
        const a = p[i - 1]
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5))
        for (let j = 1; j <= n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n])
      })
      return out
    }
    const routes = ROUTES.map((r) => ({ genre: r.genre, pts: enScene(r.points), largeur: LARGEUR_ROUTE[r.genre] ?? 4 }))
    const ruban = (morceaux: { pts: Point[]; largeur: number }[], y: number) => {
      const sommets: number[] = []
      for (const { pts, largeur } of morceaux) {
        const n = pts.length
        if (n < 2) continue
        const bords = pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)]
          const b = pts[Math.min(n - 1, i + 1)]
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
          const nx = -(b[1] - a[1]) / l
          const nz = (b[0] - a[0]) / l
          return [p[0] + (nx * largeur) / 2, p[1] + (nz * largeur) / 2, p[0] - (nx * largeur) / 2, p[1] - (nz * largeur) / 2]
        })
        for (let i = 0; i < n - 1; i++) {
          const [g1x, g1z, d1x, d1z] = bords[i]
          const [g2x, g2z, d2x, d2z] = bords[i + 1]
          sommets.push(g1x, y, g1z, d1x, y, d1z, g2x, y, g2z, g2x, y, g2z, d1x, y, d1z, d2x, y, d2z)
        }
      }
      const g = garder(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3))
      g.computeVertexNormals()
      return g
    }
    const neige = couleurs.toitsNeige
    const matiere = (couleur: string, rang: number) =>
      garder(new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.95, side: THREE.DoubleSide, ...devant, polygonOffsetUnits: -4 * rang }))
    const accotements = new THREE.Mesh(ruban(routes.map((r) => ({ pts: r.pts, largeur: r.largeur + 2.6 })), NIVEAU_SOL + 0.02), matiere(neige ? '#eef1f4' : '#b9ad92', 1))
    const asphalte = new THREE.Mesh(ruban(routes, NIVEAU_SOL + 0.04), matiere(neige ? '#858a90' : '#55595f', 2))
    // Ligne jaune pointillée au milieu des grandes routes
    const tirets: { pts: Point[]; largeur: number }[] = []
    for (const r of routes.filter((r) => r.genre === 'secondary' || r.genre === 'tertiary')) {
      for (let i = 0; i + 1 < r.pts.length; i += 2) tirets.push({ pts: [r.pts[i], r.pts[i + 1]], largeur: 0.25 })
    }
    const lignes = new THREE.Mesh(ruban(tirets, NIVEAU_SOL + 0.06), matiere('#f2c94c', 3))
    accotements.receiveShadow = asphalte.receiveShadow = lignes.receiveShadow = true
    scene.add(accotements, asphalte, lignes)
  }

  // --- Forêt : de plus en plus espacée (et de grands arbres) en s'éloignant du camp
  const lireMasque = cm.getImageData(0, 0, LM, HM).data
  const foret = (x: number, y: number) => {
    const [u, v] = versM([x, y])
    if (u < 0 || v < 0 || u >= LM || v >= HM) return true
    return lireMasque[(Math.floor(v) * LM + Math.floor(u)) * 4] > 128
  }
  const aleat = aleatoire(424242)
  const facteur = petitEcran ? 1.45 : 1
  // Sur téléphone : moins d'arbres, et pas de couronne lointaine (la brume la cache presque)
  const anneaux = [
    { jusqua: 650, pas: 10 * facteur, taille: 1 },
    { jusqua: 1500, pas: 18 * facteur, taille: 1.45 },
    ...(petitEcran ? [] : [{ jusqua: 2700, pas: 30, taille: 2.1 }]),
  ]
  const coniferes: THREE.Matrix4[] = []
  const couleursConiferes: string[] = []
  const feuillus: THREE.Matrix4[] = []
  const couleursFeuillus: string[] = []
  const v3 = new THREE.Vector3()
  const echelle = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const axeY = new THREE.Vector3(0, 1, 0)
  // Centre du camp en mètres (le point de la scène, ramené au nord en haut)
  const [cxm, cym] = (() => {
    const { echelle: e, angle, tx, ty } = VERS_PLAN
    const u = centre[0] * e + 1100 - tx
    const v = centre[1] * e + 420 - ty
    const co = Math.cos(angle)
    const si = Math.sin(angle)
    return [(co * u + si * v) / e, (si * u - co * v) / e]
  })()
  let rayonInterieur = 0
  for (const a of anneaux) {
    for (let x = cxm - a.jusqua; x <= cxm + a.jusqua; x += a.pas) {
      for (let y = cym - a.jusqua; y <= cym + a.jusqua; y += a.pas) {
        const px = x + (aleat() - 0.5) * a.pas * 0.9
        const py = y + (aleat() - 0.5) * a.pas * 0.9
        const r = aleat()
        const d = Math.hypot(px - cxm, py - cym)
        if (d < rayonInterieur || d >= a.jusqua) continue
        if (!foret(px, py)) continue
        const [sx, sz] = versScene(px, py)
        if (dansCamp(sx, sz)) continue
        q.setFromAxisAngle(axeY, aleat() * Math.PI * 2)
        if (r < 0.55) {
          const h = (7.5 + aleat() * 5) * a.taille
          const rr = (2 + aleat() * 1.1) * a.taille
          coniferes.push(new THREE.Matrix4().compose(v3.set(sx, NIVEAU_SOL + 0.2, sz), q, echelle.set(rr, h, rr)))
          couleursConiferes.push(couleurs.coniferes[Math.floor(aleat() * couleurs.coniferes.length)])
        } else {
          const rr = (2.4 + aleat() * 1.3) * a.taille * (couleurs.nus ? 0.55 : couleurs.tailleFeuillus)
          const h = (3 + aleat() * 1.5) * a.taille
          feuillus.push(new THREE.Matrix4().compose(v3.set(sx, NIVEAU_SOL + h, sz), q, echelle.set(rr, rr * 1.15, rr)))
          couleursFeuillus.push(couleurs.feuillus[Math.floor(aleat() * couleurs.feuillus.length)])
        }
      }
    }
    rayonInterieur = a.jusqua
  }
  {
    const couleur = new THREE.Color()
    const gCone = garder(new THREE.ConeGeometry(1, 1, 6))
    gCone.translate(0, 0.5, 0)
    const matArbre = garder(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }))
    const cones = new THREE.InstancedMesh(gCone, matArbre, coniferes.length)
    coniferes.forEach((m, i) => {
      cones.setMatrixAt(i, m)
      cones.setColorAt(i, couleur.set(couleursConiferes[i]))
    })
    const gBoule = garder(new THREE.IcosahedronGeometry(1, 0))
    const boules = new THREE.InstancedMesh(gBoule, matArbre, feuillus.length)
    feuillus.forEach((m, i) => {
      boules.setMatrixAt(i, m)
      boules.setColorAt(i, couleur.set(couleursFeuillus[i]))
    })
    cones.receiveShadow = boules.receiveShadow = true
    scene.add(cones, boules)
  }

  // --- Maisons des alentours : petits chalets aux couleurs variées
  {
    const aleatM = aleatoire(77)
    const murs = ['#e9e2d3', '#d8cbb5', '#c9b79c', '#b5876a', '#8f6f56', '#dfe3e6', '#a7b3ba', '#c2a27f']
    const toits = ['#4a4e55', '#5b4636', '#7a3b2e', '#3d4a3f', '#6b717c']
    const gMur = garder(new THREE.BoxGeometry(1, 1, 1))
    gMur.translate(0, 0.5, 0)
    const gToit = garder(new THREE.ConeGeometry(0.75, 1, 4))
    gToit.rotateY(Math.PI / 4)
    gToit.translate(0, 0.5, 0)
    const mat = garder(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }))
    const lesMurs = new THREE.InstancedMesh(gMur, mat, MAISONS.length)
    const lesToits = new THREE.InstancedMesh(gToit, mat, MAISONS.length)
    const couleur = new THREE.Color()
    const { angle } = VERS_PLAN
    MAISONS.forEach(([x, y, a], i) => {
      const [sx, sz] = versScene(x, y)
      const l = 9 + aleatM() * 7
      const p = 7 + aleatM() * 4
      const h = 4 + aleatM() * 2.5
      // Le côté court face à la route : `a` est mesuré en mètres (nord en haut), la scène est tournée de `angle`
      q.setFromAxisAngle(axeY, Math.PI - (a + angle))
      lesMurs.setMatrixAt(i, new THREE.Matrix4().compose(v3.set(sx, NIVEAU_SOL, sz), q, echelle.set(l, h, p)))
      lesMurs.setColorAt(i, couleur.set(murs[Math.floor(aleatM() * murs.length)]))
      lesToits.setMatrixAt(i, new THREE.Matrix4().compose(v3.set(sx, NIVEAU_SOL + h, sz), q, echelle.set(l * 1.05, 3 + aleatM() * 1.5, p * 1.1)))
      lesToits.setColorAt(i, couleur.set(couleurs.toitsNeige ? '#eef2f5' : toits[Math.floor(aleatM() * toits.length)]))
    })
    lesMurs.receiveShadow = lesToits.receiveShadow = true
    scene.add(lesMurs, lesToits)
  }

  // --- Collines des Laurentides tout autour, et le mont Tremblant au nord-nord-est
  {
    const aleatC = aleatoire(1971)
    const gColline = garder(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2))
    {
      const p = gColline.getAttribute('position') as THREE.BufferAttribute
      // Bosses tirées de la position (les sommets en double de la couture bougent ensemble)
      const bruit = (x: number, y: number, z: number) => {
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
        return h - Math.floor(h)
      }
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        if (y > 0.02) {
          const r = (n: number) => bruit(Math.round(x * 100) / 100 + n, Math.round(y * 100) / 100, Math.round(z * 100) / 100)
          const bosse = 1 + (r(0) - 0.5) * 0.35
          p.setXYZ(i, x * bosse, y * (0.85 + r(1) * 0.3), z * bosse)
        }
      }
      gColline.computeVertexNormals()
    }
    const mat = garder(new THREE.MeshStandardMaterial({ color: couleurs.collines, roughness: 1, flatShading: true }))
    const collines: { x: number; y: number; r: number; h: number }[] = []
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + aleatC() * 0.15
      const d = 5200 + aleatC() * 7000
      collines.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 1400 + aleatC() * 1800, h: 70 + aleatC() * 150 })
    }
    // Mont Tremblant : 13 km au nord-nord-est, environ 650 m au-dessus du lac
    collines.push({ x: 1650, y: 13150, r: 3600, h: 650 })
    const lesCollines = new THREE.InstancedMesh(gColline, mat, collines.length)
    collines.forEach(({ x, y, r, h }, i) => {
      const [sx, sz] = versScene(x, y)
      q.setFromAxisAngle(axeY, aleatC() * Math.PI * 2)
      lesCollines.setMatrixAt(i, new THREE.Matrix4().compose(v3.set(sx, NIVEAU_SOL - 2, sz), q, echelle.set(r, h, r)))
    })
    scene.add(lesCollines)
  }

  return {
    detruire() {
      jetables.forEach((o) => o.dispose())
      scene.background = null
      scene.fog = null
    },
  }
}
