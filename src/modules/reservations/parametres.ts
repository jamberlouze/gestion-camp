// Réglages du module (table reservations.reglages), lus en clair. Fichier
// pur, sans React : le Worker s'en sert aussi (formulaire public).
import type { ReglageAgenda } from './agenda.ts'
import type { HeuresRepas } from './calcul.ts'
import type { Forfait, Ratio, Reglage } from './types'

export interface Reglages {
  heuresNormales: Record<string, [string, string]>
  heuresRepas: HeuresRepas
  gratuitePar: number
  ratioDefaut: Ratio
  diviseurHeuresExtra: number
  variantesClasse: Record<string, string>
  /** Compte qui fait les factures dans QBO (relances de facturation) ; null = responsable de la réservation. */
  responsableFacturation: string | null
  /** Google Agenda (phase 6) : écriture active ? identifiants des 5 calendriers. */
  agenda: ReglageAgenda
  /** Dernière lecture des iCal d'Airbnb (écrite par le Worker). */
  airbnbLecture: { quand: string; annonces: Record<string, { reservations: number; ajoutees: number; modifiees: number; annulees: number }>; erreurs: string[] } | null
}

const valeur = <T,>(reglages: Reglage[], cle: string, defaut: T): T =>
  (reglages.find((r) => r.cle === cle)?.valeur as T | undefined) ?? defaut

export function lireReglages(r: Reglage[]): Reglages {
  return {
    heuresNormales: valeur(r, 'heures_normales', {}),
    heuresRepas: valeur(r, 'heures_repas', { dejeuner: '08:00', diner: '12:00', souper: '17:30' }),
    gratuitePar: Number(valeur(r, 'gratuite_par', 20)),
    ratioDefaut: valeur<Ratio>(r, 'ratio_defaut', '1:15'),
    diviseurHeuresExtra: Number(valeur(r, 'diviseur_heures_extra', 8)),
    variantesClasse: valeur(r, 'variantes_classe', {}),
    responsableFacturation: valeur<string | null>(r, 'responsable_facturation', null),
    agenda: valeur<ReglageAgenda>(r, 'agenda', { actif: false, calendriers: { demande: '', estime: '', contrat: '', confirmee_pp: '', confirmee_vf: '' } }),
    airbnbLecture: valeur(r, 'airbnb_lecture', null),
  }
}

/** Heures normales d'arrivée et de départ d'un forfait (Location : selon la variante). */
export function heuresNormales(reglages: Reglages, forfait: Forfait, variante: string | null): [string, string] | null {
  if (forfait === 'location_salle') {
    if (variante === 'jour') return reglages.heuresNormales.location_salle_jour ?? null
    if (variante === 'soir') return reglages.heuresNormales.location_salle_soir ?? null
    if (variante === 'complete') return ['09:00', '23:00']
    return null
  }
  return reglages.heuresNormales[forfait] ?? null
}
