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
 * l'animation du module Horaire d'animation.
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
}

/** Séjour de groupe : copie en lecture seule d'Airtable. */
export interface Sejour {
  id: string
  airtable_record_id: string
  numero: string | null
  nom_groupe: string
  type_sejour: string | null
  etat: string | null
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  section_batiment: string | null
  batiment: string | null
  nb_participants: number | null
  nb_animateurs: number | null
  avec_animation: boolean
  avec_repas: boolean
  notes: string | null
  synced_at: string
  deleted_at: string | null
}

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
}

/** Ligne de la vue commune calendrier.v_presence_jour. */
export interface PresenceJour {
  personnel_id: string
  nom: string
  date: string
  secteur: Secteur
  description: string
}

export interface Synchro {
  id: number
  debut: string
  source: string
  recus: number | null
  ajoutes: number | null
  modifies: number | null
  retires: number | null
  erreur: string | null
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

/** États Airtable d'une réservation perdue : jamais affichée. */
export const ETATS_MASQUES = new Set(['Closed lost'])
export const ETAT_CONFIRME = 'Confirmée'
