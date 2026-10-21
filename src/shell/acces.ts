import type { AccesModule, AccesRole, ModuleId, Niveau, Role } from '@/lib/types'
import { MODULES } from './modules'

const definition = (m: ModuleId) => MODULES.find((d) => d.id === m)

/**
 * Niveau d'une personne dans un module, mêmes règles que core.niveau_module_de
 * (la base décide ; ceci ne sert qu'à l'affichage) : l'admin a tout ; sinon le
 * plus élevé entre la grille de son rôle et ses ajouts personnels. Un module à
 * accès fixe (Feuilles de temps) : admin et direction, plus l'employé qui
 * remplit sa propre feuille (`employeTemps`, quel que soit son rôle).
 */
export function niveauModule(
  role: Role | undefined,
  roles: AccesRole[],
  perso: AccesModule[],
  m: ModuleId,
  employeTemps = false,
): Niveau | null {
  if (!role) return null
  if (role === 'admin') return 'ecriture'
  const def = definition(m)
  if (def?.adminsSeulement) return null
  if (def?.accesFixe) return role === 'direction' || (m === 'temps' && employeTemps) ? 'ecriture' : null
  const niveaux = [
    ...roles.filter((r) => r.role === role && r.module === m),
    ...perso.filter((a) => a.module === m),
  ].map((x) => x.niveau)
  if (niveaux.includes('ecriture')) return 'ecriture'
  return niveaux.length ? 'lecture' : null
}

/**
 * Module réservé aux admins dans les faits (pastille « admins » du menu,
 * demande de Maxime du 2026-10-21) : à part le rôle Développeur, qui a accès à
 * tout, aucun rôle de la grille ni aucun ajout personnel n'y donne accès (ni à
 * ses parties `ouvertAussiPar`). Un module à accès fixe (Feuilles de temps)
 * n'en est pas un. `perso` = les ajouts personnels que la personne peut lire
 * (tous pour la direction, les siens pour les autres).
 */
export function reserveAuxAdmins(roles: AccesRole[], perso: Pick<AccesModule, 'module'>[], m: ModuleId): boolean {
  const def = definition(m)
  if (def?.adminsSeulement) return true
  if (def?.accesFixe) return false
  const parties = [m, ...(def?.ouvertAussiPar ?? [])]
  return !roles.some((r) => r.role !== 'developpeur' && parties.includes(r.module)) && !perso.some((a) => parties.includes(a.module))
}
