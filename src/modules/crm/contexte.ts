import { createContext, useContext } from 'react'
import type { Profil } from '@/lib/types'
import type { Calcul } from './calculs'
import type { Conseiller, Contact, Echange, Regle, Relance, Sejour, Visite } from './types'

// Données communes du module (chargées une fois par index.tsx).
export interface Donnees {
  /** Une fiche calculée par organisation (statut, jours inactifs…), triée par nom. */
  calculs: Calcul[]
  parId: Map<string, Calcul>
  contacts: Contact[]
  echanges: Echange[]
  visites: Visite[]
  relances: Relance[]
  regles: Regle[]
  sejours: Sejour[]
  conseillers: Conseiller[]
  nomConseiller: (id: string | null) => string | null
  ecriture: boolean
  moi: Profil
  auj: string
}

export const ContexteCrm = createContext<Donnees | null>(null)

export function useDonnees() {
  const d = useContext(ContexteCrm)
  if (!d) throw new Error('useDonnees hors du module CRM')
  return d
}
