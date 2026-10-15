import { createClient } from '@supabase/supabase-js'

// Client Supabase des pages publiques : toujours anonyme, même si
// quelqu'un de l'équipe est connecté dans ce navigateur. Ce que le
// visiteur fait (accepter, signer, écrire) reste ainsi à son nom.
// (Les pages publiques du module RH n'en ont pas besoin : elles passent
// toutes par le Worker, l'anonyme n'ayant aucun droit sur le schéma rh.)
const anonyme = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost',
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? 'manquante',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-pages-publiques' } },
)

export const schemaAnonyme = (schema: string) => anonyme.schema(schema)

/** Message lisible d'une erreur de la base (les fonctions lèvent des phrases complètes). */
export const messageDe = (e: { message?: string } | null | undefined, defaut: string) => e?.message?.trim() || defaut
