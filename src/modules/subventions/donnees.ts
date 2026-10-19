import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Entreprise as Compagnie, Profil } from '@/lib/types'
import type { LigneAgenda } from './agenda'
import type {
  CategorieRejet,
  Entreprise,
  Etape,
  Feedback,
  Heures,
  LigneSalaire,
  Note,
  Proposition,
  Recherche,
  Reglage,
  Regles,
  Responsable,
  Subvention,
  Suivi,
} from './types'

// Module en ligne seulement (comme Mastertimeline) : sans réseau, une
// modification échoue tout de suite (networkMode « always ») et s'affiche
// dans le bandeau d'erreurs du module (clés de mutation [S, …]). Une
// fenêtre qui affiche elle-même l'erreur utilise la racine LOCAL, que le
// bandeau ignore (pas d'erreur affichée deux fois).

const S = 'subventions'
const LOCAL = 'subventions-local'
const db = () => supabase.schema(S)

export const useEntreprises = () => useListe<Entreprise>(S, 'grant_companies', 'sort_order')
export const useSubventions = () => useListe<Subvention>(S, 'grants', 'discovered_at')
/** Lignes de suivi : une par compagnie qui dépose une demande. */
export const useSuivis = () => useListe<Suivi>(S, 'grant_applications', 'created_at')
export const useFeedback = () => useListe<Feedback>(S, 'grant_feedback', 'decided_at')
export const useNotes = () => useListe<Note>(S, 'grant_notes', 'created_at')
export const useHeures = () => useListe<Heures>(S, 'grant_time_entries', 'entry_date')
export const useEtapes = () => useListe<Etape>(S, 'grant_reporting_steps', 'sort_order')
export const useRecherches = () => useListe<Recherche>(S, 'grant_search_runs', 'started_at')
export const useRegles = () => useListe<Regles>(S, 'grant_learned_rules', 'generated_at')
export const useReglages = () => useListe<Reglage>(S, 'grant_settings', 'key')
export const usePropositions = () => useListe<Proposition>(S, 'grant_proposals', 'created_at')
/** Ce que le Worker a écrit dans l'agenda Google « Subventions ». */
export const useEvenementsAgenda = () => useListe<LigneAgenda>(S, 'grant_calendar_events', 'event_key')
/** Personnes qu'on peut nommer responsables d'une demande (comptes qui écrivent dans Subventions). */
export function useResponsables() {
  return useQuery({
    queryKey: [S, 'responsables'],
    queryFn: async () => {
      const { data, error } = await db().rpc('responsables')
      if (error) throw error
      return data as Responsable[]
    },
  })
}
/** Référentiel Employés (attribution salariale). */
export { useEmployes } from '@/lib/donnees'
/** Noms des personnes (notes, heures, décisions) : la direction voit tous les profils. */
export const useProfils = () => useListe<Profil>('core', 'profils', 'courriel')

type Table = 'grants' | 'grant_applications' | 'grant_companies' | 'grant_notes' | 'grant_time_entries' | 'grant_reporting_steps'

export interface CompagnieCarte {
  id: string
  nom: string
  couleur: string | null
  abreviation: string | null
  ordre: number
}

/**
 * Compagnie du référentiel de chaque entreprise de recherche (nom, couleur
 * et abréviation de son étiquette), et tri dans l'ordre des Réglages.
 */
export function useCompagnies() {
  const entreprises = useEntreprises().data
  const compagnies = useListe<Compagnie>('core', 'entreprises', 'ordre').data
  return useMemo(() => {
    const parId = new Map<string, CompagnieCarte>(
      (entreprises ?? []).map((e) => {
        const c = compagnies?.find((x) => x.id === e.entreprise_id)
        return [e.id, { id: e.id, nom: c?.nom ?? e.name, couleur: c?.couleur ?? null, abreviation: c?.abreviation ?? null, ordre: e.sort_order }]
      }),
    )
    const de = (id: string): CompagnieCarte => parId.get(id) ?? { id, nom: '—', couleur: null, abreviation: null, ordre: 999 }
    const trier = (ids: string[]) => [...ids].sort((a, b) => de(a).ordre - de(b).ordre || de(a).nom.localeCompare(de(b).nom, 'fr'))
    return { de, trier }
  }, [entreprises, compagnies])
}

/** Ajoute (sans id) ou modifie (avec id) une ligne ; renvoie la ligne enregistrée. */
export function useEnregistrer<T extends { id: string }>(table: Table, { erreurSurPlace = false } = {}) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [erreurSurPlace ? LOCAL : S, table],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T>) => {
      const { id, ...reste } = ligne
      const champs = reste as Record<string, unknown>
      const requete = id ? db().from(table).update(champs).eq('id', id) : db().from(table).insert(champs)
      const { data, error } = await requete.select().single()
      if (error) throw error
      return data as T
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [S, table] }),
  })
}

export function useSupprimer(table: Table) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, table, 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [S, table] }),
  })
}

/**
 * Retenir (une ligne de suivi par compagnie cochée) ou rejeter la carte
 * entière (catégorie obligatoire).
 */
export function useDecider() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [LOCAL, 'decider'],
    networkMode: 'always',
    mutationFn: async (p: {
      grant: string
      decision: 'valide' | 'rejete'
      categorie?: CategorieRejet
      commentaire?: string
      compagnies?: string[]
    }) => {
      const { error } = await db().rpc('decider', {
        p_grant: p.grant,
        p_decision: p.decision,
        p_categorie: p.categorie ?? null,
        p_commentaire: p.commentaire ?? null,
        p_compagnies: p.compagnies ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_r, p) => {
      client.invalidateQueries({ queryKey: [S, 'grants'] })
      client.invalidateQueries({ queryKey: [S, 'grant_applications'] })
      client.invalidateQueries({ queryKey: [S, 'grant_feedback'] })
      // Retenue : ses dates partent tout de suite dans l'agenda (sinon au prochain passage du cron).
      if (p.decision === 'valide') ecrireAgendaPlusTard(client, p.grant)
    },
  })
}

/** Accepter (le champ prend la valeur proposée) ou refuser une proposition de Claude. */
export function useDeciderProposition() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [LOCAL, 'proposition'],
    networkMode: 'always',
    mutationFn: async ({ id, accepter }: { id: string; accepter: boolean }) => {
      const { error } = await db().rpc('decider_proposition', { p_id: id, p_accepter: accepter })
      if (error) throw error
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [S, 'grants'] })
      client.invalidateQueries({ queryKey: [S, 'grant_proposals'] })
    },
  })
}

export interface ResultatAgenda {
  actif: boolean
  mode: 'simule' | 'google' | 'non_configure'
  faites: number
  erreurs?: number
  restantes: number
  erreur?: string
}

/** Demande au Worker d'écrire tout de suite dans l'agenda : une subvention, ou toutes. */
export async function synchroniserAgenda(grantId?: string) {
  const res = await appelerWorker('agenda', { method: 'POST', body: JSON.stringify(grantId ? { grant_id: grantId } : {}) })
  if (!res.ok) throw new Error(await erreurWorker(res))
  return (await res.json()) as ResultatAgenda
}

/** Synchro de l'agenda en arrière-plan (une panne attend le prochain passage du cron). */
export function ecrireAgendaPlusTard(client: ReturnType<typeof useQueryClient>, grantId: string) {
  synchroniserAgenda(grantId)
    .then(() => client.invalidateQueries({ queryKey: [S, 'grant_calendar_events'] }))
    .catch(() => {})
}

// ---------------------------------------------------------------------
// Attribution salariale : des salaires, donc ni temps réel ni cache sur
// l'appareil (clé « subventions-salaires » exclue de la persistance dans
// src/lib/requetes.ts), comme les Feuilles de temps.
// ---------------------------------------------------------------------
const SALAIRES = 'subventions-salaires'

export function useLignesSalaire() {
  return useQuery({
    queryKey: [SALAIRES, 'lignes'],
    queryFn: async () => {
      const { data, error } = await db().from('grant_salary_lines').select('*').order('created_at')
      if (error) throw error
      return data as LigneSalaire[]
    },
  })
}

/** Ajoute (sans id) ou modifie (avec id) une ligne ; erreur affichée par la fenêtre. */
export function useEnregistrerLigneSalaire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [LOCAL, 'grant_salary_lines'],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<LigneSalaire>) => {
      const { id, ...reste } = ligne
      const requete = id ? db().from('grant_salary_lines').update(reste).eq('id', id) : db().from('grant_salary_lines').insert(reste)
      const { error } = await requete
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [SALAIRES] }),
  })
}

export function useSupprimerLigneSalaire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [LOCAL, 'grant_salary_lines', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from('grant_salary_lines').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [SALAIRES] }),
  })
}

/** Reprend les étapes de reddition de compte d'une autre ligne de suivi ; renvoie le nombre copié. */
export async function reprendreEtapes(source: string, cible: string) {
  const { data, error } = await db().rpc('reprendre_etapes', { p_source: source, p_cible: cible })
  if (error) throw error
  return data as number
}

export function useModifierReglage() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, 'grant_settings'],
    networkMode: 'always',
    mutationFn: async ({ key, value }: Reglage) => {
      const { error } = await db().from('grant_settings').upsert({ key, value })
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [S, 'grant_settings'] }),
  })
}

/** Appel au Worker (/api/subventions/…) avec le jeton de la session. */
export async function appelerWorker(chemin: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.')
  return fetch(`/api/subventions/${chemin}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  })
}

/** Message d'erreur d'une réponse JSON du Worker. */
export async function erreurWorker(res: Response) {
  try {
    const corps = await res.json()
    if (corps?.erreur) return String(corps.erreur)
  } catch {
    /* pas du JSON */
  }
  if (res.status === 404) return "Le Worker ne répond pas à cette adresse (l'app est-elle à jour ?)."
  return `Erreur ${res.status}.`
}
