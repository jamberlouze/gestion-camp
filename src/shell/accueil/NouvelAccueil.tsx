import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { IconePlus } from '@/lib/icones'
import type { ModuleId } from '@/lib/types'
import { useAuth } from '../auth'
import { estEntree, MODULES, type DefinitionModule } from '../modules'
import { AFaire } from './AFaire'
import { ASurveiller } from './ASurveiller'
import { AuTravail, Aujourdhui } from './Aujourdhui'

// Raccourcis choisis : gardés sur l'appareil (préférence personnelle).
const CLE_RACCOURCIS = 'accueil-raccourcis'
const RACCOURCIS_DEPART: ModuleId[] = ['calendrier', 'mastertimeline', 'reunions', 'travaux', 'temps']

const dateDuJour = () =>
  new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Toronto' }).format(new Date())

/** Accueil « Ma journée » (maquette A + alertes de la maquette C, 2026-10-08). */
export function NouvelAccueil() {
  const { profil, peutLire } = useAuth()
  const modules = MODULES.filter((m) => estEntree(m) && peutLire(m.id))
  const prenom = profil?.nom?.split(' ')[0]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-foret-600">{dateDuJour()}</p>
          <h1 className="mt-1 text-2xl font-semibold">Bonjour{prenom ? `, ${prenom}` : ''}</h1>
        </div>
        <Recherche modules={modules} />
      </div>

      <Raccourcis modules={modules} />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <AFaire />
          <ASurveiller />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Aujourdhui />
          {peutLire('calendrier') && <AuTravail />}
        </div>
      </div>

      {modules.length === 0 && (
        <p className="text-sm text-pierre-500">Aucun module ne vous est encore attribué. Demandez l'accès à un administrateur.</p>
      )}
    </div>
  )
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Aller vite à un outil : ⌘K (Ctrl+K) place le curseur dans le champ. */
function Recherche({ modules }: { modules: DefinitionModule[] }) {
  const naviguer = useNavigate()
  const champ = useRef<HTMLInputElement>(null)
  const [texte, setTexte] = useState('')
  const [choix, setChoix] = useState(0)

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        champ.current?.focus()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  const q = sansAccents(texte.trim())
  const resultats = q ? modules.filter((m) => sansAccents(`${m.nom} ${m.description}`).includes(q)) : []
  const aller = (m: DefinitionModule) => {
    setTexte('')
    naviguer(m.chemin)
  }

  return (
    <div className="relative w-full sm:w-80">
      <label className="flex h-11 items-center gap-2.5 rounded-lg border border-pierre-300 bg-white px-3 text-pierre-500 focus-within:border-foret-600 focus-within:ring-2 focus-within:ring-foret-600/20">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="size-4 shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={champ}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            setChoix(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTexte('')
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setChoix((c) => Math.min(c + 1, resultats.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setChoix((c) => Math.max(c - 1, 0))
            } else if (e.key === 'Enter' && resultats[choix]) aller(resultats[choix])
          }}
          placeholder="Aller à un outil…"
          aria-label="Aller à un outil"
          className="min-w-0 flex-1 bg-transparent text-sm text-pierre-900 outline-none"
        />
        <kbd className="hidden rounded border border-pierre-200 px-1.5 text-xs text-pierre-500 sm:block">⌘K</kbd>
      </label>
      {q && (
        <ul className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-lg border border-pierre-200 bg-white py-1 shadow-lg">
          {resultats.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => aller(m)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === choix ? 'bg-foret-50' : 'hover:bg-pierre-50'}`}
              >
                <span className="w-5 text-center text-base">{m.icone}</span>
                <span className="font-medium">{m.nom}</span>
              </button>
            </li>
          ))}
          {resultats.length === 0 && <li className="px-3 py-2 text-sm text-pierre-500">Aucun outil trouvé.</li>}
        </ul>
      )}
    </div>
  )
}

function lireRaccourcis(): ModuleId[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_RACCOURCIS) ?? 'null')
    return Array.isArray(brut) ? brut : RACCOURCIS_DEPART
  } catch {
    return RACCOURCIS_DEPART
  }
}

function Raccourcis({ modules }: { modules: DefinitionModule[] }) {
  const [ids, setIds] = useState(lireRaccourcis)
  const [modifier, setModifier] = useState(false)
  const choisis = ids.map((id) => modules.find((m) => m.id === id)).filter((m): m is DefinitionModule => !!m)

  const basculer = (id: ModuleId) =>
    setIds((avant) => {
      const apres = avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]
      try {
        localStorage.setItem(CLE_RACCOURCIS, JSON.stringify(apres))
      } catch {
        // Stockage indisponible : le choix vaut pour la session.
      }
      return apres
    })

  if (!modules.length) return null
  const puce =
    'flex h-11 items-center gap-2.5 rounded-lg border px-4 text-sm font-medium shadow-sm transition'

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-pierre-500">Mes raccourcis</h2>
        <button type="button" onClick={() => setModifier((m) => !m)} className="text-sm font-medium text-foret-700 hover:text-foret-800">
          {modifier ? 'Terminé' : 'Modifier'}
        </button>
      </div>
      {modifier ? (
        <div className="flex flex-wrap gap-2.5">
          {modules.map((m) => {
            const actif = ids.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={actif}
                onClick={() => basculer(m.id)}
                className={`${puce} ${actif ? 'border-foret-600 bg-foret-50 text-foret-800' : 'border-pierre-200 bg-white text-pierre-600 hover:bg-pierre-50'}`}
              >
                <span className="text-lg">{m.icone}</span>
                {m.nom}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {choisis.map((m) => (
            <Link key={m.id} to={m.chemin} className={`${puce} border-pierre-200 bg-white text-pierre-900 hover:border-foret-600 hover:bg-foret-50`}>
              <span className="text-lg">{m.icone}</span>
              {m.nom}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setModifier(true)}
            className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-pierre-300 px-4 text-sm font-medium text-pierre-600 hover:bg-pierre-50"
          >
            <IconePlus />
            Ajouter
          </button>
        </div>
      )}
    </section>
  )
}
