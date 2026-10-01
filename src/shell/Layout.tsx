import { useMutationState } from '@tanstack/react-query'
import { useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { IconeAttention } from '@/lib/icones'
import { useAuth } from './auth'
import { MODULES } from './modules'

const lien = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-foret-100 text-foret-800' : 'text-pierre-700 hover:bg-pierre-100'
  }`

export function Layout() {
  const { profil, estAdmin, estDirection, peutLire, deconnexion } = useAuth()
  const enAttente = useMutationState({ filters: { status: 'pending' } }).length
  // Même cadre pour tous les modules (pleine largeur, mêmes marges) : la
  // barre du haut et le bord du contenu ne bougent pas d'un module à l'autre.
  const marges = 'px-4 lg:px-6'

  // Hauteur de la barre du haut (--hauteur-entete) : ce qui colle sous elle
  // en tient compte (ex. en-tête de la grille de l'horaire).
  const entete = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = entete.current
    if (!el) return
    const maj = () => document.documentElement.style.setProperty('--hauteur-entete', `${el.offsetHeight}px`)
    maj()
    const observateur = new ResizeObserver(maj)
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [])

  const seDeconnecter = async () => {
    // La déconnexion efface le cache de l'appareil, file d'attente comprise.
    if (
      enAttente &&
      !(await confirmer({
        titre: 'Se déconnecter quand même ?',
        message: `${enAttente} modification(s) faite(s) hors ligne n'ont pas encore été envoyées et seront perdues.`,
        libelleOk: 'Se déconnecter',
        icone: <IconeAttention className="size-5" />,
      }))
    )
      return
    deconnexion()
  }

  return (
    <div className="min-h-dvh">
      <header ref={entete} className="sticky top-0 z-10 border-b border-pierre-200 bg-white/90 backdrop-blur print:hidden">
        <div className={`flex items-center gap-4 ${marges} py-2.5`}>
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
      <main className={`${marges} py-6 print:p-0`}>
        <Outlet />
      </main>
    </div>
  )
}
