import { libelleJour } from './calcul'
import type { Dossier, Menu } from './types'

// ------------------------------------------------------------------
// Emplacements : un menu est dans un dossier ou « sans dossier » ; les
// modèles sont à part. Un nom est unique dans son emplacement (comme la
// contrainte menus_nom_unique de la base).
// ------------------------------------------------------------------

export const dossierDe = (m: Menu) => (m.modele ? null : (m.dossier_id ?? null))
export const nomsDans = (menus: Menu[], modele: boolean, dossier: string | null) =>
  menus.filter((m) => m.modele === modele && (modele || dossierDe(m) === dossier)).map((m) => m.nom)

/** Premier « Menu N » libre. */
export function nomMenuLibre(pris: string[]) {
  let n = 1
  while (pris.includes(`Menu ${n}`)) n++
  return `Menu ${n}`
}

export function nomLibre(base: string, pris: string[]) {
  if (!pris.includes(base)) return base
  let i = 2
  while (pris.includes(`${base} ${i}`)) i++
  return `${base} ${i}`
}

/** Demande de création : menu ou modèle, point de départ, dossier proposé. */
export interface DemandeNouveau {
  modele: boolean
  depart?: string
  dossier?: string | null
}

/** Dossiers (par nom), puis « Sans dossier », puis les modèles. */
export function grouper(menus: Menu[], dossiers: Dossier[]) {
  const connus = new Set(dossiers.map((d) => d.id))
  const ordinaires = menus.filter((m) => !m.modele)
  return [
    ...dossiers.map((d) => ({ cle: d.id, titre: d.nom, dossier: d as Dossier | null, modeles: false, menus: ordinaires.filter((m) => m.dossier_id === d.id) })),
    {
      cle: 'sans-dossier',
      titre: 'Sans dossier',
      dossier: null,
      modeles: false,
      menus: ordinaires.filter((m) => !m.dossier_id || !connus.has(m.dossier_id)),
    },
    { cle: 'modeles', titre: 'Modèles', dossier: null, modeles: true, menus: menus.filter((m) => m.modele) },
  ]
}

// ------------------------------------------------------------------
// Jours d'un menu
// ------------------------------------------------------------------

export const nombreJours = (n: number) => `${n} jour${n > 1 ? 's' : ''}`

/**
 * « 7 jours · du Lun 5 oct au Dim 11 oct », ou « 7 jours (Jour 1 à Jour 7) »
 * quand le menu n'a pas de date de début.
 */
export function resumeMenu({ jours, debut }: Pick<Menu, 'jours' | 'debut'>) {
  const premier = libelleJour(0, debut)
  const dernier = libelleJour(jours - 1, debut)
  if (debut) return `${nombreJours(jours)} · ${jours > 1 ? `du ${premier} au ${dernier}` : premier}`
  return `${nombreJours(jours)} (${jours > 1 ? `${premier} à ${dernier}` : premier})`
}
