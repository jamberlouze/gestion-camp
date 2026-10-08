export type TypePoint = 'info' | 'decision' | 'discussion'
export type StatutPoint = 'ouvert' | 'traite' | 'retire'
export type GenreReunion = 'mt_lab' | 'post_mortem' | 'planification' | 'autre'

export const TYPES: { id: TypePoint; nom: string; icone: string; classe: string; aide: string }[] = [
  { id: 'info', nom: 'Info', icone: 'ℹ️', classe: 'bg-sky-50 text-sky-800', aide: 'On informe, pas de discussion' },
  { id: 'discussion', nom: 'Discussion', icone: '💬', classe: 'bg-amber-50 text-amber-800', aide: 'On en parle ensemble' },
  { id: 'decision', nom: 'Décision', icone: '⚖️', classe: 'bg-violet-50 text-violet-800', aide: 'On doit trancher' },
]

export const GENRES: { id: GenreReunion; nom: string; icone: string }[] = [
  { id: 'mt_lab', nom: 'MT Lab', icone: '🧪' },
  { id: 'post_mortem', nom: 'Post-mortem', icone: '🔍' },
  { id: 'planification', nom: 'Planification', icone: '🧭' },
  { id: 'autre', nom: 'Autre', icone: '📌' },
]

/** Ordres du jour de départ d'une réunion spéciale (texte, minutes). */
export const GABARITS: Record<GenreReunion, [string, number][]> = {
  mt_lab: [
    ['Suivis des décisions du dernier MT Lab', 10],
    ['Tour de table : priorités de chacun', 15],
    ['Prochaines étapes et responsables', 10],
  ],
  post_mortem: [
    ['Chiffres de la saison', 15],
    ['Bons coups à garder', 20],
    ['Ce qui a accroché', 20],
    ["Ce qu'on change pour l'an prochain", 25],
    ['Responsables et échéances', 10],
  ],
  planification: [
    ["Bilan de l'année", 20],
    ['Vision et priorités', 30],
    ['Objectifs mesurables', 30],
    ['Calendrier et responsables', 20],
  ],
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
  type: TypePoint
  /** Jours ISO (1 = lundi … 7 = dimanche) ; vide = une fois par semaine. */
  jours: number[]
  actif: boolean
  ordre: number
}

export interface Point {
  id: string
  texte: string
  details: string | null
  type: TypePoint
  urgent: boolean
  duree_min: number | null
  reunion_id: string | null
  ordre: number
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

export interface Suivi {
  id: string
  texte: string
  point_id: string | null
  responsable_id: string | null
  responsable_nom: string | null
  echeance: string | null
  fait_le: string | null
  fait_par_nom: string | null
  auteur_nom: string | null
  created_at: string
}

export interface Personne {
  id: string
  nom: string
}
