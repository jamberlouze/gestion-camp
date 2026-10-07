// Coût par assiette (tables commande.couts_*). Voir la migration
// 20261007170414_cuisine_cout_assiette.sql pour les règles.

/** Exercice d'octobre à septembre, désigné par l'année où il commence (2025 = 2025-2026). */
export interface Annee {
  annee: number
  /** Compter les assiettes des menus de Cuisine datés dans l'année. */
  menus: boolean
}

/** Semaine du camp d'été (vue « Camp d'été »). */
export interface Semaine {
  id: string
  annee: number
  nom: string
  /** AAAA-MM-JJ, inclus */
  debut: string
  /** AAAA-MM-JJ, inclus */
  fin: string
}

export interface Facture {
  id: string
  fournisseur: string
  /** Date de livraison. */
  jour: string
  /** Jour où la nourriture compte (null = jour de livraison). */
  jour_impute: string | null
  /** Négatif pour un crédit. */
  montant: number
  note: string
  created_at?: string
}

export interface Poste {
  id: string
  nom: string
  ordre: number
  actif: boolean
}

/** Salaires d'un poste pour une période de paie (14 jours, du dimanche au samedi). */
export interface Salaire {
  debut_paie: string
  poste_id: string
  montant: number
}

/** Groupe ajouté à la main (sans menu dans Cuisine) : personnes × repas, répartis du début à la fin. */
export interface GroupeManuel {
  id: string
  annee: number
  nom: string
  personnes: number
  repas: number
  /** null (avec fin) = à classer, pas compté. */
  debut: string | null
  fin: string | null
  ordre: number
}

/** Total d'assiettes d'un menu corrigé à la main (remplace le calcul). */
export interface CorrectionMenu {
  menu_id: string
  assiettes: number
}
