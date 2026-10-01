// Calcul de la commande — fonctions pures, reprises fidèlement de l'ancien
// calculateur (calcPlanOrder), plus les portions végé par groupe : avec
// vege = 0 partout, le résultat est identique à l'ancien, sauf qu'un même
// # produit en deux unités (ou, chez Costco et Maxi, sous deux noms) donne
// deux lignes au lieu d'une somme fausse (voir cleLigne).
import {
  RECETTE_BAR_SALADE,
  RECETTE_BUFFET_DEJEUNER,
  REPAS,
  type AjoutConsommable,
  type AjoutRecette,
  type CellulePlan,
  type Consommable,
  type GroupeRepas,
  type GroupeSortie,
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

const entier = (n: unknown) => Math.trunc(Number(n)) || 0

export function portionsSortie(s: Pick<Sortie, 'groupes'>): number {
  return (s.groupes ?? []).reduce((somme, g) => somme + entier(g.portions), 0)
}

/** Végé indiqués pour un groupe d'une sortie (compris dans ses portions). */
const vegeIndique = (g: GroupeSortie) => Math.min(Math.max(0, entier(g.vege)), Math.max(0, entier(g.portions)))

/** Portions retirées par les sorties, par « jour_repas_groupe ». */
export function deductionsSorties(sorties: Sortie[]): Map<string, number> {
  const retraits = new Map<string, number>()
  for (const s of sorties) {
    for (const r of repasSortie(s)) {
      for (const g of s.groupes ?? []) {
        const cle = `${r.day}_${r.meal}_${g.groupId}`
        retraits.set(cle, (retraits.get(cle) ?? 0) + entier(g.portions))
      }
    }
  }
  return retraits
}

/** Végé indiqués dans les sorties (compris dans les portions retirées), par « jour_repas_groupe ». */
export function vegeDesSorties(sorties: Sortie[]): Map<string, number> {
  const vege = new Map<string, number>()
  for (const s of sorties) {
    for (const r of repasSortie(s)) {
      for (const g of s.groupes ?? []) {
        const cle = `${r.day}_${r.meal}_${g.groupId}`
        vege.set(cle, (vege.get(cle) ?? 0) + vegeIndique(g))
      }
    }
  }
  return vege
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
  /** Clé de la ligne (voir cleLigne) : un même # produit peut donner plusieurs lignes. */
  cle: string
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
  /** Portions végé parties avec la sortie (comprises dans portions). */
  vege: number
  /** La recette a une option végé (sinon les végé mangent la recette régulière). */
  optionVege: boolean
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
export function couverture(ing: IngredientRecette, portions: number, vege: number): number {
  if (ing.scope === 'all') return portions
  if (ing.scope === 'regular') return Math.max(0, portions - vege)
  return vege
}

/** Portions végé d'un groupe (comprises dans ses portions). */
const vegeGroupe = (g: GroupeRepas) => Math.min(Math.max(0, g.portions), Math.max(0, entier(g.vege)))

/**
 * Végé d'un groupe partis en sortie à un repas : ceux indiqués dans les
 * sorties, et au moins ceux qui ne tiennent plus dans les portions restées
 * au camp (sinon ils ne seraient comptés nulle part).
 */
const vegePartis = (vege: number, auCamp: number, indiques: number) => Math.min(vege, Math.max(indiques, vege - auCamp))

/**
 * Portions d'un groupe à un repas, une fois retirées celles parties en sortie
 * (`retire`, dont `vegeRetire` végé indiqués dans les sorties). Les portions
 * végé restées au camp ne dépassent jamais ce qui reste : le surplus est
 * parti en sortie (voir vegeSorties, même règle).
 */
export function portionsGroupe(g: GroupeRepas, retire: number, vegeRetire = 0): { portions: number; vege: number } {
  const portions = Math.max(0, g.portions - retire)
  const vege = vegeGroupe(g)
  return { portions, vege: vege - vegePartis(vege, portions, vegeRetire) }
}

/**
 * Portions végé parties avec chaque sortie (servies par son repas de
 * glacière), dans l'ordre de `sorties`. Comptées au premier repas manqué,
 * avec la même règle que le camp (portionsGroupe) : les végé indiqués dans
 * les sorties, plus le surplus qui ne tient plus au camp, réparti dans
 * l'ordre des sorties. Sans végé, tout vaut 0.
 */
export function vegeSorties(sorties: Sortie[], groupes: GroupeRepas[]): number[] {
  const parId = new Map(groupes.map((g) => [g.id, g]))
  // Lignes (sortie, groupe) qui manquent chaque « jour_repas_groupe ».
  const lignes = new Map<string, { sortie: number; ligne: number; portions: number; vege: number }[]>()
  sorties.forEach((s, i) => {
    for (const r of repasSortie(s)) {
      for (const [j, g] of (s.groupes ?? []).entries()) {
        const cle = `${r.day}_${r.meal}_${g.groupId}`
        lignes.set(cle, [...(lignes.get(cle) ?? []), { sortie: i, ligne: j, portions: entier(g.portions), vege: vegeIndique(g) }])
      }
    }
  })
  const parts = new Map<string, number[]>()
  const partage = (cle: string, groupId: string) => {
    const deja = parts.get(cle)
    if (deja) return deja
    const l = lignes.get(cle) ?? []
    const g = parId.get(groupId)
    let reste = 0
    if (g) {
      const vege = vegeGroupe(g)
      const auCamp = Math.max(0, g.portions - l.reduce((s, x) => s + x.portions, 0))
      reste = vegePartis(vege, auCamp, l.reduce((s, x) => s + x.vege, 0))
    }
    // D'abord les végé indiqués, puis le surplus là où il reste de la place.
    const indiques = l.map((x) => {
      const n = Math.min(x.vege, reste)
      reste -= n
      return n
    })
    const resultat = indiques.map((n, k) => {
      const surplus = Math.min(Math.max(0, l[k].portions - n), reste)
      reste -= surplus
      return n + surplus
    })
    parts.set(cle, resultat)
    return resultat
  }
  return sorties.map((s, i) => {
    const premier = repasSortie(s)[0]
    return (s.groupes ?? []).reduce((total, g, j) => {
      const cle = `${premier.day}_${premier.meal}_${g.groupId}`
      const k = (lignes.get(cle) ?? []).findIndex((x) => x.sortie === i && x.ligne === j)
      return total + (k >= 0 ? partage(cle, g.groupId)[k] : 0)
    }, 0)
  })
}

/**
 * Portions couvertes par un ingrédient d'une recette du planificateur.
 * Recette avec option végé : régulier = portions − végé, végé = végé, tous =
 * portions. Sans option végé : tout le monde mange la recette régulière (les
 * ingrédients marqués végé sont ignorés, comme avant).
 */
export function couverturePlan(recette: Recette, ing: IngredientRecette, portions: number, vege: number): number {
  if (recette.has_veg) return couverture(ing, portions, vege)
  return ing.scope === 'veggie' ? 0 : portions
}

/**
 * Ligne de commande d'un ingrédient : même # produit et même unité (des
 * grammes et des unités ne s'additionnent pas). Chez Costco et Maxi, le #
 * produit est souvent un mot (« maxi ») : le nom distingue aussi les produits.
 */
export function cleLigne(store: Magasin, id: string, unit: Unite, name: string): string {
  return store === 'colabor' ? `${id}|${unit}` : `${id}|${unit}|${name.trim().toLocaleLowerCase('fr-CA')}`
}

export function calculerCommande(e: EtatCommande): ResultatCommande {
  const recettes = new Map(e.recettes.map((r) => [r.id, r]))
  const cellules = new Map(e.cellules.map((c) => [`${c.day}_${c.meal}`, c]))
  const retraits = deductionsSorties(e.sorties)
  const vegeRetraits = vegeDesSorties(e.sorties)
  const present = (c: CellulePlan | undefined, gid: string) => !c?.absent?.includes(gid)
  const portionsEffectives = (jour: number, repas: Repas, g: GroupeRepas) =>
    portionsGroupe(g, retraits.get(`${jour}_${repas}_${g.id}`) ?? 0).portions

  const parMagasin: Record<Magasin, Map<string, LigneProduit>> = {
    colabor: new Map(),
    costco: new Map(),
    maxi: new Map(),
  }
  const ajouter = (ing: IngredientRecette, quantite: number) => {
    const cible = parMagasin[ing.store]
    if (!cible) return
    const cleIng = cleLigne(ing.store, ing.id, ing.unit, ing.name)
    const ligne = cible.get(cleIng) ?? {
      cle: cleIng,
      id: ing.id,
      name: ing.name,
      pkg: ing.pkg ?? '',
      unit: ing.unit,
      caseQty: ing.caseQty ?? null,
      store: ing.store,
      total: 0,
    }
    ligne.total += ing.qty * quantite
    cible.set(cleIng, ligne)
  }

  // Y a-t-il quelque chose à commander ?
  let quelqueChose = e.ajoutsConsommables.some((a) => a.qty > 0) || e.ajoutsRecettes.some((a) => a.portions > 0)
  for (let d = 0; d < e.jours && !quelqueChose; d++) {
    quelqueChose = REPAS.some((r) => !!cellules.get(`${d}_${r.id}`)?.plat)
  }
  if (!quelqueChose) return { vide: true, colabor: [], costco: [], maxi: [], glaciere: [] }

  // 1. Grille : plat, salade, dessert × portions des groupes présents. Pour
  //    une recette avec option végé, les portions végé du groupe prennent les
  //    ingrédients végé au lieu des réguliers.
  for (let d = 0; d < e.jours; d++) {
    for (const repas of REPAS) {
      const c = cellules.get(`${d}_${repas.id}`)
      if (!c) continue
      for (const g of e.groupes) {
        if (!present(c, g.id)) continue
        const k = `${d}_${repas.id}_${g.id}`
        const { portions, vege } = portionsGroupe(g, retraits.get(k) ?? 0, vegeRetraits.get(k) ?? 0)
        if (portions <= 0) continue
        for (const rid of [c.plat, c.salade, c.dessert]) {
          const recette = rid ? recettes.get(rid) : undefined
          recette?.ingredients.forEach((ing) => {
            const cov = couverturePlan(recette, ing, portions, vege)
            if (cov > 0) ajouter(ing, cov)
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
    const cleCons = cleLigne('colabor', c.prod_id, 'caisse', c.prod_name ?? c.name)
    const ligne = cible.get(cleCons) ?? {
      cle: cleCons,
      id: c.prod_id,
      name: c.prod_name ?? c.name,
      pkg: c.pkg ?? '',
      unit: 'caisse' as Unite,
      caseQty: 1,
      store: c.store,
      total: 0,
    }
    ligne.total += a.qty
    cible.set(cleCons, ligne)
  }

  // 5. Sorties : le repas de glacière s'ajoute à la commande. Les végé partis
  //    en sortie (vegeSorties) prennent l'option végé de la recette, comme
  //    au camp ; sans végé, tout le monde mange la recette régulière.
  const glaciere: LigneGlaciere[] = []
  const vegeParSortie = vegeSorties(e.sorties, e.groupes)
  e.sorties.forEach((s, i) => {
    const portions = portionsSortie(s)
    const recette = s.glaciere_id ? recettes.get(s.glaciere_id) : undefined
    if (portions <= 0 || !recette) return
    const vege = vegeParSortie[i]
    recette.ingredients.forEach((ing) => {
      const cov = couverturePlan(recette, ing, portions, vege)
      if (cov > 0) ajouter(ing, cov)
    })
    glaciere.push({
      sortie: s.nom || 'Sortie',
      recette: recette.name,
      portions,
      vege,
      optionVege: recette.has_veg,
      repas: repasSortie(s)
        .map((r) => `${REPAS.find((x) => x.id === r.meal)!.libelle} (${libelleJour(r.day, e.debut)})`)
        .join(', '),
    })
  })

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
