import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { FichierJoint } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import { estErreurReseau } from '@/modules/embarcations/donnees'
import { ordreDisjoncteurs } from './outils'
import type { Batiment, ChampsDisjoncteur, ChampsIncident, ChampsValve, Disjoncteur, Fichier, Incident, Panneau, Valve } from './types'

// ------------------------------------------------------------------
// Fonctionnement hors ligne (comme l'Inventaire, voir CLAUDE.md)
//
// Les panneaux sont au sous-sol : tout se lit sans réseau (cache gardé sur
// l'appareil), et on peut noter un disjoncteur ou une valve sur place.
// Chaque modification est une mutation à clé fixe, définie une fois pour
// toutes sur le QueryClient (avant la restauration du cache), gardée sur
// l'appareil et rejouée au retour du réseau, dans la file « batiments ».
// Une fiche s'enregistre au complet (upsert) : la dernière enregistrée
// l'emporte.
//
// Bâtiments, panneaux, fichiers et incidents : en ligne seulement, erreurs
// sur place (les incidents se lisent quand même sans réseau).
// ------------------------------------------------------------------

const RACINE = 'batiments'
const db = () => supabase.schema('batiments')
const SEAU = 'batiments-fichiers'

export const CLES = {
  batiments: [RACINE, 'batiments'],
  panneaux: [RACINE, 'panneaux'],
  disjoncteurs: [RACINE, 'disjoncteurs'],
  valves: [RACINE, 'valves'],
  fichiers: [RACINE, 'fichiers'],
  incidents: [RACINE, 'incidents'],
  enregistrerDisjoncteur: [RACINE, 'enregistrer-disjoncteur'],
  supprimerDisjoncteur: [RACINE, 'supprimer-disjoncteur'],
  enregistrerValve: [RACINE, 'enregistrer-valve'],
  supprimerValve: [RACINE, 'supprimer-valve'],
} as const

async function executer(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

const lister =
  <T,>(table: string, tri: string) =>
  async () => {
    const { data, error } = await db().from(table).select('*').order(tri).order('id')
    if (error) throw error
    return data as T[]
  }

const useBatiments = () => useQuery({ queryKey: CLES.batiments, queryFn: lister<Batiment>('batiments', 'ordre') })
const usePanneaux = () => useQuery({ queryKey: CLES.panneaux, queryFn: lister<Panneau>('panneaux', 'ordre') })
const useDisjoncteurs = () => useQuery({ queryKey: CLES.disjoncteurs, queryFn: lister<Disjoncteur>('disjoncteurs', 'position') })
const useValves = () => useQuery({ queryKey: CLES.valves, queryFn: lister<Valve>('valves', 'ordre') })
const useFichiers = () => useQuery({ queryKey: CLES.fichiers, queryFn: lister<Fichier>('fichiers', 'created_at') })
const useIncidents = () => useQuery({ queryKey: CLES.incidents, queryFn: lister<Incident>('incidents', 'survenu_le') })

/** Recharge le module quand quelqu'un d'autre modifie quelque chose. */
export function useTempsReel() {
  const client = useQueryClient()
  useEffect(() => {
    const recharger = () => {
      // Pas pendant un envoi : on écraserait l'affichage optimiste. La fin
      // de l'envoi recharge de toute façon.
      if (client.isMutating({ mutationKey: [RACINE] }) === 0) client.invalidateQueries({ queryKey: [RACINE] })
    }
    let canal = supabase.channel(`batiments-${crypto.randomUUID()}`)
    for (const table of ['batiments', 'panneaux', 'disjoncteurs', 'valves', 'fichiers', 'incidents']) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'batiments', table }, recharger)
    }
    canal.subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

const parId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]))

/** Tout ce qu'affiche le module, indexé. */
export function useDonnees() {
  const batiments = useBatiments().data
  const panneaux = usePanneaux().data
  const disjoncteurs = useDisjoncteurs().data
  const valves = useValves().data
  const fichiers = useFichiers().data
  const incidents = useIncidents().data
  const erreur = useQueryClient()
    .getQueryCache()
    .findAll({ queryKey: [RACINE] })
    .find((q) => q.state.error && q.state.data === undefined)?.state.error
  const donnees = useMemo(() => {
    const b = batiments ?? []
    const p = panneaux ?? []
    // Une copie gardée sur l'appareil peut dater d'avant une colonne : `alimente` toujours une liste.
    const d = (disjoncteurs ?? []).map((x) => ({ ...x, alimente: x.alimente ?? [] })).sort(ordreDisjoncteurs)
    const f = fichiers ?? []
    return {
      batiments: b,
      panneaux: p,
      disjoncteurs: d,
      valves: valves ?? [],
      batiment: parId(b),
      panneau: parId(p),
      disjoncteur: parId(d),
      /** Disjoncteurs d'un panneau, par emplacement. */
      duPanneau: (id: string) => d.filter((x) => x.panneau_id === id),
      /** Photos et PDF d'un panneau, d'une valve ou d'un incident. */
      fichiersDe: (id: string) => f.filter((x) => x.panneau_id === id || x.valve_id === id || x.incident_id === id),
      /** Le plus récent d'abord. */
      incidents: [...(incidents ?? [])].reverse(),
      // Pas dans `pret` : une copie d'avant les incidents doit encore ouvrir
      // les panneaux sans réseau (sous-sols).
      incidentsPrets: !!incidents,
      pret: !!(batiments && panneaux && disjoncteurs && valves && fichiers),
    }
  }, [batiments, panneaux, disjoncteurs, valves, fichiers, incidents])
  return useMemo(() => ({ ...donnees, erreur: erreur ?? null }), [donnees, erreur])
}

export type Donnees = ReturnType<typeof useDonnees>

/** Panneaux et valves rangés par bâtiment (ordre des Réglages ; sans bâtiment à la fin). */
export function parBatiment<T extends { batiment_id: string | null }>(d: Donnees, liste: T[]) {
  const groupes = d.batiments.map((b) => ({ batiment: b as Batiment | null, elements: liste.filter((x) => x.batiment_id === b.id) }))
  const sans = liste.filter((x) => !x.batiment_id || !d.batiment.has(x.batiment_id))
  return [...groupes, { batiment: null, elements: sans }].filter((g) => g.elements.length)
}

// ------------------------------------------------------------------
// État de la synchronisation
// ------------------------------------------------------------------

/** Nombre de modifications pas encore confirmées par la base. */
export function useModificationsEnAttente() {
  return useMutationState({ filters: { mutationKey: [RACINE], status: 'pending' }, select: (m) => m.mutationId }).length
}

// ------------------------------------------------------------------
// Modifications hors ligne : disjoncteurs et valves
// ------------------------------------------------------------------

export function enregistrerMutationsBatiments(client: QueryClient) {
  const communes = {
    retry: (essais: number, erreur: unknown) => estErreurReseau(erreur) && essais < 1000,
    retryDelay: (essais: number) => Math.min(1000 * 2 ** essais, 30_000),
    scope: { id: RACINE },
  }
  function recharger() {
    if (client.isMutating({ mutationKey: [RACINE] }) <= 1) client.invalidateQueries({ queryKey: [RACINE] })
  }

  // Mise à jour optimiste d'une ligne ; le contexte ne garde que la ligne
  // d'avant (voir Embarcations).
  function fiche<T extends { id: string; created_at: string; updated_at: string }, C extends { id: string }>(
    table: 'disjoncteurs' | 'valves',
    cles: { enregistrer: readonly string[]; supprimer: readonly string[] },
  ) {
    const cle = [RACINE, table]
    interface Contexte {
      id: string
      avant: T | null
    }
    function remplacer(liste: T[], id: string, ligne: T | null): T[] {
      const sans = liste.filter((l) => l.id !== id)
      if (!ligne) return sans
      return liste.some((l) => l.id === id) ? liste.map((l) => (l.id === id ? ligne : l)) : [...sans, ligne]
    }
    async function optimiste(id: string, apres: (avant: T | null) => T | null): Promise<Contexte> {
      await client.cancelQueries({ queryKey: cle })
      const liste = client.getQueryData<T[]>(cle) ?? []
      const avant = liste.find((l) => l.id === id) ?? null
      client.setQueryData<T[]>(cle, remplacer(liste, id, apres(avant)))
      return { id, avant }
    }
    function annuler(_e: unknown, _v: unknown, ctx: Contexte | undefined) {
      if (ctx) client.setQueryData<T[]>(cle, (liste = []) => remplacer(liste, ctx.id, ctx.avant))
    }
    const maintenant = () => new Date().toISOString()

    client.setMutationDefaults<void, Error, C, Contexte>(cles.enregistrer, {
      ...communes,
      mutationFn: (champs) => executer(db().from(table).upsert(champs)),
      onMutate: (champs) =>
        optimiste(champs.id, (avant) => ({ created_at: maintenant(), ...avant, ...champs, updated_at: maintenant() }) as unknown as T),
      onError: annuler,
      onSettled: recharger,
    })
    client.setMutationDefaults<void, Error, string, Contexte>(cles.supprimer, {
      ...communes,
      mutationFn: (id) => executer(db().from(table).delete().eq('id', id)),
      onMutate: (id) => optimiste(id, () => null),
      onError: annuler,
      onSettled: recharger,
    })
  }

  fiche<Disjoncteur, ChampsDisjoncteur>('disjoncteurs', { enregistrer: CLES.enregistrerDisjoncteur, supprimer: CLES.supprimerDisjoncteur })
  fiche<Valve, ChampsValve>('valves', { enregistrer: CLES.enregistrerValve, supprimer: CLES.supprimerValve })
}

export const useEnregistrerDisjoncteur = () => useMutation<void, Error, ChampsDisjoncteur>({ mutationKey: CLES.enregistrerDisjoncteur })
export const useSupprimerDisjoncteur = () => useMutation<void, Error, string>({ mutationKey: CLES.supprimerDisjoncteur })
export const useEnregistrerValve = () => useMutation<void, Error, ChampsValve>({ mutationKey: CLES.enregistrerValve })
export const useSupprimerValve = () => useMutation<void, Error, string>({ mutationKey: CLES.supprimerValve })

// ------------------------------------------------------------------
// En ligne seulement : bâtiments, panneaux, fichiers
// ------------------------------------------------------------------

type TableListe = 'batiments' | 'panneaux'

/** Ajoute ou modifie un bâtiment ou un panneau (selon la présence d'un id). */
export async function enregistrerListe(table: TableListe, ligne: { id?: string } & Record<string, unknown>) {
  const { id, ...champs } = ligne
  await executer(id ? db().from(table).update(champs).eq('id', id) : db().from(table).insert(champs))
}

/** Ajoute une ligne dont l'id est choisi d'avance (pour l'ouvrir aussitôt). */
export async function creerLigne(table: TableListe, ligne: { id: string } & Record<string, unknown>) {
  await executer(db().from(table).insert(ligne))
}

/** Change l'ordre d'une liste : chaque ligne reçoit sa position. */
export async function ordonner(table: TableListe, ids: string[]) {
  await Promise.all(ids.map((id, i) => executer(db().from(table).update({ ordre: i + 1 }).eq('id', id))))
}

export async function supprimerBatiment(id: string) {
  await executer(db().from('batiments').delete().eq('id', id))
}

/** Supprime un panneau, ses disjoncteurs et ses fichiers (cascade), puis les fichiers du seau. */
export async function supprimerPanneau(id: string) {
  const fichiers = await db().from('fichiers').select('chemin').eq('panneau_id', id)
  if (fichiers.error) throw fichiers.error
  await executer(db().from('panneaux').delete().eq('id', id))
  if (fichiers.data.length) await supabase.storage.from(SEAU).remove(fichiers.data.map((f) => f.chemin))
}

/** Supprime une valve en ligne, avec ses fichiers (une valve sans fichier passe par la file hors ligne). */
export async function supprimerValveEtFichiers(v: Pick<Valve, 'id'>, fichiers: Fichier[]) {
  await executer(db().from('valves').delete().eq('id', v.id))
  if (fichiers.length) await supabase.storage.from(SEAU).remove(fichiers.map((f) => f.chemin))
}

/** Après une modification en ligne : relit le module. */
export function useRelire() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [RACINE] })
}

/** Durée d'une adresse signée ; relue avant d'expirer. */
const DUREE_ADRESSE = 3600

/** Adresse signée d'un fichier (jamais gardée sur l'appareil : voir requetes.ts). */
export function useAdresseFichier(f: Pick<Fichier, 'chemin'>) {
  return (
    useQuery({
      queryKey: ['batiments-adresses', f.chemin],
      queryFn: async () => {
        const { data, error } = await supabase.storage.from(SEAU).createSignedUrl(f.chemin, DUREE_ADRESSE)
        if (error) throw error
        return data.signedUrl
      },
      staleTime: (DUREE_ADRESSE - 600) * 1000,
      refetchInterval: (DUREE_ADRESSE - 600) * 1000,
    }).data ?? null
  )
}

export type CibleFichier = { panneau_id: string } | { valve_id: string } | { incident_id: string }

/** Envoie une photo (déjà réduite) ou un PDF, puis l'inscrit sur son panneau, sa valve ou son incident. */
export async function ajouterFichier(cible: CibleFichier, { fichier, extension, nom }: FichierJoint) {
  const id = crypto.randomUUID()
  const chemin = `${Object.values(cible)[0]}/${id}.${extension}`
  const envoi = await supabase.storage.from(SEAU).upload(chemin, fichier, { contentType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg' })
  if (envoi.error) throw envoi.error
  const { error } = await db()
    .from('fichiers')
    .insert({ id, ...cible, chemin, nom })
  if (error) {
    await supabase.storage.from(SEAU).remove([chemin])
    throw error
  }
}

export async function retirerFichier(f: Pick<Fichier, 'id' | 'chemin'>) {
  await executer(db().from('fichiers').delete().eq('id', f.id))
  await supabase.storage.from(SEAU).remove([f.chemin])
}

// ------------------------------------------------------------------
// Incidents (en ligne seulement)
// ------------------------------------------------------------------

/** Ajoute ou modifie un rapport au complet. */
export async function enregistrerIncident(champs: ChampsIncident) {
  await executer(db().from('incidents').upsert(champs))
}

/** Supprime un rapport, ses fichiers (cascade) et ceux du seau. Sa tâche dans Travaux reste. */
export async function supprimerIncident(id: string, fichiers: Fichier[]) {
  await executer(db().from('incidents').delete().eq('id', id))
  if (fichiers.length) await supabase.storage.from(SEAU).remove(fichiers.map((f) => f.chemin))
}

/** Tâche de Travaux reliée à un rapport (titre et statut ; rien sans accès à Travaux). */
export interface TacheTravaux {
  id: string
  titre: string
  statut: 'a_trier' | 'a_faire' | 'terminee'
}

/** Tâches de Travaux des rapports, par id. */
export function useTachesTravaux(ids: string[], actif: boolean) {
  const tries = [...new Set(ids)].sort()
  const { data } = useQuery({
    queryKey: [RACINE, 'taches-travaux', tries],
    enabled: actif && tries.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.schema('travaux').from('taches').select('id, titre, statut').in('id', tries)
      if (error) throw error
      return data as TacheTravaux[]
    },
  })
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data])
}

/** Lieux de Travaux, pour la tâche de réparation. */
export function useLieuxTravaux() {
  return useQuery({
    queryKey: [RACINE, 'lieux-travaux'],
    queryFn: async () => {
      const { data, error } = await supabase.schema('travaux').from('lieux').select('id, nom').order('ordre')
      if (error) throw error
      return data as { id: string; nom: string }[]
    },
  }).data
}

export interface NouvelleTacheTravaux {
  incident: string
  titre: string
  description: string
  lieu: string | null
  priorite: 1 | 2 | 3
}

/** Crée la tâche de réparation dans Travaux et la relie au rapport (une transaction). */
export function useCreerTacheTravaux() {
  const client = useQueryClient()
  return async (t: NouvelleTacheTravaux) => {
    const { error } = await db().rpc('creer_tache', {
      p_incident: t.incident,
      p_titre: t.titre,
      p_description: t.description,
      p_lieu: t.lieu,
      p_priorite: t.priorite,
    })
    if (error) throw error
    await Promise.all([client.invalidateQueries({ queryKey: [RACINE] }), client.invalidateQueries({ queryKey: ['travaux'] })])
  }
}
