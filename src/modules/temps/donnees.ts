import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'
import { finPeriode, type TypeHeures } from './periodes'

// Module en ligne seulement : mutations networkMode « always », erreurs dans
// le bandeau du module (racine S). Pas de temps réel (voir la migration) ni
// de cache sur l'appareil (src/lib/requetes.ts). La base décide de ce que
// chacun voit : une personne de la direction ne reçoit que ses lignes.

const S = 'temps'
const db = () => supabase.schema(S)

export interface Heure {
  id: string
  user_id: string
  jour: string
  type: TypeHeures
  heures: number
  updated_at: string
  updated_by: string | null
}

export interface Feuille {
  id: string
  user_id: string
  debut: string
  note: string | null
}

export interface Membre {
  id: string
  courriel: string
  nom: string | null
  role: Role
  actif: boolean
}

export const nomDe = (m: Pick<Membre, 'nom' | 'courriel'> | undefined | null) => m?.nom || m?.courriel || 'Personne inconnue'

/** Lit toutes les lignes par tranches de 1000 (limite de l'API). */
export async function toutLire<T>(tranche: (debut: number, fin: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const lignes: T[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await tranche(debut, debut + 999)
    if (error) throw error
    const lot = (data ?? []) as T[]
    lignes.push(...lot)
    if (lot.length < 1000) return lignes
  }
}

const versNombre = (h: Heure): Heure => ({ ...h, heures: Number(h.heures) })

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

/** Heures d'une personne pour une période. */
export function useHeures(userId: string, debut: string) {
  return useQuery({
    queryKey: [S, 'heures', userId, debut],
    queryFn: async () => {
      const { data, error } = await db()
        .from('heures')
        .select('*')
        .eq('user_id', userId)
        .gte('jour', debut)
        .lte('jour', finPeriode(debut))
      if (error) throw error
      return (data as Heure[]).map(versNombre)
    },
  })
}

/** La note d'une personne pour une période ; null = pas de note. */
export function useFeuille(userId: string, debut: string) {
  return useQuery({
    queryKey: [S, 'feuille', userId, debut],
    queryFn: async () => {
      const { data, error } = await db().from('feuilles').select('*').eq('user_id', userId).eq('debut', debut).maybeSingle()
      if (error) throw error
      return data as Feuille | null
    },
  })
}

/** Toutes les heures visibles entre deux dates (tableau de bord : toute la direction pour un admin). */
export function useHeuresPlage(du: string, au: string) {
  return useQuery({
    queryKey: [S, 'plage-heures', du, au],
    queryFn: async () =>
      (
        await toutLire<Heure>((a, b) =>
          db().from('heures').select('*').gte('jour', du).lte('jour', au).order('jour').order('id').range(a, b),
        )
      ).map(versNombre),
  })
}

export function useFeuillesPlage(du: string, au: string) {
  return useQuery({
    queryKey: [S, 'plage-feuilles', du, au],
    queryFn: () =>
      toutLire<Feuille>((a, b) => db().from('feuilles').select('*').gte('debut', du).lte('debut', au).order('debut').order('id').range(a, b)),
  })
}

/** Comptes qui peuvent avoir une feuille (admins et direction), y compris inactifs. */
export function useMembres() {
  return useQuery({
    queryKey: [S, 'membres'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('profils')
        .select('id, courriel, nom, role, actif')
        .order('nom')
        .order('courriel')
      if (error) throw error
      return data as Membre[]
    },
  })
}

// ------------------------------------------------------------------
// Écritures
// ------------------------------------------------------------------

/**
 * Inscrit les heures d'une case (null = efface). Affichage mis à jour
 * d'avance, remis en place si la base refuse.
 */
export function useSaisir(userId: string, debut: string) {
  const client = useQueryClient()
  const cle = [S, 'heures', userId, debut]
  return useMutation({
    mutationKey: [S, 'heures'],
    networkMode: 'always',
    mutationFn: async (c: { jour: string; type: TypeHeures; heures: number | null }) => {
      const { error } =
        c.heures == null
          ? await db().from('heures').delete().eq('user_id', userId).eq('jour', c.jour).eq('type', c.type)
          : await db()
              .from('heures')
              .upsert({ user_id: userId, jour: c.jour, type: c.type, heures: c.heures }, { onConflict: 'user_id,jour,type' })
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Heure[]>(cle)
      client.setQueryData<Heure[]>(cle, (liste = []) => {
        const existante = liste.find((h) => h.jour === c.jour && h.type === c.type)
        const reste = liste.filter((h) => h !== existante)
        if (c.heures == null) return reste
        return [
          ...reste,
          {
            id: existante?.id ?? crypto.randomUUID(),
            user_id: userId,
            jour: c.jour,
            type: c.type,
            heures: c.heures,
            updated_at: new Date().toISOString(),
            updated_by: null,
          },
        ]
      })
      return { avant }
    },
    onError: (_e, _c, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: cle })
      client.invalidateQueries({ queryKey: [S, 'plage-heures'] })
    },
  })
}

const invaliderFeuilles = (client: ReturnType<typeof useQueryClient>) => {
  client.invalidateQueries({ queryKey: [S, 'feuille'] })
  client.invalidateQueries({ queryKey: [S, 'plage-feuilles'] })
}

export function useEnregistrerNote() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'note'],
    networkMode: 'always',
    mutationFn: async (p: { userId: string; debut: string; note: string }) => {
      const { error } = await db().rpc('enregistrer_note', { p_user: p.userId, p_debut: p.debut, p_note: p.note })
      if (error) throw error
    },
    onSettled: () => invaliderFeuilles(client),
  })
}
