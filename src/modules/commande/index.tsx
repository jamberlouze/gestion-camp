import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Ajouts } from './Ajouts'
import { Commande } from './Commande'
import { useTempsReelCommande } from './donnees'
import { Ingredients } from './Ingredients'
import { Planificateur } from './Planificateur'
import { Recettes } from './Recettes'
import { Sorties } from './Sorties'

const ONGLETS = [
  { chemin: '/commande', libelle: 'Recettes', fin: true },
  { chemin: '/commande/ingredients', libelle: 'Ingrédients' },
  { chemin: '/commande/planificateur', libelle: 'Planificateur' },
  { chemin: '/commande/ajouts', libelle: 'Ajouts manuels' },
  { chemin: '/commande/sorties', libelle: 'Sorties' },
  { chemin: '/commande/commande', libelle: 'Commande' },
]

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleCommande() {
  useTempsReelCommande()
  return (
    <div>
      <h1 className="text-2xl font-semibold print:hidden">Commande</h1>
      {/* Adresses absolues : voir la note dans modules/embarcations/index.tsx. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
        {ONGLETS.map((o) => (
          <NavLink key={o.chemin} to={o.chemin} end={o.fin} className={onglet}>
            {o.libelle}
          </NavLink>
        ))}
      </nav>
      <BandeauErreurs racine="commande" />
      <Routes>
        <Route index element={<Recettes />} />
        <Route path="ingredients" element={<Ingredients />} />
        <Route path="planificateur" element={<Planificateur />} />
        <Route path="ajouts" element={<Ajouts />} />
        <Route path="sorties" element={<Sorties />} />
        <Route path="commande" element={<Commande />} />
      </Routes>
    </div>
  )
}
