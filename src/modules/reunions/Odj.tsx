import { useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { AjoutPoint, CartePoint } from './commun'
import { aEnvoyer, nomReunion, nouveauPoint, reunionsAVenir, useDonnees } from './contexte'
import { useAjouterPoint } from './donnees'
import { descriptionJours, jourLisible, lundi, recurrentsDuJour, reports } from './outils'
import type { Recurrent } from './types'

/** Ordre du jour continu du quotidien de direction (accueil du module). */
export function Odj() {
  const { points, recurrents, reunions, jours, joursSans, ecriture } = useDonnees()
  const auj = aujourdhui()
  const [plusTardOuvert, setPlusTardOuvert] = useState(false)

  const quotidien = points.filter((p) => !p.reunion_id)
  const enAttente = quotidien.filter((p) => p.statut === 'ouvert')
  const ouverts = enAttente.filter((p) => !p.pour_le || p.pour_le <= auj).sort((a, b) => a.created_at.localeCompare(b.created_at))
  // Ajoutés depuis la vue Semaine pour un autre jour.
  const plusTard = enAttente.filter((p) => p.pour_le && p.pour_le > auj).sort((a, b) => a.pour_le!.localeCompare(b.pour_le!) || a.created_at.localeCompare(b.created_at))
  const fixes = recurrentsDuJour(recurrents, points, auj)
  const traites = quotidien.filter((p) => p.statut === 'traite' && p.traite_jour === auj).sort((a, b) => (a.traite_le ?? '').localeCompare(b.traite_le ?? ''))
  const prochaines = reunionsAVenir(reunions).slice(0, 4)
  const total = ouverts.length + fixes.length

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold first-letter:uppercase">{jourLisible(auj)}</h2>
          <p className="text-sm text-pierre-500">
            Semaine du {jourLisible(lundi(auj), auj, true)} · {total} point{total > 1 ? 's' : ''} à l'ordre du jour
          </p>
        </div>

        {joursSans.has(auj) && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">❌ Pas de réunion aujourd'hui (marqué dans Semaine)</p>
        )}

        {ecriture && <AjoutPoint />}

        {fixes.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Points fixes</h3>
            <ul className="divide-y divide-pierre-200/70 rounded-xl border border-pierre-200 bg-pierre-50/70">
              {fixes.map((r) => (
                <LigneRecurrent key={r.id} recurrent={r} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">À l'ordre du jour ({ouverts.length})</h3>
          {ouverts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-pierre-300 px-4 py-6 text-center text-sm text-pierre-500">
              Rien en attente. Les points ajoutés au fil de la journée apparaîtront ici.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ouverts.map((p) => (
                <CartePoint key={p.id} point={p} reports={reports(p, jours, auj)} />
              ))}
            </ul>
          )}
        </section>

        {plusTard.length > 0 && (
          <section>
            <button
              type="button"
              className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500 hover:text-pierre-800"
              onClick={() => setPlusTardOuvert(!plusTardOuvert)}
              aria-expanded={plusTardOuvert}
            >
              {plusTardOuvert ? '▾' : '▸'} Prévus pour un autre jour ({plusTard.length})
            </button>
            {plusTardOuvert && (
              <ul className="space-y-1.5">
                {plusTard.map((p) => (
                  <CartePoint key={p.id} point={p} />
                ))}
              </ul>
            )}
          </section>
        )}

        {traites.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Traités aujourd'hui ({traites.length})</h3>
            <ul className="space-y-1.5">
              {traites.map((p) => (
                <CartePoint key={p.id} point={p} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside>
        <section className={`${ui.carte} p-3`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-pierre-500">Réunions spéciales</h3>
            <Link to="/reunions/speciales" className="text-xs text-foret-800 hover:underline">
              Toutes
            </Link>
          </div>
          {prochaines.length === 0 ? (
            <p className="text-sm text-pierre-500">Aucune de prévue.</p>
          ) : (
            <ul className="space-y-1">
              {prochaines.map((r) => {
                const n = points.filter((p) => p.reunion_id === r.id && p.statut === 'ouvert').length
                return (
                  <li key={r.id}>
                    <Link to={`/reunions/speciales/${r.id}`} className="flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-pierre-50">
                      <span className="min-w-0 truncate">{nomReunion(r)}</span>
                      <span className="shrink-0 text-xs text-pierre-500">
                        {r.jour ? jourLisible(r.jour, auj, true) : 'date à fixer'} · {n} pt{n > 1 ? 's' : ''}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  )
}

/** Point fixe du jour : pas encore de ligne, elle est créée quand on le traite. */
function LigneRecurrent({ recurrent }: { recurrent: Recurrent }) {
  const { ecriture, moi } = useDonnees()
  const ajouter = useAjouterPoint()
  const traiter = () => {
    const p = nouveauPoint({ texte: recurrent.texte, recurrent_id: recurrent.id, statut: 'traite' }, moi)
    ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
  }
  return (
    <li className="flex items-center gap-2.5 px-3 py-1.5">
      <span className="w-7 shrink-0 text-center text-sm text-pierre-400" title={descriptionJours(recurrent.jours)}>
        ↻
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-pierre-900" title={descriptionJours(recurrent.jours)}>
        {recurrent.texte}
      </span>
      {ecriture && (
        <button type="button" className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-medium text-foret-800 hover:bg-foret-50" onClick={traiter}>
          ✓ Traité
        </button>
      )}
    </li>
  )
}
