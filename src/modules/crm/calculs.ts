import type { Echange, Organisation, Regle, Relance, Saison, Sejour, Statut, Visite } from './types'

// ------------------------------------------------------------
// Fonctions pures : statut, jours inactifs, saisons et relances
// automatiques, calculés d'après les vraies données (jamais stockés).
// Dates en texte AAAA-MM-JJ (jour de Montréal).
// ------------------------------------------------------------

/** Un séjour au camp : séjour de la base de réservations ou visite saisie/importée. */
export interface Passage {
  cle: string
  source: 'sejour' | 'visite'
  arrivee: string
  depart: string
  participants: number | null
  /** État de la réservation (séjours seulement). */
  etat: string | null
  numero: string | null
  type: string | null
  /** Confirmé (visite passée, ou séjour « Confirmée »). Sinon : demande en cours. */
  confirme: boolean
  saison: Saison
}

export interface Calcul {
  org: Organisation
  statut: Statut
  passages: Passage[]
  /** Dernier séjour confirmé terminé. */
  derniere: Passage | null
  /** Prochain séjour confirmé (en cours ou à venir). */
  prochaine: Passage | null
  /** Demandes de réservation en cours (estimé, contrat envoyé…). */
  demandes: Passage[]
  dernierEchange: string | null
  /** Dernier contact : dernier échange ou fin du dernier séjour. */
  dernierContact: string | null
  /** Jours depuis le dernier contact (null = jamais). */
  joursInactifs: number | null
  /** Saisons où il est déjà venu (ou viendra), dans l'ordre de l'année scolaire. */
  saisons: Saison[]
  /** Prochaine relance à faire. */
  relance: Relance | null
}

const ORDRE_SAISONS: Saison[] = ['automne', 'hiver', 'printemps', 'ete']
const POUR: Record<Saison, string> = { automne: "l'automne", hiver: "l'hiver", printemps: 'le printemps', ete: "l'été" }

export function saisonDe(jour: string): Saison {
  const mois = Number(jour.slice(5, 7))
  if (mois === 12 || mois <= 2) return 'hiver'
  if (mois <= 5) return 'printemps'
  if (mois <= 8) return 'ete'
  return 'automne'
}

const versDate = (jour: string) => new Date(`${jour}T12:00:00Z`)
const versJour = (d: Date) => d.toISOString().slice(0, 10)

export function ajouterJours(jour: string, n: number) {
  const d = versDate(jour)
  d.setUTCDate(d.getUTCDate() + n)
  return versJour(d)
}

/** Ajoute des mois (le 31 devient le dernier jour du mois au besoin). */
export function ajouterMois(jour: string, n: number) {
  const d = versDate(jour)
  const voulu = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(voulu, dernier))
  return versJour(d)
}

export const ecartJours = (de: string, a: string) => Math.round((versDate(a).getTime() - versDate(de).getTime()) / 86_400_000)

const max = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Séjours et visites d'une organisation, du plus ancien au plus récent. */
export function passagesDe(org: Organisation, sejours: Sejour[], visites: Visite[]): Passage[] {
  const liste: Passage[] = []
  for (const s of sejours) {
    if (!org.airtable_client_id || s.airtable_client_id !== org.airtable_client_id) continue
    liste.push({
      cle: `sejour:${s.id}`,
      source: 'sejour',
      arrivee: s.date_arrivee,
      depart: s.date_depart,
      participants: s.nb_participants,
      etat: s.etat,
      numero: s.numero,
      type: s.type_sejour,
      confirme: s.etat === 'Confirmée',
      saison: saisonDe(s.date_arrivee),
    })
  }
  for (const v of visites) {
    if (v.organisation_id !== org.id) continue
    liste.push({
      cle: `visite:${v.id}`,
      source: 'visite',
      arrivee: v.date_arrivee,
      depart: v.date_depart,
      participants: v.nb_participants,
      etat: null,
      numero: null,
      type: v.note,
      confirme: true,
      saison: saisonDe(v.date_arrivee),
    })
  }
  return liste.sort((a, b) => a.arrivee.localeCompare(b.arrivee))
}

/**
 * Statut d'après les vraies données :
 * - client : séjour confirmé à venir, ou terminé depuis moins d'un cycle + 6 mois ;
 * - prospect : demande de réservation en cours, ou en démarchage (contacté et après) ;
 * - client inactif : déjà venu, mais plus depuis un cycle + 6 mois ;
 * - cible : le reste (jamais venu, pas encore contacté).
 * Sans aucun séjour connu, le statut noté dans Copper à l'import sert de
 * départ : « client » vaut comme un séjour terminé le jour de l'import.
 */
export function statutDe(org: Organisation, derniere: Passage | null, prochaine: Passage | null, demandes: Passage[], auj: string): Statut {
  const limite = ajouterMois(auj, -(org.cycle_ans * 12 + 6))
  const depart = !derniere && !prochaine ? org.statut_depart : null
  if (prochaine) return 'client'
  if (derniere && derniere.depart >= limite) return 'client'
  if (depart === 'client' && org.statut_depart_le! >= limite) return 'client'
  if (demandes.length || (org.etape && org.etape !== 'identification')) return 'prospect'
  if (derniere || depart) return 'inactif'
  return 'cible'
}

export function calculer(
  org: Organisation,
  d: { sejours: Sejour[]; visites: Visite[]; echanges: Echange[]; relances: Relance[] },
  auj: string,
): Calcul {
  const passages = passagesDe(org, d.sejours, d.visites)
  const confirmes = passages.filter((p) => p.confirme)
  const derniere = confirmes.filter((p) => p.depart < auj).at(-1) ?? null
  const prochaine = confirmes.find((p) => p.depart >= auj) ?? null
  const demandes = passages.filter((p) => !p.confirme && p.depart >= auj)
  const dernierEchange = d.echanges.reduce<string | null>((m, e) => (e.organisation_id === org.id ? max(m, e.jour) : m), null)
  const dernierContact = max(dernierEchange, derniere?.depart ?? null)
  const saisons = ORDRE_SAISONS.filter((s) => confirmes.some((p) => p.saison === s))
  const relance =
    d.relances
      .filter((r) => r.organisation_id === org.id && r.statut === 'a_faire')
      .sort((a, b) => a.echeance.localeCompare(b.echeance))[0] ?? null
  return {
    org,
    statut: statutDe(org, derniere, prochaine, demandes, auj),
    passages,
    derniere,
    prochaine,
    demandes,
    dernierEchange,
    dernierContact,
    joursInactifs: dernierContact ? Math.max(0, ecartJours(dernierContact, auj)) : null,
    saisons,
    relance,
  }
}

/** Mois avant la prochaine visite : client + saison > client > type + saison > type > 6. */
export function moisAvant(org: Organisation, saison: Saison, regles: Regle[]): number {
  const trouver = (f: (r: Regle) => boolean) => regles.find(f)?.mois_avant
  return (
    trouver((r) => r.organisation_id === org.id && r.saison === saison) ??
    trouver((r) => r.organisation_id === org.id && !r.saison) ??
    trouver((r) => r.genre === org.genre && r.saison === saison) ??
    trouver((r) => r.genre === org.genre && !r.saison) ??
    6
  )
}

export interface RelanceAuto {
  source_cle: string
  organisation_id: string
  titre: string
  echeance: string
  assigne_a: string | null
  note: string
}

/**
 * Relances à créer après un séjour : pour chaque saison où le client est
 * venu, son dernier séjour confirmé terminé donne la prochaine visite
 * attendue (même date, un cycle plus tard) ; la relance tombe N mois avant
 * (règles), au plus tôt le lendemain du départ. Rien si la prochaine visite
 * attendue est déjà passée (client inactif) ou si un séjour plus récent
 * (confirmé ou demandé) existe déjà pour cette saison.
 */
export function relancesAuto(c: Calcul, regles: Regle[], auj: string): RelanceAuto[] {
  const resultat: RelanceAuto[] = []
  for (const saison of c.saisons) {
    const memeSaison = c.passages.filter((p) => p.saison === saison)
    const derniere = memeSaison.filter((p) => p.confirme && p.depart < auj).at(-1)
    if (!derniere) continue
    if (memeSaison.some((p) => p.arrivee > derniere.depart)) continue
    const attendue = ajouterMois(derniere.arrivee, 12 * c.org.cycle_ans)
    if (attendue <= auj) continue
    const echeance = max(ajouterMois(attendue, -moisAvant(c.org, saison, regles)), ajouterJours(derniere.depart, 1))!
    resultat.push({
      source_cle: derniere.cle,
      organisation_id: c.org.id,
      titre: `Relancer pour ${POUR[saison]} ${attendue.slice(0, 4)}`,
      echeance,
      assigne_a: c.org.conseiller_id,
      note: `Dernier séjour : ${dateCourte(derniere.arrivee)} au ${dateCourte(derniere.depart)}.`,
    })
  }
  return resultat
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 12 mars 2027 » (l'année est omise si c'est l'année en cours). */
export function dateCourte(jour: string, auj?: string) {
  const [a, m, j] = jour.split('-').map(Number)
  const annee = auj && auj.slice(0, 4) === jour.slice(0, 4) ? '' : ` ${a}`
  return `${j} ${MOIS[m - 1]}${annee}`
}

/** « il y a 12 jours », « aujourd'hui », « jamais ». */
export function depuis(jours: number | null) {
  if (jours == null) return 'jamais'
  if (jours === 0) return "aujourd'hui"
  if (jours === 1) return 'hier'
  if (jours < 60) return `il y a ${jours} jours`
  if (jours < 730) return `il y a ${Math.round(jours / 30.4)} mois`
  return `il y a ${Math.floor(jours / 365)} ans`
}

/** Tri « jours inactifs » (Copper) : jamais contacté d'abord, puis le plus long silence ; qui a un séjour prévu à la fin. */
export function triInactifs(a: Calcul, b: Calcul) {
  const rang = (c: Calcul) => (c.prochaine ? -1 : (c.joursInactifs ?? Number.MAX_SAFE_INTEGER))
  return rang(b) - rang(a) || a.org.nom.localeCompare(b.org.nom, 'fr')
}
