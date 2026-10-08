import { useEffect, useMemo, useRef } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { aujourdhui } from '@/shell/pokes'
import { calculer, relancesAuto } from './calculs'
import { ContexteCrm, type Donnees } from './contexte'
import { Demarchage } from './Demarchage'
import {
  useConseillers,
  useContacts,
  useCreerRelancesAuto,
  useEchanges,
  useOrganisations,
  useRegles,
  useRelances,
  useSejours,
  useVisites,
} from './donnees'
import { Fiche } from './Fiche'
import { Organisations } from './Organisations'
import { Reglages } from './Reglages'
import { Relances } from './Relances'
import { Saisons } from './Saisons'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/** CRM : clients et cibles, démarchage et relances, liés aux réservations. */
export default function ModuleCrm() {
  const { profil, peutEcrire } = useAuth()
  const organisations = useOrganisations()
  const contacts = useContacts()
  const echanges = useEchanges()
  const visites = useVisites()
  const relances = useRelances()
  const regles = useRegles()
  const sejours = useSejours()
  const conseillers = useConseillers()
  const surFiche = useLocation().pathname.startsWith('/crm/o/')
  const auj = aujourdhui()

  const donnees = useMemo<Donnees | null>(() => {
    if (
      !profil ||
      !organisations.data ||
      !contacts.data ||
      !echanges.data ||
      !visites.data ||
      !relances.data ||
      !regles.data ||
      !sejours.data ||
      !conseillers.data
    )
      return null
    const d = { sejours: sejours.data, visites: visites.data, echanges: echanges.data, relances: relances.data }
    const calculs = organisations.data.map((o) => calculer(o, d, auj))
    const noms = new Map(conseillers.data.map((c) => [c.id, c.nom]))
    return {
      calculs,
      parId: new Map(calculs.map((c) => [c.org.id, c])),
      contacts: contacts.data,
      echanges: echanges.data,
      visites: visites.data,
      relances: relances.data,
      regles: regles.data,
      sejours: sejours.data,
      conseillers: conseillers.data,
      nomConseiller: (id) => (id ? (noms.get(id) ?? 'Ancien compte') : null),
      ecriture: peutEcrire('crm'),
      moi: profil,
      auj,
    }
  }, [profil, organisations.data, contacts.data, echanges.data, visites.data, relances.data, regles.data, sejours.data, conseillers.data, peutEcrire, auj])

  useRelancesAutomatiques(donnees)

  const erreur =
    organisations.error ?? contacts.error ?? echanges.error ?? visites.error ?? relances.error ?? regles.error ?? sejours.error ?? conseillers.error

  return (
    <div>
      <h1 className="text-2xl font-semibold">CRM</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/crm" end className={onglet}>
          Relances
        </NavLink>
        <NavLink to="/crm/organisations" className={(p) => onglet({ isActive: p.isActive || surFiche })}>
          Organisations
        </NavLink>
        <NavLink to="/crm/demarchage" className={onglet}>
          Démarchage
        </NavLink>
        <NavLink to="/crm/saisons" className={onglet}>
          Saisons
        </NavLink>
        <NavLink to="/crm/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="crm" />
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !donnees ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <ContexteCrm.Provider value={donnees}>
          <Routes>
            <Route index element={<Relances />} />
            <Route path="organisations" element={<Organisations />} />
            <Route path="o/:id" element={<Fiche />} />
            <Route path="demarchage" element={<Demarchage />} />
            <Route path="saisons" element={<Saisons />} />
            <Route path="reglages" element={<Reglages />} />
            <Route path="*" element={<Navigate to="/crm" replace />} />
          </Routes>
        </ContexteCrm.Provider>
      )}
    </div>
  )
}

/**
 * À l'ouverture du module (et quand un séjour se termine ou que les règles
 * changent), crée les relances automatiques qui manquent. Seulement pour qui
 * écrit ; une même relance n'est envoyée qu'une fois par session.
 */
function useRelancesAutomatiques(d: Donnees | null) {
  const creer = useCreerRelancesAuto()
  const envoyees = useRef(new Set<string>())
  const existantes = useMemo(() => new Set(d?.relances.map((r) => r.source_cle).filter(Boolean)), [d?.relances])
  const manquantes = useMemo(() => {
    if (!d?.ecriture) return []
    return d.calculs.flatMap((c) => relancesAuto(c, d.regles, d.auj)).filter((r) => !existantes.has(r.source_cle))
  }, [d, existantes])

  const { mutate } = creer
  useEffect(() => {
    const nouvelles = manquantes.filter((r) => !envoyees.current.has(r.source_cle))
    if (!nouvelles.length) return
    nouvelles.forEach((r) => envoyees.current.add(r.source_cle))
    mutate(nouvelles)
  }, [manquantes, mutate])
}
