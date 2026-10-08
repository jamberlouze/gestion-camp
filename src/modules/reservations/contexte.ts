import { createContext, useContext } from 'react'
import type { Profil } from '@/lib/types'
import type { Contact, Organisation } from '@/modules/crm/types'
import type { Catalogue, HeuresRepas } from './calcul'
import type { Entreprise } from './donnees'
import type { Sources } from './productionPdf'
import type { Compagnie, EtageRooming, Forfait, Modele, Prix, Produit, Ratio, Reglage, Reservation, Responsable } from './types'

export interface Reglages {
  heuresNormales: Record<string, [string, string]>
  heuresRepas: HeuresRepas
  gratuitePar: number
  ratioDefaut: Ratio
  diviseurHeuresExtra: number
  variantesClasse: Record<string, string>
}

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

const valeur = <T,>(reglages: Reglage[], cle: string, defaut: T): T =>
  (reglages.find((r) => r.cle === cle)?.valeur as T | undefined) ?? defaut

export function lireReglages(r: Reglage[]): Reglages {
  return {
    heuresNormales: valeur(r, 'heures_normales', {}),
    heuresRepas: valeur(r, 'heures_repas', { dejeuner: '08:00', diner: '12:00', souper: '17:30' }),
    gratuitePar: Number(valeur(r, 'gratuite_par', 20)),
    ratioDefaut: valeur<Ratio>(r, 'ratio_defaut', '1:15'),
    diviseurHeuresExtra: Number(valeur(r, 'diviseur_heures_extra', 8)),
    variantesClasse: valeur(r, 'variantes_classe', {}),
  }
}

/** Heures normales d'arrivée et de départ d'un forfait (Location : selon la variante). */
export function heuresNormales(reglages: Reglages, forfait: Forfait, variante: string | null): [string, string] | null {
  if (forfait === 'location_salle') {
    if (variante === 'jour') return reglages.heuresNormales.location_salle_jour ?? null
    if (variante === 'soir') return reglages.heuresNormales.location_salle_soir ?? null
    if (variante === 'complete') return ['09:00', '23:00']
    return null
  }
  return reglages.heuresNormales[forfait] ?? null
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
