// Périodes de paie et saisie des heures (fonctions pures).
// Dates AAAA-MM-JJ en heure locale. Une période = 14 jours, du dimanche au
// samedi ; la première du module commence le dimanche 4 octobre 2026 (même
// règle que temps.debut_periode en SQL). Le calcul des périodes, des dates
// de paie et des numéros (PP) est dans le fichier commun src/lib/periodesPaie.ts
// (aussi utilisé par le Calendrier) ; ce fichier-ci y ajoute les règles du
// module (rien avant la première période) et la saisie des heures.

import {
  DUREE_PERIODE_PAIE,
  datePaie,
  debutPeriodePaie,
  finPeriodePaie,
  libellePeriodePaie,
  numeroPeriodePaie,
  PREMIERE_PERIODE_PAIE,
} from '@/lib/periodesPaie'

export { codePeriodePaie, datePaie, numeroPeriodePaie } from '@/lib/periodesPaie'

export const PREMIERE_PERIODE = PREMIERE_PERIODE_PAIE
export const DUREE_PERIODE = DUREE_PERIODE_PAIE

const deux = (n: number) => String(n).padStart(2, '0')
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

export function versIso(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/** Midi local : pas de décalage d'un jour selon le fuseau. */
export const depuisIso = (iso: string) => new Date(`${iso}T12:00:00`)

export const aujourdhui = () => versIso(new Date())

export const estIso = (t: string | null | undefined): t is string =>
  !!t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(depuisIso(t).getTime())

export function ajouterJours(iso: string, n: number): string {
  const d = depuisIso(iso)
  d.setDate(d.getDate() + n)
  return versIso(d)
}

/** Nombre de jours de a à b (b − a). */
export const ecartJours = (a: string, b: string) => Math.round((depuisIso(b).getTime() - depuisIso(a).getTime()) / 86400000)

/** Premier jour (dimanche) de la période qui contient `iso` ; la première période pour une date antérieure. */
export function debutPeriode(iso: string): string {
  if (iso < PREMIERE_PERIODE) return PREMIERE_PERIODE
  return debutPeriodePaie(iso)
}

export const estDebutPeriode = (iso: string) => estIso(iso) && debutPeriode(iso) === iso

export const finPeriode = (debut: string) => finPeriodePaie(debut)

export const periodeSuivante = (debut: string) => ajouterJours(debut, DUREE_PERIODE)
export const periodePrecedente = (debut: string) => ajouterJours(debut, -DUREE_PERIODE)

/** Les 14 jours de la période. */
export const joursPeriode = (debut: string) => Array.from({ length: DUREE_PERIODE }, (_, i) => ajouterJours(debut, i))

/** Débuts des périodes de `de` à `a` (inclus), du plus ancien au plus récent. */
export function periodesEntre(de: string, a: string): string[] {
  const liste: string[] = []
  for (let d = debutPeriode(de); d <= a; d = periodeSuivante(d)) liste.push(d)
  return liste
}

/** « 4 oct. » ou « 4 oct. 2026 ». */
export function dateCourte(iso: string, avecAnnee = true): string {
  const d = depuisIso(iso)
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS_COURTS[d.getMonth()]}${avecAnnee ? ` ${d.getFullYear()}` : ''}`
}

/**
 * Numéro et dates, partout où une période paraît (comme Employeur D) :
 * « PP21 · 4 au 17 oct. 2026 », « PP23 · 1er au 14 nov. 2026 »,
 * « PP1 · 27 déc. 2026 au 9 janv. 2027 ».
 */
export const libellePeriode = (debut: string) => libellePeriodePaie(debut, { annee: true })

/** « PP21 · 2026 » : numéro et année de paie (export CSV, comme Employeur D). */
export function codeAnneePeriode(debut: string): string {
  const { numero, annee } = numeroPeriodePaie(debut)
  return `PP${numero} · ${annee}`
}

/** « paie du jeu. 22 oct. » */
export const libellePaie = (debut: string) => `paie du ${JOURS_COURTS[depuisIso(datePaie(debut)).getDay()]} ${dateCourte(datePaie(debut), false)}`

/** « lun. 5 » */
export function jourCourt(iso: string): string {
  const d = depuisIso(iso)
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`
}

// ------------------------------------------------------------------
// Heures
// ------------------------------------------------------------------

/**
 * banque : anciennes heures prises dans la banque, saisies à la main ; plus
 * de ligne pour en saisir (2026-10-20) : le manque d'une période est tiré
 * tout seul de la banque (banques.ts).
 */
export type TypeHeures = 'regulieres' | 'vacances' | 'maladie' | 'banque'

/** Rangées de la feuille de la direction. */
export const TYPES: { id: TypeHeures; libelle: string }[] = [
  { id: 'regulieres', libelle: 'Régulières' },
  { id: 'vacances', libelle: 'Vacances' },
  { id: 'maladie', libelle: 'Maladie' },
]

/**
 * Lit une saisie : « 7 », « 7,5 », « 7.5 », « 7h30 », « 7:30 », « 7 h ».
 * Vide → null (case effacée) ; « 0 » est gardé et affiché (journée remplie,
 * sans heures : pas un oubli). Au quart d'heure près, au plus 24.
 */
export function lireHeures(texte: string): { heures: number | null } | { erreur: string } {
  const t = texte.trim().toLowerCase().replace(/\s+/g, '')
  if (t === '') return { heures: null }
  let n: number
  const hm = /^(\d{1,2})(?:h|:)(\d{1,2})?$/.exec(t)
  if (hm) {
    const minutes = Number(hm[2] ?? 0)
    if (minutes >= 60) return { erreur: 'Minutes invalides.' }
    n = Number(hm[1]) + minutes / 60
  } else if (/^\d{0,2}([.,]\d{1,2})?$/.test(t)) {
    n = Number(t.replace(',', '.'))
  } else {
    return { erreur: 'Nombre d’heures invalide (ex. 7,5 ou 7h30).' }
  }
  if (!Number.isFinite(n)) return { erreur: 'Nombre d’heures invalide.' }
  if (n > 24) return { erreur: 'Au plus 24 heures par jour.' }
  if (Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return { erreur: 'Au quart d’heure près (ex. 7,25 ou 7h15).' }
  return { heures: Math.round(n * 4) / 4 }
}

/** 7.5 → « 7,5 » ; 7.25 → « 7,25 » ; 0 → « 0 ». */
export function formatHeures(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('fr-CA', { maximumFractionDigits: 2 })
}
