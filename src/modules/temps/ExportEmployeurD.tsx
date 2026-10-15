import { useMemo, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { menu } from './outils'
import { useEmployesFeuille, useEntreprises, useFeuillesEmployes, useFeuillesPropres, useHeuresEmployes } from './donneesEmployes'
import {
  useEnregistrerMatricule,
  useEnregistrerNumeroCompagnie,
  useEnregistrerReglagesEmployeurD,
  useReglagesEmployeurD,
  type ChangementReglages,
} from './donneesEmployeurD'
import {
  cellulesEmployeurD,
  largeurs,
  NOM_FEUILLE,
  nomExport,
  nomFichier,
  preparerExport,
  TYPES_EXPORTES,
  type DatePeriode,
  type ResultatExport,
} from './employeurD'
import { datePaie, dateCourte, depuisIso, finPeriode, formatHeures, JOURS_COURTS, libellePeriode, numeroPeriodePaie, versIso } from './periodes'

const LIBELLES_ETAT = { ouverte: 'en cours', soumise: 'soumise', approuvee: 'approuvée' } as const

/** « jeu. 22 oct. 2026 » */
const jourLong = (iso: string) => `${JOURS_COURTS[depuisIso(iso).getDay()]} ${dateCourte(iso)}`

/**
 * Export des heures de la période vers Employeur D (gabarit « Saisie
 * simple ») : une ligne par employé et compagnie, une colonne par code de
 * gain. Ce qui manque (numéro de compagnie, matricule) se règle ici et
 * bloque le téléchargement ; les heures sans code et les feuilles pas
 * approuvées sont signalées. Réglages : codes de gains, date de la colonne
 * Période, numéros des compagnies.
 */
export function ExportEmployeurD({ debut, compagnieDepart, fermer }: { debut: string; compagnieDepart: string; fermer: () => void }) {
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const heures = useHeuresEmployes(debut)
  const feuilles = useFeuillesEmployes(debut)
  const propres = useFeuillesPropres()
  const reglages = useReglagesEmployeurD()
  const [compagnie, setCompagnie] = useState(compagnieDepart)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const datePeriode = reglages.data?.periode === 'fin_periode' ? finPeriode(debut) : datePaie(debut)

  const resultat = useMemo(() => {
    if (!employes.data || !entreprises.data || !heures.data || !feuilles.data || !propres.data || !reglages.data) return null
    return preparerExport({
      employes: employes.data,
      compagnies: entreprises.data,
      heures: heures.data,
      reglages: reglages.data,
      compagnie: compagnie || null,
      propres: propres.data.keys(),
      statuts: feuilles.data,
    })
  }, [employes.data, entreprises.data, heures.data, feuilles.data, propres.data, reglages.data, compagnie])

  // Compagnies qui ont des heures payées dans la période (choix du haut).
  const compagniesAvecHeures = (entreprises.data ?? []).filter((x) => heures.data?.some((h) => h.entreprise_id === x.id && h.heures))
  const nomCompagnie = entreprises.data?.find((x) => x.id === compagnie)?.nom ?? null

  async function telecharger(r: ResultatExport) {
    setErreur(null)
    setEnCours(true)
    try {
      const XLSX = await import('xlsx')
      const cellules = cellulesEmployeurD(r, datePeriode)
      const ws: import('xlsx').WorkSheet = {}
      cellules.forEach((rang, i) => rang.forEach((c, j) => c && (ws[XLSX.utils.encode_cell({ r: i, c: j })] = { ...c })))
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cellules.length - 1, c: cellules[0].length - 1 } })
      ws['!cols'] = largeurs(r.codes).map((wch) => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, NOM_FEUILLE)
      const { numero, annee } = numeroPeriodePaie(debut)
      XLSX.writeFile(wb, nomFichier({ numero, annee, debut, fin: finPeriode(debut), compagnie: nomCompagnie }), { bookType: 'biff8' })
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const chargeErreur = employes.error ?? entreprises.error ?? heures.error ?? feuilles.error ?? propres.error ?? reglages.error
  const r = resultat
  const total = (code: number) => (r?.lignes ?? []).reduce((s, l) => s + (l.quantites[code] ?? 0), 0)

  return (
    <Dialogue titre={`Export Employeur D · ${libellePeriode(debut)}`} fermer={fermer} large>
      {chargeErreur ? (
        <p className={ui.erreur}>{messageErreur(chargeErreur)}</p>
      ) : !r || !reglages.data || !entreprises.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-pierre-700">
            <select aria-label="Compagnie" className={menu} value={compagnie} onChange={(e) => setCompagnie(e.target.value)}>
              <option value="">Toutes les compagnies</option>
              {compagniesAvecHeures.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
            <span>
              Gabarit « Saisie simple » · Période = {reglages.data.periode === 'fin_periode' ? 'fin de la période' : 'date de paie'},{' '}
              <b>{jourLong(datePeriode)}</b>
            </span>
          </div>

          {(r.compagniesSansNumero.length > 0 || r.employesSansMatricule.length > 0) && (
            <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-red-900">À régler avant de télécharger</h3>
              {r.compagniesSansNumero.length > 0 && (
                <ListeACompleter
                  titre="Numéro de compagnie Employeur D manquant"
                  aide="8 lettres ou chiffres au plus."
                  elements={r.compagniesSansNumero.map((x) => ({ id: x.id, nom: x.nom }))}
                  genre="compagnie"
                />
              )}
              {r.employesSansMatricule.length > 0 && (
                <ListeACompleter
                  titre="Matricule Employeur D manquant"
                  aide="9 chiffres au plus ; aussi dans Référentiel › Employés."
                  elements={r.employesSansMatricule.map((e) => ({ id: e.id, nom: nomExport(e) }))}
                  genre="employe"
                />
              )}
            </section>
          )}

          {(r.sansCode.length > 0 || r.nonApprouvees.length > 0) && (
            <section className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <h3 className="font-semibold">À vérifier</h3>
              {r.sansCode.map((s) => (
                <p key={s.type}>
                  {formatHeures(s.heures)} h de « {s.libelle} » ({s.employes} employé{s.employes > 1 ? 's' : ''}) ne sont pas dans le fichier :
                  aucun code de gain (réglages plus bas).
                </p>
              ))}
              {r.nonApprouvees.length > 0 && (
                <p>
                  Feuille pas encore approuvée :{' '}
                  {r.nonApprouvees.map((l, i) => (
                    <span key={l.cle}>
                      {i > 0 && ', '}
                      {l.nom} ({l.compagnie.nom}, {LIBELLES_ETAT[l.statut!]})
                    </span>
                  ))}
                  . Ses heures sont dans le fichier telles quelles.
                </p>
              )}
            </section>
          )}

          {r.lignes.length === 0 ? (
            <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
              {r.codes.length ? 'Aucune heure à exporter pour cette période.' : 'Aucun code de gain réglé : rien à exporter (réglages plus bas).'}
            </p>
          ) : (
            <div className={`${ui.carte} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead className="bg-pierre-50 text-left text-xs font-medium text-pierre-600">
                  <tr>
                    <th className="px-3 py-2">Compagnie</th>
                    <th className="px-3 py-2">Matricule</th>
                    <th className="px-3 py-2">Nom, prénom</th>
                    <th className="px-3 py-2">Période</th>
                    {r.codes.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 text-right">
                        G{c} (h)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-pierre-100">
                  {r.lignes.map((l) => (
                    <tr key={l.cle}>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {l.compagnie.numero_employeur_d ?? <span className="text-red-700">—</span>}{' '}
                        <span className="text-xs text-pierre-500">{l.compagnie.nom}</span>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{l.employe.matricule_employeur_d ?? <span className="text-red-700">—</span>}</td>
                      <td className="px-3 py-1.5">{l.nom}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{datePeriode.replaceAll('-', '/')}</td>
                      {r.codes.map((c) => (
                        <td key={c} className="px-3 py-1.5 text-right tabular-nums">
                          {l.quantites[c] ? formatHeures(l.quantites[c]) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-pierre-50 font-semibold">
                    <td className="px-3 py-1.5" colSpan={4}>
                      Total · {r.lignes.length} ligne{r.lignes.length > 1 ? 's' : ''}
                    </td>
                    {r.codes.map((c) => (
                      <td key={c} className="px-3 py-1.5 text-right tabular-nums">
                        {formatHeures(total(c))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <Reglages debut={debut} />

          {erreur && <p className={ui.erreur}>{erreur}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!r.pret && r.lignes.length > 0 && <span className="text-sm text-red-700">Complétez ce qui manque pour télécharger.</span>}
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Fermer
            </button>
            <button type="button" className={ui.bouton} disabled={!r.pret || enCours} onClick={() => telecharger(r)}>
              <IconeTableur className="size-4" />
              Télécharger le fichier (.xls)
            </button>
          </div>
        </div>
      )}
    </Dialogue>
  )
}

/** Numéros manquants, saisis sur place (enregistrés en quittant la case ou par Entrée). */
function ListeACompleter({
  titre,
  aide,
  elements,
  genre,
}: {
  titre: string
  aide: string
  elements: { id: string; nom: string }[]
  genre: 'compagnie' | 'employe'
}) {
  return (
    <div>
      <p className="text-sm font-medium text-red-900">{titre}</p>
      <p className="mb-1.5 text-xs text-red-800">{aide}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {elements.map((x) => (
          <li key={x.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-pierre-800" title={x.nom}>
              {x.nom}
            </span>
            {genre === 'compagnie' ? <NumeroCompagnie id={x.id} valeur={null} libelle={`Numéro Employeur D de ${x.nom}`} /> : <Matricule id={x.id} libelle={`Matricule de ${x.nom}`} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Matricule({ id, libelle }: { id: string; libelle: string }) {
  const enregistrer = useEnregistrerMatricule()
  return (
    <ChampEnregistre
      libelle={libelle}
      valeur={null}
      placeholder="Matricule"
      inputMode="numeric"
      verifier={(t) => (/^\d{1,9}$/.test(t.replace(/\s/g, '')) ? null : '1 à 9 chiffres.')}
      enregistrer={(t) => enregistrer.mutateAsync({ employeId: id, matricule: t })}
    />
  )
}

function NumeroCompagnie({ id, valeur, libelle }: { id: string; valeur: string | null; libelle: string }) {
  const enregistrer = useEnregistrerNumeroCompagnie()
  return (
    <ChampEnregistre
      libelle={libelle}
      valeur={valeur}
      placeholder="Numéro"
      verifier={(t) => (/^[A-Za-z0-9]{1,8}$/.test(t.replace(/\s/g, '')) ? null : '1 à 8 lettres ou chiffres.')}
      enregistrer={(t) => enregistrer.mutateAsync({ entrepriseId: id, numero: t })}
      effacable
    />
  )
}

/**
 * Case enregistrée en la quittant (ou par Entrée) ; Échap remet la valeur.
 * `effacable` : vide = effacer (sinon une case vide n'enregistre rien).
 */
function ChampEnregistre({
  libelle,
  valeur,
  placeholder,
  inputMode,
  verifier,
  enregistrer,
  effacable,
  largeur = 'w-28',
}: {
  libelle: string
  valeur: string | null
  placeholder?: string
  inputMode?: 'numeric' | 'text'
  verifier: (texte: string) => string | null
  enregistrer: (texte: string | null) => Promise<unknown>
  effacable?: boolean
  largeur?: string
}) {
  const [texte, setTexte] = useState(valeur ?? '')
  const [precedente, setPrecedente] = useState(valeur)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  // Valeur venue de la base (enregistrée ici ou ailleurs).
  if (precedente !== valeur) {
    setPrecedente(valeur)
    setTexte(valeur ?? '')
  }

  async function quitter() {
    const t = texte.trim()
    if (t === (valeur ?? '')) return setErreur(null)
    if (!t && !effacable) return setErreur(null)
    const probleme = t ? verifier(t) : null
    if (probleme) return setErreur(probleme)
    setErreur(null)
    setEnCours(true)
    try {
      await enregistrer(t || null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <span className="flex flex-col items-end">
      <input
        aria-label={libelle}
        aria-invalid={!!erreur}
        className={`${largeur} rounded-md border bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 ${
          erreur ? 'border-red-400 focus:ring-red-300' : 'border-pierre-300 focus:border-foret-600 focus:ring-foret-600/20'
        }`}
        placeholder={placeholder}
        inputMode={inputMode}
        value={texte}
        disabled={enCours}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={quitter}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {erreur && <span className="mt-0.5 max-w-56 text-right text-xs text-red-700">{erreur}</span>}
    </span>
  )
}

function CodeGain({ reglage, libelle, valeur }: { reglage: keyof ChangementReglages & `code_${string}`; libelle: string; valeur: number | null }) {
  const enregistrer = useEnregistrerReglagesEmployeurD()
  return (
    <ChampEnregistre
      libelle={`Code de gain : ${libelle}`}
      valeur={valeur == null ? null : String(valeur)}
      placeholder="—"
      inputMode="numeric"
      largeur="w-16"
      verifier={(x) => (/^\d{1,3}$/.test(x) && Number(x) >= 1 ? null : '1 à 999.')}
      enregistrer={(x) => enregistrer.mutateAsync({ [reglage]: x == null ? null : Number(x) })}
      effacable
    />
  )
}

/** Réglages de l'export : codes de gains, date de la colonne Période, numéros des compagnies. */
function Reglages({ debut }: { debut: string }) {
  const reglages = useReglagesEmployeurD()
  const entreprises = useEntreprises()
  const enregistrer = useEnregistrerReglagesEmployeurD()
  const r = reglages.data
  if (!r) return null
  const compagnies = (entreprises.data ?? []).filter((x) => x.actif || x.numero_employeur_d)
  const sansCode = r.code_regulieres == null && r.code_maladie == null && r.code_banque == null

  return (
    <details className="rounded-lg border border-pierre-200 px-4 py-3" open={sansCode || undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-pierre-800">Réglages Employeur D</summary>
      <div className="mt-3 grid gap-5 md:grid-cols-3">
        <div>
          <p className={ui.etiquette}>Codes de gains</p>
          <p className="mb-2 text-xs text-pierre-500">Numéro du gain dans Employeur D (1 à 999), à confirmer avec Charlotte. Vide = pas dans le fichier.</p>
          <ul className="space-y-1.5">
            {TYPES_EXPORTES.map((t) => (
              <li key={t.type} className="flex items-center justify-between gap-2 text-sm">
                <span>{t.libelle}</span>
                <span className="flex items-center gap-1">
                  <span className="text-pierre-500">G</span>
                  <CodeGain reglage={t.reglage} libelle={t.libelle} valeur={r[t.reglage]} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-pierre-500">Le woofing n’est jamais payé : il n’est pas exporté.</p>
        </div>
        <div>
          <p className={ui.etiquette}>Colonne « Période »</p>
          {(
            [
              ['date_paie', 'Date de paie', datePaie(debut)],
              ['fin_periode', 'Fin de la période', finPeriode(debut)],
            ] as [DatePeriode, string, string][]
          ).map(([valeur, libelle, jour]) => (
            <label key={valeur} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="radio" name="periode-employeur-d" checked={r.periode === valeur} onChange={() => enregistrer.mutate({ periode: valeur })} />
              {libelle} <span className="text-pierre-500">({jourLong(jour)})</span>
            </label>
          ))}
          <p className="mt-1 text-xs text-pierre-500">À confirmer avec Charlotte au premier import.</p>
        </div>
        <div>
          <p className={ui.etiquette}>Numéros des compagnies</p>
          <ul className="space-y-1.5">
            {compagnies.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" title={x.nom}>
                  {x.nom}
                </span>
                <NumeroCompagnie id={x.id} valeur={x.numero_employeur_d} libelle={`Numéro Employeur D de ${x.nom}`} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {enregistrer.error && <p className={`${ui.erreur} mt-3`}>{messageErreur(enregistrer.error)}</p>}
      {r.modifie_par && r.modifie_le && (
        <p className="mt-3 text-xs text-pierre-500">
          Réglages modifiés par {r.modifie_par}, le {dateCourte(versIso(new Date(r.modifie_le)))}.
        </p>
      )}
    </details>
  )
}
