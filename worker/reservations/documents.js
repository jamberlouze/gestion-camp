// Documents gardés par le Worker (contrat signé, pré-arrivée) : même seau
// privé, même nom de fichier et même ligne que garderDocument de l'app
// (productionPdf.ts). Au journal, au nom donné (`auteurNom`).

import { base } from '../subventions/base.js'

export const SEAU = 'reservations-documents'

const entetes = (env, extra = {}) => {
  const cle = env.SUPABASE_SECRET_KEY
  return { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}), ...extra }
}
const adresseObjet = (env, chemin) => `${env.SUPABASE_URL}/storage/v1/object/${SEAU}/${chemin.split('/').map(encodeURIComponent).join('/')}`

/** Empreinte SHA-256 (hexadécimal), comme pdf/documents.ts. */
async function empreinte(octets) {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(octets))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Garde un PDF dans le seau privé et l'inscrit dans reservations.documents. */
export async function garderDocument(env, { reservationId, genre, titre, octets, estimeId = null, meta = {}, auteurNom = null, signatureId = null }) {
  const id = crypto.randomUUID()
  const chemin = `${reservationId}/${genre}-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}.pdf`
  const envoi = await fetch(adresseObjet(env, chemin), { method: 'POST', headers: entetes(env, { 'Content-Type': 'application/pdf' }), body: octets })
  if (!envoi.ok) throw new Error(`PDF non gardé (${envoi.status}) : ${await envoi.text()}`)
  try {
    return await base(env, 'reservations').inserer('documents', {
      id,
      reservation_id: reservationId,
      genre,
      estime_id: estimeId,
      titre,
      chemin,
      empreinte: await empreinte(octets),
      meta,
      cree_par_nom: auteurNom,
      // Contrat signé : sa signature (un seul par signature, relié par la base).
      ...(signatureId ? { signature_id: signatureId } : {}),
    })
  } catch (e) {
    await retirerFichier(env, chemin)
    throw e
  }
}

export const retirerFichier = (env, chemin) =>
  fetch(`${env.SUPABASE_URL}/storage/v1/object/${SEAU}`, {
    method: 'DELETE',
    headers: entetes(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [chemin] }),
  })

/** Retire un document gardé (ligne et fichier). */
export async function retirerDocument(env, doc) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/documents?id=eq.${doc.id}`, {
    method: 'DELETE',
    headers: entetes(env, { 'Content-Profile': 'reservations', 'Accept-Profile': 'reservations' }),
  })
  await retirerFichier(env, doc.chemin)
}

/** Adresse signée (5 minutes) d'un document ; `nomTelechargement` : le navigateur l'enregistre sous ce nom. */
export async function adresseSignee(env, chemin, nomTelechargement = null) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${SEAU}/${chemin.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: entetes(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 300 }),
  })
  if (!res.ok) throw new Error(`Adresse signée impossible (${res.status}).`)
  const { signedURL } = await res.json()
  return `${env.SUPABASE_URL}/storage/v1${signedURL}${nomTelechargement ? `&download=${encodeURIComponent(nomTelechargement)}` : ''}`
}
