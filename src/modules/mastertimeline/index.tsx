import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Achats } from './Achats'
import { Annee } from './Annee'
import { ContexteFiche, type DemandeFiche } from './outils'
import { FicheTache } from './FicheTache'
import { Mois } from './Mois'
import { Projets } from './Projets'
import { Reglages } from './Reglages'
import { Responsables } from './Responsables'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleMastertimeline() {
  const [fiche, setFiche] = useState<DemandeFiche | null>(null)
  return (
    <ContexteFiche.Provider value={setFiche}>
      <h1 className="text-2xl font-semibold">Mastertimeline</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/mastertimeline" end className={onglet}>
          Mois
        </NavLink>
        <NavLink to="/mastertimeline/annee" className={onglet}>
          Année
        </NavLink>
        <NavLink to="/mastertimeline/projets" className={onglet}>
          Projets
        </NavLink>
        <NavLink to="/mastertimeline/responsables" className={onglet}>
          Responsables
        </NavLink>
        <NavLink to="/mastertimeline/achats" className={onglet}>
          Achats
        </NavLink>
        <NavLink to="/mastertimeline/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="mastertimeline" />
      <Routes>
        <Route index element={<Mois />} />
        <Route path="annee" element={<Annee />} />
        <Route path="projets" element={<Projets />} />
        <Route path="projets/:id" element={<Projets />} />
        <Route path="responsables" element={<Responsables />} />
        <Route path="achats" element={<Achats />} />
        <Route path="reglages/*" element={<Reglages />} />
      </Routes>
      {/* La clé remonte la fiche à chaque ouverture (brouillon neuf). */}
      {fiche && <FicheTache key={`${fiche.tache?.id ?? 'nouvelle'}|${fiche.periode ?? ''}`} demande={fiche} fermer={() => setFiche(null)} />}
    </ContexteFiche.Provider>
  )
}
