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

/** Couleur stable d'un séjour (d'après son nom), pour les barres du calendrier. */
const TEINTES = [
  'bg-sky-100 text-sky-900 border-sky-300',
  'bg-amber-100 text-amber-900 border-amber-300',
  'bg-emerald-100 text-emerald-900 border-emerald-300',
  'bg-violet-100 text-violet-900 border-violet-300',
  'bg-rose-100 text-rose-900 border-rose-300',
  'bg-teal-100 text-teal-900 border-teal-300',
  'bg-orange-100 text-orange-900 border-orange-300',
  'bg-indigo-100 text-indigo-900 border-indigo-300',
]
export function teinteSejour(s: Sejour): string {
  let h = 0
  for (const c of s.nom_groupe) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES[h % TEINTES.length]
}

/** Réservation pas encore confirmée : bordure pointillée et mention de l'état. */
export const nonConfirme = (s: Sejour) => !!s.etat && s.etat !== 'Confirmée'
