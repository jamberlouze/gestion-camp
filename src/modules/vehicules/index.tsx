import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Fiche } from './Fiche'
import { Flotte } from './Flotte'
import { Registre } from './Registre'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleVehicules() {
  // Une fiche fait partie de la flotte : l'onglet reste actif.
  const surFiche = useLocation().pathname.startsWith('/vehicules/fiche/')
  return (
    <div>
      <h1 className="text-2xl font-semibold">Véhicules</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/vehicules" end className={(p) => onglet({ isActive: p.isActive || surFiche })}>
          Flotte
        </NavLink>
        <NavLink to="/vehicules/entretiens" className={onglet}>
          Registre d'entretien
        </NavLink>
      </nav>
      <BandeauErreurs racine="vehicules" />
      <Routes>
        <Route index element={<Flotte />} />
        <Route path="fiche/:id" element={<Fiche />} />
        <Route path="entretiens" element={<Registre />} />
        {/* Les compagnies propriétaires sont dans Référentiel › Compagnies (2026-10-07). */}
        <Route path="reglages" element={<Navigate to="/vehicules" replace />} />
      </Routes>
    </div>
  )
}
