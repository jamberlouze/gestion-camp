import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { appelerQbo, useActionQbo, useEstimes, useFactures, useModifierReservation, useQboConfiguration, useQboConnexions, useQboDevis } from './donnees'
import { annulation, bilanFactures, ecart, ecartReel, echeancier, partsAcomptes, pourcent } from './facturation'
import { argent, dateCourte, dateLongue } from './format'
import { GENRES_FACTURE, type Estime, type Facture, type QboDevis, type Reservation } from './types'

const adresseQbo = (environnement: string, entite: 'estimate' | 'invoice' | 'creditmemo', id: string) =>
  `https://app.${environnement === 'sandbox' ? 'sandbox.' : ''}qbo.intuit.com/app/${entite}?txnId=${id}`

/**
 * Facturation dans QuickBooks Online (plan §6, façon A) : devis tiré de
 * l'estimé accepté, échéancier des acomptes, factures et soldes relus de
 * QBO, factures séparées et notes de crédit. Sans QBO, l'échéancier donne
 * les montants à facturer à la main.
 */
export function Facturation({ r }: { r: Reservation }) {
  const { ecriture, compagniesFacture, auj } = useDonnees()
  const configuration = useQboConfiguration()
  const connexions = useQboConnexions()
  const devis = useQboDevis(r.id)
  const factures = useFactures(r.id)
  const estimes = useEstimes(r.id)
  const synchro = useActionQbo<{ compagnie: string }>('synchro')
  const [dialogue, setDialogue] = useState<null | 'devis' | 'separee' | 'note_credit' | 'echeancier'>(null)
  const [message, setMessage] = useState<{ genre: 'ok' | 'avert' | 'erreur'; texte: string } | null>(null)

  const configure = configuration.data?.configure ?? false
  const connexion = connexions.data?.find((c) => c.compagnie_id === r.compagnie_id)
  const compagnie = compagniesFacture.find((c) => c.entreprise_id === r.compagnie_id)
  const accepte = [...(estimes.data ?? [])].reverse().find((e) => e.statut === 'accepte')
  const d = devis.data
  const total = d?.total ?? (accepte ? Number(accepte.total) : null)
  const annulee = r.fermeture === 'annulee'
  const etapes = !annulee && r.signe_le && total ? echeancier({ ...r, total, signe_le: r.signe_le }) : null
  const parts = partsAcomptes(r)
  const liste = (factures.data ?? []).filter((f) => !f.supprimee)
  const factureProgressif = liste.filter((f) => f.genre === 'progressive').reduce((t, f) => t + Number(f.total), 0)
  const { facture, paye, credits, solde } = bilanFactures(liste)
  const ecartDevis = d ? ecart(d.total, d.total_app) : 0
  const devisEnRetard = d && accepte && !d.annulation && d.estime_version !== null && accepte.version > d.estime_version

  const pret = configure && !!connexion
  const raisonDevis = !accepte
    ? "Il faut d'abord un estimé accepté par le client."
    : !r.organisation_id
      ? "Reliez d'abord la réservation à une organisation du CRM."
      : !compagnie?.qbo?.article || !compagnie.qbo.taxes
        ? `Choisissez l'article et le code de taxes QBO de ${compagnie?.nom_court ?? 'la compagnie'} (Modèles et compagnies).`
        : null

  return (
    <Section
      titre="Facturation"
      action={
        pret && (
          <button
            className="text-xs text-foret-700 underline disabled:opacity-50"
            disabled={synchro.isPending}
            onClick={() =>
              synchro.mutate(
                { compagnie: r.compagnie_id },
                { onError: (e) => setMessage({ genre: 'erreur', texte: e.message }), onSuccess: () => setMessage(null) },
              )
            }
          >
            {synchro.isPending ? 'Mise à jour…' : 'Mettre à jour depuis QBO'}
          </button>
        )
      }
    >
      <div className="space-y-4 text-sm">
        {configuration.isSuccess && !configure && (
          <p className="rounded-lg border border-pierre-200 bg-pierre-50 px-3 py-2 text-pierre-600">
            QuickBooks n'est pas encore relié à l'app : l'échéancier ci-dessous donne les montants à facturer à la main dans QBO (SOP).
          </p>
        )}
        {configure && connexions.isSuccess && !connexion && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            {compagnie?.nom_court ?? 'Cette compagnie'} n'est pas reliée à son dossier QuickBooks :{' '}
            <Link to="/reservations/modeles" className="underline">
              Modèles et compagnies
            </Link>
            .
          </p>
        )}
        {connexion?.erreur && <p className={ui.erreur}>{connexion.erreur}</p>}
        {message && (
          <p className={message.genre === 'erreur' ? ui.erreur : message.genre === 'avert' ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900' : 'rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-foret-800'}>
            {message.texte}
          </p>
        )}

        {/* Devis QBO */}
        <div className="rounded-lg border border-pierre-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Devis QBO</span>
            {ecriture && pret && !d && !annulee && (
              <button className={ui.bouton} disabled={!!raisonDevis} title={raisonDevis ?? undefined} onClick={() => setDialogue('devis')}>
                Créer le devis QBO
              </button>
            )}
            {ecriture && pret && d && !annulee && (devisEnRetard || ecartReel(ecartDevis) || d.annulation) && (
              <button className={ui.boutonSecondaire} disabled={!!raisonDevis} onClick={() => setDialogue('devis')}>
                Mettre le devis à jour
              </button>
            )}
          </div>
          {!d ? (
            <p className="mt-1 text-pierre-500">
              {!pret
                ? 'Pas encore de devis.'
                : annulee
                  ? "Réservation annulée : voir les frais d'annulation ci-dessous."
                  : (raisonDevis ?? 'Créé à partir de l’estimé accepté, avec le contrat signé et le spécimen de chèque joints.')}
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              <p className="text-pierre-700">
                N° {d.numero} · {argent(d.total)} taxes comprises · {d.annulation ? "frais d'annulation" : `estimé v${d.estime_version}`}
                {d.statut === 'Closed' && ' · fermé'}
                <span className="text-pierre-400">
                  {' '}
                  · créé le {dateLongue(d.cree_le.slice(0, 10))}
                  {d.cree_par_nom && ` par ${d.cree_par_nom}`}
                </span>
                {connexion && (
                  <>
                    {' · '}
                    <a className="text-foret-700 underline" href={adresseQbo(connexion.environnement, 'estimate', d.qbo_id)} target="_blank" rel="noreferrer">
                      Ouvrir dans QBO
                    </a>
                  </>
                )}
              </p>
              {ecartDevis !== 0 && !ecartReel(ecartDevis) && (
                <p className="text-pierre-500">
                  Écart d'arrondi de {argent(ecartDevis)} avec l'estimé ({argent(d.total_app)}) : estimé figé avant l'arrondi des taxes ligne par ligne. Sans conséquence.
                </p>
              )}
              {ecartReel(ecartDevis) && (
                <p className="text-red-700">
                  Écart de {argent(ecartDevis)} entre le devis QBO et l'estimé accepté ({argent(d.total_app)}) : ne facturez pas avant de corriger (code de taxes,
                  lignes modifiées dans QBO).
                </p>
              )}
              {devisEnRetard && <p className="text-amber-700">L'estimé accepté v{accepte!.version} est plus récent que le devis (v{d.estime_version}) : mettez le devis à jour.</p>}
            </div>
          )}
        </div>

        {/* Échéancier des acomptes */}
        {etapes && (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={ui.etiquette}>
                Échéancier {d ? '(devis QBO)' : '(estimé accepté)'}
                {parts.convenues && <span className="ml-1 normal-case text-amber-700">· convenu avec le groupe</span>}
              </p>
              {ecriture && (
                <button className="text-xs text-foret-700 underline" onClick={() => setDialogue('echeancier')}>
                  Modifier l'échéancier
                </button>
              )}
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-pierre-100">
                {etapes.map((e) => {
                  const fait = e.cle === 'finale' ? d && factureProgressif >= d.total - 0.01 && auj > r.date_depart : total && factureProgressif >= e.cumul * total - 1
                  return (
                    <tr key={e.cle} className="align-top">
                      <td className="py-1.5 pr-2">
                        {e.libelle}
                        {e.note && <div className="text-xs text-pierre-500">{e.note}</div>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{e.montant !== null ? argent(e.montant) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-pierre-600">
                        {fait ? (
                          <span className="text-foret-700">✓ Facturé</span>
                        ) : (
                          <span className={e.facturer_le <= auj ? 'font-medium text-amber-700' : ''}>
                            À facturer {e.facturer_le <= auj ? 'maintenant' : `le ${dateCourte(e.facturer_le, auj)}`}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-2 text-right text-pierre-500">{e.echeance ? `dû le ${dateCourte(e.echeance, auj)}` : 'sur réception'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {annulee && (
          <BlocAnnulation
            r={r}
            accepte={accepte ?? null}
            d={d ?? null}
            factures={liste}
            pret={pret}
            ecriture={ecriture}
            ouvrirDevis={() => setDialogue('devis')}
            resultat={(texte, genre) => setMessage({ genre, texte })}
          />
        )}

        {/* Factures de QBO */}
        {liste.length > 0 && (
          <div>
            <p className={ui.etiquette}>Factures (QuickBooks)</p>
            <table className="w-full">
              <tbody className="divide-y divide-pierre-100">
                {liste.map((f) => (
                  <LigneFacture key={f.id} f={f} auj={auj} environnement={connexion?.environnement ?? null} />
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex flex-wrap gap-x-4 text-pierre-600">
              <span>Facturé : {argent(facture)}</span>
              <span>Payé : {argent(paye)}</span>
              {credits > 0 && <span>Crédits : {argent(credits)}</span>}
              {solde < 0 ? (
                <span className="font-medium text-amber-800">Crédit au client : {argent(-solde)}</span>
              ) : (
                <span className={solde > 0 ? 'font-medium text-pierre-900' : ''}>Solde dû : {argent(solde)}</span>
              )}
            </p>
          </div>
        )}

        {ecriture && pret && d && (
          <div className="flex flex-wrap gap-2 border-t border-pierre-100 pt-3">
            <button className={ui.boutonSecondaire} onClick={() => setDialogue('separee')}>
              Facture séparée…
            </button>
            <button className={ui.boutonSecondaire} onClick={() => setDialogue('note_credit')}>
              Note de crédit…
            </button>
          </div>
        )}
      </div>

      {dialogue === 'echeancier' && <DialogueEcheancier r={r} devis={!!d && !annulee} fermer={() => setDialogue(null)} />}
      {dialogue === 'devis' && (
        <DialogueDevis
          r={r}
          miseAJour={!!d}
          fermer={() => setDialogue(null)}
          resultat={(texte, genre) => {
            setMessage({ genre, texte })
            setDialogue(null)
          }}
        />
      )}
      {(dialogue === 'separee' || dialogue === 'note_credit') && (
        <DialogueDocument
          r={r}
          genre={dialogue}
          fermer={() => setDialogue(null)}
          fait={(texte) => {
            setMessage({ genre: 'ok', texte })
            setDialogue(null)
          }}
        />
      )}
    </Section>
  )
}

/** Échéancier convenu autrement avec le groupe (F2) : parts des acomptes 1 et 2. */
function DialogueEcheancier({ r, devis, fermer }: { r: Reservation; devis: boolean; fermer: () => void }) {
  const modifier = useModifierReservation()
  const parts = partsAcomptes(r)
  const scolaire = r.forfait === 'classe_nature' || r.forfait === 'journee_plein_air'
  const enPct = (x: number) => String(Math.round(x * 10_000) / 100)
  const [a1, setA1] = useState(enPct(parts.acompte1))
  const [a2, setA2] = useState(enPct(parts.acompte2))
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const p1 = Number(a1.replace(',', '.'))
  // AG et LS : pas de 3e versement au contrat, l'acompte 2 est le reste.
  const p2 = scolaire ? Number(a2.replace(',', '.')) : 100 - p1
  const valide = Number.isFinite(p1) && Number.isFinite(p2) && p1 >= 0 && p2 >= 0 && p1 + p2 <= 100

  const enregistrer = async (champs: Pick<Reservation, 'acompte1_part' | 'acompte2_part'>) => {
    setErreur(null)
    setEnvoi(true)
    try {
      await modifier.mutateAsync({ id: r.id, champs })
      // Relances et seuils refaits avec le devis QBO déjà créé.
      if (devis) await appelerQbo('echeancier', { reservation: r.id })
      fermer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue titre="Échéancier convenu avec le groupe" fermer={fermer}>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">
          Standard : {scolaire ? '25 / 50 / 25 (acompte 1, acompte 2, solde)' : '25 / 75'}. Une part à 0 = pas de cet acompte. Le contrat déjà signé n'est pas
          modifié ; un nouveau contrat reprend ces parts.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={ui.etiquette}>Acompte 1 (à la signature)</span>
            <span className="flex items-center gap-1">
              <input className={`${ui.champ} w-24 text-right`} inputMode="decimal" value={a1} onChange={(e) => setA1(e.target.value)} /> %
            </span>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Acompte 2 (21 jours avant)</span>
            <span className="flex items-center gap-1">
              <input
                className={`${ui.champ} w-24 text-right`}
                inputMode="decimal"
                value={scolaire ? a2 : String(Math.round(p2 * 100) / 100)}
                disabled={!scolaire}
                onChange={(e) => setA2(e.target.value)}
              />{' '}
              %
            </span>
          </label>
          {scolaire && <p className="pb-2 text-pierre-600">Solde à la facture finale : {valide ? `${Math.round((100 - p1 - p2) * 100) / 100} %` : '—'}</p>}
        </div>
        {!valide && <p className={ui.erreur}>Des parts de 0 à 100 %, pas plus de 100 % en tout.</p>}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <button className="text-sm text-foret-700 underline disabled:opacity-50" disabled={envoi || !parts.convenues} onClick={() => enregistrer({ acompte1_part: null, acompte2_part: null })}>
            Revenir au standard
          </button>
          <span className="flex gap-2">
            <button className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={!valide || envoi} onClick={() => enregistrer({ acompte1_part: Math.round(p1 * 100) / 10_000, acompte2_part: Math.round(p2 * 100) / 10_000 })}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </span>
        </div>
      </div>
    </Dialogue>
  )
}

/**
 * Annulation après signature (F16, F17 ; F18 retirée) : jour de l'avis,
 * palier, frais retenus, déjà facturé, puis le geste dans QBO (devis des
 * frais à facturer, ou note de crédit de l'excédent).
 */
function BlocAnnulation({
  r,
  accepte,
  d,
  factures,
  pret,
  ecriture,
  ouvrirDevis,
  resultat,
}: {
  r: Reservation
  accepte: Estime | null
  d: QboDevis | null
  factures: Facture[]
  pret: boolean
  ecriture: boolean
  ouvrirDevis: () => void
  resultat: (texte: string, genre: 'ok' | 'avert' | 'erreur') => void
}) {
  const modifier = useModifierReservation()
  const action = useActionQbo<{ reservation: string }, { message?: string; avertissements?: string[] }>('devis')
  if (!r.annule_le) return null
  if (!accepte) return <p className="text-pierre-600">Annulation : il faut l'estimé accepté (contrat) pour calculer les frais.</p>
  const a = annulation({ annule_le: r.annule_le, date_arrivee: r.date_arrivee, sous_total: Number(accepte.sous_total), factures })
  const ajuste = !!d?.annulation && Math.abs(Number(d.total_app) - a.retenu) < 0.01
  const ferme = d?.statut === 'Closed'

  const agir = async () => {
    if (a.ecart > 0) return ouvrirDevis()
    if (a.ecart < 0) {
      const ok = await confirmer({
        titre: `Créer une note de crédit de ${argent(-a.ecart)} dans QBO ?`,
        message: "Elle annule ce qui a été facturé au-delà des frais retenus ; le devis QBO est fermé. Une relance rappellera de l'appliquer (et de rembourser ce qui a été payé en trop).",
        libelleOk: 'Créer la note de crédit',
        danger: false,
      })
      if (!ok) return
    }
    action.mutate(
      { reservation: r.id },
      {
        onSuccess: (res) => resultat([res.message ?? 'Fait.', ...(res.avertissements ?? [])].join(' '), res.avertissements?.length ? 'avert' : 'ok'),
        onError: (e) => resultat(e.message, 'erreur'),
      },
    )
  }

  const libelleAction =
    a.ecart > 0 ? (d ? "Ajuster le devis QBO aux frais d'annulation" : "Créer le devis QBO des frais d'annulation") : a.ecart < 0 ? `Créer la note de crédit de ${argent(-a.ecart)}` : 'Fermer le devis QBO'
  const geste = pret && ecriture && (a.ecart > 0 ? !ajuste : a.ecart < 0 || (!!d && !ferme))

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Annulation (F16, F17)</span>
        <label className="flex items-center gap-2 whitespace-nowrap text-pierre-600">
          Avis reçu le
          <input
            type="date"
            className={`${ui.champ} w-auto py-1`}
            value={r.annule_le}
            disabled={!ecriture}
            onChange={(e) => e.target.value && modifier.mutate({ id: r.id, champs: { annule_le: e.target.value } })}
          />
        </label>
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-pierre-600">
          {a.jours} jours avant l'arrivée : on retient {pourcent(a.palier)} du total taxes comprises
        </dt>
        <dd />
        {a.acompte_paye === false && (
          <>
            <dt className="text-amber-800">Acompte jamais payé : annulation sans frais.</dt>
            <dd />
          </>
        )}
        {a.acompte_paye === null && (
          <>
            <dt className="text-pierre-500">Aucune facture d'acompte dans QBO : vérifiez que l'acompte a été payé (sinon, aucuns frais).</dt>
            <dd />
          </>
        )}
        <dt className="text-pierre-600">
          Frais retenus ({pourcent(a.part)} de {argent(Number(accepte.total))})
        </dt>
        <dd className="text-right">{argent(a.retenu)}</dd>
        <dt className="text-pierre-600">Déjà facturé pour le séjour (moins les notes de crédit)</dt>
        <dd className="text-right">{argent(a.deja)}</dd>
        <dt className="font-medium">{a.ecart > 0 ? 'À facturer' : a.ecart < 0 ? 'À créditer' : 'Reste'}</dt>
        <dd className="text-right font-medium">{argent(Math.abs(a.ecart))}</dd>
      </dl>
      {ajuste && a.ecart > 0 && (
        <p className="mt-2 text-amber-800">Devis QBO ajusté aux frais d'annulation : faites « Créer une facture » du solde restant dans QBO (relance posée).</p>
      )}
      {!pret && a.ecart !== 0 && <p className="mt-2 text-pierre-600">QuickBooks n'est pas relié : à faire à la main dans QBO.</p>}
      {geste && (
        <button className={`${ui.bouton} mt-3`} disabled={action.isPending} onClick={agir}>
          {action.isPending ? 'Envoi à QBO…' : libelleAction}
        </button>
      )}
    </div>
  )
}

function LigneFacture({ f, auj, environnement }: { f: Facture; auj: string; environnement: string | null }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const enRetard = f.qbo_type === 'Invoice' && Number(f.solde) > 0 && !!f.echeance && f.echeance < auj
  const ouvrirPdf = async () => {
    setErreur(null)
    // Fenêtre ouverte tout de suite : les bloqueurs de fenêtres laissent passer.
    const fenetre = window.open('', '_blank')
    try {
      const blob = await appelerQbo<Blob>('pdf', { facture: f.id })
      const url = URL.createObjectURL(blob)
      if (fenetre) fenetre.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      fenetre?.close()
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <tr className="align-top">
      <td className="py-1.5 pr-2">
        {GENRES_FACTURE[f.genre]} {f.numero && <span className="tabular-nums">n° {f.numero}</span>}
        {f.date_facture && <span className="ml-1 text-xs text-pierre-400">{dateCourte(f.date_facture, auj)}</span>}
        {erreur && <div className="text-xs text-red-700">{erreur}</div>}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{argent(f.qbo_type === 'CreditMemo' ? -Number(f.total) : f.total)}</td>
      <td className={`whitespace-nowrap px-2 py-1.5 text-right ${enRetard ? 'font-medium text-red-700' : 'text-pierre-600'}`}>
        {f.qbo_type === 'CreditMemo' ? '' : Number(f.solde) <= 0 ? <span className="text-foret-700">✓ Payée</span> : `Solde ${argent(f.solde)}${enRetard ? ' (en retard)' : ''}`}
      </td>
      <td className="whitespace-nowrap py-1.5 pl-2 text-right">
        <button className="text-foret-700 underline" onClick={ouvrirPdf}>
          PDF
        </button>
        {environnement && (
          <a
            className="ml-2 text-foret-700 underline"
            href={adresseQbo(environnement, f.qbo_type === 'CreditMemo' ? 'creditmemo' : 'invoice', f.qbo_id)}
            target="_blank"
            rel="noreferrer"
          >
            QBO
          </a>
        )}
      </td>
    </tr>
  )
}

interface Candidat {
  id: string
  nom: string
  courriel: string | null
  ville: string | null
  exact: boolean
}

/** Création (ou mise à jour) du devis : d'abord le client QBO, choisi ou créé. */
function DialogueDevis({
  r,
  miseAJour: majAuDepart,
  fermer,
  resultat,
}: {
  r: Reservation
  miseAJour: boolean
  fermer: () => void
  resultat: (texte: string, genre: 'ok' | 'avert') => void
}) {
  const creer = useActionQbo<
    { reservation: string; client?: { qbo_id?: string; creer?: boolean } },
    { ecart: number; avertissements: string[]; devis?: { numero: string; total: number }; message?: string }
  >('devis')
  const annulee = r.fermeture === 'annulee'
  const [clients, setClients] = useState<{ lie: { id: string; nom: string } | null; nom?: string; candidats: Candidat[] } | null>(null)
  const [choix, setChoix] = useState<string>('')
  const [erreur, setErreur] = useState<string | null>(null)
  // Figé à l'ouverture : le devis apparaît dans la fiche avant la fin de l'envoi (pièces jointes).
  const [miseAJour] = useState(majAuDepart)

  useEffect(() => {
    appelerQbo<{ lie: { id: string; nom: string } | null; nom?: string; candidats: Candidat[] }>('clients', { reservation: r.id })
      .then((c) => {
        setClients(c)
        setChoix(c.lie ? c.lie.id : (c.candidats.find((x) => x.exact)?.id ?? (c.candidats.length ? '' : 'creer')))
      })
      .catch((e: Error) => setErreur(e.message))
  }, [r.id])

  const envoyer = () => {
    setErreur(null)
    creer.mutate(
      { reservation: r.id, client: clients?.lie ? undefined : choix === 'creer' ? { creer: true } : { qbo_id: choix } },
      {
        onSuccess: (res) => {
          const notes = [...(ecartReel(res.ecart) ? [`Écart de ${argent(res.ecart)} avec l'estimé : vérifiez le code de taxes et les lignes avant de facturer.`] : []), ...res.avertissements]
          resultat(
            `${res.message ?? `${miseAJour ? 'Devis QBO mis à jour' : 'Devis QBO créé'} : n° ${res.devis?.numero}, ${argent(res.devis?.total ?? 0)}.`}${notes.length ? ` ${notes.join(' ')}` : ''}`,
            notes.length ? 'avert' : 'ok',
          )
        },
        onError: (e) => setErreur(e.message),
      },
    )
  }

  return (
    <Dialogue titre={annulee ? "Devis QBO des frais d'annulation" : miseAJour ? 'Mettre le devis QBO à jour' : 'Créer le devis QBO'} fermer={fermer}>
      <div className="space-y-3 text-sm">
        {!clients && !erreur && <p className="text-pierre-500">Recherche du client dans QuickBooks…</p>}
        {clients?.lie && <p>Client QBO : <span className="font-medium">{clients.lie.nom}</span></p>}
        {clients && !clients.lie && (
          <div className="space-y-1.5">
            <p className="text-pierre-600">Client QBO de l'organisation (relié une fois pour toutes) :</p>
            {clients.candidats.map((c) => (
              <label key={c.id} className="flex items-start gap-2 rounded-md border border-pierre-200 px-2 py-1.5">
                <input type="radio" name="client" className="mt-0.5" checked={choix === c.id} onChange={() => setChoix(c.id)} />
                <span>
                  {c.nom}
                  <span className="text-pierre-500">{[c.ville, c.courriel].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                  {c.exact && <span className="ml-1 rounded-full bg-foret-50 px-1.5 text-xs text-foret-800">même nom</span>}
                </span>
              </label>
            ))}
            <label className="flex items-start gap-2 rounded-md border border-pierre-200 px-2 py-1.5">
              <input type="radio" name="client" className="mt-0.5" checked={choix === 'creer'} onChange={() => setChoix('creer')} />
              <span>Créer « {clients.nom} » dans QBO (payable sur réception)</span>
            </label>
          </div>
        )}
        <p className="text-xs text-pierre-500">
          {annulee
            ? "Le devis ne porte plus qu'une ligne, les frais d'annulation ; les factures déjà faites ne bougent pas. Une relance rappelle d'en facturer le solde dans QBO."
            : miseAJour
            ? "Les lignes du devis sont remplacées par celles de l'estimé accepté ; les factures déjà faites ne bougent pas."
            : "Lignes de l'estimé accepté, numéro de la réservation, contrat signé et spécimen de chèque joints ; les relances de l'échéancier sont créées."}
        </p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!clients || (!clients.lie && !choix) || creer.isPending} onClick={envoyer}>
            {creer.isPending ? 'Envoi à QBO…' : annulee ? 'Envoyer à QBO' : miseAJour ? 'Mettre à jour' : 'Créer le devis'}
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

interface LigneSaisie {
  description: string
  quantite: string
  prix_unitaire: string
}

/** Facture séparée (bris, hors forfait : F6) ou note de crédit (F15, F17), avant taxes. */
function DialogueDocument({ r, genre, fermer, fait }: { r: Reservation; genre: 'separee' | 'note_credit'; fermer: () => void; fait: (texte: string) => void }) {
  const envoyer = useActionQbo<{ reservation: string; genre: string; lignes: LigneSaisie[]; note: string }, { numero: string | null; total: number }>('document')
  const [lignes, setLignes] = useState<LigneSaisie[]>([{ description: '', quantite: '1', prix_unitaire: '' }])
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const sousTotal = lignes.reduce((t, l) => t + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0)
  const valides = lignes.filter((l) => l.description.trim() && (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0) > 0)
  const maj = (i: number, champs: Partial<LigneSaisie>) => setLignes(lignes.map((l, j) => (j === i ? { ...l, ...champs } : l)))

  return (
    <Dialogue titre={genre === 'separee' ? 'Facture séparée' : 'Note de crédit'} fermer={fermer} large>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">
          {genre === 'separee'
            ? 'Bris, ménage exceptionnel, matelas… : jamais sur la facture du séjour (F6). Payable sur réception.'
            : 'Réduction après la facture finale, ou trop facturé à une annulation (F15, F17). Jamais une facture modifiée.'}{' '}
          Montants avant taxes : QuickBooks ajoute la TPS et la TVQ.
        </p>
        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem_auto] gap-2">
              <input className={ui.champ} placeholder="Description" aria-label="Description" value={l.description} onChange={(e) => maj(i, { description: e.target.value })} />
              <input className={ui.champ} type="number" min={0} step="any" aria-label="Quantité" value={l.quantite} onChange={(e) => maj(i, { quantite: e.target.value })} />
              <input className={ui.champ} type="number" min={0} step="0.01" placeholder="Prix" aria-label="Prix unitaire" value={l.prix_unitaire} onChange={(e) => maj(i, { prix_unitaire: e.target.value })} />
              <button className="px-1 text-pierre-400 hover:text-red-700" aria-label="Retirer la ligne" disabled={lignes.length === 1} onClick={() => setLignes(lignes.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="text-foret-700 underline" onClick={() => setLignes([...lignes, { description: '', quantite: '1', prix_unitaire: '' }])}>
            + Ligne
          </button>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Note au client (facultatif)</span>
          <input className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} placeholder={genre === 'separee' ? "Bris d'une fenêtre, chambre 12…" : '8 élèves de moins que prévu…'} />
        </label>
        <p className="text-right text-pierre-700">Sous-total : {argent(sousTotal)} (avant taxes)</p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button
            className={ui.bouton}
            disabled={!valides.length || envoyer.isPending}
            onClick={() =>
              envoyer.mutate(
                { reservation: r.id, genre, lignes: valides, note: note.trim() },
                {
                  onSuccess: (f) => fait(`${genre === 'separee' ? 'Facture séparée' : 'Note de crédit'}${f.numero ? ` n° ${f.numero}` : ''} créée dans QBO : ${argent(f.total)} taxes comprises.`),
                  onError: (e) => setErreur(e.message),
                },
              )
            }
          >
            {envoyer.isPending ? 'Envoi à QBO…' : 'Créer dans QBO'}
          </button>
        </div>
      </div>
    </Dialogue>
  )
}
