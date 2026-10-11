// PDF de pré-arrivée produit par le Worker au moment de l'envoi du courriel
// (à la main ou en mode automatique). Même fabrication que l'app :
// contexte (pdf/contexte.ts) et pdfPreArrivee (pdf/documents.ts), chargés à
// la demande pour que les tests du Worker sous Node n'aient pas à les lire.

import { telecharger } from '../qbo/operations.js'
import { base } from '../subventions/base.js'
import { garderDocument } from './documents.js'

const un = (l) => l?.[0] ?? null
const ETAGES = ['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH']

/** Logos (fichiers publics de l'app, servis par ASSETS) et annexes (seau privé). */
function ressources(env) {
  return {
    async fichier(chemin) {
      try {
        if (chemin?.startsWith('/')) {
          const adresse = new URL(chemin, env.ASSETS ? 'https://assets.local' : env.APP_URL)
          const res = env.ASSETS ? await env.ASSETS.fetch(new Request(adresse)) : await fetch(adresse)
          // Adresse inconnue : l'app renvoie index.html ; seule une image compte.
          return res.ok && res.headers.get('content-type')?.startsWith('image/') ? new Uint8Array(await res.arrayBuffer()) : null
        }
        return new Uint8Array((await telecharger(env, chemin)).octets)
      } catch {
        return null
      }
    },
  }
}

/** Lits et chambres actifs par étage (comme reservations.lits_par_etage, sans session). */
async function etages(env) {
  const rooming = base(env, 'rooming')
  const lieux = await rooming.lire(`lieux?actif=eq.true&code=in.(${ETAGES.join(',')})&select=id,code,nom`)
  if (!lieux.length) return []
  const chambres = await rooming.lire(`chambres?actif=eq.true&lieu_id=in.(${lieux.map((l) => l.id).join(',')})&select=lieu_id,lits`)
  return lieux
    .map((l) => {
      const siennes = chambres.filter((c) => c.lieu_id === l.id)
      return { code: l.code, nom: l.nom, lits: siennes.reduce((t, c) => t + Number(c.lits), 0), chambres: siennes.length }
    })
    .filter((e) => e.chambres > 0)
}

/** Produit et garde le PDF de pré-arrivée d'une réservation ; renvoie le document et ses octets. */
export async function produirePreArrivee(env, reservationId, auteurNom) {
  const db = base(env, 'reservations')
  const crm = base(env, 'crm')
  const r = un(await db.lire(`reservations?id=eq.${reservationId}&select=*`))
  if (!r) throw new Error('Réservation introuvable.')
  const [compagnies, modeles, estimes, lits, orgs, contacts] = await Promise.all([
    db.lire('compagnies?select=*'),
    db.lire(`modeles?genre=eq.pre_arrivee&forfait=eq.${r.forfait}&select=titre,contenu`),
    db.lire(`estimes?reservation_id=eq.${r.id}&select=*&order=version.desc`),
    etages(env),
    r.organisation_id ? crm.lire(`organisations?id=eq.${r.organisation_id}&select=*`) : [],
    r.contact_reservation_id ? crm.lire(`contacts?id=eq.${r.contact_reservation_id}&select=*`) : [],
  ])
  const modele = un(modeles)
  if (!modele) throw new Error('Pas de modèle de pré-arrivée pour ce forfait (Modèles et compagnies).')
  // Comme estimeCourant de l'app : l'accepté, sinon le plus récent.
  const estime = estimes.find((e) => e.statut === 'accepte') ?? estimes[0] ?? null
  const { contexte } = await import('../../src/modules/reservations/pdf/contexte.ts')
  const { pdfPreArrivee } = await import('../../src/modules/reservations/pdf/documents.ts')
  const sources = {
    r,
    compagnies,
    orgParId: new Map(orgs.map((o) => [o.id, o])),
    contactParId: new Map(contacts.map((c) => [c.id, c])),
    etages: lits,
  }
  const octets = await pdfPreArrivee(contexte(sources, estime), modele, ressources(env))
  const doc = await garderDocument(env, { reservationId: r.id, genre: 'pre_arrivee', titre: `Pré-arrivée ${r.numero}`, octets, auteurNom })
  return { doc, octets }
}
