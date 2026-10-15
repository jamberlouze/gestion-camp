import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import type { ModuleId } from '@/lib/types'
import { useAuth } from './auth'
import { MODULES } from './modules'

export function Chargement() {
  return <div className="p-8 text-center text-sm text-pierre-500">Chargement…</div>
}

function AccesRefuse() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-medium">Accès refusé</p>
      <p className="mt-1 text-sm text-pierre-500">
        Vous n'avez pas accès à cette section. Demandez l'accès à un administrateur.
      </p>
    </div>
  )
}

/** Module caché à tous sauf les admins (`cacheSaufAdmins`) : on le dit simplement. */
function ModuleCache({ module }: { module: ModuleId }) {
  const def = MODULES.find((m) => m.id === module)
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-medium">{def?.nom ?? 'Ce module'} : en pause</p>
      <p className="mt-1 text-sm text-pierre-500">
        Réservé aux administrateurs pour l'instant{def?.cacheSaufAdmins ? `, ${def.cacheSaufAdmins}` : ''}.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm text-foret-700 underline">
        Retour à l'accueil
      </Link>
    </div>
  )
}

export function GardeModule({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { peutLire, peutOuvrir } = useAuth()
  if (peutOuvrir(module)) return children
  return peutLire(module) ? <ModuleCache module={module} /> : <AccesRefuse />
}

export function GardeDirection({ children }: { children: ReactNode }) {
  const { estDirection } = useAuth()
  return estDirection ? children : <AccesRefuse />
}

export function GardeAdmin({ children }: { children: ReactNode }) {
  const { estAdmin } = useAuth()
  return estAdmin ? children : <Navigate to="/" replace />
}
