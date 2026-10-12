/** Section (Tir à l'arc, Camping…) ou lieu de rangement (Grill, Tanière…) : listes du module. */
export interface Element {
  id: string
  nom: string
  ordre: number
}
/** Module où une section est montrée et qui donne les droits sur ses articles. */
export type ModuleSection = 'inventaire' | 'embarcations'
export interface Section extends Element {
  /** VFI, rames, pagaies : 'embarcations' (Embarcations › Équipement). */
  module: ModuleSection
}
export type Lieu = Element

export interface Article {
  id: string
  nom: string
  /** « Type » du Sheets : taille, sorte, couleur… */
  variante: string | null
  section_id: string | null
  lieu_id: string | null
  entreprise_id: string | null
  /** Nombre qu'il faut avoir ; null = pas de cible. */
  necessaire: number | null
  /** Note permanente (où exactement…). */
  note: string | null
  ordre: number
  /** false = retiré de l'inventaire (son historique est gardé). */
  actif: boolean
  created_at: string
  updated_at: string
}

export type ChampsArticle = Partial<Pick<Article, 'nom' | 'variante' | 'section_id' | 'lieu_id' | 'entreprise_id' | 'necessaire' | 'note' | 'actif'>>

/** Nombres d'un article un jour donné (le plus récent fait foi). */
export interface Compte {
  article_id: string
  /** Jour de l'inventaire, AAAA-MM-JJ. */
  jour: string
  bon: number
  brise: number
  incomplet: number
  /** État noté ce jour-là. */
  note: string | null
  /** Posés par la base. */
  compte_par: string | null
  compte_par_nom: string | null
  created_at: string
  updated_at: string
}

export type ChampsCompte = Partial<Pick<Compte, 'bon' | 'brise' | 'incomplet' | 'note'>>

/** Compagnie du référentiel (core.entreprises). */
export interface Compagnie {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}
