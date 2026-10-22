import { useEffect, useRef, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Section, ZoneTexte } from './commun'
import { useDonnees } from './contexte'
import { garderDocument, garderEstime, lienSignature, ouvrirDocument, ouvrirPdf, pdfDeLaPreArrivee, pdfDeLEstime, preparerContrat, produireContratSigne } from './productionPdf'
import { cleFenetre, jourMontreal } from './courriels'
import { conflitsAirbnbDe } from './disponibilite'
import { brouillonCourriel, useCourriels, useDocuments, useEstimes, useExpedierCourriel, useModeEnvoi, useModifierReservation, useSignatures } from './donnees'
import { FenetreCourriel } from './FenetreCourriel'
import { dateCourte, dateLongue } from './format'
import type { Reservation } from './types'

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Délai avant que la fiche produise elle-même le contrat signé (le Worker le fait dès la signature). */
const DELAI_FILET = 60_000

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
  const courriels = useCourriels(r.id)
  const expedier = useExpedierCourriel()
  const modifier = useModifierReservation()
  const modeEnvoi = useModeEnvoi()
  const refusEnvoi = modeEnvoi.error ? messageErreur(modeEnvoi.error) : (modeEnvoi.data?.refus ?? null)
  // Fenêtre « Envoyer le contrat… » : la demande de signature visée.
  const [envoiContrat, setEnvoiContrat] = useState<string | null>(null)

  const liste = estimes.data ?? []
  const accepte = [...liste].reverse().find((e) => e.statut === 'accepte')
  const courant = liste.find((e) => e.statut === 'brouillon') ?? liste.at(-1)
  const modeleContrat = modeles.find((m) => m.genre === 'contrat' && m.forfait === r.forfait)
  const modelePre = modeles.find((m) => m.genre === 'pre_arrivee' && m.forfait === r.forfait)
  const sig = signatures.data?.find((s) => s.statut !== 'annule')
  // Courriel « Contrat à signer » de cette demande de signature, s'il est parti.
  const contratParti = sig ? courriels.data?.find((c) => c.cle === cleFenetre('contrat', sig.id) && c.statut === 'envoye') : undefined
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

  // Contrat signé par le client : le Worker produit sa copie signée dès la
  // signature. Filet de sûreté : si elle manque encore une minute après la
  // signature, la fiche la produit (une seule tentative ; le bouton reste si
  // elle échoue). Attendre évite la course avec le Worker (27-G-056 : deux
  // contrats signés) ; la base refuse de toute façon un deuxième contrat signé.
  const signeTente = useRef(false)
  const signeAProduire = ecriture && sig?.statut === 'signe' && !sig.document_signe_id && sig.document_id ? contratDe(sig.document_id) : undefined
  useEffect(() => {
    if (!signeAProduire || !sig || signeTente.current) return
    const attente = Math.max(0, DELAI_FILET - (Date.now() - Date.parse(sig.signe_le ?? '')))
    const minuterie = setTimeout(() => {
      signeTente.current = true
      void agir('signe', () => produireContratSigne(sources(r), sig, signeAProduire))
    }, Number.isNaN(attente) ? 0 : attente)
    return () => clearTimeout(minuterie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signeAProduire?.id])

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
      const nouvelle = await preparerContrat(sources(r), accepte, modeleContrat)
      // Le courriel « Contrat à signer » s'ouvre tout de suite (rien ne part sans « Envoyer »).
      if (!refusEnvoi) setEnvoiContrat(nouvelle.id)
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
          {sig?.statut === 'en_attente' && !contratParti && courriels.data && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-amber-900">
                Contrat préparé, <strong>pas encore envoyé au client</strong>. Vérifiez le calendrier, puis envoyez-le : la réservation passera « Contrat envoyé ».
                {refusEnvoi && <span className="block text-xs">Envoi impossible : {refusEnvoi}</span>}
              </span>
              {ecriture && (
                <button className={ui.bouton} disabled={!!refusEnvoi || occupe !== null} title={refusEnvoi ?? undefined} onClick={() => setEnvoiContrat(sig.id)}>
                  Envoyer le contrat…
                </button>
              )}
            </div>
          )}
          {sig?.statut === 'en_attente' && (
            <div className="mt-2 space-y-2">
              {contratParti && (
                <p className="text-pierre-600">
                  Envoyé au client le {dateLongue(jourMontreal(sig.envoye_le))}
                  {contratParti.envoye_par_nom && ` par ${contratParti.envoye_par_nom}`}, en attente de sa signature
                  {sig.echeance < auj ? (
                    <span className="text-red-700"> · délai de 7 jours dépassé ({dateCourte(sig.echeance, auj)})</span>
                  ) : (
                    <span> · à signer d'ici le {dateCourte(sig.echeance, auj)}</span>
                  )}
                </p>
              )}
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
                Le lien part dans le courriel « Contrat à signer » (« Envoyer le contrat… ») ; le rappel de signature, 5 jours après l'envoi, se prépare dans Courriels.
                Le client voit le contrat, coche « J'accepte », écrit son nom et signe.
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
          {/* Ce que le contrat imprime en plus, et le dépôt de sécurité qu'il prévoit. */}
          <div className="mt-3 grid gap-x-6 gap-y-3 border-t border-pierre-100 pt-3 lg:grid-cols-2">
            <ZoneTexte
              libelle="Notes au contrat"
              valeur={r.notes_contrat}
              aide="Imprimées sur le contrat : clause particulière, n° de bon de commande…"
              disabled={!ecriture}
              enregistrer={(v) => modifier.mutate({ id: r.id, champs: { notes_contrat: v } })}
            />
            {(r.forfait === 'accueil_groupe' || r.forfait === 'location_salle') && (
              <label className="block min-w-0">
                <span className={ui.etiquette}>Dépôt de sécurité ({r.forfait === 'accueil_groupe' ? '2 000' : '1 000'} $ par carte)</span>
                <select
                  className={ui.champ}
                  disabled={!ecriture}
                  value={r.depot_securite ?? ''}
                  onChange={(e) => modifier.mutate({ id: r.id, champs: { depot_securite: (e.target.value || null) as Reservation['depot_securite'] } })}
                >
                  <option value="">— Pas encore pris</option>
                  <option value="pris">Pris à l'arrivée</option>
                  <option value="relache">Relâché</option>
                  <option value="encaisse">Encaissé (dommages)</option>
                </select>
              </label>
            )}
          </div>
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

        {envoiContrat && (
          <FenetreCourriel
            titre="Envoyer le contrat à signer"
            charger={() => brouillonCourriel({ reservation: r.id, genre: 'contrat', ref: envoiContrat })}
            avant={
              <>
                À l'envoi, la réservation passe « Contrat envoyé » et le délai de signature de 7 jours commence.
              </>
            }
            envoyer={(v) => expedier.mutateAsync({ reservation: r.id, genre: 'contrat', ref: envoiContrat, ...v })}
            fermer={() => setEnvoiContrat(null)}
          />
        )}

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
