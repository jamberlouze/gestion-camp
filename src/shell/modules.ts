import type { ModuleId } from '@/lib/types'

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
  /** Jamais offert aux coordonnateurs (ni par leur rôle, ni en ajout personnel). */
  directionSeulement?: boolean
  /** Pas de mode lecture seule dans l'app : la grille n'offre qu'écriture ou rien. */
  sansLecture?: boolean
  /** Accès fixe, hors de la grille d'accès par rôle (texte affiché dans la grille). */
  accesFixe?: string
}

/**
 * Registre des mini-apps. Ajouter un module = une entrée ici + une route dans App.tsx
 * (+ le module dans les contraintes de core.acces_roles et core.acces_modules).
 * Qui voit quoi : grille core.acces_roles (page Utilisateurs), sauf `accesFixe`.
 */
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
    description: 'Immatriculation, assurance, inspections et entretien',
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
    description: 'Vigie, demandes et reddition de compte',
    icone: '💰',
    chemin: '/subventions',
    directionSeulement: true,
    sansLecture: true,
  },
  {
    id: 'vigie',
    nom: 'Vigie des camps',
    description: 'Prix, programmes et activités des camps compétiteurs',
    icone: '🔭',
    chemin: '/vigie',
    directionSeulement: true,
  },
  {
    // Chacun ne voit que sa feuille ; les admins voient tout (vérifié par la
    // base : temps.role_autorise et les politiques du schéma temps).
    id: 'temps',
    nom: 'Feuilles de temps',
    description: "Saisie des heures de l'équipe de direction",
    icone: '⏱️',
    chemin: '/temps',
    directionSeulement: true,
    accesFixe: 'Chacun sa feuille, les admins voient tout. Jamais les coordonnateurs.',
  },
]
