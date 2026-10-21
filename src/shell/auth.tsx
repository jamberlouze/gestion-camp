import type { Session } from '@supabase/supabase-js'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { viderCache } from '@/lib/requetes'
import { supabase } from '@/lib/supabase'
import type { AccesModule, AccesRole, ModuleId, Profil } from '@/lib/types'
import { niveauModule, reserveAuxAdmins } from './acces'
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
  /**
   * Employé du référentiel qui remplit sa propre feuille de temps (courriel
   * de sa fiche = celui du compte) ; null sinon. Sa seule porte d'entrée
   * dans les Feuilles de temps (temps.mon_employe en base).
   */
  employeTemps: string | null
  peutLire: (module: ModuleId) => boolean
  peutEcrire: (module: ModuleId) => boolean
  /**
   * Peut ouvrir le module (menu, accueil, adresse) : `peutLire`, sauf un
   * module caché à tous sauf les admins et le rôle Développeur
   * (`cacheSaufAdmins`, modules.ts). Ses données, elles, suivent `peutLire`
   * (d'autres écrans les lisent).
   */
  peutOuvrir: (module: ModuleId) => boolean
  /** Seuls les admins (et le rôle Développeur) y ont accès : pastille « admins » du menu (`acces.ts`). */
  reserveAuxAdmins: (module: ModuleId) => boolean
  deconnexion: () => Promise<void>
}

const ContexteAuth = createContext<EtatAuth | null>(null)

// Droits gardés sur l'appareil avant la grille d'accès par rôle (pas de `roles`) :
// on applique ce qui valait alors, le temps de relire les droits en ligne.
const GRILLE_AVANT: AccesRole[] = MODULES.filter((m) => !m.accesFixe && !m.parent && m.id !== 'subventions' && m.id !== 'vigie').map((m) => ({
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
      // `ajouts` : les ajouts personnels lisibles (tous pour la direction),
      // pour la pastille « admins » seulement.
      const [profil, acces, roles, employe, ajouts] = await Promise.all([
        supabase.schema('core').from('profils').select('*').eq('id', userId!).maybeSingle(),
        supabase.schema('core').from('acces_modules').select('*').eq('user_id', userId!),
        supabase.schema('core').from('acces_roles').select('*'),
        supabase.schema('temps').rpc('mon_employe'),
        supabase.schema('core').from('acces_modules').select('module'),
      ])
      if (profil.error) throw profil.error
      if (acces.error) throw acces.error
      if (roles.error) throw roles.error
      if (employe.error) throw employe.error
      if (ajouts.error) throw ajouts.error
      return {
        profil: profil.data as Profil | null,
        acces: (acces.data ?? []) as AccesModule[],
        roles: (roles.data ?? []) as AccesRole[],
        employeTemps: (employe.data as string | null) ?? null,
        ajouts: (ajouts.data ?? []) as Pick<AccesModule, 'module'>[],
      }
    },
  })

  const profil = droits?.profil?.actif ? droits.profil : null
  const estAdmin = profil?.role === 'admin'
  const estDirection = estAdmin || profil?.role === 'direction'
  const employeTemps = (profil && droits?.employeTemps) || null
  const niveau = (m: ModuleId) =>
    niveauModule(profil?.role, droits?.roles ?? GRILLE_AVANT, droits?.acces ?? [], m, !!employeTemps)

  const valeur: EtatAuth = {
    session,
    profil,
    chargement: !sessionChargee || restauration || (!!userId && !droits && !isError),
    erreurProfil: !!userId && !droits && isError,
    estAdmin,
    estDirection,
    employeTemps,
    peutLire: (m) => niveau(m) !== null,
    peutEcrire: (m) => niveau(m) === 'ecriture',
    peutOuvrir: (m) => {
      const def = MODULES.find((d) => d.id === m)
      const acces = niveau(m) !== null || !!def?.ouvertAussiPar?.some((x) => niveau(x) !== null)
      // Le rôle Développeur a accès à tout (décision de Maxime du 2026-10-21).
      return acces && (estAdmin || profil?.role === 'developpeur' || !def?.cacheSaufAdmins)
    },
    // Droits gardés sur l'appareil d'avant la pastille : pas de `ajouts`.
    reserveAuxAdmins: (m) => reserveAuxAdmins(droits?.roles ?? GRILLE_AVANT, droits?.ajouts ?? [], m),
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
