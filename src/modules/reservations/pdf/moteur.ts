// Petit moteur de mise en page PDF (pdf-lib, polices standard : rien à
// télécharger, fonctionne aussi dans le Worker). Texte avec retour à la
// ligne, gras et italique, puces, tableaux, images, sauts de page.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'

export const LETTRE: [number, number] = [612, 792]

export const couleurs = {
  texte: rgb(0.15, 0.15, 0.15),
  doux: rgb(0.4, 0.4, 0.4),
  trait: rgb(0.55, 0.55, 0.55),
  gris: rgb(0.8, 0.8, 0.8),
  grisPale: rgb(0.835, 0.835, 0.835),
  jaune: rgb(1, 0.949, 0.8),
  rose: rgb(0.957, 0.8, 0.8),
  vert: rgb(0.851, 0.918, 0.827),
  foret: rgb(0.1, 0.33, 0.2),
}

export interface Polices {
  r: PDFFont
  b: PDFFont
  i: PDFFont
  bi: PDFFont
}

export async function polices(doc: PDFDocument): Promise<Polices> {
  return {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
    bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  }
}

/** Morceau de texte avec son style. */
export interface Morceau {
  t: string
  gras?: boolean
  italique?: boolean
}

const police = (p: Polices, m: Morceau) => (m.gras ? (m.italique ? p.bi : p.b) : m.italique ? p.i : p.r)

// Les polices standard ne connaissent que l'encodage WinAnsi : tout autre
// caractère (émojis, espaces fines…) est remplacé ou retiré.
let jeu: Set<number> | null = null
export function nettoyer(s: string, p: PDFFont): string {
  jeu ??= new Set(p.getCharacterSet())
  return s
    .replace(/[   ]/g, ' ')
    .replace(/[‐‑]/g, '-')
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\n]/gu, (c) => (jeu!.has(c.codePointAt(0)!) ? c : ''))
}

/** « **gras** » et « _italique_ » → morceaux. */
export function morceaux(texte: string, base: Omit<Morceau, 't'> = {}): Morceau[] {
  const res: Morceau[] = []
  const re = /\*\*(.+?)\*\*|(?<![\p{L}\d])_(.+?)_(?![\p{L}\d])/gu
  let dernier = 0
  for (const m of texte.matchAll(re)) {
    if (m.index! > dernier) res.push({ ...base, t: texte.slice(dernier, m.index) })
    // Styles imbriqués (« **_gras italique_** ») : le contenu est relu.
    if (m[1] !== undefined) res.push(...morceaux(m[1], { ...base, gras: true }))
    else res.push(...morceaux(m[2], { ...base, italique: true }))
    dernier = m.index! + m[0].length
  }
  if (dernier < texte.length) res.push({ ...base, t: texte.slice(dernier) })
  return res
}

interface Mot {
  t: string
  m: Morceau
  largeur: number
  espaceAvant: boolean
}

/** Coupe des morceaux en lignes de largeur maximale `largeur`. */
export function couper(p: Polices, ms: Morceau[], taille: number, largeur: number): Mot[][] {
  const lignes: Mot[][] = []
  let ligne: Mot[] = []
  let x = 0
  const espace = p.r.widthOfTextAtSize(' ', taille)
  // Une espace en fin de morceau vaut pour le mot du morceau suivant.
  let avant = false
  for (const m of ms) {
    const f = police(p, m)
    const texte = nettoyer(m.t, f)
    const paragraphes = texte.split('\n')
    paragraphes.forEach((para, ip) => {
      if (ip > 0) {
        lignes.push(ligne)
        ligne = []
        x = 0
        avant = false
      }
      const bouts = para.split(/( +)/)
      for (const b of bouts) {
        if (!b) continue
        if (/^ +$/.test(b)) {
          avant = true
          continue
        }
        // Un mot trop long est coupé de force.
        let reste = b
        while (reste) {
          let w = f.widthOfTextAtSize(reste, taille)
          let morceau = reste
          if (w > largeur) {
            let n = reste.length
            while (n > 1 && f.widthOfTextAtSize(reste.slice(0, n), taille) > largeur) n--
            morceau = reste.slice(0, n)
            w = f.widthOfTextAtSize(morceau, taille)
          }
          const sep = ligne.length && avant ? espace : 0
          if (ligne.length && x + sep + w > largeur) {
            lignes.push(ligne)
            ligne = []
            x = 0
          }
          const espaceAvant = ligne.length > 0 && avant
          ligne.push({ t: morceau, m, largeur: w, espaceAvant })
          x += (espaceAvant ? espace : 0) + w
          avant = false
          reste = reste.slice(morceau.length)
        }
      }
    })
  }
  lignes.push(ligne)
  return lignes
}

export type Alignement = 'gauche' | 'centre' | 'droite'

export interface OptionsTexte {
  taille?: number
  couleur?: RGB
  align?: Alignement
  interligne?: number
}

/**
 * Page courante, position verticale et passage automatique à la page
 * suivante. `entete` dessine l'en-tête de chaque nouvelle page.
 */
export class Composeur {
  page!: PDFPage
  y = 0
  readonly gauche: number
  readonly droite: number
  readonly haut: number
  readonly bas: number
  entete?: (c: Composeur) => void

  readonly doc: PDFDocument
  readonly p: Polices

  constructor(doc: PDFDocument, p: Polices, marges = { gauche: 54, droite: 54, haut: 54, bas: 60 }) {
    this.doc = doc
    this.p = p
    this.gauche = marges.gauche
    this.droite = LETTRE[0] - marges.droite
    this.haut = LETTRE[1] - marges.haut
    this.bas = marges.bas
  }

  get largeur() {
    return this.droite - this.gauche
  }

  nouvellePage() {
    this.page = this.doc.addPage(LETTRE)
    this.y = this.haut
    this.entete?.(this)
    return this.page
  }

  /** Passe à la page suivante s'il ne reste pas `h` points. */
  besoin(h: number) {
    if (!this.page || this.y - h < this.bas) this.nouvellePage()
  }

  espace(h: number) {
    this.y -= h
  }

  /** Dessine des lignes déjà coupées à partir de (x, y) ; renvoie la hauteur. */
  dessinerLignes(lignes: Mot[][], x: number, largeur: number, o: OptionsTexte = {}) {
    const taille = o.taille ?? 10
    const pas = taille * (o.interligne ?? 1.3)
    const espace = this.p.r.widthOfTextAtSize(' ', taille)
    for (const ligne of lignes) {
      this.besoin(pas)
      const total = ligne.reduce((t, m) => t + m.largeur + (m.espaceAvant ? espace : 0), 0)
      let cx = o.align === 'centre' ? x + (largeur - total) / 2 : o.align === 'droite' ? x + largeur - total : x
      // Les mots de même style sont dessinés d'un trait, avec de vraies
      // espaces : le texte du PDF se copie et se cherche correctement.
      let i = 0
      while (i < ligne.length) {
        const f = police(this.p, ligne[i].m)
        if (ligne[i].espaceAvant) cx += espace
        let texte = ligne[i].t
        let j = i + 1
        while (j < ligne.length && police(this.p, ligne[j].m) === f) {
          texte += (ligne[j].espaceAvant ? ' ' : '') + ligne[j].t
          j++
        }
        this.page.drawText(texte, { x: cx, y: this.y - taille, size: taille, font: f, color: o.couleur ?? couleurs.texte })
        cx += f.widthOfTextAtSize(texte, taille)
        i = j
      }
      this.y -= pas
    }
  }

  /** Paragraphe (texte simple ou morceaux), sur toute la largeur moins `retrait`. */
  texte(contenu: string | Morceau[], o: OptionsTexte & { retrait?: number; apres?: number } = {}) {
    const ms = typeof contenu === 'string' ? morceaux(contenu) : contenu
    const retrait = o.retrait ?? 0
    const lignes = couper(this.p, ms, o.taille ?? 10, this.largeur - retrait)
    this.dessinerLignes(lignes, this.gauche + retrait, this.largeur - retrait, o)
    this.y -= o.apres ?? 0
  }

  /** Puce (« • » ou numéro) suivie d'un texte en retrait. */
  puce(contenu: string, niveau = 0, o: OptionsTexte & { marque?: string } = {}) {
    const taille = o.taille ?? 10
    // Liste numérotée : la marque (« 10. ») est alignée à droite avant le texte.
    const retrait = (o.marque ? 20 : 14) + niveau * 16
    const marque = nettoyer(o.marque ?? (niveau === 0 ? '•' : '–'), this.p.r)
    this.besoin(taille * 1.3)
    const x = this.gauche + retrait - 4 - this.p.r.widthOfTextAtSize(marque, taille)
    this.page.drawText(marque, { x, y: this.y - taille, size: taille, font: this.p.r, color: couleurs.texte })
    this.texte(contenu, { ...o, retrait })
  }

  /** Trait horizontal. */
  trait(epaisseur = 0.5, couleur = couleurs.gris) {
    this.page.drawLine({ start: { x: this.gauche, y: this.y }, end: { x: this.droite, y: this.y }, thickness: epaisseur, color: couleur })
  }

  /** Rectangle (fond et/ou bordure). */
  rect(x: number, y: number, l: number, h: number, o: { fond?: RGB; bordure?: RGB; epaisseur?: number } = {}) {
    this.page.drawRectangle({
      x,
      y,
      width: l,
      height: h,
      color: o.fond,
      borderColor: o.bordure,
      borderWidth: o.bordure ? (o.epaisseur ?? 0.5) : 0,
    })
  }

  /** Case à cocher dessinée (les polices standard n'ont pas ☐ / ☑). */
  caseACocher(x: number, y: number, cochee: boolean, cote = 7) {
    this.rect(x, y, cote, cote, { bordure: couleurs.texte, epaisseur: 0.7 })
    if (cochee) {
      this.page.drawLine({ start: { x: x + 1.3, y: y + cote * 0.5 }, end: { x: x + cote * 0.42, y: y + 1.3 }, thickness: 1, color: couleurs.texte })
      this.page.drawLine({ start: { x: x + cote * 0.42, y: y + 1.3 }, end: { x: x + cote - 1, y: y + cote - 1 }, thickness: 1, color: couleurs.texte })
    }
  }

  /** Image ajustée à la largeur (et hauteur maximale) voulue. */
  image(img: PDFImage, o: { largeur: number; hauteurMax?: number; align?: Alignement; x?: number }) {
    let l = o.largeur
    let h = (img.height / img.width) * l
    if (o.hauteurMax && h > o.hauteurMax) {
      h = o.hauteurMax
      l = (img.width / img.height) * h
    }
    this.besoin(h)
    const x = o.x ?? (o.align === 'centre' ? this.gauche + (this.largeur - l) / 2 : o.align === 'droite' ? this.droite - l : this.gauche)
    this.page.drawImage(img, { x, y: this.y - h, width: l, height: h })
    this.y -= h
  }

  /**
   * Tableau : colonnes en proportions de la largeur, cellules en texte riche.
   * La ligne d'en-tête (fond gris) est répétée en haut de chaque page.
   */
  tableau(
    colonnes: { part: number; align?: Alignement }[],
    lignes: (string | Morceau[])[][],
    o: {
      entete?: (string | Morceau[])[]
      taille?: number
      bordure?: boolean
      fondEntete?: RGB
      marge?: number
      /** Position et largeur du tableau (toute la largeur par défaut). */
      x?: number
      largeur?: number
      /** Fond de chaque cellule (ex. libellés gris des totaux). */
      fonds?: (RGB | undefined)[]
    } = {},
  ) {
    const taille = o.taille ?? 9.5
    const pad = o.marge ?? 4
    const largeur = o.largeur ?? this.largeur
    const x0 = o.x ?? this.gauche
    const total = colonnes.reduce((t, c) => t + c.part, 0)
    const larg = colonnes.map((c) => (c.part / total) * largeur)
    const xs = larg.map((_, i) => x0 + larg.slice(0, i).reduce((t, l) => t + l, 0))
    const preparer = (cells: (string | Morceau[])[]) => {
      const coupees = cells.map((c, i) => couper(this.p, typeof c === 'string' ? morceaux(c) : c, taille, larg[i] - 2 * pad))
      const h = Math.max(...coupees.map((l) => l.length)) * taille * 1.3 + 2 * pad
      return { coupees, h }
    }
    const dessiner = (cells: (string | Morceau[])[], fond?: RGB) => {
      const { coupees, h } = preparer(cells)
      this.besoin(h)
      const y0 = this.y
      coupees.forEach((l, i) => {
        const f = fond ?? o.fonds?.[i]
        if (f || o.bordure) this.rect(xs[i], y0 - h, larg[i], h, { fond: f, bordure: o.bordure ? couleurs.trait : undefined })
        const yAvant = this.y
        this.y = y0 - pad
        this.dessinerLignes(l, xs[i] + pad, larg[i] - 2 * pad, { taille, align: colonnes[i].align })
        this.y = yAvant
      })
      this.y = y0 - h
    }
    if (o.entete) {
      const entete = o.entete
      const ancienne = this.entete
      // En-tête du tableau répété sur chaque page.
      this.entete = (c) => {
        ancienne?.(c)
        dessiner(entete, o.fondEntete ?? couleurs.grisPale)
      }
      this.besoin(preparer(entete).h + 20)
      dessiner(entete, o.fondEntete ?? couleurs.grisPale)
      for (const l of lignes) dessiner(l)
      this.entete = ancienne
    } else for (const l of lignes) dessiner(l)
  }
}

/** « Page 1 de 3 » (et un texte à gauche) en bas de chaque page. */
export function piedsDePage(doc: PDFDocument, p: Polices, gauche: string) {
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const t = `Page ${i + 1} de ${pages.length}`
    page.drawText(nettoyer(gauche, p.r), { x: 54, y: 30, size: 7.5, font: p.r, color: couleurs.doux })
    page.drawText(t, { x: LETTRE[0] - 54 - p.r.widthOfTextAtSize(t, 7.5), y: 30, size: 7.5, font: p.r, color: couleurs.doux })
  })
}

export async function nouveauDocument(titre: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(titre)
  doc.setLanguage('fr-CA')
  doc.setProducer('Gestion du camp')
  doc.setCreator('Gestion du camp')
  return doc
}
