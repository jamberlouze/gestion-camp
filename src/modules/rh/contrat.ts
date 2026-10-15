// Contrat d'emploi et consentement parental du module RH (plan-rh.md §6) :
// PDF. Même moteur et même syntaxe de modèles que les contrats de groupes
// (src/lib/pdf) ; termes et champs dans termesContrat.ts.
//
// Fichier pur : l'app s'en sert pour prévisualiser (chargé à la demande),
// le Worker pour produire le PDF à lire ou à signer (coordonnées à jour de
// l'employé).

import { dessinerModele } from '../../lib/pdf/gabarit.ts'
import { Composeur, couleurs, couper, morceaux, nettoyer, nouveauDocument, piedsDePage, polices, type Morceau } from '../../lib/pdf/moteur.ts'
import type { CaseSignature } from '../../lib/pdf/signature.ts'
import { champsContrat, dateLongue, type Employe, type TermesContrat } from './termesContrat.ts'

export * from './termesContrat.ts'

/** Colonne de lignes alignées ; rend le bas de la colonne. */
function colonne(c: Composeur, x: number, largeur: number, y: number, lignes: { t: string | Morceau[]; taille?: number; couleur?: typeof couleurs.texte }[]) {
  let yy = y
  for (const l of lignes) {
    const taille = l.taille ?? 9
    const ms = typeof l.t === 'string' ? morceaux(l.t) : l.t
    if (!ms.some((m) => m.t.trim())) continue
    const avant = c.y
    c.y = yy
    c.dessinerLignes(couper(c.p, ms, taille, largeur), x, largeur, { taille, couleur: l.couleur })
    yy = c.y
    c.y = avant
  }
  return yy
}

const ligneVide = '________________________________'

/** Contrat d'emploi : modèle rempli, pré-signé par la direction ; rend la case de signature de l'employé. */
export async function pdfContrat(titre: string, contenu: string, t: TermesContrat, e: Employe | null, aujourdhui: string) {
  const doc = await nouveauDocument(`${titre} — ${e ? `${e.prenom} ${e.nom_famille}` : t.poste}`)
  const p = await polices(doc)
  const c = new Composeur(doc, p)
  const cs = champsContrat(t, e, aujourdhui)
  let caseSig: CaseSignature = { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }
  c.nouvellePage()

  const bloc = (nom: string, cc: Composeur) => {
    if (nom === 'saut') return void cc.nouvellePage()
    if (nom === 'taches') return dessinerModele(cc, t.taches ?? '', cs, bloc)
    if (nom === 'entete') {
      cc.besoin(130)
      cc.espace(4)
      const larg = cc.largeur / 2 - 10
      const xd = cc.gauche + cc.largeur / 2 + 10
      const y0 = cc.y
      const adresseEmploye = e ? [e.adresse, [e.ville, e.province].filter(Boolean).join(', '), e.code_postal].filter(Boolean).join(' · ') : ''
      const bas1 = colonne(cc, cc.gauche, larg, y0, [
        { t: 'Entre', taille: 8.5, couleur: couleurs.doux },
        { t: [{ t: t.compagnie.raison_sociale || t.compagnie.nom, gras: true }], taille: 10 },
        ...t.compagnie.adresse.split('\n').map((l) => ({ t: l, taille: 9 })),
        { t: t.compagnie.courriel, taille: 9 },
        { t: t.compagnie.telephone, taille: 9 },
        { t: `Ci-après appelé : « ${t.compagnie.nom_court || t.compagnie.nom} »`, taille: 8.5, couleur: couleurs.doux },
        { t: `Représenté par : ${t.signataire}`, taille: 9 },
      ])
      const bas2 = colonne(cc, xd, larg, y0, [
        { t: 'Et', taille: 8.5, couleur: couleurs.doux },
        { t: [{ t: e ? `${e.prenom} ${e.nom_famille}` : `Nom : ${ligneVide}`, gras: true }], taille: 10 },
        { t: adresseEmploye || `Adresse : ${ligneVide}`, taille: 9 },
        { t: e?.courriel ? e.courriel : `Courriel : ${ligneVide}`, taille: 9 },
        { t: e?.telephone ? e.telephone : `Téléphone : ${ligneVide}`, taille: 9 },
        { t: 'Ci-après appelé : « l’employé(e) »', taille: 8.5, couleur: couleurs.doux },
      ])
      cc.y = Math.min(bas1, bas2) - 8
      cc.trait()
      cc.espace(8)
      return
    }
    if (nom === 'signatures') {
      cc.besoin(150)
      cc.espace(10)
      const larg = cc.largeur / 2 - 10
      const xd = cc.gauche + cc.largeur / 2 + 10
      const y0 = cc.y
      const ecrire = (s: string, x: number, y: number, taille = 8.5, police = cc.p.r, couleur = couleurs.texte) =>
        cc.page.drawText(nettoyer(s, police), { x, y, size: taille, font: police, color: couleur })
      // Employé (à gauche) : case à signer.
      ecrire('L’employé(e)', cc.gauche, y0 - 9, 9, cc.p.b)
      caseSig = { page: cc.doc.getPageCount() - 1, x: cc.gauche, y: y0 - 78, largeur: larg, hauteur: 58 }
      cc.rect(caseSig.x, caseSig.y, caseSig.largeur, caseSig.hauteur, { bordure: couleurs.gris })
      // Compagnie (à droite) : pré-signée par la personne qui a préparé le contrat.
      ecrire(t.compagnie.raison_sociale || t.compagnie.nom, xd, y0 - 9, 9, cc.p.b)
      const lignes = couper(cc.p, [{ t: `Signé par ${t.signataire} le ${dateLongue(t.prepare_le)}`, italique: true }], 9, larg)
      const avant = cc.y
      cc.y = y0 - 30
      cc.dessinerLignes(lignes, xd, larg, { taille: 9, couleur: couleurs.foret })
      cc.y = avant
      cc.page.drawLine({ start: { x: xd, y: y0 - 80 }, end: { x: xd + larg, y: y0 - 80 }, thickness: 0.6, color: couleurs.trait })
      ecrire(t.signataire, xd, y0 - 92, 9, cc.p.b)
      cc.y = y0 - 120
      return
    }
    cc.texte(`[[${nom} ?]]`, { couleur: couleurs.doux })
  }
  dessinerModele(c, contenu, cs, bloc)
  piedsDePage(doc, p, `${titre} · ${t.compagnie.raison_sociale || t.compagnie.nom} · ${t.saison}`)
  return { octets: await doc.save(), caseSignature: caseSig }
}

/** Champs du consentement parental. */
export interface InfosConsentement {
  employe: { prenom: string; nom_famille: string; date_naissance: string | null }
  compagnie: string
  saison: string
  /** Nom du parent ou tuteur (vide pour l'aperçu) */
  parent: string
  lien: string
}

/** Consentement parental : modèle rempli ; rend la case de signature du parent. */
export async function pdfConsentement(titre: string, contenu: string, i: InfosConsentement, aujourdhui: string) {
  const doc = await nouveauDocument(`${titre} — ${i.employe.prenom} ${i.employe.nom_famille}`)
  const p = await polices(doc)
  const c = new Composeur(doc, p)
  const cs: Record<string, string> = {
    parent: i.parent || ligneVide,
    employe: `${i.employe.prenom} ${i.employe.nom_famille}`.trim(),
    date_naissance: dateLongue(i.employe.date_naissance) || ligneVide,
    compagnie: i.compagnie,
    saison: i.saison,
    date: dateLongue(aujourdhui),
  }
  let caseSig: CaseSignature = { page: 0, x: 54, y: 100, largeur: 220, hauteur: 50 }
  c.nouvellePage()
  dessinerModele(
    c,
    contenu,
    cs,
    (nom, cc) => {
      if (nom === 'saut') return void cc.nouvellePage()
      if (nom === 'signature_parent') {
        cc.besoin(130)
        cc.espace(10)
        cc.texte(`Date de la signature : ${cs.date}`, { taille: 9.5, apres: 2 })
        cc.texte(`Nom du parent/tuteur légal : ${cs.parent}${i.lien ? ` (${i.lien})` : ''}`, { taille: 9.5, apres: 6 })
        cc.texte('Signature du parent/tuteur légal :', { taille: 9.5, apres: 4 })
        caseSig = { page: cc.doc.getPageCount() - 1, x: cc.gauche, y: cc.y - 62, largeur: cc.largeur / 2 - 10, hauteur: 58 }
        cc.rect(caseSig.x, caseSig.y, caseSig.largeur, caseSig.hauteur, { bordure: couleurs.gris })
        cc.y = caseSig.y - 34
        return
      }
      cc.texte(`[[${nom} ?]]`, { couleur: couleurs.doux })
    },
    10,
  )
  piedsDePage(doc, p, `${titre} · ${i.compagnie} · ${i.saison}`)
  return { octets: await doc.save(), caseSignature: caseSig }
}
