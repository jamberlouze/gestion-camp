import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { aujourdhui } from '@/shell/pokes'
import { CartePoint } from './commun'
import { nomReunion, useDonnees } from './contexte'
import { ajouterJours, jourDe, jourLisible, lundi, normaliser } from './outils'

/** Ce qui a été traité chaque jour d'une semaine (comme une diapo de l'ancienne présentation), et la recherche. */
export function Semaine() {
  const { points, reunions, suivis } = useDonnees()
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const auj = aujourdhui()
  const debut = lundi(params.get('semaine') ?? auj)
  const fin = ajouterJours(debut, 6)
  const aller = (jour: string) => setParams(jour === lundi(auj) ? {} : { semaine: jour }, { replace: true })

  const mot = normaliser(recherche.trim())
  if (mot) {
    const resultats = points
      .filter((p) => {
        const texteSuivis = suivis.filter((s) => s.point_id === p.id).map((s) => s.texte).join(' ')
        return normaliser(`${p.texte} ${p.details ?? ''} ${p.decision ?? ''} ${p.auteur_nom ?? ''} ${texteSuivis}`).includes(mot)
      })
      .sort((a, b) => (b.traite_le ?? b.created_at).localeCompare(a.traite_le ?? a.created_at))
    return (
      <div className="space-y-4">
        <Recherche valeur={recherche} changer={setRecherche} />
        <p className="text-sm text-pierre-500">
          {resultats.length} point{resultats.length > 1 ? 's' : ''}
          {resultats.length > 100 && ' (les 100 plus récents)'}
        </p>
        <ul className="max-w-4xl space-y-1.5">
          {resultats.slice(0, 100).map((p) => (
            <CartePoint key={p.id} point={p} afficherJour lecture />
          ))}
        </ul>
      </div>
    )
  }

  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i))
  const traitesLe = (jour: string) =>
    points
      .filter((p) => !p.reunion_id && p.statut !== 'ouvert' && p.traite_jour === jour)
      .sort((a, b) => Number(a.statut === 'retire') - Number(b.statut === 'retire') || (a.traite_le ?? '').localeCompare(b.traite_le ?? ''))
  const speciales = (jour: string) => reunions.filter((r) => r.jour === jour)
  // Fin de semaine : seulement s'il s'est passé quelque chose.
  const affiches = jours.filter((j, i) => i < 5 || traitesLe(j).length || speciales(j).length)
  const encoreOuverts = points.filter((p) => !p.reunion_id && p.statut === 'ouvert' && jourDe(p.created_at) >= debut && jourDe(p.created_at) <= fin)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-lg px-2 py-1 text-pierre-600 hover:bg-pierre-100" onClick={() => aller(ajouterJours(debut, -7))} aria-label="Semaine précédente">
            ‹
          </button>
          <h2 className="min-w-56 text-center text-lg font-semibold">Semaine du {jourLisible(debut, auj, true)}</h2>
          <button type="button" className="rounded-lg px-2 py-1 text-pierre-600 hover:bg-pierre-100" onClick={() => aller(ajouterJours(debut, 7))} aria-label="Semaine suivante">
            ›
          </button>
          {debut !== lundi(auj) && (
            <button type="button" className="ml-2 text-sm text-foret-800 hover:underline" onClick={() => aller(auj)}>
              Cette semaine
            </button>
          )}
        </div>
        <Recherche valeur={recherche} changer={setRecherche} />
      </div>

      <div className="max-w-4xl space-y-5">
        {affiches.map((jour) => {
          const liste = traitesLe(jour)
          const sp = speciales(jour)
          const passe = jour < auj
          return (
            <section key={jour}>
              <h3 className={`mb-2 text-sm font-semibold first-letter:uppercase ${jour === auj ? 'text-foret-800' : 'text-pierre-700'}`}>
                {jourLisible(jour, auj)}
                {jour === auj && <span className="ml-2 text-xs font-normal text-foret-700">aujourd'hui</span>}
              </h3>
              {sp.map((r) => (
                <Link key={r.id} to={`/reunions/speciales/${r.id}`} className="mb-1.5 block rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm text-violet-900 hover:bg-violet-50">
                  {nomReunion(r)}
                  {r.heure && <span className="ml-2 text-xs text-violet-700">{Number(r.heure.slice(0, 2))} h{r.heure.slice(3, 5) !== '00' && ` ${r.heure.slice(3, 5)}`}</span>}
                  <span className="ml-2 text-xs text-violet-700">{points.filter((p) => p.reunion_id === r.id).length} points</span>
                </Link>
              ))}
              {liste.length > 0 ? (
                <ul className="space-y-1.5">
                  {liste.map((p) => (
                    <CartePoint key={p.id} point={p} lecture />
                  ))}
                </ul>
              ) : (
                !sp.length && <p className="text-sm text-pierre-400">{passe ? '❌ Pas de réunion' : jour === auj ? 'Rien de traité encore.' : '—'}</p>
              )}
            </section>
          )
        })}

        {encoreOuverts.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Ajoutés cette semaine, encore ouverts ({encoreOuverts.length})</h3>
            <ul className="space-y-1.5">
              {encoreOuverts.map((p) => (
                <CartePoint key={p.id} point={p} lecture />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function Recherche({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <input
      type="search"
      className="w-full rounded-lg border border-pierre-300 bg-white px-3 py-1.5 text-sm sm:w-72"
      placeholder="Chercher dans tous les points…"
      value={valeur}
      onChange={(e) => changer(e.target.value)}
      aria-label="Chercher dans tous les points"
    />
  )
}
