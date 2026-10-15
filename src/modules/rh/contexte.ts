import { createContext, useContext } from 'react'
import type { Candidature, Compagnie, DateSaison, Embauche, Invitation, Personne, Poste, Saison, Texte } from './types'

/** Données chargées une fois par le module (index.tsx). */
export interface DonneesRh {
  saisons: Saison[]
  dates: DateSaison[]
  postes: Poste[]
  compagnies: Compagnie[]
  personnes: Personne[]
  candidatures: Candidature[]
  embauches: Embauche[]
  /** Intentions de retour envoyées (une par personne et saison visée) */
  invitations: Invitation[]
  /** Textes des pages publiques, toutes les versions */
  textes: Texte[]
  saisonParId: Map<string, Saison>
  posteParId: Map<string, Poste>
  compagnieParId: Map<string, Compagnie>
  personneParId: Map<string, Personne>
  /** Candidatures et embauches d'une personne. */
  candidaturesDe: Map<string, Candidature[]>
  embauchesDe: Map<string, Embauche[]>
  ecriture: boolean
  /** Accès aux renseignements de paie (NAS, banque). */
  paie: { lecture: boolean; ecriture: boolean }
  auj: string
}

export const ContexteRh = createContext<DonneesRh | null>(null)

export function useRh() {
  const d = useContext(ContexteRh)
  if (!d) throw new Error('useRh hors du module RH')
  return d
}
