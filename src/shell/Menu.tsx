import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { estCourante, type Entree } from './entreesMenu'
import { FAMILLES, type DefinitionFamille } from './modules'

/**
 * Menu par familles (version A des maquettes, en compact : choix de Maxime) :
 * une liste avec le nom de chaque module, sous un titre de famille discret
 * (avec la petite icône de la famille) qui se replie d'un clic ; Améliorations,
 * Référentiel et Utilisateurs en rangée d'icônes en bas. Même liste dans le
 * tiroir du téléphone. Menu réduit = un bouton par famille qui ouvre sa
 * sous-liste. Moins de 7 entrées en tout (ex. un compte Terrain) : liste à
 * plat avec les noms, sans familles.
 */
const SEUIL_FAMILLES = 7

// Familles repliées : gardées sur l'appareil.
const CLE_REPLIEES = 'menu-familles-repliees'

interface Groupe {
  /** null = la rangée du bas, sans titre. */
  famille: DefinitionFamille | null
  entrees: Entree[]
}

/** Familles dans l'ordre de FAMILLES, puis la rangée du bas ; une famille vide disparaît. */
function grouper(entrees: Entree[]): Groupe[] {
  return [
    ...FAMILLES.map((f) => ({ famille: f, entrees: entrees.filter((e) => e.famille === f.id) })),
    { famille: null, entrees: entrees.filter((e) => e.famille === 'bas') },
  ].filter((g) => g.entrees.length)
}

const libelle = (e: Entree) => (e.cache || e.admins ? `${e.nom} · admins seulement` : e.nom)

const focusVisible = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foret-600'

export function Menu({ entrees, mode }: { entrees: Entree[]; mode: 'ouvert' | 'reduit' | 'tiroir' }) {
  const bulle = useBulle()
  const groupes = grouper(entrees)
  const aPlat = entrees.length < SEUIL_FAMILLES
  const tiroir = mode === 'tiroir'
  const bas = groupes.find((g) => !g.famille)

  let contenu: ReactNode
  if (mode === 'reduit') contenu = aPlat ? <IconesAPlat groupes={groupes} bulle={bulle} /> : <FamillesReduites groupes={groupes} bulle={bulle} />
  else if (aPlat) contenu = <ListeAPlat groupes={groupes} />
  else contenu = <ListeFamilles groupes={groupes} tiroir={tiroir} />

  return (
    <>
      <nav
        aria-label="Modules"
        onScroll={bulle.cacher}
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${mode === 'reduit' ? 'items-center px-1 py-2' : tiroir ? 'p-2' : 'px-2 py-1.5'}`}
      >
        {contenu}
      </nav>
      {/* Menu ouvert et tiroir, avec familles : la rangée du bas, en icônes. */}
      {mode !== 'reduit' && !aPlat && bas && <RangeeBas entrees={bas.entrees} tiroir={tiroir} bulle={bulle} />}
      {bulle.element}
    </>
  )
}

// ---------------------------------------------------------------------------
// Menu ouvert (ordinateur) et tiroir (téléphone) : liste par familles repliables.

function useFamillesRepliees(): [string[], (id: string) => void] {
  const [repliees, setRepliees] = useState<string[]>(() => {
    try {
      const brut = JSON.parse(localStorage.getItem(CLE_REPLIEES) ?? '[]')
      return Array.isArray(brut) ? brut : []
    } catch {
      return []
    }
  })
  const basculer = (id: string) =>
    setRepliees((avant) => {
      const apres = avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]
      try {
        localStorage.setItem(CLE_REPLIEES, JSON.stringify(apres))
      } catch {
        // Stockage indisponible : le choix vaut pour la session.
      }
      return apres
    })
  return [repliees, basculer]
}

/**
 * Lignes serrées sur ordinateur (28 px : tout le menu d'un admin tient dans
 * un écran de portable), plus hautes dans le tiroir (doigt). Une famille
 * repliée garde visible le module de la page ouverte.
 */
function ListeFamilles({ groupes, tiroir }: { groupes: Groupe[]; tiroir: boolean }) {
  const { pathname } = useLocation()
  const [repliees, basculer] = useFamillesRepliees()
  const familles = groupes.filter((g) => g.famille)

  return (
    <div className="flex flex-col">
      {familles.map(({ famille, entrees }, i) => {
        const f = famille!
        const repliee = repliees.includes(f.id)
        const visibles = repliee ? entrees.filter((e) => estCourante(e, pathname)) : entrees
        return (
          <div key={f.id} className={i ? (tiroir ? 'mt-1.5' : 'mt-1') : ''}>
            <button
              type="button"
              id={`famille-${f.id}`}
              aria-expanded={!repliee}
              aria-controls={`liste-famille-${f.id}`}
              onClick={() => basculer(f.id)}
              className={`flex w-full items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold tracking-wide text-pierre-500 uppercase hover:text-pierre-800 ${focusVisible} ${
                tiroir ? 'h-[26px]' : 'h-[22px]'
              }`}
            >
              <IconeFamille id={f.id} className="size-3.5" />
              <span className="min-w-0 flex-1 truncate text-left">{f.nom}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={`size-3.5 shrink-0 transition-transform ${repliee ? '-rotate-90' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <ul id={`liste-famille-${f.id}`} aria-labelledby={`famille-${f.id}`}>
              {visibles.map((e) => (
                <li key={e.chemin}>
                  <LigneModule entree={e} hauteur={tiroir ? 'h-9' : 'h-7'} />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Améliorations, Référentiel, Utilisateurs : icônes, nom au survol et au focus. */
function RangeeBas({ entrees, tiroir, bulle }: { entrees: Entree[]; tiroir: boolean; bulle: Bulle }) {
  return (
    <div className="flex shrink-0 gap-0.5 border-t border-pierre-200 px-2 py-1.5">
      {entrees.map((e) => (
        <NavLink
          key={e.chemin}
          to={e.chemin}
          aria-label={libelle(e)}
          {...bulle.sur(libelle(e), 'haut')}
          className={({ isActive }) =>
            `flex items-center justify-center rounded-lg text-base leading-none ${tiroir ? 'h-9 w-11' : 'h-8 w-10'} ${focusVisible} ${
              isActive ? 'bg-foret-100 ring-[1.5px] ring-foret-600 ring-inset' : 'hover:bg-pierre-100'
            }`
          }
        >
          <span aria-hidden>{e.icone}</span>
        </NavLink>
      ))}
    </div>
  )
}

/** Une ligne : icône + nom (+ « admins » pour un module caché aux autres ou réservé aux admins). */
function LigneModule({ entree: e, hauteur, onClick }: { entree: Entree; hauteur: string; onClick?: () => void }) {
  return (
    <NavLink to={e.chemin} onClick={onClick} aria-label={libelle(e)} className={({ isActive }) => classeLigne(isActive, hauteur, e.cache)}>
      <span aria-hidden className={`w-5 shrink-0 text-center text-base leading-none ${e.cache ? 'opacity-45' : ''}`}>
        {e.icone}
      </span>
      <span aria-hidden className="truncate">
        {e.nom}
      </span>
      {(e.cache || e.admins) && <MarqueAdmins />}
    </NavLink>
  )
}

const classeLigne = (actif: boolean, hauteur: string, cache?: boolean) =>
  `flex ${hauteur} items-center gap-3 rounded-lg px-2.5 text-sm font-medium ${focusVisible} ${
    actif ? 'bg-foret-100 text-foret-800' : cache ? 'text-pierre-500 hover:bg-pierre-100' : 'text-pierre-700 hover:bg-pierre-100'
  }`

function MarqueAdmins() {
  return (
    <span aria-hidden className="ml-auto shrink-0 rounded-full border border-pierre-200 px-1.5 text-[11px] leading-4 font-medium text-pierre-500">
      admins
    </span>
  )
}

// ---------------------------------------------------------------------------
// Moins de 7 entrées : liste à plat avec les noms (ouvert, tiroir) ou icônes (réduit).

function ListeAPlat({ groupes }: { groupes: Groupe[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {groupes.map((g) => (
        <ul key={g.famille?.id ?? 'bas'} className={`flex flex-col gap-0.5 ${g.famille ? '' : 'mt-2 border-t border-pierre-200 pt-2'}`}>
          {g.entrees.map((e) => (
            <li key={e.chemin}>
              <LigneModule entree={e} hauteur="h-9" />
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

function IconesAPlat({ groupes, bulle }: { groupes: Groupe[]; bulle: Bulle }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {groupes.map((g) => (
        <ul key={g.famille?.id ?? 'bas'} className={`flex flex-col items-center gap-0.5 ${g.famille ? '' : 'mt-1.5 border-t border-pierre-200 pt-1.5'}`}>
          {g.entrees.map((e) => (
            <li key={e.chemin}>
              <IconeSeule entree={e} bulle={bulle} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

function IconeSeule({ entree: e, bulle }: { entree: Entree; bulle: Bulle }) {
  return (
    <NavLink
      to={e.chemin}
      aria-label={libelle(e)}
      {...bulle.sur(libelle(e), 'droite')}
      className={({ isActive }) =>
        `flex h-9 w-12 items-center justify-center rounded-lg text-base leading-none ${focusVisible} ${isActive ? 'bg-foret-100 ring-[1.5px] ring-foret-600 ring-inset' : 'hover:bg-pierre-100'}`
      }
    >
      <span aria-hidden className={e.cache ? 'opacity-45' : ''}>
        {e.icone}
      </span>
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// Menu réduit (ordinateur) : un bouton par famille, qui ouvre sa sous-liste.

function FamillesReduites({ groupes, bulle }: { groupes: Groupe[]; bulle: Bulle }) {
  const { pathname } = useLocation()
  const [ouverte, setOuverte] = useState<{ id: string; bouton: HTMLButtonElement } | null>(null)
  const familles = groupes.filter((g) => g.famille)
  const bas = groupes.find((g) => !g.famille)

  return (
    <>
      <ul className="flex flex-col items-center gap-1">
        {familles.map(({ famille, entrees }) => {
          const f = famille!
          const courante = entrees.find((e) => estCourante(e, pathname))
          const estOuverte = ouverte?.id === f.id
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-expanded={estOuverte}
                aria-controls={estOuverte ? `sous-liste-${f.id}` : undefined}
                aria-label={courante ? `${f.nom} (page ouverte : ${courante.nom})` : f.nom}
                onClick={(ev) => {
                  bulle.cacher()
                  setOuverte(estOuverte ? null : { id: f.id, bouton: ev.currentTarget })
                }}
                className={`flex h-[52px] w-14 flex-col items-center justify-center gap-1 rounded-[10px] ${focusVisible} ${
                  courante ? 'bg-foret-100 text-foret-800' : estOuverte ? 'bg-pierre-100 text-pierre-900' : 'text-pierre-600 hover:bg-pierre-100'
                } ${courante && estOuverte ? 'ring-[1.5px] ring-foret-600 ring-inset' : ''}`}
              >
                <IconeFamille id={f.id} className="size-5" />
                <span aria-hidden className={`text-[10px] leading-none ${courante ? 'font-semibold' : 'font-medium'}`}>
                  {f.nomCourt}
                </span>
              </button>
              {estOuverte && <SousListe famille={f} entrees={entrees} bouton={ouverte.bouton} fermer={() => setOuverte(null)} />}
            </li>
          )
        })}
      </ul>
      {bas && (
        <>
          <div aria-hidden className="my-1.5 h-px w-9 shrink-0 bg-pierre-200" />
          <ul className="flex flex-col items-center gap-0.5">
            {bas.entrees.map((e) => (
              <li key={e.chemin}>
                <IconeSeule entree={e} bulle={bulle} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/**
 * Sous-liste d'une famille, à droite de son bouton. Placée juste après le
 * bouton dans la page (Tab y entre) mais en `fixed` (le défilement du menu
 * ne la coupe pas). Se ferme avec Échap (retour au bouton), un clic ailleurs,
 * en sortant au clavier ou en choisissant un module.
 */
function SousListe({
  famille,
  entrees,
  bouton,
  fermer,
}: {
  famille: DefinitionFamille
  entrees: Entree[]
  bouton: HTMLButtonElement
  fermer: () => void
}) {
  const boite = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = boite.current
    if (!el) return
    const r = bouton.getBoundingClientRect()
    el.style.left = `${r.right + 6}px`
    el.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - el.offsetHeight - 8))}px`
    el.style.visibility = 'visible'
  }, [bouton])

  useEffect(() => {
    const ailleurs = (e: globalThis.PointerEvent) => {
      const cible = e.target as Node
      if (!boite.current?.contains(cible) && !bouton.contains(cible)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      fermer()
      bouton.focus()
    }
    document.addEventListener('pointerdown', ailleurs)
    window.addEventListener('keydown', touche)
    window.addEventListener('resize', fermer)
    return () => {
      document.removeEventListener('pointerdown', ailleurs)
      window.removeEventListener('keydown', touche)
      window.removeEventListener('resize', fermer)
    }
  }, [bouton, fermer])

  const sortie = (e: FocusEvent<HTMLDivElement>) => {
    const vers = e.relatedTarget as Node | null
    if (vers && !e.currentTarget.contains(vers) && vers !== bouton) fermer()
  }

  return (
    <div
      ref={boite}
      id={`sous-liste-${famille.id}`}
      onBlur={sortie}
      className="invisible fixed z-30 w-56 rounded-xl border border-pierre-200 bg-white p-1.5 shadow-lg"
    >
      <p id={`titre-sous-liste-${famille.id}`} className="flex h-[26px] items-center px-2.5 text-xs font-semibold tracking-wide text-pierre-500 uppercase">
        {famille.nom}
      </p>
      <ul aria-labelledby={`titre-sous-liste-${famille.id}`}>
        {entrees.map((e) => (
          <li key={e.chemin}>
            <LigneModule entree={e} hauteur="h-[34px]" onClick={fermer} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Info-bulle (nom du module) : au survol de la souris et au focus clavier.
// Une seule à la fois, en `fixed` dans `body` (le menu défile : une bulle
// placée dedans serait coupée). Purement visuelle : le nom est déjà dans
// l'aria-label du lien.

type Cote = 'haut' | 'droite'
interface Visee {
  texte: string
  cible: HTMLElement
  cote: Cote
}

interface Bulle {
  sur: (
    texte: string,
    cote: Cote,
  ) => {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => void
    onPointerLeave: () => void
    onFocus: (e: FocusEvent<HTMLElement>) => void
    onBlur: () => void
  }
  cacher: () => void
  element: ReactNode
}

function useBulle(): Bulle {
  const [visee, setVisee] = useState<Visee | null>(null)
  const cacher = () => setVisee(null)
  return {
    sur: (texte, cote) => ({
      onPointerEnter: (e) => {
        if (e.pointerType === 'mouse') setVisee({ texte, cible: e.currentTarget, cote })
      },
      onPointerLeave: cacher,
      // Au clavier seulement : un clic de souris donne aussi le focus.
      onFocus: (e) => {
        if (e.currentTarget.matches(':focus-visible')) setVisee({ texte, cible: e.currentTarget, cote })
      },
      onBlur: cacher,
    }),
    cacher,
    element: visee && <InfoBulle visee={visee} />,
  }
}

function InfoBulle({ visee }: { visee: Visee }) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const b = el.current
    if (!b) return
    const r = visee.cible.getBoundingClientRect()
    const l = b.offsetWidth
    const h = b.offsetHeight
    const gauche = visee.cote === 'haut' ? Math.min(Math.max(r.left + r.width / 2 - l / 2, 4), window.innerWidth - l - 4) : r.right + 8
    const haut = visee.cote === 'haut' ? r.top - h - 6 : r.top + r.height / 2 - h / 2
    b.style.left = `${gauche}px`
    b.style.top = `${haut}px`
    b.style.visibility = 'visible'
  }, [visee])
  return createPortal(
    <div
      ref={el}
      aria-hidden
      className="pointer-events-none invisible fixed top-0 left-0 z-50 rounded-md bg-pierre-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg print:hidden"
    >
      {visee.texte}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------

const TRACES: Record<DefinitionFamille['id'], ReactNode> = {
  // Tente
  operations: (
    <>
      <path d="M3 20h18" />
      <path d="M5 20 12 6l7 14" />
      <path d="M12 6V3" />
      <path d="m10 20 2-4 2 4" />
    </>
  ),
  // Maison
  batiment: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // Planchette
  gestion: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2.5h6v3H9z" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  // Deux personnes
  equipe: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2a5 5 0 0 1 5 4.8" />
    </>
  ),
}

/** Icône au trait d'une famille (menu ouvert et tiroir : à côté du titre ; menu réduit : le bouton). */
export function IconeFamille({ id, className = 'size-4' }: { id: DefinitionFamille['id']; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {TRACES[id]}
    </svg>
  )
}
