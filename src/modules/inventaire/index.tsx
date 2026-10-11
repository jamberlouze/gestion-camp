import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useDonnees, useModificationsEnAttente, useTempsReel } from './donnees'
import { Equipement } from './Equipement'
import { Reglages } from './Reglages'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleInventaire() {
  useTempsReel()
  const d = useDonnees()
  const ecriture = useAuth().peutEcrire('inventaire')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Inventaire</h1>
        <EtatSynchro />
      </div>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/inventaire" end className={onglet}>
          Équipement
        </NavLink>
        {ecriture && (
          <NavLink to="/inventaire/reglages" className={onglet}>
            Réglages
          </NavLink>
        )}
      </nav>
      <BandeauErreurs racine="inventaire" />
      {d.erreur && !d.pret ? (
        <p className={ui.erreur}>{messageErreur(d.erreur)}</p>
      ) : !d.pret ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement de l'inventaire…</p>
      ) : (
        <Routes>
          <Route index element={<Equipement d={d} ecriture={ecriture} />} />
          <Route path="reglages" element={<Reglages d={d} ecriture={ecriture} />} />
        </Routes>
      )}
    </div>
  )
}

/** Hors ligne, et modifications pas encore envoyées (rien quand tout est à jour). */
function EtatSynchro() {
  const enLigne = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  )
  const enAttente = useModificationsEnAttente()
  const pluriel = enAttente > 1 ? 's' : ''
  if (enLigne && !enAttente) return null
  const pastille = enLigne ? 'bg-sky-500 animate-pulse' : 'bg-amber-500'
  const texte = enLigne
    ? `Envoi de ${enAttente} modification${pluriel}…`
    : enAttente
      ? `Hors ligne · ${enAttente} en attente`
      : 'Hors ligne'
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-pierre-200 bg-white px-3 py-1 text-xs text-pierre-700" role="status">
      <span className={`h-2 w-2 rounded-full ${pastille}`} aria-hidden />
      {texte}
    </span>
  )
}
