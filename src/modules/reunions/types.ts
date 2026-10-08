export type StatutPoint = 'ouvert' | 'traite'
export type GenreReunion = 'mt_lab' | 'post_mortem' | 'planification' | 'autre'

export const GENRES: { id: GenreReunion; nom: string; icone: string }[] = [
  { id: 'mt_lab', nom: 'MT Lab', icone: '🧪' },
  { id: 'post_mortem', nom: 'Post-mortem', icone: '🔍' },
  { id: 'planification', nom: 'Planification', icone: '🧭' },
  { id: 'autre', nom: 'Autre', icone: '📌' },
]

/** Ordres du jour de départ d'une réunion spéciale. */
export const GABARITS: Record<GenreReunion, string[]> = {
  mt_lab: ['Suivis des décisions du dernier MT Lab', 'Tour de table : priorités de chacun', 'Prochaines étapes et responsables'],
  post_mortem: ['Chiffres de la saison', 'Bons coups à garder', 'Ce qui a accroché', "Ce qu'on change pour l'an prochain"],
  planification: ["Bilan de l'année", 'Vision et priorités', 'Objectifs', 'Calendrier et responsables'],
  autre: [],
}

export interface Reunion {
  id: string
  titre: string
  genre: GenreReunion
  jour: string | null
  heure: string | null
  lieu: string | null
  entreprise_id: string | null
  objectif: string | null
  participants: string | null
  compte_rendu: string | null
  creee_par_nom: string | null
  created_at: string
}

export interface Recurrent {
  id: string
  texte: string
  /** Jours ISO (1 = lundi … 7 = dimanche) ; vide = une fois par semaine. */
  jours: number[]
  actif: boolean
  ordre: number
}

export interface Point {
  id: string
  texte: string
  details: string | null
  reunion_id: string | null
  ordre: number
  /** Quotidien : à l'ordre du jour à partir de ce jour (null = tout de suite). */
  pour_le: string | null
  recurrent_id: string | null
  statut: StatutPoint
  decision: string | null
  traite_le: string | null
  traite_jour: string | null
  traite_par_nom: string | null
  auteur: string | null
  auteur_nom: string | null
  created_at: string
}
