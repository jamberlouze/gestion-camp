import type { CodePlanification, CouleurCode } from './types'

/** Couleurs des codes (classes écrites en entier pour Tailwind). */
export const CLASSES_COULEUR: Record<CouleurCode, string> = {
  vert: 'bg-foret-100 text-foret-800',
  sarcelle: 'bg-teal-100 text-teal-800',
  lime: 'bg-lime-100 text-lime-800',
  violet: 'bg-violet-100 text-violet-800',
  orange: 'bg-orange-100 text-orange-800',
  bleu: 'bg-blue-100 text-blue-800',
  brun: 'bg-amber-200 text-amber-900',
  ciel: 'bg-sky-100 text-sky-800',
  jaune: 'bg-yellow-100 text-yellow-800',
  gris: 'bg-pierre-100 text-pierre-600',
  rouge: 'bg-red-100 text-red-800',
  rose: 'bg-pink-100 text-pink-800',
}
export const classeCode = (c: Pick<CodePlanification, 'couleur'> | undefined) => (c ? (CLASSES_COULEUR[c.couleur] ?? CLASSES_COULEUR.gris) : '')
