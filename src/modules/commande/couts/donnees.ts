import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { CellulePlan, GroupeRepas, Menu } from '../types'
import type { MenuDate } from './calcul'
import type { Annee, CorrectionMenu, Facture, GroupeManuel, Poste, Salaire, Semaine } from './types'

// Coût par assiette : en ligne seulement (networkMode « always »), pas de
// temps réel (les suppressions seraient diffusées sans filtre RLS) et jamais
// gardé sur l'appareil (requêtes ['cuisine-couts', …] exclues de la
// persistance : salaires). Erreurs dans le bandeau de l'espace (racine
// « cuisine-couts ») ; les fenêtres affichent les leurs sur place
// (racine « cuisine-couts-local »).

const RACINE = 'cuisine-couts'
const db = () => supabase.schema('commande')

type Table = 'couts_annees' | 'couts_semaines' | 'couts_factures' | 'couts_postes' | 'couts_salaires' | 'couts_groupes' | 'couts_menus'

/** numeric arrive en texte ou en nombre selon le pilote : toujours un nombre ici. */
const nombres = <T,>(lignes: T[], champ: keyof T) => lignes.map((l) => ({ ...l, [champ]: Number(l[champ]) }))

/** Toute la table (lue par tranches de 1000). */
async function lireTout<T>(table: Table, tri: string): Promise<T[]> {
  const lignes: T[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db().from(table).select('*').order(tri).range(debut, debut + 999)
    if (error) throw error
    lignes.push(...(data as T[]))
    if (data.length < 1000) return lignes
  }
}

const useTable = <T,>(table: Table, tri: string, montant?: keyof T) =>
  useQuery({
    queryKey: [RACINE, table],
    queryFn: async () => {
      const lignes = await lireTout<T>(table, tri)
      return montant ? nombres(lignes, montant) : lignes
    },
  })

export const useAnnees = () => useTable<Annee>('couts_annees', 'annee')
export const useSemaines = () => useTable<Semaine>('couts_semaines', 'debut')
export const useFactures = () => useTable<Facture>('couts_factures', 'jour', 'montant')
export const usePostes = () => useTable<Poste>('couts_postes', 'ordre')
export const useSalaires = () => useTable<Salaire>('couts_salaires', 'debut_paie', 'montant')
export const useGroupesManuels = () => useTable<GroupeManuel>('couts_groupes', 'ordre')
export const useCorrections = () => useTable<CorrectionMenu>('couts_menus', 'menu_id')

/**
 * Groupes et grille des menus datés donnés (lus en une fois). La clé porte
 * `updated_at` de chaque menu (touché par la base à tout changement de ses
 * groupes ou de sa grille) : un menu modifié est relu.
 */
export function useMenusDates(menus: Menu[]) {
  const versions = menus.map((m) => `${m.id}@${m.updated_at}`).sort()
  const requete = useQuery({
    queryKey: [RACINE, 'menus', versions],
    queryFn: async () => {
      const ids = menus.map((m) => m.id)
      if (!ids.length) return { groupes: [] as GroupeRepas[], cellules: [] as CellulePlan[] }
      const [groupes, cellules] = await Promise.all([
        supabase.schema('commande').from('groupes_repas').select('*').in('menu_id', ids),
        supabase.schema('commande').from('plan_cells').select('menu_id, day, meal, plat, salade, dessert, absent').in('menu_id', ids),
      ])
      if (groupes.error) throw groupes.error
      if (cellules.error) throw cellules.error
      return { groupes: groupes.data as GroupeRepas[], cellules: cellules.data as CellulePlan[] }
    },
    placeholderData: (avant) => avant,
  })
  // Le menu lui-même (nom, date, jours) vient de la liste à jour.
  const data = useMemo<MenuDate[] | undefined>(
    () =>
      requete.data &&
      menus.map((menu) => ({
        menu,
        groupes: requete.data.groupes.filter((g) => g.menu_id === menu.id),
        cellules: requete.data.cellules.filter((c) => c.menu_id === menu.id),
      })),
    [requete.data, menus],
  )
  return { ...requete, data }
}

// ------------------------------------------------------------------
// Écritures
// ------------------------------------------------------------------

type Operation<V> = (v: V) => PromiseLike<{ error: unknown }>

/**
 * Mutation d'une table : `local` = l'erreur est affichée sur place (fenêtre),
 * sinon dans le bandeau de l'espace. Les tables touchées sont relues ensuite.
 */
function useEcriture<V>(tables: Table[], operation: Operation<V>, local = false) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [local ? `${RACINE}-local` : RACINE, ...tables],
    networkMode: 'always',
    mutationFn: async (v: V) => {
      const { error } = await operation(v)
      if (error) throw error
    },
    onSettled: () => Promise.all(tables.map((t) => client.invalidateQueries({ queryKey: [RACINE, t] }))),
  })
}

export const useEnregistrerFacture = () =>
  useEcriture<Omit<Facture, 'created_at'>>(['couts_factures'], (f) => db().from('couts_factures').upsert(f), true)
export const useSupprimerFacture = () => useEcriture<string>(['couts_factures'], (id) => db().from('couts_factures').delete().eq('id', id), true)

export const useEnregistrerGroupe = (local = true) =>
  useEcriture<GroupeManuel>(['couts_groupes'], (g) => db().from('couts_groupes').upsert(g), local)
export const useSupprimerGroupe = () => useEcriture<string>(['couts_groupes'], (id) => db().from('couts_groupes').delete().eq('id', id), true)

/** Corrige le total d'assiettes d'un menu ; null = revenir au calcul. */
export const useCorrigerMenu = () =>
  useEcriture<{ menu_id: string; assiettes: number | null }>(['couts_menus'], ({ menu_id, assiettes }) =>
    assiettes == null ? db().from('couts_menus').delete().eq('menu_id', menu_id) : db().from('couts_menus').upsert({ menu_id, assiettes }),
  )

/** Montant d'un poste pour une période de paie ; null ou 0 = effacé. */
export const useEnregistrerSalaire = () =>
  useEcriture<{ debut_paie: string; poste_id: string; montant: number | null }>(['couts_salaires'], ({ debut_paie, poste_id, montant }) =>
    montant
      ? db().from('couts_salaires').upsert({ debut_paie, poste_id, montant })
      : db().from('couts_salaires').delete().eq('debut_paie', debut_paie).eq('poste_id', poste_id),
  )

export const useEnregistrerPoste = () => useEcriture<Poste>(['couts_postes'], (p) => db().from('couts_postes').upsert(p))
export const useSupprimerPoste = () => useEcriture<string>(['couts_postes'], (id) => db().from('couts_postes').delete().eq('id', id))

export const useEnregistrerSemaine = () => useEcriture<Semaine>(['couts_semaines'], (p) => db().from('couts_semaines').upsert(p))
export const useSupprimerSemaine = () => useEcriture<string>(['couts_semaines'], (id) => db().from('couts_semaines').delete().eq('id', id))

export const useModifierAnnee = () =>
  useEcriture<Annee>(['couts_annees'], (a) => db().from('couts_annees').update({ menus: a.menus }).eq('annee', a.annee))

/** Crée une année et ses semaines de camp (l'année d'abord : les semaines y renvoient). */
export function useCreerAnnee() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${RACINE}-local`, 'annee'],
    networkMode: 'always',
    mutationFn: async ({ annee, semaines }: { annee: number; semaines: Omit<Semaine, 'id'>[] }) => {
      const a = await db().from('couts_annees').insert({ annee, menus: true })
      if (a.error) throw a.error
      const p = semaines.length ? await db().from('couts_semaines').insert(semaines) : { error: null }
      if (p.error) {
        await db().from('couts_annees').delete().eq('annee', annee)
        throw p.error
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: [RACINE] }),
  })
}
