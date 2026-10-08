import type { Point, Recurrent } from './types'

// Fonctions pures du module (dates en AAAA-MM-JJ, jour de Montréal).

const enDate = (jour: string) => new Date(`${jour}T12:00:00Z`)
const enJour = (d: Date) => d.toISOString().slice(0, 10)

export function ajouterJours(jour: string, n: number): string {
  const d = enDate(jour)
  d.setUTCDate(d.getUTCDate() + n)
  return enJour(d)
}

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export const jourSemaine = (jour: string) => enDate(jour).getUTCDay() || 7

/** Lundi de la semaine du jour. */
export const lundi = (jour: string) => ajouterJours(jour, 1 - jourSemaine(jour))

export const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
export const INITIALES_JOURS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D']

/** « mercredi 7 octobre » (avec l'année si elle n'est pas celle d'aujourd'hui). */
export function jourLisible(jour: string, aujourdhui?: string, sansJour?: boolean): string {
  const annee = aujourdhui && jour.slice(0, 4) !== aujourdhui.slice(0, 4)
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'UTC',
    weekday: sansJour ? undefined : 'long',
    day: 'numeric',
    month: 'long',
    year: annee ? 'numeric' : undefined,
  }).format(enDate(jour))
}

/** Jour de Montréal d'un horodatage. */
export const jourDe = (horodatage: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(horodatage))

export const normaliser = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Initiales d'un nom (« Julie Tremblay » → « JT »). */
export function initiales(nom: string | null): string {
  if (!nom) return '?'
  const mots = nom.trim().split(/[\s-]+/).filter(Boolean)
  return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? ''))).toUpperCase()
}

const TEINTES = [
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
]

/** Teinte stable d'une personne (même nom = même couleur partout). */
export function teinte(nom: string | null): string {
  let h = 0
  for (const c of nom ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES[h % TEINTES.length]
}

/**
 * Jours de réunion du quotidien : jour → heure du dernier point traité ce
 * jour-là (un jour sans point traité = pas de réunion).
 */
export function joursDeReunion(points: Point[]): Map<string, string> {
  const jours = new Map<string, string>()
  for (const p of points) {
    if (p.reunion_id || p.statut !== 'traite' || !p.traite_jour || !p.traite_le) continue
    const avant = jours.get(p.traite_jour)
    if (!avant || p.traite_le > avant) jours.set(p.traite_jour, p.traite_le)
  }
  return jours
}

/**
 * Nombre de réunions passées où un point du quotidien était à l'ordre du
 * jour sans être traité : ajouté avant la fin de la réunion et encore
 * ouvert après. La réunion d'aujourd'hui ne
 * compte pas (elle n'est peut-être pas finie).
 */
export function reports(p: Point, jours: Map<string, string>, aujourdhui: string): number {
  if (p.reunion_id) return 0
  let n = 0
  for (const [jour, fin] of jours) {
    if (jour >= aujourdhui || p.created_at >= fin) continue
    if (p.traite_jour && p.traite_jour <= jour) continue
    n++
  }
  return n
}

/**
 * Points fixes à montrer aujourd'hui : ceux du jour (pas encore traités
 * aujourd'hui) et ceux de la semaine (pas encore traités cette semaine).
 */
export function recurrentsDuJour(recurrents: Recurrent[], points: Point[], aujourdhui: string): Recurrent[] {
  const debut = lundi(aujourdhui)
  const dow = jourSemaine(aujourdhui)
  return recurrents
    .filter((r) => r.actif)
    .filter((r) => {
      const faits = points.filter((p) => p.recurrent_id === r.id && p.traite_jour)
      if (r.jours.length) return r.jours.includes(dow) && !faits.some((p) => p.traite_jour === aujourdhui)
      return !faits.some((p) => p.traite_jour! >= debut && p.traite_jour! <= aujourdhui)
    })
    .sort((a, b) => a.ordre - b.ordre || a.texte.localeCompare(b.texte, 'fr'))
}

export function descriptionJours(jours: number[]): string {
  if (!jours.length) return 'Une fois par semaine'
  const tries = [...jours].sort()
  if (tries.join() === '1,2,3,4,5') return 'Chaque jour de semaine'
  return 'Le ' + tries.map((j) => NOMS_JOURS[j - 1]).join(', ')
}
