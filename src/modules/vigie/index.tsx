import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Activites } from './Activites'
import { AValider } from './AValider'
import { useAValider, useCamps } from './donnees'
import { FicheActivite } from './FicheActivite'
import { FicheCamp } from './FicheCamp'
import { Journal } from './Journal'
import { Reglages } from './Reglages'
import { TableauDeBord } from './TableauDeBord'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleVigie() {
  const aValider = useAValider()
  const camps = useCamps()
  const nb = (aValider.data?.length ?? 0) + (camps.data ?? []).filter((c) => c.statut_inclusion === 'propose').length
  return (
    <>
      <h1 className="text-2xl font-semibold">Vigie des camps compétiteurs</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/vigie" end className={onglet}>
          Tableau de bord
        </NavLink>
        <NavLink to="/vigie/a-valider" className={onglet}>
          À valider
          {nb > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs tabular-nums text-amber-900">{nb}</span>}
        </NavLink>
        <NavLink to="/vigie/activites" className={onglet}>
          Activités
        </NavLink>
        <NavLink to="/vigie/journal" className={onglet}>
          Journal
        </NavLink>
        <NavLink to="/vigie/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="vigie" />
      <Routes>
        <Route index element={<TableauDeBord />} />
        <Route path="a-valider" element={<AValider />} />
        <Route path="camps/:id" element={<FicheCamp />} />
        <Route path="activites" element={<Activites />} />
        <Route path="activites/:id" element={<FicheActivite />} />
        <Route path="journal" element={<Journal />} />
        <Route path="reglages" element={<Reglages />} />
      </Routes>
    </>
  )
}
