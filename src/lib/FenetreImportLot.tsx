import { useMemo, useState, type DragEvent } from 'react'
import { EXTENSIONS, lireFichier, telechargerGabarit } from './classeurLot'
import { Dialogue } from './Dialogue'
import { messageErreur } from './donnees'
import { IconeExporter, IconeImporter } from './icones'
import {
  aCreerPour,
  CREER,
  devinerColonnes,
  estACreer,
  largeur,
  lireLignes,
  lireTsv,
  MAX_LIGNES,
  normaliser,
  remplacerCrees,
  resoudre,
  separer,
  VIDE,
  type Choix,
  type Colonne,
  type Disposition,
  type Inconnu,
} from './importLot'
import { ui } from './ui'

// Fenêtre « Importer » commune (Mastertimeline, Travaux) : coller des lignes
// d'Excel ou de Sheets, ou choisir un fichier ; aperçu avant d'enregistrer
// (colonnes reconnues, valeurs communes, noms inconnus à associer) ; rien
// n'est créé avant « Importer ». Calculs purs dans importLot.ts.

export interface ConfigImport {
  colonnes: Colonne[]
  /** Nom du fichier du gabarit (« gabarit-travaux.xlsx »). */
  nomGabarit: string
  /** Titres déjà dans le module : « existe déjà » (avertissement seulement). */
  titresExistants: string[]
  /** Valeurs communes de départ (ex. le projet ouvert) : id d'une option ou texte. */
  defauts?: Record<string, string>
  /** Enregistre les lignes : valeurs par clé de colonne, ids des ajouts aux listes compris. */
  enregistrer: (lignes: Record<string, unknown>[]) => Promise<void>
}

type Etape = 'source' | 'apercu' | 'fini'

const lettre = (i: number) => String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1)
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function FenetreImportLot({ config, fermer }: { config: ConfigImport; fermer: () => void }) {
  const { colonnes } = config
  const [etape, setEtape] = useState<Etape>('source')
  const [texte, setTexte] = useState('')
  const [rangees, setRangees] = useState<string[][]>([])
  const [origine, setOrigine] = useState('')
  const [disposition, setDisposition] = useState<Disposition>({ entete: false, associations: [] })
  const [choix, setChoix] = useState<Choix>({ defauts: config.defauts ?? {}, correspondances: {} })
  const [exclues, setExclues] = useState<Set<number>>(() => new Set())
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [importees, setImportees] = useState(0)

  const titres = useMemo(() => new Set(config.titresExistants.map(normaliser)), [config.titresExistants])
  const lignesSource = useMemo(() => lireLignes(rangees, disposition), [rangees, disposition])
  const { lignes, inconnus } = useMemo(() => resoudre(lignesSource, colonnes, choix, titres), [lignesSource, colonnes, choix, titres])
  const aImporter = lignes.filter((l) => !Object.keys(l.erreurs).length && !exclues.has(l.numero))
  const bloquees = lignes.filter((l) => Object.keys(l.erreurs).length).length

  function commencer(r: string[][], o: string) {
    if (!r.length) return setErreur('Rien à importer : il n’y a aucune ligne.')
    if (r.length > MAX_LIGNES + 1) return setErreur(`Au plus ${MAX_LIGNES} lignes à la fois.`)
    setRangees(r)
    setOrigine(o)
    setDisposition(devinerColonnes(r, colonnes))
    setExclues(new Set())
    setErreur(null)
    setEtape('apercu')
  }

  async function choisirFichier(fichier: File | undefined) {
    if (!fichier) return
    setOccupe(true)
    setErreur(null)
    try {
      commencer(await lireFichier(fichier), fichier.name)
    } catch {
      setErreur(`« ${fichier.name} » n’a pas pu être lu. Essaie un fichier .xlsx, ou copie-colle les lignes.`)
    } finally {
      setOccupe(false)
    }
  }

  function deposer(e: DragEvent) {
    const fichier = e.dataTransfer.files[0]
    if (!fichier) return
    e.preventDefault()
    choisirFichier(fichier)
  }

  async function gabarit() {
    try {
      await telechargerGabarit(config.nomGabarit, colonnes)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  async function importer() {
    setOccupe(true)
    setErreur(null)
    try {
      // Ajouts aux listes (projet, lieu…) d'abord, seulement ceux des lignes importées.
      const crees: Record<string, Map<string, string>> = {}
      for (const [cle, noms] of Object.entries(aCreerPour(aImporter, inconnus))) {
        const c = colonnes.find((x) => x.cle === cle)
        if (c?.type !== 'liste' || !c.creer) continue
        const ids = new Map<string, string>()
        for (const [n, nom] of noms) ids.set(n, await c.creer(nom))
        crees[cle] = ids
      }
      await config.enregistrer(aImporter.map((l) => remplacerCrees(l.valeurs, crees)))
      setImportees(aImporter.length)
      setEtape('fini')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const changerDefaut = (cle: string, valeur: string) => setChoix((c) => ({ ...c, defauts: { ...c.defauts, [cle]: valeur } }))
  const changerCorrespondance = (cle: string, nom: string, valeur: string) =>
    setChoix((c) => ({ ...c, correspondances: { ...c.correspondances, [cle]: { ...c.correspondances[cle], [nom]: valeur } } }))
  function associer(j: number, cle: string | null) {
    setDisposition((d) => ({ ...d, associations: d.associations.map((a, i) => (i === j ? cle : cle && a === cle ? null : a)) }))
  }

  // Colonnes montrées dans l'aperçu : lues dans la source ou remplies par une valeur commune.
  const montrees = colonnes.filter((c) => c.cle === colonnes[0]?.cle || disposition.associations.includes(c.cle) || choix.defauts[c.cle])

  if (etape === 'fini')
    return (
      <Dialogue titre="Importer des tâches" fermer={fermer}>
        <p className="text-sm text-pierre-800">✓ {pluriel(importees, 'tâche')} {importees > 1 ? 'importées' : 'importée'}.</p>
        <div className="mt-5 flex justify-end">
          <button className={ui.bouton} onClick={fermer} autoFocus>
            Fermer
          </button>
        </div>
      </Dialogue>
    )

  if (etape === 'source')
    return (
      <Dialogue titre="Importer des tâches" fermer={fermer} large>
        <div className="space-y-3" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={deposer}>
          <p className="text-sm text-pierre-600">
            Colle des lignes copiées d’Excel ou de Google Sheets (avec ou sans la ligne des noms de colonnes), ou une simple liste de titres, un par ligne.
          </p>
          <textarea
            className={`${ui.champ} min-h-48 font-mono text-xs`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={'Nettoyer les gouttières\nVérifier les extincteurs\n…'}
            aria-label="Lignes à importer"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-pierre-500">
            <span>ou</span>
            <label className={`${ui.boutonSecondaire} cursor-pointer ${occupe ? 'pointer-events-none opacity-50' : ''}`}>
              <IconeImporter /> Choisir un fichier…
              <input
                type="file"
                accept={EXTENSIONS}
                className="sr-only"
                onChange={(e) => {
                  choisirFichier(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            <span className="text-xs">.xlsx, .xls ou .csv — tu peux aussi le glisser ici</span>
            <button type="button" className={`${ui.boutonSecondaire} sm:ml-auto`} onClick={gabarit}>
              <IconeExporter /> Télécharger le gabarit
            </button>
          </div>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button type="button" className={ui.bouton} disabled={!texte.trim() || occupe} onClick={() => commencer(lireTsv(texte), 'collage')}>
              Continuer
            </button>
          </div>
        </div>
      </Dialogue>
    )

  const n = largeur(rangees)
  const lot = colonnes.filter((c) => c.lot && !(c.type === 'liste' && c.multiple))
  const avecInconnus = colonnes.filter((c) => inconnus[c.cle]?.length)

  return (
    <Dialogue titre="Importer des tâches" fermer={fermer} large>
      <div className="space-y-4">
        <p className="text-sm text-pierre-600">
          {pluriel(lignes.length, 'ligne')} {origine === 'collage' ? 'collée' : `lue${lignes.length > 1 ? 's' : ''} dans « ${origine} »`}
          {origine === 'collage' && lignes.length > 1 ? 's' : ''}. Rien n’est enregistré avant « Importer ».
        </p>

        <section>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className={ui.etiquette}>Colonnes</h3>
            <label className="flex items-center gap-1.5 text-xs text-pierre-600">
              <input type="checkbox" checked={disposition.entete} onChange={(e) => setDisposition((d) => ({ ...d, entete: e.target.checked }))} />
              La première ligne contient les noms des colonnes
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: n }, (_, j) => {
              const nom = disposition.entete && rangees[0]?.[j] ? rangees[0][j] : `Colonne ${lettre(j)}`
              const exemple = rangees[disposition.entete ? 1 : 0]?.[j]
              return (
                <label key={j} className="block w-44 rounded-lg border border-pierre-200 p-2">
                  <span className="block truncate text-xs font-medium text-pierre-800" title={nom}>
                    {nom}
                  </span>
                  <span className="block truncate text-xs text-pierre-400" title={exemple}>
                    {exemple || '—'}
                  </span>
                  <select
                    className={`mt-1 w-full rounded-md border px-1.5 py-1 text-xs ${disposition.associations[j] ? 'border-foret-300 bg-foret-50 text-foret-900' : 'border-pierre-300 bg-white text-pierre-500'}`}
                    value={disposition.associations[j] ?? ''}
                    onChange={(e) => associer(j, e.target.value || null)}
                    aria-label={`Colonne « ${nom} »`}
                  >
                    <option value="">Ignorer</option>
                    {colonnes.map((c) => (
                      <option key={c.cle} value={c.cle}>
                        → {c.entete}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </section>

        {lot.length > 0 && (
          <section>
            <h3 className={`${ui.etiquette} mb-1.5`}>Pour tout le lot (lignes où c’est vide)</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lot.map((c) => (
                <ValeurCommune key={c.cle} colonne={c} valeur={choix.defauts[c.cle] ?? ''} changer={(v) => changerDefaut(c.cle, v)} />
              ))}
            </div>
          </section>
        )}

        {avecInconnus.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <h3 className="mb-1 text-sm font-semibold text-amber-900">Noms inconnus à associer</h3>
            <p className="mb-2 text-xs text-amber-900/80">Choisis à quoi ils correspondent ; les lignes qui les portent attendent ton choix.</p>
            <div className="space-y-1.5">
              {avecInconnus.map((c) =>
                inconnus[c.cle].map((i) => (
                  <Correspondance
                    key={`${c.cle}|${i.cle}`}
                    colonne={c}
                    inconnu={i}
                    valeur={choix.correspondances[c.cle]?.[i.cle] ?? ''}
                    changer={(v) => changerCorrespondance(c.cle, i.cle, v)}
                  />
                )),
              )}
            </div>
          </section>
        )}

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-pierre-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-pierre-50 text-xs text-pierre-500">
              <tr>
                <th className="w-8 px-2 py-1.5">
                  <span className="sr-only">Importer</span>
                </th>
                <th className="w-8 px-1 py-1.5 font-medium">#</th>
                {montrees.map((c) => (
                  <th key={c.cle} className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {c.entete}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {lignes.map((l) => {
                const bloquee = Object.keys(l.erreurs).length > 0
                const exclue = exclues.has(l.numero)
                return (
                  <tr key={l.numero} className={bloquee ? 'bg-red-50/50' : exclue ? 'text-pierre-400' : ''}>
                    <td className="px-2 py-1.5 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Importer la ligne ${l.numero}`}
                        checked={!bloquee && !exclue}
                        disabled={bloquee}
                        onChange={(e) =>
                          setExclues((s) => {
                            const t = new Set(s)
                            if (e.target.checked) t.delete(l.numero)
                            else t.add(l.numero)
                            return t
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-1.5 align-top text-xs tabular-nums text-pierre-400">{l.numero}</td>
                    {montrees.map((c) => (
                      <td key={c.cle} className={`px-2 py-1.5 align-top ${c.cle === colonnes[0]?.cle ? 'min-w-56' : 'whitespace-nowrap'}`}>
                        {l.erreurs[c.cle] ? (
                          <span className="text-xs font-medium text-red-700">{l.erreurs[c.cle]}</span>
                        ) : (
                          <span className={c.type === 'texte' && c.cle !== colonnes[0]?.cle ? 'line-clamp-2 text-xs text-pierre-600' : ''}>
                            {afficher(c, l.valeurs[c.cle], inconnus[c.cle])}
                          </span>
                        )}
                        {c.cle === colonnes[0]?.cle && l.doublon && (
                          <span className="ml-1.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800" title="Une tâche du même nom existe déjà">
                            existe déjà
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {bloquees > 0 && (
            <span className="mr-auto text-xs text-red-700">
              {pluriel(bloquees, 'ligne')} avec un problème {bloquees > 1 ? 'ne seront pas importées' : 'ne sera pas importée'}.
            </span>
          )}
          <button type="button" className={ui.boutonSecondaire} onClick={() => setEtape('source')} disabled={occupe}>
            Retour
          </button>
          <button type="button" className={ui.bouton} disabled={!aImporter.length || occupe} onClick={importer}>
            {occupe ? 'Import…' : `Importer ${pluriel(aImporter.length, 'tâche')}`}
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

/** Texte d'une valeur résolue dans l'aperçu. */
function afficher(c: Colonne, v: unknown, inconnus: Inconnu[] | undefined): string {
  if (v === undefined || v === null) return ''
  if (c.type === 'texte') return String(v)
  if (c.type === 'valeur') return c.afficher(v)
  const nom = (id: string) => {
    if (!estACreer(id)) return c.options.find((o) => o.id === id)?.nom ?? '?'
    const n = id.slice(CREER.length)
    return `${inconnus?.find((i) => i.cle === n)?.texte ?? n} (nouveau)`
  }
  return Array.isArray(v) ? v.map(nom).join(', ') : nom(String(v))
}

const petitChamp = 'w-full rounded-md border border-pierre-300 bg-white px-2 py-1 text-sm text-pierre-900'

/** Valeur commune du lot : menu (liste, choix simple), pastilles (mois) ou texte. */
function ValeurCommune({ colonne: c, valeur, changer }: { colonne: Colonne; valeur: string; changer: (v: string) => void }) {
  let champ
  if (c.type === 'liste')
    champ = (
      <select className={petitChamp} value={valeur} onChange={(e) => changer(e.target.value)} aria-label={`${c.entete} pour tout le lot`}>
        <option value="">—</option>
        {c.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    )
  else if (c.type === 'valeur' && c.choix && c.multiple) {
    const lu = c.lire(valeur)
    const pris = new Set('valeur' in lu && Array.isArray(lu.valeur) ? lu.valeur.map(String) : valeur ? separer(valeur) : [])
    champ = (
      <div className="flex flex-wrap gap-1">
        {c.choix.map((x) => {
          const actif = pris.has(x.texte)
          return (
            <button
              key={x.texte}
              type="button"
              aria-pressed={actif}
              className={`rounded-md border px-1.5 py-0.5 text-xs ${actif ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-300 bg-white text-pierre-700 hover:border-foret-600'}`}
              onClick={() => changer(c.choix!.filter((y) => (y.texte === x.texte ? !actif : pris.has(y.texte))).map((y) => y.texte).join(', '))}
            >
              {x.libelle}
            </button>
          )
        })}
      </div>
    )
  } else if (c.type === 'valeur' && c.choix)
    champ = (
      <select className={petitChamp} value={valeur} onChange={(e) => changer(e.target.value)} aria-label={`${c.entete} pour tout le lot`}>
        <option value="">—</option>
        {c.choix.map((x) => (
          <option key={x.texte} value={x.texte}>
            {x.libelle}
          </option>
        ))}
      </select>
    )
  else champ = <input className={petitChamp} value={valeur} onChange={(e) => changer(e.target.value)} aria-label={`${c.entete} pour tout le lot`} />
  return (
    <div className="rounded-lg border border-pierre-200 p-2">
      <span className="mb-1 block text-xs font-medium text-pierre-700">
        {c.entete}
        {c.obligatoire && <span className="text-pierre-400"> · obligatoire</span>}
      </span>
      {champ}
    </div>
  )
}

/** Ce qu'on fait d'un nom inconnu : une option existante, l'ajouter à la liste, ou rien. */
function Correspondance({ colonne: c, inconnu: i, valeur, changer }: { colonne: Colonne; inconnu: Inconnu; valeur: string; changer: (v: string) => void }) {
  if (c.type !== 'liste') return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-amber-900/80">{c.entete}</span>
      <span className="font-medium text-pierre-900">« {i.texte} »</span>
      <span className="text-xs text-pierre-500">({pluriel(i.lignes, 'ligne')})</span>
      <span className="text-pierre-400">→</span>
      <select
        className={`min-w-52 rounded-md border px-2 py-1 text-sm ${valeur ? 'border-pierre-300 bg-white' : 'border-amber-400 bg-white text-amber-900'}`}
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        aria-label={`${c.entete} « ${i.texte} »`}
      >
        <option value="">À choisir…</option>
        {c.creer && <option value={CREER}>Ajouter « {i.texte} » à la liste</option>}
        {!c.obligatoire && <option value={VIDE}>Laisser vide</option>}
        <optgroup label={`${c.entete} existants`}>
          {c.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  )
}
