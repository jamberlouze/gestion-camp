import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'

/**
 * Carte de l'accueil avec sa liste. Chaque source de données est un
 * composant qui rend ses propres <li> (une `Ligne`, un `Groupe`) ou rien :
 * la phrase `vide` s'affiche quand aucune n'a rien à montrer. Une carte dont
 * la personne n'a aucun module ne se monte pas (voir chaque carte).
 */
export function Carte({ titre, lien, vide, children }: { titre: string; lien?: { to: string; texte: string }; vide: string; children: ReactNode }) {
  return (
    <section className={ui.carte}>
      <div className="flex items-center gap-3 border-b border-pierre-100 px-4 py-2.5">
        <h2 className="flex-1 text-sm font-semibold">{titre}</h2>
        {lien && (
          <Link to={lien.to} className="text-xs font-medium text-foret-700 hover:text-foret-800">
            {lien.texte}
          </Link>
        )}
      </div>
      <ul className="peer divide-y divide-pierre-100">{children}</ul>
      <p className="hidden px-4 py-3 text-sm text-pierre-500 peer-empty:block">{vide}</p>
    </section>
  )
}

/**
 * Lignes d'un même module sous un petit titre (« ✅ Mastertimeline · mes
 * tâches d'octobre ») ; `resume` à droite (« 1 en retard · 3 ce mois-ci »).
 * Ne rendre le groupe que s'il a au moins une ligne.
 */
export function Groupe({ icone, titre, resume, children }: { icone: string; titre: string; resume?: ReactNode; children: ReactNode }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 px-4 pt-2.5 pb-0.5">
        <span aria-hidden className="text-sm leading-none">
          {icone}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-pierre-500 uppercase">{titre}</h3>
        {resume && <span className="shrink-0 text-xs text-pierre-500">{resume}</span>}
      </div>
      <ul>{children}</ul>
    </li>
  )
}

/**
 * Une ligne cliquable : titre et détail (rouge si `alerte`). `icone` = émoji
 * du module (lignes hors d'un `Groupe`, avec `module` pour les lecteurs
 * d'écran) ; `pastille` = point de couleur des alertes ; `caseACocher` à
 * gauche et `action` à droite restent hors du lien.
 */
export function Ligne({
  to,
  titre,
  icone,
  module,
  detail,
  alerte,
  pastille,
  caseACocher,
  action,
  faite,
}: {
  to: string
  titre: ReactNode
  icone?: string
  module?: string
  detail?: ReactNode
  alerte?: boolean
  pastille?: 'forte' | 'douce'
  caseACocher?: ReactNode
  action?: ReactNode
  /** Cochée pendant cette visite : titre barré. */
  faite?: boolean
}) {
  return (
    <li className="flex items-center">
      {caseACocher && <span className="flex shrink-0 py-1.5 pl-4">{caseACocher}</span>}
      <Link
        to={to}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 hover:bg-pierre-50 focus-visible:bg-pierre-50 focus-visible:outline-none"
      >
        {icone && (
          <span aria-hidden title={module} className="w-5 shrink-0 text-center text-base leading-none">
            {icone}
          </span>
        )}
        {module && <span className="sr-only">{module} : </span>}
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${faite ? 'text-pierre-400 line-through' : ''}`}>
            {pastille && (
              <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${pastille === 'forte' ? 'bg-orange-600' : 'bg-pierre-400'}`} />
            )}
            <span className="min-w-0">{titre}</span>
          </span>
          {detail && <span className={`block text-xs ${alerte ? 'font-medium text-red-700' : 'text-pierre-500'}`}>{detail}</span>}
        </span>
        <IconeChevron className="size-4 text-pierre-300" />
      </Link>
      {action && <span className="shrink-0 pr-3">{action}</span>}
    </li>
  )
}

/** Ligne « et N autres » au bas d'une source tronquée. */
export function Autres({ n, to }: { n: number; to: string }) {
  if (n <= 0) return null
  return (
    <li>
      <Link to={to} className="block px-4 py-1.5 text-xs font-medium text-foret-700 hover:bg-pierre-50">
        et {n} autre{n > 1 ? 's' : ''}
      </Link>
    </li>
  )
}
