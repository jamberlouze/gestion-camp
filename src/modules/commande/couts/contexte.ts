import { createContext, useContext } from 'react'
import type { MenuDate } from './calcul'
import type { Annee, CorrectionMenu, Facture, GroupeManuel, Poste, Salaire, Semaine } from './types'

/** Données de l'espace, lues une fois pour tous les onglets. */
export interface Couts {
  annee: Annee
  annees: Annee[]
  /** Semaines du camp de l'année choisie, par date. */
  semaines: Semaine[]
  factures: Facture[]
  salaires: Salaire[]
  postes: Poste[]
  groupes: GroupeManuel[]
  corrections: CorrectionMenu[]
  /** Menus de Cuisine datés qui touchent l'année. */
  menus: MenuDate[]
  ecriture: boolean
}

export const ContexteCouts = createContext<Couts | null>(null)
export function useCouts(): Couts {
  const c = useContext(ContexteCouts)
  if (!c) throw new Error('useCouts hors de l’espace Coût par assiette')
  return c
}
