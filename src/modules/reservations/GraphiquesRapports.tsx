// Graphiques de l'onglet Rapports, en SVG simple (pas de bibliothèque).
// Règles (skill dataviz) : couleurs par rôle dans un ordre fixe validé
// (bleu, orange, aqua ; aqua < 3:1 → chaque graphique a son tableau de
// chiffres), colonnes de 18 px au plus, bout arrondi de 4 px, lignes de
// 2 px, grille fine et discrète, un seul axe, légende dès deux séries,
// infobulle au survol (une pour toutes les séries), texte jamais coloré.

import { useRef, useState, type ReactNode } from 'react'
import { COULEURS, echelle, kdollars } from './echelles'

const L = 760
const H = 240
const G = 64 // marge gauche (axe)
const D = 12 // marge droite
const HAUT = 14
const BAS = 212

function Legende({ series, forme }: { series: { nom: string; couleur: string }[]; forme: 'barre' | 'ligne' }) {
  if (series.length < 2) return null
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-pierre-600">
      {series.map((s) => (
        <span key={s.nom} className="inline-flex items-center gap-1.5">
          {forme === 'barre' ? (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.couleur }} />
          ) : (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.couleur }} />
          )}
          {s.nom}
        </span>
      ))}
    </div>
  )
}

/**
 * Infobulle à côté du point survolé (x en fraction de la largeur), jamais
 * par-dessus : à droite dans la première moitié, à gauche dans la seconde.
 * `ecart` = demi-largeur de la bande survolée (fraction), pour ne pas cacher ses marques.
 */
function Infobulle({ x, ecart = 0.012, children }: { x: number; ecart?: number; children: ReactNode }) {
  const aDroite = x < 0.55
  const position = aDroite ? { left: `${(x + ecart) * 100}%` } : { right: `${(1 - x + ecart) * 100}%` }
  return (
    <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-pierre-200 bg-white px-2.5 py-1.5 text-xs shadow-md" style={position}>
      {children}
    </div>
  )
}

const LigneInfobulle = ({ couleur, valeur, nom }: { couleur: string; valeur: string; nom: string }) => (
  <div className="flex items-center gap-2 whitespace-nowrap">
    <span className="inline-block h-0.5 w-3 rounded" style={{ background: couleur }} />
    <strong className="font-semibold text-pierre-900 tabular-nums">{valeur}</strong>
    <span className="text-pierre-500">{nom}</span>
  </div>
)

/** Colonne au bout arrondi (4 px), carrée à la base. */
function colonne(x: number, y: number, l: number, base: number) {
  const h = base - y
  if (h <= 0) return ''
  const r = Math.min(4, h, l / 2)
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${base}Z`
}

export interface Serie {
  nom: string
  couleur: string
  valeurs: (number | null)[]
}

/** Colonnes groupées (une bande par catégorie, une colonne par série). */
export function Colonnes({ categories, series, format, formatAxe }: { categories: string[]; series: Serie[]; format: (v: number) => string; formatAxe: (v: number) => string }) {
  const [survol, setSurvol] = useState<number | null>(null)
  const max = Math.max(0, ...series.flatMap((s) => s.valeurs.map((v) => v ?? 0)))
  const { max: haut, graduations } = echelle(max)
  const y = (v: number) => BAS - (v / haut) * (BAS - HAUT)
  const bande = (L - G - D) / categories.length
  const k = series.length
  const largeur = Math.min(18, (bande * 0.8 - 2 * (k - 1)) / k)
  const groupe = k * largeur + 2 * (k - 1)
  return (
    <div>
      <Legende series={series} forme="barre" />
      <div className="relative">
        <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label="Graphique en colonnes (chiffres dans le tableau)">
          {graduations.map((g) => (
            <g key={g}>
              <line x1={G} x2={L - D} y1={y(g)} y2={y(g)} stroke="var(--color-pierre-200)" strokeWidth={1} />
              <text x={G - 8} y={y(g) + 4} textAnchor="end" className="fill-pierre-500 text-[11px]">
                {formatAxe(g)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const centre = G + bande * (i + 0.5)
            return (
              <g key={c}>
                {survol === i && <rect x={G + bande * i} y={HAUT - 4} width={bande} height={BAS - HAUT + 4} className="fill-pierre-100" />}
                {series.map((s, j) => {
                  const v = s.valeurs[i]
                  if (v === null || v === undefined) return null
                  return <path key={s.nom} d={colonne(centre - groupe / 2 + j * (largeur + 2), y(v), largeur, BAS)} fill={s.couleur} />
                })}
                <text x={centre} y={BAS + 18} textAnchor="middle" className="fill-pierre-600 text-[11px]">
                  {c}
                </text>
                <rect
                  x={G + bande * i}
                  y={0}
                  width={bande}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${c} : ${series.map((s) => `${s.nom} ${s.valeurs[i] === null ? '—' : format(s.valeurs[i]!)}`).join(', ')}`}
                  onMouseEnter={() => setSurvol(i)}
                  onMouseLeave={() => setSurvol(null)}
                  onFocus={() => setSurvol(i)}
                  onBlur={() => setSurvol(null)}
                />
              </g>
            )
          })}
          <line x1={G} x2={L - D} y1={BAS} y2={BAS} stroke="var(--color-pierre-300)" strokeWidth={1} />
        </svg>
        {survol !== null && (
          <Infobulle x={(G + bande * (survol + 0.5)) / L} ecart={bande / 2 / L}>
            <div className="mb-0.5 font-medium text-pierre-700">{categories[survol]}</div>
            {series.map((s) => (
              <LigneInfobulle key={s.nom} couleur={s.couleur} valeur={s.valeurs[survol] === null ? '—' : format(s.valeurs[survol]!)} nom={s.nom} />
            ))}
          </Infobulle>
        )}
      </div>
    </div>
  )
}

/** Mêmes données que Colonnes, en courbes : un point par catégorie, une ligne par série (null = la ligne s'arrête). */
export function CourbesMois({ categories, series, format, formatAxe }: { categories: string[]; series: Serie[]; format: (v: number) => string; formatAxe: (v: number) => string }) {
  const [survol, setSurvol] = useState<number | null>(null)
  const max = Math.max(0, ...series.flatMap((s) => s.valeurs.map((v) => v ?? 0)))
  const { max: haut, graduations } = echelle(max)
  const y = (v: number) => BAS - (v / haut) * (BAS - HAUT)
  const bande = (L - G - D) / categories.length
  const cx = (i: number) => G + bande * (i + 0.5)
  const trace = (valeurs: (number | null)[]) => {
    let d = ''
    let dedans = false
    valeurs.forEach((v, i) => {
      if (v === null || v === undefined) {
        dedans = false
        return
      }
      d += `${dedans ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`
      dedans = true
    })
    return d
  }
  return (
    <div>
      <Legende series={series} forme="ligne" />
      <div className="relative">
        <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label="Graphique en courbes (chiffres dans le tableau)">
          {graduations.map((g) => (
            <g key={g}>
              <line x1={G} x2={L - D} y1={y(g)} y2={y(g)} stroke="var(--color-pierre-200)" strokeWidth={1} />
              <text x={G - 8} y={y(g) + 4} textAnchor="end" className="fill-pierre-500 text-[11px]">
                {formatAxe(g)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => (
            <text key={c} x={cx(i)} y={BAS + 18} textAnchor="middle" className="fill-pierre-600 text-[11px]">
              {c}
            </text>
          ))}
          <line x1={G} x2={L - D} y1={BAS} y2={BAS} stroke="var(--color-pierre-300)" strokeWidth={1} />
          {survol !== null && <line x1={cx(survol)} x2={cx(survol)} y1={HAUT} y2={BAS} stroke="var(--color-pierre-400)" strokeWidth={1} />}
          {/* La série de l'exercice choisi (la première) est dessinée en dernier : par-dessus les autres. */}
          {[...series].reverse().map((s) => (
            <g key={s.nom}>
              <path d={trace(s.valeurs)} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.valeurs.map((v, i) =>
                v === null || v === undefined ? null : <circle key={i} cx={cx(i)} cy={y(v)} r={survol === i ? 5 : 4} fill={s.couleur} stroke="white" strokeWidth={2} />,
              )}
            </g>
          ))}
          {categories.map((c, i) => (
            <rect
              key={c}
              x={G + bande * i}
              y={0}
              width={bande}
              height={H}
              fill="transparent"
              tabIndex={0}
              aria-label={`${c} : ${series.map((s) => `${s.nom} ${s.valeurs[i] === null ? '—' : format(s.valeurs[i]!)}`).join(', ')}`}
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol(null)}
              onFocus={() => setSurvol(i)}
              onBlur={() => setSurvol(null)}
            />
          ))}
        </svg>
        {survol !== null && (
          <Infobulle x={cx(survol) / L} ecart={bande / 4 / L}>
            <div className="mb-0.5 font-medium text-pierre-700">{categories[survol]}</div>
            {series.map((s) => (
              <LigneInfobulle key={s.nom} couleur={s.couleur} valeur={s.valeurs[survol] === null ? '—' : format(s.valeurs[survol]!)} nom={s.nom} />
            ))}
          </Infobulle>
        )}
      </div>
    </div>
  )
}

/** Choix de la forme des graphiques par mois (courbes ou colonnes). */
export function ChoixForme({ forme, changer }: { forme: 'courbes' | 'colonnes'; changer: (f: 'courbes' | 'colonnes') => void }) {
  return (
    <div className="flex gap-1 text-xs" role="group" aria-label="Forme du graphique">
      {(['courbes', 'colonnes'] as const).map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={forme === f}
          className={`rounded-full px-2.5 py-1 ${forme === f ? 'bg-foret-700 text-white' : 'bg-pierre-100 text-pierre-700 hover:bg-pierre-200'}`}
          onClick={() => changer(f)}
        >
          {f === 'courbes' ? 'Courbes' : 'Colonnes'}
        </button>
      ))}
    </div>
  )
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const ms = (jour: string) => Date.parse(`${jour}T12:00:00Z`)
const jourLisible = (jour: string) => {
  const [a, m, j] = jour.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]} ${a}`
}

/** Courbes cumulées dans le temps (NaN = pas de valeur : la ligne s'arrête). */
export function Courbes({ jours, series, marque, format }: { jours: string[]; series: Serie[]; marque?: string; format: (v: number) => string }) {
  const [survol, setSurvol] = useState<number | null>(null)
  const cadre = useRef<SVGSVGElement>(null)
  const DROITE = 96 // place des étiquettes de fin
  const t0 = ms(jours[0])
  const t1 = ms(jours.at(-1)!)
  const x = (jour: string) => G + ((ms(jour) - t0) / (t1 - t0)) * (L - G - DROITE)
  const finies = series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null && Number.isFinite(v)))
  const { max: haut, graduations } = echelle(Math.max(0, ...finies))
  const y = (v: number) => BAS - (v / haut) * (BAS - HAUT)
  const trace = (valeurs: (number | null)[]) => {
    let d = ''
    let dedans = false
    valeurs.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        dedans = false
        return
      }
      d += `${dedans ? 'L' : 'M'}${x(jours[i]).toFixed(1)},${y(v).toFixed(1)}`
      dedans = true
    })
    return d
  }
  // Graduations : le 1er de chaque mois de l'axe.
  const mois: string[] = []
  for (let [a, m] = jours[0].split('-').map(Number); `${a}-${String(m).padStart(2, '0')}-01` <= jours.at(-1)!; m === 12 ? ((a += 1), (m = 1)) : (m += 1)) {
    const j = `${a}-${String(m).padStart(2, '0')}-01`
    if (j >= jours[0]) mois.push(j)
  }
  const derniere = (valeurs: (number | null)[]) => {
    for (let i = valeurs.length - 1; i >= 0; i--) if (valeurs[i] !== null && Number.isFinite(valeurs[i])) return i
    return -1
  }
  const bouger = (e: React.PointerEvent<SVGRectElement>) => {
    const b = cadre.current!.getBoundingClientRect()
    const px = ((e.clientX - b.left) / b.width) * L
    let meilleur = 0
    jours.forEach((j, i) => {
      if (Math.abs(x(j) - px) < Math.abs(x(jours[meilleur]) - px)) meilleur = i
    })
    setSurvol(meilleur)
  }
  return (
    <div>
      <Legende series={series} forme="ligne" />
      <div className="relative">
        <svg ref={cadre} viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label="Courbes cumulées (chiffres à côté)">
          {graduations.map((g) => (
            <g key={g}>
              <line x1={G} x2={L - DROITE} y1={y(g)} y2={y(g)} stroke="var(--color-pierre-200)" strokeWidth={1} />
              <text x={G - 8} y={y(g) + 4} textAnchor="end" className="fill-pierre-500 text-[11px]">
                {kdollars(g)}
              </text>
            </g>
          ))}
          {/* Un mois sur trois (oct., janv., avr., juil.), l'année sous octobre : jamais de noms qui se chevauchent. */}
          {mois
            .filter((j) => (Number(j.slice(5, 7)) - 1) % 3 === 0)
            .map((j) => (
              <g key={j}>
                <line x1={x(j)} x2={x(j)} y1={BAS} y2={BAS + 4} stroke="var(--color-pierre-300)" strokeWidth={1} />
                <text x={x(j)} y={BAS + 16} textAnchor="middle" className="fill-pierre-500 text-[10px]">
                  {MOIS_COURTS[Number(j.slice(5, 7)) - 1]}
                </text>
                {j.slice(5, 7) === '10' && (
                  <text x={x(j)} y={BAS + 27} textAnchor="middle" className="fill-pierre-400 text-[10px]">
                    {j.slice(0, 4)}
                  </text>
                )}
              </g>
            ))}
          <line x1={G} x2={L - DROITE} y1={BAS} y2={BAS} stroke="var(--color-pierre-300)" strokeWidth={1} />
          {marque && marque >= jours[0] && marque <= jours.at(-1)! && (
            <g>
              <line x1={x(marque)} x2={x(marque)} y1={HAUT} y2={BAS} stroke="var(--color-pierre-400)" strokeWidth={1} />
              <text x={x(marque) + 4} y={HAUT + 8} className="fill-pierre-500 text-[10px]">
                aujourd’hui
              </text>
            </g>
          )}
          {series.map((s) => (
            <path key={s.nom} d={trace(s.valeurs)} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((s) => {
            const i = derniere(s.valeurs)
            if (i < 0) return null
            const v = s.valeurs[i]!
            return (
              <g key={s.nom}>
                <circle cx={x(jours[i])} cy={y(v)} r={4} fill={s.couleur} stroke="white" strokeWidth={2} />
                <text x={x(jours[i]) + 8} y={y(v) + 4} className="fill-pierre-700 text-[11px] font-medium">
                  {kdollars(v)}
                </text>
              </g>
            )
          })}
          {survol !== null && (
            <g>
              <line x1={x(jours[survol])} x2={x(jours[survol])} y1={HAUT} y2={BAS} stroke="var(--color-pierre-400)" strokeWidth={1} />
              {series.map((s) =>
                s.valeurs[survol] !== null && Number.isFinite(s.valeurs[survol]) ? (
                  <circle key={s.nom} cx={x(jours[survol])} cy={y(s.valeurs[survol]!)} r={4} fill={s.couleur} stroke="white" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
          <rect x={G} y={0} width={L - G - DROITE} height={H} fill="transparent" onPointerMove={bouger} onPointerLeave={() => setSurvol(null)} />
        </svg>
        {survol !== null && (
          <Infobulle x={x(jours[survol]) / L}>
            <div className="mb-0.5 font-medium text-pierre-700">{jourLisible(jours[survol])}</div>
            {series.map((s) => (
              <LigneInfobulle
                key={s.nom}
                couleur={s.couleur}
                valeur={s.valeurs[survol] === null || !Number.isFinite(s.valeurs[survol]) ? '—' : format(s.valeurs[survol]!)}
                nom={s.nom}
              />
            ))}
          </Infobulle>
        )}
      </div>
    </div>
  )
}

/** Barres horizontales d'une seule série : libellé et valeur au-dessus, barre dessous (raisons de perte…). */
export function BarresHorizontales({ lignes }: { lignes: { libelle: string; valeur: number; detail?: string }[] }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur))
  return (
    <div className="space-y-2.5">
      {lignes.map((l) => (
        <div key={l.libelle}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-pierre-700" title={l.libelle}>
              {l.libelle}
            </span>
            <span className="whitespace-nowrap text-xs tabular-nums text-pierre-600">
              <strong className="font-semibold text-pierre-900">{l.valeur}</strong>
              {l.detail && <span> · {l.detail}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5">
            <div className="h-full rounded-r" style={{ width: `${Math.max((l.valeur / max) * 100, 1)}%`, background: COULEURS[0] }} />
          </div>
        </div>
      ))}
    </div>
  )
}
