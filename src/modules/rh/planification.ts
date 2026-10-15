// Planification de la saison et diètes par semaine (plan-rh.md §14.1 et
// §14.2) : remplace la feuille « Suivi RH 2026 ». Fonctions pures, sans
// React ni Supabase, testées sous Node : node --test src/modules/rh/planification.test.mjs
//
// Une case = une embauche × une date de sa saison (rh.planification), avec
// un code (rh.codes_planification). Un code `present` compte comme présent
// (diètes, « Tous présents ») ; un code `besoin` compte face au besoin prévu
// (« Présents », « Écart »).

import { rangDuJour, sansAccents } from './outils.ts'
import { DIETES } from './types.ts'
import type { CasePlanification, CodePlanification, Compagnie, DateSaison, Diete, Dossier, Embauche, GenreDate, Personne, Pilotage, Poste, Saison } from './types.ts'

/** Clé d'une case. */
export const cleCase = (embaucheId: string, dateId: string) => `${embaucheId}|${dateId}`

/** Genres de dates affichés par défaut (les séjours sur demande). */
export const GENRES_PAR_DEFAUT: GenreDate[] = ['formation', 'semaine', 'autre']

/** Dates d'une saison des genres demandés, dans l'ordre chronologique. */
export function datesAffichees(dates: DateSaison[], saisonId: string, genres: GenreDate[]) {
  return dates
    .filter((d) => d.saison_id === saisonId && genres.includes(d.genre))
    .sort((a, b) => (a.debut ?? '9999').localeCompare(b.debut ?? '9999') || (a.fin ?? '').localeCompare(b.fin ?? '') || a.ordre - b.ordre)
}

/**
 * Saison affichée par défaut : la prochaine (d'après le jour) qui a des
 * embauches et des dates, sinon la plus récente qui en a, sinon celle de
 * l'onglet Employés.
 */
export function saisonPlanification(saisons: Saison[], embauches: Pick<Embauche, 'saison_id'>[], dates: Pick<DateSaison, 'saison_id'>[], jour: string) {
  const avecEmbauches = new Set(embauches.map((e) => e.saison_id))
  const avecDates = new Set(dates.map((d) => d.saison_id))
  const candidates = [...saisons].sort((a, b) => a.rang - b.rang).filter((s) => avecEmbauches.has(s.id) && avecDates.has(s.id))
  if (candidates.length) return (candidates.find((s) => s.rang >= rangDuJour(jour)) ?? candidates.at(-1)!).id
  const avec = [...saisons].sort((a, b) => a.rang - b.rang).filter((s) => avecEmbauches.has(s.id))
  return (avec.find((s) => s.rang >= rangDuJour(jour)) ?? avec.at(-1) ?? saisons.at(-1))?.id ?? null
}

/** Nom d'une ligne : le nom de camp, sinon le prénom. */
export const nomPlanification = (p: Pick<Personne, 'surnom' | 'prenom'>) => p.surnom || p.prenom

export interface GroupePoste {
  poste: Poste | null
  lignes: Embauche[]
}
export interface GroupeCompagnie {
  compagnie: Compagnie | null
  postes: GroupePoste[]
}

/**
 * Lignes de la grille : embauches non annulées de la saison (emplois et
 * bénévoles), groupées par compagnie (ordre du référentiel) puis par poste
 * (ordre des postes) ; sans compagnie ou sans poste à la fin.
 */
export function groupesPlanification(p: {
  embauches: Embauche[]
  saisonId: string
  personneParId: Map<string, Personne>
  posteParId: Map<string, Poste>
  compagnies: Compagnie[]
}): GroupeCompagnie[] {
  const parCompagnie = new Map<string, Map<string, Embauche[]>>()
  for (const e of p.embauches) {
    if (e.saison_id !== p.saisonId || e.statut === 'annulee' || !p.personneParId.has(e.personne_id)) continue
    const c = e.entreprise_id ?? ''
    const postes = parCompagnie.get(c) ?? new Map<string, Embauche[]>()
    postes.set(e.poste_id ?? '', [...(postes.get(e.poste_id ?? '') ?? []), e])
    parCompagnie.set(c, postes)
  }
  const ordreCompagnie = new Map(p.compagnies.map((c) => [c.id, c.ordre]))
  const compagnieParId = new Map(p.compagnies.map((c) => [c.id, c]))
  const nom = (e: Embauche) => {
    const x = p.personneParId.get(e.personne_id)!
    return sansAccents(`${nomPlanification(x)} ${x.nom_complet}`)
  }
  return [...parCompagnie]
    .sort(([a], [b]) => (a ? (ordreCompagnie.get(a) ?? 998) : 999) - (b ? (ordreCompagnie.get(b) ?? 998) : 999))
    .map(([cid, postes]) => ({
      compagnie: compagnieParId.get(cid) ?? null,
      postes: [...postes]
        .map(([pid, lignes]) => ({ poste: p.posteParId.get(pid) ?? null, lignes: lignes.sort((a, b) => nom(a).localeCompare(nom(b), 'fr')) }))
        .sort(
          (a, b) =>
            (a.poste ? a.poste.ordre : 1e9) - (b.poste ? b.poste.ordre : 1e9) || (a.poste?.nom ?? '').localeCompare(b.poste?.nom ?? '', 'fr'),
        ),
    }))
}

/** Embauches des groupes, dans l'ordre d'affichage. */
export const lignesDesGroupes = (groupes: GroupeCompagnie[]) => groupes.flatMap((g) => g.postes.flatMap((p) => p.lignes))

export interface Comptes {
  /** Codes `besoin` (face au besoin prévu) */
  presents: number
  /** Codes `present` */
  tousPresents: number
}

/** Présents par date, pour les embauches affichées seulement (une embauche annulée garde ses cases). */
export function comptesParDate(cases: CasePlanification[], codeParId: Map<string, CodePlanification>, embaucheIds: Set<string>) {
  const m = new Map<string, Comptes>()
  for (const c of cases) {
    if (!embaucheIds.has(c.embauche_id)) continue
    const code = codeParId.get(c.code_id)
    if (!code) continue
    const x = m.get(c.date_id) ?? { presents: 0, tousPresents: 0 }
    if (code.besoin) x.presents++
    if (code.present) x.tousPresents++
    m.set(c.date_id, x)
  }
  return m
}

/** Présents − besoin prévu ; null sans besoin saisi. */
export const ecart = (presents: number, besoin: number | null | undefined) => (besoin == null ? null : presents - besoin)

/** Pilotage d'une date (vide si rien de saisi). */
export const pilotageDe = (pilotage: Pilotage[], dateId: string) => pilotage.find((x) => x.date_id === dateId) ?? { date_id: dateId, besoin: null, reel_an_passe: null }

/**
 * État d'une case : `dispo` = case vide où la personne s'est dite
 * disponible (dossier d'embauche) ; `horsDispo` = code « présent » sur une
 * date qu'elle n'a pas cochée, une fois son dossier reçu.
 */
export function etatCase(e: Pick<Embauche, 'disponibilites' | 'dossier_recu_le'>, dateId: string, code: CodePlanification | undefined) {
  const coche = e.disponibilites.includes(dateId)
  return { dispo: !code && coche, horsDispo: !!code?.present && !!e.dossier_recu_le && !coche }
}

/**
 * Code choisi au clavier : la saisie (une ou plusieurs lettres, sans tenir
 * compte des accents ni de la casse) est le début du code. Une seule lettre
 * (ou la même répétée) passe au code suivant qui commence par elle.
 */
export function codeParLettres(codes: CodePlanification[], saisie: string, actuelId: string | null) {
  const s = sansAccents(saisie)
  if (!s) return null
  const actifs = codes.filter((c) => c.actif).sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code))
  const commencent = (debut: string) => actifs.filter((c) => sansAccents(c.code).startsWith(debut))
  const tourner = (liste: CodePlanification[]) => {
    if (!liste.length) return null
    const i = liste.findIndex((c) => c.id === actuelId)
    return liste[(i + 1) % liste.length].id
  }
  const memeLettre = [...s].every((ch) => ch === s[0])
  if (memeLettre && (s.length === 1 || !commencent(s).length)) return tourner(commencent(s[0]))
  return commencent(s)[0]?.id ?? null
}

// ------------------------------------------------------------
// Diètes par semaine (pour la cuisine)
// ------------------------------------------------------------

export type DieteAffichee = Diete | 'non_precisee'
/** Diètes du dossier d'embauche, puis « Non précisée » (sans dossier ou sans réponse). */
export const DIETES_AFFICHEES: { id: DieteAffichee; nom: string }[] = [...DIETES, { id: 'non_precisee', nom: 'Non précisée' }]

/** Embauches présentes (code `present`) par date. */
export function presentsParDate(cases: CasePlanification[], codeParId: Map<string, CodePlanification>, embaucheIds: Set<string>) {
  const m = new Map<string, string[]>()
  for (const c of cases) {
    if (!embaucheIds.has(c.embauche_id) || !codeParId.get(c.code_id)?.present) continue
    m.set(c.date_id, [...(m.get(c.date_id) ?? []), c.embauche_id])
  }
  return m
}

export interface DietesDate {
  date_id: string
  total: number
  /** Nombre par diète (toutes les diètes, 0 compris) */
  parDiete: Record<DieteAffichee, number>
  /** Pourcentage arrondi de chaque diète (0 si personne) */
  pourcents: Record<DieteAffichee, number>
  /** Allergies des présents (nom + allergie), par nom */
  allergies: { nom: string; allergie: string }[]
}

/** Diètes et allergies des présents, date par date. */
export function dietesParDate(p: {
  dates: DateSaison[]
  cases: CasePlanification[]
  codeParId: Map<string, CodePlanification>
  embauches: Embauche[]
  personneParId: Map<string, Personne>
  dossierDe: Map<string, Pick<Dossier, 'diete' | 'allergies'>>
}): DietesDate[] {
  const embauche = new Map(p.embauches.map((e) => [e.id, e]))
  const presents = presentsParDate(p.cases, p.codeParId, new Set(embauche.keys()))
  return p.dates.map((d) => {
    const parDiete = Object.fromEntries(DIETES_AFFICHEES.map((x) => [x.id, 0])) as Record<DieteAffichee, number>
    const allergies: { nom: string; allergie: string }[] = []
    const ids = presents.get(d.id) ?? []
    for (const id of ids) {
      const e = embauche.get(id)!
      const dossier = p.dossierDe.get(e.personne_id)
      parDiete[dossier?.diete ?? 'non_precisee']++
      const allergie = dossier?.allergies?.trim()
      const personne = p.personneParId.get(e.personne_id)
      if (allergie && personne) allergies.push({ nom: nomPlanification(personne), allergie })
    }
    const total = ids.length
    const pourcents = Object.fromEntries(DIETES_AFFICHEES.map((x) => [x.id, total ? Math.round((parDiete[x.id] / total) * 100) : 0])) as Record<DieteAffichee, number>
    allergies.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    return { date_id: d.id, total, parDiete, pourcents, allergies }
  })
}

// ------------------------------------------------------------
// Export CSV de la grille
// ------------------------------------------------------------

/** Valeur CSV (séparateur « ; », Excel en français). */
export function champCsv(v: string | number | null | undefined) {
  const t = v == null ? '' : String(v)
  return /[;"\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
}

export interface LigneCsv {
  compagnie: string
  poste: string
  nom: string
  prenom: string
  nomFamille: string
  statut: string
  /** Code de chaque date (par date_id) */
  codes: Record<string, string>
  diete: string
  allergies: string
  tshirt: string
  hoodie: string
}

/**
 * Grille en CSV : en-têtes (une colonne par date), lignes de pilotage, puis
 * une ligne par embauche. Commence par l'indicateur UTF-8 (accents dans Excel).
 */
export function csvPlanification(p: {
  dates: { id: string; libelle: string }[]
  pilotage: { libelle: string; valeurs: Record<string, number | null> }[]
  lignes: LigneCsv[]
}) {
  const entete = ['Compagnie', 'Poste', 'Nom de camp', 'Prénom', 'Nom', 'Statut', ...p.dates.map((d) => d.libelle), 'Diète', 'Allergies', 'T-shirt', 'Hoodie']
  const vide = ['', '', '', '', '']
  const rangees = [
    entete,
    ...p.pilotage.map((l) => [l.libelle, ...vide, ...p.dates.map((d) => l.valeurs[d.id] ?? ''), '', '', '', '']),
    ...p.lignes.map((l) => [l.compagnie, l.poste, l.nom, l.prenom, l.nomFamille, l.statut, ...p.dates.map((d) => l.codes[d.id] ?? ''), l.diete, l.allergies, l.tshirt, l.hoodie]),
  ]
  return '﻿' + rangees.map((r) => r.map(champCsv).join(';')).join('\r\n')
}
