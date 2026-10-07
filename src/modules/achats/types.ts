export type Statut = 'a_commander' | 'commande' | 'recu'

/** Dans l'ordre du suivi. */
export const STATUTS: { id: Statut; nom: string }[] = [
  { id: 'a_commander', nom: 'À commander' },
  { id: 'commande', nom: 'Commandé' },
  { id: 'recu', nom: 'Reçu' },
]

export interface Achat {
  id: string
  item: string
  statut: Statut
  /** null = pas encore précisée. */
  quantite: number | null
  /** Prix estimé à l'unité, en dollars ; null = pas encore estimé. */
  prix_unitaire: number | null
  entreprise_id: string | null
  fournisseur_id: string | null
  note: string | null
  created_at: string
}

/** Compagnie (référentiel commun, core.entreprises), lue seulement ici. */
export interface Entreprise {
  id: string
  nom: string
  couleur: string | null
  ordre: number
  actif: boolean
}

export interface Fournisseur {
  id: string
  nom: string
}
