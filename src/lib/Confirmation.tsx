import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { IconeAttention, IconeCorbeille } from './icones'
import { ui } from './ui'

type Options = {
  titre: string
  /** Précisions sous le titre (conséquences, ce qui est conservé…). */
  message?: ReactNode
  libelleOk?: string
  /** Action destructrice (par défaut) : bouton rouge, et le focus va sur « Annuler ». */
  danger?: boolean
  /** Remplace l'icône par défaut (corbeille si danger, sinon avertissement). */
  icone?: ReactNode
}

type Demande = Options & { id: number; repondre: (ok: boolean) => void }

let courante: Demande | null = null
let compteur = 0
const abonnes = new Set<() => void>()
const publier = (d: Demande | null) => {
  courante = d
  abonnes.forEach((f) => f())
}

/**
 * Confirmation dans l'app (au lieu de la fenêtre confirm du navigateur) :
 * renvoie true si la personne confirme. Monter <Confirmations /> une fois.
 */
export function confirmer(options: Options): Promise<boolean> {
  courante?.repondre(false)
  return new Promise((resolve) => {
    const demande: Demande = {
      ...options,
      id: ++compteur,
      repondre: (ok) => {
        if (courante === demande) publier(null)
        resolve(ok)
      },
    }
    publier(demande)
  })
}

export function Confirmations() {
  const demande = useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => courante,
  )
  return demande ? <FenetreConfirmation key={demande.id} demande={demande} /> : null
}

function FenetreConfirmation({ demande }: { demande: Demande }) {
  const { titre, message, libelleOk = 'Supprimer', danger = true, icone, repondre } = demande
  const annuler = useRef<HTMLButtonElement>(null)
  const ok = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null
    ;(danger ? annuler : ok).current?.focus()
    // Phase de capture sur window : Échap ne doit pas fermer aussi la fenêtre en dessous.
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      repondre(false)
    }
    window.addEventListener('keydown', touche, true)
    return () => {
      window.removeEventListener('keydown', touche, true)
      avant?.focus?.()
    }
  }, [danger, repondre])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => e.target === e.currentTarget && repondre(false)}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="confirmation-titre"
        aria-describedby={message ? 'confirmation-message' : undefined}
        className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex gap-4">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-red-50 text-red-600' : 'bg-foret-50 text-foret-700'
            }`}
          >
            {icone ?? (danger ? <IconeCorbeille className="size-5" /> : <IconeAttention className="size-5" />)}
          </div>
          <div className="min-w-0 pt-1.5">
            <h2 id="confirmation-titre" className="font-semibold text-pierre-900">
              {titre}
            </h2>
            {message && (
              <div id="confirmation-message" className="mt-1.5 text-sm whitespace-pre-line text-pierre-600">
                {message}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={annuler} type="button" className={ui.boutonSecondaire} onClick={() => repondre(false)}>
            Annuler
          </button>
          <button ref={ok} type="button" className={danger ? ui.boutonRouge : ui.bouton} onClick={() => repondre(true)}>
            {libelleOk}
          </button>
        </div>
      </div>
    </div>
  )
}
