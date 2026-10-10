// Google Agenda (plan §10) : dans quel calendrier va une réservation, son
// événement, et ce qu'il faut créer, changer, déplacer ou retirer. Fichier
// pur : le Worker s'en sert (synchro aux 15 minutes) et l'app pour afficher.
// L'app écrit dans les calendriers, jamais l'inverse.

import type { Forfait, Reservation } from './types'

export type CleCalendrier = 'demande' | 'estime' | 'contrat' | 'confirmee_pp' | 'confirmee_vf'

export const CALENDRIERS: { cle: CleCalendrier; nom: string }[] = [
  { cle: 'demande', nom: 'Demande' },
  { cle: 'estime', nom: 'Estimé' },
  { cle: 'contrat', nom: 'Contrat' },
  { cle: 'confirmee_pp', nom: 'Confirmée PP' },
  { cle: 'confirmee_vf', nom: 'Confirmée VF' },
]
export const NOMS_CALENDRIER = Object.fromEntries(CALENDRIERS.map((c) => [c.cle, c.nom])) as Record<CleCalendrier, string>

/** Sections et salles de la Vieille-France : une réservation confirmée qui en a une va dans Confirmée VF (qui bloque Airbnb). */
export const RESSOURCES_VF = ['VFB', 'VFH', 'SVF', 'CVF']

export interface ReglageAgenda {
  actif: boolean
  calendriers: Record<CleCalendrier, string>
}

type R = Pick<
  Reservation,
  | 'id'
  | 'numero'
  | 'nom'
  | 'forfait'
  | 'date_arrivee'
  | 'date_depart'
  | 'heure_arrivee'
  | 'heure_depart'
  | 'nb_participants'
  | 'nb_accompagnateurs'
  | 'etages'
  | 'salles'
  | 'etape'
  | 'fermeture'
  | 'origine'
>

/**
 * Calendrier d'une réservation selon son étape : Demande (nouvelle, contact
 * établi), Estimé (envoyé, accepté), Contrat (envoyé), puis Confirmée VF si
 * elle occupe la Vieille-France, sinon Confirmée PP. Aucun : fermée (perdue,
 * annulée, en attente) ou réservation Airbnb (jamais réécrite dans Google).
 */
export function calendrierDe(r: Pick<R, 'etape' | 'fermeture' | 'origine' | 'etages' | 'salles'>): CleCalendrier | null {
  if (r.fermeture || r.origine === 'airbnb') return null
  if (r.etape === 'nouvelle' || r.etape === 'contact') return 'demande'
  if (r.etape === 'estime_envoye' || r.etape === 'estime_accepte') return 'estime'
  if (r.etape === 'contrat_envoye') return 'contrat'
  return [...(r.etages ?? []), ...(r.salles ?? [])].some((c) => RESSOURCES_VF.includes(c)) ? 'confirmee_vf' : 'confirmee_pp'
}

const FORFAITS: Record<Forfait, string> = {
  classe_nature: 'Classe nature',
  journee_plein_air: 'Journée plein air',
  accueil_groupe: 'Accueil de groupe',
  location_salle: 'Location de salle',
}
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const jourCourt = (jour: string) => {
  const [, m, j] = jour.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`
}
/** « 9h30 », « 13h ». */
const heure = (h: string | null) => {
  if (!h) return ''
  const [hh, mm] = h.split(':')
  return ` ${Number(hh)}h${mm && mm !== '00' ? mm : ''}`
}
const lendemain = (jour: string) => new Date(Date.parse(`${jour}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

export interface EvenementAgenda {
  summary: string
  description: string
  start: { date: string }
  end: { date: string }
  transparency: 'opaque'
}

/**
 * Événement d'une journée entière, nuits [arrivée, départ) comme Airbnb (le
 * jour du départ reste libre pour l'arrivée suivante) ; une journée sans nuit
 * occupe son jour. Rien de personnel : ni nom de contact, ni courriel.
 */
export function evenementAgenda(r: R, lienFiche: string): EvenementAgenda {
  const personnes = (r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)
  const lignes = [
    `${FORFAITS[r.forfait]}${personnes ? ` · ${r.nb_participants ?? 0} + ${r.nb_accompagnateurs ?? 0} personnes` : ''}`,
    `Arrivée ${jourCourt(r.date_arrivee)}${heure(r.heure_arrivee)} · départ ${jourCourt(r.date_depart)}${heure(r.heure_depart)}`,
    ...(r.etages?.length ? [`Sections : ${r.etages.join(', ')}`] : []),
    ...(r.salles?.length ? [`Salles : ${r.salles.join(', ')}`] : []),
    lienFiche,
  ]
  return {
    summary: `${r.numero} · ${r.nom}${personnes ? ` (${personnes})` : ''}`,
    description: lignes.join('\n'),
    start: { date: r.date_arrivee },
    end: { date: r.date_depart > r.date_arrivee ? r.date_depart : lendemain(r.date_arrivee) },
    transparency: 'opaque',
  }
}

export interface LigneAgenda {
  reservation_id: string
  calendrier: CleCalendrier | null
  google_id: string | null
  contenu: string | null
}

export type ActionAgenda =
  | { genre: 'creer'; reservation_id: string; calendrier: CleCalendrier; evenement: EvenementAgenda; contenu: string }
  | { genre: 'modifier' | 'deplacer'; reservation_id: string; calendrier: CleCalendrier; evenement: EvenementAgenda; contenu: string; ligne: LigneAgenda }
  | { genre: 'retirer'; reservation_id: string; ligne: LigneAgenda }

/** Ce qu'il faut faire dans Google pour que les calendriers suivent les réservations. */
export function actionsAgenda(reservations: R[], lignes: LigneAgenda[], lienFiche: (id: string) => string): ActionAgenda[] {
  const parReservation = new Map(lignes.map((l) => [l.reservation_id, l]))
  const actions: ActionAgenda[] = []
  for (const r of reservations) {
    const ligne = parReservation.get(r.id)
    const calendrier = calendrierDe(r)
    const present = ligne?.google_id && ligne.calendrier
    if (!calendrier) {
      if (present) actions.push({ genre: 'retirer', reservation_id: r.id, ligne: ligne! })
      continue
    }
    const evenement = evenementAgenda(r, lienFiche(r.id))
    const contenu = JSON.stringify(evenement)
    if (!present) actions.push({ genre: 'creer', reservation_id: r.id, calendrier, evenement, contenu })
    else if (ligne!.calendrier !== calendrier) actions.push({ genre: 'deplacer', reservation_id: r.id, calendrier, evenement, contenu, ligne: ligne! })
    else if (ligne!.contenu !== contenu) actions.push({ genre: 'modifier', reservation_id: r.id, calendrier, evenement, contenu, ligne: ligne! })
  }
  // Confirmée VF d'abord : c'est elle qui bloque Airbnb.
  const rang = (a: ActionAgenda) => ('calendrier' in a && a.calendrier === 'confirmee_vf') || (a.genre === 'retirer' && a.ligne.calendrier === 'confirmee_vf') ? 0 : 1
  return actions.sort((a, b) => rang(a) - rang(b))
}
