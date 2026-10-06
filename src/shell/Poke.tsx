import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ui } from '@/lib/ui'
import { useAuth } from './auth'
import {
  EMOJIS_POKE,
  aujourdhui,
  messagePoke,
  useCollegues,
  useMarquerPokesVus,
  usePoker,
  usePokes,
  usePokesNonVus,
  useTempsReelPokes,
  type Poke,
} from './pokes'

// Pokes : un petit 👉 discret dans un coin (menu sur ordinateur, barre du haut
// sur téléphone) pour envoyer ; un cadeau à ouvrir au milieu de l'écran quand
// on en reçoit un (l'émoji explose partout). Fermer sans ouvrir : le cadeau
// attend dans le coin.

const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fait exploser des émojis depuis un point de l'écran (couche au-dessus de tout, sans clic). */
function exploser(emojis: string[], x: number, y: number, nombre: number, portee: number) {
  if (mouvementReduit() || emojis.length === 0) return
  const couche = document.createElement('div')
  couche.className = 'pointer-events-none fixed inset-0 z-[60] overflow-hidden'
  document.body.append(couche)
  let fin = 0
  for (let i = 0; i < nombre; i++) {
    const e = document.createElement('span')
    e.textContent = emojis[i % emojis.length]
    e.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:${18 + Math.random() * 38}px;line-height:1;will-change:transform,opacity`
    couche.append(e)
    const angle = Math.random() * Math.PI * 2
    const vitesse = portee * (0.35 + Math.random() * 0.65)
    const dx = Math.cos(angle) * vitesse
    const dy = Math.sin(angle) * vitesse - portee * 0.25
    const chute = portee * 0.7
    const tour = (Math.random() - 0.5) * 900
    const duree = 1600 + Math.random() * 1200
    const delai = Math.random() * 180
    fin = Math.max(fin, duree + delai)
    e.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1) rotate(${tour / 2}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx * 1.25}px),calc(-50% + ${dy + chute}px)) scale(.8) rotate(${tour}deg)`, opacity: 0 },
      ],
      { duration: duree, delay: delai, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'both' },
    )
  }
  setTimeout(() => couche.remove(), fin + 100)
}

/** Fait se trémousser un élément tant qu'il est affiché. */
function useTremousser<T extends HTMLElement>(actif: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!actif || !ref.current || mouvementReduit()) return
    const anim = ref.current.animate(
      [
        { transform: 'rotate(0) scale(1)' },
        { transform: 'rotate(-14deg) scale(1.08)', offset: 0.12 },
        { transform: 'rotate(12deg) scale(1.08)', offset: 0.24 },
        { transform: 'rotate(-9deg) scale(1.04)', offset: 0.36 },
        { transform: 'rotate(6deg)', offset: 0.48 },
        { transform: 'rotate(0) scale(1)', offset: 0.6 },
        { transform: 'rotate(0) scale(1)' },
      ],
      { duration: 1400, iterations: Infinity, easing: 'ease-in-out' },
    )
    return () => anim.cancel()
  }, [actif])
  return ref
}

// ------------------------------------------------------------
// État partagé : le cadeau (au milieu ou reporté dans le coin) et la
// petite fenêtre d'envoi (avec, au besoin, la personne choisie d'avance).
// ------------------------------------------------------------
interface Fenetre {
  ouverte: boolean
  pour: string | null
}

interface EtatPoke {
  /** Pokes reçus pas encore ouverts. */
  nonVus: Poke[]
  /** Le cadeau a été fermé sans l'ouvrir : il attend dans le coin. */
  reporte: boolean
  rouvrirCadeau: () => void
  fenetre: Fenetre
  ouvrirFenetre: (pour?: string | null) => void
  fermerFenetre: () => void
}

const ContextePoke = createContext<EtatPoke | null>(null)

/** Monté par le Layout : temps réel des pokes et cadeau au milieu de l'écran. */
export function FournisseurPoke({ children }: { children: ReactNode }) {
  useTempsReelPokes()
  const nonVus = usePokesNonVus()
  // Pokes dont le cadeau a été fermé sans l'ouvrir (un nouveau poke le refait apparaître).
  const [reportes, setReportes] = useState<string[]>([])
  const [fenetre, setFenetre] = useState<Fenetre>({ ouverte: false, pour: null })
  const reporte = nonVus.length > 0 && nonVus.every((p) => reportes.includes(p.id))

  const valeur: EtatPoke = {
    nonVus,
    reporte,
    rouvrirCadeau: () => setReportes([]),
    fenetre,
    ouvrirFenetre: (pour = null) => setFenetre({ ouverte: true, pour }),
    fermerFenetre: () => setFenetre({ ouverte: false, pour: null }),
  }

  return (
    <ContextePoke.Provider value={valeur}>
      {children}
      <Cadeau
        pokes={nonVus}
        visible={nonVus.length > 0 && !reporte}
        onReporter={() => setReportes(nonVus.map((p) => p.id))}
        onPokerEnRetour={(id) => setFenetre({ ouverte: true, pour: id })}
      />
    </ContextePoke.Provider>
  )
}

function usePoke() {
  const ctx = useContext(ContextePoke)
  if (!ctx) throw new Error('usePoke doit être utilisé dans <FournisseurPoke>')
  return ctx
}

// ------------------------------------------------------------
// Le cadeau : au milieu de l'écran ; on clique, il éclate.
// ------------------------------------------------------------
function Cadeau({
  pokes,
  visible,
  onReporter,
  onPokerEnRetour,
}: {
  pokes: Poke[]
  visible: boolean
  onReporter: () => void
  onPokerEnRetour: (id: string) => void
}) {
  const { profil } = useAuth()
  const { data: collegues } = useCollegues()
  const { data: tous } = usePokes()
  const marquerVus = useMarquerPokesVus()
  // Pokes ouverts : gardés ici, la liste des non vus se vide dès qu'ils sont marqués.
  const [ouverts, setOuverts] = useState<Poke[] | null>(null)
  const boite = useTremousser<HTMLButtonElement>(visible && !ouverts)

  useEffect(() => {
    if (!visible && !ouverts) return
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ouverts) setOuverts(null)
      else onReporter()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [visible, ouverts, onReporter])

  if (!ouverts && !visible) return null

  const nomDe = (id: string) => collegues?.find((c) => c.id === id)?.nom ?? "Quelqu'un"
  const fermer = () => setOuverts(null)

  if (ouverts) {
    const recus = [...new Map(ouverts.map((p) => [p.de, p])).values()]
    const envoye = tous?.some((p) => p.de === profil?.id && p.jour === aujourdhui())
    const retour = recus.length === 1 && !envoye && collegues?.some((c) => c.id === recus[0].de) ? recus[0].de : null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={fermer}>
        <div
          className={`${ui.carte} w-full max-w-xs p-6 text-center shadow-xl`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Poke reçu"
        >
          <div className="text-6xl leading-none">{recus.map((p) => p.emoji).join('')}</div>
          <p className="mt-4 text-lg font-semibold">
            {recus.length === 1
              ? `${nomDe(recus[0].de)} t'a poké !`
              : `${recus.map((p) => nomDe(p.de).split(/\s+/)[0]).join(', ')} t'ont poké !`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {retour && (
              <button
                className={ui.bouton}
                onClick={() => {
                  fermer()
                  onPokerEnRetour(retour)
                }}
              >
                Poker en retour
              </button>
            )}
            <button className={ui.boutonSecondaire} onClick={fermer}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const expediteurs = [...new Set(pokes.map((p) => p.de))]
  const ouvrir = () => {
    const r = boite.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r ? r.top + r.height / 2 : window.innerHeight / 2
    const emojis = pokes.map((p) => p.emoji)
    const portee = Math.max(window.innerWidth, window.innerHeight) * 0.6
    exploser(emojis, x, y, 70, portee)
    setTimeout(() => exploser(emojis, x, y, 40, portee * 0.8), 250)
    setOuverts(pokes)
    marquerVus.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 p-4 print:hidden"
      onClick={onReporter}
    >
      <button
        ref={boite}
        onClick={(e) => {
          e.stopPropagation()
          ouvrir()
        }}
        className="cursor-pointer text-[7rem] leading-none drop-shadow-lg select-none sm:text-[9rem]"
        aria-label="Ouvrir le cadeau"
      >
        🎁
      </button>
      <p
        className="mt-6 rounded-full bg-white px-4 py-2 text-center text-sm font-medium text-pierre-800 shadow"
        onClick={(e) => e.stopPropagation()}
      >
        {expediteurs.length === 1
          ? `${nomDe(expediteurs[0])} t'a envoyé quelque chose`
          : `${expediteurs.length} personnes t'ont envoyé quelque chose`}
        <span className="text-pierre-500"> · ouvre-le !</span>
      </p>
      <button className="mt-3 text-sm text-white underline underline-offset-2" onClick={onReporter}>
        Plus tard
      </button>
    </div>
  )
}

// ------------------------------------------------------------
// Le coin : 👉 discret (ou le cadeau reporté) + petite fenêtre d'envoi.
// ------------------------------------------------------------
export function CoinPoke({ place }: { place: 'menu' | 'entete' }) {
  const { profil } = useAuth()
  const { nonVus, reporte, rouvrirCadeau, fenetre, ouvrirFenetre, fermerFenetre } = usePoke()
  const { data: pokes } = usePokes()
  const { data: collegues } = useCollegues()
  const cadeau = useTremousser<HTMLSpanElement>(reporte)
  const zone = useRef<HTMLDivElement>(null)

  // Fermer la fenêtre : clic ailleurs ou Échap.
  useEffect(() => {
    if (!fenetre.ouverte) return
    const clic = (e: MouseEvent) => {
      // Le coin existe deux fois (menu et barre du haut) : seul celui qui est affiché écoute.
      const el = zone.current
      if (el && el.getClientRects().length > 0 && !el.contains(e.target as Node)) fermerFenetre()
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermerFenetre()
    document.addEventListener('mousedown', clic)
    window.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', clic)
      window.removeEventListener('keydown', touche)
    }
  }, [fenetre.ouverte, fermerFenetre])

  if (!profil || !pokes || !collegues || collegues.length === 0) return null
  const envoye = pokes.find((p) => p.de === profil.id && p.jour === aujourdhui())

  return (
    <div ref={zone} className="relative">
      {reporte && nonVus.length > 0 ? (
        <button
          onClick={rouvrirCadeau}
          title="Un cadeau t'attend"
          aria-label="Un cadeau t'attend"
          className="relative flex size-8 items-center justify-center rounded-lg text-lg leading-none hover:bg-pierre-100"
        >
          <span ref={cadeau} className="inline-block">
            🎁
          </span>
          <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
      ) : (
        <button
          onClick={() => (fenetre.ouverte ? fermerFenetre() : ouvrirFenetre())}
          title={envoye ? 'Poke du jour envoyé' : "Poker quelqu'un"}
          aria-label="Poke du jour"
          aria-expanded={fenetre.ouverte}
          className={`flex size-8 items-center justify-center rounded-lg text-base leading-none transition hover:bg-pierre-100 hover:opacity-100 ${
            fenetre.ouverte ? 'bg-pierre-100 opacity-100' : envoye ? 'opacity-35 grayscale' : 'opacity-60'
          }`}
        >
          👉
        </button>
      )}
      {fenetre.ouverte && (
        <div
          className={`absolute z-30 w-76 ${place === 'menu' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'} ${ui.carte} p-3 shadow-lg`}
        >
          <FenetrePoke key={fenetre.pour ?? ''} envoye={envoye} pour={fenetre.pour} />
        </div>
      )}
    </div>
  )
}

function FenetrePoke({ envoye, pour }: { envoye: Poke | undefined; pour: string | null }) {
  const { profil } = useAuth()
  const { data: pokes } = usePokes()
  const { data: collegues } = useCollegues()
  const poker = usePoker()
  const [choisi, setChoisi] = useState<string | null>(pour)
  const [emoji, setEmoji] = useState<string>(EMOJIS_POKE[0])
  const [filtre, setFiltre] = useState('')
  const [erreur, setErreur] = useState('')
  const bouton = useRef<HTMLButtonElement>(null)

  if (!profil || !pokes || !collegues) return null
  const nomDe = (id: string) => collegues.find((c) => c.id === id)?.nom ?? "Quelqu'un"

  if (envoye) {
    return (
      <div className="flex items-center gap-3 px-1 py-1">
        <span className="text-3xl leading-none">{envoye.emoji}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Tu as poké {nomDe(envoye.a)}</p>
          <p className="text-xs text-pierre-500">Prochain poke demain</p>
        </div>
      </div>
    )
  }

  // Les personnes avec qui on échange le plus de pokes d'abord, puis l'ordre alphabétique.
  const echanges = new Map<string, number>()
  for (const p of pokes) {
    const autre = p.de === profil.id ? p.a : p.de
    echanges.set(autre, (echanges.get(autre) ?? 0) + 1)
  }
  const norme = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const liste = [...collegues]
    .sort((x, y) => (echanges.get(y.id) ?? 0) - (echanges.get(x.id) ?? 0))
    .filter((c) => norme(c.nom).includes(norme(filtre.trim())))

  const envoyer = () => {
    if (!choisi) {
      setErreur("Choisis quelqu'un d'abord.")
      return
    }
    // Position prise au clic : le bouton disparaît une fois le poke envoyé.
    const r = bouton.current?.getBoundingClientRect()
    poker.mutate(
      { a: choisi, emoji },
      {
        onSuccess: () => {
          if (r) exploser([emoji], r.left + r.width / 2, r.top + r.height / 2, 16, 160)
        },
        onError: (e) => setErreur(messagePoke(e)),
      },
    )
  }

  return (
    <div>
      <p className="px-1 text-xs text-pierre-500">Un poke par jour · revient à minuit</p>
      {collegues.length > 6 && (
        <input
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Chercher…"
          className={`${ui.champ} mt-2 py-1.5`}
          aria-label="Chercher une personne"
        />
      )}
      <ul className="mt-2 max-h-44 overflow-y-auto">
        {liste.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => {
                setChoisi(c.id)
                setErreur('')
              }}
              aria-pressed={choisi === c.id}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                choisi === c.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-700 hover:bg-pierre-100'
              }`}
            >
              {c.nom}
            </button>
          </li>
        ))}
        {liste.length === 0 && <li className="px-2 py-1.5 text-sm text-pierre-500">Personne</li>}
      </ul>
      <div className="mt-2 flex flex-wrap gap-0.5 border-t border-pierre-200 pt-2">
        {EMOJIS_POKE.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            aria-pressed={emoji === e}
            className={`flex size-8 items-center justify-center rounded-md text-lg leading-none ${
              emoji === e ? 'bg-foret-100 ring-1 ring-foret-600' : 'hover:bg-pierre-100'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button ref={bouton} className={`${ui.bouton} py-1.5`} onClick={envoyer} disabled={poker.isPending}>
          {poker.isPending ? 'Envoi…' : choisi ? `Poker ${nomDe(choisi).split(/\s+/)[0]}` : 'Poker'}
        </button>
        {erreur && <span className="text-xs text-red-700">{erreur}</span>}
      </div>
    </div>
  )
}
