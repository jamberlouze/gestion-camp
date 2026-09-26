// Formes reprises telles quelles de l'ancien calculateur (colonnes en anglais).

export const CATEGORIES = ['Déjeuner', 'Repas principal', 'Salades', 'Desserts', 'Buffet'] as const
export const ICONES_CATEGORIE: Record<string, string> = {
  Déjeuner: '☀️',
  'Repas principal': '🍽️',
  Salades: '🥗',
  Desserts: '🍰',
  Buffet: '🧃',
}
export const REPAS = [
  { id: 'dejeuner', libelle: 'Déjeuner', court: 'Déj.' },
  { id: 'diner', libelle: 'Dîner', court: 'Dîner' },
  { id: 'souper', libelle: 'Souper', court: 'Souper' },
] as const
export const AGES = ['Primaire', 'Secondaire', 'Adultes', 'Mixtes'] as const
export const COULEURS_GROUPES = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#C62828', '#00838F']
export const MAGASINS = [
  { id: 'colabor', libelle: 'Colabor' },
  { id: 'costco', libelle: 'Costco' },
  { id: 'maxi', libelle: 'Maxi' },
] as const
export const UNITES = [
  { id: 'g', libelle: 'g', long: 'g' },
  { id: 'ml', libelle: 'ml', long: 'ml' },
  { id: 'un', libelle: 'un.', long: 'unités' },
  { id: 'caisse', libelle: 'caisse', long: 'caisse(s)' },
] as const
export const PORTEES = [
  { id: 'all', libelle: 'Tous' },
  { id: 'regular', libelle: 'Régulier' },
  { id: 'veggie', libelle: 'Végé' },
] as const
export const MODELES_SORTIE = [
  { id: 'souper_dejeuner', libelle: 'Souper → Déjeuner (lendemain)' },
  { id: 'diner_souper_dejeuner', libelle: 'Dîner → Souper → Déjeuner (lendemain)' },
] as const

/** Recettes ajoutées automatiquement à la commande (identifiants fixes). */
export const RECETTE_BUFFET_DEJEUNER = 'buffet-dejeuner'
export const RECETTE_BAR_SALADE = 'bar-salade'

export type Repas = (typeof REPAS)[number]['id']
export type Magasin = (typeof MAGASINS)[number]['id']
export type Unite = (typeof UNITES)[number]['id']
export type Portee = (typeof PORTEES)[number]['id']
export type ModeleSortie = (typeof MODELES_SORTIE)[number]['id']

/** Ingrédient d'une recette : quantité par portion. */
export interface IngredientRecette {
  id: string
  name: string
  pkg: string
  qty: number
  unit: Unite
  caseQty: number | null
  store: Magasin
  scope: Portee
}

export interface Recette {
  id: string
  name: string
  cat: string
  has_veg: boolean
  ingredients: IngredientRecette[]
  deleted_at: string | null
}

export interface Consommable {
  id: string
  name: string
  prod_id: string | null
  prod_name: string | null
  pkg: string | null
  store: Magasin
  deleted_at: string | null
}

/** Produit de la banque (catalogue Colabor, Costco, Maxi). */
export interface Produit {
  id: string
  name: string
  pkg: string | null
  case_qty: number | null
  unit: Unite
  store: Magasin
}

export interface GroupeRepas {
  id: string
  name: string
  age: string | null
  portions: number
  color: string | null
}

export interface CellulePlan {
  day: number
  meal: Repas
  plat: string | null
  salade: string | null
  dessert: string | null
  /** Identifiants des groupes absents à ce repas. */
  absent: string[]
}

export interface MenuSauve {
  id: string
  name: string
  saved_at: string
  days: number | null
  groups: GroupeRepas[]
  /** Grille sauvegardée : clé « jour_repas ». */
  cells: Record<string, Partial<CellulePlan>>
}

export interface AjoutConsommable {
  cons_id: string
  qty: number
}

export interface AjoutRecette {
  id: number
  recipe_id: string
  portions: number
  veg: number | null
  created_at: string
}

export interface GroupeSortie {
  groupId: string
  portions: number
}

export interface Sortie {
  id: string
  nom: string | null
  jour_depart: number
  pattern: ModeleSortie
  groupes: GroupeSortie[]
  glaciere_id: string | null
  created_at: string
}

export interface ParametresPlan {
  jours: number
  /** AAAA-MM-JJ, ou null : les jours sont alors numérotés (Jour 1, Jour 2…). */
  debut: string | null
}
