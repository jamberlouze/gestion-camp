import { useMemo } from 'react'
import { ui } from '@/lib/ui'
import { Puce } from './Conflits'
import { ChoixAnimateur } from './Construire'
import { useSemaine } from './contexte'
import { useAjouterAnimateurs } from './donnees'
import { analyseConges } from './logique'

export function Conges() {
  const { etat, modifier, ecriture, animateurs, horaire } = useSemaine()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const { enConge, tournees, conflits } = useMemo(() => analyseConges(etat), [etat])
  const erreurs = conflits.filter((c) => c.sev === 'err')
  const avertissements = conflits.filter((c) => c.sev === 'warn')
  const remplacants = Object.keys(tournees).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  function choisirRemplacant(gi: number, valeur: string) {
    let nom = valeur
    if (valeur === '__nouveau__') {
      nom = prompt('Nom du nouveau remplaçant :')?.trim() ?? ''
      if (!nom) return
      if (!animateurs.includes(nom)) ajouterAnimateurs.mutate([nom])
    }
    modifier((e) => {
      e.groupes[gi].remp = nom
    })
  }

  return (
    <div className={`${ui.carte} space-y-5 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Congés et remplacements — {horaire.nom}</h2>
        <button className={`${ui.boutonSecondaire} print:hidden`} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Puce niveau={erreurs.length ? 'err' : 'ok'}>
          {erreurs.length} conflit{erreurs.length > 1 ? 's' : ''}
        </Puce>
        <Puce niveau={avertissements.length ? 'soft' : 'ok'}>{avertissements.length} sans remplaçant</Puce>
        <Puce niveau="ok">
          {enConge.length} animateur{enConge.length > 1 ? 's' : ''} en congé
        </Puce>
      </div>
      <p className="text-sm text-pierre-500">
        C'est l'animateur qui prend congé (2 jours) : le groupe a des activités chaque jour, animées par le remplaçant pendant
        ces jours. Dans la grille, ces cases portent un ↺.
      </p>
      {conflits.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {conflits.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <Puce niveau={c.sev === 'err' ? 'err' : 'soft'}>{c.sev === 'err' ? 'Conflit' : 'À couvrir'}</Puce>
              {c.msg}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Animateurs en congé cette semaine</h3>
        {enConge.length === 0 ? (
          <p className="text-sm text-pierre-500">Aucun congé défini. Choisissez un code (MM, JV, SD) sous un groupe dans l'onglet Construire.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 text-left text-pierre-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Animateur</th>
                <th className="py-2 pr-3 font-medium">Groupe</th>
                <th className="py-2 pr-3 font-medium">Jours de congé</th>
                <th className="py-2 font-medium">Remplaçant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {enConge.map(({ g, gi, jours }) => (
                <tr key={g.id}>
                  <td className="py-1.5 pr-3 font-medium">{g.anim}</td>
                  <td className="py-1.5 pr-3">Gr. {g.num}</td>
                  <td className="py-1.5 pr-3">{jours.join(', ')}</td>
                  <td className="py-1.5">
                    <ChoixAnimateur
                      aria-label={`Remplaçant de ${g.anim}`}
                      className="min-w-40 rounded border border-pierre-300 px-2 py-1 text-sm"
                      valeur={g.remp}
                      animateurs={animateurs}
                      disabled={!ecriture}
                      onChange={(v) => choisirRemplacant(gi, v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Tournée des remplaçants <span className="font-normal text-pierre-500">— où est chaque remplaçant, jour par jour</span>
        </h3>
        {remplacants.length === 0 ? (
          <p className="text-sm text-pierre-500">Aucun remplaçant assigné.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-pierre-200 text-left text-pierre-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Remplaçant</th>
                  {etat.jours.map((d) => (
                    <th key={d} className="py-2 pr-3 font-medium">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {remplacants.map((r) => {
                  const parJour: Record<string, { group: string; anim: string }> = {}
                  tournees[r].forEach((t) => t.days.forEach((d) => (parJour[d] = t)))
                  return (
                    <tr key={r}>
                      <td className="py-1.5 pr-3 font-medium">{r}</td>
                      {etat.jours.map((d) => (
                        <td key={d} className="py-1.5 pr-3">
                          {parJour[d] && (
                            <>
                              <span className="rounded bg-foret-100 px-1.5 py-0.5 text-foret-800">Gr. {parJour[d].group}</span>
                              <span className="block text-xs text-pierre-500">rempl. {parJour[d].anim}</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-pierre-500">
        Pendant les congés, les horaires des spécialistes affichent automatiquement le remplaçant du groupe.
      </p>
    </div>
  )
}
