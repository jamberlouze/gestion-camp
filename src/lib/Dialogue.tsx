import { useEffect, type ReactNode } from 'react'

/** Fenêtre modale : ferme avec Échap ou un clic sur le fond. */
export function Dialogue({
  titre,
  fermer,
  children,
  large,
}: {
  titre: string
  fermer: () => void
  children: ReactNode
  large?: boolean
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
    </div>
  )
}
