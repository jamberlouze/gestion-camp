// Chiffrement des jetons QBO (AES-GCM) et signature du « state » OAuth
// (HMAC), avec deux clés tirées du secret QBO_CLE (32 octets en base64)
// par HKDF. Les jetons ne sont jamais en clair dans la base.

const texte = new TextEncoder()
const b64 = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets)))
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const b64url = (octets) => b64(octets).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (s) => deB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))

async function cle(env, usage) {
  if (!env.QBO_CLE) throw new Error('Secret QBO_CLE manquant.')
  const brut = deB64(env.QBO_CLE)
  if (brut.length < 32) throw new Error('QBO_CLE doit faire 32 octets (base64).')
  const maitre = await crypto.subtle.importKey('raw', brut, 'HKDF', false, ['deriveKey'])
  const parametres = { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: texte.encode(`gestion-camp-qbo-${usage}`) }
  return usage === 'jetons'
    ? crypto.subtle.deriveKey(parametres, maitre, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    : crypto.subtle.deriveKey(parametres, maitre, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])
}

export async function chiffrer(env, objet) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(env, 'jetons'), texte.encode(JSON.stringify(objet)))
  return `${b64(iv)}.${b64(chiffre)}`
}

export async function dechiffrer(env, valeur) {
  const [iv, chiffre] = String(valeur).split('.')
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await cle(env, 'jetons'), deB64(chiffre))
  return JSON.parse(new TextDecoder().decode(clair))
}

/** Données signées, valides `minutes` minutes (state OAuth). */
export async function signer(env, donnees, minutes = 15) {
  const corps = b64url(texte.encode(JSON.stringify({ ...donnees, exp: Date.now() + minutes * 60_000 })))
  const sig = await crypto.subtle.sign('HMAC', await cle(env, 'etat'), texte.encode(corps))
  return `${corps}.${b64url(sig)}`
}

/** Données d'un texte signé, ou null (signature fausse ou expirée). */
export async function verifier(env, valeur) {
  const [corps, sig] = String(valeur ?? '').split('.')
  if (!corps || !sig) return null
  let ok = false
  try {
    ok = await crypto.subtle.verify('HMAC', await cle(env, 'etat'), deB64url(sig), texte.encode(corps))
  } catch {
    return null
  }
  if (!ok) return null
  const donnees = JSON.parse(new TextDecoder().decode(deB64url(corps)))
  return donnees.exp > Date.now() ? donnees : null
}
