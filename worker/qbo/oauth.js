// Connexion OAuth 2.0 d'une compagnie à son dossier QuickBooks Online.
// Adresses : document de découverte d'Intuit
// (https://developer.api.intuit.com/.well-known/openid_configuration).
// Secrets : QBO_CLIENT_ID, QBO_CLIENT_SECRET (application Intuit), QBO_CLE.
// QBO_ENVIRONNEMENT : « sandbox » (compagnie d'essai, par défaut) ou « production ».

import { signer } from './chiffre.js'

export const INTUIT = {
  autoriser: 'https://appcenter.intuit.com/connect/oauth2',
  jetons: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  revoquer: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
}

export const qboConfigure = (env) => !!(env.QBO_CLIENT_ID && env.QBO_CLIENT_SECRET && env.QBO_CLE && env.SUPABASE_SECRET_KEY)
export const environnement = (env) => (env.QBO_ENVIRONNEMENT === 'production' ? 'production' : 'sandbox')
export const urlRetour = (env) => `${env.APP_URL}/api/qbo/retour`

/** Adresse d'Intuit où la personne autorise l'app pour le dossier de la compagnie. */
export async function urlConnexion(env, compagnie, nom) {
  const etat = await signer(env, { c: compagnie, n: nom })
  const p = new URLSearchParams({
    client_id: env.QBO_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: urlRetour(env),
    state: etat,
  })
  return `${INTUIT.autoriser}?${p}`
}

async function demanderJetons(env, parametres) {
  const res = await fetch(INTUIT.jetons, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`)}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(parametres),
  })
  const corps = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(`Intuit a refusé les jetons : ${corps.error ?? res.status}${corps.error_description ? ` (${corps.error_description})` : ''}`)
    e.code = corps.error === 'invalid_grant' ? 'reconnecter' : 'intuit'
    throw e
  }
  return corps
}

/** Réponse d'Intuit → jetons gardés (chiffrés) : le jeton d'accès vit une heure. */
export const versJetons = (r, maintenant = Date.now()) => ({
  access: r.access_token,
  refresh: r.refresh_token,
  access_expire: maintenant + (Number(r.expires_in ?? 3600) - 120) * 1000,
  refresh_expire: r.x_refresh_token_expires_in ? maintenant + Number(r.x_refresh_token_expires_in) * 1000 : null,
})

export const echangerCode = (env, code) =>
  demanderJetons(env, { grant_type: 'authorization_code', code, redirect_uri: urlRetour(env) })

// Le jeton de rafraîchissement change régulièrement : toujours garder le dernier reçu.
export const rafraichir = (env, refresh) => demanderJetons(env, { grant_type: 'refresh_token', refresh_token: refresh })

export async function revoquer(env, refresh) {
  await fetch(INTUIT.revoquer, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`)}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: refresh }),
  }).catch(() => {})
}
