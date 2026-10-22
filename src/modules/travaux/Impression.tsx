// Liste de tâches imprimée : ce qui est affiché dans l'onglet Tâches
// (filtres, regroupement, tri), sur papier, une case à cocher à la main
// par tâche. « Une page par groupe » = une feuille par personne, par
// étiquette… à remettre à chacun.
import { useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import type { Donnees } from './donnees'
import { dateCourte, enRetard, TRIS, type Filtres, type Tri } from './outils'
import { PRIORITES, type Tache } from './types'

export interface Groupe {
  cle: string
  nom: string
  couleur?: string
  taches: Tache[]
}

export interface OptionsImpression {
  /** Chaque groupe sur sa propre feuille. */
  pageParGroupe: boolean
  descriptions: boolean
}

/** Colonnes imprimées (celle du regroupement est inutile : c'est le titre du groupe). */
export interface Colonnes {
  lieu: boolean
  categorie: boolean
  personne: boolean
  priorite: boolean
}

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

/** Fenêtre « Imprimer » : rappelle ce qui sera imprimé et offre les deux options. */
export function FenetreImpression({
  nombre,
  portee,
  tri,
  groupe,
  defauts,
  imprimer,
  fermer,
}: {
  nombre: number
  portee: string
  tri: Tri
  /** Nom d'un groupe (« personne », « étiquette »…), null sans regroupement. */
  groupe: string | null
  defauts: OptionsImpression
  imprimer: (o: OptionsImpression) => void
  fermer: () => void
}) {
  const [options, setOptions] = useState(defauts)
  const caseACocher = (cle: keyof OptionsImpression, texte: string) => (
    <label className="flex items-center gap-2 text-sm text-pierre-800">
      <input type="checkbox" className="size-4 accent-foret-700" checked={options[cle]} onChange={(e) => setOptions({ ...options, [cle]: e.target.checked })} />
      {texte}
    </label>
  )
  return (
    <Dialogue
      titre="Imprimer la liste"
      fermer={fermer}
      pied={
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} onClick={() => imprimer(options)}>
            Imprimer
          </button>
        </div>
      }
    >
      <p className="text-sm text-pierre-600">
        Ce qui est affiché s'imprime : <b className="font-medium text-pierre-900">{pluriel(nombre)} à faire</b>
        {portee ? ` (${portee})` : ''}
        {groupe ? `, regroupées par ${groupe}` : ''}, triées par {TRIS[tri].toLowerCase()}.
      </p>
      <p className="mt-2 text-sm text-pierre-500">
        Pour la liste d'une seule personne ou d'une étiquette, choisissez-la d'abord dans les filtres
        {groupe === 'personne' ? '.' : ' ; pour une feuille par personne, regroupez par personne.'}
      </p>
      <div className="mt-4 space-y-2.5">
        {groupe && caseACocher('pageParGroupe', `Une page par ${groupe}`)}
        {caseACocher('descriptions', 'Avec les descriptions')}
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
  const total = new Set(groupes.flatMap((g) => g.taches.map((t) => t.id))).size

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
      <EntetePapier titre={`Travaux à faire${portee ? ` — ${portee}` : ''}`} sous={`${pluriel(total)} · ${triees}`} date={date} />
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
