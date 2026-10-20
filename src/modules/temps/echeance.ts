// Soumission automatique des feuilles (décision de Maxime du 2026-10-20) :
// une feuille encore en cours le mardi qui suit la fin de sa période, à midi
// (heure de Montréal), est soumise par la base, comme si son auteur l'avait
// fait (temps.soumettre_feuilles_echues, aux 15 minutes). Une feuille
// renvoyée a jusqu'au premier mardi midi au moins 24 h après le renvoi.
// Mêmes règles que temps.echeance_soumission ; ici, seulement pour
// l'affichage. Fonctions pures (npm run test:temps).

import { dateCourtePaie, finPeriodePaie } from '../../lib/periodesPaie.ts'

const FUSEAU = 'America/Toronto'
const MS_JOUR = 86_400_000
const MIDI = '12:00:00'

const format = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** « 2026-10-20T12:00:00 » : date et heure de Montréal d'un instant. */
export function heureMontreal(instant: Date): string {
  const p = Object.fromEntries(format.formatToParts(instant).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

function plusJours(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j) + n * MS_JOUR).toISOString().slice(0, 10)
}

/** Premier mardi dont midi tombe à `local` (« AAAA-MM-JJTHH:MM:SS », heure de Montréal) ou après. */
function mardiMidiSuivant(local: string): string {
  const jour = local.slice(0, 10)
  const [a, m, j] = jour.split('-').map(Number)
  let ecart = (9 - new Date(Date.UTC(a, m - 1, j)).getUTCDay()) % 7 // 2 = mardi
  if (ecart === 0 && local.slice(11) > MIDI) ecart = 7
  return plusJours(jour, ecart)
}

/**
 * Mardi (« AAAA-MM-JJ ») à midi duquel la feuille de la période `debut` est
 * soumise si elle est encore en cours ; `dernierRenvoi` = date ISO du dernier
 * renvoi de la feuille, s'il y en a un.
 */
export function echeanceSoumission(debut: string, dernierRenvoi?: string | null): string {
  const periode = plusJours(finPeriodePaie(debut), 3)
  if (!dernierRenvoi) return periode
  const apresRenvoi = mardiMidiSuivant(heureMontreal(new Date(Date.parse(dernierRenvoi) + MS_JOUR)))
  return apresRenvoi > periode ? apresRenvoi : periode
}

/** Midi de ce mardi est-il passé ? */
export function echeancePassee(echeance: string, maintenant = new Date()): boolean {
  return heureMontreal(maintenant) >= `${echeance}T${MIDI}`
}

/** « mardi 3 nov. à midi » */
export function libelleEcheance(echeance: string): string {
  return `mardi ${dateCourtePaie(echeance)} à midi`
}
