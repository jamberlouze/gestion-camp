// Calcul de l'estimé, repris formule par formule du chiffrier
// « Estimés | Accueil de groupe 2026-27 » (voir docs/plan-reservations.md, §3).
// Fonctions pures, sans import d'exécution : testées par `npm run test:calcul`
// contre les onglets réels du chiffrier.

import type { Forfait, Ratio, Variante } from './types'

export const TPS = 0.05
export const TVQ = 0.09975

/** Arrondi au cent, moitié vers le haut (en valeur absolue). */
export function arrondi2(n: number): number {
  const s = n < 0 ? -1 : 1
  return (s * Math.round(Math.abs(n) * 100 + 1e-7)) / 100
}

/** Prix unitaire : quatre décimales, comme la base (prix de fournisseurs majorés). */
export const arrondi4 = (n: number) => Math.round(n * 10_000) / 10_000

/** Exercice d'octobre à septembre, désigné par l'année où il se termine (2027 = 2026-27). */
export function exerciceDe(jour: string): number {
  const [a, m] = jour.split('-').map(Number)
  return m >= 10 ? a + 1 : a
}

export const libelleExercice = (ex: number) => `${ex - 1}-${String(ex).slice(2)}`

function jourUtc(jour: string): number {
  const [a, m, j] = jour.split('-').map(Number)
  return Date.UTC(a, m - 1, j)
}

/** Nuits entre deux dates (AAAA-MM-JJ). */
export const nuitsEntre = (arrivee: string, depart: string) =>
  Math.max(0, Math.round((jourUtc(depart) - jourUtc(arrivee)) / 86_400_000))

/** Minutes depuis minuit d'une heure « HH:MM[:SS] » (null si vide). */
export function minutes(heure: string | null | undefined): number | null {
  if (!heure) return null
  const m = /^(\d{1,2})[:h](\d{2})?/.exec(heure.trim())
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null
}

// ------------------------------------------------------------------
// Entrées du calcul
// ------------------------------------------------------------------

export interface EntreeCalcul {
  forfait: Forfait
  variante: Variante | null
  date_arrivee: string
  date_depart: string
  nb_participants: number | null
  nb_accompagnateurs: number | null
  ratio: Ratio | null
  service_repas: boolean
  nb_dejeuners: number
  nb_diners: number
  nb_soupers: number
  heures_extra: number
  heures_supplementaires: number
  etages: string[]
}

export interface ProduitCalcul {
  id: string
  code: string
  nom: string
  categorie: string
  etages: string[] | null
  actif: boolean
  ordre: number
}

export interface Etage {
  code: string
  lits: number
  chambres: number
}

export interface Catalogue {
  /** Prix d'un produit pour l'exercice (avec repli sur le plus récent), null si à définir. */
  prix: (code: string, exercice: number) => number | null
  produits: Map<string, ProduitCalcul>
  etages: Map<string, Etage>
  gratuitePar: number
  diviseurHeuresExtra: number
}

export interface LigneCalculee {
  code: string | null
  produit_id: string | null
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  pourcentage: number | null
  montant: number
  auto: boolean
}

export interface Resultat {
  lignes: LigneCalculee[]
  /** Produits sans prix pour l'exercice (comptés à 0 $). */
  manquants: string[]
  exercice: number
}

// ------------------------------------------------------------------
// Petits calculs réutilisés ailleurs (contrat, calendrier, horaire)
// ------------------------------------------------------------------

/** Diviseur d'un ratio « 1:N » ; 1:X = un seul animateur ; aucun = 0. */
export function animateursRequis(participants: number | null, ratio: Ratio | null): number {
  if (!participants || !ratio || ratio === 'aucun') return 0
  if (ratio === '1:X') return 1
  return Math.ceil(participants / Number(ratio.slice(2)))
}

/**
 * Accompagnateurs gratuits : un par tranche complète de `par` élèves, quel
 * que soit le ratio (chiffrier : ROUNDDOWN(élèves/20)), sans dépasser le
 * nombre d'accompagnateurs.
 */
export function gratuites(participants: number | null, accompagnateurs: number | null, par: number): number {
  if (!participants || !accompagnateurs || par <= 0) return 0
  return Math.min(Math.floor(participants / par), accompagnateurs)
}

export interface HeuresRepas {
  dejeuner: string
  diner: string
  souper: string
}

/**
 * Repas proposés d'après les heures (règle du prototype Airtable) : le
 * premier jour, seuls les repas servis après l'arrivée ; le dernier jour,
 * seuls ceux servis avant le départ. Journée plein air : un dîner.
 */
export function repasProposes(
  e: Pick<EntreeCalcul, 'forfait' | 'date_arrivee' | 'date_depart' | 'service_repas'> & {
    heure_arrivee: string | null
    heure_depart: string | null
  },
  heures: HeuresRepas,
): { dejeuners: number; diners: number; soupers: number } {
  const zero = { dejeuners: 0, diners: 0, soupers: 0 }
  if (e.forfait !== 'classe_nature' && !e.service_repas) return zero
  if (e.forfait === 'journee_plein_air') return { ...zero, diners: 1 }
  const jours = nuitsEntre(e.date_arrivee, e.date_depart) + 1
  const arr = minutes(e.heure_arrivee)
  const dep = minutes(e.heure_depart)
  const t = { dejeuners: minutes(heures.dejeuner)!, diners: minutes(heures.diner)!, soupers: minutes(heures.souper)! }
  const r = { ...zero }
  for (let i = 0; i < jours; i++) {
    for (const k of ['dejeuners', 'diners', 'soupers'] as const) {
      const apresArrivee = i > 0 || arr === null || arr <= t[k]
      const avantDepart = i < jours - 1 || dep === null || dep >= t[k]
      if (apresArrivee && avantDepart) r[k]++
    }
  }
  return r
}

/** Variante proposée : classe verte, blanche ou rouge selon le mois d'arrivée. */
export function varianteProposee(
  forfait: Forfait,
  dateArrivee: string,
  parMois: Record<string, string>,
): Variante | null {
  if (forfait !== 'classe_nature') return null
  return (parMois[String(Number(dateArrivee.slice(5, 7)))] as Variante | undefined) ?? null
}

// ------------------------------------------------------------------
// Hébergement : sections au prorata des lits
// ------------------------------------------------------------------

/** Lits et chambres d'un ensemble d'étages. */
export function litsDe(etages: string[], ref: Map<string, Etage>) {
  return etages.reduce(
    (t, c) => ({ lits: t.lits + (ref.get(c)?.lits ?? 0), chambres: t.chambres + (ref.get(c)?.chambres ?? 0) }),
    { lits: 0, chambres: 0 },
  )
}

/**
 * Regroupe les étages réservés en sections vendues (« Cèdres » plutôt que
 * « Cèdres haut » + « Cèdres bas ») : la plus grande section entièrement
 * réservée d'abord. Au prorata des lits, le prix est le même.
 */
export function regrouperSections(etages: string[], produits: Iterable<ProduitCalcul>): ProduitCalcul[] {
  const reste = new Set(etages)
  const sections = [...produits]
    .filter((p) => p.actif && p.categorie === 'hebergement' && p.etages?.length)
    .sort((a, b) => b.etages!.length - a.etages!.length || a.ordre - b.ordre)
  const choisies: ProduitCalcul[] = []
  for (const s of sections) {
    if (s.etages!.every((c) => reste.has(c))) {
      choisies.push(s)
      s.etages!.forEach((c) => reste.delete(c))
    }
  }
  return choisies.sort((a, b) => a.ordre - b.ordre)
}

// ------------------------------------------------------------------
// Lignes automatiques de l'estimé
// ------------------------------------------------------------------

const argent = (n: number) => `${n.toFixed(2).replace('.', ',')} $`

function libelleRatio(ratio: Ratio | null): string {
  if (!ratio || ratio === 'aucun') return 'sans animation'
  if (ratio === '1:X') return '1 seul animateur'
  return `ratio d'animation ${ratio}`
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

function ligne(
  code: string | null,
  cat: Catalogue,
  description: string,
  quantite: number,
  prix: number,
  note: string | null = null,
): LigneCalculee {
  return {
    code,
    produit_id: (code && cat.produits.get(code)?.id) || null,
    description,
    note,
    quantite,
    prix_unitaire: arrondi4(prix),
    pourcentage: null,
    montant: arrondi2(quantite * arrondi4(prix)),
    auto: true,
  }
}

/**
 * Prix par élève et par accompagnateur payant (Classe nature, Journée plein
 * air), comme les cellules « Prix forfait participant / accompagnateur ».
 */
export function prixScolaire(
  e: Pick<
    EntreeCalcul,
    'forfait' | 'date_arrivee' | 'date_depart' | 'ratio' | 'service_repas' | 'nb_dejeuners' | 'nb_diners' | 'nb_soupers' | 'heures_extra'
  >,
  diviseurHeuresExtra: number,
  p: (code: string) => number,
): { forfait: number; accompagnateur: number; partRepas: number } {
  const cn = e.forfait === 'classe_nature'
  const nuits = cn ? nuitsEntre(e.date_arrivee, e.date_depart) : 0
  const repas = e.nb_dejeuners + e.nb_diners + e.nb_soupers
  const anim = e.ratio && e.ratio !== 'aucun' ? p(`${cn ? 'CN' : 'JPA'}-${e.ratio}`) : 0
  // Chiffrier : nuitée à 32,50 $, ou 37,50 $ s'il n'y a qu'une nuit.
  const nuitee = nuits > 0 ? (p('CN-N') + (nuits === 1 ? p('CN-N1') : 0)) * nuits : 0
  // Classe nature : repas toujours inclus ; Journée plein air : si le groupe l'a choisi.
  const partRepas = cn || e.service_repas ? repas * (repas ? p('REPAS') : 0) : 0
  // Animation par jour, arrivée et départ compris (Classe nature) ; par journée (JPA).
  const partAnim = anim * (cn ? nuits + 1 : 1)
  const partExtra = cn ? (anim / diviseurHeuresExtra) * e.heures_extra : 0
  return { forfait: nuitee + partRepas + partAnim + partExtra, accompagnateur: nuitee / 2 + partRepas, partRepas }
}

/** Lignes produites par le calcul, selon le forfait (le reste se saisit à la main). */
export function lignesAuto(e: EntreeCalcul, cat: Catalogue): Resultat {
  const exercice = exerciceDe(e.date_arrivee)
  const manquants = new Set<string>()
  const p = (code: string) => {
    const v = cat.prix(code, exercice)
    if (v === null) manquants.add(code)
    return v ?? 0
  }
  const nuits = nuitsEntre(e.date_arrivee, e.date_depart)
  const jours = nuits + 1
  const repas = e.nb_dejeuners + e.nb_diners + e.nb_soupers
  const participants = e.nb_participants ?? 0
  const lignes: LigneCalculee[] = []

  if (e.forfait === 'classe_nature' || e.forfait === 'journee_plein_air') {
    const cn = e.forfait === 'classe_nature'
    const { forfait, accompagnateur, partRepas } = prixScolaire(e, cat.diviseurHeuresExtra, p)
    const detail = cn
      ? `${pluriel(nuits, 'nuit')}, ${pluriel(jours, 'jour')}, ${repas} repas`
      : partRepas
        ? 'dîner inclus'
        : 'sans repas'
    lignes.push(
      ligne(
        null,
        cat,
        `Forfait ${cn ? 'Classe nature' : 'Journée plein air'} (${libelleRatio(e.ratio)}) | ${detail}`,
        participants,
        forfait,
      ),
    )
    const accompagnateurs = e.nb_accompagnateurs ?? 0
    const gratuits = gratuites(participants, accompagnateurs, cat.gratuitePar)
    if (gratuits > 0)
      lignes.push(ligne(null, cat, `Gratuité professeur / accompagnateur (1:${cat.gratuitePar})`, gratuits, 0))
    if (accompagnateurs - gratuits > 0)
      lignes.push(
        ligne(null, cat, 'Professeur / accompagnateur supplémentaire (tarif spécial)', accompagnateurs - gratuits, accompagnateur),
      )
  }

  if (e.forfait === 'accueil_groupe') {
    const prixLit = p('LIT')
    for (const s of regrouperSections(e.etages, cat.produits.values())) {
      const { lits, chambres } = litsDe(s.etages!, cat.etages)
      lignes.push(ligne(s.code, cat, `${s.nom} (${lits} lits - ${chambres} chambres)`, nuits, lits * prixLit))
    }
  }

  if (e.forfait === 'location_salle') {
    const code = { jour: 'LS-JR', soir: 'LS-SR', complete: 'LS-JC' }[e.variante as string]
    if (code) lignes.push(ligne(code, cat, cat.produits.get(code)?.nom ?? code, 1, p(code)))
    if (e.heures_supplementaires > 0)
      lignes.push(
        ligne('LS-HS', cat, cat.produits.get('LS-HS')?.nom ?? 'Heures supplémentaires', e.heures_supplementaires, p('LS-HS')),
      )
  }

  if ((e.forfait === 'accueil_groupe' || e.forfait === 'location_salle') && e.service_repas && repas > 0) {
    // Personnes : en Accueil et en Location, le formulaire donne le total.
    const personnes = participants + (e.nb_accompagnateurs ?? 0)
    const prixRepas = p('REPAS')
    lignes.push(
      ligne(
        'REPAS',
        cat,
        `Service de repas régulier (${argent(prixRepas)} par personne) | ${personnes} personnes`,
        repas,
        prixRepas * personnes,
      ),
    )
  }

  return { lignes, manquants: [...manquants], exercice }
}

// ------------------------------------------------------------------
// Totaux
// ------------------------------------------------------------------

/**
 * Montants des lignes en pourcentage (rabais) : % de la somme des lignes
 * ordinaires qui les précèdent. Les autres lignes gardent quantité × prix.
 */
export function appliquerPourcentages<T extends Pick<LigneCalculee, 'quantite' | 'prix_unitaire' | 'pourcentage' | 'montant'>>(
  lignes: T[],
): T[] {
  let base = 0
  return lignes.map((l) => {
    if (l.pourcentage !== null && l.pourcentage !== undefined) {
      return { ...l, montant: arrondi2((l.pourcentage / 100) * base) }
    }
    const montant = arrondi2(l.quantite * l.prix_unitaire)
    base += montant
    return { ...l, montant }
  })
}

export interface Totaux {
  sous_total: number
  tps: number
  tvq: number
  total: number
}

/** TPS et TVQ sur le sous-total, chacune arrondie au cent. */
export function totaux(lignes: Pick<LigneCalculee, 'montant'>[]): Totaux {
  const sous_total = arrondi2(lignes.reduce((t, l) => t + l.montant, 0))
  const tps = arrondi2(sous_total * TPS)
  const tvq = arrondi2(sous_total * TVQ)
  return { sous_total, tps, tvq, total: arrondi2(sous_total + tps + tvq) }
}

// ------------------------------------------------------------------
// Catalogue
// ------------------------------------------------------------------

/** Prix d'un produit de fournisseur : coût × majoration + ajout, arrondi. */
export function prixMajore(p: { majoration: number | null; ajout: number | null; arrondi: 'aucun' | 'dollar_superieur' }, cout: number): number {
  const brut = cout * Number(p.majoration ?? 1) + Number(p.ajout ?? 0)
  return p.arrondi === 'dollar_superieur' ? Math.ceil(brut - 1e-9) : arrondi4(brut)
}
