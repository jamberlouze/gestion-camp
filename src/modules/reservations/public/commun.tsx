import type { ComponentProps } from 'react'
import { Entete as EnteteCommun } from '@/lib/public/habillage'

// Habillage des pages publiques des Réservations : celui du socle commun
// (src/lib/public/habillage.tsx), avec le logo de la BPA par défaut.

export { Choix, ChoixLangue, Page, Pied, Question } from '@/lib/public/habillage'

export function Entete({ logo = '/reservations/logo-gbpa.png', nomLogo = 'Base de plein air Mont-Tremblant', ...props }: ComponentProps<typeof EnteteCommun>) {
  return <EnteteCommun logo={logo} nomLogo={nomLogo} {...props} />
}
