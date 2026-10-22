import { useMemo, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import {
  appliquerPourcentages,
  arrondi4,
  exerciceDe,
  libelleExercice,
  ligneProvisoire as estLigneProvisoire,
  lignesAuto,
  totaux,
  type LigneCalculee,
} from './calcul'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { ouvrirPdf, pdfDeLEstime } from './productionPdf'
import { argent, champPetit, dateLongue } from './format'
import {
  brouillonCourriel,
  useAccepterEstime,
  useChangerEstime,
  useEnregistrerEstime,
  useEstimes,
  useExpedierCourriel,
  useLignes,
  useModeEnvoi,
  type LigneAEcrire,
} from './donnees'
import { FenetreCourriel } from './FenetreCourriel'
import { CODE_MINIMUM, estimeDeReference, minimum90 } from './facturation'
import { CATEGORIES, UNITES, type Estime as TEstime, type Reservation, type StatutEstime } from './types'

const STATUTS: Record<StatutEstime, [string, string]> = {
  brouillon: ['Brouillon', 'border-sky-300 bg-sky-50 text-sky-800'],
  envoye: ['Envoyé', 'border-amber-300 bg-amber-50 text-amber-800'],
  accepte: ['Accepté', 'border-foret-300 bg-foret-50 text-foret-800'],
  remplace: ['Remplacé', 'border-pierre-300 bg-pierre-50 text-pierre-500'],
  refuse: ['Refusé', 'border-red-200 bg-red-50 text-red-700'],
}

type LigneEdit = LigneAEcrire

const versLigne = (l: LigneCalculee, ordre: number): LigneEdit => ({ ...l, id: crypto.randomUUID(), ordre })

/** Estimé de la réservation : versions, lignes aux prix figés, totaux. */
export function Estime({ r }: { r: Reservation }) {
  const estimes = useEstimes(r.id)
  const liste = estimes.data ?? []
  const brouillon = liste.find((e) => e.statut === 'brouillon')
  const [choisi, setChoisi] = useState<string | null>(null)
  const courant = liste.find((e) => e.id === choisi) ?? brouillon ?? liste.at(-1)

  if (estimes.isLoading) return <Section titre="Estimé">Chargement…</Section>
  if (!courant) return <PremierEstime r={r} />

  return (
    <Section
      titre="Estimé"
      action={
        liste.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {liste.map((e) => (
              <button
                key={e.id}
                onClick={() => setChoisi(e.id)}
                className={`rounded-md border px-2 py-0.5 text-xs ${e.id === courant.id ? 'border-foret-400 bg-foret-50 font-medium text-foret-800' : 'border-pierre-200 text-pierre-600 hover:border-pierre-400'}`}
              >
                v{e.version} · {STATUTS[e.statut][0]}
              </button>
            ))}
          </div>
        )
      }
    >
      <Editeur key={courant.id} r={r} estime={courant} choisir={setChoisi} reference={estimeDeReference(liste.filter((e) => e.version < courant.version), r.date_arrivee)} />
    </Section>
  )
}

/** Prix provisoires d'un estimé (code → exercice du prix pris) : liste de prix pas encore validée. */
function prixProvisoires(codes: Iterable<string>, exercice: number, infoPrix: ReturnType<typeof useDonnees>['infoPrix']) {
  const m: Record<string, number> = {}
  for (const c of codes) {
    const i = infoPrix(c, exercice)
    if (i.provisoire && i.exercice !== null) m[c] = i.exercice
  }
  return m
}

function PremierEstime({ r }: { r: Reservation }) {
  const { catalogue, ecriture, infoPrix } = useDonnees()
  const enregistrer = useEnregistrerEstime()
  const creer = () => {
    const calc = lignesAuto(r, catalogue)
    const lignes = calc.lignes.map(versLigne)
    enregistrer.mutate({
      estime: { id: crypto.randomUUID(), reservation_id: r.id, version: 1, exercice_prix: calc.exercice, notes: null, ...totaux(lignes) },
      lignes,
      prix_provisoires: prixProvisoires(calc.provisoires, calc.exercice, infoPrix),
    })
  }
  return (
    <Section titre="Estimé">
      <p className="text-sm text-pierre-600">Pas encore d'estimé. Il est calculé d'après la réservation, aux prix de {libelleExercice(exerciceDe(r.date_arrivee))}.</p>
      {ecriture && (
        <button className={`${ui.bouton} mt-3`} onClick={creer} disabled={enregistrer.isPending}>
          Créer l'estimé
        </button>
      )}
    </Section>
  )
}

function Editeur({ r, estime, choisir, reference }: { r: Reservation; estime: TEstime; choisir: (id: string) => void; reference: TEstime | null }) {
  const { catalogue, produits, parCode, prixDe, infoPrix, ecriture, sources, auj } = useDonnees()
  const [pdf, setPdf] = useState<string | null>(null)
  const lignesDb = useLignes(estime.id)
  const enregistrer = useEnregistrerEstime()
  const changerEtat = useChangerEstime()
  const expedier = useExpedierCourriel()
  const modeEnvoi = useModeEnvoi()
  // Fenêtre d'envoi : PDF de cette version, produit à l'ouverture (montré et joint).
  const [envoi, setEnvoi] = useState<{ nom: string; octets: Uint8Array } | null>(null)
  const [preparation, setPreparation] = useState(false)
  const [acceptation, setAcceptation] = useState(false)
  const refusEnvoi = modeEnvoi.error ? messageErreur(modeEnvoi.error) : (modeEnvoi.data?.refus ?? null)
  const modifiable = ecriture && estime.statut === 'brouillon'
  const [lignes, setLignes] = useState<LigneEdit[] | null>(null)
  const [sale, setSale] = useState(false)
  // Lignes de la base tant qu'on n'a rien changé ici (reprises à chaque nouvelle lecture).
  const [lues, setLues] = useState<typeof lignesDb.data>(undefined)
  if (lignesDb.data && lignesDb.data !== lues && !sale) {
    setLues(lignesDb.data)
    setLignes(
      lignesDb.data.map((l) => ({
        ...l,
        quantite: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
        montant: Number(l.montant),
        pourcentage: l.pourcentage === null ? null : Number(l.pourcentage),
      })),
    )
  }

  const calcul = useMemo(() => lignesAuto(r, catalogue), [r, catalogue])
  const avecMontants = useMemo(() => (lignes ? appliquerPourcentages(lignes) : []), [lignes])
  const t = totaux(avecMontants)

  // Minimum de 90 % (F10, F11) : à moins de 21 jours de l'arrivée, l'estimé
  // final ne descend pas sous 90 % de l'estimé en vigueur à ce moment (F9).
  const delaiPasse = auj >= new Date(Date.parse(`${r.date_arrivee}T12:00:00Z`) - 21 * 86_400_000).toISOString().slice(0, 10)
  const lignesRef = useLignes(modifiable && delaiPasse && reference ? reference.id : null)
  const minimum = modifiable && reference && lignesRef.data ? minimum90(r.forfait, lignesRef.data, avecMontants) : null
  const ligneMinimum = avecMontants.find((l) => l.code === CODE_MINIMUM)

  // Les lignes calculées ne correspondent plus à la réservation (dates, nombre, ratio…).
  const auto = avecMontants.filter((l) => l.auto)
  const decale =
    modifiable &&
    lignes !== null &&
    (auto.length !== calcul.lignes.length ||
      calcul.lignes.some((c, i) => c.description !== auto[i]?.description || c.quantite !== auto[i]?.quantite || c.prix_unitaire !== auto[i]?.prix_unitaire))

  if (!lignes) return <p className="text-sm text-pierre-500">Chargement…</p>

  // Prix provisoires : brouillon = d'après la liste de prix d'aujourd'hui ; figé = ceux gardés avec l'estimé.
  const provisoires = modifiable
    ? prixProvisoires(new Set([...calcul.provisoires, ...lignes.flatMap((l) => (l.code && parCode.has(l.code) ? [l.code] : []))]), calcul.exercice, infoPrix)
    : (estime.prix_provisoires ?? {})
  const codesProvisoires = Object.keys(provisoires)
  const exercicePrix = modifiable ? calcul.exercice : estime.exercice_prix
  const ligneProvisoire = (l: Pick<LigneEdit, 'code' | 'auto' | 'prix_unitaire'>) => estLigneProvisoire(l, provisoires)

  const maj = (n: LigneEdit[]) => {
    setLignes(n.map((l, i) => ({ ...l, ordre: i })))
    setSale(true)
  }
  const changerLigne = (id: string, champs: Partial<LigneEdit>) =>
    // Une ligne calculée retouchée à la main n'est plus refaite par « Recalculer ».
    maj(lignes.map((l) => (l.id === id ? { ...l, ...champs, auto: 'description' in champs || 'quantite' in champs || 'prix_unitaire' in champs ? false : l.auto } : l)))

  const recalculer = () => {
    const manuelles = lignes.filter((l) => !l.auto)
    maj([...calcul.lignes.map(versLigne), ...manuelles])
  }

  const aEnregistrer = () => ({
    estime: { id: estime.id, reservation_id: r.id, version: estime.version, exercice_prix: calcul.exercice, notes: estime.notes, ...t },
    lignes: avecMontants.map((l, i) => ({ ...l, ordre: i })),
    prix_provisoires: provisoires,
  })
  const sauver = (apres?: () => void) =>
    enregistrer.mutate(aEnregistrer(), {
      onSuccess: () => {
        setSale(false)
        apres?.()
      },
    })

  // « Envoyer l'estimé… » : enregistré d'abord, puis son PDF (lignes de la
  // base, comme l'aperçu) est montré dans la fenêtre et joint au courriel.
  // L'estimé ne devient « envoyé » que quand le courriel est parti (Worker).
  const ouvrirEnvoi = async () => {
    setPdf(null)
    setPreparation(true)
    try {
      const pour = sale && modifiable ? { ...estime, ...t, exercice_prix: calcul.exercice, prix_provisoires: provisoires } : estime
      if (sale && modifiable) {
        await enregistrer.mutateAsync(aEnregistrer())
        setSale(false)
      }
      const octets = await pdfDeLEstime(sources(r), pour)
      setEnvoi({ nom: `Estimé ${r.numero}${estime.version > 1 ? ` v${estime.version}` : ''}.pdf`, octets })
    } catch (e) {
      setPdf(messageErreur(e))
    } finally {
      setPreparation(false)
    }
  }

  const action = (a: 'refuser' | 'nouvelle_version') =>
    changerEtat.mutate({ estime, action: a }, { onSuccess: (id) => a === 'nouvelle_version' && choisir(id) })

  const extras = produits.filter((p) => p.extra && p.actif && (!p.forfaits.length || p.forfaits.includes(r.forfait)))
  const ajouterExtra = (code: string) => {
    const p = parCode.get(code)
    if (!p) return
    const prix = prixDe(code, calcul.exercice) ?? 0
    maj([
      ...lignes,
      { id: crypto.randomUUID(), ordre: 0, produit_id: p.id, code, description: p.nom, note: null, quantite: 1, prix_unitaire: arrondi4(prix), pourcentage: null, montant: 0, auto: false },
    ])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUTS[estime.statut][1]}`}>
          v{estime.version} · {STATUTS[estime.statut][0]}
        </span>
        <span className="text-pierre-500">
          Prix {libelleExercice(estime.statut === 'brouillon' ? calcul.exercice : estime.exercice_prix)}
          {estime.envoye_le && ` · envoyé le ${dateLongue(estime.envoye_le)}`}
          {estime.accepte_le && ` · accepté le ${dateLongue(estime.accepte_le)}`}
          {estime.accepte_par && ` en ligne par ${estime.accepte_par}`}
          {estime.preuve_courriel_le &&
            ` par courriel du client (${dateLongue(estime.preuve_courriel_le)})${estime.preuve_saisie_par_nom ? `, preuve saisie par ${estime.preuve_saisie_par_nom}` : ''}`}
        </span>
      </div>
      {estime.preuve_texte && (
        <details className="rounded-lg border border-pierre-200 bg-pierre-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-pierre-700">Courriel du client (preuve de l'acceptation)</summary>
          <p className="mt-2 whitespace-pre-wrap text-pierre-700">{estime.preuve_texte}</p>
        </details>
      )}

      {decale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Les lignes calculées ne correspondent plus à la réservation (dates, nombres, ratio, repas ou sections).
          <button className={ui.boutonSecondaire} onClick={recalculer}>
            Recalculer
          </button>
        </div>
      )}
      {minimum && reference && (minimum.ajustement > 0 || ligneMinimum) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Minimum de 90 % ({minimum.regle}, estimé v{reference.version}) : {minimum.explication}.
            {ligneMinimum && Math.abs(ligneMinimum.montant - minimum.ajustement) < 0.01 && ' ✓ Ajustement à jour.'}
          </span>
          {!ligneMinimum ? (
            <button
              className={ui.boutonSecondaire}
              onClick={() =>
                maj([
                  ...lignes,
                  {
                    id: crypto.randomUUID(),
                    ordre: 0,
                    produit_id: null,
                    code: CODE_MINIMUM,
                    description: minimum.description,
                    note: null,
                    quantite: 1,
                    prix_unitaire: minimum.ajustement,
                    pourcentage: null,
                    montant: minimum.ajustement,
                    auto: false,
                  },
                ])
              }
            >
              Ajouter l'ajustement de {argent(minimum.ajustement)}
            </button>
          ) : (
            Math.abs(ligneMinimum.montant - minimum.ajustement) >= 0.01 && (
              <button
                className={ui.boutonSecondaire}
                onClick={() =>
                  maj(
                    minimum.ajustement > 0
                      ? lignes.map((l) => (l.code === CODE_MINIMUM ? { ...l, quantite: 1, prix_unitaire: minimum.ajustement, montant: minimum.ajustement } : l))
                      : lignes.filter((l) => l.code !== CODE_MINIMUM),
                  )
                }
              >
                {minimum.ajustement > 0 ? `Mettre l'ajustement à ${argent(minimum.ajustement)}` : "Retirer l'ajustement"}
              </button>
            )
          )}
        </div>
      )}
      {modifiable && calcul.manquants.length > 0 && (
        <p className={ui.erreur}>Prix à définir dans le catalogue : {calcul.manquants.join(', ')} (comptés à 0 $).</p>
      )}
      {codesProvisoires.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">{modifiable ? 'Prix provisoires' : 'Fait avec des prix provisoires'}</span> :{' '}
          {codesProvisoires
            .map((c) => `${parCode.get(c)?.nom ?? c} (${provisoires[c] === exercicePrix ? 'à valider' : `prix ${libelleExercice(provisoires[c])}`})`)
            .join(', ')}
          . Les prix de {libelleExercice(exercicePrix)} ne sont pas encore validés dans la liste de prix
          {modifiable ? ' : dès qu’ils le sont, « Recalculer » les reprend.' : '.'} Sur le PDF et la page du client, ces lignes portent la mention « Prix provisoire ».
        </p>
      )}

      {/* w-0 min-w-full : le tableau défile dans sa carte au lieu d'élargir la fiche (téléphone). */}
      <div className="w-0 min-w-full overflow-x-auto">
        <table className="w-full min-w-[34rem] table-fixed text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Description</th>
              <th className="w-20 py-1.5 pr-2 text-right font-medium">Qté</th>
              <th className="w-32 py-1.5 pr-2 text-right font-medium">Prix unit.</th>
              <th className="w-28 py-1.5 text-right font-medium">Montant</th>
              {modifiable && <th className="w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {avecMontants.map((l, i) => (
              <tr key={l.id} className="align-top">
                <td className="py-1.5 pr-2">
                  {modifiable ? (
                    <>
                      <input className={`${champPetit} w-full`} value={l.description} onChange={(e) => changerLigne(l.id, { description: e.target.value })} />
                      <input
                        className="mt-1 w-full rounded border border-transparent px-2 py-0.5 text-xs italic text-pierre-600 placeholder:text-pierre-300 hover:border-pierre-200 focus:border-foret-500 focus:outline-none"
                        placeholder="Précision (en italique sous la ligne)…"
                        value={l.note ?? ''}
                        onChange={(e) => changerLigne(l.id, { note: e.target.value || null })}
                      />
                    </>
                  ) : (
                    <>
                      <div>{l.description}</div>
                      {l.note && <div className="text-xs italic text-pierre-600">{l.note}</div>}
                    </>
                  )}
                  {modifiable && l.auto && <span className="text-[11px] text-foret-700">calculé</span>}
                  {ligneProvisoire(l) && <span className="ml-1.5 text-[11px] text-amber-700">prix provisoire</span>}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {modifiable && l.pourcentage === null ? (
                    <input type="number" step="any" className={`${champPetit} w-full text-right`} value={l.quantite} onChange={(e) => changerLigne(l.id, { quantite: Number(e.target.value) })} />
                  ) : l.pourcentage === null ? (
                    l.quantite
                  ) : (
                    ''
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {l.pourcentage !== null ? (
                    modifiable ? (
                      <span className="inline-flex items-center gap-1">
                        <input type="number" step="any" className={`${champPetit} w-20 text-right`} value={l.pourcentage} onChange={(e) => changerLigne(l.id, { pourcentage: Number(e.target.value) })} />%
                      </span>
                    ) : (
                      `${l.pourcentage} %`
                    )
                  ) : modifiable ? (
                    <input type="number" step="any" className={`${champPetit} w-full text-right`} value={l.prix_unitaire} onChange={(e) => changerLigne(l.id, { prix_unitaire: Number(e.target.value) })} />
                  ) : (
                    argent(l.prix_unitaire)
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{argent(l.montant)}</td>
                {modifiable && (
                  <td className="whitespace-nowrap py-1.5 pl-1 text-right text-pierre-400">
                    <button title="Monter" disabled={i === 0} className="px-0.5 hover:text-pierre-800 disabled:opacity-30" onClick={() => maj(lignes.map((x, j) => (j === i - 1 ? lignes[i] : j === i ? lignes[i - 1] : x)))}>
                      ↑
                    </button>
                    <button title="Descendre" disabled={i === lignes.length - 1} className="px-0.5 hover:text-pierre-800 disabled:opacity-30" onClick={() => maj(lignes.map((x, j) => (j === i + 1 ? lignes[i] : j === i ? lignes[i + 1] : x)))}>
                      ↓
                    </button>
                    <button title="Retirer" className="px-0.5 hover:text-red-700" onClick={() => maj(lignes.filter((x) => x.id !== l.id))}>
                      <IconeCorbeille className="inline h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modifiable && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Ajouter un extra"
            className={`${champPetit} w-full min-w-0 sm:w-80`}
            value=""
            onChange={(e) => {
              ajouterExtra(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="">+ Ajouter un extra du catalogue…</option>
            {Object.entries(CATEGORIES).map(([cat, nomCat]) => {
              const siens = extras.filter((p) => p.categorie === cat)
              if (!siens.length) return null
              return (
                <optgroup key={cat} label={nomCat}>
                  {siens.map((p) => {
                    const prix = prixDe(p.code, calcul.exercice)
                    return (
                      <option key={p.id} value={p.code}>
                        {p.nom} — {prix === null ? 'prix à définir' : `${argent(prix)} ${UNITES[p.unite]}`}
                        {p.note_minimum ? ` (${p.note_minimum})` : ''}
                      </option>
                    )
                  })}
                </optgroup>
              )
            })}
          </select>
          <button
            className={ui.boutonSecondaire}
            onClick={() => maj([...lignes, { id: crypto.randomUUID(), ordre: 0, produit_id: null, code: null, description: 'Nouvelle ligne', note: null, quantite: 1, prix_unitaire: 0, pourcentage: null, montant: 0, auto: false }])}
          >
            + Ligne libre
          </button>
          <button
            className={ui.boutonSecondaire}
            onClick={() => maj([...lignes, { id: crypto.randomUUID(), ordre: 0, produit_id: null, code: null, description: 'Rabais', note: null, quantite: 1, prix_unitaire: 0, pourcentage: -10, montant: 0, auto: false }])}
          >
            + Rabais en %
          </button>
          <button className={ui.boutonSecondaire} onClick={recalculer} title="Refait les lignes calculées ; garde les extras et les lignes saisies à la main">
            Recalculer
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-pierre-200 pt-3">
        <div className="flex flex-wrap gap-2">
          {modifiable && (
            <>
              <button className={ui.bouton} disabled={!sale || enregistrer.isPending} onClick={() => sauver()}>
                {enregistrer.isPending ? 'Enregistrement…' : sale ? 'Enregistrer' : 'Enregistré'}
              </button>
              <button
                className={ui.boutonSecondaire}
                disabled={preparation || enregistrer.isPending || avecMontants.length === 0 || !!refusEnvoi || modeEnvoi.isLoading}
                title={refusEnvoi ?? "Courriel au client avec le PDF : l'estimé devient « envoyé » quand le courriel part"}
                onClick={ouvrirEnvoi}
              >
                {preparation ? 'Préparation…' : "Envoyer l'estimé…"}
              </button>
            </>
          )}
          <button
            className={ui.boutonSecondaire}
            disabled={avecMontants.length === 0}
            onClick={() =>
              pdfDeLEstime(
                sources(r),
                modifiable ? { ...estime, ...t, exercice_prix: calcul.exercice, prix_provisoires: provisoires } : estime,
                modifiable ? avecMontants : undefined,
              )
                .then(ouvrirPdf)
                .catch((e) => setPdf(messageErreur(e)))
            }
          >
            Aperçu PDF
          </button>
          {ecriture && estime.statut === 'envoye' && (
            <>
              <button className={ui.bouton} onClick={() => setAcceptation(true)}>
                Accepté par le client…
              </button>
              <button className={ui.boutonSecondaire} onClick={() => action('refuser')}>
                Refusé
              </button>
            </>
          )}
          {ecriture && estime.statut !== 'brouillon' && (
            <button className={ui.boutonSecondaire} onClick={() => action('nouvelle_version')}>
              Nouvelle version
            </button>
          )}
        </div>
        <dl className="grid min-w-56 grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-sm tabular-nums">
          <dt className="text-pierre-500">Sous-total</dt>
          <dd className="text-right">{argent(modifiable ? t.sous_total : estime.sous_total)}</dd>
          <dt className="text-pierre-500">TPS (5 %)</dt>
          <dd className="text-right">{argent(modifiable ? t.tps : estime.tps)}</dd>
          <dt className="text-pierre-500">TVQ (9,975 %)</dt>
          <dd className="text-right">{argent(modifiable ? t.tvq : estime.tvq)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-semibold">{argent(modifiable ? t.total : estime.total)}</dd>
        </dl>
      </div>
      {modifiable && sale && <p className="text-xs text-amber-700">Modifications non enregistrées.</p>}
      {modifiable && refusEnvoi && <p className="text-xs text-amber-700">Envoi de l'estimé impossible : {refusEnvoi}</p>}
      {pdf && <p className={ui.erreur}>{pdf}</p>}

      {envoi && (
        <FenetreCourriel
          titre={`Envoyer l'estimé v${estime.version}`}
          charger={() => brouillonCourriel({ reservation: r.id, genre: 'estime', ref: estime.id })}
          piece={{ nom: envoi.nom, taille: envoi.octets.length, ouvrir: () => ouvrirPdf(envoi.octets) }}
          avant={
            <>
              Quand le courriel sera parti, l'estimé v{estime.version} deviendra « envoyé » : figé, visible sur la page du client (pour l'accepter en ligne), son PDF
              gardé dans les documents. Si l'envoi échoue, il reste un brouillon.
            </>
          }
          envoyer={(v) => expedier.mutateAsync({ reservation: r.id, genre: 'estime', ref: estime.id, ...v, piece: envoi })}
          fermer={() => setEnvoi(null)}
        />
      )}
      {acceptation && <FenetreAcceptation estime={estime} fermer={() => setAcceptation(false)} />}
    </div>
  )
}

/**
 * « Accepté par le client » : la preuve écrite est obligatoire (règle de
 * l'équipe, que l'app exige) — date du courriel du client et son texte
 * collé, gardés sur l'estimé, au journal et dans les échanges du CRM.
 */
function FenetreAcceptation({ estime, fermer }: { estime: TEstime; fermer: () => void }) {
  const { auj } = useDonnees()
  const accepter = useAccepterEstime()
  const [date, setDate] = useState(auj)
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const complet = !!date && texte.trim().length >= 10
  const confirmerAcceptation = async () => {
    setErreur(null)
    if (!date) return setErreur('La date du courriel du client est obligatoire.')
    if (date > auj) return setErreur('La date du courriel ne peut pas être dans le futur.')
    if (texte.trim().length < 10) return setErreur("Collez le texte du courriel où le client accepte l'estimé.")
    try {
      await accepter.mutateAsync({ estime, date, texte })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }
  return (
    <Dialogue titre={`Estimé v${estime.version} accepté par le client`} fermer={() => !accepter.isPending && fermer()}>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void confirmerAcceptation()
        }}
      >
        <p className="text-pierre-600">
          Une acceptation se prouve par écrit : collez le courriel où le client accepte l'estimé. Il est gardé avec l'estimé, au journal de la réservation et dans les
          échanges du CRM, à votre nom. La relance « préparer le contrat » est créée pour le responsable.
        </p>
        <label className="block">
          <span className={ui.etiquette}>Date du courriel du client</span>
          <input type="date" className={`${ui.champ} text-base sm:w-48 sm:text-sm`} value={date} max={auj} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Texte du courriel du client</span>
          <textarea
            className={`${ui.champ} min-h-48 font-sans text-base sm:text-sm`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Collez ici le courriel du client (de qui, quand, ce qu'il écrit)…"
            required
          />
        </label>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={ui.boutonSecondaire} disabled={accepter.isPending} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={!complet || accepter.isPending}>
            {accepter.isPending ? 'Enregistrement…' : "Confirmer l'acceptation"}
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
