import { createContext, useContext, useState } from 'react'
import { useAuth } from '@/shell/auth'
import {
  cleAujourdhui,
  cleCoche,
  cleEcheance,
  estAnnuelle,
  etatPassage,
  exerciceDeCle,
  jourAujourdhui,
  passages,
  passeEnMois,
  ponctuelleEnRetard,
  UNIQUE,
  type Etat,
  type IndexCoches,
} from './calendrier'
import { useCocher, type References } from './donnees'
import type { Coche, Projet, Statut, Tache } from './types'

// Outils partagés par les vues (sans composant) : droits, fiche, filtres,
// regroupement, coches et listes de passages.

export const useEcriture = () => useAuth().peutEcrire('mastertimeline')

// ------------------------------------------------------------ fiche ---
// La fiche d'une tâche (dialogue) s'ouvre depuis toutes les vues.

export interface DemandeFiche {
  /** null : nouvelle tâche. */
  tache: Tache | null
  /** Passage regardé ('2026-10' ou 'unique') : la fiche montre aussi sa coche et sa note de l'année. */
  periode?: string
  /** Valeurs de départ d'une nouvelle tâche (ex. le projet ouvert). */
  defauts?: Partial<Tache>
}

export const ContexteFiche = createContext<(d: DemandeFiche) => void>(() => {})
export const useOuvrirFiche = () => useContext(ContexteFiche)

// ---------------------------------------------------------- filtres ---

export interface Filtres {
  entreprise: string
  projet: string
  /** id, '' (tous) ou 'aucun' (sans responsable). */
  responsable: string
  /** id d'une étiquette, ou '' (toutes les tâches). */
  etiquette: string
}

const CLE_FILTRES = 'mastertimeline-filtres'
export const FILTRES_VIDES: Filtres = { entreprise: '', projet: '', responsable: '', etiquette: '' }

/** Filtres gardés sur l'appareil (préférence personnelle). */
export function useFiltres() {
  const [filtres, setFiltres] = useState<Filtres>(() => {
    try {
      return { ...FILTRES_VIDES, ...JSON.parse(localStorage.getItem(CLE_FILTRES) ?? '{}') }
    } catch {
      return FILTRES_VIDES
    }
  })
  const changer = (champs: Partial<Filtres>) =>
    setFiltres((f) => {
      const nouveaux = { ...f, ...champs }
      try {
        localStorage.setItem(CLE_FILTRES, JSON.stringify(nouveaux))
      } catch {
        /* préférence non conservée */
      }
      return nouveaux
    })
  return [filtres, changer] as const
}

/** Le projet est-il offert pour cette entreprise ? (aucune entreprise choisie, ou projet sans entreprise : oui) */
export function offertPour(p: Pick<Projet, 'entreprise_ids'>, entrepriseId: string | null) {
  return !entrepriseId || !p.entreprise_ids?.length || p.entreprise_ids.includes(entrepriseId)
}

export function garder(t: Tache, f: Filtres) {
  if (f.entreprise && t.entreprise_id !== f.entreprise) return false
  if (f.projet && t.projet_id !== f.projet) return false
  if (f.responsable === 'aucun' ? !!t.responsable_id : f.responsable && t.responsable_id !== f.responsable) return false
  if (f.etiquette && !t.etiquette_ids.includes(f.etiquette)) return false
  return true
}

// ------------------------------------------------------- regroupement ---

export type Regroupement = 'entreprise' | 'projet' | 'responsable'

export interface Groupe<T> {
  cle: string
  nom: string
  couleur: string | null
  elements: T[]
}

/** Range des éléments par entreprise, projet ou responsable (les « Sans … » à la fin). */
export function regrouper<T>(elements: T[], tacheDe: (e: T) => Tache, par: Regroupement, refs: References): Groupe<T>[] {
  const groupes = new Map<string, Groupe<T>>()
  for (const e of elements) {
    const t = tacheDe(e)
    const id = par === 'entreprise' ? t.entreprise_id : par === 'projet' ? t.projet_id : t.responsable_id
    const cle = id ?? ''
    if (!groupes.has(cle)) {
      const ref = id ? (par === 'entreprise' ? refs.entreprise.get(id) : par === 'projet' ? refs.projet.get(id) : refs.responsable.get(id)) : null
      const sans = par === 'entreprise' ? 'Sans entreprise' : par === 'projet' ? 'Sans projet' : 'Sans responsable'
      groupes.set(cle, { cle, nom: ref?.nom ?? sans, couleur: ref && 'couleur' in ref ? ref.couleur : null, elements: [] })
    }
    groupes.get(cle)!.elements.push(e)
  }
  const ordre = (g: Groupe<T>) => {
    if (!g.cle) return Infinity
    if (par === 'entreprise') return refs.entreprises.findIndex((x) => x.id === g.cle)
    if (par === 'projet') return refs.projets.findIndex((x) => x.id === g.cle)
    return refs.responsables.findIndex((x) => x.id === g.cle)
  }
  return [...groupes.values()].sort((a, b) => ordre(a) - ordre(b))
}

/**
 * Bascule un statut sur un passage : le même statut une 2e fois l'enlève.
 * La note de l'année est gardée.
 */
export function useBasculer() {
  const cocher = useCocher()
  const { session } = useAuth()
  return (t: Tache, periode: string, coche: Coche | undefined, statut: Statut) => {
    const nouveau = coche?.statut === statut ? null : statut
    const note = coche?.note ?? null
    const ligne: Coche | null =
      nouveau || note
        ? {
            tache_id: t.id,
            periode,
            statut: nouveau,
            note,
            fait_le: nouveau ? jourAujourdhui() : null,
            fait_par: nouveau ? (session?.user.id ?? null) : null,
          }
        : null
    cocher.mutate({ tache_id: t.id, periode, coche: ligne })
  }
}

/** Ce qu'une ligne affiche en plus du titre. */
export interface Montrer {
  entreprise?: boolean
  projet?: boolean
  responsable?: boolean
  /** Responsable changé directement sur la ligne (menu), sans ouvrir la fiche. */
  responsableModifiable?: boolean
  /** Mois du passage (listes qui mélangent plusieurs mois). */
  mois?: boolean
  frequence?: boolean
}

/** Ordre dans une liste : à faire d'abord (par mois, puis titre), puis faites. */
export function trierPassages<T extends { tache: Tache; etat: Etat; periode: string }>(liste: T[]) {
  const rang = (e: Etat) => (e === 'faite' || e === 'sautee' ? 1 : 0)
  return liste.sort(
    (a, b) =>
      rang(a.etat) - rang(b.etat) ||
      a.periode.localeCompare(b.periode) ||
      a.tache.titre.localeCompare(b.tache.titre, 'fr'),
  )
}

export interface Passage {
  tache: Tache
  /** Clé de la coche : mois du passage, ou 'unique' pour une ponctuelle. */
  periode: string
  etat: Etat
  coche: Coche | undefined
}

/** Passages d'un mois : tâches annuelles qui y reviennent et ponctuelles qui y sont dues. */
export function passagesDuMois(taches: Tache[], cle: string, index: IndexCoches, filtres: Filtres): Passage[] {
  const aujourdhui = cleAujourdhui()
  const jour = jourAujourdhui()
  const liste: Passage[] = []
  for (const t of taches) {
    if (!garder(t, filtres)) continue
    if (estAnnuelle(t)) {
      if (!passeEnMois(t, cle)) continue
      const coche = index.get(cleCoche(t.id, cle))
      liste.push({ tache: t, periode: cle, etat: etatPassage(coche, cle, aujourdhui), coche })
    } else if (cleEcheance(t) === cle) {
      const coche = index.get(cleCoche(t.id, UNIQUE))
      const etat: Etat = coche?.statut ?? (ponctuelleEnRetard(t, coche, jour) ? 'retard' : cle === aujourdhui ? 'a_faire' : 'a_venir')
      liste.push({ tache: t, periode: UNIQUE, etat, coche })
    }
  }
  return liste
}

/** Passages pas faits des mois précédents de l'exercice en cours (et ponctuelles échues avant ce mois). */
export function retards(taches: Tache[], index: IndexCoches, filtres: Filtres): Passage[] {
  const aujourdhui = cleAujourdhui()
  const exercice = exerciceDeCle(aujourdhui)
  const liste: Passage[] = []
  for (const t of taches) {
    if (!garder(t, filtres)) continue
    if (estAnnuelle(t)) {
      for (const cle of passages(t, exercice)) {
        if (cle >= aujourdhui) break
        const coche = index.get(cleCoche(t.id, cle))
        if (!coche?.statut) liste.push({ tache: t, periode: cle, etat: 'retard', coche })
      }
    } else {
      const coche = index.get(cleCoche(t.id, UNIQUE))
      const mois = cleEcheance(t)
      if (mois && mois < aujourdhui && !coche?.statut) liste.push({ tache: t, periode: UNIQUE, etat: 'retard', coche })
    }
  }
  return liste
}
