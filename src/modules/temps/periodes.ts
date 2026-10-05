// Périodes de paie et saisie des heures (fonctions pures).
// Dates AAAA-MM-JJ en heure locale. Une période = 14 jours, du dimanche au
// samedi ; la première commence le dimanche 4 octobre 2026 (même règle que
// temps.debut_periode en SQL).

export const PREMIERE_PERIODE = '2026-10-04'
export const DUREE_PERIODE = 14

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
  return ajouterJours(PREMIERE_PERIODE, Math.floor(ecartJours(PREMIERE_PERIODE, iso) / DUREE_PERIODE) * DUREE_PERIODE)
}

export const estDebutPeriode = (iso: string) => estIso(iso) && debutPeriode(iso) === iso

export const finPeriode = (debut: string) => ajouterJours(debut, DUREE_PERIODE - 1)

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
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${avecAnnee ? ` ${d.getFullYear()}` : ''}`
}

/** « 4 au 17 oct. 2026 », « 25 oct. au 7 nov. 2026 », « 27 déc. 2026 au 9 janv. 2027 ». */
export function libellePeriode(debut: string): string {
  const fin = finPeriode(debut)
  const a = depuisIso(debut)
  const b = depuisIso(fin)
  if (a.getFullYear() !== b.getFullYear()) return `${dateCourte(debut, true)} au ${dateCourte(fin, true)}`
  if (a.getMonth() !== b.getMonth()) return `${dateCourte(debut, false)} au ${dateCourte(fin, true)}`
  return `${a.getDate()} au ${dateCourte(fin, true)}`
}

/** « lun. 5 » */
export function jourCourt(iso: string): string {
  const d = depuisIso(iso)
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`
}

// ------------------------------------------------------------------
// Heures
// ------------------------------------------------------------------

export type TypeHeures = 'regulieres' | 'vacances' | 'maladie'

export const TYPES: { id: TypeHeures; libelle: string }[] = [
  { id: 'regulieres', libelle: 'Régulières' },
  { id: 'vacances', libelle: 'Vacances' },
  { id: 'maladie', libelle: 'Maladie' },
]

/**
 * Lit une saisie : « 7 », « 7,5 », « 7.5 », « 7h30 », « 7:30 », « 7 h ».
 * Vide ou zéro → null (rien ce jour-là). Au quart d'heure près, au plus 24.
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
  if (n === 0) return { heures: null }
  if (n > 24) return { erreur: 'Au plus 24 heures par jour.' }
  if (Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return { erreur: 'Au quart d’heure près (ex. 7,25 ou 7h15).' }
  return { heures: Math.round(n * 4) / 4 }
}

/** 7.5 → « 7,5 » ; 7.25 → « 7,25 » ; 0 → « 0 ». */
export function formatHeures(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('fr-CA', { maximumFractionDigits: 2 })
}
