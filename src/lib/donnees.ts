import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase, type Schema } from './supabase'
import { COLONNES_EMPLOYE, type Employe } from './types'

/** Ce que useListe lit : certaines colonnes seulement, ou une fonction qui rend les lignes de la table. */
export interface SourceListe {
  colonnes?: string
  /** Fonction du schéma (security definer) lue à la place de la table, ex. core.employes_complets. */
  rpc?: string
}

/**
 * Lit une table au complet et la garde à jour en temps réel : tout
 * changement fait ailleurs (autre onglet, autre personne) recharge la liste.
 */
export function useListe<T>(schema: Schema, table: string, tri: string, { colonnes = '*', rpc }: SourceListe = {}) {
  const client = useQueryClient()

  useEffect(() => {
    // Nom unique : voir useTempsReel (modules/embarcations/donnees.ts).
    const canal = supabase
      .channel(`${schema}.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema, table }, () =>
        client.invalidateQueries({ queryKey: [schema, table] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [schema, table, client])

  return useQuery({
    // Lue par une fonction : clé à part (autre forme), invalidée avec la table (même début de clé).
    queryKey: rpc ? [schema, table, rpc] : [schema, table],
    queryFn: async () => {
      const db = supabase.schema(schema)
      const { data, error } = await (rpc ? db.rpc(rpc) : db.from(table)).select(colonnes).order(tri)
      if (error) throw error
      return data as T[]
    },
  })
}

/**
 * Employés du référentiel, sans courriel ni matricule (droits par colonne de
 * core.employes : la direction et le RH les lisent par core.employes_complets).
 */
export const useEmployes = () => useListe<Employe>('core', 'employes', 'surnom', { colonnes: COLONNES_EMPLOYE })

/** Ajoute ou modifie une ligne (selon la présence d'un id). */
export function useEnregistrer<T extends { id?: string }>(schema: Schema, table: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (ligne: Partial<T>) => {
      const { id, ...reste } = ligne
      const valeurs = reste as Record<string, unknown>
      const requete = id
        ? supabase.schema(schema).from(table).update(valeurs).eq('id', id)
        : supabase.schema(schema).from(table).insert(valeurs)
      const { error } = await requete
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [schema, table] }),
  })
}

export function useSupprimer(schema: Schema, table: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.schema(schema).from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [schema, table] }),
  })
}

/** Message d'erreur lisible pour l'utilisateur. */
export function messageErreur(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message)
    if (m.includes('duplicate key')) return 'Cette valeur existe déjà.'
    if (m.includes('row-level security') || m.includes('permission denied')) {
      return "Vous n'avez pas la permission de faire cette modification."
    }
    if (m.includes('violates foreign key constraint')) return 'Impossible de supprimer : cet élément est encore utilisé.'
    if (m.includes('Failed to fetch')) return 'Pas de connexion au serveur.'
    return m
  }
  return 'Erreur inconnue.'
}
