export type GenreRapport = 'accident' | 'premiers_soins' | 'quasi_accident' | 'autre'
export type Consultation = 'aucune' | 'clinique' | 'urgence'
export type Avise = 'ambulance' | 'parents' | 'police' | 'cnesst'

/** Rapport d'accident d'un employé et son suivi ; `regle_le` null = dossier ouvert. */
export interface Rapport {
  id: string
  genre: GenreRapport
  /** Résumé d'une ligne. */
  titre: string
  survenu_le: string
  lieu: string | null
  /** Personne blessée : un employé du référentiel, sinon `autre_personne`. */
  employe_id: string | null
  autre_personne: string | null
  description: string | null
  temoins: string | null
  /** Nature de la blessure et partie du corps. */
  blessure: string | null
  /** Premiers soins donnés, et par qui. */
  soins: string | null
  secouriste: string | null
  consultation: Consultation | null
  /** Absent du travail après la journée de l'accident. */
  arret_travail: boolean
  retour_le: string | null
  avises: Avise[]
  dossier_cnesst: string | null
  /** Ce qu'on fait pour que ça ne se reproduise pas. */
  mesures: string | null
  /** Direction seulement (la base garde l'ancienne valeur pour les autres). */
  suivi: string | null
  regle_le: string | null
  redige_par: string | null
  redige_par_nom: string | null
  created_at: string
  updated_at: string
}

export type ChampsRapport = Omit<Rapport, 'redige_par' | 'redige_par_nom' | 'created_at' | 'updated_at'>

export interface Fichier {
  id: string
  rapport_id: string
  /** Chemin dans le seau : <rapport>/<id>.jpg ou .pdf */
  chemin: string
  /** Nom d'origine d'un PDF (null pour une photo). */
  nom: string | null
  ajoute_par: string | null
  created_at: string
}

export const GENRES: { id: GenreRapport; libelle: string; icone: string }[] = [
  { id: 'accident', libelle: 'Accident avec blessure', icone: '🤕' },
  { id: 'premiers_soins', libelle: 'Premiers soins seulement', icone: '🩹' },
  { id: 'quasi_accident', libelle: 'Quasi-accident (personne de blessé)', icone: '⚠️' },
  { id: 'autre', libelle: 'Autre', icone: '📝' },
]

export const CONSULTATIONS: { id: Consultation; libelle: string }[] = [
  { id: 'aucune', libelle: 'Aucune' },
  { id: 'clinique', libelle: 'Clinique ou médecin' },
  { id: 'urgence', libelle: "Urgence (hôpital)" },
]

export const AVISES: { id: Avise; libelle: string }[] = [
  { id: 'ambulance', libelle: 'Ambulance' },
  { id: 'parents', libelle: 'Parents (personne mineure)' },
  { id: 'police', libelle: 'Police' },
  { id: 'cnesst', libelle: 'CNESST' },
]

/** Genres où une personne a été blessée (personne obligatoire, section Blessure). */
export const avecBlessure = (g: GenreRapport) => g === 'accident' || g === 'premiers_soins'
