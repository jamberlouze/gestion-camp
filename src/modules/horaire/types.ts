export const TAGS = ['escalade', 'transport', 'sauveteur'] as const
export type Tag = (typeof TAGS)[number]

export const META_TAG: Record<Tag, { libelle: string; icone: string; couleur: string; clair: string }> = {
  escalade: { libelle: 'Escalade', icone: '🧗', couleur: '#b45309', clair: '#fde7c7' },
  transport: { libelle: 'Transport', icone: '🚌', couleur: '#6d28d9', clair: '#ede4fd' },
  sauveteur: { libelle: 'Sauveteur', icone: '🛟', couleur: '#0369a1', clair: '#d7ecfb' },
}

/**
 * Catégories (saisons) : une activité est proposée dans un horaire de sa
 * catégorie (ex. seulement les activités d'hiver en classe blanche). Dans
 * l'ordre de l'année, printemps, été, automne, hiver (demande de Maxime).
 */
export const CATEGORIES = ['verte', 'ete', 'rouge', 'blanche'] as const
export type Categorie = (typeof CATEGORIES)[number]

export const META_CATEGORIE: Record<Categorie, { libelle: string; icone: string; couleur: string; clair: string }> = {
  verte: { libelle: 'Classes vertes', icone: '🌱', couleur: '#15803d', clair: '#dcfce7' },
  ete: { libelle: "Camp d'été", icone: '☀️', couleur: '#a16207', clair: '#fef3c7' },
  rouge: { libelle: 'Classes rouges', icone: '🍁', couleur: '#b91c1c', clair: '#fee2e2' },
  blanche: { libelle: 'Classes blanches', icone: '❄️', couleur: '#0369a1', clair: '#e0f2fe' },
}

export const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

/** Paires de jours de congé de l'animateur. */
export const CONGES = {
  MM: { jours: ['Mardi', 'Mercredi'], libelle: 'Mar-Mer' },
  JV: { jours: ['Jeudi', 'Vendredi'], libelle: 'Jeu-Ven' },
  SD: { jours: ['Samedi', 'Dimanche'], libelle: 'Sam-Dim' },
} as const
export type CodeConge = keyof typeof CONGES | ''

export const JEUX = [
  { id: 'FR', libelle: 'Jeu de soirée FR (18h45)' },
  { id: 'EN', libelle: 'Jeu de soirée EN (18h30)' },
] as const
export const SURVEILLANCES = [
  { id: 'survFR', libelle: 'Surveillance pré-jeu FR (18h)' },
  { id: 'survEN', libelle: 'Surveillance pré-jeu EN (18h)' },
] as const
/** Activités où le groupe part la nuit : son animateur n'est pas disponible le soir. */
export const ACTIVITES_CAMPING = new Set(['Canot-camping', 'Rando-camping'])
export const COLONNES_TRANSPORT = ['Heure départ', 'Lieu', 'Chauffeur', 'Autobus'] as const

export interface Activite {
  name: string
  tags: Tag[]
  /** Catégories où l'activité est proposée ; absente ou vide : toutes. */
  categories?: Categorie[]
}

/** Ligne de l'horaire des invités (Déjeuner, Dîner, Jeu de soirée…). */
export interface LigneInvites {
  id: number
  libelle: string
}

/** Horaire des invités spéciaux : une case par ligne et par jour (« id|jour »). */
export interface Invites {
  lignes: LigneInvites[]
  cases: Record<string, string>
}

export interface GroupeHoraire {
  id: number
  num: string
  anim: string
  age: string
  section: string
  conge: CodeConge
  remp: string
}

/**
 * Horaire d'une semaine (colonne etat de horaire.horaires). Mêmes clés que
 * l'ancien créateur : cellules « gid|jour|période », fusions « gid|jour|indice ».
 */
export interface EtatSemaine {
  jours: string[]
  periodes: string[]
  groupes: GroupeHoraire[]
  cellules: Record<string, string>
  fusions: Record<string, number>
  /** « section|nuit » → animateurs */
  chouettes: Record<string, string[]>
  /** « FR|nuit », « EN|nuit » → animateurs */
  jeux: Record<string, string[]>
  /** « survFR|nuit », « survEN|nuit » → animateurs */
  surv: Record<string, string[]>
  /** « jour|période|groupe|colonne » → valeur (heure de départ, lieu, chauffeur, autobus) */
  transport: Record<string, string>
  /** Nuits avec soirées propres à cet horaire (séjour court) ; absent : celles des réglages communs. */
  nuits?: string[]
  /** Catégorie (saison) : seules ses activités sont proposées ; absente : toutes. */
  categorie?: Categorie
  /** Activités retirées à la main pour cet horaire (grisées, plus proposées). */
  activitesRetirees?: string[]
  /** Horaire des invités ; absent : lignes de départ, cases vides. */
  invites?: Invites
}

/** Réglages communs à toutes les semaines (horaire.parametres, clé « reglages »). */
export interface Reglages {
  activites: Activite[]
  capacites: Record<Tag, number>
  sections: string[]
  nuits: string[]
}

export interface Horaire {
  id: string
  nom: string
  semaine_id: string | null
  /** Dossier de rangement (null : « Sans dossier » ; toujours null pour un modèle). */
  dossier_id: string | null
  /** Modèle de séjour : point de départ des nouvelles semaines. */
  modele: boolean
  /** Date du premier jour (AAAA-MM-JJ) ; null pour un modèle ou une semaine pas encore datée. */
  debut: string | null
  etat: Partial<EtatSemaine>
  updated_at: string
  created_at: string
}

export interface Dossier {
  id: string
  nom: string
  created_at: string
  updated_at: string
}
