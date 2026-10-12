// Rapports des réservations (phase 7, plan §12). Fonctions pures, sans
// React ni Supabase : l'onglet Rapports s'en sert, rapports.test.mjs les
// vérifie (npm run test:rapports).
//
// Définitions (les mêmes partout) :
// - un groupe = une réservation qui n'est pas d'Airbnb ;
// - exercice = celui de l'arrivée (octobre à septembre, désigné par l'année
//   où il se termine) ; mois = mois d'arrivée ;
// - « signé » = contrat signé, ni perdu ni annulé ; montant = estimé avant
//   taxes (montant_estime), comme le Sheets ;
// - jours-usagers = (participants + accompagnateurs) × jours (nuits + 1),
//   la formule de la colonne « Jours/Usager » du Sheets ;
// - occupation = réservations confirmées (même règle que l'Agenda et les
//   conflits : disponibilite.ts), Airbnb compris.

import { arrondi2, nuitsEntre } from './calcul.ts'
import { estConfirmee } from './disponibilite.ts'
import { bilanFactures } from './facturation.ts'
import type { Etape, Forfait, RaisonPerte, Reservation, Variante } from './types'

export type R = Pick<
  Reservation,
  | 'id'
  | 'numero'
  | 'nom'
  | 'forfait'
  | 'variante'
  | 'etape'
  | 'fermeture'
  | 'origine'
  | 'exercice'
  | 'date_arrivee'
  | 'date_depart'
  | 'demande_le'
  | 'signe_le'
  | 'montant_estime'
  | 'nb_participants'
  | 'nb_accompagnateurs'
  | 'organisation_id'
  | 'raison_perte'
  | 'etages'
  | 'salles'
>

/** Mois civils d'un exercice, dans l'ordre (octobre à septembre). */
export const MOIS_EXERCICE = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]
/** Sections d'hébergement suivies pour l'occupation (codes Rooming). */
export const SECTIONS = ['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH']

const RANG: Record<Etape, number> = {
  nouvelle: 0,
  contact: 1,
  estime_envoye: 2,
  estime_accepte: 3,
  contrat_envoye: 4,
  confirmee: 5,
  pre_arrivee: 6,
  terminee: 7,
  facture_finale: 8,
  soldee: 9,
}

export const estGroupe = (r: Pick<R, 'origine'>) => r.origine !== 'airbnb'
export const estSigne = (r: Pick<R, 'signe_le' | 'fermeture' | 'origine'>) =>
  estGroupe(r) && !!r.signe_le && r.fermeture !== 'closed_lost' && r.fermeture !== 'annulee'
export const montant = (r: Pick<R, 'montant_estime'>) => Number(r.montant_estime ?? 0)
export const joursUsagers = (r: Pick<R, 'nb_participants' | 'nb_accompagnateurs' | 'date_arrivee' | 'date_depart'>) =>
  ((r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)) * (nuitsEntre(r.date_arrivee, r.date_depart) + 1)
export const moisDe = (jour: string) => Number(jour.slice(5, 7))
export const jourDe = (horodatage: string) => horodatage.slice(0, 10)

const signes = (rs: R[], exercice: number) => rs.filter((r) => r.exercice === exercice && estSigne(r))

// ------------------------------------------------------------------
// Revenus, groupes et forfaits
// ------------------------------------------------------------------

/** Montant signé par mois d'arrivée (12 valeurs, octobre à septembre). */
export function revenusParMois(rs: R[], exercice: number): number[] {
  const parMois = MOIS_EXERCICE.map(() => 0)
  for (const r of signes(rs, exercice)) parMois[MOIS_EXERCICE.indexOf(moisDe(r.date_arrivee))] += montant(r)
  return parMois.map(arrondi2)
}

/** Revenus de référence (exercices d'avant l'app) : 12 valeurs, ou null s'il n'y en a pas. */
export function revenusReference(lignes: { exercice: number; mois: number; montant: number | string }[], exercice: number): number[] | null {
  const siennes = lignes.filter((l) => l.exercice === exercice)
  if (!siennes.length) return null
  return MOIS_EXERCICE.map((m) => arrondi2(siennes.filter((l) => l.mois === m).reduce((t, l) => t + Number(l.montant), 0)))
}

export interface Mois {
  mois: number
  groupes: R[]
  montant: number
  joursUsagers: number
}

/** Groupes signés par mois d'arrivée (dans l'ordre d'arrivée). */
export function groupesParMois(rs: R[], exercice: number): Mois[] {
  const liste = signes(rs, exercice).sort((a, b) => a.date_arrivee.localeCompare(b.date_arrivee) || a.numero.localeCompare(b.numero))
  return MOIS_EXERCICE.map((mois) => {
    const groupes = liste.filter((r) => moisDe(r.date_arrivee) === mois)
    return {
      mois,
      groupes,
      montant: arrondi2(groupes.reduce((t, r) => t + montant(r), 0)),
      joursUsagers: groupes.reduce((t, r) => t + joursUsagers(r), 0),
    }
  })
}

export interface LigneForfait {
  forfait: Forfait
  variante: Variante | null
  groupes: number
  montant: number
  joursUsagers: number
}

/** Groupes signés par forfait et variante (classe verte, blanche, rouge ; location jour, soir…). */
export function parForfait(rs: R[], exercice: number): LigneForfait[] {
  const lignes = new Map<string, LigneForfait>()
  for (const r of signes(rs, exercice)) {
    const variante = r.forfait === 'classe_nature' || r.forfait === 'location_salle' ? r.variante : null
    const cle = `${r.forfait}|${variante ?? ''}`
    const l = lignes.get(cle) ?? { forfait: r.forfait, variante, groupes: 0, montant: 0, joursUsagers: 0 }
    l.groupes++
    l.montant = arrondi2(l.montant + montant(r))
    l.joursUsagers += joursUsagers(r)
    lignes.set(cle, l)
  }
  const ordre: Forfait[] = ['classe_nature', 'journee_plein_air', 'accueil_groupe', 'location_salle']
  return [...lignes.values()].sort((a, b) => ordre.indexOf(a.forfait) - ordre.indexOf(b.forfait) || (a.variante ?? '').localeCompare(b.variante ?? ''))
}

// ------------------------------------------------------------------
// Entonnoir et prévision
// ------------------------------------------------------------------

export interface Entonnoir {
  demandes: number
  estimes: number
  signees: number
  faites: number
}

const atteint = (r: Pick<R, 'etape' | 'signe_le'>, etape: Etape) => RANG[r.etape] >= RANG[etape] || !!r.signe_le

/**
 * Entonnoir d'un exercice, par la clé donnée (forfait, type d'organisation) :
 * demandes → estimé envoyé → contrat signé (même annulé ensuite) → séjour
 * fait (signé, pas annulé, départ passé). Ligne « total » sous la clé ''.
 */
export function entonnoir(rs: R[], exercice: number, cle: (r: R) => string, auj: string): Map<string, Entonnoir> {
  const res = new Map<string, Entonnoir>()
  const ajouter = (k: string, r: R) => {
    const e = res.get(k) ?? { demandes: 0, estimes: 0, signees: 0, faites: 0 }
    e.demandes++
    if (atteint(r, 'estime_envoye')) e.estimes++
    if (r.signe_le) e.signees++
    if (estSigne(r) && r.date_depart < auj) e.faites++
    res.set(k, e)
  }
  for (const r of rs.filter((x) => x.exercice === exercice && estGroupe(x))) {
    ajouter(cle(r), r)
    ajouter('', r)
  }
  return res
}

export const ETAPES_OUVERTES: Etape[] = ['estime_envoye', 'estime_accepte', 'contrat_envoye']

/**
 * Taux de signature par étape atteinte, sur un exercice terminé (tous
 * forfaits) : part des groupes arrivés à l'étape qui ont signé. null sans données.
 */
export function tauxParEtape(rs: R[], exercice: number): Record<string, number | null> {
  const groupes = rs.filter((r) => r.exercice === exercice && estGroupe(r))
  return Object.fromEntries(
    ETAPES_OUVERTES.map((etape) => {
      const arrives = groupes.filter((r) => atteint(r, etape))
      return [etape, arrives.length ? arrives.filter((r) => r.signe_le).length / arrives.length : null]
    }),
  )
}

export interface Prevision {
  signe: number
  pondere: number
  lignes: { etape: Etape; ouvertes: number; montant: number; taux: number | null; pondere: number }[]
}

/**
 * Prévision pondérée : signé + estimés en cours × taux de signature de leur
 * étape, mesuré sur l'exercice précédent (plan §12).
 */
export function prevision(rs: R[], exercice: number): Prevision {
  const taux = tauxParEtape(rs, exercice - 1)
  const ouvertes = rs.filter((r) => r.exercice === exercice && estGroupe(r) && !r.signe_le && r.fermeture !== 'closed_lost' && r.fermeture !== 'annulee')
  const lignes = ETAPES_OUVERTES.map((etape) => {
    const siennes = ouvertes.filter((r) => r.etape === etape)
    const m = arrondi2(siennes.reduce((t, r) => t + montant(r), 0))
    const t = taux[etape]
    return { etape, ouvertes: siennes.length, montant: m, taux: t, pondere: t === null ? 0 : arrondi2(m * t) }
  })
  const signe = arrondi2(signes(rs, exercice).reduce((t, r) => t + montant(r), 0))
  return { signe, pondere: arrondi2(lignes.reduce((t, l) => t + l.pondere, 0)), lignes }
}

// ------------------------------------------------------------------
// Rythme de réservation
// ------------------------------------------------------------------

const decalerJours = (jour: string, n: number) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
/** Même jour un an plus tôt (29 février → 28). */
export const anPasse = (jour: string) => {
  const [a, m, j] = jour.split('-').map(Number)
  return `${a - 1}-${String(m).padStart(2, '0')}-${String(m === 2 && j === 29 ? 28 : j).padStart(2, '0')}`
}

export interface Rythme {
  /** Jours de l'axe (une fois par semaine, du 1er octobre un an avant l'exercice à sa fin). */
  jours: string[]
  /** Signé cumulé de l'exercice à chaque jour. */
  courant: number[]
  /** Signé cumulé de l'exercice précédent au même jour un an plus tôt. */
  precedent: number[]
  /** À ce jour (ou à la fin de l'exercice s'il est passé) : montants et nombres de groupes. */
  aCeJour: { jour: string; courant: number; precedent: number; groupes: number; groupesPrecedent: number }
}

/** Signé à ce jour, comparé à la même date l'an passé (contrats encore valides). */
export function rythme(rs: R[], exercice: number, auj: string): Rythme {
  const debut = `${exercice - 2}-10-01`
  const fin = `${exercice}-09-30`
  const cumul = (liste: R[], jour: string) => {
    const avant = liste.filter((r) => jourDe(r.signe_le!) <= jour)
    return { montant: arrondi2(avant.reduce((t, r) => t + montant(r), 0)), groupes: avant.length }
  }
  const n = signes(rs, exercice)
  const n1 = signes(rs, exercice - 1)
  const jours: string[] = []
  for (let j = debut; j <= fin; j = decalerJours(j, 7)) jours.push(j)
  if (jours.at(-1) !== fin) jours.push(fin)
  // Aujourd'hui sur l'axe : la courbe de l'exercice finit exactement au montant d'aujourd'hui.
  if (auj > debut && auj < fin && !jours.includes(auj)) jours.splice(jours.findIndex((j) => j > auj), 0, auj)
  const ici = auj < fin ? auj : fin
  const a = cumul(n, ici)
  const b = cumul(n1, anPasse(ici))
  return {
    jours,
    courant: jours.map((j) => (j <= auj ? cumul(n, j).montant : NaN)),
    precedent: jours.map((j) => cumul(n1, anPasse(j)).montant),
    aCeJour: { jour: ici, courant: a.montant, precedent: b.montant, groupes: a.groupes, groupesPrecedent: b.groupes },
  }
}

// ------------------------------------------------------------------
// Pertes et délais
// ------------------------------------------------------------------

/** Demandes perdues (Closed lost) par raison, de la plus fréquente à la moins fréquente. */
export function raisonsPerte(rs: R[], exercice: number): { raison: RaisonPerte | null; groupes: number; montant: number }[] {
  const res = new Map<RaisonPerte | null, { raison: RaisonPerte | null; groupes: number; montant: number }>()
  for (const r of rs.filter((x) => x.exercice === exercice && estGroupe(x) && x.fermeture === 'closed_lost')) {
    const l = res.get(r.raison_perte) ?? { raison: r.raison_perte, groupes: 0, montant: 0 }
    l.groupes++
    l.montant = arrondi2(l.montant + montant(r))
    res.set(r.raison_perte, l)
  }
  return [...res.values()].sort((a, b) => b.groupes - a.groupes || b.montant - a.montant)
}

export function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null
  const v = [...valeurs].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export interface Delais {
  groupes: number
  demandeSignature: number | null
  signatureArrivee: number | null
}

/** Délais médians (jours) des groupes signés : demande → signature, signature → arrivée ; clé '' = tous. */
export function delais(rs: R[], exercice: number): Map<string, Delais> {
  const parCle = new Map<string, R[]>()
  for (const r of signes(rs, exercice)) {
    for (const k of [r.forfait, '']) parCle.set(k, [...(parCle.get(k) ?? []), r])
  }
  const ecart = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
  return new Map(
    [...parCle].map(([k, liste]) => [
      k,
      {
        groupes: liste.length,
        // Écarts négatifs (signature saisie avant la demande) : erreurs de saisie, écartées.
        demandeSignature: mediane(liste.map((r) => ecart(jourDe(r.demande_le), jourDe(r.signe_le!))).filter((d) => d >= 0)),
        signatureArrivee: mediane(liste.map((r) => ecart(jourDe(r.signe_le!), r.date_arrivee)).filter((d) => d >= 0)),
      },
    ]),
  )
}

// ------------------------------------------------------------------
// Occupation
// ------------------------------------------------------------------

/** Jours d'un mois civil (« AAAA-MM-JJ »). */
export function joursDuMois(annee: number, mois: number): string[] {
  const n = new Date(Date.UTC(annee, mois, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${annee}-${String(mois).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}

/** Année civile d'un mois de l'exercice (octobre à décembre : l'année d'avant). */
export const anneeDuMois = (exercice: number, mois: number) => (mois >= 10 ? exercice - 1 : exercice)

const occupeLaNuit = (r: R, jour: string) => r.date_arrivee <= jour && jour < r.date_depart

/** Grille d'un mois : pour chaque section, la réservation confirmée qui l'occupe chaque nuit (ou null). */
export function grilleOccupation(rs: R[], annee: number, mois: number): { jours: string[]; sections: { code: string; nuits: (R | null)[] }[] } {
  const jours = joursDuMois(annee, mois)
  const confirmees = rs.filter((r) => estConfirmee(r) && r.etages.length)
  return {
    jours,
    sections: SECTIONS.map((code) => ({
      code,
      nuits: jours.map((j) => confirmees.find((r) => r.etages.includes(code) && occupeLaNuit(r, j)) ?? null),
    })),
  }
}

export interface OccupationMois {
  mois: number
  /** Lits × nuits occupés / lits × nuits du mois (sections suivies). */
  taux: number
  litsNuits: number
  capacite: number
  /** Groupes confirmés arrivés ce mois-là sans section choisie (non comptés). */
  sansSection: number
}

/** Occupation des sections par mois de l'exercice, d'après les lits de Rooming. */
export function occupationParMois(rs: R[], lits: { code: string; lits: number }[], exercice: number): OccupationMois[] {
  const litsDe = new Map(lits.map((l) => [l.code, Number(l.lits)]))
  const totalLits = SECTIONS.reduce((t, c) => t + (litsDe.get(c) ?? 0), 0)
  const confirmees = rs.filter((r) => estConfirmee(r))
  return MOIS_EXERCICE.map((mois) => {
    const jours = joursDuMois(anneeDuMois(exercice, mois), mois)
    let litsNuits = 0
    for (const j of jours) {
      for (const code of SECTIONS) {
        if (confirmees.some((r) => r.etages.includes(code) && occupeLaNuit(r, j))) litsNuits += litsDe.get(code) ?? 0
      }
    }
    const capacite = totalLits * jours.length
    const sansSection = confirmees.filter(
      (r) => estGroupe(r) && r.exercice === exercice && moisDe(r.date_arrivee) === mois && !r.etages.length && !r.salles.length && r.date_depart > r.date_arrivee,
    ).length
    return { mois, taux: capacite ? litsNuits / capacite : 0, litsNuits, capacite, sansSection }
  })
}

// ------------------------------------------------------------------
// Signé, facturé, encaissé
// ------------------------------------------------------------------

export interface TroisMesures {
  /** Signé, taxes comprises (total de l'estimé accepté le plus récent). */
  signe: number
  /** Facturé dans QBO, notes de crédit déduites. */
  facture: number
  /** Encaissé (paiements entrés dans QBO). */
  encaisse: number
  groupes: number
  /** Groupes signés qui ont au moins une facture dans QBO. */
  avecFactures: number
}

/** Les trois mesures d'un exercice (plan §12), taxes comprises comme dans QBO. */
export function troisMesures(
  rs: R[],
  exercice: number,
  totalAccepte: Map<string, number>,
  factures: { reservation_id: string; qbo_type: string; total: number | string; solde: number | string; supprimee: boolean }[],
): TroisMesures {
  const res: TroisMesures = { signe: 0, facture: 0, encaisse: 0, groupes: 0, avecFactures: 0 }
  for (const r of signes(rs, exercice)) {
    res.groupes++
    res.signe += totalAccepte.get(r.id) ?? 0
    const siennes = factures.filter((f) => f.reservation_id === r.id && !f.supprimee)
    if (!siennes.length) continue
    res.avecFactures++
    const b = bilanFactures(siennes)
    res.facture += b.facture - b.credits
    res.encaisse += b.paye
  }
  return { ...res, signe: arrondi2(res.signe), facture: arrondi2(res.facture), encaisse: arrondi2(res.encaisse) }
}
