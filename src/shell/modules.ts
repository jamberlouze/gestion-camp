import type { ModuleId } from '@/lib/types'

/**
 * Familles du menu (décision de Maxime, version B des maquettes) : une
 * rangée d'icônes par famille, dans cet ordre ; `bas` = la rangée sans
 * titre du bas (avec Référentiel et Utilisateurs, ajoutés par le Layout).
 */
export type FamilleId = 'operations' | 'batiment' | 'gestion' | 'equipe' | 'bas'

export interface DefinitionFamille {
  id: Exclude<FamilleId, 'bas'>
  nom: string
  /** Sous l'icône du menu réduit. */
  nomCourt: string
}

export const FAMILLES: DefinitionFamille[] = [
  { id: 'operations', nom: 'Opérations', nomCourt: 'Opérations' },
  { id: 'batiment', nom: 'Bâtiment et matériel', nomCourt: 'Bâtiment' },
  { id: 'gestion', nom: 'Gestion', nomCourt: 'Gestion' },
  { id: 'equipe', nom: 'Équipe', nomCourt: 'Équipe' },
]

export interface DefinitionModule {
  id: ModuleId
  nom: string
  description: string
  icone: string
  chemin: string
  /** Famille du menu ; l'ordre dans la famille = l'ordre de MODULES. */
  famille: FamilleId
  /** Pas de mode lecture seule dans l'app : la grille n'offre qu'écriture ou rien. */
  sansLecture?: boolean
  /** Accès fixe, hors de la grille d'accès par rôle (texte affiché dans la grille). */
  accesFixe?: string
  /** Réservé aux admins (avec `accesFixe` pour le texte de la grille). */
  adminsSeulement?: true
  /**
   * Caché à tous sauf les admins (menu, accueil, adresse) ; le texte dit
   * jusqu'à quand. Les droits ne changent pas : d'autres écrans (accueil,
   * Cuisine…) lisent encore ses données selon `peutLire` (`peutOuvrir` dans auth.tsx).
   */
  cacheSaufAdmins?: string
  /**
   * Partie d'un autre module (un espace de ce module, pas une entrée du menu
   * ni de l'accueil) qui a son propre accès dans la grille.
   */
  parent?: ModuleId
}

/** Modules du menu et de l'accueil (sans les parties d'un autre module). */
export const estEntree = (m: DefinitionModule) => !m.parent

/**
 * Registre des mini-apps. Ajouter un module = une entrée ici (avec sa famille,
 * à sa place dans la famille) + une route dans App.tsx (+ le module dans les
 * contraintes de core.acces_roles et core.acces_modules).
 * Qui voit quoi : grille core.acces_roles (page Utilisateurs), sauf `accesFixe`.
 * L'ordre ici = l'ordre du menu, de l'accueil et de la grille d'accès.
 */
export const MODULES: DefinitionModule[] = [
  // — Opérations —
  {
    id: 'reservations',
    nom: 'Réservations',
    description: 'Demandes de groupes, estimés, contrats et suivi',
    icone: '📒',
    chemin: '/reservations',
    famille: 'operations',
  },
  {
    // Fiches participants (allergies, diètes, médicaments) : données de
    // santé, accès propre ; admins au départ (aucune ligne dans la grille).
    // Les autres voient seulement des totaux.
    id: 'reservations_sante',
    nom: 'Réservations › Fiches participants',
    description: 'Allergies, diètes et médicaments des participants (Loi 25)',
    icone: '🩺',
    chemin: '/reservations',
    famille: 'operations',
    parent: 'reservations',
  },
  {
    id: 'crm',
    nom: 'CRM',
    description: 'Clients, démarchage et relances, liés aux réservations',
    icone: '🤝',
    chemin: '/crm',
    famille: 'operations',
  },
  {
    id: 'calendrier',
    nom: 'Calendrier',
    description: 'Séjours, événements et qui travaille chaque jour',
    icone: '🗓️',
    chemin: '/calendrier',
    famille: 'operations',
    // Décision de Maxime (2026-10-14) : les séjours viendront des Réservations.
    cacheSaufAdmins: "jusqu'à ce que les Réservations soient en place",
  },
  {
    id: 'commande',
    nom: 'Cuisine',
    description: 'Menus, commandes et horaire du personnel',
    icone: '🍳',
    chemin: '/cuisine',
    famille: 'operations',
  },
  {
    // Espace de Cuisine qui montre les salaires : admins au départ (aucune
    // ligne dans la grille), plus Frédérique en ajout personnel.
    id: 'cuisine_couts',
    nom: 'Cuisine › Coût par assiette',
    description: 'Nourriture, salaires et assiettes servies, par période',
    icone: '🧾',
    chemin: '/cuisine/couts',
    famille: 'operations',
    parent: 'commande',
  },
  {
    id: 'horaire',
    nom: 'Animation',
    description: 'Horaire des groupes et des animateurs',
    icone: '🤡',
    chemin: '/horaire',
    famille: 'operations',
  },
  {
    id: 'rooming',
    nom: 'Rooming',
    description: 'Bâtiments, lits et qui dort où',
    icone: '🛏️',
    chemin: '/rooming',
    famille: 'operations',
  },
  // — Bâtiment et matériel —
  {
    id: 'travaux',
    nom: 'Travaux',
    description: 'Réparations et tâches du terrain : signaler, trier, faire',
    icone: '🛠️',
    chemin: '/travaux',
    famille: 'batiment',
  },
  {
    id: 'batiments',
    nom: 'Bâtiments',
    description: 'Disjoncteurs et valves d’eau de chaque bâtiment',
    icone: '🏘️',
    chemin: '/batiments',
    famille: 'batiment',
  },
  {
    id: 'inventaire',
    nom: 'Inventaire',
    description: "Équipement du camp et comptage de chaque saison",
    icone: '📦',
    chemin: '/inventaire',
    famille: 'batiment',
  },
  {
    id: 'embarcations',
    nom: 'Embarcations',
    description: 'État de la flotte et réparations',
    icone: '🛶',
    chemin: '/embarcations',
    famille: 'batiment',
  },
  {
    id: 'vehicules',
    nom: 'Véhicules',
    description: 'Immatriculation, assurance, inspections et entretien',
    icone: '🚌',
    chemin: '/vehicules',
    famille: 'batiment',
  },
  // — Gestion —
  {
    id: 'mastertimeline',
    nom: 'Mastertimeline',
    description: "Tâches de l'année, toutes entreprises",
    icone: '✅',
    chemin: '/mastertimeline',
    famille: 'gestion',
  },
  {
    id: 'reunions',
    nom: 'Réunions',
    description: 'Ordre du jour de la direction et réunions spéciales',
    icone: '☕',
    chemin: '/reunions',
    famille: 'gestion',
  },
  {
    id: 'achats',
    nom: 'Achats',
    description: "Équipement à commander, commandé ou reçu",
    icone: '🛍️',
    chemin: '/achats',
    famille: 'gestion',
  },
  {
    // Admins seulement au départ (aucune ligne dans la grille).
    id: 'caisse',
    nom: 'Petite caisse',
    description: 'Argent comptant reçu et sorti, par compagnie',
    icone: '💵',
    chemin: '/petite-caisse',
    famille: 'gestion',
  },
  {
    id: 'subventions',
    nom: 'Subventions',
    description: 'Vigie, demandes et reddition de compte',
    icone: '💰',
    chemin: '/subventions',
    famille: 'gestion',
    sansLecture: true,
  },
  {
    id: 'vigie',
    nom: 'Vigie des camps',
    description: 'Prix, programmes et activités des camps compétiteurs',
    icone: '🔭',
    chemin: '/vigie',
    famille: 'gestion',
  },
  // — Équipe —
  {
    id: 'rh',
    nom: 'RH',
    description: 'Candidatures, embauches et dossiers des employés',
    icone: '👥',
    chemin: '/rh',
    famille: 'equipe',
    // Décision de Maxime du 2026-10-15 : vide jusqu'à l'import final d'Airtable.
    cacheSaufAdmins: "jusqu'à la bascule d'Airtable",
  },
  {
    // NAS, numéro de compte et spécimen de chèque : accès propre (direction
    // et admins, décision de Maxime du 2026-10-11). Chaque affichage est noté.
    id: 'rh_paie',
    nom: 'RH › Paie',
    description: 'NAS, compte bancaire et spécimen de chèque',
    icone: '🔒',
    chemin: '/rh',
    famille: 'equipe',
    parent: 'rh',
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
    famille: 'equipe',
    accesFixe:
      'Chacun sa feuille, les admins voient tout. Jamais les coordonnateurs, sauf un employé coché « Remplit sa feuille » (sa feuille seulement).',
  },
  // — Rangée du bas (avec Référentiel et Utilisateurs) —
  {
    // La liste de Maxime pour faire avancer l'app (RLS : core.est_admin).
    id: 'ameliorations',
    nom: 'Améliorations',
    description: "Nouveaux modules, fonctionnalités à ajouter et commentaires de l'équipe",
    icone: '💡',
    chemin: '/ameliorations',
    famille: 'bas',
    accesFixe: 'Admins seulement.',
    adminsSeulement: true,
  },
]
