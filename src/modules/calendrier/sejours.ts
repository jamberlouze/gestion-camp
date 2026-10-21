// Séjours du Calendrier : les réservations du module Réservations, lues
// telles quelles par calendrier.reservations() (jamais recopiées ; ni
// perdues ni annulées). Chacune est rangée dans la phase de son calendrier
// Google (agenda.ts : Demande, Estimé, Contrat, Confirmée PP ou VF), ou
// Airbnb ; l'équipe affiche ou masque chaque phase. Fichier pur.

import { calendrierDe, NOMS_CALENDRIER, RESSOURCES_VF, type CleCalendrier } from '../reservations/agenda.ts'
import { ETAPES, FERMETURES, FORFAITS, type Etape, type Fermeture, type Forfait, type Reservation } from '../reservations/types.ts'

/** Ligne de calendrier.reservations(). */
export interface LigneReservation {
  id: string
  numero: string
  nom: string
  forfait: Forfait
  etape: Etape
  fermeture: Fermeture | null
  origine: Reservation['origine']
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  etages: string[]
  salles: string[]
  nb_participants: number | null
  nb_accompagnateurs: number | null
  service_repas: boolean
}

export type Phase = CleCalendrier | 'airbnb'
export type Batiment = 'PP' | 'VF'

/** Phases dans l'ordre de la vente, de la moins à la plus confirmée. */
export const PHASES: { cle: Phase; libelle: string }[] = [
  ...(['demande', 'estime', 'contrat', 'confirmee_pp', 'confirmee_vf'] as const).map((cle) => ({ cle, libelle: NOMS_CALENDRIER[cle] })),
  { cle: 'airbnb', libelle: 'Airbnb' },
]

export const BATIMENTS: Record<Batiment, string> = { PP: 'Pavillon principal', VF: 'Vieille-France' }

export interface Sejour {
  id: string
  numero: string
  nom_groupe: string
  /** Forfait : Classe nature, Accueil de groupe… */
  type_sejour: string
  /** Étape lisible : « Estimé envoyé », « Confirmée · En attente », « Airbnb ». */
  etat: string
  phase: Phase
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  /** Vieille-France dès qu'une section ou une salle en est (même règle que Confirmée VF). */
  batiment: Batiment
  /** Sections (codes de Rooming) puis salles. */
  sections: string[]
  /** Participants + accompagnateurs ; null si ni l'un ni l'autre n'est connu. */
  nb_participants: number | null
  avec_repas: boolean
}

const LIBELLES_ETAPES = Object.fromEntries(ETAPES.map((e) => [e.valeur, e.libelle])) as Record<Etape, string>

/** Phase d'une réservation : celle de son étape, même en attente (Maxime : tout sauf perdues et annulées). */
export const phaseDe = (r: Pick<LigneReservation, 'etape' | 'origine' | 'etages' | 'salles'>): Phase =>
  r.origine === 'airbnb' ? 'airbnb' : (calendrierDe({ ...r, fermeture: null }) ?? 'demande')

export function sejourDe(r: LigneReservation): Sejour {
  const phase = phaseDe(r)
  const sections = [...(r.etages ?? []), ...(r.salles ?? [])]
  const personnes = r.nb_participants == null && r.nb_accompagnateurs == null ? null : (r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)
  return {
    id: r.id,
    numero: r.numero,
    nom_groupe: r.nom,
    type_sejour: FORFAITS[r.forfait],
    etat: phase === 'airbnb' ? 'Airbnb' : `${LIBELLES_ETAPES[r.etape]}${r.fermeture ? ` · ${FERMETURES[r.fermeture]}` : ''}`,
    phase,
    date_arrivee: r.date_arrivee,
    date_depart: r.date_depart,
    heure_arrivee: r.heure_arrivee,
    heure_depart: r.heure_depart,
    batiment: sections.some((c) => RESSOURCES_VF.includes(c)) ? 'VF' : 'PP',
    sections,
    nb_participants: personnes,
    avec_repas: r.service_repas,
  }
}
