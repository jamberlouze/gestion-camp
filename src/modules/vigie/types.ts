// Types du schéma vigie (voir supabase/migrations/20261003000002_vigie.sql).

export type Saison = 'hiver' | 'printemps' | 'ete' | 'automne'
export type Categorie = 'competiteur_direct' | 'reference'
export type StatutInclusion = 'propose' | 'inclus' | 'exclu'

export const SAISONS: { id: Saison; libelle: string }[] = [
  { id: 'hiver', libelle: 'Hiver' },
  { id: 'printemps', libelle: 'Printemps' },
  { id: 'ete', libelle: 'Été' },
  { id: 'automne', libelle: 'Automne' },
]

export const CATEGORIES: Record<Categorie, string> = {
  competiteur_direct: 'Compétiteur direct',
  reference: 'Référence / inspiration',
}

export const TYPES_CAMP: Record<string, string> = {
  camp_vacances: 'Camp de vacances',
  camp_familial: 'Camp familial',
  camp_jour: 'Camp de jour',
  besoins_particuliers: 'Besoins particuliers',
  classe_nature: 'Classe nature',
  accueil_groupe: 'Accueil de groupes',
}

export const HEBERGEMENTS: Record<string, string> = {
  tente: 'Tente',
  dortoir: 'Dortoir',
  chalet: 'Chalet',
  chambre: 'Chambre',
  autre: 'Autre',
}

export interface Camp {
  id: string
  nom: string
  province: string | null
  ville: string | null
  region: string | null
  types: string[]
  hebergement: string[]
  site_web: string | null
  site_web_score: number | null
  facebook: string | null
  facebook_score: number | null
  instagram: string | null
  instagram_score: number | null
  tiktok: string | null
  tiktok_score: number | null
  membre_acq: boolean
  categorie: Categorie | null
  statut_inclusion: StatutInclusion
  origine: 'import' | 'decouverte' | 'manuel'
  lien_source: string | null
  date_decouverte: string
  recherche_id: string | null
  resume: string | null
  pertinence: string | null
  notes: string | null
  idees: string | null
  documente_le: string | null
  verifie_le: string | null
}

export interface Programme {
  id: string
  camp_id: string
  nom: string
  description: string | null
  duree_jours: number | null
  duree_nuits: number | null
  prix: number | null
  prix_par_nuit: number | null
  prix_par_jour: number | null
  annee: string | null
  notes: string | null
  source_url: string | null
  actif: boolean
  verifie_le: string | null
}

export interface Activite {
  id: string
  nom: string
  description: string | null
  saisons: Saison[]
  offert_bpa: boolean
  cout_implantation: number | null
  cout_operation_annuel: number | null
  hypotheses_couts: string | null
  couts_estimes_le: string | null
}

export interface LienActivite {
  camp_id: string
  activite_id: string
  source: string
  note: string | null
}

export interface Photo {
  id: string
  activite_id: string
  camp_id: string
  chemin: string | null
  url: string | null
  page_source: string | null
  legende: string | null
}

export interface ObjetMaquette {
  nom: string
  forme: 'boite' | 'cylindre' | 'sphere' | 'cone'
  position: number[]
  dimensions: number[]
  rotation: number[]
  couleur: string
}

export interface Scene {
  sol: { largeur: number; profondeur: number; couleur: string }
  objets: ObjetMaquette[]
}

export interface Maquette {
  id: string
  activite_id: string
  scene: Scene
  description: string | null
  genere_le: string
}

export type TypeChangement = 'prix' | 'nouveau_programme' | 'nouvelle_activite'

export interface Changement {
  id: string
  type: TypeChangement
  camp_id: string
  programme_id: string | null
  activite_id: string | null
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  details: Record<string, unknown>
  source_url: string | null
  statut: 'a_valider' | 'valide' | 'rejete'
  detecte_le: string
  valide_le: string | null
  recherche_id: string | null
}

export interface Recherche {
  id: string
  type: 'mensuelle' | 'decouverte' | 'documentation'
  statut: 'en_cours' | 'terminee' | 'erreur'
  debut: string
  fin: string | null
  camps_verifies: number
  changements_detectes: number
  changements_prix: number
  camps_proposes: number
  erreurs: number
  cout_usd: number
  resume: string | null
  courriel_envoye_le: string | null
  erreur: string | null
}

export interface RequeteIa {
  id: string
  recherche_id: string | null
  type: 'verification' | 'photos' | 'decouverte' | 'documentation' | 'couts' | 'maquette'
  camp_id: string | null
  activite_id: string | null
  statut: 'en_attente' | 'soumise' | 'terminee' | 'erreur'
  tentatives: number
  cout_usd: number
  erreur: string | null
  created_at: string
  updated_at: string
}

export interface Reglages {
  modele: string
  effort: string
  destinataires: string[]
  url_app: string
  frequence_decouverte_mois: number
  prochaine_decouverte: string
  mensuelle_active: boolean
  decouverte_active: boolean
  consignes: string
}
