import { useMemo, useState, type ReactNode } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { menu } from './outils'
import { heuresTirees } from './banques'
import { banqueDe, nomDe, useBanquesTous, useFeuillesPlage, useHeuresPlage, useMembres, type Titulaire } from './donnees'
import { useEmployesFeuille, useEntreprises, useFeuillesEmployes, useFeuillesPropres, useHeuresEmployes, type Entreprise } from './donneesEmployes'
import {
  useEnregistrerMatricule,
  useEnregistrerNumeroCompagnie,
  useEnregistrerPaieDirection,
  useEnregistrerReglagesEmployeurD,
  usePaieDirection,
  useReglagesEmployeurD,
  type ChangementReglages,
} from './donneesEmployeurD'
import {
  cellulesEmployeurD,
  largeurs,
  NOM_FEUILLE,
  nomCompagnie,
  nomFichier,
  preparerExport,
  TYPES_EXPORTES,
  type DatePeriode,
  type GenreCode,
  type Personne,
  type ReglagesEmployeurD,
  type ResultatExport,
} from './employeurD'
import { datePaie, dateCourte, depuisIso, finPeriode, formatHeures, JOURS_COURTS, libellePeriode, numeroPeriodePaie, versIso } from './periodes'

const LIBELLES_ETAT = { ouverte: 'en cours', soumise: 'soumise', approuvee: 'approuvée' } as const
const LIBELLES_GENRE: Record<GenreCode, string> = { gain: 'code de gain', utilisation: "code d'utilisation" }

/** « jeu. 22 oct. 2026 » */
const jourLong = (iso: string) => `${JOURS_COURTS[depuisIso(iso).getDay()]} ${dateCourte(iso)}`

/**
 * Export des heures de la période vers Employeur D (gabarit « Saisie
 * simple ») : une ligne par employé et compagnie, plus (admins seulement,
 * qui préparent la paie) une ligne par personne de la direction à sa
 * compagnie de paie ; une colonne par code de gain. Ce qui manque (numéro de
 * compagnie, matricule, compagnie de paie, matricule en double) se règle ici
 * et bloque le téléchargement ; les heures sans code et les feuilles pas
 * approuvées sont signalées. Réglages : codes de gains et d'utilisation,
 * date de la colonne Période, numéros des compagnies, paie de la direction
 * (admins). Compagnies désignées par leur acronyme partout dans le module.
 */
export function ExportEmployeurD({ debut, compagnieDepart, fermer }: { debut: string; compagnieDepart: string; fermer: () => void }) {
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const heures = useHeuresEmployes(debut)
  const feuilles = useFeuillesEmployes(debut)
  const propres = useFeuillesPropres()
  const reglages = useReglagesEmployeurD()
  // La direction : admins seulement (une personne de la direction ne lit que sa feuille).
  const { estAdmin } = useAuth()
  const membres = useMembres(estAdmin)
  const heuresDirection = useHeuresPlage(debut, finPeriode(debut), estAdmin)
  const feuillesDirection = useFeuillesPlage(debut, debut, estAdmin)
  const paieDirection = usePaieDirection(estAdmin)
  const banques = useBanquesTous(finPeriode(debut))
  const [compagnie, setCompagnie] = useState(compagnieDepart)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const datePeriode = reglages.data?.periode === 'fin_periode' ? finPeriode(debut) : datePaie(debut)

  const resultat = useMemo(() => {
    if (!employes.data || !entreprises.data || !heures.data || !feuilles.data || !propres.data || !reglages.data || !banques.data) return null
    if (estAdmin && (!membres.data || !heuresDirection.data || !feuillesDirection.data || !paieDirection.data)) return null
    // Heures tirées de la banque dans la période (calculées : banques.ts), exportées comme des heures « banque » :
    // un employé, à la compagnie où il a fait le plus d'heures régulières dans la période (sinon sa première).
    const fin = finPeriode(debut)
    const tirees = (t: Titulaire) => heuresTirees(banqueDe(banques.data, t, fin).mouvements, debut, fin)
    const heuresEmployes: { employe_id: string; entreprise_id: string; type: string; heures: number }[] = [...heures.data]
    for (const e of employes.data) {
      const n = tirees({ employeId: e.id })
      if (n <= 0) continue
      const parCompagnie = new Map<string, number>()
      for (const h of heures.data)
        if (h.employe_id === e.id && h.type === 'regulieres') parCompagnie.set(h.entreprise_id, (parCompagnie.get(h.entreprise_id) ?? 0) + h.heures)
      const principale = [...parCompagnie].sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.entreprise_ids[0]
      if (principale) heuresEmployes.push({ employe_id: e.id, entreprise_id: principale, type: 'banque', heures: n })
    }
    const heuresDeLaDirection = estAdmin
      ? [
          ...heuresDirection.data!,
          ...membres.data!.map((m) => ({ user_id: m.id, type: 'banque', heures: tirees({ userId: m.id }) })).filter((h) => h.heures > 0),
        ]
      : []
    return preparerExport({
      employes: employes.data,
      compagnies: entreprises.data,
      heures: heuresEmployes,
      reglages: reglages.data,
      compagnie: compagnie || null,
      propres: propres.data.keys(),
      statuts: feuilles.data,
      direction: estAdmin
        ? {
            membres: membres.data!.map((m) => ({ id: m.id, nom: m.nom, courriel: m.courriel, admin: m.role === 'admin' })),
            paie: paieDirection.data!,
            heures: heuresDeLaDirection,
            statuts: feuillesDirection.data!.map((f) => ({ user_id: f.user_id, statut: f.statut })),
          }
        : undefined,
    })
  }, [
    employes.data,
    entreprises.data,
    heures.data,
    feuilles.data,
    propres.data,
    reglages.data,
    compagnie,
    estAdmin,
    membres.data,
    heuresDirection.data,
    feuillesDirection.data,
    paieDirection.data,
    banques.data,
    debut,
  ])

  // Compagnies qui ont des heures payées dans la période (choix du haut), direction comprise.
  const compagniesDirection = new Set(
    (heuresDirection.data ?? []).map((h) => paieDirection.data?.find((x) => x.user_id === h.user_id)?.entreprise_id).filter(Boolean),
  )
  const compagniesAvecHeures = (entreprises.data ?? []).filter(
    (x) => heures.data?.some((h) => h.entreprise_id === x.id && h.heures) || (estAdmin && compagniesDirection.has(x.id)),
  )
  const compagnieChoisie = entreprises.data?.find((x) => x.id === compagnie)

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
      XLSX.writeFile(wb, nomFichier({ numero, annee, debut, fin: finPeriode(debut), compagnie: compagnieChoisie ? nomCompagnie(compagnieChoisie) : null }), { bookType: 'biff8' })
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const chargeErreur =
    employes.error ??
    entreprises.error ??
    heures.error ??
    feuilles.error ??
    propres.error ??
    reglages.error ??
    banques.error ??
    (estAdmin ? (membres.error ?? heuresDirection.error ?? feuillesDirection.error ?? paieDirection.error) : null)
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
                  {nomCompagnie(x)}
                </option>
              ))}
            </select>
            <span>
              Gabarit « Saisie simple » · Période = {reglages.data.periode === 'fin_periode' ? 'fin de la période' : 'date de paie'},{' '}
              <b>{jourLong(datePeriode)}</b>
            </span>
          </div>
          {!estAdmin && (
            <p className="text-xs text-pierre-500">
              Sans les heures de la direction : seuls les admins, qui préparent la paie, les voient et les exportent.
            </p>
          )}

          {(r.compagniesSansNumero.length > 0 ||
            r.sansMatricule.length > 0 ||
            r.directionSansCompagnie.length > 0 ||
            r.matriculesEnDouble.length > 0) && (
            <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-red-900">À régler avant de télécharger</h3>
              {r.compagniesSansNumero.length > 0 && (
                <ListeACompleter
                  titre="Numéro de compagnie Employeur D manquant"
                  aide="8 lettres ou chiffres au plus."
                  elements={r.compagniesSansNumero.map((x) => ({ id: x.id, nom: nomCompagnie(x) }))}
                  genre="compagnie"
                />
              )}
              {r.directionSansCompagnie.length > 0 && (
                <ListeACompleter
                  titre="Compagnie de paie de la direction à choisir"
                  aide="La compagnie qui la paie dans Employeur D (ses heures n'ont pas de compagnie)."
                  elements={r.directionSansCompagnie}
                  genre="compagnie-direction"
                  compagnies={entreprises.data.filter((x) => x.actif)}
                />
              )}
              {r.sansMatricule.length > 0 && (
                <ListeACompleter
                  titre="Matricule Employeur D manquant"
                  aide="9 chiffres au plus ; un employé : aussi dans Référentiel › Employés."
                  elements={r.sansMatricule}
                  genre="matricule"
                />
              )}
              {r.matriculesEnDouble.map((d) => (
                <p key={d.matricule} className="text-sm text-red-900">
                  Le matricule <b>{d.matricule}</b> est celui de {d.noms.join(' et de ')} : corrigez-en un (Référentiel › Employés, ou paie
                  de la direction dans les réglages).
                </p>
              ))}
            </section>
          )}

          {(r.sansCode.length > 0 || r.nonApprouvees.length > 0) && (
            <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <h3 className="font-semibold">À vérifier</h3>
              {r.sansCode.map((s) => (
                <p key={s.type}>
                  {formatHeures(s.heures)} h de « {s.libelle} » ({s.personnes} personne{s.personnes > 1 ? 's' : ''}) ne sont pas dans le fichier :
                  aucun {LIBELLES_GENRE[s.genre]} (réglages plus bas).
                </p>
              ))}
              {r.nonApprouvees.length > 0 && (
                <div>
                  <p>
                    {r.nonApprouvees.length > 1 ? 'Feuilles pas encore approuvées' : 'Feuille pas encore approuvée'} (
                    {r.nonApprouvees.length > 1 ? 'leurs' : 'ses'} heures sont dans le fichier telles quelles) :
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {r.nonApprouvees.map((l) => (
                      <li key={l.cle}>
                        {l.nom} · {nomCompagnie(l.compagnie)} · <span className="font-medium">{LIBELLES_ETAT[l.statut!]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {r.lignes.length === 0 ? (
            <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
              {r.codes.length ? 'Aucune heure à exporter pour cette période.' : 'Aucun code réglé : rien à exporter (réglages plus bas).'}
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
                        <span className="text-xs text-pierre-500">{nomCompagnie(l.compagnie)}</span>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{l.matricule ?? <span className="text-red-700">—</span>}</td>
                      <td className="px-3 py-1.5">
                        {l.nom}
                        {l.genre === 'direction' && <span className="ml-1.5 text-xs text-pierre-500">direction</span>}
                      </td>
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

          <Reglages debut={debut} estAdmin={estAdmin} />

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

/** Ce qui manque, saisi sur place (case enregistrée en la quittant ou par Entrée ; menu dès le choix). */
function ListeACompleter({
  titre,
  aide,
  elements,
  genre,
  compagnies = [],
}: {
  titre: string
  aide: string
  elements: (Pick<Personne, 'id' | 'nom'> & { genre?: Personne['genre'] })[]
  genre: 'compagnie' | 'matricule' | 'compagnie-direction'
  compagnies?: Entreprise[]
}) {
  return (
    <div>
      <p className="text-sm font-medium text-red-900">{titre}</p>
      <p className="mb-1.5 text-xs text-red-800">{aide}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {elements.map((x) => (
          <li key={`${x.genre ?? ''}${x.id}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-pierre-800" title={x.nom}>
              {x.nom}
            </span>
            {genre === 'compagnie' ? (
              <NumeroCompagnie id={x.id} valeur={null} libelle={`Numéro Employeur D de ${x.nom}`} />
            ) : genre === 'compagnie-direction' ? (
              <CompagnieDirection userId={x.id} valeur={null} compagnies={compagnies} libelle={`Compagnie de paie de ${x.nom}`} />
            ) : x.genre === 'direction' ? (
              <MatriculeDirection userId={x.id} valeur={null} libelle={`Matricule de ${x.nom}`} />
            ) : (
              <Matricule id={x.id} libelle={`Matricule de ${x.nom}`} />
            )}
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

/** Matricule d'un compte de la direction (temps.paie_direction, admins). */
function MatriculeDirection({ userId, valeur, libelle }: { userId: string; valeur: string | null; libelle: string }) {
  const enregistrer = useEnregistrerPaieDirection()
  return (
    <ChampEnregistre
      libelle={libelle}
      valeur={valeur}
      placeholder="Matricule"
      inputMode="numeric"
      verifier={(t) => (/^\d{1,9}$/.test(t.replace(/\s/g, '')) ? null : '1 à 9 chiffres.')}
      enregistrer={(t) => enregistrer.mutateAsync({ userId, matricule: t })}
      effacable={valeur != null}
    />
  )
}

/** Compagnie de paie d'un compte de la direction (enregistrée dès le choix). */
function CompagnieDirection({
  userId,
  valeur,
  compagnies,
  libelle,
}: {
  userId: string
  valeur: string | null
  compagnies: Entreprise[]
  libelle: string
}) {
  const enregistrer = useEnregistrerPaieDirection()
  return (
    <span className="flex flex-col items-end">
      <select
        aria-label={libelle}
        className={`${menu} w-40 py-1!`}
        value={valeur ?? ''}
        disabled={enregistrer.isPending}
        onChange={(e) => enregistrer.mutate({ userId, entrepriseId: e.target.value || null })}
      >
        <option value="">Compagnie…</option>
        {compagnies.map((x) => (
          <option key={x.id} value={x.id}>
            {nomCompagnie(x)}
          </option>
        ))}
      </select>
      {enregistrer.error && <span className="mt-0.5 max-w-56 text-right text-xs text-red-700">{messageErreur(enregistrer.error)}</span>}
    </span>
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

function CodeEmployeurD({
  reglage,
  libelle,
  genre,
  valeur,
}: {
  reglage: keyof ChangementReglages & `code_${string}`
  libelle: string
  genre: GenreCode
  valeur: number | null
}) {
  const enregistrer = useEnregistrerReglagesEmployeurD()
  return (
    <ChampEnregistre
      libelle={`${genre === 'gain' ? 'Code de gain' : "Code d'utilisation"} : ${libelle}`}
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

/** Liste encadrée des réglages, une rangée par élément. */
const liste = 'divide-y divide-pierre-100 rounded-lg border border-pierre-200 bg-white'
const rangee = 'flex items-center justify-between gap-3 px-3 py-2'

/** Un bloc des réglages : titre, explication, contenu. */
function BlocReglage({ titre, aide, children }: { titre: string; aide: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-pierre-900">{titre}</h4>
      <p className="mt-0.5 text-xs leading-relaxed text-pierre-500">{aide}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

/** Codes d'un genre (gain ou utilisation), un par type d'heures. */
function ListeCodes({ genre, reglages }: { genre: GenreCode; reglages: ReglagesEmployeurD }) {
  return (
    <ul className={liste}>
      {TYPES_EXPORTES.filter((t) => t.genre === genre).map((t) => (
        <li key={t.type} className={rangee}>
          <span className="min-w-0">
            <span className="block text-sm text-pierre-900">{t.libelle}</span>
            <span className="block text-xs text-pierre-500">{t.detail}</span>
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-sm text-pierre-500">G</span>
            <CodeEmployeurD reglage={t.reglage} libelle={t.libelle} genre={t.genre} valeur={reglages[t.reglage]} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Réglages de l'export : codes de gains et d'utilisation, date de la
 * colonne Période, numéros des compagnies, paie de la direction (admins).
 */
function Reglages({ debut, estAdmin }: { debut: string; estAdmin: boolean }) {
  const reglages = useReglagesEmployeurD()
  const entreprises = useEntreprises()
  const enregistrer = useEnregistrerReglagesEmployeurD()
  const r = reglages.data
  if (!r) return null
  const compagnies = (entreprises.data ?? []).filter((x) => x.actif || x.numero_employeur_d)
  const sansCode = TYPES_EXPORTES.every((t) => r[t.reglage] == null)

  return (
    <details className="overflow-hidden rounded-lg border border-pierre-200" open={sansCode || undefined}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-pierre-800">Réglages Employeur D</summary>
      <div className="space-y-6 border-t border-pierre-200 bg-pierre-50 px-4 py-5">
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          <div className="space-y-6">
            <BlocReglage
              titre="Codes de gains"
              aide="Numéro du gain dans Employeur D (1 à 999). Vide = pas dans le fichier. Le woofing n’est jamais payé : il n’est pas exporté."
            >
              <ListeCodes genre="gain" reglages={r} />
            </BlocReglage>
            <BlocReglage
              titre="Codes d’utilisation"
              aide="Heures prises dans une banque d’Employeur D, qui en tient les soldes. Les vacances n’ont pas de code de gain : Employeur D calcule lui-même la paie de vacances."
            >
              <ListeCodes genre="utilisation" reglages={r} />
            </BlocReglage>
          </div>
          <div className="space-y-6">
            <BlocReglage titre="Colonne « Période »" aide="Date inscrite sur chaque ligne du fichier. À confirmer au premier import.">
              <div className={liste}>
                {(
                  [
                    ['date_paie', 'Date de paie', datePaie(debut)],
                    ['fin_periode', 'Fin de la période', finPeriode(debut)],
                  ] as [DatePeriode, string, string][]
                ).map(([valeur, libelle, jour]) => (
                  <label key={valeur} className={`${rangee} cursor-pointer hover:bg-pierre-50`}>
                    <span className="flex items-center gap-2.5 text-sm text-pierre-900">
                      <input
                        type="radio"
                        name="periode-employeur-d"
                        checked={r.periode === valeur}
                        onChange={() => enregistrer.mutate({ periode: valeur })}
                      />
                      {libelle}
                    </span>
                    <span className="text-xs text-pierre-500">{jourLong(jour)}</span>
                  </label>
                ))}
              </div>
            </BlocReglage>
            <BlocReglage titre="Numéros des compagnies" aide="Numéro de la compagnie dans Employeur D (8 lettres ou chiffres au plus).">
              <ul className={liste}>
                {compagnies.map((x) => (
                  <li key={x.id} className={rangee}>
                    <PuceCompagnie compagnie={x} court />
                    <NumeroCompagnie id={x.id} valeur={x.numero_employeur_d} libelle={`Numéro Employeur D de ${nomCompagnie(x)}`} />
                  </li>
                ))}
              </ul>
            </BlocReglage>
          </div>
        </div>
        {estAdmin && <PaieDirection compagnies={compagnies.filter((x) => x.actif)} />}
        {enregistrer.error && <p className={ui.erreur}>{messageErreur(enregistrer.error)}</p>}
        {r.modifie_par && r.modifie_le && (
          <p className="text-xs text-pierre-500">
            Réglages modifiés par {r.modifie_par}, le {dateCourte(versIso(new Date(r.modifie_le)))}.
          </p>
        )}
      </div>
    </details>
  )
}

/**
 * Admins : compagnie de paie et matricule de chaque compte de la direction
 * (actifs, plus ceux qui ont déjà une ligne de paie ; pas les admins, qui ne
 * remplissent pas de feuille).
 */
function PaieDirection({ compagnies }: { compagnies: Entreprise[] }) {
  const membres = useMembres()
  const paie = usePaieDirection()
  if (!membres.data || !paie.data) return null
  const paieDe = new Map(paie.data.map((x) => [x.user_id, x]))
  const personnes = membres.data.filter((m) => (m.actif && m.role === 'direction') || paieDe.has(m.id))
  const colonnes = 'sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_7rem] sm:gap-x-4'
  return (
    <BlocReglage
      titre="Paie de la direction (admins)"
      aide="Les heures de la direction n’ont pas de compagnie : choisissez celle qui paie chaque personne dans Employeur D, et son matricule."
    >
      <div className={liste}>
        <div className={`hidden px-3 py-1.5 text-xs font-medium text-pierre-500 ${colonnes}`}>
          <span>Personne</span>
          <span>Compagnie de paie</span>
          <span>Matricule</span>
        </div>
        {personnes.map((m) => {
          const ligne = paieDe.get(m.id)
          return (
            <div key={m.id} className={`flex flex-wrap items-center justify-end gap-2 px-3 py-2 sm:items-start ${colonnes}`}>
              <span className="min-w-0 flex-1 truncate py-1 text-sm text-pierre-900" title={nomDe(m)}>
                {nomDe(m)}
                {m.role === 'admin' && <span className="ml-1.5 text-xs text-pierre-500">admin</span>}
              </span>
              <CompagnieDirection userId={m.id} valeur={ligne?.entreprise_id ?? null} compagnies={compagnies} libelle={`Compagnie de paie de ${nomDe(m)}`} />
              <MatriculeDirection userId={m.id} valeur={ligne?.matricule_employeur_d ?? null} libelle={`Matricule de ${nomDe(m)}`} />
            </div>
          )
        })}
      </div>
    </BlocReglage>
  )
}
