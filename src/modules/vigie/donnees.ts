import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/shell/auth'
import type { Activite, Camp, Changement, LienActivite, Maquette, Photo, Programme, Recherche, Reglages, RequeteIa } from './types'

// Module en ligne seulement (comme Mastertimeline) : sans réseau, une
// modification échoue tout de suite (networkMode « always »).

export const S = 'vigie'
const db = () => supabase.schema(S)

export const useEcriture = () => useAuth().peutEcrire('vigie')

export const useCamps = () => useListe<Camp>(S, 'camps', 'nom')
export const useProgrammes = () => useListe<Programme>(S, 'programmes', 'nom')
export const useActivites = () => useListe<Activite>(S, 'activites', 'nom')
export const useLiens = () => useListe<LienActivite>(S, 'camps_activites', 'created_at')
export const usePhotos = () => useListe<Photo>(S, 'photos', 'created_at')
export const useMaquettes = () => useListe<Maquette>(S, 'maquettes', 'genere_le')

/** Recharge les requêtes [S, table, …] à chaque changement fait ailleurs. */
function useTempsReel(table: string) {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`${S}.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: S, table }, () => client.invalidateQueries({ queryKey: [S, table] }))
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [table, client])
}

/** Changements à valider (tous camps). */
export function useAValider() {
  useTempsReel('changements')
  return useQuery({
    queryKey: [S, 'changements', 'a_valider'],
    queryFn: async () => {
      const { data, error } = await db().from('changements').select('*').eq('statut', 'a_valider').order('detecte_le', { ascending: false })
      if (error) throw error
      return data as Changement[]
    },
  })
}

/** Historique des changements d'un camp. */
export function useChangementsCamp(campId: string) {
  useTempsReel('changements')
  return useQuery({
    queryKey: [S, 'changements', 'camp', campId],
    queryFn: async () => {
      const { data, error } = await db().from('changements').select('*').eq('camp_id', campId).order('detecte_le', { ascending: false }).limit(200)
      if (error) throw error
      return data as Changement[]
    },
  })
}

export function useRecherches() {
  useTempsReel('recherches')
  return useQuery({
    queryKey: [S, 'recherches'],
    queryFn: async () => {
      const { data, error } = await db()
        .from('recherches')
        .select('id, type, statut, debut, fin, camps_verifies, changements_detectes, changements_prix, camps_proposes, erreurs, cout_usd, resume, courriel_envoye_le, erreur')
        .order('debut', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as Recherche[]
    },
  })
}

export async function lireRapport(id: string) {
  const { data, error } = await db().from('recherches').select('rapport_html').eq('id', id).single()
  if (error) throw error
  return (data as { rapport_html: string | null }).rapport_html
}

/** Requêtes à Claude en cours, et les erreurs des 45 derniers jours. */
export function useRequetes() {
  useTempsReel('requetes_ia')
  return useQuery({
    queryKey: [S, 'requetes_ia'],
    queryFn: async () => {
      const depuis = new Date(Date.now() - 45 * 864e5).toISOString()
      const { data, error } = await db()
        .from('requetes_ia')
        .select('id, recherche_id, type, camp_id, activite_id, statut, tentatives, cout_usd, erreur, created_at, updated_at')
        .or(`statut.in.(en_attente,soumise),and(statut.eq.erreur,created_at.gte.${depuis})`)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return data as RequeteIa[]
    },
  })
}

export function useReglages() {
  useTempsReel('parametres')
  return useQuery({
    queryKey: [S, 'parametres'],
    queryFn: async () => {
      const { data, error } = await db().from('parametres').select('valeur').eq('cle', 'reglages').single()
      if (error) throw error
      return (data as { valeur: Reglages }).valeur
    },
  })
}

export function useEnregistrerReglages() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, 'parametres'],
    networkMode: 'always',
    mutationFn: async (valeur: Reglages) => {
      const { error } = await db().from('parametres').update({ valeur }).eq('cle', 'reglages')
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, 'parametres'] }),
  })
}

type Table = 'camps' | 'programmes' | 'activites' | 'camps_activites' | 'photos'

/**
 * Ajoute, modifie ou supprime une ligne. Erreurs dans le bandeau du module
 * (clé [vigie, table]) ; la liste est mise à jour d'avance et remise en
 * place si la base refuse.
 */
export function useModifier<T extends { id?: string }>(table: Table) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, table],
    networkMode: 'always',
    mutationFn: async ({ id, supprimer, ...reste }: Partial<T> & { supprimer?: boolean }) => {
      const valeurs = reste as Record<string, unknown>
      const requete = supprimer
        ? db().from(table).delete().eq('id', id!)
        : id
          ? db().from(table).update(valeurs).eq('id', id)
          : db().from(table).insert(valeurs)
      const { error } = await requete
      if (error) throw error
    },
    onMutate: async ({ id, supprimer, ...valeurs }) => {
      if (!id) return
      await client.cancelQueries({ queryKey: [S, table] })
      const avant = client.getQueryData<T[]>([S, table])
      client.setQueryData<T[]>([S, table], (liste = []) =>
        supprimer ? liste.filter((l) => l.id !== id) : liste.map((l) => (l.id === id ? { ...l, ...valeurs } : l)),
      )
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.avant) client.setQueryData([S, table], ctx.avant)
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, table] }),
  })
}

/** Lier ou délier une activité d'un camp. */
export function useLier() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, 'camps_activites'],
    networkMode: 'always',
    mutationFn: async ({ camp_id, activite_id, lier }: { camp_id: string; activite_id: string; lier: boolean }) => {
      const { error } = lier
        ? await db().from('camps_activites').upsert({ camp_id, activite_id, source: 'manuel' }, { onConflict: 'camp_id,activite_id', ignoreDuplicates: true })
        : await db().from('camps_activites').delete().eq('camp_id', camp_id).eq('activite_id', activite_id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, 'camps_activites'] }),
  })
}

/** Réveille la fonction Edge (envoi immédiat des requêtes en attente). */
export function reveiller() {
  supabase.functions.invoke('vigie', { body: { action: 'tic' } }).catch(() => {
    /* pg_cron prendra le relais dans 10 minutes */
  })
}

export function useValider() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, 'valider'],
    networkMode: 'always',
    mutationFn: async ({ id, accepter }: { id: string; accepter: boolean }) => {
      const { error } = await db().rpc('valider_changement', { p_id: id, p_accepter: accepter })
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      const cle = [S, 'changements', 'a_valider']
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Changement[]>(cle)
      client.setQueryData<Changement[]>(cle, (l = []) => l.filter((c) => c.id !== id))
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.avant) client.setQueryData([S, 'changements', 'a_valider'], ctx.avant)
    },
    onSettled: (_d, _e, { accepter }) => {
      client.invalidateQueries({ queryKey: [S, 'changements'] })
      if (accepter) {
        for (const t of ['programmes', 'camps_activites', 'activites', 'photos']) client.invalidateQueries({ queryKey: [S, t] })
        reveiller()
      }
    },
  })
}

export async function lancer(type: 'mensuelle' | 'decouverte') {
  const { error } = await db().rpc('lancer', { p_type: type })
  if (error) throw error
  reveiller()
}

export async function demander(type: 'couts' | 'maquette', activiteId: string) {
  const { error } = await db().rpc('demander', { p_type: type, p_activite: activiteId })
  if (error) throw error
  reveiller()
}

export async function etatFonction() {
  const { data, error } = await supabase.functions.invoke('vigie', { body: { action: 'etat' } })
  if (error) throw error
  return data as { anthropic: boolean; gmail: boolean }
}

export async function testerCourriel() {
  const { data, error } = await supabase.functions.invoke('vigie', { body: { action: 'tester_courriel' } })
  if (error) {
    // Le message de la fonction est dans le corps de la réponse.
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corps?.erreur ?? error.message)
  }
  return data as { destinataires: string[] }
}

/** Adresse affichable d'une photo (copie dans le stockage, sinon l'originale). */
export function adressePhoto(p: Photo) {
  return p.chemin ? supabase.storage.from('vigie-photos').getPublicUrl(p.chemin).data.publicUrl : p.url
}
export function adresseStockage(chemin: string) {
  return supabase.storage.from('vigie-photos').getPublicUrl(chemin).data.publicUrl
}
