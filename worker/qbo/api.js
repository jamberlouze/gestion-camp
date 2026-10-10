// Routes /api/qbo/* (équipe : jeton de session + droit d'écrire dans
// Réservations, vérifiés par reservations.peut_facturer) :
//   GET  etat        : QBO configuré ? environnement ;
//   POST connexion   : {compagnie} → adresse d'autorisation d'Intuit ;
//   GET  retour      : retour d'Intuit (code, state signé, realmId) → jetons chiffrés ;
//   POST deconnexion : {compagnie} ;
//   POST listes      : {compagnie} → articles, codes de taxes, conditions ;
//   POST clients     : {reservation} → client QBO relié ou candidats ;
//   POST devis       : {reservation, client?} → crée ou met à jour le devis
//                      (réservation annulée : frais d'annulation, F17) ;
//   POST echeancier  : {reservation} → relances refaites (échéancier convenu, F2) ;
//   POST document    : {reservation, genre: separee | note_credit, lignes, note} ;
//   POST synchro     : {compagnie?} → synchro immédiate ;
//   POST pdf         : {facture} → PDF de QBO.

import { base } from '../subventions/base.js'
import { chiffrer, dechiffrer, verifier } from './chiffre.js'
import { clientQbo, ErreurQbo } from './client.js'
import { echangerCode, environnement, qboConfigure, revoquer, urlConnexion, versJetons } from './oauth.js'
import { candidatsClients, devis, document, listes, majEcheancier, synchroniserCompagnie, synchroniserTout } from './operations.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const erreur = (e) => {
  const message = e instanceof Error ? e.message : String(e)
  const code = e instanceof ErreurQbo ? e.code : 'erreur'
  const statut = ['non_connecte', 'reglages', 'estime', 'organisation', 'client', 'doublon', 'lignes', 'introuvable', 'compagnie', 'annulation'].includes(code) ? 409 : 502
  return json({ erreur: message, code }, statut)
}

/** Session de l'équipe : { ok, nom } d'après reservations.peut_facturer. */
async function session(request, env) {
  const jeton = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/peut_facturer`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Profile': 'reservations',
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!res.ok) return null
  const r = await res.json()
  return r?.ok ? r : null
}

const pageModeles = (env, parametres) => Response.redirect(`${env.APP_URL}/reservations/modeles?${new URLSearchParams(parametres)}`, 302)

async function retour(url, env) {
  const etat = await verifier(env, url.searchParams.get('state'))
  if (!etat) return pageModeles(env, { qbo: 'erreur', message: 'Lien de connexion expiré : recommencez.' })
  if (url.searchParams.get('error')) return pageModeles(env, { qbo: 'erreur', message: `Connexion refusée (${url.searchParams.get('error')}).` })
  const code = url.searchParams.get('code')
  const realm = url.searchParams.get('realmId')
  if (!code || !realm) return pageModeles(env, { qbo: 'erreur', message: 'Réponse incomplète de QuickBooks.' })
  try {
    const jetons = versJetons(await echangerCode(env, code))
    const db = base(env, 'reservations')
    const ligne = {
      compagnie_id: etat.c,
      realm_id: realm,
      environnement: environnement(env),
      jetons: await chiffrer(env, jetons),
      connecte_le: new Date().toISOString(),
      connecte_par_nom: etat.n ?? null,
      derniere_synchro: null,
      erreur: null,
      maj_le: new Date().toISOString(),
    }
    const [existante] = await db.lire(`qbo_connexions?compagnie_id=eq.${etat.c}&select=realm_id`)
    if (existante && existante.realm_id !== realm) {
      return pageModeles(env, { qbo: 'erreur', message: "Ce n'est pas le même dossier QuickBooks que celui déjà relié : déconnectez d'abord la compagnie." })
    }
    if (existante) await db.modifier('qbo_connexions', `compagnie_id=eq.${etat.c}`, ligne)
    else await db.inserer('qbo_connexions', ligne)
    return pageModeles(env, { qbo: 'ok' })
  } catch (e) {
    return pageModeles(env, { qbo: 'erreur', message: e.message })
  }
}

async function corpsJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

export async function routeQbo(request, env, chemin) {
  const url = new URL(request.url)
  if (chemin === 'retour' && request.method === 'GET') {
    if (!qboConfigure(env)) return json({ erreur: 'QuickBooks non configuré.' }, 503)
    return retour(url, env)
  }

  const s = await session(request, env)
  if (!s) return json({ erreur: 'Accès refusé.' }, 403)

  if (chemin === 'etat' && request.method === 'GET') {
    return json({ configure: qboConfigure(env), environnement: environnement(env) })
  }
  if (!qboConfigure(env)) {
    return json({ erreur: 'QuickBooks n’est pas encore configuré (secrets QBO_CLIENT_ID, QBO_CLIENT_SECRET et QBO_CLE).', code: 'configuration' }, 503)
  }
  if (request.method !== 'POST') return json({ erreur: 'Méthode non permise.' }, 405)
  const corps = await corpsJson(request)

  try {
    switch (chemin) {
      case 'connexion': {
        const [c] = /^[0-9a-f-]{36}$/.test(String(corps.compagnie))
          ? await base(env, 'reservations').lire(`compagnies?entreprise_id=eq.${corps.compagnie}&select=entreprise_id`)
          : []
        if (!c) return json({ erreur: 'Compagnie inconnue.' }, 400)
        return json({ url: await urlConnexion(env, c.entreprise_id, s.nom) })
      }
      case 'deconnexion': {
        const db = base(env, 'reservations')
        const [c] = await db.lire(`qbo_connexions?compagnie_id=eq.${corps.compagnie}&select=jetons`)
        if (c) {
          await revoquer(env, (await dechiffrer(env, c.jetons)).refresh)
          await fetch(`${env.SUPABASE_URL}/rest/v1/qbo_connexions?compagnie_id=eq.${corps.compagnie}`, {
            method: 'DELETE',
            headers: {
              apikey: env.SUPABASE_SECRET_KEY,
              ...(env.SUPABASE_SECRET_KEY?.startsWith('eyJ') ? { Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } : {}),
              'Content-Profile': 'reservations',
            },
          })
        }
        return json({ ok: true })
      }
      case 'listes':
        return json(await listes(env, corps.compagnie))
      case 'clients':
        return json(await candidatsClients(env, corps.reservation))
      case 'devis':
        return json(await devis(env, corps.reservation, corps.client, s.nom))
      case 'echeancier':
        return json(await majEcheancier(env, corps.reservation))
      case 'document':
        if (!['separee', 'note_credit'].includes(corps.genre)) return json({ erreur: 'Genre inconnu.' }, 400)
        return json(await document(env, corps.reservation, corps.genre, corps.lignes, corps.note))
      case 'synchro':
        return json(corps.compagnie ? [await synchroniserCompagnie(env, corps.compagnie)] : await synchroniserTout(env))
      case 'pdf': {
        const [f] = await base(env, 'reservations').lire(`factures?id=eq.${corps.facture}&select=compagnie_id,qbo_type,qbo_id,numero`)
        if (!f) return json({ erreur: 'Facture introuvable.' }, 404)
        return pdf(env, f)
      }
      default:
        return json({ erreur: 'Route inconnue.' }, 404)
    }
  } catch (e) {
    return erreur(e)
  }
}

/** PDF officiel d'une facture ou d'une note de crédit, tiré de QBO. */
export async function pdf(env, f) {
  const qbo = await clientQbo(env, f.compagnie_id)
  const octets = await qbo.pdf(f.qbo_type, f.qbo_id)
  return new Response(octets, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${f.qbo_type === 'CreditMemo' ? 'note-de-credit' : 'facture'}-${f.numero ?? f.qbo_id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
