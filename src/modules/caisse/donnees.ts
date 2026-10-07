import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Entreprise, Poche, Transaction } from './types'

// Module en ligne seulement (networkMode « always ») et jamais gardé sur
// l'appareil (requêtes ['caisse', …] exclues de la persistance). Les
// fenêtres affichent leurs erreurs sur place (racine « caisse-local ») ;
// le reste va dans le bandeau du module (racine « caisse »).

const cle = ['caisse', 'transactions']
const db = () => supabase.schema('caisse')

/** Toutes les transactions (lues par tranches de 1000), rechargées à chaque changement fait ailleurs. */
export function useTransactions() {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`caisse.transactions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'caisse', table: 'transactions' }, () => client.invalidateQueries({ queryKey: cle }))
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])

  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const lignes: Transaction[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from('transactions').select('*').order('jour').order('created_at').order('id').range(debut, debut + 999)
        if (error) throw error
        // numeric arrive en texte ou en nombre selon le pilote : toujours un nombre ici.
        lignes.push(...(data as Transaction[]).map((t) => ({ ...t, montant: Number(t.montant) })))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export const usePoches = () => useListe<Poche>('caisse', 'poches', 'nom')
export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')

/** Compagnies dont chaque ligne dit Québec ou International (Opikawa). */
export function useCompagniesQcInt() {
  return useQuery({
    queryKey: ['caisse', 'compagnies_qc_int'],
    queryFn: async () => {
      const { data, error } = await db().from('compagnies_qc_int').select('entreprise_id')
      if (error) throw error
      return new Set((data as { entreprise_id: string }[]).map((c) => c.entreprise_id))
    },
  })
}

/** Champs qu'on envoie (l'auteur et les dates sont posés par la base). */
export type LigneAEnvoyer = Pick<
  Transaction,
  'id' | 'jour' | 'entreprise_id' | 'poche_id' | 'region' | 'sens' | 'montant' | 'details' | 'avance_id'
>

/**
 * Ajoute ou modifie une ou deux lignes (les deux lignes d'une avance) en un
 * seul envoi : la base les accepte ou les refuse ensemble.
 */
export function useEnregistrerLignes() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['caisse-local', 'enregistrer'],
    networkMode: 'always',
    mutationFn: async (lignes: LigneAEnvoyer[]) => {
      const { error } = await db().from('transactions').upsert(lignes)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Supprime une ligne, ou les deux lignes d'une avance. */
export function useSupprimerLignes() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['caisse-local', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (t: Pick<Transaction, 'id' | 'avance_id'>) => {
      const requete = db().from('transactions').delete()
      const { error } = await (t.avance_id ? requete.eq('avance_id', t.avance_id) : requete.eq('id', t.id))
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Crée la poche personnelle d'un compte (première avance payée de sa poche). */
export function useCreerPoche() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['caisse-local', 'poche'],
    networkMode: 'always',
    mutationFn: async (poche: Poche) => {
      const { error } = await db().from('poches').insert(poche)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['caisse', 'poches'] }),
  })
}

/** Rembourse une poche personnelle : l'argent sort de la caisse, la poche revient à 0. */
export function useRembourser() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['caisse', 'rembourser'],
    networkMode: 'always',
    mutationFn: async ({ poche, montant, jour }: { poche: Poche; montant: number; jour: string }) => {
      const { error } = await db().from('transactions').insert({
        jour,
        poche_id: poche.id,
        sens: 'sortie',
        montant,
        details: 'Remboursement',
      })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}
