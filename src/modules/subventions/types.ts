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
  /** Compagnie du référentiel (core.entreprises) ; `name` en est une copie tenue à jour par la base. */
  entreprise_id: string
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
  /** Période financée (emplois, projet ou dépenses admissibles). */
  funded_start: string | null
  funded_end: string | null
  /** Critères d'admissibilité principaux. */
  eligibility_criteria: string | null
  /** Année fiscale (nommée d'après l'année où elle se termine), proposée par la base sauf si fiscal_year_manual. */
  fiscal_year: number
  fiscal_year_manual: boolean
  /** Dernière mise à jour ciblée par Claude. */
  update_checked_at: string | null
  status: Statut
  relevance_justification: string | null
  discovered_at: string
  discovered_fy: number
  origin: 'claude' | 'manuel'
  search_run_id: string | null
  /**
   * Compagnies de la carte (entreprises de recherche) : celles pour qui Claude
   * l'a trouvée ou choisies à la main, et toujours celles qui ont une ligne de
   * suivi (la base les ajoute).
   */
  company_ids: string[]
  program_key: string | null
  previous_grant_id: string | null
  created_at: string
  updated_at: string
}

export type StatutSuivi = 'en_cours' | 'obtenu' | 'refuse'

/**
 * Ligne de suivi (subventions.grant_applications) : une compagnie qui dépose
 * une demande pour une subvention retenue. Le statut de la carte en est tiré
 * par la base (en cours s'il en reste une en cours, sinon obtenue, sinon
 * refusée).
 */
export interface Suivi {
  id: string
  grant_id: string
  company_id: string
  status: StatutSuivi
  amount_requested: number | null
  amount_granted: number | null
  amount_received: number | null
  requested_at: string | null
  granted_at: string | null
  received_at: string | null
  /** Responsable de la demande (compte) ; null = pas encore assignée. */
  responsible_id: string | null
  created_at: string
  updated_at: string
}

/** Personne qu'on peut nommer responsable (subventions.responsables()). */
export interface Responsable {
  id: string
  nom: string
  /** Faux : responsable d'une demande, mais plus accès au module (gardée pour son nom). */
  choisissable: boolean
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
  /** Ligne de suivi (compagnie) ; grant_id est posé par la base. */
  application_id: string
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
  /** large : nouvelles subventions ; ciblee : mise à jour des retenues et obtenues (new_count = nouvelles éditions). */
  kind: 'large' | 'ciblee'
  filled_count: number
  proposed_count: number
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

/** Champs qu'une mise à jour ciblée de Claude peut remplir ou proposer. */
export type ChampPropose =
  | 'source_url'
  | 'open_date'
  | 'deadline_date'
  | 'funded_start'
  | 'funded_end'
  | 'potential_amount_min'
  | 'potential_amount_max'
  | 'eligibility_criteria'

/** Proposition de Claude (subventions.grant_proposals) ; « appliquee » = champ vide rempli directement. */
export interface Proposition {
  id: string
  grant_id: string
  field: ChampPropose
  current_value: string | null
  proposed_value: string
  status: 'a_valider' | 'acceptee' | 'refusee' | 'appliquee'
  source_url: string | null
  comment: string | null
  search_run_id: string | null
  created_at: string
  decided_by: string | null
  decided_at: string | null
}

/** Attribution salariale (subventions.grant_salary_lines) : un employé sur une subvention. */
export interface LigneSalaire {
  id: string
  /** Ligne de suivi (subvention × compagnie) ; grant_id est posé par la base. */
  application_id: string
  grant_id: string
  /** Fiche du référentiel (core.employes), ou null avec un nom libre. */
  employee_id: string | null
  free_name: string | null
  hourly_rate: number | null
  hours: number | null
  salary_amount: number | null
  start_date: string | null
  end_date: string | null
  grant_contribution: number | null
  employer_contribution: number | null
  note: string | null
  created_at: string
  updated_at: string
}
