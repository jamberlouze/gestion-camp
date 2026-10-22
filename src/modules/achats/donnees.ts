import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useListe, usePersonnesModule } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { aCommanderBientot, HORIZON_JOURS, jourAujourdhui } from './outils'
import type { Achat, Entreprise, Fournisseur } from './types'

// Module en ligne seulement : sans réseau, une modification échoue tout de
// suite (networkMode « always ») au lieu d'attendre dans le cache de
// l'appareil. Affichage mis à jour d'avance ; si la base refuse, la ligne
// d'avant revient et le bandeau du module (racine « achats ») l'explique.

const cle = ['achats', 'achats']
const table = () => supabase.schema('achats').from('achats')

export const useAchats = () => useListe<Achat>('achats', 'achats', 'created_at')
/** Entreprises et fournisseurs : ceux de Mastertimeline (modifiés là-bas). */
export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')
export const useFournisseurs = () => useListe<Fournisseur>('mastertimeline', 'fournisseurs', 'nom')
/** Les comptes de l'app ; ne se choisit qu'un compte qui écrit dans Achats (`peut_assigner`). */
export const useResponsables = () => usePersonnesModule('achats')

/** Adresse du module filtrée sur les achats à commander bientôt (compteur du haut). */
export const LIEN_A_COMMANDER_BIENTOT = '/achats?cible=30'

/**
 * Achats « À commander » à commander bientôt, pour l'en-tête du module et
 * l'accueil : `enRetard` (date cible passée, la plus ancienne d'abord) et
 * `aVenir` (d'aujourd'hui à 30 jours, la plus proche d'abord) ; `nombre` =
 * les deux ensemble. Les achats sans date cible n'y sont jamais. `pret` =
 * faux tant que la liste n'est pas lue. À monter seulement pour qui lit le
 * module (`peutLire('achats')`) ; lien vers la liste filtrée : `lien`.
 */
export function useAchatsACommanderBientot() {
  const { data, error } = useAchats()
  const jour = jourAujourdhui()
  const bientot = useMemo(() => aCommanderBientot(data ?? [], jour, HORIZON_JOURS), [data, jour])
  return { ...bientot, pret: !!data, erreur: error, lien: LIEN_A_COMMANDER_BIENTOT }
}

export function useAjouterAchat() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['achats', 'ajouter'],
    networkMode: 'always',
    mutationFn: async (achat: Achat) => {
      const { id, item, statut, quantite, prix_unitaire, entreprise_id, fournisseur_id, note, date_cible } = achat
      const { error } = await table().insert({ id, item, statut, quantite, prix_unitaire, entreprise_id, fournisseur_id, note, date_cible })
      if (error) throw error
    },
    onMutate: async (achat) => {
      await client.cancelQueries({ queryKey: cle })
      client.setQueryData<Achat[]>(cle, (liste) => [...(liste ?? []), achat])
    },
    onError: (_e, achat) => client.setQueryData<Achat[]>(cle, (liste) => liste?.filter((a) => a.id !== achat.id)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export function useModifierAchat() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['achats', 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Achat> }) => {
      const { error } = await table().update(champs).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Achat[]>(cle)?.find((a) => a.id === id)
      client.setQueryData<Achat[]>(cle, (liste) => liste?.map((a) => (a.id === id ? { ...a, ...champs } : a)))
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<Achat[]>(cle, (liste) => liste?.map((a) => (a.id === avant.id ? avant : a)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export function useSupprimerAchat() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['achats', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await table().delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Achat[]>(cle)?.find((a) => a.id === id)
      client.setQueryData<Achat[]>(cle, (liste) => liste?.filter((a) => a.id !== id))
      return { avant }
    },
    onError: (_e, _id, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<Achat[]>(cle, (liste) => [...(liste ?? []), avant])
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Total estimé d'un achat, ou null s'il manque la quantité ou le prix. */
export const totalAchat = (a: Pick<Achat, 'quantite' | 'prix_unitaire'>) =>
  a.quantite != null && a.prix_unitaire != null ? a.quantite * a.prix_unitaire : null

const formatArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })
export const argent = (n: number) => formatArgent.format(n)

/** « 19,99 », « 19.99 » ou « 19,99 $ » → 19.99 ; vide → null ; illisible → undefined. */
export function lireNombre(texte: string): number | null | undefined {
  const propre = texte.replace(/\s|\$/g, '').replace(',', '.')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? n : undefined
}
