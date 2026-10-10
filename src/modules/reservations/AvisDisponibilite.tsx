import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { CALENDRIERS, calendrierDe, NOMS_CALENDRIER, type CleCalendrier } from './agenda'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { annonceAirbnb, chevauchements, conflitsAirbnb, conflitsAirbnbDe, lienAirbnb } from './disponibilite'
import { lireAirbnb, synchroniserAgenda, useAgenda, useEnregistrerReglage, type ModeAgenda } from './donnees'
import { dateCourte } from './format'
import type { Reservation } from './types'

const quand = (ts: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' }).format(new Date(ts))

/**
 * Haut de la fiche : réservation Airbnb à compléter, conflit avec Airbnb,
 * chevauchements avec d'autres réservations confirmées (§10), et où elle
 * est dans Google Agenda.
 */
export function AvisReservation({ r }: { r: Reservation }) {
  const { reservations, auj } = useDonnees()
  const conflits = conflitsAirbnbDe(r, reservations)
  const autres = chevauchements(r, reservations).filter((c) => c.autre.origine !== 'airbnb' || r.origine === 'airbnb')
  const annonce = annonceAirbnb(r)
  const lien = lienAirbnb(r)
  return (
    <div className="space-y-2">
      {r.origine === 'airbnb' && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Réservation <strong>Airbnb</strong> ({annonce ?? 'Vieille-France'}), lue dans le calendrier d'Airbnb : à compléter (nombre de personnes, client, notes).
          Ses dates suivent Airbnb ; elle n'est jamais réécrite dans Google Agenda.
          {lien && (
            <>
              {' '}
              <a className="underline" href={lien} target="_blank" rel="noreferrer">
                Ouvrir dans Airbnb
              </a>
            </>
          )}
        </p>
      )}
      {conflits.length > 0 && (
        <p className={ui.erreur}>
          Conflit avec Airbnb : la Vieille-France ({conflits[0].communs.join(', ')}) est réservée{' '}
          <Lien r={conflits[0].autre} auj={auj} /> sur Airbnb. Changez les dates ou les sections : elle ne peut pas être confirmée par-dessus.
        </p>
      )}
      {autres.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Mêmes sections ou salles, mêmes nuits qu'une réservation confirmée :
          <ul className="mt-1 list-disc pl-5">
            {autres.map((c) => (
              <li key={c.autre.id}>
                <Lien r={c.autre} auj={auj} /> ({c.communs.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      )}
      <EtatAgenda r={r} />
    </div>
  )
}

function Lien({ r, auj }: { r: Pick<Reservation, 'id' | 'numero' | 'nom' | 'date_arrivee' | 'date_depart'>; auj: string }) {
  return (
    <Link to={`/reservations/r/${r.id}`} className="font-medium underline">
      {r.numero} {r.nom} ({dateCourte(r.date_arrivee, auj)} → {dateCourte(r.date_depart, auj)})
    </Link>
  )
}

/** Où la réservation est dans Google Agenda ; mise à jour tout de suite quand elle change. */
function EtatAgenda({ r }: { r: Reservation }) {
  const { reglages } = useDonnees()
  const ligne = useAgenda(r.id)
  const [mode, setMode] = useState<ModeAgenda | null>(null)
  const actif = reglages.agenda.actif
  useEffect(() => {
    if (!actif) return
    synchroniserAgenda(r.id)
      .then((res) => setMode(res.mode))
      .catch(() => {})
  }, [actif, r.id, r.updated_at])
  if (!actif) return null
  const attendu = calendrierDe(r)
  const l = ligne.data
  const aJour = l && l.calendrier === attendu && !l.erreur
  return (
    <p className="text-xs text-pierre-500">
      Google Agenda{mode === 'simule' && ' (simulé en DEV)'} :{' '}
      {l?.erreur ? (
        <span className="text-red-700">{l.erreur}</span>
      ) : !attendu ? (
        l?.calendrier ? 'à retirer…' : 'dans aucun calendrier'
      ) : aJour ? (
        <>
          {NOMS_CALENDRIER[attendu]} ✓{l?.synchronise_le && ` · ${quand(l.synchronise_le)}`}
        </>
      ) : (
        `${NOMS_CALENDRIER[attendu]} (en cours)`
      )}
    </p>
  )
}

/** Liste : réservations de groupe confirmées qui tombent sur Airbnb. */
export function BandeauConflitsAirbnb() {
  const { reservations, auj } = useDonnees()
  const conflits = conflitsAirbnb(reservations.filter((r) => r.date_depart >= auj))
  if (!conflits.length) return null
  return (
    <div className={`${ui.erreur} mb-3`}>
      Conflits avec Airbnb (Vieille-France) :
      <ul className="mt-1 list-disc pl-5">
        {conflits.map((c) => (
          <li key={`${c.groupe.id}-${c.airbnb.id}`}>
            <Lien r={c.groupe} auj={auj} /> sur <Lien r={c.airbnb} auj={auj} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Réglages : Google Agenda (écriture, identifiants des calendriers) et lecture d'Airbnb. */
export function ReglagesAgenda() {
  const { reglages, ecriture } = useDonnees()
  const enregistrer = useEnregistrerReglage()
  const agenda = reglages.agenda
  const [mode, setMode] = useState<string | null>(null)
  const [lecture, setLecture] = useState<string | null>(null)
  const changer = (n: Partial<typeof agenda>) => enregistrer.mutate({ cle: 'agenda', valeur: { ...agenda, ...n } })
  const changerCalendrier = (cle: CleCalendrier, id: string) => changer({ calendriers: { ...agenda.calendriers, [cle]: id.trim() } })
  const synchroniser = () =>
    synchroniserAgenda()
      .then((res) =>
        setMode(
          res.erreur ??
            `${res.mode === 'simule' ? 'Simulé (DEV) : ' : ''}${res.faites} changement(s)${res.restantes ? `, ${res.restantes} au prochain passage` : ''}.`,
        ),
      )
      .catch((e: Error) => setMode(e.message))
  const lire = () =>
    lireAirbnb()
      .then((b) => setLecture(b.erreurs.length ? b.erreurs.join(' ; ') : 'Lu.'))
      .catch((e: Error) => setLecture(e.message))
  const a = reglages.airbnbLecture
  return (
    <>
      <Section titre="Google Agenda">
        <div className="space-y-3 text-sm">
          <p className="text-pierre-500">
            L'app écrit les réservations dans les 5 calendriers selon leur étape (jamais l'inverse). Confirmée VF bloque Airbnb. En DEV, rien ne part chez Google :
            c'est simulé.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={agenda.actif} disabled={!ecriture} onChange={(e) => changer({ actif: e.target.checked })} />
            <span>Écrire dans Google Agenda</span>
          </label>
          <p className="text-xs text-amber-800">À cocher à la bascule seulement, une fois les événements d'Airtable retirés des calendriers (sinon, doublons).</p>
          <div className="space-y-2">
            {CALENDRIERS.map((c) => (
              <label key={c.cle} className="flex items-center gap-2">
                <span className="w-28 shrink-0">{c.nom}</span>
                <input
                  className={`${ui.champ} text-xs`}
                  placeholder="identifiant…@group.calendar.google.com"
                  defaultValue={agenda.calendriers[c.cle]}
                  disabled={!ecriture}
                  onBlur={(e) => e.target.value.trim() !== agenda.calendriers[c.cle] && changerCalendrier(c.cle, e.target.value)}
                />
              </label>
            ))}
          </div>
          {agenda.actif && (
            <div className="flex flex-wrap items-center gap-2">
              <button className={ui.boutonSecondaire} onClick={synchroniser}>
                Mettre à jour maintenant
              </button>
              {mode && <span className="text-xs text-pierre-500">{mode}</span>}
            </div>
          )}
        </div>
      </Section>
      <Section titre="Airbnb (Vieille-France)">
        <div className="space-y-2 text-sm">
          <p className="text-pierre-500">
            Les deux annonces (VF complète, étage du bas) sont lues aux 15 minutes : chaque réservation arrive confirmée, « à compléter ». Une réservation de groupe
            ne peut pas être confirmée par-dessus.
          </p>
          {a ? (
            <p>
              Dernière lecture : {quand(a.quand)} —{' '}
              {Object.entries(a.annonces)
                .map(([k, v]) => `${k === 'vf_complet' ? 'VF complète' : 'étage du bas'} : ${v.reservations} réservation(s)`)
                .join(' ; ')}
              {a.erreurs.length > 0 && <span className="block text-red-700">{a.erreurs.join(' ; ')}</span>}
            </p>
          ) : (
            <p className="text-pierre-500">Pas encore lu (adresses iCal : secrets AIRBNB_ICAL_VF_COMPLET et AIRBNB_ICAL_VF_BAS).</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className={ui.boutonSecondaire} onClick={lire}>
              Lire maintenant
            </button>
            {lecture && <span className="text-xs text-pierre-500">{lecture}</span>}
          </div>
        </div>
      </Section>
    </>
  )
}
