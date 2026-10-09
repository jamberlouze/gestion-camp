import { createContext, useContext } from 'react'
import type { Profil } from '@/lib/types'
import type { Contact, Organisation } from '@/modules/crm/types'
import type { Catalogue } from './calcul'
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
  /** Prix d'un produit pour un exercice ; sans prix pour cet exercice : le plus récent. */
  prixDe: (code: string, exercice: number) => number | null
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

/** Fonction de prix avec repli sur l'exercice le plus récent qui a un prix (P2). */
export function fabriquerPrixDe(produits: Produit[], prix: Prix[]) {
  const idDe = new Map(produits.map((p) => [p.code, p.id]))
  const parProduit = new Map<string, Prix[]>()
  for (const p of prix) {
    if (p.prix === null) continue
    const l = parProduit.get(p.produit_id) ?? []
    l.push(p)
    parProduit.set(p.produit_id, l)
  }
  for (const l of parProduit.values()) l.sort((a, b) => b.exercice - a.exercice)
  return (code: string, exercice: number): number | null => {
    const l = parProduit.get(idDe.get(code) ?? '')
    if (!l?.length) return null
    return Number((l.find((p) => p.exercice === exercice) ?? l[0]).prix)
  }
}
