import { createContext, useContext } from 'react'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import type { Donnees } from './donnees'
import { COULEURS_PRIORITE, PRIORITES, type Priorite, type Tache } from './types'

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

/** Ordre des tâches à faire dans chaque groupe (choix gardé sur l'appareil). */
export type Tri = 'urgence' | 'echeance' | 'recentes' | 'anciennes'

export const TRIS: Record<Tri, string> = {
  urgence: 'Urgence',
  echeance: 'Échéance',
  recentes: 'Plus récentes',
  anciennes: 'Plus anciennes',
}

const COMPARER: Record<Tri, (a: Tache, b: Tache) => number> = {
  urgence: comparer,
  /** L'échéance la plus proche d'abord (en retard en tête), sans échéance à la fin ; puis l'urgence. */
  echeance: (a, b) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999') || comparer(a, b),
  /** Selon la date d'ajout (ou de signalement). */
  recentes: (a, b) => b.created_at.localeCompare(a.created_at),
  anciennes: (a, b) => a.created_at.localeCompare(b.created_at),
}

export const trier = (taches: Tache[], tri: Tri) => [...taches].sort(COMPARER[tri] ?? comparer)

export type Regroupement = 'priorite' | 'lieu' | 'categorie' | 'personne' | 'etiquette' | 'aucun'

/** Bouton du regroupement, et nom d'un groupe dans « Une page par … ». */
export const REGROUPEMENTS: [Regroupement, string, string | null][] = [
  ['priorite', 'Urgence', "niveau d'urgence"],
  ['lieu', 'Lieu', 'lieu'],
  ['categorie', 'Catégorie', 'catégorie'],
  ['personne', 'Personne', 'personne'],
  ['etiquette', 'Étiquette', 'étiquette'],
  ['aucun', 'Aucun', null],
]

export interface Groupe {
  cle: string
  nom: string
  couleur?: string
  taches: Tache[]
}

/** Groupes de l'onglet Tâches et de la liste imprimée (vides retirés, ordre des listes du module). */
export function regrouper(taches: Tache[], r: Regroupement, d: Donnees, etiquettesFiltrees: string[]) {
  const groupes: Groupe[] = []
  const ajouter = (cle: string, nom: string, liste: Tache[], couleur?: string) => {
    if (liste.length) groupes.push({ cle, nom, couleur, taches: liste })
  }
  if (r === 'priorite') {
    for (const n of [1, 2, 3] as Priorite[]) ajouter(String(n), PRIORITES[n], taches.filter((t) => t.priorite === n), COULEURS_PRIORITE[n])
  } else if (r === 'lieu') {
    for (const l of d.lieux) ajouter(l.id, l.nom, taches.filter((t) => t.lieu_id === l.id))
    ajouter('aucun', 'Sans lieu', taches.filter((t) => !t.lieu_id || !d.lieu.has(t.lieu_id)))
  } else if (r === 'categorie') {
    for (const c of d.categories) ajouter(c.id, c.nom, taches.filter((t) => t.categorie_id === c.id))
    ajouter('aucune', 'Sans catégorie', taches.filter((t) => !t.categorie_id || !d.categorie.has(t.categorie_id)))
  } else if (r === 'personne') {
    for (const p of d.personnes) ajouter(p.id, p.nom, taches.filter((t) => t.assigne_a === p.id))
    ajouter('libre', 'À assigner', taches.filter((t) => !t.assigne_a || !d.personne.has(t.assigne_a)))
  } else if (r === 'etiquette') {
    // Une tâche à deux étiquettes paraît dans les deux groupes ; avec le filtre, seulement ceux des étiquettes choisies.
    for (const e of d.etiquettes) {
      if (etiquettesFiltrees.length && !etiquettesFiltrees.includes(e.id)) continue
      ajouter(e.id, e.nom, taches.filter((t) => t.etiquette_ids.includes(e.id)), e.couleur ?? undefined)
    }
    ajouter('aucune', 'Sans étiquette', taches.filter((t) => !d.etiquettes.some((e) => t.etiquette_ids.includes(e.id))))
  } else {
    ajouter('toutes', 'Tâches à faire', taches)
  }
  return groupes
}

export interface Filtres {
  lieu: string
  categorie: string
  /** id d'une personne, 'libre' (à assigner) ou '' (tout le monde). */
  personne: string
  chantier: string
  /** '1', '2', '3' ou '' (toutes). */
  priorite: string
  /** Étiquettes allumées : tâches qui portent l'une d'elles ; vide = toutes (comme Mastertimeline). */
  etiquettes: string[]
  texte: string
}

export const FILTRES_VIDES: Filtres = { lieu: '', categorie: '', personne: '', chantier: '', priorite: '', etiquettes: [], texte: '' }

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
      (!f.etiquettes.length || f.etiquettes.some((e) => t.etiquette_ids.includes(e))) &&
      (!texte || sansAccents(`${t.titre} ${t.description ?? ''}`).includes(texte)),
  )
}

// -------------------------------------------------------------- droits ---

/**
 * Qui peut quoi dans Travaux (la base tranche : travaux.verifier_tache et
 * les politiques RLS ; ceci ne sert qu'à l'affichage).
 */
export function useDroits() {
  const { profil, estDirection, estTerrain, peutEcrire } = useAuth()
  const ecriture = peutEcrire('travaux')
  const trieur = estDirection && ecriture
  const moi = profil?.id ?? null
  return {
    moi,
    ecriture,
    /** Terrain : ne voit que les tâches qui lui sont assignées (rien d'autre). */
    terrain: estTerrain,
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
    /** Terrain ne voit ni les tâches libres ni une tâche laissée : seule la direction assigne. */
    prendre: (t: Tache) => ecriture && !trieur && !estTerrain && t.statut === 'a_faire' && !t.assigne_a,
    laisser: (t: Tache) => ecriture && !trieur && !estTerrain && t.statut === 'a_faire' && !!moi && t.assigne_a === moi,
  }
}

export type Droits = ReturnType<typeof useDroits>

// ------------------------------------------------------------- fenêtres ---

export type Fenetre = { type: 'fiche'; id: string } | { type: 'signaler'; defauts?: Partial<Tache> }

export const ContexteFenetre = createContext<(f: Fenetre | null) => void>(() => {})

export function useOuvrir() {
  return useContext(ContexteFenetre)
}

// ------------------------------------------------------------- champs ---

/**
 * Champ des fenêtres de Travaux : 16 px sur téléphone (sous 16 px, l'iPhone
 * zoome à chaque toucher d'un champ), 14 px dès `sm`, comme ailleurs.
 */
export const champ = ui.champ.replace('text-sm', 'text-base sm:text-sm')
