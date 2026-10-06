import { useEffect, useState, type ReactNode } from 'react'
import { useAdressePhoto } from './donnees'
import type { Photo } from './types'

/**
 * Vignettes des photos d'une tâche ; un clic ouvre la photo en grand dans
 * une visionneuse (pas un nouvel onglet). `retirer` : bouton ✕ sur les
 * photos qu'on a le droit de retirer. `children` : suite de la rangée
 * (ex. le bouton « Ajouter »).
 */
export function GaleriePhotos({ photos, retirer, children }: { photos: Photo[]; retirer?: (p: Photo) => (() => void) | undefined; children?: ReactNode }) {
  const [ouverte, setOuverte] = useState<number | null>(null)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <Vignette key={p.id} photo={p} ouvrir={() => setOuverte(i)} retirer={retirer?.(p)} />
        ))}
        {children}
      </div>
      {ouverte !== null && photos.length > 0 && (
        <Visionneuse photos={photos} index={Math.min(ouverte, photos.length - 1)} changer={setOuverte} fermer={() => setOuverte(null)} />
      )}
    </>
  )
}

function Vignette({ photo, ouvrir, retirer }: { photo: Photo; ouvrir: () => void; retirer?: () => void }) {
  const url = useAdressePhoto(photo)
  return (
    <div className="relative">
      <button type="button" aria-label="Voir la photo en grand" className="block h-20 w-20 overflow-hidden rounded-lg bg-pierre-100 hover:opacity-90" onClick={ouvrir}>
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </button>
      {retirer && (
        <button
          type="button"
          aria-label="Retirer la photo"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pierre-800 text-xs text-white"
          onClick={retirer}
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** Photo en grand par-dessus tout ; ← → pour passer d'une photo à l'autre, Échap ou clic à côté pour fermer. */
function Visionneuse({ photos, index, changer, fermer }: { photos: Photo[]; index: number; changer: (i: number) => void; fermer: () => void }) {
  const plusieurs = photos.length > 1
  const precedente = () => changer((index - 1 + photos.length) % photos.length)
  const suivante = () => changer((index + 1) % photos.length)

  useEffect(() => {
    // En capture sur window : Échap ferme la visionneuse sans fermer aussi
    // la fiche de la tâche en dessous.
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer()
      else if (e.key === 'ArrowLeft' && plusieurs) precedente()
      else if (e.key === 'ArrowRight' && plusieurs) suivante()
      else return
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  })

  const bouton = 'flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30'
  return (
    <div
      role="dialog"
      aria-label="Photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 print:hidden"
      onMouseDown={(e) => e.target === e.currentTarget && fermer()}
    >
      <ImageEnGrand photo={photos[index]} />
      <button type="button" aria-label="Fermer" className={`${bouton} absolute right-4 top-4 text-xl`} onClick={fermer}>
        ✕
      </button>
      {plusieurs && (
        <>
          <button type="button" aria-label="Photo précédente" className={`${bouton} absolute left-4 top-1/2 -translate-y-1/2`} onClick={precedente}>
            ‹
          </button>
          <button type="button" aria-label="Photo suivante" className={`${bouton} absolute right-4 top-1/2 -translate-y-1/2`} onClick={suivante}>
            ›
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  )
}

function ImageEnGrand({ photo }: { photo: Photo }) {
  const url = useAdressePhoto(photo)
  if (!url) return <p className="text-sm text-white/70">Chargement…</p>
  return <img src={url} alt="" className="max-h-[88dvh] max-w-full rounded-lg object-contain shadow-2xl" />
}
