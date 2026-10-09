// Formulaire public de demande de réservation : remplace le Jotform
// « Demande de réservation de groupe » (242487021708254). Mêmes questions,
// même logique conditionnelle, en français et en anglais (traduction du
// Jotform) ; seules les coquilles sont corrigées, et les heures et le prix
// du repas viennent des réglages et du catalogue au lieu d'être écrits en dur.
//
// Fichier pur : la page publique s'en sert pour afficher et vérifier, le
// Worker pour vérifier de nouveau et préparer la réservation.

import { repasProposes, varianteProposee } from './calcul.ts'
import { heuresNormales, type Reglages } from './parametres.ts'
import type { Forfait, Ratio, Variante } from './types'

export type Langue = 'fr' | 'en'
export type OuiNon = 'oui' | 'non' | ''
export type TypeGroupe = 'ecole' | 'entreprise' | 'particulier' | 'club_sportif' | 'municipalite' | 'osbl' | 'autre'
export type LangueGroupe = 'fr' | 'en' | 'fr_en' | 'autre'

export interface Reponses {
  type_groupe: TypeGroupe | ''
  type_autre: string
  forfait: Forfait | ''
  /** Journée plein air et Location de salle : une seule date. */
  date: string
  arrivee: string
  depart: string
  /** Classe nature, Journée plein air, Accueil : les heures normales conviennent-elles ? */
  heures_ok: OuiNon
  /** Location de salle. */
  location: 'jour' | 'soir' | 'sur_mesure' | ''
  heure_arrivee: string
  heure_depart: string
  nb_personnes: string
  repas: OuiNon
  nb_eleves: string
  ages: string
  nb_accompagnateurs: string
  langue: LangueGroupe | ''
  organisation: string
  adresse: string
  adresse2: string
  ville: string
  province: string
  code_postal: string
  pays: string
  description: string
  resp_prenom: string
  resp_nom: string
  resp_courriel: string
  resp_telephone: string
  facturation_meme: OuiNon
  fact_prenom: string
  fact_nom: string
  fact_courriel: string
  fact_telephone: string
  courriel_direction: string
  commentaires: string
}

/** Date du jour à Montréal (AAAA-MM-JJ), sur l'appareil ou dans le Worker. */
export const aujourdhui = (moment = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(moment)

export const REPONSES_VIDES: Reponses = {
  type_groupe: '',
  type_autre: '',
  forfait: '',
  date: '',
  arrivee: '',
  depart: '',
  heures_ok: '',
  location: '',
  heure_arrivee: '',
  heure_depart: '',
  nb_personnes: '',
  repas: '',
  nb_eleves: '',
  ages: '',
  nb_accompagnateurs: '',
  langue: '',
  organisation: '',
  adresse: '',
  adresse2: '',
  ville: '',
  province: '',
  code_postal: '',
  pays: 'Canada',
  description: '',
  resp_prenom: '',
  resp_nom: '',
  resp_courriel: '',
  resp_telephone: '',
  facturation_meme: '',
  fact_prenom: '',
  fact_nom: '',
  fact_courriel: '',
  fact_telephone: '',
  courriel_direction: '',
  commentaires: '',
}

// ------------------------------------------------------------------
// Textes (Jotform, en français et en anglais)
// ------------------------------------------------------------------

const FR = {
  titre: 'Demande de réservation de groupe',
  intro:
    'Merci de votre intérêt pour la Base de plein air Mont-Tremblant. Veuillez compléter ce formulaire pour nous aider à bien cerner vos besoins pour un éventuel séjour chez nous. Nous vous contacterons dans les meilleurs délais par la suite.',
  type_groupe: 'Type de groupe',
  types: {
    ecole: 'École',
    entreprise: 'Entreprise privée',
    particulier: 'Particulier (fête de famille, amis, etc.)',
    club_sportif: 'Club sportif',
    municipalite: 'Ville ou municipalité',
    osbl: 'Organisme sans but lucratif (OSBL/OBNL)',
    autre: 'Autre',
  } as Record<TypeGroupe, string>,
  type_autre: 'Précisez',
  forfait: 'Quel type de séjour vous intéresse ?',
  forfait_aide: 'Choisissez la description qui se rapproche le plus de vos besoins.',
  forfaits: {
    classe_nature: "Classe nature : Groupe d'âge scolaire avec animation et activités de plein air, repas et hébergement",
    journee_plein_air: "Journée plein air : Groupe d'âge scolaire avec animation et activités de plein air, repas en option",
    accueil_groupe: "Accueil de groupe : Location d'une section ou d'un bâtiment pour hébergement, repas en option",
    location_salle: "Location de salle : Location d'une ou de salles pour évènement privé",
  } as Record<Forfait, string>,
  dates_intro:
    "Veuillez nous indiquer vos dates de réservation souhaitées. Si les dates choisies ne sont pas disponibles, nous vous reviendrons avec d'autres dates auxquelles nous pouvons vous recevoir.",
  date_jpa: 'Date souhaitée pour la journée plein air',
  date_ls: 'Date de location souhaitée',
  arrivee: "Date d'arrivée souhaitée",
  depart: 'Date de départ souhaitée',
  date_aide: "Si vous n'êtes pas encore certain, veuillez inscrire votre meilleure estimation.",
  heures: {
    classe_nature: "L'heure d'arrivée pour une classe nature est {a} et l'heure de départ est {d}. Est-ce que ces heures vous conviennent ?",
    journee_plein_air: "L'heure d'arrivée pour une journée plein air est {a} et l'heure de départ est {d}. Est-ce que ces heures vous conviennent ?",
    accueil_groupe: "L'heure d'arrivée pour l'accueil de groupe est {a} et l'heure de départ est {d}. Est-ce que ces heures vous conviennent ?",
  } as Partial<Record<Forfait, string>>,
  oui: 'Oui',
  non: 'Non',
  heures_non: "Non, j'ai besoin d'une heure d'arrivée et/ou de départ sur mesure (des frais peuvent s'appliquer)",
  location: 'Êtes-vous intéressé par une location de jour ou de soir ?',
  location_jour: 'Location de jour ({a} à {d})',
  location_soir: 'Location de soir ({a} à {d})',
  location_sur_mesure: 'Heures sur mesure',
  heure_arrivee: "Indiquez l'heure d'arrivée souhaitée",
  heure_depart: "Indiquez l'heure de départ souhaitée",
  nb_personnes: 'Nombre de personnes',
  nombre_aide: 'Entrez le nombre approximatif si vous ne connaissez pas le nombre exact.',
  repas: 'Souhaitez-vous ajouter le service de repas ?',
  repas_aide: '{prix} par personne, par repas.',
  nb_eleves: "Nombre d'élèves",
  ages: 'Âges et niveaux scolaires des élèves',
  nb_accompagnateurs: "Nombre d'adultes accompagnateurs",
  langue: 'Langue du groupe',
  langues: { fr: 'Français', en: 'Anglais', fr_en: 'Français et anglais', autre: 'Autre' } as Record<LangueGroupe, string>,
  choisir: 'Sélectionnez',
  organisation: "Nom de l'organisation",
  adresse_titre: 'Adresse de facturation',
  adresse: 'Adresse',
  adresse2: 'Adresse, ligne 2',
  ville: 'Ville',
  province: 'Province',
  code_postal: 'Code postal',
  pays: 'Pays',
  description: 'Courte description du groupe (activités prévues lors de la visite, etc.)',
  resp_titre: 'Responsable de la réservation',
  fact_titre: 'Responsable de la facturation',
  nom_complet: 'Nom complet',
  prenom: 'Prénom',
  nom_famille: 'Nom de famille',
  courriel: 'Adresse email',
  telephone: "Numéro de téléphone (spécifiez l'extension si applicable)",
  facturation_meme: 'Est-ce que le responsable de la réservation est aussi en charge de la facturation ?',
  courriel_direction: 'Adresse email de la direction ou du secrétariat de votre établissement',
  commentaires: "Commentaires, précisions ou demandes d'ajouts de services",
  envoyer: 'Envoyer',
  envoi: 'Envoi…',
  obligatoire: 'Ce champ est obligatoire.',
  courriel_invalide: 'Adresse email invalide.',
  nombre_invalide: 'Entrez un nombre entier.',
  date_invalide: 'Date invalide.',
  date_passee: 'Choisissez une date à venir.',
  depart_avant: "Le départ doit être le jour de l'arrivée ou après.",
  heure_invalide: 'Heure invalide.',
  a_corriger: 'Quelques champs sont à compléter ou à corriger.',
  robot: 'Confirmez que vous n’êtes pas un robot.',
  merci_titre: 'Merci !',
  merci: 'Nous avons bien reçu votre demande de réservation. Un membre de notre équipe vous contactera sous peu.',
  numero: 'Numéro de votre demande : {n}',
  erreur_envoi: "L'envoi n'a pas fonctionné. Réessayez dans un instant ; si le problème persiste, écrivez-nous à inscriptions@camptremblant.com.",
}

type Textes = typeof FR

const EN: Textes = {
  titre: 'Group reservation request',
  intro:
    'Thank you for your interest in Base de plein air Mont-Tremblant. Please complete this form to help us determine your needs for a potential stay with us. We will contact you as soon as possible.',
  type_groupe: 'Group type',
  types: {
    ecole: 'School',
    entreprise: 'Private company',
    particulier: 'Individual (family parties, friends, etc.)',
    club_sportif: 'Sports club',
    municipalite: 'City or municipality',
    osbl: 'Non-Profit Organization',
    autre: 'Other',
  },
  type_autre: 'Please specify',
  forfait: 'What type of stay are you interested in?',
  forfait_aide: 'Choose the description that most closely matches your needs.',
  forfaits: {
    classe_nature: 'Nature class: School-age group with outdoor activities, meals and accommodation.',
    journee_plein_air: 'Outdoor day: School-age group with entertainment and outdoor activities, optional lunch',
    accueil_groupe: 'Group reception: Rental of a section or building for accommodation, optional meals',
    location_salle: 'Room rental: Rent one or more rooms for a private event',
  },
  dates_intro:
    'Please let us know your preferred booking dates. If the dates you have chosen are not available, we will get back to you with alternative dates on which we can accommodate you.',
  date_jpa: 'Preferred date for the outdoor day',
  date_ls: 'Preferred rental date',
  arrivee: 'Arrival date',
  depart: 'Departure date',
  date_aide: "If you're not sure yet, please enter your best estimate.",
  heures: {
    classe_nature: 'The arrival time for a nature class is {a} and the departure time is {d}. Are these times ok with you?',
    journee_plein_air: 'The arrival time for an outdoor day is {a} and the departure time is {d}. Are these times ok with you?',
    accueil_groupe: 'The arrival time for the groups is {a} and the departure time is {d}. Are these times ok with you?',
  },
  oui: 'Yes',
  non: 'No',
  heures_non: 'No, I need a customized arrival and/or departure time (fees may apply)',
  location: 'Are you interested in a daytime or evening rental?',
  location_jour: 'Daytime rental ({a} to {d})',
  location_soir: 'Evening rental ({a} to {d})',
  location_sur_mesure: 'Customized hours',
  heure_arrivee: 'Indicate desired arrival time',
  heure_depart: 'Indicate departure time',
  nb_personnes: 'Number of people',
  nombre_aide: "Enter the approximate number if you don't know the exact number.",
  repas: 'Would you like to add a meal service?',
  repas_aide: '{prix} per person, per meal.',
  nb_eleves: 'Number of students',
  ages: "Students' ages and school levels",
  nb_accompagnateurs: 'Number of accompanying adults',
  langue: 'Group language',
  langues: { fr: 'French', en: 'English', fr_en: 'English and French', autre: 'Other' },
  choisir: 'Please select',
  organisation: 'Organization name',
  adresse_titre: 'Billing address',
  adresse: 'Address',
  adresse2: 'Street Address Line 2',
  ville: 'City',
  province: 'Province',
  code_postal: 'Postal Code',
  pays: 'Country',
  description: 'Short description of the group (activities planned during the visit, etc.)',
  resp_titre: 'Person in charge of the reservation',
  fact_titre: 'Person in charge of billing',
  nom_complet: 'Full name',
  prenom: 'First name',
  nom_famille: 'Surname',
  courriel: 'Email address',
  telephone: 'Phone number (specify extension if applicable)',
  facturation_meme: 'Is the person in charge of reservation also in charge of billing?',
  courriel_direction: "Email address of your school's management or secretariat",
  commentaires: 'Comments, clarifications or requests for additional services',
  envoyer: 'Submit',
  envoi: 'Sending…',
  obligatoire: 'This field is required.',
  courriel_invalide: 'Invalid email address.',
  nombre_invalide: 'Enter a whole number.',
  date_invalide: 'Invalid date.',
  date_passee: 'Choose a future date.',
  depart_avant: 'Departure must be on or after the arrival date.',
  heure_invalide: 'Invalid time.',
  a_corriger: 'Some fields need to be completed or corrected.',
  robot: 'Please confirm you are not a robot.',
  merci_titre: 'Thank you!',
  merci: 'We have received your reservation request. A member of our team will contact you shortly.',
  numero: 'Your request number: {n}',
  erreur_envoi: 'Sending failed. Please try again in a moment; if the problem persists, write to us at inscriptions@camptremblant.com.',
}

export const TEXTES: Record<Langue, Textes> = { fr: FR, en: EN }

/** « 10h », « 17h30 » / « 10am », « 5:30pm ». */
export function heureLisible(hhmm: string, langue: Langue): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (langue === 'fr') return `${h}h${m ? String(m).padStart(2, '0') : ''}`
  const h12 = h % 12 || 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

export const remplacer = (texte: string, valeurs: Record<string, string>) =>
  texte.replace(/\{(\w+)\}/g, (_, k: string) => valeurs[k] ?? '')

// ------------------------------------------------------------------
// Logique conditionnelle (celle du Jotform)
// ------------------------------------------------------------------

export const estScolaire = (f: Forfait | '') => f === 'classe_nature' || f === 'journee_plein_air'
export const estUnJour = (f: Forfait | '') => f === 'journee_plein_air' || f === 'location_salle'

/** Questions affichées selon les réponses déjà données. */
export function visibles(r: Reponses) {
  const f = r.forfait
  return {
    type_autre: r.type_groupe === 'autre',
    date: estUnJour(f),
    arrivee_depart: f === 'classe_nature' || f === 'accueil_groupe',
    heures_ok: f === 'classe_nature' || f === 'journee_plein_air' || f === 'accueil_groupe',
    location: f === 'location_salle',
    heures_sur_mesure: r.heures_ok === 'non' || r.location === 'sur_mesure',
    nb_personnes: f === 'accueil_groupe' || f === 'location_salle',
    repas: f === 'journee_plein_air' || f === 'accueil_groupe' || f === 'location_salle',
    scolaire: estScolaire(f),
    facturation: r.facturation_meme === 'non',
    courriel_direction: r.type_groupe === 'ecole',
  }
}

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Champs à compléter ou à corriger (clé → message), dans la langue du
 * formulaire. `auj` : date du jour (AAAA-MM-JJ) ; une date passée est refusée.
 */
export function erreurs(r: Reponses, langue: Langue, auj: string): Partial<Record<keyof Reponses, string>> {
  const t = TEXTES[langue]
  const v = visibles(r)
  const e: Partial<Record<keyof Reponses, string>> = {}
  const requis = (cle: keyof Reponses) => {
    if (!String(r[cle] ?? '').trim()) e[cle] = t.obligatoire
  }
  const nombre = (cle: keyof Reponses) => {
    requis(cle)
    if (!e[cle] && !/^\d{1,4}$/.test(String(r[cle]).trim())) e[cle] = t.nombre_invalide
  }
  const date = (cle: keyof Reponses) => {
    requis(cle)
    if (e[cle]) return
    if (!DATE.test(r[cle] as string) || Number.isNaN(Date.parse(r[cle] as string))) e[cle] = t.date_invalide
    else if ((r[cle] as string) < auj) e[cle] = t.date_passee
  }
  const courriel = (cle: keyof Reponses) => {
    requis(cle)
    if (!e[cle] && !COURRIEL.test(String(r[cle]).trim())) e[cle] = t.courriel_invalide
  }

  requis('type_groupe')
  if (v.type_autre) requis('type_autre')
  requis('forfait')
  if (v.date) date('date')
  if (v.arrivee_depart) {
    date('arrivee')
    date('depart')
    if (!e.arrivee && !e.depart && r.depart < r.arrivee) e.depart = t.depart_avant
  }
  if (v.heures_ok) requis('heures_ok')
  if (v.location) requis('location')
  if (v.heures_sur_mesure) {
    for (const cle of ['heure_arrivee', 'heure_depart'] as const) {
      requis(cle)
      if (!e[cle] && !HEURE.test(r[cle])) e[cle] = t.heure_invalide
    }
  }
  if (v.nb_personnes) nombre('nb_personnes')
  if (v.scolaire) {
    nombre('nb_eleves')
    requis('ages')
    nombre('nb_accompagnateurs')
  }
  requis('langue')
  requis('organisation')
  requis('adresse')
  requis('ville')
  requis('province')
  requis('code_postal')
  requis('description')
  requis('resp_prenom')
  requis('resp_nom')
  courriel('resp_courriel')
  requis('resp_telephone')
  if (v.facturation) {
    requis('fact_prenom')
    requis('fact_nom')
    courriel('fact_courriel')
    requis('fact_telephone')
  }
  if (v.courriel_direction) courriel('courriel_direction')
  return e
}

/** Réponses nettoyées : seules les questions affichées sont gardées. */
export function nettoyer(r: Reponses): Reponses {
  const v = visibles(r)
  const n: Reponses = { ...REPONSES_VIDES, pays: '' }
  for (const cle of Object.keys(REPONSES_VIDES) as (keyof Reponses)[]) {
    const val = r[cle]
    ;(n as unknown as Record<string, string>)[cle] = typeof val === 'string' ? val.trim().slice(0, 5000) : ''
  }
  if (!v.type_autre) n.type_autre = ''
  if (!v.date) n.date = ''
  if (!v.arrivee_depart) n.arrivee = n.depart = ''
  if (!v.heures_ok) n.heures_ok = ''
  if (!v.location) n.location = ''
  if (!v.heures_sur_mesure) n.heure_arrivee = n.heure_depart = ''
  if (!v.nb_personnes) n.nb_personnes = ''
  if (!v.repas) n.repas = ''
  if (!v.scolaire) n.nb_eleves = n.ages = n.nb_accompagnateurs = ''
  if (!v.facturation) n.fact_prenom = n.fact_nom = n.fact_courriel = n.fact_telephone = ''
  if (!v.courriel_direction) n.courriel_direction = ''
  return n
}

// ------------------------------------------------------------------
// Demande → réservation (Worker)
// ------------------------------------------------------------------

export interface ReservationDemandee {
  nom: string
  forfait: Forfait
  variante: Variante | null
  date_arrivee: string
  date_depart: string
  heure_arrivee: string | null
  heure_depart: string | null
  heures_regulieres: boolean
  nb_participants: number | null
  nb_accompagnateurs: number | null
  ages: string | null
  langue: string | null
  description: string | null
  commentaires_client: string | null
  ratio: Ratio | null
  service_repas: boolean
  nb_dejeuners: number
  nb_diners: number
  nb_soupers: number
  courriel_direction: string | null
}

const entier = (s: string) => (s.trim() ? Number(s) : null)

/**
 * Réservation préparée comme le ferait l'équipe : variante selon le mois,
 * heures normales sauf heures sur mesure, ratio par défaut, repas proposés.
 * `r` doit avoir passé `erreurs` sans rien et être nettoyée.
 */
export function versReservation(r: Reponses, reglages: Reglages): ReservationDemandee {
  const forfait = r.forfait as Forfait
  const unJour = estUnJour(forfait)
  const scolaire = estScolaire(forfait)
  const arrivee = unJour ? r.date : r.arrivee
  const depart = unJour ? r.date : r.depart
  const variante: Variante | null =
    forfait === 'location_salle' ? (r.location as Variante) : varianteProposee(forfait, arrivee, reglages.variantesClasse)
  const surMesure = visibles(r).heures_sur_mesure
  const normales = heuresNormales(reglages, forfait, variante)
  const heureArrivee = surMesure ? r.heure_arrivee : (normales?.[0] ?? null)
  const heureDepart = surMesure ? r.heure_depart : (normales?.[1] ?? null)
  const serviceRepas = forfait === 'classe_nature' || r.repas === 'oui'
  const repas = repasProposes(
    { forfait, date_arrivee: arrivee, date_depart: depart, service_repas: serviceRepas, heure_arrivee: heureArrivee, heure_depart: heureDepart },
    reglages.heuresRepas,
  )
  return {
    nom: r.organisation.trim(),
    forfait,
    variante,
    date_arrivee: arrivee,
    date_depart: depart,
    heure_arrivee: heureArrivee,
    heure_depart: heureDepart,
    heures_regulieres: !surMesure,
    nb_participants: entier(scolaire ? r.nb_eleves : r.nb_personnes),
    nb_accompagnateurs: scolaire ? entier(r.nb_accompagnateurs) : null,
    ages: scolaire ? r.ages : null,
    langue: r.langue ? FR.langues[r.langue] : null,
    description: r.description || null,
    commentaires_client: r.commentaires || null,
    ratio: scolaire ? reglages.ratioDefaut : null,
    service_repas: serviceRepas,
    nb_dejeuners: repas.dejeuners,
    nb_diners: repas.diners,
    nb_soupers: repas.soupers,
    courriel_direction: r.courriel_direction || null,
  }
}

// ------------------------------------------------------------------
// Validation par l'équipe
// ------------------------------------------------------------------

/** Type d'organisation du CRM proposé d'après le type de groupe (modifiable). */
export function genreSuggere(r: Pick<Reponses, 'type_groupe' | 'type_autre' | 'ages' | 'organisation'>): string {
  const texte = `${r.organisation} ${r.ages} ${r.type_autre}`.toLowerCase()
  switch (r.type_groupe) {
    case 'ecole':
      if (/c[ée]gep|coll[èe]ge/.test(texte)) return 'cegep'
      if (/universit/.test(texte)) return 'universite'
      if (/secondaire|sec\.|high school|\b(1[2-7])\s*(ans|-)/.test(texte)) return 'ecole_secondaire'
      return 'ecole_primaire'
    case 'entreprise':
      return 'entreprise'
    case 'particulier':
      return 'particulier'
    case 'club_sportif':
      return 'club_sportif'
    case 'municipalite':
      return 'municipalite'
    case 'osbl':
      return 'organisme'
    default:
      return /association/.test(texte) ? 'association_etudiante' : 'autre'
  }
}

/** Questions et réponses lisibles (en français), pour la fiche de l'équipe. */
export function resume(r: Reponses): { question: string; reponse: string }[] {
  const t = FR
  const v = visibles(r)
  const oui = (x: OuiNon) => (x === 'oui' ? t.oui : x === 'non' ? t.non : '')
  const nom = (p: string, n: string) => [p, n].filter(Boolean).join(' ')
  const lignes: [string, string, boolean?][] = [
    [t.type_groupe, r.type_groupe ? t.types[r.type_groupe] + (r.type_autre ? ` : ${r.type_autre}` : '') : ''],
    [t.forfait, r.forfait ? t.forfaits[r.forfait].split(' :')[0] : ''],
    [r.forfait === 'location_salle' ? t.date_ls : t.date_jpa, r.date, v.date],
    [t.arrivee, r.arrivee, v.arrivee_depart],
    [t.depart, r.depart, v.arrivee_depart],
    ['Heures normales', r.heures_ok === 'oui' ? t.oui : r.heures_ok === 'non' ? 'Non, sur mesure' : '', v.heures_ok],
    [t.location, r.location === 'jour' ? 'De jour' : r.location === 'soir' ? 'De soir' : r.location === 'sur_mesure' ? t.location_sur_mesure : '', v.location],
    [t.heure_arrivee, r.heure_arrivee, v.heures_sur_mesure],
    [t.heure_depart, r.heure_depart, v.heures_sur_mesure],
    [t.nb_personnes, r.nb_personnes, v.nb_personnes],
    [t.nb_eleves, r.nb_eleves, v.scolaire],
    [t.ages, r.ages, v.scolaire],
    [t.nb_accompagnateurs, r.nb_accompagnateurs, v.scolaire],
    [t.repas, oui(r.repas), v.repas],
    [t.langue, r.langue ? t.langues[r.langue] : ''],
    [t.organisation, r.organisation],
    [t.adresse_titre, [r.adresse, r.adresse2, r.ville, r.province, r.code_postal, r.pays && r.pays !== 'Canada' ? r.pays : ''].filter(Boolean).join(', ')],
    [t.resp_titre, [nom(r.resp_prenom, r.resp_nom), r.resp_courriel, r.resp_telephone].filter(Boolean).join(' · ')],
    [t.fact_titre, [nom(r.fact_prenom, r.fact_nom), r.fact_courriel, r.fact_telephone].filter(Boolean).join(' · '), v.facturation],
    [t.courriel_direction, r.courriel_direction, v.courriel_direction],
    [t.description, r.description],
    [t.commentaires, r.commentaires],
  ]
  return lignes.filter(([, rep, vis]) => vis !== false && rep).map(([question, reponse]) => ({ question, reponse }))
}
