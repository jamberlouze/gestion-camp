import { createClient } from '@supabase/supabase-js'

// Client Supabase des pages publiques : toujours anonyme, même si
// quelqu'un de l'équipe est connecté dans ce navigateur. Ce que le client
// fait (accepter, signer, écrire) reste ainsi au nom du client.
const anonyme = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost',
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? 'manquante',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-pages-publiques' } },
)

export const db = () => anonyme.schema('reservations')

/** Message lisible d'une erreur de la base (les fonctions lèvent des phrases complètes). */
export const messageDe = (e: { message?: string } | null | undefined, defaut: string) => e?.message?.trim() || defaut
