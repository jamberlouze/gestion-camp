export type TypeChambre = 'enfants' | 'employes' | 'vide'

export const TYPES: { id: TypeChambre; libelle: string }[] = [
  { id: 'enfants', libelle: 'Enfants' },
  { id: 'employes', libelle: 'Employés' },
  { id: 'vide', libelle: 'Vide' },
]

export type Niveau = 'site' | 'batiment' | 'section' | 'etage'

export const NIVEAUX: Record<Niveau, { libelle: string; enfant: Niveau | null }> = {
  site: { libelle: 'Site', enfant: 'batiment' },
  batiment: { libelle: 'Bâtiment', enfant: 'section' },
  section: { libelle: 'Section', enfant: 'etage' },
  etage: { libelle: 'Étage', enfant: null },
}

/** Un lieu de la référence : site (le Camp) > bâtiment > section > étage ; site, section et étage sont facultatifs. */
export interface Lieu {
  id: string
  parent_id: string | null
  niveau: Niveau
  nom: string
  /** Abréviation affichée devant le numéro de chambre (CH, VFB…). */
  code: string | null
  /** false = retiré de la référence (ex. un chalet loué quelques étés) ; les anciens plans le gardent. */
  actif: boolean
  ordre: number
}

export interface Chambre {
  id: string
  /** Bâtiment, section ou étage. */
  lieu_id: string
  numero: string
  /** Lits d'aujourd'hui (référence) ; chaque plan garde sa propre copie. */
  lits: number
  ordre: number
  /** false = retirée de la référence (les anciens plans la gardent). */
  actif: boolean
}

export interface Plan {
  id: string
  nom: string
  en_vigueur: boolean
  archive: boolean
  created_at: string
}

/** Une chambre dans un plan, copiée de la référence à sa création ; sans ligne, la chambre n'est pas dans le plan. */
export interface Occupation {
  id: string
  plan_id: string
  chambre_id: string
  type: TypeChambre
  nombre: number
  /** Lits dans ce plan (0 = fermée). */
  lits: number
}

/** Employé clé nommé dans une chambre : un employé de l'app ou un nom libre. */
export interface Personne {
  id: string
  plan_id: string
  chambre_id: string
  employe_id: string | null
  nom: string | null
  created_at: string
}

export interface Employe {
  id: string
  surnom: string
  actif: boolean
}
