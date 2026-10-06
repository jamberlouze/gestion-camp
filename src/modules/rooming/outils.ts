import type { Batiment, Chambre, Employe, Occupation, Personne, Section, TypeChambre, Zone } from './types'

// Fonctions pures : état des chambres d'un plan et totaux à chaque niveau
// (section, bâtiment, zone, camp), comme la colonne de droite de l'ancien Sheets.

export interface EtatChambre {
  /** Lits dans ce plan (capacité propre, sinon normale). */
  lits: number
  normal: number
  ajustee: boolean
  type: TypeChambre
  nombre: number
  libres: number
}

export function etatChambre(chambre: Chambre, occ: Occupation | undefined): EtatChambre {
  const lits = occ?.lits ?? chambre.lits
  const type = occ?.type ?? 'vide'
  const nombre = type === 'vide' ? 0 : (occ?.nombre ?? 0)
  return { lits, normal: chambre.lits, ajustee: lits !== chambre.lits, type, nombre, libres: Math.max(lits - nombre, 0) }
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
export interface NoeudSection {
  section: Section
  totaux: Totaux
  chambres: NoeudChambre[]
}
export interface NoeudBatiment {
  batiment: Batiment
  totaux: Totaux
  sections: NoeudSection[]
}
export interface NoeudZone {
  zone: Zone
  totaux: Totaux
  batiments: NoeudBatiment[]
}

export interface Structure {
  zones: Zone[]
  batiments: Batiment[]
  sections: Section[]
  chambres: Chambre[]
}

const parOrdre = <T extends { ordre: number }>(a: T, b: T) => a.ordre - b.ordre

/** L'arbre zone > bâtiment > section > chambre d'un plan, avec ses totaux. */
export function arbrePlan(
  s: Structure,
  occupations: Occupation[],
  personnes: Personne[],
  employes?: Map<string, Employe>,
): { zones: NoeudZone[]; totaux: Totaux } {
  const occ = new Map(occupations.map((o) => [o.chambre_id, o]))
  const noms = new Map<string, Personne[]>()
  for (const p of trierPersonnes(personnes, employes)) {
    noms.set(p.chambre_id, [...(noms.get(p.chambre_id) ?? []), p])
  }
  const zones = [...s.zones].sort(parOrdre).map((zone): NoeudZone => {
    const batiments = s.batiments
      .filter((b) => b.zone_id === zone.id)
      .sort(parOrdre)
      .map((batiment): NoeudBatiment => {
        const sections = s.sections
          .filter((x) => x.batiment_id === batiment.id)
          .sort(parOrdre)
          .map((section): NoeudSection => {
            const chambres = s.chambres
              .filter((c) => c.section_id === section.id)
              .sort(parOrdre)
              .map((chambre) => ({ chambre, etat: etatChambre(chambre, occ.get(chambre.id)), personnes: noms.get(chambre.id) ?? [] }))
            return { section, chambres, totaux: additionner(chambres.map((c) => totauxChambre(c.etat))) }
          })
        return { batiment, sections, totaux: additionner(sections.map((x) => x.totaux)) }
      })
    return { zone, batiments, totaux: additionner(batiments.map((b) => b.totaux)) }
  })
  return { zones, totaux: additionner(zones.map((z) => z.totaux)) }
}

/** « Cèdres haut 2 » ; « 55 TDL » pour un bâtiment d'une seule pièce. */
export function nomChambre(section: Section | undefined, chambre: Chambre): string {
  if (!section || section.nom === chambre.numero) return chambre.numero
  return `${section.nom} ${chambre.numero}`
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
