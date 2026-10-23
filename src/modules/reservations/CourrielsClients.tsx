import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { useSortieCarte } from '@/lib/sortieCarte'
import { supabase } from '@/lib/supabase'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { CHAMPS_COURRIEL, listeAdresses, NOMS_COURRIEL, TYPES_COURRIEL, type ModeCourriel } from './courriels'
import { FenetreCourriel, type DepartCourriel, type ValeursCourriel } from './FenetreCourriel'
import {
  preparerCourriels,
  useCourriels,
  useCourrielsOnglet,
  useEnvoyerCourriel,
  useModelesCourriels,
  useModifierCourriel,
  useModifierModeleCourriel,
  type ModeEnvoi,
} from './donnees'
import type { Courriel, ModeleCourriel, Reservation } from './types'

const quand = (ts: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' }).format(new Date(ts))

const ENVOI: Record<ModeEnvoi, string> = {
  mailpit: 'DEV : les courriels partent dans Mailpit (http://localhost:54324), jamais chez un client.',
  gmail: '',
  bloque: 'Base locale sans Mailpit : aucun envoi possible (COURRIELS_MAILPIT dans .dev.vars).',
  non_configure: 'Gmail n’est pas encore configuré pour inscriptions@ (README, section 13) : les courriels se préparent, mais ne partent pas.',
}

/** Mode d'envoi du Worker (lu en préparant), affiché une fois. */
function AvisEnvoi({ envoi }: { envoi: ModeEnvoi | null }) {
  if (!envoi || !ENVOI[envoi]) return null
  return <p className={`rounded-lg border px-3 py-2 text-sm ${envoi === 'mailpit' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{ENVOI[envoi]}</p>
}

/** Courriels d'une réservation (fiche) : préparés tout de suite à l'ouverture, puis aux 15 minutes. */
export function CourrielsReservation({ r }: { r: Reservation }) {
  const courriels = useCourriels(r.id)
  const [envoi, setEnvoi] = useState<ModeEnvoi | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => {
    preparerCourriels(r.id)
      .then((res) => setEnvoi(res.envoi))
      .catch((e: Error) => setErreur(e.message))
  }, [r.id, r.updated_at])
  const liste = courriels.data ?? []
  const prepares = liste.filter((c) => c.statut === 'prepare')
  const autres = liste.filter((c) => c.statut !== 'prepare').reverse()
  return (
    <Section titre="Courriels">
      <div className="space-y-3 text-sm">
        <AvisEnvoi envoi={envoi} />
        {erreur && <p className="text-xs text-pierre-500">Préparation des courriels : {erreur}</p>}
        {!liste.length && (
          <p className="text-pierre-500">
            Aucun courriel pour l'instant. L'estimé et le contrat partent par leur fenêtre (« Envoyer l'estimé… », « Envoyer le contrat… ») ; les autres (rappels,
            factures, pré-arrivée…) se préparent tout seuls ici.
          </p>
        )}
        {prepares.map((c) => (
          <CarteCourriel key={c.id} c={c} />
        ))}
        {autres.length > 0 && (
          <ul className="divide-y divide-pierre-100">
            {autres.map((c) => (
              <LigneCourriel key={c.id} c={c} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/** Un courriel envoyé ou annulé : une ligne, le texte au clic. */
function LigneCourriel({ c, avecReservation = false }: { c: Courriel; avecReservation?: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <li className="py-2">
      <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOuvert(!ouvert)}>
        <span>
          {c.statut === 'envoye' ? '✉️' : '⨯'}{' '}
          <span className={c.statut === 'annule' ? 'text-pierre-400 line-through' : ''}>
            <span className="font-medium">{NOMS_COURRIEL[c.genre]}</span> · {c.sujet}
          </span>
          {avecReservation && c.reservation && (
            <Link to={`/reservations/r/${c.reservation_id}`} className="ml-2 text-xs text-foret-700 underline" onClick={(e) => e.stopPropagation()}>
              {c.reservation.numero}
            </Link>
          )}
        </span>
        <span className="text-xs text-pierre-500">
          {c.statut === 'envoye'
            ? `envoyé ${c.envoye_le ? quand(c.envoye_le) : ''}${c.envoye_par_nom ? ` · ${c.envoye_par_nom}` : ''}`
            : `annulé${c.raison ? ` (${c.raison.toLowerCase()})` : ''}${c.annule_par_nom ? ` · ${c.annule_par_nom}` : ''}`}
        </span>
      </button>
      {ouvert && (
        <div className="mt-2 rounded-md bg-pierre-50 p-3 text-xs text-pierre-700">
          <p>À : {c.a.join(', ') || '—'}{c.cc.length > 0 && ` · Cc : ${c.cc.join(', ')}`}</p>
          <p className="mt-2 whitespace-pre-wrap">{c.corps}</p>
        </div>
      )}
    </li>
  )
}

/** Courriel préparé : résumé ; « Ouvrir et envoyer… » ouvre la même fenêtre que l'estimé et le contrat. */
function CarteCourriel({ c, avecReservation = false }: { c: Courriel; avecReservation?: boolean }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierCourriel()
  const envoyer = useEnvoyerCourriel()
  const [fenetre, setFenetre] = useState(false)
  // Envoyé ou annulé, le courriel quitte la file : la carte sort d'abord (revient si l'envoi est refusé).
  const { ref, sortir } = useSortieCarte<HTMLDivElement>()
  const type = TYPES_COURRIEL.find((t) => t.genre === c.genre)
  const change = (v: ValeursCourriel) => v.a !== c.a.join(', ') || v.cc !== c.cc.join(', ') || v.sujet !== c.sujet || v.corps !== c.corps
  const enregistrer = (v: ValeursCourriel) => modifier.mutateAsync({ id: c.id, champs: { a: listeAdresses(v.a), cc: listeAdresses(v.cc), sujet: v.sujet.trim(), corps: v.corps.trim() } })

  // Le fil de la réservation impose son sujet (le Worker le reprend à l'envoi).
  const charger = async (): Promise<DepartCourriel> => {
    const { data } = await supabase.schema('reservations').from('fils_courriel').select('sujet').eq('reservation_id', c.reservation_id).maybeSingle()
    return { a: c.a, cc: c.cc, sujet: c.sujet, corps: c.corps, langue: c.langue, fil: data ? { sujet: data.sujet as string } : null }
  }

  const annuler = async () => {
    const ok = await confirmer({ titre: 'Annuler ce courriel ?', message: 'Il ne sera pas envoyé et ne sera plus préparé pour cet événement.', libelleOk: 'Annuler le courriel' })
    if (ok) sortir(() => modifier.mutate({ id: c.id, champs: { statut: 'annule', raison: 'Annulé à la main' } }))
  }

  return (
    <div ref={ref} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {NOMS_COURRIEL[c.genre]} · <span className="font-normal">{c.sujet}</span>
          {avecReservation && c.reservation && (
            <Link to={`/reservations/r/${c.reservation_id}`} className="ml-2 text-xs font-normal text-foret-700 underline">
              {c.reservation.numero} {c.reservation.nom}
            </Link>
          )}
        </span>
        <span className="text-xs text-amber-800">à approuver · préparé {quand(c.prepare_le)}</span>
      </div>
      <p className="mt-1 text-xs text-pierre-600">
        À : {c.a.join(', ') || '—'}
        {c.cc.length > 0 && ` · Cc : ${c.cc.join(', ')}`}
        {type?.piece && ` · 📎 ${type.piece}`}
      </p>
      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-pierre-500">{c.corps}</p>
      {c.erreur && <p className={`${ui.erreur} mt-2`}>{c.erreur}</p>}
      {ecriture && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button className="text-sm text-red-700 underline" onClick={annuler}>
            Annuler le courriel
          </button>
          <button className={ui.bouton} onClick={() => setFenetre(true)}>
            Ouvrir et envoyer…
          </button>
        </div>
      )}
      {fenetre && (
        <FenetreCourriel
          titre={`${NOMS_COURRIEL[c.genre]}${c.reservation ? ` · ${c.reservation.numero}` : ''}`}
          charger={charger}
          piece={type?.piece ? { nom: type.piece, note: 'joint au moment de l’envoi' } : null}
          enregistrer={enregistrer}
          envoyer={async (v) => {
            if (change(v)) await enregistrer(v)
            // La pré-arrivée est produite par le Worker au moment de l'envoi, et jointe.
            await sortir(() => envoyer.mutateAsync(c.id))
          }}
          fermer={() => setFenetre(false)}
        />
      )}
    </div>
  )
}

/** Onglet Courriels : à approuver (toutes les réservations), derniers envoyés, modèles. */
export function OngletCourriels() {
  const onglet = useCourrielsOnglet()
  const [envoi, setEnvoi] = useState<ModeEnvoi | null>(null)
  const [verif, setVerif] = useState<string | null>(null)
  const verifier = () =>
    preparerCourriels()
      .then((res) => {
        setEnvoi(res.envoi)
        setVerif(res.prepares || res.annules ? `${res.prepares} préparé(s), ${res.annules} annulé(s) (plus nécessaires).` : 'Rien de nouveau.')
      })
      .catch((e: Error) => setVerif(e.message))
  useEffect(() => {
    void verifier()
  }, [])
  const prepares = onglet.data?.prepares ?? []
  const envoyes = onglet.data?.envoyes ?? []
  return (
    <div className="space-y-4">
      <Section
        titre={`À approuver${prepares.length ? ` (${prepares.length})` : ''}`}
        action={
          <button className="text-xs text-foret-700 underline" onClick={verifier}>
            Vérifier maintenant
          </button>
        }
      >
        <div className="space-y-2 text-sm">
          <AvisEnvoi envoi={envoi} />
          {verif && <p className="text-xs text-pierre-500">{verif}</p>}
          {!prepares.length && <p className="text-pierre-500">Aucun courriel à approuver. Ils se préparent tout seuls aux 15 minutes.</p>}
          {prepares.map((c) => (
            <CarteCourriel key={c.id} c={c} avecReservation />
          ))}
        </div>
      </Section>
      <Section titre="Derniers envoyés">
        {envoyes.length ? (
          <ul className="divide-y divide-pierre-100 text-sm">
            {envoyes.map((c) => (
              <LigneCourriel key={c.id} c={c} avecReservation />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-pierre-500">Aucun courriel envoyé.</p>
        )}
      </Section>
      <ModelesCourriels />
    </div>
  )
}

const MODES: Record<ModeCourriel, string> = { approuver: "À approuver d'un clic", automatique: 'Automatique', desactive: 'Désactivé' }

/** Modèles des courriels (français et anglais) et mode de chaque type. */
function ModelesCourriels() {
  const modeles = useModelesCourriels()
  const [choisi, setChoisi] = useState<string>('accuse')
  const m = modeles.data?.find((x) => x.genre === choisi)
  return (
    <Section titre="Modèles des courriels">
      <div className="grid gap-4 text-sm lg:grid-cols-[16rem_1fr]">
        <ul className="space-y-1">
          {TYPES_COURRIEL.map((t) => {
            const mode = modeles.data?.find((x) => x.genre === t.genre)?.mode
            return (
              <li key={t.genre}>
                <button
                  className={`w-full rounded-md px-2 py-1.5 text-left ${choisi === t.genre ? 'bg-foret-50 font-medium text-foret-900' : 'hover:bg-pierre-50'}`}
                  onClick={() => setChoisi(t.genre)}
                >
                  {t.nom}
                  {t.fenetre ? (
                    <span className="block text-xs text-sky-700">Fenêtre de la fiche</span>
                  ) : (
                    mode && <span className={`block text-xs ${mode === 'desactive' ? 'text-pierre-400' : mode === 'automatique' ? 'text-foret-700' : 'text-amber-700'}`}>{MODES[mode]}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {m && <EditeurModele key={m.genre} m={m} />}
      </div>
      <details className="mt-4 text-xs text-pierre-600">
        <summary className="cursor-pointer">Champs des modèles</summary>
        <p className="mt-2">
          <code>{'{{champ}}'}</code> est remplacé par sa valeur ; <code>{'{{#si champ}}…{{/si}}'}</code> n'écrit le texte que si le champ n'est pas vide ; <code>**gras**</code>. Les liens
          deviennent cliquables.
        </p>
        <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {CHAMPS_COURRIEL.map(([cle, aide]) => (
            <li key={cle}>
              <code>{`{{${cle}}}`}</code> — {aide}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  )
}

function EditeurModele({ m }: { m: ModeleCourriel }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierModeleCourriel()
  const [valeurs, setValeurs] = useState({ sujet_fr: m.sujet_fr, corps_fr: m.corps_fr, sujet_en: m.sujet_en, corps_en: m.corps_en })
  const [erreur, setErreur] = useState<string | null>(null)
  const type = TYPES_COURRIEL.find((t) => t.genre === m.genre)!
  const change = (Object.keys(valeurs) as (keyof typeof valeurs)[]).some((k) => valeurs[k] !== m[k])
  const changer = (champs: Partial<Omit<ModeleCourriel, 'genre'>>) => {
    setErreur(null)
    modifier.mutate({ genre: m.genre, champs }, { onError: (e) => setErreur(e.message) })
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-pierre-600">
          <span className="font-medium text-pierre-900">Quand :</span> {type.quand}
          {type.piece && <span className="block text-xs">📎 {type.piece}</span>}
        </p>
        {type.fenetre ? (
          <span className="text-xs text-pierre-600">Envoyé par la fenêtre de la fiche, modifiable avant l'envoi</span>
        ) : (
          <label className="flex items-center gap-2">
            <span className="text-pierre-600">Mode</span>
            <select className={`${ui.champ} w-auto`} value={m.mode} disabled={!ecriture} onChange={(e) => changer({ mode: e.target.value as ModeCourriel })}>
              {(Object.keys(MODES) as ModeCourriel[]).map((k) => (
                <option key={k} value={k} disabled={k === 'automatique' && !type.automatique}>
                  {MODES[k]}
                  {k === 'automatique' && !type.automatique ? ' (pas offert pour ce courriel)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="rounded-lg border border-pierre-200 bg-pierre-50 px-3 py-2 text-xs text-pierre-600">
        Un seul fil Gmail par réservation : le sujet du modèle ne sert qu'au <strong>premier</strong> courriel envoyé au client ; tous les suivants gardent le sujet
        du fil (Gmail l'exige pour les garder ensemble).
      </p>
      <div className="grid gap-3 xl:grid-cols-2">
        {(['fr', 'en'] as const).map((l) => (
          <div key={l} className="space-y-2">
            <p className={ui.etiquette}>{l === 'fr' ? 'Français' : 'Anglais'}</p>
            <input
              className={ui.champ}
              value={valeurs[`sujet_${l}`]}
              disabled={!ecriture}
              onChange={(e) => setValeurs({ ...valeurs, [`sujet_${l}`]: e.target.value })}
            />
            <textarea
              className={`${ui.champ} min-h-72 font-sans`}
              value={valeurs[`corps_${l}`]}
              disabled={!ecriture}
              onChange={(e) => setValeurs({ ...valeurs, [`corps_${l}`]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      {ecriture && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-pierre-500">
            {m.updated_by_nom ? `Modifié par ${m.updated_by_nom}` : 'Modèle de départ'} · un modèle ne change que les courriels préparés ensuite.
          </p>
          <button className={ui.bouton} disabled={!change || modifier.isPending} onClick={() => changer(valeurs)}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  )
}

