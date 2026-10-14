import type { FamilleId } from './modules'

/** Une entrée du menu : un module, ou Référentiel / Utilisateurs (rangée du bas). */
export interface Entree {
  chemin: string
  nom: string
  icone: string
  famille: FamilleId
  /** Module caché à tous sauf les admins (`cacheSaufAdmins`) : grisé et marqué « admins ». */
  cache?: boolean
}

/** Page ouverte dans ce module (ou une de ses sous-pages : Cuisine › Coût par assiette = Cuisine). */
export const estCourante = (e: Entree, pathname: string) => pathname === e.chemin || pathname.startsWith(`${e.chemin}/`)
