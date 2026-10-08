import { createContext, useContext } from 'react'
import type { Entreprise, Profil } from '@/lib/types'
import { aujourdhui } from '@/shell/pokes'
import { GENRES, type Personne, type Point, type Recurrent, type Reunion, type StatutPoint, type Suivi } from './types'

// ------------------------------------------------------------
// Données communes du module (chargées une fois par index.tsx)
// ------------------------------------------------------------

export interface Donnees {
  points: Point[]
  suivis: Suivi[]
  reunions: Reunion[]
  recurrents: Recurrent[]
  personnes: Personne[]
  entreprises: Entreprise[]
  /** Jours de réunion du quotidien → heure du dernier point traité. */
  jours: Map<string, string>
  ecriture: boolean
  moi: Profil
}

export const ContexteReunions = createContext<Donnees | null>(null)

export function useDonnees() {
  const d = useContext(ContexteReunions)
  if (!d) throw new Error('useDonnees hors du module Réunions')
  return d
}

/** Réunions spéciales encore à venir (ou sans date), pour « Envoyer vers… ». */
export function reunionsAVenir(reunions: Reunion[]) {
  const auj = aujourdhui()
  return reunions
    .filter((r) => !r.jour || r.jour >= auj)
    .sort((a, b) => (a.jour ?? '9999').localeCompare(b.jour ?? '9999') || a.titre.localeCompare(b.titre, 'fr'))
}

/** Place en fin de liste dans une réunion spéciale. */
export const ordreEnFin = () => Date.now()

export const nomReunion = (r: Reunion) => `${GENRES.find((g) => g.id === r.genre)?.icone ?? ''} ${r.titre}`.trim()

/** Ligne complète d'un nouveau point, pour l'affichage optimiste (la base pose l'auteur). */
export function nouveauPoint(champs: Partial<Point> & { texte: string }, moi: Profil): Point {
  const maintenant = new Date().toISOString()
  const statut = champs.statut ?? 'ouvert'
  return {
    id: crypto.randomUUID(),
    details: null,
    type: 'discussion',
    urgent: false,
    duree_min: null,
    reunion_id: null,
    ordre: 0,
    pour_le: null,
    recurrent_id: null,
    decision: null,
    traite_par_nom: statut === 'ouvert' ? null : moi.nom,
    traite_le: statut === 'ouvert' ? null : maintenant,
    traite_jour: statut === 'ouvert' ? null : aujourdhui(),
    auteur: moi.id,
    auteur_nom: moi.nom ?? moi.courriel.split('@')[0],
    created_at: maintenant,
    ...champs,
    statut,
  }
}

/** Champs qu'on envoie à la base (sans ceux qu'elle pose elle-même). */
export function aEnvoyer(p: Point): Partial<Point> & { id: string } {
  const { id, texte, details, type, urgent, duree_min, reunion_id, ordre, pour_le, recurrent_id, statut, decision } = p
  return { id, texte, details, type, urgent, duree_min, reunion_id, ordre, pour_le, recurrent_id, statut, decision }
}

/** Champs d'affichage optimiste quand un point change de statut. */
export function affichageStatut(statut: StatutPoint, moi: Profil): Partial<Point> {
  return statut === 'ouvert'
    ? { traite_le: null, traite_jour: null, traite_par_nom: null }
    : { traite_le: new Date().toISOString(), traite_jour: aujourdhui(), traite_par_nom: moi.nom }
}

