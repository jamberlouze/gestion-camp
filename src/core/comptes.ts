// Qui peut créer quel compte (page Utilisateurs et Worker, utilisateurs/api.js) :
// un admin donne n'importe quel rôle ; la direction, Terrain ou Coordonnateur
// seulement (demande de Maxime du 2026-10-22). Pur : le Worker l'importe aussi.

import type { Role } from '../lib/types.ts'

const TOUS: Role[] = ['admin', 'direction', 'coordo', 'terrain', 'developpeur']

/** Rôles qu'une personne de ce rôle peut donner à un nouveau compte (vide = ne crée pas de compte). */
export function rolesCreables(role: string | null | undefined): Role[] {
  if (role === 'admin') return TOUS
  if (role === 'direction') return ['coordo', 'terrain']
  return []
}
