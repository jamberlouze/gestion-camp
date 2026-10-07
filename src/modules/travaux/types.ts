export type Statut = 'a_trier' | 'a_faire' | 'terminee'

export interface Lieu {
  id: string
  nom: string
  ordre: number
}

export interface Categorie {
  id: string
  nom: string
  ordre: number
}

export interface Chantier {
  id: string
  nom: string
  couleur: string | null
  /** Lieu proposé pour les nouvelles tâches du chantier. */
  lieu_id: string | null
  date_cible: string | null
  termine_le: string | null
  created_at: string
}

export interface Tache {
  id: string
  titre: string
  description: string | null
  statut: Statut
  lieu_id: string | null
  categorie_id: string | null
  chantier_id: string | null
  assigne_a: string | null
  priorite: Priorite
  echeance: string | null
  heures_prevues: number | null
  fournisseur_id: string | null
  position: number | null
  signale_par: string | null
  fait_le: string | null
  fait_par: string | null
  /** Tâche annuelle de Mastertimeline créée à partir de celle-ci. */
  annualisee_vers: string | null
  /** Étiquettes (liste de Mastertimeline : Corvée, Woofing…), posées par la direction. */
  etiquette_ids: string[]
  created_at: string
  updated_at: string
}

export interface Photo {
  id: string
  tache_id: string
  /** Chemin dans le seau travaux-photos : <tache_id>/<id>.jpg ou .pdf */
  chemin: string
  /** Nom d'origine d'un PDF (null pour une photo). */
  nom: string | null
  ajoutee_par: string | null
  created_at: string
}

export interface Commentaire {
  id: string
  tache_id: string
  auteur: string | null
  texte: string
  created_at: string
}

/** Un compte, nom seulement (travaux.personnes()). */
export interface Personne {
  id: string
  nom: string
  actif: boolean
  /** Écrit dans Travaux : peut recevoir une tâche. */
  peut_assigner: boolean
}

export interface Fournisseur {
  id: string
  nom: string
  telephone: string | null
}

/** Étiquette de la liste de Mastertimeline (lue seulement). */
export interface Etiquette {
  id: string
  nom: string
  couleur: string | null
}

export type Priorite = 1 | 2 | 3

export const PRIORITES: Record<Priorite, string> = {
  1: 'Urgent',
  2: 'Prioritaire',
  3: 'Normal',
}

/** Couleur de chaque niveau (pastille des groupes par urgence). */
export const COULEURS_PRIORITE: Record<Priorite, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#a8a29e',
}

export const STATUTS: Record<Statut, string> = {
  a_trier: 'À trier',
  a_faire: 'À faire',
  terminee: 'Terminée',
}
