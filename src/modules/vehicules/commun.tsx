import { adressePhoto } from './donnees'
import { dateLisible, delaiLisible, type EtatEcheance } from './outils'
import type { Statut, TypeVehicule } from './types'

const COULEURS_ETAT: Record<EtatEcheance, string> = {
  depassee: 'text-red-700',
  bientot: 'text-amber-700',
  ok: 'text-pierre-700',
  aucune: 'text-pierre-400',
}

const PASTILLES_ETAT: Record<EtatEcheance, string> = {
  depassee: 'bg-red-600',
  bientot: 'bg-amber-500',
  ok: 'bg-foret-600',
  aucune: 'bg-pierre-300',
}

export function PastilleEtat({ etat }: { etat: EtatEcheance }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${PASTILLES_ETAT[etat]}`} aria-hidden />
}

/** Date d'échéance colorée selon l'urgence, avec le délai si elle est proche. */
export function DateEcheance({ date, etat, jour, court }: { date: string | null; etat: EtatEcheance; jour: string; court?: boolean }) {
  if (!date) return <span className={COULEURS_ETAT.aucune}>À préciser</span>
  return (
    <span className={COULEURS_ETAT[etat]}>
      {dateLisible(date)}
      {!court && (etat === 'depassee' || etat === 'bientot') && <span className="text-xs"> · {delaiLisible(date, jour)}</span>}
    </span>
  )
}

export function BadgeStatut({ statut }: { statut: Statut }) {
  return statut === 'en_circulation' ? (
    <span className="rounded-full bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800 ring-1 ring-foret-100">
      En circulation
    </span>
  ) : (
    <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-xs font-medium text-pierre-600 ring-1 ring-pierre-200">Remisé</span>
  )
}

const ICONES: Record<TypeVehicule, string> = { minibus: '🚐', vtt: '🏍️', remorque: '🛞', autre: '🚗' }

/** Photo du véhicule, ou l'icône de son type sur fond gris. */
export function Photo({ chemin, type, className = '' }: { chemin: string | null; type: TypeVehicule; className?: string }) {
  return chemin ? (
    <img src={adressePhoto(chemin)} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-pierre-100 text-4xl ${className}`} aria-hidden>
      <span className="opacity-60">{ICONES[type]}</span>
    </div>
  )
}
