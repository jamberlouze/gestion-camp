// ------------------------------------------------------------------
// Tâches semblables (demande de Maxime du 2026-10-23) : un signalement
// est peut-être déjà dans la liste, écrit autrement.
//
// On compare les mots des titres, sans casse, accents, pluriel, lettres
// doublées (« flotant » = « flottant ») ni terminaisons courantes
// (« nettoyage » = « nettoyer » = « renettoyer »). Un mot fréquent dans la
// liste (« nettoyer », « peinturer ») compte moins qu'un mot rare
// (« gouttières », « PH10 »). Même lieu : plus semblable ; autre lieu :
// moins. Fonctions pures : npm run test:travaux.
// ------------------------------------------------------------------

/** Mots qui ne disent pas de quoi il s'agit. */
const VIDES = new Set(
  (
    'a au aux avec ce ces cet cette c d dans de des du elle en encore est et etre faut il ils j je l la le les leur leurs ' +
    'ma mal me mes mon n ne ni on ou par pas peu plus pour qu que qui s sa sans se ses son sont sous sur svp ' +
    'ta tes ton tous tout toute toutes tres trop un une y faire fait refaire mettre remettre besoin chose'
  ).split(' '),
)

/**
 * Mots qui disent quoi faire ou ce qui ne va pas, pas sur quoi : ils comptent
 * moins que l'objet (« Laveuse brisée » ressemble plus à « Laveuse : bearing
 * à changer » qu'à « Planche brisée sur le quai »). Racines calculées plus bas.
 */
const MOTS_FAIBLES =
  'reparer reparation changer remplacer installer enlever retirer verifier terminer finir fixer ajouter acheter ' +
  'brise casse bouche eteint brule troue abime endommage defectueux fonctionne marche coule'

/** Terminaisons retirées (après le pluriel), de la plus longue à la plus courte. */
const SUFFIXES = ['issement', 'ement', 'ation', 'age', 'er', 'ez', 'e']

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Racine d'un mot : « Gouttières » → « goutier », « nettoyage » → « netoy ». Les codes (CB12, PH10) restent tels quels. */
export function racine(mot: string) {
  let m = sansAccents(mot)
  if (/\d/.test(m)) return m
  m = m.replace(/(.)\1+/g, '$1')
  if (m.length > 3 && /[sx]$/.test(m)) m = m.slice(0, -1)
  const s = SUFFIXES.find((s) => m.endsWith(s) && m.length - s.length >= 3)
  return s ? m.slice(0, -s.length) : m
}

const FAIBLES = new Set(MOTS_FAIBLES.split(' ').map(racine))

/** Racines des mots qui comptent d'un titre, sans doublons. */
export function mots(titre: string) {
  const liste = sansAccents(titre)
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !VIDES.has(m) && (m.length > 1 || /\d/.test(m)))
  return [...new Set(liste.map(racine))]
}

/** Deux racines désignent la même chose : égales, l'une prolonge l'autre (« peint » / « peintur ») ou « re » devant (« netoy » / « renetoy »). */
function pareil(a: string, b: string) {
  if (a === b) return true
  const [court, long] = a.length < b.length ? [a, b] : [b, a]
  if (/\d/.test(court)) return false
  return (court.length >= 4 && long.startsWith(court)) || long === `re${court}`
}

export interface Semblable<T> {
  tache: T
  /** De 0 à 1. */
  score: number
}

/** Seuil retenu sur les tâches de la base DEV (copie de la PROD) : en dessous, trop de faux doublons. */
export const SEUIL = 0.45

/**
 * Prépare la comparaison avec une liste de tâches (ouvertes, en général) ;
 * rend une fonction qui trouve, pour un titre et un lieu, les tâches les
 * plus semblables, de la plus proche à la moins proche.
 */
export function comparateur<T extends { id: string; titre: string; lieu_id: string | null }>(taches: T[]) {
  const fiches = taches.map((t) => ({ tache: t, mots: mots(t.titre) }))
  // Rareté de chaque racine dans la liste (idf) ; un mot absent de la liste est le plus rare.
  const frequence = new Map<string, number>()
  for (const f of fiches) for (const m of f.mots) frequence.set(m, (frequence.get(m) ?? 0) + 1)
  const poids = (m: string) => Math.log(1 + fiches.length / (1 + (frequence.get(m) ?? 0))) * (FAIBLES.has(m) ? 0.4 : 1)
  const norme = (liste: string[]) => Math.sqrt(liste.reduce((s, m) => s + poids(m) ** 2, 0))

  return function chercher(titre: string, lieuId: string | null, { exclure, max = 3, seuil = SEUIL }: { exclure?: string; max?: number; seuil?: number } = {}) {
    const cherches = mots(titre)
    if (!cherches.length) return []
    const n = norme(cherches)
    const trouves: Semblable<T>[] = []
    for (const f of fiches) {
      if (f.tache.id === exclure || !f.mots.length) continue
      let commun = 0
      for (const m of cherches) {
        const autre = f.mots.find((x) => pareil(m, x))
        if (autre) commun += poids(m) * poids(autre)
      }
      if (!commun) continue
      let score = commun / (n * norme(f.mots))
      if (lieuId && f.tache.lieu_id) score = f.tache.lieu_id === lieuId ? Math.min(1, score * 1.25) : score * 0.7
      if (score >= seuil) trouves.push({ tache: f.tache, score })
    }
    return trouves.sort((a, b) => b.score - a.score).slice(0, max)
  }
}
