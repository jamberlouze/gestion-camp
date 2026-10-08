// Les documents d'une réservation : estimé, contrat (avec l'estimé et les
// annexes de la compagnie), pré-arrivée, contrat signé. Aucun accès réseau
// ici : images et annexes viennent de `Ressources` (app ou Worker).

import { PDFDocument, type PDFImage } from 'pdf-lib'
import { argent, dateLongue, heure } from '../format'
import { FORFAITS, type CaseSignature, type Forfait, type Signature } from '../types'
import { champs, type Contexte } from './champs'
import { dessinerModele, remplir } from './gabarit'
import { Composeur, couleurs, couper, morceaux, nettoyer, nouveauDocument, piedsDePage, polices, type Morceau, type Polices } from './moteur'

export interface Ressources {
  /** Octets d'une image publique (logo) ou d'un fichier du seau privé (annexe). */
  fichier(chemin: string): Promise<Uint8Array | null>
}

export interface LigneDoc {
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  pourcentage: number | null
  montant: number
}

const estPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50
const estPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46

async function image(doc: PDFDocument, octets: Uint8Array | null): Promise<PDFImage | null> {
  if (!octets) return null
  try {
    return estPng(octets) ? await doc.embedPng(octets) : await doc.embedJpg(octets)
  } catch {
    return null
  }
}

/** Bandeau gris du haut (« ESTIMÉ », « CONTRAT DE SERVICE »). */
function bandeau(c: Composeur, texte: string) {
  const h = 16
  c.rect(c.gauche, c.y - h, c.largeur, h, { fond: couleurs.gris })
  const t = nettoyer(texte.toUpperCase(), c.p.r)
  c.page.drawText(t, { x: c.gauche + (c.largeur - c.p.r.widthOfTextAtSize(t, 9.5)) / 2, y: c.y - 11.5, size: 9.5, font: c.p.r, color: couleurs.texte })
  c.y -= h + 12
}

/** Lignes de texte dans une colonne (x, largeur) ; renvoie le y du bas. */
function colonne(c: Composeur, x: number, largeur: number, lignes: { t: string | Morceau[]; taille: number; couleur?: typeof couleurs.texte; align?: 'gauche' | 'droite' }[]) {
  const y0 = c.y
  for (const l of lignes) {
    if (!l.t || (typeof l.t === 'string' && !l.t.trim())) continue
    const ms = typeof l.t === 'string' ? morceaux(l.t) : l.t
    c.dessinerLignes(couper(c.p, ms, l.taille, largeur), x, largeur, { taille: l.taille, couleur: l.couleur, align: l.align, interligne: 1.25 })
  }
  const bas = c.y
  c.y = y0
  return bas
}

/** En-tête : client à gauche, logo et compagnie à droite. */
async function entete(c: Composeur, ctx: Contexte, res: Ressources) {
  const cs = champs(ctx)
  const logo = await image(c.doc, await res.fichier(ctx.compagnie.logo))
  const larg = c.largeur
  const yHaut = c.y
  const basGauche = colonne(c, c.gauche, larg * 0.55, [
    { t: ctx.r.nom, taille: 14, couleur: couleurs.doux },
    { t: cs.adresse, taille: 8, couleur: couleurs.doux },
  ])
  let basDroite = yHaut
  if (logo) {
    const l = Math.min(180, larg * 0.38)
    const h = (logo.height / logo.width) * l
    c.page.drawImage(logo, { x: c.droite - l, y: yHaut - Math.min(h, 46), width: (Math.min(h, 46) / h) * l, height: Math.min(h, 46) })
    basDroite = yHaut - Math.min(h, 46)
  }
  c.y = Math.min(basGauche, basDroite) - 16
  const y2 = c.y
  const bas1 = colonne(c, c.gauche, larg * 0.5, [
    { t: 'Responsable / Contact', taille: 10.5 },
    { t: cs.responsable, taille: 8.5, couleur: couleurs.doux },
    { t: cs.courriel, taille: 8.5, couleur: couleurs.doux },
    { t: cs.telephone, taille: 8.5, couleur: couleurs.doux },
  ])
  const bas2 = colonne(c, c.gauche + larg * 0.45, larg * 0.55, [
    { t: ctx.compagnie.raison_sociale, taille: 10.5, align: 'droite' },
    { t: ctx.compagnie.adresse, taille: 8, couleur: couleurs.doux, align: 'droite' },
    { t: ctx.compagnie.courriel, taille: 8, couleur: couleurs.doux, align: 'droite' },
    { t: ctx.compagnie.telephone, taille: 8, couleur: couleurs.doux, align: 'droite' },
  ])
  c.y = Math.min(bas1, bas2, y2) - 14
}

/** Cases des 4 forfaits, date et numéro du document. */
function casesForfaits(c: Composeur, forfait: Forfait, date: string, numero: string, fondNumero = couleurs.jaune) {
  const larg = c.largeur * 0.64
  const cell = larg / 4
  const y0 = c.y
  const h = 13
  ;(Object.keys(FORFAITS) as Forfait[]).forEach((f, i) => {
    const x = c.gauche + i * cell
    c.rect(x, y0 - h, cell, h, { fond: couleurs.grisPale, bordure: couleurs.trait })
    c.rect(x, y0 - 2 * h, cell, h, { bordure: couleurs.trait })
    const t = nettoyer(FORFAITS[f], c.p.r)
    c.page.drawText(t, { x: x + (cell - c.p.r.widthOfTextAtSize(t, 8)) / 2, y: y0 - h + 3.5, size: 8, font: c.p.r, color: couleurs.texte })
    c.caseACocher(x + cell / 2 - 3.5, y0 - 2 * h + 3, f === forfait)
  })
  const xd = c.gauche + larg + 14
  const ld = c.droite - xd
  const td = nettoyer(date, c.p.r)
  c.page.drawText(td, { x: xd + (ld - c.p.r.widthOfTextAtSize(td, 11)) / 2, y: y0 - 11, size: 11, font: c.p.r, color: couleurs.texte })
  c.rect(xd, y0 - 2 * h - 2, ld, h + 2, { fond: fondNumero, bordure: couleurs.trait })
  const tn = nettoyer(numero, c.p.r)
  c.page.drawText(tn, { x: xd + (ld - c.p.r.widthOfTextAtSize(tn, 9)) / 2, y: y0 - 2 * h + 2, size: 9, font: c.p.r, color: couleurs.texte })
  c.y = y0 - 2 * h - 18
}

// ------------------------------------------------------------------
// Estimé
// ------------------------------------------------------------------
export async function pdfEstime(ctx: Contexte, lignes: LigneDoc[], res: Ressources): Promise<Uint8Array> {
  const version = ctx.estime && ctx.estime.version > 1 ? ` (v${ctx.estime.version})` : ''
  const doc = await nouveauDocument(`Estimé ${ctx.r.numero}${version} — ${ctx.r.nom}`)
  const p = await polices(doc)
  const c = new Composeur(doc, p, { gauche: 40, droite: 40, haut: 36, bas: 50 })
  c.nouvellePage()
  bandeau(c, 'Estimé')
  await entete(c, ctx, res)
  casesForfaits(c, ctx.r.forfait, dateLongue(ctx.estime?.date_estime ?? null), `ESTIMÉ ${ctx.r.numero}${version}`)

  const nuits = Math.round((Date.parse(ctx.r.date_depart) - Date.parse(ctx.r.date_arrivee)) / 86_400_000)
  const dates =
    ctx.r.date_arrivee === ctx.r.date_depart
      ? `Date : ${dateLongue(ctx.r.date_arrivee)}${ctx.r.heure_arrivee ? `, ${heure(ctx.r.heure_arrivee)} à ${heure(ctx.r.heure_depart)}` : ''}`
      : `Arrivée : ${dateLongue(ctx.r.date_arrivee)}${ctx.r.heure_arrivee ? `, ${heure(ctx.r.heure_arrivee)}` : ''} | Départ : ${dateLongue(ctx.r.date_depart)}${ctx.r.heure_depart ? `, ${heure(ctx.r.heure_depart)}` : ''}`
  const info: Morceau[] = [
    { t: `Forfait : ${FORFAITS[ctx.r.forfait]}${nuits > 0 ? ` | ${nuits} nuit${nuits > 1 ? 's' : ''}` : ''}`, gras: true },
    { t: `\n${dates}` },
  ]
  const rangees: (string | Morceau[])[][] = [
    [info, '', '', ''],
    ...lignes.map((l) => [
      l.note ? [{ t: l.description }, { t: `\n${l.note}`, italique: true }] : l.description,
      l.pourcentage !== null ? `${String(l.pourcentage).replace('.', ',')} %` : formatQuantite(l.quantite),
      l.pourcentage !== null ? '' : argent(l.prix_unitaire),
      argent(l.montant),
    ]),
  ]
  c.tableau(
    [{ part: 60 }, { part: 8, align: 'centre' }, { part: 15, align: 'droite' }, { part: 17, align: 'droite' }],
    rangees,
    { entete: ['Description', 'Qté', 'Prix unit.', 'Montant'].map((t) => [{ t, gras: false }]), taille: 9, marge: 5 },
  )
  c.trait(0.6, couleurs.trait)
  c.espace(12)

  // Note sur les fournisseurs (gauche) et totaux (droite).
  c.besoin(80)
  const y0 = c.y
  colonne(c, c.gauche, c.largeur * 0.58, [
    {
      t: `Les prix des activités de fournisseurs de ${ctx.compagnie.raison_sociale} sont sujets à changement. Les prix finaux seront ceux qui apparaissent sur la facture qui vous sera envoyée une fois l'estimé accepté.`,
      taille: 8,
      couleur: couleurs.doux,
    },
  ])
  const t = ctx.estime
  c.y = y0
  c.tableau(
    [{ part: 55, align: 'droite' }, { part: 45, align: 'droite' }],
    [
      ['Sous-total', argent(t?.sous_total)],
      ['TPS (5 %)', argent(t?.tps)],
      ['TVQ (9,975 %)', argent(t?.tvq)],
      [[{ t: 'Total', gras: true }], [{ t: argent(t?.total), gras: true }]],
    ],
    { x: c.droite - 190, largeur: 190, taille: 9, bordure: true, fonds: [couleurs.grisPale, undefined] },
  )
  piedsDePage(doc, p, `Estimé ${ctx.r.numero}${version} · ${ctx.compagnie.raison_sociale}`)
  return doc.save()
}

const formatQuantite = (q: number) => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','))

// ------------------------------------------------------------------
// Contrat
// ------------------------------------------------------------------

export interface Contrat {
  octets: Uint8Array
  signature: CaseSignature
}

const ETAGES_CONTRAT: { code: string; batiment: string; section: string }[] = [
  { code: 'CH', batiment: 'Pavillon principal', section: 'Les Cèdres' },
  { code: 'CB', batiment: 'Pavillon principal', section: 'Les Cèdres' },
  { code: 'PB', batiment: 'Pavillon principal', section: 'Les Pins' },
  { code: 'PH', batiment: 'Pavillon principal', section: 'Les Pins' },
  { code: 'VFB', batiment: 'La Vieille-France', section: 'La Vieille-France' },
  { code: 'VFH', batiment: 'La Vieille-France', section: 'La Vieille-France' },
]

const SALLES_CONTRAT: { code: string; batiment: string; nom: string }[] = [
  { code: 'SMB', batiment: 'Pavillon principal', nom: 'Salle à manger' },
  { code: 'SV', batiment: 'Pavillon principal', nom: 'Salle vitrée' },
  { code: 'CU', batiment: 'Pavillon principal', nom: 'Cuisine' },
  { code: 'SC', batiment: 'Pavillon principal', nom: 'Salon Cèdres' },
  { code: 'SVF', batiment: 'La Vieille-France', nom: 'Salon' },
  { code: 'CVF', batiment: 'La Vieille-France', nom: 'Cuisinette' },
]

/**
 * Contrat : modèle rempli, pré-signé par la direction, suivi de l'estimé
 * accepté (annexe) et des annexes de la compagnie (spécimen de chèque…).
 */
export async function pdfContrat(ctx: Contexte, modele: { titre: string; contenu: string }, estimePdf: Uint8Array | null, res: Ressources): Promise<Contrat> {
  const doc = await nouveauDocument(`Contrat ${ctx.r.numero} — ${ctx.r.nom}`)
  const p = await polices(doc)
  const c = new Composeur(doc, p)
  const cs = champs(ctx)
  let signature: CaseSignature = { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }
  c.nouvellePage()
  bandeau(c, modele.titre)

  const bloc = (nom: string, cc: Composeur) => {
    if (nom === 'entete') return enteteContrat(cc, ctx, cs)
    if (nom === 'saut') return void cc.nouvellePage()
    if (nom === 'paiement') return dessinerModele(cc, ctx.compagnie.consignes_paiement, cs, bloc)
    if (nom === 'etages') {
      const lits = new Map(ctx.etages.map((e) => [e.code, e]))
      const rangees = ETAGES_CONTRAT.map((e) => [
        e.batiment,
        e.section,
        lits.get(e.code)?.nom ?? e.code,
        String(lits.get(e.code)?.lits ?? ''),
        ctx.r.etages.includes(e.code) ? [{ t: 'Réservé', gras: true }] : '',
      ])
      cc.espace(2)
      cc.tableau([{ part: 22 }, { part: 20 }, { part: 26 }, { part: 8, align: 'droite' }, { part: 12, align: 'centre' }], rangees, {
        entete: ['Bâtiment', 'Section', 'Étage', 'Lits', ''],
        taille: 8.5,
        bordure: true,
      })
      cc.espace(4)
      return
    }
    if (nom === 'salles') {
      const rangees = SALLES_CONTRAT.map((s) => [s.batiment, s.nom, ctx.r.salles.includes(s.code) ? [{ t: 'Réservée', gras: true }] : ''])
      cc.espace(2)
      cc.tableau([{ part: 40 }, { part: 40 }, { part: 20, align: 'centre' }], rangees, { entete: ['Bâtiment', 'Salle', ''], taille: 8.5, bordure: true })
      cc.espace(4)
      return
    }
    if (nom === 'signatures') {
      signature = signatures(cc, ctx, cs)
      return
    }
    cc.texte(`[[${nom} ?]]`, { couleur: couleurs.doux })
  }
  dessinerModele(c, modele.contenu, cs, bloc)
  piedsDePage(doc, p, `Contrat ${ctx.r.numero} · ${ctx.compagnie.raison_sociale}`)

  // Annexe : l'estimé accepté.
  if (estimePdf) {
    const e = await PDFDocument.load(estimePdf)
    for (const pg of await doc.copyPages(e, e.getPageIndices())) doc.addPage(pg)
  }
  // Annexes de la compagnie (spécimen de chèque, virement international).
  for (const a of ctx.compagnie.annexes) {
    const octets = await res.fichier(a.chemin)
    if (!octets) continue
    const cc = new Composeur(doc, p)
    cc.nouvellePage()
    cc.texte(morceaux(a.titre, { gras: true }), { taille: 13, apres: 10 })
    if (estPdf(octets)) {
      const src = await PDFDocument.load(octets)
      const [page] = await doc.embedPdf(src, [0])
      const l = Math.min(cc.largeur, page.width)
      const h = (page.height / page.width) * l
      const hMax = cc.y - cc.bas
      const k = h > hMax ? hMax / h : 1
      cc.page.drawPage(page, { x: cc.gauche, y: cc.y - h * k, width: l * k, height: h * k })
    } else {
      const img = await image(doc, octets)
      if (img) cc.image(img, { largeur: Math.min(cc.largeur, img.width), hauteurMax: cc.y - cc.bas })
    }
  }
  return { octets: await doc.save(), signature }
}

function enteteContrat(c: Composeur, ctx: Contexte, cs: Record<string, string>) {
  const larg = c.largeur
  const bas1 = colonne(c, c.gauche, larg * 0.5, [
    { t: [{ t: ctx.r.nom, gras: true }], taille: 11 },
    { t: cs.adresse, taille: 8.5, couleur: couleurs.doux },
    { t: `Réservation ${ctx.r.numero}`, taille: 8.5 },
  ])
  const bas2 = colonne(c, c.gauche + larg * 0.5, larg * 0.5, [
    { t: [{ t: ctx.compagnie.raison_sociale, gras: true }], taille: 9.5, align: 'droite' },
    { t: ctx.compagnie.adresse, taille: 8.5, couleur: couleurs.doux, align: 'droite' },
    { t: ctx.compagnie.courriel, taille: 8.5, couleur: couleurs.doux, align: 'droite' },
    { t: ctx.compagnie.telephone, taille: 8.5, couleur: couleurs.doux, align: 'droite' },
  ])
  c.y = Math.min(bas1, bas2) - 6
  c.y =
    colonne(c, c.gauche, larg, [
      { t: [{ t: 'Responsable du groupe / Contact', gras: true }], taille: 9 },
      { t: [cs.responsable, cs.courriel, cs.telephone].filter(Boolean).join(' · '), taille: 8.5, couleur: couleurs.doux },
    ]) - 6
  c.trait()
  c.espace(8)
}

/** Bloc des signatures ; renvoie la case de signature du client. */
function signatures(c: Composeur, ctx: Contexte, cs: Record<string, string>): CaseSignature {
  c.besoin(150)
  c.espace(6)
  c.texte(morceaux('**EN FOI DE QUOI NOUS SIGNONS :**'), { taille: 9.5, apres: 8 })
  const larg = c.largeur / 2 - 10
  const xd = c.gauche + c.largeur / 2 + 10
  const y0 = c.y
  const p = c.p
  const ecrire = (t: string, x: number, y: number, taille = 8.5, police = p.r, couleur = couleurs.texte) =>
    c.page.drawText(nettoyer(t, police), { x, y, size: taille, font: police, color: couleur })
  // Client (à gauche) : case à signer.
  ecrire('SIGNÉ LE :', c.gauche, y0 - 9)
  const caseSig: CaseSignature = { page: c.doc.getPageCount() - 1, x: c.gauche, y: y0 - 78, largeur: larg, hauteur: 58 }
  c.rect(caseSig.x, caseSig.y, caseSig.largeur, caseSig.hauteur, { bordure: couleurs.gris })
  c.page.drawLine({ start: { x: c.gauche, y: y0 - 80 }, end: { x: c.gauche + larg, y: y0 - 80 }, thickness: 0.6, color: couleurs.trait })
  ecrire('Signature', c.gauche, y0 - 90)
  c.page.drawLine({ start: { x: c.gauche, y: y0 - 112 }, end: { x: c.gauche + larg, y: y0 - 112 }, thickness: 0.6, color: couleurs.trait })
  ecrire('Représentant du Groupe (nom en lettres moulées)', c.gauche, y0 - 122)
  // Compagnie (à droite) : pré-signée au moment de l'envoi.
  ecrire(`SIGNÉ LE : ${cs.aujourdhui}`, xd, y0 - 9)
  const lignes = couper(p, [{ t: `Signé par ${cs.signataire} le ${cs.aujourdhui} ${cs.heure} à Mont-Tremblant`, italique: true }], 8.5, larg)
  const yAvant = c.y
  c.y = y0 - 26
  c.dessinerLignes(lignes, xd, larg, { taille: 8.5, couleur: couleurs.foret })
  c.y = yAvant
  c.page.drawLine({ start: { x: xd, y: y0 - 80 }, end: { x: xd + larg, y: y0 - 80 }, thickness: 0.6, color: couleurs.trait })
  ecrire(ctx.compagnie.raison_sociale, xd, y0 - 90)
  ecrire(cs.signataire, xd, y0 - 106, 9, p.b)
  c.page.drawLine({ start: { x: xd, y: y0 - 112 }, end: { x: xd + larg, y: y0 - 112 }, thickness: 0.6, color: couleurs.trait })
  ecrire('Représenté par (nom en lettres moulées)', xd, y0 - 122)
  c.y = y0 - 134
  return caseSig
}

// ------------------------------------------------------------------
// Pré-arrivée
// ------------------------------------------------------------------
export async function pdfPreArrivee(ctx: Contexte, modele: { titre: string; contenu: string }, res: Ressources): Promise<Uint8Array> {
  const doc = await nouveauDocument(`Pré-arrivée ${ctx.r.numero} — ${ctx.r.nom}`)
  const p = await polices(doc)
  const c = new Composeur(doc, p)
  const cs = champs(ctx)
  c.nouvellePage()
  const logo = await image(doc, await res.fichier(ctx.compagnie.logo))
  if (logo) c.image(logo, { largeur: 150, hauteurMax: 40, align: 'droite' })
  c.espace(6)
  dessinerModele(c, modele.contenu, cs, (nom, cc) => (nom === 'saut' ? void cc.nouvellePage() : cc.texte(`[[${nom} ?]]`)), 10.5)
  piedsDePage(doc, p, `Pré-arrivée ${ctx.r.numero} · ${ctx.compagnie.raison_sociale}`)
  return doc.save()
}

// ------------------------------------------------------------------
// Contrat signé : signature posée dans la case, plus un certificat
// ------------------------------------------------------------------
export async function pdfContratSigne(
  original: Uint8Array,
  caseSig: CaseSignature,
  s: Pick<Signature, 'nom_signataire' | 'fonction_signataire' | 'image' | 'signe_le' | 'adresse_ip' | 'navigateur' | 'envoye_le'>,
  infos: { numero: string; groupe: string; empreinteOriginal: string; compagnie: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original)
  const p = await polices(doc)
  const quand = s.signe_le ? new Date(s.signe_le) : new Date()
  const date = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(quand)
  const png = s.image ? await doc.embedPng(s.image) : null
  const page = doc.getPage(Math.min(caseSig.page, doc.getPageCount() - 1))
  if (png) {
    const k = Math.min((caseSig.largeur - 8) / png.width, (caseSig.hauteur - 8) / png.height)
    page.drawImage(png, { x: caseSig.x + 4, y: caseSig.y + 4, width: png.width * k, height: png.height * k })
  }
  const nom = nettoyer(`${s.nom_signataire ?? ''}${s.fonction_signataire ? `, ${s.fonction_signataire}` : ''}`, p.r)
  // Nom en lettres moulées : juste au-dessus de la 2e ligne du bloc.
  page.drawText(nom, { x: caseSig.x, y: caseSig.y - 31, size: 9, font: p.b, color: couleurs.texte })
  page.drawText(nettoyer(date, p.r), { x: caseSig.x + 52, y: caseSig.y + caseSig.hauteur + 11, size: 8.5, font: p.r, color: couleurs.texte })
  page.drawText(nettoyer('Signé électroniquement (voir le certificat en dernière page)', p.i), { x: caseSig.x, y: caseSig.y - 64, size: 7, font: p.i, color: couleurs.foret })

  // Certificat de signature.
  const c = new Composeur(doc, p)
  c.nouvellePage()
  c.texte(morceaux('**Certificat de signature électronique**'), { taille: 14, apres: 10 })
  const ligne = (a: string, b: string) => c.tableau([{ part: 32 }, { part: 68 }], [[[{ t: a, gras: true }], b]], { taille: 9, bordure: true })
  ligne('Document', `Contrat ${infos.numero} — ${infos.groupe}`)
  ligne('Émis par', infos.compagnie)
  ligne('Envoyé le', new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(s.envoye_le)))
  ligne('Signé le', date)
  ligne('Signataire', `${s.nom_signataire ?? ''}${s.fonction_signataire ? ` (${s.fonction_signataire})` : ''}`)
  ligne('Consentement', 'Le signataire a coché « J’ai lu le contrat et je l’accepte au nom du Groupe » avant de signer.')
  ligne('Adresse IP', s.adresse_ip || '—')
  ligne('Navigateur', s.navigateur || '—')
  ligne('Empreinte SHA-256 du contrat envoyé', infos.empreinteOriginal)
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

export const remplirTexte = remplir
export type { Polices }
