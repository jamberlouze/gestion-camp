// Ce qui demande une action de l'équipe sur une réservation (réunion du
// 2026-10-21, lot C) : point rouge de la liste, compte de l'onglet et
// « À faire pour moi » de l'accueil. Fichier pur.

import type { Reservation } from './types'

export type CodeAction = 'nouvelle' | 'changement' | 'appel' | 'paiement' | 'contrat'

export interface Action {
  code: CodeAction
  texte: string
  /** En rouge (le client attend une réponse, ou rien n'est payé). */
  urgent: boolean
}

export interface Signaux {
  /** Réservations qui ont une demande de changement du client à traiter. */
  changements: Set<string>
  /** Contrats signés sans aucun paiement reçu à l'échéance (relance « paiement »). */
  sansPaiement: Set<string>
  /** Changement refusé : le client reste à appeler (relance « appel: », règle de l'équipe). */
  appels?: Set<string>
}

/** Actions à prendre, les plus pressées d'abord (rien pour une réservation fermée, sauf ce qui reste dû). */
export function actionsDe(
  r: Pick<Reservation, 'id' | 'etape' | 'fermeture' | 'organisation_id' | 'origine'>,
  s: Signaux,
): Action[] {
  const a: Action[] = []
  if (s.changements.has(r.id)) a.push({ code: 'changement', texte: 'Changement du client à traiter', urgent: true })
  if (s.appels?.has(r.id)) a.push({ code: 'appel', texte: 'Appeler le client : changement refusé', urgent: true })
  if (s.sansPaiement.has(r.id)) a.push({ code: 'paiement', texte: 'Aucun paiement reçu', urgent: true })
  if (!r.fermeture && r.etape === 'nouvelle')
    a.push({ code: 'nouvelle', texte: r.organisation_id || r.origine === 'airbnb' ? 'Nouvelle demande' : 'Nouvelle demande : organisation à valider', urgent: false })
  if (!r.fermeture && r.etape === 'estime_accepte') a.push({ code: 'contrat', texte: 'Estimé accepté : préparer le contrat', urgent: false })
  return a
}

/** Réservations qui demandent une action (compte de l'onglet). */
export const nombreAAgir = (reservations: Parameters<typeof actionsDe>[0][], s: Signaux) =>
  reservations.filter((r) => actionsDe(r, s).length > 0).length
