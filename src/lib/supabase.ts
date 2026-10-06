import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Vrai quand .env.local (ou les variables Cloudflare) n'est pas rempli. */
export const configManquante = !url || !cle

export const supabase = createClient(url ?? 'http://localhost', cle ?? 'manquante', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Schema = 'core' | 'embarcations' | 'commande' | 'horaire' | 'mastertimeline' | 'subventions' | 'vigie' | 'calendrier' | 'temps' | 'vehicules' | 'travaux'
