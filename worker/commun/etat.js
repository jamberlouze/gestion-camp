// Données signées (HMAC SHA-256) et valides quelques minutes : le « state »
// d'une connexion OAuth (RH : boîtes Gmail des compagnies). Clé tirée du
// secret SUPABASE_SECRET_KEY par HKDF (aucun secret de plus à gérer).

const texte = new TextEncoder()
const b64 = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets)))
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const b64url = (octets) => b64(octets).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (s) => deB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))

async function cle(env, usage) {
  if (!env.SUPABASE_SECRET_KEY) throw new Error('Secret SUPABASE_SECRET_KEY manquant.')
  const maitre = await crypto.subtle.importKey('raw', texte.encode(env.SUPABASE_SECRET_KEY), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: texte.encode(`gestion-camp-etat-${usage}`) },
    maitre,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  )
}

/** Données signées, valides `minutes` minutes. */
export async function signer(env, usage, donnees, minutes = 15) {
  const corps = b64url(texte.encode(JSON.stringify({ ...donnees, exp: Date.now() + minutes * 60_000 })))
  const sig = await crypto.subtle.sign('HMAC', await cle(env, usage), texte.encode(corps))
  return `${corps}.${b64url(sig)}`
}

/** Données d'un texte signé, ou null (signature fausse ou expirée). */
export async function verifier(env, usage, valeur) {
  const [corps, sig] = String(valeur ?? '').split('.')
  if (!corps || !sig) return null
  let ok = false
  try {
    ok = await crypto.subtle.verify('HMAC', await cle(env, usage), deB64url(sig), texte.encode(corps))
  } catch {
    return null
  }
  if (!ok) return null
  const donnees = JSON.parse(new TextDecoder().decode(deB64url(corps)))
  return donnees.exp > Date.now() ? donnees : null
}
