// Dossier d'embauche (/dossier/<jeton>) : remplace les formulaires
// « Confirmation d'embauche » (été) et « - Hors été » d'Airtable
// (docs/rh-existant.md §2.3 et §2.4). Une page par embauche ; version été
// ou hors été selon la saison ; un bénévole n'a pas de section paie mais
// une entente de bénévolat. Pré-rempli pour un ancien ; le NAS et le
// numéro de compte déjà au dossier ne sont jamais réaffichés (3 derniers
// chiffres seulement). Le contrat (emploi) et, pour une personne mineure,
// le consentement parental se signent sur la même page (phase 3 :
// worker/rh/contrats.js), à part de l'envoi du dossier.
//
// Fichier pur : la page vérifie et prépare l'envoi ; le Worker
// (worker/rh/api.js) revérifie avant de déposer les fichiers et d'appeler
// rh.recevoir_dossier.

import { courrielValide, dateValide, telephoneValide } from './candidature.ts'
import { erreurFichier, type SorteFichier } from './fichiersPublics.ts'

export type OuiNon = 'oui' | 'non' | ''

/** Fichiers du dossier (noms des champs du formulaire multipart). */
export type GenreFichierDossier = 'specimen' | 'cv' | 'premiers_soins' | 'sauveteur' | 'piece_identite' | 'consentement_parental' | 'photo'
export const SORTE_FICHIER: Record<GenreFichierDossier, SorteFichier> = {
  specimen: 'specimen',
  cv: 'cv',
  premiers_soins: 'document',
  sauveteur: 'document',
  piece_identite: 'document',
  consentement_parental: 'document',
  photo: 'document',
}
export const GENRES_FICHIERS = Object.keys(SORTE_FICHIER) as GenreFichierDossier[]

export const DIETES_DOSSIER = [
  { id: 'reguliere', nom: 'Régulier, aucune restriction alimentaire' },
  { id: 'vegetarienne', nom: 'Végétarienne' },
  { id: 'sans_lactose', nom: 'Sans lactose' },
  { id: 'sans_porc', nom: 'Sans porc' },
  { id: 'sans_gluten', nom: 'Sans gluten' },
] as const
export const TAILLES_DOSSIER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

/** Clés de `embauches.presentation` (les mêmes que l'import d'Airtable). */
export const PRESENTATION = {
  campeur: 'Campeur ou anim avant à la BPA',
  activite: 'Activité préférée',
  repas: 'Repas préféré',
  karaoke: 'Chanson de karaoké',
} as const

/** Ce que rh.dossier_public renvoie (sans personne_id ni embauche_id, retirés par le Worker). */
export interface PageDossier {
  ferme: boolean
  statut: string
  prenom?: string
  dossier_recu_le: string | null
  genre: 'emploi' | 'benevolat'
  poste: string | null
  compagnie: { nom: string; abreviation: string | null } | null
  debut: string | null
  fin: string | null
  saison: { nom: string; genre: string; debut: string | null; fin: string | null }
  dates: { id: string; genre: string; nom: string; debut: string | null; fin: string | null; obligatoire: boolean; note: string | null }[]
  personne: { prenom: string; nom_famille: string; surnom: string | null; courriel: string | null; telephone: string | null; date_naissance: string | null }
  dossier: Record<string, string | boolean | null> | null
  paie: { nas_fin: string | null; compte_fin: string | null; specimen: boolean } | null
  documents: { genre: string; nom: string | null; le: string }[]
  disponibilites: string[]
  disponibilites_note: string | null
  presentation: Record<string, string>
  commentaires: string | null
  ethique: { id: string; version: number; texte: string } | null
  ethique_accepte_le: string | null
  entente: { id: string; version: number; texte: string } | null
  entente_acceptee_le: string | null
  /** Contrat préparé par l'équipe (le plus récent qui n'est pas annulé) */
  contrat?: { id: string; titre: string; statut: 'en_attente' | 'signe'; signe_le: string | null; nom_signataire: string | null } | null
  /** Consentement parental déjà signé */
  consentement?: { id: string; signe_le: string; nom_signataire: string; lien_signataire: string } | null
}

export interface DonneesDossier {
  prenom: string
  nom_famille: string
  surnom: string
  courriel: string
  telephone: string
  date_naissance: string
  assurance_maladie: string
  adresse: string
  code_postal: string
  ville: string
  province: string
  pays: string
  etudiant_temps_plein: OuiNon
  etudes: string
  // Paie : « changer » seulement s'il y en a déjà au dossier
  changer_nas: boolean
  nas: string
  changer_banque: boolean
  transit: string
  institution: string
  compte: string
  allergies_oui: OuiNon
  allergies: string
  diete: string
  taille_tshirt: string
  taille_hoodie: string
  urgence1_nom: string
  urgence1_lien: string
  urgence1_telephone: string
  urgence2_nom: string
  urgence2_lien: string
  urgence2_telephone: string
  disponibilites: string[]
  disponibilites_note: string
  ethique: boolean
  entente: boolean
  expire_premiers_soins: string
  expire_sauveteur: string
  campeur: string
  activite: string
  repas: string
  karaoke: string
  commentaires: string
}

export type Fichiers = Partial<Record<GenreFichierDossier, { nom: string; taille: number } | null>>
export type ChampDossier = keyof DonneesDossier | GenreFichierDossier

/** Version été (t-shirt, disponibilités, présentation…) ou hors été. */
export const estEte = (page: Pick<PageDossier, 'saison'>) => page.saison.genre === 'ete'

/** Section « Disponibilités » : l'été, ou toute saison qui a des dates. */
export const avecDisponibilites = (page: Pick<PageDossier, 'saison' | 'dates'>) => estEte(page) || page.dates.length > 0

/** Âge en années pleines à une date. */
export function age(naissance: string, a: string) {
  if (!dateValide(naissance) || !dateValide(a)) return null
  const [an, mn, jn] = naissance.split('-').map(Number)
  const [aa, ma, ja] = a.split('-').map(Number)
  return aa - an - (ma < mn || (ma === mn && ja < jn) ? 1 : 0)
}

/** Mineur au début de l'embauche (sinon aujourd'hui) : consentement parental demandé. */
export const estMineur = (d: Pick<DonneesDossier, 'date_naissance'>, page: Pick<PageDossier, 'debut'>, auj: string) => {
  const a = age(d.date_naissance, page.debut ?? auj)
  return a !== null && a < 18
}

/** NAS canadien : 9 chiffres, clé de Luhn (même règle que rh.nas_valide). */
export function nasValide(nas: string) {
  const n = nas.replace(/\D/g, '')
  if (!/^\d{9}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(n[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    s += d
  }
  return s % 10 === 0
}

/** Le NAS doit être donné (aucun au dossier, ou « le changer »). */
export const nasDemande = (d: Pick<DonneesDossier, 'changer_nas'>, page: Pick<PageDossier, 'genre' | 'paie'>) =>
  page.genre === 'emploi' && (!page.paie?.nas_fin || d.changer_nas)
/** Le compte bancaire doit être donné (aucun au dossier, ou « le changer »). */
export const banqueDemandee = (d: Pick<DonneesDossier, 'changer_banque'>, page: Pick<PageDossier, 'genre' | 'paie'>) =>
  page.genre === 'emploi' && (!page.paie?.compte_fin || d.changer_banque)
/** Un spécimen de chèque est exigé : aucun au dossier, ou nouveau compte. */
export const specimenExige = (d: Pick<DonneesDossier, 'changer_banque'>, page: Pick<PageDossier, 'genre' | 'paie'>) =>
  page.genre === 'emploi' && (!page.paie?.specimen || banqueDemandee(d, page))
/** Un CV est exigé s'il n'y en a pas déjà un au dossier. */
export const cvExige = (page: Pick<PageDossier, 'documents'>) => !page.documents.some((x) => x.genre === 'cv')

export const MESSAGES_DOSSIER = {
  requis: 'Réponse obligatoire.',
  courriel: 'Adresse courriel invalide.',
  telephone: 'Numéro de téléphone invalide.',
  date: 'Date invalide.',
  naissance: 'Date de naissance invalide.',
  nas: "Ce NAS n'est pas valide (9 chiffres).",
  transit: 'Le transit a 5 chiffres.',
  institution: "Le numéro d'institution a 3 chiffres.",
  compte: 'Numéro de compte invalide (chiffres seulement).',
  specimen: 'Joins un spécimen de chèque (ou un formulaire de dépôt direct).',
  cv: 'Joins ton CV.',
  ethique: "Coche la case pour t'engager à respecter le code d'éthique.",
  entente: "Coche la case pour accepter l'entente de bénévolat.",
}

/** Réponses à corriger, par champ (vide = tout est bon). Le Worker refait ces vérifications. */
export function erreursDossier(d: DonneesDossier, page: PageDossier, fichiers: Fichiers, auj: string) {
  const m = MESSAGES_DOSSIER
  const e: Partial<Record<ChampDossier, string>> = {}
  const requis = (...cles: (keyof DonneesDossier)[]) => {
    for (const c of cles) if (typeof d[c] === 'string' && !(d[c] as string).trim()) e[c] = m.requis
  }
  requis('prenom', 'nom_famille', 'courriel', 'telephone', 'date_naissance', 'assurance_maladie', 'adresse', 'code_postal', 'ville', 'province', 'pays')
  if (!e.courriel && !courrielValide(d.courriel)) e.courriel = m.courriel
  if (!e.telephone && !telephoneValide(d.telephone)) e.telephone = m.telephone
  if (!e.date_naissance) {
    const a = age(d.date_naissance, auj)
    if (a === null || a < 10 || a > 100) e.date_naissance = m.naissance
  }
  if (d.etudiant_temps_plein !== 'oui' && d.etudiant_temps_plein !== 'non') e.etudiant_temps_plein = m.requis
  if (d.allergies_oui === 'oui' && !d.allergies.trim()) e.allergies = m.requis

  if (nasDemande(d, page) && !nasValide(d.nas)) e.nas = d.nas.trim() ? m.nas : m.requis
  if (banqueDemandee(d, page)) {
    if (!/^\d{5}$/.test(d.transit.replace(/\D/g, ''))) e.transit = d.transit.trim() ? m.transit : m.requis
    if (!/^\d{3}$/.test(d.institution.replace(/\D/g, ''))) e.institution = d.institution.trim() ? m.institution : m.requis
    if (!/^\d{5,20}$/.test(d.compte.replace(/[\s-]/g, ''))) e.compte = d.compte.trim() ? m.compte : m.requis
  }
  if (specimenExige(d, page) && !fichiers.specimen) e.specimen = m.specimen
  if (cvExige(page) && !fichiers.cv) e.cv = m.cv

  for (const g of GENRES_FICHIERS) {
    const f = fichiers[g]
    if (!f) continue
    if (g === 'specimen' && page.genre !== 'emploi') continue
    const err = erreurFichier(f, SORTE_FICHIER[g])
    if (err) e[g] = err
  }
  for (const c of ['expire_premiers_soins', 'expire_sauveteur'] as const) if (d[c] && !dateValide(d[c])) e[c] = m.date

  if (!d.ethique) e.ethique = m.ethique
  if (page.genre === 'benevolat' && page.entente?.texte.trim() && !d.entente) e.entente = m.entente
  return e
}

const texte = (v: unknown) => (typeof v === 'string' ? v : '')
const ouiNon = (v: unknown): OuiNon => (v === true ? 'oui' : v === false ? 'non' : '')

/** Formulaire pré-rempli d'après le dossier (un ancien retrouve ses réponses). */
export function depuisPage(page: PageDossier): DonneesDossier {
  const d = page.dossier ?? {}
  const p = page.personne
  return {
    prenom: p.prenom ?? '',
    nom_famille: p.nom_famille ?? '',
    surnom: p.surnom ?? '',
    courriel: p.courriel ?? '',
    telephone: p.telephone ?? '',
    date_naissance: p.date_naissance ?? '',
    assurance_maladie: texte(d.assurance_maladie),
    adresse: texte(d.adresse),
    code_postal: texte(d.code_postal),
    ville: texte(d.ville),
    province: texte(d.province),
    pays: texte(d.pays),
    etudiant_temps_plein: ouiNon(d.etudiant_temps_plein),
    etudes: texte(d.etudes),
    changer_nas: false,
    nas: '',
    changer_banque: false,
    transit: '',
    institution: '',
    compte: '',
    allergies_oui: page.dossier ? (texte(d.allergies) ? 'oui' : 'non') : '',
    allergies: texte(d.allergies),
    diete: texte(d.diete),
    taille_tshirt: texte(d.taille_tshirt),
    taille_hoodie: texte(d.taille_hoodie),
    urgence1_nom: texte(d.urgence1_nom),
    urgence1_lien: texte(d.urgence1_lien),
    urgence1_telephone: texte(d.urgence1_telephone),
    urgence2_nom: texte(d.urgence2_nom),
    urgence2_lien: texte(d.urgence2_lien),
    urgence2_telephone: texte(d.urgence2_telephone),
    disponibilites: page.disponibilites.filter((id) => page.dates.some((x) => x.id === id)),
    disponibilites_note: page.disponibilites_note ?? '',
    ethique: false,
    entente: false,
    expire_premiers_soins: '',
    expire_sauveteur: '',
    campeur: page.presentation[PRESENTATION.campeur] ?? '',
    activite: page.presentation[PRESENTATION.activite] ?? '',
    repas: page.presentation[PRESENTATION.repas] ?? '',
    karaoke: page.presentation[PRESENTATION.karaoke] ?? '',
    commentaires: page.commentaires ?? '',
  }
}

/** Réponses reçues (JSON non fiable) → DonneesDossier : seules les clés connues, du bon type. */
export function lireDossier(brutes: unknown): DonneesDossier {
  const vide = depuisPage({
    personne: { prenom: '', nom_famille: '', surnom: null, courriel: null, telephone: null, date_naissance: null },
    dossier: null,
    disponibilites: [],
    dates: [],
    disponibilites_note: null,
    presentation: {},
    commentaires: null,
  } as unknown as PageDossier)
  if (!brutes || typeof brutes !== 'object') return vide
  const b = brutes as Record<string, unknown>
  const r = vide as unknown as Record<string, unknown>
  for (const [cle, v0] of Object.entries(vide)) {
    const v = b[cle]
    if (typeof v0 === 'boolean') r[cle] = v === true
    else if (Array.isArray(v0)) r[cle] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100) : []
    else if (typeof v === 'string') r[cle] = v.slice(0, 5000)
  }
  return vide
}

/**
 * Ce que reçoit rh.recevoir_dossier, sans les fichiers (ajoutés par le
 * Worker après le dépôt). Paie seulement si elle est demandée.
 */
export function versDossier(d: DonneesDossier, page: PageDossier) {
  const ete = estEte(page)
  const chiffres = (v: string) => v.replace(/\D/g, '')
  const t = (v: string) => v.trim()
  return {
    personne: {
      prenom: t(d.prenom),
      nom_famille: t(d.nom_famille),
      surnom: t(d.surnom),
      courriel: t(d.courriel).toLowerCase(),
      telephone: t(d.telephone),
      date_naissance: d.date_naissance,
    },
    dossier: {
      adresse: t(d.adresse),
      ville: t(d.ville),
      province: t(d.province),
      code_postal: t(d.code_postal).toUpperCase(),
      pays: t(d.pays),
      assurance_maladie: t(d.assurance_maladie),
      etudiant_temps_plein: d.etudiant_temps_plein === 'oui',
      etudes: t(d.etudes),
      allergies: d.allergies_oui === 'oui' ? t(d.allergies) : '',
      diete: d.diete,
      taille_tshirt: ete ? d.taille_tshirt : '',
      taille_hoodie: ete ? d.taille_hoodie : '',
      urgence1_nom: t(d.urgence1_nom),
      urgence1_lien: t(d.urgence1_lien),
      urgence1_telephone: t(d.urgence1_telephone),
      urgence2_nom: t(d.urgence2_nom),
      urgence2_lien: t(d.urgence2_lien),
      urgence2_telephone: t(d.urgence2_telephone),
    },
    nas: nasDemande(d, page) ? chiffres(d.nas) : null,
    banque: banqueDemandee(d, page) ? { transit: chiffres(d.transit), institution: chiffres(d.institution), compte: chiffres(d.compte) } : null,
    disponibilites: avecDisponibilites(page) ? d.disponibilites.filter((id) => page.dates.some((x) => x.id === id)) : [],
    disponibilites_note: avecDisponibilites(page) ? t(d.disponibilites_note) : '',
    ethique_texte: d.ethique ? (page.ethique?.id ?? null) : null,
    entente_texte: page.genre === 'benevolat' && d.entente ? (page.entente?.id ?? null) : null,
    presentation: ete
      ? {
          [PRESENTATION.campeur]: t(d.campeur),
          [PRESENTATION.activite]: t(d.activite),
          [PRESENTATION.repas]: t(d.repas),
          [PRESENTATION.karaoke]: t(d.karaoke),
        }
      : {},
    commentaires: ete ? t(d.commentaires) : '',
  }
}

// ------------------------------------------------------------------
// Signatures en ligne (contrat, consentement parental)
// ------------------------------------------------------------------

export const LIENS_PARENT = ['Mère', 'Père', 'Tuteur ou tutrice légale'] as const

/** Signature tracée : image PNG en data URL, pas trop lourde. */
export const imageSignatureValide = (v: unknown) =>
  typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length > 200 && v.length < 1_200_000

export const MESSAGES_SIGNATURE = {
  nom: 'Écris ton nom complet.',
  nom_parent: 'Nom complet du parent ou tuteur.',
  lien: 'Choisis le lien avec la personne mineure.',
  image: 'Signe dans le cadre.',
  accepte: 'Coche la case pour confirmer.',
}

type ChampSignature = 'nom' | 'image' | 'accepte' | 'lien'

/** Signature du contrat (page et Worker). */
export function erreursSignature(c: { jeton?: unknown; contrat?: unknown; nom?: unknown; image?: unknown; accepte?: unknown }) {
  const e: Partial<Record<ChampSignature, string>> = {}
  if (typeof c.nom !== 'string' || c.nom.trim().length < 3 || c.nom.length > 200) e.nom = MESSAGES_SIGNATURE.nom
  if (!imageSignatureValide(c.image)) e.image = MESSAGES_SIGNATURE.image
  if (c.accepte !== true) e.accepte = MESSAGES_SIGNATURE.accepte
  if (typeof c.jeton !== 'string' || !/^[0-9a-f]{48}$/.test(c.jeton) || typeof c.contrat !== 'string' || !/^[0-9a-f-]{36}$/i.test(c.contrat)) e.accepte = 'Lien invalide.'
  return e
}

/** Signature du consentement parental (page et Worker). */
export function erreursConsentement(c: { jeton?: unknown; nom?: unknown; lien?: unknown; image?: unknown; accepte?: unknown }) {
  const e: Partial<Record<ChampSignature, string>> = {}
  if (typeof c.nom !== 'string' || c.nom.trim().length < 3 || c.nom.length > 200) e.nom = MESSAGES_SIGNATURE.nom_parent
  if (typeof c.lien !== 'string' || !(LIENS_PARENT as readonly string[]).includes(c.lien)) e.lien = MESSAGES_SIGNATURE.lien
  if (!imageSignatureValide(c.image)) e.image = MESSAGES_SIGNATURE.image
  if (c.accepte !== true) e.accepte = MESSAGES_SIGNATURE.accepte
  if (typeof c.jeton !== 'string' || !/^[0-9a-f]{48}$/.test(c.jeton)) e.accepte = 'Lien invalide.'
  return e
}
