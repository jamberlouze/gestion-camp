import { Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Animation } from './Animation'
import { Evenements } from './Evenements'
import { Journal } from './Journal'
import { Presences } from './Presences'
import { Reglages } from './Reglages'
import { Vue } from './Vue'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

const ONGLETS = [
  { chemin: '/calendrier', libelle: 'Calendrier', date: true },
  { chemin: '/calendrier/presences', libelle: 'Présences', date: true },
  { chemin: '/calendrier/animation', libelle: 'Animation', date: true },
  { chemin: '/calendrier/evenements', libelle: 'Événements' },
  { chemin: '/calendrier/journal', libelle: 'Journal' },
  { chemin: '/calendrier/reglages', libelle: 'Réglages' },
]

export default function ModuleCalendrier() {
  // La date choisie suit d'un onglet daté à l'autre.
  const [params] = useSearchParams()
  const date = params.get('date')
  return (
    <>
      <h1 className="text-2xl font-semibold">Calendrier des opérations</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        {ONGLETS.map((o) => (
          <NavLink key={o.chemin} to={o.date && date ? `${o.chemin}?date=${date}` : o.chemin} end className={onglet}>
            {o.libelle}
          </NavLink>
        ))}
      </nav>
      <BandeauErreurs racine="calendrier" />
      <Routes>
        <Route index element={<Vue />} />
        {/* Ancienne adresse de la vue Calendrier (la vue « Aujourd'hui » a été retirée). */}
        <Route path="vue" element={<AncienneVue />} />
        <Route path="presences" element={<Presences />} />
        <Route path="animation" element={<Animation />} />
        <Route path="evenements" element={<Evenements />} />
        <Route path="journal" element={<Journal />} />
        <Route path="reglages" element={<Reglages />} />
      </Routes>
    </>
  )
}

function AncienneVue() {
  const { search } = useLocation()
  return <Navigate to={`/calendrier${search}`} replace />
}
