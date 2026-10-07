// Coût par assiette — fonctions pures. Tout est d'abord ramené au jour
// (nourriture, salaires, assiettes), puis additionné par intervalle : les
// mois de l'année ou les semaines du camp. Dates en texte AAAA-MM-JJ,
// calculées en UTC.
import { REPAS, type CellulePlan, type GroupeRepas, type Menu } from '../types'
import type { CorrectionMenu, Facture, GroupeManuel, Poste, Salaire } from './types'

const JOUR = 86_400_000
const temps = (jour: string) => Date.parse(`${jour}T00:00:00Z`)
export const ajouterJours = (jour: string, n: number) => new Date(temps(jour) + n * JOUR).toISOString().slice(0, 10)
/** Nombre de jours de `a` à `b` (b − a). */
export const ecartJours = (a: string, b: string) => Math.round((temps(b) - temps(a)) / JOUR)

/** Arrondi au cent. */
export const cents = (n: number) => Math.round(n * 100) / 100

// ------------------------------------------------------------------
// Années, mois, semaines
// ------------------------------------------------------------------

/** 2025 → « 2025-2026 » */
export const nomAnnee = (annee: number) => `${annee}-${annee + 1}`
export const debutAnnee = (annee: number) => `${annee}-10-01`
export const finAnnee = (annee: number) => `${annee + 1}-09-30`
/** Année (exercice) qui contient un jour. */
export const anneeDe = (jour: string) => {
  const [a, m] = jour.split('-').map(Number)
  return m >= 10 ? a : a - 1
}

/** Intervalle de jours (mois de l'année ou semaine du camp), bornes incluses. */
export interface Intervalle {
  id: string
  nom: string
  debut: string
  fin: string
}

export const parDebut = (a: Intervalle, b: Intervalle) => a.debut.localeCompare(b.debut)

const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

/** Les 12 mois civils de l'année, d'octobre à septembre. */
export function moisDeLAnnee(annee: number): Intervalle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((9 + i) % 12) + 1
    const a = m >= 10 ? annee : annee + 1
    const debut = `${a}-${String(m).padStart(2, '0')}-01`
    const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
    return { id: debut.slice(0, 7), nom: NOMS_MOIS[m - 1], debut, fin: ajouterJours(suivant, -1) }
  })
}

/** N semaines de 7 jours à partir de `semaine1` (un dimanche), dans les limites de l'année. */
export function semainesParDefaut(annee: number, semaine1: string, n = 8): Omit<Intervalle, 'id'>[] {
  return Array.from({ length: n }, (_, k) => ({
    nom: `Semaine ${k + 1}`,
    debut: ajouterJours(semaine1, 7 * k),
    fin: ajouterJours(semaine1, 7 * k + 6),
  })).filter((s) => s.debut >= debutAnnee(annee) && s.fin <= finAnnee(annee))
}

/** Dernier dimanche de juin (proposé comme début de la semaine 1). */
export function dernierDimancheJuin(anneeCivile: number): string {
  const d = new Date(Date.UTC(anneeCivile, 5, 30))
  d.setUTCDate(30 - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/** Intervalle qui contient le jour. */
export const intervalleDe = (jour: string, liste: Intervalle[]) => liste.find((p) => p.debut <= jour && jour <= p.fin)

// ------------------------------------------------------------------
// Périodes de paie (mêmes règles que temps.debut_periode et modules/temps)
// ------------------------------------------------------------------

const ANCRE_PAIE = '2026-10-04'
export const JOURS_PAIE = 14

/** Premier jour (dimanche) de la période de paie qui contient le jour. */
export const debutPaie = (jour: string) => ajouterJours(ANCRE_PAIE, Math.floor(ecartJours(ANCRE_PAIE, jour) / JOURS_PAIE) * JOURS_PAIE)

/** Périodes de paie qui touchent l'année (au moins un jour du 1er octobre au 30 septembre). */
export function paiesDeLAnnee(annee: number): string[] {
  const liste: string[] = []
  for (let d = debutPaie(debutAnnee(annee)); d <= finAnnee(annee); d = ajouterJours(d, JOURS_PAIE)) liste.push(d)
  return liste
}

// ------------------------------------------------------------------
// Ramené au jour
// ------------------------------------------------------------------

/** Valeurs par jour (AAAA-MM-JJ). */
type ParJour = Map<string, number>
const ajouter = (m: ParJour, jour: string, n: number) => m.set(jour, (m.get(jour) ?? 0) + n)

/** Jour où une facture compte. */
export const jourFacture = (f: Facture) => f.jour_impute ?? f.jour

/** Salaires : chaque période de paie partagée également entre ses 14 jours. */
export function salairesParJour(salaires: Salaire[]): ParJour {
  const r: ParJour = new Map()
  for (const s of salaires) for (let k = 0; k < JOURS_PAIE; k++) ajouter(r, ajouterJours(s.debut_paie, k), s.montant / JOURS_PAIE)
  return r
}

export interface MenuDate {
  menu: Menu
  groupes: GroupeRepas[]
  cellules: CellulePlan[]
}

/**
 * Assiettes d'un menu daté, jour par jour : à chaque repas planifié (plat,
 * salade ou dessert choisi), les portions de tous les groupes présents. Les
 * groupes en sortie mangent leur repas de glacière : leurs portions comptent.
 */
export function assiettesMenuParJour(m: MenuDate): ParJour {
  const r: ParJour = new Map()
  if (!m.menu.debut) return r
  const cellules = new Map(m.cellules.map((c) => [`${c.day}_${c.meal}`, c]))
  for (let d = 0; d < m.menu.jours; d++) {
    let n = 0
    for (const rep of REPAS) {
      const c = cellules.get(`${d}_${rep.id}`)
      if (!c || !(c.plat || c.salade || c.dessert)) continue
      for (const g of m.groupes) if (!c.absent?.includes(g.id)) n += Math.max(0, g.portions)
    }
    if (n) r.set(ajouterJours(m.menu.debut, d), n)
  }
  return r
}

/**
 * Total corrigé à la main réparti comme le calcul (même proportion chaque
 * jour) ; si le calcul ne donne rien, également sur les jours du menu.
 */
export function repartirCorrection(menu: Menu, calcule: ParJour, total: number): ParJour {
  const somme = [...calcule.values()].reduce((t, n) => t + n, 0)
  if (somme > 0) return new Map([...calcule].map(([j, n]) => [j, (n * total) / somme]))
  const r: ParJour = new Map()
  if (!menu.debut || menu.jours < 1) return r
  for (let d = 0; d < menu.jours; d++) r.set(ajouterJours(menu.debut, d), total / menu.jours)
  return r
}

/** Groupe ajouté : personnes × repas, également sur ses jours. */
export function assiettesGroupeParJour(g: GroupeManuel): ParJour {
  const r: ParJour = new Map()
  if (!g.debut || !g.fin) return r
  const jours = ecartJours(g.debut, g.fin) + 1
  for (let k = 0; k < jours; k++) r.set(ajouterJours(g.debut, k), (g.personnes * g.repas) / jours)
  return r
}

/** Le menu touche-t-il l'année ? */
export const menuDansAnnee = (menu: Menu, annee: number) =>
  !menu.modele && !!menu.debut && menu.debut <= finAnnee(annee) && ajouterJours(menu.debut, menu.jours - 1) >= debutAnnee(annee)

export interface LigneMenu {
  menu: Menu
  calcule: number
  /** Total corrigé à la main, sinon null. */
  corrige: number | null
  parJour: ParJour
}

export function lignesMenus(menus: MenuDate[], corrections: CorrectionMenu[]): LigneMenu[] {
  const corr = new Map(corrections.map((c) => [c.menu_id, c.assiettes]))
  return menus.map((m) => {
    const calcule = assiettesMenuParJour(m)
    const corrige = corr.get(m.menu.id) ?? null
    return {
      menu: m.menu,
      calcule: [...calcule.values()].reduce((t, n) => t + n, 0),
      corrige,
      parJour: corrige == null ? calcule : repartirCorrection(m.menu, calcule, corrige),
    }
  })
}

// ------------------------------------------------------------------
// Tableau
// ------------------------------------------------------------------

export interface Journalier {
  nourriture: ParJour
  salaires: ParJour
  assiettes: ParJour
}

/** Tout ramené au jour, pour une année (les menus seulement si l'année les compte). */
export function journalier(
  factures: Facture[],
  salaires: Salaire[],
  groupes: GroupeManuel[],
  menus: LigneMenu[],
  avecMenus: boolean,
): Journalier {
  const nourriture: ParJour = new Map()
  for (const f of factures) ajouter(nourriture, jourFacture(f), f.montant)
  const assiettes: ParJour = new Map()
  for (const g of groupes) for (const [j, n] of assiettesGroupeParJour(g)) ajouter(assiettes, j, n)
  if (avecMenus) for (const m of menus) for (const [j, n] of m.parJour) ajouter(assiettes, j, n)
  return { nourriture, salaires: salairesParJour(salaires), assiettes }
}

export interface LigneTableau {
  intervalle: Intervalle
  nourriture: number
  salaires: number
  assiettes: number
  /** null : aucune assiette. */
  coutNourriture: number | null
  coutTotal: number | null
}

const parAssiette = (montant: number, assiettes: number) => (assiettes > 0 ? montant / assiettes : null)
const somme = (m: ParJour, debut: string, fin: string) => {
  let t = 0
  for (const [j, n] of m) if (debut <= j && j <= fin) t += n
  return t
}

const ligne = (intervalle: Intervalle, n: number, s: number, a: number): LigneTableau => ({
  intervalle,
  nourriture: cents(n),
  salaires: cents(s),
  assiettes: a,
  coutNourriture: parAssiette(n, a),
  coutTotal: parAssiette(n + s, a),
})

/** Une ligne par intervalle (sans chevauchement), plus le total de tous les intervalles. */
export function tableau(intervalles: Intervalle[], j: Journalier, total: Omit<Intervalle, 'debut' | 'fin'>): { lignes: LigneTableau[]; total: LigneTableau } {
  let tn = 0
  let ts = 0
  let ta = 0
  const lignes = [...intervalles].sort(parDebut).map((i) => {
    const n = somme(j.nourriture, i.debut, i.fin)
    const s = somme(j.salaires, i.debut, i.fin)
    const a = somme(j.assiettes, i.debut, i.fin)
    tn += n
    ts += s
    ta += a
    return ligne(i, n, s, a)
  })
  const bornes = lignes.length ? { debut: lignes[0].intervalle.debut, fin: lignes.at(-1)!.intervalle.fin } : { debut: '', fin: '' }
  return { lignes, total: ligne({ ...total, ...bornes }, tn, ts, ta) }
}

/** Postes affichés : les actifs, plus ceux qui ont des montants. */
export function postesAffiches(postes: Poste[], salaires: Salaire[]): Poste[] {
  const utilises = new Set(salaires.map((s) => s.poste_id))
  return postes.filter((p) => p.actif || utilises.has(p.id)).sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
}

// ------------------------------------------------------------------
// Affichage
// ------------------------------------------------------------------

const formatArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })
export const argent = (n: number) => formatArgent.format(n)
const formatEntier = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })
/** Entier arrondi (les assiettes réparties sur des jours peuvent être fractionnaires). */
export const entier = (n: number) => formatEntier.format(Math.round(n))

const formatJour = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatJourAnnee = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** « 5 oct. » */
export const jourCourt = (jour: string) => formatJour.format(new Date(`${jour}T00:00:00Z`))
/** « 5 oct. 2025 » */
export const jourLong = (jour: string) => formatJourAnnee.format(new Date(`${jour}T00:00:00Z`))
/** « 28 juin – 4 juil. » */
export const intervalle = (debut: string, fin: string) => (debut === fin ? jourCourt(debut) : `${jourCourt(debut)} – ${jourCourt(fin)}`)

/** « 19,99 », « 19.99 », « 1 800 », « -23,82 $ » → nombre ; vide ou illisible → null. */
export function lireMontant(texte: string): number | null {
  const propre = texte.replace(/[\s $]/g, '').replace(',', '.')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? cents(n) : null
}

/** Montant dans un champ : « 1415,22 » (vide pour 0). */
export const montantChamp = (n: number | null | undefined) => (n ? n.toFixed(2).replace('.', ',') : '')
