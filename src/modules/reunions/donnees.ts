import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Entreprise } from '@/lib/types'
import type { Point, Recurrent, Reunion } from './types'

// Module en ligne seulement (networkMode « always »). Les modifications
// sont optimistes (la réunion avance sans attendre la base) ; une
// modification refusée remet la ligne d'avant et va dans le bandeau du
// module (racine « reunions »).

const db = () => supabase.schema('reunions')
const clePoints = ['reunions', 'points']

/** Tous les points (lus par tranches de 1000), rechargés à chaque changement fait ailleurs. */
export function usePoints() {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`reunions.points-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'reunions', table: 'points' }, () => client.invalidateQueries({ queryKey: clePoints }))
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])

  return useQuery({
    queryKey: clePoints,
    queryFn: async () => {
      const lignes: Point[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from('points').select('*').order('created_at').order('id').range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as Point[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export const useReunions = () => useListe<Reunion>('reunions', 'reunions', 'jour')
export const useRecurrents = () => useListe<Recurrent>('reunions', 'recurrents', 'ordre')
export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')

type Ligne = { id: string }

/** Ajout optimiste d'une ligne (id créé par l'appareil). */
function useAjouter<T extends Ligne>(table: string, cle: QueryKey) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reunions', table, 'ajouter'],
    networkMode: 'always',
    mutationFn: async ({ ligne }: { ligne: Partial<T> & Ligne; affiche: T }) => {
      const { error } = await db().from(table).insert(ligne)
      if (error) throw error
    },
    onMutate: async ({ affiche }) => {
      await client.cancelQueries({ queryKey: cle })
      client.setQueryData<T[]>(cle, (l) => (l ? [...l, affiche] : l))
    },
    onError: (_e, { affiche }) => client.setQueryData<T[]>(cle, (l) => l?.filter((x) => x.id !== affiche.id)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Modification optimiste d'une ligne : seuls les champs envoyés changent. */
function useModifier<T extends Ligne>(table: string, cle: QueryKey) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reunions', table, 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<T>; affiche?: Partial<T> }) => {
      const { error } = await db().from(table).update(champs as Record<string, unknown>).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs, affiche }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<T[]>(cle)?.find((x) => x.id === id)
      client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? { ...x, ...champs, ...affiche } : x)))
      return { avant }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.avant) client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? ctx.avant! : x)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

function useRetirer<T extends Ligne>(table: string, cle: QueryKey) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reunions', table, 'supprimer'],
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

export const useAjouterPoint = () => useAjouter<Point>('points', clePoints)
export const useModifierPoint = () => useModifier<Point>('points', clePoints)
export const useSupprimerPoint = () => useRetirer<Point>('points', clePoints)

export const useAjouterReunion = () => useAjouter<Reunion>('reunions', ['reunions', 'reunions'])
export const useModifierReunion = () => useModifier<Reunion>('reunions', ['reunions', 'reunions'])

export const useAjouterRecurrent = () => useAjouter<Recurrent>('recurrents', ['reunions', 'recurrents'])
export const useModifierRecurrent = () => useModifier<Recurrent>('recurrents', ['reunions', 'recurrents'])
export const useSupprimerRecurrent = () => useRetirer<Recurrent>('recurrents', ['reunions', 'recurrents'])

/** Supprime une réunion spéciale ; ses points encore ouverts retournent au quotidien. */
export function useSupprimerReunion() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reunions', 'reunion', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().rpc('supprimer_reunion', { p_reunion: id })
      if (error) throw error
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['reunions', 'reunions'] })
      client.invalidateQueries({ queryKey: clePoints })
    },
  })
}

/** Ajoute plusieurs points d'un coup (ordre du jour de départ d'une réunion spéciale). */
export function useAjouterPoints() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reunions', 'points', 'gabarit'],
    networkMode: 'always',
    mutationFn: async (lignes: Partial<Point>[]) => {
      if (!lignes.length) return
      const { error } = await db().from('points').insert(lignes)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: clePoints }),
  })
}

/** Jours marqués « Pas de réunion ». */
export function useJoursSans() {
  return useListe<{ jour: string }>('reunions', 'jours_sans', 'jour')
}

/** Coche ou décoche « Pas de réunion » pour un jour. */
export function useBasculerJourSans() {
  const client = useQueryClient()
  const cle = ['reunions', 'jours_sans']
  return useMutation({
    mutationKey: ['reunions', 'jours_sans'],
    networkMode: 'always',
    mutationFn: async ({ jour, sans }: { jour: string; sans: boolean }) => {
      const { error } = sans ? await db().from('jours_sans').upsert({ jour }) : await db().from('jours_sans').delete().eq('jour', jour)
      if (error) throw error
    },
    onMutate: async ({ jour, sans }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<{ jour: string }[]>(cle)
      client.setQueryData<{ jour: string }[]>(cle, (l) => (l ? (sans ? [...l.filter((x) => x.jour !== jour), { jour }] : l.filter((x) => x.jour !== jour)) : l))
      return { avant }
    },
    onError: (_e, _v, ctx) => ctx?.avant && client.setQueryData(cle, ctx.avant),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}
