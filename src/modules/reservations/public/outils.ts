import type { Langue } from '../demande'

// Outils des pages publiques : langue, montants, dates. Le choix de la
// langue (?lang=en, bouton FR/EN) vient du socle commun.
export { useLangue } from '@/lib/public/langue'

/** Langue d'un groupe (« Anglais », « English »…) → langue des pages. */
export const langueDuGroupe = (langue: string | null | undefined): Langue => (/^(anglais|english)$/i.test(langue?.trim() ?? '') ? 'en' : 'fr')

/** Montant en dollars selon la langue. */
export const dollars = (n: number | string | null | undefined, langue: Langue) =>
  new Intl.NumberFormat(langue === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n ?? 0))

/** Date longue selon la langue (jour civil, sans fuseau). */
export const dateLisible = (jour: string, langue: Langue) =>
  new Intl.DateTimeFormat(langue === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${jour}T00:00:00Z`))

/** Jour civil à Montréal d'un horodatage de la base (« …T00:30:00+00:00 » le 22 → le 21 au soir). */
export const jourMontreal = (horodatage: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(horodatage))
