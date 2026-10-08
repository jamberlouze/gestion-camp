export type Genre =
  | 'ecole_primaire'
  | 'ecole_secondaire'
  | 'cegep'
  | 'universite'
  | 'entreprise'
  | 'organisme'
  | 'particulier'
  | 'club_sportif'
  | 'municipalite'
  | 'association_etudiante'
  | 'autre'
export type Etape = 'identification' | 'contacte' | 'conversation' | 'conclusion'
export type Saison = 'hiver' | 'printemps' | 'ete' | 'automne'
export type GenreEchange = 'appel' | 'message_vocal' | 'texto' | 'courriel' | 'visite' | 'rencontre' | 'note'
export type StatutRelance = 'a_faire' | 'faite' | 'annulee'
/** Calculé par l'app d'après les vraies données (jamais stocké). */
export type Statut = 'cible' | 'prospect' | 'client' | 'inactif'

export interface Organisation {
  id: string
  nom: string
  genre: Genre
  ville: string | null
  adresse: string | null
  province: string | null
  code_postal: string | null
  telephone: string | null
  site_web: string | null
  notes: string | null
  conseiller_id: string | null
  etape: Etape | null
  prioritaire: boolean
  cycle_ans: number
  airtable_client_id: string | null
  copper_id: string | null
  /** Statut noté dans Copper à l'import (seulement si l'app ne connaît aucun séjour). */
  statut_depart: 'client' | 'inactif' | null
  statut_depart_le: string | null
  created_at: string
}

export interface Contact {
  id: string
  organisation_id: string
  nom: string
  fonction: string | null
  courriel: string | null
  telephone: string | null
  notes: string | null
  principal: boolean
}

export interface Echange {
  id: string
  organisation_id: string
  contact_id: string | null
  genre: GenreEchange
  jour: string
  texte: string
  auteur: string | null
  auteur_nom: string | null
  /** Réservation concernée (journal de la réservation). */
  reservation_id: string | null
  created_at: string
}

export interface Visite {
  id: string
  organisation_id: string
  date_arrivee: string
  date_depart: string
  nb_participants: number | null
  note: string | null
}

export interface Relance {
  id: string
  organisation_id: string
  titre: string
  echeance: string
  assigne_a: string | null
  statut: StatutRelance
  note: string | null
  source_cle: string | null
  /** Réservation concernée (prochaine action d'une demande). */
  reservation_id: string | null
  faite_le: string | null
  faite_par_nom: string | null
  auteur_nom: string | null
  created_at: string
}

export interface Regle {
  id: string
  genre: Genre | null
  organisation_id: string | null
  saison: Saison | null
  mois_avant: number
}

/** Séjour de la base de réservations Airtable (lu par crm.sejours()). */
export interface Sejour {
  id: string
  airtable_client_id: string | null
  nom_groupe: string
  numero: string | null
  type_sejour: string | null
  etat: string | null
  date_arrivee: string
  date_depart: string
  nb_participants: number | null
}

export interface Conseiller {
  id: string
  nom: string
}

export const GENRES: { id: Genre; nom: string }[] = [
  { id: 'ecole_primaire', nom: 'École primaire' },
  { id: 'ecole_secondaire', nom: 'École secondaire' },
  { id: 'cegep', nom: 'Cégep' },
  { id: 'universite', nom: 'Université' },
  { id: 'entreprise', nom: 'Entreprise' },
  { id: 'organisme', nom: 'Organisme (OSBL/OBNL)' },
  { id: 'particulier', nom: 'Particulier' },
  { id: 'club_sportif', nom: 'Club sportif' },
  { id: 'municipalite', nom: 'Ville ou municipalité' },
  { id: 'association_etudiante', nom: 'Association étudiante' },
  { id: 'autre', nom: 'Autre' },
]

/** Pipeline de démarchage (Copper, Vickie). Après « Conclusion » : demande de réservation. */
export const ETAPES: { id: Etape; nom: string }[] = [
  { id: 'identification', nom: 'Identification' },
  { id: 'contacte', nom: 'Contacté' },
  { id: 'conversation', nom: 'En conversation' },
  { id: 'conclusion', nom: 'Conclusion' },
]

export const SAISONS: { id: Saison; nom: string; icone: string }[] = [
  { id: 'automne', nom: 'Automne', icone: '🍁' },
  { id: 'hiver', nom: 'Hiver', icone: '❄️' },
  { id: 'printemps', nom: 'Printemps', icone: '🌱' },
  { id: 'ete', nom: 'Été', icone: '☀️' },
]

export const STATUTS: { id: Statut; nom: string; style: string }[] = [
  { id: 'cible', nom: 'Cible', style: 'border-pierre-300 bg-pierre-50 text-pierre-700' },
  { id: 'prospect', nom: 'Prospect', style: 'border-amber-300 bg-amber-50 text-amber-800' },
  { id: 'client', nom: 'Client', style: 'border-foret-300 bg-foret-50 text-foret-800' },
  { id: 'inactif', nom: 'Client inactif', style: 'border-red-200 bg-red-50 text-red-700' },
]

export const GENRES_ECHANGE: { id: GenreEchange; nom: string; icone: string }[] = [
  { id: 'appel', nom: 'Appel', icone: '📞' },
  { id: 'message_vocal', nom: 'Message vocal', icone: '📟' },
  { id: 'texto', nom: 'Texto', icone: '💬' },
  { id: 'courriel', nom: 'Courriel', icone: '✉️' },
  { id: 'visite', nom: 'Visite du site', icone: '🏕️' },
  { id: 'rencontre', nom: 'Rencontre', icone: '🤝' },
  { id: 'note', nom: 'Note', icone: '📝' },
]

export const nomGenre = (g: Genre) => GENRES.find((x) => x.id === g)?.nom ?? g
export const nomEtape = (e: Etape) => ETAPES.find((x) => x.id === e)?.nom ?? e
export const nomSaison = (s: Saison) => SAISONS.find((x) => x.id === s)?.nom ?? s
