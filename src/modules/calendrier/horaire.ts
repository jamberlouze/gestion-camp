// L'animation vient du module Horaire d'animation (fonctions pures). Un
// horaire daté (horaire.horaires.debut) place chacun de ses jours à la
// première date, à partir de debut, qui porte ce nom — même règle que
// calendrier.date_du_jour dans la base (vue commune).

import { activiteEffective, cartesFusion, completer, estBruit, joursConge, norm } from '@/modules/horaire/logique'
import { JEUX, JOURS_SEMAINE, SURVEILLANCES, type EtatSemaine, type GroupeHoraire } from '@/modules/horaire/types'
import { ajouterJours, jourSemaine } from './dates'

export interface HoraireDate {
  id: string
  nom: string
  debut: string
  etat: Partial<EtatSemaine>
}

export function dateDuJour(debut: string, jour: string): string | null {
  const i = JOURS_SEMAINE.indexOf(jour)
  return i < 0 ? null : ajouterJours(debut, (i - jourSemaine(debut) + 7) % 7)
}

/** Animateur du groupe ce jour-là : pendant son congé, le remplaçant (ou personne). */
export function animateurPresent(g: GroupeHoraire, jour: string): { nom: string; remplace: string | null } | null {
  if (joursConge(g.conge).includes(jour)) return g.remp?.trim() ? { nom: g.remp.trim(), remplace: g.anim?.trim() || null } : null
  return g.anim?.trim() ? { nom: g.anim.trim(), remplace: null } : null
}

export interface GroupeDuJour {
  groupe: GroupeHoraire
  animateur: { nom: string; remplace: string | null } | null
  /** Activité de chaque période (fusions comprises), vide si rien. */
  activites: { periode: string; activite: string }[]
}

export interface JourneeAnimation {
  horaire: HoraireDate
  jour: string
  periodes: string[]
  groupes: GroupeDuJour[]
  /** Tâches de soirée de la nuit de ce jour, par animateur. */
  soirees: { animateur: string; tache: string }[]
}

/** Ce que l'horaire prévoit à cette date, ou null s'il ne la couvre pas. */
export function journee(h: HoraireDate, date: string): JourneeAnimation | null {
  const e = completer(h.etat)
  const jour = e.jours.find((j) => dateDuJour(h.debut, j) === date)
  if (!jour) return null
  const { couverture } = cartesFusion(e)
  const groupes = e.groupes.map((g) => ({
    groupe: g,
    animateur: animateurPresent(g, jour),
    activites: e.periodes
      .map((periode, pi) => {
        const a = norm(activiteEffective(e, g.id, jour, pi, couverture))
        return a && !estBruit(a) ? { periode, activite: a } : null
      })
      .filter((x): x is { periode: string; activite: string } => !!x),
  }))

  const soirees: { animateur: string; tache: string }[] = []
  const ajouter = (dict: Record<string, string[]>, libelle: (prefixe: string) => string) => {
    for (const [cle, noms] of Object.entries(dict ?? {})) {
      const [prefixe, nuit] = cle.split('|')
      if (nuit !== jour) continue
      for (const n of noms ?? []) if (n?.trim()) soirees.push({ animateur: n.trim(), tache: libelle(prefixe) })
    }
  }
  ajouter(e.chouettes, (section) => `Chouette (${section})`)
  ajouter(e.jeux, (id) => JEUX.find((j) => j.id === id)?.libelle ?? `Jeu de soirée ${id}`)
  ajouter(e.surv, (id) => SURVEILLANCES.find((s) => s.id === id)?.libelle ?? `Surveillance ${id}`)
  soirees.sort((a, b) => a.animateur.localeCompare(b.animateur, 'fr') || a.tache.localeCompare(b.tache, 'fr'))

  return { horaire: h, jour, periodes: e.periodes, groupes, soirees }
}
