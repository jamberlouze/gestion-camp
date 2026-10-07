import type { Region, Transaction } from './types'

// Calculs de la petite caisse (fonctions pures).

/** Montant signé : + pour une entrée, − pour une sortie. */
export const signe = (t: Pick<Transaction, 'sens' | 'montant'>) => (t.sens === 'entree' ? t.montant : -t.montant)

/** Arrondi au cent (évite 0,30000000004). */
const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Poche choisie dans le filtre : `e:<id>` (compagnie, `:qc`/`:int` en plus
 * pour une région), `p:<id>` (poche personnelle) ; '' = toute la caisse.
 */
export type ClePoche = string

export const clePoche = (t: Pick<Transaction, 'entreprise_id' | 'poche_id'>) =>
  t.entreprise_id ? `e:${t.entreprise_id}` : `p:${t.poche_id}`

export function dansPoche(t: Transaction, cle: ClePoche) {
  if (!cle) return true
  const [genre, id, region] = cle.split(':')
  if (genre === 'p') return t.poche_id === id
  return t.entreprise_id === id && (!region || t.region === region)
}

export interface Soldes {
  total: number
  /** Par compagnie (id). */
  compagnies: Map<string, number>
  /** Par compagnie (id), puis région. */
  regions: Map<string, Record<Region, number>>
  /** Par poche personnelle (id). */
  poches: Map<string, number>
}

export function soldes(transactions: Transaction[]): Soldes {
  const s: Soldes = { total: 0, compagnies: new Map(), regions: new Map(), poches: new Map() }
  for (const t of transactions) {
    const m = signe(t)
    s.total += m
    if (t.entreprise_id) {
      s.compagnies.set(t.entreprise_id, (s.compagnies.get(t.entreprise_id) ?? 0) + m)
      if (t.region) {
        const r = s.regions.get(t.entreprise_id) ?? { qc: 0, int: 0 }
        r[t.region] += m
        s.regions.set(t.entreprise_id, r)
      }
    } else if (t.poche_id) {
      s.poches.set(t.poche_id, (s.poches.get(t.poche_id) ?? 0) + m)
    }
  }
  s.total = cents(s.total)
  for (const m of [s.compagnies, s.poches]) for (const [k, v] of m) m.set(k, cents(v))
  for (const r of s.regions.values()) {
    r.qc = cents(r.qc)
    r.int = cents(r.int)
  }
  return s
}

/** Ordre de la caisse : par jour, puis par heure d'inscription. */
export const chronologique = (a: Transaction, b: Transaction) =>
  a.jour.localeCompare(b.jour) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/**
 * Solde après chaque ligne d'une sélection (une poche ou toute la caisse),
 * dans l'ordre chronologique, comme la colonne « Balance » du Sheets.
 */
export function soldesCourants(transactions: Transaction[]): Map<string, number> {
  const resultat = new Map<string, number>()
  let solde = 0
  for (const t of [...transactions].sort(chronologique)) {
    solde = cents(solde + signe(t))
    resultat.set(t.id, solde)
  }
  return resultat
}

/** Texte cherché dans les détails et le nom de qui a inscrit (sans accents ni majuscules). */
export const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** « 19,99 », « 19.99 », « 1 800 » ou « 19,99 $ » → 19.99 ; vide ou illisible → null. */
export function lireMontant(texte: string): number | null {
  const propre = texte.replace(/[\s $]/g, '').replace(',', '.')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const formatArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })
export const argent = (n: number) => formatArgent.format(n)

const formatJour = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** « 27 mai 2026 » */
export const jourLisible = (jour: string) => formatJour.format(new Date(`${jour}T00:00:00Z`))
