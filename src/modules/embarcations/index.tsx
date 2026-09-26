import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { useEnLigne, useModificationsEnAttente, useTempsReel } from './donnees'
import { Inventaire } from './Inventaire'
import { Modeles } from './Modeles'
import { TableauDeBord } from './TableauDeBord'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleEmbarcations() {
  useTempsReel()
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Embarcations</h1>
        <EtatSynchro />
      </div>
      {/* Adresses absolues : dans une route « embarcations/* », un lien relatif
          se résout depuis l'adresse courante (ex. /tableau/modeles). */}
      <nav className="mb-4 mt-3 flex gap-6 border-b border-pierre-200">
        <NavLink to="/embarcations" end className={onglet}>
          Inventaire
        </NavLink>
        <NavLink to="/embarcations/tableau" className={onglet}>
          Tableau de bord
        </NavLink>
        <NavLink to="/embarcations/modeles" className={onglet}>
          Modèles
        </NavLink>
      </nav>
      <BandeauErreurs racine="embarcations" />
      <Routes>
        <Route index element={<Inventaire />} />
        <Route path="tableau" element={<TableauDeBord />} />
        <Route path="modeles" element={<Modeles />} />
      </Routes>
    </div>
  )
}

/** En ligne / hors ligne, et modifications pas encore envoyées. */
function EtatSynchro() {
  const enLigne = useEnLigne()
  const enAttente = useModificationsEnAttente()
  const pluriel = enAttente > 1 ? 's' : ''

  let pastille = 'bg-[#0ca30c]'
  let texte = 'À jour'
  if (!enLigne) {
    pastille = 'bg-amber-500'
    texte = enAttente ? `Hors ligne · ${enAttente} modification${pluriel} en attente` : 'Hors ligne'
  } else if (enAttente) {
    pastille = 'bg-sky-500 animate-pulse'
    texte = `Envoi de ${enAttente} modification${pluriel}…`
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-pierre-200 bg-white px-3 py-1 text-xs text-pierre-700" role="status">
      <span className={`h-2 w-2 rounded-full ${pastille}`} aria-hidden />
      {texte}
    </span>
  )
}
