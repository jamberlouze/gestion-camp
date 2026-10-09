import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ui } from '@/lib/ui'
import { db, messageDe } from './client'

// Page publique de signature du contrat (adresse /signer/<jeton>), ouverte
// par le client sans compte. Elle ne lit que ce que renvoie
// reservations.signature_publique et n'écrit que par reservations.signer_contrat.

interface Infos {
  numero: string
  groupe: string
  compagnie: string | null
  logo: string | null
  courriel: string | null
  telephone: string | null
  statut: 'en_attente' | 'signe' | 'annule'
  echeance: string
  adresse_pdf: string
  signe_le: string | null
  nom_signataire: string | null
}

const quand = (iso: string) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

export default function SignaturePublique() {
  const jeton = window.location.pathname.split('/')[2] ?? ''
  const [infos, setInfos] = useState<Infos | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    db()
      .rpc('signature_publique', { p_jeton: jeton })
      .then(({ data, error }) => {
        if (error) setErreur(messageDe(error, 'Erreur'))
        setInfos((data as Infos | null) ?? null)
      })
  }, [jeton])

  useEffect(() => {
    document.title = infos ? `Contrat ${infos.numero} — signature` : 'Signature du contrat'
  }, [infos])

  return (
    <div className="min-h-dvh bg-pierre-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        {infos === undefined && !erreur && <p className="text-center text-sm text-pierre-500">Chargement…</p>}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        {infos === null && !erreur && (
          <div className={`${ui.carte} p-6 text-center`}>
            <p className="font-medium">Ce lien de signature n'est pas valide.</p>
            <p className="mt-1 text-sm text-pierre-500">Vérifiez l'adresse reçue par courriel, ou communiquez avec nous.</p>
          </div>
        )}
        {infos && <Contenu infos={infos} jeton={jeton} relire={(i) => setInfos(i)} />}
      </div>
    </div>
  )
}

function Contenu({ infos, jeton, relire }: { infos: Infos; jeton: string; relire: (i: Infos) => void }) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-pierre-500">Contrat de service {infos.numero}</p>
          <h1 className="text-2xl font-semibold text-pierre-900">{infos.groupe}</h1>
        </div>
        {infos.logo && <img src={infos.logo} alt={infos.compagnie ?? ''} className="h-10 w-auto" />}
      </header>

      {infos.statut === 'signe' && (
        <div className={`${ui.carte} p-6 text-center`}>
          <p className="text-lg font-medium text-foret-800">✓ Contrat signé</p>
          <p className="mt-1 text-sm text-pierre-600">
            Signé par {infos.nom_signataire} le {infos.signe_le && quand(infos.signe_le)}. Merci ! Une copie signée vous sera transmise.
          </p>
        </div>
      )}
      {infos.statut === 'annule' && (
        <div className={`${ui.carte} p-6 text-center`}>
          <p className="font-medium">Ce contrat a été remplacé.</p>
          <p className="mt-1 text-sm text-pierre-500">Utilisez le lien du contrat le plus récent, ou communiquez avec nous.</p>
        </div>
      )}

      <section className={`${ui.carte} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pierre-200 px-4 py-2">
          <span className="text-sm font-medium">Le contrat</span>
          <a href={infos.adresse_pdf} target="_blank" rel="noreferrer" className="text-sm text-foret-700 underline">
            Ouvrir le PDF dans un nouvel onglet
          </a>
        </div>
        <iframe title="Contrat" src={infos.adresse_pdf} className="h-[70dvh] w-full bg-white" />
      </section>

      {infos.statut === 'en_attente' && <Formulaire infos={infos} jeton={jeton} relire={relire} />}

      <footer className="text-center text-xs text-pierre-500">
        {infos.compagnie}
        {infos.courriel && ` · ${infos.courriel}`}
        {infos.telephone && ` · ${infos.telephone}`}
      </footer>
    </>
  )
}

function Formulaire({ infos, jeton, relire }: { infos: Infos; jeton: string; relire: (i: Infos) => void }) {
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [accepte, setAccepte] = useState(false)
  const [trace, setTrace] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const canevas = useRef<HTMLCanvasElement>(null)
  const dessine = useRef(false)

  // Canevas net sur écran haute densité.
  useEffect(() => {
    const c = canevas.current
    if (!c) return
    const r = window.devicePixelRatio || 1
    c.width = c.clientWidth * r
    c.height = c.clientHeight * r
    const ctx = c.getContext('2d')!
    ctx.scale(r, r)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2937'
  }, [])

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    return [e.clientX - b.left, e.clientY - b.top] as const
  }
  const debut = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dessine.current = true
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }
  const bouger = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setTrace(true)
  }
  const fin = () => {
    dessine.current = false
  }
  const effacer = () => {
    const c = canevas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setTrace(false)
  }

  const signer = async () => {
    setEnvoi(true)
    setErreur(null)
    const image = canevas.current!.toDataURL('image/png')
    const { error } = await db().rpc('signer_contrat', { p_jeton: jeton, p_nom: nom, p_fonction: fonction, p_image: image, p_accepte: accepte })
    if (error) {
      setErreur(messageDe(error, 'Erreur'))
      setEnvoi(false)
      return
    }
    const { data } = await db().rpc('signature_publique', { p_jeton: jeton })
    if (data) relire(data as Infos)
  }

  const pret = accepte && nom.trim() && trace && !envoi

  return (
    <section className={`${ui.carte} space-y-4 p-5`}>
      <h2 className="text-lg font-semibold">Signer le contrat</h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
        <span>J’ai lu le contrat et je l’accepte au nom du Groupe. Je suis autorisé·e à le signer.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ui.etiquette}>Nom (en lettres moulées)</span>
          <input className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Fonction (facultatif)</span>
          <input className={ui.champ} value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Enseignante, direction…" />
        </label>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={ui.etiquette}>Signature</span>
          <button type="button" className="text-xs text-pierre-500 underline" onClick={effacer}>
            Effacer
          </button>
        </div>
        <canvas
          ref={canevas}
          className="h-40 w-full touch-none rounded-lg border border-pierre-300 bg-white"
          onPointerDown={debut}
          onPointerMove={bouger}
          onPointerUp={fin}
          onPointerLeave={fin}
        />
        <p className="mt-1 text-xs text-pierre-500">Signez avec le doigt ou la souris.</p>
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-pierre-500">
          La date, l’heure et l’adresse IP de la signature sont conservées avec le contrat.
          {infos.echeance && ` À signer d’ici le ${new Date(`${infos.echeance}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
        </p>
        <button className={ui.bouton} disabled={!pret} onClick={signer}>
          {envoi ? 'Signature…' : 'Signer le contrat'}
        </button>
      </div>
    </section>
  )
}
