import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useFichiers, useRapports } from './donnees'
import { Rapports } from './Rapports'

/**
 * Rapports d'accident des employés. La direction voit et gère tout ; avec
 * « Accidents › Déclarer » seulement, on remplit un rapport et on ne revoit
 * que les siens (la RLS décide de ce qui est lu).
 */
export default function ModuleAccidents() {
  const { peutEcrire, peutLire, profil } = useAuth()
  const rapports = useRapports()
  const fichiers = useFichiers()
  const gere = peutLire('accidents')
  const droits = {
    gere: peutEcrire('accidents'),
    declare: peutEcrire('accidents') || peutEcrire('accidents_declarer'),
    moi: profil?.id,
  }
  const ouverts = rapports.data?.filter((r) => !r.regle_le).length ?? 0
  const erreur = rapports.error ?? fichiers.error

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">{gere ? 'Accidents' : 'Mes rapports d’accident'}</h1>
        {gere && ouverts > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
            {ouverts} ouvert{ouverts > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !rapports.data || !fichiers.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <Rapports rapports={rapports.data} fichiers={fichiers.data} droits={droits} />
      )}
    </div>
  )
}
