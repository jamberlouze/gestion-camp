// Routes /api/subventions/* (déclenchement manuel depuis l'onglet
// Recherches). Réservées à la direction : le jeton de session Supabase de
// la personne est vérifié par la base (fonction subventions.peut_utiliser).

import { base } from './base.js'
import { modele } from './claude.js'
import { gmailConfigure } from './courriel.js'
import { envoyerRappelEssai, rechercheConfiguree, rechercherEntreprise } from './pipeline.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** Jeton de la personne connectée, si elle fait partie de la direction. */
async function jetonDirection(request, env) {
  const jeton = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/peut_utiliser`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Profile': 'subventions',
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  return res.ok && (await res.json()) === true ? jeton : null
}

async function courrielDe(jeton, env) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${jeton}` },
  })
  return res.ok ? (await res.json()).email : null
}

/**
 * Recherche manuelle : la réponse est un flux de lignes JSON. Une ligne
 * « en_cours » toutes les 15 secondes garde la connexion ouverte pendant
 * les quelques minutes de la recherche ; la dernière ligne donne le bilan
 * (ou l'erreur). Le Worker s'arrête si la page est fermée avant la fin.
 */
function rechercheEnFlux(env, parametres) {
  const { readable, writable } = new TransformStream()
  const ecrivain = writable.getWriter()
  const encodeur = new TextEncoder()
  const ecrire = (o) => ecrivain.write(encodeur.encode(`${JSON.stringify(o)}\n`)).catch(() => {})
  const battement = setInterval(() => ecrire({ etat: 'en_cours' }), 15000)
  const travail = (async () => {
    await ecrire({ etat: 'en_cours' })
    try {
      await ecrire({ fin: true, ...(await rechercherEntreprise(env, parametres)) })
    } catch (e) {
      await ecrire({ fin: true, erreur: e instanceof Error ? e.message : String(e) })
    } finally {
      clearInterval(battement)
      await ecrivain.close().catch(() => {})
    }
  })()
  return { reponse: new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } }), travail }
}

export async function routeSubventions(request, env, ctx, chemin) {
  const jeton = await jetonDirection(request, env)
  if (!jeton) return json({ erreur: 'Réservé aux administrateurs et à la direction.' }, 403)

  // État de la configuration (sans jamais renvoyer les secrets eux-mêmes).
  if (chemin === 'etat' && request.method === 'GET') {
    return json({
      anthropic: !!env.ANTHROPIC_API_KEY,
      supabase: !!env.SUPABASE_SECRET_KEY,
      gmail: gmailConfigure(env),
      modele: modele(env),
    })
  }

  if (chemin === 'recherche' && request.method === 'POST') {
    if (!rechercheConfiguree(env)) {
      return json({ erreur: 'Secrets manquants dans Cloudflare : ANTHROPIC_API_KEY et SUPABASE_SECRET_KEY.' }, 503)
    }
    const corps = await request.json().catch(() => ({}))
    if (typeof corps.company_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(corps.company_id)) {
      return json({ erreur: 'Entreprise manquante.' }, 400)
    }
    const depuis = encodeURIComponent(new Date(Date.now() - 20 * 60 * 1000).toISOString())
    const enCours = await base(env).lire(
      `grant_search_runs?company_id=eq.${corps.company_id}&finished_at=is.null&started_at=gte.${depuis}&select=id`,
    )
    if (enCours.length) return json({ erreur: 'Une recherche est déjà en cours pour cette entreprise.' }, 409)

    const { reponse, travail } = rechercheEnFlux(env, {
      entrepriseId: corps.company_id,
      declencheur: 'manuel',
      sansMemoire: corps.sans_memoire === true,
    })
    ctx.waitUntil(travail)
    return reponse
  }

  if (chemin === 'courriel' && request.method === 'POST') {
    if (!env.SUPABASE_SECRET_KEY) return json({ erreur: 'Secret manquant dans Cloudflare : SUPABASE_SECRET_KEY.' }, 503)
    if (!gmailConfigure(env)) return json({ erreur: 'Gmail n’est pas configuré (secrets GMAIL_* manquants dans Cloudflare).' }, 503)
    const courriel = await courrielDe(jeton, env)
    if (!courriel) return json({ erreur: 'Adresse de la personne connectée introuvable.' }, 400)
    try {
      await envoyerRappelEssai(env, courriel)
      return json({ envoye: courriel })
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e) }, 502)
    }
  }

  return json({ erreur: 'Adresse inconnue.' }, 404)
}
