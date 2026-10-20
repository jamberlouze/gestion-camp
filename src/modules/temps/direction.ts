// Section Direction de l'onglet Employés (admins seulement) : une ligne par
// compte de la direction, lue de sa feuille (temps.heures), avec
// sa compagnie de paie (temps.paie_direction). Fonction pure.
import type { Feuille, Heure, Membre, Statut } from './donnees'
import type { Entreprise } from './donneesEmployes'
import type { PaieDirectionExport } from './employeurD'

export interface LigneDirection {
  cle: string
  membre: Membre
  /** Compagnie de paie (null : pas encore choisie, réglages Employeur D). */
  compagnie: Entreprise | null
  matricule: string | null
  /** Heures régulières par jour. */
  parJour: Map<string, number>
  sem1: number
  sem2: number
  total: number
  vacances: number
  maladie: number
  /** Heures tirées de sa banque dans la période (calculées seules), plus d'anciennes heures « banque » saisies à la main. */
  banque: number
  note: string
  /** État de sa feuille ; null pour un admin (pas d'approbation). */
  statut: Statut | null
}

/**
 * Toute la direction active (pas les admins : ils ne remplissent pas de
 * feuille, décision du 2026-10-20), plus quiconque a des heures
 * dans la période (ex. compte désactivé depuis), triée par nom.
 * `heures` et `feuilles` : celles de la période ; `milieu` = 1er jour de la semaine 2 ;
 * `tirees` : heures tirées de sa banque dans la période (banques.ts).
 */
export function lignesDirection(p: {
  membres: Membre[]
  heures: Heure[]
  feuilles: Feuille[]
  paie: PaieDirectionExport[]
  entreprises: Entreprise[]
  milieu: string
  tirees?: (userId: string) => number
}): LigneDirection[] {
  const avecHeures = new Set(p.heures.map((h) => h.user_id))
  const parCompagnie = new Map(p.entreprises.map((x) => [x.id, x]))
  const paieDe = new Map(p.paie.map((x) => [x.user_id, x]))
  const feuilleDe = new Map(p.feuilles.map((f) => [f.user_id, f]))
  return p.membres
    .filter((m) => (m.actif && m.role === 'direction') || avecHeures.has(m.id))
    .map((membre) => {
      const parJour = new Map<string, number>()
      let sem1 = 0
      let sem2 = 0
      let vacances = 0
      let maladie = 0
      let banque = p.tirees?.(membre.id) ?? 0
      for (const h of p.heures) {
        if (h.user_id !== membre.id) continue
        if (h.type === 'regulieres') {
          parJour.set(h.jour, (parJour.get(h.jour) ?? 0) + h.heures)
          if (h.jour < p.milieu) sem1 += h.heures
          else sem2 += h.heures
        } else if (h.type === 'vacances') vacances += h.heures
        else if (h.type === 'maladie') maladie += h.heures
        else if (h.type === 'banque') banque += h.heures
      }
      const paie = paieDe.get(membre.id)
      const feuille = feuilleDe.get(membre.id)
      return {
        cle: `direction|${membre.id}`,
        membre,
        compagnie: (paie?.entreprise_id && parCompagnie.get(paie.entreprise_id)) || null,
        matricule: paie?.matricule_employeur_d ?? null,
        parJour,
        sem1,
        sem2,
        total: sem1 + sem2,
        vacances,
        maladie,
        banque,
        note: feuille?.note ?? '',
        statut: membre.role === 'admin' ? null : (feuille?.statut ?? 'ouverte'),
      }
    })
    .sort((a, b) => (a.membre.nom || a.membre.courriel).localeCompare(b.membre.nom || b.membre.courriel, 'fr'))
}
