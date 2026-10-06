export interface Entreprise {
  id: string
  nom: string
  couleur: string | null
  ordre: number
  actif: boolean
}

export interface Projet {
  id: string
  nom: string
  couleur: string | null
  ordre: number
  /** Entreprises pour lesquelles le projet est offert ; vide = toutes. */
  entreprise_ids: string[]
  archive: boolean
}

export interface Responsable {
  id: string
  nom: string
  courriel: string | null
  actif: boolean
}

export interface Fournisseur {
  id: string
  nom: string
  personne_ressource: string | null
  telephone: string | null
  courriel: string | null
  site_web: string | null
  service: string | null
  notes: string | null
}

export interface Tache {
  id: string
  titre: string
  entreprise_id: string | null
  projet_id: string | null
  responsable_id: string | null
  fournisseur_id: string | null
  /** Note permanente : comment faire la tâche. */
  note: string | null
  corvee: boolean
  /**
   * Mois civils (1 = janvier) où la tâche revient. Toujours rempli : les
   * tâches ponctuelles sont dans le module Travaux depuis le 2026-10-06.
   */
  mois: number[]
  intervalle_ans: number
  /** Année où commence l'exercice du premier passage (2026 = 2026-27). */
  exercice_depart: number
  jour: number | null
  debut: string | null
  echeance: string | null
  priorite: number | null
  heures_prevues: number | null
  position: number | null
  archivee: boolean
  created_at: string
}

export type Statut = 'faite' | 'sautee'

/** Un passage d'une tâche : periode = mois du passage ('2026-10') ou 'unique'. */
export interface Coche {
  tache_id: string
  periode: string
  statut: Statut | null
  note: string | null
  fait_le: string | null
  fait_par: string | null
}

export interface Achat {
  id: string
  item: string
  fournisseur_id: string | null
  commande: boolean
  note: string | null
}

export const PRIORITES: Record<number, string> = {
  1: 'Urgent',
  2: 'Prioritaire',
  3: 'Si possible',
  4: 'À prévoir',
}
