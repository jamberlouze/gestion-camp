import { Link, useSearchParams } from 'react-router'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { aujourdhui } from '@/shell/pokes'
import { Etoile } from './commun'
import { nomReunion, useDonnees } from './contexte'
import { NoteAffichee } from './Note'
import { jourLisible } from './outils'
import type { Point, Reunion } from './types'

const QUOTIDIEN = 'quotidien'

/**
 * PV : les décisions (points marqués ★, quotidien et réunions spéciales)
 * avec leur note, par date, prêtes à imprimer ou à enregistrer en PDF.
 * Filtres dans l'adresse (`?reunion=<id|quotidien>&du=…&au=…`). Tout ce
 * qui s'est dit un jour : le document du jour (`/reunions/jour/:jour`).
 */
export function Pv() {
  const { points, reunions } = useDonnees()
  const [params, setParams] = useSearchParams()
  const filtre = params.get('reunion') ?? ''
  const du = params.get('du') ?? ''
  const au = params.get('au') ?? ''
  const auj = aujourdhui()
  const changer = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  const parId = new Map(reunions.map((r) => [r.id, r]))
  // Jour d'un point au PV : la date de sa réunion spéciale, sinon le jour où il a été traité.
  const jourPv = (p: Point) => (p.reunion_id ? parId.get(p.reunion_id)?.jour : null) ?? p.traite_jour

  const importants = points.filter((p) => p.important)
  const choisis = importants
    .filter((p) => !filtre || (filtre === QUOTIDIEN ? !p.reunion_id : p.reunion_id === filtre))
    .filter((p) => {
      const j = jourPv(p)
      return j ? (!du || j >= du) && (!au || j <= au) : !du && !au
    })
  const sansJour = choisis.filter((p) => !jourPv(p))
  const jours = [...new Set(choisis.map(jourPv).filter((j): j is string => !!j))].sort().reverse()

  // Réunions spéciales du menu : celles qui ont des points importants (et celle choisie).
  const speciales = reunions
    .filter((r) => r.id === filtre || importants.some((p) => p.reunion_id === r.id))
    .sort((a, b) => (b.jour ?? '9999').localeCompare(a.jour ?? '9999'))
  const choisie = filtre && filtre !== QUOTIDIEN ? parId.get(filtre) : undefined
  const portee = choisie ? choisie.titre : filtre === QUOTIDIEN ? 'Quotidien de direction' : 'Toutes les réunions'
  const periode = du || au ? `${du ? `du ${jourLisible(du, auj, true)}` : ''}${du && au ? ' ' : ''}${au ? `au ${jourLisible(au, auj, true)}` : ''}` : ''
  useTitreImpression(`PV - ${portee}${periode ? ` - ${periode}` : ''}`)

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="min-w-48 flex-1">
          <span className={ui.etiquette}>Réunion</span>
          <select className={ui.champ} value={filtre} onChange={(e) => changer('reunion', e.target.value)}>
            <option value="">Toutes</option>
            <option value={QUOTIDIEN}>Quotidien de direction</option>
            {speciales.map((r) => (
              <option key={r.id} value={r.id}>
                {nomReunion(r)}
                {r.jour ? ` · ${jourLisible(r.jour, auj, true)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ui.etiquette}>Du</span>
          <input type="date" className={ui.champ} value={du} max={au || undefined} onChange={(e) => changer('du', e.target.value)} />
        </label>
        <label>
          <span className={ui.etiquette}>Au</span>
          <input type="date" className={ui.champ} value={au} min={du || undefined} onChange={(e) => changer('au', e.target.value)} />
        </label>
        <button className={ui.boutonSecondaire} onClick={() => window.print()} disabled={jours.length === 0}>
          🖨️ Imprimer / PDF
        </button>
      </div>
      <p className="text-sm text-pierre-500 print:hidden">
        Les décisions marquées <span className="text-amber-500">★</span> dans toutes les réunions, avec leur note. Pour tout ce qui s'est dit un jour : Semaine › 📄 Compte rendu.
      </p>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Procès-verbal · décisions</h1>
        <p className="text-sm text-pierre-600">
          {portee}
          {periode && ` · ${periode}`}
        </p>
      </div>

      {choisis.length === 0 && (
        <p className="rounded-xl border border-dashed border-pierre-300 px-4 py-6 text-center text-sm text-pierre-500">
          {importants.length === 0
            ? 'Aucune décision pour l’instant. Cliquez sur ☆ à côté d’un point pour le mettre au PV.'
            : 'Aucune décision pour ces choix.'}
        </p>
      )}

      {sansJour.length > 0 && (
        <section className="print:hidden">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Pas encore traités ({sansJour.length})</h3>
          <Groupes points={sansJour} parId={parId} />
        </section>
      )}

      {jours.map((jour) => (
        <section key={jour}>
          <h3 className="border-b border-pierre-200 pb-1 font-semibold first-letter:uppercase">{jourLisible(jour, auj)}</h3>
          <Groupes points={choisis.filter((p) => jourPv(p) === jour)} parId={parId} />
        </section>
      ))}
    </div>
  )
}

/** Les points d'un jour, par réunion : le quotidien d'abord, puis chaque réunion spéciale. */
function Groupes({ points, parId }: { points: Point[]; parId: Map<string, Reunion> }) {
  const cles = [...new Set(points.map((p) => p.reunion_id ?? ''))].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0))
  return (
    <div className="space-y-3">
      {cles.map((cle) => {
        const r = cle ? parId.get(cle) : undefined
        const liste = points
          .filter((p) => (p.reunion_id ?? '') === cle)
          .sort((a, b) => (cle ? a.ordre - b.ordre : (a.traite_le ?? a.created_at).localeCompare(b.traite_le ?? b.created_at)))
        return (
          <div key={cle || 'quotidien'} className="break-inside-avoid-page">
            <p className="mb-1.5 mt-2.5 text-xs font-medium uppercase tracking-wide text-pierre-500">
              {r ? (
                <Link to={`/reunions/speciales/${r.id}`} className="hover:text-pierre-800 hover:underline">
                  {nomReunion(r)}
                </Link>
              ) : (
                'Quotidien de direction'
              )}
            </p>
            <ul className="space-y-3">
              {liste.map((p) => (
                <li key={p.id} className="flex items-start gap-1.5">
                  <Etoile point={p} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-pierre-900">{p.texte}</p>
                    <NoteAffichee valeur={p.details} className="mt-0.5 text-sm text-pierre-700" />
                    <p className="mt-0.5 text-xs text-pierre-400">
                      Ajouté par {p.auteur_nom ?? '?'}
                      {p.traite_par_nom && ` · traité par ${p.traite_par_nom}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
