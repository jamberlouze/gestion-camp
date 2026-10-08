// Formatage (argent, dates, libellés) et petites aides partagées du module.
import { ETAPES, FORFAITS, VARIANTES, type Reservation } from './types'

const fmtArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })
/** « 1 234,56 $ » */
export const argent = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmtArgent.format(Number(n)))

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 13 mai 2027 » */
export function dateLongue(jour: string | null | undefined) {
  if (!jour) return '—'
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number)
  return `${j} ${MOIS[m - 1]} ${a}`
}

/** « 13 mai » (avec l'année si elle diffère de `auj`). */
export function dateCourte(jour: string, auj?: string) {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number)
  return `${j} ${MOIS_COURTS[m - 1]}${auj && auj.slice(0, 4) !== String(a) ? ` ${a}` : ''}`
}

/** « 13 – 14 mai 2027 », « 30 avr. – 2 mai 2027 », « 21 oct. 2026 » */
export function periode(r: Pick<Reservation, 'date_arrivee' | 'date_depart'>) {
  if (r.date_arrivee === r.date_depart) return dateLongue(r.date_arrivee)
  const [a1, m1, j1] = r.date_arrivee.split('-').map(Number)
  const [a2, m2, j2] = r.date_depart.split('-').map(Number)
  if (a1 === a2 && m1 === m2) return `${j1} – ${j2} ${MOIS[m2 - 1]} ${a2}`
  if (a1 === a2) return `${j1} ${MOIS_COURTS[m1 - 1]} – ${j2} ${MOIS_COURTS[m2 - 1]} ${a2}`
  return `${dateCourte(r.date_arrivee)} ${a1} – ${dateCourte(r.date_depart)} ${a2}`
}

/** « 10h00 » (format des documents). */
export const heure = (h: string | null | undefined) => (h ? h.slice(0, 5).replace(':', 'h') : '')

export function nomForfait(r: Pick<Reservation, 'forfait' | 'variante'>) {
  const v = VARIANTES[r.forfait].find((x) => x.valeur === r.variante)
  if (r.forfait === 'classe_nature' && v) return v.libelle
  return FORFAITS[r.forfait] + (v && r.forfait === 'location_salle' ? ` · ${v.libelle.split(' (')[0]}` : '')
}

export const nomEtape = (e: Reservation['etape']) => ETAPES.find((x) => x.valeur === e)?.libelle ?? e


export const champPetit = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800 disabled:bg-pierre-50'

/** Texte comparable : sans accents, tirets ni mots courants (« École », « Collège »…). */
export function normaliser(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ecole|college|cegep|secondaire|primaire|l'|la|le|les|de|du|des)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
