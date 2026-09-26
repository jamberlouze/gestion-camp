import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { messageErreur } from './donnees'
import { ui } from './ui'

/**
 * Modifications refusées par la base (droits, doublon…) pour un module :
 * toutes les mutations dont la clé commence par `racine`.
 */
export function BandeauErreurs({ racine }: { racine: string }) {
  const client = useQueryClient()
  const erreurs = useMutationState({
    filters: { mutationKey: [racine], status: 'error' },
    select: (m) => ({ id: m.mutationId, erreur: m.state.error }),
  })
  if (erreurs.length === 0) return null

  const effacer = () => {
    const cache = client.getMutationCache()
    cache.findAll({ mutationKey: [racine], status: 'error' }).forEach((m) => cache.remove(m))
  }
  return (
    <div className={`${ui.erreur} mb-4 flex items-start justify-between gap-3 print:hidden`}>
      <div>
        <p className="font-medium">
          {erreurs.length > 1
            ? `${erreurs.length} modifications ont été refusées et annulées :`
            : 'Une modification a été refusée et annulée :'}
        </p>
        <ul className="mt-1 list-disc pl-5">
          {erreurs.map((e) => (
            <li key={e.id}>{messageErreur(e.erreur)}</li>
          ))}
        </ul>
      </div>
      <button className="shrink-0 text-sm underline" onClick={effacer}>
        Fermer
      </button>
    </div>
  )
}
