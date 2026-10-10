// Appels à l'API comptable de QuickBooks Online pour une compagnie : jeton
// d'accès rafraîchi au besoin (et gardé chiffré), erreurs de QBO en clair.

import { base } from '../subventions/base.js'
import { chiffrer, dechiffrer } from './chiffre.js'
import { rafraichir, versJetons } from './oauth.js'

const ADRESSES = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
}

export class ErreurQbo extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Message lisible d'une réponse d'erreur de QBO (Fault). */
export function messageQbo(corps, statut) {
  const e = corps?.Fault?.Error?.[0]
  if (!e) return `QuickBooks a répondu ${statut}.`
  return `QuickBooks : ${e.Message}${e.Detail && e.Detail !== e.Message ? ` — ${e.Detail}` : ''}${e.code ? ` (code ${e.code})` : ''}`
}

/** Corps multipart de l'envoi d'une pièce jointe (Attachable). */
function corpsPieceJointe(meta, nom, type, octets) {
  const frontiere = `gestioncamp${crypto.randomUUID().replace(/-/g, '')}`
  const t = new TextEncoder()
  const debut = t.encode(
    `--${frontiere}\r\nContent-Disposition: form-data; name="file_metadata_01"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${frontiere}\r\nContent-Disposition: form-data; name="file_content_01"; filename="${nom.replace(/"/g, '')}"\r\nContent-Type: ${type}\r\n\r\n`,
  )
  const fin = t.encode(`\r\n--${frontiere}--\r\n`)
  // ArrayBuffer (fichier téléchargé) ou Uint8Array : seul le second a .length.
  const fichier = octets instanceof Uint8Array ? octets : new Uint8Array(octets)
  const corps = new Uint8Array(debut.length + fichier.length + fin.length)
  corps.set(debut, 0)
  corps.set(fichier, debut.length)
  corps.set(fin, debut.length + fichier.length)
  return { corps, type: `multipart/form-data; boundary=${frontiere}` }
}

/** Client QBO d'une compagnie connectée. */
export async function clientQbo(env, compagnieId) {
  const db = base(env, 'reservations')
  const [connexion] = await db.lire(`qbo_connexions?compagnie_id=eq.${compagnieId}&select=*`)
  if (!connexion) throw new ErreurQbo('non_connecte', "QuickBooks n'est pas relié pour cette compagnie (Modèles et compagnies).")
  let chiffres = connexion.jetons
  let jetons = await dechiffrer(env, chiffres)

  async function jetonAcces(forcer = false) {
    if (!forcer && Date.now() < jetons.access_expire) return jetons.access
    let r
    try {
      r = await rafraichir(env, jetons.refresh)
    } catch (e) {
      const message = e.code === 'reconnecter' ? 'La connexion à QuickBooks a expiré : reconnectez la compagnie (Modèles et compagnies).' : e.message
      await db.modifier('qbo_connexions', `compagnie_id=eq.${compagnieId}`, { erreur: message, maj_le: new Date().toISOString() })
      throw new ErreurQbo(e.code ?? 'intuit', message)
    }
    const nouveaux = versJetons(r)
    const nouveauxChiffres = await chiffrer(env, nouveaux)
    // Seulement si personne d'autre n'a rafraîchi entre-temps.
    await db.modifier('qbo_connexions', `compagnie_id=eq.${compagnieId}&jetons=eq.${encodeURIComponent(chiffres)}`, {
      jetons: nouveauxChiffres,
      erreur: null,
      maj_le: new Date().toISOString(),
    })
    chiffres = nouveauxChiffres
    jetons = nouveaux
    return jetons.access
  }

  const racine = `${ADRESSES[connexion.environnement] ?? ADRESSES.sandbox}/v3/company/${connexion.realm_id}`

  async function appel(methode, chemin, { corps, typeCorps = 'application/json', accept = 'application/json' } = {}, essai = 0) {
    const url = `${racine}/${chemin}${chemin.includes('?') ? '&' : '?'}minorversion=75`
    const res = await fetch(url, {
      method: methode,
      headers: { Authorization: `Bearer ${await jetonAcces(essai === 1)}`, Accept: accept, ...(corps ? { 'Content-Type': typeCorps } : {}) },
      body: corps,
    })
    if (res.status === 401 && essai === 0) return appel(methode, chemin, { corps, typeCorps, accept }, 1)
    // Refus passagers de QBO (403 juste après une connexion, trop de requêtes, panne) : un nouvel essai.
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && essai === 0) {
      await new Promise((r) => setTimeout(r, 1000))
      return appel(methode, chemin, { corps, typeCorps, accept }, 2)
    }
    if (!res.ok) {
      const brut = await res.text()
      let json = null
      try {
        json = JSON.parse(brut)
      } catch {
        // Réponse non JSON (XML, HTML) : message générique.
      }
      throw new ErreurQbo(json?.Fault?.Error?.[0]?.code ?? String(res.status), messageQbo(json, res.status))
    }
    return accept === 'application/json' ? res.json() : res.arrayBuffer()
  }

  return {
    connexion,
    lire: (entite, id) => appel('GET', `${entite.toLowerCase()}/${id}`).then((r) => r[entite]),
    requete: (sql) => appel('GET', `query?query=${encodeURIComponent(sql)}`).then((r) => r.QueryResponse ?? {}),
    creer: (entite, objet) => appel('POST', entite.toLowerCase(), { corps: JSON.stringify(objet) }).then((r) => r[entite]),
    modifier: (entite, objet) => appel('POST', entite.toLowerCase(), { corps: JSON.stringify({ ...objet, sparse: true }) }).then((r) => r[entite]),
    pdf: (entite, id) => appel('GET', `${entite.toLowerCase()}/${id}/pdf`, { accept: 'application/pdf' }),
    cdc: (entites, depuis) => appel('GET', `cdc?entities=${entites.join(',')}&changedSince=${encodeURIComponent(depuis)}`),
    joindre: (entite, id, nom, type, octets) => {
      const { corps, type: typeCorps } = corpsPieceJointe(
        { AttachableRef: [{ EntityRef: { type: entite, value: id } }], FileName: nom, ContentType: type },
        nom,
        type,
        octets,
      )
      return appel('POST', 'upload', { corps, typeCorps })
    },
  }
}
