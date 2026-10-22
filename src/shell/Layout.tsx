import { useMutationState } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { IconeAttention, IconeDeconnexion, IconeFermer, IconeReduireMenu, IconeTroisTraits } from '@/lib/icones'
import { useAuth } from './auth'
import { FrontiereErreur } from './FrontiereErreur'
import { estCourante, type Entree } from './entreesMenu'
import { Menu } from './Menu'
import { estEntree, MODULES } from './modules'
import { CoinMaquette } from './CoinMaquette'
import { CoinPoke, FournisseurPoke } from './Poke'

// Menu réduit (icônes seulement) : retenu sur l'appareil.
const CLE_REPLIE = 'menu-replie'

export function Layout() {
  const { profil, estDirection, peutOuvrir, reserveAuxAdmins, deconnexion } = useAuth()
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

  // Pas d'entrée « Accueil » : le logo y ramène. La famille de chaque module
  // vient de modules.ts ; Référentiel et Utilisateurs vont dans la rangée du bas.
  const entrees: Entree[] = [
    ...MODULES.filter((m) => estEntree(m) && peutOuvrir(m.id)).map((m) => ({
      chemin: m.chemin,
      nom: m.nom,
      icone: m.icone,
      famille: m.famille,
      cache: !!m.cacheSaufAdmins,
      admins: reserveAuxAdmins(m.id),
    })),
    ...(estDirection ? [{ chemin: '/referentiel', nom: 'Référentiel', icone: '🗂️', famille: 'bas' as const }] : []),
    // La direction y voit les comptes et en ajoute (Terrain, Coordonnateur) ; seul un admin y change quelque chose.
    ...(estDirection ? [{ chemin: '/utilisateurs', nom: 'Utilisateurs', icone: '🔑', famille: 'bas' as const }] : []),
  ]
  const courant = entrees.find((e) => estCourante(e, pathname))

  // Pied du menu : nom, œuf de Pâques, poke, déconnexion. `tiroir` : le tiroir
  // du téléphone (la maquette et le poke sont alors dans la barre du haut).
  const pied = (reduit: boolean, tiroir = false) => (
    <div className={`flex shrink-0 items-center gap-2 border-t border-pierre-200 p-2 ${reduit ? 'flex-col' : ''}`}>
      {!reduit && (
        <span className="min-w-0 flex-1 truncate px-2.5 text-sm text-pierre-500" title={profil?.courriel}>
          {profil?.nom ?? profil?.courriel}
        </span>
      )}
      {!tiroir && <CoinMaquette />}
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
  )

  const logo = (
    <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold" title="Accueil">
      <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
      <span className="truncate">Gestion du camp</span>
    </Link>
  )

  return (
    <FournisseurPoke>
      <div className="min-h-dvh lg:pl-(--largeur-menu) print:pl-0">
        {/* Ordinateur : menu latéral fixe, réductible (un bouton par famille). */}
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-(--largeur-menu) flex-col border-r border-pierre-200 bg-white lg:flex print:hidden">
          <div
            className={`flex shrink-0 border-b border-pierre-200 ${replie ? 'flex-col items-center gap-1 py-2' : 'h-14 items-center gap-2 px-3'}`}
          >
            {replie ? (
              // Réduit : le logo seul ramène aussi à l'accueil.
              <Link to="/" aria-label="Accueil" title="Accueil" className="rounded-lg p-1 hover:bg-pierre-100">
                <img src="/favicon.svg" alt="" className="h-7 w-7" />
              </Link>
            ) : (
              <div className="min-w-0 flex-1">{logo}</div>
            )}
            <button
              onClick={basculerReplie}
              title={replie ? 'Déployer le menu' : 'Réduire le menu'}
              aria-label={replie ? 'Déployer le menu' : 'Réduire le menu'}
              className="rounded-lg p-1.5 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
            >
              <IconeReduireMenu className={`size-5 ${replie ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <Menu entrees={entrees} mode={replie ? 'reduit' : 'ouvert'} />
          {pied(replie)}
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
            logo
          )}
          <div className="ml-auto flex items-center">
            <CoinMaquette />
            <CoinPoke place="entete" />
          </div>
        </header>
        {ouvert && (
          <div className="fixed inset-0 z-40 lg:hidden print:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOuvert(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col bg-white shadow-xl">
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-pierre-200 px-3">
                <div className="min-w-0 flex-1">{logo}</div>
                <button
                  onClick={() => setOuvert(false)}
                  aria-label="Fermer le menu"
                  className="rounded-lg p-1.5 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
                >
                  <IconeFermer className="size-5" />
                </button>
              </div>
              <Menu entrees={entrees} mode="tiroir" />
              {pied(false, true)}
            </aside>
          </div>
        )}

        <main className="px-4 py-6 lg:px-6 print:p-0">
          {/* Une page qui plante n'emporte pas le menu. */}
          <FrontiereErreur chemin={pathname}>
            <Outlet />
          </FrontiereErreur>
        </main>
      </div>
    </FournisseurPoke>
  )
}
