import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ui } from './ui'

/**
 * Saisie d'un nom dans l'app (au lieu de la fenêtre prompt du navigateur) :
 * Entrée valide, Échap annule. valider renvoie un message d'erreur, ou null
 * si c'est fait. Pas de <form> : peut vivre dans un formulaire.
 */
export function SaisieNom({
  valeurInitiale = '',
  placeholder,
  libelleOk = 'OK',
  valider,
  annuler,
  compact,
}: {
  valeurInitiale?: string
  placeholder?: string
  libelleOk?: string
  valider: (nom: string) => string | null | Promise<string | null>
  annuler: () => void
  compact?: boolean
}) {
  const [nom, setNom] = useState(valeurInitiale)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])

  async function envoyer() {
    const propre = nom.trim()
    if (!propre || enCours) return
    if (propre === valeurInitiale.trim()) return annuler()
    setEnCours(true)
    try {
      const probleme = await valider(propre)
      setErreur(probleme)
    } finally {
      setEnCours(false)
    }
  }

  const taille = compact ? 'px-2 py-1 text-sm' : 'px-3 py-2 text-sm'
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          ref={champ}
          aria-label={placeholder ?? 'Nom'}
          className={`min-w-0 flex-1 rounded-lg border border-pierre-300 bg-white ${taille} focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20`}
          value={nom}
          placeholder={placeholder}
          onChange={(e) => {
            setNom(e.target.value)
            setErreur(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void envoyer()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              annuler()
            }
          }}
        />
        <button type="button" className={`${ui.bouton} ${compact ? 'px-2.5 py-1' : ''}`} disabled={!nom.trim() || enCours} onClick={() => void envoyer()}>
          {libelleOk}
        </button>
        <button type="button" aria-label="Annuler" className="rounded-lg px-2 py-1 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800" onClick={annuler}>
          ✕
        </button>
      </div>
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}

/**
 * Petit panneau ancré sous un bouton ; se ferme avec Échap ou un clic
 * ailleurs (un clic sur l'ancre, le bouton qui l'ouvre, le laisse la gérer).
 * S'aligne à droite s'il déborderait de l'écran.
 */
export function Bulle({ fermer, children, ancre }: { fermer: () => void; children: ReactNode; ancre?: RefObject<HTMLElement | null> }) {
  const boite = useRef<HTMLDivElement>(null)
  const [aDroite, setADroite] = useState(false)
  useLayoutEffect(() => {
    const r = boite.current?.getBoundingClientRect()
    if (r && r.right > document.documentElement.clientWidth - 8) setADroite(true)
  }, [])
  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node
      if (boite.current?.contains(cible) || ancre?.current?.contains(cible)) return
      fermer()
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer, ancre])
  return (
    <div
      ref={boite}
      className={`absolute top-full z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-pierre-200 bg-white p-3 shadow-lg ${aDroite ? 'right-0' : 'left-0'}`}
    >
      {children}
    </div>
  )
}
