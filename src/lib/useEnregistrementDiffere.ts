import { useEffect, useRef, useState } from 'react'

/**
 * Valeur affichée tout de suite, enregistrée un peu plus tard : plusieurs
 * touches « + » de suite ne font qu'un envoi. Envoyée aussi en quittant.
 */
export function useEnregistrementDiffere(valeur: number, enregistrer: (n: number) => void, delai = 700) {
  const [locale, setLocale] = useState<number | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [base, setBase] = useState(valeur)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enAttente = useRef<number | null>(null)
  const dernier = useRef(enregistrer)
  const actuelle = useRef(valeur)
  useEffect(() => {
    dernier.current = enregistrer
    actuelle.current = valeur
  })
  // La valeur enregistrée a changé (notre envoi, ou un autre appareil) : on
  // l'affiche, sauf pendant qu'on tape encore.
  if (valeur !== base) {
    setBase(valeur)
    if (!enCours) setLocale(null)
  }

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current)
      if (enAttente.current != null && enAttente.current !== actuelle.current) dernier.current(enAttente.current)
    },
    [],
  )

  const changer = (n: number) => {
    setLocale(n)
    setEnCours(true)
    enAttente.current = n
    if (minuterie.current) clearTimeout(minuterie.current)
    minuterie.current = setTimeout(() => {
      minuterie.current = null
      const v = enAttente.current
      enAttente.current = null
      setEnCours(false)
      // L'affichage optimiste prend le relais (`locale` reste juste d'ici là).
      if (v != null && v !== actuelle.current) dernier.current(v)
      else setLocale(null)
    }, delai)
  }
  return [locale ?? valeur, changer] as const
}
