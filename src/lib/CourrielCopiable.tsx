import { useState, type ReactNode } from 'react'
import { IconeCoche, IconeCopier } from './icones'

/**
 * Courriel cliquable = copié au clic, jamais un lien « mailto: » (règle de
 * Maxime pour toute l'app, 2026-10-16). La petite icône de copie montre
 * qu'on peut le copier ; « Copié » s'affiche deux secondes.
 * Dans une ligne cliquable (`clicLigne`), c'est un bouton : la ligne ne s'ouvre pas.
 * Pages publiques aussi : en anglais selon la langue de la page (`<html lang>`,
 * posée par `useLangue`).
 */
export function CourrielCopiable({ courriel, className = '', avant }: { courriel: string; className?: string; avant?: ReactNode }) {
  const [etat, setEtat] = useState<'' | 'copie' | 'echec'>('')
  const t = document.documentElement.lang === 'en' ? TEXTES.en : TEXTES.fr
  const copier = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(courriel)
      ok = true
    } catch {
      // Navigateur qui refuse le presse-papiers moderne : l'ancienne méthode.
      const zone = document.createElement('textarea')
      zone.value = courriel
      zone.style.position = 'fixed'
      zone.style.opacity = '0'
      document.body.appendChild(zone)
      zone.select()
      ok = document.execCommand('copy')
      zone.remove()
    }
    setEtat(ok ? 'copie' : 'echec')
    setTimeout(() => setEtat(''), 2000)
  }
  return (
    <button
      type="button"
      className={`group inline-flex max-w-full items-center gap-1 text-left ${className}`}
      title={`${courriel} — ${t.titre}`}
      aria-label={`${t.aria} ${courriel}`}
      onClick={copier}
    >
      {avant}
      <span className="min-w-0 truncate">{etat === 'copie' ? t.copie : etat === 'echec' ? t.echec : courriel}</span>
      {etat === 'copie' ? (
        <IconeCoche className="size-3.5 text-foret-600" />
      ) : (
        <IconeCopier className="size-3.5 opacity-50 group-hover:opacity-100" />
      )}
    </button>
  )
}

const TEXTES = {
  fr: { titre: 'cliquer pour copier', aria: 'Copier le courriel', copie: 'Courriel copié', echec: 'Copie impossible' },
  en: { titre: 'click to copy', aria: 'Copy the email', copie: 'Email copied', echec: 'Could not copy' },
}
