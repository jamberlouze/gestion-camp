import type { ResumeHoraire } from './donnees'
import type { Dossier } from './types'

// ------------------------------------------------------------------
// Emplacements : une semaine est dans un dossier ou « sans dossier » ;
// les modèles sont à part. Un nom est unique dans son emplacement.
// ------------------------------------------------------------------

export const dossierDe = (h: ResumeHoraire) => (h.modele ? null : (h.dossier_id ?? null))
export const nomsDans = (liste: ResumeHoraire[], modele: boolean, dossier: string | null) =>
  liste.filter((h) => !!h.modele === modele && (modele || dossierDe(h) === dossier)).map((h) => h.nom)

/** Premier « Semaine N » libre, comme l'ancien créateur. */
export function nomSemaineLibre(pris: string[]) {
  let n = 1
  while (pris.includes(`Semaine ${n}`)) n++
  return `Semaine ${n}`
}

export function nomLibre(base: string, pris: string[]) {
  if (!pris.includes(base)) return base
  let i = 2
  while (pris.includes(`${base} ${i}`)) i++
  return `${base} ${i}`
}

/** Demande de création : semaine ou modèle, point de départ, dossier proposé. */
export interface DemandeNouvel {
  modele: boolean
  depart?: string
  dossier?: string | null
}

/** Dossiers (par nom), puis « Sans dossier », puis les modèles. */
export function grouper(liste: ResumeHoraire[], dossiers: Dossier[]) {
  const connus = new Set(dossiers.map((d) => d.id))
  const semaines = liste.filter((h) => !h.modele)
  return [
    ...dossiers.map((d) => ({ cle: d.id, titre: d.nom, dossier: d as Dossier | null, modeles: false, horaires: semaines.filter((h) => h.dossier_id === d.id) })),
    {
      cle: 'sans-dossier',
      titre: 'Sans dossier',
      dossier: null,
      modeles: false,
      horaires: semaines.filter((h) => !h.dossier_id || !connus.has(h.dossier_id)),
    },
    { cle: 'modeles', titre: 'Modèles', dossier: null, modeles: true, horaires: liste.filter((h) => h.modele) },
  ]
}
