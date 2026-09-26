import { createContext, useContext } from 'react'
import type { StatutEnregistrement } from './donnees'
import type { EtatSemaine, Horaire, Reglages } from './types'

export interface Semaine {
  horaire: Horaire
  etat: EtatSemaine
  /** Modifie une copie de l'état (la fonction mute la copie) ; enregistré automatiquement. */
  modifier: (fn: (e: EtatSemaine) => void) => void
  remplacer: (e: EtatSemaine) => void
  statut: StatutEnregistrement
  reessayer: () => void
  reglages: Reglages
  /** Animateurs du référentiel commun (menus déroulants). */
  animateurs: string[]
  ecriture: boolean
}

export const ContexteSemaine = createContext<Semaine | null>(null)

export function useSemaine() {
  const s = useContext(ContexteSemaine)
  if (!s) throw new Error('useSemaine doit être utilisé dans le module Horaire')
  return s
}
