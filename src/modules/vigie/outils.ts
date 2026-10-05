import type { Activite, Camp, LienActivite, Programme } from './types'

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
