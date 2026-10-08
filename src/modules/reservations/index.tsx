import { useMemo } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useContacts, useOrganisations } from '@/modules/crm/donnees'
import { useAuth } from '@/shell/auth'
import { aujourdhui } from '@/shell/pokes'
import { Catalogue } from './Catalogue'
import { ContexteReservations, fabriquerPrixDe, lireReglages, type Donnees } from './contexte'
import { useCompagnies, useEtages, usePrix, useProduits, useReglages, useReservations, useResponsables } from './donnees'
import { Fiche } from './Fiche'
import { Liste } from './Liste'
import { Reglages } from './Reglages'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/** Réservations de groupes : demandes, estimés, contrats et suivi. */
export default function ModuleReservations() {
  const { profil, peutEcrire } = useAuth()
  const reservations = useReservations()
  const produits = useProduits()
  const prix = usePrix()
  const reglages = useReglages()
  const organisations = useOrganisations()
  const contacts = useContacts()
  const compagnies = useCompagnies()
  const responsables = useResponsables()
  const etages = useEtages()
  const surFiche = useLocation().pathname.startsWith('/reservations/r/')
  const auj = aujourdhui()

  const donnees = useMemo<Donnees | null>(() => {
    if (
      !profil ||
      !reservations.data ||
      !produits.data ||
      !prix.data ||
      !reglages.data ||
      !organisations.data ||
      !contacts.data ||
      !compagnies.data ||
      !responsables.data ||
      !etages.data
    )
      return null
    const r = lireReglages(reglages.data)
    const prixDe = fabriquerPrixDe(produits.data, prix.data)
    const parCode = new Map(produits.data.map((p) => [p.code, p]))
    const noms = new Map(responsables.data.map((x) => [x.id, x.nom]))
    return {
      reservations: reservations.data,
      parId: new Map(reservations.data.map((x) => [x.id, x])),
      produits: produits.data,
      parCode,
      prix: prix.data,
      prixDe,
      catalogue: {
        prix: prixDe,
        produits: parCode,
        etages: new Map(etages.data.map((e) => [e.code, e])),
        gratuitePar: r.gratuitePar,
        diviseurHeuresExtra: r.diviseurHeuresExtra,
      },
      reglages: r,
      organisations: organisations.data,
      orgParId: new Map(organisations.data.map((o) => [o.id, o])),
      contacts: contacts.data,
      contactParId: new Map(contacts.data.map((c) => [c.id, c])),
      compagnies: compagnies.data,
      compagnieDefaut: compagnies.data.find((c) => c.nom === 'GBPA+') ?? compagnies.data[0],
      responsables: responsables.data,
      nomResponsable: (id) => (id ? (noms.get(id) ?? 'Ancien compte') : null),
      etages: etages.data,
      ecriture: peutEcrire('reservations'),
      moi: profil,
      auj,
    }
  }, [
    profil,
    reservations.data,
    produits.data,
    prix.data,
    reglages.data,
    organisations.data,
    contacts.data,
    compagnies.data,
    responsables.data,
    etages.data,
    peutEcrire,
    auj,
  ])

  const erreur =
    reservations.error ??
    produits.error ??
    prix.error ??
    reglages.error ??
    organisations.error ??
    contacts.error ??
    compagnies.error ??
    responsables.error ??
    etages.error

  return (
    <div>
      <h1 className="text-2xl font-semibold">Réservations</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200">
        <NavLink to="/reservations" end className={(p) => onglet({ isActive: p.isActive || surFiche })}>
          Réservations
        </NavLink>
        <NavLink to="/reservations/catalogue" className={onglet}>
          Catalogue et prix
        </NavLink>
        <NavLink to="/reservations/reglages" className={onglet}>
          Réglages
        </NavLink>
      </nav>
      <BandeauErreurs racine="reservations" />
      <BandeauErreurs racine="crm" />
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !donnees ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <ContexteReservations.Provider value={donnees}>
          <Routes>
            <Route index element={<Liste />} />
            <Route path="r/:id" element={<Fiche />} />
            <Route path="catalogue" element={<Catalogue />} />
            <Route path="reglages" element={<Reglages />} />
            <Route path="*" element={<Navigate to="/reservations" replace />} />
          </Routes>
        </ContexteReservations.Provider>
      )}
    </div>
  )
}
