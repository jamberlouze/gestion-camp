import {
  onlineManager,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import type { ChampsEmbarcation, ChampsModele, Embarcation, Modele } from './types'

// ------------------------------------------------------------------
// Fonctionnement hors ligne
//
// Chaque modification passe par une mutation TanStack Query avec une clé
// fixe (CLES.*). Sans réseau, la mutation est mise en pause, conservée dans
// le cache persistant (voir src/lib/requetes.ts) et rejouée au retour du
// réseau, même après une fermeture de l'app. L'écran est mis à jour tout
// de suite (mise à jour optimiste) ; la base tranche au moment de l'envoi
// (la dernière modification l'emporte, champ par champ).
// ------------------------------------------------------------------

const RACINE = 'embarcations'

export const CLES = {
  modeles: [RACINE, 'modeles'],
  liste: [RACINE, 'liste'],
  majEmbarcation: [RACINE, 'maj-embarcation'],
  creerEmbarcation: [RACINE, 'creer-embarcation'],
  majModele: [RACINE, 'maj-modele'],
  creerModele: [RACINE, 'creer-modele'],
} as const

const db = () => supabase.schema('embarcations')

/** Les erreurs réseau sont réessayées indéfiniment ; les autres (droits, doublon…) sont affichées. */
export function estErreurReseau(e: unknown): boolean {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  return /failed to fetch|network|load failed|fetch failed/i.test(m)
}

async function executer(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

export function useModeles() {
  return useQuery({
    queryKey: CLES.modeles,
    queryFn: async () => {
      const { data, error } = await db().from('modeles').select('*').order('type').order('nom')
      if (error) throw error
      return data as Modele[]
    },
  })
}

export function useEmbarcations() {
  return useQuery({
    queryKey: CLES.liste,
    queryFn: async () => {
      // Plus de 1000 embarcations un jour ? Paginer ici.
      const { data, error } = await db()
        .from('embarcations')
        .select('*')
        .is('deleted_at', null)
        .order('numero_identification')
      if (error) throw error
      return data as Embarcation[]
    },
  })
}

/** Recharge les listes quand quelqu'un d'autre modifie la flotte. */
export function useTempsReel() {
  const client = useQueryClient()
  useEffect(() => {
    const recharger = () => {
      // Pas pendant un envoi : on écraserait l'affichage optimiste. La fin
      // de l'envoi recharge de toute façon (onSettled).
      if (client.isMutating({ mutationKey: [RACINE] }) === 0) {
        client.invalidateQueries({ queryKey: [RACINE] })
      }
    }
    // Nom unique : la fermeture d'un canal est asynchrone, et Supabase
    // réutiliserait un canal du même nom encore ouvert (erreur « after subscribe »).
    const canal = supabase
      .channel(`embarcations-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'embarcations', table: 'embarcations' }, recharger)
      .on('postgres_changes', { event: '*', schema: 'embarcations', table: 'modeles' }, recharger)
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

// ------------------------------------------------------------------
// État de la synchronisation
// ------------------------------------------------------------------

export function useEnLigne() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  )
}

/** Nombre de modifications pas encore confirmées par la base. */
export function useModificationsEnAttente() {
  return useMutationState({
    filters: { mutationKey: [RACINE], status: 'pending' },
    select: (m) => m.mutationId,
  }).length
}

/** Modifications refusées par la base (droits, préfixe en double…). */
export function useErreursEnvoi() {
  const client = useQueryClient()
  const erreurs = useMutationState({
    filters: { mutationKey: [RACINE], status: 'error' },
    select: (m) => ({ id: m.mutationId, erreur: m.state.error }),
  })
  const effacer = () => {
    const cache = client.getMutationCache()
    cache.findAll({ mutationKey: [RACINE], status: 'error' }).forEach((m) => cache.remove(m))
  }
  return { erreurs, effacer }
}

// ------------------------------------------------------------------
// Modifications (définies une fois pour toutes sur le QueryClient, pour
// pouvoir reprendre après un rechargement les envois restés en attente)
// ------------------------------------------------------------------

interface VariablesMaj<C> {
  id: string
  champs: C
}

export function enregistrerMutationsEmbarcations(client: QueryClient) {
  const communes = {
    retry: (essais: number, erreur: unknown) => estErreurReseau(erreur) && essais < 1000,
    retryDelay: (essais: number) => Math.min(1000 * 2 ** essais, 30_000),
  }

  /**
   * Mise à jour optimiste d'une ligne en cache. Le contexte ne garde que la
   * ligne d'avant (null pour une création) : c'est léger à conserver sur
   * l'appareil, et un envoi refusé n'annule que sa propre ligne, pas les
   * autres modifications en attente.
   */
  interface Contexte<T> {
    cle: readonly string[]
    id: string
    avant: T | null
  }
  function optimiste<T extends { id: string }>(cle: readonly string[], id: string, apres: (ligne: T | null) => T | null) {
    return async (): Promise<Contexte<T>> => {
      await client.cancelQueries({ queryKey: cle })
      const liste = client.getQueryData<T[]>(cle) ?? []
      const avant = liste.find((l) => l.id === id) ?? null
      const nouvelle = apres(avant)
      client.setQueryData<T[]>(cle, remplacer(liste, id, nouvelle))
      return { cle, id, avant }
    }
  }
  function remplacer<T extends { id: string }>(liste: T[], id: string, ligne: T | null): T[] {
    const sans = liste.filter((l) => l.id !== id)
    if (!ligne) return sans
    return liste.some((l) => l.id === id) ? liste.map((l) => (l.id === id ? ligne : l)) : [...sans, ligne]
  }
  function annuler(_e: unknown, _v: unknown, ctx: Contexte<{ id: string }> | undefined) {
    if (!ctx) return
    client.setQueryData<{ id: string }[]>(ctx.cle, (liste = []) => remplacer(liste, ctx.id, ctx.avant))
  }
  function recharger() {
    // Dernier envoi terminé : on recharge l'état officiel de la base.
    if (client.isMutating({ mutationKey: [RACINE] }) <= 1) {
      client.invalidateQueries({ queryKey: [RACINE] })
    }
  }

  client.setMutationDefaults(CLES.majEmbarcation, {
    ...communes,
    mutationFn: ({ id, champs }: VariablesMaj<ChampsEmbarcation>) =>
      executer(db().from('embarcations').update(champs).eq('id', id)),
    onMutate: ({ id, champs }: VariablesMaj<ChampsEmbarcation>) =>
      optimiste<Embarcation>(CLES.liste, id, (e) => (!e || champs.deleted_at ? null : { ...e, ...champs }))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.creerEmbarcation, {
    ...communes,
    mutationFn: (nouvelle: NouvelleEmbarcation) => executer(db().from('embarcations').insert(nouvelle)),
    onMutate: (nouvelle: NouvelleEmbarcation) =>
      optimiste<Embarcation>(CLES.liste, nouvelle.id, () => ({
        numero_identification: null,
        fonctionnel: true,
        entreprise_utilisation: null,
        notes: null,
        date_creation: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        ...nouvelle,
      }))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.majModele, {
    ...communes,
    mutationFn: ({ id, champs }: VariablesMaj<ChampsModele>) =>
      executer(db().from('modeles').update(champs).eq('id', id)),
    onMutate: ({ id, champs }: VariablesMaj<ChampsModele>) =>
      optimiste<Modele>(CLES.modeles, id, (m) => (m ? { ...m, ...champs } : null))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.creerModele, {
    ...communes,
    mutationFn: (nouveau: NouveauModele) => executer(db().from('modeles').insert(nouveau)),
    onMutate: (nouveau: NouveauModele) =>
      optimiste<Modele>(CLES.modeles, nouveau.id, () => ({
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...nouveau,
      }))(),
    onError: annuler,
    onSettled: recharger,
  })
}

// Les identifiants sont créés dans le navigateur : une embarcation ajoutée
// hors ligne a donc déjà son id définitif avant d'atteindre la base.
export type NouvelleEmbarcation = Pick<Embarcation, 'id' | 'modele_id'> &
  Partial<Pick<Embarcation, 'entreprise_utilisation' | 'notes'>>
export type NouveauModele = Pick<Modele, 'id' | 'type' | 'nom' | 'prefix_id' | 'bouchon'>

export function useMajEmbarcation() {
  return useMutation<void, Error, VariablesMaj<ChampsEmbarcation>>({ mutationKey: CLES.majEmbarcation })
}
export function useCreerEmbarcation() {
  return useMutation<void, Error, NouvelleEmbarcation>({ mutationKey: CLES.creerEmbarcation })
}
export function useMajModele() {
  return useMutation<void, Error, VariablesMaj<ChampsModele>>({ mutationKey: CLES.majModele })
}
export function useCreerModele() {
  return useMutation<void, Error, NouveauModele>({ mutationKey: CLES.creerModele })
}
