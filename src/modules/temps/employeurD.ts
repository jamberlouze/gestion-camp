// Export des heures d'une période de paie vers Employeur D (Desjardins),
// gabarit « Saisie simple » (feuille « Sans distribution coût (simple) »).
// Fonctions pures, sans import : testées sous Node (npm run test:temps).
//
// Une ligne = un employé du référentiel pour une compagnie :
//   Compagnie (numéro Employeur D, texte), Matricule (nombre), « Nom, prénom »,
//   No relevé (vide : Employeur D le pose), Période (date aaaa/mm/jj),
//   puis une colonne « G<code>(Quantité) » par code de gain réglé.
// Codes de gains réglés dans l'app (temps.reglages_employeur_d) : un type
// sans code n'est pas exporté (ses heures sont signalées). Le woofing n'est
// jamais payé. Formats du canevas Desjardins : compagnie = 8 lettres ou
// chiffres au plus, matricule = 9 chiffres au plus, gain = 1 à 999.

export type TypeExporte = 'regulieres' | 'maladie' | 'banque'

/** Types d'heures payées des employés, dans l'ordre des colonnes. */
export const TYPES_EXPORTES: { type: TypeExporte; libelle: string; reglage: 'code_regulieres' | 'code_maladie' | 'code_banque' }[] = [
  { type: 'regulieres', libelle: 'Heures régulières', reglage: 'code_regulieres' },
  { type: 'maladie', libelle: 'Maladie', reglage: 'code_maladie' },
  { type: 'banque', libelle: 'Prises en banque', reglage: 'code_banque' },
]

export type DatePeriode = 'date_paie' | 'fin_periode'

export interface ReglagesEmployeurD {
  code_regulieres: number | null
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
  ordre: number
  numero_employeur_d: string | null
}

export interface HeureExport {
  employe_id: string
  entreprise_id: string
  type: string
  heures: number
}

export type StatutFeuille = 'ouverte' | 'soumise' | 'approuvee'

export interface LigneExport {
  cle: string
  employe: EmployeExport
  compagnie: CompagnieExport
  nom: string
  /** Quantité par code de gain (heures, arrondies au centième). */
  quantites: Record<number, number>
  /** État de sa feuille s'il remplit la sienne ; null sinon. */
  statut: StatutFeuille | null
}

export interface ResultatExport {
  /** Codes de gains = colonnes du fichier, dans l'ordre des types (sans doublon). */
  codes: number[]
  lignes: LigneExport[]
  /** Heures payées laissées de côté faute de code de gain, par type. */
  sansCode: { type: TypeExporte; libelle: string; heures: number; employes: number }[]
  /** Bloquant : compagnies du fichier sans numéro Employeur D. */
  compagniesSansNumero: CompagnieExport[]
  /** Bloquant : employés du fichier sans matricule. */
  employesSansMatricule: EmployeExport[]
  /** À vérifier : lignes d'un employé qui remplit sa feuille, pas encore approuvée. */
  nonApprouvees: LigneExport[]
  /** Fichier possible : au moins une ligne et rien de bloquant. */
  pret: boolean
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** « Chamberland, Maxime » si le nom complet est connu, sinon le nom de camp. */
export const nomExport = (e: Pick<EmployeExport, 'surnom' | 'nom_complet'>) => e.nom_complet || e.surnom

/** Code de gain de chaque type (null = pas exporté). */
export function codesParType(r: ReglagesEmployeurD): Record<TypeExporte, number | null> {
  return { regulieres: r.code_regulieres, maladie: r.code_maladie, banque: r.code_banque }
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

/**
 * Lignes du fichier pour une période. `heures` = les heures de la période
 * (tous types ; le woofing et tout autre type sont ignorés). `compagnie` :
 * une seule compagnie, ou null pour toutes. `statuts` : feuilles des
 * employés qui remplissent la leur (`propres`), sans ligne = ouverte.
 */
export function preparerExport(p: {
  employes: EmployeExport[]
  compagnies: CompagnieExport[]
  heures: HeureExport[]
  reglages: ReglagesEmployeurD
  compagnie?: string | null
  propres?: Iterable<string>
  statuts?: { employe_id: string; entreprise_id: string; statut: StatutFeuille }[]
}): ResultatExport {
  const codes = colonnesCodes(p.reglages)
  const codeDe = codesParType(p.reglages)
  const parEmploye = new Map(p.employes.map((e) => [e.id, e]))
  const parCompagnie = new Map(p.compagnies.map((c) => [c.id, c]))
  const propres = new Set(p.propres ?? [])
  const statutDe = new Map((p.statuts ?? []).map((s) => [`${s.employe_id}|${s.entreprise_id}`, s.statut]))
  const estExporte = (t: string): t is TypeExporte => TYPES_EXPORTES.some((x) => x.type === t)

  const lignes = new Map<string, LigneExport>()
  const sansCode = new Map<TypeExporte, { heures: number; employes: Set<string> }>()
  for (const h of p.heures) {
    if (!estExporte(h.type) || !h.heures) continue
    if (p.compagnie && h.entreprise_id !== p.compagnie) continue
    const employe = parEmploye.get(h.employe_id)
    const compagnie = parCompagnie.get(h.entreprise_id)
    if (!employe || !compagnie) continue
    const code = codeDe[h.type]
    if (code == null) {
      const s = sansCode.get(h.type) ?? { heures: 0, employes: new Set<string>() }
      s.heures += h.heures
      s.employes.add(h.employe_id)
      sansCode.set(h.type, s)
      continue
    }
    const cle = `${h.employe_id}|${h.entreprise_id}`
    let l = lignes.get(cle)
    if (!l) {
      const statut = statutDe.get(cle) ?? (propres.has(h.employe_id) ? 'ouverte' : null)
      l = { cle, employe, compagnie, nom: nomExport(employe), quantites: {}, statut }
      lignes.set(cle, l)
    }
    l.quantites[code] = (l.quantites[code] ?? 0) + h.heures
  }

  const liste = [...lignes.values()]
    .map((l) => ({ ...l, quantites: Object.fromEntries(Object.entries(l.quantites).map(([c, q]) => [c, arrondi(q)])) }))
    .filter((l) => Object.values(l.quantites).some((q) => q > 0))
    .sort(
      (a, b) =>
        a.compagnie.ordre - b.compagnie.ordre ||
        a.compagnie.nom.localeCompare(b.compagnie.nom, 'fr') ||
        a.nom.localeCompare(b.nom, 'fr') ||
        a.employe.id.localeCompare(b.employe.id),
    )

  const compagniesSansNumero = [...new Map(liste.filter((l) => !l.compagnie.numero_employeur_d).map((l) => [l.compagnie.id, l.compagnie])).values()]
  const employesSansMatricule = [...new Map(liste.filter((l) => !l.employe.matricule_employeur_d).map((l) => [l.employe.id, l.employe])).values()].sort(
    (a, b) => nomExport(a).localeCompare(nomExport(b), 'fr'),
  )

  return {
    codes,
    lignes: liste,
    sansCode: TYPES_EXPORTES.filter((t) => sansCode.has(t.type)).map((t) => ({
      type: t.type,
      libelle: t.libelle,
      heures: arrondi(sansCode.get(t.type)!.heures),
      employes: sansCode.get(t.type)!.employes.size,
    })),
    compagniesSansNumero,
    employesSansMatricule,
    nonApprouvees: liste.filter((l) => l.statut != null && l.statut !== 'approuvee'),
    pret: liste.length > 0 && !compagniesSansNumero.length && !employesSansMatricule.length,
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
      l.employe.matricule_employeur_d ? ({ t: 'n', v: Number(l.employe.matricule_employeur_d) } as Cellule) : null,
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
