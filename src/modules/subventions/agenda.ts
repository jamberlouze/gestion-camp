// Agenda Google « Subventions » (dédié : l'agenda d'inscription n'est pas
// touché). Quels événements une subvention doit y avoir, et ce qu'il faut
// créer, changer, déplacer ou retirer. Fichier pur : le Worker s'en sert
// (worker/subventions/agenda.js) et la fiche pour afficher l'état.
//
// - Retenue (en cours) ou obtenue : sa date d'ouverture et sa date limite,
//   avec les compagnies qui déposent (lignes de suivi pas refusées).
// - Ligne de suivi obtenue : aussi ses échéances de reddition de compte pas
//   encore faites.
// - Autre statut (rejetée, refusée, expirée, remise à valider…) : rien,
//   ses événements sont retirés.
// Journée entière, sans bloquer le temps ; rien avant `depuis` (mise en
// service), pour ne pas remplir l'agenda de dates passées.

import type { Etape, Statut, Subvention, Suivi } from './types'

export const STATUTS_AGENDA: Statut[] = ['en_cours', 'obtenu']

export interface ReglageAgenda {
  actif: boolean
  /** Identifiant de l'agenda Google (…@group.calendar.google.com) ; en DEV, « essai-… ». */
  calendrier: string
  /** AAAA-MM-JJ : aucune date plus ancienne n'est écrite. */
  depuis: string
}

export const REGLAGE_AGENDA_DEFAUT: ReglageAgenda = { actif: false, calendrier: '', depuis: '2026-10-01' }

export type GenreEvenement = 'ouverture' | 'fermeture' | 'reddition'

export interface EvenementGoogle {
  summary: string
  description: string
  start: { date: string }
  end: { date: string }
  transparency: 'transparent'
}

export interface EvenementVoulu {
  cle: string
  genre: GenreEvenement
  grant_id: string
  date: string
  evenement: EvenementGoogle
}

/** Ce que le Worker a écrit (subventions.grant_calendar_events). */
export interface LigneAgenda {
  event_key: string
  grant_id: string | null
  calendar_id: string | null
  google_id: string | null
  content: string | null
  synced_at: string | null
  error: string | null
}

export type ActionAgenda =
  | { genre: 'creer' | 'modifier' | 'deplacer'; voulu: EvenementVoulu; contenu: string; ligne: LigneAgenda | null }
  | { genre: 'retirer'; ligne: LigneAgenda }

type S = Pick<
  Subvention,
  'id' | 'program_name' | 'status' | 'open_date' | 'deadline_date' | 'source_url' | 'potential_amount_min' | 'potential_amount_max'
>
type L = Pick<Suivi, 'id' | 'grant_id' | 'company_id' | 'status' | 'amount_granted'>
type E = Pick<Etape, 'id' | 'application_id' | 'description' | 'due_date' | 'status'>

const lendemain = (jour: string) => new Date(Date.parse(`${jour}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

const argent = (n: number) => `${Math.round(n).toLocaleString('fr-CA')} $`
function montants(g: S, lignes: L[]) {
  const accordes = lignes.filter((l) => l.amount_granted != null)
  if (accordes.length) return `Accordé : ${argent(accordes.reduce((t, l) => t + Number(l.amount_granted), 0))}`
  const { potential_amount_min: min, potential_amount_max: max } = g
  if (min != null && max != null && Number(min) !== Number(max)) return `Montant potentiel : ${argent(Number(min))} à ${argent(Number(max))}`
  if (max != null) return `Montant potentiel : jusqu'à ${argent(Number(max))}`
  if (min != null) return `Montant potentiel : à partir de ${argent(Number(min))}`
  return null
}

function evenement(titre: string, jour: string, lignes: (string | null)[]): EvenementGoogle {
  return {
    summary: titre,
    description: lignes.filter(Boolean).join('\n'),
    start: { date: jour },
    end: { date: lendemain(jour) },
    transparency: 'transparent',
  }
}

/**
 * Événements voulus pour ces subventions, leurs lignes de suivi et leurs
 * étapes. `entreprise` donne le nom d'une compagnie ; `lien` l'adresse de la
 * fiche dans l'app.
 */
export function evenementsVoulus(
  subventions: S[],
  suivis: L[],
  etapes: E[],
  { entreprise, lien, depuis }: { entreprise: (id: string) => string | undefined; lien: (id: string) => string; depuis: string },
): EvenementVoulu[] {
  const voulus: EvenementVoulu[] = []
  for (const g of subventions) {
    if (!STATUTS_AGENDA.includes(g.status)) continue
    const lignes = suivis.filter((l) => l.grant_id === g.id && l.status !== 'refuse')
    const noms = lignes.map((l) => entreprise(l.company_id)).filter(Boolean)
    const suffixe = noms.length ? ` (${noms.join(', ')})` : ''
    const pied = (avec: L[]) => [montants(g, avec), g.source_url ? `Page officielle : ${g.source_url}` : null, `Fiche : ${lien(g.id)}`]
    const ajouter = (genre: GenreEvenement, cle: string, jour: string | null, titre: string, texte: (string | null)[]) => {
      if (jour && jour >= depuis) voulus.push({ cle, genre, grant_id: g.id, date: jour, evenement: evenement(titre, jour, texte) })
    }
    ajouter('ouverture', `ouverture:${g.id}`, g.open_date, `Ouverture · ${g.program_name}${suffixe}`, ['Ouverture des demandes.', ...pied(lignes)])
    ajouter('fermeture', `fermeture:${g.id}`, g.deadline_date, `Date limite · ${g.program_name}${suffixe}`, [
      'Date limite pour déposer la demande.',
      ...pied(lignes),
    ])
    for (const l of lignes) {
      if (l.status !== 'obtenu') continue
      const nom = entreprise(l.company_id)
      for (const e of etapes) {
        if (e.application_id !== l.id || e.status === 'complete') continue
        ajouter('reddition', `reddition:${e.id}`, e.due_date, `Reddition · ${e.description} — ${g.program_name}${nom ? ` (${nom})` : ''}`, [
          'Échéance de reddition de compte.',
          ...pied([l]),
        ])
      }
    }
  }
  return voulus
}

/**
 * Ce qu'il faut faire pour que l'agenda corresponde : créer (pas encore
 * écrit), modifier (contenu changé), déplacer (autre agenda que celui où il
 * a été écrit), retirer (plus voulu). Une ligne sans événement Google et
 * plus voulue est seulement oubliée (retirer sans google_id).
 */
export function actionsAgenda(voulus: EvenementVoulu[], lignes: LigneAgenda[], calendrier: string): ActionAgenda[] {
  const parCle = new Map(lignes.map((l) => [l.event_key, l]))
  const actions: ActionAgenda[] = []
  const cles = new Set<string>()
  for (const v of voulus) {
    cles.add(v.cle)
    const ligne = parCle.get(v.cle) ?? null
    const contenu = JSON.stringify(v.evenement)
    if (!ligne?.google_id) actions.push({ genre: 'creer', voulu: v, contenu, ligne })
    else if (ligne.calendar_id !== calendrier) actions.push({ genre: 'deplacer', voulu: v, contenu, ligne })
    else if (ligne.content !== contenu) actions.push({ genre: 'modifier', voulu: v, contenu, ligne })
  }
  for (const l of lignes) if (!cles.has(l.event_key)) actions.push({ genre: 'retirer', ligne: l })
  return actions
}

/**
 * État d'une date sur la fiche : écrite, à écrire (prochain passage) ou en
 * erreur. Par clé seulement : l'app ne connaît pas l'adresse de la fiche
 * que le Worker met dans l'événement (APP_URL).
 */
export function etatEvenement(v: EvenementVoulu, lignes: LigneAgenda[], calendrier: string): 'ecrit' | 'a_ecrire' | 'erreur' {
  const l = lignes.find((x) => x.event_key === v.cle)
  if (l?.error) return 'erreur'
  return l?.google_id && l.calendar_id === calendrier ? 'ecrit' : 'a_ecrire'
}
