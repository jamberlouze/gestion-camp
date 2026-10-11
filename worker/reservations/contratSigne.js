// Contrat signé produit par le Worker dès la signature du client, pour que la
// page de signature le montre et le fasse télécharger tout de suite (avant :
// produit dans le navigateur de l'équipe, à l'ouverture de la fiche, qui
// reste le filet de sûreté). Même fabrication que l'app : pdfContratSigne
// (src/modules/reservations/pdf/documents.ts), chargé à la demande pour que
// les tests du Worker sous Node n'aient pas à lire les modules PDF.

import { telecharger } from '../qbo/operations.js'
import { base } from '../subventions/base.js'

const SEAU = 'reservations-documents'
const un = (l) => l?.[0] ?? null
const CASE_DEFAUT = { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }

export class ErreurContrat extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const entetes = (env, extra = {}) => {
  const cle = env.SUPABASE_SECRET_KEY
  return { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}), ...extra }
}
const adresseObjet = (env, chemin) => `${env.SUPABASE_URL}/storage/v1/object/${SEAU}/${chemin.split('/').map(encodeURIComponent).join('/')}`

/** Signature signée d'après son jeton, et son contrat signé s'il existe déjà. */
async function lire(env, jeton) {
  const db = base(env, 'reservations')
  const sig = un(await db.lire(`signatures?jeton=eq.${jeton}&select=*`))
  if (!sig || sig.statut !== 'signe') throw new ErreurContrat('introuvable', "Ce contrat n'est pas signé.")
  const signe = sig.document_signe_id ? un(await db.lire(`documents?id=eq.${sig.document_signe_id}&select=*`)) : null
  return { db, sig, signe }
}

/**
 * Produit le contrat signé (signature posée dans sa case + certificat), le
 * garde et le relie à la signature. Sans effet s'il existe déjà.
 */
export async function produireContratSigne(env, jeton) {
  const { db, sig, signe } = await lire(env, jeton)
  if (signe) return signe
  const contrat = un(await db.lire(`documents?id=eq.${sig.document_id}&select=*`))
  if (!contrat) throw new ErreurContrat('introuvable', 'Contrat envoyé introuvable.')
  const r = un(await db.lire(`reservations?id=eq.${sig.reservation_id}&select=id,numero,nom,compagnie_id`))
  const compagnie = un(await db.lire(`compagnies?entreprise_id=eq.${r.compagnie_id}&select=raison_sociale`))
  const { pdfContratSigne, empreinte } = await import('../../src/modules/reservations/pdf/documents.ts')
  const { octets: original } = await telecharger(env, contrat.chemin)
  const octets = await pdfContratSigne(new Uint8Array(original), contrat.meta?.signature ?? CASE_DEFAUT, sig, {
    numero: r.numero,
    groupe: r.nom,
    empreinteOriginal: contrat.empreinte,
    compagnie: compagnie?.raison_sociale ?? '',
  })

  const id = crypto.randomUUID()
  const chemin = `${r.id}/contrat_signe-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}.pdf`
  const envoi = await fetch(adresseObjet(env, chemin), { method: 'POST', headers: entetes(env, { 'Content-Type': 'application/pdf' }), body: octets })
  if (!envoi.ok) throw new Error(`Contrat signé non gardé (${envoi.status}) : ${await envoi.text()}`)
  const retirerFichier = () => fetch(`${env.SUPABASE_URL}/storage/v1/object/${SEAU}`, {
    method: 'DELETE',
    headers: entetes(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [chemin] }),
  })
  let doc
  try {
    doc = await db.inserer('documents', {
      id,
      reservation_id: r.id,
      genre: 'contrat_signe',
      estime_id: contrat.estime_id,
      titre: `Contrat ${r.numero} signé`,
      chemin,
      empreinte: await empreinte(octets),
      meta: {},
      // Au journal, au nom du client (comme sa signature).
      cree_par_nom: `${sig.nom_signataire ?? 'Client'} (client)`,
    })
  } catch (e) {
    await retirerFichier()
    throw e
  }
  // Seulement si personne (l'équipe, à l'ouverture de la fiche) ne l'a fait entre-temps.
  await db.modifier('signatures', `id=eq.${sig.id}&document_signe_id=is.null`, { document_signe_id: doc.id })
  const apres = await lire(env, jeton)
  if (apres.sig.document_signe_id !== doc.id) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/documents?id=eq.${doc.id}`, {
      method: 'DELETE',
      headers: entetes(env, { 'Content-Profile': 'reservations', 'Accept-Profile': 'reservations' }),
    })
    await retirerFichier()
    return apres.signe
  }
  return doc
}

/** Adresse signée (5 minutes) du contrat signé ; `telecharger` : le navigateur l'enregistre. */
export async function adresseContratSigne(env, jeton, telecharger = false) {
  const { signe } = await lire(env, jeton)
  if (!signe) return null
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${SEAU}/${signe.chemin.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: entetes(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 300 }),
  })
  if (!res.ok) throw new Error(`Adresse signée impossible (${res.status}).`)
  const { signedURL } = await res.json()
  const nom = `${signe.titre}.pdf`
  return `${env.SUPABASE_URL}/storage/v1${signedURL}${telecharger ? `&download=${encodeURIComponent(nom)}` : ''}`
}
