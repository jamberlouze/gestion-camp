import { useState } from 'react'
import { ui } from '@/lib/ui'

/**
 * Lien secret d'une page publique (page client, fiches participants) :
 * copier, ouvrir, et « Nouveau lien » pour qui écrit.
 */
export function LienPublic({ libelle, aide, url, refaire }: { libelle: string; aide: string; url: string; refaire?: () => void }) {
  const [copie, setCopie] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{libelle}</p>
      <div className="flex flex-wrap gap-2">
        <input readOnly className={`${ui.champ} min-w-0 flex-1 text-xs`} value={url} onFocus={(e) => e.currentTarget.select()} />
        <button
          className={ui.boutonSecondaire}
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            setCopie(true)
            setTimeout(() => setCopie(false), 2000)
          }}
        >
          {copie ? 'Copié ✓' : 'Copier'}
        </button>
        <a className={ui.boutonSecondaire} href={url} target="_blank" rel="noreferrer">
          Ouvrir
        </a>
      </div>
      <p className="text-xs text-pierre-500">
        {aide}
        {refaire && (
          <>
            {' '}
            <button className="underline hover:text-pierre-800" onClick={refaire}>
              Nouveau lien
            </button>
          </>
        )}
      </p>
    </div>
  )
}
