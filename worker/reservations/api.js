// Routes publiques des Réservations (aucun compte) :
//   POST /api/reservations/demande  : formulaire de demande (remplace
//        Jotform). Vérifie Turnstile (anti-robot), vérifie les réponses
//        avec les mêmes règles que la page (demande.ts), prépare la
//        réservation, puis appelle reservations.recevoir_demande avec la
//        clé secrète.
//   GET  /api/reservations/document?jeton=…&id=… : PDF d'un document de la
//        page client ; renvoie vers une adresse signée de 5 minutes du seau
//        privé (le client n'a jamais la clé ni un lien permanent).
//   GET  /api/reservations/facture?jeton=…&id=… : PDF officiel d'une facture
//        QBO de la page client.
// Routes de l'équipe (jeton de session + droit d'écrire dans Réservations) :
//   POST /api/reservations/preparer {reservation} : courriels dus préparés
//        tout de suite (sans attendre le cron) ; renvoie aussi le mode d'envoi ;
//   POST /api/reservations/envoyer {courriel} : envoie un courriel préparé ;
//   POST /api/reservations/agenda {reservation?} : Google Agenda à jour tout de suite ;
//   POST /api/reservations/airbnb : lit les iCal d'Airbnb tout de suite.
//
// Secrets : SUPABASE_SECRET_KEY et TURNSTILE_SECRET (Cloudflare en PROD,
// .dev.vars en DEV).

import { aujourdhui, erreurs, nettoyer, REPONSES_VIDES, versReservation } from '../../src/modules/reservations/demande.ts'
import { lireReglages } from '../../src/modules/reservations/parametres.ts'
import { pdf, session } from '../qbo/api.js'
import { qboConfigure } from '../qbo/oauth.js'
import { base } from '../subventions/base.js'
import { synchroniserAgenda } from './agenda.js'
import { importerAirbnb } from './airbnb.js'
import { envoyerCourriel, ErreurCourriel, modeEnvoi, preparerCourriels } from './courriels.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const introuvable = () => new Response('Document introuvable.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export async function verifierTurnstile(env, jeton, ip) {
  if (!env.TURNSTILE_SECRET || typeof jeton !== 'string' || !jeton) return false
  const corps = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: jeton })
  if (ip) corps.set('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: corps })
  if (!res.ok) return false
  const r = await res.json()
  return r.success === true
}

/** Seules les réponses connues, en texte. */
function lireReponses(brutes) {
  const r = { ...REPONSES_VIDES }
  if (brutes && typeof brutes === 'object') {
    for (const cle of Object.keys(REPONSES_VIDES)) {
      if (typeof brutes[cle] === 'string') r[cle] = brutes[cle]
    }
  }
  return nettoyer(r)
}

async function recevoirDemande(request, env) {
  let corps
  try {
    corps = await request.json()
  } catch {
    return json({ erreur: 'requete' }, 400)
  }
  // Champ piège invisible : un robot le remplit. On fait comme si de rien n'était.
  if (corps?.piege) return json({ ok: true, numero: null })
  const langue = corps?.langue === 'en' ? 'en' : 'fr'
  const cle = String(corps?.cle ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cle)) return json({ erreur: 'requete' }, 400)

  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (!(await verifierTurnstile(env, corps.turnstile, ip))) return json({ erreur: 'robot' }, 403)

  const reponses = lireReponses(corps.reponses)
  const champs = erreurs(reponses, langue, aujourdhui())
  if (Object.keys(champs).length) return json({ erreur: 'champs', champs }, 422)

  try {
    const db = base(env, 'reservations')
    const reglages = lireReglages(await db.lire('reglages?select=cle,valeur'))
    const res = await db.rpc('recevoir_demande', {
      p_reservation: versReservation(reponses, reglages),
      p_demande: { cle, langue, reponses, adresse_ip: ip, navigateur: request.headers.get('User-Agent') ?? '' },
    })
    // Accusé de réception préparé tout de suite (envoyé seul s'il est en mode automatique).
    if (res.id && !res.deja) await preparerCourriels(env, res.id).catch((e) => console.error('Accusé non préparé :', e))
    return json({ ok: true, numero: res.numero })
  } catch (e) {
    console.error('Demande de réservation non enregistrée :', e)
    return json({ erreur: 'serveur' }, 502)
  }
}

async function documentClient(url, env) {
  const jeton = url.searchParams.get('jeton') ?? ''
  const id = url.searchParams.get('id') ?? ''
  if (!/^[0-9a-f]{48}$/.test(jeton) || !/^[0-9a-f-]{36}$/.test(id)) return introuvable()
  const db = base(env, 'reservations')
  const chemin = await db.rpc('document_client', { p_jeton: jeton, p_document: id })
  if (!chemin) return introuvable()
  const cle = env.SUPABASE_SECRET_KEY
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/reservations-documents/${chemin.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      apikey: cle,
      ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 300 }),
  })
  if (!res.ok) {
    console.error('Adresse signée impossible :', res.status, await res.text())
    return introuvable()
  }
  const { signedURL } = await res.json()
  return Response.redirect(`${env.SUPABASE_URL}/storage/v1${signedURL}`, 302)
}

/** Facture QBO de la page client : le PDF officiel, tiré de QuickBooks. */
async function factureClient(url, env) {
  const jeton = url.searchParams.get('jeton') ?? ''
  const id = url.searchParams.get('id') ?? ''
  if (!qboConfigure(env) || !/^[0-9a-f]{48}$/.test(jeton) || !/^[0-9a-f-]{36}$/.test(id)) return introuvable()
  const f = await base(env, 'reservations').rpc('facture_client', { p_jeton: jeton, p_facture: id })
  if (!f) return introuvable()
  try {
    return await pdf(env, f)
  } catch (e) {
    console.error('PDF de facture impossible :', e)
    return new Response('Facture indisponible pour le moment.', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
}

export async function routeReservations(request, env, chemin) {
  if (!env.SUPABASE_SECRET_KEY) return json({ erreur: 'serveur' }, 503)
  const url = new URL(request.url)
  if (chemin === 'demande' && request.method === 'POST') return recevoirDemande(request, env)
  if (chemin === 'document' && request.method === 'GET') return documentClient(url, env)
  if (chemin === 'facture' && request.method === 'GET') return factureClient(url, env)
  if (['preparer', 'envoyer', 'agenda', 'airbnb'].includes(chemin) && request.method === 'POST') return routeCourriels(request, env, chemin)
  return json({ erreur: 'introuvable' }, 404)
}

async function routeCourriels(request, env, chemin) {
  const s = await session(request, env)
  if (!s) return json({ erreur: 'Accès refusé.' }, 403)
  let corps = {}
  try {
    corps = await request.json()
  } catch {
    // Corps vide : erreur plus bas.
  }
  const uuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v ?? ''))
  try {
    if (chemin === 'agenda') {
      if (corps.reservation !== undefined && !uuid(corps.reservation)) return json({ erreur: 'Réservation inconnue.' }, 400)
      return json(await synchroniserAgenda(env, corps.reservation ?? null))
    }
    if (chemin === 'airbnb') return json(await importerAirbnb(env))
    if (chemin === 'preparer') {
      if (corps.reservation !== undefined && !uuid(corps.reservation)) return json({ erreur: 'Réservation inconnue.' }, 400)
      return json({ ...(await preparerCourriels(env, corps.reservation ?? null)), envoi: modeEnvoi(env) })
    }
    if (!uuid(corps.courriel)) return json({ erreur: 'Courriel inconnu.' }, 400)
    return json(await envoyerCourriel(env, corps.courriel, s.nom))
  } catch (e) {
    return json({ erreur: e.message, code: e.code ?? 'erreur' }, e instanceof ErreurCourriel ? 409 : 502)
  }
}
