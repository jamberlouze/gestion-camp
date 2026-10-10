// Disponibilité (plan §10) : chevauchements de sections et de salles entre
// réservations confirmées, et réservations Airbnb de la Vieille-France.
// Fichier pur : l'app (fiche, liste) et le Worker s'en servent ; même règle
// que reservations.conflit_airbnb en base.

import type { Reservation } from './types'

export const ETAPES_CONFIRMEES = ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']

type R = Pick<Reservation, 'id' | 'numero' | 'nom' | 'etape' | 'fermeture' | 'origine' | 'date_arrivee' | 'date_depart' | 'etages' | 'salles'> & {
  ref_externe?: string | null
  description?: string | null
}

/** Contrat signé (ou plus loin), ou réservation Airbnb ; jamais fermée. */
export const estConfirmee = (r: Pick<R, 'etape' | 'fermeture' | 'origine'>) => !r.fermeture && (r.origine === 'airbnb' || ETAPES_CONFIRMEES.includes(r.etape))

const lendemain = (jour: string) => new Date(Date.parse(`${jour}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Nuits occupées [début, fin) ; une journée sans nuit compte pour son jour. */
export const nuits = (r: Pick<R, 'date_arrivee' | 'date_depart'>): [string, string] => [
  r.date_arrivee,
  r.date_depart > r.date_arrivee ? r.date_depart : lendemain(r.date_arrivee),
]

export const seChevauchent = (a: Pick<R, 'date_arrivee' | 'date_depart'>, b: Pick<R, 'date_arrivee' | 'date_depart'>) => {
  const [a1, a2] = nuits(a)
  const [b1, b2] = nuits(b)
  return a1 < b2 && b1 < a2
}

const ressources = (r: Pick<R, 'etages' | 'salles'>) => [...(r.etages ?? []), ...(r.salles ?? [])]

export interface Chevauchement<T extends R> {
  autre: T
  /** Sections et salles occupées par les deux. */
  communs: string[]
}

/** Réservations confirmées qui occupent les mêmes sections ou salles les mêmes nuits. */
export function chevauchements<T extends R>(r: R, toutes: T[]): Chevauchement<T>[] {
  const miennes = new Set(ressources(r))
  if (!miennes.size) return []
  return toutes
    .filter((x) => x.id !== r.id && estConfirmee(x) && seChevauchent(r, x))
    .map((autre) => ({ autre, communs: ressources(autre).filter((c) => miennes.has(c)) }))
    .filter((c) => c.communs.length > 0)
    .sort((a, b) => a.autre.date_arrivee.localeCompare(b.autre.date_arrivee))
}

/** Conflit avec Airbnb : une réservation de groupe sur une réservation Airbnb (mêmes sections, mêmes nuits). */
export const conflitsAirbnbDe = <T extends R>(r: R, toutes: T[]) =>
  r.origine === 'airbnb' || r.fermeture ? [] : chevauchements(r, toutes).filter((c) => c.autre.origine === 'airbnb')

/** Toutes les réservations de groupe confirmées qui tombent sur une réservation Airbnb. */
export function conflitsAirbnb<T extends R>(toutes: T[]) {
  const airbnb = toutes.filter((x) => x.origine === 'airbnb' && !x.fermeture)
  if (!airbnb.length) return []
  return toutes
    .filter((r) => r.origine !== 'airbnb' && estConfirmee(r))
    .flatMap((r) => conflitsAirbnbDe(r, airbnb).map((c) => ({ groupe: r, airbnb: c.autre, communs: c.communs })))
}

/** Annonce d'une réservation Airbnb (d'après sa référence). */
export const annonceAirbnb = (r: Pick<R, 'ref_externe'>) =>
  r.ref_externe?.startsWith('airbnb:vf_complet:') ? 'Vieille-France complète' : r.ref_externe?.startsWith('airbnb:vf_bas:') ? 'Vieille-France, étage du bas' : null

/** Lien de la réservation dans Airbnb (gardé dans la description à la réception). */
export const lienAirbnb = (r: Pick<R, 'description'>) => r.description?.match(/https:\/\/\S+/)?.[0] ?? null
