import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { garderDocument, garderEstime, lienSignature, ouvrirDocument, ouvrirPdf, pdfDeLaPreArrivee, pdfDeLEstime, preparerContrat, produireContratSigne } from './productionPdf'
import { conflitsAirbnbDe } from './disponibilite'
import { preparerCourriels, useDocuments, useEstimes, useSignatures } from './donnees'
import { dateCourte, dateLongue } from './format'
import type { Reservation } from './types'

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Documents de la réservation : estimé, contrat et sa signature, pré-arrivée. */
export function Documents({ r }: { r: Reservation }) {
  const { sources, modeles, ecriture, auj, reservations } = useDonnees()
  // Pas de contrat sur une réservation Airbnb de la VF : il confirmerait par-dessus (§10).
  const conflitAirbnb = conflitsAirbnbDe(r, reservations).length > 0
  const estimes = useEstimes(r.id)
  const documents = useDocuments(r.id)
  const signatures = useSignatures(r.id)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)

  const liste = estimes.data ?? []
  const accepte = [...liste].reverse().find((e) => e.statut === 'accepte')
  const courant = liste.find((e) => e.statut === 'brouillon') ?? liste.at(-1)
  const modeleContrat = modeles.find((m) => m.genre === 'contrat' && m.forfait === r.forfait)
  const modelePre = modeles.find((m) => m.genre === 'pre_arrivee' && m.forfait === r.forfait)
  const sig = signatures.data?.find((s) => s.statut !== 'annule')
  const docs = documents.data ?? []
  const contratDe = (id: string) => docs.find((d) => d.id === id)
  // Estimé envoyé dont le PDF n'a pas été gardé (ex. coupure pendant l'envoi) :
  // le client ne pourrait pas le télécharger. Pas pour les estimés importés.
  const envoye = [...liste].reverse().find((e) => (e.statut === 'envoye' || e.statut === 'accepte') && !e.importe)
  const pdfManquant = !!envoye && !!documents.data && !docs.some((d) => d.genre === 'estime' && d.estime_id === envoye.id)

  const agir = async (nom: string, f: () => Promise<unknown>) => {
    setOccupe(nom)
    setErreur(null)
    try {
      await f()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  const preparer = async () => {
    if (!accepte || !modeleContrat) return
    if (sig?.statut === 'en_attente') {
      const ok = await confirmer({
        titre: 'Refaire le contrat ?',
        message: "L'ancien lien de signature ne fonctionnera plus. Le nouveau contrat reprend l'estimé accepté et le modèle actuel.",
        libelleOk: 'Refaire',
        danger: false,
      })
      if (!ok) return
    }
    await agir('contrat', async () => {
      await preparerContrat(sources(r), accepte, modeleContrat)
      // Le courriel « contrat à signer », tout de suite.
      await preparerCourriels(r.id).catch(() => {})
    })
  }

  return (
    <Section titre="Documents">
      <div className="space-y-3 text-sm">
        {/* Estimé */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">Estimé</span>
          <div className="flex flex-wrap gap-2">
            {ecriture && pdfManquant && envoye && (
              <button className={ui.bouton} disabled={occupe !== null} onClick={() => agir('garder-estime', () => garderEstime(sources(r), envoye))}>
                {occupe === 'garder-estime' ? 'Préparation…' : `Garder le PDF (v${envoye.version})`}
              </button>
            )}
            <button
              className={ui.boutonSecondaire}
              disabled={!courant || occupe !== null}
              onClick={() => courant && agir('estime', async () => ouvrirPdf(await pdfDeLEstime(sources(r), courant)))}
            >
              {occupe === 'estime' ? 'Préparation…' : `Aperçu PDF${courant ? ` (v${courant.version})` : ''}`}
            </button>
          </div>
        </div>
        {pdfManquant && envoye && (
          <p className="-mt-1 text-xs text-amber-700">
            Le PDF de l'estimé envoyé (v{envoye.version}) n'a pas été gardé : le client ne peut pas le télécharger de sa page.
          </p>
        )}

        {/* Contrat */}
        <div className="rounded-lg border border-pierre-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Contrat</span>
            {ecriture && sig?.statut !== 'signe' && (
              <button
                className={ui.bouton}
                disabled={!accepte || !modeleContrat || occupe !== null || conflitAirbnb}
                title={conflitAirbnb ? 'Conflit avec une réservation Airbnb (voir en haut de la fiche)' : undefined}
                onClick={preparer}
              >
                {occupe === 'contrat' ? 'Préparation…' : sig ? 'Refaire le contrat' : 'Préparer le contrat à signer'}
              </button>
            )}
          </div>
          {!accepte && !sig && <p className="mt-1 text-pierre-500">Il faut d'abord un estimé accepté par le client.</p>}
          {sig?.statut === 'en_attente' && (
            <div className="mt-2 space-y-2">
              <p className="text-pierre-600">
                En attente de la signature du client depuis le {dateLongue(sig.envoye_le.slice(0, 10))}
                {sig.echeance < auj ? (
                  <span className="text-red-700"> · délai de 7 jours dépassé ({dateCourte(sig.echeance, auj)})</span>
                ) : (
                  <span> · à signer d'ici le {dateCourte(sig.echeance, auj)}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <input readOnly className={`${ui.champ} min-w-0 flex-1 text-xs`} value={lienSignature(sig)} onFocus={(e) => e.currentTarget.select()} />
                <button
                  className={ui.boutonSecondaire}
                  onClick={async () => {
                    await navigator.clipboard.writeText(lienSignature(sig))
                    setCopie(true)
                    setTimeout(() => setCopie(false), 2000)
                  }}
                >
                  {copie ? 'Copié ✓' : 'Copier le lien'}
                </button>
                <a className={ui.boutonSecondaire} href={lienSignature(sig)} target="_blank" rel="noreferrer">
                  Ouvrir la page du client
                </a>
              </div>
              <p className="text-xs text-pierre-500">
                Lien envoyé au client par le courriel « Contrat à signer » (Courriels, plus bas). Il voit le contrat, coche « J'accepte », écrit son nom et signe.
              </p>
            </div>
          )}
          {sig?.statut === 'signe' && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-foret-800">
                ✓ Signé par {sig.nom_signataire}
                {sig.fonction_signataire && ` (${sig.fonction_signataire})`} le {sig.signe_le && quand(sig.signe_le)}
              </p>
              {sig.document_signe_id && contratDe(sig.document_signe_id) ? (
                <button className={ui.boutonSecondaire} onClick={() => agir('ouvrir', () => ouvrirDocument(contratDe(sig.document_signe_id!)!))}>
                  Contrat signé (PDF)
                </button>
              ) : (
                ecriture && (
                  <button
                    className={ui.bouton}
                    disabled={occupe !== null || !contratDe(sig.document_id)}
                    onClick={() => agir('signe', () => produireContratSigne(sources(r), sig, contratDe(sig.document_id)!))}
                  >
                    {occupe === 'signe' ? 'Production…' : 'Produire le contrat signé'}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Pré-arrivée */}
        {modelePre && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Pré-arrivée</span>
            <div className="flex gap-2">
              <button
                className={ui.boutonSecondaire}
                disabled={occupe !== null}
                onClick={() => agir('pre', async () => ouvrirPdf(await pdfDeLaPreArrivee(sources(r), accepte ?? null, modelePre)))}
              >
                {occupe === 'pre' ? 'Préparation…' : 'Aperçu PDF'}
              </button>
              {ecriture && (
                <button
                  className={ui.boutonSecondaire}
                  disabled={occupe !== null}
                  onClick={() =>
                    agir('pre-garder', async () =>
                      garderDocument({ r, genre: 'pre_arrivee', titre: `Pré-arrivée ${r.numero}`, octets: await pdfDeLaPreArrivee(sources(r), accepte ?? null, modelePre) }),
                    )
                  }
                >
                  Garder
                </button>
              )}
            </div>
          </div>
        )}

        {erreur && <p className={ui.erreur}>{erreur}</p>}

        {/* Documents gardés */}
        {docs.length > 0 && (
          <div>
            <p className={`${ui.etiquette} mt-2`}>Documents gardés</p>
            <ul className="divide-y divide-pierre-100">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {d.titre}
                    <span className="ml-2 text-xs text-pierre-400">
                      {quand(d.cree_le)}
                      {d.cree_par_nom && ` · ${d.cree_par_nom}`}
                    </span>
                  </span>
                  <button className="text-sm text-foret-700 underline" onClick={() => agir('ouvrir', () => ouvrirDocument(d))}>
                    Ouvrir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}
