import { useMemo, useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ajouterJours, argent, cents, intervalle, JOURS_PAIE, lireMontant, montantChamp, nomAnnee, paiesDeLAnnee, postesAffiches } from './calcul'
import { useCouts } from './contexte'
import { useEnregistrerPoste, useEnregistrerSalaire, useSupprimerPoste } from './donnees'

/**
 * Salaires de la cuisine : un montant par période de paie (14 jours, du
 * dimanche au samedi) et par poste. Le tableau les répartit sur les périodes
 * au prorata des jours.
 */
export function Salaires() {
  const { annee, salaires, postes, ecriture } = useCouts()
  const enregistrer = useEnregistrerSalaire()
  const enregistrerPoste = useEnregistrerPoste()
  const supprimerPoste = useSupprimerPoste()
  const [nouveau, setNouveau] = useState('')

  const paies = paiesDeLAnnee(annee.annee)
  const colonnes = postesAffiches(postes, salaires)
  const montant = useMemo(() => new Map(salaires.map((s) => [`${s.debut_paie}|${s.poste_id}`, s.montant])), [salaires])
  const utilises = new Set(salaires.map((s) => s.poste_id))
  const totalPaie = (d: string) => cents(colonnes.reduce((t, p) => t + (montant.get(`${d}|${p.id}`) ?? 0), 0))
  const totalPoste = (id: string) => cents(paies.reduce((t, d) => t + (montant.get(`${d}|${id}`) ?? 0), 0))
  const total = cents(paies.reduce((t, d) => t + totalPaie(d), 0))

  const ajouterPoste = () => {
    const nom = nouveau.trim()
    if (!nom) return
    enregistrerPoste.mutate({ id: crypto.randomUUID(), nom, ordre: postes.reduce((m, p) => Math.max(m, p.ordre), 0) + 1, actif: true })
    setNouveau('')
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-xs text-pierre-500">
        Montants payés pour chaque période de paie de {nomAnnee(annee.annee)} (mêmes périodes que les Feuilles de temps). Une paie qui
        chevauche deux périodes du tableau est partagée selon le nombre de jours. Vider une case efface le montant.
      </p>
      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Période de paie</th>
              {colonnes.map((p) => (
                <th key={p.id} className="min-w-28 px-2 py-2 text-right font-medium">
                  <span className={p.actif ? '' : 'text-pierre-400'} title={p.actif ? undefined : 'Poste retiré'}>
                    {p.nom}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100 tabular-nums">
            {paies.map((d) => (
              <tr key={d}>
                <td className="whitespace-nowrap px-3 py-1">{intervalle(d, ajouterJours(d, JOURS_PAIE - 1))}</td>
                {colonnes.map((p) => {
                  const v = montant.get(`${d}|${p.id}`)
                  return (
                    <td key={p.id} className="px-1 py-0.5">
                      {ecriture ? (
                        <ChampTexte
                          className={`${ui.champ} px-2 py-1 text-right tabular-nums`}
                          valeur={montantChamp(v)}
                          inputMode="decimal"
                          aria-label={`${p.nom}, paie du ${d}`}
                          enregistrer={(texte) => {
                            const n = lireMontant(texte)
                            if (n === null && texte.trim()) return
                            if ((n ?? 0) !== (v ?? 0)) enregistrer.mutate({ debut_paie: d, poste_id: p.id, montant: n })
                          }}
                        />
                      ) : (
                        <span className="block px-2 text-right">{v ? argent(v) : ''}</span>
                      )}
                    </td>
                  )
                })}
                <td className="whitespace-nowrap px-3 py-1 text-right font-medium">{totalPaie(d) ? argent(totalPaie(d)) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-pierre-200 font-semibold tabular-nums">
            <tr>
              <td className="px-3 py-2">Total</td>
              {colonnes.map((p) => (
                <td key={p.id} className="whitespace-nowrap px-3 py-2 text-right">
                  {argent(totalPoste(p.id))}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2 text-right">{argent(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {ecriture && (
        <div className={`${ui.carte} max-w-xl p-4`}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Postes</p>
          <ul className="space-y-1.5">
            {[...postes]
              .sort((a, b) => a.ordre - b.ordre)
              .map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <ChampTexte
                    className={`${ui.champ} py-1`}
                    valeur={p.nom}
                    obligatoire
                    aria-label="Nom du poste"
                    enregistrer={(nom) => enregistrerPoste.mutate({ ...p, nom })}
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-sm text-pierre-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-foret-700"
                      checked={p.actif}
                      onChange={(e) => enregistrerPoste.mutate({ ...p, actif: e.target.checked })}
                    />
                    Actif
                  </label>
                  <button
                    className="shrink-0 rounded p-1.5 text-pierre-400 hover:bg-red-50 hover:text-red-700 disabled:invisible"
                    title={utilises.has(p.id) ? 'Ce poste a des montants : le décocher plutôt' : 'Supprimer le poste'}
                    disabled={utilises.has(p.id)}
                    onClick={async () => {
                      if (await confirmer({ titre: `Supprimer le poste « ${p.nom} » ?`, libelleOk: 'Supprimer' })) supprimerPoste.mutate(p.id)
                    }}
                  >
                    <IconeCorbeille />
                  </button>
                </li>
              ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              ajouterPoste()
            }}
          >
            <input className={`${ui.champ} py-1`} value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nouveau poste (ex. Marmitons)" />
            <button type="submit" className={ui.boutonSecondaire} disabled={!nouveau.trim()}>
              Ajouter
            </button>
          </form>
          <p className="mt-2 text-xs text-pierre-500">Un poste décoché n'est plus proposé, sauf là où il a déjà des montants.</p>
        </div>
      )}
    </div>
  )
}
