import { useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useFlotte } from './donnees'
import { TableEntretiens } from './Fiche'
import { FormEntretien } from './Formulaires'
import { trierFlotte } from './outils'
import type { Entretien } from './types'

/** Registre d'entretien de toute la flotte, le plus récent en premier. */
export function Registre() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('vehicules')
  const flotte = useFlotte()
  const [vehicule, setVehicule] = useState('')
  const [annee, setAnnee] = useState('')
  const [ouvert, setOuvert] = useState<Entretien | 'nouveau' | null>(null)

  const annees = useMemo(() => [...new Set(flotte.entretiens.map((e) => e.date.slice(0, 4)))].sort().reverse(), [flotte.entretiens])
  const entretiens = useMemo(
    () =>
      flotte.entretiens
        .filter((e) => (!vehicule || e.vehicule_id === vehicule) && (!annee || e.date.startsWith(annee)))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [flotte.entretiens, vehicule, annee],
  )

  if (!flotte.pret) {
    return flotte.erreur ? (
      <p className={ui.erreur}>{messageErreur(flotte.erreur)}</p>
    ) : (
      <p className="py-8 text-center text-sm text-pierre-500">Chargement du registre…</p>
    )
  }

  const total = entretiens.reduce((s, e) => s + (e.cout ?? 0), 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Véhicule" className={`${ui.champ} w-auto!`} value={vehicule} onChange={(e) => setVehicule(e.target.value)}>
          <option value="">Tous les véhicules</option>
          {trierFlotte(flotte.vehicules).map((v) => (
            <option key={v.id} value={v.id}>
              {v.surnom}
            </option>
          ))}
        </select>
        <select aria-label="Année" className={`${ui.champ} w-auto!`} value={annee} onChange={(e) => setAnnee(e.target.value)}>
          <option value="">Toutes les années</option>
          {annees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {ecriture && (
          <button className={`${ui.bouton} ml-auto`} onClick={() => setOuvert('nouveau')}>
            <IconePlus /> Entretien
          </button>
        )}
      </div>

      <p className="mb-2 mt-3 text-sm text-pierre-500">
        {entretiens.length} entretien{entretiens.length > 1 ? 's' : ''}
      </p>

      {entretiens.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">
          {flotte.entretiens.length === 0 ? 'Aucun entretien inscrit pour l’instant.' : 'Aucun entretien ne correspond aux filtres.'}
        </p>
      ) : (
        <div className={`${ui.carte} px-4 py-3`}>
          <TableEntretiens entretiens={entretiens} vehicules={flotte.vehicules} ouvrir={ecriture ? setOuvert : undefined} total={total} avecVehicule />
        </div>
      )}

      {ouvert && (
        <FormEntretien
          vehicules={flotte.vehicules}
          vehicule={ouvert !== 'nouveau' ? undefined : flotte.vehicules.find((v) => v.id === vehicule)}
          entretien={ouvert === 'nouveau' ? undefined : ouvert}
          deja={flotte.entretiens}
          fermer={() => setOuvert(null)}
        />
      )}
    </div>
  )
}
