import { useEffect, useMemo, useRef, useState } from 'react'
import type { ObjetMaquette, Scene } from './types'

// Visionneuse de maquette 3D en Canvas 2D, sans bibliothèque : les maquettes
// sont faites de quelques dizaines de formes simples, l'algorithme du peintre
// (faces triées de la plus loin à la plus proche) suffit.
// Glisser : tourner ; molette : zoom ; survol : nom de l'objet.

type V = [number, number, number]
interface Face {
  pts: V[]
  couleur: [number, number, number]
  nom: string
  normale: V
  sol?: boolean
}

const sous = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const plus = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const fois = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const scal = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const vect = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unitaire = (a: V): V => {
  const n = Math.hypot(...a) || 1
  return [a[0] / n, a[1] / n, a[2] / n]
}
const centre = (pts: V[]) => fois(pts.reduce(plus, [0, 0, 0] as V), 1 / pts.length)

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isNaN(n) ? [156, 163, 175] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Faces d'un objet dans son repère local (centré à l'origine). */
function facesLocales(o: ObjetMaquette): V[][] {
  const [a = 1, b = 1, c = 1] = o.dimensions
  const N = 18
  const anneau = (r: number, y: number) => Array.from({ length: N }, (_, i) => [r * Math.cos((2 * Math.PI * i) / N), y, r * Math.sin((2 * Math.PI * i) / N)] as V)
  switch (o.forme) {
    case 'boite': {
      const [x, y, z] = [a / 2, b / 2, c / 2]
      const s: V[] = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]
      return [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]].map((f) => f.map((i) => s[i]))
    }
    case 'cylindre': {
      const bas = anneau(a, -b / 2)
      const haut = anneau(a, b / 2)
      return [...bas.map((p, i) => [p, bas[(i + 1) % N], haut[(i + 1) % N], haut[i]]), bas, haut]
    }
    case 'cone': {
      const bas = anneau(a, -b / 2)
      const sommet: V = [0, b / 2, 0]
      return [...bas.map((p, i) => [p, bas[(i + 1) % N], sommet]), bas]
    }
    case 'sphere': {
      const lat = 8, lon = 14
      const pt = (i: number, j: number): V => {
        const t = (Math.PI * i) / lat, f = (2 * Math.PI * j) / lon
        return [a * Math.sin(t) * Math.cos(f), a * Math.cos(t), a * Math.sin(t) * Math.sin(f)]
      }
      const faces: V[][] = []
      for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) faces.push([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)])
      return faces
    }
  }
}

function tourner(p: V, [rx, ry, rz]: number[]): V {
  const [ax, ay, az] = [rx, ry, rz].map((d) => ((d ?? 0) * Math.PI) / 180)
  let [x, y, z] = p
  ;[y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)]
  ;[x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)]
  ;[x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)]
  return [x, y, z]
}

function construire(scene: Scene): { faces: Face[]; cible: V; rayon: number } {
  const faces: Face[] = []
  for (const o of scene.objets) {
    const pos = [o.position[0] ?? 0, o.position[1] ?? 0, o.position[2] ?? 0] as V
    const monde = facesLocales(o).map((f) => f.map((p) => plus(tourner(p, o.rotation ?? [0, 0, 0]), pos)))
    const milieu = centre(monde.flat())
    for (const pts of monde) {
      if (pts.length < 3) continue
      let n = unitaire(vect(sous(pts[1], pts[0]), sous(pts[2], pts[0])))
      // Normale vers l'extérieur de l'objet (formes convexes) : pas besoin
      // d'un sens de parcours cohérent des sommets.
      if (scal(n, sous(centre(pts), milieu)) < 0) n = fois(n, -1)
      faces.push({ pts, couleur: rgb(o.couleur), nom: o.nom, normale: n })
    }
  }
  // Sol en tuiles (le tri par profondeur se comporte mieux).
  const { largeur: L, profondeur: P } = scene.sol
  const T = 8
  const couleurSol = rgb(scene.sol.couleur)
  for (let i = 0; i < T; i++)
    for (let j = 0; j < T; j++) {
      const x0 = -L / 2 + (L * i) / T, x1 = x0 + L / T
      const z0 = -P / 2 + (P * j) / T, z1 = z0 + P / T
      faces.push({ pts: [[x0, -0.02, z0], [x1, -0.02, z0], [x1, -0.02, z1], [x0, -0.02, z1]], couleur: couleurSol, nom: '', normale: [0, 1, 0], sol: true })
    }
  const rayon = Math.max(L, P, ...scene.objets.map((o) => Math.hypot(o.position[0] ?? 0, o.position[2] ?? 0) * 2)) || 40
  return { faces, cible: [0, 0, 0], rayon }
}

const LUMIERE = unitaire([0.45, 1, 0.3])

export function Maquette3D({ scene, hauteur = 420 }: { scene: Scene; hauteur?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { faces, cible, rayon } = useMemo(() => construire(scene), [scene])
  const vueInitiale = useMemo(() => ({ lacet: 0.75, tangage: 0.75, distance: rayon * 0.85 }), [rayon])
  const [vue, setVue] = useState(vueInitiale)
  const [largeur, setLargeur] = useState(600)
  const [survol, setSurvol] = useState<{ nom: string; x: number; y: number } | null>(null)
  const projetees = useRef<{ poly: [number, number][]; nom: string }[]>([])
  const glisse = useRef<{ x: number; y: number } | null>(null)
  const [enGlisse, setEnGlisse] = useState(false)

  useEffect(() => {
    const el = canvas.current?.parentElement
    if (!el) return
    const obs = new ResizeObserver(() => setLargeur(el.clientWidth))
    obs.observe(el)
    setLargeur(el.clientWidth)
    return () => obs.disconnect()
  }, [])

  // Molette : écouteur non passif, pour que la page ne défile pas en zoomant.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const zoom = (e: WheelEvent) => {
      e.preventDefault()
      const k = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setVue((v) => ({ ...v, distance: Math.min(rayon * 4, Math.max(rayon * 0.2, v.distance * k)) }))
    }
    c.addEventListener('wheel', zoom, { passive: false })
    return () => c.removeEventListener('wheel', zoom)
  }, [rayon])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = largeur * dpr
    c.height = hauteur * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const ciel = ctx.createLinearGradient(0, 0, 0, hauteur)
    ciel.addColorStop(0, '#dbeafe')
    ciel.addColorStop(1, '#f8fafc')
    ctx.fillStyle = ciel
    ctx.fillRect(0, 0, largeur, hauteur)

    const { lacet, tangage, distance } = vue
    const oeil = plus(cible, fois([Math.cos(tangage) * Math.sin(lacet), Math.sin(tangage), Math.cos(tangage) * Math.cos(lacet)], distance))
    const avant = unitaire(sous(cible, oeil))
    const droite = unitaire(vect(avant, [0, 1, 0]))
    const haut = vect(droite, avant)
    const focale = hauteur / (2 * Math.tan((45 * Math.PI) / 360))
    const projeter = (p: V): [number, number, number] => {
      const v = sous(p, oeil)
      const z = scal(v, avant)
      return [largeur / 2 + (scal(v, droite) * focale) / z, hauteur / 2 - (scal(v, haut) * focale) / z, z]
    }

    const visibles: { poly: [number, number][]; z: number; f: Face }[] = []
    for (const f of faces) {
      if (scal(f.normale, sous(oeil, centre(f.pts))) <= 0) continue
      const proj = f.pts.map(projeter)
      if (proj.some((p) => p[2] < 0.5)) continue
      visibles.push({ poly: proj.map((p) => [p[0], p[1]]), z: proj.reduce((s, p) => s + p[2], 0) / proj.length + (f.sol ? 1e6 : 0), f })
    }
    visibles.sort((a, b) => b.z - a.z)
    for (const { poly, f } of visibles) {
      const k = f.sol ? 0.95 : 0.55 + 0.45 * Math.max(0, scal(f.normale, LUMIERE))
      const [r, g, b] = f.couleur.map((x) => Math.round(x * k))
      ctx.beginPath()
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.strokeStyle = f.sol ? `rgb(${r},${g},${b})` : `rgba(0,0,0,0.18)`
      ctx.lineWidth = f.sol ? 1 : 0.6
      ctx.fill()
      ctx.stroke()
    }
    // Du plus proche au plus loin, pour le survol.
    projetees.current = visibles.filter((v) => !v.f.sol).reverse().map((v) => ({ poly: v.poly, nom: v.f.nom }))
  }, [faces, cible, vue, largeur, hauteur])

  const dedans = (x: number, y: number, poly: [number, number][]) => {
    let ok = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok
    }
    return ok
  }

  return (
    <div className="relative select-none">
      <canvas
        ref={canvas}
        style={{ width: '100%', height: hauteur, touchAction: 'none', cursor: enGlisse ? 'grabbing' : 'grab' }}
        className="rounded-lg"
        onPointerDown={(e) => {
          glisse.current = { x: e.clientX, y: e.clientY }
          setEnGlisse(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={() => {
          glisse.current = null
          setEnGlisse(false)
        }}
        onPointerLeave={() => setSurvol(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - r.left, y = e.clientY - r.top
          if (glisse.current) {
            const dx = e.clientX - glisse.current.x, dy = e.clientY - glisse.current.y
            glisse.current = { x: e.clientX, y: e.clientY }
            setVue((v) => ({ ...v, lacet: v.lacet - dx * 0.008, tangage: Math.min(1.5, Math.max(0.08, v.tangage + dy * 0.006)) }))
            return
          }
          const touche = projetees.current.find((p) => p.nom && dedans(x, y, p.poly))
          setSurvol(touche ? { nom: touche.nom, x, y } : null)
        }}
      />
      {survol && (
        <div className="pointer-events-none absolute rounded bg-pierre-900/85 px-2 py-0.5 text-xs text-white" style={{ left: survol.x + 12, top: survol.y + 8 }}>
          {survol.nom}
        </div>
      )}
      <div className="absolute right-2 top-2 flex gap-1">
        <button className="rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white" onClick={() => setVue((v) => ({ ...v, tangage: 1.5 }))}>
          Dessus
        </button>
        <button className="rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white" onClick={() => setVue(vueInitiale)}>
          Réinitialiser
        </button>
      </div>
      <p className="mt-1 text-xs text-pierre-500">Glisser pour tourner, molette pour zoomer. Échelle : mètres.</p>
    </div>
  )
}
