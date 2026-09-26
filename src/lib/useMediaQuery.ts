import { useSyncExternalStore } from 'react'

/** Vrai quand la requête média correspond (ex. '(min-width: 768px)'). */
export function useMediaQuery(requete: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(requete)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(requete).matches,
  )
}
