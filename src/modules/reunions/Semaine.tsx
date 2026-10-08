import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { AjoutPoint, CartePoint } from './commun'
import { nomReunion, useDonnees } from './contexte'
import { ajouterJours, jourDe, jourLisible, lundi, normaliser } from './outils'

/** Ce qui a été traité chaque jour d'une semaine (comme une diapo de l'ancienne présentation), et la recherche. */
export function Semaine() {
  const { points, reunions, ecriture } = useDonnees()
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const auj = aujourdhui()
  const debut = lundi(params.get('semaine') ?? auj)
  const fin = ajouterJours(debut, 6)
  const aller = (jour: string) => setParams(jour === lundi(auj) ? {} : { semaine: jour }, { replace: true })

  const mot = normaliser(recherche.trim())
  if (mot) {
    const resultats = points
      .filter((p) => normaliser(`${p.texte} ${p.details ?? ''} ${p.decision ?? ''} ${p.auteur_nom ?? ''}`).includes(mot))
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
      .filter((p) => !p.reunion_id && p.statut === 'traite' && p.traite_jour === jour)
      .sort((a, b) => (a.traite_le ?? '').localeCompare(b.traite_le ?? ''))
  const speciales = (jour: string) => reunions.filter((r) => r.jour === jour)
  // Points ajoutés pour un jour à venir (ils arriveront à l'ordre du jour ce matin-là).
  const prevusLe = (jour: string) =>
    jour > auj ? points.filter((p) => !p.reunion_id && p.statut === 'ouvert' && p.pour_le === jour).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []
  // Fin de semaine : seulement s'il s'est passé (ou s'il est prévu) quelque chose.
  const affiches = jours.filter((j, i) => i < 5 || traitesLe(j).length || speciales(j).length || prevusLe(j).length)
  const encoreOuverts = points.filter(
    (p) => !p.reunion_id && p.statut === 'ouvert' && !(p.pour_le && p.pour_le > auj) && jourDe(p.created_at) >= debut && jourDe(p.created_at) <= fin,
  )

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
          const liste = traitesLe(jour)
          const sp = speciales(jour)
          const prevus = prevusLe(jour)
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
                passe && !sp.length && <p className="text-sm text-pierre-400">❌ Pas de réunion</p>
              )}
              {prevus.length > 0 && (
                <ul className="mt-1.5 space-y-1.5">
                  {prevus.map((p) => (
                    <CartePoint key={p.id} point={p} masquerPourLe />
                  ))}
                </ul>
              )}
              {/* Aujourd'hui et les jours à venir : on peut y ajouter un point. */}
              {!passe && ecriture && (
                <div className="mt-1.5">
                  <AjoutPoint compact pourLe={jour === auj ? null : jour} placeholder={jour === auj ? 'Ajouter un point pour aujourd’hui…' : `Ajouter un point pour ${jourLisible(jour, auj)}…`} />
                </div>
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
