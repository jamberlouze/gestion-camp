import type { ModuleId } from '@/lib/types'

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
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
    nom: 'Cuisine',
    description: 'Menus, commande, feuille de cuisine et horaire du personnel',
    icone: '🍳',
    chemin: '/cuisine',
  },
  {
    id: 'horaire',
    nom: 'Horaire',
    description: 'Horaire des groupes et des animateurs',
    icone: '🧩',
    chemin: '/horaire',
  },
  {
    id: 'mastertimeline',
    nom: 'Mastertimeline',
    description: "Tâches de l'année, toutes entreprises",
    icone: '📆',
    chemin: '/mastertimeline',
  },
]
