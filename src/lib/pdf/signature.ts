// Document signé électroniquement : la signature (image PNG tracée au doigt
// ou à la souris) posée dans sa case, le nom en lettres moulées et la date
// dessous, puis une page de certificat (qui, quand, d'où, empreinte du
// document envoyé). Sans React ni Supabase : sert aussi dans le Worker.

import { PDFDocument } from 'pdf-lib'
import { Composeur, couleurs, morceaux, nettoyer, polices } from './moteur.ts'

/** Case où la signature est attendue (points PDF, origine en bas à gauche). */
export interface CaseSignature {
  page: number
  x: number
  y: number
  largeur: number
  hauteur: number
}

export interface Signataire {
  nom: string
  /** Image PNG (data URL ou base64), ou null */
  image: string | null
  /** Horodatage ISO de la signature */
  signeLe: string
}

const dateLongue = (iso: string) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

/**
 * Pose la signature dans sa case et ajoute le certificat. `certificat.lignes` :
 * [libellé, valeur] (document, émis par, signataire, adresse IP…).
 */
export async function poserSignature(original: Uint8Array, caseSig: CaseSignature, s: Signataire, certificat: { titre: string; lignes: [string, string][] }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original)
  const p = await polices(doc)
  const png = s.image ? await doc.embedPng(s.image) : null
  const page = doc.getPage(Math.min(caseSig.page, doc.getPageCount() - 1))
  if (png) {
    const k = Math.min((caseSig.largeur - 8) / png.width, (caseSig.hauteur - 8) / png.height)
    page.drawImage(png, { x: caseSig.x + 4, y: caseSig.y + 4, width: png.width * k, height: png.height * k })
  }
  page.drawText(nettoyer(s.nom, p.b), { x: caseSig.x, y: caseSig.y - 14, size: 9, font: p.b, color: couleurs.texte })
  page.drawText(nettoyer(`Signé électroniquement le ${dateLongue(s.signeLe)} (voir le certificat en dernière page)`, p.i), {
    x: caseSig.x,
    y: caseSig.y - 26,
    size: 7,
    font: p.i,
    color: couleurs.foret,
  })

  const c = new Composeur(doc, p)
  c.nouvellePage()
  c.texte(morceaux(`**${certificat.titre}**`), { taille: 14, apres: 10 })
  for (const [a, b] of [...certificat.lignes, ['Signé le', dateLongue(s.signeLe)] as [string, string]]) {
    c.tableau([{ part: 32 }, { part: 68 }], [[[{ t: a, gras: true }], b]], { taille: 9, bordure: true })
  }
  c.espace(12)
  c.texte('Signature :', { taille: 9 })
  if (png) c.image(png, { largeur: 220, hauteurMax: 80 })
  return doc.save()
}

/** Empreinte SHA-256 (hexadécimal) d'un fichier. */
export async function empreinte(octets: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(octets))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
