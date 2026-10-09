import { useEffect, useState } from 'react'
import type { Langue } from '../demande'

// Outils des pages publiques : langue, montants, dates.

const langueDeLAdresse = (): Langue | null => {
  const l = new URLSearchParams(window.location.search).get('lang')
  return l === 'en' || l === 'fr' ? l : null
}

/**
 * Langue de la page : celle choisie (?lang=en dans l'adresse, ou le
 * bouton FR/EN), sinon la langue par défaut (celle du groupe, connue après
 * le chargement). Le choix est remis dans l'adresse pour le partage.
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

/** Langue d'un groupe (« Anglais », « English »…) → langue des pages. */
export const langueDuGroupe = (langue: string | null | undefined): Langue => (/^(anglais|english)$/i.test(langue?.trim() ?? '') ? 'en' : 'fr')

/** Montant en dollars selon la langue. */
export const dollars = (n: number | string | null | undefined, langue: Langue) =>
  new Intl.NumberFormat(langue === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n ?? 0))

/** Date longue selon la langue (jour civil, sans fuseau). */
export const dateLisible = (jour: string, langue: Langue) =>
  new Intl.DateTimeFormat(langue === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${jour}T00:00:00Z`))
