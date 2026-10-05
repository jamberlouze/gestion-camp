import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { aujourdhui, estIso } from './dates'
import { occurrences } from './recurrence'
import { ETATS_MASQUES, type Evenement, type Sejour } from './types'

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

/** Séjours affichés : pas les réservations perdues. */
export const sejourVisible = (s: Sejour) => !s.etat || !ETATS_MASQUES.has(s.etat)
export const sejourDuJour = (s: Sejour, jour: string) => s.date_arrivee <= jour && jour <= s.date_depart

/** Séjours visibles qui touchent la plage. */
export function useSejoursPlage(sejours: Sejour[] | undefined, debut: string, fin: string) {
  return useMemo(
    () => (sejours ?? []).filter((s) => sejourVisible(s) && s.date_arrivee <= fin && s.date_depart >= debut),
    [sejours, debut, fin],
  )
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

/**
 * Couleur d'un séjour d'après son bâtiment (code Airtable « Bâtiment » :
 * PP, VF…) : vert pour le Pavillon principal, mauve pour Vieille-France,
 * gris sinon. Plusieurs bâtiments : le premier.
 */
export const TEINTES_BATIMENT: { code: string; libelle: string; classes: string }[] = [
  { code: 'PP', libelle: 'Pavillon principal (PP)', classes: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  { code: 'VF', libelle: 'Vieille-France (VF)', classes: 'bg-violet-100 text-violet-900 border-violet-300' },
]
export const TEINTE_AUTRE = 'bg-pierre-100 text-pierre-800 border-pierre-300'

export function teinteSejour(s: Sejour): string {
  const code = (s.batiment ?? '').split(',')[0].trim().toUpperCase()
  return TEINTES_BATIMENT.find((t) => t.code === code)?.classes ?? TEINTE_AUTRE
}

/** Réservation pas encore confirmée : bordure pointillée et mention de l'état. */
export const nonConfirme = (s: Sejour) => !!s.etat && s.etat !== 'Confirmée'
