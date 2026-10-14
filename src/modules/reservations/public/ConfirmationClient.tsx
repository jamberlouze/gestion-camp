import { useCallback, useEffect, useState } from 'react'
import { ui } from '@/lib/ui'
import {
  aConfirmer,
  champsDe,
  differences,
  estUnJour,
  evaluer,
  libelle,
  resumeChangement,
  texteRaison,
  valeur,
  type ChampSejour,
  type InfosSejour,
} from '../confirmation'
import { aujourdhui, remplacer } from '../demande'
import type { Forfait } from '../types'
import { db, messageDe } from './client'
import { dateLisible } from './outils'
import { TEXTES_PUBLICS } from './textes'

// Page client, pré-arrivée : le client confirme les informations de son
// séjour, ou propose un changement que l'équipe accepte ou refuse (réponse
// affichée ici). Lit reservations.confirmation_client ; écrit par
// confirmer_infos_client et proposer_changement_client. Règles :
// confirmation.ts (indication seulement).

interface Donnees {
  ouverte: boolean
  infos: InfosSejour
  confirmee: { nom: string; recue_le: string; actuel: InfosSejour } | null
  en_attente: { nom: string; recue_le: string; actuel: InfosSejour; propose: InfosSejour; message: string | null } | null
  decisions: { statut: 'acceptee' | 'refusee'; recue_le: string; traitee_le: string; actuel: InfosSejour; propose: InfosSejour; reponse: string | null }[]
}

const jourDe = (iso: string) => aujourdhui(new Date(iso))
const RATIOS_OFFERTS = ['1:10', '1:15', '1:20']

export function ConfirmationInfos({ jeton, forfait, langue, ferme }: { jeton: string; forfait: Forfait; langue: 'fr' | 'en'; ferme: boolean }) {
  const t = TEXTES_PUBLICS[langue].confirmation
  const [d, setD] = useState<Donnees | null>(null)
  const [version, setVersion] = useState(0)
  const relire = useCallback(() => setVersion((v) => v + 1), [])
  const [nom, setNom] = useState('')
  const [edition, setEdition] = useState<InfosSejour | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [merci, setMerci] = useState<string | null>(null)
  const auj = aujourdhui()

  useEffect(() => {
    let actif = true
    db()
      .rpc('confirmation_client', { p_jeton: jeton })
      .then(({ data }) => actif && setD((data as Donnees | null) ?? null))
    return () => {
      actif = false
    }
  }, [jeton, version])

  if (!d || ferme) return null
  const derniereDecision = d.decisions[0]
  if (!d.ouverte && !d.confirmee && !d.en_attente && !derniereDecision) return null

  const infos = d.infos
  const champs = champsDe(forfait).filter((c) => forfait === 'classe_nature' || infos.service_repas || !['nb_dejeuners', 'nb_diners', 'nb_soupers'].includes(c))
  const changeDepuis = d.confirmee ? differences(d.confirmee.actuel, infos, forfait) : []
  const confirmeeValide = !!d.confirmee && changeDepuis.length === 0
  const enEvidence = d.ouverte && aConfirmer(infos.date_arrivee, auj) && !confirmeeValide && !d.en_attente
  // Dernière réponse de l'équipe, si elle est plus récente que la demande en attente.
  const decisionAffichee = derniereDecision && (!d.en_attente || derniereDecision.traitee_le > d.en_attente.recue_le) ? derniereDecision : null

  const appeler = async (f: () => PromiseLike<{ error: { message?: string } | null }>, remerciement: string) => {
    if (!nom.trim()) {
      setErreur(TEXTES_PUBLICS[langue].obligatoire)
      return
    }
    setEnvoi(true)
    setErreur(null)
    const { error } = await f()
    setEnvoi(false)
    if (error) {
      setErreur(messageDe(error, 'Erreur'))
      return
    }
    setMerci(remerciement)
    setEdition(null)
    setMessage('')
    relire()
  }

  const confirmer = () => appeler(() => db().rpc('confirmer_infos_client', { p_jeton: jeton, p_nom: nom }), t.confirmation_envoyee)
  const proposer = () =>
    edition && appeler(() => db().rpc('proposer_changement_client', { p_jeton: jeton, p_nom: nom, p_propose: edition, p_message: message }), t.demande_envoyee)

  return (
    <section className={`${ui.carte} space-y-4 p-5 ${enEvidence ? 'border-amber-300 ring-2 ring-amber-200' : ''}`}>
      <div>
        <h2 className="text-lg font-semibold">{t.titre}</h2>
        {d.ouverte && <p className={`text-sm ${enEvidence ? 'font-medium text-amber-900' : 'text-pierre-600'}`}>{enEvidence ? t.a_confirmer : t.aide}</p>}
      </div>

      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        {champs.map((c) => (
          <div key={c} className="contents">
            <dt className="text-pierre-500">{libelle(c, forfait, langue)}</dt>
            <dd>{valeur(c, infos[c], langue)}</dd>
          </div>
        ))}
      </dl>

      {decisionAffichee && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${decisionAffichee.statut === 'acceptee' ? 'border-foret-200 bg-foret-50 text-foret-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
          <p className="font-medium">{remplacer(decisionAffichee.statut === 'acceptee' ? t.acceptee : t.refusee, { d: dateLisible(jourDe(decisionAffichee.recue_le), langue) })}</p>
          <p>{resumeChangement(differences(decisionAffichee.actuel, decisionAffichee.propose, forfait), forfait, langue)}</p>
          {decisionAffichee.reponse && <p className="mt-1 whitespace-pre-wrap">{remplacer(t.reponse_equipe, { r: decisionAffichee.reponse })}</p>}
        </div>
      )}

      {d.en_attente && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">{remplacer(t.en_attente, { d: dateLisible(jourDe(d.en_attente.recue_le), langue) })}</p>
          <p>{resumeChangement(differences(d.en_attente.actuel, d.en_attente.propose, forfait), forfait, langue)}</p>
          {d.en_attente.message && <p className="mt-1 whitespace-pre-wrap text-amber-900/80">« {d.en_attente.message} »</p>}
        </div>
      )}

      {d.confirmee && !d.en_attente && (
        <p className={`text-sm font-medium ${confirmeeValide ? 'text-foret-800' : 'text-amber-800'}`}>
          {confirmeeValide
            ? remplacer(t.confirmee, { n: d.confirmee.nom, d: dateLisible(jourDe(d.confirmee.recue_le), langue) })
            : remplacer(t.confirmee_changee, { d: dateLisible(jourDe(d.confirmee.recue_le), langue) })}
        </p>
      )}

      {merci && <p className="text-sm font-medium text-foret-800">{merci}</p>}

      {d.ouverte && !edition && (
        <div className="space-y-3 rounded-lg border border-pierre-200 p-3">
          <input className={ui.champ} placeholder={t.votre_nom} aria-label={t.votre_nom} value={nom} autoComplete="name" onChange={(e) => setNom(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {!d.en_attente && !confirmeeValide && (
              <button className={ui.bouton} disabled={envoi || !nom.trim()} onClick={confirmer}>
                {envoi ? t.envoi : t.je_confirme}
              </button>
            )}
            <button
              className={ui.boutonSecondaire}
              disabled={envoi}
              onClick={() => {
                setMerci(null)
                setErreur(null)
                setEdition({ ...(d.en_attente?.propose ?? infos) })
              }}
            >
              {d.en_attente ? t.proposer_autre : t.je_propose}
            </button>
          </div>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
        </div>
      )}

      {d.ouverte && edition && (
        <Changement
          forfait={forfait}
          langue={langue}
          infos={infos}
          edition={edition}
          changer={setEdition}
          message={message}
          changerMessage={setMessage}
          nom={nom}
          changerNom={setNom}
          auj={auj}
          envoi={envoi}
          erreur={erreur}
          envoyer={proposer}
          annuler={() => {
            setEdition(null)
            setErreur(null)
          }}
        />
      )}
    </section>
  )
}

function Changement({
  forfait,
  langue,
  infos,
  edition,
  changer,
  message,
  changerMessage,
  nom,
  changerNom,
  auj,
  envoi,
  erreur,
  envoyer,
  annuler,
}: {
  forfait: Forfait
  langue: 'fr' | 'en'
  infos: InfosSejour
  edition: InfosSejour
  changer: (e: InfosSejour) => void
  message: string
  changerMessage: (m: string) => void
  nom: string
  changerNom: (n: string) => void
  auj: string
  envoi: boolean
  erreur: string | null
  envoyer: () => void
  annuler: () => void
}) {
  const t = TEXTES_PUBLICS[langue].confirmation
  const diffs = differences(infos, edition, forfait)
  const verdict = evaluer(forfait, infos, edition, auj)
  const repas = forfait === 'classe_nature' || edition.service_repas
  const maj = (champs: Partial<InfosSejour>) => changer({ ...edition, ...champs })
  const nombre = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))))

  const champ = (c: ChampSejour, entree: React.ReactNode) => (
    <label key={c} className="block min-w-0">
      <span className={ui.etiquette}>{libelle(c, forfait, langue)}</span>
      {entree}
    </label>
  )
  const nombreDe = (c: 'nb_participants' | 'nb_accompagnateurs' | 'nb_dejeuners' | 'nb_diners' | 'nb_soupers', obligatoire = false) =>
    champ(
      c,
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={ui.champ}
        value={edition[c] ?? ''}
        onChange={(e) => maj({ [c]: obligatoire ? (nombre(e.target.value) ?? 0) : nombre(e.target.value) } as Partial<InfosSejour>)}
      />,
    )
  const heureDe = (c: 'heure_arrivee' | 'heure_depart') =>
    champ(c, <input type="time" step={300} className={ui.champ} value={edition[c] ?? ''} onChange={(e) => maj({ [c]: e.target.value || null } as Partial<InfosSejour>)} />)

  const ratios = [...RATIOS_OFFERTS, ...(infos.ratio && !RATIOS_OFFERTS.includes(infos.ratio) ? [infos.ratio] : [])]

  return (
    <div className="space-y-4 rounded-lg border border-pierre-200 p-3">
      <div>
        <p className="font-medium">{t.changement_titre}</p>
        <p className="text-xs text-pierre-500">{t.changement_aide}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {champ(
          'date_arrivee',
          <input
            type="date"
            className={ui.champ}
            min={auj}
            value={edition.date_arrivee}
            onChange={(e) =>
              e.target.value &&
              maj({ date_arrivee: e.target.value, ...(estUnJour(forfait) || e.target.value > edition.date_depart ? { date_depart: e.target.value } : {}) })
            }
          />,
        )}
        {!estUnJour(forfait) &&
          champ('date_depart', <input type="date" className={ui.champ} min={edition.date_arrivee} value={edition.date_depart} onChange={(e) => e.target.value && maj({ date_depart: e.target.value })} />)}
        {heureDe('heure_arrivee')}
        {heureDe('heure_depart')}
        {nombreDe('nb_participants')}
        {(forfait === 'classe_nature' || forfait === 'journee_plein_air') && (
          <>
            {nombreDe('nb_accompagnateurs')}
            {champ('ages', <input className={ui.champ} value={edition.ages ?? ''} onChange={(e) => maj({ ages: e.target.value || null })} />)}
            <div>
              {champ(
                'ratio',
                <select className={ui.champ} value={edition.ratio ?? ''} onChange={(e) => maj({ ratio: (e.target.value || null) as InfosSejour['ratio'] })}>
                  {!edition.ratio && <option value="">—</option>}
                  {ratios.map((r) => (
                    <option key={r} value={r}>
                      {valeur('ratio', r as InfosSejour['ratio'], langue)}
                    </option>
                  ))}
                </select>,
              )}
              <p className="mt-1 text-xs text-pierre-500">{t.ratios_aide}</p>
            </div>
          </>
        )}
        {champ('langue', <input className={ui.champ} value={edition.langue ?? ''} onChange={(e) => maj({ langue: e.target.value || null })} />)}
        {forfait !== 'classe_nature' &&
          champ(
            'service_repas',
            <select
              className={ui.champ}
              value={edition.service_repas ? 'oui' : 'non'}
              onChange={(e) => {
                const oui = e.target.value === 'oui'
                maj(
                  oui
                    ? { service_repas: true, ...(forfait === 'journee_plein_air' && !edition.nb_diners ? { nb_diners: 1 } : {}) }
                    : { service_repas: false, nb_dejeuners: 0, nb_diners: 0, nb_soupers: 0 },
                )
              }}
            >
              <option value="oui">{t.service_oui}</option>
              <option value="non">{t.service_non}</option>
            </select>,
          )}
      </div>
      {repas && forfait !== 'journee_plein_air' && (
        <div className="grid grid-cols-3 gap-3">
          {nombreDe('nb_dejeuners', true)}
          {nombreDe('nb_diners', true)}
          {nombreDe('nb_soupers', true)}
        </div>
      )}
      <label className="block">
        <span className={ui.etiquette}>{t.message}</span>
        <textarea rows={2} className={ui.champ} placeholder={t.message_aide} value={message} onChange={(e) => changerMessage(e.target.value)} />
      </label>

      {diffs.length === 0 ? (
        <p className="text-sm text-pierre-500">{t.rien_change}</p>
      ) : verdict.dansRegles ? (
        <p className="rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-900">{t.dans_regles}</p>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{t.hors_regle}</p>
          <ul className="list-disc pl-5">
            {verdict.raisons.map((r, i) => (
              <li key={i}>{texteRaison(r, langue)}</li>
            ))}
          </ul>
        </div>
      )}

      <input className={ui.champ} placeholder={t.votre_nom} aria-label={t.votre_nom} value={nom} autoComplete="name" onChange={(e) => changerNom(e.target.value)} />
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={ui.bouton} disabled={envoi || diffs.length === 0 || !nom.trim()} onClick={envoyer}>
          {envoi ? t.envoi : t.envoyer}
        </button>
        <button className={ui.boutonSecondaire} disabled={envoi} onClick={annuler}>
          {t.annuler}
        </button>
      </div>
    </div>
  )
}
