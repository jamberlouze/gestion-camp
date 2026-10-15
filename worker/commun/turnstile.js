// Vérification Cloudflare Turnstile (anti-robot) des formulaires publics :
// demande de réservation, candidature RH. Secret : TURNSTILE_SECRET
// (Cloudflare en PROD, .dev.vars en DEV avec la clé d'essai, toujours acceptée).

export async function verifierTurnstile(env, jeton, ip) {
  if (!env.TURNSTILE_SECRET || typeof jeton !== 'string' || !jeton) return false
  const corps = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: jeton })
  if (ip) corps.set('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: corps })
  if (!res.ok) return false
  const r = await res.json()
  return r.success === true
}
