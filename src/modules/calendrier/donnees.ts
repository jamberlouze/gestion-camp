import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/shell/auth'
import { supabase, type Schema } from '@/lib/supabase'
import type { EntreeJournal, Evenement, Personne, PresenceJour, PresenceSimple, Sejour, Synchro } from './types'

// Module en ligne seulement (comme Mastertimeline et Cuisine) : mutations
// networkMode « always », erreurs dans le bandeau du module (racine S).
// Rien n'est effacé : « supprimer » pose deleted_at (la base refuse DELETE).

const S = 'calendrier'
const db = () => supabase.schema(S)

export const useEcriture = () => useAuth().peutEcrire(S)

/** Recharge les requêtes `cles` à chaque changement de la table, fait ailleurs ou ici. */
function useTempsReel(schema: Schema, table: string, cles: unknown[][]) {
  const client = useQueryClient()
  const cle = JSON.stringify(cles)
  useEffect(() => {
    // Nom unique : un nom réutilisé au remontage fait planter subscribe().
    const canal = supabase
      .channel(`${schema}.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema, table }, () => {
        for (const c of JSON.parse(cle) as unknown[][]) client.invalidateQueries({ queryKey: c })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [schema, table, cle, client])
}

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

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

/** Tout le personnel (y compris inactif) ; jamais les lignes supprimées. */
export function usePersonnel() {
  useTempsReel(S, 'personnel', [[S, 'personnel'], [S, 'presence']])
  return useQuery({
    queryKey: [S, 'personnel'],
    queryFn: () =>
      toutLire<Personne>((a, b) => db().from('personnel').select('*').is('deleted_at', null).order('ordre').order('nom').range(a, b)),
  })
}

/** Tous les séjours encore présents dans Airtable (quelques centaines par année). */
export function useSejours() {
  useTempsReel(S, 'sejours', [[S, 'sejours'], [S, 'presence']])
  return useQuery({
    queryKey: [S, 'sejours'],
    queryFn: () =>
      toutLire<Sejour>((a, b) =>
        db().from('sejours').select('*').is('deleted_at', null).order('date_arrivee').order('id').range(a, b),
      ),
  })
}

export function useEvenements() {
  useTempsReel(S, 'evenements', [[S, 'evenements']])
  return useQuery({
    queryKey: [S, 'evenements'],
    queryFn: () =>
      toutLire<Evenement>((a, b) => db().from('evenements').select('*').is('deleted_at', null).order('date_debut').order('id').range(a, b)),
  })
}

/** Vue commune (qui travaille, quel secteur, fait quoi) sur une plage de dates. */
export function usePresenceJour(debut: string, fin: string) {
  const cles = [[S, 'presence']]
  useTempsReel(S, 'presences_simples', cles)
  useTempsReel('horaire', 'horaires', cles)
  useTempsReel('commande', 'quarts', cles)
  return useQuery({
    queryKey: [S, 'presence', debut, fin],
    queryFn: () =>
      toutLire<PresenceJour>((a, b) =>
        db().from('v_presence_jour').select('*').gte('date', debut).lte('date', fin).order('date').order('nom').range(a, b),
      ),
  })
}

export function usePresencesSimples(debut: string, fin: string) {
  useTempsReel(S, 'presences_simples', [[S, 'presences_simples']])
  return useQuery({
    queryKey: [S, 'presences_simples', debut, fin],
    queryFn: () =>
      toutLire<PresenceSimple>((a, b) =>
        db().from('presences_simples').select('*').is('deleted_at', null).gte('date', debut).lte('date', fin).order('date').range(a, b),
      ),
  })
}

export function useSynchros() {
  useTempsReel(S, 'synchros', [[S, 'synchros']])
  return useQuery({
    queryKey: [S, 'synchros'],
    queryFn: async () => {
      const { data, error } = await db().from('synchros').select('*').order('debut', { ascending: false }).limit(15)
      if (error) throw error
      return data as Synchro[]
    },
  })
}

/** Journal, du plus récent au plus ancien, par pages de 100. */
export async function lireJournal(avant: number | null, table: string | null) {
  let requete = db().from('journal').select('*').order('id', { ascending: false }).limit(100)
  if (avant) requete = requete.lt('id', avant)
  if (table) requete = requete.eq('table_name', table)
  const { data, error } = await requete
  if (error) throw error
  return data as EntreeJournal[]
}

// ------------------------------------------------------------------
// Écritures
// ------------------------------------------------------------------

type TableModifiable = 'personnel' | 'evenements' | 'presences_simples'

const invalider = (client: ReturnType<typeof useQueryClient>, table: TableModifiable) => {
  client.invalidateQueries({ queryKey: [S, table] })
  if (table !== 'evenements') client.invalidateQueries({ queryKey: [S, 'presence'] })
}

/**
 * Ajoute (sans id) ou modifie (avec id) une ligne. `local` : l'erreur est
 * affichée sur place par l'appelant (clé hors de la racine du bandeau).
 */
export function useEnregistrer<T extends { id?: string }>(table: TableModifiable, local = false) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [local ? `${S}-local` : S, table],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T>) => {
      const { id, ...reste } = ligne as Partial<T> & { id?: string }
      const valeurs = reste as Record<string, unknown>
      const { error } = id ? await db().from(table).update(valeurs).eq('id', id) : await db().from(table).insert(valeurs)
      if (error) throw error
    },
    onSettled: () => invalider(client, table),
  })
}

/** « Supprime » une ligne : deleted_at posé, elle reste dans l'historique. */
export function useRetirer(table: TableModifiable) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, table, 'retirer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSettled: () => invalider(client, table),
  })
}

/**
 * Coche ou décoche une présence simple, ou change sa note. Une case
 * décochée garde sa ligne (deleted_at) : la recocher la réactive.
 * Affichage mis à jour d'avance, remis en place si la base refuse.
 */
export function usePresence(debut: string, fin: string) {
  const client = useQueryClient()
  const cle = [S, 'presences_simples', debut, fin]
  return useMutation({
    mutationKey: [S, 'presences_simples'],
    networkMode: 'always',
    mutationFn: async (p: { personnel_id: string; date: string; secteur: 'direction' | 'terrain'; present: boolean; description?: string | null }) => {
      const valeurs: Record<string, unknown> = {
        personnel_id: p.personnel_id,
        date: p.date,
        secteur: p.secteur,
        deleted_at: p.present ? null : new Date().toISOString(),
      }
      if (p.description !== undefined) valeurs.description = p.description
      const { error } = await db().from('presences_simples').upsert(valeurs, { onConflict: 'personnel_id,date,secteur' })
      if (error) throw error
    },
    onMutate: async (p) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<PresenceSimple[]>(cle)
      client.setQueryData<PresenceSimple[]>(cle, (liste = []) => {
        const existante = liste.find((x) => x.personnel_id === p.personnel_id && x.date === p.date && x.secteur === p.secteur)
        const reste = liste.filter((x) => x !== existante)
        if (!p.present) return reste
        return [
          ...reste,
          {
            id: existante?.id ?? crypto.randomUUID(),
            personnel_id: p.personnel_id,
            date: p.date,
            secteur: p.secteur,
            description: p.description !== undefined ? p.description : (existante?.description ?? null),
            updated_by: null,
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        ]
      })
      return { avant }
    },
    onError: (_e, _p, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: [S, 'presences_simples'] })
      client.invalidateQueries({ queryKey: [S, 'presence'] })
    },
  })
}

// ------------------------------------------------------------------
// Worker (synchro Airtable)
// ------------------------------------------------------------------

/** Appel au Worker (/api/calendrier/…) avec le jeton de la session. */
export async function appelerWorker(chemin: 'etat' | 'synchro', methode: 'GET' | 'POST') {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.')
  const res = await fetch(`/api/calendrier/${chemin}`, { method: methode, headers: { Authorization: `Bearer ${jeton}` } })
  let corps: Record<string, unknown> | null = null
  try {
    corps = await res.json()
  } catch {
    /* pas du JSON */
  }
  if (!res.ok) {
    if (corps?.erreur) throw new Error(String(corps.erreur))
    throw new Error(res.status === 404 ? "Le Worker ne répond pas à cette adresse (l'app est-elle à jour ?)." : `Erreur ${res.status}.`)
  }
  return corps
}
