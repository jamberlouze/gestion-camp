import { useMemo } from 'react'
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Chargement, NavDate, Section } from './commun'
import { ajouterJours, dateLongue } from './dates'
import { useHorairesAnimation } from './donnees'
import { journee, type JourneeAnimation } from './horaire'
import { useDateChoisie } from './outils'

/**
 * Animation du jour, lue dans le module Horaire d'animation (seule source) :
 * chaque groupe, son animateur (remplaçant pendant un congé), ses activités
 * par période, puis les tâches de soirée.
 */
export function Animation() {
  const [date, choisir] = useDateChoisie()
  const { peutLire, peutEcrire } = useAuth()
  const horaires = useHorairesAnimation(date, date)
  const journees = useMemo(
    () => (horaires.data?.horaires ?? []).map((h) => journee(h, date)).filter((j): j is JourneeAnimation => !!j),
    [horaires.data, date],
  )

  if (!peutLire('horaire')) {
    return <p className={`${ui.carte} p-6 text-center text-sm text-pierre-500`}>L'animation vient du module Horaire d'animation, auquel vous n'avez pas accès.</p>
  }
  const sansDate = horaires.data?.sansDate ?? 0
  return (
    <div className="space-y-4">
      <NavDate titre={dateLongue(date)} date={date} choisir={choisir} precedent={ajouterJours(date, -1)} suivant={ajouterJours(date, 1)} />
      {horaires.error && <p className={ui.erreur}>{messageErreur(horaires.error)}</p>}
      {!horaires.data ? (
        <Chargement />
      ) : !journees.length ? (
        <p className={`${ui.carte} p-6 text-center text-sm text-pierre-500`}>Aucun horaire d'animation pour ce jour.</p>
      ) : (
        journees.map((j) => <Journee key={j.horaire.id} j={j} modifiable={peutEcrire('horaire')} />)
      )}
      {sansDate > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sansDate} semaine{sansDate > 1 ? 's' : ''} d'animation sans date : dans{' '}
          <Link to="/horaire" className="underline">
            Horaire d'animation
          </Link>
          , indiquez la « date du premier jour » pour {sansDate > 1 ? 'les' : 'la'} voir ici.
        </p>
      )}
    </div>
  )
}

function Journee({ j, modifiable }: { j: JourneeAnimation; modifiable: boolean }) {
  const groupes = j.groupes.filter((g) => g.animateur || g.activites.length)
  return (
    <Section
      titre={`${j.horaire.nom} · ${j.jour}`}
      droite={
        <Link to={`/horaire?semaine=${j.horaire.id}`} className="text-sm text-foret-700 underline">
          {modifiable ? 'Modifier dans Horaire' : 'Voir dans Horaire'}
        </Link>
      }
    >
      {!groupes.length ? (
        <p className="text-sm text-pierre-500">Rien de prévu ce jour-là dans cet horaire.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupes.map(({ groupe: g, animateur, activites }) => (
            <div key={g.id} className="rounded-lg border border-pierre-200 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium">{animateur?.nom ?? <span className="text-red-800">Sans animateur</span>}</span>
                <span className="text-xs text-pierre-500">{[g.num && `Groupe ${g.num}`, g.age, g.section].filter(Boolean).join(' · ')}</span>
              </div>
              {animateur?.remplace && <p className="text-xs text-amber-800">Remplace {animateur.remplace} (congé)</p>}
              {activites.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {activites.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-28 shrink-0 tabular-nums text-pierre-500">{a.periode}</span>
                      <span>{a.activite}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {j.soirees.length > 0 && (
        <div className="mt-3 border-t border-pierre-100 pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-pierre-500">Soirée</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {j.soirees.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.animateur}</span> <span className="text-pierre-600">{s.tache}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}
