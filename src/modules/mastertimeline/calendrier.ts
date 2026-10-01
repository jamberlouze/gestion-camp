// Calendrier de la Mastertimeline : fonctions pures, sans accès aux données.
//
// L'exercice va d'octobre à septembre ; on le désigne par l'année où il
// commence (2026 = exercice 2026-27). Un passage d'une tâche annuelle est
// rangé sous la clé de son mois ('2026-10'). Comme dans Calico, rien n'est
// recopié d'une année à l'autre : la clé change avec le temps, donc chaque
// nouveau passage repart décoché.

import type { Coche, Tache } from './types'

/** Ordre des mois dans l'exercice : octobre → septembre. */
export const MOIS_EXERCICE = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const NOMS_MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Clé de période pour une tâche ponctuelle (elle n'a qu'un passage). */
export const UNIQUE = 'unique'

const deuxChiffres = (n: number) => String(n).padStart(2, '0')
export const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function cleMois(annee: number, mois: number) {
  return `${annee}-${deuxChiffres(mois)}`
}

export function lireCle(cle: string) {
  const [a, m] = cle.split('-').map(Number)
  return { annee: a, mois: m }
}

export function cleAujourdhui(d = new Date()) {
  return cleMois(d.getFullYear(), d.getMonth() + 1)
}

/** 'YYYY-MM-DD' du jour (heure locale). */
export function jourAujourdhui(d = new Date()) {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`
}

export function decalerMois(cle: string, n: number) {
  const { annee, mois } = lireCle(cle)
  const index = annee * 12 + (mois - 1) + n
  return cleMois(Math.floor(index / 12), (index % 12) + 1)
}

export function exerciceDe(annee: number, mois: number) {
  return mois >= 10 ? annee : annee - 1
}

export function exerciceDeCle(cle: string) {
  const { annee, mois } = lireCle(cle)
  return exerciceDe(annee, mois)
}

/** « 2026-27 » */
export function libelleExercice(exercice: number) {
  return `${exercice}-${String(exercice + 1).slice(2)}`
}

/** Première et dernière clé de l'exercice. */
export function bornesExercice(exercice: number): [string, string] {
  return [cleMois(exercice, 10), cleMois(exercice + 1, 9)]
}

/** Les 12 clés de l'exercice, d'octobre à septembre. */
export function clesExercice(exercice: number) {
  return MOIS_EXERCICE.map((m) => cleMois(m >= 10 ? exercice : exercice + 1, m))
}

/** « oct. » */
export function moisCourt(cle: string) {
  return NOMS_MOIS_COURTS[lireCle(cle).mois - 1]
}

/** « octobre 2026 » */
export function libelleMois(cle: string) {
  const { annee, mois } = lireCle(cle)
  return `${NOMS_MOIS[mois - 1]} ${annee}`
}

export const estAnnuelle = (t: Pick<Tache, 'mois'>) => !!t.mois && t.mois.length > 0

/** La tâche revient-elle pendant cet exercice (« aux N ans ») ? */
export function revientEnExercice(t: Tache, exercice: number) {
  if (!estAnnuelle(t) || t.exercice_depart == null) return false
  const ecart = exercice - t.exercice_depart
  return ecart >= 0 && ecart % t.intervalle_ans === 0
}

/** Les clés des passages de la tâche pendant l'exercice, dans l'ordre. */
export function passages(t: Tache, exercice: number): string[] {
  if (!revientEnExercice(t, exercice)) return []
  const mois = new Set(t.mois)
  return clesExercice(exercice).filter((cle) => mois.has(lireCle(cle).mois))
}

/** La tâche a-t-elle un passage ce mois-là ? */
export function passeEnMois(t: Tache, cle: string) {
  return revientEnExercice(t, exerciceDeCle(cle)) && t.mois!.includes(lireCle(cle).mois)
}

/** Mois de l'échéance d'une ponctuelle, ou null. */
export function cleEcheance(t: Tache) {
  return t.echeance ? t.echeance.slice(0, 7) : null
}

/** Clé de période d'une coche pour ce passage (annuelle) ou 'unique'. */
export function periodePour(t: Tache, cle: string) {
  return estAnnuelle(t) ? cle : UNIQUE
}

export type IndexCoches = Map<string, Coche>
export const cleCoche = (tacheId: string, periode: string) => `${tacheId}|${periode}`

export function indexer(coches: Coche[]): IndexCoches {
  return new Map(coches.map((c) => [cleCoche(c.tache_id, c.periode), c]))
}

/** État d'un passage, pour l'affichage. */
export type Etat = 'faite' | 'sautee' | 'retard' | 'a_faire' | 'a_venir'

export function etatPassage(coche: Coche | undefined, cle: string, aujourdhui: string): Etat {
  if (coche?.statut === 'faite') return 'faite'
  if (coche?.statut === 'sautee') return 'sautee'
  if (cle < aujourdhui) return 'retard'
  if (cle === aujourdhui) return 'a_faire'
  return 'a_venir'
}

/** Une ponctuelle est en retard quand son échéance est passée. */
export function ponctuelleEnRetard(t: Tache, coche: Coche | undefined, jour: string) {
  return !estAnnuelle(t) && !!t.echeance && t.echeance < jour && !coche?.statut
}

/**
 * Description de la fréquence : « Chaque année en octobre »,
 * « Septembre, octobre et novembre », « Aux 2 ans en mars », « Une seule fois ».
 */
export function libelleFrequence(t: Pick<Tache, 'mois' | 'intervalle_ans'>) {
  if (!estAnnuelle(t)) return 'Une seule fois'
  const suite = moisALaSuite(t.mois!)
  const mois = (suite ?? MOIS_EXERCICE.filter((m) => t.mois!.includes(m))).map((m) => NOMS_MOIS[m - 1])
  const liste =
    mois.length === 12
      ? 'chaque mois'
      : suite && mois.length > 2
        ? `de ${mois[0]} à ${mois.at(-1)}`
        : mois.length > 1
          ? `${mois.slice(0, -1).join(', ')} et ${mois.at(-1)}`
          : mois[0]
  if (t.intervalle_ans > 1) return `Aux ${t.intervalle_ans} ans : ${liste}`
  return mois.length === 1 ? `Chaque année en ${liste}` : majuscule(liste)
}

/** Mois qui se suivent (septembre, octobre, novembre), dans l'ordre ; sinon null. */
function moisALaSuite(mois: number[]) {
  const ensemble = new Set(mois)
  if (ensemble.size < 2 || ensemble.size === 12) return null
  // Le premier mois de la suite est celui dont le mois d'avant n'en fait pas partie.
  const debut = [...ensemble].find((m) => !ensemble.has(m === 1 ? 12 : m - 1))!
  const suite = Array.from({ length: ensemble.size }, (_, i) => ((debut - 1 + i) % 12) + 1)
  return suite.every((m) => ensemble.has(m)) ? suite : null
}

/** « 18 oct. », avec l'année si ce n'est pas celle de référence. */
export function dateCourte(iso: string, anneeReference = new Date().getFullYear()) {
  const [a, m, j] = iso.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${NOMS_MOIS_COURTS[m - 1]}${a !== anneeReference ? ` ${a}` : ''}`
}
