// Données d'un document : les champs {{…}} des modèles, déjà formatés.
// Fonctions pures (aucun accès réseau), partagées par l'app et le Worker.

import { arrondi2, nuitsEntre } from '../calcul'
import { argent, dateLongue, heure } from '../format'
import type { Compagnie, Estime, EtageRooming, Reservation } from '../types'

export interface Personne {
  nom: string
  courriel: string | null
  telephone: string | null
}

export interface Client {
  nom: string
  adresse: string | null
  ville: string | null
  province: string | null
  code_postal: string | null
}

/** Tout ce qu'il faut pour produire un document d'une réservation. */
export interface Contexte {
  r: Reservation
  compagnie: Compagnie
  client: Client | null
  contact: Personne | null
  estime: Pick<Estime, 'version' | 'sous_total' | 'tps' | 'tvq' | 'total' | 'date_estime' | 'statut'> | null
  etages: EtageRooming[]
  /** Moment de production (date et heure de la pré-signature de la direction). */
  maintenant: Date
}

const vide = (v: unknown) => v === null || v === undefined || v === ''

export function adresseClient(c: Client | null): string {
  if (!c) return ''
  const ligne = [c.adresse, c.ville, c.province, c.code_postal].filter((x) => x && String(x).trim()).join(', ')
  return ligne
}

const ajouterJours = (jour: string, k: number) => {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + k)
  return d.toISOString().slice(0, 10)
}

const jourMontreal = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(d)
const heureMontreal = (d: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(' h ', 'h').replace(':', 'h')

function libelleRatio(r: Reservation['ratio']) {
  if (!r) return ''
  if (r === 'aucun') return 'Sans animation'
  if (r === '1:X') return '1:X (un seul animateur)'
  return r
}

/** Champs {{…}} d'un document. `montant_NN` (NN % du total) est calculé à la demande. */
export function champs(c: Contexte): Record<string, string> {
  const { r, compagnie } = c
  const total = Number(c.estime?.total ?? 0)
  const nuits = nuitsEntre(r.date_arrivee, r.date_depart)
  const n = (v: number | null | undefined) => (vide(v) ? '' : String(v))
  return {
    groupe: r.nom,
    numero: r.numero,
    adresse: adresseClient(c.client),
    client: c.client?.nom ?? r.nom,
    responsable: c.contact?.nom ?? '',
    courriel: c.contact?.courriel ?? '',
    telephone: c.contact?.telephone ?? '',
    date_arrivee: dateLongue(r.date_arrivee),
    date_depart: dateLongue(r.date_depart),
    heure_arrivee: heure(r.heure_arrivee),
    heure_depart: heure(r.heure_depart),
    nb_nuits: String(nuits),
    nb_jours: String(nuits + 1),
    nb_participants: n(r.nb_participants),
    nb_accompagnateurs: n(r.nb_accompagnateurs),
    ratio: libelleRatio(r.ratio),
    ages: r.ages ?? '',
    langue: r.langue ?? '',
    dejeuners: String(r.nb_dejeuners),
    diners: String(r.nb_diners),
    soupers: String(r.nb_soupers),
    total_repas: String(r.nb_dejeuners + r.nb_diners + r.nb_soupers),
    collations: String(r.nb_collations || (r.forfait === 'classe_nature' ? nuits : 0)),
    service_repas: r.service_repas ? 'Oui' : 'Non',
    notes_contrat: r.notes_contrat ?? '',
    sous_total: argent(c.estime?.sous_total ?? null),
    tps: argent(c.estime?.tps ?? null),
    tvq: argent(c.estime?.tvq ?? null),
    total: argent(c.estime ? total : null),
    // Trois semaines avant l'arrivée : changement de nombre, 2e versement, formulaires.
    date_limite: dateLongue(ajouterJours(r.date_arrivee, -21)),
    aujourdhui: dateLongue(jourMontreal(c.maintenant)),
    heure: heureMontreal(c.maintenant),
    compagnie: compagnie.raison_sociale,
    compagnie_court: compagnie.nom_court,
    compagnie_adresse: compagnie.adresse,
    compagnie_courriel: compagnie.courriel,
    compagnie_telephone: compagnie.telephone,
    reponse_interac: compagnie.reponse_interac,
    signataire: compagnie.signataire,
    tps_numero: compagnie.tps ?? '',
    tvq_numero: compagnie.tvq ?? '',
    __total: String(total),
  }
}

/** Valeur d'un champ, y compris `montant_NN` = NN % du total taxes comprises. */
export function valeurChamp(cs: Record<string, string>, cle: string): string | undefined {
  const m = /^montant_(\d{1,3})$/.exec(cle)
  if (m) return argent(arrondi2((Number(cs.__total) * Number(m[1])) / 100))
  return cs[cle]
}

/** Champs offerts dans les modèles (aide de l'onglet Réglages). */
export const CHAMPS_MODELES: [string, string][] = [
  ['groupe', 'Nom du groupe'],
  ['numero', 'Numéro de réservation'],
  ['adresse', 'Adresse de facturation du client'],
  ['responsable', 'Responsable de la réservation'],
  ['courriel', 'Courriel du responsable'],
  ['telephone', 'Téléphone du responsable'],
  ['date_arrivee', "Date d'arrivée (« 13 mai 2027 »)"],
  ['heure_arrivee', "Heure d'arrivée (« 10h00 »)"],
  ['date_depart', 'Date de départ'],
  ['heure_depart', 'Heure de départ'],
  ['nb_nuits', 'Nombre de nuits'],
  ['nb_jours', 'Nombre de jours'],
  ['nb_participants', 'Élèves ou personnes'],
  ['nb_accompagnateurs', 'Accompagnateurs'],
  ['ratio', "Ratio d'animation"],
  ['ages', 'Âges et niveaux'],
  ['langue', 'Langue du groupe'],
  ['dejeuners', 'Déjeuners'],
  ['diners', 'Dîners'],
  ['soupers', 'Soupers'],
  ['total_repas', 'Total des repas'],
  ['collations', 'Collations (une par nuit en Classe nature)'],
  ['service_repas', 'Service de repas (Oui / Non)'],
  ['notes_contrat', 'Notes au contrat'],
  ['sous_total', "Sous-total de l'estimé accepté"],
  ['tps', 'TPS'],
  ['tvq', 'TVQ'],
  ['total', 'Total taxes comprises'],
  ['montant_25', '25 % du total (tout pourcentage : montant_50, montant_90…)'],
  ['date_limite', "Trois semaines avant l'arrivée"],
  ['aujourdhui', 'Date du document'],
  ['heure', 'Heure du document'],
  ['compagnie', 'Raison sociale de la compagnie qui facture'],
  ['compagnie_court', 'Nom court (GBPA+, Opikawa)'],
  ['compagnie_adresse', 'Adresse de la compagnie'],
  ['compagnie_courriel', 'Courriel de la compagnie'],
  ['compagnie_telephone', 'Téléphone de la compagnie'],
  ['reponse_interac', 'Réponse à la question de sécurité Interac'],
  ['signataire', 'Signataire de la compagnie'],
]
