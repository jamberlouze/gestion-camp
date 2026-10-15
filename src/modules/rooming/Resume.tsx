import { useMemo } from 'react'
import { Link } from 'react-router'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import type { Donnees } from './donnees'
import { arbrePlan, arbreReference, pluriel, type NoeudReference } from './outils'

/**
 * /rooming : le résumé hors saison (réunion du 2026-10-14) — le total de
 * lits par bâtiment, tiré de la référence d'aujourd'hui (il suit tout seul
 * les lits ajoutés ou retirés), et le plan de l'été en vigueur à un clic.
 */
export function Resume({ d }: { d: Donnees }) {
  const ecriture = useAuth().peutEcrire('rooming')
  const { racines, lits, chambres } = useMemo(() => arbreReference(d.structure), [d.structure])

  // Les bâtiments indépendants qui se suivent vont dans une même grille.
  const groupes: NoeudReference[][] = []
  for (const n of racines) {
    const dernier = groupes.at(-1)
    if (n.lieu.niveau !== 'site' && dernier && dernier[0].lieu.niveau !== 'site') dernier.push(n)
    else groupes.push([n])
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`${ui.carte} px-4 py-3`}>
          <div className="text-xs font-medium uppercase tracking-wide text-pierre-500">Lits aujourd'hui</div>
          <div className="text-3xl font-semibold tabular-nums">{lits}</div>
          <div className="text-sm text-pierre-500">{pluriel(chambres, 'chambre', 'chambres')}</div>
        </div>
        <LienPlan d={d} />
      </div>

      <p className="text-sm text-pierre-500">
        D'après la Référence : ces totaux suivent tout seuls les lits qu'on y ajoute ou retire.
        {ecriture && (
          <>
            {' '}
            <Link to="/rooming/reglages" className="font-medium text-foret-700 hover:underline">
              Modifier la référence
            </Link>
          </>
        )}
      </p>

      {groupes.map((g) =>
        g[0].lieu.niveau === 'site' ? (
          <Site key={g[0].lieu.id} n={g[0]} />
        ) : (
          <div key={g[0].lieu.id} className="grid gap-3 md:grid-cols-2">
            {g.map((n) => (
              <CarteBatiment key={n.lieu.id} n={n} />
            ))}
          </div>
        ),
      )}
      {racines.length === 0 && <p className="py-8 text-center text-sm text-pierre-500">La référence n'a encore aucune chambre.</p>}
    </div>
  )
}

/** Le plan de l'été en vigueur, à un clic. */
function LienPlan({ d }: { d: Donnees }) {
  const plan = d.plans.find((p) => p.en_vigueur)
  const totaux = useMemo(
    () => (plan ? arbrePlan(d.structure, d.occupations.filter((o) => o.plan_id === plan.id), []).totaux : null),
    [plan, d.structure, d.occupations],
  )
  if (!plan || !totaux) {
    return (
      <Link to="/rooming/plans" className="flex flex-col justify-center rounded-xl border border-dashed border-pierre-300 px-4 py-3 hover:bg-pierre-50">
        <span className="text-xs font-medium uppercase tracking-wide text-pierre-500">Plan de l'été</span>
        <span className="font-medium">Aucun plan en vigueur</span>
        <span className="text-sm font-medium text-foret-700">Voir tous les plans</span>
      </Link>
    )
  }
  return (
    <Link
      to={`/rooming/plan/${plan.id}`}
      className="group flex items-center justify-between gap-3 rounded-xl border border-foret-100 bg-foret-50 px-4 py-3 shadow-sm transition hover:border-foret-600 focus-visible:border-foret-600"
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-foret-700">Plan de l'été en vigueur</span>
        <span className="block truncate text-xl font-semibold text-pierre-900">{plan.nom}</span>
        <span className="block text-sm tabular-nums text-pierre-600">
          <span className="text-sky-800">{pluriel(totaux.enfants, 'enfant', 'enfants')}</span> ·{' '}
          <span className="text-amber-800">{pluriel(totaux.employes, 'employé', 'employés')}</span>
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foret-700 px-3 py-2 text-sm font-medium text-white group-hover:bg-foret-800">
        Ouvrir <IconeChevron className="size-4" />
      </span>
    </Link>
  )
}

/** Un site (le Camp) : son sous-total, puis ses bâtiments. */
function Site({ n }: { n: NoeudReference }) {
  return (
    <section className="rounded-2xl bg-pierre-50 p-3 ring-1 ring-pierre-200">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-pierre-600">{n.lieu.nom}</h2>
        <span className="text-sm text-pierre-600">
          Sous-total <strong className="text-lg tabular-nums text-pierre-900">{n.lits}</strong> {n.lits > 1 ? 'lits' : 'lit'}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {n.enfants.map((b) => (
          <CarteBatiment key={b.lieu.id} n={b} />
        ))}
      </div>
    </section>
  )
}

/** Un bâtiment : son total, puis chaque section (et ses étages en petit). */
function CarteBatiment({ n }: { n: NoeudReference }) {
  const { lieu } = n
  return (
    <div className={`${ui.carte} overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {lieu.nom}
            {lieu.code && lieu.code !== lieu.nom && <span className="ml-1.5 font-normal text-pierre-400">({lieu.code})</span>}
          </h3>
          <p className="text-xs text-pierre-500">{pluriel(n.chambres, 'chambre', 'chambres')}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="text-2xl font-semibold tabular-nums">{n.lits}</span>
          <span className="ml-1 text-sm text-pierre-500">{n.lits > 1 ? 'lits' : 'lit'}</span>
        </span>
      </div>
      {n.enfants.length > 0 && (
        <ul className="divide-y divide-pierre-100 border-t border-pierre-100">
          {n.enfants.map((s) => (
            <li key={s.lieu.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="text-sm font-medium text-pierre-800">{s.lieu.nom}</span>
                {s.enfants.length > 0 && (
                  <span className="block text-xs text-pierre-500">
                    {s.enfants.map((e, i) => (
                      <span key={e.lieu.id} title={e.lieu.nom} className="whitespace-nowrap">
                        {i > 0 && ' · '}
                        {e.lieu.code ?? e.lieu.nom} <span className="tabular-nums">{e.lits}</span>
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{pluriel(s.lits, 'lit', 'lits')}</span>
            </li>
          ))}
          {n.chambresPropres > 0 && (
            <li className="flex items-baseline justify-between gap-3 px-4 py-2">
              <span className="text-sm text-pierre-600">Autres chambres du bâtiment</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{pluriel(n.litsPropres, 'lit', 'lits')}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
