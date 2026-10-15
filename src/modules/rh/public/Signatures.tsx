import { useState, type ReactNode } from 'react'
import { Choix, Question } from '@/lib/public/habillage'
import { PadSignature } from '@/lib/public/PadSignature'
import { ui } from '@/lib/ui'
import { COURRIEL_EMPLOIS } from '../candidature'
import { erreursConsentement, erreursSignature, LIENS_PARENT, type PageDossier } from '../dossierEmbauche'
import { envoyer } from './api'

// Contrat et consentement parental signés en ligne, dans la page du dossier
// d'embauche (plan-rh.md §6). Chaque signature part tout de suite au Worker
// (worker/rh/contrats.js), à part de l'envoi du dossier : le formulaire en
// cours n'est jamais perdu.

const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Montreal' }).format(new Date(iso))

const MESSAGES: Record<string, string> = {
  deja_signe: 'Ce contrat est déjà signé, ou a été remplacé : recharge la page.',
  ferme: `Ce dossier est fermé. Écris-nous à ${COURRIEL_EMPLOIS}.`,
  introuvable: 'Ce contrat n’est plus disponible : recharge la page.',
  majeur: 'Le consentement parental n’est demandé qu’à une personne qui aura moins de 18 ans au début de son embauche.',
  sans_modele: `Le formulaire de consentement n’est pas prêt. Écris-nous à ${COURRIEL_EMPLOIS}.`,
}
const messageDe = (statut: number, erreur?: string) =>
  (erreur && MESSAGES[erreur]) ?? (statut === 0 ? 'Pas de connexion : réessaie dans un instant.' : 'La signature n’a pas fonctionné. Réessaie dans quelques minutes.')

function Cadre({ titre, note, children }: { titre: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.carte} space-y-4 p-5`}>
      <div>
        <h2 className="text-base font-semibold text-pierre-900">{titre}</h2>
        {note && <p className="mt-0.5 text-xs text-pierre-500">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Accord({ coche, changer, erreur, children }: { coche: boolean; changer: (v: boolean) => void; erreur?: string; children: ReactNode }) {
  return (
    <div>
      <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${coche ? 'border-foret-600 bg-foret-50' : erreur ? 'border-red-400' : 'border-pierre-200 bg-white'}`}>
        <input type="checkbox" className="mt-0.5" checked={coche} onChange={(e) => changer(e.target.checked)} />
        <span>{children}</span>
      </label>
      {erreur && <p className="mt-1 text-sm text-red-700">{erreur}</p>}
    </div>
  )
}

/** Contrat de travail : le lire (PDF), puis le signer au doigt. */
export function SectionContrat({ jeton, page, rafraichir }: { jeton: string; page: PageDossier; rafraichir: () => void }) {
  const k = page.contrat
  const [nom, setNom] = useState(`${page.personne.prenom} ${page.personne.nom_famille}`.trim())
  const [image, setImage] = useState<string | null>(null)
  const [accepte, setAccepte] = useState(false)
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (page.genre !== 'emploi' || !k) return null
  const pdf = `/api/rh/contrat?jeton=${encodeURIComponent(jeton)}&id=${k.id}`

  if (k.statut === 'signe')
    return (
      <Cadre titre="Contrat de travail">
        <p className="rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-800">
          ✓ Signé le {k.signe_le ? dateLongue(k.signe_le) : ''} par {k.nom_signataire}.{' '}
          <a href={pdf} target="_blank" rel="noreferrer" className="font-medium underline">
            Voir mon contrat signé
          </a>
        </p>
      </Cadre>
    )

  const corps = { jeton, contrat: k.id, nom, image, accepte }
  const err = tente ? erreursSignature(corps) : {}
  const signer = async () => {
    setTente(true)
    setMessage(null)
    if (Object.keys(erreursSignature(corps)).length) return
    setEnvoi(true)
    const r = await envoyer('/api/rh/signer', corps)
    setEnvoi(false)
    if (r.statut === 200) return rafraichir()
    setMessage(r.statut === 422 && r.corps.champs ? Object.values(r.corps.champs)[0] : messageDe(r.statut, r.corps.erreur))
  }

  return (
    <Cadre titre="Contrat de travail" note="Lis ton contrat, puis signe-le ici. Tu recevras le contrat signé dans ce même lien.">
      <a href={pdf} target="_blank" rel="noreferrer" className={`${ui.boutonSecondaire} w-full sm:w-auto`}>
        📄 Lire mon contrat ({k.titre})
      </a>
      {!page.dossier_recu_le ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Envoie d’abord ton dossier ci-dessous : tes coordonnées seront inscrites au contrat. Tu pourras le signer tout de suite après.
        </p>
      ) : (
        <>
          <Question libelle="Ton nom complet" requis id="q-signature-nom" erreur={err.nom}>
            <input className={`${ui.champ} ${err.nom ? 'border-red-400' : ''}`} value={nom} autoComplete="name" onChange={(e) => setNom(e.target.value)} />
          </Question>
          <div>
            <PadSignature libelle="Ta signature" changer={setImage} />
            {err.image && <p className="mt-1 text-sm text-red-700">{err.image}</p>}
          </div>
          <Accord coche={accepte} changer={setAccepte} erreur={err.accepte}>
            J’ai lu mon contrat de travail et je l’accepte. Je comprends que cette signature électronique a la même valeur que ma signature à la main.{' '}
            <span className="text-red-600">*</span>
          </Accord>
          {message && <p className={ui.erreur}>{message}</p>}
          <button type="button" className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi} onClick={signer}>
            {envoi ? 'Signature…' : 'Signer mon contrat'}
          </button>
        </>
      )}
    </Cadre>
  )
}

/** Consentement parental d'une personne mineure : signé par un parent ou tuteur. */
export function SectionConsentement({ jeton, page, naissance, rafraichir }: { jeton: string; page: PageDossier; naissance: string; rafraichir: () => void }) {
  const [nom, setNom] = useState('')
  const [lien, setLien] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [accepte, setAccepte] = useState(false)
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const prenom = page.personne.prenom
  const c = page.consentement
  const formulaire = `/api/rh/consentement?jeton=${encodeURIComponent(jeton)}${naissance ? `&naissance=${naissance}` : ''}`

  if (c)
    return (
      <Cadre titre="Consentement parental">
        <p className="rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-800">
          ✓ Signé le {dateLongue(c.signe_le)} par {c.nom_signataire} ({c.lien_signataire.toLowerCase()}).{' '}
          <a href={`/api/rh/consentement?jeton=${encodeURIComponent(jeton)}&id=${c.id}`} target="_blank" rel="noreferrer" className="font-medium underline">
            Voir le consentement signé
          </a>
        </p>
      </Cadre>
    )

  const corps = { jeton, nom, lien, image, accepte, date_naissance: naissance }
  const err = tente ? erreursConsentement(corps) : {}
  const signer = async () => {
    setTente(true)
    setMessage(null)
    if (Object.keys(erreursConsentement(corps)).length) return
    setEnvoi(true)
    const r = await envoyer('/api/rh/consentement', corps)
    setEnvoi(false)
    if (r.statut === 200) return rafraichir()
    setMessage(r.statut === 422 && r.corps.champs ? Object.values(r.corps.champs)[0] : messageDe(r.statut, r.corps.erreur))
  }

  return (
    <Cadre
      titre="Consentement parental"
      note={`${prenom} aura moins de 18 ans au début de son embauche : un parent ou tuteur légal doit lire et signer ce consentement (ici, sur le même appareil, ou en joignant le formulaire signé plus bas).`}
    >
      <a href={formulaire} target="_blank" rel="noreferrer" className={`${ui.boutonSecondaire} w-full sm:w-auto`}>
        📄 Lire le formulaire de consentement
      </a>
      <div className="grid gap-5 sm:grid-cols-2">
        <Question libelle="Nom complet du parent ou tuteur" requis id="q-parent-nom" erreur={err.nom}>
          <input className={`${ui.champ} ${err.nom ? 'border-red-400' : ''}`} value={nom} onChange={(e) => setNom(e.target.value)} />
        </Question>
        <Question libelle="Lien avec la personne mineure" requis id="q-parent-lien" erreur={err.lien}>
          <Choix nom="lien-parent" valeur={lien} changer={setLien} options={LIENS_PARENT.map((x) => ({ valeur: x, libelle: x }))} />
        </Question>
      </div>
      <div>
        <PadSignature libelle="Signature du parent ou tuteur" changer={setImage} />
        {err.image && <p className="mt-1 text-sm text-red-700">{err.image}</p>}
      </div>
      <Accord coche={accepte} changer={setAccepte} erreur={err.accepte}>
        Je suis le parent ou le tuteur légal de {prenom}. J’ai lu le formulaire de consentement et je l’accepte ; cette signature électronique a la même valeur que ma signature à la
        main. <span className="text-red-600">*</span>
      </Accord>
      {message && <p className={ui.erreur}>{message}</p>}
      <button type="button" className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi} onClick={signer}>
        {envoi ? 'Signature…' : 'Signer le consentement'}
      </button>
    </Cadre>
  )
}
