import { useEffect, useState } from 'react'
import type { Langue } from './habillage'

const langueDeLAdresse = (): Langue | null => {
  const l = new URLSearchParams(window.location.search).get('lang')
  return l === 'en' || l === 'fr' ? l : null
}

/**
 * Langue d'une page publique : celle choisie (?lang=en dans l'adresse, ou le
 * bouton FR/EN), sinon la langue par défaut (ex. celle du groupe, connue
 * après le chargement). Le choix est remis dans l'adresse pour le partage.
 */
export function useLangue(defaut: Langue): [Langue, (l: Langue) => void] {
  const [choisie, setChoisie] = useState<Langue | null>(langueDeLAdresse)
  const langue = choisie ?? defaut
  useEffect(() => {
    document.documentElement.lang = langue
  }, [langue])
  const changer = (l: Langue) => {
    setChoisie(l)
    const url = new URL(window.location.href)
    url.searchParams.set('lang', l)
    window.history.replaceState(null, '', url)
  }
  return [langue, changer]
}
