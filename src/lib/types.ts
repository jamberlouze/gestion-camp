// Types du schéma core. À remplacer par les types générés
// (npm run db:types) une fois le projet Supabase lié.

export type Role = 'admin' | 'direction' | 'coordo' | 'terrain'
export type ModuleId = 'embarcations' | 'commande' | 'horaire' | 'mastertimeline' | 'subventions' | 'vigie' | 'calendrier' | 'temps' | 'vehicules' | 'travaux' | 'achats' | 'rooming' | 'caisse' | 'cuisine_couts' | 'ameliorations' | 'reunions' | 'crm'
export type Niveau = 'lecture' | 'ecriture'

export interface Profil {
  id: string
  courriel: string
  nom: string | null
  role: Role
  actif: boolean
  /** Fiche d'employé dont ce compte remplit lui-même la feuille de temps (jamais pour la direction). */
  employe_id: string | null
  /** Heures de woofing (non payées) sur sa feuille de temps. */
  woofing: boolean
}

export interface AccesModule {
  user_id: string
  module: ModuleId
  niveau: Niveau
}

/** Case de la grille d'accès par rôle (absente = aucun accès ; l'admin a tout). */
export interface AccesRole {
  role: Exclude<Role, 'admin'>
  module: ModuleId
  niveau: Niveau
}

export interface Groupe {
  id: string
  nom: string
  tranche_age: string | null
  effectif: number
  couleur: string | null
  ordre: number
  actif: boolean
}

export interface Employe {
  id: string
  surnom: string
  prenom: string | null
  nom_famille: string | null
  /** « Nom, Prénom », posé par la base à partir de prenom et nom_famille (lecture seulement). */
  nom_complet: string | null
  courriel: string | null
  poste: string | null
  secteur: string | null
  /** Compagnies (mastertimeline.entreprises) : une ligne par compagnie dans la feuille des employés. */
  entreprise_ids: string[]
  actif: boolean
  airtable_id: string | null
}

/** Compagnie du groupe (core.entreprises : Mastertimeline, Achats, Feuilles de temps…). */
export interface Entreprise {
  id: string
  nom: string
  abreviation: string | null
  description: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}

export interface Semaine {
  id: string
  nom: string
  date_debut: string
  date_fin: string
}
