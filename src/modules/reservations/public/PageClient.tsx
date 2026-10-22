import { useCallback, useEffect, useState } from 'react'
import { CourrielCopiable } from '@/lib/CourrielCopiable'
import { ui } from '@/lib/ui'
import { exerciceDe, libelleExercice, ligneProvisoire } from '../calcul'
import { heureLisible, remplacer } from '../demande'
import { bilanFactures } from '../facturation'
import { aDesAllergies, dieteParticuliere, fichesManquantes, nomFiche, type FicheAllergies } from '../fiches'
import type { Forfait } from '../types'
import { db, messageDe } from './client'
import { Entete, Page, Pied } from './commun'
import { ConfirmationInfos } from './ConfirmationClient'
import { dateLisible, dollars, jourMontreal, langueDuGroupe, useLangue } from './outils'
import { TEXTES_PUBLICS } from './textes'

// Page client sans compte (/client/<jeton>), une seule colonne, dans
// l'ordre du déroulement : le séjour, l'estimé à accepter, le contrat à
// signer (seulement une fois l'estimé accepté), puis, après la signature,
// les informations du séjour à confirmer (pré-arrivée, ConfirmationClient.tsx)
// et les fiches participants (lien + fiches reçues avec allergies et diète :
// page_client ne les donne qu'à partir de la signature), les documents et
// les factures. Pas de message à l'équipe sur la page (réunion du
// 2026-10-21 : tout passe par courriel) : une ligne avec le courriel de la
// compagnie. Lit reservations.page_client.

interface Ligne {
  code?: string | null
  auto?: boolean | null
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  pourcentage: number | null
  montant: number
}

interface Infos {
  numero: string
  nom: string
  forfait: Forfait
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  nb_participants: number | null
  nb_accompagnateurs: number | null
  langue: string | null
  etape: string
  fermeture: string | null
  organisation: string | null
  compagnie: { nom: string | null; logo: string | null; courriel: string | null; telephone: string | null } | null
  estime: {
    id: string
    version: number
    statut: 'envoye' | 'accepte'
    date_estime: string
    sous_total: number
    tps: number
    tvq: number
    total: number
    accepte_le: string | null
    accepte_par: string | null
    document_id: string | null
    /** Prix provisoires de l'estimé (code → exercice du prix pris) : lignes marquées. */
    exercice_prix?: number
    prix_provisoires?: Record<string, number>
    lignes: Ligne[]
  } | null
  signature: { statut: 'en_attente' | 'signe'; jeton: string | null; echeance: string; signe_le: string | null; nom_signataire: string | null } | null
  documents: { id: string; genre: string; titre: string; cree_le: string }[]
  /** À partir de la signature seulement ; `jeton` null une fois les fiches fermées (départ passé). */
  fiches: { jeton: string | null; recues: number; attendues: number; liste: FicheRecue[] } | null
}

/** Fiche reçue telle que le responsable du groupe la voit (allergies et diète seulement). */
type FicheRecue = FicheAllergies & { recue_le: string; partage: boolean }

/** Étapes d'un contrat signé (même liste que `fichesSurPageClient` et page_client). */
const ETAPES_SIGNEES = ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']

const lienDocument = (jeton: string, id: string) => `/api/reservations/document?jeton=${jeton}&id=${id}`

export default function PageClient() {
  const jeton = window.location.pathname.split('/')[2] ?? ''
  const [infos, setInfos] = useState<Infos | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)
  const [langue, changerLangue] = useLangue(langueDuGroupe(infos?.langue))
  const t = TEXTES_PUBLICS[langue]

  const [version, setVersion] = useState(0)
  const relire = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let actif = true
    db()
      .rpc('page_client', { p_jeton: jeton })
      .then(({ data, error }) => {
        if (!actif) return
        setErreur(error ? messageDe(error, 'Erreur') : null)
        setInfos((data as Infos | null) ?? null)
      })
    return () => {
      actif = false
    }
  }, [jeton, version])

  useEffect(() => {
    document.title = infos ? `${infos.numero} — ${infos.nom}` : 'Réservation'
  }, [infos])

  if (infos === undefined && !erreur) return <Page><p className="py-10 text-center text-sm text-pierre-500">{t.chargement}</p></Page>
  if (!infos) {
    return (
      <Page>
        <Entete titre={t.lien_invalide} langue={langue} changerLangue={changerLangue} />
        {erreur ? <p className={ui.erreur}>{erreur}</p> : <p className="text-sm text-pierre-600">{t.lien_invalide_aide}</p>}
        <Pied />
      </Page>
    )
  }

  const unJour = infos.date_arrivee === infos.date_depart
  const heures =
    infos.heure_arrivee && infos.heure_depart
      ? ` (${remplacer(t.de_a, { a: heureLisible(infos.heure_arrivee.slice(0, 5), langue), d: heureLisible(infos.heure_depart.slice(0, 5), langue) })})`
      : ''
  const scolaire = infos.forfait === 'classe_nature' || infos.forfait === 'journee_plein_air'

  return (
    <Page>
      <Entete
        surtitre={remplacer(t.reservation, { n: infos.numero })}
        titre={infos.nom}
        logo={infos.compagnie?.logo}
        nomLogo={infos.compagnie?.nom}
        langue={langue}
        changerLangue={changerLangue}
      />
      {infos.fermeture && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.ferme}</p>}

      <section className={`${ui.carte} p-5`}>
        <h2 className="mb-3 text-lg font-semibold">{t.sejour}</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-pierre-500">{t.forfait}</dt>
          <dd>{t.forfaits[infos.forfait]}</dd>
          <dt className="text-pierre-500">{t.dates}</dt>
          <dd>
            {unJour
              ? remplacer(t.le, { a: dateLisible(infos.date_arrivee, langue) })
              : remplacer(t.du_au, { a: dateLisible(infos.date_arrivee, langue), d: dateLisible(infos.date_depart, langue) })}
            {heures}
          </dd>
          {infos.nb_participants !== null && (
            <>
              <dt className="text-pierre-500">{t.participants}</dt>
              <dd>
                {scolaire
                  ? remplacer(t.eleves_accompagnateurs, { p: String(infos.nb_participants), a: String(infos.nb_accompagnateurs ?? 0) })
                  : remplacer(t.personnes, { p: String(infos.nb_participants) })}
              </dd>
            </>
          )}
        </dl>
      </section>

      <Estime infos={infos} jeton={jeton} langue={langue} relire={relire} />
      <Contrat infos={infos} langue={langue} />
      <ConfirmationInfos jeton={jeton} forfait={infos.forfait} langue={langue} ferme={!!infos.fermeture} />
      {infos.fiches && <FichesClient fiches={infos.fiches} langue={langue} />}

      {infos.documents.length > 0 && (
        <section className={`${ui.carte} p-5`}>
          <h2 className="mb-2 text-lg font-semibold">{t.documents}</h2>
          <ul className="divide-y divide-pierre-100 text-sm">
            {infos.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {t.genre_doc[d.genre] ?? d.titre}
                  <span className="ml-2 text-xs text-pierre-400">{dateLisible(jourMontreal(d.cree_le), langue)}</span>
                </span>
                <a className="text-foret-700 underline" href={lienDocument(jeton, d.id)} target="_blank" rel="noreferrer">
                  {t.ouvrir}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Factures jeton={jeton} langue={langue} version={version} />
      <p className="text-center text-sm text-pierre-600">
        {t.question} <CourrielCopiable courriel={infos.compagnie?.courriel ?? 'inscriptions@camptremblant.com'} className="font-medium text-foret-700 underline" />
      </p>
      <Pied compagnie={infos.compagnie} />
    </Page>
  )
}

function Estime({ infos, jeton, langue, relire }: { infos: Infos; jeton: string; langue: 'fr' | 'en'; relire: () => void }) {
  const t = TEXTES_PUBLICS[langue]
  const e = infos.estime
  const [accepte, setAccepte] = useState(false)
  const [nom, setNom] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (!e) {
    return (
      <section className={`${ui.carte} p-5`}>
        <h2 className="mb-1 text-lg font-semibold">{t.estime}</h2>
        <p className="text-sm text-pierre-600">{t.estime_preparation}</p>
      </section>
    )
  }

  const accepter = async () => {
    setEnvoi(true)
    setErreur(null)
    const { error } = await db().rpc('accepter_estime_client', { p_jeton: jeton, p_estime: e.id, p_nom: nom, p_accepte: accepte })
    if (error) setErreur(messageDe(error, 'Erreur'))
    else relire()
    setEnvoi(false)
  }

  return (
    <section className={`${ui.carte} p-5`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t.estime}</h2>
        <span className="text-xs text-pierre-500">{remplacer(t.estime_version, { v: String(e.version), d: dateLisible(e.date_estime, langue) })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="py-1.5 pr-2 font-medium">{t.description}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t.quantite}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t.prix}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{t.montant}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {e.lignes.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.note && <div className="text-xs italic text-pierre-500">{l.note}</div>}
                  {ligneProvisoire(l, e.prix_provisoires) && <div className="text-xs italic text-amber-800">{t.prix_provisoire}</div>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{Number(l.quantite).toLocaleString(langue === 'en' ? 'en-CA' : 'fr-CA')}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{dollars(l.prix_unitaire, langue)}</td>
                <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums">{dollars(l.montant, langue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-pierre-700">
            {(
              [
                [t.sous_total, e.sous_total],
                [t.tps, e.tps],
                [t.tvq, e.tvq],
              ] as const
            ).map(([n, m]) => (
              <tr key={n}>
                <td colSpan={3} className="pt-1.5 text-right">
                  {n}
                </td>
                <td className="whitespace-nowrap pt-1.5 text-right tabular-nums">{dollars(m, langue)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-pierre-900">
              <td colSpan={3} className="pt-1.5 text-right">
                {t.total}
              </td>
              <td className="whitespace-nowrap pt-1.5 text-right tabular-nums">{dollars(e.total, langue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {e.lignes.some((l) => ligneProvisoire(l, e.prix_provisoires)) && (
        <p className="mt-2 text-xs text-amber-800">
          {remplacer(t.prix_provisoire_note, { ex: libelleExercice(e.exercice_prix ?? exerciceDe(infos.date_arrivee)) })}
        </p>
      )}
      {e.document_id && (
        <a className="mt-3 inline-block text-sm text-foret-700 underline" href={lienDocument(jeton, e.document_id)} target="_blank" rel="noreferrer">
          {t.pdf}
        </a>
      )}

      {e.statut === 'accepte' ? (
        <p className="mt-4 text-sm font-medium text-foret-800">
          {/* Estimé importé des Sheets : accepté sans nom ni date. */}
          {!e.accepte_le
            ? t.estime_accepte_seul
            : e.accepte_par
              ? remplacer(t.estime_accepte, { n: e.accepte_par, d: dateLisible(jourMontreal(e.accepte_le), langue) })
              : remplacer(t.estime_accepte_court, { d: dateLisible(jourMontreal(e.accepte_le), langue) })}
        </p>
      ) : (
        !infos.fermeture && (
          <div className="mt-4 space-y-3 rounded-lg border border-pierre-200 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={accepte} onChange={(x) => setAccepte(x.target.checked)} />
              <span>{t.accepter_case}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input className={`${ui.champ} min-w-0 flex-1`} placeholder={t.votre_nom} aria-label={t.votre_nom} value={nom} autoComplete="name" onChange={(x) => setNom(x.target.value)} />
              <button className={ui.bouton} disabled={!accepte || !nom.trim() || envoi} onClick={accepter}>
                {envoi ? t.acceptation : t.accepter}
              </button>
            </div>
            {erreur && <p className={ui.erreur}>{erreur}</p>}
          </div>
        )
      )}
    </section>
  )
}

function Contrat({ infos, langue }: { infos: Infos; langue: 'fr' | 'en' }) {
  const t = TEXTES_PUBLICS[langue]
  const s = infos.signature
  // Contrat signé à la main ou importé : pas de signature en ligne, mais l'étape le dit.
  const signeSansLigne = !s && ETAPES_SIGNEES.includes(infos.etape)
  if (!s && !signeSansLigne && infos.estime?.statut !== 'accepte') return null
  return (
    <section className={`${ui.carte} p-5`}>
      <h2 className="mb-2 text-lg font-semibold">{t.contrat}</h2>
      {signeSansLigne && <p className="text-sm font-medium text-foret-800">{t.contrat_signe_seul}</p>}
      {!s && !signeSansLigne && <p className="text-sm text-pierre-600">{t.contrat_a_venir}</p>}
      {s?.statut === 'en_attente' && s.jeton && (
        <div className="space-y-3">
          <p className="text-sm text-pierre-700">{remplacer(t.contrat_a_signer, { d: dateLisible(s.echeance, langue) })}</p>
          <a className={`${ui.bouton} inline-block`} href={`/signer/${s.jeton}`}>
            {t.signer}
          </a>
        </div>
      )}
      {s?.statut === 'signe' && (
        <p className="text-sm font-medium text-foret-800">
          {remplacer(t.contrat_signe, { n: s.nom_signataire ?? '', d: s.signe_le ? dateLisible(jourMontreal(s.signe_le), langue) : '' })}
        </p>
      )}
    </section>
  )
}

interface FactureClient {
  id: string
  genre: 'progressive' | 'separee' | 'note_credit'
  numero: string | null
  date_facture: string | null
  echeance: string | null
  total: number
  solde: number
}

/** Factures de QuickBooks : PDF officiel par le Worker, soldes à jour. */
function Factures({ jeton, langue, version }: { jeton: string; langue: 'fr' | 'en'; version: number }) {
  const t = TEXTES_PUBLICS[langue]
  const [liste, setListe] = useState<FactureClient[]>([])
  useEffect(() => {
    let actif = true
    db()
      .rpc('factures_client', { p_jeton: jeton })
      .then(({ data }) => actif && setListe((data as FactureClient[] | null) ?? []))
    return () => {
      actif = false
    }
  }, [jeton, version])
  if (!liste.length) return null
  const { solde } = bilanFactures(liste.map((f) => ({ ...f, qbo_type: f.genre === 'note_credit' ? 'CreditMemo' : 'Invoice' })))
  return (
    <section className={`${ui.carte} p-5`}>
      <h2 className="mb-2 text-lg font-semibold">{t.factures}</h2>
      <ul className="divide-y divide-pierre-100 text-sm">
        {liste.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {remplacer(f.genre === 'note_credit' ? t.note_credit_n : t.facture_n, { n: f.numero ?? '' })}
              {f.date_facture && <span className="ml-2 text-xs text-pierre-400">{dateLisible(f.date_facture, langue)}</span>}
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">{dollars(f.genre === 'note_credit' ? -Number(f.total) : f.total, langue)}</span>
              {f.genre !== 'note_credit' && (
                <span className={Number(f.solde) > 0 ? 'text-pierre-700' : 'text-foret-700'}>
                  {Number(f.solde) > 0
                    ? `${remplacer(t.solde_du, { m: dollars(f.solde, langue) })} · ${f.echeance && f.echeance > (f.date_facture ?? '') ? remplacer(t.echeance_le, { d: dateLisible(f.echeance, langue) }) : t.sur_reception}`
                    : t.payee}
                </span>
              )}
              <a className="text-foret-700 underline" href={`/api/reservations/facture?jeton=${jeton}&id=${f.id}`} target="_blank" rel="noreferrer">
                PDF
              </a>
            </span>
          </li>
        ))}
      </ul>
      {solde > 0 && (
        <div className="mt-3 space-y-1 border-t border-pierre-100 pt-3 text-sm">
          <p className="font-medium">{remplacer(t.solde_total, { m: dollars(solde, langue) })}</p>
          <p className="text-xs text-pierre-500">{t.paiement_aide}</p>
        </div>
      )}
    </section>
  )
}

/**
 * Fiches participants, à partir de la signature : le lien à transmettre
 * aux parents (tant qu'on peut en remplir), le compte et, pour relancer
 * les parents et savoir qui a quoi en sortie, chaque fiche reçue avec ses
 * allergies et sa diète (décision de Maxime ; rien d'autre de la santé).
 */
function FichesClient({ fiches, langue }: { fiches: NonNullable<Infos['fiches']>; langue: 'fr' | 'en' }) {
  const t = TEXTES_PUBLICS[langue]
  const [copie, setCopie] = useState(false)
  const [filtre, setFiltre] = useState<'toutes' | 'a_savoir'>('toutes')
  const lien = fiches.jeton ? `${window.location.origin}/fiches/${fiches.jeton}${langue === 'en' ? '?lang=en' : ''}` : null
  const manquantes = fichesManquantes(fiches.recues, fiches.attendues)
  const aSavoir = (f: FicheRecue) => aDesAllergies(f) || dieteParticuliere(f)
  const nbASavoir = fiches.liste.filter(aSavoir).length
  const affichees = filtre === 'a_savoir' ? fiches.liste.filter(aSavoir) : fiches.liste
  const diete = (f: FicheRecue) => (!f.diete ? '' : f.diete === 'autre' ? f.diete_autre?.trim() || t.dietes.autre : t.dietes[f.diete])

  return (
    <section className={`${ui.carte} space-y-4 p-5`}>
      <h2 className="text-lg font-semibold">{t.fiches}</h2>
      {lien ? (
        <div className="space-y-2">
          <p className="text-sm text-pierre-700">{t.fiches_aide}</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly className={`${ui.champ} min-w-0 flex-1 text-xs`} value={lien} onFocus={(e) => e.currentTarget.select()} />
            <button
              className={ui.boutonSecondaire}
              onClick={async () => {
                await navigator.clipboard.writeText(lien)
                setCopie(true)
                setTimeout(() => setCopie(false), 2000)
              }}
            >
              {copie ? t.copie : t.copier}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-pierre-600">{t.fiches_fermees}</p>
      )}
      <p className="text-sm font-medium text-pierre-800">
        {remplacer(t.fiches_recues, { r: String(fiches.recues), a: String(fiches.attendues) })}
        {' · '}
        <span className={manquantes > 0 ? 'text-amber-800' : 'text-foret-700'}>
          {manquantes > 0 ? remplacer(t.fiches_manquantes, { n: String(manquantes) }) : t.fiches_completes}
        </span>
      </p>

      {fiches.liste.length === 0 ? (
        <p className="text-sm text-pierre-500">{t.fiches_aucune}</p>
      ) : (
        <div className="space-y-2 border-t border-pierre-100 pt-4">
          <h3 className="font-semibold">{t.fiches_liste}</h3>
          <p className="text-xs text-pierre-500">{t.fiches_liste_aide}</p>
          <p className="text-sm text-pierre-700">
            {remplacer(t.fiches_resume, { a: String(fiches.liste.filter(aDesAllergies).length), d: String(fiches.liste.filter(dieteParticuliere).length) })}
          </p>
          <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group">
            {(
              [
                ['toutes', t.fiches_toutes, fiches.liste.length],
                ['a_savoir', t.fiches_a_savoir, nbASavoir],
              ] as const
            ).map(([cle, libelle, n]) => (
              <button
                key={cle}
                type="button"
                aria-pressed={filtre === cle}
                className={`rounded-md px-2.5 py-1 ${filtre === cle ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
                onClick={() => setFiltre(cle)}
              >
                {libelle} <span className="tabular-nums text-pierre-400">{n}</span>
              </button>
            ))}
          </div>
          {affichees.length === 0 ? (
            <p className="text-sm text-pierre-500">{t.fiches_rien_a_signaler}</p>
          ) : (
            <ul className="divide-y divide-pierre-100 text-sm">
              {affichees.map((f, i) => (
                <li key={i} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-pierre-900">
                      {nomFiche(f)}
                      {f.genre === 'adulte' && <span className="ml-1 font-normal text-pierre-500">({t.fiche_adulte})</span>}
                    </span>
                    <span className="text-xs text-pierre-500">
                      {[f.groupe, dateLisible(jourMontreal(f.recue_le), langue)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {!f.partage ? (
                    <p className="text-xs italic text-pierre-500">{t.fiche_non_partagee}</p>
                  ) : (
                    <>
                      {aDesAllergies(f) && <p className="text-amber-800">{remplacer(t.fiche_allergies, { a: f.allergies ?? '' })}</p>}
                      {dieteParticuliere(f) && <p className="text-foret-800">{remplacer(t.fiche_diete, { d: diete(f) })}</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
