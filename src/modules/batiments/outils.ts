import type { Disjoncteur, Ligne, Panneau } from './types'

// Fonctions pures : ni React ni Supabase.

/** « A #13-2 », « A #36-38 », « CU #29 » (même règle que batiments.etiquette en SQL). */
export function etiquette(panneau: Pick<Panneau, 'nom'> | undefined, d: Pick<Disjoncteur, 'position' | 'demi' | 'bipolaire'>) {
  const suite = d.bipolaire ? `-${d.position + 2}` : d.demi ? `-${d.demi}` : ''
  return `${panneau?.nom ?? '?'} #${d.position}${suite}`
}

/** Emplacements occupés : le sien, plus celui du dessous pour un bipolaire. */
export const cases = (d: Pick<Disjoncteur, 'position' | 'bipolaire'>) => (d.bipolaire ? [d.position, d.position + 2] : [d.position])

/** Rien de noté : à identifier sur place (couper le disjoncteur). */
export const estVide = (d: Pick<Disjoncteur, 'alimente'>) => d.alimente.length === 0

/** Dans le bandeau « À identifier » : rien de noté, ou noté mais à vérifier. */
export const aIdentifier = (d: Pick<Disjoncteur, 'alimente' | 'a_verifier'>) => estVide(d) || d.a_verifier

/**
 * Le disjoncteur déjà à cet emplacement, s'il y en a un (même règle que
 * batiments.verifier_disjoncteur) : deux demis 1 et 2 se partagent un
 * emplacement, rien d'autre.
 */
export function conflit(
  autres: Disjoncteur[],
  d: Pick<Disjoncteur, 'id' | 'panneau_id' | 'position' | 'demi' | 'bipolaire'>,
): Disjoncteur | undefined {
  const siennes = cases(d)
  return autres.find(
    (a) =>
      a.panneau_id === d.panneau_id &&
      a.id !== d.id &&
      cases(a).some((c) => siennes.includes(c)) &&
      !(a.demi && d.demi && a.position === d.position && a.demi !== d.demi),
  )
}

/** Nombre d'emplacements montrés : celui du panneau, ou jusqu'au plus haut noté (nombre pair). */
export function nombreCases(panneau: Pick<Panneau, 'positions'>, disjoncteurs: Disjoncteur[]) {
  const plusHaut = Math.max(panneau.positions ?? 0, ...disjoncteurs.flatMap(cases))
  return Math.max(2, plusHaut + (plusHaut % 2))
}

/** Contenu d'un emplacement dans la vue du panneau. */
export type Case =
  | { genre: 'vide'; position: number }
  | { genre: 'plein'; position: number; d: Disjoncteur }
  | { genre: 'demis'; position: number; demis: [Disjoncteur | null, Disjoncteur | null] }
  | { genre: 'bipolaire'; position: number; d: Disjoncteur }
  /** Sous un bipolaire : rien à dessiner. */
  | { genre: 'couvert'; position: number }

/**
 * Le panneau rangée par rangée, comme le vrai : impairs à gauche, pairs à
 * droite (1 | 2, 3 | 4…). Un bipolaire couvre sa case et celle du dessous.
 */
export function rangees(panneau: Pick<Panneau, 'positions'>, disjoncteurs: Disjoncteur[]): [Case, Case][] {
  const n = nombreCases(panneau, disjoncteurs)
  const couvertes = new Set(disjoncteurs.filter((d) => d.bipolaire).map((d) => d.position + 2))
  const caseDe = (position: number): Case => {
    if (couvertes.has(position)) return { genre: 'couvert', position }
    const ici = disjoncteurs.filter((d) => d.position === position)
    const bipolaire = ici.find((d) => d.bipolaire)
    if (bipolaire) return { genre: 'bipolaire', position, d: bipolaire }
    const plein = ici.find((d) => !d.demi)
    if (plein) return { genre: 'plein', position, d: plein }
    if (ici.length) return { genre: 'demis', position, demis: [ici.find((d) => d.demi === 1) ?? null, ici.find((d) => d.demi === 2) ?? null] }
    return { genre: 'vide', position }
  }
  return Array.from({ length: n / 2 }, (_, i) => [caseDe(2 * i + 1), caseDe(2 * i + 2)])
}

/** Tri des disjoncteurs d'un panneau : par emplacement, puis demi 1 avant 2. */
export const ordreDisjoncteurs = (a: Disjoncteur, b: Disjoncteur) => a.position - b.position || (a.demi ?? 0) - (b.demi ?? 0)

/** « VFB 3 · Lumière », « Chauffe-eau ». */
export const texteLigne = (l: Ligne) => [l.piece, l.quoi].filter(Boolean).join(' · ')

/** « VFB 1 », « VFB 3 », « VFB 5 » → « VFB 1, 3, 5 » (pièces voisines au même préfixe). */
export function compacter(pieces: string[]): string {
  const morceaux: string[] = []
  let prefixe: string | null = null
  for (const p of pieces) {
    const m = /^(.+?) (\d+(?: \d\/\d)?)$/.exec(p)
    if (m && m[1] === prefixe) morceaux[morceaux.length - 1] += `, ${m[2]}`
    else morceaux.push(p)
    prefixe = m ? m[1] : null
  }
  return morceaux.join(', ')
}

/**
 * Ce qu'alimente un disjoncteur, regroupé par « quoi » (dans l'ordre noté) :
 * { quoi: « Lumière », ou: « VFB 1, 3, 5, Corridor VFB » }.
 */
export function groupes(d: Pick<Disjoncteur, 'alimente'>): { quoi: string | null; ou: string }[] {
  const parQuoi = new Map<string, string[]>()
  for (const l of d.alimente) {
    const cle = l.quoi ?? ''
    parQuoi.set(cle, [...(parQuoi.get(cle) ?? []), ...(l.piece ? [l.piece] : [])])
  }
  return [...parQuoi].map(([quoi, pieces]) => ({ quoi: quoi || null, ou: compacter(pieces) }))
}

/** « Lumière : VFB 1, 3, 5, Corridor VFB · Lumière murale : Cuisinette ». */
export const resume = (d: Pick<Disjoncteur, 'alimente'>) =>
  groupes(d)
    .map(({ quoi, ou }) => (quoi && ou ? `${quoi} : ${ou}` : quoi || ou))
    .join(' · ')

// ------------------------------------------------------------------
// Recherche
// ------------------------------------------------------------------

/** Sans accents ni casse ; « # » et « - » deviennent des espaces, « vfb3 » → « vfb 3 ». */
export function normaliser(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[#\-–·,:()/]/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mots cherchés ; un nombre doit être un nombre entier du texte (« 1 » ne trouve pas « 16 »). */
export function termes(recherche: string): ((texte: string) => boolean)[] {
  return normaliser(recherche)
    .split(' ')
    .filter(Boolean)
    .map((t) => {
      if (/^\d+$/.test(t)) {
        const nombre = new RegExp(`(^|\\D)${t}(\\D|$)`)
        return (texte: string) => nombre.test(texte)
      }
      return (texte: string) => texte.includes(t)
    })
}

/**
 * « A13 », « a #13-2 », « cu29 » : un panneau et un numéro. Rend le nom du
 * panneau (tel qu'écrit) et la position, sinon null.
 */
export function lireEtiquette(recherche: string): { panneau: string; position: number } | null {
  const m = /^\s*([^\d#\s]+)\s*#?\s*(\d{1,2})(?:\s*-\s*\d{1,2})?\s*$/.exec(recherche)
  return m ? { panneau: normaliser(m[1]), position: Number(m[2]) } : null
}

/** Lignes d'un disjoncteur qui répondent à la recherche (toutes si c'est le disjoncteur entier qui répond). */
export function trouver(
  d: Disjoncteur,
  panneau: Pick<Panneau, 'nom'> | undefined,
  tests: ((texte: string) => boolean)[],
): Ligne[] | null {
  if (!tests.length) return null
  const nom = normaliser(etiquette(panneau, d))
  const lignes = d.alimente.filter((l) => {
    const texte = `${nom} ${normaliser(texteLigne(l))}`
    return tests.every((t) => t(texte))
  })
  if (lignes.length) return lignes
  const tout = `${nom} ${normaliser(d.alimente.map(texteLigne).join(' '))} ${normaliser(d.note ?? '')}`
  return tests.every((t) => t(tout)) ? d.alimente : null
}

// ------------------------------------------------------------------
// Par pièce
// ------------------------------------------------------------------

export interface PieceAlimentee {
  /** null = lignes sans pièce (chauffe-eau, alarme…). */
  piece: string | null
  lignes: { quoi: string | null; d: Disjoncteur }[]
}

const parNom = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/** Chaque pièce et ce qui l'alimente (tri naturel : VFB 2 avant VFB 10) ; les lignes sans pièce à la fin. */
export function parPiece(disjoncteurs: Disjoncteur[]): PieceAlimentee[] {
  const pieces = new Map<string | null, PieceAlimentee>()
  for (const d of disjoncteurs) {
    for (const l of d.alimente) {
      const cle = l.piece ? (normaliser(l.piece) as string | null) : null
      const piece = pieces.get(cle) ?? { piece: l.piece, lignes: [] }
      piece.lignes.push({ quoi: l.quoi, d })
      pieces.set(cle, piece)
    }
  }
  return [...pieces.values()].sort((a, b) => (a.piece === null ? 1 : b.piece === null ? -1 : parNom.compare(a.piece, b.piece)))
}
