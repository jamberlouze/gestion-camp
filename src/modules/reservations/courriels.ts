// Courriels aux clients (plan §9) : quoi préparer et quand, à qui, avec
// quels champs, et le rendu des modèles. Fichier pur : l'app (onglet
// Courriels, fiche) et le Worker (préparation aux 15 minutes, envoi) s'en
// servent. Les modèles eux-mêmes sont en base (modeles_courriels).

import { echeancier, partsAcomptes } from './facturation.ts'
import type { Forfait } from './types'

export type GenreCourriel =
  | 'accuse'
  | 'estime'
  | 'contrat'
  | 'rappel_signature'
  | 'facture'
  | 'facture_finale'
  | 'rappel_paiement'
  | 'pre_arrivee'
  | 'rappel_fiches'
  | 'suivi'
export type ModeCourriel = 'approuver' | 'automatique' | 'desactive'
export type LangueCourriel = 'fr' | 'en'

export const TYPES_COURRIEL: { genre: GenreCourriel; nom: string; quand: string; piece: string | null; automatique: boolean }[] = [
  { genre: 'accuse', nom: 'Accusé de réception', quand: 'Demande reçue par le formulaire', piece: null, automatique: true },
  { genre: 'estime', nom: 'Estimé', quand: 'Estimé marqué envoyé', piece: "PDF de l'estimé", automatique: true },
  { genre: 'contrat', nom: 'Contrat à signer', quand: 'Contrat préparé (lien de signature)', piece: null, automatique: true },
  { genre: 'rappel_signature', nom: 'Rappel de signature', quand: "Contrat non signé 5 jours après l'envoi", piece: null, automatique: true },
  { genre: 'facture', nom: 'Facture (acompte, facture séparée)', quand: 'Nouvelle facture dans QBO', piece: 'PDF de la facture (QBO)', automatique: true },
  { genre: 'facture_finale', nom: 'Facture finale', quand: 'Dernière facture du devis dans QBO', piece: 'PDF de la facture (QBO)', automatique: true },
  {
    genre: 'rappel_paiement',
    nom: 'Rappel de paiement',
    quand: "3 jours avant l'échéance, puis à l'échéance ; payable sur réception : 7 jours après la facture",
    piece: 'PDF de la facture (QBO)',
    automatique: true,
  },
  {
    genre: 'pre_arrivee',
    nom: 'Pré-arrivée et fiches participants',
    quand: "30 jours avant l'arrivée (Classe nature, Journée plein air)",
    piece: 'PDF de pré-arrivée (produit au moment de l’envoi)',
    automatique: false,
  },
  { genre: 'rappel_fiches', nom: 'Rappel des fiches participants', quand: "25 jours avant l'arrivée, s'il manque des fiches", piece: null, automatique: true },
  { genre: 'suivi', nom: 'Suivi après le séjour', quand: '2 jours après le départ', piece: null, automatique: true },
]

export const NOMS_COURRIEL = Object.fromEntries(TYPES_COURRIEL.map((t) => [t.genre, t.nom])) as Record<GenreCourriel, string>

/** Champs offerts dans les modèles (aide de l'onglet Courriels). */
export const CHAMPS_COURRIEL: [string, string][] = [
  ['responsable', 'Nom du responsable de la réservation'],
  ['groupe', 'Nom du groupe'],
  ['numero', 'Numéro de réservation'],
  ['forfait', 'Forfait'],
  ['dates', '« du 21 au 23 octobre 2026 », « le 21 octobre 2026 »'],
  ['date_limite', "Trois semaines avant l'arrivée (changement de nombre)"],
  ['total', "Total de l'estimé, taxes comprises"],
  ['lien_client', 'Page client (estimé, contrat, documents, factures)'],
  ['lien_signature', 'Lien de signature du contrat'],
  ['echeance_signature', 'Date limite de signature'],
  ['lien_fiches', 'Lien des fiches participants (à transmettre aux parents)'],
  ['fiches_recues', 'Fiches reçues'],
  ['fiches_attendues', 'Fiches attendues (élèves + adultes)'],
  ['facture_numero', 'Numéro de la facture (QBO)'],
  ['facture_montant', 'Montant de la facture'],
  ['facture_solde', 'Solde de la facture'],
  ['facture_echeance', 'Échéance (vide si payable sur réception)'],
  ['facture_sur_reception', '« oui » si payable sur réception, sinon vide'],
  ['compagnie', 'Raison sociale de la compagnie qui facture'],
  ['compagnie_court', 'Nom court (GBPA+, Opikawa)'],
  ['compagnie_courriel', 'Courriel de la compagnie'],
  ['compagnie_telephone', 'Téléphone de la compagnie'],
  ['reponse_interac', 'Réponse à la question de sécurité Interac'],
]

// ------------------------------------------------------------------
// État d'une réservation (reservations.courriels_etat)
// ------------------------------------------------------------------

export interface ContactCourriel {
  id?: string
  nom: string
  courriel: string | null
}

export interface EtatCourriels {
  r: {
    id: string
    numero: string
    nom: string
    forfait: Forfait
    langue: string | null
    date_arrivee: string
    date_depart: string
    signe_le: string | null
    fermeture: string | null
    nb_participants: number | null
    nb_accompagnateurs: number | null
    acompte1_part: number | string | null
    acompte2_part: number | string | null
    compagnie_id: string
    organisation_id: string | null
    jeton_client: string
    jeton_fiches: string
    courriel_direction: string | null
  }
  contact_reservation: ContactCourriel | null
  contact_facturation: ContactCourriel | null
  demande: { id: string; recue_le: string; langue: string | null; courriel: string | null; nom: string | null } | null
  estimes: { id: string; version: number; statut: string; envoye_le: string | null; total: number | string }[]
  signatures: { id: string; statut: string; envoye_le: string; echeance: string; jeton: string }[]
  factures: {
    id: string
    qbo_type: string
    qbo_id: string
    genre: string
    numero: string | null
    date_facture: string | null
    echeance: string | null
    total: number | string
    solde: number | string
  }[]
  devis_total: number | string | null
  fiches_recues: number
  courriels: { id: string; cle: string; genre: GenreCourriel; statut: string; ref: string | null }[]
}

export interface APreparer {
  genre: GenreCourriel
  cle: string
  ref: string | null
}

const JOUR = 86_400_000
export const decaler = (jour: string, jours: number) => new Date(Date.parse(`${jour.slice(0, 10)}T12:00:00Z`) + jours * JOUR).toISOString().slice(0, 10)
/** Jour à Montréal d'un horodatage. */
export const jourMontreal = (quand: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(quand))
const scolaire = (f: Forfait) => f === 'classe_nature' || f === 'journee_plein_air'
const factureOuverte = (f: EtatCourriels['factures'][number]) => f.qbo_type === 'Invoice'

/** Factures progressives dans l'ordre, avec leur part cumulée du devis. */
function cumuls(e: EtatCourriels) {
  const total = Number(e.devis_total ?? 0)
  let somme = 0
  const parFacture = new Map<string, number>()
  for (const f of e.factures.filter((x) => x.genre === 'progressive')) {
    somme += Number(f.total)
    parFacture.set(f.id, total > 0 ? somme / total : 0)
  }
  return parFacture
}

/** La facture progressive qui atteint le total du devis est la facture finale. */
export function estFinale(e: EtatCourriels, factureId: string) {
  const c = cumuls(e).get(factureId)
  const total = Number(e.devis_total ?? 0)
  return c !== undefined && total > 0 && c * total >= total - 0.01
}

/**
 * Échéance d'une facture pour les rappels : celle de QBO si elle est après
 * la facture ; sinon, pour l'acompte 2 (hors réservation tardive), 21 jours
 * avant l'arrivée (F4) ; sinon null (payable sur réception).
 */
export function echeanceFacture(e: EtatCourriels, f: EtatCourriels['factures'][number]): string | null {
  if (f.echeance && f.date_facture && f.echeance > f.date_facture) return f.echeance
  if (f.genre !== 'progressive' || !e.r.signe_le) return null
  const etapes = echeancier({ ...e.r, total: 1, signe_le: e.r.signe_le })
  const acompte2 = etapes.find((x) => x.cle === 'acompte2')
  if (!acompte2) return null
  const { acompte1 } = partsAcomptes(e.r)
  const c = cumuls(e).get(f.id) ?? 0
  return c > acompte1 + 0.01 && c <= acompte2.cumul + 0.01 ? acompte2.echeance : null
}

/** Jours des rappels de paiement : 3 jours avant l'échéance et à l'échéance ; sur réception, 7 jours après la facture. */
export function joursRappelsPaiement(e: EtatCourriels, f: EtatCourriels['factures'][number]): string[] {
  if (!f.date_facture) return []
  const echeance = echeanceFacture(e, f)
  if (!echeance) return [decaler(f.date_facture, 7)]
  const avant = decaler(echeance, -3)
  return avant > f.date_facture ? [avant, echeance] : [echeance]
}

const fichesAttendues = (e: EtatCourriels) => (e.r.nb_participants ?? 0) + (e.r.nb_accompagnateurs ?? 0)
/** Une fenêtre : à partir du jour prévu (pas avant la mise en service), quelques jours au plus. */
const dansFenetre = (jour: string, auj: string, depuis: string, jours: number) => jour >= depuis && auj >= jour && auj <= decaler(jour, jours)

/**
 * Courriels à préparer pour une réservation (ceux dont la clé existe déjà,
 * préparés, envoyés ou annulés, ne reviennent jamais). `depuis` = jour de la
 * mise en service : rien pour un événement plus ancien.
 */
export function aPreparer(e: EtatCourriels, auj: string, depuis: string): APreparer[] {
  const deja = new Set(e.courriels.map((c) => c.cle))
  const sortie: APreparer[] = []
  const ajouter = (genre: GenreCourriel, cle: string, ref: string | null = null) => {
    if (!deja.has(cle)) sortie.push({ genre, cle, ref })
  }
  const ouverte = !e.r.fermeture
  const r = e.r

  if (ouverte && e.demande && jourMontreal(e.demande.recue_le) >= depuis) ajouter('accuse', `accuse:${e.demande.id}`)

  if (ouverte) {
    for (const x of e.estimes) {
      if (x.statut === 'envoye' && x.envoye_le && jourMontreal(x.envoye_le) >= depuis) ajouter('estime', `estime:${x.id}`, x.id)
    }
    for (const s of e.signatures.filter((x) => x.statut === 'en_attente')) {
      const envoye = jourMontreal(s.envoye_le)
      if (envoye >= depuis) ajouter('contrat', `contrat:${s.id}`, s.id)
      if (dansFenetre(decaler(envoye, 5), auj, depuis, 7)) ajouter('rappel_signature', `rappel_signature:${s.id}`, s.id)
    }
  }

  // Factures : même une réservation annulée (frais d'annulation à payer).
  for (const f of e.factures.filter(factureOuverte)) {
    if (f.date_facture && f.date_facture >= depuis) ajouter(estFinale(e, f.id) ? 'facture_finale' : 'facture', `facture:${f.id}`, f.id)
    if (Number(f.solde) > 0.005) {
      joursRappelsPaiement(e, f).forEach((jour, i) => {
        if (dansFenetre(jour, auj, depuis, 10)) ajouter('rappel_paiement', `rappel_paiement:${f.id}:${i + 1}`, f.id)
      })
    }
  }

  if (ouverte && r.signe_le) {
    if (scolaire(r.forfait)) {
      const pre = [decaler(r.date_arrivee, -30), r.signe_le].sort().at(-1)!
      if (pre >= depuis && auj >= pre && auj < r.date_arrivee) ajouter('pre_arrivee', `pre_arrivee:${r.id}`)
      const preEnvoyee = e.courriels.some((c) => c.genre === 'pre_arrivee' && c.statut === 'envoye')
      const rappel = decaler(r.date_arrivee, -25)
      if (preEnvoyee && rappel >= depuis && auj >= rappel && auj < decaler(r.date_arrivee, -2) && e.fiches_recues < fichesAttendues(e))
        ajouter('rappel_fiches', `rappel_fiches:${r.id}`)
    }
    if (dansFenetre(decaler(r.date_depart, 2), auj, depuis, 14)) ajouter('suivi', `suivi:${r.id}`)
  }
  return sortie
}

/** Un courriel préparé est-il encore utile ? (Sinon la base l'annule : « plus nécessaire ».) */
export function encoreUtile(c: { genre: GenreCourriel; ref: string | null }, e: EtatCourriels): boolean {
  const facture = e.factures.find((f) => f.id === c.ref)
  switch (c.genre) {
    case 'facture':
    case 'facture_finale':
      return !!facture
    case 'rappel_paiement':
      return !!facture && Number(facture.solde) > 0.005
    case 'estime':
      return !e.r.fermeture && e.estimes.some((x) => x.id === c.ref && x.statut === 'envoye')
    case 'contrat':
    case 'rappel_signature':
      return !e.r.fermeture && e.signatures.some((s) => s.id === c.ref && s.statut === 'en_attente')
    case 'rappel_fiches':
      return !e.r.fermeture && e.fiches_recues < fichesAttendues(e)
    default:
      return !e.r.fermeture
  }
}

// ------------------------------------------------------------------
// Langue, destinataires, champs
// ------------------------------------------------------------------

export const langueCourriel = (e: EtatCourriels, genre: GenreCourriel): LangueCourriel =>
  genre === 'accuse' && e.demande?.langue === 'en'
    ? 'en'
    : genre === 'accuse' && e.demande?.langue === 'fr'
      ? 'fr'
      : /^(anglais|english)$/i.test(e.r.langue?.trim() ?? '')
        ? 'en'
        : 'fr'

const courrielValide = (c: string | null | undefined) => !!c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim())
const unique = (liste: (string | null | undefined)[]) => {
  const vus = new Set<string>()
  return liste
    .filter(courrielValide)
    .map((c) => c!.trim())
    .filter((c) => (vus.has(c.toLowerCase()) ? false : (vus.add(c.toLowerCase()), true)))
}

/**
 * Destinataires : le responsable de la réservation ; pour les factures, le
 * responsable de la facturation (copie au responsable) ; pour le contrat,
 * copie au courriel de la direction ; l'accusé va à qui a rempli la demande.
 */
export function destinataires(e: EtatCourriels, genre: GenreCourriel): { a: string[]; cc: string[]; nom: string } {
  const resa = e.contact_reservation
  const fact = e.contact_facturation
  if (genre === 'accuse') {
    const a = unique([e.demande?.courriel, resa?.courriel])
    return { a: a.slice(0, 1), cc: [], nom: e.demande?.nom || resa?.nom || '' }
  }
  if (genre === 'facture' || genre === 'facture_finale' || genre === 'rappel_paiement') {
    const a = unique([fact?.courriel ?? resa?.courriel])
    return { a, cc: unique([resa?.courriel]).filter((c) => !a.some((x) => x.toLowerCase() === c.toLowerCase())), nom: (fact?.courriel ? fact.nom : resa?.nom) ?? '' }
  }
  const a = unique([resa?.courriel ?? fact?.courriel])
  const cc = genre === 'contrat' || genre === 'rappel_signature' ? unique([e.r.courriel_direction]).filter((c) => !a.some((x) => x.toLowerCase() === c.toLowerCase())) : []
  return { a, cc, nom: resa?.nom ?? fact?.nom ?? '' }
}

const FORFAITS_EN: Record<Forfait, [string, string]> = {
  classe_nature: ['Classe nature', 'Nature class'],
  journee_plein_air: ['Journée plein air', 'Outdoor day'],
  accueil_groupe: ['Accueil de groupe', 'Group stay'],
  location_salle: ['Location de salle', 'Hall rental'],
}

/** Le premier du mois s'écrit « 1er » en français. */
const premier = (s: string, l: LangueCourriel) => (l === 'fr' ? s.replace(/(^|\s)1 (?=\S)/g, '$11er ') : s)
const dateLangue = (jour: string | null | undefined, l: LangueCourriel) =>
  jour
    ? premier(new Intl.DateTimeFormat(l === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${jour.slice(0, 10)}T12:00:00Z`)), l)
    : ''
const argentLangue = (n: number | string | null | undefined, l: LangueCourriel) =>
  n === null || n === undefined ? '' : new Intl.NumberFormat(l === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n))

/** « du 21 au 23 octobre 2026 », « du 30 avril au 2 mai 2027 », « le 21 octobre 2026 » ; en anglais : « from October 21 to 23, 2026 »… */
export function datesSejour(arrivee: string, depart: string, l: LangueCourriel) {
  if (arrivee === depart) return l === 'en' ? `on ${dateLangue(arrivee, l)}` : `le ${dateLangue(arrivee, l)}`
  const partie = (jour: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(l === 'en' ? 'en-CA' : 'fr-CA', { ...o, timeZone: 'UTC' }).format(new Date(`${jour}T12:00:00Z`))
  const memeAnnee = arrivee.slice(0, 4) === depart.slice(0, 4)
  const memeMois = memeAnnee && arrivee.slice(5, 7) === depart.slice(5, 7)
  const debut = memeMois ? partie(arrivee, { day: 'numeric' }) : memeAnnee ? partie(arrivee, { day: 'numeric', month: 'long' }) : dateLangue(arrivee, l)
  if (l === 'en') {
    const fin = memeMois ? `${partie(depart, { day: 'numeric' })}, ${depart.slice(0, 4)}` : dateLangue(depart, l)
    return `from ${memeMois ? partie(arrivee, { month: 'long', day: 'numeric' }) : debut} to ${fin}`
  }
  return `du ${premier(debut, l).replace(/^1$/, '1er')} au ${dateLangue(depart, l)}`
}

export interface CompagnieCourriel {
  raison_sociale: string
  nom_court: string
  courriel: string
  telephone: string
  reponse_interac: string
}

/** Adresse d'une page publique (sous-domaine en PROD). */
export const lienPublic = (racine: string, chemin: string, l: LangueCourriel) => `${racine.replace(/\/$/, '')}${chemin}${l === 'en' ? '?lang=en' : ''}`

/** Champs {{…}} d'un courriel, dans la langue du courriel. */
export function champsCourriel(e: EtatCourriels, p: { genre: GenreCourriel; ref: string | null; langue: LangueCourriel; compagnie: CompagnieCourriel; racine: string }): Record<string, string> {
  const l = p.langue
  const r = e.r
  const signature = e.signatures.find((s) => s.id === p.ref) ?? e.signatures.filter((s) => s.statut === 'en_attente').at(-1)
  const facture = e.factures.find((f) => f.id === p.ref)
  const estime = e.estimes.find((x) => x.id === p.ref) ?? [...e.estimes].reverse().find((x) => x.statut === 'accepte' || x.statut === 'envoye')
  const echeance = facture ? echeanceFacture(e, facture) : null
  return {
    responsable: destinataires(e, p.genre).nom,
    groupe: r.nom,
    numero: r.numero,
    forfait: FORFAITS_EN[r.forfait][l === 'en' ? 1 : 0],
    dates: datesSejour(r.date_arrivee, r.date_depart, l),
    date_limite: dateLangue(decaler(r.date_arrivee, -21), l),
    total: estime ? argentLangue(estime.total, l) : '',
    lien_client: lienPublic(p.racine, `/client/${r.jeton_client}`, l),
    lien_signature: signature ? lienPublic(p.racine, `/signer/${signature.jeton}`, l) : '',
    echeance_signature: signature ? dateLangue(signature.echeance, l) : '',
    lien_fiches: lienPublic(p.racine, `/fiches/${r.jeton_fiches}`, l),
    fiches_recues: String(e.fiches_recues),
    fiches_attendues: String(fichesAttendues(e)),
    facture_numero: facture?.numero ?? '',
    facture_montant: facture ? argentLangue(facture.total, l) : '',
    facture_solde: facture ? argentLangue(facture.solde, l) : '',
    facture_echeance: echeance ? dateLangue(echeance, l) : '',
    facture_sur_reception: facture && !echeance ? (l === 'en' ? 'yes' : 'oui') : '',
    compagnie: p.compagnie.raison_sociale,
    compagnie_court: p.compagnie.nom_court,
    compagnie_courriel: p.compagnie.courriel,
    compagnie_telephone: p.compagnie.telephone,
    reponse_interac: p.compagnie.reponse_interac,
  }
}

// ------------------------------------------------------------------
// Rendu
// ------------------------------------------------------------------

/** {{#si champ}}…{{/si}} (écrit seulement si le champ n'est pas vide), puis {{champ}}. */
export function remplirCourriel(texte: string, champs: Record<string, string>): string {
  const conditions = texte.replace(/\{\{#si\s+([a-z_0-9]+)\s*\}\}([\s\S]*?)\{\{\/si\}\}/g, (_, cle: string, contenu: string) => (champs[cle]?.trim() ? contenu : ''))
  return conditions.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/g, (_, cle: string) => champs[cle] ?? '')
}

export interface ModeleCourriel {
  genre: GenreCourriel
  mode: ModeCourriel
  sujet_fr: string
  corps_fr: string
  sujet_en: string
  corps_en: string
  updated_by_nom?: string | null
}

export function rendreCourriel(m: ModeleCourriel, langue: LangueCourriel, champs: Record<string, string>) {
  const sujet = remplirCourriel(langue === 'en' ? m.sujet_en : m.sujet_fr, champs).replace(/\s+/g, ' ').trim()
  const corps = remplirCourriel(langue === 'en' ? m.corps_en : m.corps_fr, champs).replace(/\n{3,}/g, '\n\n').trim()
  return { sujet, corps }
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Texte du courriel → HTML simple : paragraphes, sauts de ligne, liens, **gras**. */
export function versHtml(texte: string): string {
  const paragraphes = texte
    .trim()
    .split(/\n\s*\n/)
    .map((p) =>
      echapper(p)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`)
        .replace(/\n/g, '<br>'),
    )
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join('\n')
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2a24">\n${paragraphes}\n</div>`
}
