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
    id: 'vehicules',
    nom: 'Véhicules',
    description: 'Minibus, VTT et remorques : immatriculation, assurance, inspections et entretien',
    icone: '🚌',
    chemin: '/vehicules',
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
    nom: 'Animation',
    description: 'Horaire des groupes et des animateurs',
    icone: '🤡',
    chemin: '/horaire',
  },
  {
    id: 'mastertimeline',
    nom: 'Mastertimeline',
    description: "Tâches de l'année, toutes entreprises",
    icone: '✅',
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
  {
    // Chacun ne voit que sa feuille ; les admins voient tout (vérifié par la
    // base : temps.role_autorise et les politiques du schéma temps).
    id: 'temps',
    nom: 'Feuilles de temps',
    description: 'Heures par période de paie : régulières, vacances, maladie',
    icone: '⏱️',
    chemin: '/temps',
    directionSeulement: true,
  },
]
