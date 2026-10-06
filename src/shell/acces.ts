import type { AccesModule, AccesRole, ModuleId, Niveau, Role } from '@/lib/types'
import { MODULES } from './modules'

const definition = (m: ModuleId) => MODULES.find((d) => d.id === m)

/**
 * Niveau d'une personne dans un module, mêmes règles que core.niveau_module_de
 * (la base décide ; ceci ne sert qu'à l'affichage) : l'admin a tout ; sinon le
 * plus élevé entre la grille de son rôle et ses ajouts personnels. Un module à
 * accès fixe (Feuilles de temps) : admin et direction.
 */
export function niveauModule(
  role: Role | undefined,
  roles: AccesRole[],
  perso: AccesModule[],
  m: ModuleId,
): Niveau | null {
  if (!role) return null
  if (role === 'admin') return 'ecriture'
  const def = definition(m)
  if (def?.accesFixe) return role === 'direction' ? 'ecriture' : null
  const niveaux = [
    ...roles.filter((r) => r.role === role && r.module === m),
    ...perso.filter((a) => a.module === m),
  ].map((x) => x.niveau)
  if (niveaux.includes('ecriture')) return 'ecriture'
  return niveaux.length ? 'lecture' : null
}
