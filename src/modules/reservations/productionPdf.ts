// Documents dans l'app : produire les PDF (pdf/), les garder dans le seau
// privé avec leur empreinte, préparer la signature du contrat.

import { urlPublique } from '@/lib/pagesPubliques'
import { supabase } from '@/lib/supabase'
import type { Contact, Organisation } from '@/modules/crm/types'
import type { Contexte } from './pdf/champs'
import { empreinte, pdfContrat, pdfContratSigne, pdfEstime, pdfPreArrivee, type LigneDoc, type Ressources } from './pdf/documents'
import type { Compagnie, DocumentPdf, Estime, EtageRooming, GenreDocument, Modele, Reservation, Signature } from './types'

export const SEAU = 'reservations-documents'
const db = () => supabase.schema('reservations')

/** Logos (dossier public de l'app) et annexes (seau privé). */
export const ressources: Ressources = {
  async fichier(chemin) {
    if (chemin.startsWith('/')) {
      const r = await fetch(chemin)
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    }
    const { data } = await supabase.storage.from(SEAU).download(chemin)
    return data ? new Uint8Array(await data.arrayBuffer()) : null
  },
}

export interface Sources {
  r: Reservation
  compagnies: Compagnie[]
  orgParId: Map<string, Organisation>
  contactParId: Map<string, Contact>
  etages: EtageRooming[]
}

export function contexte(s: Sources, estime: Contexte['estime']): Contexte {
  const { r } = s
  const compagnie = s.compagnies.find((c) => c.entreprise_id === r.compagnie_id) ?? s.compagnies[0]
  if (!compagnie) throw new Error('Coordonnées de la compagnie introuvables (Réglages › Compagnies).')
  const org = r.organisation_id ? s.orgParId.get(r.organisation_id) : undefined
  const contact = r.contact_reservation_id ? s.contactParId.get(r.contact_reservation_id) : undefined
  return {
    r,
    compagnie,
    client: org ? { nom: org.nom, adresse: org.adresse, ville: org.ville, province: org.province, code_postal: org.code_postal } : null,
    contact: contact ? { nom: contact.nom, courriel: contact.courriel, telephone: contact.telephone } : null,
    estime,
    etages: s.etages,
    maintenant: new Date(),
  }
}

async function lignesDe(estimeId: string): Promise<LigneDoc[]> {
  const { data, error } = await db().from('lignes').select('*').eq('estime_id', estimeId).order('ordre')
  if (error) throw error
  return (data as LigneDoc[]).map((l) => ({
    ...l,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    montant: Number(l.montant),
    pourcentage: l.pourcentage === null ? null : Number(l.pourcentage),
  }))
}

export async function pdfDeLEstime(s: Sources, estime: Estime, lignes?: LigneDoc[]) {
  return pdfEstime(contexte(s, estime), lignes ?? (await lignesDe(estime.id)), ressources)
}

/** Ouvre un PDF dans un nouvel onglet. */
export function ouvrirPdf(octets: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(octets)], { type: 'application/pdf' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Ouvre un document gardé (adresse signée, 10 minutes). */
export async function ouvrirDocument(d: Pick<DocumentPdf, 'chemin'>) {
  const onglet = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(SEAU).createSignedUrl(d.chemin, 600)
  if (error || !data) {
    onglet?.close()
    throw error ?? new Error('Document introuvable.')
  }
  if (onglet) onglet.location.href = data.signedUrl
}

/** Garde un PDF dans le seau privé et l'inscrit (avec son empreinte). */
export async function garderDocument(o: {
  r: Reservation
  genre: GenreDocument
  titre: string
  octets: Uint8Array
  estimeId?: string | null
  meta?: DocumentPdf['meta']
}): Promise<DocumentPdf> {
  const id = crypto.randomUUID()
  const chemin = `${o.r.id}/${o.genre}-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}.pdf`
  const { error: e1 } = await supabase.storage.from(SEAU).upload(chemin, new Blob([new Uint8Array(o.octets)], { type: 'application/pdf' }), {
    contentType: 'application/pdf',
  })
  if (e1) throw e1
  const ligne = {
    id,
    reservation_id: o.r.id,
    genre: o.genre,
    estime_id: o.estimeId ?? null,
    titre: o.titre,
    chemin,
    empreinte: await empreinte(o.octets),
    meta: o.meta ?? {},
  }
  const { data, error } = await db().from('documents').insert(ligne).select().single()
  if (error) {
    await supabase.storage.from(SEAU).remove([chemin])
    throw error
  }
  return data as DocumentPdf
}

const versionDe = (e: Pick<Estime, 'version'>) => (e.version > 1 ? ` v${e.version}` : '')

/** L'estimé envoyé est gardé tel quel (preuve de ce que le client a reçu). */
export async function garderEstime(s: Sources, estime: Estime) {
  const octets = await pdfDeLEstime(s, estime)
  return garderDocument({ r: s.r, genre: 'estime', titre: `Estimé ${s.r.numero}${versionDe(estime)}`, octets, estimeId: estime.id })
}

/**
 * Contrat : pré-signé par la direction, avec l'estimé accepté en annexe ;
 * gardé, puis une demande de signature est ouverte (lien secret). La
 * demande précédente, s'il y en a une, est annulée. Étape → Contrat envoyé.
 */
export async function preparerContrat(s: Sources, estime: Estime, modele: Modele): Promise<Signature> {
  const ctx = contexte(s, estime)
  const annexe = await pdfEstime(ctx, await lignesDe(estime.id), ressources)
  const contrat = await pdfContrat(ctx, modele, annexe, ressources)
  const doc = await garderDocument({
    r: s.r,
    genre: 'contrat',
    titre: `Contrat ${s.r.numero}`,
    octets: contrat.octets,
    estimeId: estime.id,
    meta: { signature: contrat.signature },
  })
  const { data: url, error: e1 } = await supabase.storage.from(SEAU).createSignedUrl(doc.chemin, 60 * 24 * 3600)
  if (e1 || !url) throw e1 ?? new Error('Adresse du contrat impossible à créer.')
  const { error: e2 } = await db().from('signatures').update({ statut: 'annule' }).eq('reservation_id', s.r.id).eq('statut', 'en_attente')
  if (e2) throw e2
  const { data, error } = await db().from('signatures').insert({ reservation_id: s.r.id, document_id: doc.id, adresse_pdf: url.signedUrl }).select().single()
  if (error) throw error
  if (['nouvelle', 'contact', 'estime_envoye', 'estime_accepte'].includes(s.r.etape)) {
    await db().from('reservations').update({ etape: 'contrat_envoye' }).eq('id', s.r.id)
  }
  return data as Signature
}

/** Lien de la page de signature, à envoyer au client. */
export const lienSignature = (sig: Pick<Signature, 'jeton'>) => urlPublique(`/signer/${sig.jeton}`)

/** Contrat signé : la signature est posée sur le contrat envoyé, avec le certificat. */
export async function produireContratSigne(s: Sources, sig: Signature, contratEnvoye: DocumentPdf): Promise<DocumentPdf> {
  const { data, error } = await supabase.storage.from(SEAU).download(contratEnvoye.chemin)
  if (error || !data) throw error ?? new Error('Contrat envoyé introuvable.')
  const original = new Uint8Array(await data.arrayBuffer())
  const caseSig = contratEnvoye.meta.signature ?? { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }
  const compagnie = s.compagnies.find((c) => c.entreprise_id === s.r.compagnie_id)
  const octets = await pdfContratSigne(original, caseSig, sig, {
    numero: s.r.numero,
    groupe: s.r.nom,
    empreinteOriginal: contratEnvoye.empreinte,
    compagnie: compagnie?.raison_sociale ?? '',
  })
  const doc = await garderDocument({ r: s.r, genre: 'contrat_signe', titre: `Contrat ${s.r.numero} signé`, octets, estimeId: contratEnvoye.estime_id })
  const { error: e2 } = await db().from('signatures').update({ document_signe_id: doc.id }).eq('id', sig.id)
  if (e2) throw e2
  return doc
}

export async function pdfDeLaPreArrivee(s: Sources, estime: Contexte['estime'], modele: Pick<Modele, 'titre' | 'contenu'>) {
  return pdfPreArrivee(contexte(s, estime), modele, ressources)
}

/** Aperçu d'un contrat (rien n'est gardé) : sert à essayer un modèle. */
export async function apercuContrat(s: Sources, estime: Estime | null, modele: Pick<Modele, 'titre' | 'contenu'>) {
  const ctx = contexte(s, estime)
  const annexe = estime ? await pdfEstime(ctx, await lignesDe(estime.id), ressources) : null
  return (await pdfContrat(ctx, modele, annexe, ressources)).octets
}

/** Estimé courant d'une réservation (accepté, sinon le plus récent). */
export async function estimeCourant(reservationId: string): Promise<Estime | null> {
  const { data, error } = await db().from('estimes').select('*').eq('reservation_id', reservationId).order('version', { ascending: false })
  if (error) throw error
  const l = data as Estime[]
  return l.find((e) => e.statut === 'accepte') ?? l[0] ?? null
}
