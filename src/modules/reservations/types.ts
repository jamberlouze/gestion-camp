// Types du module Réservations (tables du schéma `reservations`).

export type Forfait = 'classe_nature' | 'journee_plein_air' | 'accueil_groupe' | 'location_salle'
export type Variante = 'verte' | 'blanche' | 'rouge' | 'jour' | 'soir' | 'complete' | 'sur_mesure'
export type Ratio = '1:10' | '1:15' | '1:20' | '1:30' | '1:X' | 'aucun'
export type Etape =
  | 'nouvelle'
  | 'contact'
  | 'estime_envoye'
  | 'estime_accepte'
  | 'contrat_envoye'
  | 'confirmee'
  | 'pre_arrivee'
  | 'terminee'
  | 'facture_finale'
  | 'soldee'
export type Fermeture = 'closed_lost' | 'annulee' | 'en_attente'
export type RaisonPerte =
  | 'prix'
  | 'dates'
  | 'ailleurs'
  | 'installations'
  | 'projet_annule'
  | 'aucune_reponse'
  | 'information'
  | 'distance'
  | 'airbnb'
  | 'opikawa'
  | 'autre'

export interface Reservation {
  id: string
  numero: string
  exercice: number
  numero_seq: number
  nom: string
  compagnie_id: string
  organisation_id: string | null
  contact_reservation_id: string | null
  contact_facturation_id: string | null
  courriel_direction: string | null
  forfait: Forfait
  variante: Variante | null
  forfait_demande: Forfait | null
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  heures_regulieres: boolean | null
  nb_participants: number | null
  nb_accompagnateurs: number | null
  ages: string | null
  langue: string | null
  description: string | null
  commentaires_client: string | null
  ratio: Ratio | null
  service_repas: boolean
  nb_dejeuners: number
  nb_diners: number
  nb_soupers: number
  nb_collations: number
  heures_extra: number
  heures_supplementaires: number
  etages: string[]
  salles: string[]
  etape: Etape
  fermeture: Fermeture | null
  raison_perte: RaisonPerte | null
  responsable_id: string | null
  provenance: string | null
  notes_contrat: string | null
  retroaction: string | null
  depot_securite: 'pris' | 'relache' | 'encaisse' | null
  montant_estime: number | null
  demande_le: string
  signe_le: string | null
  origine: 'app' | 'formulaire' | 'import' | 'airbnb'
  ref_externe: string | null
  created_at: string
  updated_at: string
}

export type StatutEstime = 'brouillon' | 'envoye' | 'accepte' | 'remplace' | 'refuse'

export interface Estime {
  id: string
  reservation_id: string
  version: number
  statut: StatutEstime
  exercice_prix: number
  date_estime: string
  sous_total: number
  tps: number
  tvq: number
  total: number
  notes: string | null
  importe: boolean
  envoye_le: string | null
  accepte_le: string | null
  created_at: string
  updated_at: string
}

export interface Ligne {
  id: string
  estime_id: string
  ordre: number
  produit_id: string | null
  code: string | null
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  pourcentage: number | null
  montant: number
  auto: boolean
  created_at: string
}

export type Categorie =
  | 'hebergement'
  | 'nuitee'
  | 'repas'
  | 'animation'
  | 'surveillance'
  | 'salle'
  | 'restauration'
  | 'cuisine'
  | 'service'
  | 'materiel'
  | 'activite'
  | 'transport'
  | 'billet'
  | 'etat_des_lieux'
  | 'autre'

export type Unite =
  | 'par_lit_nuit'
  | 'par_personne_nuit'
  | 'par_personne_repas'
  | 'par_personne_jour'
  | 'par_personne'
  | 'par_nuit'
  | 'par_soiree'
  | 'par_jour'
  | 'par_heure'
  | 'par_repas'
  | 'par_bloc'
  | 'par_voyage'
  | 'aller_retour'
  | 'forfait'
  | 'unite'

export interface Produit {
  id: string
  code: string
  nom: string
  categorie: Categorie
  unite: Unite
  forfaits: Forfait[]
  etages: string[] | null
  majoration: number | null
  ajout: number | null
  arrondi: 'aucun' | 'dollar_superieur'
  note_minimum: string | null
  systeme: boolean
  extra: boolean
  actif: boolean
  ordre: number
}

export interface Prix {
  produit_id: string
  exercice: number
  prix: number | null
  cout: number | null
}

export interface Reglage {
  cle: string
  valeur: unknown
}

export interface EntreeJournal {
  id: string
  reservation_id: string
  quand: string
  genre: 'etape' | 'fermeture' | 'document' | 'courriel' | 'note'
  texte: string
  auteur: string | null
  auteur_nom: string | null
}

export interface EtageRooming {
  code: string
  nom: string
  lits: number
  chambres: number
}

export interface Responsable {
  id: string
  nom: string
}

// ------------------------------------------------------------------
// Libellés
// ------------------------------------------------------------------

export const FORFAITS: Record<Forfait, string> = {
  classe_nature: 'Classe nature',
  journee_plein_air: 'Journée plein air',
  accueil_groupe: 'Accueil de groupe',
  location_salle: 'Location de salle',
}

export const VARIANTES: Record<Forfait, { valeur: Variante; libelle: string }[]> = {
  classe_nature: [
    { valeur: 'verte', libelle: 'Classe verte' },
    { valeur: 'blanche', libelle: 'Classe blanche' },
    { valeur: 'rouge', libelle: 'Classe rouge' },
  ],
  journee_plein_air: [],
  accueil_groupe: [],
  location_salle: [
    { valeur: 'jour', libelle: 'Jour (9 h - 17 h)' },
    { valeur: 'soir', libelle: 'Soir (16 h - 23 h)' },
    { valeur: 'complete', libelle: 'Journée complète (9 h - 23 h)' },
    { valeur: 'sur_mesure', libelle: 'Sur mesure' },
  ],
}

export const RATIOS: { valeur: Ratio; libelle: string }[] = [
  { valeur: '1:10', libelle: '1:10' },
  { valeur: '1:15', libelle: '1:15' },
  { valeur: '1:20', libelle: '1:20' },
  { valeur: '1:X', libelle: '1:X (1 seul animateur)' },
  { valeur: 'aucun', libelle: 'Sans animation' },
]

export const ETAPES: { valeur: Etape; libelle: string }[] = [
  { valeur: 'nouvelle', libelle: 'Nouvelle demande' },
  { valeur: 'contact', libelle: 'Contact établi' },
  { valeur: 'estime_envoye', libelle: 'Estimé envoyé' },
  { valeur: 'estime_accepte', libelle: 'Estimé accepté' },
  { valeur: 'contrat_envoye', libelle: 'Contrat envoyé' },
  { valeur: 'confirmee', libelle: 'Confirmée' },
  { valeur: 'pre_arrivee', libelle: 'Pré-arrivée envoyée' },
  { valeur: 'terminee', libelle: 'Séjour terminé' },
  { valeur: 'facture_finale', libelle: 'Facture finale envoyée' },
  { valeur: 'soldee', libelle: 'Soldée' },
]

export const FERMETURES: Record<Fermeture, string> = {
  closed_lost: 'Closed lost',
  annulee: 'Annulée après signature',
  en_attente: 'En attente',
}

export const RAISONS_PERTE: Record<RaisonPerte, string> = {
  prix: 'Prix ou budget',
  dates: 'Dates indisponibles',
  ailleurs: 'A réservé ailleurs',
  installations: 'Installations inadaptées',
  projet_annule: 'Projet annulé ou non approuvé',
  aucune_reponse: 'Aucune réponse (ghost)',
  information: "Simple demande d'information",
  distance: 'Trop loin',
  airbnb: 'Redirigé vers Airbnb',
  opikawa: 'Transféré à Opikawa',
  autre: 'Autre',
}

export const UNITES: Record<Unite, string> = {
  par_lit_nuit: 'par lit, par nuit',
  par_personne_nuit: 'par personne, par nuit',
  par_personne_repas: 'par personne, par repas',
  par_personne_jour: 'par personne, par jour',
  par_personne: 'par personne',
  par_nuit: 'par nuit',
  par_soiree: 'par soirée',
  par_jour: 'par jour',
  par_heure: 'par heure',
  par_repas: 'par repas',
  par_bloc: 'par bloc',
  par_voyage: 'par voyage',
  aller_retour: 'aller-retour',
  forfait: 'forfait',
  unite: "à l'unité",
}

export const CATEGORIES: Record<Categorie, string> = {
  hebergement: 'Hébergement',
  nuitee: 'Nuitée',
  repas: 'Repas',
  animation: 'Animation',
  surveillance: 'Surveillance',
  salle: 'Salle',
  restauration: 'Restauration',
  cuisine: 'Cuisine',
  service: 'Services',
  materiel: 'Matériel',
  activite: 'Activités',
  transport: 'Transport',
  billet: 'Billets',
  etat_des_lieux: 'État des lieux',
  autre: 'Autre',
}

/** Salles des contrats de location (codes des Sheets). */
export const SALLES: { code: string; nom: string; batiment: string }[] = [
  { code: 'SMB', nom: 'Salle à manger', batiment: 'Pavillon principal' },
  { code: 'SV', nom: 'Salle vitrée', batiment: 'Pavillon principal' },
  { code: 'CU', nom: 'Cuisine', batiment: 'Pavillon principal' },
  { code: 'SC', nom: 'Salon Cèdres', batiment: 'Pavillon principal' },
  { code: 'SVF', nom: 'Salon', batiment: 'Vieille-France' },
  { code: 'CVF', nom: 'Cuisinette', batiment: 'Vieille-France' },
]

/** Étages réservables (codes de Rooming), dans l'ordre des contrats. */
export const ETAGES = ['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH'] as const

// ------------------------------------------------------------------
// Documents (phase 2)
// ------------------------------------------------------------------

/** Annexe imprimée en dernière page du contrat (fichier du seau privé). */
export interface Annexe {
  titre: string
  chemin: string
}

/** Compagnie qui facture : ce qui s'imprime sur les documents. */
export interface Compagnie {
  entreprise_id: string
  raison_sociale: string
  nom_court: string
  adresse: string
  courriel: string
  telephone: string
  tps: string | null
  tvq: string | null
  reponse_interac: string
  signataire: string
  logo: string
  consignes_paiement: string
  annexes: Annexe[]
}

export type GenreModele = 'contrat' | 'pre_arrivee'

export interface Modele {
  id: string
  genre: GenreModele
  forfait: Forfait
  titre: string
  contenu: string
  updated_at: string
  updated_by_nom: string | null
}

export type GenreDocument = 'estime' | 'contrat' | 'contrat_signe' | 'pre_arrivee'

/** Position de la case de signature du client dans le PDF du contrat. */
export interface CaseSignature {
  page: number
  x: number
  y: number
  largeur: number
  hauteur: number
}

export interface DocumentPdf {
  id: string
  reservation_id: string
  genre: GenreDocument
  estime_id: string | null
  titre: string
  chemin: string
  empreinte: string
  meta: { signature?: CaseSignature }
  cree_le: string
  cree_par_nom: string | null
}

export interface Signature {
  id: string
  reservation_id: string
  document_id: string
  jeton: string
  statut: 'en_attente' | 'signe' | 'annule'
  envoye_le: string
  echeance: string
  adresse_pdf: string
  signe_le: string | null
  nom_signataire: string | null
  fonction_signataire: string | null
  image: string | null
  adresse_ip: string | null
  navigateur: string | null
  document_signe_id: string | null
}
