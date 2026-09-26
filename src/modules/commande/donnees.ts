import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  AjoutConsommable,
  AjoutRecette,
  CellulePlan,
  Consommable,
  GroupeRepas,
  MenuSauve,
  ParametresPlan,
  Produit,
  Recette,
  Sortie,
} from './types'

// Module pensé pour ordinateur : pas de file d'attente hors ligne. Chaque
// écriture s'affiche tout de suite (mise à jour optimiste) et est annulée
// si la base la refuse (bandeau d'erreur du module).

const RACINE = 'commande'
const db = () => supabase.schema('commande')

interface Tables {
  recettes: Recette
  consommables: Consommable
  banque_ingredients: Produit
  groupes_repas: GroupeRepas
  plan_cells: CellulePlan
  menus_sauves: MenuSauve
  ajouts_consommables: AjoutConsommable
  ajouts_recettes: AjoutRecette
  sorties: Sortie
  parametres: { cle: string; valeur: unknown }
}
type NomTable = keyof Tables

const cle = (table: NomTable) => [RACINE, table]

async function lire<T extends NomTable>(table: T): Promise<Tables[T][]> {
  let requete = db().from(table).select('*')
  if (table === 'recettes' || table === 'consommables') requete = requete.is('deleted_at', null)
  if (table === 'ajouts_recettes' || table === 'sorties') requete = requete.order('created_at')
  if (table === 'menus_sauves') requete = requete.order('saved_at')
  const { data, error } = await requete
  if (error) throw error
  return data as Tables[T][]
}

export function useTable<T extends NomTable>(table: T) {
  return useQuery({ queryKey: cle(table), queryFn: () => lire(table) })
}

export const PLAN_DEFAUT: ParametresPlan = { jours: 7, debut: null }

export function useParametresPlan(): ParametresPlan {
  const { data } = useTable('parametres')
  const valeur = data?.find((p) => p.cle === 'planificateur')?.valeur as Partial<ParametresPlan> | undefined
  return { ...PLAN_DEFAUT, ...valeur }
}

/** Recharge une table quand quelqu'un d'autre la modifie. */
export function useTempsReelCommande() {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`commande-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'commande' }, (p) => {
        if (client.isMutating({ mutationKey: [RACINE] }) === 0) {
          client.invalidateQueries({ queryKey: cle(p.table as NomTable) })
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

async function verifier(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

/**
 * Écriture avec mise à jour optimiste d'une ou plusieurs tables en cache.
 * `optimiste` reçoit les listes actuelles et renvoie les listes modifiées.
 */
function useEcriture<V>(
  tables: NomTable[],
  envoyer: (v: V) => Promise<void>,
  optimiste?: (v: V, listes: Partial<{ [T in NomTable]: Tables[T][] }>) => Partial<{ [T in NomTable]: Tables[T][] }>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [RACINE, ...tables],
    mutationFn: envoyer,
    onMutate: async (v: V) => {
      await Promise.all(tables.map((t) => client.cancelQueries({ queryKey: cle(t) })))
      const avant = Object.fromEntries(tables.map((t) => [t, client.getQueryData(cle(t))])) as Partial<{
        [T in NomTable]: Tables[T][]
      }>
      if (optimiste) {
        const apres = optimiste(v, avant)
        for (const [t, liste] of Object.entries(apres)) client.setQueryData(cle(t as NomTable), liste)
      }
      return avant
    },
    onError: (_e, _v, avant) => {
      for (const [t, liste] of Object.entries(avant ?? {})) client.setQueryData(cle(t as NomTable), liste)
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: [RACINE] }) <= 1) {
        tables.forEach((t) => client.invalidateQueries({ queryKey: cle(t) }))
      }
    },
  })
}

/** Remplace (ou ajoute) les éléments dont `memeCle` est vrai. */
function remplacer<T>(liste: T[] = [], nouveaux: T[], memeCle: (a: T, b: T) => boolean): T[] {
  const resultat = liste.map((x) => nouveaux.find((n) => memeCle(x, n)) ?? x)
  for (const n of nouveaux) if (!liste.some((x) => memeCle(x, n))) resultat.push(n)
  return resultat
}
const memeId = <T extends { id: unknown }>(a: T, b: T) => a.id === b.id

export const nouvelId = (prefixe: string) => `${prefixe}_${crypto.randomUUID().slice(0, 13)}`

// ------------------------------------------------------------------
// Recettes et consommables
// ------------------------------------------------------------------

/**
 * Enregistre une recette. Ses ingrédients sont aussi ajoutés ou mis à jour
 * dans la banque (sans toucher aux autres recettes, comme avant).
 */
export function useEnregistrerRecette() {
  return useEcriture<Recette>(
    ['recettes', 'banque_ingredients'],
    async (r) => {
      await verifier(db().from('recettes').upsert(r))
      const produits = produitsDeRecette(r)
      if (produits.length) await verifier(db().from('banque_ingredients').upsert(produits))
    },
    (r, l) => ({
      recettes: remplacer(l.recettes, [r], memeId),
      banque_ingredients: remplacer(
        l.banque_ingredients,
        produitsDeRecette(r).map((p) => ({ ...(l.banque_ingredients ?? []).find((b) => b.id === p.id), ...p })),
        memeId,
      ),
    }),
  )
}

function produitsDeRecette(r: Recette): Produit[] {
  return r.ingredients.map((i) => ({ id: i.id, name: i.name, pkg: i.pkg ?? '', case_qty: i.caseQty, unit: i.unit, store: i.store }))
}

export function useSupprimerRecette() {
  return useEcriture<string>(
    ['recettes'],
    (id) => verifier(db().from('recettes').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    (id, l) => ({ recettes: (l.recettes ?? []).filter((r) => r.id !== id) }),
  )
}

export function useEnregistrerConsommable() {
  return useEcriture<Consommable>(
    ['consommables'],
    (c) => verifier(db().from('consommables').upsert(c)),
    (c, l) => ({ consommables: remplacer(l.consommables, [c], memeId) }),
  )
}

export function useSupprimerConsommable() {
  return useEcriture<string>(
    ['consommables'],
    (id) => verifier(db().from('consommables').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    (id, l) => ({ consommables: (l.consommables ?? []).filter((c) => c.id !== id) }),
  )
}

// ------------------------------------------------------------------
// Banque d'ingrédients
// ------------------------------------------------------------------

/** Nom, empaquetage, taille de caisse et source sont propagés aux recettes qui l'utilisent. */
export function useEnregistrerProduit() {
  const client = useQueryClient()
  const recettesTouchees = (p: Produit) =>
    (client.getQueryData<Recette[]>(cle('recettes')) ?? [])
      .filter((r) => r.ingredients.some((i) => i.id === p.id))
      .map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) =>
          i.id === p.id ? { ...i, name: p.name, pkg: p.pkg ?? '', caseQty: p.case_qty, store: p.store } : i,
        ),
      }))
  return useEcriture<Produit>(
    ['banque_ingredients', 'recettes'],
    async (p) => {
      const touchees = recettesTouchees(p)
      await verifier(db().from('banque_ingredients').upsert(p))
      if (touchees.length) await verifier(db().from('recettes').upsert(touchees))
    },
    (p, l) => ({
      banque_ingredients: remplacer(l.banque_ingredients, [p], memeId),
      recettes: remplacer(l.recettes, recettesTouchees(p), memeId),
    }),
  )
}

export function useSupprimerProduit() {
  return useEcriture<string>(
    ['banque_ingredients'],
    (id) => verifier(db().from('banque_ingredients').delete().eq('id', id)),
    (id, l) => ({ banque_ingredients: (l.banque_ingredients ?? []).filter((p) => p.id !== id) }),
  )
}

// ------------------------------------------------------------------
// Planificateur
// ------------------------------------------------------------------

export function useParametrerPlan() {
  return useEcriture<ParametresPlan>(
    ['parametres'],
    (valeur) => verifier(db().from('parametres').upsert({ cle: 'planificateur', valeur })),
    (valeur, l) => ({
      parametres: remplacer(l.parametres, [{ cle: 'planificateur', valeur }], (a, b) => a.cle === b.cle),
    }),
  )
}

export function useEnregistrerGroupe() {
  return useEcriture<GroupeRepas>(
    ['groupes_repas'],
    (g) => verifier(db().from('groupes_repas').upsert(g)),
    (g, l) => ({ groupes_repas: remplacer(l.groupes_repas, [g], memeId) }),
  )
}

export function useSupprimerGroupe() {
  return useEcriture<string>(
    ['groupes_repas'],
    (id) => verifier(db().from('groupes_repas').delete().eq('id', id)),
    (id, l) => ({ groupes_repas: (l.groupes_repas ?? []).filter((g) => g.id !== id) }),
  )
}

const memeCellule = (a: CellulePlan, b: CellulePlan) => a.day === b.day && a.meal === b.meal

export function useEnregistrerCellule() {
  return useEcriture<CellulePlan>(
    ['plan_cells'],
    (c) => verifier(db().from('plan_cells').upsert(c)),
    (c, l) => ({ plan_cells: remplacer(l.plan_cells, [c], memeCellule) }),
  )
}

export function useEffacerGrille() {
  return useEcriture<void>(
    ['plan_cells'],
    () => verifier(db().from('plan_cells').delete().gte('day', 0)),
    () => ({ plan_cells: [] }),
  )
}

export function useSauverMenu() {
  return useEcriture<MenuSauve>(
    ['menus_sauves'],
    (m) => verifier(db().from('menus_sauves').insert(m)),
    (m, l) => ({ menus_sauves: [...(l.menus_sauves ?? []), m] }),
  )
}

export function useSupprimerMenu() {
  return useEcriture<string>(
    ['menus_sauves'],
    (id) => verifier(db().from('menus_sauves').delete().eq('id', id)),
    (id, l) => ({ menus_sauves: (l.menus_sauves ?? []).filter((m) => m.id !== id) }),
  )
}

/** Remplace les groupes et la grille par ceux d'un menu sauvegardé. */
export function useChargerMenu() {
  const versCellules = (m: MenuSauve): CellulePlan[] =>
    Object.entries(m.cells ?? {}).map(([k, c]) => {
      const i = k.indexOf('_')
      return {
        day: Number(k.slice(0, i)),
        meal: k.slice(i + 1) as CellulePlan['meal'],
        plat: c.plat || '',
        salade: c.salade || '',
        dessert: c.dessert || '',
        absent: c.absent ?? [],
      }
    })
  return useEcriture<{ menu: MenuSauve; plan: ParametresPlan }>(
    ['groupes_repas', 'plan_cells', 'parametres'],
    async ({ menu, plan }) => {
      await verifier(db().from('groupes_repas').delete().neq('id', ''))
      if (menu.groups?.length) await verifier(db().from('groupes_repas').insert(menu.groups))
      await verifier(db().from('plan_cells').delete().gte('day', 0))
      const cellules = versCellules(menu)
      if (cellules.length) await verifier(db().from('plan_cells').insert(cellules))
      await verifier(db().from('parametres').upsert({ cle: 'planificateur', valeur: { ...plan, jours: menu.days || 7 } }))
    },
    ({ menu, plan }, l) => ({
      groupes_repas: menu.groups ?? [],
      plan_cells: versCellules(menu),
      parametres: remplacer(
        l.parametres,
        [{ cle: 'planificateur', valeur: { ...plan, jours: menu.days || 7 } }],
        (a, b) => a.cle === b.cle,
      ),
    }),
  )
}

// ------------------------------------------------------------------
// Ajouts manuels et sorties
// ------------------------------------------------------------------

export function useAjoutConsommable() {
  return useEcriture<AjoutConsommable>(
    ['ajouts_consommables'],
    (a) => verifier(db().from('ajouts_consommables').upsert(a)),
    (a, l) => ({ ajouts_consommables: remplacer(l.ajouts_consommables, [a], (x, y) => x.cons_id === y.cons_id) }),
  )
}

export function useAjouterRecette() {
  return useEcriture<Omit<AjoutRecette, 'id' | 'created_at'>>(
    ['ajouts_recettes'],
    (a) => verifier(db().from('ajouts_recettes').insert(a)),
    (a, l) => ({
      // id provisoire négatif, remplacé au rechargement.
      ajouts_recettes: [...(l.ajouts_recettes ?? []), { ...a, id: -Date.now(), created_at: new Date().toISOString() }],
    }),
  )
}

export function useRetirerAjoutRecette() {
  return useEcriture<number>(
    ['ajouts_recettes'],
    (id) => verifier(db().from('ajouts_recettes').delete().eq('id', id)),
    (id, l) => ({ ajouts_recettes: (l.ajouts_recettes ?? []).filter((a) => a.id !== id) }),
  )
}

export function useEnregistrerSortie() {
  return useEcriture<Sortie>(
    ['sorties'],
    (s) => {
      const { created_at: _c, ...ligne } = s
      return verifier(db().from('sorties').upsert(ligne))
    },
    (s, l) => ({ sorties: remplacer(l.sorties, [s], memeId) }),
  )
}

export function useSupprimerSortie() {
  return useEcriture<string>(
    ['sorties'],
    (id) => verifier(db().from('sorties').delete().eq('id', id)),
    (id, l) => ({ sorties: (l.sorties ?? []).filter((s) => s.id !== id) }),
  )
}
