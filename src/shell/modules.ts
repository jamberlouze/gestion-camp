import type { ModuleId } from '@/lib/types'

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
  /** Utilise toute la largeur de l'écran (grandes grilles). */
  pleineLargeur?: boolean
}

/** Registre des mini-apps. Ajouter un module = une entrée ici + une route dans App.tsx. */
export const MODULES: DefinitionModule[] = [
  {
    id: 'embarcations',
    nom: 'Embarcations',
    description: 'État de la flotte et réparations',
    icone: '🚣',
    chemin: '/embarcations',
  },
  {
    id: 'commande',
    nom: 'Commande',
    description: 'Menus, recettes et commande Colabor',
    icone: '🛒',
    chemin: '/commande',
  },
  {
    id: 'horaire',
    nom: 'Horaire',
    description: 'Horaire des groupes et des animateurs',
    icone: '🗓️',
    chemin: '/horaire',
    pleineLargeur: true,
  },
]
