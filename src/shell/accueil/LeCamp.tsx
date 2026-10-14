import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { IconeFermer } from '@/lib/icones'
import { aujourdhui as jourCalendrier } from '@/modules/calendrier/dates'
import { usePresenceJour } from '@/modules/calendrier/donnees'
import type { Secteur } from '@/modules/calendrier/types'
import { ui } from '@/lib/ui'
import { useAuth } from '../auth'
import { COULEUR_SECTEUR, saisonDe, type Saison } from './maquette/plan'
import type { PersonneMaquette } from './maquette/scene'

// Three.js est lourd : la maquette arrive dans son propre fichier (hors du
// téléchargement d'avance du mode hors ligne, voir vite.config.ts).
const MaquetteCamp = lazy(() =>
  import('./maquette/MaquetteCamp').catch(() => ({
    default: () => (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-pierre-600">
        La maquette 3D n'est pas disponible hors ligne.
      </div>
    ),
  })),
)

const SAISONS: { id: Saison; nom: string; icone: string }[] = [
  { id: 'printemps', nom: 'Printemps', icone: '🌱' },
  { id: 'ete', nom: 'Été', icone: '☀️' },
  { id: 'automne', nom: 'Automne', icone: '🍁' },
  { id: 'hiver', nom: 'Hiver', icone: '❄️' },
]

const SECTEURS: { id: Secteur; nom: string }[] = [
  { id: 'direction', nom: 'Direction' },
  { id: 'animation', nom: 'Animation' },
  { id: 'cuisine', nom: 'Cuisine' },
  { id: 'terrain', nom: 'Terrain' },
]

/**
 * « Le camp aujourd'hui » : maquette 3D du camp avec les employés au travail
 * aujourd'hui, placés selon leur secteur (demande de Maxime du 2026-10-10).
 * Cachée comme un œuf de Pâques : le 🌲 du coin du Poke l'ouvre dans cette
 * fenêtre (`CoinMaquette`). Les présences viennent de la vue commune du Calendrier.
 */
export default function LeCamp({ fermer }: { fermer: () => void }) {
  const { peutLire } = useAuth()
  return peutLire('calendrier') ? <AvecPresences fermer={fermer} /> : <Cadre personnes={[]} fermer={fermer} />
}

function AvecPresences({ fermer }: { fermer: () => void }) {
  const jour = jourCalendrier()
  const { data } = usePresenceJour(jour, jour)
  const personnes = useMemo(() => {
    const parCle = new Map<string, PersonneMaquette>()
    for (const p of data ?? []) {
      const cle = `${p.secteur}:${p.nom}`
      const avant = parCle.get(cle)
      const details = [avant?.detail, p.description].filter(Boolean)
      parCle.set(cle, { cle, nom: p.nom, secteur: p.secteur, detail: [...new Set(details)].join(', ') })
    }
    return [...parCle.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [data])
  return <Cadre personnes={personnes} presences={data !== undefined} fermer={fermer} />
}

function Cadre({ personnes, presences, fermer }: { personnes: PersonneMaquette[]; presences?: boolean; fermer: () => void }) {
  const { peutOuvrir } = useAuth()
  const [surligne, setSurligne] = useState<string | null>(null)
  // La saison du jour ; les autres se regardent sans rien garder
  const [saison, setSaison] = useState<Saison>(() => saisonDe(new Date()))
  const parSecteur = SECTEURS.map((s) => ({ ...s, gens: personnes.filter((p) => p.secteur === s.id) })).filter((s) => s.gens.length)

  return (
    <section className={`${ui.carte} flex max-h-full w-full flex-col overflow-hidden shadow-xl`}>
      <div className="flex items-center gap-3 border-b border-pierre-100 px-5 py-3">
        <h2 id="titre-maquette" className="flex-1 font-semibold">
          Le camp aujourd'hui
        </h2>
        {personnes.length > 0 && (
          <span className="hidden text-sm text-pierre-500 sm:inline">
            {personnes.length} personne{personnes.length > 1 ? 's' : ''} au travail
          </span>
        )}
        <div role="group" aria-label="Saison de la maquette" className="flex rounded-lg border border-pierre-200 p-0.5">
          {SAISONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={saison === s.id}
              title={s.nom}
              onClick={() => setSaison(s.id)}
              className={`flex size-8 items-center justify-center rounded-md text-base transition ${saison === s.id ? 'bg-pierre-100 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
            >
              <span aria-hidden>{s.icone}</span>
              <span className="sr-only">{s.nom}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={fermer} aria-label="Fermer" title="Fermer" className="rounded-lg p-2 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900">
          <IconeFermer />
        </button>
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto lg:flex-row">
        <div
          role="img"
          aria-label={`Maquette 3D du camp et du lac Maskinongé${personnes.length ? `, avec ${personnes.length} personne${personnes.length > 1 ? 's' : ''} au travail aujourd'hui` : ''}`}
          className="relative h-[50vh] min-w-0 shrink-0 bg-gradient-to-b from-sky-100 via-sky-50 to-white sm:h-[60vh] lg:h-[72vh] lg:flex-1"
        >
          <Suspense fallback={<p className="flex h-full items-center justify-center text-sm text-pierre-500">Chargement de la maquette…</p>}>
            <MaquetteCamp personnes={personnes} saison={saison} surligne={surligne} surSurvol={setSurligne} />
          </Suspense>
        </div>

        {presences && (
          <div className="space-y-3 border-t border-pierre-100 px-5 py-4 lg:w-64 lg:border-l lg:border-t-0">
            {parSecteur.length === 0 && <p className="text-sm text-pierre-500">Personne à l'horaire aujourd'hui.</p>}
            {parSecteur.map((s) => (
              <div key={s.id}>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pierre-500">
                  <span className="size-2.5 rounded-full" style={{ background: COULEUR_SECTEUR[s.id] }} />
                  {s.nom}
                  <span className="font-medium text-pierre-400">{s.gens.length}</span>
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 text-sm text-pierre-800">
                  {s.gens.map((p, i) => (
                    <li key={p.cle}>
                      <button
                        type="button"
                        onMouseEnter={() => setSurligne(p.cle)}
                        onMouseLeave={() => setSurligne(null)}
                        onFocus={() => setSurligne(p.cle)}
                        onBlur={() => setSurligne(null)}
                        className={`rounded px-0.5 hover:bg-pierre-100 ${surligne === p.cle ? 'bg-pierre-100 font-semibold' : ''}`}
                      >
                        {p.nom}
                      </button>
                      {i < s.gens.length - 1 && <span className="text-pierre-400">,</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {peutOuvrir('calendrier') && (
              <Link to="/calendrier" onClick={fermer} className="inline-block text-sm font-medium text-foret-700 hover:text-foret-800">
                Voir le calendrier
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="hidden border-t border-pierre-100 px-5 py-2.5 text-xs text-pierre-500 sm:block">
        Glisser pour tourner · clic droit pour déplacer · ⌘/Ctrl + molette pour zoomer
      </div>
    </section>
  )
}
