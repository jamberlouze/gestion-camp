// Fonctions pures du module RH (aucun import d'exécution).
import type { Candidature, DateSaison, Embauche, GenreSaison, Personne, Poste, Saison } from './types'

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 12 oct. 2026 » (année omise si c'est celle de `ref`). */
export function dateCourte(iso: string | null | undefined, ref?: string) {
  if (!iso) return ''
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  const annee = ref && ref.slice(0, 4) === String(a) ? '' : ` ${a}`
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}${annee}`
}

/** « 1er au 3 mai », « 8 et 9 mai », « 28 juin au 5 juillet », « 12 juin ». */
export function plageDates(debut: string | null, fin: string | null) {
  if (!debut) return ''
  const [, m1, j1] = debut.split('-').map(Number)
  const jour = (j: number) => (j === 1 ? '1er' : String(j))
  if (!fin || fin === debut) return `${jour(j1)} ${MOIS_LONGS[m1 - 1]}`
  const [, m2, j2] = fin.split('-').map(Number)
  if (m1 === m2) return `${jour(j1)} ${j2 === j1 + 1 ? 'et' : 'au'} ${jour(j2)} ${MOIS_LONGS[m2 - 1]}`
  return `${jour(j1)} ${MOIS_LONGS[m1 - 1]} au ${jour(j2)} ${MOIS_LONGS[m2 - 1]}`
}

/** Libellé d'une date de saison : « Classe verte · 8 et 9 mai ». */
export const libelleDate = (d: DateSaison) => [d.nom, plageDates(d.debut, d.fin)].filter(Boolean).join(' · ')

/** Âge à une date (années pleines). */
export function age(naissance: string | null, a: string) {
  if (!naissance) return null
  const [an, mn, jn] = naissance.split('-').map(Number)
  const [aa, ma, ja] = a.slice(0, 10).split('-').map(Number)
  return aa - an - (ma < mn || (ma === mn && ja < jn) ? 1 : 0)
}

export const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Texte où chercher une personne : nom, nom de camp, courriel, téléphone. */
export const texteRecherche = (p: Personne) =>
  sansAccents([p.prenom, p.nom_famille, p.surnom, p.courriel, p.telephone?.replace(/\D/g, '')].filter(Boolean).join(' '))

/** Tous les mots cherchés sont présents. */
export function correspond(texte: string, recherche: string) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean)
  return mots.every((m) => texte.includes(m))
}

/** Nom affiché : « Prénom Nom (Nom de camp) ». */
export const nomAffiche = (p: Pick<Personne, 'prenom' | 'nom_famille' | 'surnom'>) =>
  `${p.prenom} ${p.nom_famille}`.trim() + (p.surnom ? ` (${p.surnom})` : '')

/**
 * Un ancien : a déjà travaillé avec nous avant la base RH, ou une embauche
 * complète dans une saison antérieure à `rang` (sans rang : n'importe quelle).
 */
export function estAncien(p: Pick<Personne, 'deja_travaille'>, embauches: Embauche[], saisons: Map<string, Saison>, rang?: number) {
  return p.deja_travaille || embauches.some((e) => e.statut === 'complete' && (rang === undefined || (saisons.get(e.saison_id)?.rang ?? 0) < rang))
}

/**
 * Saison affichée par défaut dans Employés : la prochaine qui a des
 * embauches (ou la plus récente), d'après le rang de la saison du jour.
 */
export function saisonParDefaut(saisons: Saison[], embauches: Embauche[], jour: string) {
  const avec = new Set(embauches.map((e) => e.saison_id))
  const candidates = saisons.filter((s) => avec.has(s.id))
  if (!candidates.length) return saisons.at(-1)?.id ?? null
  const rangJour = rangDuJour(jour)
  return (candidates.find((s) => s.rang >= rangJour) ?? candidates.at(-1)!).id
}

/** Rang (annee × 10 + saison) du jour : déc.–févr. hiver, mars–mai printemps, juin–août été, sept.–nov. automne. */
export function rangDuJour(jour: string) {
  const [a, m] = jour.split('-').map(Number)
  if (m === 12) return (a + 1) * 10 + 1
  if (m <= 2) return a * 10 + 1
  if (m <= 5) return a * 10 + 2
  if (m <= 8) return a * 10 + 3
  return a * 10 + 4
}

/** Candidature qui vise une saison donnée (demandée ou décidée). */
export const viseSaison = (c: Candidature, saisonId: string) => c.saison_ids.includes(saisonId) || c.saison_id === saisonId

/** NAS masqué : « •••-•••-123 ». */
export const nasMasque = (fin: string | null) => (fin ? `•••-•••-${fin}` : '')

/** NAS lisible : « 046-454-286 ». */
export const nasLisible = (nas: string | null | undefined) => (nas && /^\d{9}$/.test(nas) ? `${nas.slice(0, 3)}-${nas.slice(3, 6)}-${nas.slice(6)}` : (nas ?? ''))

/** Taille lisible d'un fichier. */
export function tailleFichier(octets: number | null) {
  if (!octets) return ''
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

/** Jour de Montréal (AAAA-MM-JJ). */
export const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal' }).format(new Date())

/** Date et heure courtes d'un horodatage : « 12 oct. 2026, 14 h 05 ». */
export function horodatage(iso: string) {
  const d = new Date(iso)
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal' }).format(d)
  const heure = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Montreal', hour: '2-digit', minute: '2-digit' }).format(d)
  return `${dateCourte(jour)}, ${heure}`
}

/** Postes regroupés par compagnie (ordre du référentiel), actifs seulement sauf ceux déjà choisis. */
export function postesParCompagnie(postes: Poste[], compagnies: { id: string; ordre: number }[], garder: string[] = [], genre?: GenreSaison) {
  const ordre = new Map(compagnies.map((c) => [c.id, c.ordre]))
  return postes
    .filter((p) => garder.includes(p.id) || (p.actif && (!genre || p.genres.includes(genre))))
    .sort((a, b) => (ordre.get(a.entreprise_id) ?? 99) - (ordre.get(b.entreprise_id) ?? 99) || a.ordre - b.ordre || a.nom.localeCompare(b.nom))
}
