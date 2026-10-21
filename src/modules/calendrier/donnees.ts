import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useAuth } from '@/shell/auth'
import { supabase, type Schema } from '@/lib/supabase'
import { sejourDe, type LigneReservation } from './sejours'
import type { EntreeJournal, Evenement, Personne, PresenceJour, PresenceSimple, StatutPresence } from './types'

// Module en ligne seulement (comme Mastertimeline et Cuisine) : mutations
// networkMode « always », erreurs dans le bandeau du module (racine S).
// Rien n'est effacé : « supprimer » pose deleted_at (la base refuse DELETE).

const S = 'calendrier'
const db = () => supabase.schema(S)

export const useEcriture = () => useAuth().peutEcrire(S)

/** Recharge les requêtes `cles` à chaque changement de la table, fait ailleurs ou ici. */
function useTempsReel(schema: Schema, table: string, cles: unknown[][], actif = true) {
  const client = useQueryClient()
  const cle = JSON.stringify(cles)
  useEffect(() => {
    if (!actif) return
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
  }, [schema, table, cle, client, actif])
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

/** Une seule lecture, personnes retirées comprises ; chaque hook en tire ce qu'il montre. */
function usePersonnelLu<T>(select: (liste: Personne[]) => T) {
  useTempsReel(S, 'personnel', [[S, 'personnel'], [S, 'presence']])
  return useQuery({
    queryKey: [S, 'personnel'],
    queryFn: () => toutLire<Personne>((a, b) => db().from('personnel').select('*').order('ordre').order('nom').range(a, b)),
    select,
  })
}

const sansRetirees = (liste: Personne[]) => liste.filter((p) => !p.deleted_at)
const nomsDe = (liste: Personne[]) => new Map(liste.map((p) => [p.id, p.nom]))

/** Tout le personnel (y compris inactif) ; jamais les personnes retirées. */
export const usePersonnel = () => usePersonnelLu(sansRetirees)

/**
 * Nom de chaque personne, retirées comprises : leurs présences passées
 * restent dans la grille et le journal (Réglages › Personnel › Retirer).
 */
export const useNomsPersonnel = () => usePersonnelLu(nomsDe)

/**
 * La personne du Calendrier liée au compte connecté (son courriel, réglé
 * dans Réglages › Personnel), sinon null : « + » la choisit d'office.
 */
export function useMoi(personnel: Personne[] | undefined): Personne | null {
  const { profil } = useAuth()
  const courriel = profil?.courriel?.trim().toLowerCase()
  return useMemo(() => (courriel && personnel?.find((p) => p.courriel === courriel)) || null, [courriel, personnel])
}

/** Équipe de cuisine (Réglages : « Aussi à l'horaire de cuisine »), pour qui lit Cuisine. */
export function usePersonnelCuisine(actif: boolean) {
  return useQuery({
    queryKey: [S, 'personnel-cuisine'],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await supabase.schema('commande').from('personnel').select('id, nom, actif').order('nom')
      if (error) throw error
      return data as { id: string; nom: string; actif: boolean }[]
    },
  })
}

/** Journée (Direction) d'une personne liée à l'horaire de cuisine ; `date` null = aucune dans la plage. */
export interface JourneeLiee {
  personne_cuisine_id: string
  personnel_id: string
  nom: string
  date: string | null
  statut: StatutPresence | null
  description: string | null
}

/**
 * Cuisine › Horaire : journées, lues dans le Calendrier, des personnes de
 * la direction aussi à l'horaire de cuisine (Frédérique) — jamais recopiées
 * dans commande.quarts. Pour qui lit Cuisine ou le Calendrier.
 */
export function useHoraireCuisineLie(debut: string, fin: string, actif = true) {
  const { peutLire } = useAuth()
  // Temps réel : seulement pour qui lit le Calendrier (la RLS de ces tables).
  const tempsReel = actif && peutLire(S)
  useTempsReel(S, 'presences_simples', [[S, 'horaire-cuisine-lie']], tempsReel)
  useTempsReel(S, 'personnel', [[S, 'horaire-cuisine-lie']], tempsReel)
  return useQuery({
    queryKey: [S, 'horaire-cuisine-lie', debut, fin],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await db().rpc('horaire_cuisine_lie', { p_debut: debut, p_fin: fin })
      if (error) throw error
      return (data ?? []) as JourneeLiee[]
    },
  })
}

/**
 * Séjours = réservations du module Réservations, toutes années (quelques
 * centaines par année), sauf perdues et annulées : lues par
 * calendrier.reservations(), même sans accès au module Réservations. En
 * direct : la base ajoute une ligne à signal_reservations à chaque changement.
 */
export function useSejours() {
  // Pas [S, 'sejours'] : la copie d'Airtable gardée sur l'appareil n'a pas cette forme.
  useTempsReel(S, 'signal_reservations', [[S, 'reservations']])
  return useQuery({
    queryKey: [S, 'reservations'],
    queryFn: async () =>
      (await toutLire<LigneReservation>((a, b) => db().rpc('reservations').order('date_arrivee').order('id').range(a, b))).map(sejourDe),
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
  if (table !== 'evenements') {
    client.invalidateQueries({ queryKey: [S, 'presence'] })
    client.invalidateQueries({ queryKey: [S, 'horaire-cuisine-lie'] })
  }
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
 * décochée garde sa ligne (deleted_at) : la recocher la réactive, sans
 * son ancienne note (une présence neuve).
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
      else if (p.present) {
        // Recochée : rien de la présence d'avant (note, choix) ne revient.
        valeurs.description = null
        valeurs.statut = null
      }
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
            description: p.description !== undefined ? p.description : null,
            statut: p.description !== undefined ? (existante?.statut ?? null) : null,
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

/** Une présence écrite au complet par un lot (choix rapide, plusieurs jours, Annuler). */
export interface LignePresence {
  personnel_id: string
  date: string
  secteur: 'direction' | 'terrain'
  /** false : retirée (deleted_at posé, la ligne reste dans l'historique). */
  present: boolean
  statut: StatutPresence | null
  description: string | null
}

const memePresence = (a: { personnel_id: string; date: string; secteur: string }, b: typeof a) =>
  a.personnel_id === b.personnel_id && a.date === b.date && a.secteur === b.secteur

/**
 * Écrit d'un coup les présences d'une personne sur un ou plusieurs jours
 * (choix rapide de la rangée Direction, jours glissés, Annuler) : un seul
 * upsert, chaque ligne au complet (présence, statut, note). Affichage mis à
 * jour d'avance sur la plage affichée, remis en place si la base refuse.
 */
export function usePresencesLot(debut: string, fin: string) {
  const client = useQueryClient()
  const cle = [S, 'presences_simples', debut, fin]
  return useMutation({
    mutationKey: [S, 'presences_simples', 'lot'],
    networkMode: 'always',
    mutationFn: async (lignes: LignePresence[]) => {
      if (!lignes.length) return
      const retiree = new Date().toISOString()
      const { error } = await db()
        .from('presences_simples')
        .upsert(
          lignes.map((l) => ({
            personnel_id: l.personnel_id,
            date: l.date,
            secteur: l.secteur,
            statut: l.statut,
            description: l.description,
            deleted_at: l.present ? null : retiree,
          })),
          { onConflict: 'personnel_id,date,secteur' },
        )
      if (error) throw error
    },
    onMutate: async (lignes) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<PresenceSimple[]>(cle)
      client.setQueryData<PresenceSimple[]>(cle, (liste = []) => {
        let suite = liste
        for (const l of lignes) {
          const existante = suite.find((x) => memePresence(x, l))
          suite = suite.filter((x) => x !== existante)
          if (l.present)
            suite = [
              ...suite,
              {
                id: existante?.id ?? crypto.randomUUID(),
                personnel_id: l.personnel_id,
                date: l.date,
                secteur: l.secteur,
                statut: l.statut,
                description: l.description,
                updated_by: null,
                updated_at: new Date().toISOString(),
                deleted_at: null,
              },
            ]
        }
        return suite
      })
      return { avant }
    },
    onError: (_e, _l, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: [S, 'presences_simples'] })
      client.invalidateQueries({ queryKey: [S, 'presence'] })
      client.invalidateQueries({ queryKey: [S, 'horaire-cuisine-lie'] })
    },
  })
}
