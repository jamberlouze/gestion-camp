import { lazy, Suspense } from 'react'
import { Chargement } from '@/shell/Gardes'

// Aiguillage des pages publiques (chargées avant la connexion, voir App.tsx) :
// chaque module a son paquet, téléchargé seulement par ses visiteurs.
const PagesReservations = lazy(() => import('@/modules/reservations/public'))

export default function PagesPubliques() {
  return (
    <Suspense fallback={<Chargement />}>
      <PagesReservations />
    </Suspense>
  )
}
