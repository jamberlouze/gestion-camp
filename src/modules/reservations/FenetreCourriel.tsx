// Fenêtre d'envoi d'un courriel au client (réunion du 2026-10-21 : une
// touche personnelle dans chaque courriel). Le courriel du modèle arrive
// déjà rempli (À, Cc, Sujet, Texte), tout se modifie, la pièce jointe est
// montrée ; « Envoyer » le fait partir d'inscriptions@ par le Worker
// (Mailpit en DEV). Sert à l'estimé et au contrat (fiche), et aux
// courriels de la file « À approuver ».

import { useEffect, useState, type ReactNode } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { adresseInvalide, listeAdresses } from './courriels'
import type { ModeEnvoi } from './donnees'

export interface ValeursCourriel {
  a: string
  cc: string
  sujet: string
  corps: string
}

/** Ce que la fenêtre montre au départ. */
export interface DepartCourriel {
  a: string[]
  cc: string[]
  sujet: string
  corps: string
  langue: 'fr' | 'en'
  /** Fil de la réservation : le sujet ne change plus (Gmail l'exige). */
  fil: { sujet: string } | null
  envoi?: ModeEnvoi | null
  /** Rien ne peut partir (Gmail pas configuré…) : la raison. */
  refus?: string | null
}

export interface PieceAffichee {
  nom: string
  taille?: number
  /** Ouvre la pièce dans un onglet (PDF produit ici). */
  ouvrir?: () => void
  /** Pièce produite au moment de l'envoi (facture QBO, pré-arrivée). */
  note?: string
}

const taille = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`)

export function FenetreCourriel({
  titre,
  charger,
  piece = null,
  avant,
  envoyer,
  enregistrer,
  fermer,
  libelleEnvoyer = 'Envoyer',
}: {
  titre: string
  /** Le courriel de départ (modèle rendu par le Worker, ou courriel préparé). */
  charger: () => Promise<DepartCourriel>
  piece?: PieceAffichee | null
  /** Ce qui arrive à l'envoi (ex. « l'estimé devient envoyé »). */
  avant?: ReactNode
  envoyer: (v: ValeursCourriel) => Promise<unknown>
  /** File « À approuver » : garder les corrections sans envoyer. */
  enregistrer?: (v: ValeursCourriel) => Promise<unknown>
  fermer: () => void
  libelleEnvoyer?: string
}) {
  const [depart, setDepart] = useState<DepartCourriel | null>(null)
  const [v, setV] = useState<ValeursCourriel>({ a: '', cc: '', sujet: '', corps: '' })
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<'envoi' | 'enregistrement' | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    let fini = false
    charger()
      .then((d) => {
        if (fini) return
        setDepart(d)
        setV({ a: d.a.join(', '), cc: d.cc.join(', '), sujet: d.fil?.sujet ?? d.sujet, corps: d.corps })
      })
      .catch((e) => !fini && setErreur(messageErreur(e)))
    return () => {
      fini = true
    }
    // Chargé une fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const champ = (cle: keyof ValeursCourriel) => (e: { target: { value: string } }) => {
    setEnregistre(false)
    setV({ ...v, [cle]: e.target.value })
  }

  const verifier = () => {
    const invalide = adresseInvalide(`${v.a} ${v.cc}`)
    if (invalide) return `Adresse invalide : ${invalide}`
    if (!listeAdresses(v.a).length) return 'Ajoutez au moins un destinataire.'
    if (!v.sujet.trim()) return 'Le sujet est vide.'
    if (!v.corps.trim()) return 'Le texte du courriel est vide.'
    return null
  }

  const agir = async (genre: 'envoi' | 'enregistrement') => {
    setErreur(null)
    const probleme = verifier()
    if (probleme) return setErreur(probleme)
    setOccupe(genre)
    try {
      if (genre === 'envoi') {
        await envoyer(v)
        fermer()
      } else {
        await enregistrer?.(v)
        setEnregistre(true)
      }
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  const refus = depart?.refus ?? null
  return (
    <Dialogue titre={titre} fermer={() => occupe === null && fermer()} large>
      {!depart && !erreur && <p className="text-sm text-pierre-500">Préparation du courriel…</p>}
      {!depart && erreur && (
        <div className="space-y-3">
          <p className={ui.erreur}>{erreur}</p>
          <div className="flex justify-end">
            <button className={ui.boutonSecondaire} onClick={fermer}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {depart && (
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            void agir('envoi')
          }}
        >
          {depart.envoi === 'mailpit' && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">DEV : le courriel part dans Mailpit (http://localhost:54324), jamais chez un client.</p>
          )}
          {refus && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{refus}</p>}
          <p className="text-xs text-pierre-500">De : inscriptions@camptremblant.com</p>
          <label className="block">
            <span className={ui.etiquette}>À</span>
            <input className={`${ui.champ} text-base sm:text-sm`} value={v.a} onChange={champ('a')} autoComplete="off" />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Cc</span>
            <input className={`${ui.champ} text-base sm:text-sm`} value={v.cc} onChange={champ('cc')} autoComplete="off" placeholder="Aucun" />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Sujet</span>
            <input
              className={`${ui.champ} text-base sm:text-sm ${depart.fil ? 'bg-pierre-100 text-pierre-600' : ''}`}
              value={v.sujet}
              onChange={champ('sujet')}
              disabled={!!depart.fil}
            />
            <span className="mt-1 block text-xs text-pierre-500">
              {depart.fil
                ? 'Même fil que les courriels précédents : le sujet ne change plus (Gmail garde le fil avec le même sujet).'
                : 'Premier courriel de la réservation : ce sujet restera celui du fil (tous les courriels suivants le gardent).'}
            </span>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Texte {depart.langue === 'en' && '(anglais)'}</span>
            <textarea className={`${ui.champ} min-h-64 font-sans text-base sm:text-sm`} value={v.corps} onChange={champ('corps')} />
          </label>
          {piece && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={ui.etiquette}>Pièce jointe</span>
              {piece.ouvrir ? (
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-pierre-300 bg-pierre-50 px-2.5 py-1 hover:bg-pierre-100" onClick={piece.ouvrir}>
                  📎 {piece.nom}
                  {piece.taille ? <span className="text-xs text-pierre-500">({taille(piece.taille)})</span> : null}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-pierre-200 bg-pierre-50 px-2.5 py-1">📎 {piece.nom}</span>
              )}
              {piece.note && <span className="text-xs text-pierre-500">{piece.note}</span>}
            </div>
          )}
          {avant && <div className="text-xs text-pierre-600">{avant}</div>}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-pierre-200 bg-white px-5 py-3">
            {/* Toujours visible, même si le texte est long. */}
            {erreur && (
              <p className={`${ui.erreur} w-full`} role="alert">
                {erreur}
              </p>
            )}
            {enregistre && <span className="mr-auto text-xs text-foret-700">Enregistré ✓</span>}
            <button type="button" className={ui.boutonSecondaire} disabled={occupe !== null} onClick={fermer}>
              Annuler
            </button>
            {enregistrer && (
              <button type="button" className={ui.boutonSecondaire} disabled={occupe !== null} onClick={() => void agir('enregistrement')}>
                {occupe === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer sans envoyer'}
              </button>
            )}
            <button type="submit" className={ui.bouton} disabled={occupe !== null || !!refus} title={refus ?? undefined}>
              {occupe === 'envoi' ? 'Envoi…' : libelleEnvoyer}
            </button>
          </div>
        </form>
      )}
    </Dialogue>
  )
}
