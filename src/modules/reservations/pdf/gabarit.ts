// Modèles de documents (contrats, pré-arrivée) : une syntaxe simple, ligne
// par ligne, que la direction peut modifier dans Réglages › Modèles.
//
//   # Titre                  grand titre
//   ## Article               article numéroté (1. Objet du contrat…)
//   ### Sous-titre           ligne en gras
//   - puce / "  - sous-puce" puces (deux espaces par niveau)
//   1. élément               liste numérotée (le numéro tel qu'écrit)
//   | a | b |                lignes consécutives = un tableau
//   **gras**, _italique_     dans le texte
//   {{champ}}                remplacé par la valeur (voir champs.ts)
//   {{#si champ}} … {{/si}}  lignes gardées seulement si le champ n'est pas vide
//   [[bloc]]                 entete, paiement, etages, salles, signatures, saut
//   ligne vide               petit espace

import { couleurs, morceaux, type Composeur } from './moteur'
import { valeurChamp } from './champs'

export type Bloc = (nom: string, c: Composeur) => void

/** Remplace les {{champs}} ; un champ inconnu reste visible entre crochets. */
export function remplir(texte: string, cs: Record<string, string>): string {
  return texte.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, cle: string) => valeurChamp(cs, cle) ?? `[${cle} ?]`)
}

const vrai = (v: string | undefined) => !!v && v.trim() !== '' && v !== '0' && v !== 'Non' && v !== '0,00 $'

/** Retire les blocs {{#si champ}} … {{/si}} dont le champ est vide. */
export function conditions(lignes: string[], cs: Record<string, string>): string[] {
  const res: string[] = []
  const pile: boolean[] = []
  for (const l of lignes) {
    const si = /^\s*\{\{#si\s+(\w+)\s*\}\}\s*$/.exec(l)
    if (si) {
      pile.push(vrai(valeurChamp(cs, si[1])))
      continue
    }
    if (/^\s*\{\{\/si\}\}\s*$/.test(l)) {
      pile.pop()
      continue
    }
    if (pile.every(Boolean)) res.push(l)
  }
  return res
}

/** Largeurs et alignements d'un tableau d'après son contenu. */
function colonnes(lignes: string[][]) {
  const n = Math.max(...lignes.map((l) => l.length))
  const visible = (s: string) => s.replace(/\*\*|_/g, '')
  return Array.from({ length: n }, (_, i) => {
    const cellules = lignes.map((l) => visible(l[i] ?? ''))
    const long = Math.max(...cellules.map((c) => c.length))
    const nombres = cellules.slice(1).filter(Boolean)
    const chiffres = nombres.length > 0 && nombres.every((c) => /^[\d\s ,.$+/\-–ajustements]+$/i.test(c) && /\d/.test(c))
    return { part: Math.min(Math.max(long, 6), 70), align: i > 0 && chiffres ? ('droite' as const) : ('gauche' as const) }
  })
}

/**
 * Dessine un modèle déjà rempli. `bloc` dessine les [[blocs]] spéciaux ;
 * `taille` = taille du texte courant.
 */
export function dessinerModele(c: Composeur, contenu: string, cs: Record<string, string>, bloc: Bloc, taille = 9.5) {
  const lignes = conditions(contenu.replace(/\r/g, '').split('\n'), cs).map((l) => remplir(l, cs))
  let article = 0
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]
    const t = l.trim()
    if (!t) {
      c.espace(taille * 0.5)
      continue
    }
    const special = /^\[\[(\w+)\]\]$/.exec(t)
    if (special) {
      bloc(special[1], c)
      continue
    }
    if (t.startsWith('|')) {
      const tableau: string[][] = []
      while (i < lignes.length && lignes[i].trim().startsWith('|')) {
        tableau.push(lignes[i].trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim()))
        i++
      }
      i--
      const entete = tableau[0].every((x) => !x || /^\*\*.*\*\*$/.test(x)) && tableau.length > 1 ? tableau[0] : undefined
      c.espace(2)
      c.tableau(colonnes(tableau), entete ? tableau.slice(1) : tableau, { entete, taille: taille - 0.5, bordure: true })
      c.espace(4)
      continue
    }
    let m = /^(#{1,3})\s+(.*)$/.exec(t)
    if (m) {
      if (m[1] === '#') {
        c.besoin(40)
        c.texte(m[2], { taille: taille + 5, apres: 4 })
      } else if (m[1] === '##') {
        article++
        c.espace(taille * 0.6)
        c.besoin(taille * 4)
        c.texte(morceaux(`${article}. ${m[2]}`, { gras: true }), { taille: taille + 1, apres: 2, couleur: couleurs.foret })
      } else {
        c.espace(taille * 0.3)
        c.besoin(taille * 3)
        c.texte(morceaux(m[2], { gras: true }), { taille: taille + 0.5, apres: 1 })
      }
      continue
    }
    m = /^(\s*)[-*]\s+(.*)$/.exec(l)
    if (m) {
      c.puce(m[2], Math.floor(m[1].length / 2), { taille })
      continue
    }
    m = /^(\d+)\.\s+(.*)$/.exec(t)
    if (m) {
      c.puce(m[2], 0, { taille, marque: `${m[1]}.` })
      c.espace(1.5)
      continue
    }
    c.texte(t, { taille, apres: 2 })
  }
}
