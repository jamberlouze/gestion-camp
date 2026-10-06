import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { FenetreChambre } from './FenetreChambre'
import type { Donnees } from './donnees'
import { arbrePlan, libelleOccupation, nomPersonne, pluriel, type NoeudChambre, type NoeudLieu, type Totaux } from './outils'
import type { Plan as TypePlan } from './types'

/** /rooming : le plan en vigueur, sinon le premier plan actif. */
export function AllerAuPlan({ d }: { d: Donnees }) {
  const plan = d.plans.find((p) => p.en_vigueur) ?? d.plans.find((p) => !p.archive) ?? d.plans[0]
  if (plan) return <Navigate to={`/rooming/plan/${plan.id}`} replace />
  return (
    <p className="py-8 text-center text-sm text-pierre-500">
      Aucun plan pour l'instant.{' '}
      <Link to="/rooming/plans" className="font-medium text-foret-700 underline">
        Créer un plan
      </Link>
    </p>
  )
}

export function VuePlan({ d }: { d: Donnees }) {
  const { id } = useParams()
  const ecriture = useAuth().peutEcrire('rooming')
  const [ouverte, setOuverte] = useState<string | null>(null)
  const plan = d.plans.find((p) => p.id === id)

  const { racines, totaux } = useMemo(
    () =>
      arbrePlan(
        d.structure,
        d.occupations.filter((o) => o.plan_id === id),
        d.personnes.filter((p) => p.plan_id === id),
        d.employe,
      ),
    [d.structure, d.occupations, d.personnes, d.employe, id],
  )

  if (!plan) return <Navigate to="/rooming" replace />

  return (
    <div>
      <EntetePlan plan={plan} plans={d.plans} totaux={totaux} />
      <Legende />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          {racines.map((n) => (
            <BlocLieu key={n.lieu.id} n={n} d={d} ouvrir={ecriture ? setOuverte : undefined} />
          ))}
          {racines.length === 0 && <p className="py-8 text-center text-sm text-pierre-500">Ce plan n'a aucune chambre.</p>}
        </div>
        <PanneauTotaux racines={racines} totaux={totaux} />
      </div>
      {ouverte && <FenetreChambre d={d} plan={plan} chambreId={ouverte} fermer={() => setOuverte(null)} />}
    </div>
  )
}

/**
 * Un lieu du plan : un site est un titre au-dessus de ses bâtiments ; un
 * bâtiment, une carte ; une section et un étage, des sous-titres. Les
 * chambres d'un lieu viennent avant ses lieux enfants.
 */
function BlocLieu({ n, d, ouvrir }: { n: NoeudLieu; d: Donnees; ouvrir?: (chambre: string) => void }) {
  const { lieu } = n
  const tuiles = n.chambres.length > 0 && (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
      {n.chambres.map((c) => (
        <Tuile key={c.chambre.id} n={c} d={d} ouvrir={ouvrir ? () => ouvrir(c.chambre.id) : undefined} />
      ))}
    </div>
  )
  const enfants = n.enfants.map((e) => <BlocLieu key={e.lieu.id} n={e} d={d} ouvrir={ouvrir} />)
  const titre = (
    <>
      {lieu.nom}
      {lieu.code && lieu.code !== lieu.nom && <span className="ml-1.5 font-normal text-pierre-400">({lieu.code})</span>}
    </>
  )

  if (lieu.niveau === 'site') {
    return (
      <section>
        <h2 className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold uppercase tracking-wide text-pierre-500">
          {lieu.nom}
          <span className="font-normal normal-case tracking-normal">
            <ResumeTotaux t={n.totaux} petit />
          </span>
        </h2>
        <div className="space-y-3">
          {tuiles}
          {enfants}
        </div>
      </section>
    )
  }
  if (lieu.niveau === 'batiment') {
    return (
      <div className={`${ui.carte} p-3`}>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">{titre}</h3>
          <ResumeTotaux t={n.totaux} />
        </div>
        <div className="space-y-3">
          {tuiles}
          {enfants}
        </div>
      </div>
    )
  }
  const section = lieu.niveau === 'section'
  return (
    <div className={section && n.enfants.length > 0 ? 'space-y-2 rounded-lg bg-pierre-50/70 p-2' : ''}>
      <div className={`mb-1.5 flex flex-wrap items-baseline gap-x-3 ${section ? 'text-sm' : 'text-xs'}`}>
        <span className={section ? 'font-semibold text-pierre-800' : 'font-medium text-pierre-700'}>{titre}</span>
        <ResumeTotaux t={n.totaux} petit />
      </div>
      <div className="space-y-2">
        {tuiles}
        {enfants}
      </div>
    </div>
  )
}

function EntetePlan({ plan, plans, totaux }: { plan: TypePlan; plans: TypePlan[]; totaux: Totaux }) {
  const naviguer = useNavigate()
  const actifs = plans.filter((p) => !p.archive)
  const archives = plans.filter((p) => p.archive)
  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-pierre-500" htmlFor="choix-plan">
          Plan
        </label>
        <div className="flex items-center gap-2">
          <select
            id="choix-plan"
            className="rounded-lg border border-pierre-300 bg-white py-2 pl-3 text-base font-semibold"
            value={plan.id}
            onChange={(e) => naviguer(`/rooming/plan/${e.target.value}`)}
          >
            {actifs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
                {p.en_vigueur ? ' (en vigueur)' : ''}
              </option>
            ))}
            {archives.length > 0 && (
              <optgroup label="Archivés">
                {archives.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {plan.en_vigueur && <span className="rounded-full bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800 ring-1 ring-foret-100">En vigueur</span>}
          {plan.archive && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-xs font-medium text-pierre-600 ring-1 ring-pierre-200">Archivé</span>}
        </div>
      </div>
      <dl className="flex flex-wrap gap-2">
        <Chiffre libelle="Lits" valeur={totaux.lits} />
        <Chiffre libelle="Enfants" valeur={totaux.enfants} couleur="text-sky-800" />
        <Chiffre libelle="Employés" valeur={totaux.employes} couleur="text-amber-800" />
        <Chiffre libelle="Libres" valeur={totaux.libres} couleur="text-pierre-500" />
      </dl>
    </div>
  )
}

function Chiffre({ libelle, valeur, couleur = 'text-pierre-900' }: { libelle: string; valeur: number; couleur?: string }) {
  return (
    <div className="min-w-20 rounded-lg border border-pierre-200 bg-white px-3 py-1.5">
      <dt className="text-xs text-pierre-500">{libelle}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${couleur}`}>{valeur}</dd>
    </div>
  )
}

function Legende() {
  return (
    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-pierre-600">
      <span className="flex items-center gap-1.5">
        <span className={`size-3 rounded border ${COULEURS.enfants}`} /> Enfants
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`size-3 rounded border ${COULEURS.employes}`} /> Employés
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`size-3 rounded border ${COULEURS.vide}`} /> Vide
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`size-3 rounded border ${COULEURS.fermee}`} /> Fermée dans ce plan
      </span>
    </div>
  )
}

/** « 64 lits · 46 enf. · 18 empl. · 0 libre » */
function ResumeTotaux({ t, petit }: { t: Totaux; petit?: boolean }) {
  return (
    <span className={`flex flex-wrap gap-x-2 tabular-nums text-pierre-500 ${petit ? 'text-xs' : 'text-sm'}`}>
      <span>{pluriel(t.lits, 'lit', 'lits')}</span>
      <span className="text-sky-700">{t.enfants} enf.</span>
      <span className="text-amber-700">{t.employes} empl.</span>
      <span>{pluriel(t.libres, 'libre', 'libres')}</span>
    </span>
  )
}

const COULEURS = {
  enfants: 'border-sky-200 bg-sky-50',
  employes: 'border-amber-200 bg-amber-50',
  vide: 'border-dashed border-pierre-300 bg-white',
  fermee: 'border-pierre-200 bg-[repeating-linear-gradient(135deg,var(--color-pierre-100)_0_6px,var(--color-pierre-50)_6px_12px)]',
}

const BARRES = { enfants: 'bg-sky-500', employes: 'bg-amber-500', vide: 'bg-pierre-300' }

function Tuile({ n, d, ouvrir }: { n: NoeudChambre; d: Donnees; ouvrir?: () => void }) {
  const { chambre, etat, personnes } = n
  const fermee = etat.lits === 0
  const ecart = etat.lits - (etat.reference ?? etat.lits)
  return (
    <button
      type="button"
      onClick={ouvrir}
      disabled={!ouvrir}
      aria-label={`Chambre ${chambre.numero} : ${libelleOccupation(etat)}, ${pluriel(etat.lits, 'lit', 'lits')}`}
      className={`flex min-h-24 flex-col rounded-lg border p-2 text-left ${fermee ? COULEURS.fermee : COULEURS[etat.type]} ${
        ouvrir ? 'transition hover:-translate-y-px hover:shadow-md' : 'cursor-default'
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate font-semibold" title={chambre.numero}>
          {chambre.numero}
        </span>
        <span
          className="shrink-0 text-xs tabular-nums text-pierre-500"
          title={etat.differe ? `Référence d'aujourd'hui : ${pluriel(etat.reference!, 'lit', 'lits')}` : etat.reference === null ? 'Chambre retirée de la référence' : undefined}
        >
          {pluriel(etat.lits, 'lit', 'lits')}
          {etat.differe && !fermee && <span className="ml-0.5 font-medium text-amber-700">({ecart > 0 ? `+${ecart}` : `−${-ecart}`})</span>}
        </span>
      </div>
      <div className={`mt-0.5 text-sm font-medium ${fermee || etat.type === 'vide' ? 'text-pierre-400' : 'text-pierre-800'}`}>
        {libelleOccupation(etat)}
      </div>
      {personnes.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {personnes.map((p) => (
            <span key={p.id} className="rounded bg-white/80 px-1.5 py-px text-xs font-medium text-amber-900 ring-1 ring-amber-200">
              {nomPersonne(p, d.employe)}
            </span>
          ))}
        </div>
      )}
      {!fermee && (
        <div className="mt-auto pt-2">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-pierre-200/70">
            <div className={BARRES[etat.type]} style={{ width: `${(etat.nombre / etat.lits) * 100}%` }} />
          </div>
          {etat.type !== 'vide' && etat.libres > 0 && <div className="mt-0.5 text-xs text-pierre-500">{pluriel(etat.libres, 'libre', 'libres')}</div>}
        </div>
      )}
    </button>
  )
}

/** Totaux de chaque lieu, comme la colonne de droite de l'ancien Sheets. */
function PanneauTotaux({ racines, totaux }: { racines: NoeudLieu[]; totaux: Totaux }) {
  const STYLES = {
    site: 'border-t border-pierre-200 font-semibold',
    batiment: 'font-medium text-pierre-800',
    section: 'text-pierre-700',
    etage: 'text-xs text-pierre-500',
  }
  const lignes = (n: NoeudLieu, profondeur: number): ReactNode[] => [
    <tr key={n.lieu.id} className={STYLES[n.lieu.niveau]}>
      <td className="py-1 pr-2" style={{ paddingLeft: `${profondeur * 0.75}rem` }}>
        {n.lieu.code ?? n.lieu.nom}
      </td>
      <td className="px-1 text-right tabular-nums">{n.totaux.lits}</td>
      <td className="px-1 text-right tabular-nums text-sky-800">{n.totaux.enfants}</td>
      <td className="px-1 text-right tabular-nums text-amber-800">{n.totaux.employes}</td>
      <td className="pl-1 text-right tabular-nums text-pierre-500">{n.totaux.libres}</td>
    </tr>,
    ...n.enfants.flatMap((e) => lignes(e, profondeur + 1)),
  ]
  return (
    <aside className={`${ui.carte} p-3 xl:sticky xl:top-4`}>
      <h2 className="mb-2 text-sm font-semibold">Totaux</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-pierre-500">
            <th className="pb-1 text-left font-medium" />
            <th className="px-1 pb-1 text-right font-medium">Lits</th>
            <th className="px-1 pb-1 text-right font-medium">Enf.</th>
            <th className="px-1 pb-1 text-right font-medium">Empl.</th>
            <th className="pb-1 pl-1 text-right font-medium">Libres</th>
          </tr>
        </thead>
        <tbody>
          {racines.flatMap((r) => lignes(r, 0))}
          <tr className="border-t-2 border-pierre-300 font-semibold">
            <td className="py-1 pr-2">Total</td>
            <td className="px-1 text-right tabular-nums">{totaux.lits}</td>
            <td className="px-1 text-right tabular-nums text-sky-800">{totaux.enfants}</td>
            <td className="px-1 text-right tabular-nums text-amber-800">{totaux.employes}</td>
            <td className="pl-1 text-right tabular-nums text-pierre-500">{totaux.libres}</td>
          </tr>
        </tbody>
      </table>
    </aside>
  )
}
