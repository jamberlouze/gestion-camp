import { lazy, Suspense } from 'react'
import { estPageRh } from '@/lib/pagesPubliques'
import { Chargement } from '@/shell/Gardes'

// Aiguillage des pages publiques (chargées avant la connexion, voir App.tsx) :
// chaque module a son paquet, téléchargé seulement par ses visiteurs.
const PagesRh = lazy(() => import('@/modules/rh/public'))
const PagesReservations = lazy(() => import('@/modules/reservations/public'))

export default function PagesPubliques() {
  return <Suspense fallback={<Chargement />}>{estPageRh() ? <PagesRh /> : <PagesReservations />}</Suspense>
}
