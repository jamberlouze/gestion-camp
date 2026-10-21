export const SECTEURS = ['direction', 'cuisine', 'animation', 'terrain'] as const
export type Secteur = (typeof SECTEURS)[number]

export const META_SECTEUR: Record<Secteur, { libelle: string; pastille: string; clair: string }> = {
  direction: { libelle: 'Direction', pastille: 'bg-sky-600', clair: 'bg-sky-50 text-sky-900' },
  cuisine: { libelle: 'Cuisine', pastille: 'bg-amber-500', clair: 'bg-amber-50 text-amber-900' },
  animation: { libelle: 'Animation', pastille: 'bg-foret-600', clair: 'bg-foret-50 text-foret-800' },
  terrain: { libelle: 'Terrain', pastille: 'bg-stone-500', clair: 'bg-stone-100 text-stone-800' },
}

/**
 * Secteurs de la liste propre au module : la cuisine vient du module Cuisine,
 * l'animation du module Animation.
 */
export const SECTEURS_PERSONNEL = ['direction', 'terrain'] as const
export type SecteurPersonnel = (typeof SECTEURS_PERSONNEL)[number]

interface Trace {
  updated_by: string | null
  updated_at: string
  deleted_at: string | null
}

export interface Personne extends Trace {
  id: string
  nom: string
  /** null : secteur à préciser (Réglages). */
  secteur_principal: SecteurPersonnel | null
  actif: boolean
  ordre: number
  notes: string | null
  /** Courriel du compte (minuscules) : « + » choisit d'office la personne connectée. */
  courriel: string | null
  /** Aussi à l'horaire de cuisine (commande.personnel) : Cuisine › Horaire lit ses journées. */
  personne_cuisine_id: string | null
}

/**
 * Choix rapide de l'horaire de la direction (null = présent, sans
 * précision). Un congé n'est pas une journée travaillée.
 */
export const STATUTS_PRESENCE = {
  terrain: { libelle: 'Terrain', emoji: '🏕️' },
  teletravail: { libelle: 'Télétravail', emoji: '💻' },
  conge: { libelle: 'Congé', emoji: '🌴' },
} as const
export type StatutPresence = keyof typeof STATUTS_PRESENCE
export const LISTE_STATUTS = Object.keys(STATUTS_PRESENCE) as StatutPresence[]

/** Séjour = une réservation du module Réservations (voir sejours.ts). */
export type { Batiment, Phase, Sejour } from './sejours'

export const TYPES_EVENEMENT = {
  inspection: { libelle: 'Inspection', icone: '🔍' },
  livraison: { libelle: 'Livraison', icone: '📦' },
  fournisseur: { libelle: 'Fournisseur', icone: '🧰' },
  travaux: { libelle: 'Travaux', icone: '🛠️' },
  autre: { libelle: 'Autre', icone: '📌' },
} as const
export type TypeEvenement = keyof typeof TYPES_EVENEMENT

export interface Evenement extends Trace {
  id: string
  titre: string
  type: TypeEvenement
  date_debut: string
  date_fin: string | null
  heure_debut: string | null
  heure_fin: string | null
  /** RRULE simple (voir recurrence.ts) ; null si ponctuel. */
  regle_recurrence: string | null
  fin_recurrence: string | null
  exceptions: string[]
  lieu: string | null
  notes: string | null
}

export interface PresenceSimple extends Trace {
  id: string
  personnel_id: string
  date: string
  secteur: 'direction' | 'terrain'
  description: string | null
  statut: StatutPresence | null
}

/** Ligne de la vue commune calendrier.v_presence_jour. */
export interface PresenceJour {
  personnel_id: string
  nom: string
  date: string
  secteur: Secteur
  description: string
  /** Direction et terrain seulement (jamais « conge » : un congé n'y est pas). */
  statut: StatutPresence | null
}

export interface EntreeJournal {
  id: number
  table_name: string
  record_id: string | null
  action: 'ajout' | 'modification' | 'suppression' | 'restauration' | 'effacement'
  ancien: Record<string, unknown> | null
  nouveau: Record<string, unknown> | null
  modifie_par: string | null
  modifie_par_nom: string | null
  modifie_le: string
}
