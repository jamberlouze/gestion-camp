import { useEffect, type ReactNode } from 'react'

/**
 * Fenêtre modale : ferme avec Échap ou un clic sur le fond. `pied` : barre
 * du bas (boutons) hors de la partie qui défile, qui ne cache jamais le
 * contenu.
 */
export function Dialogue({
  titre,
  fermer,
  children,
  large,
  pied,
}: {
  titre: string
  fermer: () => void
  children: ReactNode
  large?: boolean
  pied?: ReactNode
}) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [fermer])

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => e.target === e.currentTarget && fermer()}
    >
      {pied ? (
        <div
          role="dialog"
          aria-label={titre}
          className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${large ? 'sm:max-w-5xl' : 'sm:max-w-md'}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-4 text-lg font-semibold">{titre}</h2>
            {children}
          </div>
          <div className="shrink-0 border-t border-pierre-200 px-5 py-3">{pied}</div>
        </div>
      ) : (
        <div
          role="dialog"
          aria-label={titre}
          className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${
            large ? 'sm:max-w-5xl' : 'sm:max-w-md'
          }`}
        >
          <h2 className="mb-4 text-lg font-semibold">{titre}</h2>
          {children}
        </div>
      )}
    </div>
  )
}
