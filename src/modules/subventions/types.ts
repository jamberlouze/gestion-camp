// Types du schéma subventions (noms de colonnes de la feuille de route).

export type Statut = 'nouveau' | 'a_valider' | 'rejete' | 'en_cours' | 'obtenu' | 'refuse' | 'expire'
export type TypeSubvention = 'salarial' | 'immobilisation' | 'formation' | 'rd' | 'exportation' | 'marketing' | 'autre'
export type CategorieRejet =
  | 'montant_trop_faible'
  | 'criteres_non_respectes'
  | 'deja_explore'
  | 'hors_secteur'
  | 'echeance_trop_courte'
  | 'non_pertinent_organisation'
  | 'non_admissible'
  | 'autre'
export type StatutEtape = 'a_faire' | 'en_cours' | 'complete'

export interface Entreprise {
  id: string
  slug: string
  name: string
  specific_criteria: string | null
  legal_status: string | null
  /** Embauche du personnel : priorité aux subventions salariales dans sa recherche. */
  hires_staff: boolean
  active: boolean
  sort_order: number
}

export interface Subvention {
  id: string
  program_name: string
  organisme: string | null
  description: string | null
  source_url: string | null
  grant_type: TypeSubvention
  potential_amount_min: number | null
  potential_amount_max: number | null
  open_date: string | null
  deadline_date: string | null
  status: Statut
  relevance_justification: string | null
  discovered_at: string
  discovered_fy: number
  origin: 'claude' | 'manuel'
  search_run_id: string | null
  target_company_id: string
  applicant_company_id: string | null
  amount_requested: number | null
  amount_granted: number | null
  amount_received: number | null
  requested_at: string | null
  granted_at: string | null
  received_at: string | null
  program_key: string | null
  previous_grant_id: string | null
  created_at: string
  updated_at: string
}

export interface Feedback {
  id: string
  grant_id: string
  decision: 'valide' | 'rejete'
  reject_category: CategorieRejet | null
  comment: string | null
  decided_by: string
  decided_at: string
}

export interface Note {
  id: string
  grant_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Heures {
  id: string
  grant_id: string
  user_id: string
  hours: number
  entry_date: string
  note: string | null
  created_at: string
}

export interface Etape {
  id: string
  grant_id: string
  description: string
  due_date: string | null
  status: StatutEtape
  completed_at: string | null
  completed_by: string | null
  template_source_step_id: string | null
  sort_order: number
  created_at: string
}

export interface Recherche {
  id: string
  company_id: string
  started_at: string
  finished_at: string | null
  found_count: number
  new_count: number
  duplicate_count: number
  invalid_count: number
  memory_version_id: string | null
  error: string | null
  trigger_source: 'cron' | 'manuel'
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  web_search_count: number | null
  raw_output: string | null
}

export interface Regles {
  id: string
  company_id: string | null
  summary: string
  based_on_feedback_count: number
  generated_at: string
}

export interface Reglage {
  key: string
  value: unknown
}

export interface Rappel {
  week_start: string
  sent_at: string
  recipients: string[]
  new_count: number
  error: string | null
}
