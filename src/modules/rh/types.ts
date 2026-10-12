// Module RH : recrutement, embauche et dossiers d'employés (plan :
// docs/plan-rh.md). Mêmes noms que le schéma `rh`.

export type GenreSaison = 'hiver' | 'printemps' | 'ete' | 'automne'
export const GENRES_SAISON: { id: GenreSaison; nom: string }[] = [
  { id: 'hiver', nom: 'Hiver' },
  { id: 'printemps', nom: 'Printemps' },
  { id: 'ete', nom: 'Été' },
  { id: 'automne', nom: 'Automne' },
]

export interface Saison {
  id: string
  genre: GenreSaison
  annee: number
  /** « Été 2027 » (colonne calculée par la base) */
  nom: string
  /** Ordre chronologique (calculé) */
  rang: number
  debut: string | null
  fin: string | null
  /** Offerte dans le formulaire public de candidature */
  ouverte: boolean
}

export type GenreDate = 'formation' | 'sejour' | 'semaine' | 'autre'
export const GENRES_DATE: { id: GenreDate; nom: string }[] = [
  { id: 'formation', nom: 'Formation' },
  { id: 'sejour', nom: 'Séjour (classe verte, journée plein air)' },
  { id: 'semaine', nom: "Semaine d'été" },
  { id: 'autre', nom: 'Autre' },
]

export interface DateSaison {
  id: string
  saison_id: string
  genre: GenreDate
  nom: string
  debut: string | null
  fin: string | null
  obligatoire: boolean
  note: string | null
  ordre: number
}

export interface Poste {
  id: string
  nom: string
  entreprise_id: string
  genres: GenreSaison[]
  description_url: string | null
  actif: boolean
  ordre: number
}

export interface Personne {
  id: string
  prenom: string
  nom_famille: string
  /** « Nom, Prénom » (calculé par la base) */
  nom_complet: string
  /** Nom de camp */
  surnom: string | null
  courriel: string | null
  telephone: string | null
  date_naissance: string | null
  sexe: 'f' | 'm' | 'x' | null
  notes: string | null
  ne_pas_reembaucher: boolean
  raison_ne_pas: string | null
  vaj_le: string | null
  vaj_note: string | null
  employe_id: string | null
  airtable_ids: string[]
  created_at: string
}

export type Diete = 'reguliere' | 'vegetarienne' | 'sans_lactose' | 'sans_porc' | 'sans_gluten'
export const DIETES: { id: Diete; nom: string }[] = [
  { id: 'reguliere', nom: 'Régulière' },
  { id: 'vegetarienne', nom: 'Végétarienne' },
  { id: 'sans_lactose', nom: 'Sans lactose' },
  { id: 'sans_porc', nom: 'Sans porc' },
  { id: 'sans_gluten', nom: 'Sans gluten' },
]
export const TAILLES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
export type Taille = (typeof TAILLES)[number]

export interface Dossier {
  personne_id: string
  adresse: string | null
  ville: string | null
  province: string | null
  code_postal: string | null
  pays: string | null
  assurance_maladie: string | null
  etudiant_temps_plein: boolean | null
  etudes: string | null
  allergies: string | null
  diete: Diete | null
  taille_tshirt: Taille | null
  taille_hoodie: Taille | null
  urgence1_nom: string | null
  urgence1_lien: string | null
  urgence1_telephone: string | null
  urgence2_nom: string | null
  urgence2_lien: string | null
  urgence2_telephone: string | null
  updated_at: string
}

/** Paie telle que l'app peut la lire : jamais le NAS ni le compte en clair. */
export interface PaieMasquee {
  personne_id: string
  nas_fin: string | null
  transit: string | null
  institution: string | null
  compte_fin: string | null
  specimen: string | null
  updated_at: string
  updated_by_nom: string | null
}

/** Rendu par rh.lire_paie (chaque appel est noté). */
export interface PaieEnClair {
  nas?: string | null
  transit?: string | null
  institution?: string | null
  compte?: string | null
}

export type Statut =
  | 'recue'
  | 'entrevue_proposee'
  | 'en_attente'
  | 'acceptee'
  | 'refusee_apres_entrevue'
  | 'refusee_equipe_complete'
  | 'aspi_proposee'
  | 'permis_travail'
  | 'a_refuse'
  | 'ne_revient_pas'

/** Statuts d'une candidature, dans l'ordre du tri. `ouvert` : il reste quelque chose à faire. */
export const STATUTS: { id: Statut; nom: string; couleur: string; ouvert: boolean }[] = [
  { id: 'recue', nom: 'À traiter', couleur: 'bg-sky-100 text-sky-800', ouvert: true },
  { id: 'entrevue_proposee', nom: 'Entrevue proposée', couleur: 'bg-violet-100 text-violet-800', ouvert: true },
  { id: 'en_attente', nom: 'En attente', couleur: 'bg-amber-100 text-amber-800', ouvert: true },
  { id: 'permis_travail', nom: 'Question de permis de travail', couleur: 'bg-amber-100 text-amber-800', ouvert: true },
  { id: 'aspi_proposee', nom: 'ASPI proposé', couleur: 'bg-teal-100 text-teal-800', ouvert: false },
  { id: 'acceptee', nom: 'Acceptée', couleur: 'bg-foret-100 text-foret-800', ouvert: false },
  { id: 'refusee_apres_entrevue', nom: 'Refusée après entrevue', couleur: 'bg-pierre-100 text-pierre-700', ouvert: false },
  { id: 'refusee_equipe_complete', nom: 'Refusée (équipe complète)', couleur: 'bg-pierre-100 text-pierre-700', ouvert: false },
  { id: 'a_refuse', nom: 'A refusé le poste', couleur: 'bg-pierre-100 text-pierre-700', ouvert: false },
  { id: 'ne_revient_pas', nom: 'Ne revient pas', couleur: 'bg-pierre-100 text-pierre-700', ouvert: false },
]
export const statutDe = (id: Statut) => STATUTS.find((s) => s.id === id)!

export type PreDecision = 'oui' | 'peut_etre' | 'bof' | 'non' | 'aspi'
export const PRE_DECISIONS: { id: PreDecision; nom: string; couleur: string }[] = [
  { id: 'oui', nom: 'Oui', couleur: 'bg-foret-100 text-foret-800 border-foret-300' },
  { id: 'peut_etre', nom: 'Peut-être', couleur: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'bof', nom: 'Bof', couleur: 'bg-orange-50 text-orange-800 border-orange-300' },
  { id: 'non', nom: 'Non', couleur: 'bg-red-50 text-red-800 border-red-300' },
  { id: 'aspi', nom: 'Proposer ASPI', couleur: 'bg-teal-50 text-teal-800 border-teal-300' },
]

export type Source = 'formulaire' | 'retour' | 'manuel' | 'import'
export const SOURCES: Record<Source, string> = {
  formulaire: 'Formulaire',
  retour: 'Intention de retour',
  manuel: 'Ajoutée à la main',
  import: 'Airtable',
}

/** Réponses du formulaire de candidature (clés de `candidatures.reponses`), dans l'ordre d'affichage. */
export const REPONSES: { cle: string; nom: string; long?: boolean }[] = [
  { cle: 'intention', nom: 'Intention de revenir' },
  { cle: 'niveau_etudes', nom: "Niveau d'études" },
  { cle: 'citoyennete', nom: 'Statut de citoyenneté' },
  { cle: 'francais', nom: 'Français' },
  { cle: 'anglais', nom: 'Anglais' },
  { cle: 'date_debut', nom: 'Disponible à partir du' },
  { cle: 'empechements', nom: 'Empêchements' },
  { cle: 'motivation', nom: 'Motivation', long: true },
  { cle: 'connu_par', nom: "Ce qui l'a incité à postuler" },
  { cle: 'refere_par', nom: 'Référé par' },
  { cle: 'autre', nom: 'Autres informations', long: true },
  { cle: 'postes_texte', nom: 'Postes demandés (texte)' },
]

export interface Candidature {
  id: string
  personne_id: string
  source: Source
  recue_le: string
  saison_ids: string[]
  poste_ids: string[]
  reponses: Record<string, string>
  statut: Statut
  pre_decision: PreDecision | null
  commentaires: string | null
  entrevue_le: string | null
  notes_entrevue: string | null
  entreprise_id: string | null
  saison_id: string | null
  poste_id: string | null
  echelon: number | null
  efface_le: string | null
  airtable_id: string | null
  created_at: string
}

export type StatutEmbauche = 'a_envoyer' | 'envoyee' | 'dossier_recu' | 'complete' | 'annulee'
export const STATUTS_EMBAUCHE: { id: StatutEmbauche; nom: string; couleur: string }[] = [
  { id: 'a_envoyer', nom: 'Dossier à envoyer', couleur: 'bg-sky-100 text-sky-800' },
  { id: 'envoyee', nom: 'Lien envoyé', couleur: 'bg-violet-100 text-violet-800' },
  { id: 'dossier_recu', nom: 'Dossier reçu', couleur: 'bg-amber-100 text-amber-800' },
  { id: 'complete', nom: 'Complète', couleur: 'bg-foret-100 text-foret-800' },
  { id: 'annulee', nom: 'Annulée', couleur: 'bg-pierre-100 text-pierre-600' },
]
export const statutEmbaucheDe = (id: StatutEmbauche) => STATUTS_EMBAUCHE.find((s) => s.id === id)!

export const REMUNERATIONS = { semaine: 'À la semaine', heure: "À l'heure" } as const
export const VACANCES = { aucun: '0 %', chaque_paie: '4 % sur chaque paie', banque: '4 % en banque de vacances' } as const
export const TYPES_EMPLOYE = {
  B: 'B — Probation',
  C: 'C — Contractuel',
  E: 'E — Étudiant',
  P: 'P — Partiel',
  R: 'R — Régulier',
  T: 'T — Temporaire',
} as const
export const ACTIONS_PAIE = { A: 'A — Ajout', M: 'M — Modification' } as const

export interface Embauche {
  id: string
  personne_id: string
  saison_id: string
  entreprise_id: string | null
  poste_id: string | null
  echelon: number | null
  candidature_id: string | null
  statut: StatutEmbauche
  debut: string | null
  fin: string | null
  remuneration: keyof typeof REMUNERATIONS | null
  taux: number | null
  vacances: keyof typeof VACANCES | null
  type_employe: keyof typeof TYPES_EMPLOYE | null
  action_paie: keyof typeof ACTIONS_PAIE | null
  date_embauche: string | null
  disponibilites: string[]
  disponibilites_note: string | null
  code_ethique_le: string | null
  commentaires: string | null
  presentation: Record<string, string>
  dossier_recu_le: string | null
  airtable_id: string | null
  created_at: string
}

export type GenreDocument = 'cv' | 'contrat' | 'consentement_parental' | 'premiers_soins' | 'sauveteur' | 'piece_identite' | 'photo' | 'autre'
export const GENRES_DOCUMENT: { id: GenreDocument; nom: string; expire?: boolean }[] = [
  { id: 'cv', nom: 'CV' },
  { id: 'contrat', nom: 'Contrat signé' },
  { id: 'consentement_parental', nom: 'Consentement parental' },
  { id: 'premiers_soins', nom: 'Carte de premiers soins', expire: true },
  { id: 'sauveteur', nom: 'Carte SN ou Croix de bronze', expire: true },
  { id: 'piece_identite', nom: "Pièce d'identité ou permis de conduire" },
  { id: 'photo', nom: 'Photo' },
  { id: 'autre', nom: 'Autre' },
]

export interface Document {
  id: string
  personne_id: string
  embauche_id: string | null
  candidature_id: string | null
  genre: GenreDocument
  nom: string | null
  chemin: string
  type_mime: string | null
  taille: number | null
  expire_le: string | null
  ajoute_par_nom: string | null
  created_at: string
}

export type GenreNote = 'note' | 'avis_verbal' | 'avis_ecrit' | 'suspension' | 'renvoi'
export const GENRES_NOTE: { id: GenreNote; nom: string; couleur: string }[] = [
  { id: 'note', nom: 'Note', couleur: 'bg-pierre-100 text-pierre-700' },
  { id: 'avis_verbal', nom: 'Avis verbal', couleur: 'bg-amber-100 text-amber-800' },
  { id: 'avis_ecrit', nom: 'Avis écrit', couleur: 'bg-orange-100 text-orange-800' },
  { id: 'suspension', nom: 'Suspension', couleur: 'bg-red-100 text-red-800' },
  { id: 'renvoi', nom: 'Renvoi', couleur: 'bg-red-200 text-red-900' },
]

export interface Note {
  id: string
  personne_id: string
  embauche_id: string | null
  genre: GenreNote
  jour: string
  texte: string
  auteur_nom: string | null
  created_at: string
}

export interface LigneJournal {
  id: string
  personne_id: string
  candidature_id: string | null
  embauche_id: string | null
  genre: string
  texte: string
  auteur_nom: string | null
  le: string
}

export interface Consultation {
  id: number
  personne_id: string
  quoi: 'paie' | 'specimen'
  par_nom: string | null
  le: string
}

/** Compagnie du référentiel (core.entreprises). */
export interface Compagnie {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}
