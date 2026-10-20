// Export des heures d'une période de paie vers Employeur D (Desjardins),
// gabarit « Saisie simple » (feuille « Sans distribution coût (simple) »).
// Fonctions pures, sans import : testées sous Node (npm run test:temps).
//
// Une ligne = une personne pour une compagnie :
//   - un employé du référentiel (heures de l'onglet Employés), une ligne par
//     compagnie où il a des heures ; matricule sur sa fiche ;
//   - un compte de la direction (feuilles temps.heures, admins seulement),
//     une ligne pour sa compagnie de paie (temps.paie_direction, qui porte
//     aussi son matricule).
// Colonnes : Compagnie (numéro Employeur D, texte), Matricule (nombre),
// « Nom, prénom », No relevé (vide : Employeur D le pose), Période (date
// aaaa/mm/jj), puis une colonne « G<code>(Quantité) » par code réglé.
// Codes réglés dans l'app (temps.reglages_employeur_d) : codes de gains
// (heures payées) et codes d'utilisation (heures prises dans une banque
// d'Employeur D : les vacances, dont Employeur D calcule lui-même la paie,
// et la maladie, dont Employeur D tient le solde) ;
// un type sans code n'est pas exporté (ses heures sont signalées). Le
// woofing n'est jamais payé. Formats du canevas Desjardins : compagnie = 8
// lettres ou chiffres au plus, matricule = 9 chiffres au plus, code = 1 à 999.

export type TypeExporte = 'regulieres' | 'vacances' | 'maladie' | 'banque'

type Reglage = 'code_regulieres' | 'code_vacances' | 'code_maladie' | 'code_banque'

/** Code de gain (heures payées) ou code d'utilisation (heures prises dans une banque d'Employeur D). */
export type GenreCode = 'gain' | 'utilisation'

/** Types d'heures exportés, dans l'ordre des colonnes (vacances : la direction seulement). */
export const TYPES_EXPORTES: { type: TypeExporte; libelle: string; reglage: Reglage; genre: GenreCode; detail: string }[] = [
  { type: 'regulieres', libelle: 'Heures régulières', reglage: 'code_regulieres', genre: 'gain', detail: 'Employés et direction' },
  { type: 'vacances', libelle: 'Vacances', reglage: 'code_vacances', genre: 'utilisation', detail: 'Direction seulement' },
  { type: 'maladie', libelle: 'Maladie', reglage: 'code_maladie', genre: 'utilisation', detail: 'Heures de maladie des feuilles' },
  { type: 'banque', libelle: 'Tirées de la banque', reglage: 'code_banque', genre: 'gain', detail: 'Manque d’une période tiré de la banque d’heures de l’app (calculé)' },
]

export type DatePeriode = 'date_paie' | 'fin_periode'

export interface ReglagesEmployeurD {
  code_regulieres: number | null
  code_vacances: number | null
  code_maladie: number | null
  code_banque: number | null
  periode: DatePeriode
  modifie_le?: string | null
  modifie_par?: string | null
}

export interface EmployeExport {
  id: string
  surnom: string
  nom_complet: string | null
  matricule_employeur_d: string | null
}

export interface CompagnieExport {
  id: string
  nom: string
  abreviation?: string | null
  ordre: number
  numero_employeur_d: string | null
}

/** Nom affiché d'une compagnie dans le module : son acronyme (« GBPA+ »), sinon son nom. */
export const nomCompagnie = (c: { nom: string; abreviation?: string | null }) => c.abreviation || c.nom

export interface HeureExport {
  employe_id: string
  entreprise_id: string
  type: string
  heures: number
}

export type StatutFeuille = 'ouverte' | 'soumise' | 'approuvee'

/** Compte de la direction (admin : pas d'approbation de sa feuille). */
export interface MembreDirectionExport {
  id: string
  nom: string | null
  courriel: string
  admin: boolean
}

export interface PaieDirectionExport {
  user_id: string
  entreprise_id: string | null
  matricule_employeur_d: string | null
}

export interface HeureDirectionExport {
  user_id: string
  type: string
  heures: number
}

export type Genre = 'employe' | 'direction'

/** Une personne à compléter (matricule, compagnie de paie). */
export interface Personne {
  genre: Genre
  id: string
  nom: string
}

export interface LigneExport {
  cle: string
  genre: Genre
  /** Fiche du référentiel (employé) ou compte (direction). */
  personneId: string
  nom: string
  compagnie: CompagnieExport
  matricule: string | null
  /** Quantité par code de gain (heures, arrondies au centième). */
  quantites: Record<number, number>
  /** État de la feuille à approuver (employé qui remplit la sienne, direction) ; null sinon. */
  statut: StatutFeuille | null
}

export interface ResultatExport {
  /** Codes de gains = colonnes du fichier, dans l'ordre des types (sans doublon). */
  codes: number[]
  lignes: LigneExport[]
  /** Heures laissées de côté faute de code, par type. */
  sansCode: { type: TypeExporte; libelle: string; genre: GenreCode; heures: number; personnes: number }[]
  /** Bloquant : compagnies du fichier sans numéro Employeur D. */
  compagniesSansNumero: CompagnieExport[]
  /** Bloquant : personnes du fichier sans matricule. */
  sansMatricule: Personne[]
  /** Bloquant : direction avec des heures à exporter mais sans compagnie de paie (dans aucune ligne). */
  directionSansCompagnie: Personne[]
  /** Bloquant : un même matricule pour deux personnes. */
  matriculesEnDouble: { matricule: string; noms: string[] }[]
  /** À vérifier : feuilles pas encore approuvées (leurs heures sont exportées telles quelles). */
  nonApprouvees: LigneExport[]
  /** Fichier possible : au moins une ligne et rien de bloquant. */
  pret: boolean
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** « Chamberland, Maxime » si le nom complet est connu, sinon le nom de camp. */
export const nomExport = (e: Pick<EmployeExport, 'surnom' | 'nom_complet'>) => e.nom_complet || e.surnom

/**
 * « Nom, prénom » d'un compte de la direction, tiré de son nom affiché
 * (« Julie Tremblay » → « Tremblay, Julie » ; le prénom = le premier mot,
 * les prénoms composés ont un trait d'union). Sans nom : le courriel.
 */
export function nomDirection(m: Pick<MembreDirectionExport, 'nom' | 'courriel'>): string {
  const nom = m.nom?.trim().replace(/\s+/g, ' ')
  if (!nom) return m.courriel
  const i = nom.indexOf(' ')
  return i < 0 ? nom : `${nom.slice(i + 1)}, ${nom.slice(0, i)}`
}

/** Code de gain de chaque type (null = pas exporté). */
export function codesParType(r: ReglagesEmployeurD): Record<TypeExporte, number | null> {
  return { regulieres: r.code_regulieres, vacances: r.code_vacances, maladie: r.code_maladie, banque: r.code_banque }
}

/** Colonnes de codes : celles des types qui ont un code, dans l'ordre, sans doublon (deux types au même code s'additionnent). */
export function colonnesCodes(r: ReglagesEmployeurD): number[] {
  const codes: number[] = []
  for (const t of TYPES_EXPORTES) {
    const c = r[t.reglage]
    if (c != null && !codes.includes(c)) codes.push(c)
  }
  return codes
}

const estExporte = (t: string): t is TypeExporte => TYPES_EXPORTES.some((x) => x.type === t)

/**
 * Lignes du fichier pour une période. `heures` = les heures des employés de
 * la période (tous types ; le woofing et tout autre type sont ignorés).
 * `compagnie` : une seule compagnie, ou null pour toutes. `statuts` :
 * feuilles des employés qui remplissent la leur (`propres`), sans ligne =
 * ouverte. `direction` : heures de la période des comptes de la direction
 * (admins seulement), leur paie et l'état de leur feuille (un admin n'a pas
 * d'approbation). Une personne de la direction sans compagnie de paie
 * bloque le fichier, même filtré sur une compagnie : ses heures ne seraient
 * dans aucun fichier.
 */
export function preparerExport(p: {
  employes: EmployeExport[]
  compagnies: CompagnieExport[]
  heures: HeureExport[]
  reglages: ReglagesEmployeurD
  compagnie?: string | null
  propres?: Iterable<string>
  statuts?: { employe_id: string; entreprise_id: string; statut: StatutFeuille }[]
  direction?: {
    membres: MembreDirectionExport[]
    paie: PaieDirectionExport[]
    heures: HeureDirectionExport[]
    statuts?: { user_id: string; statut: StatutFeuille }[]
  }
}): ResultatExport {
  const codes = colonnesCodes(p.reglages)
  const codeDe = codesParType(p.reglages)
  const parEmploye = new Map(p.employes.map((e) => [e.id, e]))
  const parCompagnie = new Map(p.compagnies.map((c) => [c.id, c]))
  const propres = new Set(p.propres ?? [])
  const statutDe = new Map((p.statuts ?? []).map((s) => [`${s.employe_id}|${s.entreprise_id}`, s.statut]))

  const lignes = new Map<string, LigneExport>()
  const sansCode = new Map<TypeExporte, { heures: number; personnes: Set<string> }>()
  const directionSansCompagnie = new Map<string, Personne>()

  /** Type sans code : heures seulement comptées (signalées), rend true. */
  const sansCodeCompte = (type: TypeExporte, heures: number, personne: string) => {
    if (codeDe[type] != null) return false
    const s = sansCode.get(type) ?? { heures: 0, personnes: new Set<string>() }
    s.heures += heures
    s.personnes.add(personne)
    sansCode.set(type, s)
    return true
  }
  /** Ajoute des heures à une ligne (créée au besoin) ; un type sans code est seulement compté. */
  const ajouter = (type: TypeExporte, heures: number, cle: string, personne: string, creer: () => LigneExport) => {
    const code = codeDe[type]
    if (code == null) {
      sansCodeCompte(type, heures, personne)
      return
    }
    let l = lignes.get(cle)
    if (!l) lignes.set(cle, (l = creer()))
    l.quantites[code] = (l.quantites[code] ?? 0) + heures
  }

  for (const h of p.heures) {
    if (!estExporte(h.type) || h.type === 'vacances' || !h.heures) continue
    if (p.compagnie && h.entreprise_id !== p.compagnie) continue
    const employe = parEmploye.get(h.employe_id)
    const compagnie = parCompagnie.get(h.entreprise_id)
    if (!employe || !compagnie) continue
    const cle = `employe|${h.employe_id}|${h.entreprise_id}`
    ajouter(h.type, h.heures, cle, `employe|${h.employe_id}`, () => ({
      cle,
      genre: 'employe',
      personneId: employe.id,
      nom: nomExport(employe),
      compagnie,
      matricule: employe.matricule_employeur_d,
      quantites: {},
      statut: statutDe.get(`${h.employe_id}|${h.entreprise_id}`) ?? (propres.has(h.employe_id) ? 'ouverte' : null),
    }))
  }

  if (p.direction) {
    const parMembre = new Map(p.direction.membres.map((m) => [m.id, m]))
    const paieDe = new Map(p.direction.paie.map((x) => [x.user_id, x]))
    const statutMembre = new Map((p.direction.statuts ?? []).map((s) => [s.user_id, s.statut]))
    for (const h of p.direction.heures) {
      if (!estExporte(h.type) || !h.heures) continue
      const membre = parMembre.get(h.user_id)
      if (!membre) continue
      const paie = paieDe.get(h.user_id)
      const compagnie = paie?.entreprise_id ? parCompagnie.get(paie.entreprise_id) : undefined
      const cle = `direction|${h.user_id}`
      if (p.compagnie && compagnie && compagnie.id !== p.compagnie) continue
      if (sansCodeCompte(h.type, h.heures, cle)) continue
      if (!compagnie) {
        directionSansCompagnie.set(membre.id, { genre: 'direction', id: membre.id, nom: nomDirection(membre) })
        continue
      }
      ajouter(h.type, h.heures, cle, cle, () => ({
        cle,
        genre: 'direction',
        personneId: membre.id,
        nom: nomDirection(membre),
        compagnie,
        matricule: paie?.matricule_employeur_d ?? null,
        quantites: {},
        statut: membre.admin ? null : (statutMembre.get(membre.id) ?? 'ouverte'),
      }))
    }
  }

  const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, 'fr')
  const liste = [...lignes.values()]
    .map((l) => ({ ...l, quantites: Object.fromEntries(Object.entries(l.quantites).map(([c, q]) => [c, arrondi(q)])) }))
    .filter((l) => Object.values(l.quantites).some((q) => q > 0))
    .sort(
      (a, b) =>
        a.compagnie.ordre - b.compagnie.ordre ||
        nomCompagnie(a.compagnie).localeCompare(nomCompagnie(b.compagnie), 'fr') ||
        parNom(a, b) ||
        a.personneId.localeCompare(b.personneId),
    )

  const compagniesSansNumero = [...new Map(liste.filter((l) => !l.compagnie.numero_employeur_d).map((l) => [l.compagnie.id, l.compagnie])).values()]
  const personne = (l: LigneExport): Personne => ({ genre: l.genre, id: l.personneId, nom: l.nom })
  const sansMatricule = [...new Map(liste.filter((l) => !l.matricule).map((l) => [`${l.genre}|${l.personneId}`, personne(l)])).values()].sort(parNom)
  // Un matricule = une personne (un employé a le même sur ses lignes de chaque compagnie).
  const porteurs = new Map<string, Map<string, string>>()
  for (const l of liste) {
    if (!l.matricule) continue
    const m = porteurs.get(l.matricule) ?? new Map<string, string>()
    m.set(`${l.genre}|${l.personneId}`, l.nom)
    porteurs.set(l.matricule, m)
  }
  const matriculesEnDouble = [...porteurs].filter(([, m]) => m.size > 1).map(([matricule, m]) => ({ matricule, noms: [...m.values()] }))
  const sansCompagnie = [...directionSansCompagnie.values()].sort(parNom)

  return {
    codes,
    lignes: liste,
    sansCode: TYPES_EXPORTES.filter((t) => sansCode.has(t.type)).map((t) => ({
      type: t.type,
      libelle: t.libelle,
      genre: t.genre,
      heures: arrondi(sansCode.get(t.type)!.heures),
      personnes: sansCode.get(t.type)!.personnes.size,
    })),
    compagniesSansNumero,
    sansMatricule,
    directionSansCompagnie: sansCompagnie,
    matriculesEnDouble,
    nonApprouvees: liste.filter((l) => l.statut != null && l.statut !== 'approuvee'),
    pret: liste.length > 0 && !compagniesSansNumero.length && !sansMatricule.length && !sansCompagnie.length && !matriculesEnDouble.length,
  }
}

// ------------------------------------------------------------------
// Fichier .xls (cellules au format de SheetJS, sans l'importer ici)
// ------------------------------------------------------------------

export const NOM_FEUILLE = 'Sans distribution coût (simple)'

export interface Cellule {
  t: 's' | 'n'
  v: string | number
  /** Format Excel (date, texte). */
  z?: string
}

/** « 2026-10-22 » → numéro de série d'Excel (jours depuis le 30 décembre 1899). */
export function serieExcel(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number)
  return Math.round(Date.UTC(a, m - 1, j) / 86_400_000) + 25_569
}

/** En-têtes du gabarit « Saisie simple », colonnes de codes comprises. */
export function entetes(codes: number[]): string[] {
  return ['Compagnie', 'Matricule', 'Nom, prénom', 'No relevé', 'Période', ...codes.map((c) => `G${c}(Quantité)`)]
}

/**
 * Rangées du fichier (en-têtes puis une par ligne ; null = case vide).
 * Compagnie en texte (garde les zéros de tête), matricule en nombre,
 * période = vraie date au format aaaa/mm/jj du gabarit.
 */
export function cellulesEmployeurD(r: Pick<ResultatExport, 'codes' | 'lignes'>, datePeriode: string): (Cellule | null)[][] {
  const periode: Cellule = { t: 'n', v: serieExcel(datePeriode), z: 'yyyy/mm/dd' }
  return [
    entetes(r.codes).map((v) => ({ t: 's', v })),
    ...r.lignes.map((l) => [
      { t: 's', v: l.compagnie.numero_employeur_d ?? '', z: '@' } as Cellule,
      l.matricule ? ({ t: 'n', v: Number(l.matricule) } as Cellule) : null,
      { t: 's', v: l.nom } as Cellule,
      null,
      periode,
      ...r.codes.map((c) => (l.quantites[c] ? ({ t: 'n', v: l.quantites[c] } as Cellule) : null)),
    ]),
  ]
}

/** Largeurs des colonnes (caractères), proches du gabarit. */
export const largeurs = (codes: number[]) => [10, 10, 28, 9, 11, ...codes.map(() => 13)]

/** « Employeur D PP21-2026 (2026-10-04 au 2026-10-17).xls », avec la compagnie si une seule. */
export function nomFichier(p: { numero: number; annee: number; debut: string; fin: string; compagnie?: string | null }): string {
  const compagnie = p.compagnie ? ` ${p.compagnie.replace(/[\\/:*?"<>|]/g, '-')}` : ''
  return `Employeur D${compagnie} PP${p.numero}-${p.annee} (${p.debut} au ${p.fin}).xls`
}
