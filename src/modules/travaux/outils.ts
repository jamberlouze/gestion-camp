import { createContext, useContext } from 'react'
import { useAuth } from '@/shell/auth'
import type { Tache } from './types'

// ------------------------------------------------------------- dates ---

/** Date du jour sur l'appareil, AAAA-MM-JJ. */
export const jourAujourdhui = () => new Date().toLocaleDateString('sv-SE')

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 6 oct. » (ou « 6 oct. 2025 » hors de l'année en cours). Accepte une date ou un horodatage. */
export function dateCourte(iso: string) {
  const jour = iso.length > 10 ? new Date(iso).toLocaleDateString('sv-SE') : iso
  const [a, m, j] = jour.split('-').map(Number)
  const annee = a === new Date().getFullYear() ? '' : ` ${a}`
  return `${j} ${MOIS[m - 1]}${annee}`
}

// ------------------------------------------------------------- tâches ---

export const estOuverte = (t: Tache) => t.statut !== 'terminee'

export const enRetard = (t: Tache, jour = jourAujourdhui()) => t.statut === 'a_faire' && !!t.echeance && t.echeance < jour

/** Urgent d'abord, puis l'échéance la plus proche, l'ordre du chantier, la plus ancienne. */
export function comparer(a: Tache, b: Tache) {
  return (
    a.priorite - b.priorite ||
    (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999') ||
    (a.position ?? Infinity) - (b.position ?? Infinity) ||
    a.created_at.localeCompare(b.created_at)
  )
}

/** Terminées : la plus récente d'abord. */
export const comparerFaites = (a: Tache, b: Tache) => (b.fait_le ?? '').localeCompare(a.fait_le ?? '')

export interface Filtres {
  lieu: string
  categorie: string
  /** id d'une personne, 'libre' (à assigner) ou '' (tout le monde). */
  personne: string
  chantier: string
  /** '1', '2', '3' ou '' (toutes). */
  priorite: string
  texte: string
}

export const FILTRES_VIDES: Filtres = { lieu: '', categorie: '', personne: '', chantier: '', priorite: '', texte: '' }

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function filtrer(taches: Tache[], f: Filtres) {
  const texte = sansAccents(f.texte.trim())
  return taches.filter(
    (t) =>
      (!f.lieu || (f.lieu === 'aucun' ? !t.lieu_id : t.lieu_id === f.lieu)) &&
      (!f.categorie || (f.categorie === 'aucune' ? !t.categorie_id : t.categorie_id === f.categorie)) &&
      (!f.personne || (f.personne === 'libre' ? !t.assigne_a : t.assigne_a === f.personne)) &&
      (!f.chantier || t.chantier_id === f.chantier) &&
      (!f.priorite || t.priorite === Number(f.priorite)) &&
      (!texte || sansAccents(`${t.titre} ${t.description ?? ''}`).includes(texte)),
  )
}

// -------------------------------------------------------------- droits ---

/**
 * Qui peut quoi dans Travaux (la base tranche : travaux.verifier_tache et
 * les politiques RLS ; ceci ne sert qu'à l'affichage).
 */
export function useDroits() {
  const { profil, estDirection, peutEcrire } = useAuth()
  const ecriture = peutEcrire('travaux')
  const trieur = estDirection && ecriture
  const moi = profil?.id ?? null
  return {
    moi,
    ecriture,
    /** Direction : trie, assigne, modifie tout, gère les listes. */
    trieur,
    /** Peut envoyer une tâche dans Mastertimeline. */
    annualiser: trieur && peutEcrire('mastertimeline'),
    /** Champs de base (titre, description, lieu, catégorie). */
    modifierBase: (t: Tache) => trieur || (ecriture && t.statut === 'a_trier' && t.signale_par === moi),
    /** Cocher / décocher. */
    cocher: (t: Tache) => ecriture && t.statut !== 'a_trier' && !t.annualisee_vers,
    /** Retirer : rejet par la direction, ou son propre signalement pas encore trié. */
    supprimer: (t: Tache) => trieur || (ecriture && t.statut === 'a_trier' && t.signale_par === moi),
    prendre: (t: Tache) => ecriture && !trieur && t.statut === 'a_faire' && !t.assigne_a,
    laisser: (t: Tache) => ecriture && !trieur && t.statut === 'a_faire' && !!moi && t.assigne_a === moi,
  }
}

export type Droits = ReturnType<typeof useDroits>

// ------------------------------------------------------------- fenêtres ---

export type Fenetre = { type: 'fiche'; id: string } | { type: 'signaler'; defauts?: Partial<Tache> }

export const ContexteFenetre = createContext<(f: Fenetre | null) => void>(() => {})

export function useOuvrir() {
  return useContext(ContexteFenetre)
}
