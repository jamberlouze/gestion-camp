import type { Profil } from '@/lib/types'
import { ui } from '@/lib/ui'
import type { Employe } from '@/lib/types'
import type { CategorieRejet, ChampPropose, LigneSalaire, Statut, StatutEtape, Subvention, TypeSubvention } from './types'

export const STATUTS: Record<Statut, { libelle: string; classe: string }> = {
  nouveau: { libelle: 'Nouvelle', classe: 'bg-sky-100 text-sky-800' },
  a_valider: { libelle: 'En attente', classe: 'bg-amber-100 text-amber-800' },
  en_cours: { libelle: 'En cours', classe: 'bg-violet-100 text-violet-800' },
  obtenu: { libelle: 'Obtenue', classe: 'bg-foret-100 text-foret-800' },
  refuse: { libelle: "Refusée par l'organisme", classe: 'bg-red-100 text-red-800' },
  rejete: { libelle: 'Rejetée', classe: 'bg-pierre-200 text-pierre-700' },
  expire: { libelle: 'Expirée', classe: 'bg-pierre-100 text-pierre-500' },
}
export const ORDRE_STATUTS: Statut[] = ['nouveau', 'a_valider', 'en_cours', 'obtenu', 'refuse', 'rejete', 'expire']

export const TYPES: Record<TypeSubvention, string> = {
  salarial: 'Salariale',
  immobilisation: 'Immobilisation',
  formation: 'Formation',
  rd: 'R-D',
  exportation: 'Exportation',
  marketing: 'Marketing',
  autre: 'Autre',
}

export const CATEGORIES: Record<CategorieRejet, string> = {
  montant_trop_faible: 'Montant trop faible',
  criteres_non_respectes: 'Critères non respectés',
  deja_explore: 'Déjà exploré',
  hors_secteur: 'Hors secteur',
  echeance_trop_courte: 'Échéance trop courte',
  non_pertinent_organisation: "Pas pertinent pour l'organisation",
  non_admissible: 'Non admissible',
  autre: 'Autre',
}

export const STATUTS_ETAPE: Record<StatutEtape, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  complete: 'Complétée',
}

/**
 * Année fiscale (1er octobre au 30 septembre), nommée d'après l'année où
 * elle se termine, comme subventions.fiscal_year : 2026-03-01 → 2026.
 */
export function anneeFiscale(iso: string) {
  const [a, m] = iso.split('-').map(Number)
  return m >= 10 ? a + 1 : a
}
export const anneeFiscaleCourante = () => anneeFiscale(aujourdhui())
/** « 2025-26 » pour l'année fiscale 2026. */
export const libelleAnneeFiscale = (fy: number) => `${fy - 1}-${String(fy).slice(2)}`

/**
 * Année fiscale proposée (même règle que subventions.poser_annee_fiscale) :
 * période financée, sinon date limite, sinon octroi, sinon année de la
 * découverte ; avec ce qui l'a décidée.
 */
export function anneeFiscaleProposee(g: Pick<Subvention, 'funded_start' | 'deadline_date' | 'granted_at' | 'discovered_fy'>) {
  if (g.funded_start) return { annee: anneeFiscale(g.funded_start), selon: 'la période financée' }
  if (g.deadline_date) return { annee: anneeFiscale(g.deadline_date), selon: 'la date limite' }
  if (g.granted_at) return { annee: anneeFiscale(g.granted_at), selon: "la date d'octroi" }
  return { annee: g.discovered_fy, selon: "l'année de la découverte" }
}

/** Retenue (en cours) ou obtenue : dans l'agenda, à mettre à jour, à l'attribution salariale. */
export const estRetenue = (g: Pick<Subvention, 'status'>) => g.status === 'en_cours' || g.status === 'obtenu'

/** Date du jour (heure locale) au format AAAA-MM-JJ. */
export function aujourdhui() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const jourIso = (a: number, m: number, j: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`

/**
 * Recherche automatique : 4 fois par année, le 1er octobre, janvier, avril et
 * juillet (passages jusqu'au 7 si le cron a manqué ; voir estTourTrimestriel
 * du Worker). `enCours` : on est dans cette semaine-là.
 */
export function prochainTrimestre(d = new Date()) {
  const m = d.getMonth()
  if (m % 3 === 0 && d.getDate() <= 7) return { date: jourIso(d.getFullYear(), m, 1), enCours: true }
  const suivant = Math.floor(m / 3) * 3 + 3
  return { date: jourIso(d.getFullYear() + (suivant >= 12 ? 1 : 0), suivant % 12, 1), enCours: false }
}

export function joursAvant(iso: string) {
  const [a, m, j] = iso.split('-').map(Number)
  const [ca, cm, cj] = aujourdhui().split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(ca, cm - 1, cj)) / 86_400_000)
}

const formatArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
export const argent = (n: number) => formatArgent.format(n)

export function montantsPotentiels(g: Pick<Subvention, 'potential_amount_min' | 'potential_amount_max'>) {
  const { potential_amount_min: min, potential_amount_max: max } = g
  if (min != null && max != null && min !== max) return `${argent(min)} à ${argent(max)}`
  if (max != null) return `jusqu'à ${argent(max)}`
  if (min != null) return `à partir de ${argent(min)}`
  return null
}

const formatDate = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** « 10 janv. 2027 » (date AAAA-MM-JJ). */
export const dateCourte = (iso: string) => formatDate.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))

const formatMoment = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** « 5 oct., 06 h 12 » (horodatage). */
export const moment = (iso: string) => formatMoment.format(new Date(iso))

export const heures = (n: number) => `${n.toLocaleString('fr-CA', { maximumFractionDigits: 2 })} h`

const formatCents = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** « 1 234,50 $ » (salaires, contributions). */
export const argentCents = (n: number) => formatCents.format(n)

/** « 62 % » ; null : « — ». */
export const pourcentage = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100).toLocaleString('fr-CA')} %`)

export const LIBELLES_CHAMPS: Record<ChampPropose, string> = {
  source_url: 'Page officielle',
  open_date: 'Ouverture de la demande',
  deadline_date: 'Date limite',
  funded_start: 'Début de la période financée',
  funded_end: 'Fin de la période financée',
  potential_amount_min: 'Montant potentiel minimum',
  potential_amount_max: 'Montant potentiel maximum',
  eligibility_criteria: "Critères d'admissibilité",
}

/** Valeur d'une proposition (texte de la base) telle qu'affichée. */
export function valeurChamp(champ: ChampPropose, v: string | null) {
  if (v == null || v === '') return '—'
  if (champ === 'open_date' || champ === 'deadline_date' || champ === 'funded_start' || champ === 'funded_end') return dateCourte(v)
  if (champ === 'potential_amount_min' || champ === 'potential_amount_max') return argent(Number(v))
  return v
}

/** « du 22 juin au 28 août 2027 » ; une seule borne connue : « à partir du … » / « jusqu'au … ». */
export function periode(debut: string | null, fin: string | null) {
  if (debut && fin) return `${dateCourte(debut)} au ${dateCourte(fin)}`
  if (debut) return `à partir du ${dateCourte(debut)}`
  if (fin) return `jusqu'au ${dateCourte(fin)}`
  return null
}

/** « Emplois d'été Canada » → « emplois-dete-canada » (même règle que le Worker). */
export function cleProgramme(texte: string) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

export function nomPersonne(profils: Profil[] | undefined, id: string | null) {
  const p = profils?.find((x) => x.id === id)
  return p ? p.nom || p.courriel.split('@')[0] : 'Quelqu’un'
}

/** Salariales d'abord, puis date limite la plus proche, puis les plus récentes. */
export function trierAValider(a: Subvention, b: Subvention) {
  const limite = (g: Subvention) => g.deadline_date ?? '9999-12-31'
  return (
    Number(b.grant_type === 'salarial') - Number(a.grant_type === 'salarial') ||
    limite(a).localeCompare(limite(b)) ||
    b.discovered_at.localeCompare(a.discovered_at)
  )
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Chaque mot cherché (sans égard aux accents) se trouve dans le nom, l'organisme, la description, la justification ou l'adresse. */
export function correspond(g: Subvention, recherche: string) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean)
  if (!mots.length) return true
  const texte = sansAccents(
    [g.program_name, g.organisme, g.description, g.relevance_justification, g.source_url].filter(Boolean).join(' '),
  )
  return mots.every((m) => texte.includes(m))
}

/** Entreprise qui porte la subvention : celle qui dépose, sinon celle pour qui elle a été trouvée. */
export const entrepriseDe = (g: Subvention) => g.applicant_company_id ?? g.target_company_id

/** Champ du module sans largeur imposée (ui.champ est en w-full, qui l'emporterait sur w-auto / w-24). */
export const champ = ui.champ.replace('w-full ', '')

// ---------------------------------------------------------------------
// Attribution salariale (fonctions pures)
// ---------------------------------------------------------------------
const cents = (n: number) => Math.round(n * 100) / 100

export interface CalculSalaire {
  /** Montant, sinon taux horaire × heures. */
  salaire: number | null
  subvention: number | null
  /** Saisie, sinon salaire − subvention (`employeurCalcule`). */
  employeur: number | null
  employeurCalcule: boolean
  /** Part payée par la subvention : subvention ÷ (subvention + employeur). */
  couvert: number | null
}

export function calculLigne(
  l: Pick<LigneSalaire, 'salary_amount' | 'hourly_rate' | 'hours' | 'grant_contribution' | 'employer_contribution'>,
): CalculSalaire {
  const n = (v: number | null) => (v == null ? null : Number(v))
  const salaire = n(l.salary_amount) ?? (l.hourly_rate != null && l.hours != null ? cents(Number(l.hourly_rate) * Number(l.hours)) : null)
  const subvention = n(l.grant_contribution)
  const saisi = n(l.employer_contribution)
  const employeur = saisi ?? (salaire != null && subvention != null ? cents(Math.max(0, salaire - subvention)) : null)
  const total = subvention != null && employeur != null ? subvention + employeur : null
  return { salaire, subvention, employeur, employeurCalcule: saisi == null && employeur != null, couvert: total ? subvention! / total : null }
}

/** Totaux d'un groupe de lignes (valeurs connues seulement). */
export function totauxSalaires(lignes: CalculSalaire[]) {
  const somme = (f: (c: CalculSalaire) => number | null) => cents(lignes.reduce((s, c) => s + (f(c) ?? 0), 0))
  const subvention = somme((c) => (c.employeur != null ? c.subvention : null))
  const employeur = somme((c) => (c.subvention != null ? c.employeur : null))
  return {
    salaire: somme((c) => c.salaire),
    subvention: somme((c) => c.subvention),
    employeur: somme((c) => c.employeur),
    couvert: subvention + employeur > 0 ? subvention / (subvention + employeur) : null,
  }
}

/** « Marie Fortin (Koda) » ; sans prénom ni nom : le nom de camp. */
export function nomEmploye(e: Pick<Employe, 'surnom' | 'prenom' | 'nom_famille'>) {
  const nom = [e.prenom, e.nom_famille].filter(Boolean).join(' ')
  if (!nom) return e.surnom
  return sansAccents(nom) === sansAccents(e.surnom) ? nom : `${nom} (${e.surnom})`
}

/** « 18,5 » ou « 18.5 » → 18.5 ; vide → null ; invalide → NaN. */
export function lireNombre(v: string) {
  const t = v.replace(/[\s $]/g, '').replace(',', '.')
  if (!t) return null
  const x = Number(t)
  return Number.isFinite(x) && x >= 0 ? x : Number.NaN
}
