import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { AjoutPoint, CartePoint } from './commun'
import { nomReunion, useDonnees } from './contexte'
import { useBasculerJourSans } from './donnees'
import { ajouterJours, jourLisible, lundi, normaliser } from './outils'
import type { Point } from './types'

const parTraitement = (a: Point, b: Point) => (a.traite_le ?? '').localeCompare(b.traite_le ?? '')
const parAjout = (a: Point, b: Point) => a.created_at.localeCompare(b.created_at)

/**
 * La semaine jour par jour (comme une diapo de l'ancienne présentation) :
 * les points de chaque jour, « Pas de réunion » à cocher, et la recherche
 * dans tous les points passés.
 */
export function Semaine() {
  const { points, reunions, joursSans, ecriture } = useDonnees()
  const basculer = useBasculerJourSans()
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const [ajoutSur, setAjoutSur] = useState<string | null>(null)
  const auj = aujourdhui()
  const debut = lundi(params.get('semaine') ?? auj)
  const aller = (jour: string) => setParams(jour === lundi(auj) ? {} : { semaine: jour }, { replace: true })

  const mot = normaliser(recherche.trim())
  if (mot) {
    // Tous les points passés (traités), toutes semaines et réunions confondues.
    const resultats = points
      .filter((p) => p.statut === 'traite' && normaliser(`${p.texte} ${p.details ?? ''} ${p.auteur_nom ?? ''}`).includes(mot))
      .sort((a, b) => parTraitement(b, a))
    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">Recherche dans tous les points passés</h2>
          <Recherche valeur={recherche} changer={setRecherche} />
        </div>
        <p className="text-sm text-pierre-500">
          {resultats.length} point{resultats.length > 1 ? 's' : ''} trouvé{resultats.length > 1 ? 's' : ''}
          {resultats.length > 100 && ' (les 100 plus récents)'}
        </p>
        <ul className="space-y-1.5">
          {resultats.slice(0, 100).map((p) => (
            <CartePoint key={p.id} point={p} afficherJour lecture />
          ))}
        </ul>
      </div>
    )
  }

  const quotidien = points.filter((p) => !p.reunion_id)
  // Les points de chaque jour : traités ce jour-là, plus, aujourd'hui, ceux à
  // l'ordre du jour, et, un jour à venir, ceux ajoutés pour ce jour.
  const pointsDu = (jour: string) => {
    const traites = quotidien.filter((p) => p.statut === 'traite' && p.traite_jour === jour).sort(parTraitement)
    const ouverts = quotidien.filter((p) => p.statut === 'ouvert')
    if (jour === auj) return [...traites, ...ouverts.filter((p) => !p.pour_le || p.pour_le <= auj).sort(parAjout)]
    if (jour > auj) return ouverts.filter((p) => p.pour_le === jour).sort(parAjout)
    return traites
  }
  const speciales = (jour: string) => reunions.filter((r) => r.jour === jour)
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i))
  // Fin de semaine : seulement s'il y a quelque chose.
  const affiches = jours.filter((j, i) => i < 5 || pointsDu(j).length || speciales(j).length || joursSans.has(j) || ajoutSur === j)

  return (
    <div className="space-y-4">
      {/* Même navigation que le Calendrier : flèches, titre, retour à aujourd'hui. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Semaine précédente" onClick={() => aller(ajouterJours(debut, -7))}>
            <IconeChevron className="size-4 rotate-180" />
          </button>
          <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Semaine suivante" onClick={() => aller(ajouterJours(debut, 7))}>
            <IconeChevron className="size-4" />
          </button>
        </div>
        <h2 className="order-first w-full min-w-0 text-lg font-semibold sm:order-none sm:w-auto sm:flex-1">Semaine du {jourLisible(debut, auj, true)}</h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {debut !== lundi(auj) && (
            <button className={ui.boutonSecondaire} onClick={() => aller(auj)}>
              Cette semaine
            </button>
          )}
          <Recherche valeur={recherche} changer={setRecherche} />
        </div>
      </div>

      <div className="max-w-4xl space-y-5">
        {affiches.map((jour) => {
          const liste = pointsDu(jour)
          const sp = speciales(jour)
          const sans = joursSans.has(jour)
          const passe = jour < auj
          return (
            <section key={jour}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className={`text-sm font-semibold first-letter:uppercase ${jour === auj ? 'text-foret-800' : 'text-pierre-700'}`}>
                  {jourLisible(jour, auj)}
                  {jour === auj && <span className="ml-2 text-xs font-normal text-foret-700">aujourd'hui</span>}
                </h3>
                <div className="ml-auto flex items-center gap-1">
                  {ecriture && !passe && ajoutSur !== jour && (
                    <button type="button" className="rounded-lg px-2 py-1 text-sm text-foret-800 hover:bg-foret-50" onClick={() => setAjoutSur(jour)}>
                      + Ajouter un point
                    </button>
                  )}
                  {(ecriture || sans) && (
                    <button
                      type="button"
                      disabled={!ecriture}
                      aria-pressed={sans}
                      onClick={() => basculer.mutate({ jour, sans: !sans })}
                      className={`rounded-lg border px-2 py-1 text-sm ${
                        sans ? 'border-red-200 bg-red-50 font-medium text-red-800' : 'border-transparent text-pierre-400 hover:border-pierre-200 hover:text-pierre-700'
                      }`}
                      title={sans ? 'Retirer « Pas de réunion »' : 'Marquer ce jour « Pas de réunion »'}
                    >
                      {/* Pas coché : discret (émoji en gris). */}
                      <span className={sans ? '' : 'opacity-40 grayscale'}>❌</span> Pas de réunion
                    </button>
                  )}
                </div>
              </div>
              {ajoutSur === jour && (
                <div className="mb-1.5">
                  <AjoutPoint
                    autoFocus
                    pourLe={jour === auj ? null : jour}
                    placeholder={jour === auj ? 'Ajouter un point pour aujourd’hui…' : `Ajouter un point pour ${jourLisible(jour, auj)}…`}
                    fini={() => setAjoutSur(null)}
                  />
                </div>
              )}
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
                    <CartePoint key={p.id} point={p} lecture={p.statut === 'traite' && passe} masquerPourLe />
                  ))}
                </ul>
              ) : (
                !sp.length && !sans && ajoutSur !== jour && <p className="text-sm text-pierre-400">Aucun point.</p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Recherche({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <input
      type="search"
      className="w-full rounded-lg border border-pierre-300 bg-white px-3 py-1.5 text-sm sm:w-80"
      placeholder="Chercher dans tous les points passés…"
      value={valeur}
      onChange={(e) => changer(e.target.value)}
      aria-label="Chercher dans tous les points passés"
    />
  )
}
