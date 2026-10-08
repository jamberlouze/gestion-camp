import type { ModuleId } from '@/lib/types'

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
  /** Pas de mode lecture seule dans l'app : la grille n'offre qu'écriture ou rien. */
  sansLecture?: boolean
  /** Accès fixe, hors de la grille d'accès par rôle (texte affiché dans la grille). */
  accesFixe?: string
  /** Réservé aux admins (avec `accesFixe` pour le texte de la grille). */
  adminsSeulement?: true
  /**
   * Partie d'un autre module (un espace de ce module, pas une entrée du menu
   * ni de l'accueil) qui a son propre accès dans la grille.
   */
  parent?: ModuleId
}

/** Modules du menu et de l'accueil (sans les parties d'un autre module). */
export const estEntree = (m: DefinitionModule) => !m.parent

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
    icone: '🛶',
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
    id: 'travaux',
    nom: 'Travaux',
    description: 'Réparations et tâches du terrain : signaler, trier, faire',
    icone: '🛠️',
    chemin: '/travaux',
  },
  {
    id: 'rooming',
    nom: 'Rooming',
    description: 'Bâtiments, lits et qui dort où',
    icone: '🛏️',
    chemin: '/rooming',
  },
  {
    id: 'commande',
    nom: 'Cuisine',
    description: 'Menus, commandes et horaire du personnel',
    icone: '🍳',
    chemin: '/cuisine',
  },
  {
    // Espace de Cuisine qui montre les salaires : admins au départ (aucune
    // ligne dans la grille), plus Frédérique en ajout personnel.
    id: 'cuisine_couts',
    nom: 'Cuisine › Coût par assiette',
    description: 'Nourriture, salaires et assiettes servies, par période',
    icone: '🧾',
    chemin: '/cuisine/couts',
    parent: 'commande',
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
    id: 'achats',
    nom: 'Achats',
    description: "Équipement à commander, commandé ou reçu",
    icone: '🛍️',
    chemin: '/achats',
  },
  {
    // Admins seulement au départ (aucune ligne dans la grille).
    id: 'caisse',
    nom: 'Petite caisse',
    description: 'Argent comptant reçu et sorti, par compagnie',
    icone: '💵',
    chemin: '/petite-caisse',
  },
  {
    id: 'subventions',
    nom: 'Subventions',
    description: 'Vigie, demandes et reddition de compte',
    icone: '💰',
    chemin: '/subventions',
    sansLecture: true,
  },
  {
    id: 'vigie',
    nom: 'Vigie des camps',
    description: 'Prix, programmes et activités des camps compétiteurs',
    icone: '🔭',
    chemin: '/vigie',
  },
  {
    // Chacun ne voit que sa feuille ; les admins voient tout (vérifié par la
    // base : temps.role_autorise, temps.mon_employe et les politiques du
    // schéma temps). Un employé coché « Remplit sa feuille » dans le
    // référentiel y entre aussi, pour sa feuille seulement.
    id: 'temps',
    nom: 'Feuilles de temps',
    description: 'Saisie et approbation des heures',
    icone: '⏱️',
    chemin: '/temps',
    accesFixe:
      'Chacun sa feuille, les admins voient tout. Jamais les coordonnateurs, sauf un employé coché « Remplit sa feuille » (sa feuille seulement).',
  },
  {
    // La liste de Maxime pour faire avancer l'app (RLS : core.est_admin).
    id: 'ameliorations',
    nom: 'Améliorations',
    description: "Nouveaux modules, fonctionnalités à ajouter et commentaires de l'équipe",
    icone: '💡',
    chemin: '/ameliorations',
    accesFixe: 'Admins seulement.',
    adminsSeulement: true,
  },
  {
    id: 'reunions',
    nom: 'Réunions',
    description: 'Ordre du jour de la direction et réunions spéciales',
    icone: '☕',
    chemin: '/reunions',
  },
]
