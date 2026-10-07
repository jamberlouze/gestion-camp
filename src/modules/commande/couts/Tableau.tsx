import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { argent, entier, intervalle, journalier, lignesMenus, moisDeLAnnee, nomAnnee, tableau, type Intervalle, type LigneTableau } from './calcul'
import { useCouts, type Couts } from './contexte'
import { GraphiqueCouts } from './Graphique'

const coutAssiette = (n: number | null) => (n == null ? '—' : argent(n))

const moisCourt = new Intl.DateTimeFormat('fr-CA', { month: 'short', timeZone: 'UTC' })
/** « oct. », « juil. » */
const nomMois = (l: LigneTableau) => moisCourt.format(new Date(`${l.intervalle.debut}T00:00:00Z`))
/** « Semaine 3 » → « S3 » (un autre nom reste tel quel). */
const nomSemaine = (l: LigneTableau) => l.intervalle.nom.replace(/^Semaine\s*/i, 'S')

function Courbes({ lignes, court }: { lignes: LigneTableau[]; court: (l: LigneTableau) => string }) {
  return (
    <div className={`${ui.carte} max-w-5xl px-2 pb-1 pt-3`}>
      <GraphiqueCouts lignes={lignes} court={court} />
    </div>
  )
}

/** Nourriture, salaires et assiettes ramenés au jour pour l'année choisie. */
function useJournalier(c: Couts) {
  return useMemo(
    () => journalier(c.factures, c.salaires, c.groupes, lignesMenus(c.menus, c.corrections), c.annee.menus),
    [c.factures, c.salaires, c.groupes, c.menus, c.corrections, c.annee.menus],
  )
}

/** Vue Année : un mois civil par ligne, d'octobre à septembre. */
export function TableauAnnee() {
  const c = useCouts()
  const jours = useJournalier(c)
  const t = useMemo(() => tableau(moisDeLAnnee(c.annee.annee), jours, { id: 'annee', nom: `Total ${nomAnnee(c.annee.annee)}` }), [jours, c.annee.annee])
  const aClasser = c.groupes.filter((g) => g.annee === c.annee.annee && !g.debut).length

  return (
    <div className="space-y-5">
      <Chiffres t={t.total} periode={nomAnnee(c.annee.annee)} avecMenus={c.annee.menus} />
      {aClasser > 0 && (
        <p className="max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {aClasser} groupe{aClasser > 1 ? 's' : ''} sans dates (pas compté{aClasser > 1 ? 's' : ''}) :{' '}
          <Link className="underline" to="/cuisine/couts/assiettes">
            Assiettes
          </Link>
        </p>
      )}
      <Courbes lignes={t.lignes} court={nomMois} />
      <Table lignes={t.lignes} total={t.total} libelle="Mois" />
      <p className="max-w-4xl text-xs text-pierre-500">
        Une facture compte au jour de sa livraison, ou au jour d'imputation s'il est indiqué. Les salaires d'une période de paie (14 jours)
        sont partagés également entre ses jours. Un mois sans assiette n'a pas de coût par assiette (—) mais compte dans le total.
      </p>
    </div>
  )
}

/** Vue Camp d'été : une semaine de camp par ligne. */
export function TableauEte() {
  const c = useCouts()
  const jours = useJournalier(c)
  const t = useMemo(() => tableau(c.semaines, jours, { id: 'ete', nom: "Camp d'été" }), [jours, c.semaines])

  if (!c.semaines.length) {
    return (
      <p className={`${ui.carte} max-w-3xl p-6 text-sm text-pierre-500`}>
        Aucune semaine de camp pour {nomAnnee(c.annee.annee)} :{' '}
        <Link className="underline" to="/cuisine/couts/semaines">
          Semaines
        </Link>
        .
      </p>
    )
  }
  const moyenne = t.total.coutTotal
  const sansAssiettes = t.lignes.filter((l) => !l.assiettes && (l.nourriture || l.salaires))
  return (
    <div className="space-y-5">
      <Chiffres t={t.total} periode={`été, ${intervalle(t.total.intervalle.debut, t.total.intervalle.fin)}`} avecMenus={c.annee.menus} />
      {sansAssiettes.length > 0 && (
        <p className="max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sansAssiettes.map((l) => l.intervalle.nom).join(', ')} : des coûts mais aucune assiette. Le coût par assiette de l'été (et les écarts)
          est surestimé tant que leurs assiettes ne sont pas entrées (
          <Link className="underline" to="/cuisine/couts/assiettes">
            Assiettes
          </Link>
          ).
        </p>
      )}
      <Courbes lignes={t.lignes} court={nomSemaine} />
      <Table lignes={t.lignes} total={t.total} libelle="Semaine" moyenne={moyenne} />
      <p className="max-w-4xl text-xs text-pierre-500">
        Écart : coût par assiette de la semaine par rapport à celui de tout l'été. Les salaires se paient aux deux semaines : deux semaines de
        la même paie ont la même part de salaires par jour. Une livraison qui sert la semaine suivante : indiquer sa date d'imputation dans
        Factures.
      </p>
    </div>
  )
}

function Chiffres({ t, periode, avecMenus }: { t: LigneTableau; periode: string; avecMenus: boolean }) {
  return (
    <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Chiffre titre="Coût par assiette" valeur={coutAssiette(t.coutTotal)} detail={`Nourriture + salaires, ${periode}`} fort />
      <Chiffre titre="Nourriture par assiette" valeur={coutAssiette(t.coutNourriture)} detail={`${argent(t.nourriture)} de factures`} />
      <Chiffre titre="Salaires de la cuisine" valeur={argent(t.salaires)} detail="Répartis au prorata des jours" />
      <Chiffre titre="Assiettes servies" valeur={entier(t.assiettes)} detail={avecMenus ? 'Menus de Cuisine + groupes ajoutés' : 'Groupes ajoutés'} />
    </div>
  )
}

function Chiffre({ titre, valeur, detail, fort }: { titre: string; valeur: string; detail: string; fort?: boolean }) {
  return (
    <div className={`${ui.carte} p-4 ${fort ? 'border-foret-600 bg-foret-50' : ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">{titre}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valeur}</p>
      <p className="mt-1 text-xs text-pierre-500">{detail}</p>
    </div>
  )
}

function Ecart({ cout, moyenne }: { cout: number | null; moyenne: number | null }) {
  if (cout == null || moyenne == null) return <>—</>
  const e = cout - moyenne
  if (Math.abs(e) < 0.005) return <span className="text-pierre-500">=</span>
  return <span className={e > 0 ? 'text-red-700' : 'text-foret-700'}>{`${e > 0 ? '+' : '−'}${argent(Math.abs(e))}`}</span>
}

function Table({ lignes, total, libelle, moyenne }: { lignes: LigneTableau[]; total: LigneTableau; libelle: string; moyenne?: number | null }) {
  const avecEcart = moyenne !== undefined
  const cellules = (l: LigneTableau): ReactNode => (
    <>
      <td className="px-3 py-1.5 text-right">{argent(l.nourriture)}</td>
      <td className="px-3 py-1.5 text-right">{argent(l.salaires)}</td>
      <td className="px-3 py-1.5 text-right">{entier(l.assiettes)}</td>
      <td className="px-3 py-1.5 text-right">{coutAssiette(l.coutNourriture)}</td>
      <td className="px-3 py-1.5 text-right font-semibold">{coutAssiette(l.coutTotal)}</td>
    </>
  )
  const nom = (i: Intervalle) => (
    <>
      <span className="font-medium">{i.nom}</span> <span className="whitespace-nowrap text-xs text-pierre-500">{intervalle(i.debut, i.fin)}</span>
    </>
  )
  return (
    <div className={`${ui.carte} max-w-5xl overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
          <tr>
            <th className="px-3 py-2 font-medium">{libelle}</th>
            <th className="px-3 py-2 text-right font-medium">Nourriture</th>
            <th className="px-3 py-2 text-right font-medium">Salaires</th>
            <th className="px-3 py-2 text-right font-medium">Assiettes</th>
            <th className="px-3 py-2 text-right font-medium">Nourriture / assiette</th>
            <th className="px-3 py-2 text-right font-medium">Coût / assiette</th>
            {avecEcart && <th className="px-3 py-2 text-right font-medium">Écart</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100 tabular-nums">
          {lignes.map((l) => (
            <tr key={l.intervalle.id} className={l.nourriture || l.salaires || l.assiettes ? '' : 'text-pierre-400'}>
              <td className="px-3 py-1.5">{nom(l.intervalle)}</td>
              {cellules(l)}
              {avecEcart && (
                <td className="px-3 py-1.5 text-right">
                  <Ecart cout={l.coutTotal} moyenne={moyenne ?? null} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-pierre-200 font-semibold tabular-nums">
          <tr>
            <td className="px-3 py-2">{total.intervalle.nom}</td>
            {cellules(total)}
            {avecEcart && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
