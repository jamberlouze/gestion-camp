export type TypeVehicule = 'minibus' | 'voiture' | 'vtt' | 'remorque' | 'autre'
export type Statut = 'en_circulation' | 'remise'
export type Resultat = 'conforme' | 'mineures' | 'majeures'

export const TYPES: { id: TypeVehicule; libelle: string; pluriel: string }[] = [
  { id: 'minibus', libelle: 'Minibus', pluriel: 'Minibus' },
  { id: 'voiture', libelle: 'Voiture', pluriel: 'Voitures' },
  { id: 'vtt', libelle: 'VTT', pluriel: 'VTT' },
  { id: 'remorque', libelle: 'Remorque', pluriel: 'Remorques' },
  { id: 'autre', libelle: 'Autre', pluriel: 'Autres' },
]

export const STATUTS: { id: Statut; libelle: string }[] = [
  { id: 'en_circulation', libelle: 'En circulation' },
  { id: 'remise', libelle: 'Remisé' },
]

export const RESULTATS: { id: Resultat; libelle: string }[] = [
  { id: 'conforme', libelle: 'Conforme' },
  { id: 'mineures', libelle: 'Défectuosités mineures' },
  { id: 'majeures', libelle: 'Défectuosités majeures' },
]

/** Compagnie propriétaire (référentiel commun, core.entreprises). */
export interface Proprietaire {
  id: string
  nom: string
  couleur: string | null
  ordre: number
  actif: boolean
}

export interface Vehicule {
  id: string
  surnom: string
  type: TypeVehicule
  statut: Statut
  proprietaire_id: string | null
  marque: string | null
  modele: string | null
  annee: number | null
  couleur: string | null
  niv: string | null
  places: number | null
  plaque: string | null
  immatriculation_echeance: string | null
  assureur: string | null
  police_assurance: string | null
  assurance_echeance: string | null
  photo: string | null
  notes: string | null
  ordre: number
  created_at: string
}

export interface Inspection {
  id: string
  vehicule_id: string
  date: string
  type: string
  resultat: Resultat | null
  atelier: string | null
  cout: number | null
  prochaine: string | null
  notes: string | null
}

export interface Entretien {
  id: string
  vehicule_id: string
  date: string
  type: string
  description: string | null
  compteur: number | null
  cout: number | null
  fournisseur: string | null
}
