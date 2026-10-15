import type { Achat, Statut } from './types'

// Fonctions pures (sans React ni Supabase) : date cible de commande.
// Tests : node --test src/modules/achats/outils.test.mjs

/** Signal ambre à ce nombre de jours ou moins de la date cible. */
export const JOURS_PROCHE = 7
/** Compteur du haut du module (et de l'accueil) : les 30 prochains jours. */
export const HORIZON_JOURS = 30

/** Date du jour sur l'appareil, AAAA-MM-JJ. */
export const jourAujourdhui = (d = new Date()) => d.toLocaleDateString('sv-SE')

/** Jours d'aujourd'hui (`jour`) à `date` : négatif = date passée. */
export function joursAvant(date: string, jour: string) {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${jour}T12:00:00Z`)) / 86_400_000)
}

/** Date complète et plausible (un champ date en cours de frappe donne « 0002-10-14 »). */
export const dateValide = (v: string) => /^20\d\d-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v))

export type EtatCible = 'retard' | 'proche' | 'plus_tard'

/**
 * Signal de la date cible, seulement tant que l'achat est « À commander » :
 * `retard` = date passée (rouge), `proche` = dans 7 jours ou moins (ambre),
 * `plus_tard` = sans signal. null = pas de date, ou déjà commandé ou reçu.
 */
export function etatCible(a: Pick<Achat, 'statut' | 'date_cible'>, jour: string): EtatCible | null {
  if (a.statut !== 'a_commander' || !a.date_cible) return null
  const j = joursAvant(a.date_cible, jour)
  return j < 0 ? 'retard' : j <= JOURS_PROCHE ? 'proche' : 'plus_tard'
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 19 oct. » (« 19 oct. 2027 » hors de l'année de `jour`). */
export function dateCourte(date: string, jour: string) {
  const [a, m, j] = date.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}${String(a) === jour.slice(0, 4) ? '' : ` ${a}`}`
}

const jours = (n: number) => `${n} jour${n > 1 ? 's' : ''}`

/** « En retard de 3 jours », « Aujourd'hui », « Demain », « Dans 5 jours », « D'ici le 3 nov. ». */
export function libelleCible(date: string, jour: string) {
  const j = joursAvant(date, jour)
  if (j < 0) return `En retard de ${jours(-j)}`
  if (j === 0) return "Aujourd'hui"
  if (j === 1) return 'Demain'
  if (j <= JOURS_PROCHE) return `Dans ${jours(j)}`
  return `D'ici le ${dateCourte(date, jour)}`
}

export interface ACommanderBientot<T> {
  /** Date cible passée, encore « À commander » (la plus ancienne d'abord). */
  enRetard: T[]
  /** Date cible d'aujourd'hui à `horizon` jours (la plus proche d'abord). */
  aVenir: T[]
  /** Les deux ensemble. */
  nombre: number
}

/**
 * Achats « À commander » à commander bientôt : en retard ou dans les
 * `horizon` prochains jours. Ceux sans date cible n'y sont jamais.
 */
export function aCommanderBientot<T extends Pick<Achat, 'statut' | 'date_cible'>>(
  achats: T[],
  jour: string,
  horizon = HORIZON_JOURS,
): ACommanderBientot<T> {
  const enRetard: T[] = []
  const aVenir: T[] = []
  for (const a of achats) {
    if (!etatCible(a, jour)) continue
    const j = joursAvant(a.date_cible!, jour)
    if (j < 0) enRetard.push(a)
    else if (j <= horizon) aVenir.push(a)
  }
  const parDate = (a: T, b: T) => a.date_cible!.localeCompare(b.date_cible!)
  enRetard.sort(parDate)
  aVenir.sort(parDate)
  return { enRetard, aVenir, nombre: enRetard.length + aVenir.length }
}

const RANG: Record<Statut, number> = { a_commander: 0, commande: 1, recu: 2 }

type Triable = Pick<Achat, 'statut' | 'item' | 'date_cible'>

/** À commander → commandé → reçu, puis par nom. */
export const comparerParStatut = (a: Triable, b: Triable) => RANG[a.statut] - RANG[b.statut] || a.item.localeCompare(b.item, 'fr')

/** La date cible la plus proche d'abord (sans date à la fin), puis par statut et par nom. */
export const comparerParDate = (a: Triable, b: Triable) =>
  (a.date_cible ?? '9999').localeCompare(b.date_cible ?? '9999') || comparerParStatut(a, b)
