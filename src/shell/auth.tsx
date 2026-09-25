import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { AccesModule, ModuleId, Profil } from '@/lib/types'

interface EtatAuth {
  session: Session | null
  profil: Profil | null
  /** Vrai tant que la session ou le profil se chargent. */
  chargement: boolean
  estAdmin: boolean
  estDirection: boolean
  peutLire: (module: ModuleId) => boolean
  peutEcrire: (module: ModuleId) => boolean
  deconnexion: () => Promise<void>
}

const ContexteAuth = createContext<EtatAuth | null>(null)

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChargee, setSessionChargee] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionChargee(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_evenement, nouvelle) => setSession(nouvelle))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const { data: droits, isLoading } = useQuery({
    queryKey: ['droits', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [profil, acces] = await Promise.all([
        supabase.schema('core').from('profils').select('*').eq('id', userId!).maybeSingle(),
        supabase.schema('core').from('acces_modules').select('*').eq('user_id', userId!),
      ])
      if (profil.error) throw profil.error
      if (acces.error) throw acces.error
      return { profil: profil.data as Profil | null, acces: (acces.data ?? []) as AccesModule[] }
    },
  })

  const profil = droits?.profil?.actif ? droits.profil : null
  const estAdmin = profil?.role === 'admin'
  const estDirection = estAdmin || profil?.role === 'direction'
  const acces = droits?.acces ?? []

  const valeur: EtatAuth = {
    session,
    profil,
    chargement: !sessionChargee || (!!userId && isLoading),
    estAdmin,
    estDirection,
    peutLire: (m) => estDirection || (!!profil && acces.some((a) => a.module === m)),
    peutEcrire: (m) =>
      estDirection || (!!profil && acces.some((a) => a.module === m && a.niveau === 'ecriture')),
    deconnexion: async () => {
      await supabase.auth.signOut()
    },
  }

  return <ContexteAuth.Provider value={valeur}>{children}</ContexteAuth.Provider>
}

export function useAuth() {
  const ctx = useContext(ContexteAuth)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <FournisseurAuth>')
  return ctx
}
