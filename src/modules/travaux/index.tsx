import { useState, useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { Chantiers } from './Chantiers'
import { Chargement } from './commun'
import { useDonnees, useModificationsEnAttente, useTempsReel } from './donnees'
import { Fiche } from './Fiche'
import { ContexteFenetre, useDroits, type Fenetre } from './outils'
import { Reglages } from './Reglages'
import { Signaler } from './Signaler'
import { Taches } from './Taches'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

export default function ModuleTravaux() {
  useTempsReel()
  const d = useDonnees()
  const droits = useDroits()
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const aTrier = d.taches.filter((t) => t.statut === 'a_trier').length
  const signaler = () => setFenetre({ type: 'signaler' })

  return (
    <ContexteFenetre.Provider value={setFenetre}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Travaux</h1>
        <div className="flex items-center gap-2">
          <EtatSynchro />
          {/* Sur téléphone : bouton flottant en bas (plus bas). */}
          {droits.ecriture && (
            <span className="hidden sm:block">
              <button className={ui.bouton} onClick={signaler}>
                <IconePlus /> {droits.trieur ? 'Nouvelle tâche' : 'Signaler'}
              </button>
            </span>
          )}
        </div>
      </div>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/travaux" end className={onglet}>
          Tâches
          {aTrier > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white" title={`${aTrier} à trier`}>
              {aTrier}
            </span>
          )}
        </NavLink>
        <NavLink to="/travaux/chantiers" className={onglet}>
          Chantiers
        </NavLink>
        {droits.trieur && (
          <NavLink to="/travaux/reglages" className={onglet}>
            Réglages
          </NavLink>
        )}
      </nav>
      <BandeauErreurs racine="travaux" />
      {d.erreur && !d.pret ? (
        <p className={ui.erreur}>{messageErreur(d.erreur)}</p>
      ) : !d.pret ? (
        <Chargement />
      ) : (
        <Routes>
          <Route index element={<Taches d={d} />} />
          {/* Anciennes adresses (onglets Tableau et À trier, retirés le 2026-10-06). */}
          <Route path="tableau" element={<Navigate to="/travaux" replace />} />
          <Route path="a-trier" element={<Navigate to="/travaux" replace />} />
          <Route path="chantiers" element={<Chantiers d={d} />} />
          <Route path="chantiers/:id" element={<Chantiers d={d} />} />
          <Route path="reglages" element={<Reglages d={d} />} />
        </Routes>
      )}

      {/* Téléphone : le bouton reste sous le pouce (l'espace évite qu'il cache la dernière ligne). */}
      {droits.ecriture && <div className="h-16 sm:hidden" aria-hidden />}
      {droits.ecriture && (
        <button
          className="fixed bottom-5 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-foret-700 text-white shadow-lg hover:bg-foret-800 sm:hidden print:hidden"
          aria-label={droits.trieur ? 'Nouvelle tâche' : 'Signaler un problème'}
          onClick={signaler}
        >
          <IconePlus className="size-6" />
        </button>
      )}

      {d.pret && fenetre?.type === 'fiche' && <Fiche key={fenetre.id} id={fenetre.id} d={d} fermer={() => setFenetre(null)} />}
      {d.pret && fenetre?.type === 'signaler' && <Signaler d={d} defauts={fenetre.defauts} fermer={() => setFenetre(null)} />}
    </ContexteFenetre.Provider>
  )
}

/** En ligne / hors ligne, et modifications pas encore envoyées. */
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
