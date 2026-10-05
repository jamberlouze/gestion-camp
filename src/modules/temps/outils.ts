import { useSearchParams } from 'react-router'
import { aujourdhui, debutPeriode, estDebutPeriode, PREMIERE_PERIODE } from './periodes'

export const menu =
  'rounded-lg border border-pierre-300 bg-white px-3 py-1.5 text-sm text-pierre-900 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20'

export const periodeCourante = () => debutPeriode(aujourdhui())

/** Période choisie, gardée dans l'adresse (?periode=AAAA-MM-JJ, un dimanche de début de période). */
export function usePeriode(): [string, (debut: string) => void] {
  const [params, setParams] = useSearchParams()
  const p = params.get('periode')
  const debut = p && estDebutPeriode(p) && p >= PREMIERE_PERIODE ? p : periodeCourante()
  const choisir = (d: string) =>
    setParams(
      (avant) => {
        const suivants = new URLSearchParams(avant)
        if (d === periodeCourante()) suivants.delete('periode')
        else suivants.set('periode', d)
        return suivants
      },
      { replace: true },
    )
  return [debut, choisir]
}
