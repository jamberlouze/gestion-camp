import { useMutationState } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { IconeAttention, IconeDeconnexion, IconeFermer, IconeReduireMenu, IconeTroisTraits } from '@/lib/icones'
import { useAuth } from './auth'
import { MODULES } from './modules'
import { CoinPoke, FournisseurPoke } from './Poke'

// Menu réduit (icônes seulement) : retenu sur l'appareil.
const CLE_REPLIE = 'menu-replie'

interface Entree {
  chemin: string
  nom: string
  icone: string
}

export function Layout() {
  const { profil, estAdmin, estDirection, peutLire, deconnexion } = useAuth()
  const enAttente = useMutationState({ filters: { status: 'pending' } }).length
  const { pathname } = useLocation()
  const [ouvert, setOuvert] = useState(false)
  const [replie, setReplie] = useState(() => {
    try {
      return localStorage.getItem(CLE_REPLIE) === '1'
    } catch {
      return false
    }
  })

  const basculerReplie = () => {
    setReplie((r) => {
      try {
        localStorage.setItem(CLE_REPLIE, r ? '0' : '1')
      } catch {
        // Stockage indisponible : le choix vaut pour la session.
      }
      return !r
    })
  }

  // Largeur du menu latéral (--largeur-menu, ordinateur seulement) : ce qui
  // est fixé en bas de l'écran se centre sur le contenu (lg:left-(--largeur-menu)).
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--largeur-menu', replie ? '4rem' : '15rem')
  }, [replie])

  // Hauteur de la barre du haut (--hauteur-entete, téléphone seulement ; 0 sur
  // ordinateur) : ce qui colle sous elle en tient compte (ex. en-tête de la
  // grille de l'horaire).
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

  // Le tiroir (téléphone) se ferme dès qu'on change de page, ou avec Échap.
  useEffect(() => setOuvert(false), [pathname])
  useEffect(() => {
    if (!ouvert) return
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [ouvert])

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

  const modules: Entree[] = MODULES.filter((m) => peutLire(m.id))
  const gestion: Entree[] = [
    ...(estDirection ? [{ chemin: '/referentiel', nom: 'Référentiel', icone: '🗂️' }] : []),
    ...(estAdmin ? [{ chemin: '/utilisateurs', nom: 'Utilisateurs', icone: '👥' }] : []),
  ]
  const courant = [...modules, ...gestion].find((m) => pathname === m.chemin || pathname.startsWith(`${m.chemin}/`))

  // Contenu du menu, commun au menu latéral (ordinateur) et au tiroir (téléphone).
  // `tiroir` : le tiroir du téléphone (le coin du poke est alors dans la barre du haut).
  const menu = (reduit: boolean, tiroir = false) => {
    const lien = ({ isActive }: { isActive: boolean }) =>
      `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium ${reduit ? 'justify-center' : ''} ${
        isActive ? 'bg-foret-100 text-foret-800' : 'text-pierre-700 hover:bg-pierre-100'
      }`
    const entree = (m: Entree) => (
      <NavLink key={m.chemin} to={m.chemin} className={lien} title={reduit ? m.nom : undefined}>
        <span className="w-5 shrink-0 text-center text-base leading-none">{m.icone}</span>
        {!reduit && <span className="truncate">{m.nom}</span>}
      </NavLink>
    )
    return (
      <>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {modules.map(entree)}
          {gestion.length > 0 && (
            <>
              <div className="mx-2.5 my-2 border-t border-pierre-200" />
              {gestion.map(entree)}
            </>
          )}
        </nav>
        <div className={`flex items-center gap-2 border-t border-pierre-200 p-2 ${reduit ? 'flex-col' : ''}`}>
          {!reduit && (
            <span className="min-w-0 flex-1 truncate px-2.5 text-sm text-pierre-500" title={profil?.courriel}>
              {profil?.nom ?? profil?.courriel}
            </span>
          )}
          {!tiroir && <CoinPoke place="menu" />}
          <button
            onClick={seDeconnecter}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="rounded-lg p-2 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
          >
            <IconeDeconnexion />
          </button>
        </div>
      </>
    )
  }

  const logo = (reduit: boolean) => (
    <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold" title={reduit ? 'Accueil' : undefined}>
      <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
      {!reduit && <span className="truncate">Gestion du camp</span>}
    </Link>
  )

  return (
    <FournisseurPoke>
      <div className="min-h-dvh lg:pl-(--largeur-menu) print:pl-0">
        {/* Ordinateur : menu latéral fixe, réductible aux icônes. */}
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-(--largeur-menu) flex-col border-r border-pierre-200 bg-white lg:flex print:hidden">
          <div className={`flex h-14 shrink-0 items-center gap-2 border-b border-pierre-200 px-3 ${replie ? 'justify-center' : ''}`}>
            {!replie && <div className="min-w-0 flex-1">{logo(false)}</div>}
            <button
              onClick={basculerReplie}
              title={replie ? 'Déployer le menu' : 'Réduire le menu'}
              aria-label={replie ? 'Déployer le menu' : 'Réduire le menu'}
              className="rounded-lg p-1.5 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
            >
              <IconeReduireMenu className={`size-5 ${replie ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {menu(replie)}
        </aside>

        {/* Téléphone et tablette : barre du haut + tiroir. */}
        <header
          ref={entete}
          className="sticky top-0 z-10 flex items-center gap-3 border-b border-pierre-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden print:hidden"
        >
          <button
            onClick={() => setOuvert(true)}
            aria-label="Ouvrir le menu"
            className="-ml-1.5 rounded-lg p-1.5 text-pierre-700 hover:bg-pierre-100"
          >
            <IconeTroisTraits className="size-5" />
          </button>
          {courant ? (
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="text-lg leading-none">{courant.icone}</span>
              <span className="truncate">{courant.nom}</span>
            </span>
          ) : (
            logo(false)
          )}
          <div className="ml-auto">
            <CoinPoke place="entete" />
          </div>
        </header>
        {ouvert && (
          <div className="fixed inset-0 z-40 lg:hidden print:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOuvert(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col bg-white shadow-xl">
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-pierre-200 px-3">
                <div className="min-w-0 flex-1">{logo(false)}</div>
                <button
                  onClick={() => setOuvert(false)}
                  aria-label="Fermer le menu"
                  className="rounded-lg p-1.5 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
                >
                  <IconeFermer className="size-5" />
                </button>
              </div>
              {menu(false, true)}
            </aside>
          </div>
        )}

        <main className="px-4 py-6 lg:px-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </FournisseurPoke>
  )
}
