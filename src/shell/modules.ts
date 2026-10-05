import type { ModuleId } from '@/lib/types'

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
  /** Réservé aux administrateurs et à la direction : jamais offert aux coordonnateurs. */
  directionSeulement?: boolean
  /** Réservé aux administrateurs (pas même la direction), le temps d'un rodage. */
  adminSeulement?: boolean
}

/** Registre des mini-apps. Ajouter un module = une entrée ici + une route dans App.tsx. */
export const MODULES: DefinitionModule[] = [
  {
    id: 'calendrier',
    nom: 'Calendrier',
    description: 'Séjours, événements et qui travaille chaque jour',
    icone: '🗓️',
    chemin: '/calendrier',
  },
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
  {
    id: 'subventions',
    nom: 'Subventions',
    description: 'Vigie hebdomadaire, demandes, montants obtenus et reddition de compte',
    icone: '💰',
    chemin: '/subventions',
    directionSeulement: true,
    adminSeulement: true,
  },
  {
    id: 'vigie',
    nom: 'Vigie des camps',
    description: 'Prix, programmes et activités des camps compétiteurs',
    icone: '🔭',
    chemin: '/vigie',
    directionSeulement: true,
    adminSeulement: true,
  },
]
