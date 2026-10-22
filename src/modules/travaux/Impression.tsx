// Liste de tâches imprimée. La fenêtre « Imprimer » part des tâches
// affichées dans l'onglet Tâches (filtres, tri) ; on y choisit le
// regroupement et les groupes à imprimer (personnes, étiquettes, lieux…).
// Sur papier : une case à cocher à la main par tâche ; « Une page par
// groupe » = une feuille par personne, par étiquette… à remettre à chacun.
import { useMemo, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { Pastille } from './commun'
import type { Donnees } from './donnees'
import { champ, dateCourte, enRetard, regrouper, REGROUPEMENTS, TRIS, type Filtres, type Groupe, type Regroupement, type Tri } from './outils'
import { PRIORITES, type Tache } from './types'

export interface OptionsImpression {
  /** Chaque groupe sur sa propre feuille. */
  pageParGroupe: boolean
  descriptions: boolean
}

/** Ce que la fenêtre fait imprimer. */
export interface ChoixImpression extends OptionsImpression {
  regroupement: Regroupement
  /** Groupes cochés (clés de `regrouper`). */
  cles: string[]
}

/** Colonnes imprimées (celle du regroupement est inutile : c'est le titre du groupe). */
export interface Colonnes {
  lieu: boolean
  categorie: boolean
  personne: boolean
  priorite: boolean
}

export const colonnesPour = (r: Regroupement): Colonnes => ({
  lieu: r !== 'lieu',
  categorie: r !== 'categorie',
  personne: r !== 'personne',
  priorite: r !== 'priorite',
})

/** Une feuille par groupe d'office pour ce qu'on remet à quelqu'un. */
export const pageParGroupeParDefaut = (r: Regroupement) => r === 'personne' || r === 'etiquette'

/** Filtres actifs en mots (« Léa · Woofing »), pour le titre de la feuille. */
export function decrireFiltres(f: Filtres, d: Donnees) {
  const etiquettes = d.etiquettes.filter((e) => f.etiquettes.includes(e.id)).map((e) => e.nom)
  return [
    f.personne && (f.personne === 'libre' ? 'À assigner' : d.personne.get(f.personne)?.nom),
    etiquettes.join(' ou '),
    f.lieu && (f.lieu === 'aucun' ? 'Sans lieu' : d.lieu.get(f.lieu)?.nom),
    f.categorie && (f.categorie === 'aucune' ? 'Sans catégorie' : d.categorie.get(f.categorie)?.nom),
    f.chantier && d.chantier.get(f.chantier)?.nom,
    f.priorite && PRIORITES[Number(f.priorite) as keyof typeof PRIORITES],
    f.texte.trim() && `« ${f.texte.trim()} »`,
  ]
    .filter(Boolean)
    .join(' · ')
}

const pluriel = (n: number) => `${n} tâche${n > 1 ? 's' : ''}`
const dateLongue = () => new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
const nombreTaches = (groupes: Groupe[]) => new Set(groupes.flatMap((g) => g.taches.map((t) => t.id))).size

// Gardé sur l'appareil : les groupes décochés (par regroupement ; une nouvelle
// personne arrive cochée) et « Avec les descriptions ».
const CLE = 'travaux-impression'
interface Memoire {
  decoches: Partial<Record<Regroupement, string[]>>
  descriptions: boolean
}

function lireMemoire(): Memoire {
  try {
    const m = JSON.parse(localStorage.getItem(CLE) ?? '{}')
    return { decoches: m.decoches && typeof m.decoches === 'object' ? m.decoches : {}, descriptions: m.descriptions !== false }
  } catch {
    return { decoches: {}, descriptions: true }
  }
}

function garderMemoire(m: Memoire) {
  try {
    localStorage.setItem(CLE, JSON.stringify(m))
  } catch {
    // Stockage indisponible : le choix vaut pour cette fois.
  }
}

/** Fenêtre « Imprimer » : regroupement, groupes à imprimer et options. */
export function FenetreImpression({
  taches,
  d,
  regroupementEcran,
  etiquettesFiltrees,
  portee,
  tri,
  imprimer,
  fermer,
}: {
  /** Tâches à faire affichées (filtrées et triées). */
  taches: Tache[]
  d: Donnees
  regroupementEcran: Regroupement
  etiquettesFiltrees: string[]
  portee: string
  tri: Tri
  imprimer: (c: ChoixImpression) => void
  fermer: () => void
}) {
  const [memoire] = useState(lireMemoire)
  const [regroupement, setRegroupement] = useState(regroupementEcran)
  const [decoches, setDecoches] = useState(memoire.decoches)
  const [pageParGroupe, setPageParGroupe] = useState(pageParGroupeParDefaut(regroupementEcran))
  const [descriptions, setDescriptions] = useState(memoire.descriptions)

  const groupes = useMemo(() => regrouper(taches, regroupement, d, etiquettesFiltrees), [taches, regroupement, d, etiquettesFiltrees])
  const regroupe = regroupement !== 'aucun'
  const exclus = regroupe ? (decoches[regroupement] ?? []) : []
  const choisis = groupes.filter((g) => !exclus.includes(g.cle))
  const nombre = nombreTaches(choisis)
  const nomGroupe = REGROUPEMENTS.find(([r]) => r === regroupement)?.[2]

  const changerRegroupement = (r: Regroupement) => {
    setRegroupement(r)
    setPageParGroupe(pageParGroupeParDefaut(r))
  }
  const decocher = (cles: string[]) => setDecoches({ ...decoches, [regroupement]: cles })
  const basculer = (cle: string) => decocher(exclus.includes(cle) ? exclus.filter((c) => c !== cle) : [...exclus, cle])
  const lancer = () => {
    garderMemoire({ decoches, descriptions })
    imprimer({ regroupement, cles: choisis.map((g) => g.cle), pageParGroupe: regroupe && pageParGroupe, descriptions })
  }

  const caseACocher = (coche: boolean, changer: (v: boolean) => void, texte: string) => (
    <label className="flex items-center gap-2 text-sm text-pierre-800">
      <input type="checkbox" className="size-4 accent-foret-700" checked={coche} onChange={(e) => changer(e.target.checked)} />
      {texte}
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
        Tâches à faire, triées par {TRIS[tri].toLowerCase()}
        {portee && (
          <>
            , selon les filtres de l'écran : <b className="font-medium text-pierre-900">{portee}</b>
          </>
        )}
        .
      </p>

      {/* Un menu : les six boutons de l'onglet ne tiennent pas dans la fenêtre. */}
      <label className="mt-4 flex items-center gap-2 text-sm text-pierre-700">
        Regrouper par
        <select className={champ.replace('w-full', 'w-auto')} value={regroupement} onChange={(e) => changerRegroupement(e.target.value as Regroupement)}>
          {REGROUPEMENTS.filter(([r]) => r !== 'etiquette' || d.etiquettes.length > 0).map(([r, nom]) => (
            <option key={r} value={r}>
              {nom}
            </option>
          ))}
        </select>
      </label>

      {regroupe && (
        <>
          <div className="mt-4 flex items-baseline gap-3">
            <p className={ui.etiquette}>À imprimer</p>
            <button type="button" className="ml-auto text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => decocher([])}>
              Tout cocher
            </button>
            <button type="button" className="text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => decocher(groupes.map((g) => g.cle))}>
              Tout décocher
            </button>
          </div>
          <div className="max-h-64 divide-y divide-pierre-100 overflow-y-auto rounded-lg border border-pierre-200">
            {groupes.map((g) => (
              <label key={g.cle} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-pierre-50">
                <input type="checkbox" className="size-4 shrink-0 accent-foret-700" checked={!exclus.includes(g.cle)} onChange={() => basculer(g.cle)} />
                {g.couleur && <Pastille couleur={g.couleur} />}
                <span className="min-w-0 flex-1 truncate text-pierre-800">{g.nom}</span>
                <span className="text-xs tabular-nums text-pierre-500">{g.taches.length}</span>
              </label>
            ))}
            {groupes.length === 0 && <p className="px-3 py-4 text-center text-sm text-pierre-500">Aucune tâche à faire.</p>}
          </div>
        </>
      )}

      <div className="mt-4 space-y-2.5">
        {regroupe && caseACocher(pageParGroupe, setPageParGroupe, `Une page par ${nomGroupe}`)}
        {caseACocher(descriptions, setDescriptions, 'Avec les descriptions')}
      </div>
    </Dialogue>
  )
}

/** Version papier, cachée à l'écran (aussi pour ⌘P, avec les options par défaut). */
export function ListeImprimee({
  groupes,
  regroupe,
  d,
  colonnes,
  options,
  portee,
  tri,
}: {
  groupes: Groupe[]
  /** Faux sans regroupement : un seul tableau, sans titre de groupe. */
  regroupe: boolean
  d: Donnees
  colonnes: Colonnes
  options: OptionsImpression
  portee: string
  tri: Tri
}) {
  const date = dateLongue()
  const triees = `triées par ${TRIS[tri].toLowerCase()}`

  if (regroupe && options.pageParGroupe) {
    return (
      <div className="hidden text-[10pt] leading-snug text-black print:block">
        {groupes.map((g, i) => (
          <section key={g.cle} className={i > 0 ? 'break-before-page' : undefined}>
            <EntetePapier titre={g.nom} sous={[pluriel(g.taches.length), portee, triees].filter(Boolean).join(' · ')} date={date} />
            <TableauPapier taches={g.taches} d={d} colonnes={colonnes} descriptions={options.descriptions} />
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className="hidden text-[10pt] leading-snug text-black print:block">
      <EntetePapier titre={`Travaux à faire${portee ? ` — ${portee}` : ''}`} sous={`${pluriel(nombreTaches(groupes))} · ${triees}`} date={date} />
      {regroupe ? (
        groupes.map((g) => (
          <section key={g.cle} className="mt-4">
            <h3 className="break-after-avoid text-[12pt] font-bold">
              {g.nom} <span className="text-[9pt] font-normal">({g.taches.length})</span>
            </h3>
            <TableauPapier taches={g.taches} d={d} colonnes={colonnes} descriptions={options.descriptions} />
          </section>
        ))
      ) : (
        <TableauPapier taches={groupes.flatMap((g) => g.taches)} d={d} colonnes={colonnes} descriptions={options.descriptions} />
      )}
    </div>
  )
}

function EntetePapier({ titre, sous, date }: { titre: string; sous: string; date: string }) {
  return (
    <header className="border-b-2 border-black pb-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[16pt] font-bold">{titre}</h2>
        <p className="shrink-0 text-[9pt]">Travaux · imprimé le {date}</p>
      </div>
      <p className="text-[9pt]">{sous}</p>
    </header>
  )
}

const th = 'border-b border-black px-1.5 py-1 text-left text-[8.5pt] font-semibold uppercase tracking-wide'
const td = 'px-1.5 py-1.5 align-top'

function TableauPapier({ taches, d, colonnes: c, descriptions }: { taches: Tache[]; d: Donnees; colonnes: Colonnes; descriptions: boolean }) {
  const lieuOuCategorie = c.lieu || c.categorie
  return (
    <table className="mt-2 w-full border-collapse">
      <thead>
        <tr>
          <th className={`${th} w-[7mm]`}>
            <span className="sr-only">Fait</span>
          </th>
          <th className={th}>Tâche</th>
          {lieuOuCategorie && <th className={`${th} w-[30mm]`}>{c.lieu ? 'Lieu' : 'Catégorie'}</th>}
          <th className={`${th} w-[20mm]`}>Échéance</th>
          {c.priorite && <th className={`${th} w-[22mm]`}>Priorité</th>}
          {c.personne && <th className={`${th} w-[28mm]`}>Assignée à</th>}
        </tr>
      </thead>
      <tbody>
        {taches.map((t) => {
          const lieu = t.lieu_id ? d.lieu.get(t.lieu_id)?.nom : null
          const categorie = t.categorie_id ? d.categorie.get(t.categorie_id)?.nom : null
          const chantier = t.chantier_id ? d.chantier.get(t.chantier_id)?.nom : null
          const etiquettes = d.etiquettes.filter((e) => t.etiquette_ids.includes(e.id)).map((e) => e.nom)
          return (
            <tr key={t.id} className="break-inside-avoid border-b border-pierre-300">
              <td className={td}>
                <span className="mt-0.5 block size-[3.6mm] border border-black" aria-hidden />
              </td>
              <td className={td}>
                <p className="font-semibold">
                  {t.titre}
                  {etiquettes.length > 0 && <span className="font-normal"> · {etiquettes.join(', ')}</span>}
                </p>
                {chantier && <p className="text-[8.5pt]">Chantier : {chantier}</p>}
                {descriptions && t.description && <p className="mt-0.5 whitespace-pre-line text-[8.5pt]">{t.description}</p>}
              </td>
              {lieuOuCategorie && (
                <td className={td}>
                  {c.lieu ? lieu : categorie}
                  {c.lieu && c.categorie && categorie && <p className="text-[8.5pt]">{categorie}</p>}
                </td>
              )}
              <td className={`${td} whitespace-nowrap`}>
                {t.echeance && (enRetard(t) ? <b>{dateCourte(t.echeance)} (retard)</b> : dateCourte(t.echeance))}
              </td>
              {c.priorite && <td className={td}>{t.priorite === 1 ? <b>{PRIORITES[1]}</b> : PRIORITES[t.priorite]}</td>}
              {c.personne && <td className={td}>{t.assigne_a ? (d.personne.get(t.assigne_a)?.nom ?? '') : 'À assigner'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
