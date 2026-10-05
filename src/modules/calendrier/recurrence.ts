// Événements récurrents (fonctions pures). La règle est un sous-ensemble
// de RRULE, sans date de fin (colonne fin_recurrence) :
//   FREQ=DAILY[;INTERVAL=n]
//   FREQ=WEEKLY;BYDAY=TU,TH[;INTERVAL=n]   (semaines comptées depuis date_debut)
//   FREQ=MONTHLY[;INTERVAL=n]              (même jour du mois que date_debut)
//   FREQ=MONTHLY;BYDAY=1MO[;INTERVAL=n]    (1er lundi ; -1FR = dernier vendredi)

import { ajouterJours, depuisIso, ecartJours, joursDansMois, joursEntre, jourSemaine, lundiDe } from './dates'
import type { Evenement } from './types'

export const CODES_JOURS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const PLURIELS_JOURS = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis']
const RANGS: Record<string, string> = { '1': '1er', '2': '2e', '3': '3e', '4': '4e', '-1': 'dernier' }

export type Regle =
  | { freq: 'DAILY'; intervalle: number }
  | { freq: 'WEEKLY'; intervalle: number; jours: number[] }
  | { freq: 'MONTHLY'; intervalle: number; rang?: { n: number; jour: number } }

export function lireRegle(texte: string | null | undefined): Regle | null {
  if (!texte) return null
  const parties = Object.fromEntries(
    texte
      .toUpperCase()
      .replace(/^RRULE:/, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  )
  const intervalle = Math.max(1, Number(parties.INTERVAL) || 1)
  if (parties.FREQ === 'DAILY') return { freq: 'DAILY', intervalle }
  if (parties.FREQ === 'WEEKLY') {
    const jours = (parties.BYDAY ?? '')
      .split(',')
      .map((c: string) => CODES_JOURS.indexOf(c.trim() as (typeof CODES_JOURS)[number]))
      .filter((j: number) => j >= 0)
    return jours.length ? { freq: 'WEEKLY', intervalle, jours: [...new Set<number>(jours)].sort() } : null
  }
  if (parties.FREQ === 'MONTHLY') {
    const m = /^(-?\d)([A-Z]{2})$/.exec(parties.BYDAY ?? '')
    if (m) {
      const jour = CODES_JOURS.indexOf(m[2] as (typeof CODES_JOURS)[number])
      const n = Number(m[1])
      if (jour >= 0 && (n === -1 || (n >= 1 && n <= 4))) return { freq: 'MONTHLY', intervalle, rang: { n, jour } }
      return null
    }
    return { freq: 'MONTHLY', intervalle }
  }
  return null
}

export function ecrireRegle(r: Regle): string {
  const intervalle = r.intervalle > 1 ? `;INTERVAL=${r.intervalle}` : ''
  if (r.freq === 'DAILY') return `FREQ=DAILY${intervalle}`
  if (r.freq === 'WEEKLY') return `FREQ=WEEKLY;BYDAY=${r.jours.map((j) => CODES_JOURS[j]).join(',')}${intervalle}`
  return `FREQ=MONTHLY${r.rang ? `;BYDAY=${r.rang.n}${CODES_JOURS[r.rang.jour]}` : ''}${intervalle}`
}

/** Rang d'une date dans son mois (« 2e mardi ») : n de 1 à 5. */
export function rangDansMois(iso: string): number {
  return Math.floor((depuisIso(iso).getDate() - 1) / 7) + 1
}

const estDernierDuMois = (iso: string) => {
  const d = depuisIso(iso)
  return d.getDate() + 7 > joursDansMois(d.getFullYear(), d.getMonth())
}

const moisEcart = (a: string, b: string) => {
  const da = depuisIso(a)
  const db = depuisIso(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth()
}

/** La règle tombe-t-elle ce jour-là (départ : date_debut) ? */
export function tombeLe(r: Regle, depart: string, iso: string): boolean {
  if (iso < depart) return false
  if (r.freq === 'DAILY') return ecartJours(depart, iso) % r.intervalle === 0
  if (r.freq === 'WEEKLY') {
    if (!r.jours.includes(jourSemaine(iso))) return false
    return (ecartJours(lundiDe(depart), lundiDe(iso)) / 7) % r.intervalle === 0
  }
  if (moisEcart(depart, iso) % r.intervalle !== 0) return false
  if (r.rang) {
    if (jourSemaine(iso) !== r.rang.jour) return false
    return r.rang.n === -1 ? estDernierDuMois(iso) : rangDansMois(iso) === r.rang.n
  }
  const jourDepart = depuisIso(depart).getDate()
  const d = depuisIso(iso)
  // Le 31 dans un mois de 30 jours : le dernier jour du mois.
  return d.getDate() === Math.min(jourDepart, joursDansMois(d.getFullYear(), d.getMonth()))
}

/** Dates de l'événement comprises entre debut et fin (incluses). */
export function occurrences(ev: Pick<Evenement, 'date_debut' | 'date_fin' | 'regle_recurrence' | 'fin_recurrence' | 'exceptions'>, debut: string, fin: string): string[] {
  const regle = lireRegle(ev.regle_recurrence)
  const exceptions = new Set(ev.exceptions ?? [])
  if (!regle) {
    // Ponctuel, sur un ou plusieurs jours.
    const a = ev.date_debut > debut ? ev.date_debut : debut
    const derniere = ev.date_fin ?? ev.date_debut
    const b = derniere < fin ? derniere : fin
    return a > b ? [] : joursEntre(a, b).filter((d) => !exceptions.has(d))
  }
  const a = ev.date_debut > debut ? ev.date_debut : debut
  const b = ev.fin_recurrence && ev.fin_recurrence < fin ? ev.fin_recurrence : fin
  if (a > b) return []
  return joursEntre(a, b).filter((d) => !exceptions.has(d) && tombeLe(regle, ev.date_debut, d))
}

/** « Chaque mardi et jeudi », « Toutes les 2 semaines, le lundi », « Le 1er lundi du mois ». */
export function decrireRegle(texte: string | null | undefined, depart: string): string {
  const r = lireRegle(texte)
  if (!r) return ''
  const liste = (noms: string[]) => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0])
  if (r.freq === 'DAILY') return r.intervalle === 1 ? 'Chaque jour' : `Tous les ${r.intervalle} jours`
  if (r.freq === 'WEEKLY') {
    const jours = [...r.jours].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
    if (r.intervalle === 1) return jours.length === 7 ? 'Chaque jour' : `Chaque ${liste(jours.map((j) => NOMS_JOURS[j]))}`
    return `Toutes les ${r.intervalle} semaines, les ${liste(jours.map((j) => PLURIELS_JOURS[j]))}`
  }
  const quand = r.rang ? `le ${RANGS[String(r.rang.n)]} ${NOMS_JOURS[r.rang.jour]}` : `le ${depuisIso(depart).getDate()}`
  return r.intervalle === 1 ? `Chaque mois, ${quand}` : `Tous les ${r.intervalle} mois, ${quand}`
}

/** Prochaine occurrence à partir de ce jour (au plus un an plus loin). */
export function prochaine(ev: Pick<Evenement, 'date_debut' | 'date_fin' | 'regle_recurrence' | 'fin_recurrence' | 'exceptions'>, depuis: string): string | null {
  return occurrences(ev, depuis, ajouterJours(depuis, 400))[0] ?? null
}
