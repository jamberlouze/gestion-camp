import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cleCase } from './planification'
import type { CasePlanification, CodePlanification, Pilotage } from './types'

// Planification de la saison (plan-rh.md §14.1) : codes, cases et pilotage.
// Comme le reste du module : en ligne seulement, pas de temps réel ni de
// cache sur l'appareil ; la grille se relit à l'ouverture et toutes les
// 60 secondes. Modifications optimistes, une seule file (scope
// « rh-planification ») ; un refus remet la case d'avant et va dans le
// bandeau du module (racine « rh »).

const db = () => supabase.schema('rh')
const RELIRE = 60_000

export function useCodesPlanification() {
  return useQuery({
    queryKey: ['rh', 'codes_planification'],
    queryFn: async () => {
      const { data, error } = await db().from('codes_planification').select('*').order('ordre').order('code')
      if (error) throw error
      return data as CodePlanification[]
    },
  })
}

const cleCases = (saisonId: string): QueryKey => ['rh', 'planification', saisonId]
const clePilotage = (saisonId: string): QueryKey => ['rh', 'pilotage', saisonId]

/** Cases de toutes les dates de la saison (afficher les séjours ne relit rien). */
export function useCasesPlanification(saisonId: string | null, dateIds: string[]) {
  return useQuery({
    queryKey: cleCases(saisonId ?? ''),
    enabled: !!saisonId,
    refetchInterval: RELIRE,
    queryFn: async () => {
      if (!dateIds.length) return [] as CasePlanification[]
      const lignes: CasePlanification[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db()
          .from('planification')
          .select('embauche_id, date_id, code_id, note, updated_at, updated_by_nom')
          .in('date_id', dateIds)
          .order('embauche_id')
          .order('date_id')
          .range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as CasePlanification[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export function usePilotage(saisonId: string | null, dateIds: string[]) {
  return useQuery({
    queryKey: clePilotage(saisonId ?? ''),
    enabled: !!saisonId,
    refetchInterval: RELIRE,
    queryFn: async () => {
      if (!dateIds.length) return [] as Pilotage[]
      const { data, error } = await db().from('pilotage').select('date_id, besoin, reel_an_passe').in('date_id', dateIds)
      if (error) throw error
      return data as Pilotage[]
    },
  })
}

/** Ne relit qu'après la dernière modification de la file (sinon une relecture effacerait les suivantes). */
function relireSiDerniere(client: ReturnType<typeof useQueryClient>, cle: QueryKey) {
  if (client.isMutating({ mutationKey: ['rh', 'planification'] }) <= 1) return client.invalidateQueries({ queryKey: cle })
}

/** Pose (code) ou vide (code null) une case. */
export function usePoserCase(saisonId: string) {
  const client = useQueryClient()
  const cle = cleCases(saisonId)
  return useMutation({
    mutationKey: ['rh', 'planification', 'poser'],
    scope: { id: 'rh-planification' },
    networkMode: 'always',
    mutationFn: async (c: { embauche_id: string; date_id: string; code_id: string | null; note?: string | null }) => {
      if (!c.code_id) {
        const { error } = await db().from('planification').delete().eq('embauche_id', c.embauche_id).eq('date_id', c.date_id)
        if (error) throw error
        return
      }
      const { error } = await db()
        .from('planification')
        .upsert({ embauche_id: c.embauche_id, date_id: c.date_id, code_id: c.code_id, note: c.note?.trim() || null }, { onConflict: 'embauche_id,date_id' })
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle, exact: true })
      const k = cleCase(c.embauche_id, c.date_id)
      const avant = client.getQueryData<CasePlanification[]>(cle)?.find((x) => cleCase(x.embauche_id, x.date_id) === k)
      client.setQueryData<CasePlanification[]>(cle, (l) => {
        const reste = (l ?? []).filter((x) => cleCase(x.embauche_id, x.date_id) !== k)
        return c.code_id ? [...reste, { embauche_id: c.embauche_id, date_id: c.date_id, code_id: c.code_id, note: c.note?.trim() || null }] : reste
      })
      return { avant, k }
    },
    onError: (_e, _c, ctx) => {
      if (!ctx) return
      client.setQueryData<CasePlanification[]>(cle, (l) => [...(l ?? []).filter((x) => cleCase(x.embauche_id, x.date_id) !== ctx.k), ...(ctx.avant ? [ctx.avant] : [])])
    },
    onSettled: () => relireSiDerniere(client, cle),
  })
}

/** Besoin prévu ou réel de l'an passé d'une date (null = effacé). */
export function useEnregistrerPilotage(saisonId: string) {
  const client = useQueryClient()
  const cle = clePilotage(saisonId)
  return useMutation({
    mutationKey: ['rh', 'planification', 'pilotage'],
    scope: { id: 'rh-planification' },
    networkMode: 'always',
    mutationFn: async (p: Partial<Pilotage> & { date_id: string }) => {
      const { error } = await db().from('pilotage').upsert(p, { onConflict: 'date_id' })
      if (error) throw error
    },
    onMutate: async (p) => {
      await client.cancelQueries({ queryKey: cle, exact: true })
      const avant = client.getQueryData<Pilotage[]>(cle)?.find((x) => x.date_id === p.date_id)
      client.setQueryData<Pilotage[]>(cle, (l) => [
        ...(l ?? []).filter((x) => x.date_id !== p.date_id),
        { besoin: null, reel_an_passe: null, ...avant, ...p },
      ])
      return { avant }
    },
    onError: (_e, p, ctx) => client.setQueryData<Pilotage[]>(cle, (l) => [...(l ?? []).filter((x) => x.date_id !== p.date_id), ...(ctx?.avant ? [ctx.avant] : [])]),
    onSettled: () => relireSiDerniere(client, cle),
  })
}

// Codes (Réglages › Codes de la planification)

/** Ajouter (insert) ou modifier (update) un code ; optimiste, la ligne d'avant revient si la base refuse. */
function useCode(genre: 'ajouter' | 'modifier') {
  const client = useQueryClient()
  const cle: QueryKey = ['rh', 'codes_planification']
  return useMutation({
    mutationKey: ['rh', 'codes_planification', genre],
    networkMode: 'always',
    mutationFn: async (c: Partial<CodePlanification> & { id: string }) => {
      const { id, ...champs } = c
      const { error } = genre === 'ajouter' ? await db().from('codes_planification').insert(c) : await db().from('codes_planification').update(champs).eq('id', id)
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle, exact: true })
      const avant = client.getQueryData<CodePlanification[]>(cle)
      client.setQueryData<CodePlanification[]>(cle, (l) =>
        genre === 'modifier'
          ? l?.map((x) => (x.id === c.id ? { ...x, ...c } : x))
          : [...(l ?? []), { code: '', nom: '', couleur: 'gris', present: true, besoin: false, ordre: 0, actif: true, ...c }],
      )
      return { avant }
    },
    onError: (_e, _c, ctx) => client.setQueryData(cle, ctx?.avant),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export const useAjouterCode = () => useCode('ajouter')
export const useModifierCode = () => useCode('modifier')

/** Supprime un code jamais utilisé (la base refuse les autres : les retirer). */
export function useSupprimerCode() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh', 'codes_planification', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from('codes_planification').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'codes_planification'] }),
  })
}
