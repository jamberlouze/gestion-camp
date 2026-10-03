import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { useSubventions } from './donnees'
import { Fiche } from './Fiche'
import { Recherches } from './Recherches'
import { Reglages } from './Reglages'
import { TableauDeBord } from './TableauDeBord'
import { Validation } from './Validation'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/** Vigie de subventions : administrateurs et direction seulement. */
export default function ModuleSubventions() {
  const aValider = (useSubventions().data ?? []).filter((g) => g.status === 'nouveau').length
  return (
    <>
      <h1 className="text-2xl font-semibold">Vigie de subventions</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/subventions" end className={onglet}>
          À valider
          {aValider > 0 && (
            <span className="ml-1.5 rounded-full bg-foret-700 px-1.5 py-0.5 text-xs font-semibold text-white">{aValider}</span>
          )}
        </NavLink>
        <NavLink to="/subventions/suivi" className={onglet}>
          Suivi
        </NavLink>
        <NavLink to="/subventions/recherches" className={onglet}>
          Recherches
        </NavLink>
        <NavLink to="/subventions/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="subventions" />
      <Routes>
        <Route index element={<Validation />} />
        <Route path="suivi" element={<TableauDeBord />} />
        <Route path="fiche/:id" element={<Fiche />} />
        <Route path="recherches" element={<Recherches />} />
        <Route path="reglages" element={<Reglages />} />
      </Routes>
    </>
  )
}
