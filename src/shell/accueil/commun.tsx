import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'

/**
 * Carte de l'accueil avec sa liste. Chaque source de données est un
 * composant qui rend ses propres <li> (ou rien) : la phrase `vide`
 * s'affiche quand aucune n'a rien à montrer.
 */
export function Carte({ titre, lien, vide, children }: { titre: string; lien?: { to: string; texte: string }; vide: string; children: ReactNode }) {
  return (
    <section className={ui.carte}>
      <div className="flex items-center gap-3 border-b border-pierre-100 px-5 py-4">
        <h2 className="flex-1 font-semibold">{titre}</h2>
        {lien && (
          <Link to={lien.to} className="text-sm font-medium text-foret-700 hover:text-foret-800">
            {lien.texte}
          </Link>
        )}
      </div>
      <ul className="peer divide-y divide-pierre-100">{children}</ul>
      <p className="hidden px-5 py-4 text-sm text-pierre-500 peer-empty:block">{vide}</p>
    </section>
  )
}

/** Une ligne cliquable : titre, module d'où elle vient, détail (rouge si `alerte`). */
export function Ligne({
  to,
  titre,
  module,
  detail,
  alerte,
  pastille,
  caseACocher,
  faite,
}: {
  to: string
  titre: ReactNode
  module?: string
  detail?: ReactNode
  alerte?: boolean
  /** Point de couleur devant le titre (alertes). */
  pastille?: 'forte' | 'douce'
  /** Case à cocher du module, à gauche (hors du lien). */
  caseACocher?: ReactNode
  /** Cochée pendant cette visite : titre barré. */
  faite?: boolean
}) {
  return (
    <li className="flex items-center">
      {caseACocher && <span className="flex shrink-0 py-3 pl-5">{caseACocher}</span>}
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 hover:bg-pierre-50 focus-visible:bg-pierre-50 focus-visible:outline-none">
        {pastille && (
          <span className={`size-2 shrink-0 self-start rounded-full mt-2 ${pastille === 'forte' ? 'bg-orange-600' : 'bg-pierre-400'}`} />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block font-medium ${faite ? 'text-pierre-400 line-through' : ''}`}>{titre}</span>
          {(module || detail) && (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-pierre-500">
              {module && <span className="rounded-md bg-pierre-100 px-2 py-0.5 text-pierre-700">{module}</span>}
              {detail && <span className={alerte ? 'font-medium text-red-700' : ''}>{detail}</span>}
            </span>
          )}
        </span>
        <IconeChevron className="size-4 text-pierre-400" />
      </Link>
    </li>
  )
}

/** Ligne « et N autres » au bas d'une source tronquée. */
export function Autres({ n, to }: { n: number; to: string }) {
  if (n <= 0) return null
  return (
    <li>
      <Link to={to} className="block px-5 py-2.5 text-sm font-medium text-foret-700 hover:bg-pierre-50">
        et {n} autre{n > 1 ? 's' : ''}
      </Link>
    </li>
  )
}
