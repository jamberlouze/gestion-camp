import { useState } from 'react'
import { useJournal } from './donnees'
import { horodatage } from './outils'

const ICONES: Record<string, string> = {
  candidature: '📥',
  statut: '🔁',
  embauche: '🤝',
  courriel: '✉️',
  paie: '🔒',
  dossier: '🗂️',
  document: '📄',
  fusion: '🔗',
  import: '🗄️',
  referentiel: '🪪',
}

/** Journal d'une personne (ou d'une seule de ses candidatures), du plus récent au plus ancien. */
export function Journal({ personneId, candidatureId }: { personneId: string; candidatureId?: string }) {
  const journal = useJournal(personneId)
  const [tout, setTout] = useState(false)
  const lignes = (journal.data ?? []).filter((l) => !candidatureId || l.candidature_id === candidatureId)
  const visibles = tout ? lignes : lignes.slice(0, 8)
  if (journal.isLoading) return <p className="text-sm text-pierre-500">Chargement…</p>
  if (!lignes.length) return <p className="text-sm text-pierre-500">Rien encore.</p>
  return (
    <div>
      <ul className="space-y-1.5 text-sm">
        {visibles.map((l) => (
          <li key={l.id} className="flex gap-2">
            <span aria-hidden>{ICONES[l.genre] ?? '•'}</span>
            <span className="min-w-0 flex-1">
              <span className="whitespace-pre-line text-pierre-800">{l.texte}</span>
              <span className="block text-xs text-pierre-500">
                {horodatage(l.le)}
                {l.auteur_nom && ` · ${l.auteur_nom}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {lignes.length > visibles.length && (
        <button className="mt-2 text-xs text-pierre-500 underline" onClick={() => setTout(true)}>
          Voir les {lignes.length - visibles.length} autres
        </button>
      )}
    </div>
  )
}
