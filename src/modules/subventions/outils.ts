import type { Profil } from '@/lib/types'
import type { CategorieRejet, Statut, StatutEtape, Subvention, TypeSubvention } from './types'

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
 * Date qui rattache une subvention à une année fiscale : octroi, sinon
 * réception, sinon date limite, sinon découverte.
 */
export const dateRattachement = (g: Subvention) =>
  g.granted_at ?? g.received_at ?? g.deadline_date ?? g.discovered_at.slice(0, 10)

/** Date du jour (heure locale) au format AAAA-MM-JJ. */
export function aujourdhui() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

/** Entreprise qui porte la subvention : celle qui dépose, sinon celle pour qui elle a été trouvée. */
export const entrepriseDe = (g: Subvention) => g.applicant_company_id ?? g.target_company_id
