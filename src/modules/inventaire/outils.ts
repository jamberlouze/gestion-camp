import type { Article, Comptage, Element, Ligne } from './types'

// Fonctions pures : ni React ni Supabase.

export const cleLigne = (comptage: string, article: string) => `${comptage}:${article}`

/** Le comptage en cours s'il y en a un, sinon le plus récent (liste triée du plus récent au plus ancien). */
export function comptageParDefaut(comptages: Comptage[]): Comptage | null {
  return comptages.find((c) => c.statut === 'en_cours') ?? comptages[0] ?? null
}

/** Le comptage d'avant (pour comparer) : le suivant dans la liste triée du plus récent au plus ancien. */
export function comptagePrecedent(comptages: Comptage[], c: Comptage | null): Comptage | null {
  if (!c) return null
  const i = comptages.findIndex((x) => x.id === c.id)
  return i >= 0 ? (comptages[i + 1] ?? null) : null
}

/** Nom proposé pour un nouveau comptage : l'année, sinon « 2026 (2) »… */
export function nomNouveauComptage(comptages: Comptage[], aujourdhui = new Date()): string {
  const annee = String(aujourdhui.getFullYear())
  const pris = new Set(comptages.map((c) => c.nom.trim().toLowerCase()))
  if (!pris.has(annee)) return annee
  for (let n = 2; ; n++) if (!pris.has(`${annee} (${n})`)) return `${annee} (${n})`
}

export const total = (l: Pick<Ligne, 'bon' | 'brise' | 'incomplet'>) => l.bon + l.brise + l.incomplet

/** Combien il en manque en bon état (0 s'il n'y a pas de cible ou si l'article n'est pas compté). */
export function manque(article: Pick<Article, 'necessaire'>, ligne: Pick<Ligne, 'bon'> | undefined): number {
  if (article.necessaire == null || !ligne) return 0
  return Math.max(0, article.necessaire - ligne.bon)
}

export const nomArticle = (a: Pick<Article, 'nom' | 'variante'>) => (a.variante ? `${a.nom} · ${a.variante}` : a.nom)

/** Pour chercher sans tenir compte des accents ni de la casse. */
export const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export interface Filtres {
  recherche: string
  compagnie: string
  lieu: string
  categorie: string
  /** Seulement ceux pas encore comptés (comptage en cours). */
  aCompter: boolean
  /** Seulement ceux dont il manque (nombre nécessaire). */
  manquants: boolean
}

export const FILTRES_VIDES: Filtres = { recherche: '', compagnie: '', lieu: '', categorie: '', aCompter: false, manquants: false }

/** « aucun » dans un filtre de lieu ou de catégorie = articles sans lieu / sans catégorie. */
export const AUCUN = 'aucun'

function correspond(valeur: string | null, filtre: string) {
  if (!filtre) return true
  if (filtre === AUCUN) return valeur === null
  return valeur === filtre
}

/**
 * Articles à montrer pour un comptage : les articles actifs, plus ceux
 * retirés depuis qui ont des nombres dans ce comptage ; filtrés.
 */
export function articlesVisibles(
  articles: Article[],
  ligneDe: (a: Article) => Ligne | undefined,
  filtres: Filtres,
): Article[] {
  const recherche = normaliser(filtres.recherche)
  return articles.filter((a) => {
    const l = ligneDe(a)
    if (!a.actif && !l) return false
    if (recherche && !normaliser(`${a.nom} ${a.variante ?? ''} ${a.note ?? ''}`).includes(recherche)) return false
    if (!correspond(a.entreprise_id, filtres.compagnie)) return false
    if (!correspond(a.lieu_id, filtres.lieu)) return false
    if (!correspond(a.categorie_id, filtres.categorie)) return false
    if (filtres.aCompter && l) return false
    if (filtres.manquants && manque(a, l) === 0) return false
    return true
  })
}

export type Regroupement = 'categorie' | 'lieu'

export interface Groupe {
  id: string
  titre: string
  articles: Article[]
}

/**
 * Articles regroupés par catégorie ou par lieu, dans l'ordre des listes du
 * module (sans catégorie / sans lieu à la fin), puis dans l'ordre des articles.
 */
export function regrouper(articles: Article[], par: Regroupement, liste: Element[]): Groupe[] {
  const cle = (a: Article) => (par === 'categorie' ? a.categorie_id : a.lieu_id)
  const parCle = new Map<string, Article[]>()
  for (const a of articles) {
    const k = cle(a) ?? AUCUN
    parCle.set(k, [...(parCle.get(k) ?? []), a])
  }
  const tri = (x: Article, y: Article) => x.ordre - y.ordre || x.nom.localeCompare(y.nom, 'fr') || (x.variante ?? '').localeCompare(y.variante ?? '', 'fr')
  const groupes: Groupe[] = []
  for (const e of [...liste].sort((x, y) => x.ordre - y.ordre)) {
    const a = parCle.get(e.id)
    if (a?.length) groupes.push({ id: e.id, titre: e.nom, articles: a.sort(tri) })
  }
  const sans = parCle.get(AUCUN)
  if (sans?.length) groupes.push({ id: AUCUN, titre: par === 'categorie' ? 'Sans catégorie' : 'Sans lieu', articles: sans.sort(tri) })
  return groupes
}

/** Avancement d'un comptage : articles comptés sur articles actifs. */
export function avancement(articles: Article[], ligneDe: (a: Article) => Ligne | undefined) {
  const actifs = articles.filter((a) => a.actif)
  return { comptes: actifs.filter((a) => ligneDe(a)).length, total: actifs.length }
}

/** Totaux d'un comptage (pour la liste des comptages). */
export function bilan(lignes: Ligne[]) {
  return lignes.reduce(
    (b, l) => ({ articles: b.articles + 1, bon: b.bon + l.bon, brise: b.brise + l.brise, incomplet: b.incomplet + l.incomplet }),
    { articles: 0, bon: 0, brise: 0, incomplet: 0 },
  )
}

/** Date courte en français : « 6 août 2024 ». */
export function dateCourte(iso: string | null) {
  if (!iso) return ''
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
}
