import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { CHAMPS_COURRIEL, NOMS_COURRIEL, TYPES_COURRIEL, type ModeCourriel } from './courriels'
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
import { estimeCourant, garderDocument, pdfDeLaPreArrivee } from './productionPdf'
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
        {!liste.length && <p className="text-pierre-500">Aucun courriel pour l'instant. Ils se préparent tout seuls (estimé envoyé, contrat, factures, pré-arrivée…).</p>}
        {prepares.map((c) => (
          <CarteCourriel key={c.id} c={c} ouvert />
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
          {c.statut === 'envoye' ? '✉️' : '⨯'} <span className={c.statut === 'annule' ? 'text-pierre-400 line-through' : ''}>{c.sujet}</span>
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

const listeCourriels = (texte: string) =>
  texte
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Courriel préparé : destinataires, sujet et texte modifiables, puis Envoyer ou Annuler. */
function CarteCourriel({ c, ouvert: ouvertDepart = false, avecReservation = false }: { c: Courriel; ouvert?: boolean; avecReservation?: boolean }) {
  const { ecriture, parId, sources, modeles } = useDonnees()
  const modifier = useModifierCourriel()
  const envoyer = useEnvoyerCourriel()
  const [ouvert, setOuvert] = useState(ouvertDepart)
  const [a, setA] = useState(c.a.join(', '))
  const [cc, setCc] = useState(c.cc.join(', '))
  const [sujet, setSujet] = useState(c.sujet)
  const [corps, setCorps] = useState(c.corps)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const type = TYPES_COURRIEL.find((t) => t.genre === c.genre)
  const change = a !== c.a.join(', ') || cc !== c.cc.join(', ') || sujet !== c.sujet || corps !== c.corps

  const enregistrer = () =>
    modifier.mutateAsync({ id: c.id, champs: { a: listeCourriels(a), cc: listeCourriels(cc), sujet: sujet.trim(), corps: corps.trim() } })

  const envoyerCourriel = async () => {
    setErreur(null)
    if (!listeCourriels(a).length) return setErreur('Ajoutez au moins un destinataire.')
    setOccupe(true)
    try {
      if (change) await enregistrer()
      // La pré-arrivée se produit ici, au moment de l'envoi (PDF du navigateur), puis le Worker la joint.
      if (c.genre === 'pre_arrivee') {
        const r = parId.get(c.reservation_id)
        const modele = r && modeles.find((m) => m.genre === 'pre_arrivee' && m.forfait === r.forfait)
        if (!r || !modele) throw new Error('Pas de modèle de pré-arrivée pour ce forfait (Modèles et compagnies).')
        const estime = await estimeCourant(r.id)
        await garderDocument({ r, genre: 'pre_arrivee', titre: `Pré-arrivée ${r.numero}`, octets: await pdfDeLaPreArrivee(sources(r), estime, modele) })
      }
      await envoyer.mutateAsync(c.id)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setOccupe(false)
    }
  }

  const annuler = async () => {
    const ok = await confirmer({ titre: 'Annuler ce courriel ?', message: 'Il ne sera pas envoyé et ne sera plus préparé pour cet événement.', libelleOk: 'Annuler le courriel' })
    if (ok) modifier.mutate({ id: c.id, champs: { statut: 'annule', raison: 'Annulé à la main' } })
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOuvert(!ouvert)}>
        <span className="font-medium">
          {NOMS_COURRIEL[c.genre]} · <span className="font-normal">{c.sujet}</span>
          {avecReservation && c.reservation && (
            <Link to={`/reservations/r/${c.reservation_id}`} className="ml-2 text-xs font-normal text-foret-700 underline" onClick={(e) => e.stopPropagation()}>
              {c.reservation.numero} {c.reservation.nom}
            </Link>
          )}
        </span>
        <span className="text-xs text-amber-800">à approuver · préparé {quand(c.prepare_le)}</span>
      </button>
      {(c.erreur || erreur) && <p className={`${ui.erreur} mt-2`}>{erreur ?? c.erreur}</p>}
      {ouvert && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className={ui.etiquette}>À</span>
            <input className={ui.champ} value={a} disabled={!ecriture} onChange={(e) => setA(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Cc</span>
            <input className={ui.champ} value={cc} disabled={!ecriture} onChange={(e) => setCc(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Sujet</span>
            <input className={ui.champ} value={sujet} disabled={!ecriture} onChange={(e) => setSujet(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Texte {c.langue === 'en' && '(anglais)'}</span>
            <textarea className={`${ui.champ} min-h-48 font-sans`} value={corps} disabled={!ecriture} onChange={(e) => setCorps(e.target.value)} />
          </label>
          {type?.piece && <p className="text-xs text-pierre-600">📎 {type.piece}</p>}
          {ecriture && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="text-sm text-red-700 underline" onClick={annuler}>
                Annuler le courriel
              </button>
              <span className="flex gap-2">
                {change && (
                  <button className={ui.boutonSecondaire} disabled={occupe || modifier.isPending} onClick={() => enregistrer().catch((e: Error) => setErreur(e.message))}>
                    Enregistrer
                  </button>
                )}
                <button className={ui.bouton} disabled={occupe} onClick={envoyerCourriel}>
                  {occupe ? 'Envoi…' : 'Envoyer'}
                </button>
              </span>
            </div>
          )}
        </div>
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
                  {mode && <span className={`block text-xs ${mode === 'desactive' ? 'text-pierre-400' : mode === 'automatique' ? 'text-foret-700' : 'text-amber-700'}`}>{MODES[mode]}</span>}
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
        <label className="flex items-center gap-2">
          <span className="text-pierre-600">Mode</span>
          <select className={`${ui.champ} w-auto`} value={m.mode} disabled={!ecriture} onChange={(e) => changer({ mode: e.target.value as ModeCourriel })}>
            {(Object.keys(MODES) as ModeCourriel[]).map((k) => (
              <option key={k} value={k} disabled={k === 'automatique' && !type.automatique}>
                {MODES[k]}
                {k === 'automatique' && !type.automatique ? ' (pas encore : PDF produit dans le navigateur)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
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

