// Contrat signé produit par le Worker dès la signature du client, pour que la
// page de signature le montre et le fasse télécharger tout de suite (avant :
// produit dans le navigateur de l'équipe, à l'ouverture de la fiche, qui
// reste le filet de sûreté). Même fabrication que l'app : pdfContratSigne
// (src/modules/reservations/pdf/documents.ts), chargé à la demande pour que
// les tests du Worker sous Node n'aient pas à lire les modules PDF.

import { telecharger } from '../qbo/operations.js'
import { base } from '../subventions/base.js'
import { adresseSignee, garderDocument, retirerDocument } from './documents.js'

const un = (l) => l?.[0] ?? null
const CASE_DEFAUT = { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }

export class ErreurContrat extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

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
  const { pdfContratSigne } = await import('../../src/modules/reservations/pdf/documents.ts')
  const { octets: original } = await telecharger(env, contrat.chemin)
  const octets = await pdfContratSigne(new Uint8Array(original), contrat.meta?.signature ?? CASE_DEFAUT, sig, {
    numero: r.numero,
    groupe: r.nom,
    empreinteOriginal: contrat.empreinte,
    compagnie: compagnie?.raison_sociale ?? '',
  })
  const doc = await garderDocument(env, {
    reservationId: r.id,
    genre: 'contrat_signe',
    titre: `Contrat ${r.numero} signé`,
    octets,
    estimeId: contrat.estime_id,
    // Au journal, au nom du client (comme sa signature).
    auteurNom: `${sig.nom_signataire ?? 'Client'} (client)`,
  })
  // Seulement si personne (l'équipe, à l'ouverture de la fiche) ne l'a fait entre-temps.
  await db.modifier('signatures', `id=eq.${sig.id}&document_signe_id=is.null`, { document_signe_id: doc.id })
  const apres = await lire(env, jeton)
  if (apres.sig.document_signe_id !== doc.id) {
    await retirerDocument(env, doc)
    return apres.signe
  }
  return doc
}

/** Adresse signée (5 minutes) du contrat signé ; `telecharger` : le navigateur l'enregistre. */
export async function adresseContratSigne(env, jeton, telecharger = false) {
  const { signe } = await lire(env, jeton)
  if (!signe) return null
  return adresseSignee(env, signe.chemin, telecharger ? `${signe.titre}.pdf` : null)
}
