import { useMemo } from 'react'
import { Link } from 'react-router'
import { aujourdhui as jourCalendrier } from '@/modules/calendrier/dates'
import { useEvenements, usePresenceJour, useSejours } from '@/modules/calendrier/donnees'
import { sejourDuJour, sejourVisible, useEvenementsPlage } from '@/modules/calendrier/outils'
import type { Secteur } from '@/modules/calendrier/types'
import { reunionsAVenir } from '@/modules/reunions/contexte'
import { usePoints, useRecurrents, useReunions } from '@/modules/reunions/donnees'
import { recurrentsDuJour } from '@/modules/reunions/outils'
import { ui } from '@/lib/ui'
import { useAuth } from '../auth'
import { aujourdhui } from '../pokes'
import { Carte } from './commun'
import { heureLisible } from './outils'

/** Une ligne de l'horaire du jour : heure (ou « Journée ») et texte ; sans `to`, pas de lien. */
function Moment({ quand, children, to }: { quand: string; children: React.ReactNode; to?: string }) {
  const contenu = (
    <>
      <span className={`w-16 shrink-0 text-xs leading-5 font-semibold ${quand === 'Journée' ? 'text-foret-600' : 'text-pierre-500'}`}>{quand}</span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className="flex gap-3 px-4 py-1.5 hover:bg-pierre-50">
          {contenu}
        </Link>
      ) : (
        <div className="flex gap-3 px-4 py-1.5">{contenu}</div>
      )}
    </li>
  )
}

/** Lien vers le Calendrier, sauf s'il est caché (`cacheSaufAdmins`) : ses données restent lues. */
function useLienCalendrier() {
  return useAuth().peutOuvrir('calendrier') ? '/calendrier' : undefined
}

/** Le jour : séjours et événements (Calendrier), réunions ; seulement avec l'un de ces modules. */
export function Aujourdhui() {
  const { peutLire } = useAuth()
  const lien = useLienCalendrier()
  if (!peutLire('calendrier') && !peutLire('reunions')) return null
  return (
    <Carte titre="Aujourd'hui" lien={lien ? { to: lien, texte: 'Calendrier' } : undefined} vide="Rien de prévu aujourd'hui.">
      {peutLire('calendrier') && <Sejours />}
      {peutLire('reunions') && <ReunionsDuJour />}
      {peutLire('calendrier') && <Evenements />}
    </Carte>
  )
}

function Sejours() {
  const { data } = useSejours()
  const lien = useLienCalendrier()
  const jour = jourCalendrier()
  const duJour = (data ?? []).filter((s) => sejourVisible(s) && sejourDuJour(s, jour))
  return (
    <>
      {duJour.map((s) => (
        <Moment key={s.id} quand="Journée" to={lien}>
          <span className="font-medium">{s.nom_groupe}</span>
          {s.nb_participants != null && <span className="text-pierre-500"> · {s.nb_participants} pers.</span>}
          {s.date_arrivee === jour && <span className="text-pierre-500"> · arrive{s.heure_arrivee ? ` à ${heureLisible(s.heure_arrivee)}` : ''}</span>}
          {s.date_depart === jour && <span className="text-pierre-500"> · part{s.heure_depart ? ` à ${heureLisible(s.heure_depart)}` : ''}</span>}
        </Moment>
      ))}
    </>
  )
}

function ReunionsDuJour() {
  const points = usePoints()
  const recurrents = useRecurrents()
  const reunions = useReunions()
  const auj = aujourdhui()
  if (!points.data || !recurrents.data || !reunions.data) return null
  const ouverts = points.data.filter((p) => !p.reunion_id && p.statut === 'ouvert' && (!p.pour_le || p.pour_le <= auj)).length
  const total = ouverts + recurrentsDuJour(recurrents.data, points.data, auj).length
  const speciales = reunionsAVenir(reunions.data).filter((r) => r.jour === auj)
  return (
    <>
      {total > 0 && (
        <Moment quand="Direction" to="/reunions">
          Réunion de direction · {total} point{total > 1 ? 's' : ''} à l'ordre du jour
        </Moment>
      )}
      {speciales.map((r) => (
        <Moment key={r.id} quand={heureLisible(r.heure) ?? 'Journée'} to="/reunions/speciales">
          {r.titre}
          {r.lieu && <span className="text-pierre-500"> · {r.lieu}</span>}
        </Moment>
      ))}
    </>
  )
}

function Evenements() {
  const { data } = useEvenements()
  const lien = useLienCalendrier()
  const jour = jourCalendrier()
  const plage = useEvenementsPlage(data, jour, jour)
  return (
    <>
      {(plage.get(jour) ?? []).map((ev) => (
        <Moment key={ev.id} quand={heureLisible(ev.heure_debut) ?? 'Journée'} to={lien}>
          {ev.titre}
          {ev.lieu && <span className="text-pierre-500"> · {ev.lieu}</span>}
        </Moment>
      ))}
    </>
  )
}

const SECTEURS: { id: Secteur; nom: string }[] = [
  { id: 'direction', nom: 'Direction' },
  { id: 'animation', nom: 'Animation' },
  { id: 'cuisine', nom: 'Cuisine' },
  { id: 'terrain', nom: 'Terrain' },
]

/** Qui travaille aujourd'hui, par secteur (vue commune du Calendrier). */
export function AuTravail() {
  const lien = useLienCalendrier()
  const jour = jourCalendrier()
  const { data } = usePresenceJour(jour, jour)
  const parSecteur = useMemo(
    () =>
      SECTEURS.map((s) => ({
        ...s,
        noms: [...new Set((data ?? []).filter((p) => p.secteur === s.id).map((p) => p.nom))].sort((a, b) => a.localeCompare(b, 'fr')),
      })).filter((s) => s.noms.length),
    [data],
  )
  const total = parSecteur.reduce((n, s) => n + s.noms.length, 0)
  if (!data) return null
  return (
    <section className={`${ui.carte} space-y-2 px-4 py-2.5`}>
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-sm font-semibold">Au travail aujourd'hui</h2>
        {total > 0 && (
          <span className="text-xs text-pierre-500">
            {total} personne{total > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {parSecteur.length === 0 && <p className="text-sm text-pierre-500">Personne à l'horaire aujourd'hui.</p>}
      {parSecteur.map((s) => (
        <div key={s.id}>
          <p className="text-xs font-semibold tracking-wide text-foret-600 uppercase">{s.nom}</p>
          <p className="text-sm text-pierre-800">{s.noms.join(', ')}</p>
        </div>
      ))}
      {lien && (
        <Link to={lien} className="inline-block text-xs font-medium text-foret-700 hover:text-foret-800">
          Voir le calendrier
        </Link>
      )}
    </section>
  )
}
