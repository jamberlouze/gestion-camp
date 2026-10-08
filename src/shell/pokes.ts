import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { messageErreur } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

// Pokes : un envoi par personne et par jour (journée de Montréal), avec un
// émoji. La base décide (core.poker, contrainte unique (de, jour)) ; l'app
// ne fait qu'afficher. Émojis : choix de l'app, par catégories ; la base
// vérifie seulement que c'est un court émoji (on peut allonger la liste sans migration).
export const EMOJI_POKE_DEFAUT = '👉'

export const CATEGORIES_EMOJIS: { nom: string; icone: string; emojis: string[] }[] = [
  {
    nom: 'Salut',
    icone: '👋',
    emojis: ['👉', '👋', '🙌', '👏', '🤝', '🫶', '👍', '💪', '🤙', '✌️', '🤞', '🫡', '🙏', '🤘', '👊', '✋', '🫵', '👀'],
  },
  {
    nom: 'Visages',
    icone: '😂',
    emojis: ['😂', '🤣', '😄', '😊', '😍', '🥰', '😎', '🤩', '🥳', '😜', '🤪', '😇', '🤗', '🤭', '😴', '🤯', '😱', '🥹'],
  },
  {
    nom: 'Camp',
    icone: '🌲',
    emojis: ['🌲', '🏕️', '⛺', '🛶', '🔥', '🌊', '☀️', '🌈', '⭐', '🌙', '🦆', '🦫', '🐻', '🦌', '🐿️', '🦉', '🐸', '🍁'],
  },
  {
    nom: 'Bouffe',
    icone: '☕',
    emojis: ['☕', '🍕', '🌭', '🍔', '🍟', '🌮', '🥞', '🧇', '🍩', '🍪', '🧁', '🍦', '🍫', '🍿', '🍓', '🍉', '🥤', '🍺'],
  },
  {
    nom: 'Fête',
    icone: '🎉',
    emojis: ['🎉', '🎊', '🎈', '🏆', '🥇', '🎯', '🚀', '💯', '✨', '💥', '🎶', '🎸', '⚽', '🏀', '🎣', '🧗', '🚴', '🏊'],
  },
  {
    nom: 'Cœurs',
    icone: '💚',
    emojis: ['💚', '❤️', '🧡', '💛', '💙', '💜', '🖤', '🤍', '💖', '💘', '💝', '💐', '🌻', '🌷', '🌸', '🍀', '🌼', '🦋'],
  },
]

export interface Poke {
  id: string
  de: string
  a: string
  emoji: string
  jour: string
  vu_le: string | null
  created_at: string
}

export interface Collegue {
  id: string
  nom: string
}

/** Date du jour à Montréal (AAAA-MM-JJ), comme `jour` dans la base. */
export function aujourdhui(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date())
}

/** Temps réel des pokes : un seul abonnement, monté par le cadre (Layout). */
export function useTempsReelPokes() {
  const { profil } = useAuth()
  const client = useQueryClient()
  const moi = profil?.id

  useEffect(() => {
    if (!moi) return
    const canal = supabase
      .channel(`core.pokes-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'core', table: 'pokes' }, () =>
        client.invalidateQueries({ queryKey: ['pokes', moi] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [moi, client])
}

/** Pokes envoyés et reçus des 60 derniers jours (RLS : seulement les siens). */
export function usePokes() {
  const { profil } = useAuth()
  const moi = profil?.id
  return useQuery({
    queryKey: ['pokes', moi],
    enabled: !!moi,
    queryFn: async () => {
      const depuis = new Date(Date.now() - 60 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .schema('core')
        .from('pokes')
        .select('*')
        .gte('created_at', depuis)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Poke[]
    },
  })
}

/** Pokes reçus pas encore vus (plus récent d'abord). */
export function usePokesNonVus() {
  const { profil } = useAuth()
  const { data } = usePokes()
  return (data ?? []).filter((p) => p.a === profil?.id && !p.vu_le)
}

/** Profils actifs qu'on peut poker (nom seulement). */
export function useCollegues() {
  const { profil } = useAuth()
  return useQuery({
    queryKey: ['pokes', profil?.id, 'collegues'],
    enabled: !!profil,
    queryFn: async () => {
      const { data, error } = await supabase.schema('core').rpc('collegues_poke')
      if (error) throw error
      return data as Collegue[]
    },
  })
}

export function usePoker() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['poke-local'],
    networkMode: 'always',
    mutationFn: async ({ a, emoji }: { a: string; emoji: string }) => {
      const { error } = await supabase.schema('core').rpc('poker', { p_a: a, p_emoji: emoji })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['pokes'] }),
  })
}

export function useMarquerPokesVus() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['poke-local'],
    networkMode: 'always',
    mutationFn: async () => {
      const { error } = await supabase.schema('core').rpc('marquer_pokes_vus')
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['pokes'] }),
  })
}

export function messagePoke(e: unknown): string {
  const m = messageErreur(e)
  if (m.includes('deja_poke')) return "Tu as déjà poké quelqu'un aujourd'hui."
  if (m.includes('destinataire_invalide')) return 'Cette personne ne peut pas recevoir de poke.'
  return m
}
