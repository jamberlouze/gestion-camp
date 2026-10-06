import type { Session } from '@supabase/supabase-js'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { viderCache } from '@/lib/requetes'
import { supabase } from '@/lib/supabase'
import type { AccesModule, AccesRole, ModuleId, Profil } from '@/lib/types'
import { niveauModule } from './acces'
import { MODULES } from './modules'

interface EtatAuth {
  session: Session | null
  profil: Profil | null
  /** Vrai tant que la session ou le profil se chargent. */
  chargement: boolean
  /** Le profil n'a pas pu être lu (ex. première ouverture sans réseau). */
  erreurProfil: boolean
  estAdmin: boolean
  estDirection: boolean
  peutLire: (module: ModuleId) => boolean
  peutEcrire: (module: ModuleId) => boolean
  deconnexion: () => Promise<void>
}

const ContexteAuth = createContext<EtatAuth | null>(null)

// Droits gardés sur l'appareil avant la grille d'accès par rôle (pas de `roles`) :
// on applique ce qui valait alors, le temps de relire les droits en ligne.
const GRILLE_AVANT: AccesRole[] = MODULES.filter((m) => !m.accesFixe && m.id !== 'subventions' && m.id !== 'vigie').map((m) => ({
  role: 'direction',
  module: m.id,
  niveau: 'ecriture',
}))

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
  const restauration = useIsRestoring()
  const { data: droits, isError } = useQuery({
    queryKey: ['droits', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [profil, acces, roles] = await Promise.all([
        supabase.schema('core').from('profils').select('*').eq('id', userId!).maybeSingle(),
        supabase.schema('core').from('acces_modules').select('*').eq('user_id', userId!),
        supabase.schema('core').from('acces_roles').select('*'),
      ])
      if (profil.error) throw profil.error
      if (acces.error) throw acces.error
      if (roles.error) throw roles.error
      return {
        profil: profil.data as Profil | null,
        acces: (acces.data ?? []) as AccesModule[],
        roles: (roles.data ?? []) as AccesRole[],
      }
    },
  })

  const profil = droits?.profil?.actif ? droits.profil : null
  const estAdmin = profil?.role === 'admin'
  const estDirection = estAdmin || profil?.role === 'direction'
  const niveau = (m: ModuleId) => niveauModule(profil?.role, droits?.roles ?? GRILLE_AVANT, droits?.acces ?? [], m)

  const valeur: EtatAuth = {
    session,
    profil,
    chargement: !sessionChargee || restauration || (!!userId && !droits && !isError),
    erreurProfil: !!userId && !droits && isError,
    estAdmin,
    estDirection,
    peutLire: (m) => niveau(m) !== null,
    peutEcrire: (m) => niveau(m) === 'ecriture',
    deconnexion: async () => {
      await viderCache()
      await supabase.auth.signOut({ scope: 'local' })
    },
  }

  return <ContexteAuth.Provider value={valeur}>{children}</ContexteAuth.Provider>
}

export function useAuth() {
  const ctx = useContext(ContexteAuth)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <FournisseurAuth>')
  return ctx
}
