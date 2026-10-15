// Export des embauches vers Employeur D (Desjardins), gabarit « Données
// d'emploi » (canevas d'importation de septembre 2026 ; plan-rh.md §14.4).
// Fonctions pures, sans React ni Supabase, testées sous Node :
// node --test src/modules/rh/employeurD.test.mjs
//
// Le fichier (.xls, un seul onglet « Données à importer », comme l'exemple
// du canevas) a deux sections, chacune annoncée par son en-tête seul sur sa
// ligne : « [Profil personnel] » (46 colonnes, A à AT) puis « [Profil
// emploi] » (112 colonnes, A à DH), une ligne par embauche. Aucune colonne
// ne se retire ; les colonnes « Aucune valeur » (AQ du profil personnel, CJ
// et CZ du profil emploi) et la structure administrative (DB à DE) restent
// vides. Dates AAAA-MM-JJ, montants avec un point.
//
// NAS et compte : jamais ici avant le téléchargement. `verifier` ne voit que
// la paie masquée (présence) ; `rangees` reçoit le NAS et le compte en clair
// de rh.export_employeur_d au moment du fichier, rien n'est gardé.

export const NOM_FEUILLE = 'Données à importer'
export const COLONNES_PERSONNEL = 46
export const COLONNES_EMPLOI = 112

/** Valeurs par défaut (rh.reglages, clé employeur_d ; à confirmer avec Charlotte). */
export interface ReglagesEmployeurD {
  /** D : taux d'assurance emploi (1 régulier, 2 réduit) */
  taux_ae: string
  /** F : statut employé (1 actif) */
  statut: string
  /** G : numéro du titre d'emploi (3 chiffres, table de la compagnie ; obligatoire à l'ajout) */
  titre_emploi: string | null
  /** H : code de regroupement sur rapport (999 par défaut) */
  regroupement: string
  /** U : classe Comité paritaire (7777 par défaut) */
  classe_cp: string
  /** AJ : province de paie */
  province_paie: string
  /** AK : type de rémunération (REM = taux horaire) */
  type_remuneration: string
  /** AL : affichage du salaire (001 = quantité/taux/salaire) */
  affichage: string
  /** AB : heures par paie */
  heures_paie: number
  /** Heures par semaine : taux horaire d'un salaire à la semaine = taux ÷ heures */
  heures_semaine: number
  /** AM : type de dépôt (1) (1 salaire ; vide = pas de type) */
  type_depot: string
  /** BB : mode de paiement (2 dépôt ; 1 chèque, pris d'office sans compte) */
  mode_paiement: string
  /** BC : montant personnel de base fédéral */
  base_federal: string
  /** BH : montant personnel de base provincial */
  base_provincial: string
  /** DH : protection dentaire offerte */
  dentaire: string
  /** M : nationalité (1 canadienne) */
  nationalite: string
  /** O : fumeur */
  fumeur: string
  /** AB (profil personnel) : ajouter à l'impression massive */
  impression_massive: string
}

export const REGLAGES_DEFAUT: ReglagesEmployeurD = {
  taux_ae: '1',
  statut: '1',
  titre_emploi: null,
  regroupement: '999',
  classe_cp: '7777',
  province_paie: 'QUE',
  type_remuneration: 'REM',
  affichage: '001',
  heures_paie: 80,
  heures_semaine: 40,
  type_depot: '1',
  mode_paiement: '2',
  base_federal: '1',
  base_provincial: 'A',
  dentaire: '1',
  nationalite: '1',
  fumeur: 'N',
  impression_massive: 'N',
}

/** Réglages enregistrés complétés des valeurs par défaut. */
export function reglagesEmployeurD(valeur: unknown): ReglagesEmployeurD {
  const v = (valeur && typeof valeur === 'object' ? valeur : {}) as Partial<Record<keyof ReglagesEmployeurD, unknown>>
  const r = { ...REGLAGES_DEFAUT }
  for (const k of Object.keys(REGLAGES_DEFAUT) as (keyof ReglagesEmployeurD)[]) {
    const x = v[k]
    if (k === 'heures_paie' || k === 'heures_semaine') {
      const n = Number(x)
      if (x != null && x !== '' && Number.isFinite(n) && n > 0) r[k] = n
    } else if (k === 'titre_emploi') {
      r.titre_emploi = x == null || String(x).trim() === '' ? null : String(x).trim()
    } else if (x != null && String(x).trim() !== '') {
      r[k] = String(x).trim()
    }
  }
  return r
}

// ------------------------------------------------------------
// Mises en forme
// ------------------------------------------------------------

const sans = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '')

/** Numéro de compagnie complété de zéros à gauche (8), comme « 00000ABC » du canevas. */
export const compagnie8 = (n: string) => n.trim().toUpperCase().padStart(8, '0')

const PROVINCES: [string, string[]][] = [
  ['QUE', ['qc', 'que', 'quebec', 'pq']],
  ['ONT', ['on', 'ont', 'ontario']],
  ['ALB', ['ab', 'alb', 'alberta']],
  ['C B', ['bc', 'cb', 'colombiebritannique', 'britishcolumbia']],
  ['IPE', ['pe', 'pei', 'ipe', 'ileduprinceedouard', 'princeedwardisland']],
  ['MAN', ['mb', 'man', 'manitoba']],
  ['N-B', ['nb', 'nouveaubrunswick', 'newbrunswick']],
  ['N-E', ['ns', 'ne', 'nouvelleecosse', 'novascotia']],
  ['NNT', ['nu', 'nnt', 'nunavut']],
  ['SAS', ['sk', 'sas', 'saskatchewan']],
  ['T-N', ['nl', 'tn', 'terreneuve', 'terreneuveetlabrador', 'newfoundland', 'newfoundlandandlabrador']],
  ['TNO', ['nt', 'tno', 'territoiresdunordouest', 'territoiredunordouest', 'northwestterritories']],
  ['YUK', ['yt', 'yuk', 'yukon']],
]

/** Code de province d'Employeur D (annexe 2 du canevas) d'après le texte du dossier ; null si inconnu. */
export function codeProvince(texte: string | null | undefined) {
  const t = sans(texte ?? '')
  if (!t) return null
  return PROVINCES.find(([, noms]) => noms.includes(t))?.[0] ?? null
}

/** Pays : 1 Canada, 2 États-Unis ; vide = Canada si la province est canadienne ; null sinon. */
export function codePays(texte: string | null | undefined, province: string | null) {
  const t = sans(texte ?? '')
  if (!t) return province ? '1' : null
  if (['canada', 'ca', 'can'].includes(t)) return '1'
  if (['etatsunis', 'etatsunisdamerique', 'unitedstates', 'unitedstatesofamerica', 'usa', 'us', 'eu', 'eua'].includes(t)) return '2'
  return null
}

/** Code postal canadien sans espace (« J8E1A1 ») ; null s'il n'en est pas un. */
export function codePostalCa(texte: string | null | undefined) {
  const t = (texte ?? '').replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(t) ? t : null
}

/** Téléphone à 10 chiffres (un 1 devant est retiré) ; null sinon. */
export function telephone10(texte: string | null | undefined) {
  let t = (texte ?? '').replace(/\D/g, '')
  if (t.length === 11 && t.startsWith('1')) t = t.slice(1)
  return t.length === 10 ? t : null
}

/** Numéro d'assurance maladie sans espaces ni tirets ; vide si « aucun » ; null s'il dépasse 12 caractères. */
export function assuranceMaladie(texte: string | null | undefined) {
  const t = (texte ?? '').replace(/[\s.-]/g, '').toUpperCase()
  if (!t || /^AUCUN/.test(t) || /^NONE/.test(t) || /^N\/?A$/.test(t)) return ''
  return t.length <= 12 && /^[A-Z0-9]+$/.test(t) ? t : null
}

/** Taux horaire (4 décimales) : le taux, ou le salaire à la semaine ÷ heures par semaine. */
export function tauxHoraire(remuneration: 'heure' | 'semaine' | null, taux: number | null, heuresSemaine: number) {
  if (taux == null || !remuneration) return null
  const t = remuneration === 'semaine' ? taux / heuresSemaine : taux
  return Math.round(t * 10_000) / 10_000
}

const couper = (t: string | null | undefined, n: number) => (t ?? '').trim().slice(0, n)

// ------------------------------------------------------------
// Lignes
// ------------------------------------------------------------

/** Ce qu'il faut pour une ligne (une embauche complète de genre emploi). */
export interface SourceEmployeurD {
  embauche: {
    id: string
    personne_id: string
    action_paie: 'A' | 'M' | null
    type_employe: 'B' | 'C' | 'E' | 'P' | 'R' | 'T' | null
    remuneration: 'heure' | 'semaine' | null
    taux: number | null
    date_embauche: string | null
    employeur_d_le: string | null
  }
  personne: { prenom: string; nom_famille: string; nom_complet: string; sexe: 'f' | 'm' | 'x' | null; date_naissance: string | null; courriel: string | null; telephone: string | null }
  dossier: { adresse: string | null; ville: string | null; province: string | null; code_postal: string | null; pays: string | null; assurance_maladie: string | null } | null
  /** Paie masquée : seulement savoir ce qui est au dossier */
  paie: { nas_fin: string | null; transit: string | null; institution: string | null; compte_fin: string | null } | null
  compagnie: { id: string; nom: string; numero_employeur_d: string | null } | null
  poste: { id: string; nom: string; poste_employeur_d: string | null } | null
  /** Fiche du référentiel (matricule) */
  employe: { id: string; matricule_employeur_d: string | null } | null
  /** Langue de la candidature (A si anglais) */
  langue: 'fr' | 'en'
}

export type Manque =
  | 'compagnie'
  | 'numero_compagnie'
  | 'fiche'
  | 'matricule'
  | 'poste'
  | 'poste_employeur_d'
  | 'titre_emploi'
  | 'action'
  | 'type_employe'
  | 'remuneration'
  | 'taux'
  | 'date_embauche'
  | 'nom_famille'
  | 'sexe'
  | 'naissance'
  | 'nas'
  | 'adresse'
  | 'ville'
  | 'pays'
  | 'province'
  | 'code_postal'
  | 'transit'
  | 'institution'

export const LIBELLES_MANQUES: Record<Manque, string> = {
  compagnie: 'compagnie',
  numero_compagnie: 'numéro de compagnie Employeur D',
  fiche: 'fiche du référentiel Employés',
  matricule: 'matricule',
  poste: 'poste',
  poste_employeur_d: 'poste Employeur D',
  titre_emploi: "titre d'emploi (Réglages › Employeur D)",
  action: 'action (A ou M)',
  type_employe: "type d'employé",
  remuneration: 'rémunération',
  taux: 'taux',
  date_embauche: "date d'embauche",
  nom_famille: 'nom de famille',
  sexe: 'sexe (F ou M)',
  naissance: 'date de naissance',
  nas: 'NAS',
  adresse: 'adresse',
  ville: 'ville',
  pays: 'pays (Canada ou États-Unis)',
  province: 'province',
  code_postal: 'code postal',
  transit: 'transit',
  institution: 'institution',
}

export interface Verification {
  manques: Manque[]
  /** Non bloquant : ce qui est laissé vide ou raccourci */
  avertissements: string[]
}

/** Ce qui manque (bloquant) et ce qui sera laissé vide ou raccourci. */
export function verifier(s: SourceEmployeurD, r: ReglagesEmployeurD): Verification {
  const m: Manque[] = []
  const a: string[] = []
  const e = s.embauche
  if (!s.compagnie) m.push('compagnie')
  else if (!s.compagnie.numero_employeur_d) m.push('numero_compagnie')
  if (!s.employe) m.push('fiche')
  else if (!s.employe.matricule_employeur_d) m.push('matricule')
  if (!s.poste) m.push('poste')
  else if (!s.poste.poste_employeur_d) m.push('poste_employeur_d')
  if (!e.action_paie) m.push('action')
  if (e.action_paie !== 'M' && !r.titre_emploi) m.push('titre_emploi')
  if (!e.type_employe) m.push('type_employe')
  if (!e.remuneration) m.push('remuneration')
  if (e.taux == null) m.push('taux')
  if (!e.date_embauche) m.push('date_embauche')
  if (!s.personne.nom_famille.trim()) m.push('nom_famille')
  if (s.personne.sexe !== 'f' && s.personne.sexe !== 'm') m.push('sexe')
  if (!s.personne.date_naissance) m.push('naissance')
  if (!s.paie?.nas_fin) m.push('nas')

  const d = s.dossier
  if (!d?.adresse?.trim()) m.push('adresse')
  else if (d.adresse.trim().length > 30) a.push('Adresse raccourcie à 30 caractères.')
  if (!d?.ville?.trim()) m.push('ville')
  else if (d.ville.trim().length > 30) a.push('Ville raccourcie à 30 caractères.')
  const province = codeProvince(d?.province)
  const pays = codePays(d?.pays, province)
  if (!pays) m.push('pays')
  else if (pays === '1') {
    if (!province) m.push('province')
    if (!codePostalCa(d?.code_postal)) m.push('code_postal')
  } else if (!d?.code_postal?.trim()) m.push('code_postal')
  if (assuranceMaladie(d?.assurance_maladie) === null) a.push("Numéro d'assurance maladie illisible : laissé vide.")
  if (s.personne.telephone && !telephone10(s.personne.telephone)) a.push('Téléphone illisible : laissé vide.')
  if (s.personne.courriel && s.personne.courriel.length > 50) a.push('Courriel de plus de 50 caractères : laissé vide.')
  if (s.personne.nom_famille.trim().length > 40 || s.personne.prenom.trim().length > 40) a.push('Nom ou prénom raccourci à 40 caractères.')

  if (s.paie?.compte_fin) {
    if (!s.paie.transit) m.push('transit')
    if (!s.paie.institution) m.push('institution')
  } else a.push('Aucun compte bancaire : payé par chèque.')
  return { manques: m, avertissements: a }
}

/** Valeur d'une case du fichier : texte, nombre (avec son format Excel) ou vide. */
export type Valeur = string | { n: number; z: string } | null

/** NAS, transit, institution et compte en clair (rh.export_employeur_d). */
export interface PaieEnClairExport {
  nas: string | null
  transit: string | null
  institution: string | null
  compte: string | null
}

const chiffres = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '')

/** Rangées d'une ligne : profil personnel (46 cases) et profil emploi (112 cases). */
export function rangees(s: SourceEmployeurD, r: ReglagesEmployeurD, paie: PaieEnClairExport) {
  const e = s.embauche
  const d = s.dossier
  const action = e.action_paie ?? 'A'
  const compagnie = compagnie8(s.compagnie?.numero_employeur_d ?? '')
  const matricule: Valeur = s.employe?.matricule_employeur_d ? { n: Number(s.employe.matricule_employeur_d), z: '0' } : null
  const province = codeProvince(d?.province)
  const pays = codePays(d?.pays, province)
  const compte = chiffres(paie.compte)
  const parDepot = !!compte

  const personnel: Valeur[] = Array(COLONNES_PERSONNEL).fill(null)
  const pp = (col: number, v: Valeur | undefined) => (personnel[col - 1] = v === '' || v === undefined ? null : v)
  pp(1, action) // A Action
  pp(2, compagnie) // B Numéro de compagnie
  pp(3, matricule) // C Matricule
  pp(4, couper(s.personne.nom_famille, 40)) // D Nom de famille
  pp(5, couper(s.personne.prenom, 40)) // E Prénom
  pp(7, chiffres(paie.nas)) // G NAS (sans tirets)
  pp(8, s.personne.date_naissance?.slice(0, 10) ?? null) // H Date de naissance
  pp(9, s.langue === 'en' ? 'A' : 'F') // I Langue
  pp(10, s.personne.sexe === 'f' ? 'F' : s.personne.sexe === 'm' ? 'M' : null) // J Sexe
  pp(13, r.nationalite) // M Nationalité
  pp(14, assuranceMaladie(d?.assurance_maladie) ?? null) // N Assurance maladie
  pp(15, r.fumeur) // O Fumeur
  pp(16, couper(d?.adresse, 30)) // P Adresse
  pp(17, couper(d?.ville, 30)) // Q Ville
  pp(18, pays === '1' ? province : pays === '2' ? 'ZZ' : null) // R Province (ZZ = autre)
  pp(19, pays === '1' ? codePostalCa(d?.code_postal) : null) // S Code postal
  pp(20, pays === '2' ? couper(d?.code_postal, 10) : null) // T Code postal – USA
  pp(21, pays) // U Pays
  pp(22, telephone10(s.personne.telephone)) // V Téléphone – Résidence
  pp(28, r.impression_massive) // AB Ajouter à l'impression massive
  pp(41, s.personne.courriel && s.personne.courriel.length <= 50 ? s.personne.courriel : null) // AO Courriel personnel
  // AQ (43) : « Aucune valeur », toujours vide.

  const emploi: Valeur[] = Array(COLONNES_EMPLOI).fill(null)
  const pe = (col: number, v: Valeur | undefined) => (emploi[col - 1] = v === '' || v === undefined ? null : v)
  const taux = tauxHoraire(e.remuneration, e.taux, r.heures_semaine)
  pe(1, action) // A Action
  pe(2, compagnie) // B Numéro de compagnie
  pe(3, matricule) // C Matricule
  pe(4, r.taux_ae) // D Taux assurance emploi
  pe(5, s.poste?.poste_employeur_d ?? null) // E Poste
  pe(6, r.statut) // F Statut employé
  pe(7, r.titre_emploi) // G Numéro du titre d'emploi
  pe(8, r.regroupement) // H Code de regroupement sur rapport
  // Ajout : date d'embauche ; modification (un ancien qui revient) : date de réembauche.
  pe(9, action === 'A' ? e.date_embauche : null) // I Date d'embauche
  pe(11, action === 'M' ? e.date_embauche : null) // K Date de réembauche
  pe(20, e.type_employe) // T Type d'employé
  pe(21, r.classe_cp) // U Classe Comité paritaire
  pe(28, { n: r.heures_paie, z: '0.00' }) // AB Nombre d'heures par paie
  pe(29, taux == null ? null : { n: taux, z: '0.0000' }) // AC Taux horaire
  pe(30, e.date_embauche) // AD Date applicable taux actuel
  pe(36, r.province_paie) // AJ Province de paie
  pe(37, r.type_remuneration) // AK Type de rémunération
  pe(38, r.affichage) // AL Affichage du salaire
  if (parDepot) {
    pe(39, r.type_depot) // AM Type de dépôt (1)
    pe(40, chiffres(paie.transit)) // AN Transit (1)
    pe(41, chiffres(paie.institution)) // AO Institution (1)
    pe(42, compte) // AP Compte (1)
  }
  pe(54, parDepot ? r.mode_paiement : '1') // BB Mode de paiement (1 = chèque sans compte)
  pe(55, r.base_federal) // BC Montant personnel de base (fédéral)
  pe(60, r.base_provincial) // BH Montant personnel de base (provincial)
  pe(72, e.date_embauche) // BT Date de changement de salaire
  // CJ (88) et CZ (104) : « Aucune valeur » ; DB à DE (106-109) : structure administrative, toute vide.
  pe(112, r.dentaire) // DH Protection dentaire offerte
  return { personnel, emploi }
}

/** Tout le fichier : « [Profil personnel] », ses lignes, puis « [Profil emploi] » et les siennes. */
export function cellulesFichier(lignes: { personnel: Valeur[]; emploi: Valeur[] }[]): Valeur[][] {
  return [['[Profil personnel]'], ...lignes.map((l) => l.personnel), ['[Profil emploi]'], ...lignes.map((l) => l.emploi)]
}

/** « Employeur D Données d'emploi Été 2027 GBPA+ (2026-10-15).xls » */
export function nomFichier(p: { saison: string; compagnie?: string | null; jour: string }) {
  const net = (t: string) => t.replace(/[\\/:*?"<>|]/g, '-')
  return `Employeur D Données d'emploi ${net(p.saison)}${p.compagnie ? ` ${net(p.compagnie)}` : ''} (${p.jour}).xls`
}

/** Nom de colonne Excel (1 = A, 27 = AA, 112 = DH). */
export function lettreColonne(n: number) {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}
