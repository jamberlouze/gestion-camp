import type { Inspection, TypeVehicule, Vehicule } from './types'

/** Une échéance à moins de ce nombre de jours est signalée. */
export const SEUIL_JOURS = 30

/** Intervalle proposé pour la prochaine inspection (mécanique : au 6 mois si pas remisé). */
export const MOIS_ENTRE_INSPECTIONS = 6

export type EtatEcheance = 'depassee' | 'bientot' | 'ok' | 'aucune'

/** Date du jour, heure locale, au format AAAA-MM-JJ. */
export function aujourdhui(maintenant = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}`
}

const enJours = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000

/** Jours entre aujourd'hui et la date (négatif = passée). */
export const joursRestants = (date: string, jour: string) => enJours(date) - enJours(jour)

/** Ajoute des mois ; un 31 sans équivalent devient le dernier jour du mois. */
export function ajouterMois(date: string, mois: number) {
  const a = +date.slice(0, 4)
  const m = +date.slice(5, 7) - 1 + mois
  const d = +date.slice(8, 10)
  const fin = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m, Math.min(d, fin))).toISOString().slice(0, 10)
}

export function etatEcheance(date: string | null, jour: string): EtatEcheance {
  if (!date) return 'aucune'
  const reste = joursRestants(date, jour)
  if (reste < 0) return 'depassee'
  return reste <= SEUIL_JOURS ? 'bientot' : 'ok'
}

/** Échéance de la prochaine inspection : celle notée à la plus récente. */
export function prochaineInspection(inspections: Inspection[]) {
  let derniere: Inspection | null = null
  for (const i of inspections) if (!derniere || i.date > derniere.date) derniere = i
  return derniere?.prochaine ?? null
}

/** Inspections par véhicule, la plus récente en premier. */
export function parVehicule<T extends { vehicule_id: string; date: string }>(lignes: T[]) {
  const index = new Map<string, T[]>()
  for (const l of lignes) {
    const liste = index.get(l.vehicule_id)
    if (liste) liste.push(l)
    else index.set(l.vehicule_id, [l])
  }
  for (const liste of index.values()) liste.sort((a, b) => b.date.localeCompare(a.date))
  return index
}

export type Quoi = 'immatriculation' | 'assurance' | 'inspection'

export const LIBELLES_QUOI: Record<Quoi, string> = {
  immatriculation: 'Immatriculation',
  assurance: 'Assurance',
  inspection: 'Inspection',
}

export interface Echeance {
  vehicule: Vehicule
  quoi: Quoi
  date: string | null
  etat: EtatEcheance
}

/** Les trois échéances d'un véhicule. */
export function echeancesDe(v: Vehicule, inspections: Inspection[], jour: string): Echeance[] {
  const dates: [Quoi, string | null][] = [
    ['immatriculation', v.immatriculation_echeance],
    ['assurance', v.assurance_echeance],
    ['inspection', prochaineInspection(inspections)],
  ]
  return dates.map(([quoi, date]) => ({ vehicule: v, quoi, date, etat: etatEcheance(date, jour) }))
}

/**
 * Échéances dépassées ou proches des véhicules en circulation, la plus
 * pressante en premier. Un véhicule remisé n'est ni immatriculé pour la
 * route ni assuré : rien à signaler.
 */
export function aSurveiller(vehicules: Vehicule[], inspections: Map<string, Inspection[]>, jour: string) {
  return vehicules
    .filter((v) => v.statut === 'en_circulation')
    .flatMap((v) => echeancesDe(v, inspections.get(v.id) ?? [], jour))
    .filter((e) => e.etat === 'depassee' || e.etat === 'bientot')
    .sort((a, b) => a.date!.localeCompare(b.date!) || a.vehicule.surnom.localeCompare(b.vehicule.surnom, 'fr'))
}

const formatJour = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** « 12 oct. 2026 » (date AAAA-MM-JJ). */
export const dateLisible = (iso: string | null) => (iso ? formatJour.format(new Date(iso + 'T00:00:00Z')) : '—')

/** « dans 12 jours », « aujourd'hui », « depuis 3 jours ». */
export function delaiLisible(date: string, jour: string) {
  const n = joursRestants(date, jour)
  if (n === 0) return "aujourd'hui"
  if (n === 1) return 'demain'
  if (n === -1) return 'depuis hier'
  return n > 0 ? `dans ${n} jours` : `depuis ${-n} jours`
}

const formatArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })
export const argent = (n: number | null) => (n == null ? '' : formatArgent.format(n))

/** Unité du compteur : kilomètres pour un minibus ou une voiture, heures pour un VTT. */
export function uniteCompteur(type: TypeVehicule): 'km' | 'h' | null {
  if (type === 'minibus' || type === 'voiture' || type === 'autre') return 'km'
  if (type === 'vtt') return 'h'
  return null
}

export const compteurLisible = (n: number | null, type: TypeVehicule) =>
  n == null ? '' : `${new Intl.NumberFormat('fr-CA').format(n)} ${uniteCompteur(type) ?? ''}`.trim()

/** Texte saisi → nombre (virgule décimale acceptée) ; vide → null ; illisible → undefined. */
export function lireNombre(texte: string): number | null | undefined {
  const propre = texte.replace(/\s/g, '').replace(',', '.').replace(/\$$/, '')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? n : undefined
}

/** Tri de la flotte : par type (ordre de TYPES), puis ordre, puis surnom. */
export function trierFlotte(vehicules: Vehicule[]) {
  const rang: Record<TypeVehicule, number> = { minibus: 0, voiture: 1, vtt: 2, remorque: 3, autre: 4 }
  return [...vehicules].sort(
    (a, b) => rang[a.type] - rang[b.type] || a.ordre - b.ordre || a.surnom.localeCompare(b.surnom, 'fr'),
  )
}
