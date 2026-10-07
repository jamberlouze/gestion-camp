import { useEffect, useState, type ReactNode } from 'react'
import { ACCEPTE_PHOTOS_PDF, estPdf } from './photos'

/** Photo ou PDF joint à une tâche (Travaux, Mastertimeline). */
export interface PieceJointe {
  id: string
  /** Chemin dans le seau : <tache_id>/<id>.jpg ou .pdf */
  chemin: string
  /** Nom d'origine d'un PDF (null pour une photo). */
  nom: string | null
}

/** Adresse où lire le fichier (null tant qu'elle n'est pas prête). Doit être un hook. */
export type UseAdresse<P extends PieceJointe> = (p: P) => string | null

/**
 * Vignettes des photos et des PDF d'une tâche. Un clic sur une photo l'ouvre
 * en grand dans une visionneuse (pas un nouvel onglet) ; un PDF s'ouvre dans
 * un nouvel onglet (lecteur du navigateur). `retirer` : bouton ✕ sur les
 * fichiers qu'on a le droit de retirer. `children` : suite de la rangée
 * (ex. le bouton « Ajouter »).
 */
export function GaleriePieces<P extends PieceJointe>({
  pieces,
  useAdresse,
  retirer,
  children,
}: {
  pieces: P[]
  useAdresse: UseAdresse<P>
  retirer?: (p: P) => (() => void) | undefined
  children?: ReactNode
}) {
  const photos = pieces.filter((p) => !estPdf(p.chemin))
  const [ouverte, setOuverte] = useState<number | null>(null)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pieces.map((p) =>
          estPdf(p.chemin) ? (
            <TuilePdf key={p.id} piece={p} useAdresse={useAdresse} retirer={retirer?.(p)} />
          ) : (
            <Vignette key={p.id} piece={p} useAdresse={useAdresse} ouvrir={() => setOuverte(photos.indexOf(p))} retirer={retirer?.(p)} />
          ),
        )}
        {children}
      </div>
      {ouverte !== null && photos.length > 0 && (
        <Visionneuse photos={photos} useAdresse={useAdresse} index={Math.min(ouverte, photos.length - 1)} changer={setOuverte} fermer={() => setOuverte(null)} />
      )}
    </>
  )
}

/** Bouton « Ajouter » (photo ou PDF) de la même taille que les vignettes. */
export function BoutonAjouterPiece({ lecture, choisir }: { lecture: boolean; choisir: (fichiers: File[]) => void }) {
  return (
    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-pierre-300 text-center text-xs text-pierre-500 hover:border-foret-600 hover:text-foret-700">
      <span className="text-xl">📎</span>
      {lecture ? '…' : 'Photo ou PDF'}
      <input
        type="file"
        accept={ACCEPTE_PHOTOS_PDF}
        multiple
        className="sr-only"
        onChange={(e) => {
          // Copie d'abord : vider le champ vide aussi sa liste de fichiers.
          choisir([...(e.target.files ?? [])])
          // Rechoisir le même fichier doit redéclencher l'envoi.
          e.target.value = ''
        }}
      />
    </label>
  )
}

function BoutonRetirer({ retirer, libelle }: { retirer: () => void; libelle: string }) {
  return (
    <button
      type="button"
      aria-label={libelle}
      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pierre-800 text-xs text-white"
      onClick={retirer}
    >
      ✕
    </button>
  )
}

function Vignette<P extends PieceJointe>({ piece, useAdresse, ouvrir, retirer }: { piece: P; useAdresse: UseAdresse<P>; ouvrir: () => void; retirer?: () => void }) {
  const url = useAdresse(piece)
  return (
    <div className="relative">
      <button type="button" aria-label="Voir la photo en grand" className="block h-20 w-20 overflow-hidden rounded-lg bg-pierre-100 hover:opacity-90" onClick={ouvrir}>
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </button>
      {retirer && <BoutonRetirer retirer={retirer} libelle="Retirer la photo" />}
    </div>
  )
}

function TuilePdf<P extends PieceJointe>({ piece, useAdresse, retirer }: { piece: P; useAdresse: UseAdresse<P>; retirer?: () => void }) {
  const url = useAdresse(piece)
  const nom = piece.nom ?? 'Document PDF'
  return (
    <div className="relative">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        title={nom}
        aria-label={`Ouvrir ${nom}`}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-pierre-200 bg-pierre-50 px-1.5 text-center hover:border-foret-600"
      >
        <span className="text-2xl leading-none">📄</span>
        <span className="line-clamp-2 break-all text-[10px] leading-tight text-pierre-600">{nom}</span>
      </a>
      {retirer && <BoutonRetirer retirer={retirer} libelle="Retirer le PDF" />}
    </div>
  )
}

/** Photo en grand par-dessus tout ; ← → pour passer d'une photo à l'autre, Échap ou clic à côté pour fermer. */
function Visionneuse<P extends PieceJointe>({
  photos,
  useAdresse,
  index,
  changer,
  fermer,
}: {
  photos: P[]
  useAdresse: UseAdresse<P>
  index: number
  changer: (i: number) => void
  fermer: () => void
}) {
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
      <ImageEnGrand photo={photos[index]} useAdresse={useAdresse} />
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

function ImageEnGrand<P extends PieceJointe>({ photo, useAdresse }: { photo: P; useAdresse: UseAdresse<P> }) {
  const url = useAdresse(photo)
  if (!url) return <p className="text-sm text-white/70">Chargement…</p>
  return <img src={url} alt="" className="max-h-[88dvh] max-w-full rounded-lg object-contain shadow-2xl" />
}

/** « 📷 2 · 📄 1 » : nombre de photos et de PDF, pour les listes de tâches. */
export function CompteurPieces({ pieces, className = 'text-xs text-pierre-500' }: { pieces: PieceJointe[] | undefined; className?: string }) {
  if (!pieces?.length) return null
  const pdf = pieces.filter((p) => estPdf(p.chemin)).length
  const photos = pieces.length - pdf
  return (
    <>
      {photos > 0 && <span className={className}>📷 {photos}</span>}
      {pdf > 0 && <span className={className}>📄 {pdf}</span>}
    </>
  )
}
