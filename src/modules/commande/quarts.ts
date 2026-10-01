// Horaire du personnel de cuisine — fonctions pures (dates et heures).
// Une case contient le texte tel qu'écrit dans l'ancienne feuille Google :
// « 6h30 à 14h30 », « 9h à 19h », « 9ish », « 12ish », « OFF », « Vacance », « - ».
// Semaines du lundi au dimanche. Dates au format AAAA-MM-JJ (heure locale).

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const deux = (n: number) => String(n).padStart(2, '0')

/** Date locale → AAAA-MM-JJ. */
export function versIso(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/** AAAA-MM-JJ → Date locale à midi (pas de décalage d'un jour selon le fuseau). */
export function depuisIso(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

export function ajouterJours(iso: string, n: number): string {
  const d = depuisIso(iso)
  d.setDate(d.getDate() + n)
  return versIso(d)
}

/** Lundi de la semaine qui contient cette date. */
export function lundiDe(iso: string): string {
  const d = depuisIso(iso)
  return ajouterJours(iso, -((d.getDay() + 6) % 7))
}

/** Les 7 dates (lundi → dimanche) de la semaine qui commence ce lundi. */
export function joursDeLaSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i))
}

/** « 28 sept. » */
export function dateCourte(iso: string): string {
  const d = depuisIso(iso)
  return `${d.getDate()} ${MOIS[d.getMonth()]}`
}

/** « Semaine du 28 sept. au 4 oct. 2026 » */
export function titreSemaine(lundi: string): string {
  const fin = ajouterJours(lundi, 6)
  return `Semaine du ${dateCourte(lundi)} au ${dateCourte(fin)} ${depuisIso(fin).getFullYear()}`
}

/** « 6h30 », « 14h », « 6:30 » → heures décimales (6,5). */
function lireHeure(h: string, m: string | undefined): number | null {
  const heures = Number(h)
  const minutes = m ? Number(m) : 0
  if (heures > 24 || minutes > 59) return null
  return heures + minutes / 60
}

// Début « 6h30 », « 6h », « 6:30 » ; fin pareille ou l'heure seule (« 6h à 14 ») ; point final toléré.
const QUART = /^\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:à|a|-|–|—|au)\s*(\d{1,2})\s*(?:(?:h|:)\s*(\d{2})?)?\s*\.?\s*$/i
/** Quart coupé : « 9h30 à 12h et 13h à 17h », « 6h30-14h30 / 17h-19h ». */
const MORCEAUX = /\s*(?:\bet\b|\+|\/|,|;)\s*/i
const APPROXIMATIF = /^\s*(\d{1,2})\s*(?:(?:h|:)\s*(\d{2})?)?\s*ish\s*$/i

/** Durée d'un seul quart chiffré, sinon null. */
function dureeQuart(texte: string): number | null {
  const m = QUART.exec(texte)
  if (!m) return null
  const debut = lireHeure(m[1], m[2])
  const fin = lireHeure(m[3], m[4])
  // Pas de quart de nuit en cuisine : une fin avant le début est une erreur
  // de frappe (« 9h à 5h » pour 17h), pas 20 heures. La case compte « ? ».
  if (debut == null || fin == null || fin <= debut) return null
  return fin - debut
}

/**
 * Durée d'un quart écrit « 6h30 à 14h30 » (aussi « 6h30-14h30 », « 6:30 à
 * 14:30 », « 11h à 19h », « 6h à 14 ») ou d'un quart coupé (« 9h30 à 12h et
 * 13h à 17h » : la somme) ; null si le texte n'est pas un quart chiffré
 * (« 9ish », « OFF », note libre, fin avant le début…). Les pauses ne sont
 * pas déduites.
 */
export function heuresQuart(texte: string): number | null {
  let total = 0
  for (const morceau of texte.split(MORCEAUX)) {
    const duree = dureeQuart(morceau)
    if (duree == null) return null
    total += duree
  }
  return total
}

const normaliser = (t: string) =>
  t
    .trim()
    .toLocaleLowerCase('fr-CA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/s$/, '')

/** Case vide ou simple tiret (« - », « -- ») : personne n'est prévu. */
export function estVide(texte: string | undefined): boolean {
  return !texte || /^[\s\-–—]*$/.test(texte)
}

/** « OFF », « Vacance(s) », « Congé »… (selon les réglages, sans tenir compte des accents ni du pluriel). */
export function estStatut(texte: string, statuts: string[]): boolean {
  const t = normaliser(texte)
  return statuts.some((s) => normaliser(s) === t)
}

/** La personne travaille ce jour-là (quart chiffré ou approximatif comme « 9ish »). */
export function travaille(texte: string | undefined, statuts: string[]): boolean {
  return !estVide(texte) && !estStatut(texte!, statuts)
}

/** Total des heures chiffrées, et nombre de jours travaillés sans heures lisibles (« 9ish »). */
export function totalHeures(textes: (string | undefined)[], statuts: string[]): { heures: number; nonChiffres: number } {
  let heures = 0
  let nonChiffres = 0
  for (const t of textes) {
    if (!travaille(t, statuts)) continue
    const h = heuresQuart(t!)
    if (h == null) nonChiffres++
    else heures += h
  }
  return { heures, nonChiffres }
}

/** « 37,5 h » */
export function formatHeures(h: number): string {
  return `${h.toLocaleString('fr-CA', { maximumFractionDigits: 2 })} h`
}

/**
 * Heure de début d'un quart (pour repérer l'ouverture) : celle du premier
 * morceau d'un quart chiffré, ou l'heure approximative (« 9ish » → 9) ; sinon null.
 */
export function debutQuart(texte: string): number | null {
  const m = QUART.exec(texte.split(MORCEAUX)[0])
  if (m) return lireHeure(m[1], m[2])
  const approximatif = APPROXIMATIF.exec(texte)
  return approximatif ? lireHeure(approximatif[1], approximatif[2]) : null
}
