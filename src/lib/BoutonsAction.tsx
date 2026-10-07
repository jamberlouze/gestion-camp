import type { ButtonHTMLAttributes } from 'react'
import { IconeCorbeille, IconeRenommer } from './icones'

// Boutons « Modifier » et « Supprimer » de toute l'app (demande de Maxime du
// 2026-10-07) : même forme, petit crayon pour modifier, petite poubelle et
// texte rouge pour supprimer. Le texte peut être précisé (« Supprimer la
// série », « Supprimer ce véhicule »…).

type Props = ButtonHTMLAttributes<HTMLButtonElement>

const base =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border bg-white px-2.5 py-1 text-sm font-medium disabled:opacity-50'

export const classeModifier = `${base} border-pierre-300 text-pierre-800 hover:bg-pierre-50`
export const classeSupprimer = `${base} border-pierre-300 text-red-700 hover:border-red-300 hover:bg-red-50`

export function BoutonModifier({ children = 'Modifier', className = '', type = 'button', ...props }: Props) {
  return (
    <button type={type} className={`${classeModifier} ${className}`} {...props}>
      <IconeRenommer className="size-3.5" />
      {children}
    </button>
  )
}

export function BoutonSupprimer({ children = 'Supprimer', className = '', type = 'button', ...props }: Props) {
  return (
    <button type={type} className={`${classeSupprimer} ${className}`} {...props}>
      <IconeCorbeille className="size-3.5" />
      {children}
    </button>
  )
}
