// Facturation (plan §5 B et §6) : échéancier des acomptes, lignes et client
// du devis QBO, relances de facturation. Fichier pur : l'app (fiche) et le
// Worker (création du devis) s'en servent.

import { arrondi2 } from './calcul.ts'
import type { Forfait } from './types'

const JOUR = 86_400_000
const decaler = (jour: string, jours: number) => new Date(Date.parse(`${jour}T12:00:00Z`) + jours * JOUR).toISOString().slice(0, 10)
const scolaire = (f: Forfait) => f === 'classe_nature' || f === 'journee_plein_air'

export type EtapeFacture = 'acompte1' | 'acompte2' | 'finale'

export interface Echeance {
  cle: EtapeFacture
  libelle: string
  /** Part du total (0,25…) ; null pour une facture finale qui dépend du réel. */
  part: number | null
  /** Montant à facturer, taxes comprises (F1 : % avant taxes + les taxes = % du total). */
  montant: number | null
  /** Part cumulée facturée après cette étape. */
  cumul: number
  /** Jour où l'adjointe fait la facture dans QBO. */
  facturer_le: string
  /** Échéance du paiement ; null = payable sur réception (F3, F7). */
  echeance: string | null
  note?: string
}

/**
 * Échéancier (F2 à F8) d'après le total du devis (taxes comprises) :
 * - Classe nature et Journée plein air : 25 / 50 / 25 ;
 * - Accueil de groupe et Location de salle : 25 / 75 ; facture finale
 *   seulement si le séjour a changé (F6) ;
 * - acompte 1 à la signature, payable sur réception ; acompte 2 dû 21 jours
 *   avant l'arrivée, facturé 14 jours avant son échéance ;
 * - réservation tardive (signée moins de 35 jours avant l'arrivée, F8) :
 *   acomptes 1 et 2 en une seule facture, payable sur réception.
 */
export function echeancier(p: { forfait: Forfait; total: number; signe_le: string; date_arrivee: string; date_depart: string }): Echeance[] {
  const part2 = scolaire(p.forfait) ? 0.5 : 0.75
  const facturer2 = decaler(p.date_arrivee, -35)
  const tardive = p.signe_le >= facturer2
  const montant = (part: number) => arrondi2(p.total * part)
  const finale: Echeance = scolaire(p.forfait)
    ? {
        cle: 'finale',
        libelle: 'Facture finale (solde)',
        part: null,
        montant: null,
        cumul: 1,
        facturer_le: decaler(p.date_depart, 1),
        echeance: null,
        note: 'Ajuster le devis au réel (nombre, ajouts, minimum 90 %), puis facturer le solde.',
      }
    : {
        cle: 'finale',
        libelle: 'Facture finale',
        part: null,
        montant: null,
        cumul: 1,
        facturer_le: decaler(p.date_depart, 1),
        echeance: null,
        note: 'Seulement si le séjour a changé (ajouts, repas sous le minimum). Bris et hors forfait : facture séparée.',
      }
  if (tardive) {
    return [
      { cle: 'acompte1', libelle: `Acomptes 1 et 2 (${Math.round((0.25 + part2) * 100)} %, réservation tardive)`, part: 0.25 + part2, montant: montant(0.25 + part2), cumul: 0.25 + part2, facturer_le: p.signe_le, echeance: null },
      finale,
    ]
  }
  return [
    { cle: 'acompte1', libelle: 'Acompte 1 (25 %)', part: 0.25, montant: montant(0.25), cumul: 0.25, facturer_le: p.signe_le, echeance: null },
    { cle: 'acompte2', libelle: `Acompte 2 (${Math.round(part2 * 100)} %)`, part: part2, montant: montant(part2), cumul: 0.25 + part2, facturer_le: facturer2, echeance: decaler(p.date_arrivee, -21) },
    finale,
  ]
}

const argent = (n: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n)
const jourLisible = (jour: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${jour}T00:00:00Z`))

/** Relances de facturation (CRM) d'après l'échéancier : [{cle, titre, echeance}]. */
export function tachesFacturation(numero: string, etapes: Echeance[]) {
  return etapes.map((e) => ({
    cle: e.cle,
    echeance: e.facturer_le,
    titre:
      e.cle === 'finale'
        ? `${numero} : ${e.libelle.toLowerCase()} dans QBO — ${e.note}`
        : `${numero} : facturer ${e.libelle.charAt(0).toLowerCase()}${e.libelle.slice(1)} du devis ${numero} dans QBO, ${argent(e.montant ?? 0)}${
            e.echeance ? ` (échéance ${jourLisible(e.echeance)})` : ' (payable sur réception)'
          }`,
  }))
}

// ------------------------------------------------------------------
// Devis QBO
// ------------------------------------------------------------------

export interface Reference {
  id: string
  nom: string
}

export interface LigneApp {
  code: string | null
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  montant: number
}

export interface LigneQbo {
  LineNum: number
  DetailType: 'SalesItemLineDetail'
  Amount: number
  Description: string
  SalesItemLineDetail: {
    ItemRef: { value: string; name: string }
    Qty: number
    UnitPrice: number
    TaxCodeRef: { value: string }
  }
}

/**
 * Lignes de l'estimé de l'app → lignes du devis QBO, montants identiques.
 * Quantité et prix sont gardés quand leur produit donne le montant au cent ;
 * sinon (pourcentage, arrondi) la ligne passe à quantité 1 au montant de
 * l'estimé, pour que QBO retombe exactement sur le même total.
 */
export function lignesQbo(lignes: LigneApp[], article: (code: string | null) => Reference, taxes: Reference): LigneQbo[] {
  return lignes.map((l, i) => {
    const montant = arrondi2(Number(l.montant))
    const exact = arrondi2(Number(l.quantite) * Number(l.prix_unitaire)) === montant && Number(l.quantite) !== 0
    const ref = article(l.code)
    return {
      LineNum: i + 1,
      DetailType: 'SalesItemLineDetail',
      Amount: montant,
      Description: [l.description, l.note].filter(Boolean).join('\n').slice(0, 4000),
      SalesItemLineDetail: {
        ItemRef: { value: ref.id, name: ref.nom },
        Qty: exact ? Number(l.quantite) : 1,
        UnitPrice: exact ? Number(l.prix_unitaire) : montant,
        TaxCodeRef: { value: taxes.id },
      },
    }
  })
}

/** Le total de QBO et celui de l'app diffèrent-ils (au cent près) ? */
export const ecart = (totalQbo: number, totalApp: number) => arrondi2(Number(totalQbo) - Number(totalApp))

export interface OrganisationQbo {
  nom: string
  adresse: string | null
  ville: string | null
  province: string | null
  code_postal: string | null
  telephone: string | null
}

/**
 * Client QBO d'une organisation du CRM (et de son contact de facturation) ;
 * conditions de paiement : payable sur réception (terme choisi pour la
 * compagnie). QBO refuse les deux-points dans un nom.
 */
export function clientQbo(org: OrganisationQbo, contact: { nom: string; courriel: string | null; telephone: string | null } | null, terme: Reference | null) {
  const nom = org.nom.replace(/:/g, ' -').replace(/\s+/g, ' ').trim().slice(0, 100)
  return {
    DisplayName: nom,
    CompanyName: nom,
    ...(contact?.courriel ? { PrimaryEmailAddr: { Address: contact.courriel } } : {}),
    ...(contact?.telephone || org.telephone ? { PrimaryPhone: { FreeFormNumber: (contact?.telephone || org.telephone)! } } : {}),
    ...(org.adresse || org.ville
      ? {
          BillAddr: {
            Line1: org.adresse ?? undefined,
            City: org.ville ?? undefined,
            CountrySubDivisionCode: org.province ?? undefined,
            PostalCode: org.code_postal ?? undefined,
            Country: 'Canada',
          },
        }
      : {}),
    ...(terme ? { SalesTermRef: { value: terme.id } } : {}),
    PreferredDeliveryMethod: 'Email',
  }
}
