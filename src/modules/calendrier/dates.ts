// Dates du calendrier : AAAA-MM-JJ en heure locale (fonctions pures).
// Semaines du lundi au dimanche, comme l'horaire de la cuisine.

const deux = (n: number) => String(n).padStart(2, '0')

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function versIso(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/** Midi local : pas de décalage d'un jour selon le fuseau. */
export function depuisIso(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

export const aujourdhui = () => versIso(new Date())

export const estIso = (t: string | null | undefined): t is string => !!t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(depuisIso(t).getTime())

export function ajouterJours(iso: string, n: number): string {
  const d = depuisIso(iso)
  d.setDate(d.getDate() + n)
  return versIso(d)
}

export function ajouterMois(iso: string, n: number): string {
  const d = depuisIso(iso)
  const jour = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(jour, joursDansMois(d.getFullYear(), d.getMonth())))
  return versIso(d)
}

export const joursDansMois = (annee: number, mois: number) => new Date(annee, mois + 1, 0).getDate()

/** 0 = dimanche … 6 = samedi */
export const jourSemaine = (iso: string) => depuisIso(iso).getDay()

export function lundiDe(iso: string): string {
  return ajouterJours(iso, -((jourSemaine(iso) + 6) % 7))
}

export function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = []
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) jours.push(d)
  return jours
}

/** Nombre de jours de a à b (b − a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((depuisIso(b).getTime() - depuisIso(a).getTime()) / 86400000)
}

export const semaine = (iso: string) => joursEntre(lundiDe(iso), ajouterJours(lundiDe(iso), 6))

/** Grille d'un mois : semaines complètes (lundi → dimanche) qui couvrent le mois. */
export function grilleMois(iso: string): string[] {
  const d = depuisIso(iso)
  const premier = versIso(new Date(d.getFullYear(), d.getMonth(), 1, 12))
  const dernier = versIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))
  return joursEntre(lundiDe(premier), ajouterJours(lundiDe(dernier), 6))
}

/** « dimanche 4 octobre 2026 » */
export function dateLongue(iso: string): string {
  const d = depuisIso(iso)
  return `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

/** « 4 oct. » */
export function dateCourte(iso: string): string {
  const d = depuisIso(iso)
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`
}

/** « lun. 4 » */
export function jourCourt(iso: string): string {
  const d = depuisIso(iso)
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`
}

export function titreSemaine(iso: string): string {
  const lundi = lundiDe(iso)
  const dimanche = ajouterJours(lundi, 6)
  return `Semaine du ${dateCourte(lundi)} au ${dateCourte(dimanche)} ${depuisIso(dimanche).getFullYear()}`
}

export function titreMois(iso: string): string {
  const d = depuisIso(iso)
  return `${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

/** « 14:30:00 » ou « 14:30 » → « 14 h 30 » ; « 09:00 » → « 9 h » */
export function heure(h: string | null | undefined): string {
  if (!h) return ''
  const [hh, mm] = h.split(':')
  return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`
}

export function plageHeures(debut: string | null, fin: string | null): string {
  if (debut && fin) return `${heure(debut)} à ${heure(fin)}`
  if (debut) return `dès ${heure(debut)}`
  if (fin) return `jusqu'à ${heure(fin)}`
  return ''
}

export const majuscule = (t: string) => t.charAt(0).toLocaleUpperCase('fr-CA') + t.slice(1)
