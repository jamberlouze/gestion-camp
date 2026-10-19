// Import de tâches en lot (Mastertimeline, Travaux) : fonctions pures, sans
// accès aux données ni à SheetJS (le fichier est lu par classeurLot.ts).
//
// Chemin d'une importation : des rangées de texte (collage d'Excel ou de
// Sheets, simple liste de titres, ou fichier) → colonnes reconnues
// (`devinerColonnes`, modifiables à l'écran) → lignes lues (`lireLignes`) →
// valeurs résolues (`resoudre`) avec les valeurs communes du lot et les
// correspondances choisies pour les noms inconnus.

/** Un élément d'une liste du module (projet, lieu, responsable…). */
export interface Option {
  id: string
  nom: string
  /** Autres noms reconnus (ex. l'abréviation d'une compagnie). */
  alias?: (string | null)[]
}

/** Résultat de la lecture d'une cellule. */
export type Lu = { valeur: unknown } | { erreur: string }

interface ColonneBase {
  cle: string
  /** Nom de la colonne dans le gabarit. */
  entete: string
  /** Autres en-têtes reconnus (sans tenir compte de la casse ni des accents). */
  synonymes?: string[]
  obligatoire?: boolean
  /** Comment remplir la colonne (feuille « Aide » du gabarit). */
  aide: string
  /** Exemple de valeur (feuille « Aide » du gabarit). */
  exemple?: string
  /** Valeur commune proposée pour tout le lot (lignes où la cellule est vide). */
  lot?: boolean
}

export type Colonne = ColonneBase &
  (
    | { type: 'texte' }
    | {
        type: 'liste'
        options: Option[]
        /** Plusieurs valeurs séparées par des virgules (étiquettes). */
        multiple?: boolean
        /** Un nom inconnu peut être ajouté à la liste au moment d'importer. */
        creer?: (nom: string) => Promise<string>
      }
    | {
        type: 'valeur'
        lire: (texte: string) => Lu
        afficher: (valeur: unknown) => string
        /** Valeurs permises : feuille « Listes » du gabarit et choix de la valeur commune. */
        choix?: { texte: string; libelle: string }[]
        /** Valeur commune à choix multiples (mois). */
        multiple?: boolean
      }
  )

export const MAX_LIGNES = 1000

/** Texte comparable : minuscules, sans accents ni espaces superflus. */
export function normaliser(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ------------------------------------------------------------- lecture ---

/**
 * Lit un collage : colonnes séparées par des tabulations (Excel, Sheets),
 * une ligne par rangée. Une cellule copiée d'Excel qui contient un retour à
 * la ligne arrive entre guillemets ("" = un guillemet) ; un guillemet qui ne
 * ferme pas une cellule reste du texte.
 */
export function lireTsv(texte: string): string[][] {
  const t = texte.replace(/\r\n?/g, '\n')
  const rangees: string[][] = []
  let rangee: string[] = []
  let i = 0
  while (i <= t.length) {
    let cellule = ''
    if (t[i] === '"') {
      // Cherche le guillemet fermant suivi d'une fin de cellule.
      let j = i + 1
      let contenu = ''
      let ferme = false
      while (j < t.length) {
        if (t[j] === '"') {
          if (t[j + 1] === '"') {
            contenu += '"'
            j += 2
            continue
          }
          if (j + 1 === t.length || t[j + 1] === '\t' || t[j + 1] === '\n') ferme = true
          break
        }
        contenu += t[j++]
      }
      if (ferme) {
        cellule = contenu
        i = j + 1
      }
    }
    if (i < t.length && cellule === '' && t[i] !== '\t' && t[i] !== '\n') {
      let j = i
      while (j < t.length && t[j] !== '\t' && t[j] !== '\n') j++
      cellule = t.slice(i, j)
      i = j
    }
    rangee.push(cellule)
    if (i >= t.length || t[i] === '\n') {
      rangees.push(rangee)
      rangee = []
    }
    i++
  }
  return nettoyer(rangees)
}

/** Cellules sans espaces autour ; rangées vides retirées. */
export function nettoyer(rangees: string[][]): string[][] {
  return rangees.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

// ------------------------------------------------------------ colonnes ---

/** Nom d'en-tête comparable : « Titre * », « Où ? », « Mois (oct, avr) » → « titre », « ou », « mois ». */
const nomEntete = (s: string) => normaliser(s.replace(/\([^)]*\)/g, '').replace(/[*:?.]/g, ''))

function cleDeEntete(texte: string, colonnes: Colonne[]): string | null {
  const n = nomEntete(texte)
  if (!n) return null
  const c = colonnes.find((c) => [c.entete, ...(c.synonymes ?? [])].some((s) => nomEntete(s) === n))
  return c?.cle ?? null
}

/** Nombre de colonnes utiles (au moins une cellule remplie). */
export function largeur(rangees: string[][]) {
  let n = 0
  for (const r of rangees) for (let i = r.length - 1; i >= n; i--) if (r[i]) n = i + 1
  return n
}

export interface Disposition {
  /** La première rangée contient les noms des colonnes. */
  entete: boolean
  /** Pour chaque colonne de la source : la colonne du module, ou null (ignorée). */
  associations: (string | null)[]
}

/**
 * Devine la disposition : une première rangée dont au moins la moitié des
 * cellules sont des noms de colonnes connus est un en-tête. Sans en-tête,
 * une seule colonne = les titres ; plusieurs = l'ordre du gabarit.
 */
export function devinerColonnes(rangees: string[][], colonnes: Colonne[]): Disposition {
  const n = largeur(rangees)
  const premiere = rangees[0] ?? []
  const reconnues = premiere.slice(0, n).map((c) => cleDeEntete(c, colonnes))
  const remplies = premiere.slice(0, n).filter(Boolean).length
  const connues = reconnues.filter(Boolean).length
  if (connues > 0 && connues * 2 >= remplies) {
    // Une même colonne du module n'est prise qu'une fois (la première).
    const vues = new Set<string>()
    return {
      entete: true,
      associations: reconnues.map((c) => (c && !vues.has(c) ? (vues.add(c), c) : null)),
    }
  }
  const titre = colonnes[0]?.cle ?? null
  if (n <= 1) return { entete: false, associations: [titre] }
  return { entete: false, associations: Array.from({ length: n }, (_, i) => colonnes[i]?.cle ?? null) }
}

/** Une rangée de la source, par colonne du module (numéro = rang dans la source, à partir de 1). */
export interface LigneSource {
  numero: number
  cellules: Record<string, string>
}

export function lireLignes(rangees: string[][], d: Disposition): LigneSource[] {
  const lignes: LigneSource[] = []
  rangees.forEach((r, i) => {
    if (d.entete && i === 0) return
    const cellules: Record<string, string> = {}
    d.associations.forEach((cle, j) => {
      if (cle && r[j]) cellules[cle] = r[j]
    })
    if (Object.keys(cellules).length) lignes.push({ numero: i + 1, cellules })
  })
  return lignes
}

// ---------------------------------------------------------- résolution ---

/** Choix pour un nom inconnu : id d'une option, CREER, VIDE ; absent = pas encore choisi. */
export const CREER = '+'
export const VIDE = '-'

/** Valeur d'une option à créer au moment d'importer (remplacée ensuite par son id). */
export const aCreer = (nom: string) => `${CREER}${nom}`
export const estACreer = (v: unknown): v is string => typeof v === 'string' && v.startsWith(CREER)

export interface Choix {
  /** Valeur commune du lot (lignes vides) : id d'une option, ou texte lu comme une cellule. */
  defauts: Record<string, string>
  /** Par colonne, par nom normalisé : ce qu'on fait d'un nom inconnu. */
  correspondances: Record<string, Record<string, string>>
}

export interface Inconnu {
  /** Nom normalisé (clé des correspondances). */
  cle: string
  /** Le nom tel qu'écrit la première fois. */
  texte: string
  lignes: number
}

export interface LigneLue {
  numero: number
  /** Texte : string ; liste : id (ou liste d'ids si multiple) ; valeur : ce que rend `lire`. Absent = vide. */
  valeurs: Record<string, unknown>
  erreurs: Record<string, string>
  /** Même titre qu'une tâche existante (avertissement seulement). */
  doublon: boolean
}

function trouver(options: Option[], texte: string) {
  const n = normaliser(texte)
  return options.find((o) => normaliser(o.nom) === n || o.alias?.some((a) => a && normaliser(a) === n)) ?? null
}

/** Sépare « Corvée, Woofing » ; une virgule, un point-virgule ou une barre. */
export const separer = (texte: string) =>
  texte
    .split(/[,;/|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

export function resoudre(lignes: LigneSource[], colonnes: Colonne[], choix: Choix, titresExistants: Set<string> = new Set()) {
  const inconnus: Record<string, Map<string, Inconnu>> = {}
  const lues: LigneLue[] = lignes.map((l) => {
    const valeurs: Record<string, unknown> = {}
    const erreurs: Record<string, string> = {}
    for (const c of colonnes) {
      const brut = l.cellules[c.cle]?.trim() ?? ''
      const defaut = choix.defauts[c.cle] ?? ''
      if (c.type === 'texte') {
        if (brut) valeurs[c.cle] = brut
      } else if (c.type === 'valeur') {
        const texte = brut || defaut
        if (texte) {
          const lu = c.lire(texte)
          if ('erreur' in lu) erreurs[c.cle] = lu.erreur
          else if (lu.valeur !== null && lu.valeur !== undefined) valeurs[c.cle] = lu.valeur
        }
      } else if (!brut) {
        if (defaut) valeurs[c.cle] = c.multiple ? separer(defaut) : defaut
      } else {
        const ids: string[] = []
        const manquants: string[] = []
        for (const morceau of c.multiple ? separer(brut) : [brut]) {
          const o = trouver(c.options, morceau)
          if (o) {
            ids.push(o.id)
            continue
          }
          const cle = normaliser(morceau)
          const liste = (inconnus[c.cle] ??= new Map())
          const deja = liste.get(cle)
          if (deja) deja.lignes++
          else liste.set(cle, { cle, texte: morceau, lignes: 1 })
          const pris = choix.correspondances[c.cle]?.[cle]
          if (pris === CREER && c.creer) ids.push(aCreer(cle))
          else if (pris && pris !== VIDE && pris !== CREER) ids.push(pris)
          else if (!pris) manquants.push(morceau)
        }
        if (manquants.length) erreurs[c.cle] = `${manquants.map((m) => `« ${m} »`).join(', ')} à associer`
        const uniques = [...new Set(ids)]
        if (c.multiple) {
          if (uniques.length) valeurs[c.cle] = uniques
        } else if (uniques[0]) valeurs[c.cle] = uniques[0]
      }
      if (c.obligatoire && !(c.cle in valeurs) && !erreurs[c.cle]) erreurs[c.cle] = 'Obligatoire'
    }
    const titre = typeof valeurs.titre === 'string' ? normaliser(valeurs.titre) : ''
    return { numero: l.numero, valeurs, erreurs, doublon: !!titre && titresExistants.has(titre) }
  })
  return {
    lignes: lues,
    inconnus: Object.fromEntries(Object.entries(inconnus).map(([cle, m]) => [cle, [...m.values()]])) as Record<string, Inconnu[]>,
  }
}

/** Les noms à ajouter aux listes pour ces lignes, par colonne (clé normalisée → nom tel qu'écrit). */
export function aCreerPour(lignes: LigneLue[], inconnus: Record<string, Inconnu[]>) {
  const r: Record<string, Map<string, string>> = {}
  for (const l of lignes)
    for (const [cle, v] of Object.entries(l.valeurs))
      for (const x of Array.isArray(v) ? v : [v]) {
        if (!estACreer(x)) continue
        const n = x.slice(CREER.length)
        ;(r[cle] ??= new Map()).set(n, inconnus[cle]?.find((i) => i.cle === n)?.texte ?? n)
      }
  return r
}

/** Remplace les options à créer par l'id reçu à leur création. */
export function remplacerCrees(valeurs: Record<string, unknown>, crees: Record<string, Map<string, string>>) {
  const r: Record<string, unknown> = { ...valeurs }
  for (const [cle, ids] of Object.entries(crees)) {
    const v = r[cle]
    const id = (x: unknown) => (estACreer(x) ? (ids.get(x.slice(CREER.length)) ?? null) : x)
    if (Array.isArray(v)) r[cle] = v.map(id).filter(Boolean)
    else if (v !== undefined) r[cle] = id(v)
  }
  return r
}

// --------------------------------------------- lecteurs de valeurs ---

/** Date : 2026-11-15, 15/11/2026, 15-11-26 (jour avant le mois, sinon l'inverse si c'est la seule lecture possible). */
export function lireDate(texte: string): Lu {
  const t = texte.trim()
  const valide = (a: number, m: number, j: number) => {
    const d = new Date(Date.UTC(a, m - 1, j))
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j
  }
  const iso = (a: number, m: number, j: number) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`
  const invalide = { erreur: `Date invalide : « ${t} »` }
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/)
  if (m) {
    const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return valide(a, mo, j) ? { valeur: iso(a, mo, j) } : invalide
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const [x, y] = [Number(m[1]), Number(m[2])]
    if (valide(a, y, x)) return { valeur: iso(a, y, x) }
    if (valide(a, x, y)) return { valeur: iso(a, x, y) }
    return invalide
  }
  return { erreur: `Date illisible : « ${t} » (ex. 2026-11-15)` }
}

/** Nombre positif ou nul ; la virgule décimale est acceptée. */
export function lireNombre(texte: string): Lu {
  const t = texte.trim().replace(/\s/g, '').replace(',', '.').replace(/h$/i, '')
  const n = Number(t)
  return t && Number.isFinite(n) && n >= 0 ? { valeur: n } : { erreur: `Nombre illisible : « ${texte.trim()} »` }
}

const NOMS_MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

/** Un mois : 1 à 12, ou le début de son nom sans ambiguïté (« oct », « juil », pas « jui »). */
function unMois(texte: string): number | null {
  const t = texte.replace(/\.$/, '')
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t)
    return n >= 1 && n <= 12 ? n : null
  }
  if (t.length < 3) return null
  const trouves = NOMS_MOIS.flatMap((m, i) => (m.startsWith(t) ? [i + 1] : []))
  return trouves.length === 1 ? trouves[0] : null
}

/**
 * Mois où une tâche revient : « oct », « octobre, avril », « 10, 4 »,
 * « mai à août » (de mai à août, qui peut passer par décembre), « tous ».
 * Rendus dans l'ordre (1 à 12).
 */
export function lireMois(texte: string): Lu {
  const n = normaliser(texte)
  if (/^(tous|tous les mois|chaque mois|mensuel|mensuelle|toute l'annee)$/.test(n)) return { valeur: Array.from({ length: 12 }, (_, i) => i + 1) }
  // « 10,4 » tapé dans Excel en français devient le nombre 10.4.
  const t = /^\d{1,2}\.\d{1,2}$/.test(n) ? n.replace('.', ',') : n
  const mois = new Set<number>()
  for (const morceau of t.split(/\s*(?:[,;/+&]|\bet\b)\s*/).filter(Boolean)) {
    const bornes = morceau.split(/\s*(?:-|–|\ba\b|\bau\b|\bjusqu'a\b)\s*/).filter(Boolean)
    const debut = bornes.length === 2 ? unMois(bornes[0]) : null
    const fin = bornes.length === 2 ? unMois(bornes[1]) : null
    if (debut && fin) {
      for (let m = debut; ; m = (m % 12) + 1) {
        mois.add(m)
        if (m === fin) break
      }
      continue
    }
    for (const mot of morceau.split(' ')) {
      const m = unMois(mot)
      if (!m) return { erreur: `Mois illisible : « ${texte.trim()} » (ex. oct, avr)` }
      mois.add(m)
    }
  }
  return mois.size ? { valeur: [...mois].sort((a, b) => a - b) } : { erreur: 'Obligatoire' }
}

/** Une valeur parmi des choix : le code (« 1 ») ou le libellé (« Urgent », « urg »). */
export function lireChoix(choix: { texte: string; libelle: string }[], convertir: (texte: string) => unknown = (x) => x) {
  return (texte: string): Lu => {
    const n = normaliser(texte)
    const c =
      choix.find((x) => normaliser(x.texte) === n || normaliser(x.libelle) === n) ??
      (n.length >= 3 ? choix.filter((x) => normaliser(x.libelle).startsWith(n)) : []).find((_, __, l) => l.length === 1)
    return c ? { valeur: convertir(c.texte) } : { erreur: `« ${texte.trim()} » : ${choix.map((x) => x.libelle).join(', ')}` }
  }
}
