import { useMemo } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Candidatures } from './Candidatures'
import { ContexteRh, type DonneesRh } from './contexte'
import { useCandidatures, useCompagnies, useCourriels, useDatesSaisons, useEmbauches, useInvitations, usePersonnes, usePostes, useSaisons, useTextes } from './donnees'
import { Employes } from './Employes'
import { FicheCandidature } from './FicheCandidature'
import { FichePersonne } from './FichePersonne'
import { OngletCourriels } from './OngletCourriels'
import { aujourdhui } from './outils'
import { Personnes } from './Personnes'
import { Planification } from './OngletPlanification'
import { Reglages } from './Reglages'
import type { Candidature, Embauche } from './types'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

function grouper<T>(lignes: T[], cle: (l: T) => string) {
  const m = new Map<string, T[]>()
  for (const l of lignes) m.set(cle(l), [...(m.get(cle(l)) ?? []), l])
  return m
}

/** RH : candidatures, embauches et dossiers d'employés (plan : docs/plan-rh.md). */
export default function ModuleRh() {
  const { peutEcrire, peutLire } = useAuth()
  const saisons = useSaisons()
  const dates = useDatesSaisons()
  const postes = usePostes()
  const compagnies = useCompagnies()
  const personnes = usePersonnes()
  const candidatures = useCandidatures()
  const embauches = useEmbauches()
  const invitations = useInvitations()
  const textes = useTextes()
  const chemin = useLocation().pathname
  const auj = aujourdhui()

  const donnees = useMemo<DonneesRh | null>(() => {
    if (!saisons.data || !dates.data || !postes.data || !compagnies.data || !personnes.data || !candidatures.data || !embauches.data || !invitations.data || !textes.data)
      return null
    return {
      saisons: saisons.data,
      dates: dates.data,
      postes: postes.data,
      compagnies: compagnies.data,
      personnes: personnes.data,
      candidatures: candidatures.data,
      embauches: embauches.data,
      invitations: invitations.data,
      textes: textes.data,
      saisonParId: new Map(saisons.data.map((s) => [s.id, s])),
      posteParId: new Map(postes.data.map((p) => [p.id, p])),
      compagnieParId: new Map(compagnies.data.map((c) => [c.id, c])),
      personneParId: new Map(personnes.data.map((p) => [p.id, p])),
      candidaturesDe: grouper<Candidature>(candidatures.data, (c) => c.personne_id),
      embauchesDe: grouper<Embauche>(embauches.data, (e) => e.personne_id),
      ecriture: peutEcrire('rh'),
      paie: { lecture: peutLire('rh_paie'), ecriture: peutEcrire('rh_paie') },
      auj,
    }
  }, [saisons.data, dates.data, postes.data, compagnies.data, personnes.data, candidatures.data, embauches.data, invitations.data, textes.data, peutEcrire, peutLire, auj])

  const erreur =
    saisons.error ?? dates.error ?? postes.error ?? compagnies.error ?? personnes.error ?? candidatures.error ?? embauches.error ?? invitations.error ?? textes.error
  // Pastilles des onglets : nouveautés des pages publiques, courriels à envoyer.
  const aTraiter = candidatures.data?.filter((c) => c.statut === 'recue').length ?? 0
  const dossiersRecus = embauches.data?.filter((e) => e.statut === 'dossier_recu').length ?? 0
  const aEnvoyer = useCourriels({ statut: 'prepare' }).data?.length ?? 0

  return (
    <div>
      <h1 className="text-2xl font-semibold print:hidden">RH</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mt-3 mb-4 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
        <NavLink to="/rh" end className={(p) => onglet({ isActive: p.isActive || chemin.startsWith('/rh/c/') })}>
          Candidatures
          <Pastille n={aTraiter} titre="Candidatures à traiter" />
        </NavLink>
        <NavLink to="/rh/employes" className={onglet}>
          Employés
          <Pastille n={dossiersRecus} titre="Dossiers d'embauche reçus, à valider" />
        </NavLink>
        <NavLink to="/rh/planification" className={onglet}>
          Planification
        </NavLink>
        <NavLink to="/rh/personnes" className={(p) => onglet({ isActive: p.isActive || chemin.startsWith('/rh/p/') })}>
          Personnes
        </NavLink>
        <NavLink to="/rh/courriels" className={onglet}>
          Courriels
          <Pastille n={aEnvoyer} titre="Courriels à envoyer" />
        </NavLink>
        <NavLink to="/rh/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="rh" />
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !donnees ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <ContexteRh.Provider value={donnees}>
          <Routes>
            <Route index element={<Candidatures />} />
            <Route path="c/:id" element={<FicheCandidature />} />
            <Route path="employes" element={<Employes />} />
            <Route path="planification" element={<Planification />} />
            <Route path="personnes" element={<Personnes />} />
            <Route path="p/:id" element={<FichePersonne />} />
            <Route path="courriels" element={<OngletCourriels />} />
            <Route path="reglages" element={<Reglages />} />
            <Route path="*" element={<Navigate to="/rh" replace />} />
          </Routes>
        </ContexteRh.Provider>
      )}
    </div>
  )
}

function Pastille({ n, titre }: { n: number; titre: string }) {
  if (!n) return null
  return (
    <span title={titre} className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-xs font-semibold text-amber-800">
      {n}
    </span>
  )
}
