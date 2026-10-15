import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// La fenêtre (et Three.js derrière) n'est téléchargée qu'au premier clic.
const LeCamp = lazy(() => import('./accueil/LeCamp'))

/**
 * Œuf de Pâques (demande de Maxime du 2026-10-14) : un petit 🌲 discret à côté
 * du 👉 du Poke ouvre la maquette 3D du camp en grand. Rien ne l'annonce :
 * aux employés de le trouver.
 */
export function CoinMaquette() {
  const [ouverte, setOuverte] = useState(false)

  useEffect(() => {
    if (!ouverte) return
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuverte(false)
    window.addEventListener('keydown', touche)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', touche)
      document.body.style.overflow = avant
    }
  }, [ouverte])

  return (
    <>
      <button
        type="button"
        onClick={() => setOuverte(true)}
        aria-label="Le camp en 3D"
        className="flex size-8 items-center justify-center rounded-lg text-base leading-none opacity-25 grayscale transition hover:bg-pierre-100 hover:opacity-100 hover:grayscale-0 focus-visible:opacity-100 focus-visible:grayscale-0"
      >
        🌲
      </button>
      {/* Hors du menu et de la barre du haut : leur cadre retiendrait la fenêtre */}
      {ouverte &&
        createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="titre-maquette" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 print:hidden">
          <div className="absolute inset-0 bg-pierre-900/50" onClick={() => setOuverte(false)} />
          <div className="relative flex max-h-full w-full max-w-7xl">
            <Suspense fallback={<p className="mx-auto rounded-lg bg-white px-4 py-3 text-sm text-pierre-600 shadow">Chargement de la maquette…</p>}>
              <LeCamp fermer={() => setOuverte(false)} />
            </Suspense>
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
