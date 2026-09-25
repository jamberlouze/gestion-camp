import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { ModuleId } from '@/lib/types'
import { useAuth } from './auth'

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

export function GardeModule({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { peutLire } = useAuth()
  return peutLire(module) ? children : <AccesRefuse />
}

export function GardeDirection({ children }: { children: ReactNode }) {
  const { estDirection } = useAuth()
  return estDirection ? children : <AccesRefuse />
}

export function GardeAdmin({ children }: { children: ReactNode }) {
  const { estAdmin } = useAuth()
  return estAdmin ? children : <Navigate to="/" replace />
}
