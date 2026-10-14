import { createContext, useContext } from 'react'
import type { Profil } from '@/lib/types'
import type { Contact, Organisation } from '@/modules/crm/types'
import { resoudrePrix, type Catalogue, type PrixExercice, type PrixResolu } from './calcul'
import type { Entreprise } from './donnees'
import type { Sources } from './productionPdf'
import type { Reglages } from './parametres'
import type { Compagnie, EtageRooming, Modele, Prix, Produit, Reservation, Responsable } from './types'

// Données communes du module (chargées une fois par index.tsx).
export interface Donnees {
  reservations: Reservation[]
  parId: Map<string, Reservation>
  produits: Produit[]
  parCode: Map<string, Produit>
  prix: Prix[]
  /** Prix d'un produit pour un exercice ; sans prix validé pour cet exercice : le repli (`resoudrePrix`). */
  prixDe: (code: string, exercice: number) => number | null
  /** Le même prix, avec son statut (provisoire) et l'exercice d'où il vient. */
  infoPrix: (code: string, exercice: number) => PrixResolu
  catalogue: Catalogue
  reglages: Reglages
  organisations: Organisation[]
  orgParId: Map<string, Organisation>
  contacts: Contact[]
  contactParId: Map<string, Contact>
  compagnies: Entreprise[]
  compagnieDefaut: Entreprise | undefined
  responsables: Responsable[]
  nomResponsable: (id: string | null) => string | null
  etages: EtageRooming[]
  /** Coordonnées imprimées des compagnies qui facturent. */
  compagniesFacture: Compagnie[]
  modeles: Modele[]
  /** Données d'une réservation pour produire ses documents. */
  sources: (r: Reservation) => Sources
  ecriture: boolean
  moi: Profil
  auj: string
}

export const ContexteReservations = createContext<Donnees | null>(null)

export function useDonnees() {
  const d = useContext(ContexteReservations)
  if (!d) throw new Error('useDonnees hors du module Réservations')
  return d
}

/**
 * Prix d'un produit par code et exercice, avec repli (P2) : un prix pas
 * encore validé prend celui de son repli, marqué provisoire (`resoudrePrix`).
 */
export function fabriquerInfoPrix(produits: Produit[], prix: Prix[]) {
  const idDe = new Map(produits.map((p) => [p.code, p.id]))
  const parProduit = new Map<string, PrixExercice[]>()
  for (const p of prix) {
    const l = parProduit.get(p.produit_id) ?? []
    l.push({ exercice: p.exercice, prix: p.prix === null ? null : Number(p.prix), valide: p.valide, repli: p.repli })
    parProduit.set(p.produit_id, l)
  }
  const memo = new Map<string, PrixResolu>()
  return (code: string, exercice: number): PrixResolu => {
    const cle = `${code}|${exercice}`
    let r = memo.get(cle)
    if (!r) {
      r = resoudrePrix(parProduit.get(idDe.get(code) ?? '') ?? [], exercice)
      memo.set(cle, r)
    }
    return r
  }
}
