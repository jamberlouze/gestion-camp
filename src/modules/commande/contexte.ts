import { createContext, useContext } from 'react'
import type { Menu } from './types'

/** Menu ouvert (planificateur, ajouts, sorties, commande, feuille de cuisine). */
export interface MenuOuvert {
  menu: Menu
  ecriture: boolean
}

export const ContexteMenu = createContext<MenuOuvert | null>(null)

export function useMenu(): MenuOuvert {
  const valeur = useContext(ContexteMenu)
  if (!valeur) throw new Error('useMenu() hors d’un menu ouvert')
  return valeur
}
