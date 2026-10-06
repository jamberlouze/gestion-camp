export type TypeChambre = 'enfants' | 'employes' | 'vide'

export const TYPES: { id: TypeChambre; libelle: string }[] = [
  { id: 'enfants', libelle: 'Enfants' },
  { id: 'employes', libelle: 'Employés' },
  { id: 'vide', libelle: 'Vide' },
]

export interface Zone {
  id: string
  nom: string
  ordre: number
}

export interface Batiment {
  id: string
  zone_id: string
  nom: string
  ordre: number
}

export interface Section {
  id: string
  batiment_id: string
  nom: string
  ordre: number
}

export interface Chambre {
  id: string
  section_id: string
  numero: string
  /** Capacité normale ; un plan peut la changer pour lui seul. */
  lits: number
  ordre: number
}

export interface Plan {
  id: string
  nom: string
  en_vigueur: boolean
  archive: boolean
  created_at: string
}

/** Une chambre « touchée » dans un plan ; sans ligne : vide, capacité normale. */
export interface Occupation {
  id: string
  plan_id: string
  chambre_id: string
  type: TypeChambre
  nombre: number
  /** Capacité propre au plan (null = capacité normale). */
  lits: number | null
}

/** Employé clé nommé dans une chambre : un employé de l'app ou un nom libre. */
export interface Personne {
  id: string
  plan_id: string
  chambre_id: string
  employe_id: string | null
  nom: string | null
  created_at: string
}

export interface Employe {
  id: string
  surnom: string
  actif: boolean
}
