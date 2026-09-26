export const TYPES = ['Kayak', 'Canot', 'Pédalo', 'SUP', 'Rabaska'] as const
export const BOUCHONS = ['Liège', 'Plastique'] as const
export const ENTREPRISES = ['BPA lac', 'BPA rivière', 'R&D', 'AQB'] as const

export type TypeEmbarcation = (typeof TYPES)[number]
export type Bouchon = (typeof BOUCHONS)[number]
export type Entreprise = (typeof ENTREPRISES)[number]

export interface Modele {
  id: string
  type: TypeEmbarcation
  nom: string
  prefix_id: string
  bouchon: Bouchon | null
  created_at: string
  updated_at: string
}

export interface Embarcation {
  id: string
  /** Attribué par la base (PREFIXE-001) ; null tant qu'une création hors ligne n'est pas synchronisée. */
  numero_identification: string | null
  modele_id: string
  entreprise_utilisation: Entreprise | null
  fonctionnel: boolean
  notes: string | null
  date_creation: string
  updated_at: string
  deleted_at: string | null
}

export type ChampsEmbarcation = Partial<
  Pick<Embarcation, 'fonctionnel' | 'entreprise_utilisation' | 'notes' | 'deleted_at'>
>
export type ChampsModele = Partial<Pick<Modele, 'type' | 'nom' | 'prefix_id' | 'bouchon'>>
