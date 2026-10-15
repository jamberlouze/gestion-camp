// Fichiers déposés par les pages publiques du module RH (CV, cartes,
// pièce d'identité, spécimen de chèque…) : types et taille acceptés.
//
// Fichier pur : la page vérifie avant l'envoi, le Worker (worker/rh/api.js)
// revérifie avant de déposer le fichier dans le seau privé.

export type Langue = 'fr' | 'en'

/** 20 Mo par fichier. */
export const TAILLE_MAX_FICHIER = 20 * 1024 * 1024
/** Tout un envoi (le Worker de Cloudflare refuse au-delà de 100 Mo). */
export const TAILLE_MAX_ENVOI = 90 * 1024 * 1024

const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
}

/** cv : PDF, Word, texte ou photo ; document : PDF ou photo ; specimen : comme le seau rh-paie. */
export type SorteFichier = 'cv' | 'document' | 'specimen'

const EXTENSIONS: Record<SorteFichier, string[]> = {
  cv: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  document: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  specimen: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'],
}

/** Extension en minuscules (« » si le nom n'en a pas de lisible). */
export function extensionDe(nom: string) {
  const e = nom.split('.').pop()?.toLowerCase() ?? ''
  return nom.includes('.') && /^[a-z0-9]{1,5}$/.test(e) ? e : ''
}

/** Type MIME d'après l'extension (jamais celui annoncé par le navigateur). */
export const typeMime = (extension: string) => MIMES[extension] ?? 'application/octet-stream'

/** Valeur de l'attribut `accept` d'un champ de fichier. */
export const accepte = (sorte: SorteFichier) => EXTENSIONS[sorte].map((e) => `.${e}`).join(',')

const MESSAGES = {
  fr: {
    vide: 'Ce fichier est vide.',
    gros: 'Fichier de plus de 20 Mo.',
    cv: 'Type de fichier non accepté (PDF, Word ou photo).',
    document: 'Type de fichier non accepté (PDF ou photo).',
    specimen: 'Type de fichier non accepté (PDF ou photo JPEG, PNG, HEIC).',
  },
  en: {
    vide: 'This file is empty.',
    gros: 'File larger than 20 MB.',
    cv: 'File type not accepted (PDF, Word or photo).',
    document: 'File type not accepted (PDF or photo).',
    specimen: 'File type not accepted (PDF or JPEG, PNG, HEIC photo).',
  },
}

/** Message d'erreur d'un fichier, ou null s'il convient. */
export function erreurFichier(f: { nom: string; taille: number }, sorte: SorteFichier, langue: Langue = 'fr'): string | null {
  const m = MESSAGES[langue]
  if (!f.taille) return m.vide
  if (f.taille > TAILLE_MAX_FICHIER) return m.gros
  if (!EXTENSIONS[sorte].includes(extensionDe(f.nom))) return m[sorte]
  return null
}

/** Taille lisible : « 340 Ko », « 2,4 Mo ». */
export function tailleLisible(octets: number) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}
