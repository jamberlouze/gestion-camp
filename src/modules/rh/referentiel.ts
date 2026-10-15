// Lien avec le référentiel Employés (plan-rh.md §14.5) : correspondance
// proposée dans « Relier au référentiel ». Mêmes règles que la base
// (rh.lier_referentiel) : la seule fiche au même courriel (sûre), sinon la
// seule au même prénom et nom de famille (à vérifier) ; jamais une fiche déjà
// reliée à une autre personne. Fonction pure, testée sous Node :
// node --test src/modules/rh/referentiel.test.mjs

import type { EmployeReferentiel, Personne } from './types.ts'

const net = (t: string | null | undefined) => (t ?? '').trim().toLowerCase()
const sansAccents = (t: string | null | undefined) => net(t).normalize('NFD').replace(/\p{M}/gu, '')

export interface Correspondance {
  employe: EmployeReferentiel
  /** Même courriel : sûre ; même nom : à vérifier */
  sure: boolean
}

/** Fiche du référentiel proposée pour une personne ; null s'il n'y en a pas une seule. */
export function correspondance(p: Pick<Personne, 'courriel' | 'prenom' | 'nom_famille'>, employes: EmployeReferentiel[], reliees: Set<string>): Correspondance | null {
  const libres = employes.filter((e) => !reliees.has(e.id))
  if (p.courriel) {
    const memes = libres.filter((e) => net(e.courriel) === net(p.courriel))
    if (memes.length === 1) return { employe: memes[0], sure: true }
  }
  if (p.nom_famille.trim()) {
    const memes = libres.filter((e) => sansAccents(e.prenom) === sansAccents(p.prenom) && sansAccents(e.nom_famille) === sansAccents(p.nom_famille))
    if (memes.length === 1) return { employe: memes[0], sure: false }
  }
  return null
}

/** « Hibou (Pelletier, Thomas) » */
export const nomFiche = (e: Pick<EmployeReferentiel, 'surnom' | 'nom_complet'>) => (e.nom_complet && e.nom_complet !== e.surnom ? `${e.surnom} (${e.nom_complet})` : e.surnom)
