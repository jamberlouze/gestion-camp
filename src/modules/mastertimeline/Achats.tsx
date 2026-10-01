import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur, useEnregistrer, useSupprimer } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useEcriture } from './outils'
import { useAchats, useFournisseurs } from './donnees'
import type { Achat } from './types'

/** Liste des achats à faire : on coche quand c'est commandé. */
export function Achats() {
  const ecriture = useEcriture()
  const achats = useAchats()
  const fournisseurs = useFournisseurs()
  const enregistrer = useEnregistrer<Achat>('mastertimeline', 'achats')
  const supprimer = useSupprimer('mastertimeline', 'achats')
  const [ajout, setAjout] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const sauver = (ligne: Partial<Achat>) => {
    setErreur(null)
    enregistrer.mutate(ligne, { onError: (e) => setErreur(messageErreur(e)) })
  }

  if (achats.error) return <p className={ui.erreur}>{messageErreur(achats.error)}</p>
  if (!achats.data || !fournisseurs.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const liste = [...achats.data].sort((a, b) => Number(a.commande) - Number(b.commande) || a.item.localeCompare(b.item, 'fr'))
  const restants = liste.filter((a) => !a.commande).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-pierre-500">
          {restants} à commander · {liste.length - restants} commandé{liste.length - restants > 1 ? 's' : ''}
        </p>
        {ecriture && !ajout && (
          <button className={ui.bouton} onClick={() => setAjout(true)}>
            + Ajouter
          </button>
        )}
      </div>
      {ajout && (
        <SaisieNom
          placeholder="Ex. Pagaies"
          libelleOk="Ajouter"
          annuler={() => setAjout(false)}
          valider={async (item) => {
            try {
              await enregistrer.mutateAsync({ item })
              setAjout(false)
              return null
            } catch (e) {
              return messageErreur(e)
            }
          }}
        />
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
            <tr>
              <th className="w-24 px-3 py-2 font-medium">Commandé</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Fournisseur</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((a) => (
              <tr key={a.id} className={a.commande ? 'text-pierre-500' : ''}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`${a.item} commandé`}
                    className="h-4 w-4 accent-foret-700"
                    checked={a.commande}
                    disabled={!ecriture}
                    onChange={(e) => sauver({ id: a.id, commande: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <ChampTexte
                    aria-label="Item"
                    className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-pierre-200 focus:border-foret-600 focus:outline-none ${a.commande ? 'line-through' : ''}`}
                    valeur={a.item}
                    obligatoire
                    disabled={!ecriture}
                    enregistrer={(item) => sauver({ id: a.id, item })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    aria-label="Fournisseur"
                    className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-pierre-200"
                    value={a.fournisseur_id ?? ''}
                    disabled={!ecriture}
                    onChange={(e) => sauver({ id: a.id, fournisseur_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {fournisseurs.data.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nom}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <ChampTexte
                    aria-label="Note"
                    className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
                    valeur={a.note ?? ''}
                    disabled={!ecriture}
                    enregistrer={(note) => sauver({ id: a.id, note: note || null })}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  {ecriture && (
                    <button
                      aria-label={`Supprimer ${a.item}`}
                      className="rounded p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700"
                      onClick={() => confirm(`Supprimer « ${a.item} » ?`) && supprimer.mutate(a.id, { onError: (e) => setErreur(messageErreur(e)) })}
                    >
                      <IconeCorbeille />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <p className="px-3 py-6 text-center text-sm text-pierre-500">Aucun achat pour l'instant.</p>}
      </div>
    </div>
  )
}
