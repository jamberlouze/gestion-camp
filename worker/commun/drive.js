// Client minimal de l'API Google Drive (v3) pour déposer des copies dans les
// Drive partagés (worker/drive/copie.js). Jamais d'effacement : on liste,
// on crée des dossiers et on ajoute des fichiers, c'est tout.
//
// - Base locale (DEV) : jamais Google, tout est simulé (« simule:… »).
// - Sinon : client OAuth du projet Google « Copie Drive » (à part et
//   Internal : la portée drive complète n'est permise sans examen de Google
//   que pour un client Internal, et la bascule RH passe le client GMAIL_* en
//   External) : DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, plus un jeton
//   d'actualisation de portée drive, DRIVE_REFRESH_TOKEN, autorisé par un
//   membre des Drive partagés (README, section 17).

const API = 'https://www.googleapis.com/drive/v3'
const ENVOI = 'https://www.googleapis.com/upload/drive/v3'
const DOSSIER = 'application/vnd.google-apps.folder'

/** « simule » (base locale), « google » ou « non_configure ». */
export function modeDrive(env) {
  if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? '')) return 'simule'
  return env.DRIVE_CLIENT_ID && env.DRIVE_CLIENT_SECRET && env.DRIVE_REFRESH_TOKEN ? 'google' : 'non_configure'
}

/** Nom comparé sans casse, accents ni espaces en trop (« Disco van » = « Disco Van »). */
export const nomCompare = (nom) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Refus de Google, avec son statut (404 = dossier introuvable). */
export class ErreurDrive extends Error {
  constructor(message, statut) {
    super(message)
    this.statut = statut
  }
}

async function verifier(res, quoi) {
  if (res.ok) return res
  throw new ErreurDrive(`Google Drive a refusé ${quoi} (${res.status}) : ${(await res.text()).slice(0, 300)}`, res.status)
}

async function jetonAcces(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DRIVE_CLIENT_ID,
      client_secret: env.DRIVE_CLIENT_SECRET,
      refresh_token: env.DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google a refusé le jeton du Drive (${res.status}) : ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).access_token
}

/**
 * @returns {Promise<{ sousDossiers(parent: string): Promise<{id: string, name: string}[]>,
 *                     creerDossier(parent: string, nom: string): Promise<string>,
 *                     envoyer(parent: string, nom: string, type: string, taille: number | null,
 *                             corps: ReadableStream | ArrayBuffer): Promise<string> }>}
 */
export async function clientDrive(env, mode) {
  if (mode === 'simule') {
    return {
      sousDossiers: async () => [],
      creerDossier: async () => `simule:${crypto.randomUUID()}`,
      envoyer: async (_parent, _nom, _type, _taille, corps) => {
        await corps?.cancel?.()
        return `simule:${crypto.randomUUID()}`
      },
    }
  }
  if (mode !== 'google') throw new Error('Google Drive n’est pas configuré.')
  const auth = { Authorization: `Bearer ${await jetonAcces(env)}` }
  // supportsAllDrives : sans lui, Google répond 404 pour tout ce qui est dans un Drive partagé.
  return {
    async sousDossiers(parent) {
      const p = new URLSearchParams({
        q: `'${parent}' in parents and mimeType = '${DOSSIER}' and trashed = false`,
        fields: 'files(id,name)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
      })
      const res = await verifier(await fetch(`${API}/files?${p}`, { headers: auth }), 'la liste des dossiers')
      return (await res.json()).files ?? []
    },
    async creerDossier(parent, nom) {
      const res = await verifier(
        await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nom, mimeType: DOSSIER, parents: [parent] }),
        }),
        `le dossier « ${nom} »`,
      )
      return (await res.json()).id
    },
    // Envoi « resumable » : métadonnées d'abord, puis le contenu d'un bloc.
    async envoyer(parent, nom, type, taille, corps) {
      const session = await verifier(
        await fetch(`${ENVOI}/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
          method: 'POST',
          headers: {
            ...auth,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': type,
            ...(taille != null ? { 'X-Upload-Content-Length': String(taille) } : {}),
          },
          body: JSON.stringify({ name: nom, parents: [parent] }),
        }),
        `l’envoi de « ${nom} »`,
      )
      const adresse = session.headers.get('location')
      if (!adresse) throw new Error('Google Drive n’a pas donné d’adresse d’envoi.')
      const res = await verifier(
        await fetch(adresse, { method: 'PUT', headers: { 'Content-Type': type }, body: corps }),
        `le contenu de « ${nom} »`,
      )
      return (await res.json()).id
    },
  }
}
