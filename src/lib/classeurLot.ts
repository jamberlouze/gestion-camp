// Import en lot : lecture d'un fichier (.xlsx, .xls, .csv) et gabarit à
// télécharger. SheetJS est chargé seulement à l'usage (gros module).
import type { CellObject, WorkSheet } from 'xlsx'
import { lireTsv, MAX_LIGNES, nettoyer, normaliser, type Colonne } from './importLot'

export const EXTENSIONS = '.xlsx,.xls,.csv,.tsv,.txt'

/** Au-delà, les colonnes d'un fichier sont ignorées. */
const MAX_COLONNES = 40

/** Rangées de texte de la feuille « Tâches » (sinon la première) ; une date devient 2026-11-15. */
export async function lireFichier(fichier: File): Promise<string[][]> {
  if (/\.(tsv|txt)$/i.test(fichier.name)) return lireTsv(await fichier.text())
  const XLSX = await import('xlsx')
  const classeur = /\.csv$/i.test(fichier.name)
    ? XLSX.read(await fichier.text(), { type: 'string', raw: true })
    : XLSX.read(new Uint8Array(await fichier.arrayBuffer()), { type: 'array', cellNF: true })
  const nom = classeur.SheetNames.find((n) => normaliser(n) === 'taches') ?? classeur.SheetNames[0]
  const feuille: WorkSheet | undefined = nom ? classeur.Sheets[nom] : undefined
  if (!feuille?.['!ref']) return []
  const plage = XLSX.utils.decode_range(feuille['!ref'])
  const deuxChiffres = (n: number) => String(n).padStart(2, '0')
  const texte = (c: CellObject | undefined): string => {
    if (!c || c.t === 'z' || c.t === 'e') return ''
    if (c.t === 'b') return c.v ? 'oui' : 'non'
    if (c.t === 'd' && c.v instanceof Date) return `${c.v.getFullYear()}-${deuxChiffres(c.v.getMonth() + 1)}-${deuxChiffres(c.v.getDate())}`
    if (c.t === 'n' && typeof c.v === 'number' && typeof c.z === 'string' && XLSX.SSF.is_date(c.z)) {
      const d = XLSX.SSF.parse_date_code(c.v)
      return `${d.y}-${deuxChiffres(d.m)}-${deuxChiffres(d.d)}`
    }
    return String(c.v ?? '')
  }
  const rangees: string[][] = []
  // Une ligne de plus que le maximum : l'écran peut dire que c'est trop.
  for (let r = plage.s.r; r <= Math.min(plage.e.r, plage.s.r + MAX_LIGNES + 1); r++) {
    const rangee: string[] = []
    for (let c = plage.s.c; c <= Math.min(plage.e.c, plage.s.c + MAX_COLONNES - 1); c++) rangee.push(texte(feuille[XLSX.utils.encode_cell({ r, c })]))
    rangees.push(rangee)
  }
  return nettoyer(rangees)
}

export async function telechargerGabarit(nomFichier: string, colonnes: Colonne[]) {
  const XLSX = await import('xlsx')
  XLSX.writeFile(await classeurGabarit(colonnes), nomFichier)
}

/**
 * Gabarit .xlsx : feuille « Tâches » (les noms de colonnes, à remplir),
 * « Listes » (valeurs permises : projets, lieux, priorités…) et « Aide ».
 */
export async function classeurGabarit(colonnes: Colonne[]) {
  const XLSX = await import('xlsx')
  const classeur = XLSX.utils.book_new()
  const ajouter = (titre: string, rangees: string[][], largeurs: number[]) => {
    const feuille = XLSX.utils.aoa_to_sheet(rangees)
    feuille['!cols'] = largeurs.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(classeur, feuille, titre)
  }
  ajouter(
    'Tâches',
    [colonnes.map((c) => c.entete)],
    colonnes.map((c) => (c.cle === 'titre' ? 45 : c.type === 'texte' ? 35 : 18)),
  )

  const listes = colonnes.flatMap((c) =>
    c.type === 'liste'
      ? [{ entete: c.entete, valeurs: c.options.map((o) => o.nom) }]
      : c.type === 'valeur' && c.choix
        ? [{ entete: c.entete, valeurs: c.choix.map((x) => x.libelle) }]
        : [],
  )
  if (listes.length) {
    const hauteur = Math.max(...listes.map((l) => l.valeurs.length))
    ajouter(
      'Listes',
      [listes.map((l) => l.entete), ...Array.from({ length: hauteur }, (_, i) => listes.map((l) => l.valeurs[i] ?? ''))],
      listes.map((l) => Math.min(40, Math.max(12, ...l.valeurs.map((v) => v.length + 2)))),
    )
  }

  ajouter(
    'Aide',
    [
      ['Colonne', 'Obligatoire', 'Comment remplir', 'Exemple'],
      ...colonnes.map((c) => [c.entete, c.obligatoire ? 'Oui' : '', c.aide, c.exemple ?? '']),
      [],
      ['Une tâche par ligne dans la feuille « Tâches ». Les colonnes peuvent être dans n’importe quel ordre ; celles qui ne servent pas peuvent être retirées.'],
      ['Les noms sont comparés sans tenir compte des majuscules ni des accents. Un nom inconnu peut être associé à un autre ou ajouté à la liste au moment de l’import.'],
    ],
    [16, 12, 70, 28],
  )
  return classeur
}
