// Facturation (plan §5 B et §6) : échéancier des acomptes, lignes et client
// du devis QBO, relances de facturation. Fichier pur : l'app (fiche) et le
// Worker (création du devis) s'en servent.

import { arrondi2, totaux, TPS, TVQ } from './calcul.ts'
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

/** Parts des acomptes (F2) : convenues pour la réservation, sinon 25 / 50 en CN et JPA, 25 / 75 en AG et LS. */
export function partsAcomptes(p: { forfait: Forfait; acompte1_part?: number | string | null; acompte2_part?: number | string | null }) {
  if (p.acompte1_part !== null && p.acompte1_part !== undefined && p.acompte2_part !== null && p.acompte2_part !== undefined) {
    return { acompte1: Number(p.acompte1_part), acompte2: Number(p.acompte2_part), convenues: true }
  }
  return { acompte1: 0.25, acompte2: scolaire(p.forfait) ? 0.5 : 0.75, convenues: false }
}

/** « 25 % », « 33,33 % ». */
export const pourcent = (part: number) => `${arrondi2(part * 100).toLocaleString('fr-CA')} %`

/**
 * Échéancier (F2 à F8) d'après le total du devis (taxes comprises) :
 * - parts des acomptes : `partsAcomptes` (une part à 0 = pas d'acompte) ;
 * - Accueil de groupe et Location de salle : facture finale seulement si le
 *   séjour a changé (F6) ;
 * - acompte 1 à la signature, payable sur réception ; acompte 2 dû 21 jours
 *   avant l'arrivée, facturé 14 jours avant son échéance ;
 * - réservation tardive (signée moins de 35 jours avant l'arrivée, F8) :
 *   acomptes 1 et 2 en une seule facture, payable sur réception.
 */
export function echeancier(p: {
  forfait: Forfait
  total: number
  signe_le: string
  date_arrivee: string
  date_depart: string
  acompte1_part?: number | string | null
  acompte2_part?: number | string | null
}): Echeance[] {
  const { acompte1: part1, acompte2: part2 } = partsAcomptes(p)
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
  const etapes: Echeance[] = []
  if (tardive) {
    const part = part1 + part2
    const libelle = part1 > 0 && part2 > 0 ? `Acomptes 1 et 2 (${pourcent(part)}, réservation tardive)` : `Acompte (${pourcent(part)}, réservation tardive)`
    if (part > 0) etapes.push({ cle: 'acompte1', libelle, part, montant: montant(part), cumul: part, facturer_le: p.signe_le, echeance: null })
  } else {
    if (part1 > 0) etapes.push({ cle: 'acompte1', libelle: `Acompte 1 (${pourcent(part1)})`, part: part1, montant: montant(part1), cumul: part1, facturer_le: p.signe_le, echeance: null })
    if (part2 > 0)
      etapes.push({
        cle: 'acompte2',
        libelle: `Acompte ${part1 > 0 ? '2 ' : ''}(${pourcent(part2)})`,
        part: part2,
        montant: montant(part2),
        cumul: part1 + part2,
        facturer_le: facturer2,
        echeance: decaler(p.date_arrivee, -21),
      })
  }
  etapes.push(finale)
  return etapes
}

/**
 * Seuils gardés avec le devis QBO (`qbo_devis.echeancier`) : la base ferme
 * une relance quand le cumul facturé atteint `cumul` × total du devis (et,
 * pour la facture finale, après le départ). Une seule source : ce fichier.
 */
export function seuilsEcheancier(etapes: { cle: string; cumul: number }[], date_depart: string) {
  return etapes.map((e) => ({ cle: e.cle, cumul: e.cumul, apres: e.cle === 'finale' ? date_depart : null }))
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

/**
 * Écart d'arrondi toléré : QBO arrondit les taxes ligne par ligne, l'estimé
 * (comme le chiffrier) sur le sous-total (P15) ; vérifié en compagnie
 * d'essai, quelques cents au plus. Au-delà, c'est un vrai écart (code de
 * taxes, lignes changées dans QBO) : on ne facture pas avant de corriger.
 */
export const JEU_ARRONDI = 0.1
export const ecartReel = (e: number) => Math.abs(e) > JEU_ARRONDI

/**
 * Bilan des factures d'une réservation, comme le solde du client dans QBO :
 * une note de crédit appliquée baisse le solde d'une facture sans être un
 * paiement ; celle qui n'est pas encore appliquée se retranche du solde.
 * Solde négatif = crédit au client (à rembourser ou à appliquer).
 */
export function bilanFactures(liste: { qbo_type: string; total: number | string; solde: number | string }[]) {
  const somme = (type: string, champ: 'total' | 'solde') =>
    arrondi2(liste.filter((f) => f.qbo_type === type).reduce((t, f) => t + Number(f[champ]), 0))
  const facture = somme('Invoice', 'total')
  const soldeFactures = somme('Invoice', 'solde')
  const credits = somme('CreditMemo', 'total')
  const creditsDisponibles = somme('CreditMemo', 'solde')
  return {
    facture,
    credits,
    paye: arrondi2(facture - soldeFactures - (credits - creditsDisponibles)),
    solde: arrondi2(soldeFactures - creditsDisponibles),
  }
}

// ------------------------------------------------------------------
// Minimum de 90 % à la facture finale (F10, F11)
// ------------------------------------------------------------------

/** Code de la ligne d'ajustement ajoutée à l'estimé final (pas un produit du catalogue). */
export const CODE_MINIMUM = 'MIN90'

export interface LigneEstime {
  code: string | null
  description: string
  quantite: number | string
  montant: number | string
}

export interface VersionEstime {
  id: string
  version: number
  statut: string
  accepte_le: string | null
  envoye_le: string | null
  date_estime: string
}

/**
 * Estimé de référence du minimum : la dernière version acceptée au plus tard
 * 21 jours avant l'arrivée (F9 : un changement de nombre annoncé à temps
 * compte), sinon la première version acceptée (réservation tardive).
 */
export function estimeDeReference<E extends VersionEstime>(estimes: E[], date_arrivee: string): E | null {
  const limite = decaler(date_arrivee, -21)
  const acceptes = estimes
    .filter((e) => e.statut === 'accepte' || (e.statut === 'remplace' && e.accepte_le))
    .sort((a, b) => a.version - b.version)
  const jour = (e: E) => (e.accepte_le ?? e.envoye_le ?? e.date_estime).slice(0, 10)
  return acceptes.filter((e) => jour(e) <= limite).at(-1) ?? acceptes[0] ?? null
}

const somme = (lignes: LigneEstime[]) => arrondi2(lignes.reduce((t, l) => t + Number(l.montant), 0))
const ligneForfait = (lignes: LigneEstime[]) => lignes.find((l) => !l.code && /^Forfait (Classe nature|Journée plein air)/.test(l.description))

export interface Minimum {
  regle: 'F10' | 'F11'
  /** Ce qui est comparé : élèves (F10) ou coût des repas (F11). */
  explication: string
  /** Montant avant taxes de la ligne d'ajustement (0 = au-dessus du minimum). */
  ajustement: number
  description: string
}

/**
 * Minimum de 90 % de l'estimé de référence, sur l'estimé final (lignes sans
 * l'ajustement lui-même) :
 * - F10 (CN, JPA) : moins de 90 % des élèves de la référence (les
 *   accompagnateurs ne comptent pas) → au moins 90 % de son sous-total ;
 *   référence sans ligne de forfait (estimé importé) : les sous-totaux ;
 * - F11 (AG, LS) : repas facturés ≥ 90 % du coût des repas de la référence.
 */
export function minimum90(forfait: Forfait, reference: LigneEstime[], lignes: LigneEstime[]): Minimum | null {
  const actuelles = lignes.filter((l) => l.code !== CODE_MINIMUM)
  const ref = reference.filter((l) => l.code !== CODE_MINIMUM)
  if (scolaire(forfait)) {
    const base = somme(ref)
    if (base <= 0) return null
    const plancher = arrondi2(base * 0.9)
    const fr = ligneForfait(ref)
    const fa = ligneForfait(actuelles)
    const eleves = fr && fa ? { ref: Number(fr.quantite), reel: Number(fa.quantite) } : null
    const sous = eleves ? eleves.reel < eleves.ref * 0.9 : somme(actuelles) < plancher
    return {
      regle: 'F10',
      explication: eleves
        ? `${eleves.reel} élèves sur ${eleves.ref} prévus (${pourcent(eleves.ref ? eleves.reel / eleves.ref : 0)})${sous ? ` : au moins 90 % du sous-total de l'estimé, soit ${argent(plancher)} avant taxes` : ''}`
        : `Sous-total au moins égal à 90 % de celui de l'estimé, soit ${argent(plancher)} avant taxes`,
      ajustement: sous ? Math.max(0, arrondi2(plancher - somme(actuelles))) : 0,
      description: "Ajustement : minimum de 90 % de l'estimé (participants)",
    }
  }
  const repas = (ls: LigneEstime[]) => somme(ls.filter((l) => l.code === 'REPAS'))
  const base = repas(ref)
  if (base <= 0) return null
  const plancher = arrondi2(base * 0.9)
  return {
    regle: 'F11',
    explication: `Repas : ${argent(repas(actuelles))} sur ${argent(base)} prévus ; minimum ${argent(plancher)} avant taxes`,
    ajustement: Math.max(0, arrondi2(plancher - repas(actuelles))),
    description: "Ajustement : repas, minimum de 90 % de l'estimé",
  }
}

// ------------------------------------------------------------------
// Annulation (F16, F17 ; F18 retirée)
// ------------------------------------------------------------------

/** Part retenue selon les jours entre l'avis d'annulation et l'arrivée (F16). */
export const palierAnnulation = (jours: number) => (jours >= 60 ? 0.25 : jours >= 30 ? 0.6 : 0.8)

/** Taxes comprises d'un montant avant taxes, arrondies comme QBO et l'estimé. */
export const avecTaxes = (avantTaxes: number) => totaux([{ montant: avantTaxes }]).total

/** Montant avant taxes qui donne `ttc` une fois les taxes ajoutées (au cent près si possible). */
export function avantTaxesPour(ttc: number): number {
  const approx = arrondi2(ttc / (1 + TPS + TVQ))
  for (const d of [0, 0.01, -0.01, 0.02, -0.02]) {
    const h = arrondi2(approx + d)
    if (avecTaxes(h) === arrondi2(ttc)) return h
  }
  return approx
}

export interface Annulation {
  jours: number
  /** Part retenue : palier de F16, ou 0 si l'acompte n'a jamais été payé. */
  part: number
  palier: number
  acompte_paye: boolean | null
  retenu_avant_taxes: number
  retenu: number
  /** Factures progressives du séjour moins les notes de crédit, taxes comprises. */
  deja: number
  /** > 0 : à facturer (devis ajusté) ; < 0 : à créditer ; 0 : rien. */
  ecart: number
}

/**
 * Frais d'annulation : palier (25, 60 ou 80 %) du total taxes comprises de
 * l'estimé accepté, moins ce qui a déjà été facturé (F17). Une réservation
 * annulée avant le paiement de l'acompte se ferme sans frais (F18 retirée) :
 * avec des factures d'acompte dans QBO, « payé » = l'une d'elles au moins en
 * partie payée ; sans facture d'acompte, on ne le sait pas et le palier
 * s'applique (l'écran demande de vérifier).
 */
export function annulation(p: {
  annule_le: string
  date_arrivee: string
  sous_total: number
  factures: { qbo_type: string; genre: string; total: number | string; solde: number | string }[]
}): Annulation {
  const jours = Math.round((Date.parse(`${p.date_arrivee}T12:00:00Z`) - Date.parse(`${p.annule_le}T12:00:00Z`)) / JOUR)
  const palier = palierAnnulation(jours)
  const progressives = p.factures.filter((f) => f.genre === 'progressive')
  const credits = p.factures.filter((f) => f.qbo_type === 'CreditMemo')
  const acompte_paye = progressives.length ? progressives.some((f) => Number(f.solde) < Number(f.total) - 0.005) : null
  const part = acompte_paye === false ? 0 : palier
  const retenu_avant_taxes = arrondi2(Number(p.sous_total) * part)
  const retenu = avecTaxes(retenu_avant_taxes)
  const deja = arrondi2(progressives.reduce((t, f) => t + Number(f.total), 0) - credits.reduce((t, f) => t + Number(f.total), 0))
  // Un cent d'écart = rien : une note de crédit ne tombe pas toujours au cent près (taxes).
  const ecart = arrondi2(retenu - deja)
  return { jours, part, palier, acompte_paye, retenu_avant_taxes, retenu, deja, ecart: Math.abs(ecart) <= 0.01 ? 0 : ecart }
}

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
