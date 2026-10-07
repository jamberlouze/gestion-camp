import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { argent, entier, type LigneTableau } from './calcul'

// Trois petits graphiques en ligne qui partagent l'axe des mois ou des
// semaines (jamais deux échelles sur un même graphique) : coût par
// assiette, coût (nourriture + salaires) et assiettes. Un seul curseur et
// une seule infobulle pour les trois ; le tableau en dessous donne toutes
// les valeurs sans survol. Couleurs : trois premières teintes de la palette
// catégorielle de référence (validée), le texte reste en gris.

interface Serie {
  titre: string
  couleur: string
  valeur: (l: LigneTableau) => number | null
  format: (n: number) => string
  /** Graduations : format court. */
  graduation: (n: number) => string
}

const compactArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('fr-CA', { notation: 'compact', maximumFractionDigits: 1 })

const SERIES: Serie[] = [
  { titre: 'Coût par assiette', couleur: '#2a78d6', valeur: (l) => l.coutTotal, format: argent, graduation: (n) => argent(n).replace(/,00\s/, ' ') },
  { titre: 'Coût (nourriture + salaires)', couleur: '#eb6834', valeur: (l) => l.nourriture + l.salaires, format: argent, graduation: (n) => compactArgent.format(n) },
  { titre: 'Assiettes servies', couleur: '#1baf7a', valeur: (l) => l.assiettes, format: entier, graduation: (n) => compact.format(n) },
]

const GAUCHE = 64
const DROITE = 72
const HAUT_PANNEAU = 112
const TITRE = 34
const BAS = 26

/** Maximum « rond » de l'axe : 1, 2, 2,5 ou 5 × 10ⁿ. */
function maximumRond(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((k) => k * p >= v) ?? 10) * p
}

export function GraphiqueCouts({ lignes, court }: { lignes: LigneTableau[]; court: (l: LigneTableau) => string }) {
  const boite = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(720)
  const [actif, setActif] = useState<number | null>(null)

  useEffect(() => {
    const el = boite.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setLargeur(Math.max(320, Math.round(e.contentRect.width))))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const n = lignes.length
  if (!n) return null
  const pas = (largeur - GAUCHE - DROITE) / n
  const xDe = (i: number) => GAUCHE + (i + 0.5) * pas
  const hauteur = SERIES.length * (HAUT_PANNEAU + TITRE) + BAS
  const zone = HAUT_PANNEAU - 8

  const pointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * largeur
    setActif(Math.min(n - 1, Math.max(0, Math.floor((x - GAUCHE) / pas))))
  }
  const clavier = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActif((a) => Math.min(n - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActif((a) => Math.max(0, (a ?? n) - 1))
    else if (e.key === 'Escape') setActif(null)
    else return
    e.preventDefault()
  }

  const ligneActive = actif != null ? lignes[actif] : null
  const xActif = actif != null ? xDe(actif) : 0

  return (
    <div ref={boite} className="relative max-w-5xl select-none">
      <svg
        width={largeur}
        height={hauteur}
        viewBox={`0 0 ${largeur} ${hauteur}`}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-foret-600/30"
        role="img"
        aria-label="Coût par assiette, coût et assiettes par période (valeurs dans le tableau ci-dessous)"
        tabIndex={0}
        onPointerMove={pointer}
        onPointerDown={pointer}
        onPointerLeave={() => setActif(null)}
        onKeyDown={clavier}
        onBlur={() => setActif(null)}
      >
        {SERIES.map((s, k) => {
          const y0 = k * (HAUT_PANNEAU + TITRE) + TITRE
          const valeurs = lignes.map(s.valeur)
          const max = maximumRond(Math.max(0, ...valeurs.map((v) => v ?? 0)))
          const yDe = (v: number) => y0 + zone - (v / max) * zone
          // Tracé coupé là où il n'y a pas de valeur (aucune assiette).
          let d = ''
          valeurs.forEach((v, i) => {
            if (v == null) return
            d += `${i > 0 && valeurs[i - 1] != null ? 'L' : 'M'}${xDe(i).toFixed(1)},${yDe(v).toFixed(1)}`
          })
          const dernier = valeurs.map((v, i) => ({ v, i })).filter((p) => p.v != null).at(-1)
          return (
            <g key={s.titre}>
              <line x1={GAUCHE - 6} x2={GAUCHE + 6} y1={y0 - 13} y2={y0 - 13} stroke={s.couleur} strokeWidth={2} strokeLinecap="round" />
              <text x={GAUCHE + 12} y={y0 - 9} className="fill-pierre-800 text-[12px] font-medium">
                {s.titre}
              </text>
              {[0, max / 2, max].map((t) => (
                <g key={t}>
                  <line x1={GAUCHE} x2={largeur - DROITE} y1={yDe(t)} y2={yDe(t)} className="stroke-pierre-200" strokeWidth={1} />
                  <text x={GAUCHE - 8} y={yDe(t) + 4} textAnchor="end" className="fill-pierre-500 text-[11px] tabular-nums">
                    {s.graduation(t)}
                  </text>
                </g>
              ))}
              <path d={d} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {valeurs.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={xDe(i)} cy={yDe(v)} r={actif === i ? 5 : 4} fill={s.couleur} stroke="white" strokeWidth={2} />
                ),
              )}
              {dernier && (
                <text x={xDe(dernier.i) + 10} y={yDe(dernier.v!) + 4} className="fill-pierre-700 text-[11px] font-medium tabular-nums">
                  {s.format(dernier.v!)}
                </text>
              )}
            </g>
          )
        })}
        {lignes.map((l, i) => (
          <text
            key={l.intervalle.id}
            x={xDe(i)}
            y={hauteur - 8}
            textAnchor="middle"
            className={`text-[11px] ${actif === i ? 'fill-pierre-900 font-medium' : 'fill-pierre-500'}`}
          >
            {court(l)}
          </text>
        ))}
        {actif != null && <line x1={xActif} x2={xActif} y1={TITRE - 4} y2={hauteur - BAS} className="stroke-pierre-400" strokeWidth={1} pointerEvents="none" />}
      </svg>

      {ligneActive && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-48 rounded-lg border border-pierre-200 bg-white px-3 py-2 text-sm shadow-md"
          style={xActif > largeur / 2 ? { right: largeur - xActif + 12 } : { left: xActif + 12 }}
        >
          <p className="mb-1 text-xs text-pierre-500">{ligneActive.intervalle.nom}</p>
          {SERIES.map((s) => {
            const v = s.valeur(ligneActive)
            return (
              <p key={s.titre} className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.couleur }} />
                <span className="font-semibold tabular-nums text-pierre-900">{v == null ? '—' : s.format(v)}</span>
                <span className="text-xs text-pierre-500">{s.titre}</span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}
