// Client minimal de l'API Google Agenda (événements d'un calendrier), pour
// les modules qui écrivent dans un agenda Google. Les Réservations ont le
// leur (reservations/agenda.js) ; celui-ci sert d'abord à Subventions.
//
// - Base locale (DEV) : jamais Google, tout est simulé (« simule:… »).
// - Sinon : client OAuth interne (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
//   README section 8) + un jeton d'actualisation de portée calendar.events,
//   autorisé par un compte qui peut modifier le calendrier.

/** Premier secret présent parmi les noms donnés. */
const jetonActualisation = (env, noms) => noms.map((n) => env[n]).find((v) => typeof v === 'string' && v.trim())

/** « simule » (base locale), « google » ou « non_configure ». */
export function modeAgenda(env, nomsJeton) {
  if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? '')) return 'simule'
  return env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && jetonActualisation(env, nomsJeton) ? 'google' : 'non_configure'
}

async function jetonAcces(env, nomsJeton) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: jetonActualisation(env, nomsJeton),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google a refusé le jeton de l'agenda (${res.status}) : ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).access_token
}

/**
 * Créer, remplacer et retirer des événements. En simulation, rien ne sort
 * (identifiants « simule:… »).
 * @returns {Promise<{ creer(calendrier: string, ev: object): Promise<string>,
 *                     remplacer(calendrier: string, id: string, ev: object): Promise<string>,
 *                     retirer(calendrier: string, id: string): Promise<void> }>}
 */
export async function clientAgenda(env, mode, nomsJeton) {
  if (mode === 'simule') {
    return {
      creer: async () => `simule:${crypto.randomUUID()}`,
      remplacer: async (_c, id) => id,
      retirer: async () => {},
    }
  }
  if (mode !== 'google') throw new Error('Google Agenda n’est pas configuré.')
  const jeton = await jetonAcces(env, nomsJeton)
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
