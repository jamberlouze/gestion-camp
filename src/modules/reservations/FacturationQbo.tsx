import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { appelerQbo, useActionQbo, useEstimes, useFactures, useQboConfiguration, useQboConnexions, useQboDevis } from './donnees'
import { bilanFactures, ecart, echeancier } from './facturation'
import { argent, dateCourte, dateLongue } from './format'
import { GENRES_FACTURE, type Facture, type Reservation } from './types'

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
  const [dialogue, setDialogue] = useState<null | 'devis' | 'separee' | 'note_credit'>(null)
  const [message, setMessage] = useState<{ genre: 'ok' | 'avert' | 'erreur'; texte: string } | null>(null)

  const configure = configuration.data?.configure ?? false
  const connexion = connexions.data?.find((c) => c.compagnie_id === r.compagnie_id)
  const compagnie = compagniesFacture.find((c) => c.entreprise_id === r.compagnie_id)
  const accepte = [...(estimes.data ?? [])].reverse().find((e) => e.statut === 'accepte')
  const d = devis.data
  const total = d?.total ?? (accepte ? Number(accepte.total) : null)
  const etapes = r.signe_le && total ? echeancier({ forfait: r.forfait, total, signe_le: r.signe_le, date_arrivee: r.date_arrivee, date_depart: r.date_depart }) : null
  const liste = (factures.data ?? []).filter((f) => !f.supprimee)
  const factureProgressif = liste.filter((f) => f.genre === 'progressive').reduce((t, f) => t + Number(f.total), 0)
  const { facture, paye, credits, solde } = bilanFactures(liste)
  const ecartDevis = d ? ecart(d.total, d.total_app) : 0
  const devisEnRetard = d && accepte && d.estime_version !== null && accepte.version > d.estime_version

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
            {ecriture && pret && !d && (
              <button className={ui.bouton} disabled={!!raisonDevis} title={raisonDevis ?? undefined} onClick={() => setDialogue('devis')}>
                Créer le devis QBO
              </button>
            )}
            {ecriture && pret && d && (devisEnRetard || ecartDevis !== 0) && (
              <button className={ui.boutonSecondaire} disabled={!!raisonDevis} onClick={() => setDialogue('devis')}>
                Mettre le devis à jour
              </button>
            )}
          </div>
          {!d ? (
            <p className="mt-1 text-pierre-500">
              {!pret ? 'Pas encore de devis.' : (raisonDevis ?? 'Créé à partir de l’estimé accepté, avec le contrat signé et le spécimen de chèque joints.')}
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              <p className="text-pierre-700">
                N° {d.numero} · {argent(d.total)} taxes comprises · estimé v{d.estime_version}
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
              {ecartDevis !== 0 && (
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
            <p className={ui.etiquette}>Échéancier {d ? '(devis QBO)' : '(estimé accepté)'}</p>
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
  const creer = useActionQbo<{ reservation: string; client?: { qbo_id?: string; creer?: boolean } }, { ecart: number; avertissements: string[]; devis: { numero: string; total: number } }>('devis')
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
          const notes = [...(res.ecart !== 0 ? [`Écart de ${argent(res.ecart)} avec l'estimé : vérifiez le code de taxes et les lignes avant de facturer.`] : []), ...res.avertissements]
          resultat(
            `${miseAJour ? 'Devis QBO mis à jour' : 'Devis QBO créé'} : n° ${res.devis.numero}, ${argent(res.devis.total)}.${notes.length ? ` ${notes.join(' ')}` : ''}`,
            notes.length ? 'avert' : 'ok',
          )
        },
        onError: (e) => setErreur(e.message),
      },
    )
  }

  return (
    <Dialogue titre={miseAJour ? 'Mettre le devis QBO à jour' : 'Créer le devis QBO'} fermer={fermer}>
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
          {miseAJour
            ? "Les lignes du devis sont remplacées par celles de l'estimé accepté ; les factures déjà faites ne bougent pas."
            : "Lignes de l'estimé accepté, numéro de la réservation, contrat signé et spécimen de chèque joints ; les relances de l'échéancier sont créées."}
        </p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!clients || (!clients.lie && !choix) || creer.isPending} onClick={envoyer}>
            {creer.isPending ? 'Envoi à QBO…' : miseAJour ? 'Mettre à jour' : 'Créer le devis'}
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
