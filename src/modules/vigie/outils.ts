import { useSearchParams } from 'react-router'
import { TYPES_SEJOUR, type Activite, type Camp, type LienActivite, type Programme, type TypeSejour } from './types'

// Fonctions de mise en forme et index partagés par les vues du module.

export const argent = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

export const dateCourte = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'

export const menu = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

/** Fourchette de prix par nuit des programmes d'un camp. */
export function fourchetteParNuit(programmes: Programme[]) {
  const valeurs = programmes.map((p) => p.prix_par_nuit).filter((v): v is number => v != null).map(Number)
  if (!valeurs.length) return null
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  return min === max ? argent(min) : `${argent(min)} à ${argent(max)}`
}

/** Index pratiques pour les vues : camps par id, activités par camp, etc. */
export function indexer(camps: Camp[], activites: Activite[], liens: LienActivite[], programmes: Programme[]) {
  const camp = new Map(camps.map((c) => [c.id, c]))
  const activite = new Map(activites.map((a) => [a.id, a]))
  const campsParActivite = new Map<string, Camp[]>()
  const activitesParCamp = new Map<string, Activite[]>()
  for (const l of liens) {
    const c = camp.get(l.camp_id)
    const a = activite.get(l.activite_id)
    if (!c || !a) continue
    campsParActivite.set(a.id, [...(campsParActivite.get(a.id) ?? []), c])
    activitesParCamp.set(c.id, [...(activitesParCamp.get(c.id) ?? []), a])
  }
  const programmesParCamp = new Map<string, Programme[]>()
  for (const p of programmes) if (p.actif) programmesParCamp.set(p.camp_id, [...(programmesParCamp.get(p.camp_id) ?? []), p])
  return { camp, activite, campsParActivite, activitesParCamp, programmesParCamp }
}

/** Camp suivi qui compte dans les comparaisons (leader ou référence). */
export const estComparable = (c: Camp) => c.statut_inclusion === 'inclus' && c.categorie !== 'non_comparable'
export const estLeader = (c: Camp) => c.statut_inclusion === 'inclus' && c.categorie === 'leader'
/** Ordre d'affichage : leaders, références, puis les non-comparables. */
export const rangCategorie = (c: Camp) => (c.categorie === 'leader' ? 0 : c.categorie === 'reference' ? 1 : 2)

// ------------------------------------------------------------ types de séjour

/** Filtre « type de séjour » : un des quatre types, « aucun » (pas classé) ou rien (tous). */
export type FiltreType = TypeSejour | 'aucun' | ''

/**
 * Type de séjour choisi, dans l'adresse (?type=classe_nature) comme la catégorie
 * du tableau de bord : il suit le lien d'un camp vers sa fiche. Rien n'est gardé
 * sur l'appareil (aucun filtre du module ne l'est).
 */
export function useTypeChoisi(avecAucun = false): [FiltreType, (t: FiltreType) => void] {
  const [params, setParams] = useSearchParams()
  const brut = params.get('type') ?? ''
  const type: FiltreType = TYPES_SEJOUR.some((t) => t.id === brut) || (avecAucun && brut === 'aucun') ? (brut as FiltreType) : ''
  const changer = (t: FiltreType) => {
    const p = new URLSearchParams(params)
    if (t) p.set('type', t)
    else p.delete('type')
    setParams(p, { replace: true })
  }
  return [type, changer]
}

/** Programmes du type choisi (tous si aucun type n'est choisi). */
export const duType = (programmes: Programme[], type: FiltreType) =>
  !type ? programmes : programmes.filter((p) => (type === 'aucun' ? p.type_sejour == null : p.type_sejour === type))

/** Adresse de la fiche d'un camp, avec le type choisi. */
export const lienCamp = (id: string, type: FiltreType) => `/vigie/camps/${id}${type ? `?type=${type}` : ''}`

/** Prix par nuit d'une liste de programmes : nombre, plus bas, plus haut, médiane (null si aucun prix). */
export function statsParNuit(programmes: Programme[]) {
  const v = programmes
    .map((p) => p.prix_par_nuit)
    .filter((x): x is number => x != null)
    .map(Number)
    .sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return { n: v.length, min: v[0], max: v[v.length - 1], mediane: v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
}

/**
 * Médiane du prix par nuit de chaque type, sur les programmes actifs des camps
 * comparables (leaders et références suivis) : la comparaison se fait entre
 * programmes du même type.
 */
export function medianesParType(camps: Camp[], programmes: Programme[]) {
  const comparables = new Set(camps.filter(estComparable).map((c) => c.id))
  const parType = new Map<TypeSejour, ReturnType<typeof statsParNuit>>()
  for (const t of TYPES_SEJOUR) {
    parType.set(t.id, statsParNuit(programmes.filter((p) => p.actif && p.type_sejour === t.id && comparables.has(p.camp_id))))
  }
  return parType
}

/** « 154 $ par nuit en médiane (de 90 $ à 248 $, 62 programmes) », ou un seul prix. */
export function resumeStats(s: ReturnType<typeof statsParNuit>) {
  if (!s) return 'aucun prix par nuit connu'
  if (s.n === 1) return `${argent(s.mediane)} par nuit (un seul programme avec un prix)`
  return `${argent(s.mediane)} par nuit en médiane (de ${argent(s.min)} à ${argent(s.max)}, ${s.n} programmes avec un prix)`
}

/** Écart du prix par nuit d'un programme à la médiane de son type (« +12 % »), ou null. */
export function ecartMediane(p: Programme, medianes: Map<TypeSejour, ReturnType<typeof statsParNuit>>) {
  const s = p.type_sejour ? medianes.get(p.type_sejour) : null
  if (!s || p.prix_par_nuit == null || s.n < 2) return null
  const pct = Math.round((Number(p.prix_par_nuit) / s.mediane - 1) * 100)
  const type = TYPES_SEJOUR.find((t) => t.id === p.type_sejour)!.libelle
  return {
    court: pct === 0 ? '= médiane' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`,
    titre: `${pct === 0 ? 'À la médiane' : `${Math.abs(pct)} % ${pct > 0 ? 'au-dessus' : 'en dessous'} de la médiane`} des camps comparables (${type} : ${argent(s.mediane)} par nuit, ${s.n} programmes)`,
  }
}
