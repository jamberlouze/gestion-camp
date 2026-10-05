// Types du schéma core. À remplacer par les types générés
// (npm run db:types) une fois le projet Supabase lié.

export type Role = 'admin' | 'direction' | 'coordo'
export type ModuleId = 'embarcations' | 'commande' | 'horaire' | 'mastertimeline' | 'subventions' | 'vigie' | 'calendrier'
export type Niveau = 'lecture' | 'ecriture'
export type Specialite = 'escalade' | 'transport' | 'sauveteur'

export interface Profil {
  id: string
  courriel: string
  nom: string | null
  role: Role
  actif: boolean
}

export interface AccesModule {
  user_id: string
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
  nom_complet: string | null
  courriel: string | null
  poste: string | null
  specialites: Specialite[]
  actif: boolean
  airtable_id: string | null
}

export interface Semaine {
  id: string
  nom: string
  date_debut: string
  date_fin: string
}
