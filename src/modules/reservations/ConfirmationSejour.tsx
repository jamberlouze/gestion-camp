import { useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import {
  aConfirmer,
  confirmationOuverte,
  differences,
  evaluer,
  infosDe,
  libelle,
  resumeChangement,
  texteRaison,
  valeur,
  type Verdict,
} from './confirmation'
import { useDonnees } from './contexte'
import { aujourdhui } from './demande'
import { useConfirmations, useTraiterChangement } from './donnees'
import { dateLongue } from './format'
import type { ConfirmationClient, Reservation } from './types'

// Confirmation des informations du séjour par le client, sur sa page
// (pré-arrivée). En haut de la fiche : la demande de changement à accepter
// ou refuser. Plus bas : l'historique (confirmations, changements, réponses).

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

/** Jour de Montréal d'un moment (AAAA-MM-JJ). */
const jourDe = (iso: string) => aujourdhui(new Date(iso))

function PuceVerdict({ v }: { v: Verdict }) {
  return v.dansRegles ? (
    <span className="rounded-full border border-foret-300 bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800">
      Dans les règles{v.automne ? ' (école d’automne)' : ''}
    </span>
  ) : (
    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Hors règle</span>
  )
}

/** Demande de changement du client à accepter ou refuser (rien s'il n'y en a pas). */
export function ChangementAuSejour({ r }: { r: Reservation }) {
  const { ecriture } = useDonnees()
  const confirmations = useConfirmations(r.id)
  const c = confirmations.data?.find((x) => x.statut === 'a_traiter')
  if (!c?.propose) return null
  return <ChangementATraiter key={c.id} r={r} c={c} ecriture={ecriture} />
}

function ChangementATraiter({ r, c, ecriture }: { r: Reservation; c: ConfirmationClient; ecriture: boolean }) {
  const traiter = useTraiterChangement()
  const [reponse, setReponse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const propose = c.propose!
  const diffs = differences(c.actuel, propose, r.forfait)
  const verdict = evaluer(r.forfait, c.actuel, propose, jourDe(c.recue_le))
  const maintenant = infosDe(r)

  const decider = (accepter: boolean) => {
    setErreur(null)
    traiter.mutate({ id: c.id, accepter, reponse }, { onError: (e) => setErreur(messageErreur(e)) })
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-amber-900">Le client propose un changement au séjour — à accepter ou refuser</h2>
          <p className="text-sm text-amber-900/80">
            Reçu le {quand(c.recue_le)} de {c.nom}, par la page client. Rien n'est changé tant que vous n'avez pas accepté ; l'estimé ne change jamais tout seul.
          </p>
        </div>
        <PuceVerdict v={verdict} />
      </div>

      {!verdict.dansRegles && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-800">
          {verdict.raisons.map((x, i) => (
            <li key={i}>{texteRaison(x)}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-1.5 font-medium" />
              <th className="px-3 py-1.5 font-medium">Avant</th>
              <th className="px-3 py-1.5 font-medium">Proposé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {diffs.map((d) => {
              const depuis = maintenant[d.champ]
              const aBouge = String(depuis ?? '') !== String(d.avant ?? '')
              return (
                <tr key={d.champ}>
                  <td className="px-3 py-1.5 text-pierre-600">{libelle(d.champ, r.forfait)}</td>
                  <td className="px-3 py-1.5 text-pierre-500">
                    {valeur(d.champ, d.avant)}
                    {aBouge && <div className="text-xs text-amber-800">Depuis changé pour : {valeur(d.champ, depuis)}</div>}
                  </td>
                  <td className="px-3 py-1.5 font-medium text-pierre-900">{valeur(d.champ, d.apres)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {c.message && (
        <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-pierre-800">
          <span className="text-pierre-500">Message du client : </span>
          {c.message}
        </p>
      )}

      {ecriture && (
        <div className="space-y-2">
          <label className="block">
            <span className={ui.etiquette}>Message au client (affiché sur sa page)</span>
            <textarea
              rows={2}
              className={ui.champ}
              value={reponse}
              placeholder="Ex. : C'est noté, l'horaire suivra. — Obligatoire pour refuser : expliquez pourquoi."
              onChange={(e) => setReponse(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className={ui.bouton} disabled={traiter.isPending} onClick={() => decider(true)}>
              Accepter et mettre le séjour à jour
            </button>
            <button className={ui.boutonRouge} disabled={traiter.isPending || !reponse.trim()} title={reponse.trim() ? undefined : 'Écrivez au client pourquoi'} onClick={() => decider(false)}>
              Refuser
            </button>
            <span className="text-xs text-pierre-500">Accepté : seuls les champs changés par le client sont écrits dans le séjour. Si le prix change, faites une nouvelle version de l'estimé.</span>
          </div>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
        </div>
      )}
    </section>
  )
}

const STATUTS: Record<ConfirmationClient['statut'], [string, string]> = {
  recue: ['Confirmé', 'bg-foret-50 text-foret-800'],
  a_traiter: ['Changement à traiter', 'bg-amber-100 text-amber-900'],
  acceptee: ['Changement accepté', 'bg-foret-50 text-foret-800'],
  refusee: ['Changement refusé', 'bg-red-50 text-red-700'],
  remplacee: ['Changement remplacé', 'bg-pierre-100 text-pierre-600'],
}

/** Section de la fiche : où en est la confirmation, et tout l'historique. */
export function ConfirmationsSejour({ r }: { r: Reservation }) {
  const { auj } = useDonnees()
  const confirmations = useConfirmations(r.id)
  const liste = confirmations.data ?? []
  const ouverte = confirmationOuverte(r, auj)
  if (!ouverte && liste.length === 0) return null
  const derniere = liste.find((c) => c.genre === 'confirmation')
  const depuis = derniere ? differences(derniere.actuel, infosDe(r), r.forfait) : []
  const attente = liste.some((c) => c.statut === 'a_traiter')

  return (
    <Section titre="Confirmation par le client">
      <div className="space-y-3 text-sm">
        {derniere ? (
          <p className={depuis.length ? 'text-amber-800' : 'text-foret-800'}>
            ✓ Informations confirmées par {derniere.nom} le {quand(derniere.recue_le)}
            {depuis.length > 0 && <> — le séjour a changé depuis ({resumeChangement(depuis, r.forfait)}) : à faire confirmer de nouveau.</>}
          </p>
        ) : (
          ouverte &&
          !attente && (
            <p className={aConfirmer(r.date_arrivee, auj) ? 'text-amber-800' : 'text-pierre-600'}>
              Pas encore confirmé par le client.
              {aConfirmer(r.date_arrivee, auj) ? ' Pré-arrivée : il confirme sur sa page (lien de la page client).' : ' Il pourra le faire sur sa page, avant la pré-arrivée.'}
            </p>
          )
        )}
        {ouverte && (
          <p className="text-xs text-pierre-500">
            Sur sa page, le client confirme ses dates, heures, nombres, ratio et repas, ou propose un changement (à accepter ou refuser ici). Dans les règles : ±10 % des
            participants jusqu'à 21 jours avant l'arrivée (écoles d'août et septembre : jusqu'à 3 jours avant) ; dates et ratio toujours à évaluer.
          </p>
        )}

        {liste.length > 0 && (
          <ul className="divide-y divide-pierre-100 border-t border-pierre-100">
            {liste.map((c) => {
              const [nom, style] = STATUTS[c.statut]
              const diffs = c.propose ? differences(c.actuel, c.propose, r.forfait) : []
              const verdict = c.propose ? evaluer(r.forfait, c.actuel, c.propose, jourDe(c.recue_le)) : null
              return (
                <li key={c.id} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{nom}</span>
                    {verdict && <PuceVerdict v={verdict} />}
                    <span className="text-xs text-pierre-500">
                      {quand(c.recue_le)} · {c.nom} (client)
                    </span>
                  </div>
                  {diffs.length > 0 && <p className="text-pierre-800">{resumeChangement(diffs, r.forfait)}</p>}
                  {c.genre === 'confirmation' && (
                    <p className="text-xs text-pierre-500">
                      {c.actuel.date_arrivee === c.actuel.date_depart ? dateLongue(c.actuel.date_arrivee) : `${dateLongue(c.actuel.date_arrivee)} au ${dateLongue(c.actuel.date_depart)}`}
                      {c.actuel.nb_participants !== null && ` · ${c.actuel.nb_participants} ${libelle('nb_participants', r.forfait).toLowerCase()}`}
                      {c.actuel.nb_accompagnateurs !== null && ` · ${c.actuel.nb_accompagnateurs} accompagnateurs`}
                      {c.actuel.ratio && ` · ratio ${valeur('ratio', c.actuel.ratio)}`}
                    </p>
                  )}
                  {c.message && <p className="whitespace-pre-wrap text-xs text-pierre-600">« {c.message} »</p>}
                  {c.traitee_le && c.statut !== 'remplacee' && (
                    <p className="text-xs text-pierre-500">
                      {c.statut === 'acceptee' ? 'Accepté' : 'Refusé'} par {c.traitee_par_nom ?? '—'} le {quand(c.traitee_le)}
                      {c.reponse && <> — message au client : « {c.reponse} »</>}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Section>
  )
}
