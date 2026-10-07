export type Sens = 'entree' | 'sortie'
export type Region = 'qc' | 'int'

export const REGIONS: { id: Region; nom: string; icone: string }[] = [
  { id: 'qc', nom: 'Québec', icone: '⚜️' },
  { id: 'int', nom: 'International', icone: '🌎' },
]

/** Une ligne de caisse : une compagnie OU une poche personnelle. */
export interface Transaction {
  id: string
  /** AAAA-MM-JJ */
  jour: string
  entreprise_id: string | null
  poche_id: string | null
  /** Obligatoire pour une compagnie de `compagnies_qc_int` (Opikawa), sinon null. */
  region: Region | null
  sens: Sens
  montant: number
  details: string
  /** Les deux lignes d'une avance « payé de ma poche ». */
  avance_id: string | null
  saisi_par: string | null
  saisi_par_nom: string | null
  created_at: string
}

/** Poche personnelle : l'argent de la caisse qui revient à quelqu'un. */
export interface Poche {
  id: string
  nom: string
  profil_id: string | null
}

/** Compagnie (référentiel commun, core.entreprises), lue seulement ici. */
export interface Entreprise {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}
