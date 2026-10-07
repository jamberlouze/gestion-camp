import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Profil } from '@/lib/types'
import { bornesExercice, exerciceDeCle, indexer, UNIQUE } from './calendrier'
import type { Coche, Entreprise, Etiquette, Fournisseur, Projet, Responsable, Tache } from './types'

// Module en ligne seulement (pas de file d'attente hors ligne, contrairement
// à Embarcations) : sans réseau, une modification échoue tout de suite
// (networkMode « always ») au lieu d'attendre dans le cache de l'appareil.

const S = 'mastertimeline'
const db = () => supabase.schema(S)

// Compagnies : liste commune du référentiel (core.entreprises), gérée dans Référentiel › Compagnies.
export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')
export const useProjets = () => useListe<Projet>(S, 'projets', 'ordre')
export const useResponsables = () => useListe<Responsable>(S, 'responsables', 'nom')
export const useFournisseurs = () => useListe<Fournisseur>(S, 'fournisseurs', 'nom')
export const useEtiquettes = () => useListe<Etiquette>(S, 'etiquettes', 'ordre')
/** Qui a coché : la direction voit tous les profils, les autres seulement le leur. */
export const useProfils = () => useListe<Profil>('core', 'profils', 'courriel')

/** Lit toutes les lignes par tranches de 1000 (limite de l'API). */
async function toutLire<T>(tranche: (debut: number, fin: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const lignes: T[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await tranche(debut, debut + 999)
    if (error) throw error
    const lot = (data ?? []) as T[]
    lignes.push(...lot)
    if (lot.length < 1000) return lignes
  }
}

/** Recharge les requêtes [S, table, …] à chaque changement fait ailleurs. */
function useTempsReel(table: string) {
  const client = useQueryClient()
  useEffect(() => {
    // Nom unique : un nom réutilisé au remontage fait planter subscribe().
    const canal = supabase
      .channel(`${S}.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: S, table }, () => client.invalidateQueries({ queryKey: [S, table] }))
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [table, client])
}

/** Toutes les tâches non supprimées. Clé [S, 'taches'] : la même que useEnregistrer. */
export function useTaches() {
  useTempsReel('taches')
  return useQuery({
    queryKey: [S, 'taches'],
    queryFn: () =>
      toutLire<Tache>((a, b) => db().from('taches').select('*').eq('archivee', false).order('created_at').order('id').range(a, b)),
  })
}

/** Coches d'un exercice (octobre à septembre) et des tâches ponctuelles. */
export function useCoches(exercice: number) {
  useTempsReel('coches')
  const [debut, fin] = bornesExercice(exercice)
  const annee = useQuery({
    queryKey: [S, 'coches', exercice],
    queryFn: () =>
      toutLire<Coche>((a, b) =>
        db().from('coches').select('*').gte('periode', debut).lte('periode', fin).order('periode').order('tache_id').range(a, b),
      ),
  })
  const uniques = useQuery({
    queryKey: [S, 'coches', UNIQUE],
    queryFn: () => toutLire<Coche>((a, b) => db().from('coches').select('*').eq('periode', UNIQUE).order('tache_id').range(a, b)),
  })
  const index = useMemo(() => indexer([...(annee.data ?? []), ...(uniques.data ?? [])]), [annee.data, uniques.data])
  return { index, pret: !!annee.data && !!uniques.data, erreur: annee.error ?? uniques.error }
}

const cleRequeteCoche = (periode: string) => [S, 'coches', periode === UNIQUE ? UNIQUE : exerciceDeCle(periode)]

/**
 * Coche ou décoche un passage. `coche` null = plus rien à garder (ni statut
 * ni note) : la ligne est effacée. Affichage mis à jour d'avance, remis en
 * place si la base refuse.
 */
export function useCocher() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, 'coche'],
    networkMode: 'always',
    mutationFn: async ({ tache_id, periode, coche }: { tache_id: string; periode: string; coche: Coche | null }) => {
      const { error } = coche
        ? await db().from('coches').upsert(coche, { onConflict: 'tache_id,periode' })
        : await db().from('coches').delete().eq('tache_id', tache_id).eq('periode', periode)
      if (error) throw error
    },
    onMutate: async ({ tache_id, periode, coche }) => {
      const cle = cleRequeteCoche(periode)
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Coche[]>(cle)
      client.setQueryData<Coche[]>(cle, (liste = []) => {
        const reste = liste.filter((c) => !(c.tache_id === tache_id && c.periode === periode))
        return coche ? [...reste, coche] : reste
      })
      return { cle, avant }
    },
    onError: (_e, _v, ctx) => {
      if (ctx) client.setQueryData(ctx.cle, ctx.avant)
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (ctx) client.invalidateQueries({ queryKey: ctx.cle })
    },
  })
}

/**
 * Modifie une tâche (ou plusieurs champs d'un coup) ; erreurs dans le bandeau
 * du module. Affichage mis à jour d'avance ; si la base refuse, la ligne
 * d'avant est remise.
 */
export function useModifierTache() {
  const client = useQueryClient()
  const cle = [S, 'taches']
  return useMutation({
    mutationKey: [S, 'tache'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Tache> }) => {
      const { error } = await db().from('taches').update(champs).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Tache[]>(cle)?.find((t) => t.id === id)
      client.setQueryData<Tache[]>(cle, (liste) => liste?.map((t) => (t.id === id ? { ...t, ...champs } : t)))
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<Tache[]>(cle, (liste) => liste?.map((t) => (t.id === avant.id ? avant : t)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Crée une tâche ; renvoie la ligne créée. */
export async function creerTache(champs: Partial<Tache>) {
  const { data, error } = await db().from('taches').insert(champs).select().single()
  if (error) throw error
  return data as Tache
}

/** Toutes les tâches d'un responsable passent à un autre (départ, remplacement). */
export async function reassigner(de: string, vers: string | null) {
  const { error, count } = await db().from('taches').update({ responsable_id: vers }, { count: 'exact' }).eq('responsable_id', de)
  if (error) throw error
  return count ?? 0
}

/** Entreprises, projets, responsables, fournisseurs et étiquettes, indexés par id. */
export function useReferences() {
  const entreprises = useEntreprises()
  const projets = useProjets()
  const responsables = useResponsables()
  const fournisseurs = useFournisseurs()
  const etiquettes = useEtiquettes()
  return useMemo(() => {
    const parId = <T extends { id: string }>(l: T[] | undefined) => new Map((l ?? []).map((x) => [x.id, x]))
    return {
      entreprises: entreprises.data ?? [],
      projets: (projets.data ?? []).filter((p) => !p.archive),
      responsables: responsables.data ?? [],
      fournisseurs: fournisseurs.data ?? [],
      etiquettes: etiquettes.data ?? [],
      entreprise: parId(entreprises.data),
      projet: parId(projets.data),
      responsable: parId(responsables.data),
      fournisseur: parId(fournisseurs.data),
      etiquette: parId(etiquettes.data),
      pret: !!entreprises.data && !!projets.data && !!responsables.data && !!fournisseurs.data && !!etiquettes.data,
      erreur: entreprises.error ?? projets.error ?? responsables.error ?? fournisseurs.error ?? etiquettes.error,
    }
  }, [
    entreprises.data, projets.data, responsables.data, fournisseurs.data, etiquettes.data,
    entreprises.error, projets.error, responsables.error, fournisseurs.error, etiquettes.error,
  ])
}

export type References = ReturnType<typeof useReferences>
