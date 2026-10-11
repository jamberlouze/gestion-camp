/** Catégorie (Tir à l'arc, Camping…) ou lieu de rangement (Grill, Tanière…) : listes du module. */
export interface Element {
  id: string
  nom: string
  ordre: number
}
export type Categorie = Element
export type Lieu = Element

export interface Article {
  id: string
  nom: string
  /** « Type » du Sheets : taille, sorte, couleur… */
  variante: string | null
  categorie_id: string | null
  lieu_id: string | null
  entreprise_id: string | null
  /** Nombre qu'il faut avoir ; null = pas de cible. */
  necessaire: number | null
  /** Note permanente (où exactement…). */
  note: string | null
  ordre: number
  /** false = retiré de l'inventaire (gardé dans les anciens comptages). */
  actif: boolean
  created_at: string
  updated_at: string
}

export type ChampsArticle = Partial<Pick<Article, 'nom' | 'variante' | 'categorie_id' | 'lieu_id' | 'entreprise_id' | 'necessaire' | 'note' | 'actif'>>

export interface Comptage {
  id: string
  nom: string
  statut: 'en_cours' | 'termine'
  debut: string
  fin: string | null
  created_at: string
  updated_at: string
}

/** Nombres d'un article dans un comptage (absente = pas encore compté). */
export interface Ligne {
  comptage_id: string
  article_id: string
  bon: number
  brise: number
  incomplet: number
  /** État noté pendant ce comptage. */
  note: string | null
  /** Posés par la base. */
  compte_par: string | null
  compte_par_nom: string | null
  created_at: string
  updated_at: string
}

export type ChampsLigne = Partial<Pick<Ligne, 'bon' | 'brise' | 'incomplet' | 'note'>>

/** Compagnie du référentiel (core.entreprises). */
export interface Compagnie {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}
