// Liste imprimée de l'équipement. La fenêtre « Imprimer » part des articles
// affichés (filtres de l'écran) ; on y choisit le regroupement, les sections
// (ou lieux) à imprimer et la sorte de feuille :
// - « Pour compter » : cases vides à remplir à la main, avec le dernier
//   compte pour comparer (on entre les nombres plus tard, au jour du compte) ;
// - « Dernier compte » : les nombres du dernier compte de chaque article.
import { useMemo, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import type { Donnees } from './donnees'
import { AUCUN, dateCourte, manque, regrouper, total, type Filtres, type Groupe, type Regroupement } from './outils'
import type { Article } from './types'

export type Feuille = 'comptage' | 'liste'

/** Ce que la fenêtre fait imprimer. */
export interface ChoixImpression {
  par: Regroupement
  /** Groupes cochés (id des sections ou des lieux, `AUCUN` = sans). */
  ids: string[]
  feuille: Feuille
  /** Chaque section (ou lieu) sur sa propre feuille. */
  pageParGroupe: boolean
}

const NOMS_PAR: Record<Regroupement, [string, string]> = { section: ['Par section', 'section'], lieu: ['Par lieu', 'lieu'] }
const pluriel = (n: number) => `${n} article${n > 1 ? 's' : ''}`
const dateLongue = () => new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

/** Groupes à imprimer : ceux cochés dans la fenêtre (`ids`), sinon tous. */
export const groupesPour = (articles: Article[], d: Donnees, c: { par: Regroupement; ids?: string[] }) =>
  regrouper(articles, c.par, c.par === 'section' ? d.sections : d.lieux).filter((g) => !c.ids || c.ids.includes(g.id))

/** Filtres actifs en mots (« Camping · Grill · il en manque »), pour le titre de la feuille. */
export function decrireFiltres(f: Filtres, d: Donnees, enComptage: boolean) {
  const nom = (id: string, liste: Map<string, { nom: string }>, sans: string) => (id === AUCUN ? sans : liste.get(id)?.nom)
  return [
    f.section && nom(f.section, d.section, 'Sans section'),
    f.lieu && nom(f.lieu, d.lieu, 'Sans lieu'),
    f.compagnie && d.compagnie.get(f.compagnie)?.nom,
    f.recherche.trim() && `« ${f.recherche.trim()} »`,
    f.aCompter && enComptage && 'pas encore comptés',
    f.manquants && 'il en manque',
  ]
    .filter(Boolean)
    .join(' · ')
}

// Gardé sur l'appareil : les groupes décochés (par regroupement ; une
// nouvelle section arrive cochée), la sorte de feuille et « une page par… ».
const CLE = 'inventaire-impression'
interface Memoire {
  decoches: Partial<Record<Regroupement, string[]>>
  feuille: Feuille
  pageParGroupe: boolean
}

function lireMemoire(): Memoire {
  try {
    const m = JSON.parse(localStorage.getItem(CLE) ?? '{}')
    return {
      decoches: m.decoches && typeof m.decoches === 'object' ? m.decoches : {},
      feuille: m.feuille === 'liste' ? 'liste' : 'comptage',
      pageParGroupe: m.pageParGroupe === true,
    }
  } catch {
    return { decoches: {}, feuille: 'comptage', pageParGroupe: false }
  }
}

function garderMemoire(m: Memoire) {
  try {
    localStorage.setItem(CLE, JSON.stringify(m))
  } catch {
    // Stockage indisponible : le choix vaut pour cette fois.
  }
}

/** Fenêtre « Imprimer » : sorte de feuille, regroupement et sections (ou lieux) à imprimer. */
export function FenetreImpression({
  articles,
  d,
  parEcran,
  portee,
  imprimer,
  fermer,
}: {
  /** Articles affichés (filtrés). */
  articles: Article[]
  d: Donnees
  parEcran: Regroupement
  portee: string
  imprimer: (c: ChoixImpression) => void
  fermer: () => void
}) {
  const [memoire] = useState(lireMemoire)
  const [par, setPar] = useState(parEcran)
  const [decoches, setDecoches] = useState(memoire.decoches)
  const [feuille, setFeuille] = useState(memoire.feuille)
  const [pageParGroupe, setPageParGroupe] = useState(memoire.pageParGroupe)

  const groupes = useMemo(() => groupesPour(articles, d, { par }), [articles, d, par])
  const exclus = decoches[par] ?? []
  const choisis = groupes.filter((g) => !exclus.includes(g.id))
  const nombre = choisis.reduce((n, g) => n + g.articles.length, 0)

  const decocher = (ids: string[]) => setDecoches({ ...decoches, [par]: ids })
  const basculer = (id: string) => decocher(exclus.includes(id) ? exclus.filter((c) => c !== id) : [...exclus, id])
  const lancer = () => {
    garderMemoire({ decoches, feuille, pageParGroupe })
    imprimer({ par, ids: choisis.map((g) => g.id), feuille, pageParGroupe })
  }

  const option = (valeur: Feuille, titre: string, detail: string) => (
    <label
      className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 ${feuille === valeur ? 'border-foret-600 bg-foret-50/50' : 'border-pierre-200 hover:bg-pierre-50'}`}
    >
      <input type="radio" name="feuille" className="mt-0.5 size-4 shrink-0 accent-foret-700" checked={feuille === valeur} onChange={() => setFeuille(valeur)} />
      <span>
        <span className="block text-sm font-medium text-pierre-900">{titre}</span>
        <span className="block text-xs text-pierre-500">{detail}</span>
      </span>
    </label>
  )

  return (
    <Dialogue
      titre="Imprimer la liste"
      fermer={fermer}
      pied={
        <div className="flex items-center gap-2">
          <span className="text-sm text-pierre-500">{pluriel(nombre)}</span>
          <button className={`${ui.boutonSecondaire} ml-auto`} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} onClick={lancer} disabled={!nombre}>
            Imprimer
          </button>
        </div>
      }
    >
      <p className="text-sm text-pierre-600">
        Articles affichés
        {portee && (
          <>
            , selon les filtres de l'écran : <b className="font-medium text-pierre-900">{portee}</b>
          </>
        )}
        .
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {option('comptage', 'Pour compter', 'Cases vides à remplir à la main, avec le dernier compte pour comparer.')}
        {option('liste', 'Dernier compte', 'Les nombres du dernier compte de chaque article, avec sa date.')}
      </div>

      <div className="mt-4 flex overflow-hidden rounded-lg border border-pierre-300 text-sm" role="group" aria-label="Regrouper par">
        {(['section', 'lieu'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={`flex-1 whitespace-nowrap px-2.5 py-1.5 ${par === p ? 'bg-pierre-800 text-white' : 'bg-white text-pierre-700 hover:bg-pierre-50'}`}
            aria-pressed={par === p}
            onClick={() => setPar(p)}
          >
            {NOMS_PAR[p][0]}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <p className={ui.etiquette}>À imprimer</p>
        <button type="button" className="ml-auto text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => decocher([])}>
          Tout cocher
        </button>
        <button type="button" className="text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => decocher(groupes.map((g) => g.id))}>
          Tout décocher
        </button>
      </div>
      <div className="max-h-64 divide-y divide-pierre-100 overflow-y-auto rounded-lg border border-pierre-200">
        {groupes.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-pierre-50">
            <input type="checkbox" className="size-4 shrink-0 accent-foret-700" checked={!exclus.includes(g.id)} onChange={() => basculer(g.id)} />
            <span className="min-w-0 flex-1 truncate text-pierre-800">{g.titre}</span>
            <span className="text-xs tabular-nums text-pierre-500">{g.articles.length}</span>
          </label>
        ))}
        {groupes.length === 0 && <p className="px-3 py-4 text-center text-sm text-pierre-500">Aucun article.</p>}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-pierre-800">
        <input type="checkbox" className="size-4 accent-foret-700" checked={pageParGroupe} onChange={(e) => setPageParGroupe(e.target.checked)} />
        Une page par {NOMS_PAR[par][1]}
      </label>
    </Dialogue>
  )
}

/** Version papier, cachée à l'écran (aussi pour ⌘P : ce qui est affiché, dernier compte). */
export function ListeImprimee({
  groupes,
  par,
  d,
  choix,
  nom,
  portee,
}: {
  groupes: Groupe[]
  par: Regroupement
  d: Donnees
  choix: Pick<ChoixImpression, 'feuille' | 'pageParGroupe'>
  /** « Inventaire », « Équipement nautique »… */
  nom: string
  portee: string
}) {
  const date = dateLongue()
  const pourCompter = choix.feuille === 'comptage'
  const titre = `${nom} — ${pourCompter ? 'feuille de comptage' : 'dernier compte'}`
  // Colonne Compagnie seulement s'il y en a plus d'une sur la feuille.
  const compagnie = new Set(groupes.flatMap((g) => g.articles.map((a) => a.entreprise_id))).size > 1
  const tableau = (articles: Article[]) => <TableauPapier articles={articles} d={d} par={par} pourCompter={pourCompter} compagnie={compagnie} />

  if (choix.pageParGroupe) {
    return (
      <div className="hidden text-[10pt] leading-snug text-black print:block">
        {groupes.map((g, i) => (
          <section key={g.id} className={i > 0 ? 'break-before-page' : undefined}>
            <EntetePapier titre={g.titre} sous={[titre, pluriel(g.articles.length), portee].filter(Boolean).join(' · ')} date={date} nom={nom} pourCompter={pourCompter} />
            {tableau(g.articles)}
          </section>
        ))}
      </div>
    )
  }
  const nombre = groupes.reduce((n, g) => n + g.articles.length, 0)
  return (
    <div className="hidden text-[10pt] leading-snug text-black print:block">
      <EntetePapier titre={titre} sous={[pluriel(nombre), portee].filter(Boolean).join(' · ')} date={date} nom={nom} pourCompter={pourCompter} />
      {groupes.map((g) => (
        <section key={g.id} className="mt-4">
          <h3 className="break-after-avoid text-[12pt] font-bold">
            {g.titre} <span className="text-[9pt] font-normal">({g.articles.length})</span>
          </h3>
          {tableau(g.articles)}
        </section>
      ))}
    </div>
  )
}

function EntetePapier({ titre, sous, date, nom, pourCompter }: { titre: string; sous: string; date: string; nom: string; pourCompter: boolean }) {
  return (
    <header className="border-b-2 border-black pb-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[16pt] font-bold">{titre}</h2>
        <p className="shrink-0 text-[9pt]">
          {nom} · imprimé le {date}
        </p>
      </div>
      <p className="text-[9pt]">{sous}</p>
      {/* Le jour compte : c'est la date du compte quand on l'entre dans l'app. */}
      {pourCompter && (
        <p className="mt-2 flex gap-8 pb-1 text-[10pt]">
          <span>
            Jour du comptage : <span className="inline-block w-[45mm] border-b border-black" />
          </span>
          <span>
            Compté par : <span className="inline-block w-[50mm] border-b border-black" />
          </span>
        </p>
      )}
    </header>
  )
}

const th = 'border-b border-black px-1.5 py-1 text-left text-[8.5pt] font-semibold uppercase tracking-wide'
const thNombre = `${th} text-right`
const td = 'px-1.5 py-1.5 align-top'
const tdNombre = `${td} text-right tabular-nums`

function TableauPapier({
  articles,
  d,
  par,
  pourCompter,
  compagnie,
}: {
  articles: Article[]
  d: Donnees
  par: Regroupement
  pourCompter: boolean
  compagnie: boolean
}) {
  const caseVide = <span className="ml-auto block h-[6mm] w-[10mm] border border-black" aria-hidden />
  // Largeurs fixes : la colonne Article prend le reste (sinon la note disparaît).
  return (
    <table className="mt-2 w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th className={th}>Article</th>
          <th className={`${th} w-[24mm]`}>{par === 'section' ? 'Lieu' : 'Section'}</th>
          {compagnie && <th className={`${th} w-[14mm]`}>Cie</th>}
          <th className={`${thNombre} w-[11mm]`} title="Nombre qu'il faut avoir">
            Néc.
          </th>
          {pourCompter ? (
            <>
              <th className={`${th} w-[23mm]`}>Dernier compte</th>
              <th className={`${thNombre} w-[13mm]`}>Bons</th>
              <th className={`${thNombre} w-[14mm]`}>Brisés</th>
              <th className={`${thNombre} w-[16mm]`}>Incompl.</th>
              <th className={`${th} w-[30mm] pl-3`}>Note</th>
            </>
          ) : (
            <>
              <th className={`${thNombre} w-[12mm]`}>Bons</th>
              <th className={`${thNombre} w-[14mm]`}>Brisés</th>
              <th className={`${thNombre} w-[16mm]`}>Incompl.</th>
              <th className={`${thNombre} w-[12mm]`}>Total</th>
              <th className={`${th} w-[23mm]`}>Compté le</th>
              <th className={`${th} w-[30mm]`}>Note</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {articles.map((a) => {
          const c = d.historique(a.id)[0]
          const m = manque(a, c)
          const cie = a.entreprise_id ? d.compagnie.get(a.entreprise_id) : undefined
          const autre = par === 'section' ? (a.lieu_id ? d.lieu.get(a.lieu_id)?.nom : null) : a.section_id ? d.section.get(a.section_id)?.nom : null
          return (
            <tr key={a.id} className="break-inside-avoid border-b border-pierre-300">
              <td className={td}>
                <p className="font-semibold">
                  {a.nom}
                  {a.variante && <span className="font-normal"> · {a.variante}</span>}
                </p>
                {a.note && <p className="text-[8.5pt]">{a.note}</p>}
              </td>
              <td className={td}>{autre}</td>
              {compagnie && <td className={td}>{cie ? cie.abreviation || cie.nom : ''}</td>}
              <td className={tdNombre}>
                {a.necessaire}
                {!pourCompter && m > 0 && <b className="block">−{m}</b>}
              </td>
              {pourCompter ? (
                <>
                  <td className={`${td} text-[8.5pt]`}>
                    {c ? (
                      <>
                        <b className="text-[10pt]">{total(c)}</b>
                        {c.brise + c.incomplet > 0 && (
                          <> ({[c.brise && `${c.brise} brisé${c.brise > 1 ? 's' : ''}`, c.incomplet && `${c.incomplet} incompl.`].filter(Boolean).join(', ')})</>
                        )}
                        <span className="block whitespace-nowrap">{dateCourte(c.jour)}</span>
                      </>
                    ) : (
                      'jamais compté'
                    )}
                  </td>
                  <td className={td}>{caseVide}</td>
                  <td className={td}>{caseVide}</td>
                  <td className={td}>{caseVide}</td>
                  <td className={td} />
                </>
              ) : c ? (
                <>
                  <td className={tdNombre}>{c.bon}</td>
                  <td className={tdNombre}>{c.brise ? <b>{c.brise}</b> : 0}</td>
                  <td className={tdNombre}>{c.incomplet ? <b>{c.incomplet}</b> : 0}</td>
                  <td className={`${tdNombre} font-semibold`}>{total(c)}</td>
                  <td className={`${td} whitespace-nowrap`}>{dateCourte(c.jour)}</td>
                  <td className={`${td} text-[8.5pt]`}>{c.note}</td>
                </>
              ) : (
                <td className={`${td} text-[8.5pt]`} colSpan={6}>
                  jamais compté
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
