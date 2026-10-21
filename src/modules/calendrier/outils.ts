import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { aujourdhui, estIso } from './dates'
import { occurrences } from './recurrence'
import { PHASES } from './sejours'
import type { Batiment, Evenement, Phase, PresenceJour, Sejour } from './types'

/**
 * Date affichée, gardée dans l'adresse (?date=AAAA-MM-JJ) : elle suit d'un
 * onglet à l'autre, se partage et permet de remonter dans l'historique.
 */
export function useDateChoisie(): [string, (d: string) => void] {
  const [params, setParams] = useSearchParams()
  const brute = params.get('date')
  const date = estIso(brute) ? brute : aujourdhui()
  const choisir = (d: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (d === aujourdhui()) n.delete('date')
        else n.set('date', d)
        return n
      },
      { replace: true },
    )
  return [date, choisir]
}

export const sejourDuJour = (s: Sejour, jour: string) => s.date_arrivee <= jour && jour <= s.date_depart

const AUCUNE_PHASE: ReadonlySet<Phase> = new Set()

/** Séjours qui touchent la plage, sauf ceux des phases masquées. */
export function useSejoursPlage(sejours: Sejour[] | undefined, debut: string, fin: string, masquees = AUCUNE_PHASE) {
  return useMemo(
    () => (sejours ?? []).filter((s) => !masquees.has(s.phase) && s.date_arrivee <= fin && s.date_depart >= debut),
    [sejours, debut, fin, masquees],
  )
}

const CLE_PHASES = 'calendrier-phases-masquees'

/**
 * Phases masquées dans la grille (demande de Maxime : afficher ou masquer
 * chaque calendrier de vente), gardées sur l'appareil. Toutes affichées au départ.
 */
export function usePhasesMasquees(): [ReadonlySet<Phase>, (p: Phase) => void] {
  const [masquees, setMasquees] = useState<ReadonlySet<Phase>>(() => {
    try {
      const lues = JSON.parse(localStorage.getItem(CLE_PHASES) ?? '[]') as unknown
      return new Set(PHASES.map((p) => p.cle).filter((c) => Array.isArray(lues) && lues.includes(c)))
    } catch {
      return AUCUNE_PHASE
    }
  })
  const basculer = (p: Phase) =>
    setMasquees((avant) => {
      const apres = new Set(avant)
      if (!apres.delete(p)) apres.add(p)
      try {
        localStorage.setItem(CLE_PHASES, JSON.stringify([...apres]))
      } catch {
        // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
      }
      return apres
    })
  return [masquees, basculer]
}

/** Occurrences des événements sur la plage : date → événements (triés par heure). */
export function useEvenementsPlage(evenements: Evenement[] | undefined, debut: string, fin: string) {
  return useMemo(() => {
    const parJour = new Map<string, Evenement[]>()
    for (const ev of evenements ?? []) {
      for (const d of occurrences(ev, debut, fin)) {
        const liste = parJour.get(d) ?? []
        liste.push(ev)
        parJour.set(d, liste)
      }
    }
    for (const liste of parJour.values()) liste.sort((a, b) => (a.heure_debut ?? '99').localeCompare(b.heure_debut ?? '99') || a.titre.localeCompare(b.titre))
    return parJour
  }, [evenements, debut, fin])
}

/** Couleur d'un séjour d'après son bâtiment : vert pour le Pavillon principal, mauve pour Vieille-France. */
export const TEINTES_BATIMENT: Record<Batiment, string> = {
  PP: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  VF: 'bg-violet-100 text-violet-900 border-violet-300',
}
export const TEINTE_AUTRE = 'bg-pierre-100 text-pierre-800 border-pierre-300'

export const teinteSejour = (s: Sejour) => TEINTES_BATIMENT[s.batiment]

/** Bordure d'une phase : de plus en plus pleine à mesure que la vente avance. */
export const BORDURES_PHASE: Record<Phase, string> = {
  demande: 'border-dotted opacity-60',
  estime: 'border-dashed opacity-80',
  contrat: 'border-dashed',
  confirmee_pp: '',
  confirmee_vf: '',
  airbnb: '',
}

/** Personnes au travail : chacune une fois, même dans deux secteurs le même jour (direction et terrain). */
export const nombrePersonnes = (liste: PresenceJour[]) => new Set(liste.map((p) => p.personnel_id)).size

/** Réservation pas encore confirmée (contrat pas signé) : bordure pointillée. */
export const nonConfirme = (s: Sejour) => !s.confirme

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/**
 * Rangée Cuisine du Calendrier (demande de Maxime) : gestionnaires, puis
 * leads, puis help, puis les autres. La fonction (Cuisine › Équipe) arrive
 * dans la description de v_presence_jour ; elle n'est pas affichée.
 */
export function rangFonctionCuisine(fonction: string | null | undefined): number {
  const f = sansAccents(fonction ?? '')
  if (f.startsWith('gestionnaire')) return 0
  if (f.startsWith('lead')) return 1
  if (f.startsWith('help')) return 2
  return 3
}
