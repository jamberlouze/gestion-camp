// Calcul de la commande — fonctions pures, reprises fidèlement de l'ancien
// calculateur (calcPlanOrder). Testées dans calcul.test.mts.
import {
  RECETTE_BAR_SALADE,
  RECETTE_BUFFET_DEJEUNER,
  REPAS,
  type AjoutConsommable,
  type AjoutRecette,
  type CellulePlan,
  type Consommable,
  type GroupeRepas,
  type IngredientRecette,
  type Magasin,
  type Recette,
  type Repas,
  type Sortie,
  type Unite,
} from './types'

const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc']

/** « Mer 1 juil » à partir de la date de début, sinon « Jour 1 ». */
export function libelleJour(decalage: number, debut: string | null): string {
  if (!debut) return `Jour ${decalage + 1}`
  const d = new Date(`${debut}T12:00:00`)
  d.setDate(d.getDate() + decalage)
  return `${JOURS_SEMAINE[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

// ------------------------------------------------------------------
// Sorties (groupes hors camp)
// ------------------------------------------------------------------

/** Repas manqués par une sortie : souper + déjeuner du lendemain (± dîner du départ). */
export function repasSortie(s: Pick<Sortie, 'jour_depart' | 'pattern'>): { day: number; meal: Repas }[] {
  const d = s.jour_depart
  if (s.pattern === 'diner_souper_dejeuner') {
    return [
      { day: d, meal: 'diner' },
      { day: d, meal: 'souper' },
      { day: d + 1, meal: 'dejeuner' },
    ]
  }
  return [
    { day: d, meal: 'souper' },
    { day: d + 1, meal: 'dejeuner' },
  ]
}

export function portionsSortie(s: Pick<Sortie, 'groupes'>): number {
  return (s.groupes ?? []).reduce((somme, g) => somme + (Math.trunc(Number(g.portions)) || 0), 0)
}

/** Portions retirées par les sorties, par « jour_repas_groupe ». */
export function deductionsSorties(sorties: Sortie[]): Map<string, number> {
  const retraits = new Map<string, number>()
  for (const s of sorties) {
    for (const r of repasSortie(s)) {
      for (const g of s.groupes ?? []) {
        const cle = `${r.day}_${r.meal}_${g.groupId}`
        retraits.set(cle, (retraits.get(cle) ?? 0) + (Math.trunc(Number(g.portions)) || 0))
      }
    }
  }
  return retraits
}

// ------------------------------------------------------------------
// Commande
// ------------------------------------------------------------------

export interface EtatCommande {
  recettes: Recette[]
  consommables: Consommable[]
  groupes: GroupeRepas[]
  cellules: CellulePlan[]
  ajoutsConsommables: AjoutConsommable[]
  ajoutsRecettes: AjoutRecette[]
  sorties: Sortie[]
  jours: number
  debut: string | null
}

export interface LigneProduit {
  id: string
  name: string
  pkg: string
  unit: Unite
  caseQty: number | null
  store: Magasin
  /** Quantité totale dans l'unité du produit (caisses si unit = « caisse »). */
  total: number
}

export interface LigneColabor extends LigneProduit {
  /** Caisses à commander (arrondi supérieur), ou null si la taille de caisse manque. */
  caisses: number | null
}

export interface LigneGlaciere {
  sortie: string
  recette: string
  portions: number
  repas: string
}

export interface ResultatCommande {
  /** Rien de planifié ni d'ajouté : pas de commande à afficher. */
  vide: boolean
  colabor: LigneColabor[]
  costco: LigneProduit[]
  maxi: LigneProduit[]
  glaciere: LigneGlaciere[]
}

/** Portions couvertes par un ingrédient selon sa portée (régulier / végé / tous). */
function couverture(ing: IngredientRecette, portions: number, vege: number): number {
  if (ing.scope === 'all') return portions
  if (ing.scope === 'regular') return Math.max(0, portions - vege)
  return vege
}

export function calculerCommande(e: EtatCommande): ResultatCommande {
  const recettes = new Map(e.recettes.map((r) => [r.id, r]))
  const cellules = new Map(e.cellules.map((c) => [`${c.day}_${c.meal}`, c]))
  const retraits = deductionsSorties(e.sorties)
  const present = (c: CellulePlan | undefined, gid: string) => !c?.absent?.includes(gid)
  const portionsEffectives = (jour: number, repas: Repas, g: GroupeRepas) =>
    Math.max(0, g.portions - (retraits.get(`${jour}_${repas}_${g.id}`) ?? 0))

  const parMagasin: Record<Magasin, Map<string, LigneProduit>> = {
    colabor: new Map(),
    costco: new Map(),
    maxi: new Map(),
  }
  const ajouter = (ing: IngredientRecette, quantite: number) => {
    const cible = parMagasin[ing.store]
    if (!cible) return
    const ligne = cible.get(ing.id) ?? {
      id: ing.id,
      name: ing.name,
      pkg: ing.pkg ?? '',
      unit: ing.unit,
      caseQty: ing.caseQty ?? null,
      store: ing.store,
      total: 0,
    }
    ligne.total += ing.qty * quantite
    cible.set(ing.id, ligne)
  }

  // Y a-t-il quelque chose à commander ?
  let quelqueChose = e.ajoutsConsommables.some((a) => a.qty > 0) || e.ajoutsRecettes.some((a) => a.portions > 0)
  for (let d = 0; d < e.jours && !quelqueChose; d++) {
    quelqueChose = REPAS.some((r) => !!cellules.get(`${d}_${r.id}`)?.plat)
  }
  if (!quelqueChose) return { vide: true, colabor: [], costco: [], maxi: [], glaciere: [] }

  // 1. Grille : plat, salade, dessert × portions des groupes présents (sans le végé).
  for (let d = 0; d < e.jours; d++) {
    for (const repas of REPAS) {
      const c = cellules.get(`${d}_${repas.id}`)
      if (!c) continue
      for (const g of e.groupes) {
        if (!present(c, g.id)) continue
        const portions = portionsEffectives(d, repas.id, g)
        if (portions <= 0) continue
        for (const rid of [c.plat, c.salade, c.dessert]) {
          const recette = rid ? recettes.get(rid) : undefined
          recette?.ingredients.forEach((ing) => {
            if (ing.scope !== 'veggie') ajouter(ing, portions)
          })
        }
      }
    }
  }

  // 2. Buffet déjeuner et bar à salade : ajoutés d'office pour chaque jour de
  //    la période (tous les ingrédients, quelle que soit la portée).
  const totalPresents = (repasIds: Repas[]) => {
    let total = 0
    for (let d = 0; d < e.jours; d++) {
      for (const r of repasIds) {
        const c = cellules.get(`${d}_${r}`)
        for (const g of e.groupes) if (present(c, g.id)) total += portionsEffectives(d, r, g)
      }
    }
    return total
  }
  const automatiques: [string, Repas[]][] = [
    [RECETTE_BUFFET_DEJEUNER, ['dejeuner']],
    [RECETTE_BAR_SALADE, ['diner', 'souper']],
  ]
  for (const [rid, repasIds] of automatiques) {
    const portions = totalPresents(repasIds)
    if (portions > 0) recettes.get(rid)?.ingredients.forEach((ing) => ajouter(ing, portions))
  }

  // 3. Ajouts manuels de recettes (le végé compte ici).
  for (const a of e.ajoutsRecettes) {
    recettes.get(a.recipe_id)?.ingredients.forEach((ing) => {
      const cov = couverture(ing, a.portions, a.veg ?? 0)
      if (cov > 0) ajouter(ing, cov)
    })
  }

  // 4. Ajouts manuels de consommables : en caisses, toujours dans la commande Colabor.
  const consommables = new Map(e.consommables.map((c) => [c.id, c]))
  for (const a of e.ajoutsConsommables) {
    const c = consommables.get(a.cons_id)
    if (!c || a.qty <= 0 || !c.prod_id) continue
    const cible = parMagasin.colabor
    const ligne = cible.get(c.prod_id) ?? {
      id: c.prod_id,
      name: c.prod_name ?? c.name,
      pkg: c.pkg ?? '',
      unit: 'caisse' as Unite,
      caseQty: 1,
      store: c.store,
      total: 0,
    }
    ligne.total += a.qty
    cible.set(c.prod_id, ligne)
  }

  // 5. Sorties : le repas de glacière s'ajoute à la commande (sans le végé).
  const glaciere: LigneGlaciere[] = []
  for (const s of e.sorties) {
    const portions = portionsSortie(s)
    const recette = s.glaciere_id ? recettes.get(s.glaciere_id) : undefined
    if (portions <= 0 || !recette) continue
    recette.ingredients.forEach((ing) => {
      if (ing.scope !== 'veggie') ajouter(ing, portions)
    })
    glaciere.push({
      sortie: s.nom || 'Sortie',
      recette: recette.name,
      portions,
      repas: repasSortie(s)
        .map((r) => `${REPAS.find((x) => x.id === r.meal)!.libelle} (${libelleJour(r.day, e.debut)})`)
        .join(', '),
    })
  }

  const numero = (id: string) => Number.parseInt(id) || 99999
  const colabor = [...parMagasin.colabor.values()]
    .sort((a, b) => numero(a.id) - numero(b.id))
    .map((l) => ({ ...l, caisses: caissesNecessaires(l) }))
  const parNom = (a: LigneProduit, b: LigneProduit) => a.name.localeCompare(b.name, 'fr')
  return {
    vide: false,
    colabor,
    costco: [...parMagasin.costco.values()].sort(parNom),
    maxi: [...parMagasin.maxi.values()].sort(parNom),
    glaciere,
  }
}

export function caissesNecessaires(l: LigneProduit): number | null {
  if (l.unit === 'caisse') return Math.ceil(l.total)
  if (!l.caseQty || l.caseQty <= 0) return null
  return Math.ceil(l.total / l.caseQty)
}

/** « 12500 g », « 2.50 caisse ». */
export function quantiteAffichee(l: LigneProduit): string {
  if (l.unit === 'caisse') return `${l.total.toFixed(2)} caisse`
  const unite = { g: 'g', ml: 'ml', un: 'unités', caisse: 'caisse(s)' }[l.unit] ?? l.unit
  return `${Math.round(l.total)} ${unite}`
}
