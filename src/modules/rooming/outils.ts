import type { Chambre, Employe, Lieu, Occupation, Personne, TypeChambre } from './types'

// Fonctions pures : état des chambres d'un plan et totaux à chaque lieu
// (étage, section, bâtiment, site), comme la colonne de droite de l'ancien Sheets.

export interface EtatChambre {
  /** Lits dans ce plan. */
  lits: number
  /** Lits d'aujourd'hui dans la référence (null si la chambre en est retirée). */
  reference: number | null
  /** Le plan n'a pas les lits de la référence d'aujourd'hui. */
  differe: boolean
  type: TypeChambre
  nombre: number
  libres: number
}

/** La chambre est-elle dans la référence d'aujourd'hui (voir `dansReference`) ? */
export function etatChambre(chambre: Chambre, occ: Occupation, enReference: boolean): EtatChambre {
  const nombre = occ.type === 'vide' ? 0 : occ.nombre
  const reference = enReference ? chambre.lits : null
  return {
    lits: occ.lits,
    reference,
    differe: reference !== null && occ.lits !== reference,
    type: occ.type,
    nombre,
    libres: Math.max(occ.lits - nombre, 0),
  }
}

export interface Totaux {
  lits: number
  enfants: number
  employes: number
  libres: number
}

const VIDES: Totaux = { lits: 0, enfants: 0, employes: 0, libres: 0 }

function additionner(liste: Totaux[]): Totaux {
  return liste.reduce(
    (t, x) => ({ lits: t.lits + x.lits, enfants: t.enfants + x.enfants, employes: t.employes + x.employes, libres: t.libres + x.libres }),
    VIDES,
  )
}

const totauxChambre = (e: EtatChambre): Totaux => ({
  lits: e.lits,
  enfants: e.type === 'enfants' ? e.nombre : 0,
  employes: e.type === 'employes' ? e.nombre : 0,
  libres: e.libres,
})

export interface NoeudChambre {
  chambre: Chambre
  etat: EtatChambre
  personnes: Personne[]
}

/** Un lieu dans un plan : ses chambres à lui, ses lieux enfants, et le total de tout ce qu'il contient. */
export interface NoeudLieu {
  lieu: Lieu
  chambres: NoeudChambre[]
  enfants: NoeudLieu[]
  totaux: Totaux
}

export interface Structure {
  lieux: Lieu[]
  chambres: Chambre[]
}

const parOrdre = <T extends { ordre: number }>(a: T, b: T) => a.ordre - b.ordre

/**
 * La référence d'aujourd'hui : les lieux actifs dont tous les parents sont
 * actifs, et leurs chambres actives (mêmes règles que rooming.lieux_actifs).
 */
export function dansReference(s: Structure): { lieux: Set<string>; chambres: Set<string> } {
  const lieux = new Set<string>()
  const visiter = (parent: string | null) => {
    for (const l of s.lieux) {
      if (l.parent_id === parent && l.actif) {
        lieux.add(l.id)
        visiter(l.id)
      }
    }
  }
  visiter(null)
  return { lieux, chambres: new Set(s.chambres.filter((c) => c.actif && lieux.has(c.lieu_id)).map((c) => c.id)) }
}

/** Les lieux enfants d'un lieu (ou du haut de l'arbre), dans l'ordre. */
export const enfantsDe = (lieux: Lieu[], parent: string | null) => lieux.filter((l) => l.parent_id === parent).sort(parOrdre)

/**
 * L'arbre des lieux d'un plan, avec ses totaux. Seules les chambres du plan
 * y sont (copiées de la référence à sa création) ; un lieu sans chambre du
 * plan n'apparaît pas.
 */
export function arbrePlan(
  s: Structure,
  occupations: Occupation[],
  personnes: Personne[],
  employes?: Map<string, Employe>,
): { racines: NoeudLieu[]; totaux: Totaux } {
  const occ = new Map(occupations.map((o) => [o.chambre_id, o]))
  const reference = dansReference(s).chambres
  const noms = new Map<string, Personne[]>()
  for (const p of trierPersonnes(personnes, employes)) {
    noms.set(p.chambre_id, [...(noms.get(p.chambre_id) ?? []), p])
  }
  const noeud = (lieu: Lieu): NoeudLieu | null => {
    const chambres = s.chambres
      .filter((c) => c.lieu_id === lieu.id && occ.has(c.id))
      .sort(parOrdre)
      .map((chambre) => ({ chambre, etat: etatChambre(chambre, occ.get(chambre.id)!, reference.has(chambre.id)), personnes: noms.get(chambre.id) ?? [] }))
    const enfants = enfantsDe(s.lieux, lieu.id)
      .map(noeud)
      .filter((n): n is NoeudLieu => n !== null)
    if (chambres.length === 0 && enfants.length === 0) return null
    return { lieu, chambres, enfants, totaux: additionner([...chambres.map((c) => totauxChambre(c.etat)), ...enfants.map((e) => e.totaux)]) }
  }
  const racines = enfantsDe(s.lieux, null)
    .map(noeud)
    .filter((n): n is NoeudLieu => n !== null)
  return { racines, totaux: additionner(racines.map((r) => r.totaux)) }
}

/** « CH 2 », « Motel 16 », « Appart » : abréviation (sinon nom) du lieu, puis le numéro, sauf si c'est le même mot. */
export function nomChambre(lieu: Lieu | undefined, chambre: Chambre): string {
  if (!lieu || chambre.numero === lieu.nom || chambre.numero === lieu.code) return chambre.numero
  return `${lieu.code ?? lieu.nom} ${chambre.numero}`
}

/** Par date d'ajout ; à égalité (import), par ordre alphabétique. */
export function trierPersonnes(personnes: Personne[], employes?: Map<string, Employe>): Personne[] {
  const nom = (p: Personne) => (employes ? nomPersonne(p, employes) : (p.nom ?? p.employe_id ?? ''))
  return [...personnes].sort((a, b) => a.created_at.localeCompare(b.created_at) || nom(a).localeCompare(nom(b), 'fr'))
}

export function nomPersonne(p: Personne, employes: Map<string, Employe>): string {
  return p.employe_id ? (employes.get(p.employe_id)?.surnom ?? '?') : (p.nom ?? '')
}

/** Employé actif dont le surnom est exactement ce nom (sans tenir compte de la casse). */
export function employeNomme(nom: string, employes: Employe[]): Employe | undefined {
  const cle = nom.trim().toLocaleLowerCase('fr')
  return employes.find((e) => e.actif && e.surnom.toLocaleLowerCase('fr') === cle)
}

export const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

export const libelleOccupation = (e: EtatChambre): string => {
  if (e.lits === 0) return 'Fermée'
  if (e.type === 'enfants') return pluriel(e.nombre, 'enfant', 'enfants')
  if (e.type === 'employes') return pluriel(e.nombre, 'employé', 'employés')
  return 'Vide'
}
