// Routes /api/calendrier/* :
//   GET  etat    : configuration et dernières synchros (sans les secrets) ;
//   POST synchro : synchro immédiate. Appelée par le bouton de l'app (jeton
//                  de session, droit d'écriture au module) ou par une
//                  automatisation Airtable (en-tête X-Jeton-Synchro =
//                  secret CALENDRIER_JETON_SYNCHRO).

import { synchroConfiguree, synchroniser } from './synchro.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** Comparaison à durée constante (le jeton ne se devine pas caractère par caractère). */
function egaux(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function sessionAutorisee(request, env) {
  const jeton = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) return false
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/peut_synchroniser`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Profile': 'calendrier',
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  return res.ok && (await res.json()) === true
}

export async function routeCalendrier(request, env, chemin) {
  const parAirtable = !!env.CALENDRIER_JETON_SYNCHRO && egaux(request.headers.get('X-Jeton-Synchro'), env.CALENDRIER_JETON_SYNCHRO)
  if (!parAirtable && !(await sessionAutorisee(request, env))) {
    return json({ erreur: 'Accès refusé.' }, 403)
  }

  if (chemin === 'etat' && request.method === 'GET') {
    return json({
      airtable: !!env.AIRTABLE_TOKEN,
      supabase: !!env.SUPABASE_SECRET_KEY,
      jetonAutomatisation: !!env.CALENDRIER_JETON_SYNCHRO,
    })
  }

  if (chemin === 'synchro' && request.method === 'POST') {
    if (!synchroConfiguree(env)) {
      return json({ erreur: 'Secrets manquants dans Cloudflare : AIRTABLE_TOKEN et SUPABASE_SECRET_KEY.' }, 503)
    }
    try {
      return json(await synchroniser(env, parAirtable ? 'airtable' : 'app'))
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e) }, 502)
    }
  }

  return json({ erreur: 'Adresse inconnue.' }, 404)
}
