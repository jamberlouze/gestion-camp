import { useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { AjoutPoint, CartePoint, LigneSuivi, PanneauTraiter, PuceType } from './commun'
import { nomReunion, reunionsAVenir, useDonnees } from './contexte'
import { descriptionJours, jourLisible, lundi, ordreQuotidien, ordreSuivis, recurrentsDuJour, reports } from './outils'
import type { Recurrent } from './types'

/** Ordre du jour continu du quotidien de direction (accueil du module). */
export function Odj() {
  const { points, recurrents, suivis, reunions, jours, ecriture } = useDonnees()
  const [plusTardOuvert, setPlusTardOuvert] = useState(false)
  const auj = aujourdhui()

  const quotidien = points.filter((p) => !p.reunion_id)
  const ouverts = quotidien.filter((p) => p.statut === 'ouvert')
  const maintenant = ouverts.filter((p) => !p.pour_le || p.pour_le <= auj).sort(ordreQuotidien)
  const plusTard = ouverts.filter((p) => p.pour_le && p.pour_le > auj).sort((a, b) => a.pour_le!.localeCompare(b.pour_le!))
  const fixes = recurrentsDuJour(recurrents, points, auj)
  const traites = quotidien.filter((p) => p.statut !== 'ouvert' && p.traite_jour === auj).sort((a, b) => (a.traite_le ?? '').localeCompare(b.traite_le ?? ''))
  const suivisOuverts = suivis.filter((s) => !s.fait_le).sort(ordreSuivis)
  const enRetard = suivisOuverts.filter((s) => s.echeance && s.echeance < auj).length
  const prochaines = reunionsAVenir(reunions).slice(0, 4)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold first-letter:uppercase">{jourLisible(auj)}</h2>
          <p className="text-sm text-pierre-500">
            Semaine du {jourLisible(lundi(auj), auj, true)} ·{' '}
            {maintenant.length + fixes.length} point{maintenant.length + fixes.length > 1 ? 's' : ''} à l'ordre du jour
          </p>
        </div>

        {ecriture && <AjoutPoint />}

        {fixes.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Points fixes</h3>
            <ul className="divide-y divide-pierre-200/70 rounded-xl border border-pierre-200 bg-pierre-50/70">
              {fixes.map((r) => (
                <CarteRecurrent key={r.id} recurrent={r} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">À l'ordre du jour ({maintenant.length})</h3>
          {maintenant.length === 0 ? (
            <p className="rounded-xl border border-dashed border-pierre-300 px-4 py-6 text-center text-sm text-pierre-500">
              Rien en attente. Les points ajoutés au fil de la journée apparaîtront ici.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {maintenant.map((p) => (
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
              {plusTardOuvert ? '▾' : '▸'} Plus tard ({plusTard.length})
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

      <aside className="space-y-4">
        <section className={`${ui.carte} p-3`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-pierre-500">Suivis ouverts ({suivisOuverts.length})</h3>
            <Link to="/reunions/suivis" className="text-xs text-foret-800 hover:underline">
              Tout voir
            </Link>
          </div>
          {enRetard > 0 && <p className="mb-2 text-xs font-medium text-red-700">{enRetard} en retard</p>}
          {suivisOuverts.length === 0 ? (
            <p className="text-sm text-pierre-500">Aucun suivi en cours.</p>
          ) : (
            <ul className="space-y-1.5">
              {suivisOuverts.slice(0, 8).map((s) => (
                <LigneSuivi key={s.id} suivi={s} avecPoint />
              ))}
            </ul>
          )}
        </section>

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
function CarteRecurrent({ recurrent }: { recurrent: Recurrent }) {
  const { ecriture } = useDonnees()
  const [traiter, setTraiter] = useState(false)
  return (
    <li className="px-3 py-1.5">
      <div className="flex items-center gap-2.5">
        <span className="w-7 shrink-0 text-center text-sm text-pierre-400" title={descriptionJours(recurrent.jours)}>
          ↻
        </span>
        <span className="min-w-0 flex-1 text-[15px] text-pierre-900" title={descriptionJours(recurrent.jours)}>
          {recurrent.texte}
        </span>
        <PuceType type={recurrent.type} />
        {ecriture && !traiter && (
          <button type="button" className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-medium text-foret-800 hover:bg-foret-50" onClick={() => setTraiter(true)}>
            ✓ Traiter
          </button>
        )}
      </div>
      {traiter && (
        <div className="pl-9">
          <PanneauTraiter recurrent={recurrent} fermer={() => setTraiter(false)} fini={() => setTraiter(false)} />
        </div>
      )}
    </li>
  )
}
