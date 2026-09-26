import { useMutationState } from '@tanstack/react-query'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from './auth'
import { MODULES } from './modules'

const lien = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-foret-100 text-foret-800' : 'text-pierre-700 hover:bg-pierre-100'
  }`

export function Layout() {
  const { profil, estAdmin, estDirection, peutLire, deconnexion } = useAuth()
  const enAttente = useMutationState({ filters: { status: 'pending' } }).length

  const seDeconnecter = () => {
    // La déconnexion efface le cache de l'appareil, file d'attente comprise.
    if (
      enAttente &&
      !confirm(
        `${enAttente} modification(s) faite(s) hors ligne n'ont pas encore été envoyées et seront perdues. Se déconnecter quand même ?`,
      )
    )
      return
    deconnexion()
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-pierre-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">Gestion du camp</span>
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {MODULES.filter((m) => peutLire(m.id)).map((m) => (
              <NavLink key={m.id} to={m.chemin} className={lien}>
                <span className="mr-1">{m.icone}</span>
                {m.nom}
              </NavLink>
            ))}
            {estDirection && (
              <NavLink to="/referentiel" className={lien}>
                Référentiel
              </NavLink>
            )}
            {estAdmin && (
              <NavLink to="/utilisateurs" className={lien}>
                Utilisateurs
              </NavLink>
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-pierre-500 md:inline">
              {profil?.nom ?? profil?.courriel}
            </span>
            <button onClick={seDeconnecter} className="text-sm text-pierre-500 hover:text-pierre-900">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
