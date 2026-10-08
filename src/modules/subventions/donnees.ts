import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Profil } from '@/lib/types'
import type { CategorieRejet, Entreprise, Etape, Feedback, Heures, Note, Rappel, Recherche, Reglage, Regles, Subvention } from './types'

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
export const useFeedback = () => useListe<Feedback>(S, 'grant_feedback', 'decided_at')
export const useNotes = () => useListe<Note>(S, 'grant_notes', 'created_at')
export const useHeures = () => useListe<Heures>(S, 'grant_time_entries', 'entry_date')
export const useEtapes = () => useListe<Etape>(S, 'grant_reporting_steps', 'sort_order')
export const useRecherches = () => useListe<Recherche>(S, 'grant_search_runs', 'started_at')
export const useRegles = () => useListe<Regles>(S, 'grant_learned_rules', 'generated_at')
export const useReglages = () => useListe<Reglage>(S, 'grant_settings', 'key')
export const useRappels = () => useListe<Rappel>(S, 'grant_digests', 'week_start')
/** Noms des personnes (notes, heures, décisions) : la direction voit tous les profils. */
export const useProfils = () => useListe<Profil>('core', 'profils', 'courriel')

type Table = 'grants' | 'grant_companies' | 'grant_notes' | 'grant_time_entries' | 'grant_reporting_steps'

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

/** Retenir (en cours, avec l'entreprise qui dépose) ou rejeter (catégorie obligatoire). */
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
      demandeur?: string
    }) => {
      const { error } = await db().rpc('decider', {
        p_grant: p.grant,
        p_decision: p.decision,
        p_categorie: p.categorie ?? null,
        p_commentaire: p.commentaire ?? null,
        p_demandeur: p.demandeur ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [S, 'grants'] })
      client.invalidateQueries({ queryKey: [S, 'grant_feedback'] })
    },
  })
}

/** Reprend les étapes de reddition de compte d'une autre subvention ; renvoie le nombre copié. */
export async function copierEtapes(source: string, cible: string) {
  const { data, error } = await db().rpc('copier_etapes', { p_source: source, p_cible: cible })
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
