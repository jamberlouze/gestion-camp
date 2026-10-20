// Banque d'heures d'une feuille individuelle (direction, admins, employé
// qui remplit la sienne, employé sans compte) : fonctions pures, seuls
// imports la liste des fériés et les périodes de paie (pures aussi ; testées
// sous Node : npm run test:temps).
// Rien n'est stocké : le solde se recalcule d'après les heures et les
// ajustements manuels (temps.ajustements_banques).
//
// Règles (décisions de Maxime) :
//   - vacances et maladie : pas dans l'app, ce sont des banques d'Employeur D
//     (2026-10-14 pour les vacances, 2026-10-16 pour la maladie) ; leurs
//     heures sont saisies dans les feuilles et exportées avec leur code
//     d'utilisation (employeurD.ts) ;
//   - tout se compte par PÉRIODE DE PAIE complète (2026-10-20 : « si tu
//     regardes la période au complet, 72 h sur 72 h attendues ») : une
//     semaine longue et une semaine courte de la même période s'annulent ;
//   - heures attendues de la période : 40 h par semaine, 8 h de moins par
//     férié tombé du lundi au vendredi (liste de la CNESST, src/lib/feries.ts ;
//     PP21, avec l'Action de grâces : 72 h) ;
//   - heures accumulées : les heures régulières de la période au-delà des
//     heures attendues s'ajoutent heure pour heure (1×). Woofing (non payé),
//     vacances et maladie n'en créent pas. Employé de plusieurs compagnies :
//     toutes ses heures comptent ;
//   - retrait automatique (2026-10-20, dès PP21) : plus de ligne « Prises en
//     banque » à remplir ; une période finie où les heures payées
//     (régulières, vacances, maladie) n'atteignent pas les heures attendues,
//     le manque est tiré de la banque (payé avec le code des heures prises en
//     banque). Une période sans aucune heure n'est pas comptée (feuille pas
//     remplie, compte d'admin sans feuille). Le solde peut devenir négatif
//     (avertissement aux admins sous 20 h : SEUIL_ALERTE). Les anciennes
//     heures « banque » saisies à la main se déduisent encore ;
//   - solde continu, reporté : jamais remis à zéro tout seul ; ajustements
//     manuels avec une note ;
//   - interrupteur « Heures en banque » (temps.banque_heures_etats) :
//     désactivé par défaut pour tout le monde, quel que soit le rôle
//     (2026-10-20 ; les comptes de la direction et les admins d'avant ont
//     reçu une ligne « activée » depuis PP21, migration 20261020171759) ;
//     un admin l'active ; chaque changement vaut à partir d'une période (`depuis`,
//     un dimanche de début de période). Une période ajoute ou retire
//     seulement si l'état en vigueur à son début est « activé » ;
//     désactivé, le solde reste et ne change plus que par un ajustement.

import { ferie } from '../../lib/feries.ts'
import { codePeriodePaie, debutPeriodePaie, finPeriodePaie } from '../../lib/periodesPaie.ts'

export const SEUIL_SEMAINE = 40
/** Heures de moins dans la semaine pour chaque férié (1 jour = 8 h). */
export const HEURES_FERIE = 8
/** Sous ce solde, les admins sont avertis (onglet Banques, accueil, feuille). */
export const SEUIL_ALERTE = 20
/** Premier jour possible d'un ajustement (année de la première période). */
export const PREMIERE_ANNEE_BANQUES = 2026

export interface HeureBanque {
  jour: string
  /** regulieres, vacances, maladie, woofing ; banque = anciennes heures prises à la main */
  type: string
  heures: number
}

export interface AjustementBanque {
  id: string
  /** Toujours « heures » (les anciens ajustements « maladie » restent en base, ignorés). */
  banque: string
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

export interface Mouvement {
  cle: string
  jour: string
  /** + ajout, − retrait */
  heures: number
  /** tirees : manque d'une période tiré tout seul ; prises : anciennes heures saisies à la main. */
  genre: 'accumulees' | 'tirees' | 'prises' | 'ajustement'
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

const ORDRE: Record<Mouvement['genre'], number> = { ajustement: 0, accumulees: 1, tirees: 2, prises: 3 }

/**
 * Heures attendues dans la semaine de `jour` (dimanche au samedi) : 40 h,
 * moins 8 h par férié tombé du lundi au vendredi ; un férié du samedi ou du
 * dimanche ne change rien. Affichées sous chaque semaine d'une feuille ; la
 * banque compte la période entière (attenduPeriode).
 */
export function seuilSemaine(jour: string): { seuil: number; feries: { jour: string; nom: string }[] } {
  const d = versJour(dimanche(jour))
  const feries = [1, 2, 3, 4, 5].flatMap((i) => {
    const j = depuisJour(d + i)
    const nom = ferie(j)
    return nom ? [{ jour: j, nom }] : []
  })
  return { seuil: SEUIL_SEMAINE - HEURES_FERIE * feries.length, feries }
}

/**
 * Heures attendues de la période de paie de `jour` : la somme des deux
 * semaines (40 h chacune, 8 h de moins par férié du lundi au vendredi).
 */
export function attenduPeriode(jour: string): { attendu: number; feries: { jour: string; nom: string }[] } {
  const debut = debutPeriodePaie(jour)
  const semaines = [seuilSemaine(debut), seuilSemaine(depuisJour(versJour(debut) + 7))]
  return { attendu: semaines[0].seuil + semaines[1].seuil, feries: semaines.flatMap((x) => x.feries) }
}

/** « 72 h attendues (férié : Action de grâces) » */
export function libelleAttendu(jour: string): string {
  const { attendu, feries } = attenduPeriode(jour)
  return `${attendu} h attendues${feries.length ? ` (${feries.length > 1 ? 'fériés' : 'férié'} : ${feries.map((f) => f.nom).join(', ')})` : ''}`
}

/** « au-delà de 72 h (férié : Action de grâces) » */
export function libelleSeuil(jour: string): string {
  return `au-delà de ${libelleAttendu(jour).replace(' attendues', '')}`
}

/** Heures tirées toutes seules de la banque entre `du` et `au` (positif ; payées avec le code des heures prises en banque). */
export function heuresTirees(mouvements: Mouvement[], du: string, au: string): number {
  return arrondi(-mouvements.filter((m) => m.genre === 'tirees' && m.jour >= du && m.jour <= au).reduce((t, m) => t + m.heures, 0))
}

/**
 * État de la mise en banque au jour `jour` : le dernier changement dont
 * `depuis` est au plus tard ce jour-là, sinon désactivée (`depuis` null :
 * le défaut, pour tout le monde).
 */
export function etatBanqueHeures(etats: EtatBanqueHeures[], jour: string): { active: boolean; depuis: string | null } {
  const e = etats.filter((x) => x.depuis <= jour).sort((a, b) => b.depuis.localeCompare(a.depuis))[0]
  return e ? { active: e.active, depuis: e.depuis } : { active: false, depuis: null }
}

/**
 * Tous les mouvements de la banque d'heures jusqu'au jour `au` (inclus), du
 * plus ancien au plus récent, avec le solde courant. Les heures d'une
 * période de paie comptent ensemble, en un mouvement daté de son dernier
 * jour (ou de `au`). Le manque d'une période n'est tiré qu'une fois la
 * période finie (son dernier jour avant `aujourdhui` ; par défaut, toute
 * période finie au plus tard `au`) ; un surplus déjà atteint se montre
 * pendant la période (il ne peut que grandir).
 */
export function mouvementsBanqueHeures(p: {
  heures: HeureBanque[]
  ajustements: AjustementBanque[]
  au: string
  /** Jour où l'on regarde : une période dont le dernier jour n'est pas passé est en cours (rien de tiré). */
  aujourdhui?: string
  /** Interrupteur « Heures en banque » (vide = désactivée partout). */
  etatsHeures?: EtatBanqueHeures[]
}): Mouvement[] {
  const liste: Omit<Mouvement, 'solde'>[] = []
  const etats = p.etatsHeures ?? []
  const aujourdhui = p.aujourdhui ?? depuisJour(versJour(p.au) + 1)

  // Heures, période par période.
  const periodes = new Map<string, { regulieres: number; absences: number; banque: number }>()
  for (const h of p.heures) {
    if (h.jour > p.au) continue
    const d = debutPeriodePaie(h.jour)
    const s = periodes.get(d) ?? { regulieres: 0, absences: 0, banque: 0 }
    if (h.type === 'regulieres') s.regulieres += Number(h.heures)
    else if (h.type === 'vacances' || h.type === 'maladie') s.absences += Number(h.heures)
    else if (h.type === 'banque') s.banque += Number(h.heures)
    periodes.set(d, s)
  }
  for (const [d, s] of periodes) {
    const fin = finPeriodePaie(d)
    const jour = fin > p.au ? p.au : fin
    const periode = `${codePeriodePaie(d)} · ${intervalle(d, fin)}`
    const active = etatBanqueHeures(etats, d).active
    const { attendu } = attenduPeriode(d)
    const surplus = active ? arrondi(s.regulieres - attendu) : 0
    if (surplus > 0)
      liste.push({
        cle: `accumulees-${d}`,
        jour,
        heures: surplus,
        genre: 'accumulees',
        libelle: `Accumulées, ${periode}`,
        detail: `${nombre(s.regulieres)} h régulières, ${libelleSeuil(d)}`,
      })
    const payees = s.regulieres + s.absences + s.banque
    const manque = active && fin < aujourdhui && payees > 0 ? arrondi(attendu - payees) : 0
    if (manque > 0)
      liste.push({
        cle: `tirees-${d}`,
        jour,
        heures: -manque,
        genre: 'tirees',
        libelle: `Tirées de la banque, ${periode}`,
        detail: `${nombre(payees)} h payées sur ${libelleAttendu(d)}`,
      })
    if (s.banque > 0)
      liste.push({
        cle: `prises-heures-${d}`,
        jour,
        heures: -arrondi(s.banque),
        genre: 'prises',
        libelle: `Prises en banque, ${periode}`,
        detail: null,
      })
  }

  for (const a of p.ajustements) {
    if (a.jour > p.au || a.banque !== 'heures') continue
    liste.push({
      cle: `ajustement-${a.id}`,
      jour: a.jour,
      heures: Number(a.heures),
      genre: 'ajustement',
      libelle: a.note,
      detail: `Ajustement par ${a.auteur_nom}`,
    })
  }

  liste.sort((a, b) => a.jour.localeCompare(b.jour) || ORDRE[a.genre] - ORDRE[b.genre] || a.cle.localeCompare(b.cle))
  let solde = 0
  return liste.map((m) => {
    solde = arrondi(solde + m.heures)
    return { ...m, solde }
  })
}

/** Ce qui se passe dans la banque pendant une période : solde avant, mouvements, solde après. */
export function resumePeriode(mouvements: Mouvement[], debut: string, fin: string) {
  const avant = arrondi(mouvements.filter((m) => m.jour < debut).reduce((s, m) => s + m.heures, 0))
  const dans = mouvements.filter((m) => m.jour >= debut && m.jour <= fin)
  const ajouts = arrondi(dans.filter((m) => m.heures > 0).reduce((s, m) => s + m.heures, 0))
  const retraits = arrondi(dans.filter((m) => m.heures < 0).reduce((s, m) => s + m.heures, 0))
  return { avant, mouvements: dans, ajouts, retraits, apres: arrondi(avant + ajouts + retraits) }
}

/**
 * Banque d'heures d'un employé pour une période (décision de Maxime du
 * 2026-10-18) : seulement si la mise en banque est activée pour la période,
 * s'il a un solde (au début ou à la fin de la période, négatif compris) ou
 * si des heures en ont été tirées dans la période. Sinon on ne l'affiche pas.
 */
export function banqueAffichee(mouvements: Mouvement[], active: boolean, debut: string, fin: string): boolean {
  if (active) return true
  const r = resumePeriode(mouvements, debut, fin)
  return r.avant !== 0 || r.apres !== 0 || r.mouvements.some((m) => m.genre === 'prises' || m.genre === 'tirees')
}

/**
 * Avertissement aux admins (demande de Maxime du 2026-10-20) : la banque est
 * descendue sous 20 h — mise en banque activée, solde sous SEUIL_ALERTE et au
 * moins un retrait dans son historique (une banque jamais utilisée, ex. un
 * admin à 0 h, ne compte pas) — ou elle est négative.
 */
export function alerteBanque(mouvements: Mouvement[], active: boolean): boolean {
  const solde = mouvements.at(-1)?.solde ?? 0
  if (solde < 0) return true
  return active && solde < SEUIL_ALERTE && mouvements.some((m) => m.genre === 'tirees' || m.genre === 'prises')
}
