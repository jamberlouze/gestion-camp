export const TAGS = ['escalade', 'transport', 'sauveteur'] as const
export type Tag = (typeof TAGS)[number]

export const META_TAG: Record<Tag, { libelle: string; icone: string; couleur: string; clair: string }> = {
  escalade: { libelle: 'Escalade', icone: '🧗', couleur: '#b45309', clair: '#fde7c7' },
  transport: { libelle: 'Transport', icone: '🚌', couleur: '#6d28d9', clair: '#ede4fd' },
  sauveteur: { libelle: 'Sauveteur', icone: '🛟', couleur: '#0369a1', clair: '#d7ecfb' },
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
  etat: Partial<EtatSemaine>
  updated_at: string
  created_at: string
}
