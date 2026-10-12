import type { Article, Compte, Element } from './types'

// Fonctions pures : ni React ni Supabase.

/** Aujourd'hui au camp (AAAA-MM-JJ, heure de Montréal). */
export const aujourdhui = (maintenant = new Date()) => maintenant.toLocaleDateString('en-CA', { timeZone: 'America/Montreal' })

/** Comptes de chaque article, du plus récent au plus ancien. */
export function historiques(comptes: Compte[]): Map<string, Compte[]> {
  const parArticle = new Map<string, Compte[]>()
  for (const c of comptes) parArticle.set(c.article_id, [...(parArticle.get(c.article_id) ?? []), c])
  for (const liste of parArticle.values()) liste.sort((a, b) => b.jour.localeCompare(a.jour))
  return parArticle
}

/** Le compte de ce jour-là, s'il existe. */
export const compteDuJour = (historique: Compte[], jour: string) => historique.find((c) => c.jour === jour)

/** Le dernier compte d'avant ce jour-là (pour comparer pendant qu'on compte). */
export const compteAvant = (historique: Compte[], jour: string) => historique.find((c) => c.jour < jour)

export const total = (c: Pick<Compte, 'bon' | 'brise' | 'incomplet'>) => c.bon + c.brise + c.incomplet

/** Combien il en manque en bon état (0 s'il n'y a pas de cible ou si l'article n'a jamais été compté). */
export function manque(article: Pick<Article, 'necessaire'>, compte: Pick<Compte, 'bon'> | undefined): number {
  if (article.necessaire == null || !compte) return 0
  return Math.max(0, article.necessaire - compte.bon)
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
  section: string
  /** Pendant un comptage : seulement ceux pas encore comptés ce jour-là. */
  aCompter: boolean
  /** Seulement ceux dont il manque (nombre nécessaire, dernier compte). */
  manquants: boolean
}

export const FILTRES_VIDES: Filtres = { recherche: '', compagnie: '', lieu: '', section: '', aCompter: false, manquants: false }

/** « aucun » dans un filtre de lieu ou de section = articles sans lieu / sans section. */
export const AUCUN = 'aucun'

function correspond(valeur: string | null, filtre: string) {
  if (!filtre) return true
  if (filtre === AUCUN) return valeur === null
  return valeur === filtre
}

/** Articles actifs, filtrés. `jour` = jour du comptage en cours (pour « À compter »). */
export function articlesVisibles(articles: Article[], historiqueDe: (a: Article) => Compte[], filtres: Filtres, jour: string): Article[] {
  const recherche = normaliser(filtres.recherche)
  return articles.filter((a) => {
    if (!a.actif) return false
    const h = historiqueDe(a)
    if (recherche && !normaliser(`${a.nom} ${a.variante ?? ''} ${a.note ?? ''}`).includes(recherche)) return false
    if (!correspond(a.entreprise_id, filtres.compagnie)) return false
    if (!correspond(a.lieu_id, filtres.lieu)) return false
    if (!correspond(a.section_id, filtres.section)) return false
    if (filtres.aCompter && compteDuJour(h, jour)) return false
    if (filtres.manquants && manque(a, h[0]) === 0) return false
    return true
  })
}

export type Regroupement = 'section' | 'lieu'

export interface Groupe {
  id: string
  titre: string
  articles: Article[]
}

/**
 * Articles regroupés par section ou par lieu, dans l'ordre des listes du
 * module (sans section / sans lieu à la fin), puis dans l'ordre des articles.
 */
export function regrouper(articles: Article[], par: Regroupement, liste: Element[]): Groupe[] {
  const cle = (a: Article) => (par === 'section' ? a.section_id : a.lieu_id)
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
  if (sans?.length) groupes.push({ id: AUCUN, titre: par === 'section' ? 'Sans section' : 'Sans lieu', articles: sans.sort(tri) })
  return groupes
}

/** Quand une section (ou un lieu) a été comptée : jours du plus ancien et du plus récent dernier compte, et jamais comptés. */
export function etatGroupe(articles: Article[], historiqueDe: (a: Article) => Compte[]) {
  const derniers = articles.map((a) => historiqueDe(a)[0]?.jour).filter((j): j is string => !!j)
  derniers.sort()
  return { plusAncien: derniers[0] ?? null, plusRecent: derniers[derniers.length - 1] ?? null, jamais: articles.length - derniers.length }
}

/** Date en français : « 6 août 2024 » (« 6 août » si `sansAnnee`). */
export function dateCourte(iso: string | null, sansAnnee = false) {
  if (!iso) return ''
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', ...(sansAnnee ? {} : { year: 'numeric' }) })
}

/** « compté le 6 août 2024 », « comptes du 6 août 2024 au 11 octobre 2026 », avec les jamais comptés. */
export function texteEtatGroupe(e: ReturnType<typeof etatGroupe>) {
  const parties: string[] = []
  if (e.plusAncien && e.plusAncien === e.plusRecent) parties.push(`compté le ${dateCourte(e.plusAncien)}`)
  else if (e.plusAncien) parties.push(`comptes du ${dateCourte(e.plusAncien)} au ${dateCourte(e.plusRecent)}`)
  if (e.jamais) parties.push(e.plusAncien ? `${e.jamais} jamais compté${e.jamais > 1 ? 's' : ''}` : 'jamais compté')
  return parties.join(' · ')
}
