import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { estCourante, type Entree } from './entreesMenu'
import { FAMILLES, type DefinitionFamille } from './modules'

/**
 * Menu par familles (version B des maquettes, choix de Maxime) : une rangée
 * d'icônes par famille, le nom au survol ; sur téléphone (et sur un écran
 * tactile sans survol), des tuiles avec les noms ; menu réduit = un bouton
 * par famille qui ouvre sa sous-liste. Moins de 7 entrées en tout (ex. un
 * compte Terrain) : liste à plat avec les noms, sans familles.
 */
const SEUIL_FAMILLES = 7

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

const libelle = (e: Entree) => (e.cache ? `${e.nom} · admins seulement` : e.nom)

const focusVisible = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foret-600'

export function Menu({ entrees, mode }: { entrees: Entree[]; mode: 'ouvert' | 'reduit' | 'tiroir' }) {
  const sansSurvol = useSansSurvol()
  const bulle = useBulle()
  const groupes = grouper(entrees)
  const aPlat = entrees.length < SEUIL_FAMILLES

  let contenu: ReactNode
  if (mode === 'reduit') contenu = aPlat ? <IconesAPlat groupes={groupes} bulle={bulle} /> : <FamillesReduites groupes={groupes} bulle={bulle} />
  else if (aPlat) contenu = <ListeAPlat groupes={groupes} />
  else if (mode === 'tiroir' || sansSurvol) contenu = <Tuiles groupes={groupes} />
  else contenu = <Rangees groupes={groupes} bulle={bulle} />

  return (
    <nav
      aria-label="Modules"
      onScroll={bulle.cacher}
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${mode === 'reduit' ? 'items-center px-1 py-2' : 'px-2 py-2.5'}`}
    >
      {contenu}
      {bulle.element}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Menu ouvert (ordinateur) : une rangée d'icônes par famille.

function Rangees({ groupes, bulle }: { groupes: Groupe[]; bulle: Bulle }) {
  return (
    <div className="flex flex-col gap-3">
      {groupes.map((g) => (
        <div key={g.famille?.id ?? 'bas'} className={g.famille ? '' : 'border-t border-pierre-200 pt-3'}>
          {g.famille && <TitreFamille famille={g.famille} />}
          <ul aria-labelledby={g.famille ? `famille-${g.famille.id}` : undefined} className="flex flex-wrap gap-[3px]">
            {g.entrees.map((e) => (
              <li key={e.chemin}>
                <NavLink
                  to={e.chemin}
                  aria-label={libelle(e)}
                  {...bulle.sur(libelle(e), 'bas')}
                  className={({ isActive }) =>
                    `flex size-[34px] items-center justify-center rounded-lg text-lg leading-none ${focusVisible} ${
                      isActive ? 'bg-foret-100 ring-[1.5px] ring-foret-600 ring-inset' : 'hover:bg-pierre-100'
                    }`
                  }
                >
                  <span aria-hidden className={e.cache ? 'opacity-45' : ''}>
                    {e.icone}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Titre d'une famille, avec sa petite icône (la même que dans le menu réduit ; demande de Maxime). */
function TitreFamille({ famille }: { famille: DefinitionFamille }) {
  return (
    <div id={`famille-${famille.id}`} className="mb-0.5 flex h-[22px] items-center gap-1.5 px-1.5 text-xs font-semibold tracking-wide text-pierre-500 uppercase">
      <IconeFamille id={famille.id} className="size-3.5" />
      {famille.nom}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Téléphone (tiroir) et écran sans survol : tuiles avec les noms.

function Tuiles({ groupes }: { groupes: Groupe[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {groupes.map((g) => (
        <div key={g.famille?.id ?? 'bas'} className={g.famille ? '' : 'border-t border-pierre-200 pt-2.5'}>
          {g.famille && <TitreFamille famille={g.famille} />}
          <ul aria-labelledby={g.famille ? `famille-${g.famille.id}` : undefined} className="grid grid-cols-3 gap-1">
            {g.entrees.map((e) => (
              <li key={e.chemin}>
                <NavLink
                  to={e.chemin}
                  aria-label={libelle(e)}
                  className={({ isActive }) =>
                    `flex h-[66px] flex-col items-center gap-1 rounded-[10px] px-1 pt-2 ${focusVisible} ${
                      isActive ? 'bg-foret-100 text-foret-800' : e.cache ? 'text-pierre-500 hover:bg-pierre-100' : 'text-pierre-700 hover:bg-pierre-100'
                    }`
                  }
                >
                  <span aria-hidden className={`text-[22px] leading-none ${e.cache ? 'opacity-45' : ''}`}>
                    {e.icone}
                  </span>
                  <span aria-hidden className="line-clamp-2 max-w-full text-center text-[11px] leading-[13px] font-medium break-words hyphens-auto">
                    {e.nom}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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
              <NavLink to={e.chemin} aria-label={libelle(e)} className={({ isActive }) => classeLigne(isActive, e.cache)}>
                <span aria-hidden className={`w-5 shrink-0 text-center text-base leading-none ${e.cache ? 'opacity-45' : ''}`}>
                  {e.icone}
                </span>
                <span aria-hidden className="truncate">
                  {e.nom}
                </span>
                {e.cache && <MarqueAdmins />}
              </NavLink>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

const classeLigne = (actif: boolean, cache?: boolean) =>
  `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium ${focusVisible} ${
    actif ? 'bg-foret-100 text-foret-800' : cache ? 'text-pierre-500 hover:bg-pierre-100' : 'text-pierre-700 hover:bg-pierre-100'
  }`

function MarqueAdmins() {
  return (
    <span aria-hidden className="ml-auto shrink-0 rounded-full border border-pierre-200 px-1.5 text-[11px] leading-4 font-medium text-pierre-500">
      admins
    </span>
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
            <NavLink to={e.chemin} onClick={fermer} aria-label={libelle(e)} className={({ isActive }) => classeLigne(isActive, e.cache)}>
              <span aria-hidden className={`w-5 shrink-0 text-center text-base leading-none ${e.cache ? 'opacity-45' : ''}`}>
                {e.icone}
              </span>
              <span aria-hidden className="truncate">
                {e.nom}
              </span>
              {e.cache && <MarqueAdmins />}
            </NavLink>
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

type Cote = 'bas' | 'droite'
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
    const gauche = visee.cote === 'bas' ? Math.min(Math.max(r.left + r.width / 2 - l / 2, 4), window.innerWidth - l - 4) : r.right + 8
    const haut = visee.cote === 'bas' ? r.bottom + 6 : r.top + r.height / 2 - h / 2
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

/** Écran sans survol (téléphone, tablette tactile) : les tuiles avec les noms remplacent les icônes seules. */
function useSansSurvol() {
  return useSyncExternalStore(
    (maj) => {
      const mq = window.matchMedia('(hover: none)')
      mq.addEventListener('change', maj)
      return () => mq.removeEventListener('change', maj)
    },
    () => window.matchMedia('(hover: none)').matches,
  )
}

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

/** Icône au trait d'une famille (menu ouvert : à côté du titre ; menu réduit : le bouton). */
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
