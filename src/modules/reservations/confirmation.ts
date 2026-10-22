// Confirmation des informations du séjour par le client, sur sa page
// (pré-arrivée) : « Je confirme » ou « Je propose un changement ». Un
// changement est une demande que l'équipe accepte ou refuse ; l'estimé n'est
// jamais modifié sans elle. Fichier pur : la page client et la fiche s'en
// servent (et les tests du Worker, sous Node).
//
// Règles de Maxime (2026-10-14) :
//   - officiellement, ±10 % du nombre de participants jusqu'à 21 jours avant
//     l'arrivée (F9, F10 : le minimum de 90 % compte à J−21) ;
//   - écoles de l'automne (séjours d'août et septembre) : changements
//     acceptés jusqu'à 3 jours avant, on facture le réel après le séjour ;
//   - on note quand même tout, jusqu'à la dernière minute (cuisine,
//     animation) ; l'équipe peut refuser un changement trop gros.
// « Dans les règles » n'accepte rien tout seul : c'est une indication pour
// l'équipe (et pour le client, sur sa page).

import type { Forfait, Ratio } from './types'

export type Langue = 'fr' | 'en'

/** Ce que le client confirme ou change (mêmes clés en base : reservations.infos_sejour). */
export interface InfosSejour {
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  nb_participants: number | null
  nb_accompagnateurs: number | null
  ages: string | null
  langue: string | null
  ratio: Ratio | null
  service_repas: boolean
  nb_dejeuners: number
  nb_diners: number
  nb_soupers: number
}

export type ChampSejour = keyof InfosSejour

/** Seuils (décision de Maxime ; 3 jours pour l'automne : choix de Claude, « 2-3 jours »). */
export const REGLES = {
  ecart: 0.1,
  joursAvant: 21,
  joursAvantAutomne: 3,
  moisAutomne: [8, 9],
} as const

export const estScolaire = (f: Forfait) => f === 'classe_nature' || f === 'journee_plein_air'
export const estUnJour = (f: Forfait) => f === 'journee_plein_air' || f === 'location_salle'

/** Champs montrés au client selon le forfait, dans l'ordre de la pré-arrivée. */
export function champsDe(forfait: Forfait): ChampSejour[] {
  const c: ChampSejour[] = ['date_arrivee']
  if (!estUnJour(forfait)) c.push('date_depart')
  c.push('heure_arrivee', 'heure_depart', 'nb_participants')
  if (estScolaire(forfait)) c.push('nb_accompagnateurs', 'ages', 'ratio')
  c.push('langue')
  if (forfait !== 'classe_nature') c.push('service_repas')
  // Journée plein air : le dîner suit le service de repas.
  if (forfait !== 'journee_plein_air') c.push('nb_dejeuners', 'nb_diners', 'nb_soupers')
  return c
}

/** Ce qui change le prix ou la facturation (délai de 21 jours). */
const FACTURES: ChampSejour[] = [
  'date_arrivee',
  'date_depart',
  'heure_arrivee',
  'heure_depart',
  'nb_participants',
  'nb_accompagnateurs',
  'ratio',
  'service_repas',
  'nb_dejeuners',
  'nb_diners',
  'nb_soupers',
]

const heureCourte = (h: string | null | undefined) => (h ? h.slice(0, 5) : null)
const nombre = (n: unknown) => (n === null || n === undefined || n === '' ? null : Number(n))

/** Infos du séjour d'une réservation (même forme que reservations.infos_sejour). */
export function infosDe(r: {
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  nb_participants: number | null
  nb_accompagnateurs: number | null
  ages: string | null
  langue: string | null
  ratio: Ratio | null
  service_repas: boolean
  nb_dejeuners: number
  nb_diners: number
  nb_soupers: number
}): InfosSejour {
  return {
    date_arrivee: r.date_arrivee,
    date_depart: r.date_depart,
    heure_arrivee: heureCourte(r.heure_arrivee),
    heure_depart: heureCourte(r.heure_depart),
    nb_participants: nombre(r.nb_participants),
    nb_accompagnateurs: nombre(r.nb_accompagnateurs),
    ages: r.ages || null,
    langue: r.langue || null,
    ratio: r.ratio ?? null,
    service_repas: !!r.service_repas,
    nb_dejeuners: Number(r.nb_dejeuners ?? 0),
    nb_diners: Number(r.nb_diners ?? 0),
    nb_soupers: Number(r.nb_soupers ?? 0),
  }
}

const pareil = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '')

export interface Difference {
  champ: ChampSejour
  avant: InfosSejour[ChampSejour]
  apres: InfosSejour[ChampSejour]
}

/** Ce qui change entre deux états, parmi les champs du forfait. */
export function differences(actuel: InfosSejour, propose: InfosSejour, forfait: Forfait): Difference[] {
  return champsDe(forfait)
    .filter((c) => !pareil(actuel[c], propose[c]))
    .map((champ) => ({ champ, avant: actuel[champ], apres: propose[champ] }))
}

// ------------------------------------------------------------------
// Dans les règles ou hors règle
// ------------------------------------------------------------------

export type Raison =
  | { code: 'nombre'; avant: number; apres: number; ecart: number }
  | { code: 'delai'; jours: number; limite: number; automne: boolean }
  | { code: 'dates' }
  | { code: 'ratio' }

export interface Verdict {
  dansRegles: boolean
  raisons: Raison[]
  /** École d'automne (août-septembre) : délai réduit, réel facturé après le séjour. */
  automne: boolean
}

const jourNo = (j: string) => Math.round(Date.parse(`${j.slice(0, 10)}T00:00:00Z`) / 86_400_000)

/** Jours entre `jour` (la demande) et l'arrivée. */
export const joursAvantArrivee = (arrivee: string, jour: string) => jourNo(arrivee) - jourNo(jour)

export const estEcoleAutomne = (forfait: Forfait, arrivee: string) =>
  estScolaire(forfait) && (REGLES.moisAutomne as readonly number[]).includes(Number(arrivee.slice(5, 7)))

/**
 * Verdict d'un changement demandé le `jour` (AAAA-MM-JJ) : dans les règles
 * si le nombre de participants bouge d'au plus 10 % et que la demande arrive
 * au moins 21 jours avant l'arrivée (3 jours pour une école d'automne) ;
 * changer les dates ou le ratio est toujours à évaluer (disponibilités,
 * animateurs). Les âges et la langue ne comptent pas.
 */
export function evaluer(forfait: Forfait, actuel: InfosSejour, propose: InfosSejour, jour: string): Verdict {
  const diffs = differences(actuel, propose, forfait)
  const changes = new Set(diffs.map((d) => d.champ))
  const automne = estEcoleAutomne(forfait, actuel.date_arrivee)
  const raisons: Raison[] = []
  if (changes.has('date_arrivee') || changes.has('date_depart')) raisons.push({ code: 'dates' })
  if (changes.has('ratio')) raisons.push({ code: 'ratio' })
  const avant = actuel.nb_participants
  const apres = propose.nb_participants
  if (changes.has('nb_participants') && avant && apres !== null) {
    const ecart = (apres - avant) / avant
    if (Math.abs(ecart) > REGLES.ecart + 1e-9) raisons.push({ code: 'nombre', avant, apres, ecart })
  }
  if (diffs.some((d) => FACTURES.includes(d.champ))) {
    const limite = automne ? REGLES.joursAvantAutomne : REGLES.joursAvant
    const jours = joursAvantArrivee(actuel.date_arrivee, jour)
    if (jours < limite) raisons.push({ code: 'delai', jours, limite, automne })
  }
  return { dansRegles: raisons.length === 0, raisons, automne }
}

/**
 * Verdict d'un seul changement (décision ligne par ligne, réunion du
 * 2026-10-21) : les mêmes règles que `evaluer`, comme si le client n'avait
 * changé que ce champ (séjour d'un jour : le départ suit la date).
 */
export function evaluerChamp(forfait: Forfait, actuel: InfosSejour, propose: InfosSejour, jour: string, champ: ChampSejour): Verdict {
  const seul: InfosSejour = { ...actuel, [champ]: propose[champ] }
  if (champ === 'date_arrivee' && estUnJour(forfait)) seul.date_depart = propose.date_depart
  return evaluer(forfait, actuel, seul, jour)
}

/** Décision de l'équipe sur chaque champ changé : true = accepté, false = refusé (reservations.confirmations.decisions). */
export type Decisions = Partial<Record<ChampSejour, boolean>>

/** Changements acceptés et refusés d'une décision (champs sans décision : ni l'un ni l'autre). */
export function partager(diffs: Difference[], decisions: Decisions) {
  return {
    acceptes: diffs.filter((d) => decisions[d.champ] === true),
    refuses: diffs.filter((d) => decisions[d.champ] === false),
  }
}

/**
 * Réponse affichée au client sur sa page (`confirmations.reponse`) :
 * accepté en partie, ce qui l'est et ce qui ne l'est pas (la page montre le
 * séjour réduit aux champs acceptés), puis le message de l'équipe ; sinon
 * le message seul (la page dit déjà « accepté » ou « pas accepté »).
 */
export function reponseDecision(diffs: Difference[], decisions: Decisions, forfait: Forfait, message: string, langue: Langue = 'fr') {
  const { acceptes, refuses } = partager(diffs, decisions)
  const t = langue === 'en' ? { oui: 'Accepted', non: 'Not accepted' } : { oui: 'Accepté', non: 'Pas accepté' }
  const deuxPoints = langue === 'en' ? ':' : ' :'
  const detail =
    acceptes.length && refuses.length
      ? `${t.oui}${deuxPoints} ${resumeChangement(acceptes, forfait, langue)}.\n${t.non}${deuxPoints} ${resumeChangement(refuses, forfait, langue)}.`
      : ''
  return [detail, message.trim()].filter(Boolean).join('\n\n')
}

// ------------------------------------------------------------------
// Textes (français pour l'équipe, langue du client sur sa page)
// ------------------------------------------------------------------

const LIBELLES: Record<Langue, Record<ChampSejour, string>> = {
  fr: {
    date_arrivee: 'Arrivée',
    date_depart: 'Départ',
    heure_arrivee: "Heure d'arrivée",
    heure_depart: 'Heure de départ',
    nb_participants: 'Participants',
    nb_accompagnateurs: 'Accompagnateurs',
    ages: 'Âges et niveaux',
    langue: 'Langue du groupe',
    ratio: "Ratio d'animation",
    service_repas: 'Service de repas',
    nb_dejeuners: 'Déjeuners',
    nb_diners: 'Dîners',
    nb_soupers: 'Soupers',
  },
  en: {
    date_arrivee: 'Arrival',
    date_depart: 'Departure',
    heure_arrivee: 'Arrival time',
    heure_depart: 'Departure time',
    nb_participants: 'Participants',
    nb_accompagnateurs: 'Chaperones',
    ages: 'Ages and grades',
    langue: 'Group language',
    ratio: 'Activity ratio',
    service_repas: 'Meal service',
    nb_dejeuners: 'Breakfasts',
    nb_diners: 'Lunches',
    nb_soupers: 'Dinners',
  },
}

/** Libellé d'un champ (élèves en Classe nature et Journée plein air ; « Date » d'un séjour d'un jour). */
export function libelle(champ: ChampSejour, forfait: Forfait, langue: Langue = 'fr') {
  if (champ === 'nb_participants' && estScolaire(forfait)) return langue === 'en' ? 'Students' : 'Élèves'
  if (champ === 'nb_participants') return langue === 'en' ? 'People' : 'Personnes'
  if (champ === 'date_arrivee' && estUnJour(forfait)) return 'Date'
  if (champ === 'heure_arrivee' && estUnJour(forfait)) return langue === 'en' ? 'From' : 'De'
  if (champ === 'heure_depart' && estUnJour(forfait)) return langue === 'en' ? 'To' : 'À'
  if (champ === 'service_repas' && forfait === 'journee_plein_air') return langue === 'en' ? 'Cafeteria lunch' : 'Dîner à la cafétéria'
  return LIBELLES[langue][champ]
}

const MOIS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

/** « 12 mai 2027 », « 1er mai 2027 » / « May 12, 2027 ». */
export function dateTexte(jour: string, langue: Langue = 'fr') {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number)
  return langue === 'en' ? `${MOIS.en[m - 1]} ${j}, ${a}` : `${j === 1 ? '1er' : j} ${MOIS.fr[m - 1]} ${a}`
}

/** « 10h », « 17h30 » / « 10am ». */
function heureTexte(hhmm: string, langue: Langue) {
  const [h, m] = hhmm.split(':').map(Number)
  if (langue === 'fr') return `${h}h${m ? String(m).padStart(2, '0') : ''}`
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** Valeur lisible d'un champ. */
export function valeur(champ: ChampSejour, v: InfosSejour[ChampSejour], langue: Langue = 'fr'): string {
  if (v === null || v === undefined || v === '') return '—'
  if (champ === 'date_arrivee' || champ === 'date_depart') return dateTexte(String(v), langue)
  if (champ === 'heure_arrivee' || champ === 'heure_depart') return heureTexte(String(v), langue)
  if (champ === 'service_repas') return v ? (langue === 'en' ? 'Yes' : 'Oui') : langue === 'en' ? 'No' : 'Non'
  if (champ === 'ratio') return v === 'aucun' ? (langue === 'en' ? 'No activities' : 'Sans animation') : String(v)
  if (champ === 'langue' && langue === 'en') return LANGUES_EN[String(v)] ?? String(v)
  return String(v)
}

/** Langues du groupe telles que gardées en base (en français, comme le formulaire de demande les écrit). */
export const LANGUES_GROUPE = ['Français', 'Anglais', 'Français et anglais', 'Autre']

const LANGUES_EN: Record<string, string> = {
  Français: 'French',
  Anglais: 'English',
  'Français et anglais': 'English and French',
  Autre: 'Other',
}

const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`

/** Une raison « hors règle », en mots. */
export function texteRaison(r: Raison, langue: Langue = 'fr'): string {
  if (langue === 'en') {
    switch (r.code) {
      case 'nombre':
        return `Number of participants from ${r.avant} to ${r.apres} (${pct(r.ecart)}): more than the 10% allowed by the contract.`
      case 'delai':
        return r.automne
          ? `Less than ${r.limite} days before arrival.`
          : `Less than ${r.limite} days before arrival: the contract allows changes up to ${r.limite} days before.`
      case 'dates':
        return 'New dates: depending on availability.'
      case 'ratio':
        return 'New activity ratio: no guarantee of acceptance.'
    }
  }
  switch (r.code) {
    case 'nombre':
      return `Participants de ${r.avant} à ${r.apres} (${pct(r.ecart)}) : plus que les 10 % prévus au contrat.`
    case 'delai':
      return r.automne
        ? `Moins de ${r.limite} jours avant l'arrivée (école d'automne).`
        : `Moins de ${r.limite} jours avant l'arrivée : le contrat prévoit les changements jusqu'à ${r.limite} jours avant.`
    case 'dates':
      return 'Nouvelles dates : selon les disponibilités.'
    case 'ratio':
      return "Nouveau ratio d'animation : sans garantie d'acceptation."
  }
}

/** « Élèves : 54 → 60 ; Départ : 14 mai 2027 → 15 mai 2027 » (journal, CRM, fiche). */
export function resumeChangement(diffs: Difference[], forfait: Forfait, langue: Langue = 'fr') {
  return diffs.map((d) => `${libelle(d.champ, forfait, langue)} : ${valeur(d.champ, d.avant, langue)} → ${valeur(d.champ, d.apres, langue)}`).join(' ; ')
}

/** La fenêtre de confirmation est-elle ouverte ? (même règle que reservations.confirmation_ouverte) */
export function confirmationOuverte(
  r: { fermeture: string | null; signe_le: string | null; etape: string; date_depart: string; origine?: string },
  auj: string,
) {
  return !r.fermeture && r.origine !== 'airbnb' && (!!r.signe_le || r.etape === 'confirmee' || r.etape === 'pre_arrivee') && r.date_depart >= auj
}

/** À confirmer « maintenant » : à partir de 30 jours avant l'arrivée (pré-arrivée). */
export const aConfirmer = (arrivee: string, auj: string) => joursAvantArrivee(arrivee, auj) <= 30
