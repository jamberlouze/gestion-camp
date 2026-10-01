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
  menu_id: string
  id: string
  name: string
  age: string | null
  portions: number
  /** Portions végé (diète végétarienne) comprises dans `portions`. */
  vege: number
  /** Autres diètes (information pour la cuisine, sans effet sur la commande). */
  sans_porc: number
  sans_lactose: number
  sans_gluten: number
  /** Notes sur le groupe (imprimées sur sa liste). */
  notes: string
  color: string | null
  created_at?: string
}

/** Diètes standard demandées à chaque groupe (une par participant ; régulière = le reste). */
export const DIETES = [
  { cle: 'vege', libelle: 'Végétarienne', court: 'végé' },
  { cle: 'sans_porc', libelle: 'Sans porc', court: 'sans porc' },
  { cle: 'sans_lactose', libelle: 'Sans lactose', court: 'sans lactose' },
  { cle: 'sans_gluten', libelle: 'Sans gluten', court: 'sans gluten' },
] as const
export type CleDiete = (typeof DIETES)[number]['cle']

/** Participant d'un groupe avec une allergie ou une restriction. */
export interface Participant {
  id: string
  menu_id: string
  groupe_id: string
  nom: string
  allergies: string
  /** Allergie grave : auto-injecteur (EpiPen). */
  epipen: boolean
  note: string
  created_at?: string
}

export interface CellulePlan {
  menu_id: string
  day: number
  meal: Repas
  plat: string | null
  salade: string | null
  dessert: string | null
  /** Identifiants des groupes absents à ce repas. */
  absent: string[]
}

/**
 * Menu d'un séjour ou d'une semaine (document nommé, comme une semaine de
 * l'Horaire). Ses groupes, sa grille, ses sorties et ses ajouts manuels sont
 * dans leurs tables, liés par menu_id. Un modèle n'a ni dossier ni date.
 */
export interface Menu {
  id: string
  nom: string
  /** null : « Sans dossier » (toujours null pour un modèle). */
  dossier_id: string | null
  modele: boolean
  jours: number
  /** AAAA-MM-JJ, ou null : les jours sont alors numérotés (Jour 1, Jour 2…). */
  debut: string | null
  created_at: string
  updated_at: string
}

export interface Dossier {
  id: string
  nom: string
  created_at: string
  updated_at: string
}

export interface AjoutConsommable {
  menu_id: string
  cons_id: string
  qty: number
}

export interface AjoutRecette {
  menu_id: string
  id: number
  recipe_id: string
  portions: number
  veg: number | null
  created_at: string
}

export interface GroupeSortie {
  groupId: string
  portions: number
  /** Portions végé parmi celles-ci (absent = 0) : elles prennent l'option végé de la glacière. */
  vege?: number
}

export interface Sortie {
  menu_id: string
  id: string
  nom: string | null
  jour_depart: number
  pattern: ModeleSortie
  groupes: GroupeSortie[]
  glaciere_id: string | null
  created_at: string
}

// ------------------------------------------------------------------
// Horaire du personnel de cuisine
// ------------------------------------------------------------------

/** Fonction en cuisine (Gestionnaire, Lead, Cook…), avec sa couleur dans l'horaire. */
export interface Fonction {
  id: string
  nom: string
  couleur: string
  ordre: number
}

/** Membre du personnel de cuisine (liste propre au module). */
export interface Personne {
  id: string
  nom: string
  fonction_id: string | null
  actif: boolean
  ordre: number
}

/** Case de l'horaire : texte tel qu'écrit (« 6h30 à 14h30 », « 9ish », « OFF »…). */
export interface Quart {
  personne_id: string
  /** AAAA-MM-JJ */
  jour: string
  texte: string
}

/** Réglages de l'horaire (commande.parametres, clé « horaire_cuisine »). */
export interface ReglagesHoraire {
  /** Quarts proposés en un clic. */
  quarts: string[]
  /** Mots qui ne sont pas des quarts travaillés (OFF, Vacance…). */
  statuts: string[]
}
