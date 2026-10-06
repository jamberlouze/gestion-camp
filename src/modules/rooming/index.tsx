import { NavLink, Route, Routes, useLocation } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useRooming } from './donnees'
import { AllerAuPlan, VuePlan } from './Plan'
import { Plans } from './Plans'
import { Reglages } from './Reglages'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleRooming() {
  const { pathname } = useLocation()
  const surPlan = pathname === '/rooming' || pathname.startsWith('/rooming/plan/')
  const ecriture = useAuth().peutEcrire('rooming')
  const d = useRooming()
  return (
    <div>
      <h1 className="text-2xl font-semibold">Rooming</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/rooming" end className={() => onglet({ isActive: surPlan })}>
          Plan
        </NavLink>
        <NavLink to="/rooming/plans" className={onglet}>
          Tous les plans
        </NavLink>
        {ecriture && (
          <NavLink to="/rooming/reglages" className={onglet}>
            Référence
          </NavLink>
        )}
      </nav>
      {!d.pret ? (
        d.erreur ? (
          <p className={ui.erreur}>{messageErreur(d.erreur)}</p>
        ) : (
          <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
        )
      ) : (
        <Routes>
          <Route index element={<AllerAuPlan d={d} />} />
          <Route path="plan/:id" element={<VuePlan d={d} />} />
          <Route path="plans" element={<Plans d={d} />} />
          <Route path="reglages" element={<Reglages d={d} />} />
        </Routes>
      )}
    </div>
  )
}
