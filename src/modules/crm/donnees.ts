import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { RelanceAuto } from './calculs'
import type { Conseiller, Contact, Echange, Organisation, Regle, Relance, Sejour, Visite } from './types'

// Module en ligne seulement (networkMode « always »). Modifications
// optimistes ; une modification refusée remet la ligne d'avant et va dans
// le bandeau du module (racine « crm »).

const db = () => supabase.schema('crm')

/** Table complète (par tranches de 1000), rechargée à chaque changement fait ailleurs. */
function useTable<T>(table: string, tri: string) {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`crm.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'crm', table }, () => client.invalidateQueries({ queryKey: ['crm', table] }))
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client, table])

  return useQuery({
    queryKey: ['crm', table],
    queryFn: async () => {
      const lignes: T[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from(table).select('*').order(tri).order('id').range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as T[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export const useOrganisations = () => useTable<Organisation>('organisations', 'nom')
export const useContacts = () => useTable<Contact>('contacts', 'nom')
export const useEchanges = () => useTable<Echange>('echanges', 'jour')
export const useVisites = () => useTable<Visite>('visites', 'date_arrivee')
export const useRelances = () => useTable<Relance>('relances', 'echeance')
export const useRegles = () => useTable<Regle>('regles', 'created_at')

/** Séjours de la base de réservations (copie Airtable du Calendrier, aux 15 min). */
export function useSejours() {
  return useQuery({
    queryKey: ['crm', 'sejours'],
    queryFn: async () => {
      const { data, error } = await db().rpc('sejours')
      if (error) throw error
      return data as Sejour[]
    },
  })
}

/** Comptes qui écrivent dans le CRM (choix du conseiller et de qui fait une relance). */
export function useConseillers() {
  return useQuery({
    queryKey: ['crm', 'conseillers'],
    queryFn: async () => {
      const { data, error } = await db().rpc('conseillers')
      if (error) throw error
      return data as Conseiller[]
    },
  })
}

type Ligne = { id: string }

function useAjouter<T extends Ligne>(table: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['crm', table]
  return useMutation({
    mutationKey: ['crm', table, 'ajouter'],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T> & Ligne) => {
      const { error } = await db().from(table).insert(ligne)
      if (error) throw error
    },
    onMutate: async (ligne) => {
      await client.cancelQueries({ queryKey: cle })
      client.setQueryData<T[]>(cle, (l) => (l ? [...l, ligne as T] : l))
    },
    onError: (_e, ligne) => client.setQueryData<T[]>(cle, (l) => l?.filter((x) => x.id !== ligne.id)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

function useModifier<T extends Ligne>(table: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['crm', table]
  return useMutation({
    mutationKey: ['crm', table, 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<T> }) => {
      const { error } = await db().from(table).update(champs as Record<string, unknown>).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<T[]>(cle)?.find((x) => x.id === id)
      client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? { ...x, ...champs } : x)))
      return { avant }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.avant) client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? ctx.avant! : x)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

function useRetirer<T extends Ligne>(table: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['crm', table]
  return useMutation({
    mutationKey: ['crm', table, 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<T[]>(cle)
      client.setQueryData<T[]>(cle, (l) => l?.filter((x) => x.id !== id))
      return { avant }
    },
    onError: (_e, _id, ctx) => ctx?.avant && client.setQueryData(cle, ctx.avant),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export const useAjouterOrganisation = () => useAjouter<Organisation>('organisations')
export const useModifierOrganisation = () => useModifier<Organisation>('organisations')
export const useSupprimerOrganisation = () => useRetirer<Organisation>('organisations')

export const useAjouterContact = () => useAjouter<Contact>('contacts')
export const useModifierContact = () => useModifier<Contact>('contacts')
export const useSupprimerContact = () => useRetirer<Contact>('contacts')

export const useAjouterEchange = () => useAjouter<Echange>('echanges')
export const useModifierEchange = () => useModifier<Echange>('echanges')
export const useSupprimerEchange = () => useRetirer<Echange>('echanges')

export const useAjouterVisite = () => useAjouter<Visite>('visites')
export const useSupprimerVisite = () => useRetirer<Visite>('visites')

export const useAjouterRelance = () => useAjouter<Relance>('relances')
export const useModifierRelance = () => useModifier<Relance>('relances')
export const useSupprimerRelance = () => useRetirer<Relance>('relances')

export const useAjouterRegle = () => useAjouter<Regle>('regles')
export const useModifierRegle = () => useModifier<Regle>('regles')
export const useSupprimerRegle = () => useRetirer<Regle>('regles')

/**
 * Crée les relances automatiques qui manquent. Une relance déjà créée (même
 * faite, annulée ou supprimée… tant que sa ligne existe) n'est jamais
 * recréée : `source_cle` est unique.
 */
export function useCreerRelancesAuto() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['crm', 'relances', 'auto'],
    networkMode: 'always',
    mutationFn: async (lignes: RelanceAuto[]) => {
      if (!lignes.length) return
      const { error } = await db().from('relances').upsert(lignes, { onConflict: 'source_cle', ignoreDuplicates: true })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['crm', 'relances'] }),
  })
}
