// Formulaire public de candidature (/emplois) : remplace « Dépôt de
// candidatures » d'Airtable (docs/rh-existant.md §2.1). Mêmes questions,
// mêmes conditions, en français et en anglais (décision de Maxime du
// 2026-10-12) ; trois postes au plus, vraiment imposé ; saisons et postes
// tirés de l'app (saisons ouvertes, postes actifs du genre de la saison).
//
// Fichier pur : la page s'en sert pour afficher et vérifier, le Worker
// (worker/rh/api.js) pour vérifier de nouveau et préparer l'appel à
// rh.recevoir_candidature. Les réponses sont gardées avec les libellés
// français d'Airtable (les mêmes que l'import), quelle que soit la langue.

import { erreurFichier, type Langue } from './fichiersPublics.ts'

export type { Langue }

export const MAX_POSTES = 3

/** Adresse où écrire pour les questions et les renseignements personnels (à confirmer par Maxime). */
export const COURRIEL_EMPLOIS = 'inscriptions@camptremblant.com'

/** Descriptions des emplois sur le site (lien du formulaire d'Airtable). */
export const PAGE_EMPLOIS = 'https://camptremblant.com/emploi'

interface Option {
  id: string
  /** Libellé français d'Airtable : la valeur gardée dans la candidature. */
  fr: string
  en: string
}

export const NIVEAUX_ETUDES: Option[] = [
  { id: 'sec5_cours', fr: 'Secondaire 5 - En cours', en: 'High school (Secondary 5) – in progress' },
  { id: 'sec5_complete', fr: 'Secondaire 5 - Complété', en: 'High school (Secondary 5) – completed' },
  { id: 'cegep_cours', fr: 'Cégep - En cours', en: 'CEGEP / college – in progress' },
  { id: 'cegep_complete', fr: 'Cégep - Complété', en: 'CEGEP / college – completed' },
  { id: 'univ_cours', fr: 'Université - En cours', en: 'University – in progress' },
  { id: 'univ_complete', fr: 'Université - Complété', en: 'University – completed' },
]

export const CITOYENNETES: Option[] = [
  { id: 'citoyen', fr: 'Citoyen·ne canadien·ne', en: 'Canadian citizen' },
  { id: 'resident', fr: 'Résident·e permanent·e au Canada', en: 'Permanent resident of Canada' },
  { id: 'permis', fr: 'Étranger·ère avec un permis de travail valide au Canada', en: 'Foreign national with a valid Canadian work permit' },
  { id: 'sans_permis', fr: 'Étranger·ère sans permis de travail valide au Canada', en: 'Foreign national without a valid Canadian work permit' },
]

export const NIVEAUX_LANGUE: Option[] = [
  { id: 'maternelle', fr: 'Langue maternelle', en: 'Native language' },
  { id: 'excellent', fr: 'Excellent', en: 'Excellent' },
  { id: 'intermediaire', fr: 'Intermédiaire', en: 'Intermediate' },
  { id: 'debutant', fr: 'Débutant', en: 'Beginner' },
]

export const CONNU_PAR: Option[] = [
  { id: 'facebook', fr: "Groupe Facebook d'emploi", en: 'Facebook job group' },
  { id: 'site', fr: "J'ai trouvé l'offre d'emploi directement sur le site web de l'entreprise", en: "I found the job posting on the company's website" },
  { id: 'ancien', fr: 'Je suis un ancien employé et je reviens', en: "I'm a former employee and I'm coming back" },
  { id: 'acq', fr: "Offre d'emploi sur le site web de l'ACQ (association des camps du Québec)", en: 'Job posting on the ACQ website (Quebec camps association)' },
  { id: 'recrute', fr: 'Recruté par un directeur ou une directrice', en: 'Recruited by a director' },
  { id: 'ami', fr: "Référence d'un ami", en: 'Referred by a friend' },
  { id: 'recherche', fr: "Site de recherche d'emploi (Indeed, LinkedIn, etc.)", en: 'Job search website (Indeed, LinkedIn, etc.)' },
  { id: 'aspi', fr: 'Je suis un ancien ASPI', en: "I'm a former ASPI" },
]

/** « Par qui as-tu été référé ? » n'apparaît que pour ces réponses. */
const AVEC_REFERENCE = ['recrute', 'ami']

export interface Reponses {
  prenom: string
  nom_famille: string
  courriel: string
  telephone: string
  /** Identifiants des options ci-dessus */
  niveau_etudes: string
  citoyennete: string
  motivation: string
  saison_ids: string[]
  poste_ids: string[]
  date_debut: string
  empechements: string
  francais: string
  anglais: string
  connu_par: string
  refere_par: string
  autre: string
}

export const REPONSES_VIDES: Reponses = {
  prenom: '',
  nom_famille: '',
  courriel: '',
  telephone: '',
  niveau_etudes: '',
  citoyennete: '',
  motivation: '',
  saison_ids: [],
  poste_ids: [],
  date_debut: '',
  empechements: '',
  francais: '',
  anglais: '',
  connu_par: '',
  refere_par: '',
  autre: '',
}

/** Ce que rh.formulaire_emplois renvoie (et ce que la page affiche). */
export interface Offre {
  saisons: { id: string; nom: string; genre: string }[]
  postes: { id: string; nom: string; compagnie: string; genres: string[]; description_url: string | null }[]
  compagnies: { id: string; nom: string }[]
}

export type Champ = keyof Reponses | 'cv'

/** Date du jour à Montréal (AAAA-MM-JJ), sur l'appareil ou dans le Worker. */
export const aujourdhui = (moment = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(moment)

export const visibles = (r: Pick<Reponses, 'connu_par'>) => ({ refere_par: AVEC_REFERENCE.includes(r.connu_par) })

/** Postes offerts pour les saisons choisies (genre de la saison). */
export function postesOfferts(offre: Pick<Offre, 'saisons' | 'postes'>, saisonIds: string[]) {
  const genres = new Set(offre.saisons.filter((s) => saisonIds.includes(s.id)).map((s) => s.genre))
  return offre.postes.filter((p) => p.genres.some((g) => genres.has(g)))
}

export const TEXTES = {
  fr: {
    titre: 'Déposer ma candidature',
    intro: 'Merci pour ton intérêt pour une des entreprises du groupe Lütra : {compagnies}.',
    choisir: 'Choisir…',
    section_toi: 'À propos de toi',
    section_motivation: 'Ton expérience et ta motivation de travailler avec nous',
    section_postes: 'Poste(s) souhaité(s)',
    section_autres: 'Autres informations',
    prenom: 'Prénom',
    nom_famille: 'Nom de famille',
    courriel: 'Courriel',
    telephone: 'Téléphone',
    niveau_etudes: "Quel est ton niveau d'études actuel ?",
    citoyennete: 'Statut de citoyenneté',
    motivation: "Qu'est-ce qui te motive à travailler avec nous ?",
    cv: 'CV',
    cv_aide: 'PDF, Word ou photo, 20 Mo au plus.',
    saisons: 'Pour quelle(s) saison(s) souhaites-tu déposer ta candidature ?',
    aucune_saison: "Aucune saison n'est ouverte aux candidatures pour le moment. Reviens bientôt !",
    postes: 'Pour quel(s) poste(s) souhaites-tu appliquer ? (3 choix au maximum)',
    postes_aide: 'Nous t’invitons à consulter les descriptifs de chaque emploi sur notre site avant de faire ton choix :',
    postes_lien: 'juste ici !',
    postes_saison_dabord: 'Choisis d’abord une saison.',
    postes_compte: '{n} sur 3',
    description: 'Description',
    date_debut: 'À partir de quelle date es-tu disponible pour travailler avec nous ?',
    empechements: 'As-tu des empêchements qui vont jouer sur tes disponibilités ?',
    francais: 'Quel est ton niveau de français ?',
    anglais: "Quel est ton niveau d'anglais ?",
    connu_par: "Qu'est-ce qui t'a incité à postuler ?",
    refere_par: 'Par qui as-tu été référé ?',
    autre: "As-tu d'autres informations que tu souhaites nous partager ?",
    confidentialite_titre: 'Confidentialité',
    confidentialite:
      "Tes renseignements servent seulement à évaluer ta candidature et à communiquer avec toi. Seules les personnes chargées de l'embauche (la direction et, au besoin, les personnes qui font les entrevues) y ont accès ; ils ne sont ni vendus ni transmis à l'extérieur du groupe. Pour les consulter, les corriger ou en demander le retrait, écris à {courriel}.",
    envoyer: 'Envoyer ma candidature',
    envoi: 'Envoi…',
    a_corriger: 'Quelques réponses sont à compléter ou à corriger (en rouge).',
    robot: 'Merci de confirmer que tu n’es pas un robot (case ci-dessus).',
    erreur_envoi: "L'envoi n'a pas fonctionné. Vérifie ta connexion et réessaie.",
    chargement_impossible: 'Le formulaire ne peut pas se charger pour le moment. Réessaie dans quelques minutes.',
    merci_titre: 'Merci !',
    merci: 'Ta candidature a bien été reçue. Nous communiquerons avec toi par courriel.',
    requis: 'Réponse obligatoire.',
    courriel_invalide: 'Adresse courriel invalide.',
    telephone_invalide: 'Numéro de téléphone invalide.',
    date_invalide: 'Date invalide.',
    une_saison: 'Choisis au moins une saison.',
    un_poste: 'Choisis au moins un poste.',
    trois_postes: 'Trois postes au maximum.',
    poste_hors_saison: 'Un poste choisi n’est pas offert pour ces saisons.',
    cv_requis: 'Joins ton CV.',
  },
  en: {
    titre: 'Apply for a job',
    intro: 'Thank you for your interest in one of the Lütra group companies: {compagnies}.',
    choisir: 'Choose…',
    section_toi: 'About you',
    section_motivation: 'Your experience and why you want to work with us',
    section_postes: 'Desired position(s)',
    section_autres: 'Other information',
    prenom: 'First name',
    nom_famille: 'Last name',
    courriel: 'Email',
    telephone: 'Phone',
    niveau_etudes: 'What is your current level of education?',
    citoyennete: 'Citizenship status',
    motivation: 'What motivates you to work with us?',
    cv: 'Résumé (CV)',
    cv_aide: 'PDF, Word or photo, 20 MB maximum.',
    saisons: 'For which season(s) are you applying?',
    aucune_saison: 'No season is open for applications at the moment. Please come back soon!',
    postes: 'Which position(s) are you applying for? (3 choices maximum)',
    postes_aide: 'Please read the description of each job on our website before choosing:',
    postes_lien: 'right here!',
    postes_saison_dabord: 'Choose a season first.',
    postes_compte: '{n} of 3',
    description: 'Description',
    date_debut: 'From what date are you available to work with us?',
    empechements: 'Do you have any constraints that will affect your availability?',
    francais: 'What is your level of French?',
    anglais: 'What is your level of English?',
    connu_par: 'What made you apply?',
    refere_par: 'Who referred you?',
    autre: 'Is there anything else you would like to tell us?',
    confidentialite_titre: 'Privacy',
    confidentialite:
      'Your information is used only to assess your application and to contact you. Only the people in charge of hiring (management and, when needed, the people who conduct interviews) can see it; it is never sold or shared outside the group. To see it, correct it or ask that it be removed, write to {courriel}.',
    envoyer: 'Send my application',
    envoi: 'Sending…',
    a_corriger: 'Some answers need to be completed or corrected (in red).',
    robot: 'Please confirm that you are not a robot (box above).',
    erreur_envoi: 'Sending failed. Check your connection and try again.',
    chargement_impossible: 'The form cannot load right now. Please try again in a few minutes.',
    merci_titre: 'Thank you!',
    merci: 'Your application has been received. We will contact you by email.',
    requis: 'Required.',
    courriel_invalide: 'Invalid email address.',
    telephone_invalide: 'Invalid phone number.',
    date_invalide: 'Invalid date.',
    une_saison: 'Choose at least one season.',
    un_poste: 'Choose at least one position.',
    trois_postes: 'Three positions at most.',
    poste_hors_saison: 'A chosen position is not offered for these seasons.',
    cv_requis: 'Please attach your résumé.',
  },
} as const

export const remplacer = (texte: string, valeurs: Record<string, string | number>) =>
  texte.replace(/\{(\w+)\}/g, (_, k: string) => String(valeurs[k] ?? `{${k}}`))

export const courrielValide = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.trim())
export const telephoneValide = (t: string) => t.replace(/\D/g, '').length >= 7
export const dateValide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))

const option = (liste: Option[], id: string) => liste.find((o) => o.id === id)

/**
 * Réponses à corriger, par champ (vide = tout est bon). `cv` : le fichier
 * joint (null = aucun). Le Worker refait exactement ces vérifications.
 */
export function erreurs(r: Reponses, langue: Langue, offre: Pick<Offre, 'saisons' | 'postes'>, cv: { nom: string; taille: number } | null) {
  const t = TEXTES[langue]
  const e: Partial<Record<Champ, string>> = {}
  const requis = (cle: keyof Reponses) => {
    const v = r[cle]
    if (typeof v === 'string' && !v.trim()) e[cle] = t.requis
  }
  for (const cle of ['prenom', 'nom_famille', 'courriel', 'telephone', 'motivation', 'date_debut'] as const) requis(cle)
  if (!e.courriel && !courrielValide(r.courriel)) e.courriel = t.courriel_invalide
  if (!e.telephone && !telephoneValide(r.telephone)) e.telephone = t.telephone_invalide
  if (!e.date_debut && !dateValide(r.date_debut)) e.date_debut = t.date_invalide
  if (!option(NIVEAUX_ETUDES, r.niveau_etudes)) e.niveau_etudes = t.requis
  if (!option(CITOYENNETES, r.citoyennete)) e.citoyennete = t.requis
  if (!option(NIVEAUX_LANGUE, r.francais)) e.francais = t.requis
  if (!option(NIVEAUX_LANGUE, r.anglais)) e.anglais = t.requis
  if (r.connu_par && !option(CONNU_PAR, r.connu_par)) e.connu_par = t.requis

  const ouvertes = new Set(offre.saisons.map((s) => s.id))
  if (!r.saison_ids.length || r.saison_ids.some((id) => !ouvertes.has(id))) e.saison_ids = t.une_saison
  const offerts = new Set(postesOfferts(offre, r.saison_ids).map((p) => p.id))
  if (!r.poste_ids.length) e.poste_ids = t.un_poste
  else if (new Set(r.poste_ids).size > MAX_POSTES) e.poste_ids = t.trois_postes
  else if (r.poste_ids.some((id) => !offerts.has(id))) e.poste_ids = t.poste_hors_saison

  if (!cv) e.cv = t.cv_requis
  else {
    const m = erreurFichier(cv, 'cv', langue)
    if (m) e.cv = m
  }
  return e
}

/** Réponses gardées : espaces retirés, réponses cachées par une condition vidées, doublons retirés. */
export function nettoyer(r: Reponses): Reponses {
  const n = { ...r }
  for (const [cle, v] of Object.entries(n)) if (typeof v === 'string') (n as Record<string, unknown>)[cle] = v.trim()
  n.courriel = n.courriel.toLowerCase()
  n.saison_ids = [...new Set(r.saison_ids)]
  n.poste_ids = [...new Set(r.poste_ids)]
  if (!visibles(n).refere_par) n.refere_par = ''
  return n
}

/**
 * Ce que reçoit rh.recevoir_candidature (sans la clé ni le CV, ajoutés par
 * le Worker) : réponses aux clés de REPONSES (types.ts), libellés français.
 */
export function versCandidature(r: Reponses, langue: Langue) {
  const fr = (liste: Option[], id: string) => option(liste, id)?.fr ?? ''
  const reponses: Record<string, string> = {
    niveau_etudes: fr(NIVEAUX_ETUDES, r.niveau_etudes),
    citoyennete: fr(CITOYENNETES, r.citoyennete),
    francais: fr(NIVEAUX_LANGUE, r.francais),
    anglais: fr(NIVEAUX_LANGUE, r.anglais),
    date_debut: r.date_debut,
    empechements: r.empechements,
    motivation: r.motivation,
    connu_par: fr(CONNU_PAR, r.connu_par),
    refere_par: r.refere_par,
    autre: r.autre,
    langue: langue === 'en' ? 'Anglais' : 'Français',
  }
  for (const k of Object.keys(reponses)) if (!reponses[k]) delete reponses[k]
  return {
    prenom: r.prenom,
    nom_famille: r.nom_famille,
    courriel: r.courriel,
    telephone: r.telephone,
    saison_ids: r.saison_ids,
    poste_ids: r.poste_ids,
    reponses,
  }
}

/** Réponses reçues (JSON non fiable) → Reponses : seules les clés connues, du bon type. */
export function lireReponses(brutes: unknown): Reponses {
  const r: Reponses = { ...REPONSES_VIDES, saison_ids: [], poste_ids: [] }
  if (!brutes || typeof brutes !== 'object') return r
  const b = brutes as Record<string, unknown>
  for (const cle of Object.keys(REPONSES_VIDES) as (keyof Reponses)[]) {
    const v = b[cle]
    if (cle === 'saison_ids' || cle === 'poste_ids') {
      if (Array.isArray(v)) r[cle] = v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20)
    } else if (typeof v === 'string') r[cle] = v.slice(0, 5000)
  }
  return r
}
