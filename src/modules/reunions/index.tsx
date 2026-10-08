import { useMemo } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { ContexteReunions, type Donnees } from './contexte'
import { useEntreprises, useJoursSans, usePoints, useRecurrents, useReunions } from './donnees'
import { Odj } from './Odj'
import { joursDeReunion } from './outils'
import { Reglages } from './Reglages'
import { Semaine } from './Semaine'
import { Speciale, Speciales } from './Speciales'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/** Réunions : ordre du jour continu de la direction et réunions spéciales. */
export default function ModuleReunions() {
  const { profil, peutEcrire } = useAuth()
  const points = usePoints()
  const reunions = useReunions()
  const recurrents = useRecurrents()
  const entreprises = useEntreprises()
  const joursSans = useJoursSans()
  const surSpeciale = useLocation().pathname.startsWith('/reunions/speciales')

  const donnees = useMemo<Donnees | null>(() => {
    if (!profil || !points.data || !reunions.data || !recurrents.data || !entreprises.data || !joursSans.data) return null
    return {
      points: points.data,
      reunions: reunions.data,
      recurrents: recurrents.data,
      joursSans: new Set(joursSans.data.map((j) => j.jour)),
      entreprises: entreprises.data,
      jours: joursDeReunion(points.data),
      ecriture: peutEcrire('reunions'),
      moi: profil,
    }
  }, [profil, points.data, reunions.data, recurrents.data, entreprises.data, joursSans.data, peutEcrire])

  const erreur = points.error ?? reunions.error ?? recurrents.error ?? entreprises.error ?? joursSans.error

  return (
    <div>
      <h1 className="text-2xl font-semibold">Réunions</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/reunions" end className={onglet}>
          Ordre du jour
        </NavLink>
        <NavLink to="/reunions/semaine" className={onglet}>
          Semaine
        </NavLink>
        <NavLink to="/reunions/speciales" className={(p) => onglet({ isActive: p.isActive || surSpeciale })}>
          Réunions spéciales
        </NavLink>
        <NavLink to="/reunions/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="reunions" />
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !donnees ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <ContexteReunions.Provider value={donnees}>
          <Routes>
            <Route index element={<Odj />} />
            <Route path="semaine" element={<Semaine />} />
            <Route path="speciales" element={<Speciales />} />
            <Route path="speciales/:id" element={<Speciale />} />
            <Route path="reglages" element={<Reglages />} />
            <Route path="*" element={<Navigate to="/reunions" replace />} />
          </Routes>
        </ContexteReunions.Provider>
      )}
    </div>
  )
}
