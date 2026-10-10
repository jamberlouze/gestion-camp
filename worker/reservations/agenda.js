// Google Agenda des Réservations (plan §10, phase 6) : les 5 calendriers
// suivent les réservations (agenda.ts), aux 15 minutes (cron) et tout de
// suite depuis la fiche. Ce qui a été écrit est gardé dans
// reservations.agenda (un événement par réservation).
//
// - Rien tant que le réglage « agenda » n'est pas actif (les vieux
//   événements d'Airtable doivent d'abord être retirés des calendriers).
// - En DEV (base locale), jamais Google : la synchro est simulée (les lignes
//   de reservations.agenda montrent ce qui serait écrit).
// - En PROD : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (client OAuth interne) et
//   GOOGLE_AGENDA_REFRESH_TOKEN (portée calendar.events, autorisé par le
//   compte qui possède les 5 calendriers).

import { actionsAgenda, NOMS_CALENDRIER } from '../../src/modules/reservations/agenda.ts'
import { jourMontreal } from '../../src/modules/reservations/courriels.ts'
import { base } from '../subventions/base.js'

const CHAMPS = 'id,numero,nom,forfait,date_arrivee,date_depart,heure_arrivee,heure_depart,nb_participants,nb_accompagnateurs,etages,salles,etape,fermeture,origine'
const decaler = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function modeAgenda(env) {
  if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? '')) return 'simule'
  return env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GOOGLE_AGENDA_REFRESH_TOKEN ? 'google' : 'non_configure'
}

async function jetonGoogle(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GOOGLE_AGENDA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google a refusé le jeton de l'agenda (${res.status}) : ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).access_token
}

/** Appels à l'API Google Agenda ; en simulation, rien ne sort. */
function agendaGoogle(mode, jeton) {
  const adresse = (calendrier, id = '') =>
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendrier)}/events${id ? `/${encodeURIComponent(id)}` : ''}`
  async function appel(methode, url, corps) {
    const res = await fetch(url, {
      method: methode,
      headers: { Authorization: `Bearer ${jeton}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    })
    if (methode === 'DELETE' && (res.status === 404 || res.status === 410)) return null
    if (!res.ok) {
      const e = new Error(`Google Agenda a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`)
      e.statut = res.status
      throw e
    }
    return res.status === 204 ? null : res.json()
  }
  if (mode === 'simule') {
    return {
      creer: async () => `simule:${crypto.randomUUID()}`,
      remplacer: async (_c, id) => id,
      retirer: async () => {},
    }
  }
  return {
    creer: async (calendrier, ev) => (await appel('POST', adresse(calendrier), ev)).id,
    remplacer: async (calendrier, id, ev) => {
      try {
        return (await appel('PUT', adresse(calendrier, id), ev)).id
      } catch (e) {
        // Effacé à la main dans Google : on le recrée.
        if (e.statut === 404 || e.statut === 410) return (await appel('POST', adresse(calendrier), ev)).id
        throw e
      }
    },
    retirer: async (calendrier, id) => {
      await appel('DELETE', adresse(calendrier, id))
    },
  }
}

/**
 * Met les calendriers à jour (une réservation, ou toutes celles qui ne sont
 * pas terminées depuis plus d'une semaine), au plus `max` appels à Google
 * par passage ; le reste attend le passage suivant.
 */
export async function synchroniserAgenda(env, reservationId = null, { max = 25 } = {}) {
  const db = base(env, 'reservations')
  const [reglage] = await db.lire('reglages?cle=eq.agenda&select=valeur')
  const config = reglage?.valeur ?? { actif: false, calendriers: {} }
  if (!config.actif) return { actif: false, mode: modeAgenda(env), faites: 0, restantes: 0 }
  const mode = modeAgenda(env)
  if (mode === 'non_configure') return { actif: true, mode, faites: 0, restantes: 0, erreur: 'Google Agenda n’est pas configuré (secret GOOGLE_AGENDA_REFRESH_TOKEN : README, section 14).' }

  const auj = jourMontreal(new Date())
  const filtre = reservationId ? `id=eq.${reservationId}` : `date_depart=gte.${decaler(auj, -7)}`
  const [reservations, lignes] = await Promise.all([
    db.lire(`reservations?select=${CHAMPS}&${filtre}&limit=2000`),
    db.lire(`agenda?select=*${reservationId ? `&reservation_id=eq.${reservationId}` : ''}`),
  ])
  const racine = env.APP_URL ?? ''
  const actions = actionsAgenda(reservations, lignes, (id) => `${racine}/reservations/r/${id}`)
  if (!actions.length) return { actif: true, mode, faites: 0, restantes: 0 }

  const google = agendaGoogle(mode, mode === 'google' ? await jetonGoogle(env) : null)
  const idCalendrier = (cle) => {
    const id = config.calendriers?.[cle]
    if (!id) throw new Error(`Calendrier « ${NOMS_CALENDRIER[cle]} » pas encore réglé (Réservations › Réglages).`)
    return id
  }
  const ecrire = async (a, champs) => {
    const ligne = { ...champs, synchronise_le: new Date().toISOString() }
    if (lignes.some((l) => l.reservation_id === a.reservation_id)) await db.modifier('agenda', `reservation_id=eq.${a.reservation_id}`, ligne)
    else await db.inserer('agenda', { reservation_id: a.reservation_id, ...ligne })
  }

  let faites = 0
  for (const a of actions.slice(0, max)) {
    try {
      if (a.genre === 'creer') {
        const id = await google.creer(idCalendrier(a.calendrier), a.evenement)
        await ecrire(a, { calendrier: a.calendrier, google_id: id, contenu: a.contenu, erreur: null })
      } else if (a.genre === 'modifier') {
        const id = await google.remplacer(idCalendrier(a.calendrier), a.ligne.google_id, a.evenement)
        await ecrire(a, { calendrier: a.calendrier, google_id: id, contenu: a.contenu, erreur: null })
      } else if (a.genre === 'deplacer') {
        const cible = idCalendrier(a.calendrier)
        await google.retirer(idCalendrier(a.ligne.calendrier), a.ligne.google_id)
        const id = await google.creer(cible, a.evenement)
        await ecrire(a, { calendrier: a.calendrier, google_id: id, contenu: a.contenu, erreur: null })
      } else {
        await google.retirer(idCalendrier(a.ligne.calendrier), a.ligne.google_id)
        await ecrire(a, { calendrier: null, google_id: null, contenu: null, erreur: null })
      }
      faites++
    } catch (e) {
      await ecrire(a, { erreur: String(e.message ?? e).slice(0, 500) }).catch(() => {})
    }
  }
  return { actif: true, mode, faites, restantes: Math.max(0, actions.length - max) }
}
