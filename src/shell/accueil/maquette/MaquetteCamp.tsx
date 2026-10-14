import { useEffect, useRef, useState } from 'react'
import { IconePlus } from '@/lib/icones'
import { creerMaquette, type EtatCamera, type Maquette, type PersonneMaquette, type Saison, type Vue } from './scene'

const VUES: { id: Vue; nom: string; aide: string }[] = [
  { id: 'camp', nom: 'Camp', aide: 'Le camp de près' },
  { id: 'terrain', nom: 'Terrain', aide: 'Les trois terrains vus de haut' },
  { id: 'lac', nom: 'Lac', aide: "Vers le lac et l'horizon" },
]
const CLE_VUE = 'accueil-maquette-vue'
function lireVue(): Vue {
  try {
    const v = localStorage.getItem(CLE_VUE)
    return VUES.some((x) => x.id === v) ? (v as Vue) : 'camp'
  } catch {
    return 'camp'
  }
}

/**
 * La maquette 3D (chargée à part : Three.js n'est téléchargé que sur l'accueil).
 * Glisser : tourner ; clic droit ou deux doigts : déplacer ; ⌘/Ctrl + molette
 * ou pincer : zoomer.
 */
export default function MaquetteCamp({
  personnes,
  saison,
  surligne,
  surSurvol,
}: {
  personnes: PersonneMaquette[]
  saison: Saison
  surligne: string | null
  surSurvol: (cle: string | null) => void
}) {
  const boite = useRef<HTMLDivElement>(null)
  const maquette = useRef<Maquette | null>(null)
  const [erreur, setErreur] = useState(false)
  const [indice, setIndice] = useState(false)
  // La vue choisie est gardée sur l'appareil (préférence personnelle)
  const [vue, setVue] = useState<Vue>(lireVue)
  const vueRef = useRef(vue)
  const personnesRef = useRef(personnes)
  const cameraRef = useRef<EtatCamera | null>(null)
  const survolRef = useRef(surSurvol)
  useEffect(() => {
    survolRef.current = surSurvol
  }, [surSurvol])
  useEffect(() => {
    personnesRef.current = personnes
  }, [personnes])

  useEffect(() => {
    if (!boite.current) return
    let minuterie = 0
    try {
      maquette.current = creerMaquette({
        conteneur: boite.current,
        mouvementReduit: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        date: new Date(),
        saison,
        camera: cameraRef.current,
        vue: vueRef.current,
        surSurvol: (cle) => survolRef.current(cle),
        surMoletteSeule: () => {
          setIndice(true)
          clearTimeout(minuterie)
          minuterie = window.setTimeout(() => setIndice(false), 1400)
        },
      })
      maquette.current.personnes(personnesRef.current)
    } catch {
      setErreur(true)
    }
    // Changer de saison refait la scène, au même point de vue
    return () => {
      clearTimeout(minuterie)
      cameraRef.current = maquette.current?.etatCamera() ?? null
      maquette.current?.detruire()
      maquette.current = null
    }
  }, [saison])

  useEffect(() => maquette.current?.personnes(personnes), [personnes])
  useEffect(() => maquette.current?.surligner(surligne), [surligne])

  if (erreur) return <Indisponible />

  const choisirVue = (v: Vue) => {
    setVue(v)
    vueRef.current = v
    maquette.current?.vue(v)
    try {
      localStorage.setItem(CLE_VUE, v)
    } catch {
      // Stockage indisponible : la vue vaut pour la visite
    }
  }

  const bouton =
    'flex size-9 items-center justify-center rounded-lg bg-white/90 text-pierre-700 shadow-sm ring-1 ring-pierre-200 hover:bg-white hover:text-pierre-900'
  return (
    <div className="relative h-full w-full">
      <div ref={boite} className="absolute inset-0" />
      <div role="group" aria-label="Vue de la maquette" className="absolute left-3 top-3 flex rounded-lg bg-white/90 p-0.5 shadow-sm ring-1 ring-pierre-200">
        {VUES.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={vue === v.id}
            aria-label={v.nom}
            title={v.aide}
            onClick={() => choisirVue(v.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${vue === v.id ? 'bg-foret-700 text-white' : 'text-pierre-700 hover:bg-pierre-100'}`}
          >
            {v.nom}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button type="button" className={bouton} onClick={() => maquette.current?.zoomer(0.75)} aria-label="Rapprocher" title="Rapprocher">
          <IconePlus />
        </button>
        <button type="button" className={bouton} onClick={() => maquette.current?.zoomer(1.33)} aria-label="Éloigner" title="Éloigner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="size-4">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button type="button" className={bouton} onClick={() => maquette.current?.recentrer()} aria-label="Recentrer la vue" title="Recentrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
            <path d="M4 12a8 8 0 1 0 2.4-5.7" />
            <path d="M4 4v4h4" />
          </svg>
        </button>
      </div>
      <p
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-pierre-900/75 px-3 py-1.5 text-sm text-white transition-opacity ${indice ? 'opacity-100' : 'opacity-0'}`}
      >
        ⌘ ou Ctrl + molette pour zoomer
      </p>
    </div>
  )
}

export function Indisponible() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-pierre-600">
      La maquette 3D n'a pas pu s'afficher sur cet appareil.
    </div>
  )
}
