// Feuille de cuisine : ce qu'il faut préparer à chaque repas, avec les
// quantités de chaque ingrédient. Fonctions pures, calculées comme la
// commande (calcul.ts) : additionnées, les quantités de la feuille (jours et
// « sans jour précis ») donnent celles de la commande, consommables en moins.
import {
  couverture,
  couverturePlan,
  deductionsSorties,
  libelleJour,
  portionsGroupe,
  portionsSortie,
  repasSortie,
  vegeDesSorties,
  vegeSorties,
  type EtatCommande,
} from './calcul'
import {
  RECETTE_BAR_SALADE,
  RECETTE_BUFFET_DEJEUNER,
  REPAS,
  type IngredientRecette,
  type Magasin,
  type Portee,
  type Recette,
  type Repas,
  type Unite,
} from './types'

export type RolePlat = 'plat' | 'salade' | 'dessert' | 'buffet' | 'bar' | 'glaciere' | 'ajout'

export const LIBELLES_ROLE: Record<RolePlat, string> = {
  plat: 'Plat',
  salade: 'Salade',
  dessert: 'Dessert',
  buffet: 'Buffet du déjeuner',
  bar: 'Bar à salade',
  glaciere: 'Glacière',
  ajout: 'Ajout manuel',
}

export interface IngredientCuisine {
  id: string
  name: string
  pkg: string
  unit: Unite
  store: Magasin
  portee: Portee
  /** Portions couvertes par cet ingrédient (ex. les végé seulement). */
  portions: number
  /** Quantité totale, dans l'unité de l'ingrédient. */
  quantite: number
}

export interface PlatCuisine {
  role: RolePlat
  recetteId: string
  nom: string
  /** Portions à préparer, végé comprises. */
  portions: number
  /** Portions végé (0 si la recette n'a pas d'option végé, ou pour le buffet et le bar). */
  vege: number
  ingredients: IngredientCuisine[]
  /** Précision (ex. glacière : nom de la sortie et repas manqués). */
  note?: string
}

export interface GroupeCuisine {
  id: string
  name: string
  color: string | null
  /** Absent à ce repas (case décochée dans la grille). */
  absent: boolean
  /** Portions à ce repas, sorties retirées (0 si absent). */
  portions: number
  vege: number
  /** Portions parties en sortie à ce repas. */
  enSortie: number
}

export interface RepasCuisine {
  meal: Repas
  libelle: string
  groupes: GroupeCuisine[]
  /** Portions servies au camp (groupes présents). */
  total: number
  totalVege: number
  plats: PlatCuisine[]
}

export interface JourCuisine {
  day: number
  libelle: string
  repas: RepasCuisine[]
}

export interface FeuilleCuisine {
  jours: JourCuisine[]
  /** Hors des jours du menu : ajouts manuels de recettes, sorties hors période. */
  sansJour: PlatCuisine[]
}

function ingredientsPour(
  recette: Recette,
  portions: (ing: IngredientRecette) => number,
): IngredientCuisine[] {
  const lignes: IngredientCuisine[] = []
  for (const ing of recette.ingredients) {
    const p = portions(ing)
    if (p <= 0) continue
    lignes.push({
      id: ing.id,
      name: ing.name,
      pkg: ing.pkg ?? '',
      unit: ing.unit,
      store: ing.store,
      portee: ing.scope,
      portions: p,
      quantite: ing.qty * p,
    })
  }
  return lignes
}

export function feuilleCuisine(e: EtatCommande): FeuilleCuisine {
  const recettes = new Map(e.recettes.map((r) => [r.id, r]))
  const cellules = new Map(e.cellules.map((c) => [`${c.day}_${c.meal}`, c]))
  const retraits = deductionsSorties(e.sorties)
  const vegeRetraits = vegeDesSorties(e.sorties)

  const jours: JourCuisine[] = []
  for (let d = 0; d < e.jours; d++) {
    const repasDuJour: RepasCuisine[] = []
    for (const repas of REPAS) {
      const c = cellules.get(`${d}_${repas.id}`)
      const groupes: GroupeCuisine[] = e.groupes.map((g) => {
        const absent = !!c?.absent?.includes(g.id)
        const k = `${d}_${repas.id}_${g.id}`
        const enSortie = retraits.get(k) ?? 0
        const { portions, vege } = absent ? { portions: 0, vege: 0 } : portionsGroupe(g, enSortie, vegeRetraits.get(k) ?? 0)
        return { id: g.id, name: g.name, color: g.color, absent, portions, vege, enSortie }
      })
      const presents = groupes.filter((g) => !g.absent && g.portions > 0)
      const total = presents.reduce((s, g) => s + g.portions, 0)
      const totalVege = presents.reduce((s, g) => s + g.vege, 0)

      const plats: PlatCuisine[] = []
      // Plat, salade, dessert de la grille (comme la commande, groupe par groupe).
      if (c) {
        for (const role of ['plat', 'salade', 'dessert'] as const) {
          const rid = c[role]
          const recette = rid ? recettes.get(rid) : undefined
          if (!recette || total <= 0) continue
          const vege = recette.has_veg ? totalVege : 0
          plats.push({
            role,
            recetteId: recette.id,
            nom: recette.name,
            portions: total,
            vege,
            ingredients: ingredientsPour(recette, (ing) =>
              presents.reduce((s, g) => s + couverturePlan(recette, ing, g.portions, g.vege), 0),
            ),
          })
        }
      }
      // Buffet du déjeuner et bar à salade : ajoutés d'office à chaque repas
      // (tous les ingrédients, quelle que soit la portée), comme la commande.
      const automatique = repas.id === 'dejeuner' ? RECETTE_BUFFET_DEJEUNER : RECETTE_BAR_SALADE
      const recetteAuto = recettes.get(automatique)
      if (recetteAuto && total > 0) {
        plats.push({
          role: repas.id === 'dejeuner' ? 'buffet' : 'bar',
          recetteId: recetteAuto.id,
          nom: recetteAuto.name,
          portions: total,
          vege: 0,
          ingredients: ingredientsPour(recetteAuto, () => total),
        })
      }
      repasDuJour.push({ meal: repas.id, libelle: repas.libelle, groupes, total, totalVege, plats })
    }
    jours.push({ day: d, libelle: libelleJour(d, e.debut), repas: repasDuJour })
  }

  // Glacières : préparées pour le premier repas manqué de la sortie. Les végé
  // partis en sortie prennent l'option végé de la recette (comme la commande).
  const sansJour: PlatCuisine[] = []
  const vegeParSortie = vegeSorties(e.sorties, e.groupes)
  e.sorties.forEach((s, i) => {
    const portions = portionsSortie(s)
    const recette = s.glaciere_id ? recettes.get(s.glaciere_id) : undefined
    if (portions <= 0 || !recette) return
    const vegeSortie = vegeParSortie[i]
    const manques = repasSortie(s)
    const plat: PlatCuisine = {
      role: 'glaciere',
      recetteId: recette.id,
      nom: recette.name,
      portions,
      vege: recette.has_veg ? vegeSortie : 0,
      ingredients: ingredientsPour(recette, (ing) => couverturePlan(recette, ing, portions, vegeSortie)),
      note: `${s.nom || 'Sortie'} — remplace : ${manques
        .map((r) => `${REPAS.find((x) => x.id === r.meal)!.libelle.toLowerCase()} (${libelleJour(r.day, e.debut)})`)
        .join(', ')}${!recette.has_veg && vegeSortie > 0 ? ` · dont ${vegeSortie} végé (pas d'option végé)` : ''}`,
    }
    const premier = manques[0]
    const cible = jours[premier.day]?.repas.find((r) => r.meal === premier.meal)
    if (cible) cible.plats.push(plat)
    else sansJour.push(plat)
  })

  // Ajouts manuels de recettes : sans jour, le végé compte ici.
  for (const a of e.ajoutsRecettes) {
    const recette = recettes.get(a.recipe_id)
    if (!recette || a.portions <= 0) continue
    const vege = a.veg ?? 0
    sansJour.push({
      role: 'ajout',
      recetteId: recette.id,
      nom: recette.name,
      portions: a.portions,
      vege,
      ingredients: ingredientsPour(recette, (ing) => couverture(ing, a.portions, vege)),
    })
  }

  return { jours, sansJour }
}

// ------------------------------------------------------------------
// Affichage des quantités pour la cuisine
// ------------------------------------------------------------------

const nombre = (n: number, decimales = 1) => n.toLocaleString('fr-CA', { maximumFractionDigits: decimales })

/**
 * « 850 g », « 12,5 kg » (unité choisie sur la valeur arrondie : jamais
 * « 1 000 g ») ; une petite quantité ne s'affiche jamais « 0 g ».
 */
function metrique(quantite: number, petite: string, grande: string): string {
  if (quantite > 0 && quantite < 0.5) return `< 1 ${petite}`
  const arrondi = Math.round(quantite)
  return arrondi >= 1000 ? `${nombre(quantite / 1000, 2)} ${grande}` : `${nombre(arrondi, 0)} ${petite}`
}

/** « 12,5 kg », « 850 g », « 3,2 L », « 56 un. », « 1,25 caisse ». */
export function quantiteCuisine(quantite: number, unite: Unite): string {
  switch (unite) {
    case 'g':
      return metrique(quantite, 'g', 'kg')
    case 'ml':
      return metrique(quantite, 'ml', 'L')
    case 'un':
      return `${nombre(Math.ceil(quantite - 1e-9), 0)} un.`
    case 'caisse': {
      // Pluriel selon le nombre affiché (arrondi), à partir de 2.
      const affiche = Math.round(quantite * 100) / 100
      return `${nombre(affiche, 2)} caisse${affiche >= 2 ? 's' : ''}`
    }
  }
}

/**
 * Format d'emballage lu dans le libellé Colabor (« 6X2KG », « 12X454GR »,
 * « 2X3.7LT », « 12X12UN ») : taille d'un paquet dans l'unité de la recette.
 */
export function taillePaquet(pkg: string, unite: Unite): { taille: number; libelle: string } | null {
  const m = /(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(KG|GR|G|LB|LT|L|ML|UN)\b/i.exec(pkg ?? '')
  if (!m) return null
  const valeur = Number(m[2].replace(',', '.'))
  const u = m[3].toUpperCase()
  if (!(valeur > 0)) return null
  const libelle = `${m[2].replace('.', ',')} ${u === 'GR' || u === 'G' ? 'g' : u === 'LT' || u === 'L' ? 'L' : u === 'UN' ? 'un.' : u.toLowerCase()}`
  if (unite === 'g' && (u === 'KG' || u === 'GR' || u === 'G' || u === 'LB')) {
    return { taille: u === 'KG' ? valeur * 1000 : u === 'LB' ? valeur * 453.592 : valeur, libelle }
  }
  if (unite === 'ml' && (u === 'LT' || u === 'L' || u === 'ML')) {
    return { taille: u === 'ML' ? valeur : valeur * 1000, libelle }
  }
  if (unite === 'un' && u === 'UN') return { taille: valeur, libelle }
  return null
}

/**
 * « ≈ 6,3 × 2 kg » : nombre de paquets correspondant, si l'emballage est
 * lisible ; « < 0,1 × 20 kg » plutôt que « ≈ 0 × » (qu'on lirait « aucun »).
 */
export function equivalencePaquets(quantite: number, unite: Unite, pkg: string): string | null {
  const p = taillePaquet(pkg, unite)
  if (!p || quantite <= 0) return null
  const paquets = quantite / p.taille
  return paquets < 0.05 ? `< ${nombre(0.1, 1)} × ${p.libelle}` : `≈ ${nombre(paquets, 1)} × ${p.libelle}`
}
