// Banques d'une feuille individuelle (direction, admins, employé qui remplit
// la sienne) : fonctions pures, sans import (testées sous Node :
// npm run test:temps). Rien n'est stocké : les soldes se recalculent d'après
// les heures, les jours de maladie accordés et les ajustements manuels
// (tables temps.jours_maladie et temps.ajustements_banques).
//
// Règles (décisions de Maxime, 2026-10-14) :
//   - vacances : pas dans l'app (Employeur D les calcule à chaque paie) ;
//   - maladie : N jours par année civile (défaut 2, minimum de la loi),
//     accordés le 1er janvier ; 1 jour = 8 h (40 h ÷ 5 jours) ; les heures
//     de maladie de la feuille se déduisent ;
//   - heures accumulées : les heures régulières au-delà de 40 h dans une
//     semaine (dimanche au samedi) s'ajoutent heure pour heure (1×) ; les
//     heures « prises en banque » se déduisent. Woofing (non payé),
//     vacances, maladie et heures prises en banque ne comptent pas dans les
//     40 h. Employé de plusieurs compagnies : toutes ses heures comptent ;
//   - solde continu, reporté : jamais remis à zéro tout seul (le maladie
//     non pris reste aussi) ; ajustements manuels avec une note ;
//   - interrupteur « Heures en banque » (temps.banque_heures_etats) : activé
//     par défaut pour la direction et les admins, désactivé pour les
//     employés ; chaque changement vaut à partir d'une période (`depuis`,
//     un dimanche de début de période). Une semaine accumule seulement si
//     l'état en vigueur à son dimanche est « activé » ; désactivé, le solde
//     reste et peut encore être pris ou ajusté ;
//   - employé sans compte (onglet Employés seulement) : pas de banque
//     maladie (`avecMaladie: false`).

export const HEURES_PAR_JOUR_MALADIE = 8
export const JOURS_MALADIE_DEFAUT = 2
export const SEUIL_SEMAINE = 40
/** Première année où des jours de maladie sont accordés (année de la première période). */
export const PREMIERE_ANNEE_BANQUES = 2026

export type Banque = 'maladie' | 'heures'

export interface HeureBanque {
  jour: string
  /** regulieres, vacances, maladie, banque (prises en banque), woofing */
  type: string
  heures: number
}

export interface AjustementBanque {
  id: string
  banque: Banque
  jour: string
  heures: number
  note: string
  auteur_nom: string
  created_at: string
}

/** Interrupteur « Heures en banque » : `active` à partir de la période qui commence le dimanche `depuis`. */
export interface EtatBanqueHeures {
  depuis: string
  active: boolean
}

/** « À partir de `annee`, `jours` par année. » */
export interface ReglageMaladie {
  annee: number
  jours: number
}

export interface Mouvement {
  cle: string
  banque: Banque
  jour: string
  /** + ajout, − retrait */
  heures: number
  genre: 'octroi' | 'accumulees' | 'prises' | 'ajustement'
  libelle: string
  detail: string | null
  /** Solde de la banque après ce mouvement. */
  solde: number
}

const MS_JOUR = 86_400_000
const deux = (n: number) => String(n).padStart(2, '0')
const versJour = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number)
  return Math.round(Date.UTC(a, m - 1, j) / MS_JOUR)
}
const depuisJour = (n: number) => {
  const d = new Date(n * MS_JOUR)
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}
/** Dimanche de la semaine de `iso` (le 1er janvier 1970 était un jeudi). */
const dimanche = (iso: string) => {
  const n = versJour(iso)
  return depuisJour(n - ((((n + 4) % 7) + 7) % 7))
}
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const court = (iso: string) => {
  const [, m, j] = iso.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`
}
/** « 4 au 10 oct. », « 25 oct. au 1er nov. » */
const intervalle = (d: string, f: string) => (d.slice(0, 7) === f.slice(0, 7) ? `${court(d).split(' ')[0]} au ${court(f)}` : `${court(d)} au ${court(f)}`)
const arrondi = (n: number) => Math.round(n * 100) / 100
const nombre = (n: number) => String(arrondi(n)).replace('.', ',')

/** Jours de maladie accordés pour l'année (le réglage le plus récent qui la couvre, sinon 2). */
export function joursMaladiePour(annee: number, reglages: ReglageMaladie[]): number {
  const r = reglages.filter((x) => x.annee <= annee).sort((a, b) => b.annee - a.annee)[0]
  return r ? Number(r.jours) : JOURS_MALADIE_DEFAUT
}

const ORDRE: Record<Mouvement['genre'], number> = { octroi: 0, ajustement: 1, accumulees: 2, prises: 3 }

/**
 * État de la mise en banque au jour `jour` : le dernier changement dont
 * `depuis` est au plus tard ce jour-là, sinon le défaut (`depuis` null).
 */
export function etatBanqueHeures(etats: EtatBanqueHeures[], parDefaut: boolean, jour: string): { active: boolean; depuis: string | null } {
  const e = etats.filter((x) => x.depuis <= jour).sort((a, b) => b.depuis.localeCompare(a.depuis))[0]
  return e ? { active: e.active, depuis: e.depuis } : { active: parDefaut, depuis: null }
}

/**
 * Tous les mouvements des deux banques jusqu'au jour `au` (inclus), du plus
 * ancien au plus récent, avec le solde courant de chaque banque. Les heures
 * d'une semaine comptent en un mouvement daté de son samedi (ou de `au`).
 */
export function mouvementsBanques(p: {
  heures: HeureBanque[]
  ajustements: AjustementBanque[]
  reglagesMaladie: ReglageMaladie[]
  au: string
  /** Interrupteur « Heures en banque » (vide = le défaut partout). */
  etatsHeures?: EtatBanqueHeures[]
  /** Défaut de l'interrupteur : oui pour la direction et les admins (par défaut), non pour un employé. */
  heuresActivesParDefaut?: boolean
  /** Faux pour un employé sans compte : pas de banque maladie. */
  avecMaladie?: boolean
}): Mouvement[] {
  const liste: Omit<Mouvement, 'solde'>[] = []
  const etats = p.etatsHeures ?? []
  const parDefaut = p.heuresActivesParDefaut ?? true
  const avecMaladie = p.avecMaladie ?? true

  // Jours de maladie accordés chaque 1er janvier.
  const derniereAnnee = avecMaladie ? Number(p.au.slice(0, 4)) : PREMIERE_ANNEE_BANQUES - 1
  for (let a = PREMIERE_ANNEE_BANQUES; a <= derniereAnnee; a++) {
    const jours = joursMaladiePour(a, p.reglagesMaladie)
    if (!jours) continue
    liste.push({
      cle: `octroi-${a}`,
      banque: 'maladie',
      jour: `${a}-01-01`,
      heures: jours * HEURES_PAR_JOUR_MALADIE,
      genre: 'octroi',
      libelle: `${nombre(jours)} jour${jours > 1 ? 's' : ''} accordé${jours > 1 ? 's' : ''} pour ${a}`,
      detail: `1 jour = ${HEURES_PAR_JOUR_MALADIE} h`,
    })
  }

  // Heures, semaine par semaine.
  const semaines = new Map<string, { regulieres: number; maladie: number; banque: number }>()
  for (const h of p.heures) {
    if (h.jour > p.au) continue
    const d = dimanche(h.jour)
    const s = semaines.get(d) ?? { regulieres: 0, maladie: 0, banque: 0 }
    if (h.type === 'regulieres') s.regulieres += Number(h.heures)
    else if (h.type === 'maladie') s.maladie += Number(h.heures)
    else if (h.type === 'banque') s.banque += Number(h.heures)
    semaines.set(d, s)
  }
  for (const [d, s] of semaines) {
    const samedi = depuisJour(versJour(d) + 6)
    const jour = samedi > p.au ? p.au : samedi
    const semaine = `semaine du ${intervalle(d, samedi)}`
    const surplus = etatBanqueHeures(etats, parDefaut, d).active ? arrondi(s.regulieres - SEUIL_SEMAINE) : 0
    if (surplus > 0)
      liste.push({
        cle: `accumulees-${d}`,
        banque: 'heures',
        jour,
        heures: surplus,
        genre: 'accumulees',
        libelle: `Accumulées, ${semaine}`,
        detail: `${nombre(s.regulieres)} h régulières, au-delà de ${SEUIL_SEMAINE} h`,
      })
    if (s.banque > 0)
      liste.push({
        cle: `prises-heures-${d}`,
        banque: 'heures',
        jour,
        heures: -arrondi(s.banque),
        genre: 'prises',
        libelle: `Prises en banque, ${semaine}`,
        detail: null,
      })
    if (s.maladie > 0 && avecMaladie)
      liste.push({
        cle: `prises-maladie-${d}`,
        banque: 'maladie',
        jour,
        heures: -arrondi(s.maladie),
        genre: 'prises',
        libelle: `Maladie, ${semaine}`,
        detail: null,
      })
  }

  for (const a of p.ajustements) {
    if (a.jour > p.au || (a.banque === 'maladie' && !avecMaladie)) continue
    liste.push({
      cle: `ajustement-${a.id}`,
      banque: a.banque,
      jour: a.jour,
      heures: Number(a.heures),
      genre: 'ajustement',
      libelle: a.note,
      detail: `Ajustement par ${a.auteur_nom}`,
    })
  }

  liste.sort((a, b) => a.jour.localeCompare(b.jour) || ORDRE[a.genre] - ORDRE[b.genre] || a.cle.localeCompare(b.cle))
  const soldes: Record<Banque, number> = { maladie: 0, heures: 0 }
  return liste.map((m) => {
    soldes[m.banque] = arrondi(soldes[m.banque] + m.heures)
    return { ...m, solde: soldes[m.banque] }
  })
}

/** Ce qui se passe dans une banque pendant une période : solde avant, mouvements, solde après. */
export function resumePeriode(mouvements: Mouvement[], banque: Banque, debut: string, fin: string) {
  const siens = mouvements.filter((m) => m.banque === banque)
  const avant = arrondi(siens.filter((m) => m.jour < debut).reduce((s, m) => s + m.heures, 0))
  const dans = siens.filter((m) => m.jour >= debut && m.jour <= fin)
  const ajouts = arrondi(dans.filter((m) => m.heures > 0).reduce((s, m) => s + m.heures, 0))
  const retraits = arrondi(dans.filter((m) => m.heures < 0).reduce((s, m) => s + m.heures, 0))
  return { avant, mouvements: dans, ajouts, retraits, apres: arrondi(avant + ajouts + retraits) }
}

/** Heures de maladie → jours (8 h = 1 jour). */
export const enJours = (heures: number) => arrondi(heures / HEURES_PAR_JOUR_MALADIE)
