import { useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { useSortieCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import {
  aConfirmer,
  confirmationOuverte,
  differences,
  evaluer,
  evaluerChamp,
  infosDe,
  libelle,
  partager,
  reponseDecision,
  resumeChangement,
  texteRaison,
  valeur,
  type ChampSejour,
  type Decisions,
  type Difference,
  type Verdict,
} from './confirmation'
import { useDonnees } from './contexte'
import { aujourdhui } from './demande'
import { useConfirmations, useDeciderChangement } from './donnees'
import { dateLongue } from './format'
import { langueDuGroupe } from './public/outils'
import type { ConfirmationClient, Reservation } from './types'

// Confirmation des informations du séjour par le client, sur sa page
// (pré-arrivée). En haut de la fiche : la demande de changement, décidée
// ligne par ligne (réunion du 2026-10-21 : ✓ / ✗ sur chaque changement ;
// un refus = message au client et appel). Plus bas : l'historique.

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

/** Jour de Montréal d'un moment (AAAA-MM-JJ). */
const jourDe = (iso: string) => aujourdhui(new Date(iso))

function PuceVerdict({ v, court }: { v: Verdict; court?: boolean }) {
  return v.dansRegles ? (
    <span className="whitespace-nowrap rounded-full border border-foret-300 bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800">
      Dans les règles{v.automne && !court ? ' (école d’automne)' : ''}
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Hors règle</span>
  )
}

/** Demande de changement du client à décider (rien s'il n'y en a pas). */
export function ChangementAuSejour({ r }: { r: Reservation }) {
  const { ecriture } = useDonnees()
  const confirmations = useConfirmations(r.id)
  const c = confirmations.data?.find((x) => x.statut === 'a_traiter')
  if (!c?.propose) return null
  return <ChangementATraiter key={c.id} r={r} c={c} ecriture={ecriture} />
}

/** Téléphone à appeler : responsable de la réservation, de la facturation, sinon l'organisation. */
function useTelephone(r: Reservation) {
  const { contactParId, orgParId } = useDonnees()
  const resp = r.contact_reservation_id ? contactParId.get(r.contact_reservation_id) : undefined
  const fact = r.contact_facturation_id ? contactParId.get(r.contact_facturation_id) : undefined
  const org = r.organisation_id ? orgParId.get(r.organisation_id) : undefined
  if (resp?.telephone) return { nom: resp.nom, telephone: resp.telephone }
  if (fact?.telephone) return { nom: fact.nom, telephone: fact.telephone }
  if (org?.telephone) return { nom: org.nom, telephone: org.telephone }
  return { nom: resp?.nom ?? fact?.nom ?? null, telephone: null }
}

function BoutonDecision({ actif, oui, onClick, disabled }: { actif: boolean; oui: boolean; onClick: () => void; disabled?: boolean }) {
  const style = actif
    ? oui
      ? 'border-foret-600 bg-foret-600 text-white'
      : 'border-red-600 bg-red-600 text-white'
    : oui
      ? 'border-pierre-300 bg-white text-pierre-700 hover:border-foret-500 hover:text-foret-800'
      : 'border-pierre-300 bg-white text-pierre-700 hover:border-red-400 hover:text-red-700'
  return (
    <button
      type="button"
      aria-pressed={actif}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm font-medium ${style} disabled:opacity-50`}
    >
      {oui ? '✓ Accepter' : '✗ Refuser'}
    </button>
  )
}

function ChangementATraiter({ r, c, ecriture }: { r: Reservation; c: ConfirmationClient; ecriture: boolean }) {
  const decider = useDeciderChangement()
  const [decisions, setDecisions] = useState<Decisions>({})
  const [message, setMessage] = useState('')
  const [appel, setAppel] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { ref, sortir } = useSortieCarte<HTMLElement>()
  const propose = c.propose!
  const jour = jourDe(c.recue_le)
  const diffs = differences(c.actuel, propose, r.forfait)
  const verdict = evaluer(r.forfait, c.actuel, propose, jour)
  const maintenant = infosDe(r)
  const { acceptes, refuses } = partager(diffs, decisions)
  const toutDecide = acceptes.length + refuses.length === diffs.length
  const reponse = reponseDecision(diffs, decisions, r.forfait, message, langueDuGroupe(r.langue))

  const choisir = (champ: ChampSejour, oui: boolean) => setDecisions((d) => ({ ...d, [champ]: oui }))
  const tous = (oui: boolean) => setDecisions(Object.fromEntries(diffs.map((d) => [d.champ, oui])))

  // Décidée, la demande quitte la fiche : l'encadré sort d'abord (revient si la base refuse).
  const appliquer = (clientAppele: boolean | null) => {
    setErreur(null)
    sortir(() => decider.mutateAsync({ id: c.id, decisions, reponse, clientAppele }).then(() => setAppel(false))).catch((e) =>
      setErreur(messageErreur(e)),
    )
  }
  const bloque = !toutDecide ? 'Acceptez ou refusez chaque changement.' : refuses.length && !message.trim() ? 'Écrivez au client pourquoi (obligatoire dès qu’un changement est refusé).' : null

  return (
    <section ref={ref} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-amber-900">Le client propose un changement au séjour — à décider ligne par ligne</h2>
          <p className="text-sm text-amber-900/80">
            Reçu le {quand(c.recue_le)} de {c.nom}, par la page client. Rien n'est changé tant que vous n'avez pas appliqué votre décision ; l'estimé ne change jamais tout seul.
          </p>
        </div>
        <PuceVerdict v={verdict} />
      </div>

      <ul className="divide-y divide-pierre-100 overflow-hidden rounded-lg border border-amber-200 bg-white">
        {diffs.map((d) => (
          <LigneChangement
            key={d.champ}
            r={r}
            d={d}
            depuis={maintenant[d.champ]}
            verdict={evaluerChamp(r.forfait, c.actuel, propose, jour, d.champ)}
            decision={decisions[d.champ]}
            ecriture={ecriture}
            choisir={(oui) => choisir(d.champ, oui)}
          />
        ))}
      </ul>

      {c.message && (
        <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-pierre-800">
          <span className="text-pierre-500">Message du client : </span>
          {c.message}
        </p>
      )}

      {ecriture && (
        <div className="space-y-2">
          {diffs.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="text-foret-700 underline" onClick={() => tous(true)}>
                Tout accepter
              </button>
              <button type="button" className="text-red-700 underline" onClick={() => tous(false)}>
                Tout refuser
              </button>
            </div>
          )}
          <label className="block">
            <span className={ui.etiquette}>
              Message au client (affiché sur sa page){refuses.length > 0 && <span className="text-red-700"> — obligatoire : un changement est refusé</span>}
            </span>
            <textarea
              rows={2}
              className={ui.champ}
              value={message}
              placeholder="Ex. : C'est noté, l'horaire suivra. — Pour un refus, expliquez pourquoi."
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {refuses.length > 0 && acceptes.length > 0 && (
            <div className="rounded-lg border border-pierre-200 bg-white px-3 py-2 text-xs text-pierre-600">
              <p className="mb-1 font-medium text-pierre-700">Ce que le client lira sur sa page</p>
              <p className="whitespace-pre-wrap">{reponse}</p>
            </div>
          )}
          {refuses.length > 0 && (
            <p className="text-xs text-red-800">Règle de l'équipe : un refus se dit aussi au téléphone. On vous le rappelle en appliquant.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={refuses.length && !acceptes.length ? ui.boutonRouge : ui.bouton}
              disabled={decider.isPending || !!bloque}
              title={bloque ?? undefined}
              onClick={() => (refuses.length ? setAppel(true) : appliquer(null))}
            >
              {!toutDecide
                ? `Appliquer (${acceptes.length + refuses.length} sur ${diffs.length} décidé${diffs.length > 1 ? 's' : ''})`
                : refuses.length === 0
                  ? 'Accepter et mettre le séjour à jour'
                  : acceptes.length === 0
                    ? 'Refuser le changement…'
                    : `Appliquer : ${acceptes.length} accepté${acceptes.length > 1 ? 's' : ''}, ${refuses.length} refusé${refuses.length > 1 ? 's' : ''}…`}
            </button>
            <span className="text-xs text-pierre-500">Seuls les changements acceptés sont écrits dans le séjour. Si le prix change, faites une nouvelle version de l'estimé.</span>
          </div>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
        </div>
      )}

      {appel && <AppelerClient r={r} refuses={refuses} enCours={decider.isPending} erreur={erreur} fermer={() => setAppel(false)} appliquer={appliquer} />}
    </section>
  )
}

function LigneChangement({
  r,
  d,
  depuis,
  verdict,
  decision,
  ecriture,
  choisir,
}: {
  r: Reservation
  d: Difference
  depuis: Difference['avant']
  verdict: Verdict
  decision: boolean | undefined
  ecriture: boolean
  choisir: (oui: boolean) => void
}) {
  const aBouge = String(depuis ?? '') !== String(d.avant ?? '')
  const fond = decision === true ? 'bg-foret-50/60' : decision === false ? 'bg-red-50/60' : ''
  return (
    <li className={`grid items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto] ${fond}`}>
      <span className="font-medium text-pierre-700">{libelle(d.champ, r.forfait)}</span>
      <span className="min-w-0">
        <span className="text-pierre-500">{valeur(d.champ, d.avant)}</span>
        <span className="px-1.5 text-pierre-400">→</span>
        <span className="font-medium text-pierre-900">{valeur(d.champ, d.apres)}</span>
        {aBouge && <span className="block text-xs text-amber-800">Depuis changé pour : {valeur(d.champ, depuis)}</span>}
        {!verdict.dansRegles && (
          <span className="block text-xs text-red-700">{verdict.raisons.map((x) => texteRaison(x)).join(' ')}</span>
        )}
      </span>
      <span>
        <PuceVerdict v={verdict} court />
      </span>
      {ecriture ? (
        <span className="flex gap-1.5">
          <BoutonDecision oui actif={decision === true} onClick={() => choisir(true)} />
          <BoutonDecision oui={false} actif={decision === false} onClick={() => choisir(false)} />
        </span>
      ) : (
        <span />
      )}
    </li>
  )
}

/** Refus : la règle de l'équipe (on appelle le client) avant d'appliquer. */
function AppelerClient({
  r,
  refuses,
  enCours,
  erreur,
  fermer,
  appliquer,
}: {
  r: Reservation
  refuses: Difference[]
  enCours: boolean
  erreur: string | null
  fermer: () => void
  appliquer: (clientAppele: boolean) => void
}) {
  const tel = useTelephone(r)
  const [appele, setAppele] = useState(false)
  return (
    <Dialogue titre="Un changement est refusé : appelez le client" fermer={fermer}>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-700">
          Refusé : <span className="font-medium">{resumeChangement(refuses, r.forfait)}</span>
        </p>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          Règle de l'équipe : quand on refuse un changement, on appelle le client. Le message sur sa page ne suffit pas.
        </p>
        <div>
          <p className={ui.etiquette}>À appeler</p>
          {tel.telephone ? (
            <a className="text-base font-medium text-foret-700 hover:underline" href={`tel:${tel.telephone.replace(/[^\d+]/g, '')}`}>
              {tel.nom ? `${tel.nom} · ` : ''}
              {tel.telephone}
            </a>
          ) : (
            <p className="text-pierre-500">{tel.nom ? `${tel.nom} : ` : ''}aucun téléphone dans le CRM (fiche › Client).</p>
          )}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={appele} onChange={(e) => setAppele(e.target.checked)} />
          J'ai déjà appelé le client
        </label>
        <p className="text-xs text-pierre-500">
          {appele
            ? 'Le journal notera que le client a été appelé.'
            : r.organisation_id
              ? 'Le journal notera l’appel à faire, et une relance « appeler le client » vous sera assignée (CRM, accueil).'
              : 'Le journal notera l’appel à faire.'}
        </p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.boutonRouge} disabled={enCours} onClick={() => appliquer(appele)}>
            {enCours ? 'Enregistrement…' : 'Appliquer la décision'}
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

/** Statut affiché d'une confirmation (« accepté en partie » d'après les décisions). */
function statutDe(c: ConfirmationClient): [string, string] {
  if (c.statut === 'acceptee' && c.decisions && Object.values(c.decisions).some((v) => v === false))
    return ['Changement accepté en partie', 'bg-amber-100 text-amber-900']
  return STATUTS[c.statut]
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
            Sur sa page, le client confirme ses dates, heures, nombres, ratio et repas, ou propose un changement (à décider ici, ligne par ligne). Dans les règles : ±10 % des
            participants jusqu'à 21 jours avant l'arrivée (écoles d'août et septembre : jusqu'à 3 jours avant) ; dates et ratio toujours à évaluer.
          </p>
        )}

        {liste.length > 0 && (
          <ul className="divide-y divide-pierre-100 border-t border-pierre-100">
            {liste.map((c) => {
              const [nom, style] = statutDe(c)
              const diffs = c.propose ? differences(c.actuel, c.propose, r.forfait) : []
              const verdict = c.propose ? evaluer(r.forfait, c.actuel, c.propose, jourDe(c.recue_le)) : null
              const parLigne = c.decisions ? partager(diffs, c.decisions) : null
              return (
                <li key={c.id} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{nom}</span>
                    {verdict && <PuceVerdict v={verdict} />}
                    <span className="text-xs text-pierre-500">
                      {quand(c.recue_le)} · {c.nom} (client)
                    </span>
                  </div>
                  {parLigne && (parLigne.acceptes.length > 0 || parLigne.refuses.length > 0) ? (
                    <>
                      {parLigne.acceptes.length > 0 && <p className="text-foret-800">✓ {resumeChangement(parLigne.acceptes, r.forfait)}</p>}
                      {parLigne.refuses.length > 0 && <p className="text-red-700">✗ {resumeChangement(parLigne.refuses, r.forfait)}</p>}
                    </>
                  ) : (
                    diffs.length > 0 && <p className="text-pierre-800">{resumeChangement(diffs, r.forfait)}</p>
                  )}
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
                    <p className="whitespace-pre-wrap text-xs text-pierre-500">
                      {c.statut === 'refusee' ? 'Refusé' : parLigne?.refuses.length ? 'Accepté en partie' : 'Accepté'} par {c.traitee_par_nom ?? '—'} le {quand(c.traitee_le)}
                      {c.client_appele === true && ' · client appelé'}
                      {c.client_appele === false && ' · client à appeler'}
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
